import { makeChordId } from '../music/chords';
import { makeSpacedCardKey } from '../practice/spacedRepetition';
import {
  AppSettings,
  ChordStat,
  SessionRecord,
  SongProgress,
  SpacedCard,
  StoredData,
} from './types';
import {
  KeyValueStore,
  SHARED_KEY,
  browserStore,
  profileKey,
  readStoredJson,
  writeStoredJson,
} from './profiles';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  notation: 'intl',
  audioEnabled: true,
  audioVolume: 0.65,
  instrument: 'piano',
  metronomeEnabled: false,
  listenAndRepeatEnabled: true,
  showKeyboardHelper: true,
  showKeyboardNotes: true,
  dailyGoalChords: 20,
};

function daysAgoIso(daysAgo: number, hour = 18): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
}

function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

export function createDemoData(settings: AppSettings = DEFAULT_SETTINGS): StoredData {
  const chordStats: Record<string, ChordStat> = {
    [makeChordId(0, 'maj')]: {
      chordId: makeChordId(0, 'maj'),
      attempts: 14,
      correct: 13,
      errors: 1,
      missed: 0,
      avgResponseMs: 1240,
      lastPracticedAt: daysAgoIso(0, 9),
      isolatedAttempts: 8,
      isolatedCorrect: 8,
      progressionAttempts: 6,
      progressionCorrect: 5,
    },
    [makeChordId(7, 'maj')]: {
      chordId: makeChordId(7, 'maj'),
      attempts: 11,
      correct: 10,
      errors: 1,
      missed: 0,
      avgResponseMs: 1380,
      lastPracticedAt: daysAgoIso(1),
      isolatedAttempts: 6,
      isolatedCorrect: 6,
      progressionAttempts: 5,
      progressionCorrect: 4,
    },
    [makeChordId(9, 'min')]: {
      chordId: makeChordId(9, 'min'),
      attempts: 12,
      correct: 11,
      errors: 1,
      missed: 0,
      avgResponseMs: 1310,
      lastPracticedAt: daysAgoIso(0, 9),
      isolatedAttempts: 7,
      isolatedCorrect: 7,
      progressionAttempts: 5,
      progressionCorrect: 4,
    },
    [makeChordId(5, 'maj')]: {
      chordId: makeChordId(5, 'maj'),
      attempts: 10,
      correct: 9,
      errors: 1,
      missed: 0,
      avgResponseMs: 1450,
      lastPracticedAt: daysAgoIso(2),
      isolatedAttempts: 6,
      isolatedCorrect: 6,
      progressionAttempts: 4,
      progressionCorrect: 3,
    },
    [makeChordId(0, 'maj7')]: {
      chordId: makeChordId(0, 'maj7'),
      attempts: 10,
      correct: 7,
      errors: 2,
      missed: 1,
      avgResponseMs: 2080,
      lastPracticedAt: daysAgoIso(1),
      isolatedAttempts: 5,
      isolatedCorrect: 5,
      progressionAttempts: 5,
      progressionCorrect: 2,
    },
    [makeChordId(2, 'm7')]: {
      chordId: makeChordId(2, 'm7'),
      attempts: 10,
      correct: 8,
      errors: 2,
      missed: 0,
      avgResponseMs: 1890,
      lastPracticedAt: daysAgoIso(0, 9),
      isolatedAttempts: 5,
      isolatedCorrect: 4,
      progressionAttempts: 5,
      progressionCorrect: 4,
    },
    [makeChordId(7, '7')]: {
      chordId: makeChordId(7, '7'),
      attempts: 11,
      correct: 8,
      errors: 2,
      missed: 1,
      avgResponseMs: 2150,
      lastPracticedAt: daysAgoIso(1),
    },
    [makeChordId(2, 'sus4')]: {
      chordId: makeChordId(2, 'sus4'),
      attempts: 8,
      correct: 4,
      errors: 3,
      missed: 1,
      avgResponseMs: 2790,
      lastPracticedAt: daysAgoIso(2),
    },
    [makeChordId(10, '7')]: {
      chordId: makeChordId(10, '7'),
      attempts: 6,
      correct: 3,
      errors: 2,
      missed: 1,
      avgResponseMs: 3020,
      lastPracticedAt: daysAgoIso(4),
    },
  };

  const spacedCards: Record<string, SpacedCard> = {
    [makeSpacedCardKey(makeChordId(0, 'maj'), 'root')]: {
      key: makeSpacedCardKey(makeChordId(0, 'maj'), 'root'),
      chordId: makeChordId(0, 'maj'),
      step: 'root',
      masteryLevel: 5,
      intervalHours: 168,
      nextReviewAt: hoursFromNowIso(96),
      lastPracticedAt: daysAgoIso(1),
      consecutiveCorrect: 5,
      lapses: 0,
    },
    [makeSpacedCardKey(makeChordId(7, 'maj'), 'root-5th')]: {
      key: makeSpacedCardKey(makeChordId(7, 'maj'), 'root-5th'),
      chordId: makeChordId(7, 'maj'),
      step: 'root-5th',
      masteryLevel: 2,
      intervalHours: 24,
      nextReviewAt: hoursFromNowIso(-2), // Due today
      lastPracticedAt: daysAgoIso(1),
      consecutiveCorrect: 2,
      lapses: 0,
    },
    [makeSpacedCardKey(makeChordId(9, 'min'), 'root-5th')]: {
      key: makeSpacedCardKey(makeChordId(9, 'min'), 'root-5th'),
      chordId: makeChordId(9, 'min'),
      step: 'root-5th',
      masteryLevel: 2,
      intervalHours: 24,
      nextReviewAt: hoursFromNowIso(-1), // Due today
      lastPracticedAt: daysAgoIso(1),
      consecutiveCorrect: 2,
      lapses: 0,
    },
    [makeSpacedCardKey(makeChordId(2, 'm7'), 'triad')]: {
      key: makeSpacedCardKey(makeChordId(2, 'm7'), 'triad'),
      chordId: makeChordId(2, 'm7'),
      step: 'triad',
      masteryLevel: 1,
      intervalHours: 6,
      nextReviewAt: hoursFromNowIso(-3), // Due today
      lastPracticedAt: daysAgoIso(2),
      consecutiveCorrect: 1,
      lapses: 1,
    },
    [makeSpacedCardKey(makeChordId(0, 'maj7'), 'full')]: {
      key: makeSpacedCardKey(makeChordId(0, 'maj7'), 'full'),
      chordId: makeChordId(0, 'maj7'),
      step: 'full',
      masteryLevel: 1,
      intervalHours: 4,
      nextReviewAt: hoursFromNowIso(-4), // Due today
      lastPracticedAt: daysAgoIso(1),
      consecutiveCorrect: 0,
      lapses: 2,
    },
  };

  const songProgress: Record<string, SongProgress> = {
    'song-pop-do': {
      songId: 'song-pop-do',
      unlockedStep: 'root-5th',
      completedSteps: ['root'],
      lastPracticedAt: daysAgoIso(1),
    },
    'song-lune-mineure': {
      songId: 'song-lune-mineure',
      unlockedStep: 'root',
      completedSteps: [],
      lastPracticedAt: daysAgoIso(2),
    },
  };

  const sessions: SessionRecord[] = [
    {
      id: 'demo-5',
      date: daysAgoIso(0, 9),
      mode: 'lesson',
      label: 'Leçon du jour · Ballade Pop en Do',
      totalChords: 8,
      correctCount: 7,
      errorCount: 1,
      missedCount: 0,
      accuracy: 88,
      durationSeconds: 155,
      tempoBpm: 72,
      families: ['maj', 'min'],
    },
    {
      id: 'demo-4',
      date: daysAgoIso(1),
      mode: 'progression',
      label: 'II–V–I en Do · Fondamentale + Quinte',
      totalChords: 9,
      correctCount: 8,
      errorCount: 1,
      missedCount: 0,
      accuracy: 89,
      durationSeconds: 145,
      tempoBpm: 68,
      families: ['m7', '7', 'maj7'],
    },
    {
      id: 'demo-3',
      date: daysAgoIso(2),
      mode: 'session',
      label: 'Accords suspendus',
      totalChords: 10,
      correctCount: 7,
      errorCount: 2,
      missedCount: 1,
      accuracy: 70,
      durationSeconds: 175,
      tempoBpm: 75,
      families: ['sus2', 'sus4', 'maj'],
    },
    {
      id: 'demo-2',
      date: daysAgoIso(4),
      mode: 'progression',
      label: 'Ballade Pop en Do · Fondamentale',
      totalChords: 12,
      correctCount: 11,
      errorCount: 1,
      missedCount: 0,
      accuracy: 92,
      durationSeconds: 140,
      tempoBpm: 72,
      families: ['maj', 'min'],
    },
  ];

  return {
    version: 1,
    isDemoData: true,
    settings,
    chordStats,
    spacedCards,
    songProgress,
    sessions,
  };
}

