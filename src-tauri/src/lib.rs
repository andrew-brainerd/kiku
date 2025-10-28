mod audio;
mod vad;
mod voice_commands;
mod whisper;

use audio::AudioDeviceInfo;
use audio::AudioRecorder;
use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tauri::Manager;
use voice_commands::{RecordingStatus, VoiceCommand, VoiceCommandHandler};

pub struct AppState {
    voice_handler: Arc<Mutex<Option<VoiceCommandHandler>>>,
}

#[tauri::command]
fn initialize_voice(state: State<AppState>, model_path: String) -> Result<String, String> {
    let path = PathBuf::from(model_path);

    if !path.exists() {
        return Err(format!("Model file not found at: {}", path.display()));
    }

    let handler = VoiceCommandHandler::new(path);
    handler.initialize().map_err(|e| e.to_string())?;

    *state.voice_handler.lock() = Some(handler);

    Ok("Voice system initialized successfully".to_string())
}

#[tauri::command]
fn start_recording(state: State<AppState>) -> Result<String, String> {
    let handler_lock = state.voice_handler.lock();
    let handler = handler_lock
        .as_ref()
        .ok_or("Voice system not initialized")?;

    handler.start_recording().map_err(|e| e.to_string())?;

    Ok("Recording started".to_string())
}

#[tauri::command]
async fn stop_recording(state: State<'_, AppState>) -> Result<VoiceCommand, String> {
    // Clone the handler Arc to avoid holding the lock across await
    let handler_arc = {
        let handler_lock = state.voice_handler.lock();
        handler_lock
            .as_ref()
            .ok_or("Voice system not initialized")?
            .clone()
    };

    let command = handler_arc
        .stop_recording_and_transcribe()
        .await
        .map_err(|e| e.to_string())?;

    Ok(command)
}

#[tauri::command]
fn get_recording_status(state: State<AppState>) -> Result<RecordingStatus, String> {
    let handler_lock = state.voice_handler.lock();
    let handler = handler_lock
        .as_ref()
        .ok_or("Voice system not initialized")?;

    Ok(handler.get_recording_status())
}

#[tauri::command]
fn process_voice_command(state: State<AppState>, command: VoiceCommand) -> Result<Option<String>, String> {
    let handler_lock = state.voice_handler.lock();
    let handler = handler_lock
        .as_ref()
        .ok_or("Voice system not initialized")?;

    Ok(handler.process_command(&command))
}

#[tauri::command]
fn is_voice_initialized(state: State<AppState>) -> bool {
    let handler_lock = state.voice_handler.lock();
    if let Some(handler) = handler_lock.as_ref() {
        handler.is_initialized()
    } else {
        false
    }
}

#[tauri::command]
fn start_background_listening(state: State<AppState>) -> Result<String, String> {
    let handler_lock = state.voice_handler.lock();
    let handler = handler_lock
        .as_ref()
        .ok_or("Voice system not initialized")?;

    handler.start_background_listening().map_err(|e| e.to_string())?;

    Ok("Background listening started".to_string())
}

#[tauri::command]
fn stop_background_listening(state: State<AppState>) -> Result<String, String> {
    let handler_lock = state.voice_handler.lock();
    let handler = handler_lock
        .as_ref()
        .ok_or("Voice system not initialized")?;

    handler.stop_background_listening().map_err(|e| e.to_string())?;

    Ok("Background listening stopped".to_string())
}

#[tauri::command]
fn is_background_listening(state: State<AppState>) -> bool {
    let handler_lock = state.voice_handler.lock();
    if let Some(handler) = handler_lock.as_ref() {
        handler.is_background_listening()
    } else {
        false
    }
}

#[tauri::command]
async fn record_command_with_vad(state: State<'_, AppState>) -> Result<VoiceCommand, String> {
    // Clone the handler Arc to avoid holding the lock across await
    let handler_arc = {
        let handler_lock = state.voice_handler.lock();
        handler_lock
            .as_ref()
            .ok_or("Voice system not initialized")?
            .clone()
    };

    let command = handler_arc
        .record_command_with_vad()
        .await
        .map_err(|e| e.to_string())?;

    Ok(command)
}

#[tauri::command]
async fn download_model(app: tauri::AppHandle, model_name: String) -> Result<String, String> {
    use std::fs;
    use std::io::Write;

    // Get the app data directory
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let models_dir = app_data_dir.join("models");
    fs::create_dir_all(&models_dir).map_err(|e| format!("Failed to create models directory: {}", e))?;

    let model_path = models_dir.join(&model_name);

    // Check if model already exists
    if model_path.exists() {
        return Ok(format!("Model already downloaded at: {}", model_path.display()));
    }

    // Download from Hugging Face
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        model_name
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to download model: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut file = fs::File::create(&model_path)
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write model file: {}", e))?;

    Ok(format!("Model downloaded successfully to: {}", model_path.display()))
}

#[tauri::command]
async fn get_model_path(app: tauri::AppHandle, model_name: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let model_path = app_data_dir.join("models").join(&model_name);
    Ok(model_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_available_models(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use std::fs;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let models_dir = app_data_dir.join("models");

    // Check if models directory exists
    if !models_dir.exists() {
        return Ok(Vec::new());
    }

    // Read directory and collect .bin files
    let mut models = Vec::new();
    let entries = fs::read_dir(&models_dir)
        .map_err(|e| format!("Failed to read models directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                if let Some(extension) = path.extension() {
                    if extension == "bin" {
                        if let Some(file_name) = path.file_name() {
                            models.push(file_name.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(models)
}

#[tauri::command]
async fn get_models_directory(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let models_dir = app_data_dir.join("models");
    Ok(models_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    AudioRecorder::list_input_devices()
        .map_err(|e| format!("Failed to list audio devices: {}", e))
}

#[tauri::command]
fn set_audio_device(state: State<AppState>, device_name: Option<String>) -> Result<(), String> {
    let handler_lock = state.voice_handler.lock();
    if let Some(handler) = handler_lock.as_ref() {
        handler.set_audio_device(device_name);
        Ok(())
    } else {
        Err("Voice system not initialized".to_string())
    }
}

#[tauri::command]
async fn log_voice_command(app: tauri::AppHandle, command: VoiceCommand) -> Result<(), String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;

    // Get the app data directory
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create logs directory if it doesn't exist
    let logs_dir = app_data_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("Failed to create logs directory: {}", e))?;

    // Create log file path with current date
    let log_file = logs_dir.join("voice_commands.log");

    // Format log entry
    let timestamp = std::time::SystemTime::UNIX_EPOCH
        .elapsed()
        .unwrap_or_default()
        .as_secs();
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp as i64, 0)
        .unwrap_or_default()
        .format("%Y-%m-%d %H:%M:%S UTC");

    let log_entry = format!(
        "[{}] {} (confidence: {})\n",
        datetime,
        command.text,
        command.confidence
    );

    // Append to log file
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    file.write_all(log_entry.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_log_file_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let log_file = app_data_dir.join("logs").join("voice_commands.log");
    Ok(log_file.to_string_lossy().to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            voice_handler: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            initialize_voice,
            start_recording,
            stop_recording,
            get_recording_status,
            process_voice_command,
            is_voice_initialized,
            start_background_listening,
            stop_background_listening,
            is_background_listening,
            record_command_with_vad,
            download_model,
            get_model_path,
            list_available_models,
            get_models_directory,
            list_audio_devices,
            set_audio_device,
            log_voice_command,
            get_log_file_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
