import type { ReactNode } from 'react';
import { formatPitchClass } from '../../music/chords';

/**
 * The tune falling onto a keyboard: each note comes down its key's column and
 * lands on the key when it is time to play it. Bars are clear horizontal
 * lines with their chord above them. Time runs on any continuous clock
 * (a loop is laid out pass after pass by the caller).
 */

export type FallingNoteState = 'listen' | 'upcoming' | 'next' | 'on-time' | 'early' | 'late' | 'missed';

export interface FallingNote {
  key: string;
  midi: number;
  startMs: number;
  durationMs: number;
  state: FallingNoteState;
}

export interface FallingBar {
  key: string;
  ms: number;
  /** Bar number shown to the learner (1-based). */
  number: number;
  /** Chords of the bar: the first one at the barline, others where they fall. */
  chords: { ms: number; label: string }[];
  /** The loop starts again here. */
  loopStart?: boolean;
}

interface FallingNotesProps {
  notes: FallingNote[];
  bars: FallingBar[];
  nowMs: number;
  /** How far ahead the lane shows (ms from the keys to its top). */
  lookaheadMs: number;
  beatMs: number;
  /** Written range of the tune: the keyboard spans whole octaves around it. */
  lowMidi: number;
  highMidi: number;
  activeNotes: number[];
  /** The note to play now or next (lit on its key when `showTarget`). */
  targetMidi: number | null;
  showTarget: boolean;
  notation: 'intl' | 'fr';
  onPressNote: (midi: number) => void;
  onReleaseNote: (midi: number) => void;
  /** Drawn over the lane (messages, banners). */
  children?: ReactNode;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (midi: number) => BLACK.has(((midi % 12) + 12) % 12);

const NOTE_STYLE: Record<FallingNoteState, string> = {
  listen: 'border-2 border-dashed border-sky bg-sky/20 text-sky-press',
  upcoming: 'bg-sky text-white shadow-[0_4px_0_var(--color-sky-press)]',
  next: 'bg-sky text-white shadow-[0_4px_0_var(--color-sky-press)] ring-4 ring-brass',
  'on-time': 'bg-green text-white shadow-[0_4px_0_var(--color-green-press)]',
  early: 'bg-brass text-ink shadow-[0_4px_0_var(--color-brass-press)]',
  late: 'bg-brass text-ink shadow-[0_4px_0_var(--color-brass-press)]',
  missed: 'bg-coral/70 text-white',
};

export function FallingNotes(props: FallingNotesProps) {
  const { notes, bars, nowMs, lookaheadMs, beatMs, activeNotes, targetMidi, showTarget, notation } = props;

  // Whole octaves, at least two, so the hand finds its place.
  let low = Math.floor(props.lowMidi / 12) * 12;
  let high = Math.floor(props.highMidi / 12) * 12 + 11;
  while (high - low + 1 < 24) {
    if (low > 36) low -= 12;
    else high += 12;
  }
  const whites: number[] = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  const whiteW = 100 / whites.length;
  const blackW = whiteW * 0.62;
  const keyBox = (midi: number) => {
    if (!isBlack(midi)) return { left: whites.indexOf(midi) * whiteW, width: whiteW };
    return { left: (whites.indexOf(midi - 1) + 1) * whiteW - blackW / 2, width: blackW };
  };

  /** Height from the keys, in % of the lane. */
  const h = (ms: number) => ((ms - nowMs) / lookaheadMs) * 100;
  const inView = (ms: number) => ms >= nowMs - lookaheadMs * 0.1 && ms <= nowMs + lookaheadMs;

  const firstBeat = Math.ceil((nowMs - lookaheadMs * 0.1) / beatMs);
  const beatLines: number[] = [];
  for (let b = firstBeat; b * beatMs <= nowMs + lookaheadMs; b++) beatLines.push(b * beatMs);

  const active = new Set(activeNotes);
  const targetPc = targetMidi === null ? null : targetMidi % 12;
  const pressedTarget = targetPc !== null && activeNotes.some((n) => n % 12 === targetPc);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border-2 border-line bg-surface">
      {/* ---------- The lane ---------- */}
      <div className="relative min-h-0 flex-1 overflow-hidden" aria-label="Notes de la mélodie qui tombent vers le clavier">
        {/* Black-key columns, a guide for the eye. */}
        {Array.from({ length: high - low + 1 }, (_, i) => low + i)
          .filter(isBlack)
          .map((m) => {
            const k = keyBox(m);
            return <span key={m} className="absolute inset-y-0 bg-mist/70" style={{ left: `${k.left}%`, width: `${k.width}%` }} aria-hidden="true" />;
          })}
        {beatLines.map((ms) => (
          <span key={`beat-${ms}`} className="absolute inset-x-0 h-px bg-line/60" style={{ bottom: `${h(ms)}%` }} aria-hidden="true" />
        ))}
        {bars
          .filter((b) => inView(b.ms) || b.chords.some((c) => inView(c.ms)))
          .map((b) => (
            <div key={b.key} aria-hidden="true">
              <span
                className={`absolute inset-x-0 ${b.loopStart ? 'h-1 bg-sky' : 'h-0.5 bg-text/35'}`}
                style={{ bottom: `${h(b.ms)}%` }}
              />
              <span
                className="absolute right-2 font-display text-xs font-bold text-muted"
                style={{ bottom: `calc(${h(b.ms)}% + 4px)` }}
              >
                {b.loopStart ? '↻ ' : ''}Mesure {b.number}
              </span>
              {b.chords.map((c, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span className="absolute inset-x-0 border-t-2 border-dashed border-text/20" style={{ bottom: `${h(c.ms)}%` }} />
                  )}
                  <span
                    className="absolute left-2 z-20 rounded-xl border-2 border-ink/10 bg-page px-2.5 py-0.5 font-display text-lg leading-tight font-bold text-text shadow-[0_3px_0_var(--color-line)]"
                    style={{ bottom: `calc(${h(c.ms)}% + 5px)` }}
                  >
                    {c.label}
                  </span>
                </span>
              ))}
            </div>
          ))}
        {notes
          .filter((n) => n.startMs + n.durationMs >= nowMs - lookaheadMs * 0.1 && n.startMs <= nowMs + lookaheadMs)
          .map((n) => {
            const k = keyBox(clampTo(n.midi, low, high));
            return (
              <span
                key={n.key}
                className={`absolute z-10 flex items-end justify-center overflow-hidden rounded-xl pb-1 font-display text-xs font-bold sm:text-sm ${NOTE_STYLE[n.state]}`}
                style={{
                  left: `calc(${k.left}% + 2px)`,
                  width: `calc(${k.width}% - 4px)`,
                  bottom: `${h(n.startMs)}%`,
                  height: `max(1.6rem, calc(${(Math.max(1, n.durationMs - 30) / lookaheadMs) * 100}% - 3px))`,
                }}
              >
                {formatPitchClass(n.midi % 12, notation)}
              </span>
            );
          })}
        {props.children}
      </div>

      {/* ---------- Where the notes land ---------- */}
      <div className="h-1.5 shrink-0 bg-brass shadow-[0_0_12px_var(--color-brass)]" aria-hidden="true" />
      <div className="relative h-24 shrink-0 select-none sm:h-28" role="group" aria-label="Clavier">
        {[...whites, ...Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(isBlack)].map((m) => {
          const k = keyBox(m);
          const black = isBlack(m);
          const pressed = active.has(m);
          const target = showTarget && targetMidi !== null && clampTo(targetMidi, low, high) === m;
          const color = pressed
            ? target || (targetPc !== null && m % 12 === targetPc)
              ? 'bg-green'
              : 'bg-sky'
            : target
              ? pressedTarget
                ? 'bg-green/60'
                : 'bg-brass'
              : black
                ? 'bg-ink'
                : 'bg-white';
          return (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              aria-label={formatPitchClass(m % 12, notation)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                props.onPressNote(m);
              }}
              onPointerUp={() => props.onReleaseNote(m)}
              onPointerCancel={() => props.onReleaseNote(m)}
              className={`absolute top-0 flex items-end justify-center rounded-b-lg pb-1 text-[0.65rem] font-bold transition-colors duration-75 ${
                black ? 'z-10 h-[62%] text-white/0' : 'h-full border-x border-b-4 border-ink/15 text-ink/40'
              } ${color}`}
              style={{ left: `${k.left}%`, width: `${k.width}%` }}
            >
              {!black && m % 12 === 0 ? formatPitchClass(0, notation) + Math.floor(m / 12 - 1) : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A note outside the drawn keys falls on the same pitch class inside them. */
function clampTo(midi: number, low: number, high: number): number {
  let m = midi;
  while (m < low) m += 12;
  while (m > high) m -= 12;
  return m;
}
