import { ArrowRight, CheckCircle2, RotateCcw, TrendingUp, Volume2 } from 'lucide-react';
import { pianoSynth } from '../../audio/synth';
import {
  NotationSystem,
  VOICING_STEPS,
  VoicingStep,
  formatChordName,
  getChordNoteNames,
  getNextVoicingStep,
  getSuggestedVoicingMidi,
} from '../../music/chords';
import { GUIDED_SONGS, getNextStepForSong } from '../../practice/curriculum';
import { SessionSummary } from '../../practice/types';

interface SessionSummaryViewProps {
  summary: SessionSummary;
  notation: NotationSystem;
  onPracticeReviewChords: (chordIds: string[], step: VoicingStep) => void;
  onAdvanceToNextStep?: (nextStep: VoicingStep) => void;
  onRestartSession: () => void;
  onGoToProgress: () => void;
  onReconfigure: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
}

export function SessionSummaryView({
  summary,
  notation,
  onPracticeReviewChords,
  onAdvanceToNextStep,
  onRestartSession,
  onGoToProgress,
  onReconfigure,
}: SessionSummaryViewProps) {
  const currentStep = summary.step ?? 'full';
  const song = summary.songId
    ? GUIDED_SONGS.find((s) => s.id === summary.songId)
    : undefined;
  const nextStep = song
    ? getNextStepForSong(song, currentStep)
    : getNextVoicingStep(currentStep);
  const unlockedNextStep =
    summary.accuracy >= 80 && nextStep && onAdvanceToNextStep ? nextStep : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="duo-card duo-pop p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6 dark:border-slate-800">
          <div>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
              Bilan · {summary.label}
              {summary.step && ` · ${VOICING_STEPS[summary.step].shortLabelFr}`}
            </p>
            <h2 className="duo-title mt-1 text-2xl">
              {summary.accuracy >= 85
                ? 'Très belle maîtrise sur cette étape'
                : summary.accuracy >= 65
                  ? 'Bonne progression, vos repères s’installent'
                  : 'Séance utile pour cibler vos prochains rappels'}
            </h2>
          </div>

          <div className="text-right">
            <div className="font-mono-tabular text-3xl font-semibold text-stone-900 dark:text-slate-100">
              {summary.accuracy}%
            </div>
            <div className="text-xs text-stone-500 dark:text-slate-400">
              Précision globale
            </div>
          </div>
        </div>

        {/* Next Step Unlocked Callout */}
        {unlockedNextStep && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-500/35 bg-indigo-50/80 px-5 py-4 dark:border-indigo-400/35 dark:bg-indigo-500/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                <span>Étape suivante prête</span>
              </div>
              <p className="mt-1 text-sm text-stone-800 dark:text-slate-200">
                Vous avez validé{' '}
                <span className="font-medium">
                  {VOICING_STEPS[currentStep].shortLabelFr}
                </span>
                . Passez à{' '}
                <span className="font-semibold">
                  {VOICING_STEPS[unlockedNextStep].labelFr}
                </span>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAdvanceToNextStep?.(unlockedNextStep)}
              className="duo-button duo-button-primary duo-focus px-4 py-2 text-xs"
            >
              <span>Passer à l’étape {VOICING_STEPS[unlockedNextStep].order}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-xs text-stone-500 dark:text-slate-400">
              Accords corrects
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {summary.correctCount}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-xs text-stone-500 dark:text-slate-400">Erreurs</div>
            <div className="mt-1 font-mono-tabular text-2xl font-semibold text-rose-600 dark:text-rose-400">
              {summary.errorCount}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-xs text-stone-500 dark:text-slate-400">
              Accords manqués
            </div>
            <div className="mt-1 font-mono-tabular text-2xl font-semibold text-amber-600 dark:text-amber-400">
              {summary.missedCount}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-xs text-stone-500 dark:text-slate-400">Durée</div>
            <div className="mt-1 font-mono-tabular text-2xl font-semibold text-stone-900 dark:text-slate-100">
              {formatDuration(summary.durationSeconds)}
            </div>
          </div>
        </div>

        <div className="mt-7">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">
            Accords programmés en révision rapprochée
          </h3>
          {summary.chordsToReview.length === 0 ? (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Parfait : la répétition espacée allonge l’intervalle avant la prochaine révision.
              </span>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-slate-800 dark:border-slate-800">
              {summary.chordsToReview.map((chord) => {
                const notes = getChordNoteNames(chord, notation, currentStep).join(' · ');
                return (
                  <div
                    key={chord.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
                        {formatChordName(chord, notation)}
                      </span>
                      <span className="text-xs text-stone-500 dark:text-slate-400">
                        {notes}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        pianoSynth.playChordPreview(
                          getSuggestedVoicingMidi(chord, 4, currentStep),
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Écouter</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5">
            {summary.chordsToReview.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onPracticeReviewChords(
                    summary.chordsToReview.map((c) => c.id),
                    currentStep,
                  )
                }
                className="duo-button duo-button-primary duo-focus px-4 py-2.5"
              >
                <span>Retravailler ces accords</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={onRestartSession}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Recommencer</span>
            </button>

            <button
              type="button"
              onClick={onReconfigure}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Modifier la session
            </button>
          </div>

          <button
            type="button"
            onClick={onGoToProgress}
            className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            Voir mes progrès
          </button>
        </div>
      </div>
    </div>
  );
}
