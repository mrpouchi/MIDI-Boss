import { Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackingTrack } from '../../audio/backingTrack';
import { analyzeMidi } from '../../audio/midiFile';
import { pianoSynth } from '../../audio/synth';
import { LocalSongFile } from '../../content/localSongs';
import { NoteEventListener } from '../../input/types';
import { ChartChord, ChordChart, formatChartChord } from '../../music/chart';
import {
  NotationSystem,
  VOICING_STEPS,
  VOICING_STEP_ORDER,
  VoicingStep,
  getTargetPitchClassesForStep,
  getSuggestedVoicingMidi,
} from '../../music/chords';
import { IrealSong, decodeIrealChart } from '../../music/ireal';
import { buildSessionSummary } from '../../practice/engine';
import {
  ChordResult,
  PlayAlongScorer,
  PlayAlongSummary,
  Timeline,
  buildTimeline,
  chordIndexAt,
  defaultScorerOptions,
  summarize,
} from '../../practice/playAlong';
import { AttemptRecord, SessionSummary } from '../../practice/types';
import { AppSettings, PlayAlongRun } from '../../storage/types';
import { PathSong, SongObjective, TEMPO_LABEL, TempoLevel, resolveTempo } from '../../content/songPath';
import { runMeetsObjective } from '../../practice/songProgress';
import { Mascot, MascotMood } from '../components/Mascot';
import { VirtualKeyboard } from '../components/VirtualKeyboard';

interface PlayAlongScreenProps {
  localSong: LocalSongFile;
  irealSong: IrealSong;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  activeNotes: number[];
  virtualLatchNotes: number[];
  onPressVirtualNote: (midi: number) => void;
  onReleaseVirtualNote: (midi: number) => void;
  onToggleLatchNote: (midi: number) => void;
  onClearVirtualLatchNotes: () => void;
  subscribeNoteEvents: (listener: NoteEventListener) => () => void;
  onFinish: (run: PlayAlongRun, session: SessionSummary) => void;
  onClose: () => void;
  /** Opened from the path: preselects step and tempo, and states the goal. */
  objective?: { song: PathSong; objective: SongObjective };
}

type Phase = 'setup' | 'loading' | 'playing' | 'done';

const TEMPO_LEVELS: TempoLevel[] = ['slow', 'medium', 'original'];

const STEP_NAMES: Record<VoicingStep, string> = {
  root: 'Fondamentales',
  'root-5th': 'Fondamentale + quinte',
  triad: 'Accords à 3 notes',
  full: 'Accords complets (7e)',
};

function chordLabel(item: ChartChord, notation: NotationSystem): string {
  return formatChartChord(item, notation);
}

const VERDICT_STYLE: Record<ChordResult['verdict'], { label: string; cls: string }> = {
  'on-time': { label: 'À l’heure', cls: 'bg-green text-white' },
  anticipated: { label: 'Anticipé', cls: 'bg-sky text-white' },
  late: { label: 'En retard', cls: 'bg-brass text-ink' },
  missed: { label: 'Manqué', cls: 'bg-coral text-white' },
};

function formatOffset(ms: number | null): string {
  if (ms === null) return '';
  return `${ms > 0 ? '+' : ''}${ms} ms`;
}

