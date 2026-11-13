export type MidiConnectionStatus =
  | 'connected'
  | 'no-device'
  | 'permission-denied'
  | 'unsupported'
  | 'initializing';

export type InputSourceKind = 'midi' | 'virtual' | 'keyboard' | 'microphone';

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiState {
  status: MidiConnectionStatus;
  devices: MidiDeviceInfo[];
  activeDeviceId: string | null;
  activeDeviceName: string | null;
  errorMessage: string | null;
}

/**
 * Future-ready input interface so V2 features (microphone pitch detection,
 * ear training prompts, or sight-reading) can attach without altering the
 * core practice and validation engines.
 */
export interface NoteInputAdapter {
  readonly kind: InputSourceKind;
  subscribe(listener: (activeNotes: number[]) => void): () => void;
  dispose(): void;
}
