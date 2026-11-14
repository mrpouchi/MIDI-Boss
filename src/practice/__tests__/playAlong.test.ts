import { describe, expect, it } from 'vitest';
import { ChordChart, toChartChord } from '../../music/chart';
import { PlayAlongScorer, buildTimeline, chordIndexAt, summarize } from '../playAlong';

const c = (note: string, kind: string, beat = 1, value?: string, accidental = 'natural') =>
  toChartChord({ root: { note, accidental }, quality: value ? { kind, value } : { kind } }, beat)!;

// Cm7 | % | Fm7 | Dm7b5  G7b9   at 120 bpm: beat = 500 ms, bar = 2000 ms
const chart: ChordChart = {
  title: 'test',
  beatsPerBar: 4,
  bars: [[c('C', 'minor7')], [], [c('F', 'minor7')], [c('D', 'half_diminished'), c('G', 'custom', 3, '7b9')]],
  unsupportedJumps: [],
};
const tl = buildTimeline(chart, { bpm: 120, countInBars: 1, choruses: 1 });
// starts: Cm7 2000, Fm7 6000, Dm7b5 8000, G7 9000, end 10000
const CM7 = [60, 63, 67, 70];
const FM7 = [53, 56, 60, 63];
const DM7B5 = [50, 53, 56, 60];
const G7 = [55, 59, 62, 65];

function play(scorer: PlayAlongScorer, notes: number[], at: number, holdMs = 400) {
  notes.forEach((n, k) => scorer.noteOn(n, at + k * 10));
  notes.forEach((n) => scorer.noteOff(n));
  void holdMs;
}

describe('timeline', () => {
  it('places one target per bar after the count-in', () => {
    // Cm7 | % (Cm7 again) | Fm7 | Dm7b5 G7b9
    expect(tl.chords.map((x) => x.startMs)).toEqual([2000, 4000, 6000, 8000, 9000]);
    expect(tl.chords[1].repeat).toBe(true);
    expect(tl.chords[0].endMs).toBe(4000);
    expect(tl.endMs).toBe(10000);
    expect(chordIndexAt(tl, 1500)).toBe(-1);
    expect(chordIndexAt(tl, 8999)).toBe(3);
  });

  it('asks for a new attack on every bar, "%" bars included', () => {
    const modal: ChordChart = {
      title: 'modal',
      beatsPerBar: 4,
      bars: [[c('D', 'minor7')], [], [c('D', 'minor7')], [c('E', 'minor7', 1, undefined, 'flat')]],
      unsupportedJumps: [],
    };
    const t = buildTimeline(modal, { bpm: 120, countInBars: 0, choruses: 1 });
    expect(t.chords.map((x) => [x.item.chord.id, x.startMs, x.repeat])).toEqual([
      ['2:m7', 0, false],
      ['2:m7', 2000, true],
      ['2:m7', 4000, true],
      ['3:m7', 6000, false],
    ]);
  });

  it('repeats the form for each chorus', () => {
    const two = buildTimeline(chart, { bpm: 120, countInBars: 1, choruses: 2 });
    expect(two.chords).toHaveLength(10);
    expect(two.chords[5].startMs).toBe(10000);
    expect(two.chords[5].chorus).toBe(1);
  });
});

