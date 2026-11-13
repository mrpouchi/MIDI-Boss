export interface KeyMappingEntry {
  code: string;
  label: string;
  midi: number;
}

/**
 * Physical keyboard mapping using KeyboardEvent.code so the piano geometry
 * stays consistent on both AZERTY and QWERTY keyboards.
 * Covers C4 (60) through E5 (76).
 */
export const KEYBOARD_PIANO_MAP: KeyMappingEntry[] = [
  { code: 'KeyA', label: 'Q/A', midi: 60 }, // C4
  { code: 'KeyW', label: 'Z/W', midi: 61 }, // C#4
  { code: 'KeyS', label: 'S', midi: 62 },   // D4
  { code: 'KeyE', label: 'E', midi: 63 },   // D#4
  { code: 'KeyD', label: 'D', midi: 64 },   // E4
  { code: 'KeyF', label: 'F', midi: 65 },   // F4
  { code: 'KeyT', label: 'T', midi: 66 },   // F#4
  { code: 'KeyG', label: 'G', midi: 67 },   // G4
  { code: 'KeyY', label: 'Y', midi: 68 },   // G#4
  { code: 'KeyH', label: 'H', midi: 69 },   // A4
  { code: 'KeyU', label: 'U', midi: 70 },   // A#4
  { code: 'KeyJ', label: 'J', midi: 71 },   // B4
  { code: 'KeyK', label: 'K', midi: 72 },   // C5
  { code: 'KeyO', label: 'O', midi: 73 },   // C#5
  { code: 'KeyL', label: 'L', midi: 74 },   // D5
  { code: 'KeyP', label: 'P', midi: 75 },   // D#5
  { code: 'Semicolon', label: 'M/;', midi: 76 }, // E5
];

export const CODE_TO_MIDI: Record<string, number> = Object.fromEntries(
  KEYBOARD_PIANO_MAP.map((entry) => [entry.code, entry.midi]),
);

export const MIDI_TO_KEY_LABEL: Record<number, string> = Object.fromEntries(
  KEYBOARD_PIANO_MAP.map((entry) => [entry.midi, entry.label]),
);
