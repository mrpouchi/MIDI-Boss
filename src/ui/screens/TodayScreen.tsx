import { ArrowRight, CheckCircle2, Lock, Play, Sliders, Usb } from 'lucide-react';
import { MidiState } from '../../input/types';
import {
  GUIDED_SONGS,
  GuidedSong,
  STEP_XP_TARGET,
  getSongChords,
  getSongStepShortLabel,
  getSongStepXp,
  getSongUnlockedStep,
  getStepProgressPercent,
  isStepUnlockedForSong,
} from '../../practice/curriculum';
import {
  classifyChordMastery,
  getTodayChordsCompleted,
} from '../../practice/recommendations';
import {
  generateDuolingoMicroLesson,
  getSpacedOverview,
} from '../../practice/spacedRepetition';
import { PracticeConfig } from '../../practice/types';
import { StoredData } from '../../storage/types';

interface TodayScreenProps {
  storedData: StoredData;
  midiState: MidiState;
  onStartPractice: (config: PracticeConfig) => void;
  onOpenConfigurer: () => void;
}

export function TodayScreen({
  storedData,
  midiState,
  onStartPractice,
  onOpenConfigurer,
}: TodayScreenProps) {
  const { settings, chordStats, spacedCards, songProgress, sessions, isDemoData } =
    storedData;
  const notation = settings.notation;

  const microLesson = generateDuolingoMicroLesson(storedData, notation);
  const spacedOverview = getSpacedOverview(spacedCards);
  const mastery = classifyChordMastery(chordStats, notation);
  const todayChords = getTodayChordsCompleted(sessions);
  const goalChords = settings.dailyGoalChords;
  const goalPercent = Math.min(100, Math.round((todayChords / goalChords) * 100));
  const goalReached = todayChords >= goalChords;

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  const handleStartSong = (song: GuidedSong) => {
    const step = getSongUnlockedStep(song, songProgress);
    const chords = getSongChords(song, notation);
    if (chords.length === 0) return;

    onStartPractice({
      mode: 'progression',
      label: song.title,
      rawInput: notation === 'fr' ? song.frText : song.intlText,
      chords,
      step,
      tempoBpm: song.tempoBpm,
      beatsPerChord: 4,
      loopCount: 0,
      songId: song.id,
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Hero Focal Anchor — Micro-leçon adaptative du jour */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-10 dark:border-slate-800 dark:bg-[#151c2f]">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-medium capitalize text-stone-500 dark:text-slate-400">
              {formattedDate}
              <span aria-hidden="true" className="mx-2">
                ·
              </span>
              <span>Leçon adaptative ~4 min</span>
              {isDemoData && (
                <>
                  <span aria-hidden="true" className="mx-2">
                    ·
                  </span>
                  <span>Données de démonstration</span>
                </>
              )}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-slate-100">
              {microLesson.label}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-slate-300">
              {microLesson.goalDescription} Chaque morceau commence à un doigt
              (fondamentale seule), puis ajoute la quinte, la tierce et les extensions.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onStartPractice(microLesson)}
                className="inline-flex items-center gap-2.5 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Commencer la leçon du jour</span>
              </button>

              <button
                type="button"
                onClick={onOpenConfigurer}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Sliders className="h-4 w-4" aria-hidden="true" />
                <span>Session libre ou suite</span>
              </button>
            </div>
          </div>

          {/* Discreet MIDI & Spaced Review readiness */}
          <div className="shrink-0 space-y-2 rounded-xl border border-stone-200/90 bg-stone-50/70 px-4 py-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 font-medium text-stone-800 dark:text-slate-200">
              <Usb
                className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"
                aria-hidden="true"
              />
              <span>
                {midiState.status === 'connected'
                  ? `MIDI connecté : ${midiState.activeDeviceName}`
                  : midiState.status === 'permission-denied'
                    ? 'Permission MIDI refusée'
                    : 'Clavier virtuel & raccourcis prêts'}
              </span>
            </div>
            <p className="text-stone-500 dark:text-slate-400">
              {spacedOverview.dueCount > 0
                ? `${spacedOverview.dueCount} révision${spacedOverview.dueCount > 1 ? 's' : ''} espacée${spacedOverview.dueCount > 1 ? 's' : ''} prévue${spacedOverview.dueCount > 1 ? 's' : ''} aujourd’hui.`
                : 'Aucune révision urgente : nouveau contenu prêt.'}
            </p>
          </div>
        </div>
      </section>

      {/* Daily Goal + Spaced Repetition Rhythm */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
                Objectif du jour
              </h2>
              <span className="font-mono-tabular text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                {todayChords} / {goalChords} accords
              </span>
            </div>

            <div
              className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-slate-800"
              role="progressbar"
              aria-valuenow={goalPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  goalReached ? 'bg-emerald-500' : 'bg-indigo-600 dark:bg-indigo-400'
                }`}
                style={{ width: `${goalPercent}%` }}
              />
            </div>

            <p className="mt-3 text-sm text-stone-600 dark:text-slate-300">
              {goalReached ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Objectif quotidien atteint.
                </span>
              ) : (
                `Une micro-leçon suffit pour entretenir vos réflexes sans surcharge.`
              )}
            </p>
          </div>

          <div className="mt-6 flex items-center gap-6 border-t border-stone-200/80 pt-4 text-xs text-stone-500 dark:border-slate-800 dark:text-slate-400">
            <div>
              <span className="block text-stone-400 dark:text-slate-500">
                Précision globale
              </span>
              <span className="mt-0.5 block font-mono-tabular text-base font-semibold text-stone-900 dark:text-slate-100">
                {mastery.overallAccuracy}%
              </span>
            </div>
            <div>
              <span className="block text-stone-400 dark:text-slate-500">
                Révisions dues
              </span>
              <span className="mt-0.5 block font-mono-tabular text-base font-semibold text-stone-900 dark:text-slate-100">
                {spacedOverview.dueCount}
              </span>
            </div>
            <div>
              <span className="block text-stone-400 dark:text-slate-500">
                Ancrés (niv. 4–5)
              </span>
              <span className="mt-0.5 block font-mono-tabular text-base font-semibold text-stone-900 dark:text-slate-100">
                {spacedOverview.masteredCardsCount}
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
          <div>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
              Méthode progressive en 4 paliers
            </p>
            <h2 className="mt-1.5 font-display text-lg font-semibold text-stone-900 dark:text-slate-100">
              Jouer dès le premier jour, même sans notion de piano
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs text-stone-600 dark:text-slate-300">
              <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
                <span className="font-semibold text-stone-900 dark:text-slate-100">
                  1 · Fondamentale
                </span>
                <p className="mt-0.5 text-[11px] opacity-80">1 note pour suivre le morceau</p>
              </div>
              <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
                <span className="font-semibold text-stone-900 dark:text-slate-100">
                  2 · Fond. + Quinte
                </span>
                <p className="mt-0.5 text-[11px] opacity-80">2 doigts stables (1 + 5)</p>
              </div>
              <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
                <span className="font-semibold text-stone-900 dark:text-slate-100">
                  3 · Triade
                </span>
                <p className="mt-0.5 text-[11px] opacity-80">Majeur, mineur, sus2, sus4</p>
              </div>
              <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
                <span className="font-semibold text-stone-900 dark:text-slate-100">
                  4 · Extensions (7e)
                </span>
                <p className="mt-0.5 text-[11px] opacity-80">Accords complets & renversements</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Parcours Chansons — Étape par étape */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
              Chansons guidées — Étape par étape
            </h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              Chaque chanson démarre à l’étape 1 (fondamentale) et débloque le palier suivant à {STEP_XP_TARGET} XP.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenConfigurer}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            Saisir une suite personnalisée
          </button>
        </div>

        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDED_SONGS.map((song) => {
            const currentStep = getSongUnlockedStep(song, songProgress);
            const currentXp = getSongStepXp(song.id, currentStep, songProgress);
            const progressPct = getStepProgressPercent(song, songProgress);
            const prog = songProgress[song.id];
            const chordText = notation === 'fr' ? song.frText : song.intlText;

            return (
              <div
                key={song.id}
                className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-slate-400">
                    <span>{song.levelLabel}</span>
                    <span className="font-mono-tabular">{progressPct}%</span>
                  </div>
                  <h3 className="mt-1 font-display text-base font-semibold text-stone-900 dark:text-slate-100">
                    {song.title}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-indigo-600 dark:text-indigo-300">
                    {chordText}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-slate-400">
                    {song.description}
                  </p>
                </div>

                <div className="mt-4 space-y-3 pt-2">
                  <div className="flex items-center gap-1.5">
                    {song.availableSteps.map((stepId) => {
                      const isDone = prog?.completedSteps.includes(stepId);
                      const isCurrent = currentStep === stepId;
                      const unlocked = isStepUnlockedForSong(song, stepId, songProgress);
                      return (
                        <div
                          key={stepId}
                          title={getSongStepShortLabel(song, stepId)}
                          className={`h-1.5 flex-1 rounded-full ${
                            isDone
                              ? 'bg-emerald-500'
                              : isCurrent
                                ? 'bg-indigo-600 dark:bg-indigo-400'
                                : unlocked
                                  ? 'bg-indigo-300 dark:bg-indigo-800'
                                  : 'bg-stone-200 dark:bg-slate-700'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 dark:text-slate-300">
                      {!isStepUnlockedForSong(song, currentStep, songProgress) && (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      )}
                      <span>{getSongStepShortLabel(song, currentStep)}</span>
                      <span className="font-mono-tabular text-[11px] text-stone-500 dark:text-slate-400">
                        · {currentXp}/{STEP_XP_TARGET} XP
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStartSong(song)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      <span>Jouer</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
