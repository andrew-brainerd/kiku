# kiku

A voice-controlled Tauri application for Windows with background listening and offline transcription powered by Whisper.

## Features

- **Offline Voice Recognition**: Uses OpenAI's Whisper model for accurate, privacy-focused transcription
- **Background Listening**: Trigger workflows with voice commands
- **Cross-platform Audio Capture**: Built with cpal for reliable microphone input
- **Customizable Commands**: Easy command mapping system for triggering workflows
- **Real-time Feedback**: Visual status indicators and transcription display

## Prerequisites

1. **Rust**: Install from [rustup.rs](https://rustup.rs/)
2. **Node.js**: Version 16 or higher
3. **pnpm**: Install with `npm install -g pnpm` or from [pnpm.io](https://pnpm.io/)
4. **Whisper Model**: Download a model file (instructions below)
5. **CMake**: Required for building whisper-rs ([download here](https://cmake.org/download/))
6. **LLVM/Clang**: Required for building whisper-rs ([download here](https://github.com/llvm/llvm-project/releases))

## Whisper Model Setup

Before using the voice features, you need to download a Whisper model:

### Downloading the Model

1. Visit the [Whisper.cpp models on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
2. Download one of the following models (recommended for beginners):
   - `ggml-base.en.bin` (142 MB) - Fast, good for English
   - `ggml-small.en.bin` (466 MB) - Better accuracy, English only
   - `ggml-base.bin` (142 MB) - Multilingual support

3. Create a folder for models (e.g., `C:/models/`)
4. Place the downloaded `.bin` file in that folder

### Recommended Models by Use Case

| Use Case | Model | Size | Description |
|----------|-------|------|-------------|
| Quick testing | `ggml-tiny.en.bin` | 75 MB | Fastest, lower accuracy |
| General use | `ggml-base.en.bin` | 142 MB | Best balance of speed/accuracy |
| High accuracy | `ggml-small.en.bin` | 466 MB | Better transcription quality |
| Production | `ggml-medium.en.bin` | 1.5 GB | Highest accuracy |

## Installation

```bash
cd kiku
pnpm install
```

## Development

```bash
pnpm dev
```

This runs `tauri dev`, which starts the Vite dev server and launches the Tauri application window.

## Build for Production

Before building, ensure you have set the `LIBCLANG_PATH` environment variable:

```bash
# Windows (PowerShell)
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"

# Windows (CMD)
set LIBCLANG_PATH=C:\Program Files\LLVM\bin

# Git Bash / MSYS
export LIBCLANG_PATH="C:/Program Files/LLVM/bin"
```

Then build:

```bash
pnpm build
# or
pnpm run tauri build
```

The built application will be in `src-tauri/target/release/`.

## Usage

1. **Launch the application**
2. **Enter the model path** in the input field (e.g., `C:/models/ggml-base.en.bin`)
3. **Click "Initialize Voice System"** - This loads the Whisper model (may take a few seconds)
4. **Click "Start Recording"** to begin listening
5. **Speak your command**
6. **Click "Stop & Transcribe"** to process the audio

### Built-in Voice Commands

The app comes with example commands you can extend:

- **"hello" / "hi"** → Greeting response
- **"start" / "begin"** → Triggers start workflow
- **"stop" / "end"** → Triggers stop workflow
- **"status" / "report"** → Status check
- **"help"** → Shows available commands

### Customizing Commands

Edit `src-tauri/src/voice_commands.rs` in the `process_command` method:

```rust
pub fn process_command(&self, command: &VoiceCommand) -> Option<String> {
    let text = command.text.to_lowercase();

    // Add your custom commands here
    if text.contains("open browser") {
        return Some("open_browser".to_string());
    }

    // More commands...
}
```

Then handle the command in your frontend (`src/main.js`):

```javascript
const messages = {
    open_browser: 'Opening browser...',
    // Add more command responses
};
```

## Architecture

```
kiku/
├── src/                    # Frontend (HTML/JS)
│   └── main.js            # UI logic and Tauri command calls
├── index.html             # Main UI
└── src-tauri/
    └── src/
        ├── lib.rs         # Main Tauri setup and commands
        ├── audio.rs       # Audio capture with cpal
        ├── whisper.rs     # Whisper transcription
        └── voice_commands.rs  # Command processing logic
```

## Troubleshooting

### "Model file not found"
- Verify the path to your `.bin` file is correct
- Use forward slashes: `C:/models/ggml-base.en.bin`
- Ensure the file exists and is readable

### "Failed to load Whisper model"
- The model file might be corrupted - re-download it
- Ensure you have enough RAM (at least 2GB free)
- Try a smaller model like `ggml-tiny.en.bin`

### No audio detected
- Check your microphone permissions in Windows Settings
- Ensure your microphone is set as the default input device
- Try speaking louder and closer to the microphone

### Slow transcription
- Use a smaller model (`ggml-tiny` or `ggml-base`)
- Ensure you're using the `.en` version for English-only (faster)
- Consider upgrading your CPU or using a GPU-enabled build

## Performance Tips

1. **First run is slower** - Whisper loads the model into memory
2. **Shorter recordings = faster transcription** - Aim for 2-5 second commands
3. **English-only models are faster** - Use `.en` variants if possible
4. **Close other applications** - Free up RAM for better performance

## Future Enhancements

- Global hotkey support for push-to-talk
- Continuous background listening mode
- Custom wake word detection
- GPU acceleration for faster transcription
- Recording history and playback
- Export command logs

## License

MIT

## Credits

- Built with [Tauri](https://tauri.app/)
- Voice recognition powered by [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- Audio capture via [cpal](https://github.com/RustAudio/cpal)
