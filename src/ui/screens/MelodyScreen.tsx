import { ChevronLeft, ChevronRight, GraduationCap, Headphones, Music, Play, RotateCcw, X } from 'lucide-react';
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
import {
  DEFAULT_SECTION_BARS,
  MelodySection,
  PASSES_TO_LEARN,
  SECTION_BAR_CHOICES,
  buildSections,
  isSectionLearned,
  nextSectionToLearn,
  passSucceeded,
  sectionOfBar,
  withSectionLearned,
} from '../../practice/melodySections';
import { Timeline, buildTimeline } from '../../practice/playAlong';
import { runMeetsObjective } from '../../practice/songProgress';
import { AppSettings, PlayAlongRun } from '../../storage/types';
import { FallingBar, FallingNote, FallingNoteState, FallingNotes } from '../components/FallingNotes';
import { GestureChordSetting, gestureChordLabel } from '../components/GestureChordSetting';
import { KeyboardVolume } from '../components/KeyboardVolume';
import { Mascot } from '../components/Mascot';

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
 * muted, the chords play). The notes fall onto a keyboard. Learning goes a few
 * bars at a time, in a loop: each section is heard once, then played until it
 * is passed a few times. Then the whole tune, judged, for the objective.
 * One screen, no scroll.
 */
type Phase = 'discover' | 'loading' | 'running' | 'done';
type Mode = 'listen' | 'play' | 'learn';
/** Inside a section: the first pass is heard, the next ones are played. */
type Stage = 'listen' | 'play';

const TEMPO_LEVELS: TempoLevel[] = ['slow', 'medium', 'original'];

/** The lane shows this many bars above the keys. */
const LANE_BARS = 2;
/** A note struck this early before the loop comes round belongs to the next pass. */
const LOOP_LEAD_MS = 150;

