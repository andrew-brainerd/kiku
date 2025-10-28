import { useEffect } from 'react';
import Settings from './components/Settings';
import { useWebSpeechAPI } from './hooks/useWebSpeechAPI';
import { useKikuStore } from './store/useKikuStore';

function App() {
  // Get state and actions from store
  const currentView = useKikuStore((state) => state.currentView);
  const modelPath = useKikuStore((state) => state.modelPath);
  const isInitialized = useKikuStore((state) => state.isInitialized);
  const isListening = useKikuStore((state) => state.isListening);
  const isProcessing = useKikuStore((state) => state.isProcessing);
  const isRecording = useKikuStore((state) => state.isRecording);
  const transcriptionText = useKikuStore((state) => state.transcriptionText);
  const message = useKikuStore((state) => state.message);
  const commandHistory = useKikuStore((state) => state.commandHistory);
  const logFilePath = useKikuStore((state) => state.logFilePath);

  // Actions
  const setCurrentView = useKikuStore((state) => state.setCurrentView);
  const saveModelPath = useKikuStore((state) => state.saveModelPath);
  const initialize = useKikuStore((state) => state.initialize);
  const startListening = useKikuStore((state) => state.startListening);
  const stopListening = useKikuStore((state) => state.stopListening);
  const handleWebSpeechResult = useKikuStore((state) => state.handleWebSpeechResult);
  const handleSpeechError = useKikuStore((state) => state.handleSpeechError);
  const loadSettings = useKikuStore((state) => state.loadSettings);

  // Web Speech API integration for detecting wake word
  const webSpeech = useWebSpeechAPI({
    continuous: true,
    interimResults: true,
    onResult: handleWebSpeechResult,
    onError: handleSpeechError,
  });

  // Load saved settings on mount and auto-initialize
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Auto-start Web Speech API after initialization
  useEffect(() => {
    if (isInitialized && !isListening && webSpeech.isSupported) {
      // Small delay to ensure everything is ready
      const timer = setTimeout(() => {
        webSpeech.startListening();
        void startListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, isListening, webSpeech.isSupported]);

  // Sync Web Speech API state with store
  useEffect(() => {
    if (!isListening && webSpeech.isListening) {
      webSpeech.stopListening();
    }
  }, [isListening]);

  const handleStartListening = async (): Promise<void> => {
    if (!isInitialized) {
      useKikuStore.getState().setMessage({
        type: 'error',
        text: 'Please initialize the voice system first',
      });
      return;
    }

    if (!webSpeech.isSupported) {
      useKikuStore.getState().setMessage({
        type: 'error',
        text: 'Web Speech API is not supported in your browser. Please use Chrome, Edge, or Safari.',
      });
      return;
    }

    webSpeech.startListening();
    await startListening();
  };

  const handleStopListening = (): void => {
    webSpeech.stopListening();
    stopListening();
  };

  // Render settings view
  if (currentView === 'settings') {
    return (
      <Settings
        onBack={() => setCurrentView('main')}
        modelPath={modelPath}
        onModelPathChange={saveModelPath}
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
            <span>
              Listening for wake words... {isRecording && '(Recording with Whisper)'}
            </span>
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
              onChange={(e) => void saveModelPath(e.target.value)}
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
              onClick={initialize}
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
            Say "kiku" or "computer" followed by your command. Web Speech API listens for the wake
            word, then triggers Whisper for high-quality transcription of your full command.
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
            {logFilePath && <span className="text-xs opacity-60">Log: {logFilePath}</span>}
          </div>
          <div className="space-y-2">
            {commandHistory.map((cmd, index) => (
              <div
                key={`${cmd.timestamp}-${index}`}
                className="rounded-lg bg-white/5 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1 break-words">{cmd.text}</span>
                  <span className="whitespace-nowrap text-xs opacity-60">
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
