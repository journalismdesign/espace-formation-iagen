# Format d'un conducteur (.md)

Un conducteur décrit le déroulé d'une session : journées, séquences, horaires et contenus. Il s'importe dans **Back-office → session → Réglages → Conducteur**. L'aperçu signale les erreurs (bloquantes) et les remarques avant d'appliquer. Le conducteur appliqué remplace le déroulé par défaut côté stagiaire (parcours), dans le pilotage et sur l'écran projeté. « Revenir au déroulé par défaut » le retire.

```markdown
---
formation: Prendre en main les IA génératives      ← facultatif
---

# Jour 1 · Comprendre, puis Gemini Notebook        ← une ligne par journée ; inutile pour une seule journée (5 journées au plus)

## 09:30–09:40 · Accueil, objectifs, attentes      ← une séquence : début–fin, puis titre
type: discussion                                   ← comprendre | pratique | discussion | pause
cas: Un service, pas un outil                      ← exemple de rédaction cité
pages: 3, 8, 9                                     ← pages du support projetées depuis le pilotage
temps fort: 1
activité: niveau                                   ← activité en salle (niveau, attente, carnet, invente, lettre, fini, ia, lundi)
quiz: llm                                          ← llm, redac, notebook, jargon, rmctf, sve, donnees
fiches: notebook, donnees                          ← fiches pratiques liées
exemples: oui                                      ← affiche la liste des exemples de rédactions
outil: rmctf                                       ← outil d'exercice (rmctf, sve ou code couleur) qui apparaît aux stagiaires quand la séquence est lancée

### Objectifs
- …

### Points clés
- …

### Discussion
- …

### Exercice : Votre premier carnet (40 min)
1. Première étape
2. Deuxième étape
prompts: carnet, interview                         ← prompts proposés à la copie

## 10:45–11:00 · Pause                              ← « Pause » ou « Déjeuner » suffit
```

Règles : horaires en `09:30` ou `9h30`, séparés par un tiret ou « à ». Les identifiants (quiz, activités, fiches, prompts) inconnus sont retirés avec une remarque. Les séquences d'une même journée ne doivent pas se chevaucher.

Fichiers fournis :
- `conducteur-1-jour.md` et `conducteur-2-jours.md` : les déroulés actuels, exportés tels quels (un import ne change rien, sert de modèle à modifier) ;
- `conducteur-libe-1-jour.md` : la journée Libération, même déroulé qu’une journée avec les pages du deck Libé (positions dans le deck ; voir le commentaire en tête du fichier) ;
- `conducteur-test-atelier.md` : une matinée-atelier plus courte, pour vérifier qu'un import modifie bien le parcours.

## Ajouts (éditeur de trames)

- `id: j1-accueil` : identifiant de la séquence, écrit à l'export pour qu'il survive à un aller-retour (activités placées, progression des stagiaires).
- `activité: niveau, llm` : plusieurs quiz, sondages ou nuages joués en salle dans la séquence, dans l'ordre (clés de la bibliothèque « Quiz et sondages »).
- `idées: oui` : affiche les pastilles d'aide (tâches pénibles, conducteurs assistés) dans la séquence.
- En-tête : `slides: <lien Google Slides>` et `nombre de slides: 141`, pour l'aperçu et les tuiles de l'éditeur.
- Jusqu'à cinq journées (`# Jour 1` à `# Jour 5`).
