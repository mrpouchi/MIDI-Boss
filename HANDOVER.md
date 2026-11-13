# HANDOVER — MIDI Boss

## Design system — Duolingo-inspired adaptation (13 novembre 2026)

- Audit des références réalisé : règles publiques de couleur/typo/copy du dépôt `virgiliojr94/duolingo-ux-reference` et structure UI/CSS de `Abhijit-Kumar-GitHub/duolingo-clone`. Aucune police, marque ou asset propriétaire n'a été copié.
- `src/index.css` centralise maintenant une palette sémantique (green/blue/red/yellow + neutres), la typographie arrondie avec fallbacks système, rayons, ombres de pression, focus visible, composants `duo-*` et animations `duo-pop`/`duo-celebrate` respectueuses de `prefers-reduced-motion`.
- Application initiale aux surfaces les plus visibles : shell, navigation, Aujourd'hui, Progrès, configurateur, bilan et leçon MIDI. Les fonctionnalités métier/MIDI n'ont pas été touchées.
- Vérification technique : lint et build passent, Vite renvoie HTTP 200. La capture de screenshots automatisée n'a pas été possible : l'hôte navigateur CUA était indisponible dans cette session. À reprendre par une QA visuelle desktop/mobile réelle.

## Reprise immédiate — leçon du jour / bug de validation (priorité 1)

Mise à jour : 13 novembre 2026, fin de session. Cette section prévaut sur les notes historiques ci-dessous.

### Demande produit en cours

Transformer l’expérience en apprentissage progressif de piano : l’utilisateur doit pouvoir **écouter et regarder**, puis **reproduire** le geste. Le flux doit rester compréhensible pour une personne qui ne connaît pas les touches du piano. L’option doit être activable/désactivable dans les réglages.

### Implémenté et compilé

- `src/storage/types.ts` : ajout de `AppSettings.listenAndRepeatEnabled`.
- `src/storage/localStore.ts` : option activée par défaut ; le chargement fusionne déjà `DEFAULT_SETTINGS`, donc les anciennes sauvegardes restent compatibles.
- `src/ui/components/SettingsDrawer.tsx` : interrupteur **« Écouter puis reproduire »** dans « Son et clavier d’aide ».
- `src/ui/screens/PlayScreen.tsx` : pour chaque défi, le mode actif joue un accord modèle, force l’affichage de l’aide clavier et des noms de notes, puis affiche « Étape 2 · À vous de reproduire ».
- `src/ui/components/TopNav.tsx` et `src/ui/screens/TodayScreen.tsx` : première passe UX visible (« Piano Path », couleurs vertes, leçon quotidienne expliquée en étapes). Ce travail est secondaire face au bug ci-dessous.

### Blocage actif : cascade dans la leçon du jour

Le bug est **toujours présent**, confirmé par l’utilisateur, et **ne survient que dans la Leçon du jour** (`PracticeConfig.mode === 'lesson'`). Scénario rapporté : le premier accord est joué, le suivant est proposé ; quand le second est joué correctement, le premier et le second se déclenchent/avancent successivement de manière incontrôlée.

Tentatives déjà intégrées dans `PlayScreen.tsx`, sans résolution utilisateur :

1. `awaitingRelease` : blocage de validation jusqu’au relâchement des touches après une réussite.
2. `activeChallengeRef` / `resolvedChallengeRef` : identifiant `${currentIndex}:${chord.id}:${step}` pour empêcher une temporisation asynchrone obsolète de valider un autre défi.
3. `lessonReadyToAdvance` : après une réussite de leçon, l’UI doit demander un clic explicite sur **Continuer** (bouton désactivé si des notes sont maintenues).

Ne pas affirmer que ce bug est corrigé : il ne l’est pas. L’agent n’a pas pu reproduire visuellement, car l’hôte navigateur d’automatisation était indisponible ; la validation utilisateur prévaut.

### Hypothèse et plan de diagnostic recommandé

Le flux `lesson` possède une file mutable (`queue`) et peut réinsérer des items après une erreur. Il faut instrumenter et reproduire l’ordre réel des événements avant d’ajouter un autre verrou :

