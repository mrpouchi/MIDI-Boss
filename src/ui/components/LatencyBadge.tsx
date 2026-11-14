import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pianoSynth } from '../../audio/synth';

/**
 * Key press → sound, measured on this computer: MIDI arrival + the browser's
 * audio output (which includes the output device, e.g. Bluetooth headphones).
 */
export function LatencyBadge() {
  const [info, setInfo] = useState(() => pianoSynth.getLatencyInfo());
  useEffect(() => {
    const id = window.setInterval(() => setInfo(pianoSynth.getLatencyInfo()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!info) return null;
  const total = Math.round(info.keyToSoundMs);
  const tone = total > 60 ? 'border-coral text-coral-press dark:text-coral' : total > 30 ? 'border-brass text-brass-press dark:text-brass' : 'border-line text-muted';
  const detail = [
    `Touche → son : ~${total} ms sur cet ordinateur.`,
    `Arrivée du MIDI : ${info.inputMs === null ? 'jouez une note pour la mesurer' : `${info.inputMs.toFixed(1)} ms`}.`,
    `Sortie audio : ${Math.round(info.totalMs)} ms${info.outputMs === 0 ? ' (estimation du navigateur)' : ''}.`,
    total > 60 ? 'C’est beaucoup : casque ou enceinte Bluetooth ? Branchez un casque filaire ou passez par la sortie du Mac.' : '',
  ].filter(Boolean).join('\n');
  return (
    <span title={detail} className={`hidden shrink-0 items-center gap-1 rounded-xl border-2 px-2 py-1 text-xs font-bold sm:flex ${tone}`}>
      <Timer className="h-3.5 w-3.5" aria-hidden="true" /> {total} ms
    </span>
  );
}
