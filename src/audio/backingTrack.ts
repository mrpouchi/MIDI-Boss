import MidiAudioPlayer from 'midi-audio-player';
import {
  DRUM_CHANNEL,
  DRUM_KIT_PRESET,
  MidiAnalysis,
  analyzeMidi,
  describeTracks,
  prepareDrumMapping,
  setMidiTempo,
} from './midiFile';

export interface BackingOptions {
  /** Playback tempo; the file is rewritten so the band really plays at this speed. */
  bpm: number;
  /** Volume (0..1) of the file's own piano part: 0 = the learner is the pianist. */
  pianoGuideVolume: number;
}

/**
 * The "band": plays an iReal-style MIDI file (bass, drums, optional piano
 * guide) and exposes a song clock in milliseconds that is anchored on
 * `performance.now()` — the same clock as Web MIDI timestamps.
 */
export class BackingTrack {
  private readonly player: MidiAudioPlayer;
  private durationS = 0;
  private anchors: number[] = [];
  private startedAt: number | null = null;
  analysis: MidiAnalysis | null = null;

  /** Must be called from a user gesture so the browser allows audio. */
  constructor() {
    this.player = new MidiAudioPlayer({ volume: 0.85, reverb: 0.14, preferred: ['FluidR3_GM'] });
    this.player.on('computed', (data) => {
      this.durationS = data.duration;
    });
  }

  async load(original: ArrayBuffer, opts: BackingOptions): Promise<MidiAnalysis> {
    const analysis = analyzeMidi(original);
    const tracks = describeTracks(original);
    let buffer = prepareDrumMapping(original, true).buffer;
    if (Math.abs(analysis.bpm - opts.bpm) > 0.01) buffer = setMidiTempo(buffer, opts.bpm);

    const presets: Record<string, string> = {};
    if (tracks.some((t) => t.channel === DRUM_CHANNEL)) presets[String(DRUM_CHANNEL)] = DRUM_KIT_PRESET;
    await this.player.load(buffer, { presets, volumes: {} });
    for (const track of tracks) {
      const isPiano = analysis.pianoChannels.includes(track.channel);
      const isClick = track.name.trim().toLowerCase() === 'click';
      this.player.setChannelVolume(track.channel, isPiano ? opts.pianoGuideVolume : isClick ? 0.9 : 0.85);
    }
    this.analysis = { ...analysis, bpm: opts.bpm };
    return this.analysis;
  }

  setPianoGuideVolume(volume: number): void {
    this.analysis?.pianoChannels.forEach((ch) => this.player.setChannelVolume(ch, volume));
  }

  async start(): Promise<boolean> {
    this.anchors = [];
    const ok = await this.player.play();
    this.startedAt = performance.now();
    return ok;
  }

  async stop(): Promise<void> {
    this.startedAt = null;
    await this.player.stop().catch(() => undefined);
  }

  /** Player position in ms, from its own (audio-clock based) remaining time. */
  private playerPositionMs(): number | null {
    if (!this.durationS) return null;
    const remaining = this.player.getSongTimeRemaining();
    if (!Number.isFinite(remaining)) return null;
    return Math.max(0, (this.durationS - remaining) * 1000);
  }

  /**
   * Re-anchors the clock on the player's position. Call it every frame:
   * the median of recent samples smooths out the player's coarse updates.
   */
  sync(perfNow = performance.now()): void {
    const pos = this.playerPositionMs();
    if (pos === null || pos <= 0) return;
    this.anchors.push(perfNow - pos);
    if (this.anchors.length > 30) this.anchors.shift();
  }

  /**
   * Song time (ms) corresponding to a `performance.now()` instant.
   * `latencyMs` shifts the clock to what the learner actually hears.
   */
  songMs(perfTime = performance.now(), latencyMs = 0): number | null {
    let anchor: number | null = null;
    if (this.anchors.length > 0) {
      const sorted = [...this.anchors].sort((a, b) => a - b);
      anchor = sorted[sorted.length >> 1];
    } else if (this.startedAt !== null) {
      anchor = this.startedAt;
    }
    return anchor === null ? null : perfTime - anchor - latencyMs;
  }

  /** Stops and releases the audio context (call when leaving the screen). */
  async dispose(): Promise<void> {
    await this.stop();
    await this.player.close().catch(() => undefined);
  }
}
