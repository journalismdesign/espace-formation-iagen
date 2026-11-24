# Passation vers Claude Code (24 novembre 2026)

Ce document résume une longue séance de travail menée dans claude.ai, pour la reprendre dans Claude Code. Il complète `CLAUDE.md`, qui reste la référence des conventions et de l'architecture et a été mis à jour au fil de la séance : **lisez `CLAUDE.md` d'abord**.

## Le projet en bref

- **Plateforme de formation** de Gerald Holubowicz (journalism.design), pour la formation « Prendre en main les IA génératives » (Samsa ; clients RF·FTV, Libération, Radio France).
- **Dépôt** : `journalismdesign/espace-formation-iagen`, branche locale `master`, poussée sur `main` (`git -c push.negotiate=true push origin master:main`). Le déploiement GitHub Pages se fait à chaque push sur `main`.
- **Site** : https://formation.journalism.design ; lien court d'une session : `formation.journalism.design/CODE`.
- **Copie de travail de Gerald** : `~/Dropbox (Personal)/2 - JOURNALISM.DESIGN/JD/CLAUDE/Projets/JD general/formations/azure-dashboard/espace-formation-iagen`. Pendant la séance, chaque fichier modifié y était recopié après le push. Avec Claude Code dans ce dossier, travaillez directement dans le dépôt et faites `git pull` d'abord : le fichier `.github/workflows/keepalive.yml` n'a pas pu y être recopié (dossier protégé), il n'existe que sur GitHub.
- **Stack** : Vite et JavaScript vanilla, Supabase (projet `hzojrqgndwioezbrcspi`, offre gratuite), fonction Edge `access` (codes envoyés par Brevo).

## Vérifier avant toute livraison

```bash
npm run test:sql                       # migrations et droits (PGlite)
npm run build && npx vite preview --port 4173 &
CHROME=/usr/bin/google-chrome python3 tests/e2e.py   # parcours complet en démo, doit finir par « OK : parcours complet »
```

Commits terminés par :

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Ce qui a été fait pendant la séance (du plus ancien au plus récent)

| Commit | Contenu |
|---|---|
| `31cb048` | Discussion façon messagerie (`src/lib/chat.js`, `mountChat`), même composant côté stagiaire et en widget compact dans le back-office (Jour J et Après). Badge « Équipe » posé par déclencheur. Session close : le stagiaire garde ressources, fiches, outils et support (`CLOSED_TABS`). Migration `20261124000000_discussion.sql` (`chat_open`, colonne `staff`). |
| `03a3a67` | Mode « formation en ligne » (`sessions.online`, case en tête du pilotage) : l'écran projeté s'affiche dans la carte « En direct » du stagiaire. Migration `20261124010000_en_ligne.sql`. |
| `e93f513` | Duplication complète des sessions (fenêtre `openDuplicate`, bouton ⧉ de la liste, en-tête de session, Après). Options : reprendre les stagiaires, recopier les valeurs des codes. Migration `20261124020000_duplication.sql`. « Tout effacer » dans la discussion (équipe). Ajout de présentation tolérant au lien collé dans le champ du titre. |
| `bba46f3` | Séquence « Accueil, objectifs, niveau et attentes » : pages 3 à 9 du support (1 et 2 jours, et conducteurs modèles). Règle de Gerald : on ne retire pas de page de la liste, on masque la slide dans Google Slides. |
| `dc3f079` | Stagiaire : « Émargement » sort des ressources, devient un bouton vert sous « En direct », visible pendant les créneaux (début de journée et fin du déjeuner, 30 min) ou quand le formateur projette l'émargement. « Le jour J » au-dessus de « Mon cadrage ». Pilotage : Émargement avant Formateur dans les écrans d'ouverture. Pastille d'état sur une ligne. |
| `2cddf58` | Performances : page suivante du support préchargée dans une iframe invisible (`data-preload`, `morphFrame`). Abonnements temps réel restreints (`api.watch(sid, cb, tables)`). `warmAccess()` réveille la fonction `access`. Tâche GitHub `keepalive.yml` (lundi et jeudi) contre la mise en pause du projet gratuit. |
| `c0e6943` | Pilotage : aperçu « À suivre » de la page suivante (`nextPage`), horloge avec temps écoulé depuis la première ouverture de la salle du jour (`live.started`). |
| `4e798f4` | Déroulé stagiaire : créneaux d'émargement insérés à leur heure, « Émarger maintenant » pendant le créneau, « ✓ Validé » une fois passés (`withSlots`, `slotHtml`). |
| `f0aacc8` | Accueil en salle : écran d'attente et vue `qr` en slide « Rejoindre » (grand QR, adresse courte, étapes). « Projeter le QR code » (Jour J) projette sur l'écran. Ouvrir la salle sans rien de projeté passe sur la slide de titre. Pilotage au clavier et à la télécommande (`stepLive`, `pageKey`), dans le pilotage et dans la fenêtre de l'écran projeté. |

