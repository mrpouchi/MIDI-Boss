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
