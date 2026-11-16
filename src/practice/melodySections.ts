import type { MelodyNote, MelodySummary } from './melody';
import type { Timeline } from './playAlong';

/**
 * Learning the tune bit by bit: the form cut into sections of a few bars that
 * loop. Each section is heard once, then played until it is passed a few
 * times; its bars are then known. Pure, no audio, no React.
 */

/** Loop lengths offered to the learner, in bars. */
export const SECTION_BAR_CHOICES = [1, 2, 4, 8] as const;
export const DEFAULT_SECTION_BARS = 2;

/** Passes to succeed before a section counts as learned. */
export const PASSES_TO_LEARN = 3;
/** A pass succeeds with this share of the section's notes found. */
export const PASS_MIN_NOTES = 0.8;

export interface MelodySection {
  index: number;
  /** First bar of the form (0-based) and the bar after the last. */
  fromBar: number;
  toBar: number;
  fromMs: number;
  toMs: number;
  /** The tune notes that start inside the section (global indices kept). */
  notes: MelodyNote[];
}

/** The form cut every `barsPerSection` bars (the last section may be shorter). */
export function buildSections(timeline: Timeline, notes: MelodyNote[], barsPerSection: number): MelodySection[] {
  const size = Math.max(1, Math.floor(barsPerSection));
  const sections: MelodySection[] = [];
  for (let fromBar = 0; fromBar < timeline.formBars; fromBar += size) {
    const toBar = Math.min(timeline.formBars, fromBar + size);
    const fromMs = timeline.formStartMs + fromBar * timeline.barMs;
    const toMs = timeline.formStartMs + toBar * timeline.barMs;
    sections.push({
      index: sections.length,
      fromBar,
      toBar,
      fromMs,
      toMs,
      notes: notes.filter((n) => n.startMs >= fromMs - 0.5 && n.startMs < toMs - 0.5),
    });
  }
  return sections;
}

/** A section is learned when every one of its bars is (a section without notes always is). */
export function isSectionLearned(section: MelodySection, learnedBars: readonly number[]): boolean {
  if (section.notes.length === 0) return true;
  for (let b = section.fromBar; b < section.toBar; b++) if (!learnedBars.includes(b)) return false;
  return true;
}

/** The first section from `from` on (wrapping round) that still has to be learned, or null. */
export function nextSectionToLearn(sections: MelodySection[], learnedBars: readonly number[], from = 0): number | null {
  for (let k = 0; k < sections.length; k++) {
    const i = (from + k) % sections.length;
    if (!isSectionLearned(sections[i], learnedBars)) return i;
  }
  return null;
}

/** The learned bars plus the section's ones, sorted, without duplicates. */
export function withSectionLearned(learnedBars: readonly number[], section: MelodySection): number[] {
  const all = new Set(learnedBars);
  for (let b = section.fromBar; b < section.toBar; b++) all.add(b);
  return [...all].sort((a, b) => a - b);
}

/** The section that holds `bar` (after the loop length changed). */
export function sectionOfBar(sections: MelodySection[], bar: number): number {
  const i = sections.findIndex((s) => bar >= s.fromBar && bar < s.toBar);
  return i < 0 ? 0 : i;
}

export function passSucceeded(summary: MelodySummary): boolean {
  return summary.total > 0 && summary.noteAccuracy >= PASS_MIN_NOTES;
}
