import { parseMidi, writeMidi } from 'midi-file';
import { RIDE_VOICE_KEYS } from './jazzKit';

/**
 * Pure MIDI-file helpers shared by the MIDI player and the play-along mode.
 */

export interface MidiTrack {
  channel: number;
  name: string;
}

export type ParsedMidi = ReturnType<typeof parseMidi>;

// iReal Pro n'exporte pas les percussions en General MIDI : son SoundFont
// `percussive.sf2` embarque un mapping maison (71 = ride flat, 72 = ride flat
// edge, 92–100 = shakers et autres cymbales…). En GM, 71 et 72 sont des
// sifflets, d'où le ride qui siffle. On ne convertit que le canal 10.
export const IREAL_DRUM_TO_GM: Record<number, number> = {
  0: 80, 1: 80, 2: 80, 3: 81, 4: 81, // triangles
  6: 42, 7: 46, 8: 42, 9: 42, 10: 46, 11: 46, // hi-hats iReal
  12: 68, 13: 68, 14: 67, // agogos
  15: 56, 16: 56, // cowbells
  17: 54, 18: 54, // tamborim -> tambourine
  19: 49, 20: 51, // balais sur crash / ride
  21: 38, 22: 38, 23: 38, 24: 38, 25: 38, // balais caisse claire
  26: 38, 27: 38, 28: 38, 29: 38, 30: 38,
  31: 35, 32: 35, 33: 35, 34: 35, 35: 35, // grosses caisses jazz
  36: 36, 37: 37, 38: 38, 39: 38, 40: 40, 41: 38,
  42: 42, 43: 43, 44: 44, 45: 45, 46: 46, 47: 47, 48: 48, 49: 49, 50: 38,
  51: 51, 52: 40, 53: 53, 54: 54, 55: 56, 56: 56, 57: 57, 58: 55, 59: 59,
  60: 51, 61: 63, 62: 62, 63: 63, 64: 64, 65: 65, 66: 66, 67: 67, 68: 68, 69: 65,
  70: 70, 71: 51, 72: 51, // ride flat / edge -> ride GM
  73: 73, 74: 74, 75: 75, 76: 76, 77: 77,
  80: 80, 81: 81, 82: 70,
  92: 70, 93: 70, 94: 70, 95: 70, // shakers -> maracas
  96: 51, 97: 53, 98: 51, 99: 51, 100: 51, // cymbales ride iReal
  101: 37, 102: 37, // rim clicks
  103: 61, // bongo low -> low bongo GM
  104: 70, 105: 70, // maracas salsa -> maracas GM
  106: 65, 107: 65, 108: 65, 109: 65, 110: 65, // timbales high
  111: 65, 112: 65, 113: 65, 114: 65, 115: 65, // timbales medium
  116: 66, 117: 66, 118: 66, 119: 66, 120: 66, // timbales low
  123: 70, 124: 70, // shekeres -> maracas
};

export function trackLabel(track: ParsedMidi['tracks'][number]) {
  const name = track.find((event) => event.type === 'trackName');
  // MuseScore exports end names with a NUL byte ("Piano\u0000").
  // eslint-disable-next-line no-control-regex
  return name && 'text' in name ? name.text.replace(/[\u0000-\u001f]/g, '').trim().toLowerCase() : '';
}

export function looksLikeIRealExport(parsed: ParsedMidi) {
  const names = new Set(parsed.tracks.map(trackLabel).filter(Boolean));
  const hasDrumNotes = parsed.tracks.some((track) =>
    track.some(
      (event) => event.type === 'noteOn' && event.channel === 9 && event.velocity > 0,
    ),
  );
  // Un export iReal contient toujours les pistes Piano, Harmony et Drums.
  return hasDrumNotes && ['piano', 'harmony', 'drums'].every((name) => names.has(name));
}

/**
 * Fixes an iReal Pro export for a General MIDI player:
 * 1. drum keys converted from iReal's private map to General MIDI;
 * 2. drum note-offs removed: drums are one-shot. iReal releases every hit
 *    after ~0.1 s (sometimes 0 ticks), and this player stops the sample at
 *    note-off, which chokes the ride into a hi-hat and silences some snares;
 * 3. ride hits rotated over RIDE_VOICE_KEYS so the cymbal keeps ringing;
 * 4. programs that GM renders badly replaced (IREAL_PROGRAM_TO_GM).
 */
