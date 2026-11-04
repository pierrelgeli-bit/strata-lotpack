# Strata Lotpack — Architecture

**Strata Lotpack** est l'application terrain de la famille Strata. Strata Opus est l'outil global de gestion de projet. Lotpack remplace le pack papier COLAS NSW utilisé sur les chantiers d'enrobé. La V1 est un fichier HTML unique, 100 % local, qui permet de remplir les fiches sur tablette puis d'envoyer le lotpack par mail.

> Ce document est la référence pour le développement dans Claude Code. Il deviendra `docs/ARCHITECTURE.md` dans le dépôt GitHub. L'interface de l'application est en anglais ; la documentation et les échanges sont en français.

## 1. Objectifs

- Remplir sur tablette, pendant le poste, toutes les fiches du pack, avec ou sans réseau.
- Saisir une seule fois les informations communes (client, projet, job, suburb, produit).
- Calculer et contrôler automatiquement (tonnes cumulées, températures, vent, dips).
- Produire un PDF identique aux fiches officielles.
- Terminer par l'envoi par mail du lotpack (PDF + JSON).
- Exporter et importer les données en JSON.

Hors périmètre V1 : back-end, synchronisation, comptes utilisateurs, installation PWA.

## 2. Fiches à numériser

| Code | Version | Fiche | Contenu principal |
| --- | --- | --- | --- |
| MSF28-6 | V3R2 – 05/09/2024 | Approval to Proceed / Hold Point Release | En-tête, type de travaux, couche, checklist de vérification, commentaires, signatures COLAS et client. Une par poste |
| MSF28-7 | V2R3 – 13/09/2024 | Site Diagram | Croquis sur grille, légendes (key, mix, layer, depth, area, tonnes), completed by. Pages de dessin supplémentaires ajoutables à la demande, sur le modèle de la page 5 du papier : grille, 2 légendes et Completed By propres à chaque page |
| MSF28-10 | V1R5 – 13/09/2024 | Asphalt Traceability | En-tête + météo + tack coat, une ligne par camion, relevés vent / température chaussée toutes les 2 h, lot summary, QA checklist. 23 lignes en page 1, pages de suite de 31 lignes |
| MSF28-9 | V3R3 – 29/01/2025 | Pavement Measured Dip Record | 3 blocs de couche (CC/IC/WC), limites de dip, compaction factor, relevés CH gauche / centre / droite, 38 lignes par bloc (au-delà, nouvelle fiche). Optionnelle : ajoutée au lotpack à la demande |
| MSF28-12 | V3R4 – 29/01/2025 | Survey Record | Même structure que le dip record, couche 1/2/3, relevé fait par COLAS ou client, 40 lignes par bloc (au-delà, nouvelle fiche). Optionnelle : ajoutée au lotpack à la demande |
| MSF28-11 | V2R4 – 13/09/2024 | Quantity & Placement Agreement | Pay items, contractor items, quantités, waste, m², variations, signatures |

## 3. Principes d'architecture

- **Un seul fichier livré** : `dist/strata-lotpack.html`, autonome (CSS, JS, gabarits inclus), ouvert directement dans le navigateur. Aucun serveur, aucune dépendance réseau.
- **Sources modulaires** : le code est découpé en modules, assemblés par un script de build (même approche que Strata Opus).
- **Local d'abord** : stockage IndexedDB, sauvegarde automatique à chaque modification.
- **JSON comme format d'échange** : versionné, lisible, réimportable.
- **Rendu fidèle** : le PDF officiel sert de fond ; pdf-lib écrit les valeurs, les cases cochées et les signatures par-dessus, le rendu est donc identique au papier.
- **Indépendant de l'appareil** : iPad ou Android, navigateur récent (Safari, Chrome).
- **Vanilla JS** : pas de framework, pour garder un fichier léger et durable. Seule bibliothèque : pdf-lib (licence MIT), intégrée au fichier, sans réseau.

## 4. Structure du dépôt

