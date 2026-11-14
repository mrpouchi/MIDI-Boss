# MIDI Boss → plateforme d’apprentissage de l’harmonie jazz au clavier

Audit, architecture cible et plan de développement. Rédigé le 13 novembre 2026 à partir de la lecture
du code (pas des notes de passation, qui contenaient des affirmations fausses ou périmées).
Ce document remplace la version précédente du même fichier, qui reposait sur une analyse superficielle.

---

## Phase 1 — Audit

### 1.1 Stack réellement installée

| Domaine | Technologie | Remarque |
|---|---|---|
| UI | React 19.3, TypeScript 7, Vite 8, Tailwind 4 (`@tailwindcss/vite`), lucide-react | Pas de routeur : onglets gérés dans `App.tsx`. |
| Entrée | Web MIDI natif (`src/input/midi.ts`), clavier d’ordinateur (`keyboardMap.ts`), clavier virtuel | |
| Son de jeu | `smplr` (échantillons MusyngKite via CDN) + oscillateur de secours (`src/audio/synth.ts`) | |
| Lecteur MIDI | `midi-audio-player` + `midi-file` (`MidiPlayerPanel.tsx`) | Indépendant de la pratique. |
| iReal Pro | `@chordsketch/wasm` (`src/music/ireal.ts`) | Import de grilles en liste linéaire. |
| Persistance | `localStorage` clé `chord-practice:v1` (`src/storage/localStore.ts`) | Chargement tolérant, pas de migration versionnée. |
| Tests | **aucun** avant cette session → Vitest 5.0.5 ajouté (`npm test`) | |
| Inutilisés | `@google/genai`, `express`, `dotenv`, `motion`, `tsx` | Restes du gabarit initial ; à retirer après confirmation. |

### 1.2 Architecture actuelle

- `App.tsx` (559 l.) : navigation, Web MIDI, notes actives (fusion MIDI + clavier + virtuel), agrégation des
  sessions en statistiques (`handleCompleteSession`), progression des morceaux par XP.
- `PlayScreen.tsx` (≈1 400 l.) : génère la file d’exercices, valide en temps réel, gère trois modes
  (`lesson`, `session`, `progression`), le minuteur de mesure, l’XP, le flux « écouter puis reproduire »,
  la remise en file après erreur et tout le rendu. **Logique pédagogique et UI entièrement mélangées.**
- `src/practice/` : `curriculum.ts` (5 « morceaux » codés en dur = de simples grilles de 3–4 accords),
  `spacedRepetition.ts` (répétition espacée par accord × étape, et génération de la leçon du jour),
  `recommendations.ts` (classement par précision), `engine.ts` (séances aléatoires, résumé).
- `src/music/chords.ts` : 7 familles (`maj, min, sus2, sus4, 7, maj7, m7`) et 4 « étapes de voicing »
  (`root`, `root-5th`, `triad`, `full`). **Pas de diminué, de m7b5, de dim7, de renversements imposés,
  d’extensions ni de voicings jazz.**
- `src/music/validation.ts` : comparaison par classes de hauteur (toute octave et tout renversement acceptés).

### 1.3 Ce qui fonctionne (vérifié dans le code)

- Entrée MIDI Note On / Note Off (y compris Note On vélocité 0), CC 120/123 (panic), changement de
  périphérique via `onstatechange`, sélection du périphérique, états `connected / no-device /
  permission-denied / unsupported`.
- Validation d’accords tolérante aux octaves et aux renversements : adaptée aux claviers 25 touches.
- Trois modes de pratique, flux « écouter puis reproduire », répétition espacée, statistiques par accord,
  import iReal, lecteur MIDI avec mixage mémorisé, instruments échantillonnés.

### 1.4 Problèmes techniques

1. **Bug de cascade de la leçon du jour — cause trouvée et corrigée.** Chaque accord réussi enregistrait de
   l’XP de morceau → `App` créait un nouvel objet `songProgress` → `startWithConfig` (qui en dépendait)
   changeait d’identité → l’effet de lancement relançait **toute la séance** (retour au 1er accord, aperçu
   rejoué, verrous remis à zéro). Avec une main encore posée, l’accord affiché était revalidé, d’où la cascade.
   Les trois verrous ajoutés auparavant ne pouvaient rien y faire. Corrigé en lisant ces valeurs via des refs ;
   l’avance automatique ajoutée à la session précédente (inopérante, et contraire au flux « Continuer ») a été
   retirée.
2. **Aucun horodatage MIDI.** `WebMidiController` jette `event.timeStamp`. Impossible de mesurer rythme,
   durée des notes ou fluidité des enchaînements. Le temps de réponse actuel est `Date.now()` au moment où
   l’effet React s’exécute (bruité de plusieurs dizaines de ms).
3. **Validation pilotée par des effets React** (`useEffect` sur `activeNotes`) avec temporisations et verrous
   en refs : fragile, non testable. Un réducteur pur doit la remplacer (`lessonMachine.ts` existe mais n’est
   branché nulle part).
