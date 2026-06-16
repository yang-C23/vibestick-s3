import type { VibeTask, RiskLevel } from './task';

/** UI state machine shown on the device screen. */
export const DEVICE_STATES = [
  'idle',
  'pairing',
  'connected',
  'recording',
  'streaming',
  'transcribing',
  'draft_preview',
  'sending',
  'agent_running',
  'done',
  'error',
] as const;
export type DeviceState = (typeof DEVICE_STATES)[number];

export const BUTTONS = ['primary', 'secondary', 'power'] as const;
export type Button = (typeof BUTTONS)[number];

export const BUTTON_GESTURES = [
  'click',
  'double_click',
  'long_press_start',
  'long_press_end',
] as const;
export type ButtonGesture = (typeof BUTTON_GESTURES)[number];

export const IMU_GESTURES = [
  'shake',
  'raise',
  'tilt_left',
  'tilt_right',
  'face_down',
  'face_up',
] as const;
export type ImuGesture = (typeof IMU_GESTURES)[number];

export const TARGETS = ['auto', 'claude', 'codex', 'clipboard', 'terminal'] as const;
export type Target = (typeof TARGETS)[number];

export const DRAFT_ACTIONS = [
  'send',
  'copy_only',
  'save_draft',
  'append',
  'restore_last',
  'cancel',
  'retry',
] as const;
export type DraftActionKind = (typeof DRAFT_ACTIONS)[number];

export interface DeviceConfig {
  /** Max push-to-talk recording length before auto-stop. */
  recordMaxMs: number;
  /** Auto-paste into the focused app (requires macOS Accessibility). Never auto-presses Enter. */
  autoPaste: boolean;
  /** Mascot asset pack name (original art only — no official logos). */
  mascotPack: string;
}

// ---------------------------------------------------------------------------
// Device -> Bridge
// ---------------------------------------------------------------------------

export interface HelloMsg {
  type: 'hello';
  protocolVersion: number;
  deviceId: string;
  firmware: string;
  token?: string;
}
export interface HeartbeatMsg {
  type: 'heartbeat';
  ts: number;
}
export interface ButtonEventMsg {
  type: 'button.event';
  button: Button;
  gesture: ButtonGesture;
  ts: number;
}
export interface ImuEventMsg {
  type: 'imu.event';
  gesture: ImuGesture;
  ts: number;
}
export interface AudioStartMsg {
  type: 'audio.start';
  sessionId: string;
  sampleRate: number;
  channels: number;
  format: 'pcm16';
}
export interface AudioStopMsg {
  type: 'audio.stop';
  sessionId: string;
  durationMs: number;
}
/** Base64-encoded PCM16 chunk — used by the serial transport (WiFi uses binary frames). */
export interface AudioChunkMsg {
  type: 'audio.chunk';
  data: string;
}
export interface DraftActionMsg {
  type: 'draft.action';
  draftId: string;
  action: DraftActionKind;
}

export type DeviceToBridge =
  | HelloMsg
  | HeartbeatMsg
  | ButtonEventMsg
  | ImuEventMsg
  | AudioStartMsg
  | AudioChunkMsg
  | AudioStopMsg
  | DraftActionMsg;

// ---------------------------------------------------------------------------
// Bridge -> Device
// ---------------------------------------------------------------------------

export interface WelcomeMsg {
  type: 'welcome';
  protocolVersion: number;
  deviceId: string;
  config: DeviceConfig;
}
export interface StateUpdateMsg {
  type: 'state.update';
  state: DeviceState;
  task?: VibeTask | null;
}
export interface DraftPreviewMsg {
  type: 'draft.preview';
  draftId: string;
  target: Target;
  shortPreview: string;
  riskLevel: RiskLevel;
  needsClarification: boolean;
  clarificationQuestion?: string | null;
}
export interface TaskUpdateMsg {
  type: 'task.update';
  task: VibeTask;
}
export interface ConfigMsg {
  type: 'config';
  config: DeviceConfig;
}
export interface ErrorMsg {
  type: 'error';
  code: string;
  message: string;
}
export interface PongMsg {
  type: 'pong';
  ts: number;
}

export type BridgeToDevice =
  | WelcomeMsg
  | StateUpdateMsg
  | DraftPreviewMsg
  | TaskUpdateMsg
  | ConfigMsg
  | ErrorMsg
  | PongMsg;

export type AnyMessage = DeviceToBridge | BridgeToDevice;

/** Narrow an unknown parsed JSON value to a message by its `type` tag. */
export function isMessage(v: unknown): v is AnyMessage {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}
