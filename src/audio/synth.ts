import { CacheStorage, Soundfont, SplendidGrandPiano } from 'smplr';
import { LocalInstrument, SALAMANDER_PRESET_URL } from './localSounds';
import type { InstrumentId } from '../storage/types';

interface ActiveVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

export interface InstrumentDefinition {
  id: InstrumentId;
  label: string;
  soundfont: string;
  loop?: boolean;
  /**
   * 'splendid': the Splendid Grand Piano (multi-velocity sampled grand,
   * smpldsnds.github.io), far more natural than the General MIDI soundfont.
   */
  engine?: 'soundfont' | 'splendid' | 'salamander';
}

type LoadedInstrument =
  | ReturnType<typeof Soundfont>
  | ReturnType<typeof SplendidGrandPiano>
  | ReturnType<typeof LocalInstrument>;

/**
 * Salamander comes out ~7 dB below Splendid at velocity 90 (measured offline,
 * one C4 for 2 s: −34.8 vs −27.7 dB RMS); this boost matches them. Its wider
 * dynamic range (−16 dB at velocity 40) is kept.
 */
const SALAMANDER_KEYBOARD_GAIN = 2.27;

/** Samples are cached by the browser (Cache API): downloaded once, then offline. */
let sampleCache: InstanceType<typeof CacheStorage> | undefined;
function cachedStorage() {
  try {
    sampleCache ??= new CacheStorage('midiboss-samples');
  } catch {
    sampleCache = undefined;
  }
  return sampleCache;
}

export const INSTRUMENTS: InstrumentDefinition[] = [
  { id: 'piano', label: 'Grand piano Salamander (Yamaha C5)', soundfont: 'acoustic_grand_piano', engine: 'salamander' },
  { id: 'splendid', label: 'Grand piano Splendid', soundfont: 'acoustic_grand_piano', engine: 'splendid' },
  { id: 'rhodes', label: 'Piano électrique (Rhodes)', soundfont: 'electric_piano_1' },
  { id: 'vibraphone', label: 'Vibraphone', soundfont: 'vibraphone', loop: true },
  { id: 'organ', label: 'Orgue jazz', soundfont: 'drawbar_organ', loop: true },
];

export type InstrumentState = 'idle' | 'loading' | 'ready' | 'error';

export interface AudioLatencyInfo {
  baseMs: number;
  outputMs: number;
  totalMs: number;
  sampleRate: number;
}

