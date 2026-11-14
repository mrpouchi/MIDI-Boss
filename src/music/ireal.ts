import initIreal, { parseIrealb } from '@chordsketch/wasm';
import { ChordChart, RawChart, chartChordSequence, chartFromParsed } from './chart';
import { ChordDefinition } from './chords';

export interface IrealSong {
  id: string;
  title: string;
  composer: string;
  style: string;
  key: string;
  sourceUrl: string;
}

let wasmReady: Promise<unknown> | null = null;

function ensureIrealReady() {
  wasmReady ??= initIreal();
  return wasmReady;
}

function decodeField(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function songId(sourceUrl: string) {
  let hash = 5381;
  for (let i = 0; i < sourceUrl.length; i += 1) {
    hash = (hash * 33) ^ sourceUrl.charCodeAt(i);
  }
  return `ireal-${(hash >>> 0).toString(36)}`;
}

export function readIrealPlaylist(html: string): IrealSong[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const songs: IrealSong[] = [];

  for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
    const playlistUrl = anchor.getAttribute('href')?.trim() ?? '';
    if (!/^irealb:\/\//i.test(playlistUrl)) continue;

    // iReal joins exported playlist entries in one href with ===.
    for (const encodedSong of playlistUrl.replace(/^irealb:\/\//i, '').split('===')) {
      const sourceUrl = `irealb://${encodedSong}`;
      if (seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);

      const fields = encodedSong.split('=');
      if (fields.length < 6) continue;
      // irealb entries: Title=Composer=(empty)=Style=Key=Transpose=Music…
      // (older irealbook links have no empty field: Title=Composer=Style=Key…).
      const decoded = fields.map(decodeField);
      const [title, composer] = decoded;
      const shifted = decoded[2] === '';
      const style = shifted ? decoded[3] : decoded[2];
      const key = shifted ? decoded[4] : decoded[3];
      if (!title) continue;
      songs.push({
        id: songId(sourceUrl),
        title,
        composer,
        style,
        key,
        sourceUrl,
      });
    }
  }

  return songs;
}

/** Full bar-by-bar chart of an iReal song (repeats expanded). */
export async function decodeIrealChart(song: IrealSong): Promise<ChordChart> {
  await ensureIrealReady();
  return chartFromParsed(JSON.parse(parseIrealb(song.sourceUrl)) as RawChart);
}

/** Linear list of chord changes, for the simple progression mode. */
export async function decodeIrealSong(song: IrealSong): Promise<ChordDefinition[]> {
  return chartChordSequence(await decodeIrealChart(song));
}
