import { parseMidi, writeMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { analyzeMidi, setMidiTempo, truncateMidiToBars } from '../midiFile';
import { JAZZ_KIT_ID, buildJazzKit } from '../jazzKit';

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

describe('truncateMidiToBars', () => {
  it('keeps the first bars and releases notes still sounding at the cut', () => {
    const cut = truncateMidiToBars(makeMidi(), 2);
    const parsed = parseMidi(new Uint8Array(cut));
    const piano = parsed.tracks.find((t) => t.some((e) => e.type === 'trackName' && e.text === 'Piano'))!;
    let tick = 0;
    const notes = piano.flatMap((e) => {
      tick += e.deltaTime;
      return e.type === 'noteOn' || e.type === 'noteOff' ? [{ type: e.type, tick }] : [];
    });
    // Piano starts bar 2 (tick 1920) and is released at the cut (bar 3 = 3840).
    expect(notes).toEqual([
      { type: 'noteOn', tick: 1920 },
      { type: 'noteOff', tick: 3840 },
    ]);
    // The bass, which starts after the cut, is gone; the file is 2 bars long.
    expect(analyzeMidi(cut).totalBars).toBe(2);
    expect(parsed.tracks.every((t) => t.at(-1)?.type === 'endOfTrack')).toBe(true);
  });
});

describe('buildJazzKit', () => {
  const zone = (low: number, high: number, tag: string) => ({ keyRangeLow: low, keyRangeHigh: high, tag });
  it('swaps only the ride zones and puts the new ride last (the player picks the last match)', () => {
    const base = { id: 'base', zones: [zone(35, 35, 'kick'), zone(51, 51, 'thin-ride'), zone(51, 51, 'thin-ride-2'), zone(42, 42, 'hat')] };
    const source = { id: 'src', zones: [zone(51, 51, 'dark-ride'), zone(0, 127, 'catch-all'), zone(35, 35, 'other-kick')] };
    const kit = buildJazzKit(base, source);
    expect(kit.id).toBe(JAZZ_KIT_ID);
    expect(kit.zones.map((z) => z.tag)).toEqual(['kick', 'hat', 'dark-ride']);
  });
});
