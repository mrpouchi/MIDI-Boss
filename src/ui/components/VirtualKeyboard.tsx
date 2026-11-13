import { ChevronDown, ChevronUp, RotateCcw, Volume2 } from 'lucide-react';
import { MIDI_TO_KEY_LABEL } from '../../input/keyboardMap';
import { NotationSystem, formatPitchClass } from '../../music/chords';

interface VirtualKeyboardProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  showExpectedHelper: boolean;
  onToggleExpectedHelper: () => void;
  showNoteLabels: boolean;
  latchMode: boolean;
  onToggleLatchMode: () => void;
  activeNotes: number[];
  expectedPitchClasses: number[];
  expectedVoicingNotes: number[];
  notation: NotationSystem;
  onPressNote: (midi: number) => void;
  onReleaseNote: (midi: number) => void;
  onToggleLatchNote: (midi: number) => void;
  onReleaseAllVirtual: () => void;
  onPlayPreview?: () => void;
  hasLatchedNotes: boolean;
}

interface PianoKeySpec {
  midi: number;
  pitchClass: number;
  isBlack: boolean;
  whiteIndex: number; // Position among white keys (0..13)
}

const START_MIDI = 60; // C4
const END_MIDI = 83; // B5
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

const PIANO_KEYS: PianoKeySpec[] = (() => {
  const keys: PianoKeySpec[] = [];
  let whiteIndex = 0;
  for (let midi = START_MIDI; midi <= END_MIDI; midi++) {
    const pc = midi % 12;
    const isBlack = BLACK_PITCH_CLASSES.has(pc);
    keys.push({
      midi,
      pitchClass: pc,
      isBlack,
      whiteIndex: isBlack ? whiteIndex - 1 : whiteIndex,
    });
    if (!isBlack) {
      whiteIndex++;
    }
  }
  return keys;
})();

const WHITE_KEYS = PIANO_KEYS.filter((k) => !k.isBlack);
const BLACK_KEYS = PIANO_KEYS.filter((k) => k.isBlack);

