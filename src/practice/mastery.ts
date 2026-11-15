import { parseChordId } from '../music/chords';
import { SKILLS, SkillNode } from '../content/skills';
import { ChordStat, PlayAlongRun, SpacedCard } from '../storage/types';

/**
 * Skill mastery computed ONLY from recorded practice (spaced-repetition cards
 * and per-chord statistics). Nothing here is estimated or simulated: a skill
 * without an exercise reports `no-exercise`, one without practice reports
 * `not-started`.
 */
export type SkillStatus = 'no-exercise' | 'not-started' | 'learning' | 'fragile' | 'mastered';

export interface SkillAssessment {
  skill: SkillNode;
  status: SkillStatus;
  /** Number of distinct items (cards or chords) that provided evidence. */
  evidenceCount: number;
  /** 0..1 when measurable, otherwise null. */
  accuracy: number | null;
  /** Measured progress towards the mastery rule (e.g. 2 solid chords out of 3), null without evidence rule. */
  progress: { current: number; target: number } | null;
  /** Every prerequisite is mastered (or has no exercise yet, so cannot be required). */
  prerequisitesMet: boolean;
}

export type DifficultyKind = 'none' | 'one-off' | 'recurring';

/**
 * Separates a slip from a real difficulty: one recent miss after successes is
 * a one-off; two or more lapses with no success since is recurring.
 */
export function classifyCardDifficulty(card: SpacedCard): DifficultyKind {
  if (card.consecutiveCorrect > 0) return 'none';
  if (card.lapses >= 2) return 'recurring';
  if (card.lapses === 1) return 'one-off';
  return 'none';
}

export const MASTERY_RULES = {
  /** Cards: at least this many distinct chord×step cards… */
  minCards: 3,
  /** …and this share of them at spaced level ≥ `cardLevel`. */
  masteredShare: 0.8,
  cardLevel: 3,
  /** Progression-only skills (from chord statistics). */
  minProgressionAttempts: 12,
  progressionMastered: 0.85,
  progressionFragileAttempts: 6,
  progressionFragile: 0.6,
  /** Play-along skills: this many good, complete runs. */
  playAlongRuns: 3,
} as const;

function assessFromPlayAlong(skill: SkillNode, runs: PlayAlongRun[]) {
  const rule = skill.evidence!;
  const relevant = runs.filter((r) => r.completed && r.step !== 'melody' && rule.steps.includes(r.step));
  const target = MASTERY_RULES.playAlongRuns;
  if (relevant.length === 0) {
    return { status: 'not-started' as SkillStatus, evidenceCount: 0, accuracy: null, progress: { current: 0, target } };
  }
  const { minNotes, minTiming } = rule.playAlong!;
  const good = relevant.filter((r) => r.noteAccuracy >= minNotes && r.timingAccuracy >= minTiming).length;
  const recent = relevant.slice(-3);
  const recentTiming = recent.reduce((a, r) => a + r.timingAccuracy, 0) / recent.length;
  let status: SkillStatus = 'learning';
  if (good >= target) status = 'mastered';
  else if (recent.length >= 3 && recentTiming < 0.5) status = 'fragile';
  return {
    status,
    evidenceCount: relevant.length,
    accuracy: recentTiming,
    progress: { current: Math.min(good, target), target },
  };
}

function assessFromCards(skill: SkillNode, cards: SpacedCard[]) {
  const rule = skill.evidence!;
  const relevant = cards.filter((card) => {
    if (!rule.steps.includes(card.step)) return false;
    if (!rule.families) return true;
    const chord = parseChordId(card.chordId);
    return chord !== null && rule.families.includes(chord.family);
  });
  const solid = relevant.filter((c) => c.masteryLevel >= MASTERY_RULES.cardLevel).length;
  // Mastery needs `minCards` cards and 80 % of all relevant cards to be solid.
  const target = Math.max(
    MASTERY_RULES.minCards,
    Math.ceil(relevant.length * MASTERY_RULES.masteredShare),
  );
  const progress = { current: Math.min(solid, target), target };
  if (relevant.length === 0) {
    return { status: 'not-started' as SkillStatus, evidenceCount: 0, accuracy: null, progress };
  }
  const share = solid / relevant.length;
  const hasRecurring = relevant.some((c) => classifyCardDifficulty(c) === 'recurring');
  let status: SkillStatus = 'learning';
  if (hasRecurring) status = 'fragile';
  else if (relevant.length >= MASTERY_RULES.minCards && share >= MASTERY_RULES.masteredShare) {
    status = 'mastered';
  }
  return { status, evidenceCount: relevant.length, accuracy: null, progress };
}

function assessFromProgressionStats(skill: SkillNode, stats: ChordStat[]) {
  const rule = skill.evidence!;
  const relevant = stats.filter((s) => {
    if ((s.progressionAttempts ?? 0) === 0) return false;
    if (!rule.families) return true;
    const chord = parseChordId(s.chordId);
    return chord !== null && rule.families.includes(chord.family);
  });
  const attempts = relevant.reduce((sum, s) => sum + (s.progressionAttempts ?? 0), 0);
  const correct = relevant.reduce((sum, s) => sum + (s.progressionCorrect ?? 0), 0);
  const progress = {
    current: Math.min(attempts, MASTERY_RULES.minProgressionAttempts),
    target: MASTERY_RULES.minProgressionAttempts,
  };
  if (attempts === 0) {
    return { status: 'not-started' as SkillStatus, evidenceCount: 0, accuracy: null, progress };
  }
  const accuracy = correct / attempts;
  let status: SkillStatus = 'learning';
  if (attempts >= MASTERY_RULES.minProgressionAttempts && accuracy >= MASTERY_RULES.progressionMastered) {
    status = 'mastered';
  } else if (attempts >= MASTERY_RULES.progressionFragileAttempts && accuracy < MASTERY_RULES.progressionFragile) {
    status = 'fragile';
  }
  return { status, evidenceCount: relevant.length, accuracy, progress };
}

export function assessSkills(
  spacedCards: Record<string, SpacedCard>,
  chordStats: Record<string, ChordStat>,
  playAlongRuns: PlayAlongRun[] = [],
  skills: SkillNode[] = SKILLS,
): SkillAssessment[] {
  const cards = Object.values(spacedCards);
  const stats = Object.values(chordStats);

  const partial = skills.map((skill) => {
    if (!skill.evidence) {
      return { skill, status: 'no-exercise' as SkillStatus, evidenceCount: 0, accuracy: null, progress: null };
    }
    const result = skill.evidence.playAlong
      ? assessFromPlayAlong(skill, playAlongRuns)
      : skill.evidence.progressionOnly
        ? assessFromProgressionStats(skill, stats)
        : assessFromCards(skill, cards);
    return { skill, ...result };
  });

  const statusById = new Map(partial.map((a) => [a.skill.id, a.status]));
  return partial.map((a) => ({
    ...a,
    prerequisitesMet: a.skill.dependsOn.every((dep) => {
      const s = statusById.get(dep);
      return s === undefined || s === 'mastered' || s === 'no-exercise';
    }),
  }));
}

/** Practicable skills to work on next: recurring difficulties first, then in-progress, then new. */
export function recommendNextSkills(assessments: SkillAssessment[], limit = 3): SkillAssessment[] {
  const rank: Partial<Record<SkillStatus, number>> = { fragile: 0, learning: 1, 'not-started': 2 };
  return assessments
    .filter((a) => a.status in rank && a.prerequisitesMet)
    .sort((a, b) => rank[a.status]! - rank[b.status]!)
    .slice(0, limit);
}
