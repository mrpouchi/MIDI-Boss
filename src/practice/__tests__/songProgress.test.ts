import { describe, expect, it } from 'vitest';
import { SONG_PATH, resolveTempo } from '../../content/songPath';
import { PlayAlongRun } from '../../storage/types';
import { buildSongPath, currentSong, runMeetsObjective } from '../songProgress';

const run = (songTitle: string, step: PlayAlongRun['step'], bpm: number, extra: Partial<PlayAlongRun> = {}): PlayAlongRun => ({
  id: Math.random().toString(36), date: '', songTitle, step, bpm, originalBpm: 240,
  total: 30, found: 28, onTime: 25, noteAccuracy: 0.93, timingAccuracy: 0.85, meanOffsetMs: 30, completed: true, ...extra,
});

const firstSong = SONG_PATH[0].songs[0];

describe('resolveTempo', () => {
  it('caps slow and medium tempos for very fast tunes', () => {
    expect(resolveTempo('slow', 240)).toBe(100);
    expect(resolveTempo('medium', 240)).toBe(140);
    expect(resolveTempo('original', 240)).toBe(240);
    expect(resolveTempo('slow', 120)).toBe(72);
  });
});

describe('runMeetsObjective', () => {
  const [roots, , triads] = firstSong.objectives;
  it('needs a complete run of this song, fast enough, accurate enough', () => {
    expect(runMeetsObjective(run('Cantaloupe Island', 'root', 100), firstSong, roots)).toBe(true);
    expect(runMeetsObjective(run('Cantaloupe Island', 'root', 100, { completed: false }), firstSong, roots)).toBe(false);
    expect(runMeetsObjective(run('Blue Bossa', 'root', 100), firstSong, roots)).toBe(false);
    expect(runMeetsObjective(run('Cantaloupe Island', 'root', 90), firstSong, roots)).toBe(false);
    expect(runMeetsObjective(run('Cantaloupe Island', 'root', 100, { timingAccuracy: 0.4 }), firstSong, roots)).toBe(false);
  });
  it('counts a harder step for easier objectives, never the reverse', () => {
    expect(runMeetsObjective(run('Cantaloupe Island', 'full', 140), firstSong, roots)).toBe(true);
    expect(runMeetsObjective(run('Cantaloupe Island', 'root', 140), firstSong, triads)).toBe(false);
  });
  it('matches titles with or without "The"', () => {
    const ipanema = SONG_PATH.flatMap((u) => u.songs).find((x) => x.id === 'girl-from-ipanema')!;
    expect(runMeetsObjective(run('The Girl From Ipanema', 'root', 100, { originalBpm: 140 }), ipanema, ipanema.objectives[0])).toBe(true);
  });
});

describe('buildSongPath', () => {
  it('starts with only the first objective of the first song open', () => {
    const views = buildSongPath(SONG_PATH, []);
    expect(views[0].objectives.map((o) => o.state)).toEqual(['current', 'locked', 'locked', 'locked', 'locked']);
    expect(views[1].unlocked).toBe(false);
    expect(currentSong(views)?.song.id).toBe('cantaloupe-island');
  });

  it('unlocks the next song after two objectives, and moves the current marker', () => {
    const views = buildSongPath(SONG_PATH, [run('Cantaloupe Island', 'root', 100), run('Cantaloupe Island', 'root-5th', 100)]);
    expect(views[0].doneCount).toBe(2);
    expect(views[0].objectives[2].state).toBe('current');
    expect(views[1].unlocked).toBe(true);
    expect(views[1].objectives[0].state).toBe('open');
    expect(views[2].unlocked).toBe(false);
  });
});

describe('buildSongPath for an admin profile', () => {
  it('opens every song and every objective, keeping what is done', () => {
    const views = buildSongPath(SONG_PATH, [run('Cantaloupe Island', 'root', 100)], true);
    expect(views.every((v) => v.unlocked)).toBe(true);
    expect(views.flatMap((v) => v.objectives).some((o) => o.state === 'locked')).toBe(false);
    expect(views[0].objectives[0].state).toBe('done');
    expect(views[0].objectives[1].state).toBe('current');
  });
});
