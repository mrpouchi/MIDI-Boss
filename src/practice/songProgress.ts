import { songTitleKey } from '../content/localSongs';
import { PathSong, PathUnit, SongObjective, resolveTempo } from '../content/songPath';
import { VOICING_STEP_ORDER } from '../music/chords';
import { PlayAlongRun } from '../storage/types';

/**
 * Progress through the song-centred path, computed only from recorded
 * play-along runs. Pure and unit-tested.
 */

export type ObjectiveState = 'done' | 'current' | 'open' | 'locked';

export interface ObjectiveView {
  objective: SongObjective;
  state: ObjectiveState;
}

export interface SongView {
  song: PathSong;
  unit: PathUnit;
  unlocked: boolean;
  doneCount: number;
  objectives: ObjectiveView[];
}

/** Previous song objectives needed to unlock the next song (to validate with the user). */
export const OBJECTIVES_TO_UNLOCK_NEXT_SONG = 2;

const stepRank = (step: string) => VOICING_STEP_ORDER.indexOf(step as (typeof VOICING_STEP_ORDER)[number]);

/**
 * A run at `played` counts for an objective at `required` when it plays at least
 * those notes. Guide tones (3 · 7) leave out the root and fifth: they only
 * count for themselves, and the earlier steps never count for them. Same for
 * the melody, which is not a chord step at all.
 */
function stepCovers(played: string, required: string): boolean {
  // Guide tones and the melody only count for themselves.
  if (played === 'guides' || required === 'guides' || played === 'melody' || required === 'melody') return played === required;
  return stepRank(played) >= stepRank(required);
}

/** A complete run at this step or harder, at least this fast, above both thresholds. */
export function runMeetsObjective(run: PlayAlongRun, song: PathSong, objective: SongObjective): boolean {
  if (!run.completed) return false;
  if (songTitleKey(run.songTitle) !== songTitleKey(song.title)) return false;
  if (!stepCovers(run.step, objective.step)) return false;
  if (run.noteAccuracy < objective.minNotes || run.timingAccuracy < objective.minTiming) return false;
  if (run.originalBpm === undefined) return objective.tempo === 'slow';
  return run.bpm >= resolveTempo(objective.tempo, run.originalBpm) - 1;
}

/** `unlockAll` (admin profile): every song and objective is open; progress still shows. */
export function buildSongPath(units: PathUnit[], runs: PlayAlongRun[], unlockAll = false): SongView[] {
  const views: SongView[] = [];
  let previousDone = OBJECTIVES_TO_UNLOCK_NEXT_SONG;
  for (const unit of units) {
    for (const song of unit.songs) {
      const unlocked = unlockAll || previousDone >= OBJECTIVES_TO_UNLOCK_NEXT_SONG;
      const done = song.objectives.map((o) => runs.some((r) => runMeetsObjective(r, song, o)));
      let open = unlocked;
      const objectives = song.objectives.map((objective, i): ObjectiveView => {
        if (done[i]) return { objective, state: 'done' };
        if (open) {
          open = unlockAll;
          return { objective, state: 'open' };
        }
        return { objective, state: 'locked' };
      });
      const doneCount = done.filter(Boolean).length;
      views.push({ song, unit, unlocked, doneCount, objectives });
      previousDone = doneCount;
    }
  }
  // The single "current" objective: the first open one along the path.
  for (const v of views) {
    const firstOpen = v.objectives.find((o) => o.state === 'open');
    if (firstOpen) {
      firstOpen.state = 'current';
      break;
    }
  }
  return views;
}

export function currentSong(views: SongView[]): SongView | undefined {
  return views.find((v) => v.objectives.some((o) => o.state === 'current'));
}
