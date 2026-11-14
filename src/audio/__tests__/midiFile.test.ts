import { parseMidi, writeMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { alignFormStart, alignedChoruses, analyzeMidi, anchorStart, normalizePickup, prepareDrumMapping, prependCountIn, setMidiTempo, truncateMidiToBars } from '../midiFile';
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
          [named('Harmony'), { deltaTime: 0, type: 'programChange', channel: 2, programNumber: 14 }, { deltaTime: 0, type: 'noteOn', channel: 2, noteNumber: 65, velocity: 80 }, { deltaTime: 1920, type: 'noteOff', channel: 2, noteNumber: 65, velocity: 0 }, end],
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

  it('replaces the tubular bells iReal puts on Harmony, and mutes Harmony with the piano guide', () => {
    const { buffer } = prepareDrumMapping(irealLike(), true);
    const programs = parseMidi(new Uint8Array(buffer)).tracks[1].filter((e) => e.type === 'programChange');
    expect(programs.map((e) => (e.type === 'programChange' ? e.programNumber : -1))).toEqual([4]);
    expect(analyzeMidi(irealLike()).pianoChannels.sort()).toEqual([1, 3]);
  });
});

describe('alignFormStart', () => {
  // A 2-bar intro on F, then a form F | Db | D | F (one bar each), MuseScore-style names.
  function arrangement(): ArrayBuffer {
    const bar = 1920;
    const bassBar = (root: number) => [
      { deltaTime: 0, type: 'noteOn' as const, channel: 1, noteNumber: root, velocity: 80 },
      { deltaTime: bar / 2, type: 'noteOff' as const, channel: 1, noteNumber: root, velocity: 0 },
      { deltaTime: 0, type: 'noteOn' as const, channel: 1, noteNumber: root + 7, velocity: 80 },
      { deltaTime: bar / 2, type: 'noteOff' as const, channel: 1, noteNumber: root + 7, velocity: 0 },
    ];
    return new Uint8Array(
      writeMidi({
        header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
        tracks: [
          [
            { deltaTime: 0, meta: true, type: 'trackName', text: 'Piano\u0000' },
            { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 72, velocity: 80 },
            { deltaTime: bar * 6, type: 'noteOff', channel: 0, noteNumber: 72, velocity: 0 },
            { deltaTime: 0, meta: true, type: 'endOfTrack' },
          ],
          [
            { deltaTime: 0, meta: true, type: 'trackName', text: 'Contrebasse\u0000' },
            ...[41, 41, 41, 37, 38, 41].flatMap(bassBar),
            { deltaTime: 0, meta: true, type: 'endOfTrack' },
          ],
        ],
      }),
    ).buffer;
  }

  it('skips the intro by matching the bass with the chart roots', () => {
    expect(alignFormStart(arrangement(), [5, 1, 2, 5])).toBe(2);
  });

  it('returns null when the bass does not follow the chart', () => {
    expect(alignFormStart(arrangement(), [0, 7, 9, 4])).toBeNull();
  });

  it('reads track names ending with a NUL byte', () => {
    const a = analyzeMidi(arrangement());
    expect(a.pianoChannels).toEqual([1]);
    expect(a.iReal).toBe(false);
  });
});

describe('alignedChoruses and unnamed pianos', () => {
  function song(): ArrayBuffer {
    const bar = 1920;
    const bassBar = (root: number) => [
      { deltaTime: 0, type: 'noteOn' as const, channel: 1, noteNumber: root, velocity: 80 },
      { deltaTime: bar, type: 'noteOff' as const, channel: 1, noteNumber: root, velocity: 0 },
    ];
    // Form D D Eb D, played twice, then a chorus that drifted (melody on the downbeats).
    const roots = [38, 38, 39, 38, 38, 38, 39, 38, 45, 39, 34, 45];
    return new Uint8Array(
      writeMidi({
        header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
        tracks: [
          [
            { deltaTime: 0, type: 'programChange', channel: 8, programNumber: 0 },
            { deltaTime: 0, type: 'noteOn', channel: 8, noteNumber: 62, velocity: 80 },
            { deltaTime: bar * 12, type: 'noteOff', channel: 8, noteNumber: 62, velocity: 0 },
            { deltaTime: 0, meta: true, type: 'endOfTrack' },
          ],
          [...roots.flatMap(bassBar), { deltaTime: 0, meta: true, type: 'endOfTrack' }],
        ],
      }),
    ).buffer;
  }

  it('counts only the passes the bass follows', () => {
    expect(alignedChoruses(song(), [2, 2, 3, 2], 0)).toBe(2);
  });

  it('recognises an unnamed piano by its program', () => {
    expect(analyzeMidi(song()).pianoChannels).toEqual([9]);
  });
});

