# local-sounds — instruments échantillonnés locaux

Gros instruments convertis pour le navigateur (Opus), servis par le serveur de
développement. Ce dossier est **ignoré par git** sauf ce README.

## salamander/ — Salamander Grand Piano V3

- Yamaha C5 enregistré par Alexander Holm, licence **CC-BY 3.0**.
- Converti depuis la version 44,1 kHz / 16 bits : 8 des 16 nuances
  (v2, v4 … v16, chacune couvrant deux plages de vélocité de l'original),
  notes raccourcies avec un fondu (8 s dans le grave, 6 s au milieu, 4 s dans
  l'aigu), Opus 128 kbit/s stéréo. 240 fichiers, environ 25 Mo.
- `preset.json` : description smplr générée depuis le SFZ d'origine (zones de
  touches, note centrale, plages de vélocité).

Pour le régénérer : extraire l'archive d'origine, convertir avec ffmpeg
(`-t <durée> -af afade=t=out -c:a libopus -b:a 128k`), puis reconstruire
`preset.json` à partir du fichier `.sfz` (les `#` des noms deviennent `s`).

Silence de tête : chaque échantillon commence par 2 à 27 ms de silence (8 ms
en médiane). Chaque région de `preset.json` porte donc un `offset` (secondes)
où la lecture démarre : le premier instant au-dessus de -40 dB sous le pic de
l'échantillon, moins 1 ms de marge. Sans ces offsets, le piano répond plus
tard au clavier.

## generaluser-drums/ — kits Jazz et Balais de GeneralUser GS v2.0.3 (test)

- S. Christian Collins, GeneralUser GS License v2.0 (usage libre, y compris
  dans un logiciel). Source : github.com/mrbumpy409/GeneralUser-GS.
- Le .sf2 d'origine est rendu frappe par frappe avec FluidSynth, sans
  réverbération : programme 32 (Jazz) et programme 40 (Balais), banque 128.
  Les touches 35 à 59 sont rendues à 8 vélocités, les autres à 3. Le rendu
  garde les couches, les échantillons superposés et les filtres programmés par
  l'auteur, que la conversion WebAudioFont perd.
- Encodage Opus 128 kbit/s stéréo, environ 9 Mo par kit. Les classes
  exclusives du SF2 (charley ouvert/fermé/pédale…) deviennent des `group`/`offBy` smplr.
- `preset.json` reprend le mix d'origine. `preset-ride.json` utilise les mêmes
  fichiers, avec le ride à +12 dB et le charley à +6 dB. Le ride est copié sur
  les touches 59 et 90 (RIDE_VOICE_KEYS).

Pour régénérer (scripts dans `generaluser-drums/_tools/`) :

```
python3 render_kit.py GeneralUser-GS.sf2 32 jazz  "GeneralUser GS Jazz Kit"  /local-sounds/generaluser-drums/jazz
python3 render_kit.py GeneralUser-GS.sf2 40 brush "GeneralUser GS Brush Kit" /local-sounds/generaluser-drums/brush
python3 balance.py jazz/preset.json jazz/preset-ride.json   # idem brush
python3 ride_voices.py */preset*.json
```

Supprimer ensuite les dossiers `_render/`. `calibrate.py` compare le niveau au
kit jazz actuel ; c'est cette mesure qui donne les `trim` de bandInstruments.ts.
