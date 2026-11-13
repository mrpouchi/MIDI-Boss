import {
  ALL_CHORD_FAMILIES,
  ChordDefinition,
  ChordFamily,
  VoicingStep,
  createChord,
  parseChordId,
} from '../music/chords';
import {
  AttemptRecord,
  PracticeMode,
  ProgressionPreset,
  SessionConfig,
  SessionSummary,
} from './types';

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: 'ii-v-i-c',
    name: 'II–V–I en Do',
    subtitle: 'Cadence jazz essentielle',
    intlText: 'Dm7 – G7 – Cmaj7',
    frText: 'Rém7 – Sol7 – Do7M',
    tempoBpm: 72,
  },
  {
    id: 'pop-four',
    name: 'Suite Pop 4 accords',
    subtitle: 'Enchaînement fluide majeur / mineur',
    intlText: 'C – G – Am – F',
    frText: 'Do – Sol – Lam – Fa',
    tempoBpm: 84,
  },
  {
    id: 'anatole',
    name: 'Anatole en Do',
    subtitle: 'Couleurs 7e et mineur 7',
    intlText: 'Cmaj7 – Am7 – Dm7 – G7',
    frText: 'Do7M – Lam7 – Rém7 – Sol7',
    tempoBpm: 76,
  },
  {
    id: 'sus-ballad',
    name: 'Ballade suspendue',
    subtitle: 'Couleurs sus2 et sus4',
    intlText: 'Dsus2 – D – Asus4 – A',
    frText: 'Résus2 – Ré – Lasus4 – La',
    tempoBpm: 68,
  },
];

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  mode: 'session',
  label: 'Session équilibrée',
  families: ['maj', 'min', '7', 'maj7', 'm7'],
  step: 'full',
  chordCount: 12,
  tempoBpm: 76,
  durationMinutes: 5,
};

const COMMON_ROOTS = [0, 2, 4, 5, 7, 9, 10, 3, 8, 1, 6, 11];

export function generateSessionChords(config: SessionConfig): ChordDefinition[] {
  if (config.targetChordIds && config.targetChordIds.length > 0) {
    const targeted = config.targetChordIds
      .map(parseChordId)
      .filter((c): c is ChordDefinition => c !== null);

    if (targeted.length > 0) {
      const result: ChordDefinition[] = [];
      let prevId = '';
      for (let i = 0; i < config.chordCount; i++) {
        const candidates = targeted.filter((c) => c.id !== prevId);
        const pool = candidates.length > 0 ? candidates : targeted;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        result.push(pick);
        prevId = pick.id;
      }
      return result;
    }
  }

  const families: ChordFamily[] =
    config.families.length > 0 ? config.families : ALL_CHORD_FAMILIES;

  const pool: ChordDefinition[] = [];
  for (const root of COMMON_ROOTS) {
    for (const family of families) {
      pool.push(createChord(root, family));
    }
  }

  const result: ChordDefinition[] = [];
  let prevId = '';
  for (let i = 0; i < config.chordCount; i++) {
    const filtered = pool.filter((c) => c.id !== prevId);
    const source = filtered.length > 0 ? filtered : pool;
    const weightedIndex =
      Math.random() < 0.72
        ? Math.floor(Math.random() * Math.min(source.length, families.length * 7))
        : Math.floor(Math.random() * source.length);
    const chosen = source[weightedIndex] ?? source[0];
    result.push(chosen);
    prevId = chosen.id;
  }

  return result;
}

export function buildSessionSummary(params: {
  mode: PracticeMode;
  label: string;
  step?: VoicingStep;
  songId?: string;
  attempts: AttemptRecord[];
  durationSeconds: number;
  tempoBpm: number;
  families: ChordFamily[];
}): SessionSummary {
  const { mode, label, step, songId, attempts, durationSeconds, tempoBpm, families } =
    params;

  const totalChords = attempts.length;
  const correctCount = attempts.filter((a) => a.outcome === 'correct').length;
  const errorCount = attempts.filter((a) => a.outcome === 'error').length;
  const missedCount = attempts.filter((a) => a.outcome === 'missed').length;

  const accuracy =
    totalChords > 0 ? Math.round((correctCount / totalChords) * 100) : 0;

  const validResponseTimes = attempts
    .filter((a) => a.outcome !== 'missed' && a.responseMs > 0)
    .map((a) => a.responseMs);
  const avgResponseMs =
    validResponseTimes.length > 0
      ? Math.round(
          validResponseTimes.reduce((sum, v) => sum + v, 0) /
            validResponseTimes.length,
        )
      : 0;

  const reviewMap = new Map<string, ChordDefinition>();
  for (const attempt of attempts) {
    if (attempt.outcome !== 'correct' || attempt.hadWrongNote) {
      reviewMap.set(attempt.chord.id, attempt.chord);
    }
  }

  return {
    id: `sess-${Date.now()}`,
    mode,
    label,
    step,
    songId,
    totalChords,
    correctCount,
    errorCount,
    missedCount,
    accuracy,
    avgResponseMs,
    durationSeconds: Math.max(1, Math.round(durationSeconds)),
    tempoBpm,
    families,
    chordsToReview: Array.from(reviewMap.values()),
    attempts,
  };
}