export function prepareDrumMapping(buffer: ArrayBuffer, remap: boolean) {
  const parsed = parseMidi(new Uint8Array(buffer));
  const iReal = looksLikeIRealExport(parsed);
  if (!iReal || !remap) return { iReal, buffer };

  let rideHit = 0;
  parsed.tracks = parsed.tracks.map((track) => {
    let tick = 0;
    let previous = 0;
    const out: typeof track = [];
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'programChange' && event.channel !== 9 && event.programNumber in IREAL_PROGRAM_TO_GM) {
        event.programNumber = IREAL_PROGRAM_TO_GM[event.programNumber];
      }
      if ((event.type === 'noteOn' || event.type === 'noteOff') && event.channel === 9) {
        const isHit = event.type === 'noteOn' && event.velocity > 0;
        if (!isHit) continue; // one-shot drums: drop the release
        let key = IREAL_DRUM_TO_GM[event.noteNumber] ?? event.noteNumber;
        if (key === RIDE_VOICE_KEYS[0]) {
          key = RIDE_VOICE_KEYS[rideHit % RIDE_VOICE_KEYS.length];
          rideHit += 1;
        }
        event.noteNumber = key;
      }
      out.push({ ...event, deltaTime: tick - previous });
      previous = tick;
    }
    return out;
  });
  return { iReal, buffer: new Uint8Array(writeMidi(parsed)).buffer };
}

export function describeTracks(buffer: ArrayBuffer): MidiTrack[] {
  const parsed = parseMidi(new Uint8Array(buffer));
  return parsed.tracks.flatMap((track) => {
    const name = track.find((event) => event.type === 'trackName');
    const channelEvent = track.find(
      (event) => event.type === 'noteOn' || event.type === 'programChange',
    );
    if (!channelEvent || !('channel' in channelEvent)) return [];
    // midi-file expose des canaux 0–15, midi-audio-player attend des canaux 1–16.
    const channel = channelEvent.channel + 1;
    // eslint-disable-next-line no-control-regex
    const label = name && 'text' in name ? name.text.replace(/[\u0000-\u001f]/g, '').trim() : '';
    return [{ channel, name: label || `Canal ${channel}` }];
  });
}

export function midiSetupKey(fileName: string, buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return `${fileName}:${bytes.length}:${(hash >>> 0).toString(36)}`;
}

// Sans preset explicite, le canal 10 tombe sur 1280_AirFont380 (banque « midis
// cm-64 ») dont le mapping n'est pas General MIDI (ride -> sifflet). On utilise
// un kit maison : le kit Jazz de FluidR3 avec un vrai ride (voir jazzKit.ts) ;
// le lecteur doit être préparé avec installJazzKit().
export { JAZZ_KIT_ID as DRUM_KIT_PRESET } from './jazzKit';
export const DRUM_CHANNEL = 10;


/** Rewrites every tempo event so the file plays at `bpm` (the backing track can be slowed down). */
export function setMidiTempo(buffer: ArrayBuffer, bpm: number): ArrayBuffer {
  const parsed = parseMidi(new Uint8Array(buffer));
  const microsecondsPerBeat = Math.round(60_000_000 / bpm);
  let found = false;
  for (const track of parsed.tracks) {
    for (const event of track) {
      if (event.type === 'setTempo') {
        event.microsecondsPerBeat = microsecondsPerBeat;
        found = true;
      }
    }
  }
  if (!found) {
    parsed.tracks[0].unshift({ deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat });
  }
  return new Uint8Array(writeMidi(parsed)).buffer;
}

export interface MidiAnalysis {
  /** Tempo of the file (first tempo event; 120 if none). */
  bpm: number;
  beatsPerBar: number;
  /** Bars from the start of the file to its last note. */
  totalBars: number;
  /** 0-based bar where the first pitched (non-drum, non-click) note sounds. */
  firstMusicBar: number;
  /**
   * Channels (1–16) of the chord parts, tracks named "Piano" or "Harmony":
   * muted when the learner plays (they are the guide).
   */
  pianoChannels: number[];
  /** iReal Pro export (click count-in, Piano/Harmony/Drums tracks). */
  iReal: boolean;
}

/** iReal tracks that play the chords: the learner's part. Harmony is empty in jazz styles, used in funk/rock ones. */
const CHORD_TRACKS = new Set(['piano', 'harmony']);

/**
 * iReal program numbers that sound wrong on a General MIDI bank. Funk styles
 * (Cantaloupe Island) put whole-bar chords on Harmony with program 14, which
 * GM renders as tubular bells: a metallic clang on every bar. Replaced by an
 * electric piano, the closest plausible comping sound.
 */
