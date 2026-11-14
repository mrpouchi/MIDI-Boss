import { Activity, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MidiRawEvent, MidiRawListener } from '../../input/midi';
import { NotationSystem, formatPitchClass } from '../../music/chords';

interface MidiMonitorProps {
  subscribe: (listener: MidiRawListener) => () => void;
  notation: NotationSystem;
}

interface MonitorRow {
  id: number;
  timeMs: number;
  deltaMs: number | null;
  label: string;
  detail: string;
  tone: 'on' | 'off' | 'other';
}

const MAX_ROWS = 24;

function noteName(note: number, notation: NotationSystem): string {
  return `${formatPitchClass(note, notation)}${Math.floor(note / 12) - 1}`;
}

/**
 * Shows the raw MIDI stream exactly as the browser receives it. It lets the
 * user check facts we must not assume — e.g. whether a mono/paraphonic synth
 * such as the Bass Station II sends one Note On per held key — and how far
 * apart the notes of a "simultaneous" chord really arrive.
 */
export function MidiMonitor({ subscribe, notation }: MidiMonitorProps) {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [heldCount, setHeldCount] = useState(0);
  const [maxHeld, setMaxHeld] = useState(0);
  const heldRef = useRef(new Set<number>());
  const lastTimeRef = useRef<number | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const listener = (event: MidiRawEvent) => {
      const { message, timeMs } = event;
      let label: string;
      let detail: string;
      let tone: MonitorRow['tone'] = 'other';

      if (message.kind === 'note-on') {
        heldRef.current.add(message.note);
        label = `Note On ${noteName(message.note, notation)}`;
        detail = `vél. ${message.velocity} · canal ${message.channel}`;
        tone = 'on';
      } else if (message.kind === 'note-off') {
        heldRef.current.delete(message.note);
        label = `Note Off ${noteName(message.note, notation)}`;
        detail = `canal ${message.channel}`;
        tone = 'off';
      } else if (message.kind === 'control-change') {
        label = `CC ${message.controller}`;
        detail = `valeur ${message.value} · canal ${message.channel}`;
      } else {
        label = `Message 0x${message.status.toString(16).toUpperCase()}`;
        detail = '';
      }

      const deltaMs = lastTimeRef.current === null ? null : timeMs - lastTimeRef.current;
      lastTimeRef.current = timeMs;
      const held = heldRef.current.size;
      setHeldCount(held);
      setMaxHeld((m) => Math.max(m, held));
      idRef.current += 1;
      const row: MonitorRow = { id: idRef.current, timeMs, deltaMs, label, detail, tone };
      setRows((prev) => [row, ...prev].slice(0, MAX_ROWS));
    };
    return subscribe(listener);
  }, [subscribe, notation]);

  const reset = () => {
    setRows([]);
    setMaxHeld(heldRef.current.size);
    lastTimeRef.current = null;
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5 text-xs text-stone-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-semibold">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Moniteur MIDI
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          Effacer
        </button>
      </div>
      <p className="mt-1.5 text-stone-500 dark:text-slate-400">
        Tenez un accord : le nombre de notes tenues simultanément indique si votre clavier
        transmet bien chaque touche.
      </p>
      <p className="mt-2 font-mono-tabular">
        Notes tenues : <strong>{heldCount}</strong> · maximum observé : <strong>{maxHeld}</strong>
      </p>
      <ol className="mt-2 max-h-48 space-y-0.5 overflow-y-auto font-mono-tabular" aria-live="off">
        {rows.length === 0 && (
          <li className="text-stone-400 dark:text-slate-500">Aucun message reçu pour l’instant.</li>
        )}
        {rows.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-2">
            <span
              className={
                row.tone === 'on'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : row.tone === 'off'
                    ? 'text-stone-500 dark:text-slate-400'
                    : 'text-sky-700 dark:text-sky-300'
              }
            >
              {row.label} <span className="text-stone-400 dark:text-slate-500">{row.detail}</span>
            </span>
            <span className="shrink-0 text-stone-400 dark:text-slate-500">
              {row.deltaMs === null ? '—' : `+${row.deltaMs.toFixed(1)} ms`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
