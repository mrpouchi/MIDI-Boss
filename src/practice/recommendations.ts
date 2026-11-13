import {
  ALL_CHORD_FAMILIES,
  CHORD_FAMILIES,
  ChordFamily,
  NotationSystem,
  formatChordId,
  parseChordId,
} from '../music/chords';
import { ChordStat, SessionRecord, SpacedCard } from '../storage/types';
import { getSpacedOverview } from './spacedRepetition';
import { SessionConfig } from './types';

export interface ChordMasteryItem {
  chordId: string;
  label: string;
  family: ChordFamily;
  attempts: number;
  correct: number;
  accuracy: number;
  avgResponseMs: number;
  tier: 'mastered' | 'consolidating' | 'needs-work';
  isolatedVsProgressionGap?: boolean;
}

export interface MasteryOverview {
  mastered: ChordMasteryItem[];
  consolidating: ChordMasteryItem[];
  needsWork: ChordMasteryItem[];
  contextGapChords: ChordMasteryItem[];
  overallAccuracy: number;
  totalPracticedChords: number;
}

export interface DailySuggestion {
  title: string;
  description: string;
  durationLabel: string;
  config: SessionConfig;
}

export function classifyChordMastery(
  chordStats: Record<string, ChordStat>,
  notation: NotationSystem,
): MasteryOverview {
  const mastered: ChordMasteryItem[] = [];
  const consolidating: ChordMasteryItem[] = [];
  const needsWork: ChordMasteryItem[] = [];
  const contextGapChords: ChordMasteryItem[] = [];

  let totalAttempts = 0;
  let totalCorrect = 0;

  for (const stat of Object.values(chordStats)) {
    if (stat.attempts <= 0) continue;
    const parsed = parseChordId(stat.chordId);
    if (!parsed) continue;

    const accuracy = Math.round((stat.correct / stat.attempts) * 100);
    totalAttempts += stat.attempts;
    totalCorrect += stat.correct;

    let tier: ChordMasteryItem['tier'];
    if (accuracy >= 85 && stat.attempts >= 3) {
      tier = 'mastered';
    } else if (accuracy >= 60) {
      tier = 'consolidating';
    } else {
      tier = 'needs-work';
    }

    const isoAcc =
      stat.isolatedAttempts && stat.isolatedAttempts >= 2
        ? (stat.isolatedCorrect ?? 0) / stat.isolatedAttempts
        : null;
    const progAcc =
      stat.progressionAttempts && stat.progressionAttempts >= 2
        ? (stat.progressionCorrect ?? 0) / stat.progressionAttempts
        : null;

    const hasContextGap =
      isoAcc !== null && progAcc !== null && isoAcc >= 0.8 && progAcc < 0.65;

    const item: ChordMasteryItem = {
      chordId: stat.chordId,
      label: formatChordId(stat.chordId, notation),
      family: parsed.family,
      attempts: stat.attempts,
      correct: stat.correct,
      accuracy,
      avgResponseMs: stat.avgResponseMs,
      tier,
      isolatedVsProgressionGap: hasContextGap,
    };

    if (hasContextGap) contextGapChords.push(item);

    if (tier === 'mastered') mastered.push(item);
    else if (tier === 'consolidating') consolidating.push(item);
    else needsWork.push(item);
  }

  mastered.sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
  consolidating.sort((a, b) => a.accuracy - b.accuracy);
  needsWork.sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);

  const overallAccuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  return {
    mastered,
    consolidating,
    needsWork,
    contextGapChords,
    overallAccuracy,
    totalPracticedChords: mastered.length + consolidating.length + needsWork.length,
  };
}

export function getTodayChordsCompleted(sessions: SessionRecord[]): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  return sessions
    .filter((s) => s.date.slice(0, 10) === todayStr)
    .reduce((sum, s) => sum + s.totalChords, 0);
}

