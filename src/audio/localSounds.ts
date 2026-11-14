import { Instrument } from 'smplr';

/**
 * Instruments stored in `local-sounds/` (git-ignored, see its README), served
 * by the dev server. Today: the Salamander Grand Piano V3 (Yamaha C5, Alexander
 * Holm, CC-BY 3.0), converted to Opus with a smplr preset.
 */
export const SALAMANDER_PRESET_URL = '/local-sounds/salamander/preset.json';
export const SALAMANDER_CREDIT = 'Salamander Grand Piano V3, Alexander Holm (CC-BY 3.0)';

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
