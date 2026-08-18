# Devis & Factures

Application de gestion de devis, factures et procès-verbaux de réception pour une
entreprise individuelle du bâtiment. Application web d'une seule page, sans chaîne de
compilation : tout tient dans `index.html`.

**Nouveau sur le projet ? Lisez [PASSATION.md](PASSATION.md) d'abord.**
Ce document explique le contexte métier, l'architecture, les pièges du rendu imprimable
et ce qui reste à faire.

## Démarrer

```bash
npm install
npm test          # 42 tests, doit être vert avant tout push
```

Pour exécuter l'application en local, ouvrir `index.html` dans un navigateur. Elle
demandera une configuration Firebase : créer un projet gratuit et travailler sur des
données fictives plutôt que sur les données réelles.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | l'application entière : HTML, CSS et JavaScript |
| `tests/` | suite de tests exécutée par `npm test` |
| `firestore.rules` | copie de référence des règles de sécurité (la source fait foi dans la console Firebase) |
| `PASSATION.md` | document de reprise |
| `.github/workflows/` | exécution automatique des tests à chaque push |

## Déploiement

Un push sur `main` publie automatiquement via GitHub Pages. Les tests s'exécutent en
parallèle : ils **signalent** une régression mais ne bloquent pas encore la publication.
