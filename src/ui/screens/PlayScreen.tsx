import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Minus,
  Pause,
  Play,
  Plus,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Usb,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pianoSynth } from '../../audio/synth';
import { MidiState } from '../../input/types';
import {
  CHORD_FAMILIES,
  ChordDefinition,
  VOICING_STEPS,
  VOICING_STEP_ORDER,
  VoicingStep,
  formatChordName,
  getChordNoteNames,
  getStepIntervalLabels,
  getSuggestedVoicingMidi,
  getTargetPitchClassesForStep,
  parseChordId,
} from '../../music/chords';
import { formatActiveNotes, validateChordInput } from '../../music/validation';
import {
  STEP_XP_TARGET,
  getNextStepForSong,
  getSongById,
  getSongStepLabel,
  getSongStepShortLabel,
  getSongStepXp,
  isStepUnlockedForSong,
} from '../../practice/curriculum';
import {
  DEFAULT_SESSION_CONFIG,
  buildSessionSummary,
  generateSessionChords,
} from '../../practice/engine';
import {
  AttemptRecord,
  PracticeConfig,
  PracticeMode,
  PracticeQueueItem,
  SessionConfig,
  SessionSummary,
} from '../../practice/types';
import { AppSettings, SongProgress } from '../../storage/types';
import { SessionConfigPanel } from '../components/SessionConfigPanel';
import { SessionSummaryView } from '../components/SessionSummaryView';
import { VirtualKeyboard } from '../components/VirtualKeyboard';

interface PlayScreenProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  songProgress: Record<string, SongProgress>;
  onRecordSongStepXp: (
    songId: string,
    step: VoicingStep,
    newXp: number,
    unlockedNextStep?: VoicingStep | null,
  ) => void;
  midiState: MidiState;
  activeNotes: number[];
  virtualLatchNotes: number[];
  onPressVirtualNote: (midi: number) => void;
  onReleaseVirtualNote: (midi: number) => void;
  onToggleLatchNote: (midi: number) => void;
  onClearVirtualLatchNotes: () => void;
  initialConfig: PracticeConfig | null;
  startInConfigMode: boolean;
  onCompleteSession: (summary: SessionSummary) => void;
  onGoToProgress: () => void;
  onOpenSettings: () => void;
}

type FeedbackState = 'idle' | 'success' | 'wrong-note' | 'missed';

function buildQueueFromConfig(config: PracticeConfig): PracticeQueueItem[] {
  if (config.mode === 'lesson') {
    return config.items;
  }
  if (config.mode === 'progression') {
    return config.chords.map((chord) => ({
      chord,
      step: config.step,
      context: 'progression',
      isNewConcept: config.step === 'root',
    }));
  }
  return generateSessionChords(config).map((chord) => ({
    chord,
    step: config.step,
    context: 'isolated',
  }));
}

