import { describe, expect, it } from 'vitest';
import type { MelodyNote } from '../melody';
import type { Timeline } from '../playAlong';
import {
  buildSections,
  isSectionLearned,
  nextSectionToLearn,
  passSucceeded,
  sectionOfBar,
  withSectionLearned,
} from '../melodySections';
import { summarizeMelody } from '../melody';

// 4/4 at 120 BPM: a bar is 2000 ms, one bar of count-in, 5 bars of form.
const timeline = { formBars: 5, formStartMs: 2000, barMs: 2000 } as Timeline;
const note = (index: number, startMs: number): MelodyNote => ({ index, midi: 72, startMs, durationMs: 400 });
// Notes in bars 0, 1, 3 and 4 (bar 2 is silent).
const notes = [note(0, 2000), note(1, 3000), note(2, 4500), note(3, 8000), note(4, 10_000)];

describe('melody sections', () => {
  it('cut the form every few bars, the last one shorter', () => {
    const s = buildSections(timeline, notes, 2);
    expect(s.map((x) => [x.fromBar, x.toBar])).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
    expect(s[0].fromMs).toBe(2000);
    expect(s[0].toMs).toBe(6000);
    expect(s[0].notes.map((n) => n.index)).toEqual([0, 1, 2]);
    expect(s[1].notes.map((n) => n.index)).toEqual([3]);
    expect(s[2].notes.map((n) => n.index)).toEqual([4]);
  });

  it('are learned when all their bars are; a silent section always is', () => {
    const s = buildSections(timeline, notes, 1);
    expect(isSectionLearned(s[2], [])).toBe(true);
    expect(isSectionLearned(s[0], [])).toBe(false);
    expect(isSectionLearned(s[0], [0])).toBe(true);
    const two = buildSections(timeline, notes, 2);
    expect(isSectionLearned(two[0], [0])).toBe(false);
    expect(isSectionLearned(two[0], withSectionLearned([0], two[0]))).toBe(true);
  });

  it('find the next one to learn, skipping learned and silent ones, wrapping round', () => {
    const s = buildSections(timeline, notes, 1);
    expect(nextSectionToLearn(s, [0, 1])).toBe(3);
    expect(nextSectionToLearn(s, [0, 1, 3], 4)).toBe(4);
    expect(nextSectionToLearn(s, [1, 3, 4], 4)).toBe(0);
    expect(nextSectionToLearn(s, [0, 1, 3, 4])).toBeNull();
  });

  it('keep the place when the loop length changes', () => {
    const s = buildSections(timeline, notes, 2);
    expect(sectionOfBar(s, 3)).toBe(1);
    expect(sectionOfBar(s, 4)).toBe(2);
  });

  it('a pass succeeds with most of its notes', () => {
    const hit = { verdict: 'on-time' as const, offsetMs: 0 };
    const miss = { verdict: 'missed' as const, offsetMs: null };
    expect(passSucceeded(summarizeMelody([0, 1, 2, 3, 4].map((index) => ({ index, ...hit })), 0))).toBe(true);
    expect(passSucceeded(summarizeMelody([{ index: 0, ...hit }, { index: 1, ...miss }], 0))).toBe(false);
    expect(passSucceeded(summarizeMelody([], 0))).toBe(false);
  });
});
