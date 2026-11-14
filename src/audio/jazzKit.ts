import MidiAudioPlayer from 'midi-audio-player';

/**
 * Drum kit used for iReal exports: FluidR3's "Jazz" kit, whose ride is thin and
 * bright (it reads like a hi-hat), with the ride replaced by GeneralUser GS's
 * darker, longer-ringing ride (measured: spectral centroid ~3.9 kHz vs ~6.2 kHz,
 * rings ~2.5 s). GeneralUser's own kit can't be used as is: its WebAudioFont
 * conversion has catch-all zones that override kick, snare and hi-hat.
 */
export const JAZZ_KIT_ID = 'midiboss_jazz_kit';
const BASE_KIT = '1289_FluidR3';
const RIDE_SOURCE = '1284_GeneralUserGS';
const RIDE_KEYS = [51, 59]; // ride 1, ride 2

interface Zone {
  keyRangeLow: number;
  keyRangeHigh: number;
  [key: string]: unknown;
}
interface Preset {
  id: string;
  zones: Zone[];
  [key: string]: unknown;
}

const isOnlyKey = (z: Zone, key: number) => z.keyRangeLow === key && z.keyRangeHigh === key;

/** Pure: base kit with its ride zones swapped for the source's dedicated ride zones. */
export function buildJazzKit(base: Preset, rideSource: Preset): Preset {
  const rides = RIDE_KEYS.flatMap((key) => {
    const zone = rideSource.zones.find((z) => isOnlyKey(z, key));
    return zone ? [{ key, zone }] : [];
  });
  const replaced = new Set(rides.map((r) => r.key));
  // The player picks the LAST zone covering a key, so the new rides go at the end.
  const zones = [
    ...base.zones.filter((z) => ![...replaced].some((key) => isOnlyKey(z, key))),
    ...rides.map((r) => r.zone),
  ];
  return { ...base, id: JAZZ_KIT_ID, zones };
}

/** The two (public) catalog lookups of the player, seen loosely so they can be wrapped. */
interface PresetLookups {
  findPreset(id: unknown): Promise<Record<string, unknown> | null>;
  getPreset(id: unknown): Promise<Preset>;
}

/**
 * Teaches a player instance about JAZZ_KIT_ID (built on first use, from two
 * catalog presets the player downloads and caches itself). Falls back to the
 * plain FluidR3 kit if the ride source can't be loaded.
 */
export function installJazzKit(player: MidiAudioPlayer): void {
  const p = player as unknown as PresetLookups;
  const findPreset = p.findPreset.bind(p);
  const getPreset = p.getPreset.bind(p);
  let kit: Promise<Preset> | null = null;
  p.findPreset = async (id) => {
    if (id !== JAZZ_KIT_ID) return findPreset(id);
    const base = await findPreset(BASE_KIT);
    return base ? { ...base, id: JAZZ_KIT_ID } : null;
  };
  p.getPreset = async (id) => {
    if (id !== JAZZ_KIT_ID) return getPreset(id);
    kit ??= (async () => {
      const base = await getPreset(BASE_KIT);
      try {
        return buildJazzKit(base, await getPreset(RIDE_SOURCE));
      } catch {
        return { ...base, id: JAZZ_KIT_ID };
      }
    })();
    return kit;
  };
}
