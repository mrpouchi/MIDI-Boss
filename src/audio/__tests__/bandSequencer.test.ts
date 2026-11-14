import { writeMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { buildNoteSchedule } from '../bandSequencer';

function file(): ArrayBuffer {
  return new Uint8Array(
    writeMidi({
      header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
      tracks: [
        [
          { deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 500000 }, // 120 BPM: 0.5 s per beat
          { deltaTime: 0, type: 'programChange', channel: 1, programNumber: 32 },
          { deltaTime: 960, type: 'noteOn', channel: 1, noteNumber: 41, velocity: 90 }, // beat 3 → 1.0 s
          { deltaTime: 480, type: 'noteOff', channel: 1, noteNumber: 41, velocity: 0 }, // 0.5 s long
          { deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: 1000000 }, // 60 BPM from 1.5 s
          { deltaTime: 480, type: 'noteOn', channel: 1, noteNumber: 43, velocity: 0 }, // a note-off written as velocity 0
          { deltaTime: 0, meta: true, type: 'endOfTrack' },
        ],
        [
          { deltaTime: 0, type: 'noteOn', channel: 9, noteNumber: 51, velocity: 80 },
          { deltaTime: 10, type: 'noteOff', channel: 9, noteNumber: 51, velocity: 0 },
          { deltaTime: 1910, type: 'noteOn', channel: 9, noteNumber: 51, velocity: 80 }, // tick 1920: 1440 ticks at 120 BPM + 480 at 60 BPM
          { deltaTime: 0, meta: true, type: 'endOfTrack' },
        ],
      ],
    }),
  ).buffer;
}

describe('buildNoteSchedule', () => {
  it('places every note at its exact time in seconds, following tempo changes', () => {
    const s = buildNoteSchedule(file());
    const bass = s.notes.filter((n) => n.channel === 1);
    expect(bass).toHaveLength(1);
    expect(bass[0].time).toBeCloseTo(1.0);
    expect(bass[0].duration).toBeCloseTo(0.5);
    const ride = s.notes.filter((n) => n.channel === 9).map((n) => n.time);
    expect(ride[0]).toBeCloseTo(0);
    expect(ride[1]).toBeCloseTo(2.5); // 1.5 s at 120 BPM, then one beat at 60 BPM
  });

  it('keeps drums ringing (one-shot) and records each channel program', () => {
    const s = buildNoteSchedule(file());
    expect(s.notes.find((n) => n.channel === 9)!.duration).toBeGreaterThan(1);
    expect(s.programs.get(1)).toBe(32);
    expect(s.programs.get(9)).toBe(0);
  });

  it('sorts notes by time', () => {
    const times = buildNoteSchedule(file()).notes.map((n) => n.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
