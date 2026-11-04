# Strata Lotpack

Application terrain de la famille Strata : remplissage sur tablette du lotpack d'enrobé COLAS NSW (fiches MSF28), puis envoi par mail (PDF + JSON).

- Référence : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Fiches officielles : [`docs/forms/`](docs/forms/)
- Livrable : `dist/strata-lotpack.html`, un seul fichier à ouvrir dans le navigateur, sans serveur ni réseau.

## Utilisation sur tablette / téléphone (fichier local)

1. Copier `dist/strata-lotpack.html` sur l'appareil, toujours au même endroit et sous le même nom.
2. L'ouvrir dans le navigateur (Chrome sur Android ; sur iPad / iPhone, un navigateur capable d'ouvrir un fichier HTML local).
3. Les données restent sur l'appareil, liées à l'emplacement du fichier.
4. Avant de remplacer le fichier par une nouvelle version : Settings → **Export all data (JSON)**. Après : vérifier que les jobs sont toujours là, sinon **Import JSON…**.
5. En fichier local, « Share to Outlook » est souvent indisponible : utiliser **Email draft (attach manually)** et joindre le PDF + JSON téléchargés.

## Build

```bash
node build/build.js
```

Assemble `src/` en un seul fichier `dist/strata-lotpack.html`.

## Tests

```bash
node build/build.js && node test/step1.test.js && node test/step2.test.js && node test/step3.test.js && node test/step4.test.js && node test/step5.test.js && node test/step6.test.js && node test/step7.test.js && node test/step8.test.js
```

Les tests utilisent Playwright (Chromium) et les outils poppler (`pdftotext`, `pdfinfo`, `pdfimages`, `pdftoppm`). Les PDF générés par les tests sont écrits dans `test/out/`.

## Gabarit PDF

Le PDF officiel (`docs/forms/Lot_Package_PL.pdf`) sert de fond aux fiches générées. Ses numéros de page papier en sont retirés par :

```bash
python3 tools/make-template.py
```

qui écrit `src/assets/lotpack-template.pdf` (nécessite PyMuPDF). À relancer seulement si le PDF officiel change ; le résultat est commité.

## Avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Squelette, build, IndexedDB, Jobs / Shifts | Fait |
| 2 | Approval to Proceed + signatures | Fait |
| 3 | Asphalt Traceability | Fait |
| 4 | Site Diagram | Fait |
| 5 | Dip Record + Survey Record | Fait |
| 6 | Quantity & Placement | Fait |
| 7 | PDF complet + Finish & send | Fait |
| 8 | Export / import JSON | Fait |