```text
strata-lotpack/
├── docs/
│   ├── ARCHITECTURE.md      ← ce document
│   └── forms/               ← scans PDF des fiches officielles (référence)
├── src/
│   ├── index.html           ← squelette de l'app
│   ├── app.js               ← routeur et écrans (Jobs, Shift, Settings)
│   ├── styles/
│   │   └── app.css          ← interface tablette
│   ├── core/
│   │   ├── db.js            ← IndexedDB (CRUD, autosave)
│   │   ├── schema.js        ← modèle + version du schéma
│   │   ├── io.js            ← export / import JSON, fusion
│   │   ├── rules.js         ← calculs et contrôles
│   │   ├── pdf.js           ← génération du PDF (pdf-lib)
│   │   └── mail.js          ← étape Finish & send
│   ├── forms/               ← un module par fiche (saisie + gabarit PDF)
│   │   ├── approval.js      ← MSF28-6
│   │   ├── diagram.js       ← MSF28-7
│   │   ├── traceability.js  ← MSF28-10
│   │   ├── dip.js           ← MSF28-9
│   │   ├── survey.js        ← MSF28-12
│   │   └── quantities.js    ← MSF28-11
│   ├── assets/
│   │   └── lotpack-template.pdf ← gabarit : PDF officiel sans les numéros de page papier
│   ├── vendor/
│   │   └── pdf-lib.min.js   ← pdf-lib (licence MIT), intégré au build
│   └── ui/
│       ├── canvas.js        ← dessin et signatures (doigt / stylet)
│       └── components.js
├── build/
│   └── build.js             ← assemble src/ en un seul HTML
├── tools/
│   └── make-template.py     ← génère le gabarit depuis docs/forms (PyMuPDF)
├── test/                    ← tests automatisés (Playwright)
├── dist/
│   └── strata-lotpack.html
└── README.md
```

## 5. Modèle de données

Unité de travail : le **Job** (projet global). Un job contient plusieurs **Shifts** (un lotpack par poste). Chaque shift est créé avec ses fiches de base vides (MSF28-6, MSF28-7, MSF28-10, MSF28-11), à remplir ensuite. Le Dip Record (MSF28-9), le Survey Record (MSF28-12) et les pages de dessin supplémentaires du Site Diagram s'ajoutent à la demande. Les champs communs (client, projet, job number, suburb, produit, nom du rédacteur « Completed by ») sont saisis une fois et transmis automatiquement de fiche en fiche ; ils restent modifiables localement. Une seule personne par équipe utilise la tablette.

```json
{
  "schemaVersion": 1,
  "app": "strata-lotpack",
  "exportedAt": "2026-11-04T09:00:00+08:00",
  "contacts": [{ "name": "", "email": "", "lastUsed": null }],
  "settings": { "theme": "system", "alwaysCc": "", "defaultCompletedBy": "" },
  "jobs": [{
    "id": "uuid",
    "client": "", "projectTitle": "", "jobNumber": "", "suburb": "",
    "supplyingPlant": "", "haulageKm": null,
    "shifts": [{
      "id": "uuid", "date": "2026-11-04",
      "product": "", "nominatedThickness": null,
      "workType": ["supplyLay"], "layer": ["wearing"],
      "weather": "",
      "approval": {},
      "traceability": { "loads": [], "envReadings": [] },
      "diagram": { "pages": [] },
      "dipRecords": [],
      "surveys": [],
      "quantities": {},
      "completedBy": "",
      "sendLog": [{ "sentBy": "", "to": [], "sentAt": null }],
      "status": "draft"
    }]
  }]
}
```

Détail des objets :

