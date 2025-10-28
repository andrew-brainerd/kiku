import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Store } from '@tauri-apps/plugin-store';

interface ModelInfo {
  name: string;
  size: string;
  description: string;
  filename: string;
}

interface AudioDevice {
  name: string;
  is_default: boolean;
}

const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: 'Tiny (English)',
    size: '75 MB',
    description: 'Fastest, lower accuracy',
    filename: 'ggml-tiny.en.bin',
  },
  {
    name: 'Base (English)',
    size: '142 MB',
    description: 'Best balance of speed/accuracy',
    filename: 'ggml-base.en.bin',
  },
  {
    name: 'Small (English)',
    size: '466 MB',
    description: 'Better transcription quality',
    filename: 'ggml-small.en.bin',
  },
  {
    name: 'Medium (English)',
    size: '1.5 GB',
    description: 'High accuracy',
    filename: 'ggml-medium.en.bin',
  },
  {
    name: 'Base (Multilingual)',
    size: '142 MB',
    description: 'Multilingual support',
    filename: 'ggml-base.bin',
  },
];

interface SettingsProps {
  onBack: () => void;
  modelPath: string;
  onModelPathChange: (path: string) => Promise<void>;
}

export default function Settings({ onBack, modelPath, onModelPathChange }: SettingsProps) {
  const [selectedModel, setSelectedModel] = useState<string>(
    AVAILABLE_MODELS[1]?.filename ?? 'ggml-base.en.bin'
  );
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [customPath, setCustomPath] = useState<string>(modelPath);
  const [modelsDirectory, setModelsDirectory] = useState<string>('');
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');

  // Load saved selected model and available models on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const store = await Store.load('settings.json');
        const savedModel = await store.get<string>('selectedModel');
        if (savedModel) {
          setSelectedModel(savedModel);
        }

        // Load saved audio device
        const savedDevice = await store.get<string>('audioDevice');
        if (savedDevice) {
          setSelectedDevice(savedDevice);
        }

        // Load available models from AppData
        const available = await invoke<string[]>('list_available_models');
        setDownloadedModels(available);

        // Get models directory path
        const modelsDir = await invoke<string>('get_models_directory');
        setModelsDirectory(modelsDir);

        // Load available audio devices
        const devices = await invoke<AudioDevice[]>('list_audio_devices');
        setAudioDevices(devices);

        // If no device selected, use default
        if (!savedDevice && devices.length > 0) {
          const defaultDevice = devices.find(d => d.is_default);
          if (defaultDevice) {
            setSelectedDevice(defaultDevice.name);
          }
        }
      } catch (error) {
        console.log('Error loading settings', error);
      }
    };
    void loadSettings();
  }, []);

  // Handle model selection change and save to store
  const handleModelChange = async (newModel: string): Promise<void> => {
    setSelectedModel(newModel);
    try {
      const store = await Store.load('settings.json');
      await store.set('selectedModel', newModel);
      await store.save();
    } catch (error) {
      console.error('Failed to save selected model', error);
    }
  };

  // Handle audio device selection change
  const handleDeviceChange = async (deviceName: string): Promise<void> => {
    setSelectedDevice(deviceName);
    try {
      // Save to store
      const store = await Store.load('settings.json');
      await store.set('audioDevice', deviceName);
      await store.save();

      // Update the voice handler
      await invoke('set_audio_device', { deviceName: deviceName || null });
      setStatusMessage('Audio device updated');
    } catch (error) {
      console.error('Failed to set audio device', error);
      setStatusMessage(`Failed to set audio device: ${error}`);
    }
  };

  const handleDownload = async (): Promise<void> => {
    try {
      setDownloading(true);
      setDownloadProgress(0);
      setStatusMessage('Starting download...');

      const result = await invoke<string>('download_model', {
        modelName: selectedModel,
      });

      setStatusMessage(result);
      setDownloadProgress(100);

      // Refresh available models list
      const available = await invoke<string[]>('list_available_models');
      setDownloadedModels(available);

      // Auto-update model path
      const newPath = await invoke<string>('get_model_path', { modelName: selectedModel });
      setCustomPath(newPath);
      await onModelPathChange(newPath);
    } catch (error) {
      setStatusMessage(`Download failed: ${error}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleBrowse = async (): Promise<void> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Whisper Models', extensions: ['bin'] }],
      });

      if (selected) {
        setCustomPath(selected);
        await onModelPathChange(selected);
        setStatusMessage('Model path updated');
      }
    } catch (error) {
      setStatusMessage(`Failed to open file dialog: ${error}`);
    }
  };

  const handleSavePath = async (): Promise<void> => {
    await onModelPathChange(customPath);
    setStatusMessage('Model path saved');
  };

  return (
    <div className="w-full max-w-3xl rounded-3xl bg-white/10 px-10 py-12 backdrop-blur-lg">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
        <button
          onClick={onBack}
          className="rounded-xl bg-white/20 px-6 py-2 font-medium transition hover:bg-white/30"
        >
          ← Back
        </button>
      </div>

      {/* Model Download Section */}
      <div className="mb-8 rounded-2xl bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Download Whisper Model</h2>
        <p className="mb-4 text-sm text-white/70">
          Download pre-trained Whisper models for offline voice recognition
        </p>
        {modelsDirectory && (
          <p className="mb-4 text-xs text-white/60">
            Models directory: <code className="rounded bg-white/10 px-1.5 py-0.5">{modelsDirectory}</code>
          </p>
        )}

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Select Model</label>
          <select
            value={selectedModel}
            onChange={e => void handleModelChange(e.target.value)}
            disabled={downloading}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-50"
          >
            {AVAILABLE_MODELS.map(model => (
              <option key={model.filename} value={model.filename} className="bg-gray-800">
                {model.name} - {model.size} - {model.description}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 font-medium transition hover:from-blue-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? 'Downloading...' : 'Download Model'}
        </button>

        {downloading && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-sm text-white/70">{downloadProgress}%</p>
          </div>
        )}

        {statusMessage && (
          <div className="mt-4 rounded-lg bg-white/5 p-3 text-sm">{statusMessage}</div>
        )}
      </div>

      {/* Manual Model Path Section */}
      <div className="rounded-2xl bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Model Path</h2>
        <p className="mb-4 text-sm text-white/70">
          Specify a custom path to your Whisper model file
        </p>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Model File Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customPath}
              onChange={e => setCustomPath(e.target.value)}
              placeholder="C:/models/ggml-base.en.bin"
              className="flex-1 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm transition hover:bg-white/20"
            />
            <button
              onClick={handleBrowse}
              className="rounded-lg bg-white/20 px-6 py-2 font-medium transition hover:bg-white/30"
            >
              Browse
            </button>
          </div>
        </div>

        <button
          onClick={handleSavePath}
          className="w-full rounded-xl bg-white/20 px-6 py-3 font-medium transition hover:bg-white/30"
        >
          Save Path
        </button>
      </div>

      {/* Audio Device Selection */}
      <div className="mt-8 rounded-2xl bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Audio Input Device</h2>
        <p className="mb-4 text-sm text-white/70">
          Select the microphone or audio input device for voice commands
        </p>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Input Device</label>
          <select
            value={selectedDevice}
            onChange={e => void handleDeviceChange(e.target.value)}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <option value="" className="bg-gray-800">
              System Default
            </option>
            {audioDevices.map(device => (
              <option key={device.name} value={device.name} className="bg-gray-800">
                {device.name} {device.is_default ? '(Default)' : ''}
              </option>
            ))}
          </select>
        </div>

        {audioDevices.length === 0 && (
          <p className="text-sm text-yellow-400">
            No audio input devices detected. Please check your system audio settings.
          </p>
        )}
      </div>

      {/* Downloaded Models */}
      {downloadedModels.length > 0 && (
        <div className="mt-8 rounded-2xl bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-semibold">Downloaded Models</h2>
          <ul className="space-y-2">
            {downloadedModels.map(model => (
              <li key={model} className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span>{model}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
