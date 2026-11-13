import {
  ChordDefinition,
  NotationSystem,
  VOICING_STEPS,
  VOICING_STEP_ORDER,
  VoicingStep,
  parseProgression,
} from '../music/chords';
import { SongProgress } from '../storage/types';

export const STEP_XP_TARGET = 100;

export interface GuidedSong {
  id: string;
  title: string;
  levelLabel: string;
  description: string;
  intlText: string;
  frText: string;
  tempoBpm: number;
  availableSteps: VoicingStep[];
}

export const GUIDED_SONGS: GuidedSong[] = [
  {
    id: 'song-pop-do',
    title: 'Ballade Pop en Do',
    levelLabel: 'Débutant · 1er parcours',
    description:
      'La suite la plus utilisée au piano moderne. Commencez avec un seul doigt puis construisez chaque accord.',
    intlText: 'C – G – Am – F',
    frText: 'Do – Sol – Lam – Fa',
    tempoBpm: 72,
    availableSteps: ['root', 'root-5th', 'triad'],
  },
  {
    id: 'song-lune-mineure',
    title: 'Nocturne en La mineur',
    levelLabel: 'Débutant · Couleur douce',
    description:
      'Idéal pour sentir le passage entre accords mineurs et majeurs dès la première semaine.',
    intlText: 'Am – F – C – G',
    frText: 'Lam – Fa – Do – Sol',
    tempoBpm: 68,
    availableSteps: ['root', 'root-5th', 'triad'],
  },
  {
    id: 'song-ii-v-i',
    title: 'Standard Jazz II–V–I',
    levelLabel: 'Intermédiaire · Cadence',
    description:
      'Apprenez la cadence fondamentale du jazz en passant des notes seules jusqu’aux accords de 7e.',
    intlText: 'Dm7 – G7 – Cmaj7',
    frText: 'Rém7 – Sol7 – Do7M',
    tempoBpm: 68,
    availableSteps: ['root', 'root-5th', 'triad', 'full'],
  },
  {
    id: 'song-anatole',
    title: 'Promenade Jazzy (Anatole)',
    levelLabel: 'Intermédiaire · Fluidité',
    description:
      'Enchaînement fluide de quatre accords de 7e pour travailler les renversements proches.',
    intlText: 'Cmaj7 – Am7 – Dm7 – G7',
    frText: 'Do7M – Lam7 – Rém7 – Sol7',
    tempoBpm: 72,
    availableSteps: ['root', 'root-5th', 'triad', 'full'],
  },
  {
    id: 'song-suspendue',
    title: 'Couleurs suspendues',
    levelLabel: 'Découverte · Sus2 & Sus4',
    description:
      'Sentez comment la seconde et la quarte résolvent naturellement vers la tierce majeure.',
    intlText: 'Dsus2 – D – Asus4 – A',
    frText: 'Résus2 – Ré – Lasus4 – La',
    tempoBpm: 66,
    availableSteps: ['root', 'root-5th', 'triad'],
  },
];

export function getSongById(songId?: string): GuidedSong | undefined {
  if (!songId) return undefined;
  return GUIDED_SONGS.find((s) => s.id === songId);
}

export function getSongChords(
  song: GuidedSong,
  notation: NotationSystem,
): ChordDefinition[] {
  const text = notation === 'fr' ? song.frText : song.intlText;
  return parseProgression(text).chords;
}

export function getSongUnlockedStep(
  song: GuidedSong,
  songProgress: Record<string, SongProgress>,
): VoicingStep {
  const progress = songProgress[song.id];
  if (!progress) return song.availableSteps[0];
  return song.availableSteps.includes(progress.unlockedStep)
    ? progress.unlockedStep
    : song.availableSteps[0];
}

