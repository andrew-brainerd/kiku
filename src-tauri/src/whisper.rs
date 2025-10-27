use anyhow::{Context, Result};
use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperTranscriber {
    ctx: Arc<Mutex<Option<WhisperContext>>>,
    model_path: PathBuf,
}

impl WhisperTranscriber {
    pub fn new(model_path: PathBuf) -> Self {
        Self {
            ctx: Arc::new(Mutex::new(None)),
            model_path,
        }
    }

    pub fn load_model(&self) -> Result<()> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(&self.model_path.to_string_lossy(), params)
            .context("Failed to load Whisper model")?;

        *self.ctx.lock() = Some(ctx);
        Ok(())
    }

    pub fn transcribe(&self, audio_data: &[f32]) -> Result<String> {
        let ctx = self.ctx.lock();
        let ctx = ctx.as_ref().context("Whisper model not loaded")?;

        let mut state = ctx.create_state().context("Failed to create state")?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Configure parameters for better command recognition
        params.set_n_threads(4);
        params.set_translate(false);
        params.set_language(Some("en")); // Change this if you need other languages
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, audio_data)
            .context("Failed to transcribe audio")?;

        let num_segments = state
            .full_n_segments()
            .context("Failed to get number of segments")?;

        let mut result = String::new();
        for i in 0..num_segments {
            let segment = state
                .full_get_segment_text(i)
                .context("Failed to get segment")?;
            result.push_str(&segment);
        }

        Ok(result.trim().to_string())
    }

    pub fn is_loaded(&self) -> bool {
        self.ctx.lock().is_some()
    }
}
