/**
 * The band's sound library: for each family of instruments, several sounds the
 * learner can pick per song (only for the parts the song actually has).
 *
 * Two kinds of sources, both free and open, both scheduled on the audio clock:
 *  - real sampled instruments loaded with smplr: Splendid Grand Piano, Smolken
 *    double bass, VCSL tenor saxophone (public domain), Greg Sullivan's
 *    electric pianos (CP-80, Wurlitzer, Pianet), MusyngKite General MIDI;
 *  - General MIDI banks in WebAudioFont format (webaudiofonts.com): AirFont
 *    380, FluidR3, GeneralUser GS, FatBoy, JCLive, Arachno, MerlinGrand…
 *
 * `trim` brings a smplr instrument to the level of the WebAudioFont banks
 * (measured offline: one note, velocity 90, RMS over 2 s; the banks sit
 * around −44 dB, smplr instruments 9 to 20 dB louder).
 */

import { GU_DRUMS_URL, SALAMANDER_PRESET_URL } from './localSounds';

export type Family = 'piano' | 'bass' | 'sax' | 'trumpet' | 'brass' | 'guitar' | 'organ' | 'drums' | 'other';

export type SoundSource =
  | { engine: 'smplr'; kind: 'splendid'; trim: number }
  /** An instrument in local-sounds/ (git-ignored): falls back to Splendid (drums: the jazz kit) when absent. */
  | { engine: 'smplr'; kind: 'local'; url: string; trim: number }
  | { engine: 'smplr'; kind: 'smolken'; instrument: string; trim: number }
  | { engine: 'smplr'; kind: 'versilian'; instrument: string; trim: number }
  | { engine: 'smplr'; kind: 'electricPiano'; instrument: string; trim: number }
  /** MusyngKite General MIDI instrument; `instrument: null` = the part's own GM program. */
  | { engine: 'smplr'; kind: 'soundfont'; instrument: string | null; trim: number }
  /** WebAudioFont bank; `program` fixes the GM program, otherwise the part's own one. */
  | { engine: 'webaudiofont'; bank: string; program?: number }
  /** A WebAudioFont drum kit, ride copied on every ride voice key (see jazzKit.ts). */
  | { engine: 'webaudiofont'; drumKit: string };

export interface SoundOption {
  id: string;
  label: string;
  source: SoundSource;
}

const waf = (id: string, label: string, bank: string, program?: number): SoundOption => ({
  id,
  label,
  source: { engine: 'webaudiofont', bank, ...(program === undefined ? {} : { program }) },
});