export const IREAL_PROGRAM_TO_GM: Record<number, number> = { 14: 4 };

export function analyzeMidi(buffer: ArrayBuffer): MidiAnalysis {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;
  let bpm = 120;
  let beatsPerBar = 4;
  let lastTick = 0;
  let firstMusicTick = Number.POSITIVE_INFINITY;
  const pianoChannels = new Set<number>();
  // Unnamed tracks (some MuseScore exports): a piano program (GM 0–7) marks the pianist's part.
  const pianoPrograms = new Set<number>();
  for (const track of parsed.tracks) {
    for (const event of track) {
      if (event.type === 'programChange' && event.channel !== 9 && event.programNumber <= 7) pianoPrograms.add(event.channel);
    }
  }
  for (const track of parsed.tracks) {
    const label = trackLabel(track);
    let tick = 0;
    let tempoSeen = false;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'setTempo' && !tempoSeen) {
        bpm = 60_000_000 / event.microsecondsPerBeat;
        tempoSeen = true;
      }
      if (event.type === 'timeSignature') beatsPerBar = event.numerator;
      if (event.type === 'noteOn' && event.velocity > 0) {
        lastTick = Math.max(lastTick, tick);
        if (CHORD_TRACKS.has(label) || pianoPrograms.has(event.channel)) pianoChannels.add(event.channel + 1);
        if (event.channel !== 9 && label !== 'click') firstMusicTick = Math.min(firstMusicTick, tick);
      }
    }
  }
  const ticksPerBar = tpb * beatsPerBar;
  return {
    bpm: Math.round(bpm * 100) / 100,
    beatsPerBar,
    totalBars: Math.floor(lastTick / ticksPerBar) + 1,
    firstMusicBar: Number.isFinite(firstMusicTick) ? Math.floor(firstMusicTick / ticksPerBar) : 0,
    pianoChannels: [...pianoChannels],
    iReal: looksLikeIRealExport(parsed),
  };
}

/**
 * Keeps only the first `bars` bars of the file (count-in included): later
 * events are dropped and notes still sounding are released at the cut, so the
 * band plays e.g. a single chorus instead of the whole export.
 */
export function truncateMidiToBars(buffer: ArrayBuffer, bars: number): ArrayBuffer {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;
  const beatsPerBar = analyzeMidi(buffer).beatsPerBar;
  const limit = Math.round(bars * beatsPerBar * tpb);
  parsed.tracks = parsed.tracks.map((track) => {
    const kept: { tick: number; event: (typeof track)[number] }[] = [];
    const sounding = new Map<string, { channel: number; noteNumber: number }>();
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'endOfTrack') continue;
      const isNote = event.type === 'noteOn' || event.type === 'noteOff';
      if (tick >= limit && !(isNote && event.type === 'noteOff' && tick === limit)) continue;
      if (event.type === 'noteOn' && event.velocity > 0) {
        sounding.set(`${event.channel}:${event.noteNumber}`, { channel: event.channel, noteNumber: event.noteNumber });
      } else if (isNote) {
        sounding.delete(`${event.channel}:${event.noteNumber}`);
      }
      kept.push({ tick, event });
    }
    for (const { channel, noteNumber } of sounding.values()) {
      kept.push({ tick: limit, event: { deltaTime: 0, type: 'noteOff', channel, noteNumber, velocity: 0 } });
    }
    kept.push({ tick: limit, event: { deltaTime: 0, meta: true, type: 'endOfTrack' } });
    let previous = 0;
    return kept.map(({ tick: t, event }) => {
      const out = { ...event, deltaTime: t - previous };
      previous = t;
      return out;
    });
  });
  return new Uint8Array(writeMidi(parsed)).buffer;
}

/**
 * Pitch class of the bass at each bar's downbeat (null when silent), taken
 * from the lowest-sounding pitched track (the bass part of an arrangement).
 */
export function bassRootsPerBar(buffer: ArrayBuffer): (number | null)[] {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;
  const { beatsPerBar, totalBars } = analyzeMidi(buffer);
  const ticksPerBar = tpb * beatsPerBar;
  let best: { mean: number; notes: { tick: number; note: number }[] } | null = null;
  for (const track of parsed.tracks) {
    if (trackLabel(track) === 'click') continue;
    let tick = 0;
    const notes: { tick: number; note: number }[] = [];
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'noteOn' && event.velocity > 0 && event.channel !== 9) notes.push({ tick, note: event.noteNumber });
    }
    if (notes.length < 8) continue;
    const mean = notes.reduce((sum, n) => sum + n.note, 0) / notes.length;
    if (!best || mean < best.mean) best = { mean, notes };
  }
  const roots: (number | null)[] = Array.from({ length: totalBars }, () => null);
  for (const n of best?.notes ?? []) {
    const bar = Math.floor(n.tick / ticksPerBar);
    // First note within the first beat of the bar (a little early counts too).
    const into = n.tick - bar * ticksPerBar;
    if (into < tpb && roots[bar] === null) roots[bar] = n.note % 12;
  }
  return roots;
}

