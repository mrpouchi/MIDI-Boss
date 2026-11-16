/** A section of the song played over and over, in song milliseconds. */
export interface LoopSpan {
  fromMs: number;
  toMs: number;
  /** Silence after each pass before the next one (e.g. a bar of rest), in ms. */
  restMs?: number;
}

/** Time from one pass's start to the next one's: the section plus its rest. */
export function loopPeriod(loop: LoopSpan): number {
  return loop.toMs - loop.fromMs + Math.max(0, loop.restMs ?? 0);
}

/**
 * Continuous time → time in the song, folded into the loop. `leadMs`: the
 * last moments of a pass already belong to the next one (a chord struck a
 * little early, before the loop's first bar comes round again).
 */
export function foldLoop(t: number, loop: LoopSpan | null, leadMs = 0): number {
  if (!loop || t < loop.fromMs) return t;
  // During the rest the time runs on past the section's end (nothing is due there).
  const period = loopPeriod(loop);
  let rel = (t - loop.fromMs) % period;
  if (rel > period - leadMs) rel -= period;
  return loop.fromMs + rel;
}

/** How many passes of the loop are over at continuous time `t` (same lead). */
export function loopPassAt(t: number, loop: LoopSpan | null, leadMs = 0): number {
  if (!loop || t < loop.fromMs) return 0;
  return Math.floor((t - loop.fromMs + leadMs) / loopPeriod(loop));
}