export function isStepUnlockedForSong(
  song: GuidedSong,
  step: VoicingStep,
  songProgress: Record<string, SongProgress>,
): boolean {
  const targetIdx = song.availableSteps.indexOf(step);
  if (targetIdx === -1) return false;
  if (targetIdx === 0) return true;
  const unlockedStep = getSongUnlockedStep(song, songProgress);
  const unlockedIdx = song.availableSteps.indexOf(unlockedStep);
  return targetIdx <= unlockedIdx;
}

/**
 * Enforces sequential step-by-step progression on a guided song.
 * Returns the next step only if it exists in the song's curriculum and
 * (when songProgress is supplied) if currentStep has been unlocked/completed.
 */
export function getNextStepForSong(
  song: GuidedSong,
  currentStep: VoicingStep,
  songProgress?: Record<string, SongProgress>,
): VoicingStep | null {
  const idx = song.availableSteps.indexOf(currentStep);
  if (idx === -1 || idx >= song.availableSteps.length - 1) return null;
  if (songProgress) {
    const unlockedStep = getSongUnlockedStep(song, songProgress);
    const unlockedIdx = song.availableSteps.indexOf(unlockedStep);
    if (idx > unlockedIdx) return null;
  }
  return song.availableSteps[idx + 1];
}

export function getSongStepXp(
  songId: string | undefined,
  step: VoicingStep,
  songProgress: Record<string, SongProgress>,
): number {
  if (!songId) return 0;
  const progress = songProgress[songId];
  if (!progress) return 0;
  if (progress.completedSteps.includes(step)) return STEP_XP_TARGET;
  return Math.min(STEP_XP_TARGET, progress.stepXp?.[step] ?? 0);
}

export function getSongStepLabel(song: GuidedSong, step: VoicingStep): string {
  const isFinalStep =
    song.availableSteps[song.availableSteps.length - 1] === step;
  const order = song.availableSteps.indexOf(step) + 1;
  if (step === 'root') return `Étape ${order} · Fondamentale seule`;
  if (step === 'root-5th') return `Étape ${order} · Fondamentale + Quinte`;
  if (step === 'triad') {
    return isFinalStep
      ? `Étape ${order} · Accord complet (Triade)`
      : `Étape ${order} · Triade (1 · 3 · 5)`;
  }
  return `Étape ${order} · Accord complet (7e)`;
}

export function getSongStepShortLabel(song: GuidedSong, step: VoicingStep): string {
  const isFinalStep =
    song.availableSteps[song.availableSteps.length - 1] === step;
  const order = song.availableSteps.indexOf(step) + 1;
  if (step === 'root') return `${order} · Fondamentale`;
  if (step === 'root-5th') return `${order} · Fond. + Quinte`;
  if (step === 'triad') {
    return isFinalStep ? `${order} · Accord complet` : `${order} · Triade`;
  }
  return `${order} · Accord complet`;
}

export function getStepProgressPercent(
  song: GuidedSong,
  songProgress: Record<string, SongProgress>,
): number {
  const progress = songProgress[song.id];
  if (!progress) return 0;
  const totalXpPossible = song.availableSteps.length * STEP_XP_TARGET;
  let earnedXp = 0;
  for (const step of song.availableSteps) {
    earnedXp += getSongStepXp(song.id, step, songProgress);
  }
  return Math.min(100, Math.round((earnedXp / totalXpPossible) * 100));
}

export function getRecommendedActiveSong(
  songProgress: Record<string, SongProgress>,
): GuidedSong {
  for (const song of GUIDED_SONGS) {
    const prog = songProgress[song.id];
    if (!prog) return song;
    const allCompleted = song.availableSteps.every((step) =>
      prog.completedSteps.includes(step),
    );
    if (!allCompleted) return song;
  }
  return GUIDED_SONGS[0];
}

export function getMaxStepIndex(step: VoicingStep): number {
  return VOICING_STEP_ORDER.indexOf(step);
}

export function getDefaultStepMetaLabel(step: VoicingStep): string {
  return VOICING_STEPS[step].labelFr;
}
