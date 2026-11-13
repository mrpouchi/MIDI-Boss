import initIreal, { parseIrealb } from '@chordsketch/wasm';
import { ChordDefinition, createChord } from './chords';

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
      const [title, composer, style, key] = fields.map(decodeField);
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

function rootToPitchClass(root: { note: string; accidental: string }) {
  const naturals: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const base = naturals[root.note];
  if (base === undefined) return null;
  if (root.accidental === 'sharp') return (base + 1) % 12;
  if (root.accidental === 'flat') return (base + 11) % 12;
  return base;
}

function toPracticeChord(raw: { root: { note: string; accidental: string }; quality: { kind: string; value?: string } }) {
  const root = rootToPitchClass(raw.root);
  if (root === null) return null;
  const kind = `${raw.quality.kind} ${raw.quality.value ?? ''}`.toLowerCase();
  const custom = raw.quality.value?.toLowerCase() ?? '';
  if (kind.includes('sus2')) return createChord(root, 'sus2');
  if (kind.includes('sus')) return createChord(root, 'sus4');
  // iReal's compact custom qualities use '-' for minor and '^' for major.
  if (custom.startsWith('-')) return createChord(root, /7|9|11|13/.test(custom) ? 'm7' : 'min');
  if (custom.startsWith('^')) return createChord(root, /7|9|11|13/.test(custom) ? 'maj7' : 'maj');
  if (kind.includes('minor')) return createChord(root, kind.includes('7') || kind.includes('9') || kind.includes('11') || kind.includes('13') ? 'm7' : 'min');
  if (kind.includes('major')) return createChord(root, kind.includes('7') || kind.includes('9') || kind.includes('13') ? 'maj7' : 'maj');
  if (kind.includes('dominant') || kind.includes('7') || kind.includes('9') || kind.includes('13') || kind.includes('altered')) return createChord(root, '7');
  return createChord(root, 'maj');
}

export async function decodeIrealSong(song: IrealSong): Promise<ChordDefinition[]> {
  await ensureIrealReady();
  const parsed = JSON.parse(parseIrealb(song.sourceUrl)) as {
    sections: Array<{ bars: Array<{ chords: Array<{ chord: unknown; size?: string }> }> }>;
  };
  const chords: ChordDefinition[] = [];
  for (const section of parsed.sections) {
    for (const bar of section.bars) {
      for (const item of bar.chords) {
        if (item.size === 'small' || !item.chord) continue;
        const chord = toPracticeChord(item.chord as Parameters<typeof toPracticeChord>[0]);
        if (chord) chords.push(chord);
      }
    }
  }
  return chords;
}
