// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiState } from '../../../input/types';
import { createChord } from '../../../music/chords';
import { LessonConfig } from '../../../practice/types';
import { DEFAULT_SETTINGS } from '../../../storage/localStore';
import { SongProgress } from '../../../storage/types';
import { PlayScreen } from '../PlayScreen';

vi.mock('../../../audio/synth', () => ({
  pianoSynth: { playChordPreview: vi.fn(), playMetronomeTick: vi.fn() },
}));

const MIDI: MidiState = {
  status: 'connected',
  devices: [{ id: 'bs2', name: 'Bass Station II', manufacturer: 'Novation' }],
  activeDeviceId: 'bs2',
  activeDeviceName: 'Bass Station II',
  errorMessage: null,
};

const LESSON: LessonConfig = {
  mode: 'lesson',
  label: 'Leçon du jour · test',
  goalDescription: 'test',
  tempoBpm: 72,
  songId: 'song-pop-do',
  targetStep: 'root',
  items: [
    { chord: createChord(0, 'maj'), step: 'root', context: 'progression' },
    { chord: createChord(7, 'maj'), step: 'root', context: 'progression' },
    { chord: createChord(9, 'min'), step: 'root', context: 'progression' },
  ],
};

interface Controls {
  setNotes: (notes: number[]) => void;
  bumpProgress: () => void;
}
const controls: Controls = { setNotes: () => {}, bumpProgress: () => {} };
const completed = vi.fn();

function Harness() {
  const [notes, setNotes] = useState<number[]>([]);
  const [songProgress, setSongProgress] = useState<Record<string, SongProgress>>({});
  controls.setNotes = setNotes;
  // Any parent update that creates a new progress object (what used to happen
  // after every correct chord) must not restart the running lesson.
  controls.bumpProgress = () => setSongProgress((p) => ({ ...p }));
  return (
    <PlayScreen
      settings={{ ...DEFAULT_SETTINGS, notation: 'intl', listenAndRepeatEnabled: true }}
      onUpdateSettings={() => {}}
      songProgress={songProgress}
      midiState={MIDI}
      activeNotes={notes}
      virtualLatchNotes={[]}
      onPressVirtualNote={() => {}}
      onReleaseVirtualNote={() => {}}
      onToggleLatchNote={() => {}}
      onClearVirtualLatchNotes={() => {}}
      initialConfig={LESSON}
      startInConfigMode={false}
      onCompleteSession={completed}
      onGoToProgress={() => {}}
      onOpenSettings={() => {}}
    />
  );
}

function currentChord(): string {
  return document.querySelector('[data-testid="chord-name"]')?.textContent ?? '';
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
function play(notes: number[]) {
  act(() => controls.setNotes(notes));
  advance(120);
}
function clickContinue() {
  fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
}

describe('PlayScreen — leçon du jour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // PlayScreen schedules through `window.setTimeout`; in jsdom that is not
    // the global Vitest fakes, so point it at the faked functions.
    window.setTimeout = globalThis.setTimeout;
    window.clearTimeout = globalThis.clearTimeout;
    window.setInterval = globalThis.setInterval;
    window.clearInterval = globalThis.clearInterval;
    completed.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('advances exactly one card per validated chord, without cascade', () => {
    render(<Harness />);
    expect(currentChord()).toBe('C');

    // Notes played during the demonstration are ignored.
    play([60]);
    expect(screen.queryByRole('button', { name: /continuer/i })).toBeNull();
    play([]);
    advance(1200);

    play([60]);
    expect(currentChord()).toBe('C');
    expect(screen.getByText('Bien joué !')).toBeTruthy();

    // A progress save in the parent must not restart the session.
    act(() => controls.bumpProgress());
    advance(2000);
    expect(currentChord()).toBe('C');
    expect(screen.getByRole('button', { name: /relâchez les touches/i })).toBeTruthy();

    play([]);
    clickContinue();
    expect(currentChord()).toBe('G');

    advance(1200);
    play([67]);
    expect(currentChord()).toBe('G');
    act(() => controls.bumpProgress());
    advance(3000);
    // Still on G: no automatic jump, no return to the first chord.
    expect(currentChord()).toBe('G');

    play([]);
    clickContinue();
    expect(currentChord()).toBe('A' + 'm');

    advance(1200);
    play([69]);
    play([]);
    clickContinue();
    expect(completed).toHaveBeenCalledTimes(1);
    const summary = completed.mock.calls[0][0];
    expect(summary.totalChords).toBe(3);
    expect(summary.correctCount).toBe(3);
  });

  it('a wrong note is recorded, the chord comes back once, and a held chord never scores the next card', () => {
    render(<Harness />);
    advance(1200);
    play([60, 66]); // C + F#: foreign note
    expect(screen.getByText(/Note étrangère/)).toBeTruthy();
    play([60]); // corrected
    expect(screen.getByText(/On le rejoue en fin de leçon/)).toBeTruthy();
    play([]);
    clickContinue();
    expect(currentChord()).toBe('G');
    // The missed chord was re-queued once: 3 items + 1 review.
    expect(screen.getByText('2 / 4')).toBeTruthy();

    // Holding G during the demonstration must not score it.
    play([67]);
    expect(screen.queryByRole('button', { name: /continuer/i })).toBeNull();
    advance(1200);
    // The demo is over but the keys were pressed before: still scored only once.
    play([]);
    play([67]);
    play([]);
    clickContinue();
    expect(currentChord()).toBe('Am');
  });
});
