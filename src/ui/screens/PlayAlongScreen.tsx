import { Play, RotateCcw, Square, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackingTrack } from '../../audio/backingTrack';
import { MidiAnalysis, isClickTrackName, alignFormStart, alignedChoruses, analyzeMidi, describeTracks, normalizePickup, prependCountIn } from '../../audio/midiFile';
import { listBandParts, auditionSound, stopAudition } from '../../audio/bandSequencer';
import { SOUND_LIBRARY, familyOf, partLabel, resolveSound } from '../../audio/bandInstruments';
import { songTitleKey } from '../../content/localSongs';
import { pianoSynth } from '../../audio/synth';
import { LocalSongFile } from '../../content/localSongs';
import { NoteEventListener } from '../../input/types';
import { ChartChord, ChordChart, chartBarRoots, formatChartChord } from '../../music/chart';
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
import { ChordDiscovery } from '../components/ChordDiscovery';
import { KeyboardVolume } from '../components/KeyboardVolume';
import { LatencyBadge } from '../components/LatencyBadge';
import { GestureChordSetting, gestureChordLabel } from '../components/GestureChordSetting';
import { useChordGesture } from '../../input/useChordGesture';
import { isValidGestureChord } from '../../input/chordGesture';

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

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m} min ${String(sec).padStart(2, '0')}` : `${sec} s`;
}

type Phase = 'discover' | 'setup' | 'loading' | 'playing' | 'done';

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
  // Every run starts by showing the song's chords calmly (new notion first).
  const [phase, setPhase] = useState<Phase>('discover');
  const goal = props.objective;
  const [step, setStep] = useState<VoicingStep>(goal?.objective.step ?? 'root');
  const [tempoLevel, setTempoLevel] = useState<TempoLevel>(goal?.objective.tempo ?? 'slow');
  const [originalBpm, setOriginalBpm] = useState<number | null>(null);
  const [midiInfo, setMidiInfo] = useState<MidiAnalysis | null>(null);
  /** Passes through the form: one is enough to practise, the full export can be long. */
  const [chorusChoice, setChorusChoice] = useState(1);
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
  // Pause & navigation (Space, arrows): the band stops, a cursor moves in the chart.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  /** Learner moved in the chart: the run is practice, it can't validate an objective. */
  const navigatedRef = useRef(false);
  /** Song time where a resumed passage starts (one metronome bar before it). */
  const [resumeAtMs, setResumeAtMs] = useState<number | null>(null);
  // Loop a section (B in pause: start, then end, then off), by chord indices.
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const loopRef = useRef<{ start: number; end: number } | null>(null);
  const [loopMark, setLoopMark] = useState<number | null>(null);
  /** Results of the finished passes through the loop (each pass is judged). */
  const loopArchiveRef = useRef<ChordResult[]>([]);
  const loopPassRef = useRef(0);
  const [loopPass, setLoopPass] = useState(0);
  /** The scorer's anticipation: a chord struck this early belongs to the next pass. */
  const anticipationRef = useRef(0);
  const runConfigRef = useRef({ step, bpm: 0, originalBpm: 0 });

  // Read the MIDI once to know its tempo (tempo buttons show real BPM).
  useEffect(() => {
    let alive = true;
    fetch(localSong.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((raw) => {
        if (!alive) return;
        const buffer = normalizePickup(raw);
        midiBufferRef.current = buffer;
        const info = analyzeMidi(buffer);
        setMidiInfo(info);
        setOriginalBpm(info.bpm);
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
      if (!backing || !scorer || pausedRef.current) return;
      const songMs = backing.songMs(timeMs, latencyRef.current, anticipationRef.current);
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
    async (reachedEnd: boolean) => {
      // A run with jumps in the chart is practice: it doesn't count as complete.
      const completed = reachedEnd && !navigatedRef.current;
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
      if (reachedEnd) scorer.advance(Number.POSITIVE_INFINITY);
      const all = [...loopArchiveRef.current, ...scorer.results];
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

  // Bars before the form: iReal's click count-in, or the intro of another
  // arrangement (found by matching its bass with the chart).
  const formStartBar = useMemo(() => {
    if (!midiInfo) return 0;
    if (midiInfo.iReal || !chart || !midiBufferRef.current) return midiInfo.firstMusicBar;
    return alignFormStart(midiBufferRef.current, chartBarRoots(chart)) ?? midiInfo.firstMusicBar;
  }, [midiInfo, chart]);
  // Non-iReal files: only offer the passes where the bass follows the chart.
  const verifiedChoruses = useMemo(() => {
    if (!midiInfo || midiInfo.iReal || !chart || !midiBufferRef.current) return Number.POSITIVE_INFINITY;
    return alignedChoruses(midiBufferRef.current, chartBarRoots(chart), formStartBar);
  }, [midiInfo, chart, formStartBar]);

  // Band sounds chosen for this song (MIDI channel 0–15 → sound id).
  const songKey = songTitleKey(localSong.title);
  const songSounds = useMemo(() => {
    const saved = settings.bandSounds?.[songKey] ?? {};
    return Object.fromEntries(Object.entries(saved).map(([ch, id]) => [Number(ch), id])) as Record<number, string>;
  }, [settings.bandSounds, songKey]);
  const chooseSound = (channel: number, id: string) => {
    const all = settings.bandSounds ?? {};
    onUpdateSettings({ bandSounds: { ...all, [songKey]: { ...(all[songKey] ?? {}), [String(channel)]: id } } });
  };
  const mutedChannels = useMemo(() => settings.bandMuted?.[songKey] ?? [], [settings.bandMuted, songKey]);
  const toggleMute = (channel: number) => {
    const muted = !mutedChannels.includes(channel);
    const next = muted ? [...mutedChannels, channel] : mutedChannels.filter((c) => c !== channel);
    onUpdateSettings({ bandMuted: { ...(settings.bandMuted ?? {}), [songKey]: next } });
    previewRef.current?.setMuted(channel, muted);
  };
  const bandParts = useMemo(() => {
    if (!midiInfo || !midiBufferRef.current) return [];
    // Skip a channel that carries only a count-in (a click track can share the drum channel).
    const tracks = describeTracks(midiBufferRef.current);
    const music = new Set(tracks.filter((t) => !isClickTrackName(t.name)).map((t) => t.channel));
    const clickChannels = tracks.filter((t) => isClickTrackName(t.name) && !music.has(t.channel)).map((t) => t.channel - 1);
    return listBandParts(midiBufferRef.current, clickChannels);
  }, [midiInfo]);

  /** The file as the band will play it, and where the learner comes in. */
  const prepareRun = (choruseWanted: number) => {
    if (!chart || !midiBufferRef.current || originalBpm === null) return null;
    // A file that starts straight on the form gets a one-bar count-in.
    const needsCountIn = formStartBar === 0;
    const buffer = needsCountIn ? prependCountIn(midiBufferRef.current.slice(0), 1) : midiBufferRef.current.slice(0);
    const bpm = resolveTempo(tempoLevel, originalBpm);
    const formBars = chart.bars.length;
    const info = analyzeMidi(buffer);
    const countInBars = needsCountIn ? 1 : formStartBar;
    const exact = (info.totalBars - countInBars) / formBars;
    const inFile = Math.max(1, Math.floor(exact + 0.1));
    const available = Math.max(1, Math.min(verifiedChoruses, inFile));
    const choruses = Math.min(choruseWanted, available);
    const bars = choruses < inFile ? countInBars + choruses * formBars : undefined;
    return { buffer, bpm, formBars, countInBars, exact, inFile, choruses, bars };
  };

  // "Écouter le morceau": the whole band (piano included), one pass, before practising.
  const previewRef = useRef<BackingTrack | null>(null);
  const [previewing, setPreviewing] = useState<'off' | 'loading' | 'playing'>('off');
  const stopPreview = useCallback(() => {
    void previewRef.current?.dispose();
    previewRef.current = null;
    setPreviewing('off');
  }, []);
  const togglePreview = async () => {
    if (previewing !== 'off') {
      stopPreview();
      return;
    }
    const run = prepareRun(1);
    if (!run) return;
    void stopAudition();
    const band = new BackingTrack();
    previewRef.current = band;
    setPreviewing('loading');
    try {
      await band.load(run.buffer, { bpm: run.bpm, pianoGuideVolume: 0.8, bars: run.bars, sounds: songSounds, muted: mutedChannels });
      if (previewRef.current !== band) return;
      await band.start();
      setPreviewing('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stopPreview();
    }
  };
  useEffect(() => {
    if (phase !== 'setup') stopPreview();
  }, [phase, stopPreview]);
  useEffect(() => () => {
    void previewRef.current?.dispose();
    void stopAudition();
  }, []);

  const start = async () => {
    if (!chart || !midiBufferRef.current || originalBpm === null) return;
    stopPreview();
    void stopAudition();
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
      const run = prepareRun(chorusChoice);
      if (!run) throw new Error('Morceau pas encore prêt.');
      const { buffer, bpm, formBars, countInBars, exact, inFile, choruses } = run;
      const analysis = await backing.load(buffer, {
        bpm,
        pianoGuideVolume: pianoGuide ? 0.35 : 0,
        bars: run.bars,
        sounds: songSounds,
        muted: mutedChannels,
        // Clear metronome clicks on the bar before the learner comes in.
        metronomeBar: countInBars >= 1 ? countInBars - 1 : undefined,
      });
      if (chart.unsupportedJumps.length > 0 || (Number.isFinite(verifiedChoruses) ? verifiedChoruses === 0 : Math.abs(exact - inFile) > 0.25)) {
        setFormWarning(
          `La grille iReal (${formBars} mesures) ne tombe pas juste avec le MIDI (${analysis.totalBars - countInBars} mesures après le décompte) : certains accords peuvent être décalés.`,
        );
      }
      const tl = buildTimeline(chart, { bpm, countInBars, choruses });
      timelineRef.current = tl;
      setTimeline(tl);
      const scorerOptions = defaultScorerOptions(tl, step);
      anticipationRef.current = scorerOptions.anticipationMs;
      scorerRef.current = new PlayAlongScorer(tl, scorerOptions);
      loopRef.current = null;
      setLoop(null);
      setLoopMark(null);
      loopArchiveRef.current = [];
      loopPassRef.current = 0;
      setLoopPass(0);
      runConfigRef.current = { step, bpm, originalBpm };
      setResults([]);
      setSummary(null);
      pausedRef.current = false;
      setPaused(false);
      navigatedRef.current = false;
      setResumeAtMs(null);
      onUpdateSettings({ playAlongLatencyMs: latencyMs });

      const ok = await backing.start();
      if (!ok) throw new Error('Le navigateur a bloqué le son. Cliquez à nouveau sur Commencer.');
      setPhase('playing');

      const loop = () => {
        if (pausedRef.current) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        backing.sync();
        const songMs = backing.songMs(performance.now(), latencyRef.current) ?? 0;
        const fresh = scorerRef.current?.advance(songMs) ?? [];
        if (fresh.length) setResults((prev) => [...prev, ...fresh]);
        const looping = loopRef.current;
        if (looping && scorerRef.current) {
          const linear = backing.linearMs(performance.now(), latencyRef.current) ?? 0;
          const pass = backing.loopPass(linear, anticipationRef.current);
          if (pass > loopPassRef.current) {
            // A pass is over: keep its results, judge the section afresh.
            const scorer = scorerRef.current;
            scorer.advance(tl.chords[looping.end].endMs);
            loopArchiveRef.current.push(...scorer.results.filter((r) => r.index >= looping.start && r.index <= looping.end));
            scorer.seek(looping.start);
            setResults((prev) => prev.filter((r) => r.index < looping.start || r.index > looping.end));
            loopPassRef.current = pass;
            setLoopPass(pass);
          }
        }
        const index = chordIndexAt(tl, songMs);
        const beat = Math.floor(songMs / tl.beatMs);
        setClock((c) => (c.index === index && c.beat === beat ? c : { index, beat, songMs }));
        if (!loopRef.current && songMs > tl.endMs + 400) {
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

  // Hands-free: the favourite chord struck 3 times goes to the next page, one
  // page at a time: discovery → settings → song; results → settings. Off while
  // the band plays.
  const gestureActive = phase === 'discover' || phase === 'setup' || phase === 'done';
  const canStart = chart !== null && originalBpm !== null;
  const gestureStreak = useChordGesture(subscribeNoteEvents, settings.gestureChord, gestureActive, () => {
    if (phase === 'setup') {
      if (canStart) void start();
    } else if (chart) {
      setPhase('setup');
    }
  });

  // The page behind this full-screen view must not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const setGestureChord = useCallback(
    (gestureChord: number[] | undefined) => onUpdateSettings({ gestureChord }),
    [onUpdateSettings],
  );

  // ---- Pause & navigation in the chart (keyboard: Space, ← → ↑ ↓) ----
  const showCursor = (index: number) => {
    const tl = timelineRef.current;
    if (!tl || !tl.chords.length) return;
    const i = Math.max(0, Math.min(index, tl.chords.length - 1));
    cursorRef.current = i;
    setCursor(i);
    const at = tl.chords[i].startMs;
    setClock({ index: i, beat: Math.floor(at / tl.beatMs), songMs: at });
  };
  const pauseRun = () => {
    const tl = timelineRef.current;
    if (pausedRef.current || !tl) return;
    pausedRef.current = true;
    setPaused(true);
    setResumeAtMs(null);
    backingRef.current?.pause();
    showCursor(Math.max(0, clock.index));
  };
  /** Moves the cursor by chords (←/→) or by lines of the chart (↑/↓). */
  const moveCursor = (by: 'chord' | 'line', dir: 1 | -1) => {
    const tl = timelineRef.current;
    if (!tl) return;
    if (!pausedRef.current) pauseRun();
    navigatedRef.current = true;
    const here = tl.chords[cursorRef.current];
    if (by === 'chord') {
      showCursor(cursorRef.current + dir);
      return;
    }
    // Same place one line (barsPerRow bars) up or down: first chord of that bar.
    const target = (here.chorus * tl.formBars + here.formBar) + dir * barsPerRow;
    const clamped = Math.max(0, Math.min(target, tl.choruses * tl.formBars - 1));
    const i = tl.chords.findIndex((t) => t.chorus * tl.formBars + t.formBar >= clamped);
    showCursor(i < 0 ? tl.chords.length - 1 : i);
  };
  const resumeRun = async () => {
    const tl = timelineRef.current;
    const backing = backingRef.current;
    if (!pausedRef.current || !tl || !backing) return;
    const looping = loopRef.current;
    // With a loop: from the cursor if it's inside the section, else its start.
    const i = looping && (cursorRef.current < looping.start || cursorRef.current > looping.end) ? looping.start : cursorRef.current;
    if (i !== cursorRef.current) showCursor(i);
    backing.setLoop(looping ? { fromMs: tl.chords[looping.start].startMs, toMs: tl.chords[looping.end].endMs } : null);
    if (looping) navigatedRef.current = true;
    loopPassRef.current = 0;
    setLoopPass(0);
    scorerRef.current?.seek(i);
    setResults((prev) => prev.filter((r) => r.index < i));
    const at = tl.chords[i].startMs;
    setResumeAtMs(at);
    pausedRef.current = false;
    setPaused(false);
    await backing.resumeAt(at, tl.barMs, tl.beatsPerBar);
  };

  /** Back to the very first chord: a fresh attempt from the top (it can validate again). */
  const restartRun = () => {
    if (!timelineRef.current) return;
    if (!pausedRef.current) pauseRun();
    // The top of the song, the whole song: any loop is removed.
    loopRef.current = null;
    setLoop(null);
    setLoopMark(null);
    loopArchiveRef.current = [];
    showCursor(0);
    navigatedRef.current = false;
    void resumeRun();
  };

  /** B: in pause, marks the loop's first chord, then its last; a third time removes it. */
  const toggleLoopMark = () => {
    if (!timelineRef.current) return;
    if (loopRef.current) {
      loopRef.current = null;
      setLoop(null);
      setLoopMark(null);
      return;
    }
    if (!pausedRef.current) pauseRun();
    if (loopMark === null) {
      setLoopMark(cursorRef.current);
      return;
    }
    const next = { start: Math.min(loopMark, cursorRef.current), end: Math.max(loopMark, cursorRef.current) };
    loopRef.current = next;
    setLoop(next);
    setLoopMark(null);
    showCursor(next.start);
  };

  /** Clicking a bar in pause moves the cursor to it. */
  const pickBar = (chorusIndex: number, bar: number) => {
    const tl = timelineRef.current;
    if (!tl || !pausedRef.current) return;
    const i = tl.chords.findIndex((t) => t.chorus === chorusIndex && t.formBar === bar);
    if (i >= 0) {
      navigatedRef.current = true;
      showCursor(i);
    }
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        KeyR: restartRun,
        KeyB: toggleLoopMark,
        Space: () => (pausedRef.current ? void resumeRun() : pauseRun()),
        ArrowLeft: () => moveCursor('chord', -1),
        ArrowRight: () => moveCursor('chord', 1),
        ArrowUp: () => moveCursor('line', -1),
        ArrowDown: () => moveCursor('line', 1),
      };
      const action = keys[e.code];
      if (!action) return;
      // Ours: no page scroll, no focused button pressed, no piano key.
      e.preventDefault();
      e.stopPropagation();
      if ((e.code === 'Space' || e.code === 'KeyR' || e.code === 'KeyB') && e.repeat) return;
      action();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  const formBarsCount = chart?.bars.length ?? 0;
  const availableChoruses =
    midiInfo && formBarsCount > 0
      ? Math.max(1, Math.min(verifiedChoruses, Math.floor((midiInfo.totalBars - formStartBar) / formBarsCount + 0.1)))
      : 1;
  const chorusSeconds =
    midiInfo && originalBpm !== null && formBarsCount > 0
      ? (formBarsCount * midiInfo.beatsPerBar * 60) / resolveTempo(tempoLevel, originalBpm)
      : null;

  const current = timeline && clock.index >= 0 ? timeline.chords[clock.index] : null;
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
  // + a hair: a cursor placed exactly on a barline must not read as the bar before (2 − 1e-12).
  const barGlobal = timeline ? Math.max(0, Math.floor((clock.songMs - timeline.formStartMs) / timeline.barMs + 1e-6)) : 0;
  const formBar = timeline ? barGlobal % timeline.formBars : 0;
  const chorus = timeline ? Math.min(timeline.choruses - 1, Math.floor(barGlobal / timeline.formBars)) : 0;
  // Whole chart on screen: 4 bars per line like a lead sheet, 8 for long forms.
  const barsPerRow = (chart?.bars.length ?? 0) > 32 ? 8 : 4;
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
    if (!completedRun && navigatedRef.current) {
      return 'Bon entraînement ! Vous avez navigué dans la grille, donc ce passage ne valide pas l’objectif : rejouez le morceau d’une traite pour le valider.';
    }
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
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pt-3 sm:gap-4 sm:px-8">
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
        {phase !== 'playing' && (
          <GestureChordSetting
            compact
            value={settings.gestureChord}
            onChange={setGestureChord}
            activeNotes={activeNotes}
            notation={notation}
          />
        )}
        {settings.audioEnabled && (
          <>
            <LatencyBadge />
            <KeyboardVolume compact value={settings.audioVolume} onChange={(audioVolume) => onUpdateSettings({ audioVolume })} />
          </>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col items-center px-4 py-3 sm:px-8">
          {/* ---------- Discover: the chords first, without pressure ---------- */}
          {phase === 'discover' &&
            (chart ? (
              <ChordDiscovery
                chart={chart}
                step={step}
                notation={notation}
                hint={goal?.objective.hint}
                activeNotes={activeNotes}
                virtualLatchNotes={props.virtualLatchNotes}
                onPressVirtualNote={props.onPressVirtualNote}
                onReleaseVirtualNote={props.onReleaseVirtualNote}
                onToggleLatchNote={props.onToggleLatchNote}
                onClearVirtualLatchNotes={props.onClearVirtualLatchNotes}
              />
            ) : (
              <p className="mt-10 font-bold text-muted">
                {chartError ? `Impossible de lire la grille iReal : ${chartError}` : 'Lecture de la grille…'}
              </p>
            ))}

          {/* ---------- Setup ---------- */}
          {(phase === 'setup' || phase === 'loading') && (
            <div className="flex w-full max-w-4xl flex-col gap-4">
              {goal ? (
                <ObjectiveBanner song={goal.song} objective={goal.objective} originalBpm={originalBpm} />
              ) : (
                <p className="rounded-2xl border-2 border-line bg-surface px-4 py-2.5 font-bold">
                  La basse et la batterie jouent, vous êtes le pianiste. Jouez l’accord au début de chaque mesure, même
                  quand il ne change pas : je vous dis si vous êtes à l’heure.
                </p>
              )}

              {chartError && (
                <p className="rounded-xl bg-coral/10 p-3 font-bold text-coral-press">
                  Impossible de lire la grille iReal : {chartError}
                </p>
              )}

              <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                <div className="space-y-4">
                  <fieldset>
                    <legend className="font-display text-base font-semibold">Ce que vous jouez</legend>
                    <div className="mt-1.5 flex flex-wrap gap-2">
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
                    <p className="mt-1 text-sm font-semibold text-muted">{VOICING_STEPS[step].descriptionFr}</p>
                  </fieldset>

                  <fieldset>
                    <legend className="font-display text-base font-semibold">Tempo</legend>
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
                          {originalBpm !== null ? ` (${resolveTempo(level, originalBpm)} BPM)` : ''}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {availableChoruses > 1 && (
                    <fieldset>
                      <legend className="font-display text-base font-semibold">Tours de grille</legend>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {[...new Set([1, 2, availableChoruses])].filter((n) => n <= availableChoruses).map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={chorusChoice === n}
                            onClick={() => setChorusChoice(n)}
                            className={`mb-btn mb-btn-sm ${chorusChoice === n ? 'mb-btn-sky' : 'mb-btn-ghost'}`}
                          >
                            {n === 1 ? '1 tour' : n === availableChoruses ? `Tout (${n} tours)` : `${n} tours`}
                            {chorusSeconds !== null ? ` · ${formatDuration(chorusSeconds * n)}` : ''}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 font-bold">
                    <input type="checkbox" checked={pianoGuide} onChange={(e) => setPianoGuide(e.target.checked)} className="h-5 w-5 accent-sky" />
                    Laisser le piano du morceau en fond (guide)
                  </label>
                  <label className="flex items-center gap-3 font-bold">
                    <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} className="h-5 w-5 accent-sky" />
                    Montrer les touches sur le clavier
                  </label>
                  <label className="block font-bold" title="Compense le délai du son (enceintes Bluetooth : 150–250 ms). Toujours « en retard » alors que vous jouez avec la batterie ? Augmentez-le.">
                    Calage du son : {latencyMs} ms
                    <input
                      type="range"
                      min={-100}
                      max={300}
                      step={10}
                      value={latencyMs}
                      onChange={(e) => setLatencyMs(Number(e.target.value))}
                      className="mt-1 block w-full accent-sky"
                    />
                  </label>

                  <section aria-labelledby="band-sounds-title">
                    <div className="flex items-center gap-2">
                      <h3 id="band-sounds-title" className="font-display text-base font-semibold">
                        Sons de l’orchestre
                      </h3>
                      <button
                        type="button"
                        onClick={() => void togglePreview()}
                        disabled={!chart || originalBpm === null}
                        className={`mb-btn mb-btn-sm ml-auto ${previewing === 'off' ? 'mb-btn-ghost' : 'mb-btn-sky'}`}
                      >
                        {previewing === 'off' ? (
                          <>
                            <Play className="h-4 w-4 fill-current" /> Écouter le morceau
                          </>
                        ) : previewing === 'loading' ? (
                          'Chargement…'
                        ) : (
                          <>
                            <Square className="h-4 w-4 fill-current" /> Arrêter l’écoute
                          </>
                        )}
                      </button>
                    </div>
                    <ul className="mt-1.5 space-y-1.5">
                      {bandParts.map((part) => {
                        const family = familyOf(part.program, part.channel);
                        const current = resolveSound(part.program, part.channel, songSounds[part.channel]);
                        const isGuide = midiInfo?.pianoChannels.includes(part.channel + 1) ?? false;
                        const isMuted = mutedChannels.includes(part.channel);
                        return (
                          <li key={part.channel} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleMute(part.channel)}
                              aria-pressed={isMuted}
                              aria-label={`${isMuted ? 'Remettre' : 'Couper'} : ${partLabel(part.program, part.channel)}`}
                              title={isMuted ? 'Coupé : cliquez pour le remettre' : 'Couper cet instrument'}
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 ${
                                isMuted ? 'border-coral bg-coral/10 text-coral-press dark:text-coral' : 'border-line text-muted hover:text-text'
                              }`}
                            >
                              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume1 className="h-4 w-4" />}
                            </button>
                            <span className={`w-32 shrink-0 truncate text-sm font-bold ${isMuted ? 'text-muted line-through' : ''}`} title={isGuide ? 'Joué seulement en guide ou à l’écoute : pendant l’exercice, c’est vous le pianiste.' : undefined}>
                              {partLabel(part.program, part.channel)}
                              {isGuide && <span className="font-semibold text-muted"> (guide)</span>}
                            </span>
                            <select
                              value={current.id}
                              onChange={(e) => chooseSound(part.channel, e.target.value)}
                              aria-label={`Son : ${partLabel(part.program, part.channel)}`}
                              disabled={isMuted}
                              className="min-w-0 flex-1 disabled:opacity-50 rounded-xl border-2 border-line bg-surface px-2 py-1 text-sm font-semibold"
                            >
                              {SOUND_LIBRARY[family].map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void auditionSound(current, part.program, part.channel)}
                              aria-label={`Écouter le son : ${current.label}`}
                              title="Écouter ce son"
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 border-line text-muted hover:text-text"
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-1 text-xs font-semibold text-muted">
                      Choix gardé pour ce morceau, instruments coupés compris. Avant d’entrer, la dernière mesure est battue au métronome.
                    </p>
                  </section>
                </div>
              </div>

              {error && <p className="rounded-xl bg-coral/10 p-3 font-bold text-coral-press">{error}</p>}
            </div>
          )}

          {/* ---------- Playing: the whole chart, the current bar lit in place ---------- */}
          {phase === 'playing' && timeline && chart && (
            <>
              <div className="flex w-full items-center gap-3" aria-live="polite">
                <Mascot size={44} mood={mood} className="hidden shrink-0 sm:block" />
                <p className="font-display text-lg font-semibold text-muted">
                  {paused
                    ? `En pause · mesure ${formBar + 1}/${timeline.formBars}${
                        loop ? ` · boucle ${timeline.chords[loop.start].formBar + 1}–${timeline.chords[loop.end].formBar + 1}` : ''
                      }`
                    : resumeAtMs !== null && clock.songMs < resumeAtMs
                      ? 'Reprise : une mesure de métronome…'
                      : loop
                      ? `Boucle mesures ${timeline.chords[loop.start].formBar + 1}–${timeline.chords[loop.end].formBar + 1} · passage ${loopPass + 1} · mesure ${formBar + 1}`
                    : resumeAtMs !== null && clock.songMs < resumeAtMs
                      ? 'Reprise : une mesure de métronome…'
                      : inCountIn
                    ? countInBeatsLeft > timeline.beatsPerBar
                      ? `Intro : écoutez, la grille arrive dans ${Math.ceil(countInBeatsLeft / timeline.beatsPerBar)} mesures`
                      : 'Préparez-vous…'
                    : `Mesure ${formBar + 1}/${timeline.formBars}`}
                </p>
                {paused && (
                  <span className="hidden text-sm font-bold text-muted lg:inline">
                    {loopMark !== null
                      ? 'Placez la fin de la boucle, puis B'
                      : 'Espace : reprendre · ← → accord · ↑ ↓ ligne · B : boucle · R : début'}
                  </span>
                )}
                {!paused && inCountIn && countInBeatsLeft <= timeline.beatsPerBar && (
                  <span key={countInBeatsLeft} className="mb-pop font-display text-4xl leading-none font-bold text-brass">
                    {countInBeatsLeft}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {live && live.total > 0 && (
                    <span className="hidden text-sm font-bold text-muted md:inline">
                      Notes {Math.round(live.noteAccuracy * 100)} % · À l’heure {Math.round(live.timingAccuracy * 100)} %
                    </span>
                  )}
                  {lastResult && (
                    <span
                      key={lastResult.index}
                      className={`mb-pop rounded-xl px-3 py-1 text-sm font-bold ${VERDICT_STYLE[lastResult.verdict].cls}`}
                    >
                      {VERDICT_STYLE[lastResult.verdict].label}
                      {lastResult.offsetMs !== null ? ` ${formatOffset(lastResult.offsetMs)}` : ''}
                      {lastResult.wrongNote ? ' · fausse note' : ''}
                    </span>
                  )}
                </div>
              </div>
              {formWarning && (
                <p className="mt-2 w-full rounded-xl bg-brass/15 p-2 text-sm font-bold">{formWarning}</p>
              )}

              <div
                className="mt-3 grid min-h-0 w-full flex-1 gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${barsPerRow}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${Math.ceil(chart.bars.length / barsPerRow)}, minmax(0, 1fr))`,
                }}
                aria-label="Grille du morceau"
              >
                {chart.bars.map((bar, barNumber) => {
                  const isCurrent = !inCountIn && barNumber === formBar;
                  const isNextUp = inCountIn && barNumber === 0;
                  const items = timeline.chords.filter((t) => t.chorus === chorus && t.formBar === barNumber);
                  const written = bar.length > 0;
                  const inLoop = loop !== null && items.some((t) => t.index >= loop.start && t.index <= loop.end);
                  const isLoopMark = loopMark !== null && items.some((t) => t.index === loopMark);
                  return (
                    <div
                      key={barNumber}
                      data-testid={isCurrent ? 'playalong-current-bar' : undefined}
                      onClick={paused ? () => pickBar(chorus, barNumber) : undefined}
                      className={`relative flex min-h-0 items-center rounded-xl border-2 px-2 pb-1.5 transition-all duration-150 sm:px-3 ${paused ? 'cursor-pointer' : ''} ${
                        inLoop ? 'outline-2 outline-offset-2 outline-sky outline-dashed' : loop !== null ? 'opacity-45' : ''
                      } ${
                        isCurrent && paused
                          ? 'z-10 scale-[1.03] border-brass bg-brass/20 shadow-[0_4px_0_var(--color-brass-press)]'
                          : isCurrent
                          ? 'z-10 scale-[1.03] border-sky bg-sky/10 shadow-[0_4px_0_var(--color-sky-press)]'
                          : isNextUp
                            ? 'border-brass'
                            : 'border-line'
                      }`}
                    >
                      <span className="absolute top-0.5 left-1.5 text-[10px] font-bold text-muted">{barNumber + 1}</span>
                      {isLoopMark && (
                        <span className="absolute top-0.5 right-1.5 rounded bg-sky px-1 text-[10px] font-extrabold text-white">début</span>
                      )}
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {(items.length ? items : bar.map((item, k) => ({ index: -1 - k, item }))).map((t) => {
                          const r = t.index >= 0 ? resultByIndex.get(t.index) : undefined;
                          return (
                            <span
                              key={t.index}
                              {...(isCurrent ? { 'data-testid': 'playalong-chord' } : {})}
                              className={`truncate rounded-lg px-1 font-display font-semibold transition-colors ${
                                isCurrent ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
                              } ${r ? VERDICT_STYLE[r.verdict].cls : written || isCurrent ? '' : 'text-muted'}`}
                            >
                              {/* A "%" bar in progress names the chord to strike again. */}
                              {written || isCurrent ? chordLabel(t.item, notation) : '%'}
                            </span>
                          );
                        })}
                        {!written && items.length === 0 && <span className="font-display text-lg text-muted">%</span>}
                      </div>
                      {isCurrent && !paused && (
                        <div className="absolute inset-x-2 bottom-[3px] flex gap-1" aria-hidden="true">
                          {Array.from({ length: timeline.beatsPerBar }).map((_, b) => (
                            <span key={b} className={`h-1 flex-1 rounded-full ${b <= beatInBar ? 'bg-brass' : 'bg-line'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

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
                <Mascot size={80} mood={mood} className="shrink-0" />
                <div className="mb-4 rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold">{advice}</div>
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
        <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-3 px-4 py-3 sm:px-8">
          {gestureActive && (
            <GestureHint
              chord={settings.gestureChord}
              streak={gestureStreak}
              notation={notation}
              action={phase === 'setup' ? 'lancer le morceau' : 'passer aux réglages'}
            />
          )}
          {phase === 'discover' && (
            <button type="button" disabled={!chart} onClick={() => setPhase('setup')} className="mb-btn mb-btn-green min-w-48">
              Je suis prêt
            </button>
          )}
          {phase === 'setup' && chart && (
            <button type="button" onClick={() => setPhase('discover')} className="mb-btn mb-btn-ghost">
              Revoir les accords
            </button>
          )}
          {(phase === 'setup' || phase === 'loading') && (
            <button
              type="button"
              disabled={!canStart || phase === 'loading'}
              onClick={() => void start()}
              className="mb-btn mb-btn-green min-w-48"
            >
              <Play className="h-5 w-5 fill-current" />
              {phase === 'loading' ? 'Chargement de l’orchestre…' : 'Commencer'}
            </button>
          )}
          {phase === 'playing' && (
            <span className="mr-auto hidden text-sm font-bold text-muted md:inline">
              Espace : pause · flèches : se déplacer · B : boucle · R : recommencer
            </span>
          )}
          {phase === 'playing' && (
            <button type="button" onClick={toggleLoopMark} className={`mb-btn ${loop ? 'mb-btn-sky' : 'mb-btn-ghost'}`}>
              {loop ? 'Retirer la boucle' : loopMark !== null ? 'Fin de boucle ici' : 'Début de boucle ici'}
            </button>
          )}
          {phase === 'playing' && (
            <button
              type="button"
              onClick={() => (paused ? void resumeRun() : pauseRun())}
              className={`mb-btn ${paused ? 'mb-btn-green' : 'mb-btn-ghost'}`}
            >
              {paused ? 'Reprendre' : 'Pause'}
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
              <button type="button" onClick={() => setPhase('setup')} className="mb-btn mb-btn-ghost">
                Réglages
              </button>
              <button type="button" disabled={!canStart} onClick={() => void start()} className="mb-btn mb-btn-green">
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
    <div className="rounded-2xl bg-brass px-4 py-3 text-ink shadow-[0_4px_0_var(--color-brass-press)]">
      <p className="font-display text-xl font-semibold">
        <span className="mr-2 text-sm font-extrabold">Objectif</span>
        {objective.label}
      </p>
      <p className="text-sm font-bold">
        {objective.hint} Au {TEMPO_LABEL[objective.tempo]}
        {originalBpm !== null ? ` (${resolveTempo(objective.tempo, originalBpm)} BPM)` : ''}, jusqu’au bout du morceau :{' '}
        {Math.round(objective.minNotes * 100)} % des notes, {Math.round(objective.minTiming * 100)} % à l’heure.
      </p>
      <p className="mt-1 text-sm font-bold opacity-80">{song.focus}</p>
    </div>
  );
}

/** Footer reminder of the hands-free gesture, with the strikes counted so far. */
function GestureHint({
  chord,
  streak,
  notation,
  action,
}: {
  chord: number[] | undefined;
  streak: number;
  notation: NotationSystem;
  action: string;
}) {
  if (!isValidGestureChord(chord)) {
    return (
      <p className="mr-auto hidden text-sm font-bold text-muted md:block">
        Astuce : choisissez un accord « Suivant » en haut pour tout faire depuis le clavier.
      </p>
    );
  }
  return (
    <p className="mr-auto flex items-center gap-2 text-sm font-bold text-muted" aria-live="polite">
      <span className="hidden sm:inline">
        Jouez <span className="font-display text-base text-text">{gestureChordLabel(chord, notation)}</span> 3 fois pour {action}
      </span>
      <span className="flex gap-1" aria-label={`${streak} sur 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full transition-colors ${i < streak ? 'bg-brass' : 'bg-line'}`} />
        ))}
      </span>
    </p>
  );
}
