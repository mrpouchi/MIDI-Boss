import { describe, expect, it } from 'vitest';
import {
  createChord,
  formatChordName,
  getStepIntervalLabels,
  getTargetPitchClassesForStep,
  parseChordToken,
} from '../chords';
import { validateChordInput } from '../validation';

describe('half-diminished and diminished chords', () => {
  const dm7b5 = createChord(2, 'm7b5'); // D F Ab C

  it('builds D m7♭5 = D F A♭ C', () => {
    expect(dm7b5.pitchClasses).toEqual([2, 5, 8, 0]);
    expect(formatChordName(dm7b5, 'intl')).toBe('Dm7♭5');
    expect(formatChordName(dm7b5, 'fr')).toBe('Rém7♭5');
  });

  it('keeps the diminished fifth in the root + fifth step', () => {
    expect(getTargetPitchClassesForStep(dm7b5, 'root-5th')).toEqual([2, 8]);
    expect(getStepIntervalLabels(dm7b5, 'root-5th')).toEqual(['1', '♭5']);
    expect(getTargetPitchClassesForStep(dm7b5, 'triad')).toEqual([2, 5, 8]);
  });

  it('validates a played m7♭5 in any inversion', () => {
    // F3 Ab3 C4 D4 (first inversion, as in Blue Bossa comping)
    expect(validateChordInput([53, 56, 60, 62], dm7b5, 'full').isComplete).toBe(true);
    // A natural fifth is wrong
    expect(validateChordInput([50, 53, 57, 60], dm7b5, 'full').hasWrongNotes).toBe(true);
  });

  it('parses common spellings', () => {
    for (const token of ['Dm7b5', 'Dm7♭5', 'Dø', 'D-7b5', 'Rém7b5']) {
      expect(parseChordToken(token)?.family).toBe('m7b5');
    }
    expect(parseChordToken('Bdim7')?.family).toBe('dim7');
    expect(parseChordToken('Bdim')?.family).toBe('dim');
    expect(parseChordToken('Cmaj7')?.family).toBe('maj7');
    expect(parseChordToken('Cm7')?.family).toBe('m7');
  });
});

describe('what each step introduces', () => {
  it('the third is new at the triad step, the seventh at the full step', async () => {
    const { createChord, getNewIntervalsForStep, intervalNameFr } = await import('../chords');
    const dm7 = createChord(2, 'm7');
    expect(getNewIntervalsForStep(dm7, 'root')).toEqual([0]);
    expect(getNewIntervalsForStep(dm7, 'root-5th')).toEqual([7]);
    expect(getNewIntervalsForStep(dm7, 'triad')).toEqual([3]);
    expect(getNewIntervalsForStep(dm7, 'full')).toEqual([10]);
    expect(intervalNameFr(3)).toBe('tierce mineure');
    expect(intervalNameFr(11)).toBe('septième majeure');
  });
});
