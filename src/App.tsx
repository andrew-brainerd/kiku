import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';
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
    <div className="container">
      <h1>kiku</h1>
      <p className="subtitle">Voice Command Application</p>

      <div className="status-section">
        <div className="status-indicator">
          <div className={`status-dot ${isInitialized ? 'active' : ''}`} />
          <span>{isInitialized ? 'Initialized - Ready' : 'Not initialized'}</span>
        </div>
        {isRecording && (
          <div className="status-indicator">
            <div className="status-dot active" />
            <span>Recording...</span>
          </div>
        )}
      </div>

      {!isInitialized && (
        <>
          <div className="model-path-section">
            <label htmlFor="modelPath">
              <strong>Whisper Model Path:</strong>
            </label>
            <input
              type="text"
              id="modelPath"
              placeholder="e.g., C:/models/ggml-base.en.bin"
              value={modelPath}
              onChange={(e) => setModelPath(e.target.value)}
            />
            <div className="help-text">
              Download Whisper models from:{' '}
              <a
                href="https://huggingface.co/ggerganov/whisper.cpp"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#a8daff' }}
              >
                Hugging Face
              </a>
            </div>
          </div>

          <div className="controls">
            <button className="btn-init" onClick={handleInitialize} disabled={isProcessing}>
              Initialize Voice System
            </button>
          </div>
        </>
      )}

      {isInitialized && (
        <div className="controls">
          <button
            className={`btn-record ${isRecording ? 'recording' : ''}`}
            onClick={handleStartRecording}
            disabled={isRecording || isProcessing}
          >
            Start Recording
          </button>
          <button
            className="btn-stop"
            onClick={handleStopRecording}
            disabled={!isRecording || isProcessing}
          >
            Stop & Transcribe
          </button>
        </div>
      )}

      <div className="transcription">
        <h3>Transcription Result:</h3>
        <div className="transcription-text">{transcriptionText}</div>
        {message && (
          <div className={message.type === 'error' ? 'error' : 'command-result'}>
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