4. **Plage du clavier virtuel fixe** (C4–B5) et voicings suggérés forcés dans C4–B5 : correct pour 25 touches
   par hasard, mais aucun réglage de registre réel.
5. Aucun test, `PlayScreen` monolithique, contenu pédagogique codé dans les composants
   (textes d’étapes, astuces, morceaux).

### 1.5 Problèmes pédagogiques

1. **Pas de parcours depuis zéro** : la première leçon demande déjà de jouer « C » sans avoir appris où est le Do.
2. **Les « morceaux » ne sont pas des morceaux** : 3–4 accords en boucle, sans forme, sans rythme, sans
   durée ; aucune chanson réelle (Blue Bossa demande m7b5, absent du modèle).
3. **Une chanson = 4 étapes de voicing**, puis elle est « finie » : pas d’objectifs réutilisables ni cumulatifs.
4. **Aucune mesure par dimension** (notes / rythme / durée / changements / régularité / fluidité).
5. **XP**, barre d’XP, « +20 XP », « objectif quotidien » en nombre d’accords : récompenses artificielles,
   contraires à la vision.
6. **Pas d’explication théorique** reliée au geste (tierce majeure vs mineure, intervalles…).

### 1.6 Problèmes UX

1. Le design system `duo-*` (`index.css`) n’est appliqué qu’à quelques surfaces ; le reste garde le style
   pierre/indigo d’origine → deux identités visuelles cohabitent.
2. L’écran Aujourd’hui est un tableau de bord chargé (4 cartes, statistiques) au lieu d’un chemin clair.
3. L’écran de jeu affiche simultanément XP, ladder, notes, astuce, feedback, 3 boutons, clavier repliable :
   le clavier n’est pas l’élément central.
4. **Fonctionnalités factices ajoutées à la session précédente** : « Arbre de compétences » dont les
   compétences de base ne peuvent jamais être maîtrisées (donc tout reste verrouillé, « 0 / 16 » permanent)
   et « Analyse adaptative » calculée sur de fausses tentatives (`as any`) avec des dimensions jamais mesurées.
   → à remplacer par des versions alimentées par de vraies données (étape A4).

### 1.7 Possibilités réelles du MIDI

- Web MIDI fournit pour chaque message un horodatage haute résolution (`MIDIMessageEvent.timeStamp`,
  même horloge que `performance.now()`) : **mesure du timing et des durées possible**.
- Web MIDI **ne fournit pas** le nombre de touches ni la tessiture d’un clavier. On ne le détectera pas.
  Solution honnête : registre déclaré par l’utilisateur (« appuyez sur votre touche la plus grave puis la
  plus aiguë »), sinon validation par classes de hauteur (toute octave acceptée) — ce qui marche déjà.
- Novation Bass Station II : 25 touches, boutons de transposition d’octave (décalent les numéros de note,
  sans effet sur la validation par classes de hauteur). **À vérifier avec votre appareil** : c’est un synthé
  mono/paraphonique ; il faut confirmer qu’il envoie bien un Note On par touche lorsqu’on tient un accord.
  Un moniteur MIDI (étape A2) permettra de le constater plutôt que de le supposer.

---

## Phase 2 — Architecture cible

Principe : garder React + Vite + Tailwind + localStorage, séparer **données musicales**, **contenu
pédagogique**, **moteurs purs** et **interface**. Pas de nouveau framework (pas de routeur, pas de store
global) tant qu’il n’est pas nécessaire.

```
src/
  music/            théorie pure : accords (familles étendues), intervalles, voicings (avec registre), validation
  input/            Web MIDI + clavier ; flux d’événements horodatés NoteEvent {note, on, velocity, t}
  content/          DONNÉES pédagogiques, sans React
    skills.ts         graphe de compétences (id, dépendances, critères de maîtrise)
    songs/            chansons : forme, sections, accords avec durées en temps, tempo, style
    path.ts           parcours : unités → leçons (objectif, compétences, suite d’exercices, chanson)
  practice/         moteurs PURS et testés
    lessonMachine.ts  réducteur de leçon (démonstration → attente relâchement → jeu → confirmé)
    assessment.ts     mesures par dimension à partir des NoteEvent (notes, rythme, durée, changements…)
    mastery.ts        modèle de maîtrise par compétence (preuves, moyenne pondérée récente,
                      distinction erreur ponctuelle / difficulté récurrente)
    adaptive.ts       choix de l’exercice suivant / remédiation ciblée (ralentir, isoler, réduire les aides)
    spacedRepetition.ts (existant, conservé)
  storage/          schéma + chargement tolérant ; nouveaux champs optionnels (skillEvidence, songProgress v2)
  ui/
    screens/          Parcours, Bibliothèque (chansons + iReal + lecteur MIDI), Leçon (plein écran),
                      Compétences, Progrès, Pratique libre
    components/       clavier (central), cartes, boutons, feedback, etc.
```