1. Ajouter temporairement des logs bornés (ou un panneau debug) pour : `challengeKey`, `currentIndex`, `activeNotes`, `feedback`, `isTransitioningRef.current`, `resolvedChallengeRef.current`, et chaque création d’`AttemptRecord`.
2. Reproduire avec le même périphérique que l’utilisateur ; distinguer clairement les `noteon` MIDI du clavier virtuel/ordinateur et l’audio d’aperçu (`pianoSynth.playChordPreview`).
3. Vérifier si deux `AttemptRecord` sont ajoutés pour un même `challengeKey`, ou si l’impression de double déclenchement vient d’un item dupliqué dans `generateDuolingoMicroLesson` / de la requeue.
4. Une fois la cause prouvée, simplifier le flux plutôt que d’empiler des verrous. Une solution robuste possible : un réducteur de séance à états explicites (`demonstrating` → `waiting-for-release` → `waiting-for-input` → `confirmed`) qui accepte des événements MIDI horodatés, avec une seule transition autorisée par défi.

### Vérification connue

Après les dernières modifications :

```text
npm run lint   # succès
npm run build  # succès
```

Le serveur Vite a été redémarré sur `http://localhost:3000/` pendant cette session. Faire un rechargement forcé avant un nouveau test manuel.

Dernière mise à jour : 13 novembre 2026 (soir). Reprise par un nouvel agent : vérification automatisée du lecteur MIDI, correction du mapping des canaux et persistance du mixage. Ce document décrit uniquement l’état réellement observé dans le dépôt et dans la session de développement.

## Objectif produit actuel

MIDI Boss (nom de marque affiché comme **Piano Path** dans la barre supérieure) est une application web locale de pratique de piano/clavier MIDI. L’utilisateur peut :

- pratiquer des accords isolés, des progressions et des micro-leçons ;
- jouer depuis un clavier MIDI Web MIDI, le clavier de l’ordinateur ou le clavier virtuel ;
- suivre une progression par étapes de voicing et de répétition espacée ;
- importer une playlist iReal Pro (`.html` ou `irealb://`) pour la parcourir et transformer une grille en séance de pratique ;
- importer un MIDI local et le lire via Web Audio Fonts avec un mixeur par piste.

La lecture MIDI a finalement été confirmée fonctionnelle par l’utilisateur après le signalement initial d’absence de son. Elle reste une fonctionnalité récente à tester après tout changement audio, mais n’est pas un blocage actif.

## Environnement et commandes

- Répertoire : `/Users/barhoumi/Projects/MIDI-Boss`
- Runtime observé : Node `v25.9.0`, npm `11.12.1`.
- Installer les dépendances : `npm install`
- Type-check : `npm run lint` (`tsc --noEmit`)
- Build de production : `npm run build`
- Dev server : `npm run dev` (Vite, `0.0.0.0:3000`; URL locale `http://localhost:3000/`)

Au dernier contrôle, `npm run lint` et `npm run build` passent. Le serveur de développement répondait HTTP 200 sur `http://localhost:3000/`.

### Technologies et versions réellement installées

- React `19.3.1`, React DOM `19.3.1`, TypeScript `7.0.2`
- Vite `8.3.8`, `@vitejs/plugin-react` `6.3.0`, Tailwind CSS `4.3.5` via `@tailwindcss/vite`
- Lucide React `0.546.0`
- Web MIDI natif (`navigator.requestMIDIAccess`), Web Audio natif
- iReal : `@chordsketch/wasm` `0.9.0`
- MIDI : `midi-file` `1.2.4`, `midi-audio-player` `2.0.3` (Web Audio Fonts)
- Instruments joués : `smplr` `1.2.0` (MIT), échantillons MIDI.js MusyngKite chargés à la demande
- Autres dépendances présentes mais non examinées comme actives dans ce flux : `@google/genai`, `express`, `dotenv`, `motion`, `tsx`.

