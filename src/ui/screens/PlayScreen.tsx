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
  Volume2,
  X,
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
  getSongById,
  getSongStepShortLabel,
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
import { Mascot, MascotMood } from '../components/Mascot';
import { VirtualKeyboard } from '../components/VirtualKeyboard';

interface PlayScreenProps {
  /** Admin profile: every step of every song is open. */
  unlockAll?: boolean;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  songProgress: Record<string, SongProgress>;
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
  unlockAll = false,
  settings,
  onUpdateSettings,
  songProgress,
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

  useEffect(() => {
    attemptsRef.current = attempts;
  }, [attempts]);

  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  // startWithConfig must stay referentially stable: it is called by an effect
  // that should only fire when a *new* session is launched. Reading settings
  // through a ref prevents a settings/progress update from silently restarting
  // the running session — the root cause of the old "lesson cascade" bug.
  const listenAndRepeatRef = useRef(settings.listenAndRepeatEnabled);
  listenAndRepeatRef.current = settings.listenAndRepeatEnabled;
  const clearLatchRef = useRef(onClearVirtualLatchNotes);
  clearLatchRef.current = onClearVirtualLatchNotes;

  const startWithConfig = useCallback(
    (cfg: PracticeConfig) => {
      const builtQueue = buildQueueFromConfig(cfg);
      setActiveConfig(cfg);
      setConfigModeTab(cfg.mode);
      setQueue(builtQueue);

      if (cfg.mode === 'progression' || cfg.mode === 'session') {
        setProgressionStepOverride(cfg.step);
      } else if (cfg.targetStep) {
        setProgressionStepOverride(cfg.targetStep);
      }

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
      setImitationState(listenAndRepeatRef.current ? 'listen' : 'play');
      setAwaitingRelease(false);
      setLessonReadyToAdvance(false);
      isTransitioningRef.current = false;
      clearLatchRef.current();
      setPhase('active');
    },
    [],
  );

