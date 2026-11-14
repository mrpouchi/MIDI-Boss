import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from '../midi';

describe('parseMidiMessage', () => {
  it('decodes note on with channel 1–16', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ kind: 'note-on', channel: 1, note: 60, velocity: 100 });
    expect(parseMidiMessage([0x9f, 64, 1])).toEqual({ kind: 'note-on', channel: 16, note: 64, velocity: 1 });
  });

  it('treats note on with velocity 0 as note off', () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ kind: 'note-off', channel: 1, note: 60 });
  });

  it('decodes note off and control change', () => {
    expect(parseMidiMessage([0x81, 62, 40])).toEqual({ kind: 'note-off', channel: 2, note: 62 });
    expect(parseMidiMessage([0xb0, 123, 0])).toEqual({ kind: 'control-change', channel: 1, controller: 123, value: 0 });
  });

  it('keeps system messages as other', () => {
    expect(parseMidiMessage([0xf8])).toEqual({ kind: 'other', status: 0xf8 });
    expect(parseMidiMessage([])).toBeNull();
  });
});
