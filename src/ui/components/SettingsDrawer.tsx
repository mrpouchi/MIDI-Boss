import { RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MidiState } from '../../input/types';
import { AppSettings } from '../../storage/types';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  midiState: MidiState;
  onRefreshMidi: () => void;
  onSelectMidiDevice: (deviceId: string) => void;
  isDemoData: boolean;
  onRestoreDemoData: () => void;
  onClearAllData: () => void;
}

export function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  midiState,
  onRefreshMidi,
  onSelectMidiDevice,
  isDemoData,
  onRestoreDemoData,
  onClearAllData,
}: SettingsDrawerProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmReset(false);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const midiStatusText =
    midiState.status === 'connected'
      ? `Connecté · ${midiState.activeDeviceName}`
      : midiState.status === 'permission-denied'
        ? 'Permission MIDI refusée par le navigateur'
        : midiState.status === 'unsupported'
          ? 'Web MIDI non disponible sur ce navigateur'
          : 'Aucun clavier MIDI détecté';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Réglages de Chord Practice"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-stone-200 bg-[#faf8f5] p-6 shadow-xl dark:border-slate-800 dark:bg-[#111727]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 dark:border-slate-800">
          <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-slate-100">
            Réglages personnels
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les réglages"
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-7">
          {/* Appearance */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-slate-400">
              Apparence
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  settings.theme === 'dark'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                    : 'border-stone-200 bg-white text-stone-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                }`}
              >
                Bleu nuit doux
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  settings.theme === 'light'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                    : 'border-stone-200 bg-white text-stone-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                }`}
              >
                Fond clair chaud
              </button>
            </div>
          </section>

          {/* Musical Notation */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-slate-400">
              Notation des accords
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ notation: 'intl' })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  settings.notation === 'intl'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                    : 'border-stone-200 bg-white text-stone-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                }`}
              >
                <div className="text-sm font-medium">Internationale</div>
                <div className="mt-0.5 font-mono text-xs opacity-75">C, Dm7, G7</div>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ notation: 'fr' })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  settings.notation === 'fr'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                    : 'border-stone-200 bg-white text-stone-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                }`}
              >
                <div className="text-sm font-medium">Française</div>
                <div className="mt-0.5 font-mono text-xs opacity-75">Do, Rém7, Sol7</div>
              </button>
            </div>
          </section>

          {/* Audio & Keyboard Helper */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-slate-400">
              Son et clavier d’aide
            </h3>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-stone-800 dark:text-slate-200">
                Synthétiseur piano doux (Web Audio)
              </span>
              <input
                type="checkbox"
                checked={settings.audioEnabled}
                onChange={(e) => onUpdateSettings({ audioEnabled: e.target.checked })}
                className="h-4 w-4 rounded accent-indigo-600"
              />
            </label>

            {settings.audioEnabled && (
              <div>
                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-slate-400">
                  <span>Volume sonore</span>
                  <span className="font-mono-tabular">
                    {Math.round(settings.audioVolume * 100)} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={settings.audioVolume}
                  onChange={(e) =>
                    onUpdateSettings({ audioVolume: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-indigo-600"
                />
              </div>
            )}

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-stone-800 dark:text-slate-200">
                Métronome léger en mode progression
              </span>
              <input
                type="checkbox"
                checked={settings.metronomeEnabled}
                onChange={(e) =>
                  onUpdateSettings({ metronomeEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded accent-indigo-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-stone-800 dark:text-slate-200">
                Afficher le nom des notes sur le clavier
              </span>
              <input
                type="checkbox"
                checked={settings.showKeyboardNotes}
                onChange={(e) =>
                  onUpdateSettings({ showKeyboardNotes: e.target.checked })
                }
                className="h-4 w-4 rounded accent-indigo-600"
              />
            </label>
          </section>

          {/* Daily Goal */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-slate-400">
              Objectif quotidien
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 30, 40].map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => onUpdateSettings({ dailyGoalChords: goal })}
                  className={`rounded-xl border py-2 font-mono-tabular text-xs font-medium transition-colors ${
                    settings.dailyGoalChords === goal
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                      : 'border-stone-200 bg-white text-stone-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                  }`}
                >
                  {goal} acc.
                </button>
              ))}
            </div>
          </section>

          {/* MIDI */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-slate-400">
                Périphérique MIDI
              </h3>
              <button
                type="button"
                onClick={onRefreshMidi}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Actualiser</span>
              </button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-3.5 text-xs text-stone-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="font-medium">{midiStatusText}</p>
              {midiState.devices.length > 1 && (
                <select
                  value={midiState.activeDeviceId ?? ''}
                  onChange={(e) => onSelectMidiDevice(e.target.value)}
                  className="mt-2.5 w-full rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {midiState.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {midiState.status !== 'connected' && (
                <p className="mt-1.5 text-stone-500 dark:text-slate-400">
                  Vous pouvez jouer librement avec le clavier virtuel interactif ou les touches du clavier d’ordinateur.
                </p>
              )}
            </div>
          </section>

          {/* Local Data */}
          <section className="space-y-3 border-t border-stone-200 pt-5 dark:border-slate-800">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-slate-400">
              Données locales
            </h3>
            <p className="text-xs leading-relaxed text-stone-500 dark:text-slate-400">
              Vos réglages et statistiques sont enregistrés uniquement sur cet appareil.
              {isDemoData && ' Des données de démonstration sont actuellement affichées.'}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onRestoreDemoData}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Charger données de démo
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Réinitialiser les stats</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllData();
                      setConfirmReset(false);
                    }}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-500"
                  >
                    Confirmer la remise à zéro
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="text-xs text-stone-500 hover:text-stone-800 dark:text-slate-400"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
