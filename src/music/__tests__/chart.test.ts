import { describe, expect, it } from 'vitest';
import {
  RawBar,
  RawChord,
  chartChordSequence,
  chartFromParsed,
  expandRepeats,
  formatChartChord,
  prettifyCustomSuffix,
  qualityToFamily,
  toChartChord,
} from '../chart';

const ch = (note: string, kind: string, value?: string, accidental = 'natural'): RawChord => ({
  root: { note, accidental },
  quality: value === undefined ? { kind } : { kind, value },
});
const bar = (chords: RawChord[], extra: Partial<RawBar> = {}): RawBar => ({
  start: 'single',
  end: 'single',
  chords: chords.map((c) => ({ chord: c, position: { beat: 1, subdivision: 0 } })),
  ending: null,
  symbol: null,
  ...extra,
});

describe('qualities', () => {
  it('maps iReal qualities to checkable families', () => {
    expect(qualityToFamily('half_diminished')).toBe('m7b5');
    expect(qualityToFamily('diminished7')).toBe('dim7');
    expect(qualityToFamily('custom', '7b9')).toBe('7');
    expect(qualityToFamily('custom', '-6')).toBe('min');
    expect(qualityToFamily('custom', '-9')).toBe('m7');
    expect(qualityToFamily('custom', '^7#11')).toBe('maj7');
    expect(qualityToFamily('custom', '7sus')).toBe('sus4');
    expect(qualityToFamily('custom', 'h9')).toBe('m7b5');
    expect(qualityToFamily('custom', '69')).toBe('maj');
  });

  it('keeps the chart spelling of the root', () => {
    const dbMaj7 = toChartChord(ch('D', 'major7', undefined, 'flat'), 1)!;
    expect(formatChartChord(dbMaj7, 'intl')).toBe('D♭maj7');
    expect(formatChartChord(dbMaj7, 'fr')).toBe('Ré♭maj7');
  });

  it('keeps the written symbol for display', () => {
    expect(prettifyCustomSuffix('7b9')).toBe('7♭9');
    expect(prettifyCustomSuffix('^7#11')).toBe('maj7♯11');
    expect(prettifyCustomSuffix('-6')).toBe('m6');
  });

  it('accepts written tensions as colour tones', () => {
    const g7b9 = toChartChord(ch('G', 'custom', '7b9'), 1)!;
    expect(g7b9.chord.family).toBe('7');
    expect(g7b9.tensions).toContain(8); // A♭
    const cm7 = toChartChord(ch('C', 'minor7'), 1)!;
    expect(cm7.tensions).toEqual([2]); // D, the 9th
    const dm7b5 = toChartChord(ch('D', 'half_diminished'), 1)!;
    expect(dm7b5.suffix).toBe('m7♭5');
    expect(dm7b5.tensions).toEqual([]);
  });
});

describe('form', () => {
  it('expands repeats with 1st and 2nd endings', () => {
    const A = bar([ch('C', 'major')], { start: 'open_repeat' });
    const B = bar([ch('D', 'minor7')]);
    const E1 = bar([ch('G', 'dominant7')], { ending: '1', end: 'close_repeat' });
    const E2 = bar([ch('C', 'major7')], { ending: '2', end: 'final' });
    const out = expandRepeats([A, B, E1, E2]);
    expect(out).toEqual([A, B, E1, A, B, E2]);
  });

  it('expands a plain repeat twice', () => {
    const A = bar([ch('C', 'major')], { start: 'open_repeat' });
    const B = bar([ch('F', 'major')], { end: 'close_repeat' });
    expect(expandRepeats([A, B])).toEqual([A, B, A, B]);
  });

  it('treats "%" after a held chord as a continuation, and spreads chords sharing a beat', () => {
    const chart = chartFromParsed({
      title: 'Test',
      time_signature: { numerator: 4, denominator: 4 },
      sections: [
        {
          bars: [
            bar([ch('C', 'minor7')]),
            { ...bar([]), repeat_previous: true },
            bar([ch('D', 'half_diminished'), ch('G', 'custom', '7b9')]),
          ],
        },
      ],
    });
    expect(chart.bars[1]).toEqual([]);
    expect(chart.bars[2].map((c) => c.beat)).toEqual([1, 3]);
    expect(chartChordSequence(chart).map((c) => c.id)).toEqual(['0:m7', '2:m7b5', '7:7']);
  });

  it('reports jumps it does not expand yet', () => {
    const chart = chartFromParsed({
      title: 'T',
      sections: [{ bars: [bar([ch('C', 'major')], { symbol: 'da_capo_al_coda' })] }],
    });
    expect(chart.unsupportedJumps).toEqual(['da_capo_al_coda']);
  });
});
