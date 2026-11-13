import { Lock, Play, Repeat } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  ALL_CHORD_FAMILIES,
  CHORD_FAMILIES,
  ChordFamily,
  NotationSystem,
  VOICING_STEPS,
  VOICING_STEP_ORDER,
  VoicingStep,
  formatChordName,
  parseProgression,
} from '../../music/chords';
import {
  GUIDED_SONGS,
  getSongById,
  getSongStepShortLabel,
  getSongUnlockedStep,
  isStepUnlockedForSong,
} from '../../practice/curriculum';
import { PracticeConfig, PracticeMode, SessionConfig } from '../../practice/types';
import { SongProgress } from '../../storage/types';

interface SessionConfigPanelProps {
  initialMode: PracticeMode;
  initialSessionConfig: SessionConfig;
  notation: NotationSystem;
  songProgress: Record<string, SongProgress>;
  onStartPractice: (config: PracticeConfig) => void;
}

export function SessionConfigPanel({
  initialMode,
  initialSessionConfig,
  notation,
  songProgress,
  onStartPractice,
}: SessionConfigPanelProps) {
  const [mode, setMode] = useState<'session' | 'progression'>(
    initialMode === 'progression' ? 'progression' : 'session',
  );

  // Custom session state
  const [families, setFamilies] = useState<ChordFamily[]>(initialSessionConfig.families);
  const [sessionStep, setSessionStep] = useState<VoicingStep>(
    initialSessionConfig.step ?? 'full',
  );
  const [tempoBpm, setTempoBpm] = useState<number>(initialSessionConfig.tempoBpm);
  const [chordCount, setChordCount] = useState<number>(initialSessionConfig.chordCount);
  const [durationMinutes, setDurationMinutes] = useState<number>(
    initialSessionConfig.durationMinutes,
  );

  // Progression state
  const [selectedSongId, setSelectedSongId] = useState<string | undefined>(
    GUIDED_SONGS[0].id,
  );
  const [progressionInput, setProgressionInput] = useState<string>(
    notation === 'fr' ? GUIDED_SONGS[0].frText : GUIDED_SONGS[0].intlText,
  );
  const [progressionStep, setProgressionStep] = useState<VoicingStep>(() =>
    getSongUnlockedStep(GUIDED_SONGS[0], songProgress),
  );
  const [progressionTempo, setProgressionTempo] = useState<number>(
    GUIDED_SONGS[0].tempoBpm,
  );
  const [beatsPerChord, setBeatsPerChord] = useState<number>(4);
  const [loopCount, setLoopCount] = useState<number>(0);
  const [progressionLabel, setProgressionLabel] = useState<string>(
    GUIDED_SONGS[0].title,
  );

  const selectedSong = getSongById(selectedSongId);

  const parsedProgression = useMemo(
    () => parseProgression(progressionInput),
    [progressionInput],
  );

  const toggleFamily = (family: ChordFamily) => {
    setFamilies((prev) => {
      if (prev.includes(family)) {
        return prev.length > 1 ? prev.filter((f) => f !== family) : prev;
      }
      return [...prev, family];
    });
  };

  const handleStartCustomSession = () => {
    const selectedLabel =
      families.length === ALL_CHORD_FAMILIES.length
        ? 'Session complète (7 familles)'
        : families.map((f) => CHORD_FAMILIES[f].labelFr).slice(0, 3).join(' · ') +
          (families.length > 3 ? ` +${families.length - 3}` : '');

    onStartPractice({
      mode: 'session',
      label: selectedLabel,
      families,
      step: sessionStep,
      chordCount,
      tempoBpm,
      durationMinutes,
    });
  };

  const handleStartProgression = () => {
    if (parsedProgression.chords.length === 0) return;
    onStartPractice({
      mode: 'progression',
      label: progressionLabel || 'Progression personnalisée',
      rawInput: progressionInput,
      chords: parsedProgression.chords,
      step: progressionStep,
      tempoBpm: progressionTempo,
      beatsPerChord,
      loopCount,
      songId: selectedSongId,
    });
  };

  const visibleProgressionSteps = selectedSong
    ? selectedSong.availableSteps
    : VOICING_STEP_ORDER;

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-[#151c2f]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5 dark:border-slate-800">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-900 dark:text-slate-100">
            Configurer votre entraînement
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
            Sur les chansons guidées, chaque étape se débloque après avoir validé la précédente.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-slate-800 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={() => setMode('session')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              mode === 'session'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-indigo-500 dark:text-white'
                : 'text-stone-600 hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Session libre
          </button>
          <button
            type="button"
            onClick={() => setMode('progression')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              mode === 'progression'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-indigo-500 dark:text-white'
                : 'text-stone-600 hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Chanson / Progression
          </button>
        </div>
      </div>

      {mode === 'session' ? (
        <div className="mt-6 space-y-6">
          <div>
            <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
              Niveau d’étape (difficulté progressive)
            </span>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-4">
              {VOICING_STEP_ORDER.map((stepId) => {
                const meta = VOICING_STEPS[stepId];
                const active = sessionStep === stepId;
                return (
                  <button
                    key={stepId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSessionStep(stepId)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-950 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                        : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:border-stone-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{meta.shortLabelFr}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-400">
              {VOICING_STEPS[sessionStep].descriptionFr}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-stone-800 dark:text-slate-200">
                Familles d’accords
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setFamilies(['maj', 'min', 'sus2', 'sus4'])}
                  className="text-stone-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
                >
                  Triades & Sus
                </button>
                <span aria-hidden="true" className="text-stone-300 dark:text-slate-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setFamilies(['7', 'maj7', 'm7'])}
                  className="text-stone-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
                >
                  Accords de 7e
                </button>
                <span aria-hidden="true" className="text-stone-300 dark:text-slate-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setFamilies(ALL_CHORD_FAMILIES)}
                  className="text-stone-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
                >
                  Toutes
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ALL_CHORD_FAMILIES.map((family) => {
                const meta = CHORD_FAMILIES[family];
                const active = families.includes(family);
                return (
                  <button
                    key={family}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleFamily(family)}
                    className={`flex flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50/90 text-indigo-950 dark:border-indigo-400/70 dark:bg-indigo-500/15 dark:text-indigo-100'
                        : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:border-stone-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className="text-sm font-semibold">{meta.labelFr}</span>
                    <span className="mt-0.5 font-mono text-xs opacity-75">
                      {meta.intervalLabels.join(' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <div className="flex items-center justify-between text-sm">
                <label
                  htmlFor="tempo-slider"
                  className="font-medium text-stone-800 dark:text-slate-200"
                >
                  Tempo indicatif
                </label>
                <span className="font-mono-tabular text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                  {tempoBpm} BPM
                </span>
              </div>
              <input
                id="tempo-slider"
                type="range"
                min={45}
                max={130}
                step={2}
                value={tempoBpm}
                onChange={(e) => setTempoBpm(Number(e.target.value))}
                className="mt-3 w-full accent-indigo-600 dark:accent-indigo-400"
              />
              <div className="mt-1 flex justify-between text-[11px] text-stone-400 dark:text-slate-500">
                <span>45 BPM</span>
                <span>130 BPM</span>
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
                Nombre d’accords
              </span>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {[8, 12, 16, 24].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setChordCount(count)}
                    className={`rounded-lg border py-2 font-mono-tabular text-xs font-medium transition-colors ${
                      chordCount === count
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
                Durée maximale
              </span>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {[
                  { value: 2, label: '2m' },
                  { value: 5, label: '5m' },
                  { value: 10, label: '10m' },
                  { value: 0, label: 'Libre' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDurationMinutes(opt.value)}
                    className={`rounded-lg border py-2 font-mono-tabular text-xs font-medium transition-colors ${
                      durationMinutes === opt.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleStartCustomSession}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>Lancer la session</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
              Chansons guidées (progression étape par étape)
            </span>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {GUIDED_SONGS.map((song) => {
                const text = notation === 'fr' ? song.frText : song.intlText;
                const isSelected = selectedSongId === song.id;
                const unlocked = getSongUnlockedStep(song, songProgress);
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      setSelectedSongId(song.id);
                      setProgressionInput(text);
                      setProgressionTempo(song.tempoBpm);
                      setProgressionLabel(song.title);
                      setProgressionStep(unlocked);
                    }}
                    className={`flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/80 dark:border-indigo-400/70 dark:bg-indigo-500/15'
                        : 'border-stone-200 hover:border-stone-300 dark:border-slate-800 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                        {song.title}
                      </span>
                      <span className="text-[11px] text-stone-500 dark:text-slate-400">
                        {getSongStepShortLabel(song, unlocked)}
                      </span>
                    </div>
                    <span className="mt-0.5 font-mono text-xs text-indigo-600 dark:text-indigo-300">
                      {text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
              {selectedSong
                ? 'Étape débloquée sur cette chanson'
                : 'Étape de jeu sur cette suite libre'}
            </span>
            <div
              className={`mt-2.5 grid gap-2 ${
                visibleProgressionSteps.length === 3
                  ? 'sm:grid-cols-3'
                  : 'sm:grid-cols-4'
              }`}
            >
              {visibleProgressionSteps.map((stepId) => {
                const isUnlocked = selectedSong
                  ? isStepUnlockedForSong(selectedSong, stepId, songProgress)
                  : true;
                const active = progressionStep === stepId;
                const label = selectedSong
                  ? getSongStepShortLabel(selectedSong, stepId)
                  : VOICING_STEPS[stepId].shortLabelFr;

                return (
                  <button
                    key={stepId}
                    type="button"
                    disabled={!isUnlocked}
                    aria-pressed={active}
                    title={
                      isUnlocked
                        ? VOICING_STEPS[stepId].descriptionFr
                        : 'Validez l’étape précédente à 100 XP pour débloquer ce palier'
                    }
                    onClick={() => {
                      if (isUnlocked) setProgressionStep(stepId);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      !isUnlocked
                        ? 'cursor-not-allowed border-stone-200/70 bg-stone-100/70 text-stone-400 opacity-60 dark:border-slate-800/70 dark:bg-slate-900/30 dark:text-slate-500'
                        : active
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-950 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                          : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:border-stone-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-semibold">{label}</span>
                    {!isUnlocked && (
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-400">
              {VOICING_STEPS[progressionStep].descriptionFr}
            </p>
          </div>

          <div>
            <label
              htmlFor="progression-input"
              className="block text-sm font-medium text-stone-800 dark:text-slate-200"
            >
              Suite d’accords (ou saisissez une suite libre)
            </label>
            <input
              id="progression-input"
              type="text"
              value={progressionInput}
              onChange={(e) => {
                setSelectedSongId(undefined);
                setProgressionInput(e.target.value);
                setProgressionLabel('Suite personnalisée');
              }}
              placeholder="Ex. Dm7 – G7 – Cmaj7 ou Rém7 – Sol7 – Do7M"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50/50 px-4 py-2.5 font-mono text-sm text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-stone-500 dark:text-slate-400">Aperçu :</span>
              {parsedProgression.chords.length > 0 ? (
                parsedProgression.chords.map((chord, idx) => (
                  <span
                    key={`${chord.id}-${idx}`}
                    className="font-mono font-medium text-stone-800 dark:text-slate-200"
                  >
                    {formatChordName(chord, notation)}
                    {idx < parsedProgression.chords.length - 1 && (
                      <span className="ml-2 text-stone-400 dark:text-slate-600">→</span>
                    )}
                  </span>
                ))
              ) : (
                <span className="text-rose-600 dark:text-rose-400">
                  Saisissez au moins un accord valide (ex. Dm7 – G7 – Cmaj7)
                </span>
              )}
              {parsedProgression.invalidTokens.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  · Ignoré : {parsedProgression.invalidTokens.join(', ')}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <div className="flex items-center justify-between text-sm">
                <label
                  htmlFor="prog-tempo"
                  className="font-medium text-stone-800 dark:text-slate-200"
                >
                  Tempo
                </label>
                <span className="font-mono-tabular text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                  {progressionTempo} BPM
                </span>
              </div>
              <input
                id="prog-tempo"
                type="range"
                min={40}
                max={120}
                step={2}
                value={progressionTempo}
                onChange={(e) => setProgressionTempo(Number(e.target.value))}
                className="mt-3 w-full accent-indigo-600 dark:accent-indigo-400"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
                Temps par accord
              </span>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {[2, 4, 8].map((beats) => (
                  <button
                    key={beats}
                    type="button"
                    onClick={() => setBeatsPerChord(beats)}
                    className={`rounded-lg border py-2 font-mono-tabular text-xs font-medium transition-colors ${
                      beatsPerChord === beats
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {beats} tps
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-stone-800 dark:text-slate-200">
                Cycles en boucle
              </span>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {[
                  { value: 0, label: 'Continu' },
                  { value: 2, label: '2 tours' },
                  { value: 4, label: '4 tours' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLoopCount(opt.value)}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      loopCount === opt.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={parsedProgression.chords.length === 0}
              onClick={handleStartProgression}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <Repeat className="h-4 w-4" aria-hidden="true" />
              <span>Lancer la progression</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