export function PlayAlongScreen(props: PlayAlongScreenProps) {
  const { localSong, irealSong, settings, onUpdateSettings, activeNotes, subscribeNoteEvents } = props;
  const notation = settings.notation;

  const [chart, setChart] = useState<ChordChart | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const goal = props.objective;
  const [step, setStep] = useState<VoicingStep>(goal?.objective.step ?? 'root');
  const [tempoLevel, setTempoLevel] = useState<TempoLevel>(goal?.objective.tempo ?? 'slow');
  const [originalBpm, setOriginalBpm] = useState<number | null>(null);
  const midiBufferRef = useRef<ArrayBuffer | null>(null);
  const [lastRun, setLastRun] = useState<PlayAlongRun | null>(null);
  const [pianoGuide, setPianoGuide] = useState(false);
  const [showKeys, setShowKeys] = useState(true);
  const [latencyMs, setLatencyMs] = useState(settings.playAlongLatencyMs ?? 60);
  const [error, setError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [clock, setClock] = useState({ index: -1, beat: 0, songMs: 0 });
  const [results, setResults] = useState<ChordResult[]>([]);
  const [summary, setSummary] = useState<PlayAlongSummary | null>(null);
  const [completedRun, setCompletedRun] = useState(false);

  const backingRef = useRef<BackingTrack | null>(null);
  const scorerRef = useRef<PlayAlongScorer | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const latencyRef = useRef(latencyMs);
  latencyRef.current = latencyMs;
  const rafRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const runConfigRef = useRef({ step, bpm: 0, originalBpm: 0 });

  // Read the MIDI once to know its tempo (tempo buttons show real BPM).
  useEffect(() => {
    let alive = true;
    fetch(localSong.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => {
        if (!alive) return;
        midiBufferRef.current = buffer;
        setOriginalBpm(analyzeMidi(buffer).bpm);
      })
      .catch((e: unknown) => alive && setError(`Impossible de lire ${localSong.fileName} : ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [localSong]);

  // Decode the iReal chart once.
  useEffect(() => {
    let alive = true;
    decodeIrealChart(irealSong)
      .then((c) => alive && setChart(c))
      .catch((e: unknown) => alive && setChartError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [irealSong]);

  // Timestamped notes → song time → scorer.
  useEffect(() => {
    return subscribeNoteEvents((note, on, timeMs) => {
      const backing = backingRef.current;
      const scorer = scorerRef.current;
      if (!backing || !scorer) return;
      const songMs = backing.songMs(timeMs, latencyRef.current);
      if (songMs === null) return;
      if (on) scorer.noteOn(note, songMs);
      else scorer.noteOff(note);
    });
  }, [subscribeNoteEvents]);

  const stopLoop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const finish = useCallback(
    async (completed: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      stopLoop();
      const tl = timelineRef.current;
      const scorer = scorerRef.current;
      await backingRef.current?.stop();
      if (!tl || !scorer) {
        setPhase('setup');
        return;
      }
      if (completed) scorer.advance(Number.POSITIVE_INFINITY);
      const all = [...scorer.results];
      const sum = summarize(tl, all);
      setResults(all);
      setSummary(sum);
      setCompletedRun(completed);
      setPhase('done');
      if (all.length === 0) return;

      const { step: runStep, bpm, originalBpm: runOriginalBpm } = runConfigRef.current;
      const run: PlayAlongRun = {
        id: `pa-${Date.now()}`,
        date: new Date().toISOString(),
        songTitle: localSong.title,
        step: runStep,
        bpm,
        originalBpm: runOriginalBpm,
        total: sum.total,
        found: sum.found,
        onTime: sum.onTime,
        noteAccuracy: sum.noteAccuracy,
        timingAccuracy: sum.timingAccuracy,
        meanOffsetMs: sum.meanOffsetMs,
        completed,
      };
      const attempts: AttemptRecord[] = all.map((r) => {
        const chord = tl.chords[r.index].item.chord;
        return {
          chord,
          step: runStep,
          context: 'progression',
          outcome: r.verdict === 'missed' ? 'missed' : r.wrongNote ? 'error' : 'correct',
          hadWrongNote: r.wrongNote,
          responseMs: r.offsetMs === null ? Math.round(tl.barMs) : Math.abs(r.offsetMs),
        };
      });
      const session = buildSessionSummary({
        mode: 'progression',
        label: `${localSong.title} avec l’orchestre`,
        step: runStep,
        attempts,
        durationSeconds: Math.round(tl.endMs / 1000),
        tempoBpm: bpm,
        families: [...new Set(attempts.map((a) => a.chord.family))],
        completedFully: completed,
      });
      setLastRun(run);
      props.onFinish(run, session);
    },
    // props.onFinish is stable (App useCallback); localSong only changes with a new screen.
    [localSong.title],
  );

  // Leaving the screen always silences the band.
  useEffect(
    () => () => {
      stopLoop();
      void backingRef.current?.dispose();
    },
    [],
  );

  const start = async () => {
    if (!chart || !midiBufferRef.current || originalBpm === null) return;
    setError(null);
    setFormWarning(null);
    finishedRef.current = false;
    // Created synchronously inside the click so the browser allows audio.
    void backingRef.current?.dispose();
    const backing = new BackingTrack();
    backingRef.current = backing;
    pianoSynth.primeFromGesture();
    setPhase('loading');
    try {
      const buffer = midiBufferRef.current.slice(0);
      const bpm = resolveTempo(tempoLevel, originalBpm);
      const analysis = await backing.load(buffer, { bpm, pianoGuideVolume: pianoGuide ? 0.35 : 0 });
      const formBars = chart.bars.length;
      const countInBars = analysis.firstMusicBar;
      const exact = (analysis.totalBars - countInBars) / formBars;
      const choruses = Math.max(1, Math.floor(exact + 0.1));
      if (chart.unsupportedJumps.length > 0 || Math.abs(exact - choruses) > 0.25) {
        setFormWarning(
          `La grille iReal (${formBars} mesures) ne tombe pas juste avec le MIDI (${analysis.totalBars - countInBars} mesures après le décompte) : certains accords peuvent être décalés.`,
        );
      }
      const tl = buildTimeline(chart, { bpm, countInBars, choruses });
      timelineRef.current = tl;
      setTimeline(tl);
      scorerRef.current = new PlayAlongScorer(tl, defaultScorerOptions(tl, step));
      runConfigRef.current = { step, bpm, originalBpm };
      setResults([]);
      setSummary(null);
      onUpdateSettings({ playAlongLatencyMs: latencyMs });

      const ok = await backing.start();
      if (!ok) throw new Error('Le navigateur a bloqué le son. Cliquez à nouveau sur Commencer.');
      setPhase('playing');

      const loop = () => {
        backing.sync();
        const songMs = backing.songMs(performance.now(), latencyRef.current) ?? 0;
        const fresh = scorerRef.current?.advance(songMs) ?? [];
        if (fresh.length) setResults((prev) => [...prev, ...fresh]);
        const index = chordIndexAt(tl, songMs);
        const beat = Math.floor(songMs / tl.beatMs);
        setClock((c) => (c.index === index && c.beat === beat ? c : { index, beat, songMs }));
        if (songMs > tl.endMs + 400) {
          void finish(true);
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('setup');
      void backing.dispose();
    }
  };

  const current = timeline && clock.index >= 0 ? timeline.chords[clock.index] : null;
  const next = timeline ? timeline.chords[Math.max(0, clock.index + 1)] : null;
  const lastResult = results.at(-1);
  const resultByIndex = useMemo(() => new Map(results.map((r) => [r.index, r])), [results]);
  const required = current ? getTargetPitchClassesForStep(current.item.chord, step) : [];
  const voicing = current ? getSuggestedVoicingMidi(current.item.chord, 4, step) : [];
  const live = timeline ? summarize(timeline, results) : null;

  const inCountIn = timeline !== null && clock.songMs < timeline.formStartMs;
  const countInBeatsLeft = timeline
    ? Math.max(1, Math.ceil((timeline.formStartMs - clock.songMs) / timeline.beatMs))
    : 0;

  // Lead-sheet line of 4 bars around the current position, from the clock
  // (a held chord can span many bars).
  const barGlobal = timeline ? Math.max(0, Math.floor((clock.songMs - timeline.formStartMs) / timeline.barMs)) : 0;
  const formBar = timeline ? barGlobal % timeline.formBars : 0;
  const chorus = timeline ? Math.min(timeline.choruses - 1, Math.floor(barGlobal / timeline.formBars)) : 0;
  const lineStart = Math.floor(formBar / 4) * 4;
  const lineBars = chart ? chart.bars.slice(lineStart, lineStart + 4) : [];
  const beatInBar = timeline ? (((clock.beat - timeline.countInBars * timeline.beatsPerBar) % timeline.beatsPerBar) + timeline.beatsPerBar) % timeline.beatsPerBar : 0;

  const mood: MascotMood =
    phase === 'done'
      ? (summary?.timingAccuracy ?? 0) >= 0.7
        ? 'happy'
        : 'oops'
      : lastResult?.verdict === 'missed'
        ? 'oops'
        : lastResult && lastResult.verdict !== 'late'
          ? 'happy'
          : 'listen';

  const advice = (() => {
    if (!summary || summary.total === 0) return 'Aucun accord n’a été joué : relancez quand vous êtes prêt.';
    if (!completedRun) {
      return `Arrêté après ${summary.total} accord${summary.total > 1 ? 's' : ''}. Ces résultats sont enregistrés, mais seul un morceau joué jusqu’au bout compte pour la compétence « Jouer en rythme ».`;
    }
    const bpm = runConfigRef.current.bpm;
    if (summary.noteAccuracy < 0.6) {
      return `Les notes manquent encore : gardez « ${STEP_NAMES[step]} » mais activez le piano guide, ou revenez à une étape plus simple.`;
    }
    if (summary.timingAccuracy < 0.6) {
      const mean = summary.meanOffsetMs ?? 0;
      return mean > 150
        ? `Vous arrivez souvent après le temps (${mean} ms en moyenne). Ralentissez à ${Math.round(bpm * 0.85)} BPM et préparez l’accord suivant pendant la mesure.`
        : `Le placement varie beaucoup : ralentissez à ${Math.round(bpm * 0.85)} BPM et comptez « 1, 2, 3, 4 » avec la batterie.`;
    }
    if (summary.noteAccuracy >= 0.85 && summary.timingAccuracy >= 0.8) {
      const nextStep = VOICING_STEP_ORDER[VOICING_STEP_ORDER.indexOf(step) + 1];
      return nextStep
        ? `Solide ! Passez à « ${STEP_NAMES[nextStep]} », ou accélérez le tempo.`
        : 'Solide ! Essayez le tempo original, ou laissez tomber les aides visuelles.';
    }
    return 'Bonne base : rejouez une fois au même tempo pour fixer les enchaînements.';
  })();

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-page text-text">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 pt-5 sm:px-8">
        <button
          type="button"
          onClick={() => (phase === 'playing' ? void finish(false) : props.onClose())}
          aria-label={phase === 'playing' ? 'Arrêter' : 'Fermer'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-mist hover:text-text"
        >
          <X className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">
            {localSong.title} <span className="text-muted">avec l’orchestre</span>
          </p>
          {timeline && phase === 'playing' && (
            <div className="mb-progress mt-1 h-2.5" role="progressbar" aria-label="Avancement du morceau">
              <span style={{ width: `${Math.min(100, (clock.songMs / timeline.endMs) * 100)}%` }} />
            </div>
          )}
        </div>
        {timeline && phase === 'playing' && (
          <span className="hidden shrink-0 font-display text-lg font-semibold text-muted sm:inline">
            {timeline.bpm} BPM, tour {chorus + 1}/{timeline.choruses}
          </span>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-6 pb-10 sm:px-8">
          {/* ---------- Setup ---------- */}
          {(phase === 'setup' || phase === 'loading') && (
            <div className="w-full max-w-2xl">
              <div className="flex items-end gap-3">
                <Mascot size={88} mood="listen" className="shrink-0" />
                <div className="mb-6 rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold">
                  La basse et la batterie jouent, vous êtes le pianiste. Jouez l’accord au début de chaque
                  mesure, même quand il ne change pas : je vous dis si vous êtes à l’heure.
                </div>
              </div>

              {goal && <ObjectiveBanner song={goal.song} objective={goal.objective} originalBpm={originalBpm} />}

              {chartError && (
                <p className="mt-4 rounded-xl bg-coral/10 p-3 font-bold text-coral-press">
                  Impossible de lire la grille iReal : {chartError}
                </p>
              )}
              {chart && (
                <div className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Grille">
                  {chart.bars.map((bar, i) => (
                    <div key={i} className="rounded-lg border-2 border-line px-2 py-1.5 font-display font-semibold">
                      {bar.length ? bar.map((c) => chordLabel(c, notation)).join('  ') : <span className="text-muted">%</span>}
                    </div>
                  ))}
                </div>
              )}

              <fieldset className="mt-6">
                <legend className="font-display text-lg font-semibold">Ce que vous jouez</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VOICING_STEP_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={step === s}
                      onClick={() => setStep(s)}
                      className={`mb-btn mb-btn-sm ${step === s ? 'mb-btn-sky' : 'mb-btn-ghost'}`}
                    >
                      {STEP_NAMES[s]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-muted">{VOICING_STEPS[step].descriptionFr}</p>
              </fieldset>

              <fieldset className="mt-5">
                <legend className="font-display text-lg font-semibold">Tempo</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TEMPO_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={tempoLevel === level}
                      onClick={() => setTempoLevel(level)}
                      className={`mb-btn mb-btn-sm ${tempoLevel === level ? 'mb-btn-sky' : 'mb-btn-ghost'}`}
                    >
                      {level === 'slow' ? 'Lent' : level === 'medium' ? 'Moyen' : 'Original'}
                      {originalBpm !== null ? ` (${resolveTempo(level, originalBpm)} BPM)` : ''}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5 space-y-3">
                <label className="flex items-center gap-3 font-bold">
                  <input type="checkbox" checked={pianoGuide} onChange={(e) => setPianoGuide(e.target.checked)} className="h-5 w-5 accent-sky" />
                  Laisser le piano du morceau en fond (guide)
                </label>
                <label className="flex items-center gap-3 font-bold">
                  <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} className="h-5 w-5 accent-sky" />
                  Montrer les touches sur le clavier
                </label>
                <label className="block font-bold">
                  Calage : {latencyMs} ms
                  <input
                    type="range"
                    min={-100}
                    max={300}
                    step={10}
                    value={latencyMs}
                    onChange={(e) => setLatencyMs(Number(e.target.value))}
                    className="mt-1 block w-full accent-sky"
                  />
                  <span className="text-sm font-semibold text-muted">
                    Compense le délai du son (enceintes Bluetooth : 150–250 ms). Si vous êtes toujours « en retard »
                    alors que vous jouez avec la batterie, augmentez-le.
                  </span>
                </label>
              </div>

              {error && <p className="mt-4 rounded-xl bg-coral/10 p-3 font-bold text-coral-press">{error}</p>}
            </div>
          )}

          {/* ---------- Playing ---------- */}
          {phase === 'playing' && timeline && (
            <>
              {formWarning && (
                <p className="mb-3 w-full rounded-xl bg-brass/15 p-2.5 text-sm font-bold">{formWarning}</p>
              )}
              <div className="grid w-full grid-cols-4 gap-2" aria-label="Mesures en cours">
                {lineBars.map((bar, k) => {
                  const barNumber = lineStart + k;
                  const isCurrent = !inCountIn && barNumber === formBar;
                  return (
                    <div
                      key={barNumber}
                      className={`relative rounded-2xl border-2 px-2 pt-2 pb-4 transition-all duration-200 sm:px-3 ${isCurrent ? 'border-ink bg-surface shadow-[0_4px_0_var(--mb-line)] dark:border-white' : 'border-line'}`}
                    >
                      <div className="flex flex-wrap gap-2">
                        {timeline.chords
                          .filter((t) => t.chorus === chorus && t.formBar === barNumber)
                          .map((t) => {
                            const r = resultByIndex.get(t.index);
                            const written = bar.length > 0;
                            return (
                              <span
                                key={t.index}
                                className={`rounded-lg px-1 font-display text-base font-semibold transition-colors sm:px-1.5 sm:text-2xl ${
                                  r ? VERDICT_STYLE[r.verdict].cls : written ? '' : 'text-muted'
                                }`}
                              >
                                {written ? chordLabel(t.item, notation) : '%'}
                              </span>
                            );
                          })}
                      </div>
                      {isCurrent && (
                        <div className="absolute inset-x-3 bottom-1.5 flex gap-1" aria-hidden="true">
                          {Array.from({ length: timeline.beatsPerBar }).map((_, b) => (
                            <span key={b} className={`h-1.5 flex-1 rounded-full ${b <= beatInBar ? 'bg-brass' : 'bg-line'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-4 sm:flex-nowrap sm:gap-6">
                <Mascot size={80} mood={mood} className="hidden shrink-0 sm:block" />
                <div className="text-center">
                  {inCountIn ? (
                    <>
                      <p className="font-display text-2xl font-semibold text-muted">Préparez-vous…</p>
                      <p className="font-display text-[6rem] leading-none font-bold text-brass">{countInBeatsLeft}</p>
                    </>
                  ) : (
                    current && (
                      <>
                        <p data-testid="playalong-chord" className="font-display text-[3.5rem] leading-none font-bold sm:text-[5.5rem]">
                          {chordLabel(current.item, notation)}
                        </p>
                        {next && next !== current && (
                          <p className="mt-1 font-display text-xl font-semibold text-muted">
                            {next.repeat ? `Mesure suivante : on le rejoue` : `Ensuite : ${chordLabel(next.item, notation)}`}
                          </p>
                        )}
                      </>
                    )
                  )}
                </div>
                <div className="w-full shrink-0 sm:w-44">
                  {lastResult && (
                    <div key={lastResult.index} className={`mb-pop rounded-2xl px-3 py-2 text-center ${VERDICT_STYLE[lastResult.verdict].cls}`}>
                      <p className="font-display text-xl font-bold">{VERDICT_STYLE[lastResult.verdict].label}</p>
                      <p className="text-sm font-bold opacity-90">
                        {formatOffset(lastResult.offsetMs)}
                        {lastResult.wrongNote ? ' · fausse note' : ''}
                      </p>
                    </div>
                  )}
                  {live && live.total > 0 && (
                    <p className="mt-2 text-center text-sm font-bold text-muted">
                      Notes {Math.round(live.noteAccuracy * 100)} % · À l’heure {Math.round(live.timingAccuracy * 100)} %
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 w-full">
                <VirtualKeyboard
                  isOpen
                  onToggleOpen={() => undefined}
                  showExpectedHelper={showKeys}
                  onToggleExpectedHelper={() => setShowKeys((v) => !v)}
                  showNoteLabels={settings.showKeyboardNotes}
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
                  hasLatchedNotes={props.virtualLatchNotes.length > 0}
                />
              </div>
            </>
          )}

          {/* ---------- Done ---------- */}
          {phase === 'done' && summary && (
            <div className="w-full max-w-2xl">
              <div className="flex items-end gap-3">
                <Mascot size={96} mood={mood} className="shrink-0" />
                <div className="mb-6 rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold">{advice}</div>
              </div>
              {goal && lastRun && (
                runMeetsObjective(lastRun, goal.song, goal.objective) ? (
                  <p className="mb-pop mb-4 rounded-2xl bg-green p-4 font-display text-xl font-semibold text-white shadow-[0_4px_0_var(--color-green-press)]">
                    Objectif atteint : {goal.objective.label} !
                  </p>
                ) : (
                  <p className="mb-4 rounded-2xl border-2 border-line p-4 font-bold">
                    Objectif « {goal.objective.label} » pas encore atteint : il faut jouer jusqu’au bout, à{' '}
                    {originalBpm !== null ? resolveTempo(goal.objective.tempo, originalBpm) : '—'} BPM ou plus, avec{' '}
                    {Math.round(goal.objective.minNotes * 100)} % des notes et {Math.round(goal.objective.minTiming * 100)} % à l’heure.
                  </p>
                )
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Notes trouvées', value: `${Math.round(summary.noteAccuracy * 100)} %` },
                  { label: 'À l’heure', value: `${Math.round(summary.timingAccuracy * 100)} %` },
                  { label: 'Décalage moyen', value: summary.meanOffsetMs === null ? '—' : formatOffset(summary.meanOffsetMs) },
                  { label: 'Accords', value: `${summary.found}/${summary.total}` },
                ].map((s) => (
                  <div key={s.label} className="mb-panel p-4 text-center">
                    <p className="font-display text-3xl font-bold">{s.value}</p>
                    <p className="text-sm font-bold text-muted">{s.label}</p>
                  </div>
                ))}
              </div>
              {summary.weakChordIds.length > 0 && timeline && (
                <p className="mt-4 font-bold">
                  À travailler :{' '}
                  {summary.weakChordIds
                    .slice(0, 4)
                    .map((id) => {
                      const c = timeline.chords.find((t) => t.item.chord.id === id);
                      return c ? chordLabel(c.item, notation) : id;
                    })
                    .join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t-2 border-line">
        <div className="mx-auto flex min-h-24 w-full max-w-5xl items-center justify-end gap-3 px-4 py-4 sm:px-8">
          {(phase === 'setup' || phase === 'loading') && (
            <button
              type="button"
              disabled={!chart || originalBpm === null || phase === 'loading'}
              onClick={() => void start()}
              className="mb-btn mb-btn-green min-w-48"
            >
              <Play className="h-5 w-5 fill-current" />
              {phase === 'loading' ? 'Chargement de l’orchestre…' : 'Commencer'}
            </button>
          )}
          {phase === 'playing' && (
            <button type="button" onClick={() => void finish(false)} className="mb-btn mb-btn-ghost">
              Arrêter
            </button>
          )}
          {phase === 'done' && (
            <>
              <button type="button" onClick={props.onClose} className="mb-btn mb-btn-ghost">
                Terminer
              </button>
              <button type="button" onClick={() => setPhase('setup')} className="mb-btn mb-btn-green">
                <RotateCcw className="h-5 w-5" />
                Rejouer
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

function ObjectiveBanner({
  song,
  objective,
  originalBpm,
}: {
  song: PathSong;
  objective: SongObjective;
  originalBpm: number | null;
}) {
  return (
    <div className="mb-4 rounded-2xl bg-brass p-4 text-ink shadow-[0_4px_0_var(--color-brass-press)]">
      <p className="text-sm font-extrabold">Objectif</p>
      <p className="font-display text-2xl font-semibold">{objective.label}</p>
      <p className="font-bold">
        {objective.hint} Au {TEMPO_LABEL[objective.tempo]}
        {originalBpm !== null ? ` (${resolveTempo(objective.tempo, originalBpm)} BPM)` : ''}, jusqu’au bout du morceau :{' '}
        {Math.round(objective.minNotes * 100)} % des notes, {Math.round(objective.minTiming * 100)} % à l’heure.
      </p>
      <p className="mt-1 text-sm font-bold opacity-80">{song.focus}</p>
    </div>
  );
}
