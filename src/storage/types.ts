import { ChordFamily, NotationSystem, VoicingStep } from '../music/chords';
import { IrealSong } from '../music/ireal';

export type ThemeMode = 'dark' | 'light';

export type InstrumentId = 'piano' | 'rhodes' | 'vibraphone' | 'organ';

export interface AppSettings {
  theme: ThemeMode;
  notation: NotationSystem;
  audioEnabled: boolean;
  audioVolume: number;
  instrument: InstrumentId;
  metronomeEnabled: boolean;
  /** Beginner flow: hear each target first, then reproduce it on the keyboard. */
  listenAndRepeatEnabled: boolean;
  showKeyboardHelper: boolean;
  showKeyboardNotes: boolean;
  dailyGoalChords: number;
  /** Play-along: compensates audio output + input latency (ms). Optional for old saves. */
  playAlongLatencyMs?: number;
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
  /** @deprecated XP was removed; old saves may still contain it. Never read. */
  stepXp?: Partial<Record<VoicingStep, number>>;
  lastPracticedAt: string;
}

export interface MidiSongSetup {
  presets: Record<string, string>;
  volumes: Record<string, number>;
}

export interface StoredMidiSetup {
  fileName: string;
  size: number;
  updatedAt: string;
  setup: MidiSongSetup;
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

export interface PlayAlongRun {
  id: string;
  date: string;
  songTitle: string;
  step: VoicingStep;
  bpm: number;
  /** Tempo of the original file, to tell slow / medium / original runs apart. */
  originalBpm?: number;
  /** Chords to play / found / on time. */
  total: number;
  found: number;
  onTime: number;
  noteAccuracy: number;
  timingAccuracy: number;
  meanOffsetMs: number | null;
  /** The run reached the end of the song. */
  completed: boolean;
}

export interface StoredData {
  version: 1;
  isDemoData: boolean;
  settings: AppSettings;
  chordStats: Record<string, ChordStat>;
  spacedCards: Record<string, SpacedCard>;
  songProgress: Record<string, SongProgress>;
  sessions: SessionRecord[];
  irealLibrary?: IrealSong[];
  /** Results of "play with the band" runs (rhythm evidence). Optional for old saves. */
  playAlongRuns?: PlayAlongRun[];
  midiSetups?: Record<string, StoredMidiSetup>;
}
