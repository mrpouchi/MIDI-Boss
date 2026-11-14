import { ChordDefinition, ChordFamily, createChord } from './chords';

/**
 * Bar-by-bar chord charts, built from iReal Pro data (see ireal.ts).
 * Pure functions only: no WASM, no DOM — fully unit-tested.
 */

export interface ChartChord {
  /** Chord used for validation: the nearest family the app can check. */
  chord: ChordDefinition;
  /** Suffix as written in the chart (e.g. "7♭9", "m7♭5"), for display. */
  suffix: string;
  /** Root as spelled in the chart (D♭ stays D♭, never C♯). */
  rootSpelling: { letter: string; accidental: 'flat' | 'sharp' | 'natural' };
  /** Extra pitch classes accepted as colour tones (9ths, 13ths, alterations…). */
  tensions: number[];
  /** 1-based beat inside the bar where the chord starts. */
  beat: number;
}

export interface ChordChart {
  title: string;
  beatsPerBar: number;
  /** One entry per bar after repeats are expanded; [] = previous chord continues. */
  bars: ChartChord[][];
  /** Form features this version does not expand yet (D.C., D.S., Coda…). */
  unsupportedJumps: string[];
}

// ---- Raw shape returned by @chordsketch/wasm parseIrealb (fields we use) ----
export interface RawRoot {
  note: string;
  accidental: string;
}
export interface RawChord {
  root: RawRoot;
  quality: { kind: string; value?: string };
}
export interface RawBar {
  start: string;
  end: string;
  chords: Array<{ chord: RawChord | null; position?: { beat: number; subdivision: number }; size?: string }>;
  ending: string | number | null;
  symbol: string | null;
  repeat_previous?: boolean;
  no_chord?: boolean;
}
export interface RawChart {
  title: string;
  time_signature?: { numerator: number; denominator: number } | null;
  sections: Array<{ bars: RawBar[] }>;
}

const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function rootToPitchClass(root: RawRoot): number | null {
  const base = NATURALS[root.note];
  if (base === undefined) return null;
  if (root.accidental === 'sharp') return (base + 1) % 12;
  if (root.accidental === 'flat') return (base + 11) % 12;
  return base;
}

const KIND_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  major7: 'maj7',
  minor7: 'm7',
  dominant7: '7',
  half_diminished: 'm7♭5',
  diminished7: 'dim7',
  diminished: 'dim',
  augmented: '+',
  suspended4: 'sus4',
  suspended2: 'sus2',
};

/** iReal compact notation → readable suffix: "-7" → "m7", "^7#11" → "maj7♯11", "h7" → "m7♭5". */
export function prettifyCustomSuffix(value: string): string {
  let s = value;
  if (s.startsWith('h')) s = 'm7♭5' + s.slice(1).replace(/^7/, '');
  else if (s.startsWith('o')) s = 'dim' + s.slice(1);
  if (s.startsWith('-')) s = 'm' + s.slice(1);
  s = s.replace(/\^/g, 'maj');
  return s.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');
}

