import { describe, expect, it } from 'vitest';
import { createChord, VoicingStep } from '../../music/chords';
import { SpacedCard } from '../../storage/types';
import { assessSkills, classifyCardDifficulty, recommendNextSkills } from '../mastery';
import { SKILLS } from '../../content/skills';

function card(root: number, step: VoicingStep, level: number, extra: Partial<SpacedCard> = {}): SpacedCard {
  const chord = createChord(root, 'maj');
  return {
    key: `${chord.id}@${step}`,
    chordId: chord.id,
    step,
    masteryLevel: level,
    intervalHours: 24,
    nextReviewAt: new Date(0).toISOString(),
    lastPracticedAt: new Date(0).toISOString(),
    consecutiveCorrect: level > 0 ? 1 : 0,
    lapses: 0,
    ...extra,
  };
}

const byId = (list: ReturnType<typeof assessSkills>, id: string) => list.find((a) => a.skill.id === id)!;

describe('classifyCardDifficulty', () => {
  it('distinguishes a slip from a recurring difficulty', () => {
    expect(classifyCardDifficulty(card(0, 'root', 2))).toBe('none');
    expect(classifyCardDifficulty(card(0, 'root', 0, { consecutiveCorrect: 0, lapses: 1 }))).toBe('one-off');
    expect(classifyCardDifficulty(card(0, 'root', 0, { consecutiveCorrect: 0, lapses: 3 }))).toBe('recurring');
  });
});

describe('assessSkills', () => {
  it('never reports progress without data', () => {
    const result = assessSkills({}, {});
    for (const a of result) {
      expect(['no-exercise', 'not-started']).toContain(a.status);
    }
    expect(byId(result, 'find-c').status).toBe('no-exercise');
    expect(byId(result, 'chord-roots').status).toBe('not-started');
  });

  it('masters a skill only with enough solid cards', () => {
    const two = { a: card(0, 'root', 4), b: card(2, 'root', 4) };
    expect(byId(assessSkills(two, {}), 'chord-roots').status).toBe('learning');
    const three = { ...two, c: card(4, 'root', 3) };
    expect(byId(assessSkills(three, {}), 'chord-roots').status).toBe('mastered');
    expect(byId(assessSkills(two, {}), 'chord-roots').progress).toEqual({ current: 2, target: 3 });
    expect(byId(assessSkills({}, {}), 'find-c').progress).toBeNull();
  });

  it('flags recurring difficulty as fragile even when other cards are solid', () => {
    const cards = {
      a: card(0, 'root', 4),
      b: card(2, 'root', 4),
      c: card(4, 'root', 4),
      d: card(5, 'root', 0, { consecutiveCorrect: 0, lapses: 2 }),
    };
    expect(byId(assessSkills(cards, {}), 'chord-roots').status).toBe('fragile');
  });

  it('respects family filters', () => {
    const cards = { a: card(0, 'triad', 4), b: card(2, 'triad', 4), c: card(4, 'triad', 4) };
    const result = assessSkills(cards, {});
    expect(byId(result, 'major-triads').status).toBe('mastered');
    expect(byId(result, 'minor-triads').status).toBe('not-started');
  });

  it('uses progression statistics for chord changes', () => {
    const stats = {
      '0:maj': {
        chordId: '0:maj', attempts: 20, correct: 19, errors: 1, missed: 0, avgResponseMs: 900,
        lastPracticedAt: '', progressionAttempts: 14, progressionCorrect: 13,
      },
    };
    const a = byId(assessSkills({}, stats), 'chord-changes');
    expect(a.status).toBe('mastered');
    expect(a.accuracy).toBeCloseTo(13 / 14);
  });

  it('recommends recurring difficulties first and respects prerequisites', () => {
    const cards = {
      a: card(0, 'root', 0, { consecutiveCorrect: 0, lapses: 2 }),
      b: card(0, 'root-5th', 1),
    };
    const next = recommendNextSkills(assessSkills(cards, {}));
    expect(next[0].skill.id).toBe('chord-roots');
    // fifths depends on chord-roots, which is not mastered yet
    expect(next.map((a) => a.skill.id)).not.toContain('fifths');
  });

  it('every dependency points to an existing skill', () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    for (const s of SKILLS) for (const d of s.dependsOn) expect(ids.has(d)).toBe(true);
  });

  it('masters rhythm only after 3 complete, accurate play-along runs', () => {
    const run = (timing: number, completed = true) => ({
      id: String(Math.random()), date: '', songTitle: 'Blue Bossa', step: 'root' as const, bpm: 100,
      total: 32, found: 30, onTime: 27, noteAccuracy: 0.94, timingAccuracy: timing, meanOffsetMs: 20, completed,
    });
    const rhythm = (runs: ReturnType<typeof run>[]) => byId(assessSkills({}, {}, runs), 'rhythm');
    expect(rhythm([]).status).toBe('not-started');
    expect(rhythm([run(0.9), run(0.9)]).status).toBe('learning');
    expect(rhythm([run(0.9), run(0.9)]).progress).toEqual({ current: 2, target: 3 });
    expect(rhythm([run(0.9), run(0.9), run(0.9, false)]).status).toBe('learning');
    expect(rhythm([run(0.9), run(0.9), run(0.85)]).status).toBe('mastered');
    expect(rhythm([run(0.3), run(0.4), run(0.2)]).status).toBe('fragile');
    // Root-only runs never count for full accompaniment
    expect(byId(assessSkills({}, {}, [run(0.9), run(0.9), run(0.9)]), 'accompany').status).toBe('not-started');
  });
});
