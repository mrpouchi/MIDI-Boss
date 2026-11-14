import { Lock, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  PROFILE_COLORS,
  Profile,
  ProfilesState,
  checkPin,
  createProfile,
  deleteProfile,
  isValidPin,
  setAdmin,
  signIn,
} from '../../storage/profiles';
import { Mascot } from '../components/Mascot';
import { ProfileAvatar } from '../components/ProfileAvatar';

interface ProfileScreenProps {
  state: ProfilesState;
  onChange: (state: ProfilesState) => void;
}

type View = { kind: 'pick' } | { kind: 'create' } | { kind: 'pin'; profile: Profile };

function lastUsed(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  return `Il y a ${days} jours`;
}

/** "Qui joue ?" — pick, create or remove a local profile. */
export function ProfileScreen({ state, onChange }: ProfileScreenProps) {
  const [view, setView] = useState<View>(state.profiles.length ? { kind: 'pick' } : { kind: 'create' });
  const [managing, setManaging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const open = (profile: Profile) => {
    if (managing) return;
    if (profile.pinHash) setView({ kind: 'pin', profile });
    else onChange(signIn(state, profile.id));
  };

  return (
    <div className="min-h-screen bg-page px-4 py-10 text-text sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col items-center text-center">
          <Mascot size={96} mood="happy" />
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            MIDI <span className="text-green">Boss</span>
          </h1>
        </div>

        {view.kind === 'pick' && (
          <section className="mb-enter mt-8" aria-labelledby="who-title">
            <h2 id="who-title" className="text-center font-display text-2xl font-semibold">
              Qui joue ?
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {state.profiles.map((profile) => (
                <li key={profile.id} className="relative">
                  <button
                    type="button"
                    onClick={() => open(profile)}
                    disabled={managing}
                    className="mb-lift flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-line bg-surface px-3 py-6 disabled:cursor-default"
                  >
                    <ProfileAvatar profile={profile} size={72} />
                    <span className="flex max-w-full items-center gap-1.5 font-display text-lg font-semibold">
                      <span className="truncate">{profile.name}</span>
                      {profile.pinHash && <Lock className="h-4 w-4 shrink-0 text-muted" aria-label="Protégé par un code" />}
                    </span>
                    <span className="text-sm font-bold text-muted">{lastUsed(profile.lastUsedAt)}</span>
                    {profile.admin && (
                      <span className="rounded-full bg-brass px-2 py-0.5 text-xs font-extrabold text-ink">Admin : tout débloqué</span>
                    )}
                  </button>
                  {managing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-surface/95 p-3 text-center">
                      {confirmDelete === profile.id ? (
                        <>
                          <p className="text-sm font-bold">Supprimer {profile.name} et toute sa progression ?</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next = deleteProfile(state, profile.id);
                                setConfirmDelete(null);
                                onChange(next);
                                if (!next.profiles.length) {
                                  setManaging(false);
                                  setView({ kind: 'create' });
                                }
                              }}
                              className="mb-btn mb-btn-sm mb-btn-coral"
                            >
                              Supprimer
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="mb-btn mb-btn-sm mb-btn-ghost">
                              Annuler
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <label className="flex items-center gap-2 text-sm font-bold">
                            <input
                              type="checkbox"
                              checked={profile.admin === true}
                              onChange={(e) => onChange(setAdmin(state, profile.id, e.target.checked))}
                              className="h-4 w-4 accent-brass"
                            />
                            Admin (rien de bloqué)
                          </label>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(profile.id)}
                            className="mb-btn mb-btn-sm mb-btn-ghost"
                            aria-label={`Supprimer le profil ${profile.name}`}
                          >
                            <Trash2 className="h-4 w-4" /> Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {!managing && (
                <li>
                  <button
                    type="button"
                    onClick={() => setView({ kind: 'create' })}
                    className="mb-lift flex h-full min-h-[11rem] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line px-3 py-6 text-muted hover:text-text"
                  >
                    <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-mist">
                      <Plus className="h-8 w-8" />
                    </span>
                    <span className="font-display text-lg font-semibold">Nouveau profil</span>
                  </button>
                </li>
              )}
            </ul>
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setManaging((m) => !m);
                  setConfirmDelete(null);
                }}
                className="mb-btn mb-btn-sm mb-btn-ghost"
              >
                {managing ? 'Terminé' : 'Gérer les profils'}
              </button>
              <p className="max-w-md text-center text-sm font-semibold text-muted">
                Les profils et la progression sont enregistrés sur cet ordinateur uniquement, dans ce navigateur.
              </p>
            </div>
          </section>
        )}

        {view.kind === 'create' && (
          <CreateProfile
            first={state.profiles.length === 0}
            onCancel={state.profiles.length ? () => setView({ kind: 'pick' }) : undefined}
            onCreate={async (input) => onChange((await createProfile(state, input)).state)}
          />
        )}

        {view.kind === 'pin' && (
          <PinEntry
            profile={view.profile}
            onBack={() => setView({ kind: 'pick' })}
            onSuccess={() => onChange(signIn(state, view.profile.id))}
          />
        )}
      </div>
    </div>
  );
}

function CreateProfile({
  first,
  onCancel,
  onCreate,
}: {
  first: boolean;
  onCancel?: () => void;
  onCreate: (input: { name: string; color: string; pin?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [withPin, setWithPin] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const pinOk = !withPin || isValidPin(pin);
  const canSubmit = name.trim().length > 0 && pinOk && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    await onCreate({ name, color, pin: withPin ? pin : undefined });
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-enter mx-auto mt-8 max-w-md" aria-labelledby="create-title">
      <h2 id="create-title" className="text-center font-display text-2xl font-semibold">
        {first ? 'Créez votre profil' : 'Nouveau profil'}
      </h2>
      {first && (
        <p className="mt-2 text-center font-semibold text-muted">
          Votre progression y sera enregistrée. Si vous aviez déjà joué ici, elle est reprise automatiquement.
        </p>
      )}
      <div className="mt-6 flex justify-center">
        <ProfileAvatar profile={{ name: name || '?', color }} size={88} />
      </div>
      <label className="mt-6 block font-bold">
        Prénom ou pseudo
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          className="mt-1.5 block w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg font-semibold outline-none focus:border-sky"
        />
      </label>
      <fieldset className="mt-5">
        <legend className="font-bold">Couleur</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              aria-pressed={color === c}
              className={`h-10 w-10 rounded-full border-4 transition-transform hover:scale-110 ${color === c ? 'border-text' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <label className="mt-5 flex items-center gap-3 font-bold">
        <input type="checkbox" checked={withPin} onChange={(e) => setWithPin(e.target.checked)} className="h-5 w-5 accent-sky" />
        Protéger par un code à 4 chiffres
      </label>
      {withPin && (
        <>
          <input
            inputMode="numeric"
            autoComplete="off"
            aria-label="Code à 4 chiffres"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="mt-2 block w-40 rounded-2xl border-2 border-line bg-surface px-4 py-3 text-center font-display text-2xl tracking-[0.5em] outline-none focus:border-sky"
          />
          <p className="mt-1.5 text-sm font-semibold text-muted">
            Évite d’ouvrir le profil de quelqu’un d’autre par erreur. Ce n’est pas une vraie sécurité.
          </p>
        </>
      )}
      <div className="mt-8 flex gap-3">
        <button type="submit" disabled={!canSubmit} className="mb-btn mb-btn-green flex-1">
          {first ? 'Commencer' : 'Créer le profil'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="mb-btn mb-btn-ghost">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function PinEntry({ profile, onBack, onSuccess }: { profile: Profile; onBack: () => void; onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = async (value: string) => {
    if (!isValidPin(value)) return;
    if (await checkPin(profile, value)) onSuccess();
    else {
      setWrong(true);
      setPin('');
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(pin);
      }}
      className="mb-enter mx-auto mt-8 flex max-w-sm flex-col items-center text-center"
    >
      <ProfileAvatar profile={profile} size={88} />
      <h2 className="mt-4 font-display text-2xl font-semibold">{profile.name}</h2>
      <label className="mt-4 font-bold">
        Votre code
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          aria-label="Code à 4 chiffres"
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
            setPin(v);
            setWrong(false);
            if (v.length === 4) void submit(v);
          }}
          className={`mt-2 block w-44 rounded-2xl border-2 bg-surface px-4 py-3 text-center font-display text-3xl tracking-[0.5em] outline-none focus:border-sky ${wrong ? 'mb-wiggle border-coral' : 'border-line'}`}
        />
      </label>
      {wrong && <p className="mt-2 font-bold text-coral-press">Ce n’est pas le bon code.</p>}
      <button type="button" onClick={onBack} className="mb-btn mb-btn-ghost mt-6">
        Retour
      </button>
    </form>
  );
}
