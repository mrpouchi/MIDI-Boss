import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import MidiAudioPlayer from 'midi-audio-player';
import { parseMidi, writeMidi } from 'midi-file';
import { FileAudio, Pause, Play, Square, Volume2 } from 'lucide-react';
import { StoredMidiSetup } from '../../storage/types';

interface MidiTrack {
  channel: number;
  name: string;
}

type ParsedMidi = ReturnType<typeof parseMidi>;

// iReal Pro n'exporte pas les percussions en General MIDI : son SoundFont
// `percussive.sf2` embarque un mapping maison (71 = ride flat, 72 = ride flat
// edge, 92–100 = shakers et autres cymbales…). En GM, 71 et 72 sont des
// sifflets, d'où le ride qui siffle. On ne convertit que le canal 10.
const IREAL_DRUM_TO_GM: Record<number, number> = {
  0: 80, 1: 80, 2: 80, 3: 81, 4: 81, // triangles
  6: 42, 7: 46, 8: 42, 9: 42, 10: 46, 11: 46, // hi-hats iReal
  12: 68, 13: 68, 14: 67, // agogos
  15: 56, 16: 56, // cowbells
  17: 54, 18: 54, // tamborim -> tambourine
  19: 49, 20: 51, // balais sur crash / ride
  21: 38, 22: 38, 23: 38, 24: 38, 25: 38, // balais caisse claire
  26: 38, 27: 38, 28: 38, 29: 38, 30: 38,
  31: 35, 32: 35, 33: 35, 34: 35, 35: 35, // grosses caisses jazz
  36: 36, 37: 37, 38: 38, 39: 38, 40: 40, 41: 38,
  42: 42, 43: 43, 44: 44, 45: 45, 46: 46, 47: 47, 48: 48, 49: 49, 50: 38,
  51: 51, 52: 40, 53: 53, 54: 54, 55: 56, 56: 56, 57: 57, 58: 55, 59: 59,
  60: 51, 61: 63, 62: 62, 63: 63, 64: 64, 65: 65, 66: 66, 67: 67, 68: 68, 69: 65,
  70: 70, 71: 51, 72: 51, // ride flat / edge -> ride GM
  73: 73, 74: 74, 75: 75, 76: 76, 77: 77,
  80: 80, 81: 81, 82: 70,
  92: 70, 93: 70, 94: 70, 95: 70, // shakers -> maracas
  96: 51, 97: 53, 98: 51, 99: 51, 100: 51, // cymbales ride iReal
  101: 37, 102: 37, // rim clicks
  103: 61, // bongo low -> low bongo GM
  104: 70, 105: 70, // maracas salsa -> maracas GM
  106: 65, 107: 65, 108: 65, 109: 65, 110: 65, // timbales high
  111: 65, 112: 65, 113: 65, 114: 65, 115: 65, // timbales medium
  116: 66, 117: 66, 118: 66, 119: 66, 120: 66, // timbales low
  123: 70, 124: 70, // shekeres -> maracas
};

function trackLabel(track: ParsedMidi['tracks'][number]) {
  const name = track.find((event) => event.type === 'trackName');
  return name && 'text' in name ? name.text.trim().toLowerCase() : '';
}

function looksLikeIRealExport(parsed: ParsedMidi) {
  const names = new Set(parsed.tracks.map(trackLabel).filter(Boolean));
  const hasDrumNotes = parsed.tracks.some((track) =>
    track.some(
      (event) => event.type === 'noteOn' && event.channel === 9 && event.velocity > 0,
    ),
  );
  // Un export iReal contient toujours les pistes Piano, Harmony et Drums.
  return hasDrumNotes && ['piano', 'harmony', 'drums'].every((name) => names.has(name));
}

function prepareDrumMapping(buffer: ArrayBuffer, remap: boolean) {
  const parsed = parseMidi(new Uint8Array(buffer));
  const iReal = looksLikeIRealExport(parsed);
  if (!iReal || !remap) return { iReal, buffer };

  let changed = false;
  for (const track of parsed.tracks) {
    for (const event of track) {
      if (
        (event.type === 'noteOn' || event.type === 'noteOff') &&
        event.channel === 9
      ) {
        const mapped = IREAL_DRUM_TO_GM[event.noteNumber];
        if (mapped !== undefined && mapped !== event.noteNumber) {
          event.noteNumber = mapped;
          changed = true;
        }
      }
    }
  }
  if (!changed) return { iReal, buffer };
  return { iReal, buffer: new Uint8Array(writeMidi(parsed)).buffer };
}

