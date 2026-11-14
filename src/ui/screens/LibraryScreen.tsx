import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { FileUp, LibraryBig, Music2, Play, Search, X } from 'lucide-react';
import { IrealSong, readIrealPlaylist } from '../../music/ireal';
import { StoredMidiSetup } from '../../storage/types';
import { MidiPlayerPanel } from '../components/MidiPlayerPanel';
import { LOCAL_SONG_FILES, LocalSongFile, songTitleKey } from '../../content/localSongs';
import { Mascot } from '../components/Mascot';

/** iReal writes minor keys as "C-": show "do mineur"-style names. */
function formatKey(key: string): string {
  if (!key) return '';
  return key.endsWith('-') ? `${key.slice(0, -1)} mineur` : `${key} majeur`;
}

/** Finds the iReal chart whose title matches a local MIDI file name. */
export function findChartFor(local: LocalSongFile, songs: IrealSong[]): IrealSong | undefined {
  const wanted = songTitleKey(local.title);
  return (
    songs.find((s) => songTitleKey(s.title) === wanted) ??
    songs.find((s) => songTitleKey(s.title).startsWith(wanted))
  );
}

interface LibraryScreenProps {
  songs: IrealSong[];
  midiSetups: Record<string, StoredMidiSetup>;
  onImport: (songs: IrealSong[]) => void;
  onPlay: (song: IrealSong) => Promise<void>;
  onPlayAlong: (local: LocalSongFile, ireal: IrealSong) => void;
  onSaveMidiSetup: (key: string, setup: StoredMidiSetup) => void;
}

