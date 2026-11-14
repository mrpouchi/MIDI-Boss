import type { Sf2Preset } from 'webaudiofontplayer';
import { BASE_KIT, JAZZ_KIT_ID, RIDE_SOURCE, buildJazzKit, withRideVoices } from './jazzKit';

/**
 * Instrument sounds for the band, in WebAudioFont's sf2-json format, from the
 * same online library the MIDI player uses. Cached by the browser (Cache API):
 * downloaded once.
 */
const ENDPOINT = 'https://webaudiofonts.com/presets/';
const CACHE = 'midiboss-presets';

type Preset = Sf2Preset & { id?: string; [key: string]: unknown };

const inFlight = new Map<string, Promise<Preset>>();

async function fetchJson(url: string): Promise<Preset> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return (await hit.json()) as Preset;
  } catch {
    cache = null;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Son introuvable (${response.status}) : ${url}`);
  if (cache) await cache.put(url, response.clone()).catch(() => undefined);
  const preset = (await response.json()) as Preset;
  if (!Array.isArray(preset.zones)) throw new Error(`Son invalide : ${url}`);
  return preset;
}

export function loadPreset(id: string): Promise<Preset> {
  let p = inFlight.get(id);
  if (!p) {
    p = fetchJson(`${ENDPOINT}${id}.json`);
    p.catch(() => inFlight.delete(id));
    inFlight.set(id, p);
  }
  return p;
}

/** Bank's preset for a MIDI program (0–127): "0320_AirFont380" = acoustic bass. */
export function bankPresetId(program: number, bank: 'AirFont380' | 'FluidR3'): string {
  const p = Math.max(0, Math.min(127, Math.round(program)));
  return `${String(p * 10).padStart(4, '0')}_${bank}`;
}

/**
 * A bank's sound for a GM program, with fallbacks: the same program in AirFont
 * 380 (the band's historical bank), then FluidR3, then a piano.
 */
export async function presetFor(bank: string, program: number): Promise<Preset> {
  const p = Math.max(0, Math.min(127, Math.round(program)));
  const ids = [`${String(p * 10).padStart(4, '0')}_${bank}`, bankPresetId(p, 'AirFont380'), bankPresetId(p, 'FluidR3'), bankPresetId(0, 'FluidR3')];
  for (const id of ids) {
    try {
      return await loadPreset(id);
    } catch {
      // next fallback
    }
  }
  throw new Error(`Aucun son pour le programme ${program}`);
}

export const presetForProgram = (program: number) => presetFor('AirFont380', program);

/** A drum kit with its ride on every ride voice key (iReal ride hits rotate over them). */
export async function drumKitPreset(id: string): Promise<Preset> {
  if (id === JAZZ_KIT_ID) return jazzKitPreset();
  try {
    return withRideVoices((await loadPreset(id)) as never) as unknown as Preset;
  } catch {
    return jazzKitPreset();
  }
}

let kit: Promise<Preset> | null = null;
/** The jazz drum kit (FluidR3 jazz kit with a darker ride, see jazzKit.ts). */
export function jazzKitPreset(): Promise<Preset> {
  kit ??= (async () => {
    const base = await loadPreset(BASE_KIT);
    try {
      return buildJazzKit(base as never, (await loadPreset(RIDE_SOURCE)) as never) as unknown as Preset;
    } catch {
      return base;
    }
  })();
  kit.catch(() => {
    kit = null;
  });
  return kit;
}
