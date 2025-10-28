use crate::audio::AudioRecorder;
use crate::vad::{SilenceState, VoiceActivityDetector};
use crate::whisper::WhisperTranscriber;
use anyhow::{Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommand {
    pub text: String,
    pub confidence: f32,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub is_listening: bool,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListeningEvent {
    pub event_type: String,
    pub message: String,
}

#[derive(Clone)]
pub struct VoiceCommandHandler {
    recorder: Arc<Mutex<AudioRecorder>>,
    transcriber: Arc<WhisperTranscriber>,
    is_initialized: Arc<Mutex<bool>>,
    is_listening: Arc<AtomicBool>,
    sample_rate: u32,
    wake_words: Vec<String>,
}

impl VoiceCommandHandler {
    pub fn new(model_path: PathBuf) -> Self {
        Self {
            recorder: Arc::new(Mutex::new(AudioRecorder::new())),
            transcriber: Arc::new(WhisperTranscriber::new(model_path)),
            is_initialized: Arc::new(Mutex::new(false)),
            is_listening: Arc::new(AtomicBool::new(false)),
            sample_rate: 16000, // Whisper expects 16kHz
            wake_words: vec!["kiku".to_string(), "computer".to_string()],
        }
    }

    pub fn set_audio_device(&self, device_name: Option<String>) {
        let mut recorder = self.recorder.lock();
        recorder.set_device(device_name);
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
            .lock()
            .start_recording()
            .context("Failed to start recording")?;

        Ok(())
    }

    pub async fn stop_recording_and_transcribe(&self) -> Result<VoiceCommand> {
        // Stop recording and get samples - drop the lock immediately
        let (samples, original_sample_rate) = {
            let recorder = self.recorder.lock();
            let samples = recorder.stop_recording();
            let original_sample_rate = 48000; // You might want to detect this dynamically
            (samples, original_sample_rate)
        };

        if samples.is_empty() {
            return Err(anyhow::anyhow!("No audio data recorded"));
        }

        // Convert to mono 16kHz as required by Whisper
        let resampled = {
            let recorder = self.recorder.lock();
            recorder.convert_to_16khz_mono(&samples, original_sample_rate)
        };

        // Clone transcriber Arc for the blocking task
        let transcriber = Arc::clone(&self.transcriber);

        // Transcribe the audio in a blocking task to avoid blocking the async runtime
        let text = tokio::task::spawn_blocking(move || {
            transcriber.transcribe(&resampled)
        })
        .await
        .context("Failed to spawn transcription task")?
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
            is_recording: self.recorder.lock().is_recording(),
            is_listening: self.is_listening.load(Ordering::Relaxed),
            duration_ms: 0, // Could track this if needed
        }
    }

    pub fn is_background_listening(&self) -> bool {
        self.is_listening.load(Ordering::Relaxed)
    }

    /// Start background listening for wake words
    pub fn start_background_listening(&self) -> Result<()> {
        if !*self.is_initialized.lock() {
            return Err(anyhow::anyhow!(
                "Voice command handler not initialized. Call initialize() first."
            ));
        }

        if self.is_listening.load(Ordering::Relaxed) {
            return Err(anyhow::anyhow!("Already listening for wake words"));
        }

        self.is_listening.store(true, Ordering::Relaxed);
        Ok(())
    }

    /// Stop background listening
    pub fn stop_background_listening(&self) -> Result<()> {
        self.is_listening.store(false, Ordering::Relaxed);

        // Stop recording if currently recording
        let recorder = self.recorder.lock();
        if recorder.is_recording() {
            recorder.stop_recording();
        }

        Ok(())
    }

    /// Process a chunk of audio for wake word detection
    /// Returns Some(wake_word) if detected, None otherwise
    fn detect_wake_word(&self, samples: &[f32]) -> Result<Option<String>> {
        if samples.len() < 1000 {
            // Not enough audio to transcribe
            return Ok(None);
        }

        // Transcribe the chunk
        let text = self.transcriber.transcribe(samples)
            .context("Failed to transcribe audio chunk")?;

        let text_lower = text.to_lowercase();

        // Check for wake words
        for wake_word in &self.wake_words {
            if text_lower.contains(wake_word) {
                return Ok(Some(wake_word.clone()));
            }
        }

        Ok(None)
    }

    /// Record a command after wake word detected, auto-stopping on silence
    pub async fn record_command_with_vad(&self) -> Result<VoiceCommand> {
        // Start recording
        self.recorder.lock().start_recording()
            .context("Failed to start recording")?;

        // Create VAD with 1.5 second silence threshold
        let mut vad = VoiceActivityDetector::new(0.02, 1500, 16000);

        let max_recording_duration = std::time::Duration::from_secs(10);
        let start_time = std::time::Instant::now();
        let chunk_duration = std::time::Duration::from_millis(100);

        // Record until silence detected or max duration reached
        loop {
            // Use tokio sleep instead of std::thread::sleep to not block
            tokio::time::sleep(chunk_duration).await;

            // Check if max duration exceeded
            if start_time.elapsed() > max_recording_duration {
                break;
            }

            // Get current samples
            let samples = self.recorder.lock().get_current_samples();

            // Process with VAD
            if samples.len() >= vad.frame_size() {
                let frame_start = samples.len().saturating_sub(vad.frame_size());
                let frame = &samples[frame_start..];

                let state = vad.process_frame(frame);

                if state == SilenceState::SilenceDetected {
                    // Silence detected, stop recording
                    break;
                }
            }
        }

        // Stop recording and transcribe - drop the lock immediately
        let (samples, original_sample_rate) = {
            let recorder = self.recorder.lock();
            let samples = recorder.stop_recording();
            let original_sample_rate = 48000;
            (samples, original_sample_rate)
        };

        if samples.is_empty() {
            return Err(anyhow::anyhow!("No audio data recorded"));
        }

        // Convert to 16kHz mono
        let resampled = {
            let recorder = self.recorder.lock();
            recorder.convert_to_16khz_mono(&samples, original_sample_rate)
        };

        // Clone transcriber Arc for the blocking task
        let transcriber = Arc::clone(&self.transcriber);

        // Transcribe the audio in a blocking task to avoid blocking the async runtime
        let text = tokio::task::spawn_blocking(move || {
            transcriber.transcribe(&resampled)
        })
        .await
        .context("Failed to spawn transcription task")?
        .context("Failed to transcribe audio")?;

        Ok(VoiceCommand {
            text,
            confidence: 1.0,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        })
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