export const SOUND_LIBRARY: Record<Family, SoundOption[]> = {
  piano: [
    // Salamander: −34.8 dB at velocity 90 (vs −43.9 for the banks) → 0.35.
    { id: 'piano-salamander', label: 'Grand piano Salamander, Yamaha C5', source: { engine: 'smplr', kind: 'local', url: SALAMANDER_PRESET_URL, trim: 0.35 } },
    { id: 'piano-splendid', label: 'Grand piano de concert (Splendid)', source: { engine: 'smplr', kind: 'splendid', trim: 0.155 } },
    waf('piano-steinway', 'Steinway (AirFont)', 'AirFont380', 0),
    waf('piano-yamaha', 'Yamaha (FluidR3)', 'FluidR3', 0),
    waf('piano-stereo', 'Grand stéréo (GeneralUser)', 'GeneralUserGS', 0),
    waf('piano-merlin', 'Piano de concert (MerlinGrand)', 'MerlinGrand', 0),
    { id: 'piano-cp80', label: 'Yamaha CP-80 électrique', source: { engine: 'smplr', kind: 'electricPiano', instrument: 'CP80', trim: 0.19 } },
    { id: 'piano-wurli', label: 'Wurlitzer', source: { engine: 'smplr', kind: 'electricPiano', instrument: 'WurlitzerEP200', trim: 0.18 } },
    { id: 'piano-pianet', label: 'Pianet', source: { engine: 'smplr', kind: 'electricPiano', instrument: 'PianetT', trim: 0.1 } },
    waf('piano-rhodes', 'Rhodes classique (MerlinGrand)', 'MerlinGrand', 4),
    { id: 'piano-rhodes-mk', label: 'Rhodes (MusyngKite)', source: { engine: 'smplr', kind: 'soundfont', instrument: 'electric_piano_1', trim: 0.245 } },
  ],
  bass: [
    { id: 'bass-smolken', label: 'Contrebasse Smolken (pizzicato)', source: { engine: 'smplr', kind: 'smolken', instrument: 'Pizzicato', trim: 0.135 } },
    waf('bass-tyros', 'Contrebasse Tyros (AirFont)', 'AirFont380', 32),
    waf('bass-upright', 'Contrebasse ronde (FatBoy)', 'FatBoy', 32),
    waf('bass-gu', 'Contrebasse (GeneralUser)', 'GeneralUserGS', 32),
    { id: 'bass-mk', label: 'Contrebasse (MusyngKite)', source: { engine: 'smplr', kind: 'soundfont', instrument: 'acoustic_bass', trim: 0.17 } },
    waf('bass-jazz', 'Basse électrique Jazz Bass (AirFont)', 'AirFont380', 33),
    waf('bass-finger', 'Basse électrique aux doigts (RealFont)', 'RealFont', 33),
    waf('bass-fretless', 'Basse fretless (FluidR3)', 'FluidR3', 35),
  ],
  sax: [
    { id: 'sax-vcsl-vib', label: 'Sax ténor VCSL (vibrato)', source: { engine: 'smplr', kind: 'versilian', instrument: 'Aerophones/Reed Aerophones/Tenor Saxophone - Vibrato', trim: 0.15 } },
    { id: 'sax-vcsl-straight', label: 'Sax ténor VCSL (son droit)', source: { engine: 'smplr', kind: 'versilian', instrument: 'Aerophones/Reed Aerophones/Tenor Saxophone - Non-Vibrato', trim: 0.15 } },
    waf('sax-airfont', 'Sax (AirFont)', 'AirFont380'),
    waf('sax-jclive', 'Sax soufflé (JCLive)', 'JCLive'),
    waf('sax-gu', 'Sax (GeneralUser)', 'GeneralUserGS'),
    waf('sax-merlin', 'Sax (MerlinGrand)', 'MerlinGrand'),
    { id: 'sax-mk', label: 'Sax (MusyngKite)', source: { engine: 'smplr', kind: 'soundfont', instrument: null, trim: 0.21 } },
  ],
  trumpet: [
    waf('tp-sweet', 'Trompette Sweet (AirFont)', 'AirFont380', 56),
    waf('tp-soft', 'Trompette douce (JCLive)', 'JCLive', 56),
    waf('tp-gu', 'Trompette (GeneralUser)', 'GeneralUserGS', 56),
    waf('tp-merlin', 'Trompette (MerlinGrand)', 'MerlinGrand', 56),
    { id: 'tp-mk', label: 'Trompette (MusyngKite)', source: { engine: 'smplr', kind: 'soundfont', instrument: 'trumpet', trim: 0.35 } },
    waf('tp-muted', 'Trompette bouchée, façon Miles (AirFont)', 'AirFont380', 59),
    waf('tp-muted-fluid', 'Trompette bouchée (FluidR3)', 'FluidR3', 59),
  ],
  brass: [waf('brass-airfont', 'Cuivres (AirFont)', 'AirFont380'), waf('brass-fluid', 'Cuivres (FluidR3)', 'FluidR3'), waf('brass-gu', 'Cuivres (GeneralUser)', 'GeneralUserGS')],
  guitar: [waf('gt-airfont', 'Guitare (AirFont)', 'AirFont380'), waf('gt-fluid', 'Guitare (FluidR3)', 'FluidR3'), waf('gt-gu', 'Guitare (GeneralUser)', 'GeneralUserGS'), waf('gt-jazz', 'Guitare jazz (FluidR3)', 'FluidR3', 26)],
  organ: [waf('org-airfont', 'Orgue (AirFont)', 'AirFont380'), waf('org-fluid', 'Orgue (FluidR3)', 'FluidR3'), waf('org-gu', 'Orgue (GeneralUser)', 'GeneralUserGS')],
  drums: [
    { id: 'drums-jazz', label: 'Jazz, ride sombre (MIDI Boss)', source: { engine: 'webaudiofont', drumKit: 'midiboss_jazz_kit' } },
    { id: 'drums-brush', label: 'Balais (FluidR3)', source: { engine: 'webaudiofont', drumKit: '12826_FluidR3' } },
    { id: 'drums-brush-af', label: 'Balais (AirFont)', source: { engine: 'webaudiofont', drumKit: '1283_AirFont380' } },
    { id: 'drums-jazz-af', label: 'Jazz (AirFont)', source: { engine: 'webaudiofont', drumKit: '1284_AirFont380' } },
    { id: 'drums-jazz-arachno', label: 'Jazz (Arachno)', source: { engine: 'webaudiofont', drumKit: '1285_Arachno' } },
    { id: 'drums-jazz-gu', label: 'Jazz (GeneralUser)', source: { engine: 'webaudiofont', drumKit: '1284_GeneralUserGS' } },
    { id: 'drums-room', label: 'Batterie de studio (FluidR3)', source: { engine: 'webaudiofont', drumKit: '12812_FluidR3' } },
    // GeneralUser GS 2.0.3 rendered from the original .sf2 (local-sounds/, see localSounds.ts).
    // Trims measured offline against drums-jazz (RMS over 2 s, velocity 94).
    { id: 'drums-gu2-jazz', label: 'Jazz GeneralUser 2.0, mix d’origine (test)', source: { engine: 'smplr', kind: 'local', url: GU_DRUMS_URL.jazz, trim: 0.3 } },
    { id: 'drums-gu2-jazz-ride', label: 'Jazz GeneralUser 2.0, ride en avant (test)', source: { engine: 'smplr', kind: 'local', url: GU_DRUMS_URL.jazzRide, trim: 0.25 } },
    { id: 'drums-gu2-brush', label: 'Balais GeneralUser 2.0, mix d’origine (test)', source: { engine: 'smplr', kind: 'local', url: GU_DRUMS_URL.brush, trim: 0.35 } },
    { id: 'drums-gu2-brush-ride', label: 'Balais GeneralUser 2.0, ride en avant', source: { engine: 'smplr', kind: 'local', url: GU_DRUMS_URL.brushRide, trim: 0.28 } },
  ],
  other: [waf('other-airfont', 'AirFont 380', 'AirFont380'), waf('other-fluid', 'FluidR3', 'FluidR3'), waf('other-gu', 'GeneralUser', 'GeneralUserGS')],
};

