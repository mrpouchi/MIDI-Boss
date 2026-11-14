import { describe, expect, it } from 'vitest';
import { createChord, VoicingStep } from '../../music/chords';
import { GUIDED_SONGS, getSongChords, isSongStepValidated } from '../curriculum';
import { AttemptRecord } from '../types';

const song = GUIDED_SONGS[0]; // C – G – Am – F
const songChords = getSongChords(song, 'intl');

function attempt(chordIndex: number, step: VoicingStep, ok = true): AttemptRecord {
  return {
    chord: songChords[chordIndex],
    step,
    context: 'progression',
    outcome: ok ? 'correct' : 'error',
    hadWrongNote: !ok,
    responseMs: 900,
  };
}

describe('isSongStepValidated', () => {
  const allRoot = songChords.map((_, i) => attempt(i, 'root'));

  it('validates a full session covering every chord', () => {
    expect(isSongStepValidated({ song, step: 'root', attempts: allRoot, completedFully: true })).toBe(true);
  });

  it('never validates a session stopped early', () => {
    expect(isSongStepValidated({ song, step: 'root', attempts: allRoot, completedFully: false })).toBe(false);
  });

  it('requires every chord of the song', () => {
    expect(
      isSongStepValidated({ song, step: 'root', attempts: allRoot.slice(0, 1), completedFully: true }),
    ).toBe(false);
  });

  it('ignores review chords that are not in the song or at another step', () => {
    const unrelated: AttemptRecord = { ...attempt(0, 'full'), chord: createChord(0, 'maj7') };
    expect(
      isSongStepValidated({ song, step: 'root', attempts: [unrelated, attempt(0, 'full')], completedFully: true }),
    ).toBe(false);
  });

  it('requires 80 % accuracy on the song chords', () => {
    const shaky = [...allRoot, attempt(0, 'root', false), attempt(1, 'root', false)];
    expect(isSongStepValidated({ song, step: 'root', attempts: shaky, completedFully: true })).toBe(false);
  });
});
