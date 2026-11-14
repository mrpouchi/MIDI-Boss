import { parseMidi } from 'midi-file';
import { CacheStorage, ElectricPiano, Smolken, Soundfont, SplendidGrandPiano, Versilian } from 'smplr';
import WebAudioFontPlayer from 'webaudiofontplayer';
import { SoundOption, familyOf, resolveSound, soundfontName, wafProgram } from './bandInstruments';
import { drumKitPreset, presetFor } from './presets';

/** A smplr instrument: notes scheduled at an exact AudioContext time too. */
interface SampledInstrument {
  ready: Promise<unknown>;
  start(event: { note: number; velocity?: number; time?: number; duration?: number | null }): unknown;
  stop(): void;
  dispose(): void;
}

type Voice =
  | { kind: 'waf'; gain: GainNode; player: WebAudioFontPlayer }
  | { kind: 'smplr'; gain: GainNode; instrument: SampledInstrument };


/**
 * The band, scheduled on the audio clock.
 *
 * midi-audio-player starts every note "now" from a setTimeout loop, so each
 * note lands a few to tens of milliseconds late, by a varying amount, and the
 * tempo wobbles whenever the page is busy. Here every note gets its exact start
 * time on the AudioContext clock, a few hundred milliseconds ahead
 * (classic look-ahead scheduling): the timer only decides *when to queue*,
 * never *when it sounds*.
 */

export interface ScheduledNote {
  /** Seconds from the start of the file. */
  time: number;
  duration: number;
  /** MIDI channel 0–15. */
  channel: number;
  note: number;
  velocity: number;
}

export interface NoteSchedule {
  notes: ScheduledNote[];
  /** MIDI program per channel that plays notes (drums: channel 9). */
  programs: Map<number, number>;
  durationS: number;
}

const DRUM_CHANNEL = 9;
/** Drums are one-shot: they ring for their sample's length. */
const DRUM_RING_S = 3;
/** Same loudness curve as midi-audio-player (REFERENCE_GAIN · (v/127)²). */
const REFERENCE_GAIN = 0.15;

/** Pure: every note of a MIDI file with its start time and length in seconds. */
export function buildNoteSchedule(buffer: ArrayBuffer): NoteSchedule {
  const parsed = parseMidi(new Uint8Array(buffer));
  const tpb = parsed.header.ticksPerBeat ?? 480;

  // Tempo map (ticks → seconds), merged from every track.
  const tempos: { tick: number; uspb: number }[] = [];
  for (const track of parsed.tracks) {
    let tick = 0;
    for (const e of track) {
      tick += e.deltaTime;
      if (e.type === 'setTempo') tempos.push({ tick, uspb: e.microsecondsPerBeat });
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, uspb: 500_000 });
  const segments: { tick: number; seconds: number; uspb: number }[] = [];
  let seconds = 0;
  tempos.forEach((t, i) => {
    if (i > 0) seconds += ((t.tick - tempos[i - 1].tick) * tempos[i - 1].uspb) / tpb / 1e6;
    segments.push({ tick: t.tick, seconds, uspb: t.uspb });
  });
  const toSeconds = (tick: number) => {
    let s = segments[0];
    for (const seg of segments) {
      if (seg.tick > tick) break;
      s = seg;
    }
    return s.seconds + ((tick - s.tick) * s.uspb) / tpb / 1e6;
  };

  const notes: ScheduledNote[] = [];
  const programs = new Map<number, number>();
  const declared = new Map<number, number>();
  let end = 0;
  for (const track of parsed.tracks) {
    let tick = 0;
    const open = new Map<string, { tick: number; velocity: number }[]>();
    for (const e of track) {
      tick += e.deltaTime;
      if (e.type === 'programChange' && !declared.has(e.channel)) declared.set(e.channel, e.programNumber);
      const isOn = e.type === 'noteOn' && e.velocity > 0;
      const isOff = e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0);
      if (!isOn && !isOff) continue;
      if (e.type !== 'noteOn' && e.type !== 'noteOff') continue;
      const key = `${e.channel}:${e.noteNumber}`;
      if (isOn) {
        if (!programs.has(e.channel)) programs.set(e.channel, declared.get(e.channel) ?? 0);
        if (e.channel === DRUM_CHANNEL) {
          const time = toSeconds(tick);
          notes.push({ time, duration: DRUM_RING_S, channel: e.channel, note: e.noteNumber, velocity: e.velocity });
          end = Math.max(end, time);
        } else {
          const list = open.get(key) ?? [];
          list.push({ tick, velocity: e.velocity });
          open.set(key, list);
        }
      } else if (e.channel !== DRUM_CHANNEL) {
        const start = open.get(key)?.shift();
        if (!start) continue;
        const time = toSeconds(start.tick);
        const off = toSeconds(tick);
        notes.push({ time, duration: Math.max(0.03, off - time), channel: e.channel, note: e.noteNumber, velocity: start.velocity });
        end = Math.max(end, off);
      }
    }
    // Notes never released: one beat.
    for (const [key, list] of open) {
      const [channel, note] = key.split(':').map(Number);
      for (const start of list) {
        const time = toSeconds(start.tick);
        notes.push({ time, duration: 0.5, channel, note, velocity: start.velocity });
        end = Math.max(end, time + 0.5);
      }
    }
  }
  // Late programs declared after notes still apply to their channel.
  for (const [channel, program] of declared) if (programs.has(channel)) programs.set(channel, program);
  notes.sort((a, b) => a.time - b.time);
  return { notes, programs, durationS: end };
}