/** Pitch-class offsets (from the root) of the tensions written in a suffix. */
function tensionIntervals(value: string, family: ChordFamily): number[] {
  const t = new Set<number>();
  const v = value.toLowerCase();
  if (/b9/.test(v)) t.add(1);
  if (/#9/.test(v)) t.add(3);
  if (/(^|[^b#])9/.test(v) || /13/.test(v)) t.add(2);
  if (/#11/.test(v)) t.add(6);
  else if (/11/.test(v)) t.add(5);
  if (/b13/.test(v) || /#5/.test(v) || /-b6/.test(v)) t.add(8);
  else if (/13/.test(v) || /6/.test(v)) t.add(9);
  if (/b5/.test(v) && family === '7') t.add(6);
  if (/alt/.test(v)) [1, 3, 6, 8].forEach((x) => t.add(x));
  // A 7th written on a 6/69 chord is not implied, but a natural 9th always sounds fine on 7th chords.
  if (family === '7' || family === 'm7' || family === 'maj7') t.add(2);
  return [...t];
}

/** Maps an iReal quality to the closest family the app can validate. */
export function qualityToFamily(kind: string, value = ''): ChordFamily {
  switch (kind) {
    case 'major': return 'maj';
    case 'minor': return 'min';
    case 'major7': return 'maj7';
    case 'minor7': return 'm7';
    case 'dominant7': return '7';
    case 'half_diminished': return 'm7b5';
    case 'diminished7': return 'dim7';
    case 'diminished': return 'dim';
    case 'augmented': return 'maj';
    case 'suspended4': return 'sus4';
    case 'suspended2': return 'sus2';
    default: break;
  }
  const v = value;
  if (v.startsWith('h')) return 'm7b5';
  if (v.startsWith('o')) return v.includes('7') ? 'dim7' : 'dim';
  if (v.startsWith('-')) {
    if (/^-7b5/.test(v)) return 'm7b5';
    if (/^-(7|9|11|13)/.test(v)) return 'm7';
    return 'min'; // -6, -69, -b6, -^7, -#5 … : minor triad is the common core
  }
  if (v.startsWith('^')) return 'maj7';
  if (/sus/.test(v)) return 'sus4';
  if (/^(7|9|11|13)/.test(v)) return '7';
  return 'maj'; // 6, 69, add9, 2
}

export function toChartChord(raw: RawChord, beat: number): ChartChord | null {
  const root = rootToPitchClass(raw.root);
  if (root === null) return null;
  const value = raw.quality.value ?? '';
  const family = qualityToFamily(raw.quality.kind, value);
  const suffix = raw.quality.kind === 'custom' ? prettifyCustomSuffix(value) : (KIND_SUFFIX[raw.quality.kind] ?? '');
  const chord = createChord(root, family);
  const tensions = tensionIntervals(raw.quality.kind === 'custom' ? value : raw.quality.kind === 'dominant7' ? '7' : '', family)
    .map((i) => (root + i) % 12)
    .filter((pc) => !chord.pitchClasses.includes(pc));
  const accidental = raw.root.accidental === 'flat' || raw.root.accidental === 'sharp' ? raw.root.accidental : 'natural';
  return { chord, suffix, tensions, beat, rootSpelling: { letter: raw.root.note, accidental } };
}

const FR_LETTERS: Record<string, string> = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

/** Chord name exactly as written in the chart, in the chosen notation: "D♭maj7", "Ré♭maj7". */
export function formatChartChord(item: ChartChord, notation: 'intl' | 'fr'): string {
  const { letter, accidental } = item.rootSpelling;
  const name = notation === 'fr' ? (FR_LETTERS[letter] ?? letter) : letter;
  const acc = accidental === 'flat' ? '♭' : accidental === 'sharp' ? '♯' : '';
  return `${name}${acc}${item.suffix}`;
}

/**
 * Expands `open_repeat … close_repeat` with optional 1st/2nd endings into a
 * linear list of bars (the form as actually played once).
 */
export function expandRepeats(bars: RawBar[]): RawBar[] {
  const out: RawBar[] = [];
  let blockStart = 0;
  let firstEndingStart: number | null = null;
  const repeated = new Set<number>();
  let i = 0;
  let guard = 0;
  while (i < bars.length && guard++ < 10_000) {
    const bar = bars[i];
    if (bar.start === 'open_repeat') {
      blockStart = i;
      firstEndingStart = null;
    }
    if (String(bar.ending) === '1') firstEndingStart = i;
    out.push(bar);
    if (bar.end === 'close_repeat' && !repeated.has(i)) {
      repeated.add(i);
      // Second pass: replay the block up to (not including) the 1st ending.
      const stop = firstEndingStart ?? i + 1;
      for (let j = blockStart; j < stop; j += 1) out.push(bars[j]);
      firstEndingStart = null;
    }
    i += 1;
  }
  return out;
}

const JUMP_SYMBOLS = new Set([
  'coda', 'segno', 'da_capo_al_coda', 'da_capo_al_fine', 'dal_segno_al_coda', 'dal_segno_al_fine',
  'da_capo_al_1st_end', 'da_capo_al_2nd_end', 'da_capo_al_3rd_end', 'dal_segno_al_2nd_end', 'dal_segno_al_3rd_end',
]);

export function chartFromParsed(raw: RawChart): ChordChart {
  const beatsPerBar = raw.time_signature?.numerator ?? 4;
  const flat = raw.sections.flatMap((s) => s.bars);
  const unsupportedJumps = [...new Set(flat.map((b) => b.symbol).filter((s): s is string => !!s && JUMP_SYMBOLS.has(s)))];
  const linear = expandRepeats(flat);

  const bars: ChartChord[][] = [];
  let previous: ChartChord[] = [];
  for (const bar of linear) {
    if (bar.repeat_previous) {
      // "%" : a single held chord simply continues; a bar with several
      // changes is played again.
      const single = previous.length === 1 && previous[0].beat === 1;
      bars.push(single ? [] : previous.map((c) => ({ ...c })));
      continue;
    }
    const main = bar.chords.filter((c) => c.chord && c.size !== 'small');
    // The parser sometimes reports the same beat for every chord of a bar:
    // spread them evenly in that case (2 chords in 4/4 → beats 1 and 3).
    const positions = main.map((c) => c.position?.beat ?? 1);
    const distinct = new Set(positions).size === positions.length;
    const chords = main
      .map((c, idx) =>
        toChartChord(
          c.chord as RawChord,
          distinct ? positions[idx] : 1 + Math.round((idx * beatsPerBar) / main.length),
        ),
      )
      .filter((c): c is ChartChord => c !== null)
      .sort((a, b) => a.beat - b.beat);
    bars.push(chords);
    if (chords.length > 0) previous = chords;
  }
  return { title: raw.title, beatsPerBar, bars, unsupportedJumps };
}

/** Linear chord list (one entry per chord change), used by simple practice modes. */
export function chartChordSequence(chart: ChordChart): ChordDefinition[] {
  const out: ChordDefinition[] = [];
  for (const c of chart.bars.flat()) {
    if (out.at(-1)?.id !== c.chord.id) out.push(c.chord);
  }
  return out;
}
