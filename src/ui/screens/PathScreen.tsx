import { Check, Lock, Play, X } from 'lucide-react';
import { useState } from 'react';
import { LocalSongFile, findLocalSong, songTitleKey } from '../../content/localSongs';
import { PathSong, SONG_PATH, SongObjective, TEMPO_LABEL } from '../../content/songPath';
import { MidiState } from '../../input/types';
import { VOICING_STEPS, VoicingStep } from '../../music/chords';
import { IrealSong } from '../../music/ireal';
import { assessSkills, recommendNextSkills } from '../../practice/mastery';
import { ObjectiveState, buildSongPath, currentSong } from '../../practice/songProgress';
import { generateDuolingoMicroLesson } from '../../practice/spacedRepetition';
import { PracticeConfig } from '../../practice/types';
import { StoredData } from '../../storage/types';
import { Mascot } from '../components/Mascot';

interface PathScreenProps {
  storedData: StoredData;
  midiState: MidiState;
  onStartPractice: (config: PracticeConfig) => void;
  onPlayAlong: (
    local: LocalSongFile,
    ireal: IrealSong,
    goal: { song: PathSong; objective: SongObjective },
  ) => void;
  onOpenLibrary: () => void;
}

const UNIT_COLORS = [
  { band: 'bg-green', edge: 'shadow-[0_5px_0_var(--color-green-press)]', text: 'text-white' },
  { band: 'bg-sky', edge: 'shadow-[0_5px_0_var(--color-sky-press)]', text: 'text-white' },
  { band: 'bg-coral', edge: 'shadow-[0_5px_0_var(--color-coral-press)]', text: 'text-white' },
  { band: 'bg-brass', edge: 'shadow-[0_5px_0_var(--color-brass-press)]', text: 'text-ink' },
  { band: 'bg-ink', edge: 'shadow-[0_5px_0_#0c0f1f]', text: 'text-white' },
];

const ZIGZAG = [0, -56, -84, -56, 0, 56, 84, 56];

const displayTitle = (title: string) => title.replace(/, The$/, '');

/** One dot per note asked at this step; the original-tempo goal shows a note. */
function ObjectiveGlyph({ step, original }: { step: VoicingStep; original: boolean }) {
  if (original) {
    return (
      <span className="font-display text-3xl leading-none font-bold" aria-hidden="true">
        ♫
      </span>
    );
  }
  const count = VOICING_STEPS[step].order;
  return (
    <span className="flex flex-col-reverse items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="h-[10px] w-[13px] rounded-[50%] bg-current"
          style={{ transform: `translateX(${i % 2 === 0 ? -3 : 3}px) rotate(-20deg)` }}
        />
      ))}
    </span>
  );
}

const FACE: Record<ObjectiveState, string> = {
  done: 'bg-green text-white shadow-[0_6px_0_var(--color-green-press)]',
  current: 'bg-brass text-ink shadow-[0_6px_0_var(--color-brass-press)] ring-8 ring-brass/25',
  open: 'bg-sky text-white shadow-[0_6px_0_var(--color-sky-press)]',
  locked: 'bg-line text-muted shadow-[0_6px_0_var(--mb-press-neutral)]',
};

