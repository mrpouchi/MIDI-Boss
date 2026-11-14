import { RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { INSTRUMENTS, pianoSynth } from '../../audio/synth';
import { MidiRawListener } from '../../input/midi';
import { MidiState } from '../../input/types';
import { MidiMonitor } from './MidiMonitor';
import { AppSettings, InstrumentId } from '../../storage/types';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  midiState: MidiState;
  onRefreshMidi: () => void;
  onSelectMidiDevice: (deviceId: string) => void;
  subscribeMidiRaw: (listener: MidiRawListener) => () => void;
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
  subscribeMidiRaw,
  isDemoData,
  onRestoreDemoData,
  onClearAllData,
}: SettingsDrawerProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [instrumentStatus, setInstrumentStatus] = useState(() =>
    pianoSynth.getInstrumentStatus(),
  );
  const [latency, setLatency] = useState(() => pianoSynth.getLatencyInfo());

  useEffect(() => pianoSynth.subscribeInstrument(setInstrumentStatus), []);

  useEffect(() => {
    if (!isOpen) return;
    setLatency(pianoSynth.getLatencyInfo());
    // `outputLatency` se précise une fois le contexte réellement démarré.
    const id = window.setInterval(() => setLatency(pianoSynth.getLatencyInfo()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

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
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-[#faf8f5] p-6 shadow-xl dark:bg-[#111727]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="font-display text-lg font-semibold text-text">
            Réglages personnels
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les réglages"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-stone-200/70 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-7">
          {/* Appearance */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted">
              Apparence
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
 settings.theme === 'dark'
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-surface text-muted '
 }`}
              >
                Bleu nuit doux
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
 settings.theme === 'light'
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-surface text-muted '
 }`}
              >
                Fond clair chaud
              </button>
            </div>
          </section>

          {/* Musical Notation */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted">
              Notation des accords
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ notation: 'intl' })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
 settings.notation === 'intl'
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-surface text-muted '
 }`}
              >
                <div className="text-sm font-semibold">Internationale</div>
                <div className="mt-0.5 tabular-nums text-xs opacity-75">C, Dm7, G7</div>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ notation: 'fr' })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
 settings.notation === 'fr'
 ? 'border-sky bg-sky/10 text-text '
 : 'border-line bg-surface text-muted '
 }`}
              >
                <div className="text-sm font-semibold">Française</div>
                <div className="mt-0.5 tabular-nums text-xs opacity-75">Do, Rém7, Sol7</div>
              </button>
            </div>
          </section>

          {/* Audio & Keyboard Helper */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted">
              Son et clavier d’aide
            </h3>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-text">
                Son des notes jouées (Web Audio)
              </span>
              <input
                type="checkbox"
                checked={settings.audioEnabled}
                onChange={(e) => onUpdateSettings({ audioEnabled: e.target.checked })}
                className="h-4 w-4 rounded accent-sky"
              />
            </label>

            {settings.audioEnabled && (
              <div>
                <div className="flex items-center justify-between text-xs text-muted">
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
                  className="mt-2 w-full accent-sky"
                />
              </div>
            )}

            {settings.audioEnabled && (
              <div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Instrument</span>
                  <span className="font-mono-tabular text-[11px]">
                    {instrumentStatus.state === 'loading'
                      ? `Chargement ${instrumentStatus.total > 0 ? `${instrumentStatus.loaded}/${instrumentStatus.total}` : '…'}`
                      : instrumentStatus.state === 'ready'
                        ? 'Son chargé'
                        : instrumentStatus.state === 'error'
                          ? 'Échec du chargement'
                          : ''}
                  </span>
                </div>
                <select
                  value={settings.instrument ?? 'piano'}
                  onChange={(e) =>
                    onUpdateSettings({ instrument: e.target.value as InstrumentId })
                  }
                  className="mt-2 w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-sm text-text"
                >
                  {INSTRUMENTS.map((instrument) => (
                    <option key={instrument.id} value={instrument.id}>
                      {instrument.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-muted">
                  Sons échantillonnés chargés à la demande (MIDI.js MusyngKite).
                  Le synthé de secours prend le relais pendant le chargement.
                </p>
                {latency && (
                  <p className="mt-1 text-[11px] text-muted">
                    Latence de sortie estimée : ~{Math.round(latency.totalMs)} ms
                    {latency.outputMs === 0 ? ' (estimation du navigateur)' : ''}.
                    Une sortie Bluetooth ajoute souvent 100 à 300 ms.
                  </p>
                )}
              </div>
            )}

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-text">
                Métronome léger en mode progression
              </span>
              <input
                type="checkbox"
                checked={settings.metronomeEnabled}
                onChange={(e) =>
                  onUpdateSettings({ metronomeEnabled: e.target.checked })
                }
                className="h-4 w-4 rounded accent-sky"
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border-2 border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950/70 dark:bg-emerald-950/20">
              <span>
                <span className="block text-sm font-semibold text-text">
                  Écouter puis reproduire
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  Joue l’accord modèle, affiche le geste sur le clavier, puis vous laisse le reproduire.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.listenAndRepeatEnabled}
                onChange={(e) =>
                  onUpdateSettings({ listenAndRepeatEnabled: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded accent-emerald-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-text">
                Afficher le nom des notes sur le clavier
              </span>
              <input
                type="checkbox"
                checked={settings.showKeyboardNotes}
                onChange={(e) =>
                  onUpdateSettings({ showKeyboardNotes: e.target.checked })
                }
                className="h-4 w-4 rounded accent-sky"
              />
            </label>
          </section>

          {/* MIDI */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-muted">
                Périphérique MIDI
              </h3>
              <button
                type="button"
                onClick={onRefreshMidi}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-press hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Actualiser</span>
              </button>
            </div>

            <div className="rounded-xl border-2 border-line bg-surface p-3.5 text-xs text-text">
              <p className="font-semibold">{midiStatusText}</p>
              {midiState.devices.length > 1 && (
                <select
                  value={midiState.activeDeviceId ?? ''}
                  onChange={(e) => onSelectMidiDevice(e.target.value)}
                  className="mt-2.5 w-full rounded-lg border-2 border-line bg-mist px-2.5 py-1.5 text-xs"
                >
                  {midiState.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {midiState.status !== 'connected' && (
                <p className="mt-1.5 text-muted">
                  Vous pouvez jouer librement avec le clavier virtuel interactif ou les touches du clavier d’ordinateur.
                </p>
              )}
            </div>
            {midiState.status === 'connected' && (
              <MidiMonitor subscribe={subscribeMidiRaw} notation={settings.notation} />
            )}
          </section>

          {/* Local Data */}
          <section className="space-y-3 border-t border-line pt-5">
            <h3 className="text-xs font-semibold tracking-wide text-muted">
              Données locales
            </h3>
            <p className="text-xs leading-relaxed text-muted">
              Vos réglages et statistiques sont enregistrés uniquement sur cet appareil.
              {isDemoData && ' Des données de démonstration sont actuellement affichées.'}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onRestoreDemoData}
                className="rounded-lg border-2 border-line bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-mist"
              >
                Charger données de démo
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
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
                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Confirmer la remise à zéro
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="text-xs text-muted hover:text-text"
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
