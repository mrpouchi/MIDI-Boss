import { BandSequencer } from './bandSequencer';
import {
  MidiAnalysis,
  analyzeMidi,
  describeTracks,
  prepareDrumMapping,
  setMidiTempo,
  truncateMidiToBars,
} from './midiFile';

export interface BackingOptions {
  /** Playback tempo; the file is rewritten so the band really plays at this speed. */
  bpm: number;
  /** Volume (0..1) of the file's own piano part: 0 = the learner is the pianist. */
  pianoGuideVolume: number;
  /** Play only this many bars from the start (count-in included); the rest is cut. */
  bars?: number;
  /** Sound chosen per MIDI channel (0–15), ids of the sound library. */
  sounds?: Record<number, string>;
  /**
   * Bar (0-based) where a metronome clicks every beat: the bar before the
   * learner comes in. The file's own count-in clicks are then muted.
   */
  metronomeBar?: number;
}

/**
 * The "band": plays an iReal-style MIDI file (bass, drums, optional piano
 * guide) and exposes a song clock in milliseconds that is anchored on
 * `performance.now()` — the same clock as Web MIDI timestamps.
 */
export class BackingTrack {
  private readonly band = new BandSequencer();
  private anchors: number[] = [];
  private startedAt: number | null = null;
  analysis: MidiAnalysis | null = null;

  /** Must be called from a user gesture (or after one) so the browser allows audio. */
  constructor() {}

  async load(original: ArrayBuffer, opts: BackingOptions): Promise<MidiAnalysis> {
    const analysis = analyzeMidi(original);
    const tracks = describeTracks(original);
    let buffer = prepareDrumMapping(original, true).buffer;
    if (Math.abs(analysis.bpm - opts.bpm) > 0.01) buffer = setMidiTempo(buffer, opts.bpm);
    if (opts.bars !== undefined && opts.bars < analysis.totalBars) buffer = truncateMidiToBars(buffer, opts.bars);

    await this.band.load(buffer, opts.sounds);
    const beatS = 60 / opts.bpm;
    this.band.setClicks(
      opts.metronomeBar === undefined
        ? []
        : Array.from({ length: analysis.beatsPerBar }, (_, b) => ({
            time: (opts.metronomeBar! * analysis.beatsPerBar + b) * beatS,
            accent: b === 0,
          })),
    );
    // Channels here are 1–16 (describeTracks), the sequencer counts 0–15.
    for (const track of tracks) {
      const isPiano = analysis.pianoChannels.includes(track.channel);
      const isClick = track.name.trim().toLowerCase() === 'click';
      const clickVolume = opts.metronomeBar === undefined ? 0.9 : 0;
      this.band.setChannelVolume(track.channel - 1, isPiano ? opts.pianoGuideVolume : isClick ? clickVolume : 0.85);
    }
    this.analysis = { ...analysis, bpm: opts.bpm };
    return this.analysis;
  }

  setPianoGuideVolume(volume: number): void {
    this.analysis?.pianoChannels.forEach((ch) => this.band.setChannelVolume(ch - 1, volume));
  }

  async start(): Promise<boolean> {
    this.anchors = [];
    const ok = await this.band.start();
    this.startedAt = performance.now();
    return ok;
  }

  async stop(): Promise<void> {
    this.startedAt = null;
    this.band.stop();
  }

  /** Position in the file (ms) on the audio clock: every note is scheduled on it. */
  private playerPositionMs(): number | null {
    const s = this.band.positionS();
    return s === null ? null : s * 1000;
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
    await this.band.close();
  }
}
