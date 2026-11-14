import { useEffect, useRef, useState } from 'react';
import { ChordGestureDetector, isValidGestureChord } from './chordGesture';
import { NoteEventListener } from './types';

/**
 * Listens to the note stream and calls `onFire` when the gesture chord is
 * struck 3 times in a row. Returns the current streak (0..2) for display.
 */
export function useChordGesture(
  subscribe: (listener: NoteEventListener) => () => void,
  chord: number[] | undefined,
  enabled: boolean,
  onFire: () => void,
): number {
  const [streak, setStreak] = useState(0);
  const fireRef = useRef(onFire);
  fireRef.current = onFire;
  const key = isValidGestureChord(chord) ? chord.join(',') : '';

  useEffect(() => {
    setStreak(0);
    if (!enabled || !key) return;
    const detector = new ChordGestureDetector(key.split(',').map(Number));
    const unsubscribe = subscribe((note, on, timeMs) => {
      if (!on) {
        detector.noteOff(note);
        return;
      }
      const update = detector.noteOn(note, timeMs);
      setStreak(update.fired ? 0 : update.streak);
      if (update.fired) fireRef.current();
    });
    const timer = window.setInterval(() => {
      if (detector.expire(performance.now())) setStreak(0);
    }, 200);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [subscribe, key, enabled]);

  return streak;
}
