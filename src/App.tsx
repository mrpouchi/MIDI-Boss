import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pianoSynth } from './audio/synth';
import { CODE_TO_MIDI } from './input/keyboardMap';
import { MidiRawListener, WebMidiController } from './input/midi';
import { NoteEventListener } from './input/types';
import { MidiState } from './input/types';
import { decodeIrealSong, IrealSong } from './music/ireal';
import { GUIDED_SONGS, getNextStepForSong } from './practice/curriculum';
import { makeSpacedCardKey, updateSpacedCard } from './practice/spacedRepetition';
import { PracticeConfig, SessionSummary } from './practice/types';
import {
  createDemoData,
  createEmptyData,
  loadStoredData,
  saveStoredData,
} from './storage/localStore';
import {
  AppSettings,
  ChordStat,
  SessionRecord,
  SongProgress,
  SpacedCard,
  StoredData,
  PlayAlongRun,
  StoredMidiSetup,
} from './storage/types';
import { SettingsDrawer } from './ui/components/SettingsDrawer';
import { AppTab, TopNav } from './ui/components/TopNav';
import { PlayScreen } from './ui/screens/PlayScreen';
import { LibraryScreen } from './ui/screens/LibraryScreen';
import { ProgressScreen } from './ui/screens/ProgressScreen';
import { PathScreen } from './ui/screens/PathScreen';
import { PlayAlongScreen } from './ui/screens/PlayAlongScreen';
import { MelodyScreen } from './ui/screens/MelodyScreen';
import { LocalSongFile } from './content/localSongs';
import { PathSong, SongObjective } from './content/songPath';
import { Profile } from './storage/profiles';

interface AppProps {
  profile: Profile;
  onSwitchProfile: () => void;
}

