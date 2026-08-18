# Passation — application Devis & Factures

Document de reprise pour la personne qui prend la suite du projet.
Aucune donnée personnelle, bancaire ou client n'y figure volontairement.

---

## 1. Le contexte métier avant le code

L'utilisateur est **artisan maçon en entreprise individuelle dans les Vosges**, en franchise
en base de TVA (art. 293 B du CGI). Il n'est pas développeur. L'application est son outil
de travail quotidien : elle produit les devis qu'il remet à ses clients particuliers, les
factures correspondantes et les procès-verbaux de réception de chantier.

Deux conséquences pratiques :

- **Une régression se voit immédiatement, devant un client.** Le site a déjà été mis hors
  service deux fois par une erreur de syntaxe publiée sans vérification. Toute modification
  doit passer les tests avant d'être poussée.
- **Le rendu imprimé est le produit.** L'écran n'est qu'un moyen ; ce qui compte est la
  feuille A4 remise au client. La majorité des demandes portent sur la mise en page.

---

## 2. Architecture

**Un seul fichier : `index.html`** — environ 2 900 lignes, 180 Ko, contenant le HTML, le CSS
et le JavaScript (`<script type="module">`). Pas de chaîne de compilation, pas de framework.

Ce choix est assumé et a été rediscuté : le fichier unique n'a aucune dépendance
d'outillage, se sauvegarde en le copiant et fonctionnera encore dans dix ans. Le découpage
apporterait du confort de navigation au prix d'un outillage que le propriétaire ne peut pas
maintenir seul. **Ne pas découper sans une raison forte.**

### Pile technique

| Élément | Choix | Remarque |
|---|---|---|
| Données | Firebase Firestore | temps réel via `onSnapshot` |
| Authentification | Firebase Auth e-mail/mot de passe | liste blanche dans les règles |
| Hébergement | GitHub Pages | déploiement auto sur `main` |
| Tests | Node + linkedom | `npm test`, 42 tests |
| Dépendances front | aucune | Firebase chargé par CDN |

### Organisation du fichier

1. Configuration Firebase et écrans d'installation
2. État applicatif (`db`) et écouteurs temps réel
3. Persistance (`saveDoc`, `saveClient`, `saveCompany`…)
4. Calculs métier (`calcLine`, `calcDoc`, `echeancesDevis`, `prochainNumero`)
5. Routage par ancre (`navigate`, `render`) et écrans
6. **Rendu imprimable** — la partie la plus délicate, voir §4
7. Procès-verbaux de réception
8. Paramètres de l'entreprise

### Modèle de données Firestore

```
workspace/main/
  ├── company/main          identité, TVA, bancaire, assurance, CGV, signature
  ├── clients/{id}
  ├── quotes/{id}           devis (status: draft|sent|accepted|refused)
  ├── invoices/{id}         factures (status: draft|sent|paid|overdue)
  ├── serviceItems/{id}     bibliothèque de prestations
  ├── materials/{id}        catalogue fournisseurs (prix d'achat)
  └── attachments/{id}      pièces jointes, images compressées en base64

publicQuotes/{id}           copie d'un devis publiée pour signature client
```

Un devis « accepté » ou une facture « payée » n'est pas déplacé : il est filtré vers les
onglets d'archives (`archivedDocs`). Les collections restent les mêmes.

---

## 3. Développement et déploiement

```bash
git clone https://github.com/dursun22/PLATEFORME-DEVIS.git
cd PLATEFORME-DEVIS
npm install
npm test          # 42 tests, doit être vert avant tout push
```

Les tests extraient le `<script type="module">` de `index.html`, neutralisent les imports
Firebase et exécutent le code dans un DOM simulé (linkedom). Ils couvrent la composition
des pages imprimées, la signature, la découpe en pages, la numérotation et l'échéancier.

**linkedom ne calcule aucune mise en page.** Les hauteurs sont toujours nulles : la logique
de pagination est donc testée via `choisirBornes()`, fonction pure alimentée par des mesures
relevées dans un vrai navigateur. Le rendu visuel, lui, se vérifie à l'œil dans l'aperçu.

Un push sur `main` déclenche deux workflows indépendants : les tests, et la publication
GitHub Pages. **Les tests signalent mais ne bloquent pas encore le déploiement** — pour
cela il faudrait basculer la source de publication sur GitHub Actions. C'est la première
amélioration d'infrastructure à faire.

---

## 4. Le rendu imprimable — lire avant d'y toucher

C'est le sous-système qui a produit le plus de régressions. Principe : **l'aperçu et
l'impression doivent être rigoureusement identiques**, exigence explicite du propriétaire.

### Le mécanisme