export function PlayScreen({
  settings,
  onUpdateSettings,
  songProgress,
  onRecordSongStepXp,
  midiState,
  activeNotes,
  virtualLatchNotes,
  onPressVirtualNote,
  onReleaseVirtualNote,
  onToggleLatchNote,
  onClearVirtualLatchNotes,
  initialConfig,
  startInConfigMode,
  onCompleteSession,
  onGoToProgress,
  onOpenSettings,
}: PlayScreenProps) {
  const [phase, setPhase] = useState<'configuring' | 'active' | 'summary'>(
    startInConfigMode ? 'configuring' : 'active',
  );
  const [configModeTab, setConfigModeTab] = useState<PracticeMode>(
    initialConfig?.mode ?? 'session',
  );
  const [activeConfig, setActiveConfig] = useState<PracticeConfig>(
    initialConfig ?? DEFAULT_SESSION_CONFIG,
  );
  const [queue, setQueue] = useState<PracticeQueueItem[]>(() =>
    buildQueueFromConfig(initialConfig ?? DEFAULT_SESSION_CONFIG),
  );
  const [progressionStepOverride, setProgressionStepOverride] = useState<VoicingStep>(
    initialConfig?.mode === 'progression' || initialConfig?.mode === 'session'
      ? initialConfig.step
      : 'full',
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loopNumber, setLoopNumber] = useState(1);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>('idle');
  const [requeueNotice, setRequeueNotice] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  // Visual XP bar state for current step / session
  const [stepXp, setStepXp] = useState<number>(() => {
    const cfg = initialConfig ?? DEFAULT_SESSION_CONFIG;
    if (cfg.mode === 'progression' && cfg.songId) {
      return getSongStepXp(cfg.songId, cfg.step, songProgress);
    }
    if (cfg.mode === 'lesson' && cfg.songId && cfg.targetStep) {
      return getSongStepXp(cfg.songId, cfg.targetStep, songProgress);
    }
    return 0;
  });
  const [lastXpGain, setLastXpGain] = useState<number | null>(null);
  const [justUnlockedStep, setJustUnlockedStep] = useState<VoicingStep | null>(null);

  // Per-chord & session timing
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chordStartMs, setChordStartMs] = useState<number>(() => Date.now());
  const [hadWrongNoteOnCurrent, setHadWrongNoteOnCurrent] = useState(false);

  // Progression controls
  const [progressionTempo, setProgressionTempo] = useState(
    initialConfig?.mode === 'progression' ? initialConfig.tempoBpm : 72,
  );
  const [isPaused, setIsPaused] = useState(false);
  const [repeatCurrentChord, setRepeatCurrentChord] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [validatedInCurrentBar, setValidatedInCurrentBar] = useState(false);

  // Keyboard helper states
  const [showExpectedHelper, setShowExpectedHelper] = useState(() => {
    const first = buildQueueFromConfig(initialConfig ?? DEFAULT_SESSION_CONFIG)[0];
    return Boolean(first?.isNewConcept);
  });
  const [showChordNotesText, setShowChordNotesText] = useState(false);
  const [latchMode, setLatchMode] = useState(() => midiState.status !== 'connected');
  const [imitationState, setImitationState] = useState<'listen' | 'play'>(() =>
    settings.listenAndRepeatEnabled ? 'listen' : 'play',
  );
  const [lessonReadyToAdvance, setLessonReadyToAdvance] = useState(false);
  // A completed chord must be released before the next challenge can validate.
  // Without this gate, a sustained MIDI chord can accidentally solve matching targets.
  const [awaitingRelease, setAwaitingRelease] = useState(false);

  const isTransitioningRef = useRef(false);
  const activeChallengeRef = useRef('');
  const resolvedChallengeRef = useRef<string | null>(null);
  const attemptsRef = useRef<AttemptRecord[]>([]);
  const elapsedRef = useRef(0);
  const requeuedCountRef = useRef<Record<string, number>>({});
  const stepXpRef = useRef(stepXp);

  useEffect(() => {
    attemptsRef.current = attempts;
  }, [attempts]);

  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    stepXpRef.current = stepXp;
  }, [stepXp]);

  const startWithConfig = useCallback(
    (cfg: PracticeConfig) => {
      const builtQueue = buildQueueFromConfig(cfg);
      setActiveConfig(cfg);
      setConfigModeTab(cfg.mode);
      setQueue(builtQueue);

      let initialStep: VoicingStep = 'full';
      if (cfg.mode === 'progression' || cfg.mode === 'session') {
        initialStep = cfg.step;
        setProgressionStepOverride(cfg.step);
      } else if (cfg.targetStep) {
        initialStep = cfg.targetStep;
        setProgressionStepOverride(cfg.targetStep);
      }

      const startingXp =
        (cfg.mode === 'progression' || cfg.mode === 'lesson') && cfg.songId
          ? getSongStepXp(cfg.songId, initialStep, songProgress)
          : 0;

      setStepXp(startingXp);
      stepXpRef.current = startingXp;
      setLastXpGain(null);
      setJustUnlockedStep(null);

      setCurrentIndex(0);
      resolvedChallengeRef.current = null;
      setLoopNumber(1);
      setAttempts([]);
      attemptsRef.current = [];
      requeuedCountRef.current = {};
      setFeedback('idle');
      setRequeueNotice(false);
      setSummary(null);
      setElapsedSeconds(0);
      elapsedRef.current = 0;
      setChordStartMs(Date.now());
      setHadWrongNoteOnCurrent(false);
      setProgressionTempo(cfg.tempoBpm);
      setIsPaused(false);
      setRepeatCurrentChord(false);
      setCurrentBeat(0);
      setValidatedInCurrentBar(false);
      setShowExpectedHelper(Boolean(builtQueue[0]?.isNewConcept));
      setImitationState(settings.listenAndRepeatEnabled ? 'listen' : 'play');
      setAwaitingRelease(false);
      setLessonReadyToAdvance(false);
      isTransitioningRef.current = false;
      onClearVirtualLatchNotes();
      setPhase('active');
    },
    [onClearVirtualLatchNotes, settings.listenAndRepeatEnabled, songProgress],
  );

  // Sync when launched from TodayScreen or ProgressScreen
  useEffect(() => {
    if (startInConfigMode) {
      setPhase('configuring');
      return;
    }
    if (initialConfig) {
      startWithConfig(initialConfig);
    }
  }, [initialConfig, startInConfigMode, startWithConfig]);

  const currentItem: PracticeQueueItem | undefined = queue[currentIndex];
  const currentChord: ChordDefinition | undefined = currentItem?.chord;
  const activeStep: VoicingStep =
    activeConfig.mode === 'progression'
      ? progressionStepOverride
      : (currentItem?.step ?? 'full');

  const activeSongId =
    activeConfig.mode === 'progression' || activeConfig.mode === 'lesson'
      ? activeConfig.songId
      : undefined;
  const activeSong = getSongById(activeSongId);
  const challengeKey = currentItem && currentChord
    ? `${currentIndex}:${currentChord.id}:${activeStep}`
    : '';

  // Keep asynchronous validation tied to the card that created it. A stale
  // timeout must never be allowed to record or advance a later card.
  useEffect(() => {
    activeChallengeRef.current = challengeKey;
  }, [challengeKey]);

  // Auto-toggle helper guide on new concepts vs active recall review in Lesson mode
  useEffect(() => {
    if (activeConfig.mode === 'lesson' && currentItem) {
      setShowExpectedHelper(Boolean(currentItem.isNewConcept));
      setShowChordNotesText(Boolean(currentItem.isNewConcept));
    }
  }, [activeConfig.mode, currentIndex, currentItem]);

  // The model sound always comes before the user's turn.  This makes the first
  // encounter an imitation exercise instead of a text-only chord quiz.
  useEffect(() => {
    if (phase !== 'active' || !currentChord) return;
    if (!settings.listenAndRepeatEnabled) {
      setImitationState('play');
      return;
    }

    setImitationState('listen');
    setShowExpectedHelper(true);
    setShowChordNotesText(true);
    const preview = window.setTimeout(() => {
      pianoSynth.playChordPreview(getSuggestedVoicingMidi(currentChord, 4, activeStep));
    }, 120);
    const ready = window.setTimeout(() => setImitationState('play'), 1150);
    return () => {
      window.clearTimeout(preview);
      window.clearTimeout(ready);
    };
  }, [activeStep, currentChord, currentIndex, phase, settings.listenAndRepeatEnabled]);

  const finishSession = useCallback(
    (finalAttempts?: AttemptRecord[]) => {
      const list = finalAttempts ?? attemptsRef.current;
      const built = buildSessionSummary({
        mode: activeConfig.mode,
        label: activeConfig.label,
        step:
          activeConfig.mode === 'progression'
            ? progressionStepOverride
            : activeConfig.mode === 'lesson'
              ? activeConfig.targetStep
              : activeConfig.step,
        songId: activeSongId,
        attempts: list,
        durationSeconds: Math.max(1, elapsedRef.current),
        tempoBpm:
          activeConfig.mode === 'progression'
            ? progressionTempo
            : activeConfig.tempoBpm,
        families:
          activeConfig.mode === 'session'
            ? activeConfig.families
            : Array.from(new Set(queue.map((q) => q.chord.family))),
      });
      setSummary(built);
      setPhase('summary');
      onClearVirtualLatchNotes();
      if (built.totalChords > 0) {
        onCompleteSession(built);
      }
    },
    [
      activeConfig,
      activeSongId,
      onClearVirtualLatchNotes,
      onCompleteSession,
      progressionStepOverride,
      progressionTempo,
      queue,
    ],
  );

  // Session elapsed timer + max duration check
  useEffect(() => {
    if (phase !== 'active' || isPaused) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (
          activeConfig.mode === 'session' &&
          activeConfig.durationMinutes > 0 &&
          next >= activeConfig.durationMinutes * 60
        ) {
          window.setTimeout(() => finishSession(), 0);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeConfig, finishSession, isPaused, phase]);

  // Progression beat clock
  useEffect(() => {
    if (
      phase !== 'active' ||
      activeConfig.mode !== 'progression' ||
      isPaused ||
      repeatCurrentChord
    ) {
      return;
    }

    const beatMs = Math.round(60000 / Math.max(35, progressionTempo));
    const beatsPerChord = activeConfig.beatsPerChord;

    const interval = window.setInterval(() => {
      setCurrentBeat((prevBeat) => {
        const nextBeat = prevBeat + 1;

        if (settings.metronomeEnabled) {
          pianoSynth.playMetronomeTick(nextBeat % beatsPerChord === 0);
        }

        if (nextBeat >= beatsPerChord) {
          if (!validatedInCurrentBar && currentChord && !isTransitioningRef.current) {
            const missedRecord: AttemptRecord = {
              chord: currentChord,
              step: activeStep,
              context: 'progression',
              outcome: 'missed',
              hadWrongNote: hadWrongNoteOnCurrent,
              responseMs: beatMs * beatsPerChord,
            };
            const updatedAttempts = [...attemptsRef.current, missedRecord];
            attemptsRef.current = updatedAttempts;
            setAttempts(updatedAttempts);
          }

          setValidatedInCurrentBar(false);
          setHadWrongNoteOnCurrent(false);
          setFeedback('idle');
          setChordStartMs(Date.now());
          onClearVirtualLatchNotes();

          setCurrentIndex((prevIdx) => {
            const nextIdx = prevIdx + 1;
            if (nextIdx >= queue.length) {
              if (activeConfig.loopCount > 0 && loopNumber >= activeConfig.loopCount) {
                window.setTimeout(() => finishSession(attemptsRef.current), 20);
                return prevIdx;
              }
              setLoopNumber((l) => l + 1);
              return 0;
            }
            return nextIdx;
          });
          return 0;
        }
        return nextBeat;
      });
    }, beatMs);

    return () => window.clearInterval(interval);
  }, [
    activeConfig,
    activeStep,
    currentChord,
    finishSession,
    hadWrongNoteOnCurrent,
    isPaused,
    loopNumber,
    onClearVirtualLatchNotes,
    phase,
    progressionTempo,
    queue.length,
    repeatCurrentChord,
    settings.metronomeEnabled,
    validatedInCurrentBar,
  ]);

  const validation = useMemo(() => {
    if (!currentChord) return null;
    return validateChordInput(activeNotes, currentChord, activeStep);
  }, [activeNotes, activeStep, currentChord]);

  const awardStepXp = useCallback(
    (clean: boolean) => {
      const perChordGain =
        activeConfig.mode === 'progression'
          ? clean
            ? 20
            : 10
          : Math.max(10, Math.round(STEP_XP_TARGET / Math.max(1, queue.length)));
      const gained = clean ? perChordGain : Math.max(5, Math.round(perChordGain / 2));

      const nextXp = Math.min(STEP_XP_TARGET, stepXpRef.current + gained);
      stepXpRef.current = nextXp;
      setStepXp(nextXp);
      setLastXpGain(gained);

      window.setTimeout(() => {
        setLastXpGain(null);
      }, 900);

      if (activeSong && activeConfig.mode === 'progression') {
        const nextStep =
          nextXp >= STEP_XP_TARGET
            ? getNextStepForSong(activeSong, activeStep, songProgress)
            : null;
        onRecordSongStepXp(activeSong.id, activeStep, nextXp, nextStep);
        if (nextXp >= STEP_XP_TARGET && nextStep) {
          setJustUnlockedStep(nextStep);
        }
      } else if (
        activeSong &&
        activeConfig.mode === 'lesson' &&
        activeConfig.targetStep
      ) {
        const nextStep =
          nextXp >= STEP_XP_TARGET
            ? getNextStepForSong(activeSong, activeConfig.targetStep, songProgress)
            : null;
        onRecordSongStepXp(activeSong.id, activeConfig.targetStep, nextXp, nextStep);
        if (nextXp >= STEP_XP_TARGET && nextStep) {
          setJustUnlockedStep(nextStep);
        }
      }
    },
    [
      activeConfig,
      activeSong,
      activeStep,
      onRecordSongStepXp,
      queue.length,
      songProgress,
    ],
  );

  // Real-time chord validation effect
  useEffect(() => {
    if (phase !== 'active' || !currentChord || !currentItem || !validation) return;
    if (isTransitioningRef.current) return;

    if (awaitingRelease) {
      if (activeNotes.length === 0) setAwaitingRelease(false);
      return;
    }

    // During the demonstration, never score accidental key presses.
    if (imitationState === 'listen') return;

    if (validation.hasWrongNotes && activeNotes.length > 0) {
      setHadWrongNoteOnCurrent(true);
      setFeedback('wrong-note');
      if (activeConfig.mode === 'lesson') {
        setShowExpectedHelper(true);
      }
      return;
    }

    if (!validation.isComplete) {
      if (feedback === 'wrong-note' && !validation.hasWrongNotes) {
        setFeedback('idle');
      }
      return;
    }

    if (
      activeConfig.mode === 'progression' &&
      validatedInCurrentBar &&
      !repeatCurrentChord
    ) {
      return;
    }

    const scheduledChallenge = challengeKey;
    if (
      !scheduledChallenge ||
      resolvedChallengeRef.current === scheduledChallenge
    ) {
      return;
    }

    // Lock synchronously, before React has a chance to re-run this effect for
    // another MIDI event from the same held chord.
    isTransitioningRef.current = true;
    const timer = window.setTimeout(() => {
      if (
        activeChallengeRef.current !== scheduledChallenge ||
        resolvedChallengeRef.current === scheduledChallenge
      ) {
        isTransitioningRef.current = false;
        return;
      }
      const recheck = validateChordInput(activeNotes, currentChord, activeStep);
      if (!recheck.isComplete) {
        isTransitioningRef.current = false;
        return;
      }

      resolvedChallengeRef.current = scheduledChallenge;

      const responseMs = Math.max(120, Date.now() - chordStartMs);
      const record: AttemptRecord = {
        chord: currentChord,
        step: activeStep,
        context: currentItem.context,
        outcome: hadWrongNoteOnCurrent ? 'error' : 'correct',
        hadWrongNote: hadWrongNoteOnCurrent,
        responseMs,
      };

      const nextAttempts = [...attemptsRef.current, record];
      attemptsRef.current = nextAttempts;
      setAttempts(nextAttempts);
      setFeedback('success');
      setAwaitingRelease(true);

      awardStepXp(!hadWrongNoteOnCurrent);

      if (activeConfig.mode === 'lesson' && hadWrongNoteOnCurrent) {
        const key = `${currentChord.id}@${activeStep}`;
        const prevRequeues = requeuedCountRef.current[key] ?? 0;
        if (prevRequeues < 1 && queue.length < 12) {
          requeuedCountRef.current[key] = prevRequeues + 1;
          setRequeueNotice(true);
          setQueue((prev) => [
            ...prev,
            {
              ...currentItem,
              isNewConcept: false,
              tip: `Révision immédiate : rejouez ${formatChordName(currentChord, settings.notation)} sans hésiter.`,
            },
          ]);
        }
      }

      // Daily lessons deliberately use an explicit next action. It gives a
      // beginner time to hear the success, release their hand, and understand
      // what was just played; it also makes cascading MIDI validation impossible.
      if (activeConfig.mode === 'lesson') {
        setLessonReadyToAdvance(true);
        isTransitioningRef.current = false;
        return;
      }

      if (activeConfig.mode === 'progression') {
        setValidatedInCurrentBar(true);
        if (repeatCurrentChord) {
          window.setTimeout(() => {
            onClearVirtualLatchNotes();
            setFeedback('idle');
            setHadWrongNoteOnCurrent(false);
            setChordStartMs(Date.now());
            isTransitioningRef.current = false;
          }, 520);
        } else {
          // The bar timer owns the next transition in progression mode.
          isTransitioningRef.current = false;
        }
        return;
      }

      window.setTimeout(() => {
        onClearVirtualLatchNotes();
        setFeedback('idle');
        setRequeueNotice(false);
        setHadWrongNoteOnCurrent(false);
        setChordStartMs(Date.now());
        isTransitioningRef.current = false;

        if (currentIndex + 1 >= queue.length) {
          finishSession(nextAttempts);
        } else {
          setCurrentIndex((i) => i + 1);
        }
      }, 480);
    }, 75);

    return () => {
      window.clearTimeout(timer);
      // If the user changed the held notes during the short confirmation
      // window, the scheduled validation was cancelled and the card stays live.
      if (
        resolvedChallengeRef.current !== scheduledChallenge &&
        activeChallengeRef.current === scheduledChallenge
      ) {
        isTransitioningRef.current = false;
      }
    };
  }, [
    activeConfig.mode,
    activeNotes,
    activeStep,
    awardStepXp,
    chordStartMs,
    challengeKey,
    currentChord,
    currentIndex,
    currentItem,
    feedback,
    finishSession,
    hadWrongNoteOnCurrent,
    awaitingRelease,
    imitationState,
    onClearVirtualLatchNotes,
    phase,
    queue.length,
    repeatCurrentChord,
    settings.notation,
    validatedInCurrentBar,
    validation,
  ]);

  const handleSkipChord = () => {
    if (!currentChord || !currentItem || isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    resolvedChallengeRef.current = challengeKey || null;
    const record: AttemptRecord = {
      chord: currentChord,
      step: activeStep,
      context: currentItem.context,
      outcome: 'missed',
      hadWrongNote: hadWrongNoteOnCurrent,
      responseMs: Date.now() - chordStartMs,
    };
    const nextAttempts = [...attemptsRef.current, record];
    attemptsRef.current = nextAttempts;
    setAttempts(nextAttempts);
    setFeedback('missed');

    let nextLength = queue.length;
    if (activeConfig.mode === 'lesson') {
      const key = `${currentChord.id}@${activeStep}`;
      const prevRequeues = requeuedCountRef.current[key] ?? 0;
      if (prevRequeues < 1 && queue.length < 12) {
        requeuedCountRef.current[key] = prevRequeues + 1;
        nextLength = queue.length + 1;
        setRequeueNotice(true);
        setQueue((prev) => [
          ...prev,
          {
            ...currentItem,
            isNewConcept: true,
            tip: `On y revient avec l’aide visuelle sur le clavier.`,
          },
        ]);
      }
    }

    window.setTimeout(() => {
      onClearVirtualLatchNotes();
      setFeedback('idle');
      setRequeueNotice(false);
      setHadWrongNoteOnCurrent(false);
      setAwaitingRelease(false);
      setLessonReadyToAdvance(false);
      setChordStartMs(Date.now());
      setCurrentBeat(0);
      setValidatedInCurrentBar(false);
      isTransitioningRef.current = false;

      if (activeConfig.mode !== 'progression' && currentIndex + 1 >= nextLength) {
        finishSession(nextAttempts);
      } else {
        setCurrentIndex((i) => (i + 1) % nextLength);
      }
    }, 340);
  };

  const handleContinueLesson = () => {
    if (
      activeConfig.mode !== 'lesson' ||
      !lessonReadyToAdvance ||
      activeNotes.length > 0 ||
      isTransitioningRef.current
    ) {
      return;
    }

    isTransitioningRef.current = true;
    setLessonReadyToAdvance(false);
    setFeedback('idle');
    setRequeueNotice(false);
    setHadWrongNoteOnCurrent(false);
    setAwaitingRelease(false);
    setChordStartMs(Date.now());

    if (currentIndex + 1 >= queue.length) {
      finishSession(attemptsRef.current);
      return;
    }

    setCurrentIndex((index) => index + 1);
    isTransitioningRef.current = false;
  };

  const handleSwitchStepInProgression = (stepId: VoicingStep) => {
    if (activeSong && !isStepUnlockedForSong(activeSong, stepId, songProgress)) {
      return;
    }
    setProgressionStepOverride(stepId);
    const nextXp = activeSong ? getSongStepXp(activeSong.id, stepId, songProgress) : 0;
    setStepXp(nextXp);
    stepXpRef.current = nextXp;
    setJustUnlockedStep(null);
    setFeedback('idle');
    setValidatedInCurrentBar(false);
    setHadWrongNoteOnCurrent(false);
    setAwaitingRelease(false);
    resolvedChallengeRef.current = null;
    setCurrentIndex(0);
    setCurrentBeat(0);
    onClearVirtualLatchNotes();
  };

  const handlePracticeReviewChords = (chordIds: string[], step: VoicingStep) => {
    const families = Array.from(
      new Set(
        chordIds
          .map(parseChordId)
          .filter((c): c is ChordDefinition => c !== null)
          .map((c) => c.family),
      ),
    );
    const reviewConfig: SessionConfig = {
      mode: 'session',
      label: 'Révision ciblée',
      families: families.length > 0 ? families : ['maj'],
      step,
      chordCount: Math.max(6, chordIds.length * 2),
      tempoBpm: 68,
      durationMinutes: 5,
      targetChordIds: chordIds,
    };
    startWithConfig(reviewConfig);
  };

  const handleAdvanceToNextStep = (nextStep: VoicingStep) => {
    if (activeConfig.mode === 'progression') {
      startWithConfig({
        ...activeConfig,
        step: nextStep,
      });
    } else if (activeConfig.mode === 'session') {
      startWithConfig({
        ...activeConfig,
        step: nextStep,
      });
    } else if (activeConfig.mode === 'lesson') {
      startWithConfig({
        ...activeConfig,
        targetStep: nextStep,
        items: activeConfig.items.map((item) => ({
          ...item,
          step: nextStep,
          isNewConcept: true,
        })),
      });
    }
  };

  if (phase === 'configuring') {
    return (
      <div className="space-y-6">
        <SessionConfigPanel
          initialMode={configModeTab}
          initialSessionConfig={
            activeConfig.mode === 'session' ? activeConfig : DEFAULT_SESSION_CONFIG
          }
          notation={settings.notation}
          songProgress={songProgress}
          onStartPractice={startWithConfig}
        />
      </div>
    );
  }

  if (phase === 'summary' && summary) {
    return (
      <SessionSummaryView
        summary={summary}
        notation={settings.notation}
        onPracticeReviewChords={handlePracticeReviewChords}
        onAdvanceToNextStep={handleAdvanceToNextStep}
        onRestartSession={() => startWithConfig(activeConfig)}
        onGoToProgress={onGoToProgress}
        onReconfigure={() => setPhase('configuring')}
      />
    );
  }

  if (!currentChord || !currentItem) return null;

  const chordDisplay = formatChordName(currentChord, settings.notation);
  const chordNotesDisplay = getChordNoteNames(
    currentChord,
    settings.notation,
    activeStep,
  ).join(' · ');
  const familyMeta = CHORD_FAMILIES[currentChord.family];
  const stepLabel = activeSong
    ? getSongStepLabel(activeSong, activeStep)
    : VOICING_STEPS[activeStep].labelFr;
  const intervalLabels = getStepIntervalLabels(currentChord, activeStep);
  const expectedPitchClasses = getTargetPitchClassesForStep(currentChord, activeStep);
  const expectedVoicing = getSuggestedVoicingMidi(currentChord, 4, activeStep);
  const activeNotesLabels = formatActiveNotes(activeNotes, settings.notation);

  const formattedTimer = (() => {
    if (activeConfig.mode === 'session' && activeConfig.durationMinutes > 0) {
      const remaining = Math.max(
        0,
        activeConfig.durationMinutes * 60 - elapsedSeconds,
      );
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  })();

  const progressText =
    activeConfig.mode === 'progression'
      ? `Tour ${loopNumber}${activeConfig.loopCount > 0 ? `/${activeConfig.loopCount}` : ''}`
      : `${currentIndex + 1} / ${queue.length}`;

  const xpPercent = Math.min(100, Math.round((stepXp / STEP_XP_TARGET) * 100));

  const visibleLadderSteps = activeSong
    ? activeSong.availableSteps
    : VOICING_STEP_ORDER;

  const currentLevelIndex = visibleLadderSteps.indexOf(activeStep) + 1;
  const totalLevels = visibleLadderSteps.length;

  const stageSurfaceClass =
    feedback === 'success'
      ? 'border-emerald-500/45 bg-emerald-50/70 dark:border-emerald-400/40 dark:bg-emerald-950/25'
      : feedback === 'wrong-note'
        ? 'border-rose-500/45 bg-rose-50/70 dark:border-rose-400/40 dark:bg-rose-950/25'
        : feedback === 'missed'
          ? 'border-amber-500/45 bg-amber-50/60 dark:border-amber-400/40 dark:bg-amber-950/20'
          : 'border-stone-200 bg-white dark:border-slate-800 dark:bg-[#151c2f]';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Top toolbar inside Play Screen */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-slate-300">
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-stone-200/60 dark:hover:bg-slate-800"
          >
            <Usb
              className={`h-3.5 w-3.5 ${
                midiState.status === 'connected'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : midiState.status === 'permission-denied'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-stone-400 dark:text-slate-500'
              }`}
              aria-hidden="true"
            />
            <span>
              {midiState.status === 'connected'
                ? midiState.activeDeviceName
                : midiState.status === 'permission-denied'
                  ? 'MIDI refusé'
                  : 'Clavier virtuel'}
            </span>
          </button>

          <span aria-hidden="true" className="text-stone-300 dark:text-slate-700">
            ·
          </span>
          <span className="font-medium text-stone-800 dark:text-slate-200">
            {activeConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono-tabular text-xs font-medium text-stone-600 dark:text-slate-300">
            {progressText}
          </span>
          <span aria-hidden="true" className="text-stone-300 dark:text-slate-700">
            ·
          </span>
          <span className="font-mono-tabular text-xs text-stone-500 dark:text-slate-400">
            {formattedTimer}
          </span>
          <button
            type="button"
            onClick={() => setPhase('configuring')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Configurer</span>
          </button>
          <button
            type="button"
            onClick={() => finishSession()}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Terminer
          </button>
        </div>
      </div>

      {/* Visual XP Progress Bar */}
      <section
        aria-label="Barre d'expérience du niveau"
        className="rounded-2xl border border-stone-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-[#151c2f]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-medium text-stone-800 dark:text-slate-200">
            <Sparkles
              className={`h-3.5 w-3.5 ${
                xpPercent >= 100
                  ? 'text-emerald-500'
                  : 'text-indigo-600 dark:text-indigo-400'
              }`}
              aria-hidden="true"
            />
            <span>
              {activeSong
                ? `Niveau ${currentLevelIndex}/${totalLevels} · ${getSongStepShortLabel(activeSong, activeStep)}`
                : stepLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {lastXpGain !== null && (
              <span className="font-mono-tabular text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                +{lastXpGain} XP
              </span>
            )}
            <span className="font-mono-tabular text-xs font-semibold text-indigo-600 dark:text-indigo-300">
              {stepXp} / {STEP_XP_TARGET} XP
            </span>
          </div>
        </div>

        <div
          className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-slate-800"
          role="progressbar"
          aria-valuenow={xpPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              xpPercent >= 100
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-indigo-500 to-violet-500 dark:from-indigo-400 dark:to-violet-400'
            }`}
            style={{ width: `${xpPercent}%` }}
          />
        </div>

        {justUnlockedStep && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 pt-3 dark:border-slate-800">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Palier validé à 100 XP —{' '}
              {activeSong
                ? getSongStepLabel(activeSong, justUnlockedStep)
                : VOICING_STEPS[justUnlockedStep].labelFr}{' '}
              débloqué !
            </p>
            <button
              type="button"
              onClick={() => handleAdvanceToNextStep(justUnlockedStep)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              <span>Passer à l’étape suivante</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      {/* Main Chord Stage */}
      <section
        className={`relative rounded-2xl border px-6 py-8 transition-colors duration-200 sm:px-10 sm:py-10 ${stageSurfaceClass}`}
      >
        {/* Progression Mode: Step-by-Step Ladder (Locked for guided songs) + Chord Strip + Tempo Controls */}
        {activeConfig.mode === 'progression' && (
          <div className="mb-8 flex flex-col items-center gap-4 border-b border-stone-200/70 pb-6 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 p-1 dark:border-slate-800 dark:bg-slate-900/70">
              {visibleLadderSteps.map((stepId) => {
                const isSelected = progressionStepOverride === stepId;
                const isUnlocked = activeSong
                  ? isStepUnlockedForSong(activeSong, stepId, songProgress)
                  : true;
                const label = activeSong
                  ? getSongStepShortLabel(activeSong, stepId)
                  : VOICING_STEPS[stepId].shortLabelFr;

                return (
                  <button
                    key={stepId}
                    type="button"
                    disabled={!isUnlocked}
                    title={
                      isUnlocked
                        ? VOICING_STEPS[stepId].descriptionFr
                        : 'Atteignez 100 XP sur le palier précédent pour débloquer cette étape'
                    }
                    onClick={() => handleSwitchStepInProgression(stepId)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      !isUnlocked
                        ? 'cursor-not-allowed text-stone-400 opacity-55 dark:text-slate-500'
                        : isSelected
                          ? 'bg-white text-indigo-700 shadow-xs dark:bg-indigo-500 dark:text-white'
                          : 'text-stone-600 hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {!isUnlocked && (
                      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {queue.map((item, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={`${item.chord.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setCurrentBeat(0);
                      setValidatedInCurrentBar(false);
                      setFeedback('idle');
                      setAwaitingRelease(true);
                      setLessonReadyToAdvance(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 font-display text-sm font-semibold transition-colors ${
                      isCurrent
                        ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                        : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    {formatChordName(item.chord, settings.notation)}
                  </button>
                );
              })}
            </div>

            {/* Progression Tempo, Pause, Repeat Chord Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900/60">
                <button
                  type="button"
                  aria-label="Ralentir le tempo"
                  onClick={() => setProgressionTempo((t) => Math.max(36, t - 6))}
                  className="rounded p-1 text-stone-600 hover:bg-stone-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-16 text-center font-mono-tabular font-medium text-stone-800 dark:text-slate-200">
                  {progressionTempo} BPM
                </span>
                <button
                  type="button"
                  aria-label="Accélérer le tempo"
                  onClick={() => setProgressionTempo((t) => Math.min(130, t + 6))}
                  className="rounded p-1 text-stone-600 hover:bg-stone-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {isPaused ? (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reprendre</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                aria-pressed={repeatCurrentChord}
                onClick={() => setRepeatCurrentChord((r) => !r)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition-colors ${
                  repeatCurrentChord
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {repeatCurrentChord ? 'Accord verrouillé' : 'Répéter cet accord'}
                </span>
              </button>

              {!repeatCurrentChord && (
                <div className="flex items-center gap-1.5 pl-1" aria-hidden="true">
                  {Array.from({ length: activeConfig.beatsPerChord }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        i === currentBeat && !isPaused
                          ? 'bg-indigo-600 dark:bg-indigo-400'
                          : 'bg-stone-300 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Central Chord Display */}
        <div className="flex flex-col items-center text-center">
          {settings.listenAndRepeatEnabled && (
            <div
              className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                imitationState === 'listen'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
              }`}
              aria-live="polite"
            >
              {imitationState === 'listen' ? (
                <><Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Étape 1 · Écoutez et regardez le clavier</>
              ) : (
                <><Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> Étape 2 · À vous de reproduire</>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-stone-500 dark:text-slate-400">
            <span className="text-indigo-600 dark:text-indigo-300">{stepLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{familyMeta.labelFr}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{intervalLabels.join(' ')}</span>
            {activeConfig.mode === 'lesson' && currentItem.isNewConcept && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-300">
                  Nouveau
                </span>
              </>
            )}
          </div>

          <div
            className="mt-4 font-display text-6xl font-bold tracking-tight text-stone-900 sm:text-7xl dark:text-white"
            aria-live="polite"
          >
            {chordDisplay}
          </div>

          {currentItem.tip && (
            <p className="mt-3 max-w-lg text-sm text-stone-600 dark:text-slate-300">
              {currentItem.tip}
            </p>
          )}

          {/* Expected Notes / Played Notes */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setShowChordNotesText((v) => !v)}
              className="inline-flex items-center gap-1.5 text-stone-500 transition-colors hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {showChordNotesText ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-mono">{chordNotesDisplay}</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Voir les notes attendues</span>
                </>
              )}
            </button>

            {activeNotesLabels.length > 0 && (
              <>
                <span aria-hidden="true" className="text-stone-300 dark:text-slate-700">
                  ·
                </span>
                <span className="font-mono text-indigo-600 dark:text-indigo-300">
                  Jouées : {activeNotesLabels.join(' ')}
                </span>
              </>
            )}
          </div>

          {/* Accessible Feedback Indicator */}
          <div className="mt-6 flex min-h-8 items-center justify-center">
            {feedback === 'success' && (
              <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>
                  {lessonReadyToAdvance
                    ? 'Accord validé — relâchez, puis continuez'
                    : requeueNotice
                    ? 'Validé — on le reverra en fin de leçon pour le fixer'
                    : 'Accord validé'}
                </span>
              </div>
            )}
            {feedback === 'wrong-note' && (
              <div className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-300">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <span>
                  Note étrangère — jouez uniquement {chordNotesDisplay}
                </span>
              </div>
            )}
            {feedback === 'missed' && (
              <div className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                <SkipForward className="h-4 w-4" aria-hidden="true" />
                <span>
                  {requeueNotice
                    ? 'Passé — il reviendra en fin de leçon'
                    : 'Accord passé'}
                </span>
              </div>
            )}
            {feedback === 'idle' && (
              <p className="text-sm text-stone-500 dark:text-slate-400">
                {awaitingRelease
                  ? 'Relâchez toutes les touches avant le prochain accord'
                  : imitationState === 'listen'
                    ? 'Écoutez la couleur de l’accord et observez les touches éclairées'
                    : activeStep === 'root'
                  ? 'Appuyez simplement sur la note fondamentale (n’importe quelle octave)'
                  : activeStep === 'root-5th'
                    ? 'Jouez la fondamentale et sa quinte ensemble'
                    : 'Jouez les notes dans le renversement de votre choix'}
              </p>
            )}
          </div>

          {/* Secondary Utility Actions */}
          <div className="mt-5 flex items-center gap-3">
            {activeConfig.mode === 'lesson' && lessonReadyToAdvance && (
              <button
                type="button"
                disabled={activeNotes.length > 0}
                onClick={handleContinueLesson}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              >
                <span>{activeNotes.length > 0 ? 'Relâchez les touches' : 'Continuer'}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => pianoSynth.playChordPreview(expectedVoicing)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Écouter</span>
            </button>
            <button
              type="button"
              onClick={handleSkipChord}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Passer</span>
            </button>
          </div>
        </div>
      </section>

      {/* Collapsible Interactive Virtual Keyboard */}
      <VirtualKeyboard
        isOpen={settings.showKeyboardHelper}
        onToggleOpen={() =>
          onUpdateSettings({ showKeyboardHelper: !settings.showKeyboardHelper })
        }
        showExpectedHelper={showExpectedHelper}
        onToggleExpectedHelper={() => setShowExpectedHelper((v) => !v)}
        showNoteLabels={settings.showKeyboardNotes}
        latchMode={latchMode}
        onToggleLatchMode={() => setLatchMode((v) => !v)}
        activeNotes={activeNotes}
        expectedPitchClasses={expectedPitchClasses}
        expectedVoicingNotes={expectedVoicing}
        notation={settings.notation}
        onPressNote={onPressVirtualNote}
        onReleaseNote={onReleaseVirtualNote}
        onToggleLatchNote={onToggleLatchNote}
        onReleaseAllVirtual={onClearVirtualLatchNotes}
        onPlayPreview={() => pianoSynth.playChordPreview(expectedVoicing)}
        hasLatchedNotes={virtualLatchNotes.length > 0}
      />
    </div>
  );
}
