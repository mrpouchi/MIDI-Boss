import { parseMidi } from 'midi-file';
import type { TimingVerdict } from './playAlong';

/**
 * Melody engine: the tune of a song read from its MIDI file, laid out in song
 * time, and a scorer that judges the learner's notes against it. Pure, no
 * audio, no React. Song time is in milliseconds, 0 = start of the file.
 *
 * A note counts when its pitch is right in any octave (a beginner plays the
 * tune where the hand lies) and it is struck near its written start.
 */

export interface MelodyNote {
  index: number;
  /** MIDI note as written. */
  midi: number;
  startMs: number;
  durationMs: number;
}

/** Track names that carry the tune (compared without accents or case). */
const MELODY_TRACK_NAMES = new Set(['melodie', 'melody', 'lead', 'voice', 'vocal', 'vocals', 'chant', 'theme', 'tune']);

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .toLowerCase();

/** MIDI channel (0–15) of the melody track, or null when the file has none. */
export function findMelodyChannel(buffer: ArrayBuffer): number | null {
  const parsed = parseMidi(new Uint8Array(buffer));
  for (const track of parsed.tracks) {
    const name = track.find((e) => e.type === 'trackName');
    if (!name || !('text' in name) || !MELODY_TRACK_NAMES.has(plain(name.text))) continue;
    const note = track.find((e) => e.type === 'noteOn' && e.velocity > 0);
    if (note && 'channel' in note) return note.channel;
  }
  return null;
}

/**
 * The melody notes of `channel` whose start falls in [fromMs, toMs), at a
 * constant `bpm` (the band plays the file at one tempo). Notes struck together
 * keep only the highest one: the tune is the top line.
 */
export function extractMelody(buffer: ArrayBuffer, channel: number, opts: { bpm: number; fromMs: number; toMs: number }): MelodyNote[] {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;
  const msPerTick = 60_000 / opts.bpm / tpb;
  const byTick = new Map<number, { midi: number; durationTicks: number }>();
  for (const track of parsed.tracks) {
    let tick = 0;
    const open = new Map<number, number[]>();
    const starts: { tick: number; midi: number; end: number | null }[] = [];
    for (const e of track) {
      tick += e.deltaTime;
      if ((e.type !== 'noteOn' && e.type !== 'noteOff') || e.channel !== channel) continue;
      if (e.type === 'noteOn' && e.velocity > 0) {
        starts.push({ tick, midi: e.noteNumber, end: null });
        open.set(e.noteNumber, [...(open.get(e.noteNumber) ?? []), starts.length - 1]);
      } else {
        const i = open.get(e.noteNumber)?.shift();
        if (i !== undefined) starts[i].end = tick;
      }
    }
    for (const s of starts) {
      const durationTicks = Math.max(1, (s.end ?? s.tick + tpb / 2) - s.tick);
      const previous = byTick.get(s.tick);
      if (!previous || s.midi > previous.midi) byTick.set(s.tick, { midi: s.midi, durationTicks });
    }
  }
  return [...byTick.entries()]
    .map(([tick, n]) => ({ midi: n.midi, startMs: round3(tick * msPerTick), durationMs: round3(n.durationTicks * msPerTick) }))
    .filter((n) => n.startMs >= opts.fromMs - 0.5 && n.startMs < opts.toMs - 0.5)
    .sort((a, b) => a.startMs - b.startMs)
    .map((n, index) => ({ index, ...n }));
}

const round3 = (ms: number) => Math.round(ms * 1000) / 1000;

export interface MelodyScorerOptions {
  /** |offset| up to this counts as on time. */
  onTimeMs: number;
  /** A note can be struck this far from its start (either side) and still count. */
  windowMs: number;
}

/** Beginner defaults, a little tighter as the tempo rises. */
export function defaultMelodyOptions(bpm: number): MelodyScorerOptions {
  const beatMs = 60_000 / bpm;
  return { onTimeMs: Math.min(160, Math.max(110, beatMs * 0.25)), windowMs: Math.min(400, Math.max(260, beatMs * 0.6)) };
}

export interface MelodyResult {
  index: number;
  verdict: TimingVerdict;
  /** Strike time minus the note's start (negative = early); null if missed. */
  offsetMs: number | null;
}

/**
 * Live scorer. Feed every note-on (in song time) and call `advance(songMs)`
 * regularly; finished notes come back as results, exactly once each, in order.
 */
export class MelodyScorer {
  private hits: (number | null)[];
  private nextToClose = 0;
  /** Notes struck that belong to no melody note nearby. */
  wrongNotes = 0;
  readonly results: MelodyResult[] = [];

  constructor(
    private readonly notes: MelodyNote[],
    private readonly opts: MelodyScorerOptions,
  ) {
    this.hits = notes.map(() => null);
  }

  /** Returns the melody note this strike was counted for, or null (a wrong or stray note). */
  noteOn(midi: number, songMs: number): number | null {
    const pc = ((midi % 12) + 12) % 12;
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = this.nextToClose; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.startMs - this.opts.windowMs > songMs) break;
      if (this.hits[i] !== null || n.midi % 12 !== pc) continue;
      const distance = Math.abs(songMs - n.startMs);
      if (distance <= this.opts.windowMs && distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    if (best === null) {
      // Only a strike near the tune is a wrong note (not before it starts or after it ends).
      const first = this.notes[0];
      const last = this.notes.at(-1);
      if (first && last && songMs >= first.startMs - this.opts.windowMs && songMs <= last.startMs + last.durationMs) this.wrongNotes++;
      return null;
    }
    this.hits[best] = songMs;
    return best;
  }

  /** Closes every note whose window has ended by `songMs`; returns the new results. */
  advance(songMs: number): MelodyResult[] {
    const fresh: MelodyResult[] = [];
    while (this.nextToClose < this.notes.length && songMs > this.notes[this.nextToClose].startMs + this.opts.windowMs) {
      fresh.push(this.verdict(this.nextToClose));
      this.nextToClose++;
    }
    this.results.push(...fresh);
    return fresh;
  }

  private verdict(i: number): MelodyResult {
    const hit = this.hits[i];
    if (hit === null) return { index: i, verdict: 'missed', offsetMs: null };
    const offsetMs = Math.round(hit - this.notes[i].startMs);
    const verdict: TimingVerdict = Math.abs(offsetMs) <= this.opts.onTimeMs ? 'on-time' : offsetMs < 0 ? 'anticipated' : 'late';
    return { index: i, verdict, offsetMs };
  }
}

export interface MelodySummary {
  total: number;
  found: number;
  onTime: number;
  missed: number;
  wrongNotes: number;
  /** 0..1 */
  noteAccuracy: number;
  /** 0..1, among found notes */
  timingAccuracy: number;
  meanOffsetMs: number | null;
}

export function summarizeMelody(results: MelodyResult[], wrongNotes: number): MelodySummary {
  const found = results.filter((r) => r.verdict !== 'missed');
  const onTime = found.filter((r) => r.verdict === 'on-time');
  const offsets = found.map((r) => r.offsetMs as number);
  return {
    total: results.length,
    found: found.length,
    onTime: onTime.length,
    missed: results.length - found.length,
    wrongNotes,
    noteAccuracy: results.length ? found.length / results.length : 0,
    timingAccuracy: found.length ? onTime.length / found.length : 0,
    meanOffsetMs: offsets.length ? Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length) : null,
  };
}
