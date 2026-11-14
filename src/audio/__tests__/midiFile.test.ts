import { parseMidi, writeMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { analyzeMidi, setMidiTempo } from '../midiFile';

// A tiny iReal-like file: 1 count-in bar of clicks, then piano + bass from bar 2.
function makeMidi(): ArrayBuffer {
  const tpb = 480;
  const bar = tpb * 4;
  const data = writeMidi({
    header: { format: 1, numTracks: 4, ticksPerBeat: tpb },
    tracks: [
      [
        { deltaTime: 0, meta: true, type: 'timeSignature', numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 428571 }, // 140 bpm
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
      [
        { deltaTime: 0, meta: true, type: 'trackName', text: 'Click' },
        { deltaTime: 0, type: 'noteOn', channel: 6, noteNumber: 76, velocity: 90 },
        { deltaTime: 100, type: 'noteOff', channel: 6, noteNumber: 76, velocity: 0 },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
      [
        { deltaTime: 0, meta: true, type: 'trackName', text: 'Piano' },
        { deltaTime: bar, type: 'noteOn', channel: 0, noteNumber: 63, velocity: 80 },
        { deltaTime: bar * 2, type: 'noteOff', channel: 0, noteNumber: 63, velocity: 0 },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
      [
        { deltaTime: 0, meta: true, type: 'trackName', text: 'Bass' },
        { deltaTime: bar * 2 + tpb, type: 'noteOn', channel: 1, noteNumber: 36, velocity: 80 },
        { deltaTime: tpb, type: 'noteOff', channel: 1, noteNumber: 36, velocity: 0 },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
    ],
  });
  return new Uint8Array(data).buffer;
}

describe('analyzeMidi', () => {
  it('finds tempo, count-in, length and the piano channel', () => {
    const a = analyzeMidi(makeMidi());
    expect(Math.round(a.bpm)).toBe(140);
    expect(a.beatsPerBar).toBe(4);
    expect(a.firstMusicBar).toBe(1); // bar 0 is the count-in
    expect(a.totalBars).toBe(3); // last note starts in bar index 2
    expect(a.pianoChannels).toEqual([1]);
  });
});

describe('setMidiTempo', () => {
  it('rewrites the tempo without touching the notes', () => {
    const slowed = setMidiTempo(makeMidi(), 90);
    expect(Math.round(analyzeMidi(slowed).bpm)).toBe(90);
    const notes = (buf: ArrayBuffer) =>
      parseMidi(new Uint8Array(buf)).tracks.flat().filter((e) => e.type === 'noteOn').length;
    expect(notes(slowed)).toBe(notes(makeMidi()));
  });
});
