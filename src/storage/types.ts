import { ChordFamily, NotationSystem, VoicingStep } from '../music/chords';

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  theme: ThemeMode;
  notation: NotationSystem;
  audioEnabled: boolean;
  audioVolume: number;
  metronomeEnabled: boolean;
  showKeyboardHelper: boolean;
  showKeyboardNotes: boolean;
  dailyGoalChords: number;
}

export interface ChordStat {
  chordId: string;
  attempts: number;
  correct: number;
  errors: number;
  missed: number;
  avgResponseMs: number;
  lastPracticedAt: string;
  isolatedAttempts?: number;
  isolatedCorrect?: number;
  progressionAttempts?: number;
  progressionCorrect?: number;
}

export interface SpacedCard {
  key: string; // `${chordId}@${step}`
  chordId: string;
  step: VoicingStep;
  masteryLevel: number; // 0..5
  intervalHours: number;
  nextReviewAt: string;
  lastPracticedAt: string;
  consecutiveCorrect: number;
  lapses: number;
}

export interface SongProgress {
  songId: string;
  unlockedStep: VoicingStep;
  completedSteps: VoicingStep[];
  stepXp?: Partial<Record<VoicingStep, number>>;
  lastPracticedAt: string;
}

export interface SessionRecord {
  id: string;
  date: string;
  mode: 'session' | 'progression' | 'lesson';
  label: string;
  totalChords: number;
  correctCount: number;
  errorCount: number;
  missedCount: number;
  accuracy: number;
  durationSeconds: number;
  tempoBpm: number;
  families: ChordFamily[];
}

export interface StoredData {
  version: 1;
  isDemoData: boolean;
  settings: AppSettings;
  chordStats: Record<string, ChordStat>;
  spacedCards: Record<string, SpacedCard>;
  songProgress: Record<string, SongProgress>;
  sessions: SessionRecord[];
}
