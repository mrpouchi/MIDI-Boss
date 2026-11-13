import {
  NotationSystem,
  VOICING_STEPS,
  VoicingStep,
  formatChordName,
  getChordNoteNames,
  parseChordId,
} from '../music/chords';
import { SpacedCard, StoredData } from '../storage/types';
import {
  GUIDED_SONGS,
  getRecommendedActiveSong,
  getSongChords,
  getSongUnlockedStep,
} from './curriculum';
import { AttemptOutcome, LessonConfig, PracticeQueueItem } from './types';

export function makeSpacedCardKey(chordId: string, step: VoicingStep): string {
  return `${chordId}@${step}`;
}

/**
 * Spaced repetition scheduler inspired by Duolingo's Half-Life Regression:
 * - Correct answers double/expand the interval before next review.
 * - Errors or missed chords shrink the interval so they come back soon.
 */
export function updateSpacedCard(
  existing: SpacedCard | undefined,
  chordId: string,
  step: VoicingStep,
  outcome: AttemptOutcome,
  responseMs: number,
  nowMs = Date.now(),
): SpacedCard {
  const key = makeSpacedCardKey(chordId, step);
  const prevLevel = existing?.masteryLevel ?? 0;
  const prevInterval = existing?.intervalHours ?? 0;
  const prevConsecutive = existing?.consecutiveCorrect ?? 0;
  const prevLapses = existing?.lapses ?? 0;
  const nowIso = new Date(nowMs).toISOString();

  if (outcome === 'correct') {
    const isFast = responseMs < 2400;
    const nextLevel = Math.min(5, prevLevel + 1);
    const consecutive = prevConsecutive + 1;

    let nextIntervalHours: number;
    if (consecutive === 1) {
      nextIntervalHours = isFast ? 12 : 6;
    } else if (consecutive === 2) {
      nextIntervalHours = isFast ? 36 : 24;
    } else {
      const multiplier = isFast ? 2.2 : 1.75;
      nextIntervalHours = Math.min(336, Math.round(Math.max(12, prevInterval) * multiplier));
    }

    return {
      key,
      chordId,
      step,
      masteryLevel: nextLevel,
      intervalHours: nextIntervalHours,
      nextReviewAt: new Date(nowMs + nextIntervalHours * 3600 * 1000).toISOString(),
      lastPracticedAt: nowIso,
      consecutiveCorrect: consecutive,
      lapses: prevLapses,
    };
  }

  // Error or missed: bring back quickly for active reinforcement
  const nextLevel = Math.max(0, prevLevel - 1);
  const nextIntervalHours = outcome === 'missed' ? 0.5 : 2;
  return {
    key,
    chordId,
    step,
    masteryLevel: nextLevel,
    intervalHours: nextIntervalHours,
    nextReviewAt: new Date(nowMs + nextIntervalHours * 3600 * 1000).toISOString(),
    lastPracticedAt: nowIso,
    consecutiveCorrect: 0,
    lapses: prevLapses + 1,
  };
}

export interface SpacedOverview {
  dueCount: number;
  fragileCount: number;
  masteredCardsCount: number;
  dueCards: SpacedCard[];
}

export function getSpacedOverview(
  spacedCards: Record<string, SpacedCard>,
  nowMs = Date.now(),
): SpacedOverview {
  const all = Object.values(spacedCards);
  const dueCards = all
    .filter((card) => new Date(card.nextReviewAt).getTime() <= nowMs)
    .sort(
      (a, b) =>
        a.masteryLevel - b.masteryLevel ||
        new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime(),
    );

  const fragileCount = all.filter(
    (card) => card.masteryLevel <= 1 && card.lapses > 0,
  ).length;
  const masteredCardsCount = all.filter((card) => card.masteryLevel >= 4).length;

  return {
    dueCount: dueCards.length,
    fragileCount,
    masteredCardsCount,
    dueCards,
  };
}

