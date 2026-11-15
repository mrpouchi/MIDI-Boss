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
    expect(views[0].objectives.map((o) => o.state)).toEqual(['current', 'locked', 'locked', 'locked', 'locked', 'locked']);
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

describe('guide-tone objectives', () => {
  const objective = (id: string) => firstSong.objectives.find((o) => o.id === `${firstSong.id}:${id}`)!;

  it('only counts guide-tone runs for the guide-tone objective, and not the other way round', () => {
    const bpm = resolveTempo('medium', 240);
    expect(runMeetsObjective(run('Cantaloupe Island', 'guides', bpm), firstSong, objective('guides'))).toBe(true);
    expect(runMeetsObjective(run('Cantaloupe Island', 'full', bpm), firstSong, objective('guides'))).toBe(false);
    expect(runMeetsObjective(run('Cantaloupe Island', 'guides', bpm), firstSong, objective('sevenths'))).toBe(false);
    expect(runMeetsObjective(run('Cantaloupe Island', 'guides', bpm), firstSong, objective('roots'))).toBe(false);
  });

  it('skips guide tones on a song made of sus chords', () => {
    const maiden = SONG_PATH.flatMap((u) => u.songs).find((s) => s.id === 'maiden-voyage')!;
    expect(maiden.objectives.some((o) => o.step === 'guides')).toBe(false);
  });
});

describe('melody objectives', () => {
  const fly = SONG_PATH.flatMap((u) => u.songs).find((x) => x.id === 'fly-me-to-the-moon')!;
  const melody = fly.objectives.filter((o) => o.step === 'melody');
  const chords = fly.objectives.filter((o) => o.step !== 'melody');
  const fly120 = (step: PlayAlongRun['step'], bpm: number) => run('Fly Me To The Moon', step, bpm, { originalBpm: 120 });

  it('come after every chord objective, slow then original tempo', () => {
    expect(melody.map((o) => o.tempo)).toEqual(['slow', 'original']);
    expect(fly.objectives.slice(-2)).toEqual(melody);
    // Songs without a melody track get none.
    expect(SONG_PATH[0].songs[0].objectives.some((o) => o.step === 'melody')).toBe(false);
  });

  it('are met by melody runs only, and melody runs meet no chord objective', () => {
    expect(runMeetsObjective(fly120('melody', 72), fly, melody[0])).toBe(true);
    expect(runMeetsObjective(fly120('full', 120), fly, melody[0])).toBe(false);
    expect(chords.some((o) => runMeetsObjective(fly120('melody', 120), fly, o))).toBe(false);
  });

  it('open once the last chord objective is done', () => {
    const view = (runs: PlayAlongRun[]) => buildSongPath(SONG_PATH, runs, true).find((v) => v.song.id === 'fly-me-to-the-moon')!;
    // Admin: everything open; the melody states follow the runs.
    expect(view([]).objectives.at(-2)!.state).not.toBe('done');
    expect(view([fly120('melody', 72)]).objectives.at(-2)!.state).toBe('done');
  });
});