const LOOKAHEAD_S = 0.3;
const TICK_MS = 25;
/** A note this late (tab throttled, machine busy) is skipped rather than played in a burst. */
const MAX_LATE_S = 0.08;

export class BandSequencer {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly channels = new Map<number, Voice>();
  private volumes = new Map<number, number>();
  private schedule: NoteSchedule | null = null;
  private next = 0;
  private startAt: number | null = null;
  private timer: number | null = null;
  private clicks: { time: number; accent: boolean }[] = [];
  private nextClick = 0;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    // Gentle bus: compressor, a touch of room, master level.
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 3;
    const dry = this.ctx.createGain();
    const wet = this.ctx.createGain();
    wet.gain.value = 0.14;
    const reverb = this.ctx.createConvolver();
    reverb.buffer = roomImpulse(this.ctx, 1.6);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(compressor);
    compressor.connect(dry);
    compressor.connect(reverb);
    reverb.connect(wet);
    dry.connect(this.ctx.destination);
    wet.connect(this.ctx.destination);
  }

  /**
   * Loads the file's instruments (downloaded once, then cached). `sounds`:
   * the sound id chosen for some channels (0–15); the others get their default.
   */
  async load(buffer: ArrayBuffer, sounds: Record<number, string> = {}): Promise<NoteSchedule> {
    this.stop();
    const schedule = buildNoteSchedule(buffer);
    this.schedule = schedule;
    await Promise.all(
      [...schedule.programs].map(async ([channel, program]) => {
        const gain = this.ctx.createGain();
        gain.gain.value = this.volumes.get(channel) ?? 1;
        gain.connect(this.master);
        const voice = await createVoice(this.ctx, resolveSound(program, channel, sounds[channel]), program, channel, gain);
        closeVoice(this.channels.get(channel));
        this.channels.set(channel, voice);
      }),
    );
    return schedule;
  }

  /**
   * Metronome clicks (seconds from the start of the file), synthesised so they
   * cut clearly through the band: e.g. the bar before the learner comes in.
   */
  setClicks(clicks: { time: number; accent: boolean }[]): void {
    this.clicks = [...clicks].sort((a, b) => a.time - b.time);
  }

  /** Volume (0..1) of a MIDI channel (0–15). */
  setChannelVolume(channel: number, volume: number): void {
    this.volumes.set(channel, volume);
    const ch = this.channels.get(channel);
    if (ch) ch.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  async start(): Promise<boolean> {
    if (!this.schedule) return false;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.ctx.state !== 'running') return false;
    this.next = 0;
    this.nextClick = 0;
    this.startAt = this.ctx.currentTime + 0.12;
    this.pump();
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    return true;
  }

  /** Seconds into the file at the audio clock (null when stopped). */
  positionS(): number | null {
    return this.startAt === null ? null : this.ctx.currentTime - this.startAt;
  }

  get durationS(): number {
    return this.schedule?.durationS ?? 0;
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.startAt = null;
    for (const voice of this.channels.values()) {
      if (voice.kind === 'waf') void voice.player.cancelQueue();
      else voice.instrument.stop();
    }
  }

  async close(): Promise<void> {
    this.stop();
    for (const voice of this.channels.values()) closeVoice(voice);
    this.channels.clear();
    await this.ctx.close().catch(() => undefined);
  }

  /** Queues every note due within the look-ahead window, at its exact time. */
  private pump(): void {
    const schedule = this.schedule;
    if (!schedule || this.startAt === null) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD_S;
    while (this.next < schedule.notes.length) {
      const n = schedule.notes[this.next];
      const when = this.startAt + n.time;
      if (when > horizon) break;
      this.next++;
      if (when < now - MAX_LATE_S) continue;
      const ch = this.channels.get(n.channel);
      if (!ch) continue;
      if (ch.kind === 'smplr') {
        ch.instrument.start({ note: n.note, velocity: n.velocity, time: when, duration: n.duration });
      } else {
        const volume = REFERENCE_GAIN * (n.velocity / 127) ** 2;
        ch.player.queueWaveTable(when, n.note, n.duration, volume);
      }
    }
    while (this.nextClick < this.clicks.length) {
      const c = this.clicks[this.nextClick];
      const when = this.startAt + c.time;
      if (when > horizon) break;
      this.nextClick++;
      if (when >= now - MAX_LATE_S) metronomeClick(this.ctx, this.ctx.destination, when, c.accent);
    }
    if (this.next >= schedule.notes.length && now > this.startAt + schedule.durationS + 3) this.stop();
  }
}

