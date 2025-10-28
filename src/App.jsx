import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

const COMMAND_MESSAGES = {
  greeting: 'Hello! How can I help you?',
  start_workflow: 'Starting workflow...',
  stop_workflow: 'Stopping workflow...',
  status_check: 'Status: All systems operational',
  show_help: 'Available commands: hello, start, stop, status, help'
};

function App() {
  const [modelPath, setModelPath] = useState('C:/models/ggml-base.en.bin');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('Press "Start Recording" and speak your command...');
  const [message, setMessage] = useState(null);

  // Check if voice system is already initialized on mount
  useEffect(() => {
    const checkInitStatus = async () => {
      try {
        const initialized = await invoke('is_voice_initialized');
        setIsInitialized(initialized);
      } catch (error) {
        console.log('Not initialized yet');
      }
    };
    checkInitStatus();
  }, []);

  const handleInitialize = async () => {
    if (!modelPath) {
      setMessage({ type: 'error', text: 'Please enter a model path' });
      return;
    }

    try {
      setIsProcessing(true);
      setMessage(null);
      const result = await invoke('initialize_voice', { modelPath });
      setIsInitialized(true);
      setMessage({ type: 'success', text: result });
    } catch (error) {
      setMessage({ type: 'error', text: `Initialization failed: ${error}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartRecording = async () => {
    if (!isInitialized) {
      setMessage({ type: 'error', text: 'Please initialize the voice system first' });
      return;
    }

    try {
      setMessage(null);
      setTranscriptionText('Listening...');
      await invoke('start_recording');
      setIsRecording(true);
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to start recording: ${error}` });
      setTranscriptionText('Press "Start Recording" and speak your command...');
    }
  };

  const handleStopRecording = async () => {
    try {
      setIsProcessing(true);
      setTranscriptionText('Processing...');

      const voiceCommand = await invoke('stop_recording');
      setIsRecording(false);

      // Display the transcription
      setTranscriptionText(voiceCommand.text || '(No speech detected)');

      // Process the command
      const commandType = await invoke('process_voice_command', { command: voiceCommand });

      if (commandType) {
        const messageText = COMMAND_MESSAGES[commandType] || `Command triggered: ${commandType}`;
        setMessage({
          type: 'command',
          text: messageText,
          commandType
        });
      } else {
        setMessage({
          type: 'info',
          text: 'No matching command found. Try: "hello", "start", "stop", "status", or "help"'
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to transcribe: ${error}` });
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
          <div className={`status-dot ${isInitialized ? 'active' : ''}`}></div>
          <span>{isInitialized ? 'Initialized - Ready' : 'Not initialized'}</span>
        </div>
        {isRecording && (
          <div className="status-indicator">
            <div className="status-dot active"></div>
            <span>Recording...</span>
          </div>
        )}
      </div>

      {!isInitialized && (
        <>
          <div className="model-path-section">
            <label htmlFor="modelPath"><strong>Whisper Model Path:</strong></label>
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
            <button
              className="btn-init"
              onClick={handleInitialize}
              disabled={isProcessing}
            >
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
                <strong>Command detected:</strong> {message.commandType}<br />
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
