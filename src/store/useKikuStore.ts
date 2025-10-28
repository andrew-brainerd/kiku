import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import type { VoiceCommand, Message, CommandType } from '../types';
import { COMMAND_MESSAGES } from '../types';

type View = 'main' | 'settings';

interface KikuState {
  // View state
  currentView: View;

  // Model and initialization
  modelPath: string;
  isInitialized: boolean;
  isProcessing: boolean;

  // Listening state
  isListening: boolean;
  isRecording: boolean;

  // Transcription
  transcriptionText: string;
  message: Message | null;

  // History
  commandHistory: VoiceCommand[];
  logFilePath: string;

  // Flags
  isInitializing: boolean;

  // Actions
  setCurrentView: (view: View) => void;
  setModelPath: (path: string) => void;
  setIsInitialized: (value: boolean) => void;
  setIsProcessing: (value: boolean) => void;
  setIsListening: (value: boolean) => void;
  setIsRecording: (value: boolean) => void;
  setTranscriptionText: (text: string) => void;
  setMessage: (message: Message | null) => void;
  addCommandToHistory: (command: VoiceCommand) => void;
  setLogFilePath: (path: string) => void;

  // Complex actions
  saveModelPath: (path: string) => Promise<void>;
  initialize: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => void;
  handleWebSpeechResult: (transcript: string, isFinal: boolean) => Promise<void>;
  handleSpeechError: (error: string) => void;
  loadSettings: () => Promise<void>;
}

