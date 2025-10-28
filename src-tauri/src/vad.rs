/// Voice Activity Detection (VAD) module
/// Detects speech vs silence in audio based on energy levels

use anyhow::Result;

pub struct VoiceActivityDetector {
    /// Energy threshold for detecting voice activity (adjust based on testing)
    energy_threshold: f32,
    /// Minimum consecutive silent frames before declaring silence
    silence_frame_count: usize,
    /// Current count of consecutive silent frames
    current_silent_frames: usize,
    /// Frame size in samples
    frame_size: usize,
}

impl VoiceActivityDetector {
    pub fn new(energy_threshold: f32, silence_duration_ms: u32, sample_rate: u32) -> Self {
        // Calculate number of frames needed for silence duration
        let samples_per_ms = sample_rate as f32 / 1000.0;
        let frame_size = 512; // Process audio in 512-sample chunks
        let silence_frames = (silence_duration_ms as f32 * samples_per_ms / frame_size as f32) as usize;

        Self {
            energy_threshold,
            silence_frame_count: silence_frames.max(1),
            current_silent_frames: 0,
            frame_size,
        }
    }

    /// Calculate RMS energy of an audio frame
    fn calculate_energy(&self, samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }

        let sum_of_squares: f32 = samples.iter().map(|&s| s * s).sum();
        (sum_of_squares / samples.len() as f32).sqrt()
    }

    /// Process audio samples and detect voice activity
    /// Returns true if voice is detected, false if silence
    pub fn is_voice_active(&self, samples: &[f32]) -> bool {
        let energy = self.calculate_energy(samples);
        energy > self.energy_threshold
    }

    /// Process audio and check if silence has been sustained long enough
    /// Returns true if silence duration threshold has been reached
    pub fn process_frame(&mut self, samples: &[f32]) -> SilenceState {
        let is_active = self.is_voice_active(samples);

        if is_active {
            // Voice detected, reset silence counter
            self.current_silent_frames = 0;
            SilenceState::Voice
        } else {
            // Silence detected, increment counter
            self.current_silent_frames += 1;

            if self.current_silent_frames >= self.silence_frame_count {
                SilenceState::SilenceDetected
            } else {
                SilenceState::PossibleSilence
            }
        }
    }

    /// Reset the VAD state
    pub fn reset(&mut self) {
        self.current_silent_frames = 0;
    }

    /// Get the frame size for processing
    pub fn frame_size(&self) -> usize {
        self.frame_size
    }

    /// Check if enough silence has been detected
    pub fn is_silence_detected(&self) -> bool {
        self.current_silent_frames >= self.silence_frame_count
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SilenceState {
    Voice,
    PossibleSilence,
    SilenceDetected,
}

impl Default for VoiceActivityDetector {
    fn default() -> Self {
        // Default: 0.01 energy threshold, 1.5 seconds of silence, 16kHz sample rate
        Self::new(0.01, 1500, 16000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_silence_detection() {
        let mut vad = VoiceActivityDetector::new(0.01, 100, 16000);

        // Silent frame (low energy)
        let silent_samples = vec![0.001; 512];
        assert_eq!(vad.is_voice_active(&silent_samples), false);

        // Voice frame (high energy)
        let voice_samples = vec![0.1; 512];
        assert_eq!(vad.is_voice_active(&voice_samples), true);
    }

    #[test]
    fn test_sustained_silence() {
        let mut vad = VoiceActivityDetector::new(0.01, 50, 16000);
        let silent_samples = vec![0.001; 512];

        // Process frames until silence is detected
        for i in 0..10 {
            let state = vad.process_frame(&silent_samples);
            if i < vad.silence_frame_count {
                assert!(state != SilenceState::SilenceDetected);
            } else {
                assert_eq!(state, SilenceState::SilenceDetected);
            }
        }
    }
}
