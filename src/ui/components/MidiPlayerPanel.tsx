import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LOCAL_SONG_FILES, LocalSongFile } from '../../content/localSongs';
import MidiAudioPlayer from 'midi-audio-player';
import { installJazzKit } from '../../audio/jazzKit';
import { FileAudio, Pause, Play, Square, Volume2 } from 'lucide-react';
import { StoredMidiSetup } from '../../storage/types';
import {
  DRUM_CHANNEL,
  DRUM_KIT_PRESET,
  MidiTrack,
  describeTracks,
  midiSetupKey,
  prepareDrumMapping,
} from '../../audio/midiFile';

interface MidiPlayerPanelProps {
  savedSetups: Record<string, StoredMidiSetup>;
  onSaveSetup: (key: string, setup: StoredMidiSetup) => void;
}

export function MidiPlayerPanel({ savedSetups, onSaveSetup }: MidiPlayerPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<MidiAudioPlayer | null>(null);
  const setupKeyRef = useRef<string | null>(null);
  const fileNameRef = useRef('');
  const fileSizeRef = useRef(0);
  const rawFileRef = useRef<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [tracks, setTracks] = useState<MidiTrack[]>([]);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'playing' | 'paused'>('idle');
  const [tempo, setTempo] = useState<number | null>(null);
  const [volumes, setVolumes] = useState<Record<number, number>>({});
  const [restored, setRestored] = useState(false);
  const [iRealExport, setIRealExport] = useState(false);
  const [drumRemap, setDrumRemap] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistMix = useCallback(
    (delayMs = 0) => {
      const player = playerRef.current;
      const key = setupKeyRef.current;
      if (!player || !key) return;
      const run = async () => {
        try {
          const setup = await player.getSongSetup();
          onSaveSetup(key, {
            fileName: fileNameRef.current,
            size: fileSizeRef.current,
            updatedAt: new Date().toISOString(),
            setup: { presets: setup.presets, volumes: setup.volumes },
          });
        } catch {
          // La lecture ne doit pas être interrompue si la sauvegarde du mixage échoue.
        }
      };
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      if (delayMs > 0) {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          void run();
        }, delayMs);
      } else {
        saveTimerRef.current = null;
        void run();
      }
    },
    [onSaveSetup],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // Construct synchronously within the file-picker gesture so Safari and
  // Chrome are allowed to create the Web Audio context.
  const createPlayer = () => {
    const player = new MidiAudioPlayer({ volume: 0.8, reverb: 0.16, preferred: ['FluidR3_GM'] });
    installJazzKit(player);
    player.on('computed', (data) => setTempo(Math.round(data.tempo)));
    player.on('endOfFile', () => setStatus('ready'));
    return player;
  };

  const mountFile = async (
    name: string,
    size: number,
    buffer: ArrayBuffer,
    remapDrums: boolean,
    player: MidiAudioPlayer = createPlayer(),
  ) => {
    setStatus('loading');
    setError(null);
    try {
      const previous = playerRef.current;
      if (previous && previous !== player) await previous.stop().catch(() => undefined);
      const importedTracks = describeTracks(buffer);
      const mapped = prepareDrumMapping(buffer, remapDrums);
      const key = midiSetupKey(name, buffer);
      const saved = savedSetups[key]?.setup;
      const presets = { ...(saved?.presets ?? {}) };
      if (importedTracks.some((track) => track.channel === DRUM_CHANNEL)) {
        // Toujours imposer un kit GM pour la batterie, y compris sur un setup
        // enregistré avec l'ancien preset non GM.
        presets[String(DRUM_CHANNEL)] = DRUM_KIT_PRESET;
      }
      await player.load(mapped.buffer, { presets, volumes: saved?.volumes ?? {} });
      const nextVolumes = Object.fromEntries(
        importedTracks.map((track) => [track.channel, saved?.volumes[String(track.channel)] ?? 0.8]),
      );
      Object.entries(nextVolumes).forEach(([channel, volume]) => player.setChannelVolume(Number(channel), volume));
      playerRef.current = player;
      setupKeyRef.current = key;
      fileNameRef.current = name;
      fileSizeRef.current = size;
      setTracks(importedTracks);
      setVolumes(nextVolumes);
      setRestored(Boolean(saved));
      setIRealExport(mapped.iReal);
      setFileName(name);
      setStatus('ready');
      persistMix(400);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      setError(`Impossible de charger ce MIDI : ${detail}`);
      setStatus('idle');
    }
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const player = createPlayer();
    const buffer = await file.arrayBuffer();
    rawFileRef.current = { name: file.name, size: file.size, buffer };
    await mountFile(file.name, file.size, buffer, drumRemap, player);
  };

  /** Loads a file from the local `local-songs/` folder. */
  const loadLocalSong = async (song: LocalSongFile) => {
    const player = createPlayer();
    try {
      const response = await fetch(song.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      rawFileRef.current = { name: song.fileName, size: buffer.byteLength, buffer };
      await mountFile(song.fileName, buffer.byteLength, buffer, drumRemap, player);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      setError(`Impossible de lire ${song.fileName} : ${detail}`);
    }
  };

  const changeDrumRemap = (enabled: boolean) => {
    setDrumRemap(enabled);
    const raw = rawFileRef.current;
    if (raw) void mountFile(raw.name, raw.size, raw.buffer, enabled);
  };

  const play = async () => {
    if (!playerRef.current) return;
    const started = await playerRef.current.play();
    if (started) setStatus('playing');
  };

  const pause = async () => {
    await playerRef.current?.pause();
    setStatus('paused');
  };

  const stop = async () => {
    await playerRef.current?.stop();
    setStatus('ready');
  };

  const updateVolume = (channel: number, value: number) => {
    playerRef.current?.setChannelVolume(channel, value);
    setVolumes((previous) => ({ ...previous, [channel]: value }));
    persistMix(500);
  };

  return (
    <section className="mb-panel p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h2 className="duo-title text-2xl">Lecteur MIDI</h2><p className="mt-1 font-semibold text-muted">Écoutez un fichier et réglez le volume de chaque instrument. Le fichier reste sur votre appareil.</p></div>
        <input ref={inputRef} type="file" accept=".mid,.midi,audio/midi,audio/x-midi" className="sr-only" onChange={(event) => void loadFile(event)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="mb-btn mb-btn-ghost shrink-0"><FileAudio className="h-4 w-4" /> Importer un MIDI</button>
      </div>
      {LOCAL_SONG_FILES.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-muted">Dans votre dossier local-songs :</span>
          {LOCAL_SONG_FILES.map((song) => (
            <button
              key={song.fileName}
              type="button"
              onClick={() => void loadLocalSong(song)}
              className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${
 fileName === song.fileName ? 'border-sky bg-sky/10 text-sky-press' : 'border-line hover:bg-mist'
 }`}
            >
              {song.title}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {status !== 'idle' && <div className="mt-5 border-t border-line pt-5"><div className="flex flex-wrap items-center gap-3"><span className="mr-auto font-display text-lg font-semibold">{fileName.replace(/\.midi?$/i, '')}{tempo ? <span className="ml-2 text-base text-muted">{tempo} BPM</span> : null}</span>{restored && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Mixage mémorisé</span>}<button type="button" disabled={status === 'loading'} onClick={() => void play()} className="mb-btn mb-btn-green mb-btn-sm"><Play className="h-4 w-4 fill-current" /> Jouer</button><button type="button" disabled={status !== 'playing'} onClick={() => void pause()} className="mb-btn mb-btn-ghost mb-btn-sm"><Pause className="h-4 w-4 fill-current" /> Pause</button><button type="button" onClick={() => void stop()} className="mb-btn mb-btn-ghost mb-btn-sm"><Square className="h-4 w-4 fill-current" /> Stop</button></div>{iRealExport && <label className="mt-4 flex items-start gap-2 rounded-xl bg-sky/10 px-3 py-2 text-xs text-muted"><input type="checkbox" checked={drumRemap} onChange={(event) => changeDrumRemap(event.target.checked)} className="mt-0.5 accent-sky" /><span><span className="font-semibold">Batterie iReal Pro convertie en General MIDI.</span> Les exports iReal utilisent un mapping maison : sans conversion, le ride sonne comme un sifflet. Décoche pour entendre le fichier brut.</span></label>}<div className="mt-5 grid gap-3 sm:grid-cols-2">{tracks.map((track) => <label key={`${track.channel}-${track.name}`} className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3 font-semibold"><Volume2 className="h-4 w-4 text-sky-press" /><span className="w-20 truncate font-semibold">{track.name}</span><input type="range" min="0" max="1" step="0.05" value={volumes[track.channel] ?? 0.8} onChange={(event) => updateVolume(track.channel, Number(event.target.value))} className="min-w-0 flex-1 accent-sky" /><span className="w-8 text-right text-xs text-muted">{Math.round((volumes[track.channel] ?? 0.8) * 100)}</span></label>)}</div></div>}
    </section>
  );
}
