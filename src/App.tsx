import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VoiceCommand, Message, CommandType } from './types';
import { COMMAND_MESSAGES } from './types';

function App() {
  const [modelPath, setModelPath] = useState<string>('C:/models/ggml-base.en.bin');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transcriptionText, setTranscriptionText] = useState<string>(
    'Press "Start Recording" and speak your command...'
  );
  const [message, setMessage] = useState<Message | null>(null);

  // Check if voice system is already initialized on mount
  useEffect(() => {
    const checkInitStatus = async () => {
      try {
        const initialized = await invoke<boolean>('is_voice_initialized');
        setIsInitialized(initialized);
      } catch (error) {
        console.log('Not initialized yet', error);
      }
    };
    void checkInitStatus();
  }, []);

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

  const handleStartRecording = async (): Promise<void> => {
    if (!isInitialized) {
      setMessage({ type: 'error', text: 'Please initialize the voice system first' });
      return;
    }

    try {
      setMessage(null);
      setTranscriptionText('Listening...');
      await invoke<string>('start_recording');
      setIsRecording(true);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`,
      });
      setTranscriptionText('Press "Start Recording" and speak your command...');
    }
  };

  const handleStopRecording = async (): Promise<void> => {
    try {
      setIsProcessing(true);
      setTranscriptionText('Processing...');

      const voiceCommand = await invoke<VoiceCommand>('stop_recording');
      setIsRecording(false);

      // Display the transcription
      setTranscriptionText(voiceCommand.text || '(No speech detected)');

      // Process the command
      const commandType = await invoke<CommandType | null>('process_voice_command', {
        command: voiceCommand,
      });

      if (commandType) {
        const messageText = COMMAND_MESSAGES[commandType] || `Command triggered: ${commandType}`;
        setMessage({
          type: 'command',
          text: messageText,
          commandType,
        });
      } else {
        setMessage({
          type: 'info',
          text: 'No matching command found. Try: "hello", "start", "stop", "status", or "help"',
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to transcribe: ${error instanceof Error ? error.message : String(error)}`,
      });
      setIsRecording(false);
      setTranscriptionText('Press "Start Recording" and speak your command...');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl rounded-3xl bg-white/10 px-10 py-12 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-lg">
      {/* Header */}
      <h1 className="m-0 mb-2.5 text-center text-5xl font-bold">kiku</h1>
      <p className="mb-8 text-center text-lg opacity-90">Voice Command Application</p>

      {/* Status Section */}
      <div className="mb-5 rounded-xl bg-white/10 p-5">
        <div className="mb-2.5 flex items-center gap-2.5">
          <div className={`status-dot ${isInitialized ? 'active' : ''}`} />
          <span>{isInitialized ? 'Initialized - Ready' : 'Not initialized'}</span>
        </div>
        {isRecording && (
          <div className="flex items-center gap-2.5">
            <div className="status-dot active" />
            <span>Recording...</span>
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
              onChange={e => setModelPath(e.target.value)}
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

      {/* Recording Controls */}
      {isInitialized && (
        <div className="mb-5 flex gap-4">
          <button
            className={`btn-base bg-blue-600 hover:bg-blue-700 ${
              isRecording ? 'animate-recording-pulse bg-red-500 hover:bg-red-600' : ''
            }`}
            onClick={handleStartRecording}
            disabled={isRecording || isProcessing}
          >
            Start Recording
          </button>
          <button
            className="btn-base bg-orange-500 hover:bg-orange-600"
            onClick={handleStopRecording}
            disabled={!isRecording || isProcessing}
          >
            Stop & Transcribe
          </button>
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
    </div>
  );
}

export default App;
