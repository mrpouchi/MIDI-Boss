# MIDI Boss — direction visuelle

Sujet : l’harmonie jazz au clavier. Public : adulte débutant, devant un ordinateur portable avec un petit
clavier MIDI branché. Tâche principale : **jouer le prochain accord**. Inspiration : Duolingo (chemin,
boutons en relief, feedback en bas d’écran, leçon plein écran). Identité propre : le clavier et le jazz.

## Couleurs (tokens dans `src/index.css`)

| Nom | Clair | Rôle |
|---|---|---|
| Ink | `#1B2140` | texte, touches noires, mascotte (l’ébène du clavier) |
| Ivory | `#FFFFFF` / Mist `#F2F4F9` / Line `#E1E5EF` | fonds, surfaces, filets (l’ivoire des touches) |
| Green | `#3DBE29` (relief `#2F9A1E`) | action principale, réussite |
| Brass | `#FFB31A` (relief `#D99200`) | étape en cours, accent jazz (cuivres), chapeau de la mascotte |
| Sky | `#2A9DF4` (relief `#1C7FCC`) | guidage : touches attendues sur le clavier |
| Coral | `#FF5A5F` (relief `#D63E43`) | erreur |

Thème sombre : fond `#12162B`, surfaces `#1B2140`, filets `#2B3358`, texte `#EEF1FA`.

## Typographie

- **Fredoka** (600–700) : titres, noms d’accords, boutons. Arrondie, joueuse, très lisible en grand.
- **Nunito** (600–800) : texte courant.
- Pas de majuscules forcées, pas de monospace décoratif, pas d’étiquettes « eyebrow » au-dessus des titres.

## Principes

1. Le clavier est l’élément central de la leçon ; il est grand et toujours visible.
2. Un seul appel à l’action par écran, en vert et en relief (ombre portée basse, enfoncement au clic).
3. Le feedback arrive dans une barre en bas d’écran (vert = réussi, corail = à corriger), avec Continuer.
4. Le parcours est un chemin vertical de nœuds ronds ; chaque chanson est une unité colorée.
5. La mascotte « Boss » (petit clavier à chapeau, création originale) parle à l’apprenant : consignes et
   encouragements passent par elle plutôt que par des paragraphes gris.
6. Pas de statistiques décoratives : seulement ce qui aide à décider quoi jouer ensuite.
7. Mouvement rare et utile : rebond du nœud courant, apparition de la barre de feedback ; respect de
   `prefers-reduced-motion`.