/** A short, soft room reverb (exponentially decaying noise). */
function roomImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return impulse;
}

function closeVoice(voice: Voice | undefined): void {
  if (!voice) return;
  if (voice.kind === 'waf') voice.player.close();
  else voice.instrument.dispose();
  voice.gain.disconnect();
}

let sampleCacheForVoices: InstanceType<typeof CacheStorage> | undefined;
function voiceStorage() {
  try {
    sampleCacheForVoices ??= new CacheStorage('midiboss-samples');
  } catch {
    sampleCacheForVoices = undefined;
  }
  return sampleCacheForVoices ? { storage: sampleCacheForVoices } : {};
}

/** Builds the voice of one part from a library sound; falls back to the General MIDI bank. */
async function createVoice(ctx: AudioContext, option: SoundOption, program: number, channel: number, gain: GainNode): Promise<Voice> {
  const source = option.source;
  if (source.engine === 'smplr') {
    // Trim to the General MIDI banks' level (see bandInstruments.ts).
    const trim = ctx.createGain();
    trim.gain.value = source.trim;
    trim.connect(gain);
    const common = { destination: trim, volume: 100, ...voiceStorage() };
    let instrument: SampledInstrument;
    if (source.kind === 'smolken') instrument = Smolken(ctx, { ...common, instrument: source.instrument });
    else if (source.kind === 'versilian') instrument = Versilian(ctx, { ...common, instrument: source.instrument });
    else if (source.kind === 'electricPiano') instrument = ElectricPiano(ctx, { ...common, instrument: source.instrument });
    else if (source.kind === 'soundfont') instrument = Soundfont(ctx, { ...common, kit: 'MusyngKite', instrument: soundfontName(source, program) });
    else instrument = SplendidGrandPiano(ctx, { ...common, decayTime: 0.6 });
    try {
      await instrument.ready;
      return { kind: 'smplr', gain, instrument };
    } catch {
      instrument.dispose();
      trim.disconnect();
    }
  }
  const preset =
    'drumKit' in source
      ? await drumKitPreset(source.drumKit)
      : channel === DRUM_CHANNEL
        ? await drumKitPreset('midiboss_jazz_kit')
        : await presetFor('bank' in source ? source.bank : 'AirFont380', 'bank' in source ? wafProgram(source, program) : program);
  const player = await WebAudioFontPlayer.load(preset, ctx, { input: gain });
  return { kind: 'waf', gain, player };
}

