# Strata Lotpack

Application terrain de la famille Strata : remplissage sur tablette du lotpack d'enrobé COLAS NSW (fiches MSF28), puis envoi par mail (PDF + JSON).

- Référence : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Fiches officielles : [`docs/forms/`](docs/forms/)
- Application : **https://pierrelgeli-bit.github.io/strata-lotpack/** (GitHub Pages, publiée depuis `main`), installable et 100 % hors ligne après la première ouverture.
- Livrable : `dist/index.html` (identique à `dist/strata-lotpack.html`), un seul fichier autonome, plus `manifest.webmanifest`, `sw.js` et `icons/`.

## Installation sur tablette / téléphone

1. Ouvrir https://pierrelgeli-bit.github.io/strata-lotpack/ une première fois avec du réseau.
2. iPhone / iPad (Safari) : **Partager → Sur l'écran d'accueil**. Android (Chrome) : **⋮ → Installer l'application**.
3. L'app s'ouvre ensuite depuis son icône, avec ou sans réseau. Les données restent sur l'appareil (IndexedDB) ; le site ne sert qu'à distribuer le code.
4. Nouvelle version publiée : le bandeau **Update available – Reload** apparaît ; toucher **Reload**.
5. Faire régulièrement Settings → **Export all data (JSON)** : effacer les données du navigateur supprime les lotpacks.

## Secours : fichier local

1. Copier `dist/strata-lotpack.html` sur l'appareil, toujours au même endroit et sous le même nom.
2. L'ouvrir dans le navigateur (Chrome sur Android ; sur iPad / iPhone, un navigateur capable d'ouvrir un fichier HTML local).
3. Les données restent sur l'appareil, liées à l'emplacement du fichier.
4. Avant de remplacer le fichier par une nouvelle version : Settings → **Export all data (JSON)**. Après : vérifier que les jobs sont toujours là, sinon **Import JSON…**.
5. En fichier local, « Share to Outlook » est souvent indisponible : utiliser **Email draft (attach manually)** et joindre le PDF + JSON téléchargés.

## Build

```bash
node build/build.js
```

Assemble `src/` en un seul fichier `dist/strata-lotpack.html` (copié en `dist/index.html`) et écrit les fichiers PWA (`manifest.webmanifest`, `sw.js` avec un numéro de version = empreinte du build, `icons/`).

Publication : chaque push sur `main` lance `.github/workflows/pages.yml`, qui reconstruit l'app et publie `dist/` sur GitHub Pages. La branche `test` n'est jamais publiée.

## Tests

```bash
node build/build.js && node test/step1.test.js && node test/step2.test.js && node test/step3.test.js && node test/step4.test.js && node test/step5.test.js && node test/step6.test.js && node test/step7.test.js && node test/step8.test.js && node test/step9.test.js
```

Les tests utilisent Playwright (Chromium) et les outils poppler (`pdftotext`, `pdfinfo`, `pdfimages`, `pdftoppm`). Les PDF générés par les tests sont écrits dans `test/out/`. L'étape 9 sert `dist/` en local (http://127.0.0.1) pour tester le service worker, le hors ligne et la mise à jour.

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
| 9 | PWA + GitHub Pages | Fait |
