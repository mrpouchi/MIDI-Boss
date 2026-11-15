import { Instrument } from 'smplr';

/**
 * Instruments stored in `local-sounds/` (git-ignored, see its README), served
 * by the dev server. Today: the Salamander Grand Piano V3 (Yamaha C5, Alexander
 * Holm, CC-BY 3.0), converted to Opus with a smplr preset.
 */
export const SALAMANDER_PRESET_URL = '/local-sounds/salamander/preset.json';
export const SALAMANDER_CREDIT = 'Salamander Grand Piano V3, Alexander Holm (CC-BY 3.0)';

/**
 * GeneralUser GS v2.0.3 drum kits (S. Christian Collins, GeneralUser GS
 * License v2.0), rendered hit by hit with FluidSynth from the original .sf2
 * (velocity layers, layered samples and filters as the author programmed them),
 * Opus files + smplr preset. `preset.json`: the kit's own mix; `preset-ride.json`:
 * the same samples with the ride +12 dB and the hi-hat +6 dB.
 */
export const GU_DRUMS_URL = {
  jazz: '/local-sounds/generaluser-drums/jazz/preset.json',
  jazzRide: '/local-sounds/generaluser-drums/jazz/preset-ride.json',
  brush: '/local-sounds/generaluser-drums/brush/preset.json',
  brushRide: '/local-sounds/generaluser-drums/brush/preset-ride.json',
} as const;

/** A smplr instrument from a preset JSON URL (velocity layers, key zones). */
export const LocalInstrument = Instrument<{ url: string }>((ctx, options, smplr) =>
  fetch(options.url)
    .then((response) => {
      if (!response.ok) throw new Error(`Son local absent : ${options.url}`);
      return response.json();
    })
    .then((preset) => smplr.loadInstrument(preset)),
);

let available: Promise<boolean> | null = null;
/** True when the Salamander files are present in local-sounds/. */
export function salamanderAvailable(): Promise<boolean> {
  available ??= fetch(SALAMANDER_PRESET_URL, { method: 'HEAD' })
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
    .catch(() => false);
  return available;
}
