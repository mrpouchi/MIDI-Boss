import { describe, expect, it } from 'vitest';
import { writeMidi } from 'midi-file';
import { MelodyScorer, extractMelody, findMelodyChannel, summarizeMelody } from '../melody';

const TPB = 480;

/** A two-track file: "Melodie" on channel 8, "Bass" on channel 10. Notes: [beat, midi, beats]. */
function file(melody: [number, number, number][], name = 'Melodie') {
  const track = (channel: number, trackName: string, notes: [number, number, number][]) => {
    const events: { tick: number; e: Record<string, unknown> }[] = [];
    for (const [beat, midi, len] of notes) {
      events.push({ tick: beat * TPB, e: { type: 'noteOn', channel, noteNumber: midi, velocity: 90 } });
      events.push({ tick: (beat + len) * TPB, e: { type: 'noteOff', channel, noteNumber: midi, velocity: 0 } });
    }
    events.sort((a, b) => a.tick - b.tick);
    let last = 0;
    return [
      { deltaTime: 0, meta: true, type: 'trackName', text: trackName },
      ...events.map(({ tick, e }) => {
        const out = { deltaTime: tick - last, ...e };
        last = tick;
        return out;
      }),
      { deltaTime: 0, meta: true, type: 'endOfTrack' },
    ];
  };
  return new Uint8Array(
    writeMidi({
      header: { format: 1, numTracks: 2, ticksPerBeat: TPB },
      tracks: [track(8, name, melody), track(10, 'Bass', [[0, 36, 4]])],
    } as never),
  ).buffer;
}

describe('melody track', () => {
  it('is found by its name, accents and case ignored', () => {
    expect(findMelodyChannel(file([[0, 72, 1]]))).toBe(8);
    expect(findMelodyChannel(file([[0, 72, 1]], 'Mélodie'))).toBe(8);
    expect(findMelodyChannel(file([[0, 72, 1]], 'Voice'))).toBe(8);
    expect(findMelodyChannel(file([[0, 72, 1]], 'Guitar'))).toBeNull();
  });

  it('is laid out in song time at the chosen tempo, inside the form only', () => {
    // 60 BPM: one beat = 1 s. Form from 4 s to 12 s.
    const notes = extractMelody(file([[3, 60, 1], [4, 72, 1], [5, 71, 0.5], [11.5, 69, 2], [12, 67, 1]]), 8, { bpm: 60, fromMs: 4000, toMs: 12000 });
    expect(notes.map((n) => [n.midi, n.startMs, n.durationMs])).toEqual([[72, 4000, 1000], [71, 5000, 500], [69, 11500, 2000]]);
    expect(notes.map((n) => n.index)).toEqual([0, 1, 2]);
  });

  it('keeps the top note when the track strikes several at once', () => {
    const notes = extractMelody(file([[0, 64, 1], [0, 72, 1], [1, 67, 1]]), 8, { bpm: 120, fromMs: 0, toMs: 10000 });
    expect(notes.map((n) => n.midi)).toEqual([72, 67]);
  });
});

describe('melody scorer', () => {
  const notes = [
    { index: 0, midi: 72, startMs: 1000, durationMs: 400 },
    { index: 1, midi: 71, startMs: 1500, durationMs: 400 },
    { index: 2, midi: 72, startMs: 2000, durationMs: 400 },
  ];
  const opts = { onTimeMs: 150, windowMs: 300 };

  it('counts the right pitch in any octave, near its start', () => {
    const s = new MelodyScorer(notes, opts);
    expect(s.noteOn(60, 1040)).toBe(0); // C an octave lower, 40 ms late
    expect(s.noteOn(83, 1700)).toBe(1); // B an octave higher, 200 ms late
    s.advance(10_000);
    expect(s.results.map((r) => [r.verdict, r.offsetMs])).toEqual([['on-time', 40], ['late', 200], ['missed', null]]);
  });

  it('gives a repeated pitch to the nearest note still waiting', () => {
    const s = new MelodyScorer(notes, opts);
    expect(s.noteOn(72, 1950)).toBe(2);
    expect(s.noteOn(72, 1010)).toBe(0);
    s.advance(10_000);
    expect(s.results.map((r) => r.verdict)).toEqual(['on-time', 'missed', 'on-time']);
  });

  it('counts wrong pitches near the tune, not before it starts', () => {
    const s = new MelodyScorer(notes, opts);
    expect(s.noteOn(61, 200)).toBeNull();
    expect(s.noteOn(61, 1200)).toBeNull();
    expect(s.wrongNotes).toBe(1);
  });

  it('closes each note once its window is over, in order', () => {
    const s = new MelodyScorer(notes, opts);
    expect(s.advance(1299)).toEqual([]);
    expect(s.advance(1301).map((r) => r.index)).toEqual([0]);
    expect(s.advance(5000).map((r) => r.index)).toEqual([1, 2]);
    const summary = summarizeMelody(s.results, s.wrongNotes);
    expect(summary).toMatchObject({ total: 3, found: 0, missed: 3, noteAccuracy: 0, timingAccuracy: 0, meanOffsetMs: null });
  });
});
