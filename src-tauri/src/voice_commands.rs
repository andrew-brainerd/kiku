use crate::audio::AudioRecorder;
use crate::whisper::WhisperTranscriber;
use anyhow::{Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommand {
    pub text: String,
    pub confidence: f32,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub duration_ms: u64,
}

pub struct VoiceCommandHandler {
    recorder: Arc<AudioRecorder>,
    transcriber: Arc<WhisperTranscriber>,
    is_initialized: Arc<Mutex<bool>>,
    sample_rate: u32,
}

impl VoiceCommandHandler {
    pub fn new(model_path: PathBuf) -> Self {
        Self {
            recorder: Arc::new(AudioRecorder::new()),
            transcriber: Arc::new(WhisperTranscriber::new(model_path)),
            is_initialized: Arc::new(Mutex::new(false)),
            sample_rate: 16000, // Whisper expects 16kHz
        }
    }

    pub fn initialize(&self) -> Result<()> {
        if *self.is_initialized.lock() {
            return Ok(());
        }

        self.transcriber
            .load_model()
            .context("Failed to load Whisper model")?;
        *self.is_initialized.lock() = true;

        Ok(())
    }

    pub fn start_recording(&self) -> Result<()> {
        if !*self.is_initialized.lock() {
            return Err(anyhow::anyhow!(
                "Voice command handler not initialized. Call initialize() first."
            ));
        }

        self.recorder
            .start_recording()
            .context("Failed to start recording")?;

        Ok(())
    }

    pub fn stop_recording_and_transcribe(&self) -> Result<VoiceCommand> {
        let samples = self.recorder.stop_recording();

        if samples.is_empty() {
            return Err(anyhow::anyhow!("No audio data recorded"));
        }

        // Get the original sample rate from the device (typically 44100 or 48000)
        let original_sample_rate = 48000; // You might want to detect this dynamically

        // Convert to mono 16kHz as required by Whisper
        let resampled = self
            .recorder
            .convert_to_16khz_mono(&samples, original_sample_rate);

        // Transcribe the audio
        let text = self
            .transcriber
            .transcribe(&resampled)
            .context("Failed to transcribe audio")?;

        Ok(VoiceCommand {
            text,
            confidence: 1.0, // Whisper doesn't provide confidence scores
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        })
    }

    pub fn get_recording_status(&self) -> RecordingStatus {
        RecordingStatus {
            is_recording: self.recorder.is_recording(),
            duration_ms: 0, // Could track this if needed
        }
    }

    pub fn is_initialized(&self) -> bool {
        *self.is_initialized.lock()
    }

    pub fn process_command(&self, command: &VoiceCommand) -> Option<String> {
        let text = command.text.to_lowercase();

        // Define your command mappings here
        // This is where you can trigger workflows based on voice commands

        if text.contains("hello") || text.contains("hi") {
            return Some("greeting".to_string());
        }

        if text.contains("start") || text.contains("begin") {
            return Some("start_workflow".to_string());
        }

        if text.contains("stop") || text.contains("end") {
            return Some("stop_workflow".to_string());
        }

        if text.contains("status") || text.contains("report") {
            return Some("status_check".to_string());
        }

        if text.contains("help") {
            return Some("show_help".to_string());
        }

        // Return None if no command matched
        None
    }
}