describe('prependCountIn', () => {
  it('adds one bar of clicks and moves the music, not the tempo', () => {
    const out = prependCountIn(makeMidi(), 1);
    const a = analyzeMidi(out);
    expect(Math.round(a.bpm)).toBe(140);
    expect(a.firstMusicBar).toBe(2); // was 1, now one bar later
    const parsed = parseMidi(new Uint8Array(out));
    const click = parsed.tracks.at(-1)!;
    expect(click.filter((e) => e.type === 'noteOn')).toHaveLength(4);
    expect(parsed.tracks[0].find((e) => e.type === 'setTempo')?.deltaTime).toBe(0);
  });
});

describe('normalizePickup', () => {
  it('turns a one-beat pickup into the last beat of a full first bar', () => {
    const data = writeMidi({
      header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[
        { deltaTime: 0, meta: true, type: 'timeSignature', numerator: 1, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: 'programChange', channel: 4, programNumber: 32 },
        { deltaTime: 0, type: 'noteOn', channel: 4, noteNumber: 41, velocity: 80 }, // pickup note
        { deltaTime: 480, meta: true, type: 'timeSignature', numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, type: 'noteOff', channel: 4, noteNumber: 41, velocity: 0 },
        { deltaTime: 0, type: 'noteOn', channel: 4, noteNumber: 41, velocity: 80 }, // downbeat of bar 1
        { deltaTime: 480, type: 'noteOff', channel: 4, noteNumber: 41, velocity: 0 },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ]],
    });
    const out = normalizePickup(new Uint8Array(data).buffer);
    let tick = 0;
    const ons = parseMidi(new Uint8Array(out)).tracks[0].flatMap((e) => {
      tick += e.deltaTime;
      return e.type === 'noteOn' ? [tick] : [];
    });
    expect(ons).toEqual([1440, 1920]); // beat 4 of bar 0, then the downbeat of bar 1
    expect(analyzeMidi(out).beatsPerBar).toBe(4);
  });

  it('leaves a file without pickup untouched', () => {
    const buf = makeMidi();
    expect(normalizePickup(buf)).toBe(buf);
  });
});

describe('anchorStart', () => {
  it('keeps the start of a file that opens on silence', () => {
    const late = new Uint8Array(
      writeMidi({
        header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
        tracks: [[
          { deltaTime: 1680, type: 'noteOn', channel: 4, noteNumber: 41, velocity: 80 },
          { deltaTime: 240, type: 'noteOff', channel: 4, noteNumber: 41, velocity: 0 },
          { deltaTime: 0, meta: true, type: 'endOfTrack' },
        ]],
      }),
    ).buffer;
    const anchor = parseMidi(new Uint8Array(anchorStart(late))).tracks.at(-1)!;
    const hit = anchor.find((e) => e.type === 'noteOn');
    expect(hit).toMatchObject({ deltaTime: 0, channel: 9, velocity: 1 });
  });

  it('leaves a file that already starts with a note untouched', () => {
    const buf = makeMidi(); // its click sounds at tick 0
    expect(anchorStart(buf)).toBe(buf);
  });
});

describe('removeClickTracks', () => {
  it('drops the count-in added by prependCountIn and keeps the drums on the same channel', async () => {
    const { parseMidi, writeMidi } = await import('midi-file');
    const { prependCountIn, removeClickTracks, describeTracks } = await import('../midiFile');
    const drums = [
      { deltaTime: 0, meta: true, type: 'trackName', text: 'Drums' },
      { deltaTime: 0, type: 'noteOn', channel: 9, noteNumber: 35, velocity: 90 },
      { deltaTime: 480, type: 'noteOff', channel: 9, noteNumber: 35, velocity: 0 },
      { deltaTime: 0, meta: true, type: 'endOfTrack' },
    ];
    const file = new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: 480 }, tracks: [drums] } as never)).buffer;
    const withCount = prependCountIn(file, 1);
    expect(describeTracks(withCount).map((t) => t.name)).toContain('Click');
    const cleaned = removeClickTracks(withCount);
    expect(describeTracks(cleaned).map((t) => [t.name, t.channel])).toEqual([['Drums', 10]]);
    const kick = parseMidi(new Uint8Array(cleaned)).tracks[0].find((e) => e.type === 'noteOn');
    expect(kick).toMatchObject({ noteNumber: 35, deltaTime: 4 * 480 });
  });
});
