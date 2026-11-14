import {
  ChordDefinition,
  NotationSystem,
  VoicingStep,
  formatPitchClass,
  getOptionalPitchClassesForStep,
  getTargetPitchClassesForStep,
} from './chords';

export interface ValidationResult {
  isComplete: boolean;
  hasWrongNotes: boolean;
  activePitchClasses: number[];
  matchedPitchClasses: number[];
  missingPitchClasses: number[];
  extraPitchClasses: number[];
  progressRatio: number;
}

/**
 * Validates active MIDI notes against a target chord and voicing step using pitch-class equivalence.
 * Accepts inversions, octave shifts, and doubled notes across hands.
 */
export function validateChordInput(
  activeMidiNotes: number[],
  target: ChordDefinition,
  step: VoicingStep = 'full',
): ValidationResult {
  const expectedList = getTargetPitchClassesForStep(target, step);
  const activeSet = new Set<number>(
    activeMidiNotes.map((note) => ((note % 12) + 12) % 12),
  );
  const expectedSet = new Set<number>(expectedList);
  const optional = new Set<number>(getOptionalPitchClassesForStep(target, step));

  const matchedPitchClasses = expectedList.filter((pc) => activeSet.has(pc));
  const missingPitchClasses = expectedList.filter((pc) => !activeSet.has(pc));
  const extraPitchClasses = Array.from(activeSet).filter((pc) => !expectedSet.has(pc) && !optional.has(pc));

  const isComplete =
    missingPitchClasses.length === 0 &&
    extraPitchClasses.length === 0 &&
    matchedPitchClasses.length === expectedSet.size;

  const hasWrongNotes = extraPitchClasses.length > 0;
  const progressRatio =
    expectedList.length > 0 ? matchedPitchClasses.length / expectedList.length : 0;

  return {
    isComplete,
    hasWrongNotes,
    activePitchClasses: Array.from(activeSet),
    matchedPitchClasses,
    missingPitchClasses,
    extraPitchClasses,
    progressRatio,
  };
}

export function formatActiveNotes(
  activeMidiNotes: number[],
  notation: NotationSystem,
): string[] {
  const sortedUnique = Array.from(new Set(activeMidiNotes)).sort((a, b) => a - b);
  return sortedUnique.map((midi) => {
    const octave = Math.floor(midi / 12) - 1;
    return `${formatPitchClass(midi, notation)}${octave}`;
  });
}
