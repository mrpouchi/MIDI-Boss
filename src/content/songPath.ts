import { VoicingStep } from '../music/chords';

/**
 * The learning path is built around songs (pedagogical DATA, no logic).
 * Each song comes back with richer objectives; units are cumulative.
 * Chords come from the user's iReal library, sound from their MIDI export
 * in `local-songs/` (matched by title).
 */

export type TempoLevel = 'slow' | 'medium' | 'original';

export interface SongObjective {
  id: string;
  step: VoicingStep;
  tempo: TempoLevel;
  label: string;
  hint: string;
  /** Thresholds on a complete run with the band. */
  minNotes: number;
  minTiming: number;
}

export interface PathSong {
  id: string;
  /** Title as in iReal Pro (also used to find the MIDI file). */
  title: string;
  /** What this song brings, in one sentence. */
  focus: string;
  /** New notions introduced here (shown on the unit card). */
  introduces: string[];
  objectives: SongObjective[];
}

export interface PathUnit {
  id: string;
  title: string;
  goal: string;
  songs: PathSong[];
}

/**
 * Tempo actually used for a level: capped so a 240 BPM tune (So What) starts
 * at a playable speed. Decision to validate with the user.
 */
export function resolveTempo(level: TempoLevel, originalBpm: number): number {
  if (level === 'original') return Math.round(originalBpm);
  if (level === 'medium') return Math.round(Math.min(originalBpm * 0.8, 140));
  return Math.round(Math.min(originalBpm * 0.6, 100));
}

export const TEMPO_LABEL: Record<TempoLevel, string> = {
  slow: 'tempo lent',
  medium: 'tempo moyen',
  original: 'tempo original',
};

/** The standard ladder: roots → fifths → triads → sevenths → original tempo. */
function ladder(songId: string, opts: { triadHint?: string } = {}): SongObjective[] {
  return [
    {
      id: `${songId}:roots`,
      step: 'root',
      tempo: 'slow',
      label: 'Les fondamentales',
      hint: 'Une seule note par accord : vous suivez déjà toute la grille.',
      minNotes: 0.8,
      minTiming: 0.6,
    },
    {
      id: `${songId}:fifths`,
      step: 'root-5th',
      tempo: 'slow',
      label: 'Fondamentale + quinte',
      hint: 'Deux doigts : l’ossature de chaque accord.',
      minNotes: 0.8,
      minTiming: 0.65,
    },
    {
      id: `${songId}:triads`,
      step: 'triad',
      tempo: 'medium',
      label: 'La tierce',
      hint: opts.triadHint ?? 'La tierce dit si l’accord est majeur ou mineur.',
      minNotes: 0.8,
      minTiming: 0.7,
    },
    {
      id: `${songId}:sevenths`,
      step: 'full',
      tempo: 'medium',
      label: 'La septième',
      hint: 'Les accords complets : la couleur du jazz.',
      minNotes: 0.8,
      minTiming: 0.7,
    },
    {
      id: `${songId}:original`,
      step: 'full',
      tempo: 'original',
      label: 'Au tempo original',
      hint: 'Le morceau tel qu’il se joue, avec l’orchestre.',
      minNotes: 0.85,
      minTiming: 0.8,
    },
  ];
}

function song(id: string, title: string, focus: string, introduces: string[], triadHint?: string): PathSong {
  return { id, title, focus, introduces, objectives: ladder(id, { triadHint }) };
}

export const SONG_PATH: PathUnit[] = [
  {
    id: 'first-sounds',
    title: 'Premiers sons',
    goal: 'Trouver ses repères sur le clavier avec des morceaux à très peu d’accords.',
    songs: [
      // So What est retiré pour l'instant : dans l'enregistrement, les accords
      // tombent avant le premier temps (anticipations), une notion à enseigner
      // plus tard. À remettre avec une leçon dédiée.
      // song('so-what', 'So What', 'Deux accords à un demi-ton l’un de l’autre : premières touches noires.', ['Touches noires', 'Demi-ton', 'Accord m7'], 'Deux accords mineurs : écoutez la tierce mineure.'),
      song('cantaloupe-island', 'Cantaloupe Island', 'Trois accords, un groove lent : la couleur m7 contre la couleur 7.', ['Accord 7 (dominante)', 'Changer d’accord en rythme']),
      song('maiden-voyage', 'Maiden Voyage', 'Des accords suspendus qui flottent : tenir et poser.', ['Accords sus4']),
    ],
  },
  {
    id: 'latin-groove',
    title: 'Le groove latin',
    goal: 'Un groove latin lent et une grille de 24 mesures : suivre une vraie forme AAB.',
    songs: [
      song('song-for-my-father', 'Song For My Father', 'Groove latin, cinq accords, un sus.', ['Groove latin', 'Forme AAB']),
    ],
  },
  {
    id: 'blues',
    title: 'Le blues',
    goal: 'La forme de 12 mesures, la plus jouée du jazz.',
    songs: [
      song('blue-monk', 'Blue Monk', 'Blues en si bémol, trois accords de dominante.', ['Forme blues 12 mesures', 'I – IV – V']),
      song('tenor-madness', 'Tenor Madness', 'Le même blues avec un premier II-V.', ['Premier II-V']),
      song('mr-pc', 'Mr. P.C.', 'Le blues mineur.', ['Blues mineur']),
    ],
  },
  {
    id: 'latin-minor',
    title: 'Couleurs mineures',
    goal: 'Tonalités mineures, accord demi-diminué et valse.',
    songs: [
      song('blue-bossa', 'Blue Bossa', 'II-V mineur et modulation en ré bémol.', ['m7♭5', 'II-V mineur', 'Modulation']),
      song('footprints', 'Footprints', 'Une valse mineure aux accords altérés.', ['Mesure à 3 temps', 'Accords altérés']),
    ],
  },
  {
    id: 'two-five-one',
    title: 'Le II-V-I',
    goal: 'La cadence centrale du jazz, en majeur et en mineur.',
    songs: [
      song('a-train', 'Take The A Train', 'Des II-V très clairs.', ['II-V-I majeur']),
      song('autumn-leaves', 'Autumn Leaves', 'Le morceau-école du II-V-I, majeur et mineur.', ['II-V-I mineur', 'Forme AABC']),
      song('summertime', 'Summertime', 'Ballade mineure pleine de II-V.', ['Ballade']),
    ],
  },
  {
    id: 'standards',
    title: 'Les standards',
    goal: 'Enchaîner, moduler, tenir des grilles longues.',
    songs: [
      song('fly-me-to-the-moon', 'Fly Me To The Moon', 'Le cycle des quintes.', ['Cycle des quintes']),
      song('girl-from-ipanema', 'Girl From Ipanema, The', 'Bossa nova au pont qui module.', ['Pont modulant', 'Bossa nova']),
      song('satin-doll', 'Satin Doll', 'Des II-V enchaînés à grande vitesse.', ['II-V en chaîne']),
      song('all-the-things', 'All The Things You Are', 'Le boss final : modulations partout.', ['Modulations']),
    ],
  },
];

export const ALL_PATH_SONGS: PathSong[] = SONG_PATH.flatMap((u) => u.songs);
