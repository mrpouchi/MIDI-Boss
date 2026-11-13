import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { FileUp, LibraryBig, Music2, Play, Search, X } from 'lucide-react';
import { IrealSong, readIrealPlaylist } from '../../music/ireal';
import { StoredMidiSetup } from '../../storage/types';
import { MidiPlayerPanel } from '../components/MidiPlayerPanel';

interface LibraryScreenProps {
  songs: IrealSong[];
  midiSetups: Record<string, StoredMidiSetup>;
  onImport: (songs: IrealSong[]) => void;
  onPlay: (song: IrealSong) => Promise<void>;
  onSaveMidiSetup: (key: string, setup: StoredMidiSetup) => void;
}

export function LibraryScreen({ songs, midiSetups, onImport, onPlay, onSaveMidiSetup }: LibraryScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filteredSongs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return songs.slice(0, 80);
    return songs
      .filter((song) => `${song.title} ${song.composer} ${song.style}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 80);
  }, [query, songs]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = readIrealPlaylist(await file.text());
      if (!imported.length) throw new Error('Aucun lien iReal Pro trouvé dans ce fichier.');
      onImport(imported);
      setMessage(`${imported.length} morceaux importés. Ton répertoire est prêt.`);
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
      setMessage('Colle un lien irealb:// exporté par iReal Pro.');
      return;
    }
    onImport([...songs, ...imported.filter((song) => !songs.some((existing) => existing.id === song.id))]);
    setLinkInput('');
    setMessage('Morceau importé. Il est prêt à jouer.');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="duo-card p-6 sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="duo-eyebrow">iReal Pro</p>
            <h1 className="duo-title mt-2 text-3xl">Ton répertoire, prêt à jouer</h1>
            <p className="duo-copy mt-3">Importe une playlist iReal Pro une seule fois. Ensuite, choisis un standard et lance une séance adaptée à sa grille.</p>
          </div>
          <div className="flex shrink-0 gap-2"><input ref={inputRef} type="file" accept=".html,text/html" className="sr-only" onChange={handleFile} /><button type="button" onClick={() => inputRef.current?.click()} className="duo-button duo-button-primary duo-focus"><FileUp className="h-4 w-4" /> Importer une playlist</button></div>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-stone-100 pt-5 sm:flex-row dark:border-slate-800"><input value={linkInput} onChange={(event) => setLinkInput(event.target.value)} placeholder="Ou colle un lien irealb://…" className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" /><button type="button" onClick={importLink} className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50 dark:border-slate-700 dark:hover:bg-slate-800">Ajouter le lien</button></div>
        {message && <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"><span>{message}</span><button type="button" onClick={() => setMessage(null)} aria-label="Fermer"><X className="h-4 w-4" /></button></div>}
      </section>

      <MidiPlayerPanel savedSetups={midiSetups} onSaveSetup={onSaveMidiSetup} />

      {songs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-stone-300 p-10 text-center dark:border-slate-700">
          <LibraryBig className="mx-auto h-8 w-8 text-stone-400" />
          <h2 className="mt-4 font-display text-lg font-semibold">Aucun morceau importé</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-slate-400">Choisis le fichier HTML exporté depuis iReal Pro, comme « Jazz 1460.html ».</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-[#151c2f]">
          <div className="border-b border-stone-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-display font-semibold">{songs.length.toLocaleString('fr-FR')} morceaux</h2><p className="mt-1 text-xs text-stone-500">Recherche puis joue : les réglages viennent après.</p></div><div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compositeur, style…" className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900" /></div></div>
          </div>
          <ul className="divide-y divide-stone-100 dark:divide-slate-800">
            {filteredSongs.map((song) => <li key={song.id} className="flex items-center gap-3 px-5 py-3.5"><Music2 className="h-4 w-4 shrink-0 text-indigo-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{song.title}</p><p className="truncate text-xs text-stone-500 dark:text-slate-400">{song.composer || 'Compositeur inconnu'} · {song.style || 'Style libre'} · {song.key}</p></div><button type="button" disabled={loadingId === song.id} onClick={() => void startSong(song)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold hover:bg-stone-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"><Play className="h-3.5 w-3.5 fill-current" />{loadingId === song.id ? 'Lecture…' : 'Jouer'}</button></li>)}
          </ul>
          {filteredSongs.length === 0 && <p className="p-8 text-center text-sm text-stone-500">Aucun morceau trouvé.</p>}
        </section>
      )}
    </div>
  );
}
