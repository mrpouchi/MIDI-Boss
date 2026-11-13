import {
  AlertTriangle,
  ArrowRight,
  Award,
  Clock,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import {
  ALL_CHORD_FAMILIES,
  CHORD_FAMILIES,
  ChordFamily,
  VOICING_STEPS,
  parseChordId,
} from '../../music/chords';
import {
  GUIDED_SONGS,
  getSongUnlockedStep,
  getStepProgressPercent,
} from '../../practice/curriculum';
import {
  buildPracticeRecommendations,
  classifyChordMastery,
} from '../../practice/recommendations';
import { getSpacedOverview } from '../../practice/spacedRepetition';
import { PracticeConfig, SessionConfig } from '../../practice/types';
import { SessionRecord, StoredData } from '../../storage/types';

interface ProgressScreenProps {
  storedData: StoredData;
  onStartPractice: (config: PracticeConfig) => void;
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function ProgressScreen({
  storedData,
  onStartPractice,
}: ProgressScreenProps) {
  const { settings, chordStats, spacedCards, songProgress, sessions, isDemoData } =
    storedData;
  const [familyFilter, setFamilyFilter] = useState<'all' | ChordFamily>('all');

  const mastery = classifyChordMastery(chordStats, settings.notation);
  const spaced = getSpacedOverview(spacedCards);
  const recommendations = buildPracticeRecommendations(
    chordStats,
    settings.notation,
    spacedCards,
  );

  const allItems = [
    ...mastery.needsWork,
    ...mastery.consolidating,
    ...mastery.mastered,
  ].filter((item) => familyFilter === 'all' || item.family === familyFilter);

  const chartSessions = [...sessions].slice(0, 8).reverse();

  const handlePracticeWeak = (chordIds: string[], label: string) => {
    const families = Array.from(
      new Set(
        chordIds
          .map(parseChordId)
          .filter((c): c is NonNullable<typeof c> => c !== null)
          .map((c) => c.family),
      ),
    );
    const config: SessionConfig = {
      mode: 'session',
      label,
      families: families.length > 0 ? families : ['maj'],
      step: 'triad',
      chordCount: Math.max(8, chordIds.length * 2),
      tempoBpm: 70,
      durationMinutes: 5,
      targetChordIds: chordIds,
    };
    onStartPractice(config);
  };

  const hasData = mastery.totalPracticedChords > 0 || sessions.length > 0;

  if (!hasData) {
    return (
      <div className="duo-card mx-auto max-w-3xl p-10 text-center">
        <h1 className="duo-title text-2xl">
          Aucune séance enregistrée pour le moment
        </h1>
        <p className="duo-copy mx-auto mt-2 max-w-md text-sm">
          Terminez votre première leçon ou session pour voir apparaître vos accords
          maîtrisés, vos révisions espacées et votre progression par chanson.
        </p>
        <button
          type="button"
          onClick={() =>
            onStartPractice({
              mode: 'session',
              label: 'Premiers repères (Fondamentale)',
              families: ['maj', 'min'],
              step: 'root',
              chordCount: 8,
              tempoBpm: 68,
              durationMinutes: 5,
            })
          }
          className="duo-button duo-button-primary duo-focus mt-6"
        >
          <span>Commencer à l’étape 1 (Fondamentales)</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="duo-title text-2xl sm:text-3xl">
            Progression personnelle
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
            {sessions.length} sessions enregistrées
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            Précision moyenne :{' '}
            <span className="font-mono-tabular font-semibold text-stone-800 dark:text-slate-200">
              {mastery.overallAccuracy}%
            </span>
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            <span className="font-mono-tabular">
              {spaced.dueCount} révision{spaced.dueCount > 1 ? 's' : ''} due{spaced.dueCount > 1 ? 's' : ''}
            </span>
            {isDemoData && (
              <>
                <span aria-hidden="true" className="mx-2">
                  ·
                </span>
                <span>Données de démonstration</span>
              </>
            )}
          </p>
        </div>

        {mastery.needsWork.length > 0 && (
          <button
            type="button"
            onClick={() =>
              handlePracticeWeak(
                mastery.needsWork.slice(0, 5).map((c) => c.chordId),
                'Accords à travailler',
              )
            }
            className="duo-button duo-button-primary duo-focus"
          >
            <span>Travailler les accords fragiles</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Three Mastery Cards */}
      <div className="grid gap-5 md:grid-cols-3">
        <section className="duo-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Award className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">Maîtrisés</h2>
            </div>
            <span className="font-mono-tabular text-xs text-stone-500 dark:text-slate-400">
              {mastery.mastered.length} accords
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
            85 % et plus de réussite régulière
          </p>

          <div className="mt-4 space-y-2">
            {mastery.mastered.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-slate-500">
                Aucun accord encore classé ici.
              </p>
            ) : (
              mastery.mastered.slice(0, 5).map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium text-stone-800 dark:text-slate-200">
                    {item.label}
                  </span>
                  <span className="font-mono-tabular text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {item.accuracy}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151c2f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">À consolider</h2>
            </div>
            <span className="font-mono-tabular text-xs text-stone-500 dark:text-slate-400">
              {mastery.consolidating.length} accords
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
            Entre 60 % et 84 % de réussite
          </p>

          <div className="mt-4 space-y-2">
            {mastery.consolidating.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-slate-500">
                Aucun accord dans cette zone.
              </p>
            ) : (
              mastery.consolidating.slice(0, 5).map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium text-stone-800 dark:text-slate-200">
                    {item.label}
                    {item.isolatedVsProgressionGap && (
                      <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                        fragile en suite
                      </span>
                    )}
                  </span>
                  <span className="font-mono-tabular text-xs font-medium text-indigo-600 dark:text-indigo-300">
                    {item.accuracy}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151c2f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">À travailler</h2>
            </div>
            <span className="font-mono-tabular text-xs text-stone-500 dark:text-slate-400">
              {mastery.needsWork.length} accords
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
            Moins de 60 % de réussite
          </p>

          <div className="mt-4 space-y-2">
            {mastery.needsWork.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-slate-500">
                Aucun accord critique détecté.
              </p>
            ) : (
              mastery.needsWork.slice(0, 5).map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium text-stone-800 dark:text-slate-200">
                    {item.label}
                  </span>
                  <span className="font-mono-tabular text-xs font-medium text-rose-600 dark:text-rose-400">
                    {item.accuracy}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Guided Songs Progress */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
              Paliers des chansons guidées
            </h2>
          </div>
          <span className="text-xs text-stone-500 dark:text-slate-400">
            Fondamentale → Quinte → Triade → Extensions
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDED_SONGS.map((song) => {
            const currentStep = getSongUnlockedStep(song, songProgress);
            const pct = getStepProgressPercent(song, songProgress);
            return (
              <div
                key={song.id}
                className="rounded-xl border border-stone-200/80 bg-stone-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex items-center justify-between text-sm font-semibold text-stone-900 dark:text-slate-100">
                  <span>{song.title}</span>
                  <span className="font-mono-tabular text-xs text-indigo-600 dark:text-indigo-300">
                    {pct}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
                  Palier actuel : {VOICING_STEPS[currentStep].shortLabelFr}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Lightweight Chart + Recommendations */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-2 dark:border-slate-800 dark:bg-[#151c2f]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
                Évolution de la précision
              </h2>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                Taux de réussite sur vos dernières séances
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-stone-400 dark:text-slate-500">
              {chartSessions.length} dernières sessions
            </span>
          </div>

          {chartSessions.length > 0 && (
            <div className="mt-5">
              <AccuracySvgChart sessions={chartSessions} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
          <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
            Recommandations
          </h2>
          <ul className="mt-4 space-y-3.5 text-sm leading-relaxed text-stone-600 dark:text-slate-300">
            {recommendations.map((rec, idx) => (
              <li
                key={idx}
                className="border-b border-stone-100 pb-3 last:border-b-0 last:pb-0 dark:border-slate-800/80"
              >
                {rec}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Chord Breakdown + Session History */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
              Taux de réussite par accord
            </h2>
            <select
              aria-label="Filtrer par famille d'accords"
              value={familyFilter}
              onChange={(e) =>
                setFamilyFilter(e.target.value as 'all' | ChordFamily)
              }
              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">Toutes les familles</option>
              {ALL_CHORD_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {CHORD_FAMILIES[f].labelFr}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 divide-y divide-stone-100 dark:divide-slate-800/80">
            {allItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-400 dark:text-slate-500">
                Aucun accord pratiqué dans cette famille.
              </p>
            ) : (
              allItems.map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between gap-4 py-2.5 text-sm"
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display font-semibold text-stone-900 dark:text-slate-100">
                      {item.label}
                    </span>
                    <span className="text-xs text-stone-400 dark:text-slate-500">
                      {CHORD_FAMILIES[item.family].labelFr}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono-tabular text-xs text-stone-400 dark:text-slate-500">
                      {item.correct}/{item.attempts}
                    </span>
                    <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-stone-100 sm:block dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          item.tier === 'mastered'
                            ? 'bg-emerald-500'
                            : item.tier === 'consolidating'
                              ? 'bg-indigo-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${item.accuracy}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono-tabular text-xs font-semibold text-stone-800 dark:text-slate-200">
                      {item.accuracy}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-[#151c2f]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-stone-900 dark:text-slate-100">
              Historique récent
            </h2>
            <Clock className="h-4 w-4 text-stone-400 dark:text-slate-500" aria-hidden="true" />
          </div>

          <div className="mt-4 divide-y divide-stone-100 dark:divide-slate-800/80">
            {sessions.slice(0, 8).map((sess) => (
              <div
                key={sess.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900 dark:text-slate-100">
                    {sess.label}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                    {formatShortDate(sess.date)}
                    <span aria-hidden="true" className="mx-1.5">
                      ·
                    </span>
                    <span className="font-mono-tabular">{sess.totalChords} accords</span>
                    <span aria-hidden="true" className="mx-1.5">
                      ·
                    </span>
                    <span className="font-mono-tabular">
                      {Math.max(1, Math.round(sess.durationSeconds / 60))} min
                    </span>
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={`font-mono-tabular text-sm font-semibold ${
                      sess.accuracy >= 85
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : sess.accuracy >= 65
                          ? 'text-indigo-600 dark:text-indigo-300'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {sess.accuracy}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AccuracySvgChart({ sessions }: { sessions: SessionRecord[] }) {
  const width = 560;
  const height = 170;
  const padX = 28;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = sessions.map((s, idx) => {
    const x =
      sessions.length === 1
        ? padX + innerW / 2
        : padX + (idx / (sessions.length - 1)) * innerW;
    const y = padY + ((100 - s.accuracy) / 100) * innerH;
    return { x, y, session: s };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`
      : '';

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full min-w-[360px]"
        role="img"
        aria-label="Courbe d'évolution de la précision par session"
      >
        {[100, 75, 50].map((val) => {
          const y = padY + ((100 - val) / 100) * innerH;
          return (
            <g key={val}>
              <line
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="currentColor"
                strokeDasharray="3 4"
                className="text-stone-200 dark:text-slate-800"
              />
              <text
                x={0}
                y={y + 3}
                className="fill-stone-400 font-mono text-[9px] dark:fill-slate-500"
              >
                {val}%
              </text>
            </g>
          );
        })}

        {areaPath && (
          <path
            d={areaPath}
            className="fill-indigo-500/10 dark:fill-indigo-400/10"
          />
        )}

        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600 dark:text-indigo-400"
          />
        )}

        {points.map((p) => (
          <g key={p.session.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              className="fill-white stroke-indigo-600 stroke-2 dark:fill-[#151c2f] dark:stroke-indigo-400"
            >
              <title>
                {p.session.label} : {p.session.accuracy}%
              </title>
            </circle>
            <text
              x={p.x}
              y={height - 2}
              textAnchor="middle"
              className="fill-stone-400 font-mono text-[9px] dark:fill-slate-500"
            >
              {formatShortDate(p.session.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