/** Minimum share of bars where the bass plays the chart root for a pass to count. */
export const CHORUS_MATCH = 0.8;

/**
 * For files that are not iReal exports (no click count-in): the bar where the
 * chart's form starts, found by matching the bass against the chart roots.
 * An intro is skipped this way. The start that gives the most usable passes
 * wins (an arrangement may vary the end of its first chorus), then the best
 * match. Null when nothing matches well enough.
 */
export function alignFormStart(buffer: ArrayBuffer, formRoots: number[], minScore = 0.6): number | null {
  const roots = bassRootsPerBar(buffer);
  if (!formRoots.length || roots.length < formRoots.length) return null;
  const scoreAt = (offset: number) => formRoots.filter((root, i) => roots[offset + i] === root).length / formRoots.length;
  let best: { offset: number; passes: number; score: number } | null = null;
  for (let offset = 0; offset + formRoots.length <= roots.length; offset++) {
    const score = scoreAt(offset);
    if (score < minScore - 1e-9) continue;
    let passes = 0;
    for (let o = offset; o + formRoots.length <= roots.length && scoreAt(o) >= CHORUS_MATCH - 1e-9; o += formRoots.length) passes++;
    if (!best || passes > best.passes || (passes === best.passes && score > best.score + 1e-9)) best = { offset, passes, score };
  }
  return best?.offset ?? null;
}

/**
 * How many consecutive passes of the form, from `start`, the bass really
 * follows. Stricter than alignFormStart: a pass is kept only if at most ~20 %
 * of its bars differ (a walk-up on a downbeat, a varied turnaround).
 * Arrangements of recordings can stretch a chorus or solo on another form
 * (Song For My Father solos replace the B section by an A, 79 %); those passes
 * would show the wrong chords.
 */
export function alignedChoruses(buffer: ArrayBuffer, formRoots: number[], start: number, minScore = CHORUS_MATCH): number {
  const roots = bassRootsPerBar(buffer);
  let count = 0;
  for (let offset = start; offset + formRoots.length <= roots.length; offset += formRoots.length) {
    const hits = formRoots.filter((root, i) => roots[offset + i] === root).length;
    if (hits / formRoots.length < minScore - 1e-9) break;
    count++;
  }
  return count;
}

/**
 * Adds `bars` bars of count-in (side-stick clicks, accent on beat 1) before the
 * music, for files that start straight away. Notes move later; tempo, meter
 * and program changes stay at the start.
 */
export function prependCountIn(buffer: ArrayBuffer, bars = 1): ArrayBuffer {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;
  const { beatsPerBar } = analyzeMidi(buffer);
  const shift = bars * beatsPerBar * tpb;
  parsed.tracks = parsed.tracks.map((track) => {
    let tick = 0;
    const timed = track.map((event) => {
      tick += event.deltaTime;
      const moves = event.type === 'noteOn' || event.type === 'noteOff' || event.type === 'endOfTrack';
      return { event, at: moves ? tick + shift : tick };
    });
    timed.sort((a, b) => a.at - b.at);
    let previous = 0;
    return timed.map(({ event, at }) => {
      const out = { ...event, deltaTime: at - previous };
      previous = at;
      return out;
    });
  });
  const click: (typeof parsed.tracks)[number] = [{ deltaTime: 0, meta: true, type: 'trackName', text: 'Click' }];
  for (let beat = 0; beat < bars * beatsPerBar; beat++) {
    click.push({ deltaTime: beat === 0 ? 0 : tpb - 60, type: 'noteOn', channel: 9, noteNumber: 37, velocity: beat % beatsPerBar === 0 ? 110 : 80 });
    click.push({ deltaTime: 60, type: 'noteOff', channel: 9, noteNumber: 37, velocity: 0 });
  }
  click.push({ deltaTime: 0, meta: true, type: 'endOfTrack' });
  parsed.tracks.push(click);
  parsed.header.numTracks = parsed.tracks.length;
  return new Uint8Array(writeMidi(parsed)).buffer;
}

