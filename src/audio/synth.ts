interface ActiveVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class PianoSynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private voices = new Map<number, ActiveVoice>();
  private enabled = true;
  private volume = 0.65;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.45, this.ctx.currentTime, 0.02);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume * 0.45;
      this.masterGain.connect(this.ctx.destination);
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