export interface InstrumentStatus {
  id: InstrumentId;
  state: InstrumentState;
  loaded: number;
  total: number;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Highest keyboard volume: 3 = 300 %. Above 100 % the limiter keeps it clean. */
export const MAX_AUDIO_VOLUME = 3;
/** Master gain at 100 %, unchanged from before the boost existed. */
const UNITY_GAIN = 0.45;

class PianoSynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private voices = new Map<number, ActiveVoice>();
  private sampledVoices = new Map<number, () => void>();
  private instrument: LoadedInstrument | null = null;
  private instrumentId: InstrumentId = 'piano';
  private instrumentStatus: InstrumentStatus = {
    id: 'piano',
    state: 'idle',
    loaded: 0,
    total: 0,
  };
  private instrumentListeners = new Set<(status: InstrumentStatus) => void>();
  private loadToken = 0;
  private enabled = true;
  private volume = 0.65;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(MAX_AUDIO_VOLUME, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * UNITY_GAIN, this.ctx.currentTime, 0.02);
    }
  }

  getInstrumentStatus(): InstrumentStatus {
    return { ...this.instrumentStatus };
  }

  /**
   * Latence estimée de la sortie audio. `outputLatency` n'est pas disponible
   * dans tous les navigateurs : on retombe alors sur `baseLatency`.
   */
  getLatencyInfo(): AudioLatencyInfo | null {
    if (!this.ctx) return null;
    const base = Number.isFinite(this.ctx.baseLatency) ? this.ctx.baseLatency : 0;
    const output = Number.isFinite(this.ctx.outputLatency) ? this.ctx.outputLatency : 0;
    return {
      baseMs: base * 1000,
      outputMs: output * 1000,
      totalMs: (output > 0 ? output : base) * 1000,
      sampleRate: this.ctx.sampleRate,
    };
  }

  /**
   * À appeler sur la première interaction (clic / touche). Crée le contexte si
   * besoin et le débloque tout de suite, pour que la première note ne subisse
   * pas le coût de démarrage de la sortie audio.
   */
  primeFromGesture(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'running') return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    // Un buffer silencieux débloque la sortie sur Safari / iOS.
    try {
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Certains navigateurs refusent un buffer de 1 échantillon : sans effet.
    }
  }

  subscribeInstrument(listener: (status: InstrumentStatus) => void): () => void {
    this.instrumentListeners.add(listener);
    listener(this.getInstrumentStatus());
    return () => {
      this.instrumentListeners.delete(listener);
    };
  }

  private notifyInstrument(): void {
    const snapshot = this.getInstrumentStatus();
    this.instrumentListeners.forEach((listener) => listener(snapshot));
  }

  private updateInstrumentStatus(status: InstrumentStatus): void {
    this.instrumentStatus = status;
    this.notifyInstrument();
  }

  setInstrument(id: InstrumentId): void {
    const alreadyLoading =
      this.instrumentStatus.state === 'loading' && this.instrumentStatus.id === id;
    if (alreadyLoading) return;
    if (this.instrument && this.instrumentStatus.id === id && this.instrumentStatus.state === 'ready') {
      return;
    }
    this.loadInstrument(id, false);
  }

  /** `fallback`: the local Salamander is missing, load the online grand piano. */
  private loadInstrument(id: InstrumentId, fallback: boolean): void {
    this.instrumentId = id;
    this.loadToken += 1;
    const token = this.loadToken;

    this.stopAll();
    this.disposeInstrument();

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      this.updateInstrumentStatus({ id, state: 'error', loaded: 0, total: 0 });
      return;
    }

    const definition = INSTRUMENTS.find((item) => item.id === id) ?? INSTRUMENTS[0];
    this.updateInstrumentStatus({ id, state: 'loading', loaded: 0, total: 0 });

    const onLoadProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (
        token !== this.loadToken ||
        this.instrumentStatus.state === 'ready' ||
        this.instrumentStatus.state === 'error'
      ) {
        return;
      }
      this.updateInstrumentStatus({ id, state: 'loading', loaded, total });
    };
    const storage = cachedStorage();
    // Échantillons en ligne : le grand piano vient du Splendid Grand Piano
    // (plusieurs couches de vélocité), les autres de la banque MIDI.js
    // (MusyngKite). Le contexte peut rester suspendu tant que l'utilisateur
    // n'a pas interagi ; le décodage des samples fonctionne.
    // Salamander (local files, see local-sounds/README.md); Splendid if absent.
    const engine = definition.engine === 'salamander' && fallback ? 'splendid' : definition.engine;
    let boost: GainNode | null = null;
    if (engine === 'salamander') {
      boost = ctx.createGain();
      boost.gain.value = SALAMANDER_KEYBOARD_GAIN;
      boost.connect(this.masterGain);
    }
    const instrument: LoadedInstrument =
      engine === 'salamander' && boost
        ? LocalInstrument(ctx, { url: SALAMANDER_PRESET_URL, destination: boost, volume: 127, onLoadProgress })
        : engine === 'splendid'
        ? SplendidGrandPiano(ctx, {
            destination: this.masterGain,
            volume: 127,
            decayTime: 0.6,
            onLoadProgress,
            ...(storage ? { storage } : {}),
          })
        : Soundfont(ctx, {
            instrument: definition.soundfont,
            kit: 'MusyngKite',
            destination: this.masterGain,
            volume: 127,
            loadLoopData: definition.loop ?? false,
            onLoadProgress,
            ...(storage ? { storage } : {}),
          });
    this.instrument = instrument;

    instrument.ready
      .then(() => {
        if (token !== this.loadToken) {
          instrument.dispose();
          return;
        }
        this.updateInstrumentStatus({
          id,
          state: 'ready',
          loaded: instrument.loadProgress.loaded,
          total: instrument.loadProgress.total,
        });
      })
      .catch((error: unknown) => {
        if (token !== this.loadToken) return;
        console.warn("Impossible de charger l'instrument échantillonné", error);
        instrument.dispose();
        boost?.disconnect();
        if (this.instrument === instrument) this.instrument = null;
        if (engine === 'salamander') {
          // Files not in local-sounds/: the online grand piano instead.
          this.loadInstrument(id, true);
          return;
        }
        this.updateInstrumentStatus({ id, state: 'error', loaded: 0, total: 0 });
      });
  }

  private disposeInstrument(): void {
    if (!this.instrument) return;
    try {
      this.instrument.dispose();
    } catch {
      // L'instrument peut déjà être libéré après un changement rapide.
    }
    this.instrument = null;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        // 0 = plus petit buffer de sortie possible (Chrome : ~32 ms au lieu de
        // ~40 ms sur les haut-parleurs internes). Une valeur non zéro est
        // ignorée par certains navigateurs, d'où le repli explicite.
        this.ctx = new AudioCtx({ latencyHint: 0 });
      } catch {
        this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume * UNITY_GAIN;
      // Limiteur : transparent aux volumes normaux, il évite que le boost
      // (jusqu'à 300 %) sature quand on plaque un accord fort.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 4;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.12;
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  noteOn(midi: number, velocity = 96): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    this.noteOff(midi);

    // Une fois l'instrument échantillonné prêt, il remplace le synthé à
    // oscillateurs. Pendant le chargement (ou en cas d'échec réseau), on garde
    // le son de secours pour que le clavier reste jouable.
    if (this.instrument && this.instrumentStatus.state === 'ready') {
      try {
        const stop = this.instrument.start({ note: midi, velocity });
        this.sampledVoices.set(midi, stop);
        return;
      } catch {
        // Retombe sur le synthé à oscillateurs si l'échantillon est indisponible.
      }
    }

    const now = ctx.currentTime;
    const freq = midiToFrequency(midi);
    const velScale = Math.max(0.25, Math.min(1, velocity / 127));

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.18, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(4200, freq * 6), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2.2), now + 0.6);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.32 * velScale, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.14 * velScale, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.05 * velScale, now + 1.8);

    osc1.connect(filter);
    osc2.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);

    this.voices.set(midi, { osc1, osc2, gain, filter });
  }

  noteOff(midi: number): void {
    const stopSample = this.sampledVoices.get(midi);
    if (stopSample) {
      try {
        stopSample();
      } catch {
        // La voix échantillonnée peut déjà être terminée.
      }
      this.sampledVoices.delete(midi);
    }

    const voice = this.voices.get(midi);
    if (!voice || !this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      voice.osc1.stop(now + 0.16);
      voice.osc2.stop(now + 0.16);
    } catch {
      // Ignore already stopped oscillators
    }
    this.voices.delete(midi);
  }

  stopAll(): void {
    this.sampledVoices.forEach((stop) => {
      try {
        stop();
      } catch {
        // Voix déjà terminée.
      }
    });
    this.sampledVoices.clear();
    try {
      this.instrument?.stop();
    } catch {
      // Instrument en cours de libération.
    }
    Array.from(this.voices.keys()).forEach((midi) => this.noteOff(midi));
  }

  playChordPreview(midiNotes: number[], durationMs = 750): void {
    if (!this.enabled) return;
    midiNotes.forEach((midi, idx) => {
      window.setTimeout(() => {
        this.noteOn(midi, 82);
        window.setTimeout(() => {
          this.noteOff(midi);
        }, durationMs);
      }, idx * 28);
    });
  }

  playMetronomeTick(accent = false): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 980 : 720, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(accent ? 0.16 : 0.09, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

export const pianoSynth = new PianoSynthEngine();
