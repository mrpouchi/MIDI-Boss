import { ChordDefinition, ChordFamily, VoicingStep } from '../music/chords';

export type PracticeMode = 'lesson' | 'session' | 'progression';

/**
 * Future-ready exercise taxonomy so ear training and sight reading can plug
 * into the same session runner in V2.
 */
export type ExerciseKind = 'chord-play' | 'ear-training' | 'sight-reading';

export interface PracticeQueueItem {
  chord: ChordDefinition;
  step: VoicingStep;
  context: 'isolated' | 'progression';
  isNewConcept?: boolean;
  tip?: string;
}

export interface LessonConfig {
  mode: 'lesson';
  label: string;
  goalDescription: string;
  items: PracticeQueueItem[];
  tempoBpm: number;
  songId?: string;
  targetStep?: VoicingStep;
}

export interface SessionConfig {
  mode: 'session';
  label: string;
  families: ChordFamily[];
  step: VoicingStep;
  chordCount: number;
  tempoBpm: number;
  durationMinutes: number;
  targetChordIds?: string[];
}

export interface ProgressionConfig {
  mode: 'progression';
  label: string;
  rawInput: string;
  chords: ChordDefinition[];
  step: VoicingStep;
  tempoBpm: number;
  beatsPerChord: number;
  loopCount: number; // 0 = infinite loop until stopped
  songId?: string;
}

export type PracticeConfig = LessonConfig | SessionConfig | ProgressionConfig;

export type AttemptOutcome = 'correct' | 'error' | 'missed';

export interface AttemptRecord {
  chord: ChordDefinition;
  step: VoicingStep;
  context: 'isolated' | 'progression';
  outcome: AttemptOutcome;
  hadWrongNote: boolean;
  responseMs: number;
}

export interface SessionSummary {
  id: string;
  mode: PracticeMode;
  label: string;
  step?: VoicingStep;
  songId?: string;
  totalChords: number;
  correctCount: number;
  errorCount: number;
  missedCount: number;
  accuracy: number;
  avgResponseMs: number;
  durationSeconds: number;
  tempoBpm: number;
  families: ChordFamily[];
  chordsToReview: ChordDefinition[];
  attempts: AttemptRecord[];
  /** The session reached its natural end (not stopped early with the close button). */
  completedFully: boolean;
  /** For guided songs: this session validated `step` of `songId`. */
  songStepValidated: boolean;
}

export interface ProgressionPreset {
  id: string;
  name: string;
  subtitle: string;
  intlText: string;
  frText: string;
  tempoBpm: number;
}
