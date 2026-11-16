import { Headphones, Music, Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackingTrack } from '../../audio/backingTrack';
import { stopAudition } from '../../audio/bandSequencer';
import { alignFormStart, analyzeMidi, normalizePickup, prependCountIn, transposeMidi } from '../../audio/midiFile';
import { pianoSynth } from '../../audio/synth';
import { LocalSongFile, songTitleKey } from '../../content/localSongs';
import { PathSong, SongObjective, TEMPO_LABEL, TempoLevel, resolveTempo } from '../../content/songPath';
import { MELODY_INTRO } from '../../content/stepIntros';
import { useChordGesture } from '../../input/useChordGesture';
import { isValidGestureChord } from '../../input/chordGesture';
import { NoteEventListener } from '../../input/types';
import { ChordChart, chartBarRoots, chartKey, formatChartChord, parseIrealKey, transposeChart } from '../../music/chart';
import { formatPitchClass } from '../../music/chords';
import { IrealSong, decodeIrealChart } from '../../music/ireal';
import {
  MelodyNote,
  MelodyResult,
  MelodyScorer,
  MelodySummary,
  defaultMelodyOptions,
  extractMelody,
  findMelodyChannel,
  summarizeMelody,
} from '../../practice/melody';
import { Timeline, buildTimeline, chordIndexAt } from '../../practice/playAlong';
import { runMeetsObjective } from '../../practice/songProgress';
import { AppSettings, PlayAlongRun } from '../../storage/types';
import { GestureChordSetting, gestureChordLabel } from '../components/GestureChordSetting';
import { KeyboardVolume } from '../components/KeyboardVolume';
import { Mascot } from '../components/Mascot';
import { VirtualKeyboard } from '../components/VirtualKeyboard';

interface MelodyScreenProps {
  localSong: LocalSongFile;
  irealSong: IrealSong;
  objective: { song: PathSong; objective: SongObjective };
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  activeNotes: number[];
  virtualLatchNotes: number[];
  onPressVirtualNote: (midi: number) => void;
  onReleaseVirtualNote: (midi: number) => void;
  onToggleLatchNote: (midi: number) => void;
  onClearVirtualLatchNotes: () => void;
  subscribeNoteEvents: (listener: NoteEventListener) => () => void;
  onFinish: (run: PlayAlongRun) => void;
  onClose: () => void;
}

/**
 * "La mélodie": the learner plays the tune over the band (the melody track is
 * muted, the chords play). First a calm listen with the notes scrolling (no
 * score), then the judged run, then the results. One screen, no scroll.
 */
type Phase = 'discover' | 'loading' | 'running' | 'done';
type Mode = 'listen' | 'play';

const TEMPO_LEVELS: TempoLevel[] = ['slow', 'medium', 'original'];

/** What the lane shows around the playhead, in bars. */
const LANE_BEFORE_BARS = 0.5;
const LANE_AFTER_BARS = 2.5;

const RESULT_STYLE: Record<MelodyResult['verdict'], string> = {
  'on-time': 'bg-green text-white border-green',
  anticipated: 'bg-brass text-ink border-brass',
  late: 'bg-brass text-ink border-brass',
  missed: 'bg-coral/80 text-white border-coral',
};

interface PreparedRun {
  buffer: ArrayBuffer;
  bpm: number;
  countInBars: number;
  bars: number;
  timeline: Timeline;
  notes: MelodyNote[];
  melodyChannel: number;
}

