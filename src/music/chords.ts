export type ChordFamily =
  | 'maj'
  | 'min'
  | 'dim'
  | 'sus2'
  | 'sus4'
  | '7'
  | 'maj7'
  | 'm7'
  | 'm7b5'
  | 'dim7';

export type NotationSystem = 'intl' | 'fr';

export type VoicingStep = 'root' | 'root-5th' | 'triad' | 'full';

export interface VoicingStepMeta {
  id: VoicingStep;
  order: number;
  labelFr: string;
  shortLabelFr: string;
  descriptionFr: string;
}

export const VOICING_STEP_ORDER: VoicingStep[] = [
  'root',
  'root-5th',
  'triad',
  'full',
];

export const VOICING_STEPS: Record<VoicingStep, VoicingStepMeta> = {
  root: {
    id: 'root',
    order: 1,
    labelFr: 'Étape 1 · Fondamentale seule',
    shortLabelFr: '1 · Fondamentale',
    descriptionFr:
      'Jouez uniquement la note de base avec un doigt pour suivre l’harmonie sans effort.',
  },
  'root-5th': {
    id: 'root-5th',
    order: 2,
    labelFr: 'Étape 2 · Fondamentale + Quinte',
    shortLabelFr: '2 · Fond. + Quinte',
    descriptionFr:
      'Ajoutez la quinte (2 doigts) pour poser l’ossature stable de chaque accord.',
  },
  triad: {
    id: 'triad',
    order: 3,
    labelFr: 'Étape 3 · Triade (1 · 3 · 5)',
    shortLabelFr: '3 · Triade',
    descriptionFr:
      'Ajoutez la tierce (ou seconde/quarte suspendue) pour entendre la couleur majeure ou mineure.',
  },
  full: {
    id: 'full',
    order: 4,
    labelFr: 'Étape 4 · Accord complet',
    shortLabelFr: '4 · Complet (7e)',
    descriptionFr:
      'Jouez l’accord complet avec ses extensions (7e), dans le renversement de votre choix.',
  },
};

export interface ChordFamilyMeta {
  id: ChordFamily;
  labelFr: string;
  intlSuffix: string;
  frSuffix: string;
  intervals: readonly number[];
  intervalLabels: readonly string[];
}

export interface ChordDefinition {
  id: string;
  root: number; // 0 = C, 1 = C#/Db, ..., 11 = B
  family: ChordFamily;
  pitchClasses: number[]; // Unique modulo-12 pitch classes
}

export const CHORD_FAMILIES: Record<ChordFamily, ChordFamilyMeta> = {
  maj: {
    id: 'maj',
    labelFr: 'Majeur',
    intlSuffix: '',
    frSuffix: '',
    intervals: [0, 4, 7],
    intervalLabels: ['1', '3', '5'],
  },
  min: {
    id: 'min',
    labelFr: 'Mineur',
    intlSuffix: 'm',
    frSuffix: 'm',
    intervals: [0, 3, 7],
    intervalLabels: ['1', '♭3', '5'],
  },
  dim: {
    id: 'dim',
    labelFr: 'Diminué',
    intlSuffix: 'dim',
    frSuffix: 'dim',
    intervals: [0, 3, 6],
    intervalLabels: ['1', '♭3', '♭5'],
  },
  sus2: {
    id: 'sus2',
    labelFr: 'Sus2',
    intlSuffix: 'sus2',
    frSuffix: 'sus2',
    intervals: [0, 2, 7],
    intervalLabels: ['1', '2', '5'],
  },
  sus4: {
    id: 'sus4',
    labelFr: 'Sus4',
    intlSuffix: 'sus4',
    frSuffix: 'sus4',
    intervals: [0, 5, 7],
    intervalLabels: ['1', '4', '5'],
  },
  '7': {
    id: '7',
    labelFr: '7e de dominante',
    intlSuffix: '7',
    frSuffix: '7',
    intervals: [0, 4, 7, 10],
    intervalLabels: ['1', '3', '5', '♭7'],
  },
  maj7: {
    id: 'maj7',
    labelFr: 'Majeur 7',
    intlSuffix: 'maj7',
    frSuffix: '7M',
    intervals: [0, 4, 7, 11],
    intervalLabels: ['1', '3', '5', '7'],
  },
  m7: {
    id: 'm7',
    labelFr: 'Mineur 7',
    intlSuffix: 'm7',
    frSuffix: 'm7',
    intervals: [0, 3, 7, 10],
    intervalLabels: ['1', '♭3', '5', '♭7'],
  },
  m7b5: {
    id: 'm7b5',
    labelFr: 'Demi-diminué (m7♭5)',
    intlSuffix: 'm7♭5',
    frSuffix: 'm7♭5',
    intervals: [0, 3, 6, 10],
    intervalLabels: ['1', '♭3', '♭5', '♭7'],
  },
  dim7: {
    id: 'dim7',
    labelFr: 'Diminué 7',
    intlSuffix: 'dim7',
    frSuffix: 'dim7',
    intervals: [0, 3, 6, 9],
    intervalLabels: ['1', '♭3', '♭5', '𝄫7'],
  },
};