Flux d’une leçon : `content/path` décrit la leçon → `lessonMachine` pilote les étapes → les `NoteEvent`
horodatés alimentent `assessment` → les résultats deviennent des preuves dans `mastery` (par compétence)
et dans la progression de chanson → `adaptive` choisit la suite. L’UI ne fait qu’afficher l’état et
transmettre les événements.

Mode de pratique libre : séparé de la leçon ; pas de limite de temps ; il enregistre aussi des preuves.

---

## Phase 3 — Plan de développement priorisé

Chaque étape est livrable seule. Critère commun : `npm run lint`, `npm test` et `npm run build` passent ;
pas de régression des modes existants.

### Phase A — Stabilité et honnêteté des données (en cours)

| # | Contenu | Fichiers | Risques | Critère de réussite |
|---|---|---|---|---|
| A1 ✅ | Corriger la cascade de leçon (cause racine) | `PlayScreen.tsx` | Faible | Une bonne réponse ne relance plus la séance ; à valider avec votre clavier |
| A2 | Événements MIDI horodatés + moniteur MIDI dans les réglages | `input/midi.ts`, `App.tsx`, `SettingsDrawer.tsx` | Faible | Chaque Note On/Off affiché avec son temps ; vérif. polyphonie Bass Station II |
| A3 | Retirer l’XP et l’objectif quotidien en nombre d’accords ; progression des chansons par réussite réelle | `curriculum.ts`, `PlayScreen.tsx`, `App.tsx`, `TodayScreen.tsx`, `SessionSummaryView.tsx` | Moyen (déblocage des étapes) | Plus aucun XP affiché ; étape de chanson validée par précision ≥ seuil sur une séance complète |
| A4 | Remplacer l’arbre et l’« analyse adaptative » factices par un modèle de maîtrise alimenté par les tentatives réelles | `practice/mastery.ts`, `content/skills.ts`, `ProgressScreen.tsx` | Moyen | Tests unitaires ; une dimension non mesurée est affichée « pas encore mesurée », jamais inventée |

### Phase B — Cœur pédagogique

| # | Contenu | Fichiers | Dépendances | Critère |
|---|---|---|---|---|
| B1 | Étendre la théorie : `dim`, `m7b5`, `dim7`, `6`, `m6` ; intervalles nommés | `music/chords.ts`, `music/intervals.ts` | — | Tests de construction/validation |
| B2 | Format de chanson (forme, sections, durées) + 1re vraie chanson (Blue Bossa, grille seule) | `content/songs/` | B1 | Grille chargée et jouable en progression |
| B3 | Objectifs de chanson réutilisables et cumulatifs (fondamentales → quintes → tierces → septièmes → rythme) | `content/songs`, `practice/mastery.ts`, `storage` | B2, A4 | Une chanson revient avec un nouvel objectif ; l’ancien reste rejouable |
| B4 | Parcours depuis zéro (fondations : touches noires/blanches, Do, 7 notes, octaves, demi-tons) | `content/path.ts`, nouveaux types d’exercices « trouver la note » | A2 | Un débutant absolu peut faire la leçon 1 sans connaître le clavier |
| B5 | Leçon pilotée par `lessonMachine` (découverte → essai → explication → application → autonomie) | `practice/lessonMachine.ts`, nouvel écran Leçon | B4 | Réducteur testé ; PlayScreen allégé |

### Phase C — Refonte UX (inspiration Duolingo, identité musicale)

C1 chemin de leçons (Parcours) comme écran d’accueil ; C2 écran de leçon plein écran avec clavier central,
barre de progression de leçon, feedback en bas d’écran (vert/rouge) et bouton Continuer ; C3 Bibliothèque
de chansons (maîtrise, compétences, objectifs disponibles) ; C4 arbre de compétences visuel ; C5 harmonisation
de toutes les surfaces sur les tokens `duo-*`, mode sombre compris.

### Phase D — MIDI et mesure

D1 registre déclaré + voicings alternatifs hors registre ; D2 mesure du rythme et des durées sur une grille
de temps (métronome) ; D3 ralentissement / isolement automatique d’un passage difficile.

### Phase E — Musique

E1 accompagnement simplifié (basse + métronome) puis complet, swing et bossa, synchronisé sur la grille ;
E2 renversements, II-V-I, voicings jazz (guide tones, shells), extensions 9/11/13.

### Décisions pédagogiques à valider par vous

1. Seuil de validation d’une étape de chanson : proposé **≥ 85 % de précision des notes sur une séance
   complète, deux fois à des jours différents**.
2. Ordre des fondations : touches noires (groupes de 2 et 3) → Do → 7 notes → octaves → demi-tons.
3. Première chanson jazz : Blue Bossa (accessible, mineure, introduit m7b5 et la cadence II-V-I mineure).
4. Mains : main droite seule jusqu’aux septièmes ; main gauche (fondamentale) introduite avec le rythme.
