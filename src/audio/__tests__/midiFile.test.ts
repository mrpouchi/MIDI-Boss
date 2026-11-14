import { parseMidi, writeMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { analyzeMidi, prepareDrumMapping, setMidiTempo, truncateMidiToBars } from '../midiFile';
import { JAZZ_KIT_ID, RIDE_VOICE_KEYS, buildJazzKit } from '../jazzKit';

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
  const zone = (low: number, high: number, tag: string, originalPitch = low * 100) => ({ keyRangeLow: low, keyRangeHigh: high, tag, originalPitch });
  it('puts the dark ride on every ride voice key, last, at its original pitch', () => {
    const base = { id: 'base', zones: [zone(35, 35, 'kick'), zone(51, 51, 'thin-ride'), zone(59, 59, 'thin-ride-2'), zone(42, 42, 'hat')] };
    const source = { id: 'src', zones: [zone(51, 51, 'dark-ride', 5110), zone(0, 127, 'catch-all'), zone(35, 35, 'other-kick')] };
    const kit = buildJazzKit(base, source);
    expect(kit.id).toBe(JAZZ_KIT_ID);
    expect(kit.zones.map((z) => z.tag)).toEqual(['kick', 'hat', 'dark-ride', 'dark-ride', 'dark-ride']);
    expect(kit.zones.slice(2).map((z) => [z.keyRangeLow, z.originalPitch])).toEqual(
      RIDE_VOICE_KEYS.map((k) => [k, k * 100 + 10]),
    );
  });
});

describe('prepareDrumMapping', () => {
  function irealLike(): ArrayBuffer {
    const named = (text: string) => ({ deltaTime: 0, meta: true as const, type: 'trackName' as const, text });
    const end = { deltaTime: 0, meta: true as const, type: 'endOfTrack' as const };
    const hit = (delta: number, note: number) => [
      { deltaTime: delta, type: 'noteOn' as const, channel: 9, noteNumber: note, velocity: 80 },
      { deltaTime: 90, type: 'noteOff' as const, channel: 9, noteNumber: note, velocity: 0 },
    ];
    return new Uint8Array(
      writeMidi({
        header: { format: 1, numTracks: 3, ticksPerBeat: 480 },
        tracks: [
          [named('Piano'), { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 80 }, { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 }, end],
          [named('Harmony'), end],
          [named('Drums'), ...hit(0, 71), ...hit(390, 71), ...hit(390, 71), ...hit(390, 71), ...hit(390, 44), end],
        ],
      }),
    ).buffer;
  }

  it('maps iReal drums to GM, drops drum releases and rotates ride hits, keeping timing', () => {
    const { iReal, buffer } = prepareDrumMapping(irealLike(), true);
    expect(iReal).toBe(true);
    const drums = parseMidi(new Uint8Array(buffer)).tracks[2];
    let tick = 0;
    const notes = drums.flatMap((e) => {
      tick += e.deltaTime;
      return e.type === 'noteOn' || e.type === 'noteOff' ? [[e.type, e.noteNumber, tick]] : [];
    });
    expect(notes).toEqual([
      ['noteOn', 51, 0],
      ['noteOn', 59, 480],
      ['noteOn', 90, 960],
      ['noteOn', 51, 1440],
      ['noteOn', 44, 1920],
    ]);
    // Pitched parts are untouched.
    expect(parseMidi(new Uint8Array(buffer)).tracks[0].filter((e) => e.type === 'noteOff')).toHaveLength(1);
  });
});
