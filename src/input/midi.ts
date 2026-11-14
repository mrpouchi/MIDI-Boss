import { MidiDeviceInfo, MidiState } from './types';

/**
 * `timeMs` is the Web MIDI event timestamp (same clock as `performance.now()`),
 * captured when the message arrived — not when React got around to rendering.
 */
export type MidiNoteListener = (
  note: number,
  isDown: boolean,
  velocity: number,
  timeMs: number,
) => void;
export type MidiStateListener = (state: MidiState) => void;
export type MidiPanicListener = () => void;

export type ParsedMidiMessage =
  | { kind: 'note-on'; channel: number; note: number; velocity: number }
  | { kind: 'note-off'; channel: number; note: number }
  | { kind: 'control-change'; channel: number; controller: number; value: number }
  | { kind: 'other'; status: number };

export interface MidiRawEvent {
  timeMs: number;
  deviceName: string;
  message: ParsedMidiMessage;
}
export type MidiRawListener = (event: MidiRawEvent) => void;

/** Pure decoding of one MIDI message (channel numbers are 1–16). */
export function parseMidiMessage(data: ArrayLike<number>): ParsedMidiMessage | null {
  if (!data || data.length < 1) return null;
  const statusByte = data[0];
  const kind = statusByte & 0xf0;
  const channel = (statusByte & 0x0f) + 1;
  if (statusByte >= 0xf0) return { kind: 'other', status: statusByte };
  if (data.length < 2) return { kind: 'other', status: statusByte };
  const d1 = data[1];
  const d2 = data.length > 2 ? data[2] : 0;
  if (kind === 0x90 && d2 > 0) return { kind: 'note-on', channel, note: d1, velocity: d2 };
  if (kind === 0x80 || kind === 0x90) return { kind: 'note-off', channel, note: d1 };
  if (kind === 0xb0) return { kind: 'control-change', channel, controller: d1, value: d2 };
  return { kind: 'other', status: statusByte };
}

export class WebMidiController {
  private midiAccess: MIDIAccess | null = null;
  private activeDeviceId: string | null = null;
  private stateListeners = new Set<MidiStateListener>();
  private noteListeners = new Set<MidiNoteListener>();
  private panicListeners = new Set<MidiPanicListener>();
  private rawListeners = new Set<MidiRawListener>();
  private currentState: MidiState = {
    status: 'initializing',
    devices: [],
    activeDeviceId: null,
    activeDeviceName: null,
    errorMessage: null,
  };

  async init(): Promise<void> {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
      this.updateState({
        status: 'unsupported',
        devices: [],
        activeDeviceId: null,
        activeDeviceName: null,
        errorMessage: 'Web MIDI API non prise en charge par ce navigateur.',
      });
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.midiAccess.onstatechange = () => {
        this.syncDevices();
      };
      this.syncDevices();
    } catch (err) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'SecurityError' || err.name === 'NotAllowedError');
      this.updateState({
        status: isDenied ? 'permission-denied' : 'no-device',
        devices: [],
        activeDeviceId: null,
        activeDeviceName: null,
        errorMessage: isDenied
          ? 'Permission MIDI refusée par le navigateur.'
          : 'Impossible d’accéder aux périphériques MIDI.',
      });
    }
  }

  async refresh(): Promise<void> {
    if (!this.midiAccess) {
      await this.init();
      return;
    }
    this.syncDevices();
  }

  selectDevice(deviceId: string): void {
    this.activeDeviceId = deviceId;
    this.syncDevices();
  }

  getState(): MidiState {
    return this.currentState;
  }

  onStateChange(listener: MidiStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => this.stateListeners.delete(listener);
  }

  onNoteEvent(listener: MidiNoteListener): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  /** Every incoming message from the active device, for the MIDI monitor. */
  onRawEvent(listener: MidiRawListener): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  onPanic(listener: MidiPanicListener): () => void {
    this.panicListeners.add(listener);
    return () => this.panicListeners.delete(listener);
  }

  dispose(): void {
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
      this.midiAccess.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
    }
    this.stateListeners.clear();
    this.noteListeners.clear();
    this.panicListeners.clear();
    this.rawListeners.clear();
  }

  private syncDevices(): void {
    if (!this.midiAccess) return;

    const devices: MidiDeviceInfo[] = [];
    this.midiAccess.inputs.forEach((input) => {
      if (input.state === 'connected') {
        devices.push({
          id: input.id,
          name: input.name || 'Clavier MIDI',
          manufacturer: input.manufacturer || '',
        });
      }
      const deviceName = input.name || 'Clavier MIDI';
      input.onmidimessage = (event) => this.handleMidiMessage(input.id, deviceName, event);
    });

    if (devices.length === 0) {
      this.activeDeviceId = null;
      this.updateState({
        status: 'no-device',
        devices: [],
        activeDeviceId: null,
        activeDeviceName: null,
        errorMessage: null,
      });
      return;
    }

    const stillExists = devices.some((d) => d.id === this.activeDeviceId);
    const chosen = stillExists
      ? devices.find((d) => d.id === this.activeDeviceId)!
      : devices[0];
    this.activeDeviceId = chosen.id;

    this.updateState({
      status: 'connected',
      devices,
      activeDeviceId: chosen.id,
      activeDeviceName: chosen.name,
      errorMessage: null,
    });
  }

  private handleMidiMessage(
    inputId: string,
    deviceName: string,
    event: MIDIMessageEvent,
  ): void {
    if (this.activeDeviceId && inputId !== this.activeDeviceId) {
      return;
    }
    const message = event.data ? parseMidiMessage(event.data) : null;
    if (!message) return;
    // Clock (0xF8) and active sensing (0xFE) arrive many times per second and
    // would flood the monitor without carrying anything useful for practice.
    if (message.kind === 'other' && (message.status === 0xf8 || message.status === 0xfe)) {
      return;
    }
    const timeMs = event.timeStamp || performance.now();
    this.rawListeners.forEach((cb) => cb({ timeMs, deviceName, message }));

    if (message.kind === 'note-on') {
      this.noteListeners.forEach((cb) => cb(message.note, true, message.velocity, timeMs));
      return;
    }
    if (message.kind === 'note-off') {
      this.noteListeners.forEach((cb) => cb(message.note, false, 0, timeMs));
      return;
    }
    // All Notes Off / All Sound Off (CC 123 or CC 120)
    if (
      message.kind === 'control-change' &&
      (message.controller === 123 || message.controller === 120)
    ) {
      this.panicListeners.forEach((cb) => cb());
    }
  }

  private updateState(next: MidiState): void {
    this.currentState = next;
    this.stateListeners.forEach((cb) => cb(next));
  }
}