`package-lock.json` est nouveau et non commit ; le conserver, il fige les dépendances ajoutées.

## Architecture

Le projet est un client React/Vite sans backend actuellement utilisé. Les données persistantes vont dans `localStorage`.

| Emplacement | Rôle |
|---|---|
| `src/main.tsx` | Point d’entrée React ; charge `index.css` et rend `App`. |
| `src/App.tsx` | Orchestrateur global : navigation, données persistées, Web MIDI, synthé local, lancement/fin de séances. |
| `src/music/chords.ts` | Modèle restreint d’accords (`maj`, `min`, `sus2`, `sus4`, `7`, `maj7`, `m7`), parsing texte et voicings. |
| `src/music/validation.ts` | Validation des notes jouées face à l’accord et à l’étape de voicing. |
| `src/music/ireal.ts` | Import/décodage iReal Pro, ajouté dans la branche de travail actuelle. |
| `src/practice/` | Moteur de séance, cursus, recommandations et répétition espacée. |
| `src/input/midi.ts` | `WebMidiController` : devices Web MIDI, sélection, notes et panic. |
| `src/input/keyboardMap.ts` | Mappage du clavier physique vers des numéros MIDI. |
| `src/audio/synth.ts` | Petit synthé Web Audio maison pour notes jouées, aperçu d’accords et métronome ; ce n’est pas le lecteur de fichier MIDI. |
| `src/storage/types.ts` | Schéma des données persistées. |
| `src/storage/localStore.ts` | Chargement/sauvegarde `localStorage`, données démo, reset. |
| `src/ui/components/` | Navigation, réglages, clavier virtuel, configuration/résumé de séance, lecteur MIDI. |
| `src/ui/screens/` | Écrans Aujourd’hui, Répertoire, Jouer et Progrès. |

### Flux de pratique existant

1. `TodayScreen` ou `SessionConfigPanel` produit un `PracticeConfig`.
2. `App.handleStartPractice` enregistre ce config, incrémente `playSessionKey`, bascule sur `play`.
3. `PlayScreen` génère une file de `PracticeQueueItem` et valide les notes actives contre l’accord attendu.
4. `App.handleCompleteSession` agrège les tentatives dans `chordStats`, `spacedCards`, `songProgress` et `sessions`.
5. `localStore.saveStoredData` persiste tout après chaque mise à jour de `storedData`.

`PlayScreen` possède déjà son propre minuteur de progression et un métronome optionnel (`settings.metronomeEnabled` → `pianoSynth.playMetronomeTick`). Il ne pilote pas le lecteur MIDI importé ; les deux sont actuellement indépendants.

## Fonctionnalités terminées / fonctionnelles

- Séances isolées, progressions et micro-leçons guidées.
- Validation des notes par MIDI, clavier d’ordinateur et clavier virtuel ; gestion des notes actives et panic.
- Thème clair/sombre, notation internationale/française, réglage de volume du synthé local, paramètres MIDI.
- Suivi de séance, statistiques par accord, répétition espacée et vues Progrès/Aujourd’hui.
- Lecteur MIDI local (transport + mixage par piste) avec réglages de mixage mémorisés par fichier.
- Build et type-check propres au dernier contrôle.
- Import de répertoire iReal Pro (voir le détail et les limites ci-dessous). L’implémentation compile ; elle a été validée sur la structure du fichier utilisateur, mais pas intégralement par test UI automatisé.

## iReal Pro : état et fonctionnement

### Code ajouté

`src/music/ireal.ts` définit :

- `IrealSong` : `id`, `title`, `composer`, `style`, `key`, `sourceUrl`.
- `readIrealPlaylist(html)` : parse un HTML avec `DOMParser`, cherche les ancres `irealb://`, et découpe les exports de playlist sur `===` (important : une playlist iReal peut être une seule énorme URL contenant tous les titres).
- `decodeIrealSong(song)` : initialise le WASM `@chordsketch/wasm`, exécute `parseIrealb()`, extrait les accords non alternatifs (`size !== 'small'`) et les convertit en `ChordDefinition` MIDI Boss.