const GM_NAMES_FR: Record<number, string> = {
  0: 'Piano', 1: 'Piano', 2: 'Piano électrique', 4: 'Piano électrique', 5: 'Piano électrique',
  24: 'Guitare', 25: 'Guitare', 26: 'Guitare jazz', 27: 'Guitare électrique',
  32: 'Contrebasse', 33: 'Basse électrique', 34: 'Basse électrique', 35: 'Basse fretless',
  56: 'Trompette', 57: 'Trombone', 58: 'Tuba', 59: 'Trompette bouchée',
  64: 'Sax soprano', 65: 'Sax alto', 66: 'Sax ténor', 67: 'Sax baryton',
  3: 'Piano bastringue', 6: 'Clavecin', 11: 'Vibraphone',
  40: 'Violon', 41: 'Alto (cordes)', 42: 'Violoncelle', 48: 'Cordes', 49: 'Cordes', 52: 'Voix', 53: 'Voix', 54: 'Voix',
  60: 'Cor', 61: 'Section de cuivres', 68: 'Hautbois', 69: 'Cor anglais', 70: 'Basson', 71: 'Clarinette',
  72: 'Piccolo', 73: 'Flûte', 74: 'Flûte à bec',
};

/** MusyngKite file names for the saxophones (the sax-mk option follows the part). */
const MK_SAX: Record<number, string> = { 64: 'soprano_sax', 65: 'alto_sax', 66: 'tenor_sax', 67: 'baritone_sax' };

export function familyOf(program: number, channel: number): Family {
  if (channel === 9) return 'drums';
  if (program <= 7) return 'piano';
  if (program >= 16 && program <= 23) return 'organ';
  if (program >= 24 && program <= 31) return 'guitar';
  if (program >= 32 && program <= 39) return 'bass';
  if (program === 56 || program === 59) return 'trumpet';
  if (program >= 57 && program <= 63) return 'brass';
  if (program >= 64 && program <= 67) return 'sax';
  return 'other';
}

export function partLabel(program: number, channel: number): string {
  if (channel === 9) return 'Batterie';
  return GM_NAMES_FR[program] ?? 'Instrument';
}

/**
 * Default sound of each family, picked by ear on the sound bench (2026-11-15).
 * Families not listed default to their first library sound.
 */
const FAMILY_DEFAULT: Partial<Record<Family, string>> = {
  sax: 'sax-vcsl-straight',
  brass: 'brass-gu',
  drums: 'drums-gu2-brush-ride',
};

const byId = (family: Family, id: string) => SOUND_LIBRARY[family].find((o) => o.id === id)!;

/** Default sound of a part: the best sampled instrument when there is one. */
export function defaultSound(program: number, channel: number): SoundOption {
  const family = familyOf(program, channel);
  if (family === 'bass' && program !== 32) {
    // An electric bass part keeps an electric bass by default.
    return byId('bass', program === 35 ? 'bass-fretless' : 'bass-finger');
  }
  if (family === 'piano' && (program === 4 || program === 5)) return byId('piano', 'piano-rhodes');
  if (family === 'trumpet' && program === 59) return byId('trumpet', 'tp-muted');
  const preferred = FAMILY_DEFAULT[family];
  return preferred ? byId(family, preferred) : SOUND_LIBRARY[family][0];
}

/** The sound picked for a part (falls back to the default if the id is unknown). */
export function resolveSound(program: number, channel: number, chosenId?: string): SoundOption {
  const options = SOUND_LIBRARY[familyOf(program, channel)];
  return options.find((o) => o.id === chosenId) ?? defaultSound(program, channel);
}

/** smplr MusyngKite instrument for a soundfont option. */
export function soundfontName(source: Extract<SoundSource, { kind: 'soundfont' }>, program: number): string {
  return source.instrument ?? MK_SAX[program] ?? 'tenor_sax';
}

/** GM program a WebAudioFont option plays for a part. */
export function wafProgram(source: Extract<SoundSource, { bank: string }>, program: number): number {
  return source.program ?? program;
}