/** A crisp metronome tick: short sine burst, higher and louder on beat 1. */
function metronomeClick(ctx: BaseAudioContext, destination: AudioNode, when: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1320;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.35, when + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(env);
  env.connect(destination);
  osc.start(when);
  osc.stop(when + 0.06);
}

/** A short phrase in the instrument's range, to hear a sound before choosing it. */
function auditionNotes(program: number, channel: number): { time: number; note: number; velocity: number; duration: number }[] {
  const family = familyOf(program, channel);
  if (family === 'drums') {
    // Ride pattern with kick and snare, one bar.
    return [
      { time: 0, note: 51, velocity: 90, duration: 2 }, { time: 0, note: 36, velocity: 90, duration: 1 },
      { time: 0.5, note: 51, velocity: 80, duration: 2 }, { time: 0.5, note: 44, velocity: 70, duration: 1 },
      { time: 0.83, note: 51, velocity: 70, duration: 2 }, { time: 1, note: 51, velocity: 90, duration: 2 },
      { time: 1, note: 38, velocity: 85, duration: 1 }, { time: 1.5, note: 51, velocity: 80, duration: 2 },
      { time: 1.5, note: 44, velocity: 70, duration: 1 }, { time: 1.83, note: 51, velocity: 70, duration: 2 },
    ];
  }
  const root = family === 'bass' ? 36 : family === 'sax' && program === 67 ? 48 : 60;
  const steps = family === 'bass' ? [0, 7, 12, 10, 7, 3] : [0, 4, 7, 11, 14, 12];
  const phrase = steps.map((s, i) => ({ time: i * 0.3, note: root + s, velocity: 90, duration: 0.28 }));
  if (family === 'piano' || family === 'organ' || family === 'guitar') {
    phrase.push(...[0, 4, 7, 11].map((s) => ({ time: 1.9, note: root + s, velocity: 85, duration: 1.2 })));
  }
  return phrase;
}

let audition: { ctx: AudioContext; voice: Voice } | null = null;
/** Plays a short phrase with a library sound (stops the previous audition). */
export async function auditionSound(option: SoundOption, program: number, channel: number): Promise<void> {
  await stopAudition();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ latencyHint: 'interactive' });
  const gain = ctx.createGain();
  gain.gain.value = 0.85;
  gain.connect(ctx.destination);
  const voice = await createVoice(ctx, option, program, channel, gain);
  audition = { ctx, voice };
  await ctx.resume().catch(() => undefined);
  const t0 = ctx.currentTime + 0.08;
  for (const n of auditionNotes(program, channel)) {
    if (voice.kind === 'smplr') voice.instrument.start({ note: n.note, velocity: n.velocity, time: t0 + n.time, duration: n.duration });
    else voice.player.queueWaveTable(t0 + n.time, n.note, n.duration, REFERENCE_GAIN * (n.velocity / 127) ** 2);
  }
  const mine = audition;
  window.setTimeout(() => {
    if (audition === mine) void stopAudition();
  }, 4500);
}

export async function stopAudition(): Promise<void> {
  const a = audition;
  audition = null;
  if (!a) return;
  closeVoice(a.voice);
  await a.ctx.close().catch(() => undefined);
}

export interface BandPart {
  /** MIDI channel 0–15. */
  channel: number;
  program: number;
  notes: number;
}

/** The parts of a song that a sound can be chosen for (count-in clicks excluded). */
export function listBandParts(buffer: ArrayBuffer, skipChannels: number[] = []): BandPart[] {
  const schedule = buildNoteSchedule(buffer);
  const counts = new Map<number, number>();
  for (const n of schedule.notes) counts.set(n.channel, (counts.get(n.channel) ?? 0) + 1);
  return [...schedule.programs]
    .filter(([channel]) => !skipChannels.includes(channel))
    .map(([channel, program]) => ({ channel, program, notes: counts.get(channel) ?? 0 }))
    .sort((a, b) => a.channel - b.channel);
}