function buildStepTip(
  chordName: string,
  notes: string[],
  step: VoicingStep,
  isNew: boolean,
): string {
  if (step === 'root') {
    return isNew
      ? `Nouveau repère : appuyez simplement sur ${notes[0]} (la fondamentale de ${chordName}).`
      : `Trouvez la note de base de ${chordName}.`;
  }
  if (step === 'root-5th') {
    return isNew
      ? `Ajoutez la quinte : jouez ${notes.join(' + ')} ensemble.`
      : `Posez l’ossature à deux doigts (1 + 5) pour ${chordName}.`;
  }
  if (step === 'triad') {
    return isNew
      ? `Triade complète : jouez ${notes.join(' · ')}.`
      : `Retrouvez la tierce et la quinte de ${chordName}.`;
  }
  return isNew
    ? `Accord avec extension : jouez ${notes.join(' · ')}.`
    : `Jouez l’accord complet dans n’importe quel renversement.`;
}

/**
 * Generates a short (~4 min, 8-item) adaptive micro-lesson combining:
 * 1. Due spaced-repetition reviews (or fragile cards)
 * 2. New step material from the active beginner/intermediate song
 * 3. A brief contextual progression run at the end
 */
export function generateDuolingoMicroLesson(
  storedData: StoredData,
  notation: NotationSystem,
  nowMs = Date.now(),
): LessonConfig {
  const spacedOverview = getSpacedOverview(storedData.spacedCards, nowMs);
  const activeSong = getRecommendedActiveSong(storedData.songProgress);
  const activeStep = getSongUnlockedStep(activeSong, storedData.songProgress);
  const songChords = getSongChords(activeSong, notation);

  const items: PracticeQueueItem[] = [];
  const usedKeys = new Set<string>();

  // 1. Up to 3 due spaced-repetition cards (prioritize fragile/due)
  for (const card of spacedOverview.dueCards.slice(0, 3)) {
    const chord = parseChordId(card.chordId);
    if (!chord) continue;
    const key = makeSpacedCardKey(chord.id, card.step);
    usedKeys.add(key);
    const notes = getChordNoteNames(chord, notation, card.step);
    items.push({
      chord,
      step: card.step,
      context: 'isolated',
      isNewConcept: false,
      tip: buildStepTip(formatChordName(chord, notation), notes, card.step, false),
    });
  }

  // 2. Introduce/reinforce the current step of the active guided song
  for (const chord of songChords) {
    const key = makeSpacedCardKey(chord.id, activeStep);
    const existingCard = storedData.spacedCards[key];
    const isNew = !existingCard;
    if (!usedKeys.has(key) || items.length < 7) {
      usedKeys.add(key);
      const notes = getChordNoteNames(chord, notation, activeStep);
      items.push({
        chord,
        step: activeStep,
        context: 'progression',
        isNewConcept: isNew,
        tip: buildStepTip(
          formatChordName(chord, notation),
          notes,
          activeStep,
          isNew,
        ),
      });
    }
  }

  // 3. Ensure at least 7-8 items by repeating any fragile or song chords once in context
  if (items.length < 7) {
    const fallbackSong = GUIDED_SONGS[0];
    const fallbackChords = getSongChords(fallbackSong, notation);
    for (const chord of fallbackChords) {
      if (items.length >= 8) break;
      const notes = getChordNoteNames(chord, notation, activeStep);
      items.push({
        chord,
        step: activeStep,
        context: 'progression',
        isNewConcept: false,
        tip: buildStepTip(
          formatChordName(chord, notation),
          notes,
          activeStep,
          false,
        ),
      });
    }
  }

  const finalItems = items.slice(0, 8);
  const stepMeta = VOICING_STEPS[activeStep];

  const goalDescription =
    spacedOverview.dueCount > 0
      ? `Réviser ${Math.min(3, spacedOverview.dueCount)} accords à consolider et pratiquer « ${activeSong.title} » (${stepMeta.shortLabelFr}).`
      : `Pratiquer « ${activeSong.title} » à l’étape ${stepMeta.order}/4 (${stepMeta.shortLabelFr}).`;

  return {
    mode: 'lesson',
    label: `Leçon du jour · ${activeSong.title}`,
    goalDescription,
    items: finalItems,
    tempoBpm: activeSong.tempoBpm,
    songId: activeSong.id,
    targetStep: activeStep,
  };
}
