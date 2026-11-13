import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Lock,
  Music2,
  Play,
  Sparkles,
  Sliders,
  Target,
  Usb,
} from 'lucide-react';
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
  const reviewItems = microLesson.items.filter((item) => item.context === 'isolated').length;
  const newItems = microLesson.items.filter((item) => item.isNewConcept).length;
  const songItems = microLesson.items.filter((item) => item.context === 'progression').length;
  const completedSongCount = GUIDED_SONGS.filter((song) =>
    song.availableSteps.every((step) => songProgress[song.id]?.completedSteps.includes(step)),
  ).length;

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
      {/* Hero Focal Anchor — an achievable, adaptive daily lesson */}
      <section className="duo-card overflow-hidden shadow-[0_5px_0_0_var(--duo-swan)]">
        <div className="border-b-2 border-[var(--duo-green-soft)] bg-[var(--duo-green-soft)] px-6 py-3 text-xs font-black tracking-wide text-[var(--duo-eel)] sm:px-10">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Une seule petite victoire à la fois
          </span>
        </div>
        <div className="p-6 sm:p-10">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-medium capitalize text-stone-500 dark:text-slate-400">
              {formattedDate}
              <span aria-hidden="true" className="mx-2">
                ·
              </span>
              <span>Leçon adaptative · ~4 min</span>
              {isDemoData && (
                <>
                  <span aria-hidden="true" className="mx-2">
                    ·
                  </span>
                  <span>Données de démonstration</span>
                </>
              )}
            </p>
            <h1 className="duo-title mt-2 text-3xl sm:text-4xl">
              {microLesson.label}
            </h1>
            <p className="duo-copy mt-3 text-base">
              {microLesson.goalDescription} D’abord le repère, ensuite le geste,
              puis la musique : votre clavier valide chaque étape au bon moment.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onStartPractice(microLesson)}
                className="duo-button duo-button-primary duo-focus px-6 py-3.5"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Commencer la leçon du jour</span>
              </button>

              <button
                type="button"
                onClick={onOpenConfigurer}
                className="duo-button duo-button-outline duo-focus px-4 py-3"
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
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
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
        </div>
      </section>

      {/* Daily Goal + Spaced Repetition Rhythm */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="duo-card flex flex-col justify-between p-6">
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
                  goalReached ? 'bg-emerald-500' : 'bg-emerald-500 dark:bg-emerald-400'
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

        <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
          <div>
            <p className="text-xs font-bold tracking-wide text-emerald-600 dark:text-emerald-300">
              La boucle d’apprentissage
            </p>
            <h2 className="mt-1.5 font-display text-lg font-semibold text-stone-900 dark:text-slate-100">
              Voir, essayer, retrouver — puis jouer
            </h2>
            <div className="mt-5 space-y-3 text-xs text-stone-600 dark:text-slate-300">
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">1</span>
                <span><strong className="text-stone-900 dark:text-slate-100">Découvrir</strong> · le clavier montre un nouveau geste.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-200">2</span>
                <span><strong className="text-stone-900 dark:text-slate-100">Rappeler</strong> · vous rejouez sans indice les gestes fragiles.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">3</span>
                <span><strong className="text-stone-900 dark:text-slate-100">Mettre en musique</strong> · les accords reviennent dans une vraie suite.</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Lesson anatomy makes the adaptive choices legible before practice. */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-[#151c2f]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-emerald-600 dark:text-emerald-300">Avant de commencer</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-stone-900 dark:text-slate-100">Votre leçon en {microLesson.items.length} mini-défis</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 dark:bg-slate-900 dark:text-slate-300">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Objectif : jouer, pas mémoriser un écran
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: CircleDot, count: newItems, label: 'nouveau geste', tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-200' },
            { icon: Target, count: reviewItems, label: 'rappel ciblé', tone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-200' },
            { icon: Music2, count: songItems, label: 'accords en musique', tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-200' },
          ].map(({ icon: Icon, count, label, tone }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-stone-200/80 p-3 dark:border-slate-800">
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span><strong className="block font-mono-tabular text-base text-stone-900 dark:text-slate-100">{count}</strong><span className="text-xs text-stone-500 dark:text-slate-400">{label}</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* Course map: musical outcomes rather than an undifferentiated content library. */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
              Votre parcours au piano
            </h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              {completedSongCount > 0 ? `${completedSongCount} morceau${completedSongCount > 1 ? 'x' : ''} consolidé${completedSongCount > 1 ? 's' : ''}. ` : ''}Chaque morceau débloque son geste suivant à {STEP_XP_TARGET} XP.
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
                                ? 'bg-emerald-500 dark:bg-emerald-400'
                                : unlocked
                                  ? 'bg-emerald-300 dark:bg-emerald-800'
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
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-extrabold text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"
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
