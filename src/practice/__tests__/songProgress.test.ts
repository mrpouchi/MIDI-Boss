import { describe, expect, it } from 'vitest';
import { SONG_PATH, resolveTempo } from '../../content/songPath';
import { PlayAlongRun } from '../../storage/types';
import { buildSongPath, currentSong, runMeetsObjective } from '../songProgress';

const run = (songTitle: string, step: PlayAlongRun['step'], bpm: number, extra: Partial<PlayAlongRun> = {}): PlayAlongRun => ({
  id: Math.random().toString(36), date: '', songTitle, step, bpm, originalBpm: 240,
  total: 30, found: 28, onTime: 25, noteAccuracy: 0.93, timingAccuracy: 0.85, meanOffsetMs: 30, completed: true, ...extra,
});

const soWhat = SONG_PATH[0].songs[0];

describe('resolveTempo', () => {
  it('caps slow and medium tempos for very fast tunes', () => {
    expect(resolveTempo('slow', 240)).toBe(100);
    expect(resolveTempo('medium', 240)).toBe(140);
    expect(resolveTempo('original', 240)).toBe(240);
    expect(resolveTempo('slow', 120)).toBe(72);
  });
});

describe('runMeetsObjective', () => {
  const [roots, , triads] = soWhat.objectives;
  it('needs a complete run of this song, fast enough, accurate enough', () => {
    expect(runMeetsObjective(run('So What', 'root', 100), soWhat, roots)).toBe(true);
    expect(runMeetsObjective(run('So What', 'root', 100, { completed: false }), soWhat, roots)).toBe(false);
    expect(runMeetsObjective(run('Blue Bossa', 'root', 100), soWhat, roots)).toBe(false);
    expect(runMeetsObjective(run('So What', 'root', 90), soWhat, roots)).toBe(false);
    expect(runMeetsObjective(run('So What', 'root', 100, { timingAccuracy: 0.4 }), soWhat, roots)).toBe(false);
  });
  it('counts a harder step for easier objectives, never the reverse', () => {
    expect(runMeetsObjective(run('So What', 'full', 140), soWhat, roots)).toBe(true);
    expect(runMeetsObjective(run('So What', 'root', 140), soWhat, triads)).toBe(false);
  });
  it('matches titles with or without "The"', () => {
    const ipanema = SONG_PATH[4].songs[1];
    expect(runMeetsObjective(run('The Girl From Ipanema', 'root', 100, { originalBpm: 140 }), ipanema, ipanema.objectives[0])).toBe(true);
  });
});

describe('buildSongPath', () => {
  it('starts with only the first objective of the first song open', () => {
    const views = buildSongPath(SONG_PATH, []);
    expect(views[0].objectives.map((o) => o.state)).toEqual(['current', 'locked', 'locked', 'locked', 'locked']);
    expect(views[1].unlocked).toBe(false);
    expect(currentSong(views)?.song.id).toBe('so-what');
  });

  it('unlocks the next song after two objectives, and moves the current marker', () => {
    const views = buildSongPath(SONG_PATH, [run('So What', 'root', 100), run('So What', 'root-5th', 100)]);
    expect(views[0].doneCount).toBe(2);
    expect(views[0].objectives[2].state).toBe('current');
    expect(views[1].unlocked).toBe(true);
    expect(views[1].objectives[0].state).toBe('open');
    expect(views[2].unlocked).toBe(false);
  });
});
