import { ChordFamily, VoicingStep } from '../music/chords';

/**
 * Competency graph — pedagogical DATA only (no React, no scoring logic).
 *
 * `evidence` declares which recorded practice proves the skill. A skill with
 * `evidence: null` has no exercise yet: it is shown as such, never as
 * mastered or failed, so the tree never reports invented progress.
 */
export type SkillCategory = 'foundations' | 'harmony' | 'application' | 'jazz';

export interface SkillEvidenceRule {
  /** Spaced-repetition cards (chord × voicing step) that count for this skill. */
  steps: VoicingStep[];
  /**
   * Evidence comes from "play with the band" runs instead of cards: a run
   * counts when played at one of `steps` with the given minimum accuracies.
   */
  playAlong?: { minNotes: number; minTiming: number };
  /** Restrict to these chord families; omit to accept every family. */
  families?: ChordFamily[];
  /** Only attempts played inside a progression count. */
  progressionOnly?: boolean;
}

export interface SkillNode {
  id: string;
  label: string;
  description: string;
  category: SkillCategory;
  /** Skills whose understanding this one builds on (informative, not a hard lock). */
  dependsOn: string[];
  evidence: SkillEvidenceRule | null;
}

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  foundations: 'Fondations',
  harmony: 'Construction harmonique',
  application: 'Application musicale',
  jazz: 'Jazz',
};

export const SKILLS: SkillNode[] = [
  // Fondations — exercises arrive with the "from zero" path (roadmap B4).
  { id: 'black-white-keys', label: 'Touches blanches et noires', description: 'Repérer les groupes de 2 et 3 touches noires.', category: 'foundations', dependsOn: [], evidence: null },
  { id: 'find-c', label: 'Trouver les Do', description: 'Le Do est juste à gauche du groupe de 2 touches noires.', category: 'foundations', dependsOn: ['black-white-keys'], evidence: null },
  { id: 'seven-notes', label: 'Les sept notes', description: 'Do Ré Mi Fa Sol La Si sur les touches blanches.', category: 'foundations', dependsOn: ['find-c'], evidence: null },
  { id: 'octaves', label: 'Octaves', description: 'La même note revient toutes les 12 touches.', category: 'foundations', dependsOn: ['seven-notes'], evidence: null },
  { id: 'semitones', label: 'Tons et demi-tons', description: 'Mesurer la distance entre deux touches voisines.', category: 'foundations', dependsOn: ['octaves'], evidence: null },

  // Construction harmonique
  { id: 'chord-roots', label: 'Fondamentales', description: 'Trouver la note qui donne son nom à l’accord.', category: 'harmony', dependsOn: ['seven-notes'], evidence: { steps: ['root'] } },
  { id: 'fifths', label: 'Quintes', description: 'Ajouter la quinte : l’ossature de l’accord.', category: 'harmony', dependsOn: ['chord-roots', 'semitones'], evidence: { steps: ['root-5th'] } },
  { id: 'major-triads', label: 'Triades majeures', description: 'Tierce majeure (4 demi-tons) + quinte.', category: 'harmony', dependsOn: ['fifths'], evidence: { steps: ['triad', 'full'], families: ['maj'] } },
  { id: 'minor-triads', label: 'Triades mineures', description: 'Tierce mineure (3 demi-tons) : la couleur sombre.', category: 'harmony', dependsOn: ['fifths'], evidence: { steps: ['triad', 'full'], families: ['min'] } },
  { id: 'suspended', label: 'Accords suspendus', description: 'Remplacer la tierce par la seconde ou la quarte.', category: 'harmony', dependsOn: ['major-triads'], evidence: { steps: ['triad', 'full'], families: ['sus2', 'sus4'] } },
  { id: 'sevenths', label: 'Accords de septième', description: 'maj7, m7 et 7 : les couleurs du jazz.', category: 'harmony', dependsOn: ['major-triads', 'minor-triads'], evidence: { steps: ['full'], families: ['maj7', 'm7', '7'] } },

  // Application musicale
  { id: 'chord-changes', label: 'Enchaîner les accords', description: 'Passer d’un accord à l’autre dans une grille.', category: 'application', dependsOn: ['chord-roots'], evidence: { steps: ['root', 'root-5th', 'triad', 'full'], progressionOnly: true } },
  { id: 'rhythm', label: 'Jouer en rythme', description: 'Placer chaque accord sur le temps, avec l’orchestre.', category: 'application', dependsOn: ['chord-changes'], evidence: { steps: ['root', 'root-5th', 'triad', 'full'], playAlong: { minNotes: 0.8, minTiming: 0.8 } } },
  { id: 'accompany', label: 'Accompagner une chanson', description: 'Jouer toute une grille en accords complets, en rythme.', category: 'application', dependsOn: ['rhythm', 'sevenths'], evidence: { steps: ['triad', 'full'], playAlong: { minNotes: 0.85, minTiming: 0.8 } } },

  // Jazz (roadmap B1 / E2)
  { id: 'half-diminished', label: 'm7♭5 et diminués', description: 'L’accord du II mineur.', category: 'jazz', dependsOn: ['sevenths'], evidence: null },
  { id: 'inversions', label: 'Renversements', description: 'Changer l’ordre des notes pour enchaîner sans sauter.', category: 'jazz', dependsOn: ['sevenths'], evidence: null },
  { id: 'ii-v-i', label: 'II-V-I', description: 'La cadence centrale du jazz.', category: 'jazz', dependsOn: ['sevenths', 'chord-changes'], evidence: null },
  { id: 'jazz-voicings', label: 'Voicings jazz', description: 'Shells, guide tones, positions rootless.', category: 'jazz', dependsOn: ['inversions', 'ii-v-i'], evidence: null },
  { id: 'extensions', label: 'Extensions 9 · 11 · 13', description: 'Enrichir les accords.', category: 'jazz', dependsOn: ['jazz-voicings'], evidence: null },
  { id: 'swing-bossa', label: 'Swing et bossa nova', description: 'Les rythmiques d’accompagnement.', category: 'jazz', dependsOn: ['rhythm', 'ii-v-i'], evidence: null },
];

export function getSkillById(id: string): SkillNode | undefined {
  return SKILLS.find((s) => s.id === id);
}
