use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample, StreamConfig};
use parking_lot::Mutex;
use std::sync::Arc;

pub struct AudioRecorder {
    samples: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<Mutex<bool>>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            is_recording: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start_recording(&self) -> Result<()> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .context("No input device available")?;

        let config = device
            .default_input_config()
            .context("Failed to get default input config")?;

        let samples = Arc::clone(&self.samples);
        let is_recording = Arc::clone(&self.is_recording);

        // Clear previous samples
        samples.lock().clear();
        *is_recording.lock() = true;

        match config.sample_format() {
            cpal::SampleFormat::I8 => self.run::<i8>(&device, &config.into(), samples, is_recording)?,
            cpal::SampleFormat::I16 => self.run::<i16>(&device, &config.into(), samples, is_recording)?,
            cpal::SampleFormat::I32 => self.run::<i32>(&device, &config.into(), samples, is_recording)?,
            cpal::SampleFormat::F32 => self.run::<f32>(&device, &config.into(), samples, is_recording)?,
            _ => return Err(anyhow::anyhow!("Unsupported sample format")),
        }

        Ok(())
    }

    pub fn stop_recording(&self) -> Vec<f32> {
        *self.is_recording.lock() = false;
        // Give the stream a moment to finish processing
        std::thread::sleep(std::time::Duration::from_millis(100));
        let samples = self.samples.lock().clone();
        samples
    }

    pub fn is_recording(&self) -> bool {
        *self.is_recording.lock()
    }

    /// Get a copy of current samples without stopping recording
    pub fn get_current_samples(&self) -> Vec<f32> {
        self.samples.lock().clone()
    }

    fn run<T>(
        &self,
        device: &cpal::Device,
        config: &StreamConfig,
        samples: Arc<Mutex<Vec<f32>>>,
        is_recording: Arc<Mutex<bool>>,
    ) -> Result<()>
    where
        T: Sample + SizedSample,
        f32: FromSample<T>,
    {
        let err_fn = |err| eprintln!("Error occurred on stream: {}", err);

        let stream = device.build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                if !*is_recording.lock() {
                    return;
                }

                let mut samples = samples.lock();
                for &sample in data.iter() {
                    samples.push(sample.to_sample::<f32>());
                }
            },
            err_fn,
            None,
        )?;

        stream.play()?;

        // Keep the stream alive by intentionally leaking it
        // The is_recording flag controls whether samples are collected
        std::mem::forget(stream);

        Ok(())
    }

    pub fn save_to_wav(&self, samples: &[f32], sample_rate: u32, path: &str) -> Result<()> {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = hound::WavWriter::create(path, spec)?;

        for &sample in samples {
            let amplitude = (sample * i16::MAX as f32) as i16;
            writer.write_sample(amplitude)?;
        }

        writer.finalize()?;
        Ok(())
    }

    pub fn convert_to_16khz_mono(&self, samples: &[f32], original_sample_rate: u32) -> Vec<f32> {
        if original_sample_rate == 16000 {
            return samples.to_vec();
        }

        let ratio = original_sample_rate as f32 / 16000.0;
        let new_length = (samples.len() as f32 / ratio) as usize;
        let mut resampled = Vec::with_capacity(new_length);

        for i in 0..new_length {
            let pos = i as f32 * ratio;
            let index = pos as usize;
            if index < samples.len() {
                resampled.push(samples[index]);
            }
        }

        resampled
    }
}

impl Default for AudioRecorder {
    fn default() -> Self {
        Self::new()
    }
}