## État côté Supabase (fait par Gerald)

- Migrations `roles_admin` et `reponses` exécutées ; configuration d'URL pour formation.journalism.design ; secret `ALLOWED_ORIGIN` ; fonction `access` redéployée.
- Limites d'authentification relevées à 150 (*token verifications* et *sign ups and sign ins*), pour 15 stagiaires derrière le même Wi-Fi.
- Migrations du 24 novembre exécutées (confirmé par Gerald le 24 novembre 2026) : `…_discussion.sql`, `…_en_ligne.sql`, `…_duplication.sql`.

## Points ouverts et pistes non traitées

- **Slides masquées dans Google Slides** : non vérifié. Le support par défaut est appelé par identifiant de slide (une slide masquée risque de s'afficher quand même) ; les autres decks par numéro de page (on ne sait pas si Google compte les slides masquées). Test proposé : masquer une slide test dans le deck Libé et la parcourir depuis le pilotage. Si elle reste visible, ajouter une liste de pages à sauter dans les réglages de session.
- **Préchargement et aperçu de la page suivante** : vérifiés seulement par les tests (pas d'accès à Google dans l'environnement de test). À contrôler en vrai sur l'écran projeté.
- **« Session introuvable »** : le même écran s'affiche pour une session close et pour une erreur de Supabase ; Gerald a compris la cause lui-même, mais distinguer les deux messages a été proposé.
- **Onglet Avant** : le bouton « Projeter le QR code » ouvre toujours le QR en plein écran sur l'écran du formateur ; à basculer sur l'écran projeté si Gerald le souhaite.
- **Évaluation de fin de stage** dans le déroulé du stagiaire : pas ajoutée (seuls les émargements le sont) ; possible sur le même modèle.
- **Bouton d'émargement** : visible aussi quand le formateur projette l'émargement et toujours en aperçu formateur, en plus des créneaux demandés ; à resserrer si Gerald préfère.
- **Support Google Slides en mode en ligne** : l'identifiant du deck reste lisible dans la page ; un·e stagiaire pourrait ouvrir le deck entier si son partage est public. Parade : projeter une copie ou des images exportées.
- **Charge** : 15 connexions simultanées sont très en dessous des limites mesurées. Un script de simulation de 15 stagiaires a été proposé, à ne lancer qu'avec l'accord de Gerald (il écrit dans la vraie base).
- Points ouverts plus anciens : voir la fin de `CLAUDE.md` (logos clients officiels, session navigateur d'un·e stagiaire qui survit à l'expiration du code).

## Travail sur les présentations Google Slides (même séance)

- **Deck RF·FTV** `1G-exjcmMujp3XtEAOMCyzR9Plk3OzgS1qnVdTI0rJkg` : ajout des slides `libe01` (« Quels usages à Libé ? »), `syn01` (newsletter Synth), `rmq01` et `rmq02` (« Un service, pas un outil ni une source », « Prompter n'est pas tout »).
- **Deck Libération** `1bAZwKDggjBTCwRQCn4696doqsQBAsI39V1GHFolWVvw` : remis en ordre sur le déroulé d'une journée, pieds de page et sommaires renumérotés, intercalaire `annx0` « Annexes » ; slide `cost01` « Qui gagne de l'argent ? » refaite sur le modèle d'isaiprofitable.com (DeepSeek et Cohere omis). Au 24 novembre à 1 h, **aucune slide n'y était masquée**, y compris les annexes masquées plus tôt : à vérifier avec Gerald.
- DA des decks : page 20 × 11,25 in, Montserrat, marine #0A2D4E, bleu #124F90, panneau #F2F4F7, pied bleu « SAMSA · JOURNALISME & IA · 2026 » avec numéro de page.

## Préférences de Gerald utiles pour la suite

- Tout en français, écriture inclusive au point médian dans les textes destinés aux stagiaires.
- Réponses directes et exploitables, une seule question si l'ambiguïté est réelle, hypothèses signalées.
- Ne pas pousser en production sur une simple question (« comment améliorer ça ? ») : proposer, puis attendre son accord.
