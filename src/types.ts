/**
 * Type definitions for Tauri backend commands
 */

/**
 * Voice command returned from transcription
 */
export interface VoiceCommand {
  text: string;
  confidence: number;
  timestamp: number;
}

/**
 * Recording status information
 */
export interface RecordingStatus {
  is_recording: boolean;
  duration_ms: number;
}

/**
 * Command types that can be recognized
 */
export type CommandType =
  | 'greeting'
  | 'start_workflow'
  | 'stop_workflow'
  | 'status_check'
  | 'show_help';

/**
 * Message types for UI feedback
 */
export type MessageType = 'error' | 'success' | 'info' | 'command';

/**
 * Message state for displaying feedback to user
 */
export interface Message {
  type: MessageType;
  text: string;
  commandType?: CommandType;
}

/**
 * Command messages mapping
 */
export const COMMAND_MESSAGES: Record<CommandType, string> = {
  greeting: 'Hello! How can I help you?',
  start_workflow: 'Starting workflow...',
  stop_workflow: 'Stopping workflow...',
  status_check: 'Status: All systems operational',
  show_help: 'Available commands: hello, start, stop, status, help',
};
