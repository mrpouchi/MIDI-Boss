import { ChartChord, ChordChart } from '../music/chart';
import { VoicingStep, getTargetPitchClassesForStep } from '../music/chords';

/**
 * Play-along engine: a chord chart laid out in time, and a scorer that judges
 * timestamped note events against it. Pure — no audio, no React — so every
 * timing rule is unit-tested. All times are "song time" in milliseconds,
 * 0 = the very start of the backing file (count-in included).
 */

export interface TimelineChord {
  index: number;
  /** 0-based chorus (pass through the form). */
  chorus: number;
  /** 0-based bar inside the form. */
  formBar: number;
  item: ChartChord;
  /**
   * The same chord as the previous target, played again on a new bar ("%" or
   * rewritten): the learner must strike it again, all notes, on the downbeat.
   */
  repeat: boolean;
  startMs: number;
  endMs: number;
}

export interface Timeline {
  bpm: number;
  beatsPerBar: number;
  countInBars: number;
  formBars: number;
  choruses: number;
  beatMs: number;
  barMs: number;
  /** Song time where the form starts (after the count-in). */
  formStartMs: number;
  endMs: number;
  chords: TimelineChord[];
}

export function buildTimeline(
  chart: ChordChart,
  opts: { bpm: number; countInBars: number; choruses: number },
): Timeline {
  const beatMs = 60_000 / opts.bpm;
  const barMs = beatMs * chart.beatsPerBar;
  const formBars = chart.bars.length;
  const formStartMs = opts.countInBars * barMs;
  const chords: TimelineChord[] = [];
  // Every bar is played: a bar without a written change ("%") asks to strike
  // the current chord again on beat 1. Timing is judged on each of these attacks.
  let previous: ChartChord | null = null;
  for (let chorus = 0; chorus < opts.choruses; chorus += 1) {
    chart.bars.forEach((bar, formBar) => {
      const barStart = formStartMs + (chorus * formBars + formBar) * barMs;
      const items: ChartChord[] = bar.length > 0 ? bar : previous ? [{ ...previous, beat: 1 }] : [];
      for (const item of items) {
        const repeat = previous !== null && previous.chord.id === item.chord.id;
        chords.push({
          index: chords.length,
          chorus,
          formBar,
          item,
          repeat,
          startMs: barStart + (item.beat - 1) * beatMs,
          endMs: 0,
        });
        previous = item;
      }
    });
  }
  const endMs = formStartMs + opts.choruses * formBars * barMs;
  chords.forEach((c, i) => {
    c.endMs = chords[i + 1]?.startMs ?? endMs;
  });
  return {
    bpm: opts.bpm,
    beatsPerBar: chart.beatsPerBar,
    countInBars: opts.countInBars,
    formBars,
    choruses: opts.choruses,
    beatMs,
    barMs,
    formStartMs,
    endMs,
    chords,
  };
}