- **approval** : `checks` (plant, materials, surface, base, thickness, wind, underlying, pavementTemp + sous-cases), `comments`, `colasSign {name, signature, dateTime}`, `clientSign {name, signature, position, dateTime}`, `clientComments`.
- **traceability** : `tackRate {litres, m2}`, `tackBroken`, `surfaceClean`, `loads[] {no, docket, tonnes, progress, tipTime, temp, chStart, chEnd, run, width, comment}`, `envReadings[] {time, windKmh, pavementTemp}`, `lotSummary {qtyDelivered, qtyPaved, m2Paved, completedBy}`, `qa {tempsRecorded, dipsRecorded, labDiscussed}`.
- **diagram** : `header`, `pages[] {strokes[], legends[2] {key, mix, layer, depth, area, tonnes}, completedBy}` (une entrée par page de dessin ; traits vectoriels `{c, w, p[[x, y]]}` en coordonnées relatives à la grille, de 0 à 1, redessinés tels quels dans le PDF ; la page 1 porte en plus l'en-tête ; chaque page ajoutée a ses propres légendes et son Completed By).
- **dipRecord / survey** : id, header (en-tête modifié sur la fiche), mixType, frequency, existingSurface (asphalt, granular ou seal), sealSize, completedBy ; Dip : compactionFactor, lowerLimit, upperLimit ; Survey : surveyBy (colas ou client) ; dans chaque bloc, level vaut survey ou nominal (Dip) et layer vaut 1, 2 ou 3 (Survey), `courses[3] {course, length, depth, offsets {l, c, r}, direction, level, run, width, readings[] {ch, l, c, r}}`.
- **quantities** : `payItems[]`, `contractorItems[]` `{no, description, unit, qtyDelivered, waste, qtyUsed, m2Paved, profiledM2}`, `variations`, `comments`, signatures.

Règles d'import : fusion par `id`, la version la plus récente (`updatedAt`) l'emporte, avec un rapport des conflits affiché à l'utilisateur.

## 6. Règles métier

- **Aucun champ n'est obligatoire.** Les contrôles affichent des avertissements, jamais de blocage.
- Les tableaux se remplissent ligne par ligne avec un bouton « Add row », comme sur papier.
- Les tonnes cumulées (progress) sont calculées automatiquement.
- Relevés vent / température chaussée : une ligne ajoutée à chaque relevé, avec l'heure, dans une liste séparée des camions. Dans le PDF, chaque relevé va dans les colonnes jaunes de la ligne camion la plus proche dans le temps (le relevé avant démarrage sur la 1re ligne), avec son heure en petit. Rappel discret si plus de 2 h depuis le dernier relevé, sans obligation.
- Limites (température, vent, dips) saisies directement dans la fiche, pas de valeurs codées en dur. Traçabilité : traceability.limits {minLoadTemp, maxWind, minPavementTemp}, non imprimées ; tackBroken et surfaceClean valent yes, no ou vide (réponse entourée dans le PDF). Dip Record : chaque relevé brut (Left, Centre, Right) est comparé à Lower et Upper Dip Limit ; hors limites, avertissement et case surlignée, sans blocage ; le Compaction Factor est seulement reporté.
- Avertissement tant que l'Approval to Proceed du poste n'est pas signé.
- Une seule couche / un seul enrobé par fiche de traçabilité, sinon commentaire conseillé.
- Lot summary : QTY Delivered et QTY Paved préremplis avec la somme des tonnes des camions (modifiables) ; m² paved saisi à la main.

## 7. Interface

- **Tout le texte de l'interface est en anglais**, libellés identiques aux fiches papier.
- **Responsive** : utilisable sur téléphone (portrait, une colonne, tableaux en cartes) comme sur tablette (paysage, tableaux complets).
- **Mode jour / mode nuit** : bascule manuelle dans l'en-tête, choix mémorisé, mode système par défaut. Le mode jour est à fort contraste pour le soleil ; le PDF reste toujours en version claire.
- Grandes zones tactiles, clavier numérique pour les nombres.
- Navigation : **Jobs → Shift → onglets par fiche → Finish & send**.
- Indicateur de complétude par fiche (vide, en cours, complète).
- **Croquis à main levée** au doigt ou au stylet, plusieurs couleurs, épaisseur, gomme, annuler / rétablir.
- Signatures sur écran (COLAS et client), acceptées par les clients.

## 8. Sorties et envoi

1. **Finish & send** affiche un récapitulatif de ce qui est rempli ou vide (sans bloquer).
2. Génération du PDF avec pdf-lib, sur le PDF officiel en fond (`core/pdf.js`), sans passer par la boîte d'impression, pour que le fichier puisse être joint automatiquement au brouillon : fiches au format officiel, **incohérences du papier corrigées** (numéros de page du papier retirés du gabarit, bons codes MSF, pagination continue « Page X of Y » calculée sur les pages réellement présentes dans le pack, fiches optionnelles et pages de suite incluses ; les pages de dessin supplémentaires reprennent la page 5 du papier, codée MSF28-7 ; la page 9 du papier (grille seule, codée à tort MSF28-12) n'est pas utilisée). Ordre des fiches dans le PDF : MSF28-6 Approval, MSF28-7 Site Diagram (+ pages de dessin), MSF28-10 Traceability (+ pages de suite), MSF28-9 Dip Record, MSF28-12 Survey Record, MSF28-11 Quantity & Placement ; une fiche optionnelle non ajoutée est simplement absente.
3. Génération du JSON du poste.
4. **Destinataires en tickets** : les contacts du carnet s'affichent comme des tickets cliquables ; on en sélectionne un ou plusieurs. Une adresse peut aussi être tapée à la main ; elle devient un ticket et rejoint les derniers destinataires. L'adresse **toujours en copie** (Settings) est ajoutée automatiquement en CC.
5. **Brouillon de mail, pas d'envoi automatique, pas de script.** Au clic sur « Send », l'app ouvre un brouillon prêt dans l'application mail de l'appareil (Outlook de préférence, ou Gmail), comme le ferait une macro Excel : destinataires, CC, objet (`Lotpack – <date du lotpack>`), corps récapitulatif et pièces jointes. L'utilisateur vérifie puis envoie depuis sa messagerie.
   - Tablette / téléphone : Web Share API avec fichiers → choix de l'app Outlook → brouillon avec PDF + JSON joints.
   - Si le partage de fichiers n'est pas disponible (ordinateur) : téléchargement du PDF + JSON, puis ouverture d'un brouillon `mailto` prérempli ; les fichiers sont joints à la main (limite technique des liens mailto).
   - Hors connexion : le brouillon est créé quand même ; il part de la boîte d'envoi dès que le réseau revient.