`renderPrintView()` compose des pages logiques, puis `wrapPrintSheets()` les découpe en
feuilles A4 (`.sheet`, 210 × 297 mm, `@page { margin: 0 }`). Une page trop longue est
découpée en fenêtres : chaque feuille contient le même contenu, décalé par une marge
négative et rogné par `overflow: hidden`.

- Les CGV et les PV tiennent **toujours** sur une seule feuille, réduits si nécessaire.
- Le devis, lui, se poursuit sur autant de feuilles que de besoin.
- Chaque feuille porte son pied de page et son numéro, positionnés en bas de l'A4.

### Les pièges, tous rencontrés

**La typographie de mesure doit être déclarée hors de `@media print`.** Sinon la mesure
hors écran hérite du style de l'application (14 px) et non de celui du document (10 pt) :
les hauteurs sont fausses et la pagination part en vrille. Même chose pour la géométrie de
`.sheet` — définie dans `@media print` uniquement, `getComputedStyle` renvoie zéro.

**Les blocs voisins se touchent au pixel près.** `choisirBornes()` refuse de couper à
l'intérieur d'un bloc, avec une tolérance de 2 px. Élargir les blocs pour « protéger » les
bordures les fait se chevaucher, plus aucune coupure n'est acceptée, et le devis entier
bascule sur la page suivante en laissant la première vide. C'est arrivé.

**La dernière fenêtre s'ouvre sur toute la hauteur utile.** Sinon la bordure basse du bloc
signatures tombe pile sur la coupe et disparaît à l'impression.

**`String.replace` interprète `$&` et `$$` dans la chaîne de remplacement.** Un sélecteur
comme `$$('[data-x]')` devient `$('[data-x]')` et casse en production. Toujours passer par
une fonction de remplacement.

---

## 5. Sécurité — état au 17 août 2026

Les règles Firestore sont l'élément le plus important, et **elles ne sont pas dans le
dépôt** : elles vivent dans la console Firebase. Aucune revue de code automatique ne les
verra. C'est là qu'était la vraie faille.

État actuel :

- L'accès à `workspace` est restreint à une **liste blanche d'adresses e-mail**. Créer un
  compte ne donne aucun accès.
- `publicQuotes` : lecture unitaire par lien autorisée (`get`), **inventaire interdit**
  (`list`). Auparavant `allow read: if true` autorisait aussi l'inventaire — n'importe qui
  pouvait aspirer l'ensemble des devis publiés et les données personnelles des clients.
- L'écriture anonyme sur `publicQuotes` est limitée à l'ajout d'une signature, une seule
  fois, sur un devis qui n'en a pas encore.

Reste à faire, par ordre de priorité :

1. **Jeton aléatoire pour les liens publics.** L'identifiant du document est encore celui du
   devis. Un jeton long et distinct, avec expiration, est nécessaire.
2. **Retirer la création de compte** de l'écran de connexion (sans effet sur les données,
   mais inutile d'inviter des inconnus à s'inscrire).
3. **Sauvegardes.** Tout vit dans un seul projet Firebase, sans export ni historique.
4. **RGPD.** L'application traite des données de particuliers : mentions d'information,
   durée de conservation, registre de traitement.
5. **Corriger le texte des règles affiché dans l'écran d'installation**, qui est un vestige
   obsolète et m'a induit en erreur lors d'un audit.

---

## 6. Ce qu'il faudra transférer pour une reprise complète

Le code seul ne suffit pas à faire tourner le service :

- **Dépôt GitHub** — accès collaborateur, puis transfert de propriété
- **Projet Firebase** — accès console (données réelles : à ne donner qu'en confiance établie)
- **Nom de domaine** — un domaine personnalisé était envisagé, jamais mis en place

Pour développer sans toucher aux données réelles : créer un projet Firebase gratuit
personnel, coller sa configuration dans l'écran d'installation de l'application, et
travailler sur des données fictives. C'est la méthode recommandée au démarrage.

---

## 7. Conventions

- **Commentaires et noms de variables en français** dans le code récent. Le code plus
  ancien est en anglais ; l'ensemble est mixte, ce n'est pas satisfaisant mais l'uniformiser
  d'un coup créerait un diff illisible.
- Les commentaires expliquent **pourquoi**, pas quoi. Ceux qui documentent un piège de
  mise en page méritent d'être conservés : ils ont chacun coûté une régression.
- Messages de commit en français, à l'impératif.

---

## 8. Fonctionnalités en place

Devis et factures avec calcul de marge · bibliothèque de prestations · catalogue matériaux
avec prix d'achat · facturation par échéances déclenchée à l'acceptation (acompte,
mi-chantier, solde, ou facture unique sans acompte) · procès-verbal de réception conditionné
à la date de fin de chantier · PV de levée des réserves séparé · signature de l'entreprise
apposée automatiquement · pièces jointes avec compression d'image · CGV en 19 articles
tenant sur une page · lien public de signature électronique · tableau de bord · export CSV.