/** Index of the chord sounding at `songMs` (-1 during the count-in). */
export function chordIndexAt(timeline: Timeline, songMs: number): number {
  let lo = 0;
  let hi = timeline.chords.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline.chords[mid].startMs <= songMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export type TimingVerdict = 'on-time' | 'anticipated' | 'late' | 'missed';

export interface ChordResult {
  index: number;
  verdict: TimingVerdict;
  /** Completion time minus the chord's start (negative = early); null if missed. */
  offsetMs: number | null;
  /** A note outside the chord (and its written tensions) was played in its window. */
  wrongNote: boolean;
}

export interface ScorerOptions {
  step: VoicingStep;
  /** |offset| up to this counts as on time. */
  onTimeMs: number;
  /**
   * How early a chord may be played and still count (bossa/jazz anticipation).
   * A chord's window opens this long before its start and closes this long
   * before the next chord.
   */
  anticipationMs: number;
}

/** Defaults for a beginner: ±180 ms, and anticipation up to an eighth note. */
export function defaultScorerOptions(timeline: Timeline, step: VoicingStep): ScorerOptions {
  return { step, onTimeMs: 180, anticipationMs: Math.max(180, timeline.beatMs / 2) };
}

interface WindowState {
  hitMs: number | null;
  wrongNote: boolean;
  /** Pitch classes struck inside this window. */
  struck: Set<number>;
}

/**
 * Live scorer. Feed every note event (in song time) and call `advance(songMs)`
 * regularly; finished chords come back as results, exactly once each.
 */
export class PlayAlongScorer {
  private held = new Set<number>();
  private windows: WindowState[];
  private nextToClose = 0;
  readonly results: ChordResult[] = [];

  constructor(
    private readonly timeline: Timeline,
    private readonly opts: ScorerOptions,
  ) {
    this.windows = timeline.chords.map(() => ({ hitMs: null, wrongNote: false, struck: new Set<number>() }));
  }

  private windowIndexAt(songMs: number): number {
    // Shift by the anticipation: a chord "owns" time from just before its start.
    return chordIndexAt(this.timeline, songMs + this.opts.anticipationMs);
  }

  private required(i: number): number[] {
    const { item } = this.timeline.chords[i];
    return getTargetPitchClassesForStep(item.chord, this.opts.step);
  }

  private allowed(i: number): Set<number> {
    const { item } = this.timeline.chords[i];
    return new Set([...item.chord.pitchClasses, ...item.tensions]);
  }

  noteOn(note: number, songMs: number): void {
    this.held.add(note);
    const i = this.windowIndexAt(songMs);
    if (i < 0 || i < this.nextToClose) return;
    const state = this.windows[i];
    const pc = ((note % 12) + 12) % 12;
    if (!this.allowed(i).has(pc)) {
      state.wrongNote = true;
      return;
    }
    state.struck.add(pc);
    if (state.hitMs !== null) return;
    // A repeated chord must be struck again in full; on a real change, common
    // tones may stay held from the previous chord (voice leading).
    const available = this.timeline.chords[i].repeat
      ? state.struck
      : new Set([...this.held].map((n) => ((n % 12) + 12) % 12));
    if (this.required(i).every((p) => available.has(p))) state.hitMs = songMs;
  }

  noteOff(note: number): void {
    this.held.delete(note);
  }

  /**
   * Restarts scoring at chord `index` (after the learner navigated in the
   * chart): results from there on are forgotten so those chords are judged
   * again; chords skipped forward are simply not judged.
   */
  seek(index: number): void {
    const i = Math.max(0, Math.min(index, this.timeline.chords.length));
    this.nextToClose = i;
    for (let k = i; k < this.windows.length; k++) this.windows[k] = { hitMs: null, wrongNote: false, struck: new Set<number>() };
    for (let k = this.results.length - 1; k >= 0; k--) if (this.results[k].index >= i) this.results.splice(k, 1);
    this.held.clear();
  }

  /** Closes every chord whose window has ended by `songMs`; returns the new results. */
  advance(songMs: number): ChordResult[] {
    const fresh: ChordResult[] = [];
    const chords = this.timeline.chords;
    while (this.nextToClose < chords.length) {
      const i = this.nextToClose;
      const closesAt = chords[i].endMs - this.opts.anticipationMs;
      const isLast = i === chords.length - 1;
      if (songMs < (isLast ? chords[i].endMs : closesAt)) break;
      fresh.push(this.verdict(i));
      this.nextToClose += 1;
    }
    this.results.push(...fresh);
    return fresh;
  }

  private verdict(i: number): ChordResult {
    const { hitMs, wrongNote } = this.windows[i];
    if (hitMs === null) return { index: i, verdict: 'missed', offsetMs: null, wrongNote };
    const offsetMs = Math.round(hitMs - this.timeline.chords[i].startMs);
    let verdict: TimingVerdict = 'late';
    if (Math.abs(offsetMs) <= this.opts.onTimeMs) verdict = 'on-time';
    else if (offsetMs < 0) verdict = 'anticipated';
    return { index: i, verdict, offsetMs, wrongNote };
  }
}

export interface PlayAlongSummary {
  total: number;
  /** Chords whose notes were all found (any timing). */
  found: number;
  /** Found chords played on time (anticipations count as on time). */
  onTime: number;
  late: number;
  missed: number;
  withWrongNotes: number;
  /** 0..1 */
  noteAccuracy: number;
  /** 0..1, among found chords */
  timingAccuracy: number;
  /** Mean signed offset of found chords (positive = tends to be late). */
  meanOffsetMs: number | null;
  /** Chord ids missed or late most often, worst first. */
  weakChordIds: string[];
}

export function summarize(timeline: Timeline, results: ChordResult[]): PlayAlongSummary {
  const found = results.filter((r) => r.verdict !== 'missed');
  const onTime = found.filter((r) => r.verdict === 'on-time' || r.verdict === 'anticipated');
  const offsets = found.map((r) => r.offsetMs as number);
  const misses = new Map<string, number>();
  for (const r of results) {
    if (r.verdict === 'missed' || r.verdict === 'late' || r.wrongNote) {
      const id = timeline.chords[r.index].item.chord.id;
      misses.set(id, (misses.get(id) ?? 0) + 1);
    }
  }
  return {
    total: results.length,
    found: found.length,
    onTime: onTime.length,
    late: found.length - onTime.length,
    missed: results.length - found.length,
    withWrongNotes: results.filter((r) => r.wrongNote).length,
    noteAccuracy: results.length ? found.length / results.length : 0,
    timingAccuracy: found.length ? onTime.length / found.length : 0,
    meanOffsetMs: offsets.length ? Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length) : null,
    weakChordIds: [...misses.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
  };
}