6. **Historique d'envoi** dans chaque shift et chaque job : expéditeur, destinataires, CC, date et heure de création du brouillon.

**Modèle de mail** (générique, en anglais). Les dates sont au format JJ/MM/AAAA ; l'objet et le corps portent la date saisie dans le lotpack (date du poste), qui est le plus souvent le jour de l'envoi. Un champ vide est simplement omis.

```text
Subject: Lotpack – {shiftDate}

Hi,

Please find attached the lot pack for {projectTitle} – {shiftDate}.

Attachments:
- {pdfFileName}
- {jsonFileName}

Regards,
{completedBy}
```

**Onglet Settings** : carnet d'adresses (ajouter, modifier, supprimer des contacts nom + email), derniers destinataires mémorisés, **adresse toujours en copie**, thème jour / nuit, nom par défaut du rédacteur.

## 9. Plan de développement

| Étape | Contenu | Critère de fin |
| --- | --- | --- |
| 1 | Squelette, build, IndexedDB, Jobs / Shifts | Un job créé est retrouvé après rechargement |
| 2 | Approval to Proceed + signatures | Fiche remplie et signée, aperçu PDF fidèle |
| 3 | Asphalt Traceability | Lignes camions, cumul, alertes 2 h |
| 4 | Site Diagram | Croquis et légendes sauvegardés, ajout de pages de dessin |
| 5 | Dip Record + Survey Record | Ajout à la demande, 3 blocs, relevés, contrôle des limites |
| 6 | Quantity & Placement | Items, totaux, signatures |
| 7 | PDF complet + Finish & send | Pack complet envoyé par mail depuis une tablette |
| 8 | Export / import JSON | Aller-retour sans perte entre deux appareils |

## 10. Conventions

- Code et interface en anglais, commentaires courts.
- Dates en ISO 8601, heures au fuseau de l'appareil, unités dans les noms de champs si besoin (`windKmh`).
- Toute évolution du modèle incrémente `schemaVersion` avec une fonction de migration.
- Aucune donnée n'est envoyée sur le réseau sans action de l'utilisateur.

## 10 bis. Dépôt et branches

- Dépôt GitHub : `https://github.com/pierrelgeli-bit/strata-lotpack.git`
- Deux branches : `main` (version validée) et `test` (développement).
- **Tout le développement se fait sur `test`.** Aucun merge ni push vers `main` sans instruction explicite de PL.
- Ce document est versionné dans `docs/ARCHITECTURE.md`.

## 11. Questions ouvertes

1. Aucune question ouverte.

Décisions prises : limites saisies dans la fiche ; pas de photos en V1 ; une tablette par équipe ; signature sur écran acceptée ; pas de partage avec Strata Opus ; croquis à main levée multicolore ; PDF corrigé et paginé (« Page X of Y » cohérente) ; Site Diagram extensible par pages de dessin supplémentaires, chacune avec ses légendes ; Dip Record et Survey Record optionnels, ajoutés à la demande ; ordre du PDF : 6, 7, 10, 9, 12, 11 ; mail générique en anglais (modèle section 8) ; PDF généré par pdf-lib sur le PDF officiel en fond, et joint automatiquement ; développement étape par étape, avec validation de PL entre chaque étape.