const VERDICT_STATE: Record<MelodyResult['verdict'], FallingNoteState> = {
  'on-time': 'on-time',
  anticipated: 'early',
  late: 'late',
  missed: 'missed',
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

interface PassFeedback {
  /** Pass number on the band's clock (a new key each time, to replay the pop). */
  pass: number;
  ok: boolean;
  found: number;
  total: number;
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
  /** Continuous clock (keeps growing through the loop): what the lane is drawn on. */
  const [linearMs, setLinearMs] = useState(0);
  const [results, setResults] = useState<MelodyResult[]>([]);
  const [summary, setSummary] = useState<MelodySummary | null>(null);
  const [lastRun, setLastRun] = useState<PlayAlongRun | null>(null);
  const [completed, setCompleted] = useState(false);
  const [showKeys, setShowKeys] = useState(true);
  // Hear the tune on the learner's own piano sound while playing it (not scored).
  const [melodyGuide, setMelodyGuide] = useState(false);
  const melodyGuideRef = useRef(false);
  melodyGuideRef.current = melodyGuide;
  const guideCursorRef = useRef({ lastMs: -Infinity, sounding: new Map<number, { timer: number; release: () => void }>() });

  // ---- Learning bit by bit ----
  const [section, setSection] = useState<MelodySection | null>(null);
  const [stage, setStage] = useState<Stage>('listen');
  const [passesWon, setPassesWon] = useState(0);
  const [feedback, setFeedback] = useState<PassFeedback | null>(null);
  const [lastPassResults, setLastPassResults] = useState<MelodyResult[]>([]);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [learnComplete, setLearnComplete] = useState(false);
  const sectionRef = useRef<MelodySection | null>(null);
  const stageRef = useRef<Stage>('listen');
  const passesWonRef = useRef(0);
  const loopPassRef = useRef(0);
  const celebrationTimer = useRef<number | null>(null);

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

  const loopBars = settings.melodyLoopBars ?? DEFAULT_SECTION_BARS;
  const loopBarsRef = useRef(loopBars);
  loopBarsRef.current = loopBars;
  const learnedBars = useMemo(() => settings.melodyLearned?.[songKey] ?? [], [settings.melodyLearned, songKey]);
  const learnedRef = useRef(learnedBars);
  learnedRef.current = learnedBars;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
  const prepared = useMemo(() => prepare(), [prepare]);

  /** The form cut into loops, on the run's clock while it plays. */
  const sections = useMemo(() => {
    const base = run ?? prepared;
    return base ? buildSections(base.timeline, base.notes, loopBars) : [];
  }, [run, prepared, loopBars]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const learnedCount = sections.filter((s) => s.notes.length > 0 && isSectionLearned(s, learnedBars)).length;
  const sectionsWithNotes = sections.filter((s) => s.notes.length > 0).length;
  const allLearned = sectionsWithNotes > 0 && learnedCount === sectionsWithNotes;

  // Learner's notes → song time → scorer (the judged run, and the played passes of a loop).
  useEffect(
    () =>
      subscribeNoteEvents((note, on, timeMs) => {
        if (!on) return;
        const backing = backingRef.current;
        const scorer = scorerRef.current;
        if (!backing || !scorer) return;
        if (modeRef.current === 'play') {
          const at = backing.songMs(timeMs, latencyRef.current);
          if (at !== null) scorer.noteOn(note, at);
        } else if (modeRef.current === 'learn' && stageRef.current === 'play') {
          const at = backing.songMs(timeMs, latencyRef.current, LOOP_LEAD_MS);
          if (at !== null) scorer.noteOn(note, at);
        }
      }),
    [subscribeNoteEvents],
  );

  /** Releases every note the melody guide is holding. */
  const silenceGuide = () => {
    const { sounding } = guideCursorRef.current;
    for (const { timer, release } of sounding.values()) {
      window.clearTimeout(timer);
      release();
    }
    sounding.clear();
  };

  /**
   * Plays, on the learner's piano sound, the tune notes the band just reached.
   * `force`: even with the guide off (a section's listening pass). `loopFromMs`:
   * when the band comes back round, the notes from the loop's start sound again.
   */
  const playGuide = (notes: MelodyNote[], audioMs: number, opts: { force?: boolean; loopFromMs?: number } = {}) => {
    const cursor = guideCursorRef.current;
    let from = cursor.lastMs;
    cursor.lastMs = audioMs;
    if (audioMs < from) {
      if (opts.loopFromMs === undefined) return;
      from = opts.loopFromMs - 1;
    }
    if (!opts.force && !melodyGuideRef.current) return;
    for (const n of notes) {
      if (n.startMs <= from || n.startMs > audioMs) continue;
      // Its own voice: never cuts (nor is cut by) the learner's key.
      const previous = cursor.sounding.get(n.midi);
      if (previous) {
        window.clearTimeout(previous.timer);
        previous.release();
      }
      const release = pianoSynth.playDetached(n.midi, 84);
      const timer = window.setTimeout(() => {
        cursor.sounding.delete(n.midi);
        release();
      }, Math.max(80, n.durationMs - 20));
      cursor.sounding.set(n.midi, { timer, release });
    }
  };

  // Turning the guide off mid-run cuts the notes still sounding.
  useEffect(() => {
    if (!melodyGuide) silenceGuide();
  }, [melodyGuide]);

  const stopFrame = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    silenceGuide();
  };

  useEffect(
    () => () => {
      stopFrame();
      if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
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
      if (modeRef.current === 'learn') {
        // Learning is saved bar by bar as it goes: the end only says whether all of it is known.
        setPhase(reachedEnd ? 'done' : 'discover');
        return;
      }
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

  /** Loops the band over a section: one bar of clicks, a pass to listen, then the learner plays. */
  const enterSection = async (sec: MelodySection) => {
    const backing = backingRef.current;
    const prepared = runRef.current;
    if (!backing || !prepared) return;
    sectionRef.current = sec;
    setSection(sec);
    stageRef.current = 'listen';
    setStage('listen');
    passesWonRef.current = 0;
    setPassesWon(0);
    loopPassRef.current = 0;
    setFeedback(null);
    setResults([]);
    setLastPassResults([]);
    scorerRef.current = new MelodyScorer(sec.notes, defaultMelodyOptions(prepared.bpm));
    silenceGuide();
    guideCursorRef.current.lastMs = -Infinity;
    backing.pause();
    backing.setLoop({ fromMs: sec.fromMs, toMs: sec.toMs });
    await backing.resumeAt(sec.fromMs, prepared.timeline.barMs, prepared.timeline.beatsPerBar);
  };

  const celebrate = (text: string) => {
    setCelebration(text);
    if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 2600);
  };

  /** The loop came round: judge the pass that just ended, and move on when the section is known. */
  const closePass = (pass: number) => {
    const sec = sectionRef.current;
    const prepared = runRef.current;
    const scorer = scorerRef.current;
    if (!sec || !prepared || !scorer) return;
    if (stageRef.current === 'listen') {
      stageRef.current = 'play';
      setStage('play');
      setResults([]);
      scorerRef.current = new MelodyScorer(sec.notes, defaultMelodyOptions(prepared.bpm));
      return;
    }
    scorer.advance(Number.POSITIVE_INFINITY);
    const passResults = scorer.results.map((r) => ({ ...r, index: sec.notes[r.index].index }));
    const sum = summarizeMelody(passResults, scorer.wrongNotes);
    const ok = passSucceeded(sum);
    setLastPassResults(passResults);
    setResults([]);
    setFeedback({ pass, ok, found: sum.found, total: sum.total });
    scorerRef.current = new MelodyScorer(sec.notes, defaultMelodyOptions(prepared.bpm));
    if (!ok) return;
    const won = passesWonRef.current + 1;
    passesWonRef.current = won;
    setPassesWon(won);
    if (won < PASSES_TO_LEARN) return;

    // Section learned: saved at once, then the next one to learn.
    const wasLearned = isSectionLearned(sec, learnedRef.current);
    const learned = withSectionLearned(learnedRef.current, sec);
    learnedRef.current = learned;
    onUpdateSettings({ melodyLearned: { ...(settingsRef.current.melodyLearned ?? {}), [songKey]: learned } });
    const secs = sectionsRef.current;
    let next = nextSectionToLearn(secs, learned, sec.index + 1);
    if (next === null) {
      if (!wasLearned) {
        // That was the last bit: the whole tune is known.
        setLearnComplete(true);
        void finish(true);
        return;
      }
      // Everything was known already: practice goes on in order, round and round.
      const after = nextWithNotes(secs, sec.index);
      next = after === sec.index ? Math.max(0, secs.findIndex((x) => x.notes.length > 0)) : after;
    }
    celebrate(`${barsLabel(sec)} : c’est appris !`);
    void enterSection(secs[next]);
  };

  const start = async (nextMode: Mode, sectionIndex?: number) => {
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
    setLinearMs(0);
    setLearnComplete(false);
    setCelebration(null);
    scorerRef.current = nextMode === 'play' ? new MelodyScorer(prepared.notes, defaultMelodyOptions(prepared.bpm)) : null;
    guideCursorRef.current.lastMs = -Infinity;
    setPhase('loading');
    try {
      // Listening: the tune sounds. Playing or learning: the learner is the tune. The chords always play.
      const muted =
        nextMode === 'listen'
          ? mutedChannels.filter((c) => c !== prepared.melodyChannel)
          : [...new Set([...mutedChannels, prepared.melodyChannel])];
      await backing.load(prepared.buffer, {
        bpm: prepared.bpm,
        pianoGuideVolume: 0.85,
        bars: prepared.bars,
        sounds: songSounds,
        muted,
        metronomeBar: prepared.countInBars >= 1 ? prepared.countInBars - 1 : undefined,
      });
      if (backingRef.current !== backing) return;

      if (nextMode === 'learn') {
        const secs = buildSections(prepared.timeline, prepared.notes, loopBarsRef.current);
        const first = sectionIndex ?? nextSectionToLearn(secs, learnedRef.current) ?? Math.max(0, secs.findIndex((s) => s.notes.length > 0));
        setPhase('running');
        await enterSection(secs[first]);
        const frame = () => {
          backing.sync();
          const now = performance.now();
          const linear = backing.linearMs(now, latencyRef.current) ?? 0;
          const pass = backing.loopPass(linear, LOOP_LEAD_MS);
          if (pass > loopPassRef.current) {
            loopPassRef.current = pass;
            closePass(pass);
          }
          const sec = sectionRef.current;
          const at = backing.songMs(now, latencyRef.current, LOOP_LEAD_MS) ?? 0;
          if (sec && stageRef.current === 'play') {
            const fresh = scorerRef.current?.advance(at) ?? [];
            if (fresh.length) setResults((prev) => [...prev, ...fresh.map((r) => ({ ...r, index: sec.notes[r.index].index }))]);
          }
          if (sec) playGuide(sec.notes, backing.songMs(now) ?? 0, { force: stageRef.current === 'listen', loopFromMs: sec.fromMs });
          setLinearMs(linear);
          setSongMs(at);
          if (!finishedRef.current) rafRef.current = requestAnimationFrame(frame);
        };
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const ok = await backing.start();
      if (!ok) throw new Error('Le navigateur a bloqué le son. Cliquez à nouveau.');
      setPhase('running');
      const frame = () => {
        backing.sync();
        if (modeRef.current === 'play') playGuide(prepared.notes, backing.songMs(performance.now()) ?? 0);
        const now = backing.songMs(performance.now(), latencyRef.current) ?? 0;
        const fresh = scorerRef.current?.advance(now) ?? [];
        if (fresh.length) setResults((prev) => [...prev, ...fresh]);
        setSongMs(now);
        setLinearMs(now);
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

  /** Another section, chosen by the learner (the band keeps going). */
  const goToSection = (index: number) => {
    const sec = sectionsRef.current[index];
    if (!sec) return;
    if (phase === 'running' && modeRef.current === 'learn') void enterSection(sec);
    else void start('learn', index);
  };

  /** New loop length: same place in the song, cut differently. */
  const changeLoopBars = (bars: number) => {
    onUpdateSettings({ melodyLoopBars: bars });
    loopBarsRef.current = bars;
    const prepared = runRef.current;
    const current = sectionRef.current;
    if (phase !== 'running' || modeRef.current !== 'learn' || !prepared || !current) return;
    const secs = buildSections(prepared.timeline, prepared.notes, bars);
    sectionsRef.current = secs;
    void enterSection(secs[sectionOfBar(secs, current.fromBar)]);
  };

  const ready = prepared !== null;
  const noMelody = raw !== null && melodyChannel === null;

  // Hands-free: the favourite chord 3 times starts the main action (learn while
  // something is left to learn, else the judged run). Off while the band plays.
  const gestureActive = phase === 'discover' || phase === 'done';
  const gestureStreak = useChordGesture(subscribeNoteEvents, settings.gestureChord, gestureActive && ready, () =>
    void start(allLearned ? 'play' : 'learn'),
  );

  const setGestureChord = useCallback((gestureChord: number[] | undefined) => onUpdateSettings({ gestureChord }), [onUpdateSettings]);

  // ---- Running view ----
  const timeline = run?.timeline ?? null;
  const notes = run?.notes ?? [];
  const resultByIndex = useMemo(() => new Map(results.map((r) => [r.index, r])), [results]);
  const lastPassByIndex = useMemo(() => new Map(lastPassResults.map((r) => [r.index, r])), [lastPassResults]);
  const inCountIn = timeline !== null && mode !== 'learn' && songMs < timeline.formStartMs;
  const countInBeatsLeft = timeline ? Math.max(1, Math.ceil((timeline.formStartMs - songMs) / timeline.beatMs)) : 0;
  const windowMs = run ? defaultMelodyOptions(run.bpm).windowMs : 300;
  const pool = mode === 'learn' ? (section?.notes ?? []) : notes;
  // The note to play now or next: the first one not over yet.
  const nextNote = pool.find((n) => n.startMs + windowMs >= songMs && !resultByIndex.has(n.index)) ?? (mode === 'learn' ? pool[0] : undefined);
  const live = results.length ? summarizeMelody(results, scorerRef.current?.wrongNotes ?? 0) : null;
  const lastResult = results.at(-1);
  const melodyRange = useMemo(() => {
    const all = (run ?? prepared)?.notes ?? [];
    return all.length ? { low: Math.min(...all.map((n) => n.midi)), high: Math.max(...all.map((n) => n.midi)) } : { low: 60, high: 83 };
  }, [run, prepared]);

  /** What falls: the whole tune, or the section pass after pass. */
  const lane = useMemo((): { notes: FallingNote[]; bars: FallingBar[] } => {
    if (!timeline) return { notes: [], bars: [] };
    const chordsOfBar = (bar: number, shift: number) =>
      timeline.chords.filter((c) => c.formBar === bar).map((c) => ({ ms: c.startMs + shift, label: formatChartChord(c.item, notation) }));
    const barAt = (bar: number, shift: number, key: string, loopStart = false): FallingBar => ({
      key,
      ms: timeline.formStartMs + bar * timeline.barMs + shift,
      number: bar + 1,
      chords: chordsOfBar(bar, shift),
      loopStart,
    });
    const stateOf = (n: MelodyNote, byIndex: Map<number, MelodyResult>, live: boolean): FallingNoteState => {
      const r = byIndex.get(n.index);
      if (r) return VERDICT_STATE[r.verdict];
      return live && n.index === nextNote?.index ? 'next' : 'upcoming';
    };

    if (mode === 'learn' && section) {
      const len = section.toMs - section.fromMs;
      // Same lead as the band's pass count: the last instants already show the next pass.
      const current = linearMs < section.fromMs ? 0 : Math.max(0, Math.floor((linearMs - section.fromMs + LOOP_LEAD_MS) / len));
      const out: { notes: FallingNote[]; bars: FallingBar[] } = { notes: [], bars: [] };
      for (let q = Math.max(0, current - 1); q <= current + 2; q++) {
        const shift = q * len;
        // Pass 0 is heard; then the band's passes are played (the current one live, the last one judged).
        const listening = q === 0 || (q === current && stage === 'listen');
        for (const n of section.notes) {
          const state: FallingNoteState = listening
            ? 'listen'
            : q === current
              ? stateOf(n, resultByIndex, true)
              : q === current - 1
                ? stateOf(n, lastPassByIndex, false)
                : 'upcoming';
          out.notes.push({ key: `${q}-${n.index}`, midi: n.midi, startMs: n.startMs + shift, durationMs: n.durationMs, state });
        }
        for (let b = section.fromBar; b < section.toBar; b++) out.bars.push(barAt(b, shift, `${q}-${b}`, b === section.fromBar && q > 0));
      }
      return out;
    }

    return {
      notes: notes.map((n) => ({
        key: String(n.index),
        midi: n.midi,
        startMs: n.startMs,
        durationMs: n.durationMs,
        state: mode === 'listen' ? 'listen' : stateOf(n, resultByIndex, true),
      })),
      bars: Array.from({ length: timeline.formBars }, (_, b) => barAt(b, 0, String(b))),
    };
  }, [timeline, notes, mode, section, linearMs, stage, resultByIndex, lastPassByIndex, nextNote?.index, notation]);

  const advice = (() => {
    if (!summary || summary.total === 0) return 'Aucune note de la mélodie n’a été jouée : relancez quand vous êtes prêt.';
    if (!completed) return `Arrêté après ${summary.total} notes. Seul un passage joué jusqu’au bout compte pour l’objectif.`;
    if (summary.noteAccuracy < 0.6) return 'Beaucoup de notes manquent : reprenez les passages difficiles mesure par mesure, puis rejouez en entier.';
    if (summary.timingAccuracy < 0.6) {
      const mean = summary.meanOffsetMs ?? 0;
      return mean > 100
        ? `Vous jouez souvent après la note (${mean} ms en moyenne) : regardez la note tomber, et préparez le doigt avant qu’elle touche le clavier.`
        : 'Le placement varie : écoutez la batterie et chantez la mélodie dans votre tête en jouant.';
    }
    if (summary.noteAccuracy >= 0.85 && summary.timingAccuracy >= 0.8) return 'Belle mélodie ! Essayez un tempo plus rapide, ou jouez sans les touches affichées.';
    return 'Bonne base : rejouez une fois pour fixer les phrases.';
  })();

  const learnMessage = (() => {
    if (!section || !timeline) return '';
    if (stage === 'listen') return linearMs < section.fromMs ? `Écoute d’abord : ${barsLabel(section).toLowerCase()}` : 'Écoute la mélodie…';
    if (feedback && feedback.ok) return `Super ! ${feedback.found}/${feedback.total} notes`;
    if (feedback) return `Presque : ${feedback.found}/${feedback.total} notes. Encore une fois !`;
    return 'À toi ! Joue chaque note quand elle touche le clavier.';
  })();

  const mood =
    phase === 'done'
      ? learnComplete || (summary?.noteAccuracy ?? 0) >= 0.7
        ? 'happy'
        : 'oops'
      : mode === 'learn'
        ? celebration || feedback?.ok
          ? 'happy'
          : feedback
            ? 'oops'
            : 'listen'
        : lastResult?.verdict === 'missed'
          ? 'oops'
          : 'listen';

  const learnedSectionCount = sections.length ? `${learnedCount}/${sectionsWithNotes}` : '—';

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
          {timeline && phase === 'running' && mode !== 'learn' && (
            <div className="mb-progress mt-1 h-2.5" role="progressbar" aria-label="Avancement du morceau">
              <span style={{ width: `${Math.min(100, (songMs / timeline.endMs) * 100)}%` }} />
            </div>
          )}
          {phase === 'running' && mode === 'learn' && (
            <SectionPath sections={sections} learnedBars={learnedBars} current={section?.index ?? -1} onPick={goToSection} />
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
              {sections.length > 0 && (
                <div className="mb-panel p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-lg font-semibold">Apprentissage mesure par mesure</p>
                    <p className="text-sm font-bold text-muted">{learnedSectionCount} passages appris</p>
                  </div>
                  <SectionPath sections={sections} learnedBars={learnedBars} current={-1} onPick={ready ? goToSection : undefined} />
                </div>
              )}
              <div className="flex flex-wrap gap-x-8 gap-y-3">
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
                <LoopLengthPicker value={loopBars} onChange={changeLoopBars} />
              </div>
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

          {/* ---------- Running: the tune falls onto the keys ---------- */}
          {phase === 'running' && timeline && (
            <>
              {mode === 'learn' ? (
                <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
                  <Mascot size={48} mood={mood} className="hidden shrink-0 sm:block" />
                  <p
                    key={`${stage}-${feedback?.pass ?? 0}`}
                    className={`mb-pop rounded-2xl px-4 py-2 font-display text-lg font-semibold ${
                      stage === 'listen'
                        ? 'bg-sky/15 text-sky-press'
                        : feedback?.ok
                          ? 'bg-green text-white shadow-[0_3px_0_var(--color-green-press)]'
                          : feedback
                            ? 'bg-coral/15 text-coral-press'
                            : 'bg-mist'
                    }`}
                  >
                    {stage === 'listen' && <Headphones className="mr-2 inline h-5 w-5 align-[-3px]" />}
                    {learnMessage}
                  </p>
                  <span className="flex items-center gap-1.5" aria-label={`${passesWon} passages réussis sur ${PASSES_TO_LEARN}`}>
                    {Array.from({ length: PASSES_TO_LEARN }, (_, i) => (
                      <span
                        key={i}
                        className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-extrabold transition-colors ${
                          i < passesWon ? 'border-green bg-green text-white' : 'border-line text-muted'
                        }`}
                      >
                        {i < passesWon ? '✓' : ''}
                      </span>
                    ))}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Passage précédent"
                      disabled={!section || section.index === 0}
                      onClick={() => section && goToSection(prevWithNotes(sections, section.index))}
                      className="mb-btn mb-btn-sm mb-btn-ghost px-2"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="font-display text-base font-semibold whitespace-nowrap">{section ? barsLabel(section) : ''}</span>
                    <button
                      type="button"
                      aria-label="Passage suivant"
                      disabled={!section || section.index >= sections.length - 1}
                      onClick={() => section && goToSection(nextWithNotes(sections, section.index))}
                      className="mb-btn mb-btn-sm mb-btn-ghost px-2"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <LoopLengthPicker compact value={loopBars} onChange={changeLoopBars} />
                  </div>
                </div>
              ) : (
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
                  {live && (
                    <span className="ml-auto hidden text-sm font-bold text-muted md:inline">
                      Notes {Math.round(live.noteAccuracy * 100)} % · À l’heure {Math.round(live.timingAccuracy * 100)} %
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 flex min-h-0 w-full flex-1">
                <FallingNotes
                  notes={lane.notes}
                  bars={lane.bars}
                  nowMs={linearMs}
                  lookaheadMs={LANE_BARS * timeline.barMs}
                  beatMs={timeline.beatMs}
                  lowMidi={melodyRange.low}
                  highMidi={melodyRange.high}
                  activeNotes={activeNotes}
                  targetMidi={nextNote?.midi ?? null}
                  showTarget={showKeys && !(mode === 'learn' && stage === 'listen')}
                  notation={notation}
                  onPressNote={props.onPressVirtualNote}
                  onReleaseNote={props.onReleaseVirtualNote}
                >
                  {celebration && (
                    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
                      <p className="mb-pop rounded-3xl bg-green px-6 py-4 font-display text-3xl font-bold text-white shadow-[0_6px_0_var(--color-green-press)]">
                        🎉 {celebration}
                      </p>
                    </div>
                  )}
                </FallingNotes>
              </div>
            </>
          )}

          {/* ---------- Done ---------- */}
          {phase === 'done' && learnComplete && (
            <div className="w-full max-w-2xl">
              <div className="flex items-end gap-3">
                <Mascot size={80} mood="happy" className="shrink-0" />
                <p className="mb-pop mb-4 rounded-2xl bg-green p-4 font-display text-xl font-semibold text-white shadow-[0_4px_0_var(--color-green-press)]">
                  Toute la mélodie est apprise ! Jouez-la maintenant en entier, sans boucle.
                </p>
              </div>
            </div>
          )}
          {phase === 'done' && !learnComplete && summary && (
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
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-8">
          {gestureActive && <GestureHint chord={settings.gestureChord} streak={gestureStreak} notation={notation} learn={!allLearned} />}
          {phase === 'discover' && (
            <>
              <button type="button" disabled={!ready} onClick={() => void start('listen')} className="mb-btn mb-btn-ghost">
                <Headphones className="h-5 w-5" /> Écouter
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => void start('play')}
                className={`mb-btn ${allLearned ? 'mb-btn-green min-w-48' : 'mb-btn-ghost'}`}
              >
                <Play className="h-5 w-5 fill-current" /> Jouer en entier
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => void start('learn')}
                className={`mb-btn ${allLearned ? 'mb-btn-ghost' : 'mb-btn-green min-w-48'}`}
              >
                <GraduationCap className="h-5 w-5" /> {learnedCount > 0 && !allLearned ? 'Continuer' : 'Apprendre'} mesure par mesure
              </button>
            </>
          )}
          {(phase === 'discover' || phase === 'done' || ((phase === 'running' || phase === 'loading') && mode !== 'listen')) && (
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
                {learnComplete ? 'Retour' : 'Réécouter'}
              </button>
              <button type="button" onClick={() => void start('play')} className="mb-btn mb-btn-green">
                <RotateCcw className="h-5 w-5" /> {learnComplete ? 'Jouer en entier' : 'Rejouer'}
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

/** "Mesures 3–4" (or "Mesure 3"), 1-based. */
function barsLabel(s: MelodySection): string {
  return s.toBar - s.fromBar > 1 ? `Mesures ${s.fromBar + 1}–${s.toBar}` : `Mesure ${s.fromBar + 1}`;
}

function nextWithNotes(sections: MelodySection[], from: number): number {
  const i = sections.findIndex((s, k) => k > from && s.notes.length > 0);
  return i < 0 ? from : i;
}

function prevWithNotes(sections: MelodySection[], from: number): number {
  for (let k = from - 1; k >= 0; k--) if (sections[k].notes.length > 0) return k;
  return from;
}

/** The song as a row of segments, one per loop: learned in green, the current one lit. */
function SectionPath({
  sections,
  learnedBars,
  current,
  onPick,
}: {
  sections: MelodySection[];
  learnedBars: number[];
  current: number;
  onPick?: (index: number) => void;
}) {
  return (
    <div className="mt-1.5 flex w-full gap-1" role="list" aria-label="Passages de la mélodie">
      {sections.map((s) => {
        const empty = s.notes.length === 0;
        const learned = !empty && isSectionLearned(s, learnedBars);
        const isCurrent = s.index === current;
        return (
          <button
            key={s.index}
            type="button"
            role="listitem"
            disabled={empty || !onPick}
            onClick={() => onPick?.(s.index)}
            title={`${barsLabel(s)}${empty ? ' (silence)' : learned ? ' : apprise' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
            className={`h-3 min-w-0 flex-1 rounded-full transition-all ${
              isCurrent
                ? 'h-4 bg-sky ring-2 ring-sky/40 ring-offset-2 ring-offset-page'
                : learned
                  ? 'bg-green'
                  : empty
                    ? 'bg-line/40'
                    : 'bg-line hover:bg-sky/50'
            }`}
          />
        );
      })}
    </div>
  );
}

function LoopLengthPicker({ value, onChange, compact = false }: { value: number; onChange: (bars: number) => void; compact?: boolean }) {
  return (
    <fieldset className={compact ? 'flex items-center gap-1' : ''}>
      <legend className={compact ? 'sr-only' : 'font-display text-base font-semibold'}>Longueur de la boucle</legend>
      <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'mt-1.5'}`}>
        {SECTION_BAR_CHOICES.map((bars) => (
          <button
            key={bars}
            type="button"
            aria-pressed={value === bars}
            onClick={() => onChange(bars)}
            title={`Boucle de ${bars} mesure${bars > 1 ? 's' : ''}`}
            className={`mb-btn mb-btn-sm ${value === bars ? 'mb-btn-sky' : 'mb-btn-ghost'} ${compact ? 'px-2.5' : ''}`}
          >
            {bars}
            {compact ? '' : ` mesure${bars > 1 ? 's' : ''}`}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function GestureHint({ chord, streak, notation, learn }: { chord: number[] | undefined; streak: number; notation: 'intl' | 'fr'; learn: boolean }) {
  if (!isValidGestureChord(chord)) return null;
  return (
    <p className="mr-auto flex items-center gap-2 text-sm font-bold text-muted" aria-live="polite">
      <span className="hidden sm:inline">
        Jouez <span className="font-display text-base text-text">{gestureChordLabel(chord!, notation)}</span> 3 fois pour{' '}
        {learn ? 'apprendre' : 'jouer'} la mélodie
      </span>
      <span className="flex gap-1" aria-label={`${streak} sur 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full transition-colors ${i < streak ? 'bg-brass' : 'bg-line'}`} />
        ))}
      </span>
    </p>
  );
}