  // Sync when launched from TodayScreen or ProgressScreen. Fires only when the
  // parent hands over a different config object — never on a mere re-render.
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
    (finalAttempts?: AttemptRecord[], endedEarly = false) => {
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
        completedFully: !endedEarly,
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

  // Real-time chord validation effect
  useEffect(() => {
    if (phase !== 'active' || !currentChord || !currentItem || !validation) return;
    if (isTransitioningRef.current) return;

    if (awaitingRelease) {
      if (activeNotes.length === 0) setAwaitingRelease(false);
      return;
    }

    // In lesson mode, once a chord is solved we wait for an explicit "Continuer"
    // click. Never let sustained/replayed notes validate the same or next card.
    if (activeConfig.mode === 'lesson' && lessonReadyToAdvance) {
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

      // Daily lessons wait for an explicit "Continuer" once the keys are
      // released: the learner hears the success and the next card can never be
      // validated by a chord that is still held.
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
    if (!unlockAll && activeSong && !isStepUnlockedForSong(activeSong, stepId, songProgress)) {
      return;
    }
    setProgressionStepOverride(stepId);
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
          unlockAll={unlockAll}
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
  const familyMeta = CHORD_FAMILIES[currentChord.family];
  const intervalLabels = getStepIntervalLabels(currentChord, activeStep);
  const expectedPitchClasses = getTargetPitchClassesForStep(currentChord, activeStep);
  const expectedVoicing = getSuggestedVoicingMidi(currentChord, 4, activeStep);
  const activeNotesLabels = formatActiveNotes(activeNotes, settings.notation);

  const progressText =
    activeConfig.mode === 'progression'
      ? `Tour ${loopNumber}${activeConfig.loopCount > 0 ? `/${activeConfig.loopCount}` : ''}`
      : `${currentIndex + 1} / ${queue.length}`;

  // Real progress through this lesson/session — not points.
  const resolvedCount = attempts.length;
  const lessonPercent =
    activeConfig.mode === 'progression'
      ? null
      : Math.min(100, Math.round((resolvedCount / Math.max(1, queue.length)) * 100));

  const visibleLadderSteps = activeSong
    ? activeSong.availableSteps
    : VOICING_STEP_ORDER;


  const validationNow = validation;
  const matchedSet = new Set(validationNow?.matchedPitchClasses ?? []);
  const expectedNoteNames = getChordNoteNames(currentChord, settings.notation, activeStep);
  const isLesson = activeConfig.mode === 'lesson';
  const keysHeld = activeNotes.length > 0;

  const mascotMood: MascotMood =
    feedback === 'success'
      ? 'happy'
      : feedback === 'wrong-note'
        ? 'oops'
        : settings.listenAndRepeatEnabled && imitationState === 'listen'
          ? 'listen'
          : 'idle';

  const coachLine = awaitingRelease && feedback === 'idle'
    ? 'Relâchez toutes les touches, puis jouez l’accord suivant.'
    : settings.listenAndRepeatEnabled && imitationState === 'listen'
      ? 'Écoutez, et regardez les touches qui s’allument.'
      : currentItem.tip
        ? currentItem.tip
        : activeStep === 'root'
          ? 'Jouez juste la fondamentale, dans n’importe quelle octave.'
          : activeStep === 'root-5th'
            ? 'Jouez la fondamentale et la quinte ensemble.'
            : 'Jouez toutes les notes, dans l’ordre que vous voulez.';

  const footerTone =
    feedback === 'success'
      ? 'border-emerald-200 bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950'
      : feedback === 'wrong-note'
        ? 'border-rose-200 bg-rose-100 dark:border-rose-900 dark:bg-rose-950'
        : feedback === 'missed'
          ? 'border-amber-200 bg-amber-100 dark:border-amber-900 dark:bg-amber-950'
          : 'border-line bg-page';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-page text-text">
      {/* Header: quit, real lesson progress, position */}
      <header className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 pt-5 sm:px-8">
        <button
          type="button"
          onClick={() => finishSession(undefined, true)}
          aria-label="Terminer la séance"
          title="Terminer la séance"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-mist hover:text-text"
        >
          <X className="h-6 w-6" strokeWidth={2.5} />
        </button>
        {lessonPercent !== null ? (
          <div
            className="mb-progress flex-1"
            role="progressbar"
            aria-label="Avancement de la leçon"
            aria-valuenow={lessonPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.max(lessonPercent, 3)}%` }} />
          </div>
        ) : (
          <p className="flex-1 truncate font-display text-lg font-semibold">{activeConfig.label}</p>
        )}
        <span className="shrink-0 font-display text-lg font-semibold text-muted tabular-nums">
          {progressText}
        </span>
        {!isLesson && (
          <button
            type="button"
            onClick={() => setPhase('configuring')}
            aria-label="Configurer la séance"
            title="Configurer la séance"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-mist hover:text-text"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          title={midiState.status === 'connected' ? (midiState.activeDeviceName ?? 'MIDI') : 'Aucun clavier MIDI'}
          aria-label="État du clavier MIDI"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-mist"
        >
          <span className={`h-3 w-3 rounded-full ${midiState.status === 'connected' ? 'bg-green' : 'bg-stone-300'}`} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-4 pb-8 sm:px-8">
          {/* Progression controls: chord strip, tempo, beat */}
          {activeConfig.mode === 'progression' && (
            <div className="mb-6 flex w-full flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {visibleLadderSteps.map((stepId) => {
                  const isSelected = progressionStepOverride === stepId;
                  const isUnlocked =
                    unlockAll || !activeSong || isStepUnlockedForSong(activeSong, stepId, songProgress);
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
                          : 'Réussissez une séance complète du palier précédent pour débloquer cette étape'
                      }
                      onClick={() => handleSwitchStepInProgression(stepId)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-sm font-bold whitespace-nowrap ${
                        !isUnlocked
                          ? 'cursor-not-allowed border-transparent text-muted opacity-50'
                          : isSelected
                            ? 'border-sky bg-sky/10 text-sky-press dark:text-sky'
                            : 'border-line text-muted hover:text-text'
                      }`}
                    >
                      {!isUnlocked && <Lock className="h-3 w-3" aria-hidden="true" />}
                      {label}
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
                      className={`min-w-14 rounded-xl px-3 py-2 font-display text-lg font-semibold transition-colors ${
                        isCurrent
                          ? 'bg-ink text-white shadow-[0_4px_0_#0c0f1f] dark:bg-white dark:text-ink'
                          : 'bg-mist text-muted hover:text-text'
                      }`}
                    >
                      {formatChordName(item.chord, settings.notation)}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-bold">
                <div className="flex items-center gap-1 rounded-xl border-2 border-line px-1.5 py-1">
                  <button type="button" aria-label="Ralentir le tempo" onClick={() => setProgressionTempo((t) => Math.max(36, t - 6))} className="rounded-lg p-1.5 hover:bg-mist">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-20 text-center tabular-nums">{progressionTempo} BPM</span>
                  <button type="button" aria-label="Accélérer le tempo" onClick={() => setProgressionTempo((t) => Math.min(130, t + 6))} className="rounded-lg p-1.5 hover:bg-mist">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <button type="button" onClick={() => setIsPaused((p) => !p)} className="mb-btn mb-btn-ghost mb-btn-sm">
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {isPaused ? 'Reprendre' : 'Pause'}
                </button>
                <button
                  type="button"
                  aria-pressed={repeatCurrentChord}
                  onClick={() => setRepeatCurrentChord((r) => !r)}
                  className={`mb-btn mb-btn-sm ${repeatCurrentChord ? 'mb-btn-sky' : 'mb-btn-ghost'}`}
                >
                  <Lock className="h-4 w-4" />
                  {repeatCurrentChord ? 'Accord verrouillé' : 'Répéter cet accord'}
                </button>
                {!repeatCurrentChord && (
                  <div className="flex items-center gap-1.5 pl-1" aria-hidden="true">
                    {Array.from({ length: activeConfig.beatsPerChord }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-3 w-3 rounded-full transition-colors ${
                          i === currentBeat && !isPaused ? 'bg-brass' : 'bg-line'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coach: the mascot speaks the instruction */}
          <div className="flex w-full max-w-2xl items-end gap-3">
            <Mascot size={88} mood={mascotMood} className="shrink-0" />
            <div className="relative mb-6 rounded-2xl border-2 border-line bg-surface px-4 py-3 text-base font-bold">
              <span
                aria-hidden="true"
                className="absolute -left-[9px] bottom-4 h-4 w-4 rotate-45 border-b-2 border-l-2 border-line bg-surface"
              />
              {isLesson && currentItem.isNewConcept && (
                <span className="mr-2 rounded-md bg-brass px-1.5 py-0.5 text-xs font-extrabold text-ink">Nouveau</span>
              )}
              <span aria-live="polite">{coachLine}</span>
            </div>
          </div>

          {/* Target chord */}
          <h1
            data-testid="chord-name"
            className="mt-1 font-display text-[4.5rem] leading-none font-bold tracking-tight sm:text-[6rem]"
          >
            {chordDisplay}
          </h1>
          <p className="mt-2 text-base font-bold text-muted">
            {familyMeta.labelFr}
            {activeSong ? `, ${getSongStepShortLabel(activeSong, activeStep).replace(/^\d+ · /, '').toLowerCase()}` : ''}
          </p>

          {/* Expected notes, lighting up as they are found */}
          <div className="mt-4 flex flex-wrap items-start justify-center gap-2.5">
            {expectedPitchClasses.map((pc, i) => {
              const found = matchedSet.has(pc);
              return (
                <div key={pc} className="flex flex-col items-center gap-1">
                  <span
                    className={`grid h-14 min-w-14 place-items-center rounded-2xl border-2 px-2 font-display text-xl font-semibold transition-colors ${
                      found
                        ? 'border-green bg-green text-white shadow-[0_4px_0_var(--color-green-press)]'
                        : 'border-line bg-surface shadow-[0_4px_0_var(--mb-line)]'
                    }`}
                  >
                    {showChordNotesText || found ? expectedNoteNames[i] : '?'}
                  </span>
                  <span className="text-xs font-extrabold text-muted">{intervalLabels[i]}</span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowChordNotesText((v) => !v)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-sky-press hover:bg-sky/10 dark:text-sky"
          >
            {showChordNotesText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showChordNotesText ? 'Masquer les notes' : 'Voir les notes'}
          </button>
          {activeNotesLabels.length > 0 && (
            <p className="mt-1 text-sm font-bold text-muted">Vous jouez : {activeNotesLabels.join(' ')}</p>
          )}

          {/* The keyboard is the centre of the lesson */}
          <div className="mt-4 w-full">
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
              hasLatchedNotes={virtualLatchNotes.length > 0}
            />
          </div>
        </div>
      </main>

      {/* Feedback footer — Duolingo-style verdict and the single next action */}
      <footer className={`border-t-2 transition-colors ${footerTone}`}>
        <div className="mx-auto flex min-h-28 w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          {feedback === 'success' ? (
            <div className="mb-pop flex items-center gap-4 text-emerald-700 dark:text-emerald-300">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-green dark:bg-emerald-900">
                <CheckCircle2 className="h-9 w-9" strokeWidth={2.5} />
              </span>
              <div>
                <p className="font-display text-2xl font-bold">Bien joué !</p>
                <p className="font-bold">
                  {requeueNotice
                    ? 'Validé. On le rejoue en fin de leçon pour le fixer.'
                    : isLesson
                      ? `${chordDisplay} : ${expectedNoteNames.join(', ')}. Relâchez, puis continuez.`
                      : `${chordDisplay} : ${expectedNoteNames.join(', ')}`}
                </p>
              </div>
            </div>
          ) : feedback === 'wrong-note' ? (
            <div className="mb-pop flex items-center gap-4 text-rose-700 dark:text-rose-300">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-coral dark:bg-rose-900">
                <AlertCircle className="h-9 w-9" strokeWidth={2.5} />
              </span>
              <div>
                <p className="font-display text-2xl font-bold">Pas tout à fait</p>
                <p className="font-bold">
                  Note étrangère : jouez seulement {expectedNoteNames.join(', ')}.
                </p>
              </div>
            </div>
          ) : feedback === 'missed' ? (
            <div className="mb-pop flex items-center gap-4 text-amber-800 dark:text-amber-300">
              <SkipForward className="h-8 w-8" />
              <p className="font-display text-xl font-bold">
                {requeueNotice ? 'Passé : il reviendra en fin de leçon.' : 'Accord passé.'}
              </p>
            </div>
          ) : (
            <button type="button" onClick={handleSkipChord} className="mb-btn mb-btn-ghost">
              <SkipForward className="h-5 w-5" />
              Passer
            </button>
          )}

          <div className="flex items-center gap-3">
            {feedback !== 'success' && (
              <button
                type="button"
                onClick={() => pianoSynth.playChordPreview(expectedVoicing)}
                className={`mb-btn ${feedback === 'wrong-note' ? 'mb-btn-coral' : 'mb-btn-sky'}`}
              >
                <Volume2 className="h-5 w-5" />
                Écouter
              </button>
            )}
            {isLesson && lessonReadyToAdvance && (
              <button
                type="button"
                disabled={keysHeld}
                onClick={handleContinueLesson}
                className="mb-btn mb-btn-green min-w-44"
              >
                {keysHeld ? 'Relâchez les touches' : 'Continuer'}
                {!keysHeld && <ArrowRight className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
