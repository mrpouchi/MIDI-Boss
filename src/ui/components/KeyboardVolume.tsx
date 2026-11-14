import { Volume2 } from 'lucide-react';
import { MAX_AUDIO_VOLUME } from '../../audio/synth';

interface KeyboardVolumeProps {
  value: number;
  onChange: (volume: number) => void;
  /** Compact = icon + slider + %, for headers. */
  compact?: boolean;
}

/** Volume of the keyboard's own sound, 10 % to 300 % (100 % = the original level). */
export function KeyboardVolume({ value, onChange, compact }: KeyboardVolumeProps) {
  const percent = Math.round(value * 100);
  const boosted = value > 1;
  const slider = (
    <input
      type="range"
      min={0.1}
      max={MAX_AUDIO_VOLUME}
      step={0.05}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onDoubleClick={() => onChange(1)}
      aria-label="Volume du clavier"
      aria-valuetext={`${percent} %`}
      className={`min-w-0 flex-1 ${boosted ? 'accent-brass' : 'accent-sky'}`}
    />
  );
  const label = (
    <span className={`font-mono-tabular text-right ${boosted ? 'font-bold text-brass-press dark:text-brass' : ''}`}>
      {percent} %
    </span>
  );

  if (compact) {
    return (
      <label className="flex w-40 shrink-0 items-center gap-2 text-sm text-muted sm:w-48" title="Volume du clavier (double-clic : 100 %)">
        <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {slider}
        <span className="w-11">{label}</span>
      </label>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Volume du clavier</span>
        {label}
      </div>
      <div className="mt-2 flex">{slider}</div>
      <p className="mt-1 text-[11px] text-muted">
        Au-delà de 100 %, le son est amplifié (jusqu’à 300 %). Double-clic sur le curseur : retour à 100 %.
      </p>
    </div>
  );
}