### Limites importantes du mapping iReal → pratique

- Les qualités iReal sont ramenées à seulement 7 familles supportées par `src/music/chords.ts`.
- Exemples : `-7/-9/...` → `m7`, `^7/^9/...` → `maj7`, dominantes/extensions → `7` ; beaucoup d’altérations/accords diminués ne sont pas représentés avec précision.
- Les inversions, répétitions, durées de mesure, formes et sections ne sont pas transférées au `PracticeConfig`. Seule une liste linéaire d’accords est produite.
- `App.handleStartIrealSong` force actuellement `step: 'root'`, `tempoBpm: 120`, `beatsPerChord: 4`, `loopCount: 0`, et n’attribue pas `songId`. Il n’utilise donc ni le tempo réel ni une progression sauvegardée du morceau.

### UI et persistance

- `src/ui/screens/LibraryScreen.tsx` est l’écran Répertoire.
- Il accepte un `.html` via `readIrealPlaylist`, ou une URL `irealb://` collée.
- La bibliothèque est stockée en `StoredData.irealLibrary` (optionnelle pour compatibilité avec les anciennes sauvegardes) et chargée/sauvegardée par `src/storage/localStore.ts`.
- `App.handleImportIrealLibrary` remplace la bibliothèque entière lors de l’import de fichier et passe `isDemoData` à `false`. L’import par lien fusionne/déduplique par ID.
- La liste affiche les 80 premiers résultats max ; la recherche cible titre/compositeur/style.

### Fichier fourni par l’utilisateur, hors dépôt

`/Users/barhoumi/Documents/eph/Jazz 1460.html` a été examiné, mais ne doit pas être copié dans le repo sans instruction explicite. Il est une exportation HTML iReal valide qui contient une seule URL `irealb://` avec 1 460 entrées séparées par `===`.

Le parsing WASM a été vérifié en Node sur la première entrée (`9.20 Special`) et sur la seconde entrée (`26-2`) : `parseIrealb('irealb://'+segment)` décode bien la structure.

## Lecture MIDI / Web Audio Fonts : état précis

### Fichier utilisateur testé

`/Users/barhoumi/Documents/eph/Blue Bossa.mid` est hors dépôt et ne doit pas être ajouté sans consentement explicite. Lecture faite avec `midi-file` :

- MIDI format 1, 6 pistes, `ticksPerBeat = 480` ;
- tempo contenu : 140 BPM ;
- pistes : `Piano` canal 0 (660 note-on), `Harmony` canal 2 sans notes, `Bass` canal 1 (193), `Drums` canal 9 (806), `Click` canal 6 (4) ;
- fichier de 13 Ko ; `file` le reconnaît comme MIDI standard.

### Implémentation courante

`src/ui/components/MidiPlayerPanel.tsx` est rendu dans `LibraryScreen`, juste après le panneau d’import iReal.

- L’utilisateur choisit un `.mid/.midi` local.
- `describeTracks(buffer)` parse localement via `midi-file` et récupère le nom de piste + premier canal.
- `MidiAudioPlayer` est instancié avec `{ volume: 0.8, reverb: 0.16, preferred: ['FluidR3_GM'] }`.
- La création du player est volontairement faite **avant** `await file.arrayBuffer()` dans `loadFile`, dans le geste de sélection de fichier : tentative de résoudre les restrictions d’activation Web Audio Chrome/Safari.
- `await player.load(buffer, setup)` charge le MIDI et les presets Web Audio Fonts ; le panneau affiche le BPM reçu de l’événement `computed`. Pour un export iReal Pro, `prepareDrumMapping` réécrit d’abord les notes du canal 10 en General MIDI (voir plus bas).
- Le bouton Jouer appelle `await player.play()` ; Pause appelle `player.pause()`, Stop `player.stop()`.
- Un slider par piste appelle `player.setChannelVolume(channel, value)`.
- Le CDN par défaut du package est `https://webaudiofonts.com/presets/`. Il a été vérifié depuis l’environnement : `catalog.json` répond HTTP 200 avec `Access-Control-Allow-Origin: *`.

