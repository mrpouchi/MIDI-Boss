import { Hand } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isValidGestureChord, toPitchClasses } from '../../input/chordGesture';
import { NotationSystem, formatChordName, formatPitchClass, identifyChord } from '../../music/chords';

interface GestureChordSettingProps {
  value: number[] | undefined;
  onChange: (pitchClasses: number[] | undefined) => void;
  activeNotes: number[];
  notation: NotationSystem;
  /** One line, for a header. */
  compact?: boolean;
}

export function gestureChordLabel(pcs: number[], notation: NotationSystem): string {
  const chord = identifyChord(pcs);
  return chord ? formatChordName(chord, notation) : pcs.map((p) => formatPitchClass(p, notation)).join(' ');
}

/**
 * Records the "Suivant" chord: the learner clicks, plays the chord, releases.
 * The largest set of notes held together is kept.
 */
export function GestureChordSetting({ value, onChange, activeNotes, notation, compact }: GestureChordSettingProps) {
  const [capturing, setCapturing] = useState(false);
  const [tooSmall, setTooSmall] = useState(false);
  const peakRef = useRef<number[]>([]);

  useEffect(() => {
    if (!capturing) return;
    const pcs = toPitchClasses(activeNotes);
    if (pcs.length > peakRef.current.length) peakRef.current = pcs;
    if (activeNotes.length === 0 && peakRef.current.length > 0) {
      if (isValidGestureChord(peakRef.current)) {
        onChange(peakRef.current);
        setCapturing(false);
        setTooSmall(false);
      } else {
        setTooSmall(true);
      }
      peakRef.current = [];
    }
  }, [activeNotes, capturing, onChange]);

  const startCapture = () => {
    peakRef.current = [];
    setTooSmall(false);
    setCapturing(true);
  };

  const status = capturing
    ? tooSmall
      ? 'Au moins 2 notes différentes : rejouez.'
      : 'Jouez votre accord puis relâchez…'
    : isValidGestureChord(value)
      ? `${gestureChordLabel(value, notation)} ×3`
      : 'Aucun accord';

  if (compact) {
    return (
      <button
        type="button"
        onClick={capturing ? () => setCapturing(false) : startCapture}
        title="Accord « Suivant » : jouez-le 3 fois d’affilée, vite, pour passer à l’étape suivante sans souris. Cliquez pour le changer."
        className={`flex shrink-0 items-center gap-1.5 rounded-xl border-2 px-2.5 py-1 text-sm font-bold ${
          capturing ? 'border-brass bg-brass/15 text-text' : 'border-line text-muted hover:text-text'
        }`}
      >
        <Hand className="h-4 w-4" aria-hidden="true" />
        <span className="hidden md:inline">Suivant :</span> {status}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Accord « Suivant »</span>
        <span className="font-bold text-text">{status}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Jouez-le 3 fois d’affilée, vite : l’écran passe à l’étape suivante (accord suivant, lancer le morceau,
        rejouer). Plus besoin de la souris.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={capturing ? () => setCapturing(false) : startCapture}
          className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${capturing ? 'border-brass bg-brass/15' : 'border-line text-muted hover:text-text'}`}
        >
          {capturing ? 'Annuler' : isValidGestureChord(value) ? 'Changer' : 'Choisir mon accord'}
        </button>
        {isValidGestureChord(value) && !capturing && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded-xl border-2 border-line px-3 py-1.5 text-sm font-bold text-muted hover:text-text"
          >
            Retirer
          </button>
        )}
      </div>
    </div>
  );
}
