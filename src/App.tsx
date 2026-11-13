import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pianoSynth } from './audio/synth';
import { CODE_TO_MIDI } from './input/keyboardMap';
import { WebMidiController } from './input/midi';
import { MidiState } from './input/types';
import { VoicingStep } from './music/chords';
import { decodeIrealSong, IrealSong } from './music/ireal';
import {
  GUIDED_SONGS,
  STEP_XP_TARGET,
  getNextStepForSong,
} from './practice/curriculum';
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
  StoredMidiSetup,
} from './storage/types';
import { SettingsDrawer } from './ui/components/SettingsDrawer';
import { AppTab, TopNav } from './ui/components/TopNav';
import { PlayScreen } from './ui/screens/PlayScreen';
import { LibraryScreen } from './ui/screens/LibraryScreen';
import { ProgressScreen } from './ui/screens/ProgressScreen';
import { TodayScreen } from './ui/screens/TodayScreen';

export default function App() {
  const [storedData, setStoredData] = useState<StoredData>(() => loadStoredData());
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [launchConfig, setLaunchConfig] = useState<PracticeConfig | null>(null);
  const [launchInConfigMode, setLaunchInConfigMode] = useState(false);
  const [playSessionKey, setPlaySessionKey] = useState(0);

  const midiControllerRef = useRef<WebMidiController | null>(null);
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
    saveStoredData(storedData);
  }, [storedData]);

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

    const unsubNote = controller.onNoteEvent((note, isDown, velocity) => {
      if (isDown) {
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
      if (activeTab !== 'play') return;
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
    pianoSynth.noteOn(midi, 92);
    setVirtualMomentaryNotes((prev) => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
  }, []);

  const handleReleaseVirtualNote = useCallback((midi: number) => {
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
        pianoSynth.noteOff(midi);
      } else {
        next.add(midi);
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

  const handleRecordSongStepXp = useCallback(
    (
      songId: string,
      step: VoicingStep,
      newXp: number,
      unlockedNextStep?: VoicingStep | null,
    ) => {
      setStoredData((prev) => {
        const song = GUIDED_SONGS.find((s) => s.id === songId);
        if (!song) return prev;

        const baseSongProgress = prev.isDemoData ? {} : { ...prev.songProgress };
        const prevProg = baseSongProgress[songId];
        const completed = new Set(prevProg?.completedSteps ?? []);
        if (newXp >= STEP_XP_TARGET) {
          completed.add(step);
        }

        const currentUnlocked = prevProg?.unlockedStep ?? song.availableSteps[0];
        const currentIdx = song.availableSteps.indexOf(currentUnlocked);
        const nextIdx = unlockedNextStep
          ? song.availableSteps.indexOf(unlockedNextStep)
          : currentIdx;
        const unlockedStep =
          unlockedNextStep && nextIdx > currentIdx
            ? unlockedNextStep
            : currentUnlocked;

        baseSongProgress[songId] = {
          songId,
          unlockedStep,
          completedSteps: Array.from(completed),
          stepXp: {
            ...(prevProg?.stepXp ?? {}),
            [step]: Math.min(STEP_XP_TARGET, newXp),
          },
          lastPracticedAt: new Date().toISOString(),
        };

        return {
          ...prev,
          isDemoData: false,
          songProgress: baseSongProgress,
        };
      });
    },
    [],
  );

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

      if (summary.songId && summary.step && summary.accuracy >= 80) {
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
            stepXp: {
              ...(prevProg?.stepXp ?? {}),
              [summary.step]: STEP_XP_TARGET,
            },
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

  return (
    <div className="duo-shell min-h-screen transition-colors duration-200">
      <TopNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'play' && activeTab !== 'play') {
            setLaunchInConfigMode(false);
          }
          setActiveTab(tab);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="px-4 py-7 sm:px-6 sm:py-10">
        {activeTab === 'today' && (
          <TodayScreen
            storedData={storedData}
            midiState={midiState}
            onStartPractice={handleStartPractice}
            onOpenConfigurer={handleOpenConfigurer}
          />
        )}

        {activeTab === 'library' && (
          <LibraryScreen
            songs={storedData.irealLibrary ?? []}
            midiSetups={storedData.midiSetups ?? {}}
            onImport={handleImportIrealLibrary}
            onPlay={handleStartIrealSong}
            onSaveMidiSetup={handleSaveMidiSetup}
          />
        )}

        {activeTab === 'play' && (
          <PlayScreen
            key={playSessionKey}
            settings={storedData.settings}
            onUpdateSettings={handleUpdateSettings}
            songProgress={storedData.songProgress}
            onRecordSongStepXp={handleRecordSongStepXp}
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
            storedData={storedData}
            onStartPractice={handleStartPractice}
          />
        )}
      </main>

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
        isDemoData={storedData.isDemoData}
        onRestoreDemoData={() =>
          setStoredData((prev) => createDemoData(prev.settings))
        }
        onClearAllData={() =>
          setStoredData((prev) => createEmptyData(prev.settings))
        }
      />
    </div>
  );
}
