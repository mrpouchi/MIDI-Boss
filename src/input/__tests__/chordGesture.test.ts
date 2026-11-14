import { describe, expect, it } from 'vitest';
import { ChordGestureDetector, isValidGestureChord, toPitchClasses } from '../chordGesture';

const C_MAJOR = [0, 4, 7];

function strike(d: ChordGestureDetector, notes: number[], t: number) {
  let last = { streak: 0, fired: false };
  notes.forEach((n, i) => (last = d.noteOn(n, t + i * 5)));
  notes.forEach((n) => d.noteOff(n));
  return last;
}

describe('ChordGestureDetector', () => {
  it('fires on the third quick strike', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    expect(strike(d, [60, 64, 67], 0)).toEqual({ streak: 1, fired: false });
    expect(strike(d, [60, 64, 67], 400)).toEqual({ streak: 2, fired: false });
    expect(strike(d, [60, 64, 67], 800)).toEqual({ streak: 3, fired: true });
    expect(d.streak).toBe(0);
  });

  it('matches by pitch class, in any octave or inversion', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    strike(d, [48, 64, 67], 0);
    strike(d, [64, 67, 72], 300);
    expect(strike(d, [55, 60, 76], 600).fired).toBe(true);
  });

  it('restarts the count when strikes are too far apart', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    strike(d, [60, 64, 67], 0);
    strike(d, [60, 64, 67], 400);
    expect(strike(d, [60, 64, 67], 2000)).toEqual({ streak: 1, fired: false });
  });

  it('is broken by any other note in between', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    strike(d, [60, 64, 67], 0);
    strike(d, [60, 64, 67], 300);
    strike(d, [62, 65, 69], 500);
    expect(strike(d, [60, 64, 67], 700)).toEqual({ streak: 1, fired: false });
  });

  it('does not count a chord held down, nor an extra note on top', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    d.noteOn(60, 0);
    d.noteOn(64, 0);
    expect(d.noteOn(67, 0).streak).toBe(1);
    // Still held: re-pressing one key counts as a new strike only after the chord broke.
    d.noteOff(64);
    expect(d.noteOn(64, 200).streak).toBe(2);
    expect(d.noteOn(71, 300).streak).toBe(0);
  });

  it('moves one page only when the chord is hammered 6 times', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    const fired = [0, 300, 600, 900, 1200, 1500].map((t) => strike(d, [60, 64, 67], t).fired);
    expect(fired).toEqual([false, false, true, false, false, false]);
    // After a real pause, the gesture works again.
    strike(d, [60, 64, 67], 3200);
    strike(d, [60, 64, 67], 3500);
    expect(strike(d, [60, 64, 67], 3800).fired).toBe(true);
  });

  it('expires a streak with time alone', () => {
    const d = new ChordGestureDetector(C_MAJOR);
    strike(d, [60, 64, 67], 0);
    expect(d.expire(500)).toBe(false);
    expect(d.expire(1500)).toBe(true);
    expect(d.streak).toBe(0);
  });
});

describe('gesture chord helpers', () => {
  it('reduces notes to sorted pitch classes', () => {
    expect(toPitchClasses([67, 60, 64, 72])).toEqual([0, 4, 7]);
  });

  it('needs two different notes', () => {
    expect(isValidGestureChord([0])).toBe(false);
    expect(isValidGestureChord([0, 12])).toBe(false);
    expect(isValidGestureChord([0, 7])).toBe(true);
    expect(isValidGestureChord(undefined)).toBe(false);
  });
});