### État confirmé

Après un signalement initial d’absence de son, l’utilisateur a confirmé que le MIDI fonctionne finalement. Considérer donc le flux import → chargement presets → lecture comme fonctionnel pour le fichier Blue Bossa, tout en le retestant après toute modification de l’audio.

Vérifié techniquement : le package compile avec Vite, `midi-file` analyse Blue Bossa, `midi-audio-player` expose les APIs déclarées, le CDN répond CORS. Vérifié fonctionnellement par l’utilisateur : le MIDI joue.

### Mixage persistant et canaux (ajout du 13 novembre 2026)

- `MidiPlayerPanel` calcule une clé stable par fichier (`nom:taille:hash FNV-1a`) et restaure automatiquement le `SongSetup` enregistré en le passant à `player.load(buffer, setup)`.
- `player.getSongSetup()` est appelé après le chargement et après chaque changement de volume (debounce 500 ms) ; presets et volumes par canal sont stockés dans `StoredData.midiSetups`. Le `File` MIDI lui-même n’est toujours pas persisté.
- Un badge « Mixage mémorisé » s’affiche quand un setup existant a été restauré.
- **Correction importante** : `midi-file` expose des canaux 0–15 alors que `midi-audio-player` attend 1–16. `describeTracks` ajoute désormais 1. Avant cette correction, le slider Piano pilotait le canal 0 (ignoré) et le slider Basse pilotait en réalité le Piano. Vérifié avec Blue Bossa : volumes sauvegardés sur les clés 1 (piano), 2 (basse), 3 (harmonie), 7 (click), 10 (batterie).
- Vérification automatisée dans le navigateur : import de Blue Bossa, 140 BPM, 5 pistes, Play/Pause/Reprise/Stop, sliders, sauvegarde puis restauration après rechargement de la page, aucune erreur console. L’écoute réelle (audio) reste à confirmer par l’utilisateur.
- **Kit de batterie** : la banque `FluidR3_GM` n’existe pas dans le catalogue Web Audio Fonts, donc `preferred: ['FluidR3_GM']` ne sélectionnait rien et le lecteur prenait le premier preset (`1280_AirFont380`, banque « midis cm-64 »), dont le mapping de percussions n’est pas General MIDI (le ride sonnait comme un sifflet). Le canal 10 est désormais forcé sur `1289_FluidR3` (« Jazz » GM) au chargement, y compris pour migrer un ancien setup enregistré ; les volumes mémorisés restent appliqués. Les zones GM ride (51) et charleston (42/44) sont présentes dans ce preset. Aucune UI de choix de kit n’existe encore.

### Batterie iReal Pro → General MIDI (ajout du 13 novembre 2026)

- Constat vérifié dans le SoundFont embarqué `/Applications/iReal Pro.app/Contents/Resources/percussive.sf2` (dump via `/tmp/dump-sf2.mjs`) : iReal Pro n’exporte **pas** les percussions en General MIDI. Son kit « Jazz » utilise par exemple `71 = DR Ride Flat`, `72 = DR Ride Flat Edge`, `92–95 = shakers`, `96–100 = cymbales ride`, `103–120 = bongos/maracas/timbales`. En GM, `71` et `72` sont des sifflets — c’est exactement le symptôme signalé (ride remplacé par un sifflet).
- Les autres instruments ne sont pas concernés et ne sont pas modifiés : seul le canal 10 est réécrit.
- `IREAL_DRUM_TO_GM` dans `MidiPlayerPanel.tsx` fournit la table de conversion (ride 71/72 → 51, balais → caisse claire 38, kicks jazz → 35, timbales latines → 65/66, shakers → 70, etc.).
- `looksLikeIRealExport` détecte les exports iReal par la présence des pistes `Piano`, `Harmony` et `Drums` avec des notes sur le canal 10 ; la conversion ne s’applique qu’à ces fichiers.
- `prepareDrumMapping` parse le MIDI avec `midi-file`, réécrit les événements `noteOn`/`noteOff` du canal 9 (0–15) puis resérialise avec `writeMidi`. La clé de setup reste calculée sur le **fichier d’origine**, donc les volumes/mixages mémorisés sont conservés.
- Une case « Batterie iReal Pro convertie en General MIDI » apparaît pour ces fichiers ; la décocher recharge le fichier brut (permet de comparer). Vérifié dans le navigateur : import de Blue Bossa, case cochée par défaut, bascule off/on sans erreur, lecture OK, aucune erreur console.
- Vérification Node sur Blue Bossa : 768 événements remappés ; l’histogramme batterie passe de `71×381, 72×3` à `51×384`, les autres notes (35, 37, 43, 44, 45, 49) restant inchangées. L’écoute réelle reste à valider par l’utilisateur.

