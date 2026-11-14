import {
  AlertTriangle,
  ArrowRight,
  Award,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import {
  ALL_CHORD_FAMILIES,
  CHORD_FAMILIES,
  ChordFamily,
  parseChordId,
} from '../../music/chords';
import {
  buildPracticeRecommendations,
  classifyChordMastery,
} from '../../practice/recommendations';
import { assessSkills } from '../../practice/mastery';
import { SkillTreePanel } from '../components/SkillTreePanel';
import { SONG_PATH } from '../../content/songPath';
import { buildSongPath } from '../../practice/songProgress';
import { getSpacedOverview } from '../../practice/spacedRepetition';
import { PracticeConfig, SessionConfig } from '../../practice/types';
import { SessionRecord, StoredData } from '../../storage/types';

interface ProgressScreenProps {
  storedData: StoredData;
  onStartPractice: (config: PracticeConfig) => void;
  unlockAll?: boolean;
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
  unlockAll = false,
}: ProgressScreenProps) {
  const { settings, chordStats, spacedCards, sessions, isDemoData } =
    storedData;
  const [familyFilter, setFamilyFilter] = useState<'all' | ChordFamily>('all');

  const mastery = classifyChordMastery(chordStats, settings.notation);
  const spaced = getSpacedOverview(spacedCards);
  const recommendations = buildPracticeRecommendations(
    chordStats,
    settings.notation,
    spacedCards,
  );
  const songViews = buildSongPath(SONG_PATH, storedData.playAlongRuns ?? [], unlockAll);
  const skillAssessments = assessSkills(spacedCards, chordStats, storedData.playAlongRuns ?? []);

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
          className="mb-btn mb-btn-green mt-6"
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
          <h1 className="duo-title text-3xl sm:text-4xl">Compétences</h1>
          <p className="mt-1 font-semibold text-muted">
            {mastery.overallAccuracy} % de réussite sur {sessions.length} séance{sessions.length > 1 ? 's' : ''}
            {spaced.dueCount > 0 ? `, ${spaced.dueCount} accord${spaced.dueCount > 1 ? 's' : ''} à revoir` : ''}.
            {isDemoData ? ' Données de démonstration.' : ''}
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
            className="mb-btn mb-btn-green"
          >
            <span>Travailler les accords fragiles</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <SkillTreePanel assessments={skillAssessments} />

      {/* Three Mastery Cards */}
      <div className="grid gap-5 md:grid-cols-3">
        <section className="duo-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Award className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">Maîtrisés</h2>
            </div>
            <span className="font-mono-tabular text-xs text-muted">
              {mastery.mastered.length} accords
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            85 % et plus de réussite régulière
          </p>

          <div className="mt-4 space-y-2">
            {mastery.mastered.length === 0 ? (
              <p className="text-xs text-muted">
                Aucun accord encore classé ici.
              </p>
            ) : (
              mastery.mastered.slice(0, 5).map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-semibold text-text">
                    {item.label}
                  </span>
                  <span className="font-mono-tabular text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.accuracy}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border-2 border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sky-press">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">À consolider</h2>
            </div>
            <span className="font-mono-tabular text-xs text-muted">
              {mastery.consolidating.length} accords
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Entre 60 % et 84 % de réussite
          </p>

          <div className="mt-4 space-y-2">
            {mastery.consolidating.length === 0 ? (
              <p className="text-xs text-muted">
                Aucun accord dans cette zone.
              </p>
            ) : (
              mastery.consolidating.slice(0, 5).map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-semibold text-text">
                    {item.label}
                    {item.isolatedVsProgressionGap && (
                      <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                        fragile en suite
                      </span>
                    )}
                  </span>
                  <span className="font-mono-tabular text-xs font-semibold text-sky-press">
                    {item.accuracy}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border-2 border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold">À travailler</h2>
            </div>
            <span className="font-mono-tabular text-xs text-muted">
              {mastery.needsWork.length} accords
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Moins de 60 % de réussite
          </p>

          <div className="mt-4 space-y-2">
            {mastery.needsWork.length === 0 ? (
              <p className="text-xs text-muted">
                Aucun accord critique détecté.
              </p>
            ) : (
              mastery.needsWork.slice(0, 5).map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-semibold text-text">
                    {item.label}
                  </span>
                  <span className="font-mono-tabular text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {item.accuracy}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Song path progress: objectives validated with the band */}
      <section className="mb-panel p-6" aria-labelledby="songs-progress-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="songs-progress-title" className="duo-title text-2xl">Vos chansons</h2>
          <p className="text-sm font-bold text-muted">
            {songViews.reduce((n, v) => n + v.doneCount, 0)} objectifs validés sur{' '}
            {songViews.reduce((n, v) => n + v.song.objectives.length, 0)}
          </p>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {songViews.map((v) => (
            <li
              key={v.song.id}
              className={`rounded-2xl border-2 border-line p-4 ${v.unlocked ? 'bg-surface' : 'bg-mist opacity-70'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-bold">{v.song.title.replace(/, The$/, '')}</p>
                <span className="shrink-0 text-sm font-extrabold text-muted">
                  {v.doneCount}/{v.song.objectives.length}
                </span>
              </div>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {v.objectives.map((o) => (
                  <span
                    key={o.objective.id}
                    className={`h-2 flex-1 rounded-full ${o.state === 'done' ? 'bg-green' : o.state === 'current' ? 'bg-brass' : 'bg-line'}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm font-semibold text-muted">
                {!v.unlocked
                  ? 'Pas encore ouverte'
                  : v.doneCount === v.song.objectives.length
                    ? 'Maîtrisée au tempo original'
                    : `Prochain objectif : ${v.objectives.find((o) => o.state !== 'done')?.objective.label ?? ''}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Lightweight Chart + Recommendations */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border-2 border-line bg-surface p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-text">
                Évolution de la précision
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Taux de réussite sur vos dernières séances
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-muted">
              {chartSessions.length} dernières sessions
            </span>
          </div>

          {chartSessions.length > 0 && (
            <div className="mt-5">
              <AccuracySvgChart sessions={chartSessions} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border-2 border-line bg-surface p-6">
          <h2 className="font-display text-base font-semibold text-text">
            Recommandations
          </h2>
          <ul className="mt-4 space-y-3.5 text-sm leading-relaxed text-muted">
            {recommendations.map((rec, idx) => (
              <li
                key={idx}
                className="border-b border-line pb-3 last:border-b-0 last:pb-0"
              >
                {rec}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Chord Breakdown + Session History */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border-2 border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-text">
              Taux de réussite par accord
            </h2>
            <select
              aria-label="Filtrer par famille d'accords"
              value={familyFilter}
              onChange={(e) =>
                setFamilyFilter(e.target.value as 'all' | ChordFamily)
              }
              className="rounded-lg border-2 border-line bg-mist px-2.5 py-1.5 text-xs text-text"
            >
              <option value="all">Toutes les familles</option>
              {ALL_CHORD_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {CHORD_FAMILIES[f].labelFr}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 divide-y divide-line">
            {allItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                Aucun accord pratiqué dans cette famille.
              </p>
            ) : (
              allItems.map((item) => (
                <div
                  key={item.chordId}
                  className="flex items-center justify-between gap-4 py-2.5 text-sm"
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display font-semibold text-text">
                      {item.label}
                    </span>
                    <span className="text-xs text-muted">
                      {CHORD_FAMILIES[item.family].labelFr}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono-tabular text-xs text-muted">
                      {item.correct}/{item.attempts}
                    </span>
                    <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-mist sm:block">
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
                    <span className="w-10 text-right font-mono-tabular text-xs font-semibold text-text">
                      {item.accuracy}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border-2 border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-text">
              Historique récent
            </h2>
            <Clock className="h-4 w-4 text-muted" aria-hidden="true" />
          </div>

          <div className="mt-4 divide-y divide-line">
            {sessions.slice(0, 8).map((sess) => (
              <div
                key={sess.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text">
                    {sess.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
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
 ? 'text-sky-press '
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
                className="text-stone-200"
              />
              <text
                x={0}
                y={y + 3}
                className="fill-stone-400 tabular-nums text-[9px]"
              >
                {val}%
              </text>
            </g>
          );
        })}

        {areaPath && (
          <path
            d={areaPath}
            className="fill-indigo-500/10"
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
            className="text-sky-press"
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
              className="fill-stone-400 tabular-nums text-[9px]"
            >
              {formatShortDate(p.session.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
