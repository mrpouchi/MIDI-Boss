import { Check, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { pianoSynth } from '../../audio/synth';
import { STEP_INTROS } from '../../content/stepIntros';
import { ChartChord, ChordChart, formatChartChord } from '../../music/chart';
import {
  NotationSystem,
  VoicingStep,
  formatPitchClass,
  getNewIntervalsForStep,
  getSuggestedVoicingMidi,
  getTargetIntervalsForStep,
  intervalNameFr,
} from '../../music/chords';
import { Mascot } from './Mascot';
import { VirtualKeyboard } from './VirtualKeyboard';

interface ChordDiscoveryProps {
  chart: ChordChart;
  step: VoicingStep;
  notation: NotationSystem;
  /** Song-specific tip (objective hint), shown under the general explanation. */
  hint?: string;
  activeNotes: number[];
  virtualLatchNotes: number[];
  onPressVirtualNote: (midi: number) => void;
  onReleaseVirtualNote: (midi: number) => void;
  onToggleLatchNote: (midi: number) => void;
  onClearVirtualLatchNotes: () => void;
}

/** The song's chords, each once, in order of first appearance. */
export function uniqueChartChords(chart: ChordChart): ChartChord[] {
  const seen = new Set<string>();
  const out: ChartChord[] = [];
  for (const bar of chart.bars) {
    for (const item of bar) {
      if (seen.has(item.chord.id)) continue;
      seen.add(item.chord.id);
      out.push(item);
    }
  }
  return out;
}

/**
 * "Découverte": before playing with the band, the learner sees every chord of
 * the song for this step, with the new note highlighted, hears it and tries it
 * at their own pace. No timer, no score, nothing saved.
 */
export function ChordDiscovery(props: ChordDiscoveryProps) {
  const { chart, step, notation, activeNotes } = props;
  const chords = useMemo(() => uniqueChartChords(chart), [chart]);
  const [selected, setSelected] = useState(0);
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const intro = STEP_INTROS[step];

  const item = chords[Math.min(selected, chords.length - 1)];
  const intervals = item ? getTargetIntervalsForStep(item.chord, step) : [];
  const fresh = new Set(item ? getNewIntervalsForStep(item.chord, step) : []);
  const required = intervals.map((i) => (item.chord.root + i) % 12);
  const voicing = item ? getSuggestedVoicingMidi(item.chord, 4, step) : [];
  const playedPcs = new Set(activeNotes.map((n) => ((n % 12) + 12) % 12));
  const isFound = required.length > 0 && required.every((pc) => playedPcs.has(pc));

  useEffect(() => {
    if (isFound && item && !found.has(item.chord.id)) {
      setFound((prev) => new Set(prev).add(item.chord.id));
    }
  }, [isFound, item, found]);

  if (!item) return null;
  const name = formatChartChord(item, notation);
  const allTried = chords.every((c) => found.has(c.chord.id));

  return (
    <div className="mb-enter w-full max-w-3xl">
      <div className="flex items-end gap-3">
        <Mascot size={88} mood={isFound ? 'happy' : 'listen'} className="shrink-0" />
        <div className="mb-6 rounded-2xl border-2 border-line bg-surface px-4 py-3">
          <p className="font-display text-lg font-semibold">{intro.title}</p>
          <p className="mt-1 font-semibold">{intro.explanation}</p>
          <p className="mt-2 text-sm font-bold text-muted">{intro.howTo}</p>
          {props.hint && <p className="mt-2 text-sm font-bold text-sky-press dark:text-sky">{props.hint}</p>}
        </div>
      </div>

      <p className="text-sm font-bold text-muted">
        Prenez votre temps : rien n’est chronométré ni noté. Voici les {chords.length} accord{chords.length > 1 ? 's' : ''} du
        morceau.
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="Accords du morceau">
        {chords.map((c, i) => {
          const active = i === selected;
          const ok = found.has(c.chord.id);
          return (
            <button
              key={c.chord.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(i)}
              className={`mb-btn mb-btn-sm ${active ? 'mb-btn-sky' : 'mb-btn-ghost'}`}
            >
              {ok && <Check className="h-4 w-4" strokeWidth={3} aria-label="essayé" />}
              {formatChartChord(c, notation)}
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-3xl border-2 border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <p className="font-display text-5xl font-bold" data-testid="discovery-chord">
            {name}
          </p>
          <button
            type="button"
            onClick={() => pianoSynth.playChordPreview(voicing, 1200)}
            className="mb-btn mb-btn-sm mb-btn-ghost"
          >
            <Volume2 className="h-4 w-4" /> Écouter
          </button>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-sm font-bold ${isFound ? 'bg-green text-white' : 'bg-mist text-muted'}`}
            aria-live="polite"
          >
            {isFound ? 'C’est ça !' : 'À vous d’essayer'}
          </span>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Notes à jouer">
          {intervals.map((interval) => {
            const pc = (item.chord.root + interval) % 12;
            const held = playedPcs.has(pc);
            const isNew = fresh.has(interval) && step !== 'root';
            return (
              <li
                key={interval}
                className={`rounded-2xl border-2 px-4 py-2 text-center transition-colors ${
                  held ? 'border-green bg-green/10' : isNew ? 'border-brass bg-brass/10' : 'border-line'
                }`}
              >
                <span className="block font-display text-2xl font-bold">{formatPitchClass(pc, notation)}</span>
                <span className="block text-xs font-bold text-muted">
                  {intervalNameFr(interval)}
                  {isNew && <span className="ml-1 rounded bg-brass px-1 text-ink">nouveau</span>}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-5">
          <VirtualKeyboard
            isOpen
            onToggleOpen={() => undefined}
            showExpectedHelper
            onToggleExpectedHelper={() => undefined}
            showNoteLabels
            latchMode={false}
            onToggleLatchMode={() => undefined}
            activeNotes={activeNotes}
            expectedPitchClasses={required}
            expectedVoicingNotes={voicing}
            notation={notation}
            onPressNote={props.onPressVirtualNote}
            onReleaseNote={props.onReleaseVirtualNote}
            onToggleLatchNote={props.onToggleLatchNote}
            onReleaseAllVirtual={props.onClearVirtualLatchNotes}
            onPlayPreview={() => pianoSynth.playChordPreview(voicing, 1200)}
            hasLatchedNotes={props.virtualLatchNotes.length > 0}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {selected < chords.length - 1 && (
          <button type="button" onClick={() => setSelected((i) => i + 1)} className="mb-btn mb-btn-ghost">
            Accord suivant
          </button>
        )}
        <span className="text-sm font-bold text-muted">
          {allTried ? 'Tous les accords sont trouvés.' : `${found.size}/${chords.length} essayés : ce n’est pas obligatoire.`}
        </span>
      </div>
    </div>
  );
}