export function LibraryScreen({ songs, midiSetups, onImport, onPlay, onPlayAlong, onSaveMidiSetup }: LibraryScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const filteredSongs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return songs;
    return songs.filter((song) =>
      `${song.title} ${song.composer} ${song.style}`.toLocaleLowerCase().includes(normalized),
    );
  }, [query, songs]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = readIrealPlaylist(await file.text());
      if (!imported.length) throw new Error('Aucun lien iReal Pro trouvé dans ce fichier.');
      onImport(imported);
      setMessage(`${imported.length} morceaux importés : votre bibliothèque est prête.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import impossible.');
    }
  };

  const startSong = async (song: IrealSong) => {
    setLoadingId(song.id);
    try {
      await onPlay(song);
    } catch {
      setMessage(`Impossible de lire la grille de « ${song.title} ».`);
    } finally {
      setLoadingId(null);
    }
  };

  const importLink = () => {
    const imported = readIrealPlaylist(`<a href="${linkInput.replace(/"/g, '&quot;')}">import</a>`);
    if (!imported.length) {
      setMessage('Collez un lien irealb:// exporté par iReal Pro.');
      return;
    }
    onImport([...songs, ...imported.filter((song) => !songs.some((existing) => existing.id === song.id))]);
    setLinkInput('');
    setMessage('Morceau importé : il est prêt à jouer.');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      {/* Play with the band */}
      <section aria-labelledby="band-title">
        <div className="flex items-center gap-4">
          <Mascot size={64} mood="listen" className="shrink-0" />
          <div>
            <h1 id="band-title" className="duo-title text-3xl sm:text-4xl">Jouer avec l’orchestre</h1>
            <p className="mt-1 font-semibold text-muted">
              La basse et la batterie de vos fichiers MIDI, vous au piano, chaque accord chronométré.
            </p>
          </div>
        </div>
        {LOCAL_SONG_FILES.length === 0 ? (
          <p className="mt-5 rounded-2xl border-2 border-dashed border-line p-5 font-semibold text-muted">
            Déposez un fichier .mid dans le dossier <code className="font-bold">local-songs/</code> du projet, puis rechargez la page.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {LOCAL_SONG_FILES.map((local) => {
              const chart = findChartFor(local, songs);
              return (
                <li key={local.fileName} className="mb-panel mb-lift flex flex-wrap items-center gap-4 p-4">
                  <span
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink shadow-[inset_0_0_0_6px_#2b3358,inset_0_0_0_14px_#1b2140]"
                    aria-hidden="true"
                  >
                    <span className="h-4 w-4 rounded-full bg-coral" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-xl font-semibold">{local.title}</p>
                    <p className="text-sm font-semibold text-muted">
                      {chart ? [chart.style, formatKey(chart.key)].filter(Boolean).join(', ') : 'Grille introuvable : importez votre playlist iReal.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!chart}
                    onClick={() => chart && onPlayAlong(local, chart)}
                    className="mb-btn mb-btn-green mb-btn-sm w-full sm:w-auto"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    Jouer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* iReal library */}
      <section aria-labelledby="ireal-title" className="mb-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h2 id="ireal-title" className="duo-title text-2xl">Votre bibliothèque iReal Pro</h2>
            <p className="mt-2 font-semibold text-muted">
              Importez votre playlist une seule fois : les grilles d’accords de tous vos morceaux deviennent jouables.
            </p>
          </div>
          <input ref={inputRef} type="file" accept=".html,text/html" className="sr-only" onChange={handleFile} />
          <button type="button" onClick={() => inputRef.current?.click()} className="mb-btn mb-btn-green shrink-0">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Importer une playlist
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <input
            value={linkInput}
            onChange={(event) => setLinkInput(event.target.value)}
            placeholder="Ou collez un lien irealb://…"
            aria-label="Lien iReal Pro"
            className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-mist px-4 py-3 font-semibold outline-none transition-colors focus:border-sky"
          />
          <button type="button" onClick={importLink} className="mb-btn mb-btn-ghost">
            Ajouter le lien
          </button>
        </div>
        {message && (
          <div className="mb-pop mt-5 flex items-center justify-between gap-3 rounded-2xl bg-sky/10 px-4 py-3 font-bold">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Fermer" className="rounded-lg p-1 hover:bg-sky/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {songs.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-line p-8 text-center">
            <LibraryBig className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-display text-lg font-semibold">Aucun morceau importé</p>
            <p className="mx-auto mt-1 max-w-md font-semibold text-muted">
              Choisissez le fichier HTML exporté depuis iReal Pro, par exemple « Jazz 1460.html ».
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-xl font-semibold">{songs.length.toLocaleString('fr-FR')} morceaux</p>
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(12);
                  }}
                  placeholder="Titre, compositeur, style…"
                  aria-label="Rechercher un morceau"
                  className="w-full rounded-2xl border-2 border-line bg-mist py-2.5 pr-3 pl-10 font-semibold outline-none transition-colors focus:border-sky"
                />
              </div>
            </div>
            <ul className="mt-4 divide-y-2 divide-line overflow-hidden rounded-2xl border-2 border-line">
              {filteredSongs.slice(0, visibleCount).map((song) => (
                <li key={song.id} className="flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-mist">
                  <Music2 className="h-4 w-4 shrink-0 text-sky-press" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{song.title}</p>
                    <p className="truncate text-sm font-semibold text-muted">
                      {[song.composer || 'Compositeur inconnu', song.style, formatKey(song.key)].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loadingId === song.id}
                    onClick={() => void startSong(song)}
                    title="Enchaîner les accords de la grille, sans orchestre"
                    className="mb-btn mb-btn-ghost mb-btn-sm"
                  >
                    {loadingId === song.id ? 'Lecture…' : 'Grille'}
                  </button>
                </li>
              ))}
            </ul>
            {filteredSongs.length === 0 && <p className="p-8 text-center font-semibold text-muted">Aucun morceau trouvé.</p>}
            {filteredSongs.length > visibleCount && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => setVisibleCount((n) => n + 24)} className="mb-btn mb-btn-ghost mb-btn-sm">
                  Afficher plus ({filteredSongs.length - visibleCount} restants)
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <MidiPlayerPanel savedSetups={midiSetups} onSaveSetup={onSaveMidiSetup} />
    </div>
  );
}
