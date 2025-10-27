import { invoke } from '@tauri-apps/api/core';

let isInitialized = false;
let isRecording = false;

// Initialize the voice system
async function initializeVoice() {
  const modelPath = document.getElementById('modelPath').value;
  const initBtn = document.getElementById('initBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const commandResult = document.getElementById('commandResult');

  if (!modelPath) {
    showError('Please enter a model path');
    return;
  }

  try {
    initBtn.disabled = true;
    statusText.textContent = 'Initializing...';
    commandResult.innerHTML = '';

    const result = await invoke('initialize_voice', { modelPath });

    statusDot.classList.add('active');
    statusText.textContent = 'Initialized - Ready';
    isInitialized = true;

    // Show recording controls
    document.getElementById('recordingControls').style.display = 'flex';
    initBtn.style.display = 'none';

    showSuccess(result);
  } catch (error) {
    showError(`Initialization failed: ${error}`);
    initBtn.disabled = false;
    statusText.textContent = 'Not initialized';
  }
}

// Start recording
async function startRecording() {
  if (!isInitialized) {
    showError('Please initialize the voice system first');
    return;
  }

  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const recordingStatus = document.getElementById('recordingStatus');
  const transcriptionResult = document.getElementById('transcriptionResult');
  const commandResult = document.getElementById('commandResult');

  try {
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    recordingStatus.style.display = 'flex';
    commandResult.innerHTML = '';
    transcriptionResult.textContent = 'Listening...';

    await invoke('start_recording');
    isRecording = true;
    recordBtn.classList.add('recording');
  } catch (error) {
    showError(`Failed to start recording: ${error}`);
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingStatus.style.display = 'none';
  }
}

// Stop recording and transcribe
async function stopRecording() {
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const recordingStatus = document.getElementById('recordingStatus');
  const transcriptionResult = document.getElementById('transcriptionResult');
  const commandResult = document.getElementById('commandResult');

  try {
    stopBtn.disabled = true;
    transcriptionResult.textContent = 'Processing...';

    const voiceCommand = await invoke('stop_recording');
    isRecording = false;

    recordBtn.classList.remove('recording');
    recordingStatus.style.display = 'none';
    recordBtn.disabled = false;

    // Display the transcription
    transcriptionResult.textContent = voiceCommand.text || '(No speech detected)';

    // Process the command
    const commandType = await invoke('process_voice_command', { command: voiceCommand });

    if (commandType) {
      showCommandResult(commandType, voiceCommand.text);
    } else {
      showInfo('No matching command found. Try: "hello", "start", "stop", "status", or "help"');
    }
  } catch (error) {
    showError(`Failed to transcribe: ${error}`);
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingStatus.style.display = 'none';
    recordBtn.classList.remove('recording');
  }
}

// Show command result
function showCommandResult(commandType, originalText) {
  const commandResult = document.getElementById('commandResult');

  const messages = {
    greeting: 'Hello! How can I help you?',
    start_workflow: 'Starting workflow...',
    stop_workflow: 'Stopping workflow...',
    status_check: 'Status: All systems operational',
    show_help: 'Available commands: hello, start, stop, status, help'
  };

  const message = messages[commandType] || `Command triggered: ${commandType}`;

  commandResult.innerHTML = `
    <div class="command-result">
      <strong>Command detected:</strong> ${commandType}<br>
      <strong>Action:</strong> ${message}
    </div>
  `;
}

// Show error message
function showError(message) {
  const commandResult = document.getElementById('commandResult');
  commandResult.innerHTML = `<div class="error"><strong>Error:</strong> ${message}</div>`;
}

// Show success message
function showSuccess(message) {
  const commandResult = document.getElementById('commandResult');
  commandResult.innerHTML = `<div class="command-result">${message}</div>`;
}

// Show info message
function showInfo(message) {
  const commandResult = document.getElementById('commandResult');
  commandResult.innerHTML = `<div class="command-result">${message}</div>`;
}

// Check initialization status on load
window.addEventListener('DOMContentLoaded', async () => {
  // Set up event listeners
  document.getElementById('initBtn').addEventListener('click', initializeVoice);
  document.getElementById('recordBtn').addEventListener('click', startRecording);
  document.getElementById('stopBtn').addEventListener('click', stopRecording);

  try {
    isInitialized = await invoke('is_voice_initialized');
    if (isInitialized) {
      document.getElementById('statusDot').classList.add('active');
      document.getElementById('statusText').textContent = 'Initialized - Ready';
      document.getElementById('recordingControls').style.display = 'flex';
      document.getElementById('initBtn').style.display = 'none';
    }
  } catch (error) {
    console.log('Not initialized yet');
  }
});

console.log('kiku voice command app loaded');