export function MelodyScreen(props: MelodyScreenProps) {
  const { localSong, irealSong, settings, onUpdateSettings, activeNotes, subscribeNoteEvents } = props;
  const { song, objective } = props.objective;
  const notation = settings.notation;

  const [phase, setPhase] = useState<Phase>('discover');
  const [mode, setMode] = useState<Mode>('listen');
  const [tempoLevel, setTempoLevel] = useState<TempoLevel>(objective.tempo);
  const [raw, setRaw] = useState<ArrayBuffer | null>(null);
  const [sourceChart, setSourceChart] = useState<ChordChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<PreparedRun | null>(null);
  const [songMs, setSongMs] = useState(0);
  const [results, setResults] = useState<MelodyResult[]>([]);
  const [summary, setSummary] = useState<MelodySummary | null>(null);
  const [lastRun, setLastRun] = useState<PlayAlongRun | null>(null);
  const [completed, setCompleted] = useState(false);
  const [showKeys, setShowKeys] = useState(true);
  // Hear the tune on the learner's own piano sound while playing it (not scored).
  const [melodyGuide, setMelodyGuide] = useState(false);
  const melodyGuideRef = useRef(false);
  melodyGuideRef.current = melodyGuide;
  const guideCursorRef = useRef({ lastMs: -Infinity, sounding: new Map<number, number>() });

  const backingRef = useRef<BackingTrack | null>(null);
  const scorerRef = useRef<MelodyScorer | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>('listen');
  const runRef = useRef<PreparedRun | null>(null);
  const finishedRef = useRef(false);
  const latencyMs = settings.playAlongLatencyMs ?? 60;
  const latencyRef = useRef(latencyMs);
  latencyRef.current = latencyMs;

  // The MIDI file and the iReal chart, once.
  useEffect(() => {
    let alive = true;
    fetch(localSong.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => alive && setRaw(normalizePickup(b)))
      .catch((e: unknown) => alive && setError(`Impossible de lire ${localSong.fileName} : ${e instanceof Error ? e.message : String(e)}`));
    decodeIrealChart(irealSong)
      .then((c) => alive && setSourceChart(c))
      .catch((e: unknown) => alive && setError(`Impossible de lire la grille iReal : ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [localSong, irealSong]);

  const info = useMemo(() => (raw ? analyzeMidi(raw) : null), [raw]);
  const melodyChannel = useMemo(() => (raw ? findMelodyChannel(raw) : null), [raw]);
  const songKey = songTitleKey(localSong.title);
  const transpose = settings.songTranspose?.[songKey] ?? 0;
  const writtenKey = useMemo(
    () => parseIrealKey(irealSong.key ?? '') ?? (sourceChart ? chartKey(sourceChart) : null),
    [irealSong.key, sourceChart],
  );
  const chart = useMemo(() => (sourceChart ? transposeChart(sourceChart, transpose, writtenKey) : null), [sourceChart, transpose, writtenKey]);
  const songSounds = useMemo(() => {
    const saved = settings.bandSounds?.[songKey] ?? {};
    return Object.fromEntries(Object.entries(saved).map(([ch, id]) => [Number(ch), id])) as Record<number, string>;
  }, [settings.bandSounds, songKey]);
  const mutedChannels = useMemo(() => settings.bandMuted?.[songKey] ?? [], [settings.bandMuted, songKey]);

  /** The file as the band plays it (one pass through the form), and the tune in song time. */
  const prepare = useCallback((): PreparedRun | null => {
    if (!raw || !info || !chart || !sourceChart || melodyChannel === null) return null;
    const formStartBar = info.iReal ? info.firstMusicBar : (alignFormStart(raw, chartBarRoots(sourceChart)) ?? info.firstMusicBar);
    const needsCountIn = formStartBar === 0;
    const written = needsCountIn ? prependCountIn(raw.slice(0), 1) : raw.slice(0);
    const buffer = transposeMidi(written, transpose);
    const bpm = resolveTempo(tempoLevel, info.bpm);
    const countInBars = needsCountIn ? 1 : formStartBar;
    const timeline = buildTimeline(chart, { bpm, countInBars, choruses: 1 });
    const notes = extractMelody(buffer, melodyChannel, { bpm, fromMs: timeline.formStartMs, toMs: timeline.endMs });
    return { buffer, bpm, countInBars, bars: countInBars + chart.bars.length, timeline, notes, melodyChannel };
  }, [raw, info, chart, sourceChart, melodyChannel, transpose, tempoLevel]);

  // Learner's notes → song time → scorer (only in the judged run).
  useEffect(
    () =>
      subscribeNoteEvents((note, on, timeMs) => {
        if (!on || modeRef.current !== 'play') return;
        const backing = backingRef.current;
        const scorer = scorerRef.current;
        if (!backing || !scorer) return;
        const at = backing.songMs(timeMs, latencyRef.current);
        if (at !== null) scorer.noteOn(note, at);
      }),
    [subscribeNoteEvents],
  );

  const stopFrame = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    silenceGuide();
  };

  /** Releases every note the melody guide is holding. */
  const silenceGuide = () => {
    const { sounding } = guideCursorRef.current;
    for (const [midi, timer] of sounding) {
      window.clearTimeout(timer);
      pianoSynth.noteOff(midi);
    }
    sounding.clear();
  };

  /** Plays, on the learner's piano sound, the tune notes the band just reached. */
  const playGuide = (notes: MelodyNote[], audioMs: number) => {
    const cursor = guideCursorRef.current;
    const from = cursor.lastMs;
    cursor.lastMs = audioMs;
    if (!melodyGuideRef.current || audioMs < from) return;
    for (const n of notes) {
      if (n.startMs <= from || n.startMs > audioMs) continue;
      const previous = cursor.sounding.get(n.midi);
      if (previous !== undefined) {
        window.clearTimeout(previous);
        pianoSynth.noteOff(n.midi);
      }
      pianoSynth.noteOn(n.midi, 84);
      const timer = window.setTimeout(() => {
        cursor.sounding.delete(n.midi);
        pianoSynth.noteOff(n.midi);
      }, Math.max(80, n.durationMs - 20));
      cursor.sounding.set(n.midi, timer);
    }
  };

  // Turning the guide off mid-run cuts the notes still sounding.
  useEffect(() => {
    if (!melodyGuide) silenceGuide();
  }, [melodyGuide]);

  useEffect(
    () => () => {
      stopFrame();
      void backingRef.current?.dispose();
    },
    [],
  );

  // The page behind this full-screen view must not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const finish = useCallback(
    async (reachedEnd: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      stopFrame();
      await backingRef.current?.stop();
      const prepared = runRef.current;
      const scorer = scorerRef.current;
      if (modeRef.current === 'listen' || !prepared || !scorer) {
        // The listen is never scored: back to the discovery page.
        setPhase('discover');
        return;
      }
      if (reachedEnd) scorer.advance(Number.POSITIVE_INFINITY);
      const sum = summarizeMelody(scorer.results, scorer.wrongNotes);
      setResults([...scorer.results]);
      setSummary(sum);
      setCompleted(reachedEnd);
      setPhase('done');
      if (sum.total === 0) return;
      const record: PlayAlongRun = {
        id: `pa-${Date.now()}`,
        date: new Date().toISOString(),
        songTitle: localSong.title,
        step: 'melody',
        ...(transpose !== 0 ? { transpose } : {}),
        bpm: prepared.bpm,
        originalBpm: info?.bpm,
        total: sum.total,
        found: sum.found,
        onTime: sum.onTime,
        noteAccuracy: sum.noteAccuracy,
        timingAccuracy: sum.timingAccuracy,
        meanOffsetMs: sum.meanOffsetMs,
        completed: reachedEnd,
      };
      setLastRun(record);
      props.onFinish(record);
    },
    // props.onFinish is stable (App useCallback).
    [localSong.title, transpose, info],
  );

  const start = async (nextMode: Mode) => {
    const prepared = prepare();
    if (!prepared) return;
    setError(null);
    void stopAudition();
    void backingRef.current?.dispose();
    const backing = new BackingTrack();
    backingRef.current = backing;
    pianoSynth.primeFromGesture();
    finishedRef.current = false;
    modeRef.current = nextMode;
    setMode(nextMode);
    runRef.current = prepared;
    setRun(prepared);
    setResults([]);
    setSummary(null);
    setSongMs(0);
    scorerRef.current = nextMode === 'play' ? new MelodyScorer(prepared.notes, defaultMelodyOptions(prepared.bpm)) : null;
    setPhase('loading');
    try {
      // Listening: the tune sounds. Playing: the learner is the tune. The chords always play.
      const muted = nextMode === 'play'
        ? [...new Set([...mutedChannels, prepared.melodyChannel])]
        : mutedChannels.filter((c) => c !== prepared.melodyChannel);
      await backing.load(prepared.buffer, {
        bpm: prepared.bpm,
        pianoGuideVolume: 0.85,
        bars: prepared.bars,
        sounds: songSounds,
        muted,
        metronomeBar: prepared.countInBars >= 1 ? prepared.countInBars - 1 : undefined,
      });
      if (backingRef.current !== backing) return;
      const ok = await backing.start();
      if (!ok) throw new Error('Le navigateur a bloqué le son. Cliquez à nouveau.');
      setPhase('running');
      guideCursorRef.current.lastMs = -Infinity;
      const frame = () => {
        backing.sync();
        if (modeRef.current === 'play') playGuide(prepared.notes, backing.songMs(performance.now()) ?? 0);
        const now = backing.songMs(performance.now(), latencyRef.current) ?? 0;
        const fresh = scorerRef.current?.advance(now) ?? [];
        if (fresh.length) setResults((prev) => [...prev, ...fresh]);
        setSongMs(now);
        if (now > prepared.timeline.endMs + 400) {
          void finish(true);
          return;
        }
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('discover');
      void backing.dispose();
    }
  };

  const ready = prepare() !== null;
  const noMelody = raw !== null && melodyChannel === null;

  // Hands-free: the favourite chord 3 times starts the judged run (from the
  // discovery page or the results). Off while the band plays.
  const gestureActive = phase === 'discover' || phase === 'done';
  const gestureStreak = useChordGesture(subscribeNoteEvents, settings.gestureChord, gestureActive && ready, () => void start('play'));

  const setGestureChord = useCallback((gestureChord: number[] | undefined) => onUpdateSettings({ gestureChord }), [onUpdateSettings]);

  // ---- Running view ----
  const timeline = run?.timeline ?? null;
  const notes = run?.notes ?? [];
  const resultByIndex = useMemo(() => new Map(results.map((r) => [r.index, r])), [results]);
  const chordIndex = timeline ? chordIndexAt(timeline, songMs) : -1;
  const currentChord = timeline && chordIndex >= 0 ? timeline.chords[chordIndex] : null;
  const inCountIn = timeline !== null && songMs < timeline.formStartMs;
  const countInBeatsLeft = timeline ? Math.max(1, Math.ceil((timeline.formStartMs - songMs) / timeline.beatMs)) : 0;
  const windowMs = run ? defaultMelodyOptions(run.bpm).windowMs : 300;
  // The note to play now or next: the first one not over yet.
  const nextNote = notes.find((n) => n.startMs + windowMs >= songMs && !resultByIndex.has(n.index));
  const live = results.length ? summarizeMelody(results, scorerRef.current?.wrongNotes ?? 0) : null;
  const lastResult = results.at(-1);
  /** The keyboard shows C4–B5: the note is shown there, in its octave when it fits. */
  const keyboardNote = nextNote ? fold(nextNote.midi) : null;

  const advice = (() => {
    if (!summary || summary.total === 0) return 'Aucune note de la mélodie n’a été jouée : relancez quand vous êtes prêt.';
    if (!completed) return `Arrêté après ${summary.total} notes. Seul un passage joué jusqu’au bout compte pour l’objectif.`;
    if (summary.noteAccuracy < 0.6) return 'Beaucoup de notes manquent : réécoutez la mélodie en la chantant, puis rejouez au tempo lent.';
    if (summary.timingAccuracy < 0.6) {
      const mean = summary.meanOffsetMs ?? 0;
      return mean > 100
        ? `Vous jouez souvent après la note (${mean} ms en moyenne) : regardez la note suivante arriver, et préparez le doigt avant la ligne.`
        : 'Le placement varie : écoutez la batterie et chantez la mélodie dans votre tête en jouant.';
    }
    if (summary.noteAccuracy >= 0.85 && summary.timingAccuracy >= 0.8) return 'Belle mélodie ! Essayez un tempo plus rapide, ou jouez sans les touches affichées.';
    return 'Bonne base : rejouez une fois pour fixer les phrases.';
  })();

  const mood = phase === 'done' ? ((summary?.noteAccuracy ?? 0) >= 0.7 ? 'happy' : 'oops') : lastResult?.verdict === 'missed' ? 'oops' : 'listen';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-page text-text">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pt-3 sm:gap-4 sm:px-8">
        <button
          type="button"
          onClick={() => (phase === 'running' || phase === 'loading' ? void finish(false) : props.onClose())}
          aria-label={phase === 'running' ? 'Arrêter' : 'Fermer'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-mist hover:text-text"
        >
          <X className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">
            {localSong.title} <span className="text-muted">· la mélodie</span>
          </p>
          {timeline && phase === 'running' && (
            <div className="mb-progress mt-1 h-2.5" role="progressbar" aria-label="Avancement du morceau">
              <span style={{ width: `${Math.min(100, (songMs / timeline.endMs) * 100)}%` }} />
            </div>
          )}
        </div>
        {phase !== 'running' && (
          <GestureChordSetting compact value={settings.gestureChord} onChange={setGestureChord} activeNotes={activeNotes} notation={notation} />
        )}
        {settings.audioEnabled && (
          <KeyboardVolume compact value={settings.audioVolume} onChange={(audioVolume) => onUpdateSettings({ audioVolume })} />
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col items-center px-4 py-3 sm:px-8">
          {/* ---------- Discover: the notion first, then a calm listen ---------- */}
          {phase === 'discover' && (
            <div className="flex w-full max-w-3xl flex-col gap-4">
              <div className="flex items-end gap-3">
                <Mascot size={72} mood="listen" className="hidden shrink-0 sm:block" />
                <div className="mb-panel flex-1 p-4">
                  <p className="font-display text-2xl font-semibold">{MELODY_INTRO.title}</p>
                  <p className="mt-1 font-semibold">{MELODY_INTRO.explanation}</p>
                  <p className="mt-2 text-sm font-bold text-muted">{MELODY_INTRO.howTo}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-brass px-4 py-3 text-ink shadow-[0_4px_0_var(--color-brass-press)]">
                <p className="font-display text-xl font-semibold">
                  <span className="mr-2 text-sm font-extrabold">Objectif</span>
                  {objective.label}
                </p>
                <p className="text-sm font-bold">
                  {objective.hint} Au {TEMPO_LABEL[objective.tempo]}
                  {info ? ` (${resolveTempo(objective.tempo, info.bpm)} BPM)` : ''}, jusqu’au bout de la grille :{' '}
                  {Math.round(objective.minNotes * 100)} % des notes, {Math.round(objective.minTiming * 100)} % à l’heure.
                </p>
              </div>
              <fieldset>
                <legend className="font-display text-base font-semibold">Tempo (BPM)</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {TEMPO_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={tempoLevel === level}
                      onClick={() => setTempoLevel(level)}
                      className={`mb-btn mb-btn-sm ${tempoLevel === level ? 'mb-btn-sky' : 'mb-btn-ghost'}`}
                    >
                      {level === 'slow' ? 'Lent' : level === 'medium' ? 'Moyen' : 'Original'}
                      {info ? ` · ${resolveTempo(level, info.bpm)}` : ''}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-3 font-bold">
                <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} className="h-5 w-5 accent-sky" />
                Montrer la note à jouer sur le clavier
              </label>
              {noMelody && (
                <p className="rounded-xl bg-coral/10 p-3 font-bold text-coral-press">
                  Ce fichier MIDI n’a pas de piste « Melodie » : impossible de suivre la mélodie.
                </p>
              )}
              {error && <p className="rounded-xl bg-coral/10 p-3 font-bold text-coral-press">{error}</p>}
            </div>
          )}

          {phase === 'loading' && <p className="mt-10 font-bold text-muted">Chargement de l’orchestre…</p>}

          {/* ---------- Running: the tune scrolls to the playhead ---------- */}
          {phase === 'running' && timeline && (
            <>
              <div className="flex w-full items-center gap-3" aria-live="polite">
                <Mascot size={44} mood={mood} className="hidden shrink-0 sm:block" />
                <p className="font-display text-lg font-semibold text-muted">
                  {mode === 'listen' ? 'Écoute : suivez les notes, sans score. ' : ''}
                  {inCountIn
                    ? countInBeatsLeft > timeline.beatsPerBar
                      ? `Intro : la mélodie arrive dans ${Math.ceil(countInBeatsLeft / timeline.beatsPerBar)} mesures`
                      : 'Préparez-vous…'
                    : `Mesure ${Math.floor((songMs - timeline.formStartMs) / timeline.barMs) + 1}/${timeline.formBars}`}
                </p>
                {inCountIn && countInBeatsLeft <= timeline.beatsPerBar && (
                  <span key={countInBeatsLeft} className="mb-pop font-display text-4xl leading-none font-bold text-brass">
                    {countInBeatsLeft}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {currentChord && !inCountIn && (
                    <span className="rounded-xl border-2 border-line px-3 py-1 font-display text-xl font-semibold">
                      {formatChartChord(currentChord.item, notation)}
                    </span>
                  )}
                  {live && (
                    <span className="hidden text-sm font-bold text-muted md:inline">
                      Notes {Math.round(live.noteAccuracy * 100)} % · À l’heure {Math.round(live.timingAccuracy * 100)} %
                    </span>
                  )}
                </div>
              </div>

              <MelodyLane notes={notes} songMs={songMs} timeline={timeline} resultByIndex={resultByIndex} nextIndex={nextNote?.index ?? -1} notation={notation} />

              <div className="mt-3 w-full shrink-0">
                <VirtualKeyboard
                  compact
                  isOpen
                  onToggleOpen={() => undefined}
                  showExpectedHelper={showKeys}
                  onToggleExpectedHelper={() => setShowKeys((v) => !v)}
                  showNoteLabels={settings.showKeyboardNotes}
                  latchMode={false}
                  onToggleLatchMode={() => undefined}
                  activeNotes={activeNotes}
                  expectedPitchClasses={nextNote ? [nextNote.midi % 12] : []}
                  expectedVoicingNotes={keyboardNote !== null ? [keyboardNote] : []}
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
                <Mascot size={80} mood={mood} className="shrink-0" />
                <div className="mb-4 rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold">{advice}</div>
              </div>
              {lastRun &&
                (runMeetsObjective(lastRun, song, objective) ? (
                  <p className="mb-pop mb-4 rounded-2xl bg-green p-4 font-display text-xl font-semibold text-white shadow-[0_4px_0_var(--color-green-press)]">
                    Objectif atteint : {objective.label} !
                  </p>
                ) : (
                  <p className="mb-4 rounded-2xl border-2 border-line p-4 font-bold">
                    Objectif « {objective.label} » pas encore atteint : il faut jouer jusqu’au bout, à{' '}
                    {info ? resolveTempo(objective.tempo, info.bpm) : '—'} BPM ou plus, avec {Math.round(objective.minNotes * 100)} % des notes et{' '}
                    {Math.round(objective.minTiming * 100)} % à l’heure.
                  </p>
                ))}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Notes trouvées', value: `${Math.round(summary.noteAccuracy * 100)} %` },
                  { label: 'À l’heure', value: `${Math.round(summary.timingAccuracy * 100)} %` },
                  { label: 'Décalage moyen', value: summary.meanOffsetMs === null ? '—' : `${summary.meanOffsetMs > 0 ? '+' : ''}${summary.meanOffsetMs} ms` },
                  { label: 'Notes', value: `${summary.found}/${summary.total}` },
                ].map((s) => (
                  <div key={s.label} className="mb-panel p-4 text-center">
                    <p className="font-display text-3xl font-bold">{s.value}</p>
                    <p className="text-sm font-bold text-muted">{s.label}</p>
                  </div>
                ))}
              </div>
              {summary.wrongNotes > 0 && (
                <p className="mt-3 text-sm font-bold text-muted">
                  {summary.wrongNotes} note{summary.wrongNotes > 1 ? 's' : ''} en dehors de la mélodie.
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t-2 border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-3 px-4 py-3 sm:px-8">
          {gestureActive && <GestureHint chord={settings.gestureChord} streak={gestureStreak} notation={notation} />}
          {phase === 'discover' && (
            <>
              <button type="button" disabled={!ready} onClick={() => void start('listen')} className="mb-btn mb-btn-ghost">
                <Headphones className="h-5 w-5" /> Écouter la mélodie
              </button>
              <button type="button" disabled={!ready} onClick={() => void start('play')} className="mb-btn mb-btn-green min-w-48">
                <Play className="h-5 w-5 fill-current" /> Jouer la mélodie
              </button>
            </>
          )}
          {(phase === 'discover' || phase === 'done' || ((phase === 'running' || phase === 'loading') && mode === 'play')) && (
            <button
              type="button"
              onClick={() => setMelodyGuide((v) => !v)}
              aria-pressed={melodyGuide}
              title="Entendre la mélodie au piano pendant que vous jouez (sans effet sur le score)"
              className={`mb-btn ${melodyGuide ? 'mb-btn-green' : 'mb-btn-ghost'}`}
            >
              <Music className="h-5 w-5" /> Mélodie au piano : {melodyGuide ? 'oui' : 'non'}
            </button>
          )}
          {(phase === 'running' || phase === 'loading') && (
            <button type="button" onClick={() => void finish(false)} className="mb-btn mb-btn-ghost">
              {mode === 'listen' ? 'Arrêter l’écoute' : 'Arrêter'}
            </button>
          )}
          {phase === 'done' && (
            <>
              <button type="button" onClick={props.onClose} className="mb-btn mb-btn-ghost">
                Terminer
              </button>
              <button type="button" onClick={() => setPhase('discover')} className="mb-btn mb-btn-ghost">
                Réécouter
              </button>
              <button type="button" onClick={() => void start('play')} className="mb-btn mb-btn-green">
                <RotateCcw className="h-5 w-5" /> Rejouer
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

/** A note folded into the on-screen keyboard (C4–B5), same pitch class. */
function fold(midi: number): number {
  let m = midi;
  while (m < 60) m += 12;
  while (m > 83) m -= 12;
  return m;
}

/**
 * The tune as blocks on a strip: time from left to right, pitch from bottom
 * to top, a fixed playhead. A note is to be struck when it reaches the line.
 */
function MelodyLane({
  notes,
  songMs,
  timeline,
  resultByIndex,
  nextIndex,
  notation,
}: {
  notes: MelodyNote[];
  songMs: number;
  timeline: Timeline;
  resultByIndex: Map<number, MelodyResult>;
  nextIndex: number;
  notation: 'intl' | 'fr';
}) {
  const before = LANE_BEFORE_BARS * timeline.barMs;
  const span = (LANE_BEFORE_BARS + LANE_AFTER_BARS) * timeline.barMs;
  const from = songMs - before;
  const low = Math.min(...notes.map((n) => n.midi)) - 1;
  const high = Math.max(...notes.map((n) => n.midi)) + 1;
  const visible = notes.filter((n) => n.startMs + n.durationMs >= from && n.startMs <= from + span);
  // Barlines in view.
  const firstBar = Math.ceil((from - timeline.formStartMs) / timeline.barMs);
  const barlines: number[] = [];
  for (let b = firstBar; timeline.formStartMs + b * timeline.barMs <= from + span; b++) {
    if (b >= 0 && b <= timeline.formBars) barlines.push(timeline.formStartMs + b * timeline.barMs);
  }
  const x = (ms: number) => `${((ms - from) / span) * 100}%`;
  const y = (midi: number) => `${((high - midi) / (high - low)) * 100}%`;
  return (
    <div className="relative mt-3 min-h-0 w-full flex-1 overflow-hidden rounded-2xl border-2 border-line bg-surface" aria-label="Mélodie qui défile">
      {barlines.map((ms) => (
        <span key={ms} className="absolute inset-y-0 w-px bg-line" style={{ left: x(ms) }} />
      ))}
      <span className="absolute inset-y-0 z-10 w-[3px] -translate-x-1/2 bg-brass" style={{ left: x(songMs) }} aria-hidden="true" />
      {visible.map((n) => {
        const r = resultByIndex.get(n.index);
        const isNext = n.index === nextIndex;
        const cls = r ? RESULT_STYLE[r.verdict] : isNext ? 'border-sky bg-sky text-white' : 'border-sky bg-sky/15 text-text';
        return (
          <span
            key={n.index}
            className={`absolute flex -translate-y-1/2 items-center overflow-hidden rounded-lg border-2 px-1 text-xs font-extrabold whitespace-nowrap sm:text-sm ${cls}`}
            style={{
              left: x(n.startMs),
              width: `max(1.6rem, ${(n.durationMs / span) * 100}%)`,
              top: y(n.midi),
              height: `max(1.4rem, ${100 / (high - low)}%)`,
            }}
          >
            {formatPitchClass(n.midi % 12, notation)}
          </span>
        );
      })}
    </div>
  );
}

function GestureHint({ chord, streak, notation }: { chord: number[] | undefined; streak: number; notation: 'intl' | 'fr' }) {
  if (!isValidGestureChord(chord)) return null;
  return (
    <p className="mr-auto flex items-center gap-2 text-sm font-bold text-muted" aria-live="polite">
      <span className="hidden sm:inline">
        Jouez <span className="font-display text-base text-text">{gestureChordLabel(chord!, notation)}</span> 3 fois pour jouer la mélodie
      </span>
      <span className="flex gap-1" aria-label={`${streak} sur 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full transition-colors ${i < streak ? 'bg-brass' : 'bg-line'}`} />
        ))}
      </span>
    </p>
  );
}
