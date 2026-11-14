import { BandSequencer } from './bandSequencer';
import { LoopSpan, foldLoop, loopPassAt } from '../practice/loop';
import {
  MidiAnalysis,
  analyzeMidi,
  describeTracks,
  isClickTrackName,
  removeClickTracks,
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
  /** Channels (0–15) the learner muted for this song. */
  muted?: number[];
}

/**
 * The "band": plays an iReal-style MIDI file (bass, drums, optional piano
 * guide) and exposes a song clock in milliseconds that is anchored on
 * `performance.now()` — the same clock as Web MIDI timestamps.
 */
export class BackingTrack {
  private readonly band = new BandSequencer();
  private anchors: number[] = [];
  private loop: LoopSpan | null = null;
  private startedAt: number | null = null;
  /** Volume of each channel (0–15) when not muted. */
  private channelVolumes = new Map<number, number>();
  private muted = new Set<number>();
  analysis: MidiAnalysis | null = null;

  /** Must be called from a user gesture (or after one) so the browser allows audio. */
  constructor() {}

  async load(original: ArrayBuffer, opts: BackingOptions): Promise<MidiAnalysis> {
    const analysis = analyzeMidi(original);
    // With the app's metronome, the file's own count-in goes (see removeClickTracks).
    const source = opts.metronomeBar === undefined ? original : removeClickTracks(original);
    let buffer = prepareDrumMapping(source, true).buffer;
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
    // Volume is per channel: a click track only sets it when no music shares the channel.
    const kept = describeTracks(source);
    const musicChannels = new Set(kept.filter((t) => !isClickTrackName(t.name)).map((t) => t.channel));
    for (const track of kept) {
      const isPiano = analysis.pianoChannels.includes(track.channel);
      const isClick = isClickTrackName(track.name) && !musicChannels.has(track.channel);
      this.channelVolumes.set(track.channel - 1, isPiano ? opts.pianoGuideVolume : isClick ? 0.9 : 0.85);
    }
    this.muted = new Set(opts.muted ?? []);
    this.channelVolumes.forEach((_, ch) => this.applyVolume(ch));
    this.analysis = { ...analysis, bpm: opts.bpm };
    return this.analysis;
  }

  setPianoGuideVolume(volume: number): void {
    this.analysis?.pianoChannels.forEach((ch) => {
      this.channelVolumes.set(ch - 1, volume);
      this.applyVolume(ch - 1);
    });
  }

  /** Mutes or unmutes one part (channel 0–15), live. */
  setMuted(channel: number, muted: boolean): void {
    if (muted) this.muted.add(channel);
    else this.muted.delete(channel);
    this.applyVolume(channel);
  }

  private applyVolume(channel: number): void {
    this.band.setChannelVolume(channel, this.muted.has(channel) ? 0 : (this.channelVolumes.get(channel) ?? 0.85));
  }

  async start(): Promise<boolean> {
    this.anchors = [];
    const ok = await this.band.start();
    this.startedAt = performance.now();
    return ok;
  }

  /** Stops the band where it is (resume with resumeAt). */
  pause(): void {
    this.anchors = [];
    this.startedAt = null;
    this.band.stop();
  }

  /**
   * Plays again from `songMs`, after one bar of metronome clicks so the
   * learner can find the pulse (`barMs`, `beatsPerBar` from the timeline).
   */
  async resumeAt(songMs: number, barMs: number, beatsPerBar: number): Promise<boolean> {
    const fromS = songMs / 1000;
    const barS = barMs / 1000;
    this.band.setClicks(
      Array.from({ length: beatsPerBar }, (_, b) => ({ time: fromS - barS + (b * barS) / beatsPerBar, accent: b === 0 })),
    );
    this.anchors = [];
    const ok = await this.band.start(fromS, barS);
    this.startedAt = performance.now() + barS * 1000 - songMs;
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
  songMs(perfTime = performance.now(), latencyMs = 0, leadMs = 0): number | null {
    const t = this.linearMs(perfTime, latencyMs);
    return t === null ? null : this.mapLoop(t, leadMs);
  }

  /** Song time on a continuous clock: with a loop it keeps growing past its end. */
  linearMs(perfTime = performance.now(), latencyMs = 0): number | null {
    let anchor: number | null = null;
    if (this.anchors.length > 0) {
      const sorted = [...this.anchors].sort((a, b) => a - b);
      anchor = sorted[sorted.length >> 1];
    } else if (this.startedAt !== null) {
      anchor = this.startedAt;
    }
    return anchor === null ? null : perfTime - anchor - latencyMs;
  }

  /**
   * Loops the band over [fromMs, toMs) of the song (null = no loop). Set it
   * before resumeAt().
   */
  setLoop(loop: LoopSpan | null): void {
    this.loop = loop && loop.toMs > loop.fromMs ? loop : null;
    this.band.setLoop(this.loop ? { fromS: this.loop.fromMs / 1000, toS: this.loop.toMs / 1000 } : null);
  }

  /**
   * Continuous time → time in the song, folded into the loop. `leadMs`: the
   * last moments of a pass already belong to the next one (a chord played a
   * little early, before the loop's first bar comes round again).
   */
  mapLoop(t: number, leadMs = 0): number {
    return foldLoop(t, this.loop, leadMs);
  }

  /** How many passes of the loop are over at continuous time `t` (with the same lead). */
  loopPass(t: number, leadMs = 0): number {
    return loopPassAt(t, this.loop, leadMs);
  }

  /** Stops and releases the audio context (call when leaving the screen). */
  async dispose(): Promise<void> {
    await this.stop();
    await this.band.close();
  }
}