### Points à surveiller

1. Le lecteur dépend du CDN Web Audio Fonts ; gérer une erreur réseau visible et ne pas supposer que tous les réseaux l’autorisent.
2. Le mapping de canaux est désormais traité dans `MidiPlayerPanel` : `midi-file` (0–15) est converti en 1–16 pour `midi-audio-player`. Ne pas réintroduire de canaux bruts dans les appels `setChannelVolume`/`getSongSetup`.
3. Tester systématiquement Piano/Bass/Drums/Click, Play/Pause/Stop et sliders après une modification audio.

## Audio existant (à ne pas confondre)

`src/audio/synth.ts` gère le son des notes jouées (Web MIDI, touches clavier, clavier virtuel, aperçu d’accord) et le métronome.

- **Depuis le 13 novembre 2026** : les notes utilisent des **instruments échantillonnés** via `smplr` 1.2.0 (MIT), banque MIDI.js `MusyngKite` chargée à la demande depuis `gleitz.github.io`. Plus de vrai synthé à oscillateurs pour le rendu principal, donc un son nettement plus proche d’un piano.
- Instruments proposés dans Réglages → `settings.instrument` : `piano` (Piano acoustique, `acoustic_grand_piano`), `rhodes` (`electric_piano_1`), `vibraphone`, `organ` (`drawbar_organ`). Le choix est persisté avec les autres réglages.
- Le contexte audio et l’instrument sont créés au démarrage (contexte suspendu jusqu’à la première interaction). Pendant le chargement des samples, ou si le CDN échoue, le synthé à oscillateurs sert de secours pour que le clavier reste jouable. Le tiroir de réglages affiche « Chargement x/y », « Son chargé » ou « Échec du chargement ».
- **Latence (13 novembre 2026)** : le contexte est créé avec `latencyHint: 0` (plus petit buffer possible ; sur Chrome macOS, ~32 ms de sortie contre ~40 ms en `interactive`, haut-parleurs internes). `primeFromGesture()` est appelé au premier clic / touche pour démarrer le contexte et jouer un buffer silencieux (déblocage Safari/iOS) : la première note ne paie plus le démarrage de la sortie. Le tiroir affiche la latence estimée (`baseLatency` / `outputLatency`).
- `setInstrument(id)` est idempotent et protégé par un jeton : un changement rapide d’instrument libère proprement l’ancien sans race condition.
- Le métronome (`playMetronomeTick`) reste un oscillateur local.
- `audioEnabled` / `audioVolume` pilotent ce moteur (`masterGain`), pas `MidiAudioPlayer` : le volume du lecteur MIDI importé reste indépendant, avec ses sliders par piste.

Il ne lit pas les fichiers MIDI. Les instruments sont mutualisés avec le lecteur MIDI uniquement sur le principe (Web Audio) ; `MidiAudioPlayer` garde ses propres presets Web Audio Fonts.

## Principaux fichiers UI

