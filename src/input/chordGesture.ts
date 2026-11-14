/**
 * "Next" gesture: the learner picks a favourite chord, and striking it a few
 * times in a row, quickly, triggers the screen's main action. With it, a whole
 * play-along session runs from the instrument, without mouse or keyboard.
 *
 * Pure: fed with timestamped note events, no React, no DOM.
 */

export interface ChordGestureOptions {
  /** Strikes needed. */
  count: number;
  /** Longest gap between two strikes (ms). */
  maxGapMs: number;
  /**
   * After firing, strikes are ignored until the chord has rested this long:
   * hammering it 6 times moves one page, not two.
   */
  cooldownMs: number;
}

export const DEFAULT_GESTURE: ChordGestureOptions = { count: 3, maxGapMs: 900, cooldownMs: 1500 };

/** A gesture chord needs at least two different notes, so a single note never triggers it. */
export const MIN_GESTURE_NOTES = 2;

const pc = (note: number) => ((note % 12) + 12) % 12;

/** Sorted, de-duplicated pitch classes of some MIDI notes. */
export function toPitchClasses(notes: Iterable<number>): number[] {
  return [...new Set([...notes].map(pc))].sort((a, b) => a - b);
}

export function isValidGestureChord(pitchClasses: readonly number[] | undefined): pitchClasses is number[] {
  return Array.isArray(pitchClasses) && new Set(pitchClasses.map(pc)).size >= MIN_GESTURE_NOTES;
}

export interface GestureUpdate {
  /** Strikes counted so far in the current streak (0 once fired or broken). */
  streak: number;
  /** True on the strike that completes the gesture. */
  fired: boolean;
}

export class ChordGestureDetector {
  private readonly target: Set<number>;
  private readonly opts: ChordGestureOptions;
  private held = new Set<number>();
  private matching = false;
  private strikes: number[] = [];
  private lockedUntil = Number.NEGATIVE_INFINITY;

  constructor(targetPitchClasses: readonly number[], opts: ChordGestureOptions = DEFAULT_GESTURE) {
    this.target = new Set(targetPitchClasses.map(pc));
    this.opts = opts;
  }

  get streak(): number {
    return this.strikes.length;
  }

  noteOn(note: number, timeMs: number): GestureUpdate {
    this.held.add(note);
    if (!this.target.has(pc(note))) {
      // Another note in between: not "in a row" any more.
      this.strikes = [];
      this.matching = false;
      return { streak: 0, fired: false };
    }
    if (this.matching || !this.isMatch()) return { streak: this.strikes.length, fired: false };

    // Rising edge: the chord is complete again.
    this.matching = true;
    if (timeMs < this.lockedUntil) {
      // Still hammering after a fire: ignore, and wait for a real pause.
      this.lockedUntil = timeMs + this.opts.cooldownMs;
      return { streak: 0, fired: false };
    }
    const last = this.strikes.at(-1);
    if (last !== undefined && timeMs - last > this.opts.maxGapMs) this.strikes = [];
    this.strikes.push(timeMs);
    if (this.strikes.length >= this.opts.count) {
      this.strikes = [];
      this.lockedUntil = timeMs + this.opts.cooldownMs;
      return { streak: this.opts.count, fired: true };
    }
    return { streak: this.strikes.length, fired: false };
  }

  noteOff(note: number): void {
    this.held.delete(note);
    if (this.matching && !this.isMatch()) this.matching = false;
  }

  /** Streak broken by time alone (for the on-screen counter). */
  expire(nowMs: number): boolean {
    const last = this.strikes.at(-1);
    if (last !== undefined && nowMs - last > this.opts.maxGapMs) {
      this.strikes = [];
      return true;
    }
    return false;
  }

  private isMatch(): boolean {
    const pcs = new Set([...this.held].map(pc));
    if (pcs.size !== this.target.size) return false;
    for (const p of this.target) if (!pcs.has(p)) return false;
    return true;
  }
}