export function buildDailySuggestion(
  chordStats: Record<string, ChordStat>,
  notation: NotationSystem,
): DailySuggestion {
  const overview = classifyChordMastery(chordStats, notation);

  if (overview.needsWork.length >= 2) {
    const topWeak = overview.needsWork.slice(0, 4);
    const weakNames = topWeak.slice(0, 3).map((c) => c.label).join(' · ');
    const weakFamilies = Array.from(new Set(topWeak.map((c) => c.family)));

    return {
      title: `Révision ciblée : ${weakNames}`,
      description:
        'Rejouez ces accords à tempo calme en commençant par la triade ou l’accord complet.',
      durationLabel: '10 accords · ~3 min',
      config: {
        mode: 'session',
        label: 'Révision ciblée',
        families: weakFamilies,
        step: 'full',
        chordCount: 10,
        tempoBpm: 68,
        durationMinutes: 4,
        targetChordIds: topWeak.map((c) => c.chordId),
      },
    };
  }

  if (overview.consolidating.length > 0) {
    const families = Array.from(
      new Set(overview.consolidating.slice(0, 3).map((c) => c.family)),
    );
    const familyNames = families.map((f) => CHORD_FAMILIES[f].labelFr).join(', ');
    return {
      title: `Consolider les accords ${familyNames}`,
      description:
        'Un passage court sur vos accords en cours d’acquisition pour stabiliser les automatismes.',
      durationLabel: '12 accords · ~4 min',
      config: {
        mode: 'session',
        label: `Consolidation (${familyNames})`,
        families,
        step: 'full',
        chordCount: 12,
        tempoBpm: 76,
        durationMinutes: 5,
      },
    };
  }

  return {
    title: 'Exploration complète des 7 familles',
    description:
      'Enchaînez triades majeures/mineures, accords suspendus et accords de 7e à votre rythme.',
    durationLabel: '12 accords · ~4 min',
    config: {
      mode: 'session',
      label: 'Session complète',
      families: ALL_CHORD_FAMILIES,
      step: 'full',
      chordCount: 12,
      tempoBpm: 76,
      durationMinutes: 5,
    },
  };
}

export function buildPracticeRecommendations(
  chordStats: Record<string, ChordStat>,
  notation: NotationSystem,
  spacedCards: Record<string, SpacedCard> = {},
): string[] {
  const overview = classifyChordMastery(chordStats, notation);
  const spaced = getSpacedOverview(spacedCards);
  const recs: string[] = [];

  if (spaced.dueCount > 0) {
    recs.push(
      `${spaced.dueCount} élément${spaced.dueCount > 1 ? 's sont prêts' : ' est prêt'} pour la révision espacée du jour via la leçon guidée.`,
    );
  }

  if (overview.contextGapChords.length > 0) {
    const names = overview.contextGapChords
      .slice(0, 2)
      .map((c) => c.label)
      .join(', ');
    recs.push(
      `${names} est maîtrisé isolément mais encore hésitant en enchaînement : travaillez-le en mode progression étape 2 (1 + 5) puis étape 3.`,
    );
  }

  if (overview.needsWork.length > 0) {
    const names = overview.needsWork
      .slice(0, 3)
      .map((c) => c.label)
      .join(', ');
    recs.push(
      `Revenez temporairement à l’étape 2 (Fondamentale + Quinte) sur ${names} avant de rejouer l’accord complet.`,
    );
  }

  const familyStats = new Map<ChordFamily, { attempts: number; correct: number }>();
  for (const stat of Object.values(chordStats)) {
    const parsed = parseChordId(stat.chordId);
    if (!parsed) continue;
    const prev = familyStats.get(parsed.family) ?? { attempts: 0, correct: 0 };
    familyStats.set(parsed.family, {
      attempts: prev.attempts + stat.attempts,
      correct: prev.correct + stat.correct,
    });
  }

  const unpracticed = ALL_CHORD_FAMILIES.filter((f) => !familyStats.has(f));
  if (unpracticed.length > 0) {
    recs.push(
      `Découvrez la famille ${CHORD_FAMILIES[unpracticed[0]].labelFr} dans une courte session de 8 accords.`,
    );
  }

  if (recs.length === 0) {
    recs.push(
      'Passez progressivement de l’étape Fondamentale vers les Triades puis les accords de 7e sur les chansons guidées.',
    );
  }

  return recs;
}