describe('PlayAlongScorer', () => {
  const opts = { step: 'full' as const, onTimeMs: 150, anticipationMs: 250 };
  // Targets: Cm7 @2000 · Cm7 again @4000 · Fm7 @6000 · Dm7♭5 @8000 · G7♭9 @9000

  it('judges on time, late, anticipated and missed attacks', () => {
    const s = new PlayAlongScorer(tl, opts);
    play(s, CM7, 2040); // +40..+70 ms → on time
    play(s, CM7, 4020); // the "%" bar, struck again → on time
    play(s, FM7, 6400); // +430 → late
    play(s, DM7B5, 7800); // -200 → anticipated (allowed)
    // G7 never played → missed
    s.advance(10000);
    expect(s.results.map((r) => r.verdict)).toEqual(['on-time', 'on-time', 'late', 'anticipated', 'missed']);
    expect(s.results[0].offsetMs).toBe(70); // completed by the 4th note
  });

  it('judges a passage again after seeking back, and skips chords jumped over', () => {
    const s = new PlayAlongScorer(tl, opts);
    s.advance(6000); // Cm7 and its repeat missed
    expect(s.results.map((r) => r.verdict)).toEqual(['missed', 'missed']);
    s.seek(0); // back to the start of the chart
    expect(s.results).toHaveLength(0);
    play(s, CM7, 2040);
    s.seek(2); // jump forward to Fm7: the repeat bar is not judged
    play(s, FM7, 6020);
    s.advance(8000 - 250);
    expect(s.results.map((r) => [r.index, r.verdict])).toEqual([[2, 'on-time']]);
  });

  it('counts a bar as missed when the chord is only held, not played again', () => {
    const s = new PlayAlongScorer(tl, opts);
    CM7.forEach((n, k) => s.noteOn(n, 2000 + k)); // struck once, held through bar 2
    s.advance(6000);
    expect(s.results.map((r) => r.verdict)).toEqual(['on-time', 'missed']);
  });

  it('needs every note struck again on a repeated bar', () => {
    const s = new PlayAlongScorer(tl, opts);
    CM7.forEach((n, k) => s.noteOn(n, 2000 + k));
    s.noteOff(60);
    s.noteOn(60, 4000); // only C re-struck, the rest held
    s.advance(6000);
    expect(s.results[1].verdict).toBe('missed');
  });

  it('accepts written tensions but flags foreign notes', () => {
    const s = new PlayAlongScorer(tl, opts);
    play(s, DM7B5, 8000);
    play(s, [...G7, 56], 9000); // A♭ = ♭9 written in the chart → fine
    play(s, [61], 9100); // D♭ is not in G7♭9 → wrong
    s.advance(10000);
    expect(s.results[4].verdict).toBe('on-time');
    expect(s.results[4].wrongNote).toBe(true);
    expect(s.results[3].wrongNote).toBe(false);
  });

  it('lets common tones be held across a real chord change (voice leading)', () => {
    const s = new PlayAlongScorer(tl, opts);
    play(s, CM7, 2000);
    // Bar 2 (Cm7 again): strike it, then keep C and E♭ for Fm7.
    [60, 63, 67, 70].forEach((n, k) => s.noteOn(n, 4000 + k));
    s.noteOff(67);
    s.noteOff(70);
    s.noteOn(53, 6010);
    s.noteOn(56, 6020);
    s.advance(8000);
    expect(s.results.map((r) => r.verdict)).toEqual(['on-time', 'on-time', 'on-time']);
  });

  it('only needs the notes of the current step', () => {
    const s = new PlayAlongScorer(tl, { ...opts, step: 'root' });
    s.noteOn(36, 2000); // a low C is enough for Cm7 at the root step
    s.noteOff(36);
    s.noteOn(48, 4010); // and again on the next bar
    s.advance(6000);
    expect(s.results.map((r) => r.verdict)).toEqual(['on-time', 'on-time']);
  });

  it('ignores notes during the count-in and reports each target once', () => {
    const s = new PlayAlongScorer(tl, opts);
    play(s, CM7, 500); // count-in
    expect(s.advance(1000)).toEqual([]);
    expect(s.advance(10000)).toHaveLength(5);
    expect(s.advance(12000)).toEqual([]);
    expect(s.results[0].verdict).toBe('missed');
  });

  it('summarizes notes and timing separately', () => {
    const s = new PlayAlongScorer(tl, opts);
    play(s, CM7, 2000);
    play(s, CM7, 4000);
    play(s, FM7, 6500);
    play(s, DM7B5, 8020);
    s.advance(10000);
    const sum = summarize(tl, s.results);
    expect(sum.noteAccuracy).toBe(0.8);
    expect(sum.timingAccuracy).toBe(0.75);
    expect(sum.missed).toBe(1);
    expect(sum.weakChordIds[0]).toBeDefined();
  });
});
