# Strata Lotpack

Application terrain de la famille Strata : remplissage sur tablette du lotpack d'enrobé COLAS NSW (fiches MSF28), puis envoi par mail (PDF + JSON).

- Référence : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Fiches officielles : [`docs/forms/`](docs/forms/)
- Livrable : `dist/strata-lotpack.html`, un seul fichier à ouvrir dans le navigateur, sans serveur ni réseau.

## Build

```bash
node build/build.js
```

Assemble `src/` en un seul fichier `dist/strata-lotpack.html`.

## Tests

```bash
node build/build.js && node test/step1.test.js && node test/step2.test.js && node test/step3.test.js && node test/step4.test.js && node test/step5.test.js && node test/step6.test.js
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
| 7 | PDF complet + Finish & send | À faire |
| 8 | Export / import JSON | À faire |