export function VirtualKeyboard({
  isOpen,
  onToggleOpen,
  showExpectedHelper,
  onToggleExpectedHelper,
  showNoteLabels,
  latchMode,
  onToggleLatchMode,
  activeNotes,
  expectedPitchClasses,
  expectedVoicingNotes,
  notation,
  onPressNote,
  onReleaseNote,
  onToggleLatchNote,
  onReleaseAllVirtual,
  onPlayPreview,
  hasLatchedNotes,
}: VirtualKeyboardProps) {
  const activePitchSet = new Set(activeNotes.map((n) => ((n % 12) + 12) % 12));
  const activeMidiSet = new Set(activeNotes);
  const expectedSet = new Set(expectedPitchClasses);
  const suggestedMidiSet = new Set(expectedVoicingNotes);

  const handleKeyPointerDown = (midi: number) => {
    if (latchMode) {
      onToggleLatchNote(midi);
    } else {
      onPressNote(midi);
    }
  };

  const handleKeyPointerUp = (midi: number) => {
    if (!latchMode) {
      onReleaseNote(midi);
    }
  };

  return (
    <section
      aria-label="Clavier virtuel et aide visuelle"
      className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-[#151c2f]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onToggleOpen}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-800 transition-colors hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-300"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-stone-400 dark:text-slate-500" />
          ) : (
            <ChevronUp className="h-4 w-4 text-stone-400 dark:text-slate-500" />
          )}
          <span>Clavier d’aide interactif</span>
          <span className="text-xs font-normal text-stone-500 dark:text-slate-400">
            {isOpen ? 'Replier' : 'Afficher'}
          </span>
        </button>

        {isOpen && (
          <div className="flex flex-wrap items-center gap-2">
            {onPlayPreview && (
              <button
                type="button"
                onClick={onPlayPreview}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Écouter</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleExpectedHelper}
              aria-pressed={showExpectedHelper}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showExpectedHelper
                  ? 'border-indigo-500/40 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200'
                  : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {showExpectedHelper ? 'Notes guides : actives' : 'Notes guides : masquées'}
            </button>

            <button
              type="button"
              onClick={onToggleLatchMode}
              aria-pressed={latchMode}
              title="Permet de cliquer plusieurs notes une par une pour former un accord à la souris"
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                latchMode
                  ? 'border-indigo-500/40 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-200'
                  : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {latchMode ? 'Clic maintenu : actif' : 'Clic instantané'}
            </button>

            {hasLatchedNotes && (
              <button
                type="button"
                onClick={onReleaseAllVirtual}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Relâcher</span>
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-stone-200/80 px-3 pt-3 pb-4 sm:px-5 dark:border-slate-800/80">
          <div className="overflow-x-auto pb-1">
            <div className="relative mx-auto h-40 min-w-[560px] max-w-3xl select-none sm:h-44">
              {/* White keys */}
              <div className="grid h-full grid-cols-14 gap-1">
                {WHITE_KEYS.map((key) => {
                  const isPressed =
                    activeMidiSet.has(key.midi) ||
                    (activePitchSet.has(key.pitchClass) && !activeMidiSet.size);
                  const isStrictlyPressed = activeMidiSet.has(key.midi);
                  const isExpected = expectedSet.has(key.pitchClass);
                  const isSuggestedVoicing =
                    showExpectedHelper && suggestedMidiSet.has(key.midi);
                  const isCorrectPressed = isStrictlyPressed && isExpected;
                  const isWrongPressed =
                    isStrictlyPressed && expectedSet.size > 0 && !isExpected;

                  let keyStyle =
                    'bg-stone-50 border-stone-300 text-stone-500 hover:bg-white dark:bg-slate-100 dark:border-slate-300 dark:text-slate-500 dark:hover:bg-white';
                  if (isCorrectPressed) {
                    keyStyle =
                      'bg-emerald-500 border-emerald-600 text-white shadow-inner';
                  } else if (isWrongPressed) {
                    keyStyle = 'bg-rose-500 border-rose-600 text-white shadow-inner';
                  } else if (isStrictlyPressed || isPressed) {
                    keyStyle =
                      'bg-indigo-600 border-indigo-700 text-white shadow-inner';
                  } else if (isSuggestedVoicing) {
                    keyStyle =
                      'bg-indigo-100 border-indigo-400 text-indigo-800 dark:bg-indigo-200 dark:border-indigo-500 dark:text-indigo-950';
                  }

                  const pcLabel = formatPitchClass(key.pitchClass, notation);
                  const shortcut = MIDI_TO_KEY_LABEL[key.midi];

                  return (
                    <button
                      key={key.midi}
                      type="button"
                      aria-label={`Touche ${pcLabel}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handleKeyPointerDown(key.midi);
                      }}
                      onPointerUp={() => handleKeyPointerUp(key.midi)}
                      onPointerLeave={() => {
                        if (!latchMode && isStrictlyPressed) {
                          handleKeyPointerUp(key.midi);
                        }
                      }}
                      className={`relative flex h-full flex-col items-center justify-end rounded-b-lg border pb-2 transition-colors duration-100 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-indigo-500 ${keyStyle}`}
                    >
                      {isSuggestedVoicing && !isStrictlyPressed && (
                        <span
                          aria-hidden="true"
                          className="mb-1.5 h-2 w-2 rounded-full bg-indigo-600"
                        />
                      )}
                      {showNoteLabels && (
                        <span className="text-[11px] font-semibold leading-none">
                          {pcLabel}
                        </span>
                      )}
                      {shortcut && (
                        <span className="mt-1 font-mono text-[9px] opacity-55">
                          {shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Black keys */}
              {BLACK_KEYS.map((key) => {
                const isStrictlyPressed = activeMidiSet.has(key.midi);
                const isExpected = expectedSet.has(key.pitchClass);
                const isSuggestedVoicing =
                  showExpectedHelper && suggestedMidiSet.has(key.midi);
                const isCorrectPressed = isStrictlyPressed && isExpected;
                const isWrongPressed =
                  isStrictlyPressed && expectedSet.size > 0 && !isExpected;

                let keyStyle =
                  'bg-stone-800 border-stone-900 text-stone-300 hover:bg-stone-700 dark:bg-slate-900 dark:border-slate-950 dark:text-slate-400 dark:hover:bg-slate-800';
                if (isCorrectPressed) {
                  keyStyle = 'bg-emerald-600 border-emerald-700 text-white';
                } else if (isWrongPressed) {
                  keyStyle = 'bg-rose-600 border-rose-700 text-white';
                } else if (isStrictlyPressed) {
                  keyStyle = 'bg-indigo-600 border-indigo-700 text-white';
                } else if (isSuggestedVoicing) {
                  keyStyle =
                    'bg-indigo-700 border-indigo-400 text-indigo-100 ring-2 ring-indigo-400/70';
                }

                const leftPercent = ((key.whiteIndex + 0.68) / 14) * 100;
                const widthPercent = (0.64 / 14) * 100;
                const pcLabel = formatPitchClass(key.pitchClass, notation);
                const shortcut = MIDI_TO_KEY_LABEL[key.midi];

                return (
                  <button
                    key={key.midi}
                    type="button"
                    aria-label={`Touche ${pcLabel}`}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleKeyPointerDown(key.midi);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      handleKeyPointerUp(key.midi);
                    }}
                    onPointerLeave={() => {
                      if (!latchMode && isStrictlyPressed) {
                        handleKeyPointerUp(key.midi);
                      }
                    }}
                    className={`absolute top-0 z-10 flex h-[60%] flex-col items-center justify-end rounded-b-md border pb-1.5 shadow-sm transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-indigo-400 ${keyStyle}`}
                  >
                    {showNoteLabels && (
                      <span className="text-[9px] font-medium leading-none">
                        {pcLabel}
                      </span>
                    )}
                    {shortcut && (
                      <span className="mt-0.5 font-mono text-[8px] opacity-65">
                        {shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-2.5 text-center text-xs text-stone-500 dark:text-slate-400">
            Jouable au clavier MIDI, à la souris (clic maintenu) ou via les touches{' '}
            <span className="font-mono">Q S D F G H J K</span> et{' '}
            <span className="font-mono">Z E T Y U</span>. Les renversements et octaves sont acceptés.
          </p>
        </div>
      )}
    </section>
  );
}
