/**
 * MIDI files the user drops into `local-songs/` (git-ignored, see its README).
 * Vite resolves the glob at dev/build time and refreshes it when files are
 * added; nothing is uploaded anywhere.
 */
const files = import.meta.glob('/local-songs/*.{mid,midi,MID,MIDI}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface LocalSongFile {
  /** File name, e.g. "Blue Bossa.mid". */
  fileName: string;
  /** Title derived from the file name, used to match an iReal chart. */
  title: string;
  url: string;
}

export const LOCAL_SONG_FILES: LocalSongFile[] = Object.entries(files)
  .map(([path, url]) => {
    const fileName = path.split('/').pop() ?? path;
    return { fileName, title: fileName.replace(/\.midi?$/i, ''), url };
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

/**
 * Title key used to match a MIDI file name with an iReal chart:
 * accents, punctuation and a leading/trailing "The" are ignored
 * ("The Girl From Ipanema" ↔ "Girl From Ipanema, The").
 */
export function songTitleKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.midi?$/, '')
    .replace(/,\s*the\s*$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findLocalSong(title: string, files: LocalSongFile[] = LOCAL_SONG_FILES): LocalSongFile | undefined {
  const key = songTitleKey(title);
  return files.find((f) => songTitleKey(f.title) === key);
}
