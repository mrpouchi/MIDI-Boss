/** A section of the song played over and over, in song milliseconds. */
export interface LoopSpan {
  fromMs: number;
  toMs: number;
}

/**
 * Continuous time → time in the song, folded into the loop. `leadMs`: the
 * last moments of a pass already belong to the next one (a chord struck a
 * little early, before the loop's first bar comes round again).
 */
export function foldLoop(t: number, loop: LoopSpan | null, leadMs = 0): number {
  if (!loop || t < loop.fromMs) return t;
  const len = loop.toMs - loop.fromMs;
  let rel = (t - loop.fromMs) % len;
  if (rel > len - leadMs) rel -= len;
  return loop.fromMs + rel;
}

/** How many passes of the loop are over at continuous time `t` (same lead). */
export function loopPassAt(t: number, loop: LoopSpan | null, leadMs = 0): number {
  if (!loop || t < loop.fromMs) return 0;
  return Math.floor((t - loop.fromMs + leadMs) / (loop.toMs - loop.fromMs));
}