- `src/ui/components/TopNav.tsx` : `AppTab` est désormais `'today' | 'library' | 'play' | 'progress'` ; libellé « Répertoire » ajouté.
- `src/ui/screens/TodayScreen.tsx` : tableau de bord, micro-leçon, objectif quotidien, état MIDI.
- `src/ui/screens/PlayScreen.tsx` : écran de pratique et progression temporisée ; long composant à modifier avec précaution.
- `src/ui/components/SessionConfigPanel.tsx` : configuration des sessions/progressions, tempo et choix de mode.
- `src/ui/components/SettingsDrawer.tsx` : paramètres persistants, volume de `pianoSynth`, métronome, périphériques Web MIDI, démo/reset.
- `src/ui/components/VirtualKeyboard.tsx` : saisie à la souris/tactile, pas le player MIDI.
- `src/ui/screens/ProgressScreen.tsx` : statistiques et recommandations.

## Données persistées

Clé `localStorage` : `chord-practice:v1` dans `src/storage/localStore.ts`.

`StoredData` contient `version: 1`, `isDemoData`, `settings`, `chordStats`, `spacedCards`, `songProgress`, `sessions`, `irealLibrary?`, et `midiSetups?` (presets + volumes par fichier MIDI, ajouté le 13 novembre 2026). `settings` inclut `instrument: 'piano' | 'rhodes' | 'vibraphone' | 'organ'` (défaut `piano`, ajouté le 13 novembre 2026).

Important : ne pas augmenter la version sans prévoir une migration ; le chargeur est tolérant et applique des valeurs par défaut. Les MIDI importés ne sont pas persistés : le navigateur ne peut pas restaurer un `File` local après un rechargement. C’est actuellement volontaire/non traité.

## Décisions techniques et raisons

1. **Décoder les grilles iReal côté client.** `@chordsketch/wasm` est initialisé à la demande dans `src/music/ireal.ts`; aucune grille n’est envoyée à un serveur.
2. **Accepter directement `.html` plutôt que demander 1 460 liens.** Les exports de playlists regroupent tous les morceaux dans une énorme URL `irealb://...===...`; l’importeur les éclate.
3. **Ne pas utiliser les samples d’iReal Pro.** L’utilisateur a demandé une approche simple, mais les samples/Real Drums iReal ne sont pas intégrables sans licence. Décision : MIDI que l’utilisateur exporte + SoundFont tiers à licence claire.
4. **Essai Web Audio Fonts.** `midi-audio-player` promet lecture WebAudioFont, cache et volumes par canal. C’est un essai en cours, pas une dépendance validée en production.
5. **Compatibilité Vite 8.** `esbuild` est passé de `^0.25.0` à `^0.28.0` car Vite 8 exige `^0.27 || ^0.28`; `vite.config.ts` utilise `import.meta.dirname` à la place de `__dirname` afin d’éliminer l’avertissement Vite futur.

## Conventions et contraintes de développement

- Langue de l’interface : français ; garder les libellés cohérents et l’accessibilité des boutons/labels.
- Styles : Tailwind utilitaire directement dans les composants ; look actuel pierre/indigo, cartes `rounded-2xl`, support dark mode via `dark:`.
- TypeScript strict au niveau pratique : `npm run lint` doit rester vert. Éviter `any`; les bibliothèques installées fournissent déjà des types.
- Le projet est client-first : ne pas ajouter un serveur/API pour l’import sans nécessité explicite.
- Les fichiers utilisateurs iReal/MIDI ne doivent pas être ajoutés au repo sans accord explicite et ne doivent pas être envoyés à un tiers.
- Préserver la distinction entre : (a) synthé de pratique, (b) transport/lecteur de backing MIDI, (c) Web MIDI d’entrée.
- Avant d’ajouter une dépendance, vérifier qu’une dépendance déjà installée ne couvre pas le besoin et vérifier licence, taille, compatibilité Vite/browser.
- Ne pas réinitialiser le worktree ni supprimer les changements non commit.

## Git et modifications non commit

Dernier commit de base : `273b893 feat: initialize project structure and base UI`.

État observé à la rédaction :