function describeTracks(buffer: ArrayBuffer): MidiTrack[] {
  const parsed = parseMidi(new Uint8Array(buffer));
  return parsed.tracks.flatMap((track) => {
    const name = track.find((event) => event.type === 'trackName');
    const channelEvent = track.find(
      (event) => event.type === 'noteOn' || event.type === 'programChange',
    );
    if (!channelEvent || !('channel' in channelEvent)) return [];
    // midi-file expose des canaux 0–15, midi-audio-player attend des canaux 1–16.
    const channel = channelEvent.channel + 1;
    return [{ channel, name: name && 'text' in name ? name.text : `Canal ${channel}` }];
  });
}

interface MidiPlayerPanelProps {
  savedSetups: Record<string, StoredMidiSetup>;
  onSaveSetup: (key: string, setup: StoredMidiSetup) => void;
}

function midiSetupKey(fileName: string, buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return `${fileName}:${bytes.length}:${(hash >>> 0).toString(36)}`;
}

// Le catalogue ne contient pas de banque FluidR3_GM : sans preset explicite,
// le canal 10 tombe sur 1280_AirFont380 (banque « midis cm-64 ») dont le
// mapping de percussions n'est pas General MIDI (ride -> sifflet).
const DRUM_KIT_PRESET = '1289_FluidR3'; // Kit « Jazz » General MIDI de FluidR3
const DRUM_CHANNEL = 10;

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
    <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Accompagnement MIDI</p><h2 className="mt-1 font-display text-lg font-semibold">Joue ton export iReal Pro</h2><p className="mt-1 text-sm text-stone-600 dark:text-slate-400">Les sons sont chargés à la demande avec Web Audio Fonts ; le fichier MIDI reste sur ton appareil.</p></div>
        <input ref={inputRef} type="file" accept=".mid,.midi,audio/midi,audio/x-midi" className="sr-only" onChange={(event) => void loadFile(event)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold hover:bg-stone-50 dark:border-slate-700 dark:hover:bg-slate-800"><FileAudio className="h-4 w-4" /> Importer un MIDI</button>
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {status !== 'idle' && <div className="mt-5 border-t border-stone-100 pt-5 dark:border-slate-800"><div className="flex flex-wrap items-center gap-3"><span className="mr-auto text-sm font-semibold">{fileName}{tempo ? ` · ${tempo} BPM` : ''}</span>{restored && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Mixage mémorisé</span>}<button type="button" disabled={status === 'loading'} onClick={() => void play()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Play className="h-4 w-4 fill-current" /> Jouer</button><button type="button" disabled={status !== 'playing'} onClick={() => void pause()} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700"><Pause className="h-4 w-4 fill-current" /> Pause</button><button type="button" onClick={() => void stop()} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold dark:border-slate-700"><Square className="h-4 w-4 fill-current" /> Stop</button></div>{iRealExport && <label className="mt-4 flex items-start gap-2 rounded-xl bg-indigo-50/60 px-3 py-2 text-xs text-stone-600 dark:bg-indigo-950/30 dark:text-slate-300"><input type="checkbox" checked={drumRemap} onChange={(event) => changeDrumRemap(event.target.checked)} className="mt-0.5 accent-indigo-600" /><span><span className="font-semibold">Batterie iReal Pro convertie en General MIDI.</span> Les exports iReal utilisent un mapping maison : sans conversion, le ride sonne comme un sifflet. Décoche pour entendre le fichier brut.</span></label>}<div className="mt-5 grid gap-3 sm:grid-cols-2">{tracks.map((track) => <label key={`${track.channel}-${track.name}`} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm dark:bg-slate-900/60"><Volume2 className="h-4 w-4 text-indigo-500" /><span className="w-20 truncate font-medium">{track.name}</span><input type="range" min="0" max="1" step="0.05" value={volumes[track.channel] ?? 0.8} onChange={(event) => updateVolume(track.channel, Number(event.target.value))} className="min-w-0 flex-1 accent-indigo-600" /><span className="w-8 text-right text-xs text-stone-500">{Math.round((volumes[track.channel] ?? 0.8) * 100)}</span></label>)}</div></div>}
    </section>
  );
}
