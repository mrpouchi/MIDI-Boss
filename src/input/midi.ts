import { MidiDeviceInfo, MidiState } from './types';

export type MidiNoteListener = (note: number, isDown: boolean, velocity: number) => void;
export type MidiStateListener = (state: MidiState) => void;
export type MidiPanicListener = () => void;

export class WebMidiController {
  private midiAccess: MIDIAccess | null = null;
  private activeDeviceId: string | null = null;
  private stateListeners = new Set<MidiStateListener>();
  private noteListeners = new Set<MidiNoteListener>();
  private panicListeners = new Set<MidiPanicListener>();
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
      input.onmidimessage = (event) => this.handleMidiMessage(input.id, event);
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

  private handleMidiMessage(inputId: string, event: MIDIMessageEvent): void {
    if (this.activeDeviceId && inputId !== this.activeDeviceId) {
      return;
    }
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const note = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    // Note On
    if (status === 0x90 && velocity > 0) {
      this.noteListeners.forEach((cb) => cb(note, true, velocity));
      return;
    }

    // Note Off (or Note On with velocity 0)
    if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      this.noteListeners.forEach((cb) => cb(note, false, 0));
      return;
    }

    // All Notes Off / All Sound Off (CC 123 or CC 120)
    if (status === 0xb0 && (note === 123 || note === 120)) {
      this.panicListeners.forEach((cb) => cb());
    }
  }

  private updateState(next: MidiState): void {
    this.currentState = next;
    this.stateListeners.forEach((cb) => cb(next));
  }
}