- Modifiés : `package.json`, `src/App.tsx`, `src/storage/localStore.ts`, `src/storage/types.ts`, `src/ui/components/TopNav.tsx`, `vite.config.ts`.
- Non suivis : `package-lock.json`, `src/music/ireal.ts`, `src/ui/components/MidiPlayerPanel.tsx`, `src/ui/screens/LibraryScreen.tsx`.
- `HANDOVER.md` est ajouté par cette passation et sera donc également non suivi jusqu’au prochain commit.

Conserver toutes ces modifications : elles sont liées entre elles (nouveaux imports/dépendances/UI). Aucun fichier existant n’a été supprimé.

## Vérifications déjà exécutées

Derniers résultats connus :

```text
npm run lint   # succès
npm run build  # succès
curl http://localhost:3000/  # HTTP 200 pendant que le serveur dev tournait
```

La build finale observée incluait le WASM `chordsketch_wasm_bg-*.wasm` (~495 kB) et le JS principal ~427 kB non compressé. Le poids supplémentaire vient surtout du lecteur MIDI et est à considérer si l’on maintient cette solution.

## Prochaines actions concrètes, dans l’ordre

1. Faire écouter et valider par l’utilisateur : (a) le mixage restauré (Piano à 35 % après rechargement), le transport Play/Pause/Stop et la batterie sur `Blue Bossa.mid` (case « Batterie iReal Pro convertie en General MIDI » cochée → le ride doit sonner comme un ride, plus de sifflet) ; (b) les quatre instruments échantillonnés du clavier (Réglages → Instrument), leur latence et la latence de sortie affichée dans le tiroir. La vérification automatisée est passée, mais l’agent ne peut pas entendre le son.
2. Si la latence reste perceptible : tester dans Safari (souvent ~10 ms sur macOS contre ~32 ms dans Chrome), avec une sortie filaire (le Bluetooth ajoute 100–300 ms), et comparer le build de production (`npm run preview`) au serveur de dev. Chrome macOS ne descend guère sous ~30 ms avec les haut-parleurs internes.
3. Décider du produit : soit conserver le panneau MIDI indépendant, soit connecter son transport et sa position à `PlayScreen`/la grille iReal. Cette synchronisation n’existe pas aujourd’hui.
4. ~~Persister un `SongSetup` et les réglages de mixage~~ — fait le 13 novembre 2026 via `StoredData.midiSetups`, sans persister le `File` local.
5. Ajouter des tests unitaires purs pour `readIrealPlaylist` et la conversion des qualités iReal. Aucun runner de tests n’est installé : il faudra choisir et ajouter une dépendance (par exemple Vitest) avant d’écrire les tests. Les composants Web Audio devront être testés manuellement/in-browser ou avec des mocks.
6. Instrumenter `MidiPlayerPanel.tsx` avec les événements `logs`, `computed`, `presetsLoaded` et `channelState` seulement si un problème de lecture réapparaît.
7. Relancer `npm run lint` et `npm run build` après chaque modification, puis vérifier le flux dans le navigateur.

## Informations non vérifiées / inconnues

- Aucune documentation projet (`README.md`, `PROJECT_CONTEXT.md`, `TODO.md`) n’était présente dans les fichiers listés à la racine ; aucune convention additionnelle n’a donc été trouvée.
- Il n’y a pas de suite de tests automatisés ni de script `test` dans `package.json`.
- L’agent n’a pas pu automatiser l’écoute dans le navigateur (hôte navigateur indisponible), mais l’utilisateur a confirmé que la lecture MIDI fonctionne.
- Il n’a pas été vérifié si le navigateur de l’utilisateur autorise le CDN/presets via ses politiques réseau ou extensions.

## PREMIÈRE ACTION À EFFECTUER

Faire valider à l’utilisateur l’écoute du mixage restauré et de la batterie convertie (Répertoire → Importer un MIDI → Blue Bossa.mid → vérifier « Mixage mémorisé », Piano à 35 %, la case « Batterie iReal Pro convertie en General MIDI » cochée et le ride sur la piste Drums → Jouer), puis choisir entre : (a) connecter le transport MIDI à `PlayScreen`/la grille iReal, ou (b) ajouter les tests unitaires iReal en introduisant un runner de tests.
