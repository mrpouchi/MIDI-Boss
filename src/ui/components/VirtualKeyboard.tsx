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
  /** Shorter keys and no option pills: for screens that must fit without scrolling. */
  compact?: boolean;
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
  compact = false,
}: VirtualKeyboardProps) {
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

  const pillClass = (on: boolean) =>
    `rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
      on ? 'border-sky bg-sky/10 text-sky-press dark:text-sky' : 'border-line text-muted hover:text-text'
    }`;

  return (
    <section aria-label="Clavier" className="w-full">
      {isOpen && (
        <div className="overflow-x-auto pb-2">
          <div className={`relative mx-auto ${compact ? 'h-36 sm:h-40' : 'h-48 sm:h-52'} min-w-[600px] max-w-4xl select-none rounded-[22px] bg-ink p-2.5 pt-4 shadow-[0_6px_0_#0c0f1f]`}>
            {/* White keys */}
            <div className="grid h-full grid-cols-14 gap-[3px]">
              {WHITE_KEYS.map((key) => {
                const isStrictlyPressed = activeMidiSet.has(key.midi);
                const isExpected = expectedSet.has(key.pitchClass);
                const isSuggestedVoicing = showExpectedHelper && suggestedMidiSet.has(key.midi);
                const isCorrectPressed = isStrictlyPressed && isExpected;
                const isWrongPressed = isStrictlyPressed && expectedSet.size > 0 && !isExpected;

                let face = 'bg-white text-stone-400 shadow-[inset_0_-8px_0_#e1e5ef] hover:bg-stone-50';
                if (isCorrectPressed) face = 'bg-green text-white shadow-[inset_0_-4px_0_var(--color-green-press)] translate-y-[3px]';
                else if (isWrongPressed) face = 'bg-coral text-white shadow-[inset_0_-4px_0_var(--color-coral-press)] translate-y-[3px]';
                else if (isStrictlyPressed) face = 'bg-stone-200 text-ink shadow-[inset_0_-4px_0_#cbd1e0] translate-y-[3px]';
                else if (isSuggestedVoicing) face = 'bg-sky-100 text-sky-press shadow-[inset_0_-8px_0_var(--color-sky)]';

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
                      if (!latchMode && isStrictlyPressed) handleKeyPointerUp(key.midi);
                    }}
                    className={`relative flex h-full flex-col items-center justify-end rounded-b-xl rounded-t-sm pb-3 transition-[transform,background-color] duration-75 focus-visible:z-20 ${face}`}
                  >
                    {isSuggestedVoicing && !isStrictlyPressed && (
                      <span aria-hidden="true" className="mb-2 h-3.5 w-3.5 rounded-full bg-sky" />
                    )}
                    {showNoteLabels && (
                      <span className="font-display text-sm leading-none font-semibold">{pcLabel}</span>
                    )}
                    {shortcut && <span className="mt-1 text-[10px] font-bold opacity-50">{shortcut}</span>}
                  </button>
                );
              })}
            </div>

            {/* Black keys */}
            {BLACK_KEYS.map((key) => {
              const isStrictlyPressed = activeMidiSet.has(key.midi);
              const isExpected = expectedSet.has(key.pitchClass);
              const isSuggestedVoicing = showExpectedHelper && suggestedMidiSet.has(key.midi);
              const isCorrectPressed = isStrictlyPressed && isExpected;
              const isWrongPressed = isStrictlyPressed && expectedSet.size > 0 && !isExpected;

              let face = 'bg-ink text-stone-400 shadow-[inset_0_-6px_0_#0c0f1f] hover:bg-stone-800';
              if (isCorrectPressed) face = 'bg-green-press text-white';
              else if (isWrongPressed) face = 'bg-coral-press text-white';
              else if (isStrictlyPressed) face = 'bg-stone-700 text-white';
              else if (isSuggestedVoicing) face = 'bg-sky-press text-white shadow-[inset_0_-6px_0_#0c2740]';

              // Keys sit inside a 10px padded case: convert the white-key grid position.
              const leftPercent = ((key.whiteIndex + 0.66) / 14) * 100;
              const widthPercent = (0.62 / 14) * 100;
              const pcLabel = formatPitchClass(key.pitchClass, notation);
              const shortcut = MIDI_TO_KEY_LABEL[key.midi];
              return (
                <button
                  key={key.midi}
                  type="button"
                  aria-label={`Touche ${pcLabel}`}
                  style={{
                    left: `calc(10px + (100% - 20px) * ${leftPercent / 100})`,
                    width: `calc((100% - 20px) * ${widthPercent / 100})`,
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
                    if (!latchMode && isStrictlyPressed) handleKeyPointerUp(key.midi);
                  }}
                  className={`absolute top-4 z-10 flex h-[58%] flex-col items-center justify-end rounded-b-lg pb-2 transition-colors duration-75 ${face}`}
                >
                  {isSuggestedVoicing && !isStrictlyPressed && (
                    <span aria-hidden="true" className="mb-1.5 h-2.5 w-2.5 rounded-full bg-white" />
                  )}
                  {showNoteLabels && <span className="text-[10px] leading-none font-bold">{pcLabel}</span>}
                  {shortcut && <span className="mt-0.5 text-[9px] font-bold opacity-60">{shortcut}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!compact && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onToggleOpen} className={pillClass(false)}>
          {isOpen ? (
            <span className="inline-flex items-center gap-1"><ChevronDown className="h-4 w-4" />Masquer le clavier</span>
          ) : (
            <span className="inline-flex items-center gap-1"><ChevronUp className="h-4 w-4" />Afficher le clavier</span>
          )}
        </button>
        {isOpen && (
          <>
            <button type="button" onClick={onToggleExpectedHelper} aria-pressed={showExpectedHelper} className={pillClass(showExpectedHelper)}>
              Montrer les touches
            </button>
            <button
              type="button"
              onClick={onToggleLatchMode}
              aria-pressed={latchMode}
              title="Cliquez les notes une à une pour former un accord à la souris"
              className={pillClass(latchMode)}
            >
              Accord à la souris
            </button>
            {hasLatchedNotes && (
              <button type="button" onClick={onReleaseAllVirtual} className={pillClass(false)}>
                <span className="inline-flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Tout relâcher</span>
              </button>
            )}
            {onPlayPreview && (
              <button type="button" onClick={onPlayPreview} className={pillClass(false)}>
                <span className="inline-flex items-center gap-1"><Volume2 className="h-4 w-4" />Écouter</span>
              </button>
            )}
          </>
        )}
      </div>}
    </section>
  );
}