/**
 * Every pitched note `semitones` higher (negative = lower); drums (channel 10)
 * stay put. Notes are kept inside the MIDI range.
 */
export function transposeMidi(buffer: ArrayBuffer, semitones: number): ArrayBuffer {
  if (semitones === 0) return buffer;
  const parsed = parseMidi(new Uint8Array(buffer));
  for (const track of parsed.tracks) {
    for (const event of track) {
      if ((event.type === 'noteOn' || event.type === 'noteOff') && event.channel !== 9) {
        event.noteNumber = Math.max(0, Math.min(127, event.noteNumber + semitones));
      }
    }
  }
  return new Uint8Array(writeMidi(parsed)).buffer;
}

/** Track names that hold a count-in (iReal's, or the one prependCountIn adds). */
export const isClickTrackName = (name: string) => name.trim().toLowerCase() === 'click';

/**
 * Drops the count-in tracks ("Click"). Needed when the app plays its own
 * metronome: a click track often shares the drum channel, so it can't be
 * silenced by channel volume without silencing the drums too.
 */
export function removeClickTracks(buffer: ArrayBuffer): ArrayBuffer {
  const parsed = parseMidi(new Uint8Array(buffer));
  const kept = parsed.tracks.filter(
    (track) => !track.some((e) => e.type === 'trackName' && isClickTrackName((e as { text: string }).text)),
  );
  if (kept.length === parsed.tracks.length) return buffer;
  parsed.tracks = kept;
  parsed.header.numTracks = kept.length;
  return new Uint8Array(writeMidi(parsed)).buffer;
}

/**
 * A file that opens with a pickup bar (e.g. one beat of 1/4 before the 4/4)
 * is padded with silence so the pickup becomes the end of a full bar: every
 * bar computation (count-in, alignment, truncation) then lands on the barline.
 * Files without a pickup are returned unchanged.
 */
export function normalizePickup(buffer: ArrayBuffer): ArrayBuffer {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;
  const signatures: { tick: number; numerator: number; denominator: number }[] = [];
  for (const track of parsed.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'timeSignature') signatures.push({ tick, numerator: event.numerator, denominator: event.denominator });
    }
  }
  signatures.sort((a, b) => a.tick - b.tick);
  const [pickup, main] = signatures;
  if (!pickup || !main || pickup.tick !== 0) return buffer;
  const pickupTicks = (pickup.numerator * tpb * 4) / pickup.denominator;
  const barTicks = (main.numerator * tpb * 4) / main.denominator;
  if (main.tick !== pickupTicks || pickupTicks >= barTicks) return buffer;
  const pad = barTicks - pickupTicks;

  parsed.tracks = parsed.tracks.map((track) => {
    let tick = 0;
    const timed = track.flatMap((event) => {
      tick += event.deltaTime;
      if (event.type === 'timeSignature' && tick === 0) return []; // the pickup signature
      // Set-up events at the very start stay there (tempo, names, programs).
      const stays = tick === 0 && event.type !== 'noteOn' && event.type !== 'noteOff';
      return [{ event, at: stays ? 0 : tick + pad }];
    });
    let previous = 0;
    return timed.map(({ event, at }) => {
      const out = { ...event, deltaTime: at - previous };
      previous = at;
      return out;
    });
  });
  return new Uint8Array(writeMidi(parsed)).buffer;
}

/**
 * midi-audio-player trims the silence before the first note, which would
 * shift the whole song earlier than the chart (Song For My Father after its
 * pickup was padded: ~1.7 s early). An inaudible hit (velocity 1, hi-hat) at
 * tick 0 keeps the file's own start as the player's start.
 */
export function anchorStart(buffer: ArrayBuffer): ArrayBuffer {
  const parsed = parseMidi(new Uint8Array(buffer));
  let first = Number.POSITIVE_INFINITY;
  for (const track of parsed.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'noteOn' && event.velocity > 0) {
        first = Math.min(first, tick);
        break;
      }
    }
  }
  if (first === 0 || !Number.isFinite(first)) return buffer;
  parsed.tracks.push([
    { deltaTime: 0, meta: true, type: 'trackName', text: 'Anchor' },
    { deltaTime: 0, type: 'noteOn', channel: 9, noteNumber: 42, velocity: 1 },
    { deltaTime: 1, type: 'noteOff', channel: 9, noteNumber: 42, velocity: 0 },
    { deltaTime: 0, meta: true, type: 'endOfTrack' },
  ]);
  parsed.header.numTracks = parsed.tracks.length;
  return new Uint8Array(writeMidi(parsed)).buffer;
}