/**
 * Loads one profile's save, merged with what all profiles share (iReal
 * library, MIDI mixes). A new profile starts empty: no demo data.
 */
export function loadStoredData(profileId: string, store: KeyValueStore | null = browserStore()): StoredData {
  const parsed = readStoredJson<Partial<StoredData>>(store, profileKey(profileId)) ?? {};
  const shared = readStoredJson<Partial<StoredData>>(store, SHARED_KEY) ?? {};
  return {
    version: 1,
    isDemoData: Boolean(parsed.isDemoData),
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
    },
    chordStats: parsed.chordStats ?? {},
    spacedCards: parsed.spacedCards ?? {},
    songProgress: parsed.songProgress ?? {},
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    playAlongRuns: Array.isArray(parsed.playAlongRuns) ? parsed.playAlongRuns : [],
    irealLibrary: Array.isArray(shared.irealLibrary) ? shared.irealLibrary : [],
    midiSetups: shared.midiSetups ?? {},
  };
}

/** Saves a profile's progress, and the shared library/mixes, in separate keys. */
export function saveStoredData(profileId: string, data: StoredData, store: KeyValueStore | null = browserStore()): void {
  const { irealLibrary, midiSetups, ...progress } = data;
  writeStoredJson(store, profileKey(profileId), progress);
  writeStoredJson(store, SHARED_KEY, { irealLibrary: irealLibrary ?? [], midiSetups: midiSetups ?? {} });
}

export function createEmptyData(settings: AppSettings): StoredData {
  return {
    version: 1,
    isDemoData: false,
    settings,
    chordStats: {},
    spacedCards: {},
    songProgress: {},
    sessions: [],
    irealLibrary: [],
    midiSetups: {},
  };
}