export default function App({ profile, onSwitchProfile }: AppProps) {
  const [storedData, setStoredData] = useState<StoredData>(() => loadStoredData(profile.id));
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [launchConfig, setLaunchConfig] = useState<PracticeConfig | null>(null);
  const [playAlong, setPlayAlong] = useState<{
    local: LocalSongFile;
    ireal: IrealSong;
    goal?: { song: PathSong; objective: SongObjective };
  } | null>(null);
  const playAlongOpenRef = useRef(false);
  playAlongOpenRef.current = playAlong !== null;
  const [launchInConfigMode, setLaunchInConfigMode] = useState(false);
  const [playSessionKey, setPlaySessionKey] = useState(0);

  const midiControllerRef = useRef<WebMidiController | null>(null);
  // Timestamped note stream (performance.now() clock) for timing-sensitive
  // exercises: MIDI, computer keyboard and on-screen keys all feed it.
  const noteListenersRef = useRef(new Set<NoteEventListener>());
  const emitNote = useCallback((note: number, on: boolean, timeMs: number) => {
    noteListenersRef.current.forEach((listener) => listener(note, on, timeMs));
  }, []);
  const subscribeNoteEvents = useCallback((listener: NoteEventListener) => {
    noteListenersRef.current.add(listener);
    return () => {
      noteListenersRef.current.delete(listener);
    };
  }, []);
  const [midiState, setMidiState] = useState<MidiState>({
    status: 'initializing',
    devices: [],
    activeDeviceId: null,
    activeDeviceName: null,
    errorMessage: null,
  });

  const [midiNotes, setMidiNotes] = useState<Set<number>>(() => new Set());
  const [keyboardNotes, setKeyboardNotes] = useState<Set<number>>(() => new Set());
  const [virtualMomentaryNotes, setVirtualMomentaryNotes] = useState<Set<number>>(
    () => new Set(),
  );
  const [virtualLatchNotes, setVirtualLatchNotes] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    saveStoredData(profile.id, storedData);
  }, [profile.id, storedData]);

  useEffect(() => {
    const isDark = storedData.settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [storedData.settings.theme]);

  useEffect(() => {
    pianoSynth.setEnabled(storedData.settings.audioEnabled);
    pianoSynth.setVolume(storedData.settings.audioVolume);
    if (storedData.settings.audioEnabled) {
      pianoSynth.setInstrument(storedData.settings.instrument ?? 'piano');
    }
  }, [
    storedData.settings.audioEnabled,
    storedData.settings.audioVolume,
    storedData.settings.instrument,
  ]);

  // Débloque la sortie audio dès le premier geste plutôt qu'à la première note :
  // évite une note initiale en retard et réduit la latence perçue ensuite.
  useEffect(() => {
    const prime = () => pianoSynth.primeFromGesture();
    window.addEventListener('pointerdown', prime, { capture: true });
    window.addEventListener('keydown', prime, { capture: true });
    window.addEventListener('touchstart', prime, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', prime, { capture: true });
      window.removeEventListener('keydown', prime, { capture: true });
      window.removeEventListener('touchstart', prime, { capture: true });
    };
  }, []);

  useEffect(() => {
    const controller = new WebMidiController();
    midiControllerRef.current = controller;

    const unsubState = controller.onStateChange((state) => {
      setMidiState(state);
    });

    const unsubNote = controller.onNoteEvent((note, isDown, velocity, timeMs) => {
      emitNote(note, isDown, timeMs);
      if (isDown) {
        pianoSynth.recordInputDelay(performance.now() - timeMs);
        pianoSynth.noteOn(note, velocity);
        setMidiNotes((prev) => {
          const next = new Set(prev);
          next.add(note);
          return next;
        });
      } else {
        pianoSynth.noteOff(note);
        setMidiNotes((prev) => {
          if (!prev.has(note)) return prev;
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
      }
    });

    const unsubPanic = controller.onPanic(() => {
      pianoSynth.stopAll();
      setMidiNotes(new Set());
    });

    void controller.init();

    return () => {
      unsubState();
      unsubNote();
      unsubPanic();
      controller.dispose();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'play' && !playAlongOpenRef.current) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const midi = CODE_TO_MIDI[e.code];
      if (midi === undefined) return;

      e.preventDefault();
      emitNote(midi, true, e.timeStamp || performance.now());
      pianoSynth.noteOn(midi, 92);
      setKeyboardNotes((prev) => {
        if (prev.has(midi)) return prev;
        const next = new Set(prev);
        next.add(midi);
        return next;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const midi = CODE_TO_MIDI[e.code];
      if (midi === undefined) return;

      emitNote(midi, false, e.timeStamp || performance.now());
      pianoSynth.noteOff(midi);
      setKeyboardNotes((prev) => {
        if (!prev.has(midi)) return prev;
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });
    };

    const handleBlur = () => {
      setKeyboardNotes(new Set());
      setVirtualMomentaryNotes(new Set());
      pianoSynth.stopAll();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activeTab]);

  const activeNotes = useMemo(() => {
    const combined = new Set<number>([
      ...midiNotes,
      ...keyboardNotes,
      ...virtualMomentaryNotes,
      ...virtualLatchNotes,
    ]);
    return Array.from(combined).sort((a, b) => a - b);
  }, [midiNotes, keyboardNotes, virtualMomentaryNotes, virtualLatchNotes]);

  const handlePressVirtualNote = useCallback((midi: number) => {
    emitNote(midi, true, performance.now());
    pianoSynth.noteOn(midi, 92);
    setVirtualMomentaryNotes((prev) => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
  }, []);

  const handleReleaseVirtualNote = useCallback((midi: number) => {
    emitNote(midi, false, performance.now());
    pianoSynth.noteOff(midi);
    setVirtualMomentaryNotes((prev) => {
      if (!prev.has(midi)) return prev;
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, []);

  const handleToggleLatchNote = useCallback((midi: number) => {
    setVirtualLatchNotes((prev) => {
      const next = new Set(prev);
      if (next.has(midi)) {
        next.delete(midi);
        emitNote(midi, false, performance.now());
        pianoSynth.noteOff(midi);
      } else {
        next.add(midi);
        emitNote(midi, true, performance.now());
        pianoSynth.noteOn(midi, 88);
      }
      return next;
    });
  }, []);

  const handleClearVirtualLatchNotes = useCallback(() => {
    setVirtualLatchNotes((prev) => {
      prev.forEach((midi) => pianoSynth.noteOff(midi));
      return new Set();
    });
    setVirtualMomentaryNotes((prev) => {
      prev.forEach((midi) => pianoSynth.noteOff(midi));
      return new Set();
    });
  }, []);

  const subscribeMidiRaw = useCallback((listener: MidiRawListener) => {
    return midiControllerRef.current?.onRawEvent(listener) ?? (() => undefined);
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<AppSettings>) => {
    setStoredData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
      },
    }));
  }, []);

  const handleStartPractice = useCallback((config: PracticeConfig) => {
    setLaunchConfig(config);
    setLaunchInConfigMode(false);
    setPlaySessionKey((k) => k + 1);
    setActiveTab('play');
  }, []);

  const handleOpenConfigurer = useCallback(() => {
    setLaunchInConfigMode(true);
    setPlaySessionKey((k) => k + 1);
    setActiveTab('play');
  }, []);

  const handleImportIrealLibrary = useCallback((songs: IrealSong[]) => {
    setStoredData((prev) => ({
      ...prev,
      isDemoData: false,
      irealLibrary: songs,
    }));
  }, []);

  const handleSaveMidiSetup = useCallback((key: string, setup: StoredMidiSetup) => {
    setStoredData((prev) => ({
      ...prev,
      midiSetups: {
        ...(prev.midiSetups ?? {}),
        [key]: setup,
      },
    }));
  }, []);

  const handleStartIrealSong = useCallback(async (song: IrealSong) => {
    const chords = await decodeIrealSong(song);
    if (!chords.length) throw new Error('La grille ne contient aucun accord praticable.');
    setLaunchConfig({
      mode: 'progression',
      label: song.title,
      rawInput: `${song.title} · ${song.composer}`,
      chords,
      step: 'root',
      tempoBpm: 120,
      beatsPerChord: 4,
      loopCount: 0,
    });
    setLaunchInConfigMode(false);
    setPlaySessionKey((key) => key + 1);
    setActiveTab('play');
  }, []);

  const handleFinishPlayAlong = useCallback((run: PlayAlongRun, session?: SessionSummary) => {
    setStoredData((prev) => ({
      ...prev,
      isDemoData: false,
      playAlongRuns: [...(prev.playAlongRuns ?? []), run].slice(-200),
    }));
    // Each chord also feeds per-chord statistics and spaced repetition (a melody run has none).
    if (session) handleCompleteSessionRef.current(session);
  }, []);
  const handleCompleteSessionRef = useRef<(summary: SessionSummary) => void>(() => undefined);

  const handleCompleteSession = useCallback((summary: SessionSummary) => {
    setStoredData((prev) => {
      const baseChordStats: Record<string, ChordStat> = prev.isDemoData
        ? {}
        : { ...prev.chordStats };
      const baseSpacedCards: Record<string, SpacedCard> = prev.isDemoData
        ? {}
        : { ...prev.spacedCards };
      const baseSongProgress: Record<string, SongProgress> = prev.isDemoData
        ? {}
        : { ...prev.songProgress };
      const baseSessions: SessionRecord[] = prev.isDemoData
        ? []
        : [...prev.sessions];

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      for (const attempt of summary.attempts) {
        const id = attempt.chord.id;
        const existing = baseChordStats[id];
        const prevAttempts = existing?.attempts ?? 0;
        const prevCorrect = existing?.correct ?? 0;
        const prevErrors = existing?.errors ?? 0;
        const prevMissed = existing?.missed ?? 0;
        const prevAvgMs = existing?.avgResponseMs ?? attempt.responseMs;

        const nextAttempts = prevAttempts + 1;
        const nextAvgMs =
          attempt.outcome === 'missed'
            ? prevAvgMs
            : Math.round((prevAvgMs * prevAttempts + attempt.responseMs) / nextAttempts);

        const isIso = attempt.context === 'isolated';
        const isCorrect = attempt.outcome === 'correct';

        baseChordStats[id] = {
          chordId: id,
          attempts: nextAttempts,
          correct: prevCorrect + (isCorrect ? 1 : 0),
          errors: prevErrors + (attempt.outcome === 'error' ? 1 : 0),
          missed: prevMissed + (attempt.outcome === 'missed' ? 1 : 0),
          avgResponseMs: nextAvgMs,
          lastPracticedAt: nowIso,
          isolatedAttempts: (existing?.isolatedAttempts ?? 0) + (isIso ? 1 : 0),
          isolatedCorrect:
            (existing?.isolatedCorrect ?? 0) + (isIso && isCorrect ? 1 : 0),
          progressionAttempts: (existing?.progressionAttempts ?? 0) + (!isIso ? 1 : 0),
          progressionCorrect:
            (existing?.progressionCorrect ?? 0) + (!isIso && isCorrect ? 1 : 0),
        };

        const cardKey = makeSpacedCardKey(id, attempt.step);
        baseSpacedCards[cardKey] = updateSpacedCard(
          baseSpacedCards[cardKey],
          id,
          attempt.step,
          attempt.outcome,
          attempt.responseMs,
          nowMs,
        );
      }

      if (summary.songId && summary.step && summary.songStepValidated) {
        const song = GUIDED_SONGS.find((s) => s.id === summary.songId);
        if (song) {
          const prevProg = baseSongProgress[song.id];
          const completed = new Set(prevProg?.completedSteps ?? []);
          completed.add(summary.step);
          const nextStep = getNextStepForSong(song, summary.step, baseSongProgress);
          const currentUnlocked = prevProg?.unlockedStep ?? song.availableSteps[0];
          const currentIdx = song.availableSteps.indexOf(currentUnlocked);
          const nextIdx = nextStep ? song.availableSteps.indexOf(nextStep) : currentIdx;
          const unlockedStep =
            nextStep && nextIdx > currentIdx ? nextStep : currentUnlocked;

          baseSongProgress[song.id] = {
            songId: song.id,
            unlockedStep,
            completedSteps: Array.from(completed),
            lastPracticedAt: nowIso,
          };
        }
      }

      const newSession: SessionRecord = {
        id: summary.id,
        date: nowIso,
        mode: summary.mode,
        label: summary.label,
        totalChords: summary.totalChords,
        correctCount: summary.correctCount,
        errorCount: summary.errorCount,
        missedCount: summary.missedCount,
        accuracy: summary.accuracy,
        durationSeconds: summary.durationSeconds,
        tempoBpm: summary.tempoBpm,
        families: summary.families,
      };

      return {
        ...prev,
        isDemoData: false,
        chordStats: baseChordStats,
        spacedCards: baseSpacedCards,
        songProgress: baseSongProgress,
        sessions: [newSession, ...baseSessions].slice(0, 60),
      };
    });
  }, []);
  handleCompleteSessionRef.current = handleCompleteSession;

  return (
    <div className="duo-shell min-h-screen transition-colors duration-200">
      <TopNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          // "Pratique libre" always opens the session configurator.
          if (tab === 'play') {
            handleOpenConfigurer();
            return;
          }
          setActiveTab(tab);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        profile={profile}
        onSwitchProfile={onSwitchProfile}
        midiState={midiState}
        theme={storedData.settings.theme}
        onToggleTheme={() =>
          handleUpdateSettings({
            theme: storedData.settings.theme === 'dark' ? 'light' : 'dark',
          })
        }
      />

      <main key={activeTab} className="mb-enter px-4 pt-6 pb-28 sm:px-8 lg:ml-60 lg:pt-10 lg:pb-12">
        {activeTab === 'today' && (
          <PathScreen
            unlockAll={profile.admin === true}
            storedData={storedData}
            midiState={midiState}
            onStartPractice={handleStartPractice}
            onPlayAlong={(local, ireal, goal) => setPlayAlong({ local, ireal, goal })}
            onOpenLibrary={() => setActiveTab('library')}
          />
        )}

        {activeTab === 'library' && (
          <LibraryScreen
            songs={storedData.irealLibrary ?? []}
            midiSetups={storedData.midiSetups ?? {}}
            onImport={handleImportIrealLibrary}
            onPlay={handleStartIrealSong}
            onPlayAlong={(local, ireal) => setPlayAlong({ local, ireal })}
            onSaveMidiSetup={handleSaveMidiSetup}
          />
        )}

        {activeTab === 'play' && (
          <PlayScreen
            unlockAll={profile.admin === true}
            key={playSessionKey}
            settings={storedData.settings}
            onUpdateSettings={handleUpdateSettings}
            songProgress={storedData.songProgress}
            midiState={midiState}
            activeNotes={activeNotes}
            virtualLatchNotes={Array.from(virtualLatchNotes)}
            onPressVirtualNote={handlePressVirtualNote}
            onReleaseVirtualNote={handleReleaseVirtualNote}
            onToggleLatchNote={handleToggleLatchNote}
            onClearVirtualLatchNotes={handleClearVirtualLatchNotes}
            initialConfig={launchConfig}
            startInConfigMode={launchInConfigMode}
            onCompleteSession={handleCompleteSession}
            onGoToProgress={() => setActiveTab('progress')}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressScreen
            unlockAll={profile.admin === true}
            storedData={storedData}
            onStartPractice={handleStartPractice}
          />
        )}
      </main>

      {playAlong?.goal?.objective.step === 'melody' && (
        <MelodyScreen
          key={`${playAlong.local.fileName}:${playAlong.goal.objective.id}`}
          localSong={playAlong.local}
          irealSong={playAlong.ireal}
          objective={playAlong.goal}
          settings={storedData.settings}
          onUpdateSettings={handleUpdateSettings}
          activeNotes={activeNotes}
          virtualLatchNotes={Array.from(virtualLatchNotes)}
          onPressVirtualNote={handlePressVirtualNote}
          onReleaseVirtualNote={handleReleaseVirtualNote}
          onToggleLatchNote={handleToggleLatchNote}
          onClearVirtualLatchNotes={handleClearVirtualLatchNotes}
          subscribeNoteEvents={subscribeNoteEvents}
          onFinish={handleFinishPlayAlong}
          onClose={() => setPlayAlong(null)}
        />
      )}

      {playAlong && playAlong.goal?.objective.step !== 'melody' && (
        <PlayAlongScreen
          key={`${playAlong.local.fileName}:${playAlong.goal?.objective.id ?? 'free'}`}
          localSong={playAlong.local}
          irealSong={playAlong.ireal}
          objective={playAlong.goal}
          settings={storedData.settings}
          onUpdateSettings={handleUpdateSettings}
          activeNotes={activeNotes}
          virtualLatchNotes={Array.from(virtualLatchNotes)}
          onPressVirtualNote={handlePressVirtualNote}
          onReleaseVirtualNote={handleReleaseVirtualNote}
          onToggleLatchNote={handleToggleLatchNote}
          onClearVirtualLatchNotes={handleClearVirtualLatchNotes}
          subscribeNoteEvents={subscribeNoteEvents}
          onFinish={handleFinishPlayAlong}
          onClose={() => setPlayAlong(null)}
        />
      )}

      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={storedData.settings}
        onUpdateSettings={handleUpdateSettings}
        midiState={midiState}
        onRefreshMidi={() => {
          void midiControllerRef.current?.refresh();
        }}
        onSelectMidiDevice={(id) => midiControllerRef.current?.selectDevice(id)}
        subscribeMidiRaw={subscribeMidiRaw}
        activeNotes={activeNotes}
        isDemoData={storedData.isDemoData}
        onRestoreDemoData={() =>
          setStoredData((prev) => ({
            ...createDemoData(prev.settings),
            irealLibrary: prev.irealLibrary,
            midiSetups: prev.midiSetups,
          }))
        }
        onClearAllData={() =>
          // Clears this profile's progress only; the shared song library stays.
          setStoredData((prev) => ({
            ...createEmptyData(prev.settings),
            irealLibrary: prev.irealLibrary,
            midiSetups: prev.midiSetups,
          }))
        }
      />
    </div>
  );
}
