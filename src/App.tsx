import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VoiceCommand, Message, CommandType } from './types';
import { COMMAND_MESSAGES } from './types';
import Settings from './components/Settings';
import { Store } from '@tauri-apps/plugin-store';
import { useWebSpeechAPI } from './hooks/useWebSpeechAPI';

type View = 'main' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<View>('main');
  const [modelPath, setModelPath] = useState<string>('C:/models/ggml-base.en.bin');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transcriptionText, setTranscriptionText] = useState<string>(
    'Initializing...'
  );
  const [message, setMessage] = useState<Message | null>(null);
  const [commandHistory, setCommandHistory] = useState<VoiceCommand[]>([]);
  const [logFilePath, setLogFilePath] = useState<string>('');
  const initializingRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);

  // Web Speech API integration for detecting speech
  const webSpeech = useWebSpeechAPI({
    continuous: true,
    interimResults: true,
    onSpeechStart: async () => {
      if (!isInitialized || isRecordingRef.current) return;

      console.log('Speech detected - starting Whisper recording...');
      isRecordingRef.current = true;
      setTranscriptionText('Listening... (Recording with Whisper)');

      try {
        await invoke('start_recording');
      } catch (error) {
        console.error('Failed to start Whisper recording:', error);
        isRecordingRef.current = false;
        setMessage({
          type: 'error',
          text: `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    onSpeechEnd: async () => {
      if (!isInitialized || !isRecordingRef.current) return;

      console.log('Speech ended - getting Whisper transcription...');
      setTranscriptionText('Processing transcription...');

      try {
        const voiceCommand = await invoke<VoiceCommand>('stop_recording');
        isRecordingRef.current = false;

        // Display the transcription
        setTranscriptionText(voiceCommand.text || '(No speech detected)');

        // Add to command history and log to file
        if (voiceCommand.text) {
          setCommandHistory(prev => [voiceCommand, ...prev]);
          try {
            await invoke('log_voice_command', { command: voiceCommand });
          } catch (error) {
            console.error('Failed to log voice command:', error);
          }

          // Check if wake word was in the command
          const text = voiceCommand.text.toLowerCase();
          if (text.includes('kiku') || text.includes('computer')) {
            setMessage({ type: 'info', text: 'Wake word detected!' });

            // Process the command
            const commandType = await invoke<CommandType | null>('process_voice_command', {
              command: voiceCommand,
            });

            if (commandType) {
              const messageText =
                COMMAND_MESSAGES[commandType] || `Command triggered: ${commandType}`;
              setMessage({
                type: 'command',
                text: messageText,
                commandType,
              });
            }
          }
        }

        // Ready for next command
        setTranscriptionText('Listening for wake word ("kiku" or "computer")...');
      } catch (error) {
        console.error('Failed to get Whisper transcription:', error);
        isRecordingRef.current = false;
        setMessage({
          type: 'error',
          text: `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        setTranscriptionText('Listening for wake word ("kiku" or "computer")...');
      }
    },
    onError: (error) => {
      console.error('Web Speech API error:', error);
      // Only show critical errors to the user (not-allowed, service-not-allowed)
      // Other errors like "no-speech" are handled automatically
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        setMessage({
          type: 'error',
          text: `Microphone access denied. Please allow microphone access in your browser settings.`,
        });
        setIsListening(false);
      }
    },
  });

  // Load saved settings on mount and auto-initialize
  useEffect(() => {
    const loadSettings = async () => {
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
              savedPath = await invoke<string>('get_model_path', { modelName: availableModels[0] });
              // Save this path for future use
              await store.set('modelPath', savedPath);
              await store.save();
            }
          } catch (error) {
            console.log('Error checking for models in AppData:', error);
          }
        }

        if (savedPath) {
          setModelPath(savedPath);
        }

        // Check if voice system is already initialized
        const initialized = await invoke<boolean>('is_voice_initialized');
        setIsInitialized(initialized);

        // Auto-initialize and start background listening if not already initialized
        if (!initialized && savedPath && !initializingRef.current) {
          initializingRef.current = true;
          try {
            setIsProcessing(true);
            setTranscriptionText('Initializing voice system...');

            // Initialize the voice system
            await invoke<string>('initialize_voice', { modelPath: savedPath });
            setIsInitialized(true);

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

            // Start Web Speech API listening
            webSpeech.startListening();
            setIsListening(true);
            setTranscriptionText('Listening for wake word ("kiku" or "computer")...');

            setMessage({
              type: 'success',
              text: 'Voice system initialized. Using Web Speech API to trigger Whisper transcription.'
            });
          } catch (error) {
            console.error('Auto-initialization failed:', error);
            setMessage({
              type: 'error',
              text: `Auto-initialization failed: ${error instanceof Error ? error.message : String(error)}`,
            });
            setTranscriptionText('Press "Start Listening" to begin...');
            initializingRef.current = false; // Reset on error so user can retry
          } finally {
            setIsProcessing(false);
          }
        } else if (!savedPath) {
          setTranscriptionText('No model found. Please download a model from Settings.');
        }

        // Load log file path
        try {
          const path = await invoke<string>('get_log_file_path');
          setLogFilePath(path);
        } catch (error) {
          console.log('Error getting log file path:', error);
        }
      } catch (error) {
        console.log('Error loading settings', error);
      }
    };
    void loadSettings();
  }, []);

  // Save model path when it changes
  const handleModelPathChange = async (newPath: string): Promise<void> => {
    setModelPath(newPath);
    try {
      const store = await Store.load('settings.json');
      await store.set('modelPath', newPath);
      await store.save();
    } catch (error) {
      console.error('Failed to save model path', error);
    }
  };

  const handleInitialize = async (): Promise<void> => {
    if (!modelPath) {
      setMessage({ type: 'error', text: 'Please enter a model path' });
      return;
    }

    try {
      setIsProcessing(true);
      setMessage(null);
      const result = await invoke<string>('initialize_voice', { modelPath });
      setIsInitialized(true);
      setMessage({ type: 'success', text: result });
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartListening = async (): Promise<void> => {
    if (!isInitialized) {
      setMessage({ type: 'error', text: 'Please initialize the voice system first' });
      return;
    }

    if (!webSpeech.isSupported) {
      setMessage({
        type: 'error',
        text: 'Web Speech API is not supported in your browser. Please use Chrome, Edge, or Safari.',
      });
      return;
    }

    try {
      setMessage(null);
      webSpeech.startListening();
      setIsListening(true);
      setTranscriptionText('Listening for wake word ("kiku" or "computer")...');
      setMessage({
        type: 'success',
        text: 'Started listening with Web Speech API + Whisper transcription'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to start listening: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const handleStopListening = (): void => {
    try {
      webSpeech.stopListening();
      setIsListening(false);
      setTranscriptionText('Press "Start Listening" to begin...');
      setMessage({ type: 'info', text: 'Stopped listening' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to stop listening: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  // Render settings view
  if (currentView === 'settings') {
    return (
      <Settings
        onBack={() => setCurrentView('main')}
        modelPath={modelPath}
        onModelPathChange={handleModelPathChange}
      />
    );
  }

  // Render main view
  return (
    <div className="w-full max-w-2xl rounded-3xl bg-white/10 px-10 py-12 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-lg">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex-1 text-center">
          <h1 className="m-0 mb-2.5 text-5xl font-bold">kiku</h1>
          <p className="text-lg opacity-90">Voice Command Application</p>
        </div>
        <button
          onClick={() => setCurrentView('settings')}
          className="rounded-xl bg-white/20 px-4 py-2 font-medium transition hover:bg-white/30"
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Status Section */}
      <div className="mb-5 rounded-xl bg-white/10 p-5">
        <div className="mb-2.5 flex items-center gap-2.5">
          <div className={`status-dot ${isInitialized ? 'active' : ''}`} />
          <span>{isInitialized ? 'Whisper Initialized - Ready' : 'Whisper Not initialized'}</span>
        </div>
        <div className="mb-2.5 flex items-center gap-2.5">
          <div className={`status-dot ${webSpeech.isSupported ? 'active' : ''}`} />
          <span>
            {webSpeech.isSupported ? 'Web Speech API Supported' : 'Web Speech API Not Supported'}
          </span>
        </div>
        {isListening && (
          <div className="flex items-center gap-2.5">
            <div className="status-dot active animate-pulse" />
            <span>Listening for wake words... {isRecordingRef.current && '(Recording with Whisper)'}</span>
          </div>
        )}
      </div>

      {/* Initialization Section */}
      {!isInitialized && (
        <>
          <div className="mb-5">
            <label htmlFor="modelPath" className="font-bold">
              Whisper Model Path:
            </label>
            <input
              type="text"
              id="modelPath"
              placeholder="e.g., C:/models/ggml-base.en.bin"
              value={modelPath}
              onChange={e => void handleModelPathChange(e.target.value)}
              className="mt-2.5 w-full rounded-lg border-2 border-white/30 bg-white/10 p-3 text-base text-white transition-colors placeholder:text-white/60 focus:border-white/50 focus:outline-none"
            />
            <div className="mt-2 text-sm opacity-80">
              Download Whisper models from:{' '}
              <a
                href="https://huggingface.co/ggerganov/whisper.cpp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 underline transition-colors hover:text-blue-200"
              >
                Hugging Face
              </a>
            </div>
          </div>

          <div className="mb-5 flex gap-4">
            <button
              className="btn-base bg-green-600 hover:bg-green-700"
              onClick={handleInitialize}
              disabled={isProcessing}
            >
              Initialize Voice System
            </button>
          </div>
        </>
      )}

      {/* Voice Controls */}
      {isInitialized && (
        <div className="mb-5">
          <h3 className="mb-3 text-lg font-semibold">Voice Commands</h3>
          <p className="mb-3 text-sm opacity-80">
            Say "kiku" or "computer" followed by your command. The system uses Web Speech API to
            detect when you start speaking, then triggers Whisper for high-quality transcription.
          </p>
          <div className="flex gap-4">
            <button
              className={`btn-base ${
                isListening
                  ? 'animate-pulse bg-purple-600 hover:bg-purple-700'
                  : 'bg-purple-500 hover:bg-purple-600'
              }`}
              onClick={handleStartListening}
              disabled={isListening || isProcessing}
            >
              {isListening ? 'Listening...' : 'Start Listening'}
            </button>
            <button
              className="btn-base bg-red-500 hover:bg-red-600"
              onClick={handleStopListening}
              disabled={!isListening || isProcessing}
            >
              Stop Listening
            </button>
          </div>
        </div>
      )}

      {/* Transcription Result */}
      <div className="mb-5 min-h-[100px] rounded-xl bg-white/10 p-5">
        <h3 className="mt-0 mb-3 text-xl font-semibold">Transcription Result:</h3>
        <div className="min-h-[60px] text-lg leading-relaxed">{transcriptionText}</div>
        {message && (
          <div
            className={`mt-4 rounded-xl p-4 ${
              message.type === 'error'
                ? 'border-l-4 border-red-500 bg-red-500/30'
                : 'border-l-4 border-green-500 bg-green-500/30'
            }`}
          >
            {message.type === 'error' && <strong>Error:</strong>}{' '}
            {message.type === 'command' && (
              <>
                <strong>Command detected:</strong> {message.commandType}
                <br />
                <strong>Action:</strong>{' '}
              </>
            )}
            {message.text}
          </div>
        )}
      </div>

      {/* Command History */}
      {commandHistory.length > 0 && (
        <div className="mb-5 max-h-[300px] overflow-y-auto rounded-xl bg-white/10 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="mt-0 text-xl font-semibold">Command History (Session)</h3>
            {logFilePath && (
              <span className="text-xs opacity-60">
                Log: {logFilePath}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {commandHistory.map((cmd, index) => (
              <div
                key={`${cmd.timestamp}-${index}`}
                className="rounded-lg bg-white/5 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1 break-words">{cmd.text}</span>
                  <span className="text-xs opacity-60 whitespace-nowrap">
                    {new Date(cmd.timestamp * 1000).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
