mod audio;
mod voice_commands;
mod whisper;

use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            voice_handler: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            initialize_voice,
            start_recording,
            stop_recording,
            get_recording_status,
            process_voice_command,
            is_voice_initialized
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
