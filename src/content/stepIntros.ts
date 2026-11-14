import { VoicingStep } from '../music/chords';

/**
 * What each voicing step introduces, shown before playing (pedagogical DATA).
 * Read calmly in the "Découverte" screen: no timer, no score.
 */
export interface StepIntro {
  /** The new notion, e.g. "la tierce". */
  notion: string;
  title: string;
  /** Two or three short sentences. */
  explanation: string;
  /** How to find it on the keyboard. */
  howTo: string;
}

export const STEP_INTROS: Record<VoicingStep, StepIntro> = {
  root: {
    notion: 'la fondamentale',
    title: 'La fondamentale',
    explanation:
      'C’est la note qui donne son nom à l’accord : la fondamentale de Dm7 est Ré, celle de E♭7 est Mi bémol. En la jouant seule, vous suivez déjà toute l’harmonie du morceau.',
    howTo: 'Un seul doigt. Lisez la lettre (ou la syllabe) au début du nom de l’accord.',
  },
  'root-5th': {
    notion: 'la quinte',
    title: 'Nouveau : la quinte',
    explanation:
      'La quinte se trouve 7 demi-tons au-dessus de la fondamentale. Elle rend l’accord solide, mais ne dit pas encore s’il est majeur ou mineur.',
    howTo: 'Depuis la fondamentale, comptez le plus souvent 5 touches blanches, la première comprise (Ré → La). Pouce et auriculaire, ou pouce et majeur.',
  },
  triad: {
    notion: 'la tierce',
    title: 'Nouveau : la tierce',
    explanation:
      'La tierce donne la couleur de l’accord. 3 demi-tons au-dessus de la fondamentale : tierce mineure, son plus sombre (Dm). 4 demi-tons : tierce majeure, son plus lumineux (D). Dans un accord « sus », elle est remplacée par la quarte.',
    howTo: 'Elle se place entre la fondamentale et la quinte : trois doigts, 1 – 3 – 5.',
  },
  full: {
    notion: 'la septième',
    title: 'Nouveau : la septième',
    explanation:
      'La septième donne le son jazz. 10 demi-tons au-dessus de la fondamentale : septième mineure (m7 et 7). 11 demi-tons : septième majeure (maj7), juste sous l’octave.',
    howTo: 'Un ton (ou un demi-ton pour maj7) sous la fondamentale de l’octave suivante. Quatre doigts, ou laissez tomber la quinte si la main est trop étirée.',
  },
};
