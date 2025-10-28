mod audio;
mod voice_commands;
mod whisper;

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
fn stop_recording(state: State<AppState>) -> Result<VoiceCommand, String> {
    let handler_lock = state.voice_handler.lock();
    let handler = handler_lock
        .as_ref()
        .ok_or("Voice system not initialized")?;

    let command = handler
        .stop_recording_and_transcribe()
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
            download_model,
            get_model_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