export const useKikuStore = create<KikuState>((set, get) => ({
  // Initial state
  currentView: 'main',
  modelPath: 'C:/models/ggml-base.en.bin',
  isInitialized: false,
  isProcessing: false,
  isListening: false,
  isRecording: false,
  transcriptionText: 'Initializing...',
  message: null,
  commandHistory: [],
  logFilePath: '',
  isInitializing: false,

  // Simple setters
  setCurrentView: (view) => set({ currentView: view }),
  setModelPath: (path) => set({ modelPath: path }),
  setIsInitialized: (value) => set({ isInitialized: value }),
  setIsProcessing: (value) => set({ isProcessing: value }),
  setIsListening: (value) => set({ isListening: value }),
  setIsRecording: (value) => set({ isRecording: value }),
  setTranscriptionText: (text) => set({ transcriptionText: text }),
  setMessage: (message) => set({ message }),
  addCommandToHistory: (command) =>
    set((state) => ({ commandHistory: [command, ...state.commandHistory] })),
  setLogFilePath: (path) => set({ logFilePath: path }),

  // Save model path to store
  saveModelPath: async (path: string) => {
    set({ modelPath: path });
    try {
      const store = await Store.load('settings.json');
      await store.set('modelPath', path);
      await store.save();
    } catch (error) {
      console.error('Failed to save model path', error);
    }
  },

  // Initialize voice system
  initialize: async () => {
    const { modelPath, setIsProcessing, setIsInitialized, setMessage } = get();

    if (!modelPath) {
      set({ message: { type: 'error', text: 'Please enter a model path' } });
      return;
    }

    try {
      set({ isProcessing: true, message: null });
      const result = await invoke<string>('initialize_voice', { modelPath });
      set({
        isInitialized: true,
        message: { type: 'success', text: result },
      });
    } catch (error) {
      set({
        message: {
          type: 'error',
          text: `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
    } finally {
      set({ isProcessing: false });
    }
  },

  // Start listening
  startListening: async () => {
    const { isInitialized } = get();

    if (!isInitialized) {
      set({ message: { type: 'error', text: 'Please initialize the voice system first' } });
      return;
    }

    try {
      set({
        message: null,
        isListening: true,
        transcriptionText: 'Listening for wake word ("kiku" or "computer")...',
      });

      set({
        message: {
          type: 'success',
          text: 'Listening for wake word. Whisper will activate after wake word is detected.',
        },
      });
    } catch (error) {
      set({
        message: {
          type: 'error',
          text: `Failed to start listening: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
    }
  },

  // Stop listening
  stopListening: () => {
    set({
      isListening: false,
      transcriptionText: 'Press "Start Listening" to begin...',
      message: { type: 'info', text: 'Stopped listening' },
    });
  },

  // Handle Web Speech API results
  handleWebSpeechResult: async (transcript: string, isFinal: boolean) => {
    const { isInitialized, isRecording } = get();

    if (!isInitialized) return;

    const text = transcript.toLowerCase();
    const hasWakeWord = text.includes('kiku') || text.includes('computer');

    // Show interim results
    if (!isFinal && hasWakeWord) {
      set({ transcriptionText: `Wake word detected: "${transcript}" - waiting for final...` });
      return;
    }

    // Only process final results with wake word
    if (isFinal && hasWakeWord) {
      console.log('Wake word detected in final result:', transcript);
      set({
        transcriptionText: 'Wake word detected! Recording with Whisper for accurate transcription...',
        message: { type: 'info', text: 'Wake word detected!' },
      });

      // Start Whisper recording
      if (!isRecording) {
        set({ isRecording: true });

        try {
          await invoke('start_recording');
          console.log('Whisper recording started');

          // Wait a moment to capture the command after the wake word
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Stop recording and get transcription
          console.log('Stopping Whisper recording...');
          const voiceCommand = await invoke<VoiceCommand>('stop_recording');
          set({ isRecording: false });

          // Display the transcription
          set({ transcriptionText: voiceCommand.text || '(No speech detected)' });

          // Add to command history and log to file
          if (voiceCommand.text) {
            get().addCommandToHistory(voiceCommand);

            try {
              await invoke('log_voice_command', { command: voiceCommand });
            } catch (error) {
              console.error('Failed to log voice command:', error);
            }

            // Process the command
            const commandType = await invoke<CommandType | null>('process_voice_command', {
              command: voiceCommand,
            });

            if (commandType) {
              const messageText =
                COMMAND_MESSAGES[commandType] || `Command triggered: ${commandType}`;
              set({
                message: {
                  type: 'command',
                  text: messageText,
                  commandType,
                },
              });
            }
          }

          // Ready for next command
          set({ transcriptionText: 'Listening for wake word ("kiku" or "computer")...' });
        } catch (error) {
          console.error('Failed to record with Whisper:', error);
          set({
            isRecording: false,
            message: {
              type: 'error',
              text: `Recording failed: ${error instanceof Error ? error.message : String(error)}`,
            },
            transcriptionText: 'Listening for wake word ("kiku" or "computer")...',
          });
        }
      }
    }
  },

  // Handle speech error from Web Speech API
  handleSpeechError: (error: string) => {
    console.error('Web Speech API error:', error);

    // Only show critical errors to the user
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      set({
        message: {
          type: 'error',
          text: 'Microphone access denied. Please allow microphone access in your browser settings.',
        },
        isListening: false,
      });
    }
  },

  // Load settings on app start
  loadSettings: async () => {
    const { setIsInitialized, setLogFilePath, setIsProcessing, setTranscriptionText, setMessage, isInitializing } = get();

    if (isInitializing) return;
    set({ isInitializing: true });

    try {
      // Load the store
      const store = await Store.load('settings.json');

      // Load saved model path
      let savedPath = await store.get<string>('modelPath');

      // If no saved path, check for models in AppData directory
      if (!savedPath) {
        try {
          const availableModels = await invoke<string[]>('list_available_models');
          if (availableModels.length > 0) {
            // Use the first available model
            savedPath = await invoke<string>('get_model_path', {
              modelName: availableModels[0],
            });
            // Save this path for future use
            await store.set('modelPath', savedPath);
            await store.save();
          }
        } catch (error) {
          console.log('Error checking for models in AppData:', error);
        }
      }

      if (savedPath) {
        set({ modelPath: savedPath });
      }

      // Check if voice system is already initialized
      const initialized = await invoke<boolean>('is_voice_initialized');
      set({ isInitialized: initialized });

      // Auto-initialize and start listening if not already initialized
      if (!initialized && savedPath) {
        try {
          set({
            isProcessing: true,
            transcriptionText: 'Initializing voice system...',
          });

          // Initialize the voice system
          await invoke<string>('initialize_voice', { modelPath: savedPath });
          set({ isInitialized: true });

          // Set audio device after initialization
          const savedDevice = await store.get<string>('audioDevice');
          if (savedDevice) {
            try {
              await invoke('set_audio_device', { deviceName: savedDevice });
              console.log('Audio device set to:', savedDevice);
            } catch (error) {
              console.log('Error setting audio device:', error);
            }
          }

          // Note: Web Speech API start listening will be called from App.tsx after hook initializes
          set({
            transcriptionText: 'Listening for wake word ("kiku" or "computer")...',
            message: {
              type: 'success',
              text: 'Voice system initialized. Web Speech API will detect wake word and trigger Whisper.',
            },
          });
        } catch (error) {
          console.error('Auto-initialization failed:', error);
          set({
            message: {
              type: 'error',
              text: `Auto-initialization failed: ${error instanceof Error ? error.message : String(error)}`,
            },
            transcriptionText: 'Press "Start Listening" to begin...',
          });
        } finally {
          set({ isProcessing: false });
        }
      } else if (!savedPath) {
        set({ transcriptionText: 'No model found. Please download a model from Settings.' });
      }

      // Load log file path
      try {
        const path = await invoke<string>('get_log_file_path');
        set({ logFilePath: path });
      } catch (error) {
        console.log('Error getting log file path:', error);
      }
    } catch (error) {
      console.log('Error loading settings', error);
    } finally {
      set({ isInitializing: false });
    }
  },
}));