export const ALL_CHORD_FAMILIES: ChordFamily[] = [
  'maj',
  'min',
  'dim',
  'sus2',
  'sus4',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'dim7',
];

/** The fifth of a chord may be perfect (7), diminished (6) or augmented (8). */
function isFifth(interval: number): boolean {
  return interval === 6 || interval === 7 || interval === 8;
}

const INTL_PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const FR_PITCH_NAMES = ['Do', 'Do#', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'] as const;

export function makeChordId(root: number, family: ChordFamily): string {
  const normalizedRoot = ((root % 12) + 12) % 12;
  return `${normalizedRoot}:${family}`;
}

export function createChord(root: number, family: ChordFamily): ChordDefinition {
  const normalizedRoot = ((root % 12) + 12) % 12;
  const meta = CHORD_FAMILIES[family];
  const pitchClasses = meta.intervals.map((interval) => (normalizedRoot + interval) % 12);
  return {
    id: makeChordId(normalizedRoot, family),
    root: normalizedRoot,
    family,
    pitchClasses,
  };
}

export function parseChordId(chordId: string): ChordDefinition | null {
  const [rootStr, family] = chordId.split(':');
  const root = Number(rootStr);
  if (!Number.isInteger(root) || root < 0 || root > 11) return null;
  if (!(family in CHORD_FAMILIES)) return null;
  return createChord(root, family as ChordFamily);
}

export function formatPitchClass(pitchClass: number, notation: NotationSystem): string {
  const pc = ((pitchClass % 12) + 12) % 12;
  return notation === 'fr' ? FR_PITCH_NAMES[pc] : INTL_PITCH_NAMES[pc];
}

export function formatChordName(chord: ChordDefinition, notation: NotationSystem): string {
  const rootName = formatPitchClass(chord.root, notation);
  const meta = CHORD_FAMILIES[chord.family];
  const suffix = notation === 'fr' ? meta.frSuffix : meta.intlSuffix;
  return `${rootName}${suffix}`;
}

export function formatChordId(chordId: string, notation: NotationSystem): string {
  const parsed = parseChordId(chordId);
  return parsed ? formatChordName(parsed, notation) : chordId;
}

export function getTargetIntervalsForStep(
  chord: ChordDefinition,
  step: VoicingStep,
): number[] {
  const meta = CHORD_FAMILIES[chord.family];
  if (step === 'root') {
    return [0];
  }
  if (step === 'root-5th') {
    return meta.intervals.filter((interval) => interval === 0 || isFifth(interval));
  }
  if (step === 'triad') {
    return meta.intervals.filter((interval) => interval < 10);
  }
  return [...meta.intervals];
}

export function getTargetPitchClassesForStep(
  chord: ChordDefinition,
  step: VoicingStep = 'full',
): number[] {
  const intervals = getTargetIntervalsForStep(chord, step);
  return intervals.map((interval) => (chord.root + interval) % 12);
}

export function getStepIntervalLabels(
  chord: ChordDefinition,
  step: VoicingStep = 'full',
): string[] {
  const meta = CHORD_FAMILIES[chord.family];
  if (step === 'root') return ['1'];
  if (step === 'root-5th') {
    return meta.intervalLabels.filter((_, idx) => meta.intervals[idx] === 0 || isFifth(meta.intervals[idx]));
  }
  if (step === 'triad') {
    return meta.intervalLabels.filter((_, idx) => meta.intervals[idx] < 10);
  }
  return [...meta.intervalLabels];
}

export function getChordNoteNames(
  chord: ChordDefinition,
  notation: NotationSystem,
  step: VoicingStep = 'full',
): string[] {
  return getTargetPitchClassesForStep(chord, step).map((pc) =>
    formatPitchClass(pc, notation),
  );
}

export function getSuggestedVoicingMidi(
  chord: ChordDefinition,
  baseOctave = 4,
  step: VoicingStep = 'full',
): number[] {
  const rootMidi = (baseOctave + 1) * 12 + chord.root;
  const intervals = getTargetIntervalsForStep(chord, step);
  return intervals.map((interval) => {
    const note = rootMidi + interval;
    // Keep suggested voicing cleanly inside C4 (60) - B5 (83) range
    return note > 83 ? note - 12 : note;
  });
}

export function getNextVoicingStep(step: VoicingStep): VoicingStep | null {
  const idx = VOICING_STEP_ORDER.indexOf(step);
  if (idx === -1 || idx >= VOICING_STEP_ORDER.length - 1) return null;
  return VOICING_STEP_ORDER[idx + 1];
}

const ROOT_TOKEN_MAP: Record<string, number> = {
  c: 0,
  do: 0,
  d: 2,
  re: 2,
  ré: 2,
  e: 4,
  mi: 4,
  f: 5,
  fa: 5,
  g: 7,
  sol: 7,
  a: 9,
  la: 9,
  b: 11,
  si: 11,
};

export interface ParsedProgressionResult {
  chords: ChordDefinition[];
  invalidTokens: string[];
}

export function parseChordToken(rawToken: string): ChordDefinition | null {
  const cleaned = rawToken.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/Δ/g, 'maj7');
  if (!cleaned) return null;

  const match = cleaned.match(/^(sol|do|ré|re|mi|fa|la|si|[a-gA-G])([#b]?)(.*)$/i);
  if (!match) return null;

  const [, rootToken, accidental, rawSuffix] = match;
  const basePc = ROOT_TOKEN_MAP[rootToken.toLowerCase()];
  if (basePc === undefined) return null;

  let pc = basePc;
  if (accidental === '#') pc = (pc + 1) % 12;
  if (accidental === 'b') pc = (pc + 11) % 12;

  const suffix = rawSuffix.trim().toLowerCase();
  let family: ChordFamily | null = null;

  if (['m7b5', 'm7♭5', 'min7b5', '-7b5', 'ø', 'ø7', 'h', 'h7'].includes(suffix.replace(/♭/g, 'b'))) {
    family = 'm7b5';
  } else if (['dim7', 'o7', '°7'].includes(suffix)) {
    family = 'dim7';
  } else if (['dim', 'o', '°'].includes(suffix)) {
    family = 'dim';
  }

  if (family) {
    // already resolved above
  } else if (suffix === '' || suffix === 'maj' || suffix === 'majeur') {
    family = 'maj';
  } else if (suffix === 'm' || suffix === 'min' || suffix === '-' || suffix === 'mineur') {
    family = 'min';
  } else if (suffix === 'sus2') {
    family = 'sus2';
  } else if (suffix === 'sus4' || suffix === 'sus') {
    family = 'sus4';
  } else if (suffix === '7' || suffix === 'dom7') {
    family = '7';
  } else if (suffix === 'maj7' || suffix === 'm7+' || (suffix === '7m' && rawSuffix.includes('M')) || suffix === '7maj') {
    family = 'maj7';
  } else if (suffix === 'm7' || suffix === 'min7' || suffix === '-7') {
    family = 'm7';
  }

  // Distinguish French '7M' (maj7) vs 'm7' (min7) cleanly
  if (rawSuffix.trim() === '7M' || rawSuffix.trim() === 'Maj7') {
    family = 'maj7';
  }

  if (!family) return null;
  return createChord(pc, family);
}

export function parseProgression(input: string): ParsedProgressionResult {
  const tokens = input
    .split(/[\s,;|–—→>/-]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const chords: ChordDefinition[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    const parsed = parseChordToken(token);
    if (parsed) {
      chords.push(parsed);
    } else {
      invalidTokens.push(token);
    }
  }

  return { chords, invalidTokens };
}

/** French name of an interval (in semitones above the root) inside a chord. */
export function intervalNameFr(semitones: number): string {
  const names: Record<number, string> = {
    0: 'fondamentale',
    1: 'neuvième mineure',
    2: 'seconde',
    3: 'tierce mineure',
    4: 'tierce majeure',
    5: 'quarte',
    6: 'quinte diminuée',
    7: 'quinte',
    8: 'quinte augmentée',
    9: 'sixte',
    10: 'septième mineure',
    11: 'septième majeure',
  };
  return names[((semitones % 12) + 12) % 12];
}

/** Intervals a step adds compared with the previous one (what is new to learn). */
export function getNewIntervalsForStep(chord: ChordDefinition, step: VoicingStep): number[] {
  const index = VOICING_STEP_ORDER.indexOf(step);
  if (index <= 0) return getTargetIntervalsForStep(chord, step);
  const before = new Set(getTargetIntervalsForStep(chord, VOICING_STEP_ORDER[index - 1]));
  return getTargetIntervalsForStep(chord, step).filter((i) => !before.has(i));
}