export function PathScreen({ storedData, midiState, onStartPractice, onPlayAlong, onOpenLibrary }: PathScreenProps) {
  const runs = storedData.playAlongRuns ?? [];
  const library = storedData.irealLibrary ?? [];
  const views = buildSongPath(SONG_PATH, runs);
  const active = currentSong(views);
  const warmup = generateDuolingoMicroLesson(storedData, storedData.settings.notation);
  const nextSkills = recommendNextSkills(assessSkills(storedData.spacedCards, storedData.chordStats, runs), 2);
  const activeObjective = active?.objectives.find((o) => o.state === 'current');
  const [openNode, setOpenNode] = useState<string | null>(activeObjective?.objective.id ?? null);

  const chartFor = (song: PathSong) => library.find((s) => songTitleKey(s.title) === songTitleKey(song.title));

  let songCounter = 0;

  return (
    <div className="mx-auto flex max-w-5xl gap-10">
      <div className="min-w-0 flex-1 pb-16">
        {SONG_PATH.map((unit, unitIndex) => {
          const color = UNIT_COLORS[unitIndex % UNIT_COLORS.length];
          const unitViews = views.filter((v) => v.unit.id === unit.id);
          return (
            <section key={unit.id} className="mb-16" aria-labelledby={`unit-${unit.id}`}>
              <header className={`rounded-[20px] px-6 py-5 ${color.band} ${color.edge} ${color.text}`}>
                <p className="text-sm font-extrabold opacity-80">Unité {unitIndex + 1}</p>
                <h2 id={`unit-${unit.id}`} className="font-display text-2xl font-semibold">
                  {unit.title}
                </h2>
                <p className="mt-1 font-bold opacity-90">{unit.goal}</p>
              </header>

              {unitViews.map((view) => {
                const { song } = view;
                const local = findLocalSong(song.title);
                const chart = chartFor(song);
                const offsetSeed = songCounter++;
                const isActive = active?.song.id === song.id;
                return (
                  <div key={song.id} className="mt-10">
                    <div
                      className={`flex items-start gap-4 rounded-2xl border-2 p-4 ${
                        view.unlocked ? 'mb-lift border-line bg-surface' : 'border-dashed border-line opacity-60'
                      }`}
                    >
                      <span
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink text-white shadow-[inset_0_0_0_6px_#2b3358,inset_0_0_0_14px_#1b2140]"
                        aria-hidden="true"
                      >
                        {view.unlocked ? <span className="h-4 w-4 rounded-full bg-coral" /> : <Lock className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="font-display text-xl font-semibold">{displayTitle(song.title)}</h3>
                          <span className="text-sm font-extrabold text-muted">
                            {view.doneCount}/{song.objectives.length} objectifs
                          </span>
                        </div>
                        <p className="font-semibold text-muted">{song.focus}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {song.introduces.map((n) => (
                            <span key={n} className="rounded-lg bg-mist px-2 py-0.5 text-xs font-extrabold">
                              {n}
                            </span>
                          ))}
                          {!local && (
                            <span className="rounded-lg bg-brass/20 px-2 py-0.5 text-xs font-extrabold text-brass-press">
                              MIDI à ajouter
                            </span>
                          )}
                          {local && !chart && (
                            <span className="rounded-lg bg-brass/20 px-2 py-0.5 text-xs font-extrabold text-brass-press">
                              Grille iReal à importer
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!view.unlocked ? (
                      <p className="mt-3 flex items-center justify-center gap-2 text-sm font-bold text-muted">
                        {song.objectives.map((o) => (
                          <span key={o.id} className="h-3 w-3 rounded-full bg-line" aria-hidden="true" />
                        ))}
                        <span className="ml-1">
                          {song.objectives.length} objectifs, ouverts après deux objectifs du morceau précédent
                        </span>
                      </p>
                    ) : (
                    <ol className="relative mt-8 flex flex-col items-center gap-7">
                      {view.objectives.map(({ objective, state }, i) => {
                        const isOpen = openNode === objective.id;
                        const offset = ZIGZAG[(i + offsetSeed * 3) % ZIGZAG.length];
                        return (
                          <li
                            key={objective.id}
                            className={`relative ${isOpen ? 'z-30' : 'z-0'}`}
                            style={{ transform: `translateX(${offset}px)` }}
                          >
                            {state === 'current' && !isOpen && (
                              <span className="mb-pop absolute -top-11 left-1/2 -translate-x-1/2 rounded-xl border-2 border-line bg-surface px-3 py-1.5 font-display text-sm font-semibold whitespace-nowrap text-brass-press">
                                À vous !
                              </span>
                            )}
                            <div className={state === 'current' && !isOpen ? 'mb-bob' : ''}>
                            <button
                              type="button"
                              onClick={() => setOpenNode(isOpen ? null : objective.id)}
                              aria-expanded={isOpen}
                              aria-label={`${displayTitle(song.title)} : ${objective.label}${state === 'done' ? ' (validé)' : state === 'locked' ? ' (verrouillé)' : ''}`}
                              className={`mb-node relative grid h-[72px] w-[78px] place-items-center rounded-[50%] ${FACE[state]}`}
                            >
                              {state === 'done' ? (
                                <Check className="h-8 w-8" strokeWidth={3.5} aria-hidden="true" />
                              ) : state === 'locked' ? (
                                <Lock className="h-6 w-6" aria-hidden="true" />
                              ) : (
                                <ObjectiveGlyph step={objective.step} original={objective.tempo === 'original'} />
                              )}
                            </button>
                            </div>

                            {state === 'current' && isActive && (
                              <Mascot
                                size={92}
                                className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 sm:block ${offset <= 0 ? 'left-[150px]' : 'right-[150px]'}`}
                              />
                            )}

                            {isOpen && (
                              <div
                                role="dialog"
                                aria-label={objective.label}
                                className={`mb-pop absolute top-[88px] left-1/2 z-20 w-80 -translate-x-1/2 rounded-[18px] p-4 ${
                                  state === 'locked'
                                    ? 'border-2 border-line bg-surface text-text'
                                    : state === 'current'
                                      ? 'bg-brass text-ink'
                                      : state === 'done'
                                        ? 'bg-green text-white'
                                        : 'bg-sky text-white'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-extrabold opacity-80">{displayTitle(song.title)}</p>
                                    <p className="font-display text-lg leading-tight font-semibold">{objective.label}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setOpenNode(null)}
                                    aria-label="Fermer"
                                    className="-mt-1 -mr-1 rounded-lg p-1 opacity-70 hover:opacity-100"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                                <p className="mt-1 text-sm font-semibold opacity-90">
                                  {objective.hint} Avec l’orchestre, au {TEMPO_LABEL[objective.tempo]}.
                                </p>
                                {state === 'locked' ? (
                                  <p className="mt-3 text-sm font-bold text-muted">
                                    {view.unlocked
                                      ? 'Validez d’abord l’objectif précédent de ce morceau.'
                                      : 'Validez deux objectifs du morceau précédent pour l’ouvrir.'}
                                  </p>
                                ) : !local ? (
                                  <p className="mt-3 rounded-xl bg-white/90 p-2.5 text-sm font-bold text-ink">
                                    Exportez « {displayTitle(song.title)} » en MIDI depuis iReal et déposez-le dans{' '}
                                    <code>local-songs/</code>, puis rechargez la page.
                                  </p>
                                ) : !chart ? (
                                  <button
                                    type="button"
                                    onClick={onOpenLibrary}
                                    className="mb-btn mt-3 w-full bg-white text-ink shadow-[0_4px_0_rgb(0_0_0/.18)]"
                                  >
                                    Importer la playlist iReal
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onPlayAlong(local, chart, { song, objective })}
                                    className="mb-btn mt-3 w-full bg-white text-ink shadow-[0_4px_0_rgb(0_0_0/.18)]"
                                  >
                                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                                    {state === 'done' ? 'Rejouer' : 'Jouer avec l’orchestre'}
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {/* Right rail: only what helps choose what to play next. */}
      <aside className="sticky top-10 hidden w-80 shrink-0 space-y-5 self-start xl:block">
        <div className="mb-panel p-5">
          <h2 className="font-display text-xl font-semibold">Votre clavier</h2>
          {midiState.status === 'connected' ? (
            <p className="mt-2 flex items-center gap-2 font-bold">
              <span className="h-3 w-3 rounded-full bg-green" aria-hidden="true" />
              {midiState.activeDeviceName}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-muted">
              Branchez votre clavier MIDI : il est détecté automatiquement. En attendant, le clavier à l’écran et
              les touches de l’ordinateur fonctionnent.
            </p>
          )}
        </div>

        {active && activeObjective && (
          <div className="mb-panel p-5">
            <h2 className="font-display text-xl font-semibold">En ce moment</h2>
            <p className="mt-1 font-bold">{displayTitle(active.song.title)}</p>
            <p className="text-sm font-semibold text-muted">Objectif : {activeObjective.objective.label}</p>
            <button
              type="button"
              onClick={() => setOpenNode(activeObjective.objective.id)}
              className="mb-btn mb-btn-green mt-4 w-full"
            >
              Continuer
            </button>
          </div>
        )}

        <div className="mb-panel p-5">
          <h2 className="font-display text-xl font-semibold">Échauffement</h2>
          <p className="mt-2 text-sm font-semibold text-muted">
            Quelques accords à retrouver sur le clavier, sans orchestre.
          </p>
          <button type="button" onClick={() => onStartPractice(warmup)} className="mb-btn mb-btn-ghost mt-4 w-full">
            S’échauffer
          </button>
        </div>

        {nextSkills.length > 0 && (
          <div className="mb-panel p-5">
            <h2 className="font-display text-xl font-semibold">À travailler</h2>
            <ul className="mt-3 space-y-3">
              {nextSkills.map((a) => (
                <li key={a.skill.id}>
                  <p className="font-bold">{a.skill.label}</p>
                  <p className="text-sm font-semibold text-muted">
                    {a.status === 'fragile' ? 'Erreurs répétées : reprenons calmement.' : a.skill.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
