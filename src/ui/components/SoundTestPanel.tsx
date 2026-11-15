import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOCAL_SONG_FILES } from '../../content/localSongs';
import { SOUND_LIBRARY, defaultSound, familyOf, partLabel } from '../../audio/bandInstruments';
import { BandPart, BandSequencer, auditionSound, listBandParts, stopAudition } from '../../audio/bandSequencer';
import { describeTracks, isClickTrackName, prepareDrumMapping } from '../../audio/midiFile';

/**
 * Temporary sound bench: pick a local MIDI song, choose a sound for each part,
 * listen. Changing a sound while playing reloads it and carries on from the
 * same spot, so two sounds can be compared on the same bars. Choices are not
 * saved anywhere.
 */
export function SoundTestPanel({ onClose }: { onClose: () => void }) {
  const [fileName, setFileName] = useState('');
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [parts, setParts] = useState<BandPart[]>([]);
  const [sounds, setSounds] = useState<Record<number, string>>({});
  const [muted, setMuted] = useState<number[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bandRef = useRef<BandSequencer | null>(null);
  /** Increments on every load so a slow, superseded load does not start playing. */
  const runRef = useRef(0);

  const band = () => (bandRef.current ??= new BandSequencer());

  const stop = useCallback(() => {
    runRef.current += 1;
    bandRef.current?.stop();
    setState('idle');
  }, []);

  useEffect(
    () => () => {
      runRef.current += 1;
      void bandRef.current?.close();
      void stopAudition();
    },
    [],
  );

  // Position display.
  useEffect(() => {
    if (state !== 'playing') return;
    const id = window.setInterval(() => {
      const s = bandRef.current?.positionS();
      if (s === null || s === undefined) {
        setState('idle');
        return;
      }
      setPosition(Math.max(0, s));
    }, 200);
    return () => window.clearInterval(id);
  }, [state]);

  const chooseSong = async (name: string) => {
    stop();
    setFileName(name);
    setError(null);
    setParts([]);
    setBuffer(null);
    setPosition(0);
    const file = LOCAL_SONG_FILES.find((f) => f.fileName === name);
    if (!file) return;
    try {
      const raw = await (await fetch(file.url)).arrayBuffer();
      const tracks = describeTracks(raw);
      const music = new Set(tracks.filter((t) => !isClickTrackName(t.name)).map((t) => t.channel));
      const clicks = tracks.filter((t) => isClickTrackName(t.name) && !music.has(t.channel)).map((t) => t.channel - 1);
      const mapped = prepareDrumMapping(raw, true).buffer;
      setBuffer(mapped);
      setParts(listBandParts(mapped, clicks));
      setSounds({});
      setMuted(clicks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** (Re)loads the band with the current sounds and plays from `fromS`. */
  const playFrom = async (fromS: number, nextSounds = sounds, nextMuted = muted) => {
    if (!buffer) return;
    const run = ++runRef.current;
    setState('loading');
    setError(null);
    void stopAudition();
    try {
      const b = band();
      const schedule = await b.load(buffer, nextSounds);
      if (run !== runRef.current) return;
      for (const ch of schedule.programs.keys()) b.setChannelVolume(ch, nextMuted.includes(ch) ? 0 : 0.85);
      setDuration(schedule.durationS);
      const ok = await b.start(Math.min(fromS, Math.max(0, schedule.durationS - 1)));
      if (run !== runRef.current) return;
      setState(ok ? 'playing' : 'idle');
      if (!ok) setError('Le navigateur bloque le son : clique encore sur Lecture.');
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  const currentPosition = () => bandRef.current?.positionS() ?? position;

  const changeSound = (channel: number, id: string) => {
    const next = { ...sounds, [channel]: id };
    setSounds(next);
    if (state !== 'idle') void playFrom(currentPosition(), next);
  };

  const toggleMute = (channel: number) => {
    const next = muted.includes(channel) ? muted.filter((c) => c !== channel) : [...muted, channel];
    setMuted(next);
    bandRef.current?.setChannelVolume(channel, next.includes(channel) ? 0 : 0.85);
  };

  const seek = (s: number) => {
    setPosition(s);
    if (state !== 'idle') void playFrom(s);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const songs = useMemo(() => LOCAL_SONG_FILES, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Test des sons">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-line bg-[#faf8f5] p-6 shadow-xl dark:bg-[#111727]">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Test des sons</h2>
            <p className="text-xs text-muted">Temporaire. Les choix faits ici ne sont pas enregistrés.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le test des sons"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-stone-200/70 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-5 block text-xs text-muted">
          Morceau
          <select
            value={fileName}
            onChange={(e) => void chooseSong(e.target.value)}
            className="mt-1 w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-sm text-text"
          >
            <option value="">{songs.length ? 'Choisir un morceau…' : 'Aucun fichier dans local-songs/'}</option>
            {songs.map((f) => (
              <option key={f.fileName} value={f.fileName}>
                {f.title}
              </option>
            ))}
          </select>
        </label>

        {buffer && (
          <>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => (state === 'idle' ? void playFrom(position) : stop())}
                className="flex items-center gap-2 rounded-xl bg-sky px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {state === 'idle' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {state === 'loading' ? 'Chargement…' : state === 'playing' ? 'Pause' : 'Lecture'}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                step={1}
                value={Math.min(position, duration)}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-sky"
                aria-label="Position dans le morceau"
              />
              <span className="font-mono-tabular text-xs text-muted">
                {fmt(Math.min(position, duration))} / {duration ? fmt(duration) : '–'}
              </span>
            </div>

            <ul className="mt-5 space-y-3">
              {parts.map((part) => {
                const options = SOUND_LIBRARY[familyOf(part.program, part.channel)];
                const chosen = sounds[part.channel] ?? defaultSound(part.program, part.channel).id;
                const isMuted = muted.includes(part.channel);
                return (
                  <li key={part.channel} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-text">
                        {partLabel(part.program, part.channel)}
                        <span className="ml-2 text-[11px] font-normal text-muted">
                          canal {part.channel + 1} · {part.notes} notes
                        </span>
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const option = options.find((o) => o.id === chosen);
                            if (option) void auditionSound(option, part.program, part.channel);
                          }}
                          className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-stone-200/70 hover:text-text"
                        >
                          Écouter seul
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMute(part.channel)}
                          aria-label={isMuted ? 'Rétablir la partie' : 'Couper la partie'}
                          className="rounded-lg p-1.5 text-muted hover:bg-stone-200/70 hover:text-text"
                        >
                          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <select
                      value={chosen}
                      onChange={(e) => changeSound(part.channel, e.target.value)}
                      className="mt-2 w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-sm text-text"
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[11px] text-muted">
              Changer un son pendant la lecture le recharge et reprend au même endroit. Les kits « GeneralUser 2.0 (test) » sont
              rendus depuis le .sf2 d’origine (GeneralUser GS v2.0.3, S. Christian Collins) et sont lus depuis local-sounds/ ; s’ils
              manquent, c’est le kit jazz habituel qui joue.
            </p>
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
