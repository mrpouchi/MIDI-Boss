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
    <div className="duo-card mx-auto max-w-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h2 className="duo-title text-xl">
            Configurer votre entraînement
          </h2>
          <p className="mt-1 text-sm text-muted">
            Sur les chansons guidées, chaque étape se débloque après avoir validé la précédente.
          </p>
        </div>

        <div className="inline-flex rounded-xl border-2 border-line bg-mist p-1">
          <button
            type="button"
            onClick={() => setMode('session')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
 mode === 'session'
 ? 'bg-surface text-text shadow-xs dark:text-white'
 : 'text-muted hover:text-text '
 }`}
          >
            Session libre
          </button>
          <button
            type="button"
            onClick={() => setMode('progression')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
 mode === 'progression'
 ? 'bg-surface text-text shadow-xs dark:text-white'
 : 'text-muted hover:text-text '
 }`}
          >
            Chanson / Progression
          </button>
        </div>
      </div>

      {mode === 'session' ? (
        <div className="mt-6 space-y-6">
          <div>
            <span className="block text-sm font-semibold text-text">
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
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-mist text-muted hover:border-line '
 }`}
                  >
                    <div className="text-xs font-semibold">{meta.shortLabelFr}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {VOICING_STEPS[sessionStep].descriptionFr}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold text-text">
                Familles d’accords
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setFamilies(['maj', 'min', 'sus2', 'sus4'])}
                  className="text-muted hover:text-sky-press"
                >
                  Triades & Sus
                </button>
                <span aria-hidden="true" className="text-line">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setFamilies(['7', 'maj7', 'm7'])}
                  className="text-muted hover:text-sky-press"
                >
                  Accords de 7e
                </button>
                <span aria-hidden="true" className="text-line">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setFamilies(ALL_CHORD_FAMILIES)}
                  className="text-muted hover:text-sky-press"
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
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-mist text-muted hover:border-line '
 }`}
                  >
                    <span className="text-sm font-semibold">{meta.labelFr}</span>
                    <span className="mt-0.5 tabular-nums text-xs opacity-75">
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
                  className="font-semibold text-text"
                >
                  Tempo indicatif
                </label>
                <span className="font-mono-tabular text-xs font-semibold text-sky-press">
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
                className="mt-3 w-full accent-sky dark:accent-indigo-400"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>45 BPM</span>
                <span>130 BPM</span>
              </div>
            </div>

            <div>
              <span className="block text-sm font-semibold text-text">
                Nombre d’accords
              </span>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {[8, 12, 16, 24].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setChordCount(count)}
                    className={`rounded-lg border py-2 font-mono-tabular text-xs font-semibold transition-colors ${
 chordCount === count
 ? 'border-sky bg-sky/10 text-sky-press '
 : 'border-line text-muted hover:bg-mist '
 }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-semibold text-text">
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
                    className={`rounded-lg border py-2 font-mono-tabular text-xs font-semibold transition-colors ${
 durationMinutes === opt.value
 ? 'border-sky bg-sky/10 text-sky-press '
 : 'border-line text-muted hover:bg-mist '
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
              className="mb-btn mb-btn-green"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>Lancer la session</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <span className="block text-sm font-semibold text-text">
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
 ? 'border-sky bg-sky/10 '
 : 'border-line hover:border-line '
 }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-text">
                        {song.title}
                      </span>
                      <span className="text-[11px] text-muted">
                        {getSongStepShortLabel(song, unlocked)}
                      </span>
                    </div>
                    <span className="mt-0.5 tabular-nums text-xs text-sky-press">
                      {text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-sm font-semibold text-text">
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
                        : 'Réussissez une séance complète du palier précédent pour débloquer celui-ci'
                    }
                    onClick={() => {
                      if (isUnlocked) setProgressionStep(stepId);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
 !isUnlocked
 ? 'cursor-not-allowed border-line bg-mist text-muted opacity-60 '
 : active
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-mist text-muted hover:border-line '
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
            <p className="mt-1.5 text-xs text-muted">
              {VOICING_STEPS[progressionStep].descriptionFr}
            </p>
          </div>

          <div>
            <label
              htmlFor="progression-input"
              className="block text-sm font-semibold text-text"
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
              className="mt-2 w-full rounded-xl border-2 border-line bg-mist px-4 py-2.5 tabular-nums text-sm text-text placeholder:text-muted focus:border-sky focus:outline-none dark:placeholder:text-slate-500"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">Aperçu :</span>
              {parsedProgression.chords.length > 0 ? (
                parsedProgression.chords.map((chord, idx) => (
                  <span
                    key={`${chord.id}-${idx}`}
                    className="tabular-nums font-semibold text-text"
                  >
                    {formatChordName(chord, notation)}
                    {idx < parsedProgression.chords.length - 1 && (
                      <span className="ml-2 text-muted">→</span>
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
                  className="font-semibold text-text"
                >
                  Tempo
                </label>
                <span className="font-mono-tabular text-xs font-semibold text-sky-press">
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
                className="mt-3 w-full accent-sky dark:accent-indigo-400"
              />
            </div>

            <div>
              <span className="block text-sm font-semibold text-text">
                Temps par accord
              </span>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {[2, 4, 8].map((beats) => (
                  <button
                    key={beats}
                    type="button"
                    onClick={() => setBeatsPerChord(beats)}
                    className={`rounded-lg border py-2 font-mono-tabular text-xs font-semibold transition-colors ${
 beatsPerChord === beats
 ? 'border-sky bg-sky/10 text-sky-press '
 : 'border-line text-muted hover:bg-mist '
 }`}
                  >
                    {beats} tps
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-sm font-semibold text-text">
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
                    className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
 loopCount === opt.value
 ? 'border-sky bg-sky/10 text-sky-press '
 : 'border-line text-muted hover:bg-mist '
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
              className="mb-btn mb-btn-green"
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
