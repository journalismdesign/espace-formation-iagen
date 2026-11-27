---
formation: Prendre en main les IA génératives
---

## 09:30–09:40 · Accueil, objectifs, niveau et attentes du groupe
type: discussion
cas: Un service, pas un outil
pages: 3 à 9
activité: niveau

### Objectifs
- Situer la journée : comprendre jusqu'à 10 h 45, pratiquer ensuite.
- Dire où vous en êtes avec l'IA et ce que vous attendez.

### Points clés
- Un assistant d'IA est un service, pas un outil : on loue un accès dont les conditions et les prix peuvent changer.
- Il ne peut pas être une source à lui seul.

### Discussion
- Quel est votre niveau avec l'IA ? Qu'en attendez-vous pour votre travail ?
- Votre rédaction a-t-elle une charte IA ? L'avez-vous lue ?

## 09:40–09:55 · Où en est l'IA : argent, énergie, droit d'auteur, travail caché
type: comprendre
cas: Le New York Times poursuit OpenAI tout en outillant sa rédaction
pages: 11 à 16

### Objectifs
- Mesurer ce que coûte l'IA : argent, énergie, droit d'auteur, travail caché.
- Comprendre pourquoi un LLM produit des réponses fluides mais parfois fausses.

## 09:55–10:10 · D'où vient l'IA, comment se fabrique un LLM
type: comprendre
cas: Des régularités, pas des faits : d'où la relecture systématique
pages: 18, 24, 27 à 31
quiz: llm
fiches: interface

### Points clés
- Un LLM se fabrique en étapes : données d'entraînement, pré-entraînement, alignement (RLHF), filtres.
- Le pré-entraînement apprend des régularités, pas des faits : d'où la relecture systématique.
- Les règles de ce qui est permis ou refusé sont fixées par chaque entreprise.

## 10:10–10:20 · L'IA et la presse : AI Overviews, la fin du clic
type: comprendre
cas: Le choc de trafic subi par la presse française depuis l'été 2026
pages: 33 à 35

## 10:20–10:45 · Ce qu'en font les rédactions
type: comprendre
cas: Le Monde in English, Ebra, Newsquest, contre-exemple du Los Angeles Times
pages: 37 à 67
quiz: redac
exemples: oui

### Objectifs
- Comprendre l'effet des résumés d'IA sur l'audience de la presse.
- Voir des usages réels, de l'usage assumé au contre-exemple.

### Points clés
- L'essentiel des usages se joue autour de l'article, rarement dans son écriture.
- Partout, la règle est la même : l'outil propose, le journaliste vérifie.

### Discussion
- Lequel de ces usages serait utile dans votre service ? Lequel vous inquiète ?

## 10:45–11:00 · Pause

## 11:00–11:35 · Gemini Notebook : un assistant qui ne lit que vos sources
type: pratique
cas: Les archives du Philadelphia Inquirer, les 400 heures du New York Times
pages: 68 à 70
temps fort: 1
quiz: notebook
fiches: notebook, donnees

### Objectifs
- Créer un carnet et l'interroger.
- Mesurer jusqu'où l'outil reste fidèle à vos sources, et où il en sort.

### Points clés
- Il répond à partir des documents chargés et renvoie au passage cité.
- Une réponse sourcée n'est pas une réponse vérifiée.
- Aucun document confidentiel depuis un compte personnel : appliquez le code couleur.

## 11:35–12:20 · Exercices : votre premier carnet, préparer une interview
type: pratique
cas: Les questions d'interview, un usage autorisé au New York Times
pages: 71
temps fort: 1
activité: carnet

### Exercice : Votre premier carnet, puis une fiche d'interview (40 min)
1. Choisir un dossier suivi par votre rédaction, que vous connaissez bien.
2. Charger cinq sources publiques : un rapport, deux articles, une vidéo YouTube, un PDF.
3. Poser trois questions dont vous connaissez la réponse ; noter ce qui est juste, approximatif, faux.
4. Ouvrir chaque citation : la réponse est-elle dans le passage cité, au même sens ?
5. Poser une question hors corpus : l'outil refuse, prévient, ou invente ?
6. Demander une fiche de préparation d'interview et contrôler chaque affirmation dans sa source.
prompts: carnet, interview

## 12:20–12:30 · Débrief : ce que l'outil a inventé, raté, trouvé
type: discussion
cas: Le Recopilleur : la machine désigne, le journaliste compare
pages: 60
activité: invente

### Discussion
- Combien de réponses justes, approximatives, fausses ?
- Les erreurs viennent-elles de la lecture des sources ou d'un ajout du modèle ?
- Quel temps de vérification pour quel gain ?
- Auriez-vous publié l'une de ces réponses telle quelle ?

## 12:30–13:30 · Déjeuner

## 13:30–13:45 · ChatGPT, Claude, Mistral, Gemini : qui les édite, quel droit s'applique
type: pratique
cas: medIAgen, le portail multi-modèles de France Télévisions
pages: 74
temps fort: 2
quiz: jargon

### Objectifs
- Se repérer dans les quatre interfaces.
- Comprendre projet, connecteur, compétence, plugin, MCP.
- Régler la confidentialité et écrire ses instructions personnalisées.

## 13:45–14:30 · Tour du propriétaire, réglages de confidentialité, instructions
type: pratique
cas: Radio France héberge Whisper chez elle pour protéger la voix des sources
pages: 75 à 79, 86, 87, 91
temps fort: 2
fiches: interface, projet, connecteur, competence, plugin, mcp, instructions, injection
outil: code couleur

### Points clés
- Les assistants partagent la même architecture : projets, sélecteur de modèle, outils, historique, paramètres.
- Un seul est européen : Mistral. Les trois autres relèvent du droit américain.
- Plus un assistant est connecté, plus il est utile, et plus une erreur peut coûter.

### Exercice : Mise en route guidée (30 min)
1. Créer un compte dédié sur deux assistants, jamais avec votre adresse professionnelle.
2. Désactiver l'entraînement et repérer le chat temporaire.
3. Repérer les sept zones de l'interface sur chaque assistant.
4. Coller le modèle d'instructions personnalisées et l'adapter à votre service.
5. Tester avec une question piège sur un fait obscur : la règle « si tu ne sais pas, dis-le » tient-elle ?
prompts: instructions

## 14:30–14:50 · Méthode R·M·C·T·F
type: pratique
cas: BBC Style Assist, les gabarits de l'AP, le déontologue de Jean Abbiateci
pages: 100 à 103
temps fort: 2
quiz: rmctf
fiches: rmctf
outil: rmctf

### Objectifs
- Écrire une demande complète en cinq questions.
- Constater l'écart entre un prompt nu et un prompt construit.

### Points clés
- Un prompt est une commande, pas une recherche : une consigne complète, comme pour un·e stagiaire brillant·e.
- Rôle, mission, contexte, tâche, format.
- Six réflexes : délimiter la source, autoriser le doute, donner un exemple, itérer, prompt inversé, changer de plateforme.

## 14:50–15:15 · Paliers 1 et 2 : résumé nu, puis résumé guidé
type: pratique
cas: Résumés et titres oui, réécriture non : la règle du New York Times
pages: 121 à 123
temps fort: 2
activité: lettre

### Exercice : Résumé nu, puis résumé guidé (20 min)
1. Choisir un document public long et récent que vous connaissez bien.
2. Palier 1 : coller le texte dans deux assistants avec ce seul prompt : « Résume ce texte. »
3. Observer longueur, structure, hiérarchie, erreurs.
4. Palier 2 : refaire avec le prompt R·M·C·T·F (outil Constructeur).
5. Comparer précision, utilité et temps de vérification.
prompts: resume

## 15:15–15:30 · Pause

## 15:30–16:10 · Paliers 3 et 4 : analyser un texte, fabriquer un objet
type: pratique
cas: Un millier d'articles locaux classés dans un tableur (J. Abbiateci)
pages: 124, 125
temps fort: 2

### Objectifs
- Utiliser l'IA comme premier lecteur critique, pas comme rédacteur.
- Produire un objet directement utilisable : un planning, un CSV.

### Points clés
- Distinguer faits vérifiables, opinions et affirmations sans source.
- L'IA produit aussi des objets : tableaux, CSV, check-lists, rétroplannings.
- Vérifier les dates et les jours de la semaine : erreur fréquente.

### Exercice : Analyse d'une tribune, puis planning de couverture (40 min)
1. Palier 3 : soumettre une tribune ou un discours du jour avec le prompt d'analyse.
2. Vérifier que chaque citation proposée figure bien dans le texte.
3. Palier 4 : demander un planning de couverture d'un événement de 5 jours, puis sa version CSV.
4. Importer le CSV dans un tableur et contrôler dates et jours.
prompts: analyse, planning

## 16:10–16:25 · Méthode S·V·E : spécification, vérification, environnement
type: pratique
cas: Scrape, au Philadelphia Inquirer : une spec corrigée chaque jour
pages: 104 à 108
temps fort: 2
quiz: sve
fiches: sve, projet, configuration
outil: sve

### Objectifs
- Passer d'une demande ponctuelle à un travail organisé sur plusieurs sessions.
- Écrire les critères avant d'exécuter.

### Points clés
- S : transmettre le but réel, découper en lots courts, faire lister les hypothèses.
- V : fixer les critères avant, un second regard, un signal extérieur.
- E : instructions permanentes, base documentaire, procédures, garde-fous gradués.

## 16:25–17:00 · Exercices : la spec par interview, les critères d'abord
type: pratique
cas: Les tip sheets de CalMatters, la vérification chez Newsquest
pages: 110, 112
temps fort: 2

### Exercice : La spec par interview, puis les critères d'abord (30 min)
1. Choisir un sujet au long cours de votre rédaction.
2. Lancer le prompt de spec par interview et répondre une question à la fois.
3. Relire la spec : combien d'hypothèses l'IA a-t-elle posées seule ? Lesquelles sont fausses ?
4. Sur un rapport public lié au sujet, faire énoncer les critères d'une fiche d'interview, les corriger, puis faire évaluer la fiche critère par critère.
prompts: spec, criteres

## 17:00–17:15 · Les limites : conformité n'est pas vérité
type: discussion
cas: Der Spiegel : l'outil propose, le vérificateur décide
pages: 109

### Points clés
- Conformité n'est pas vérité.
- Des prescripteurs intéressés, des coûts cachés, un risque d'atrophie.

### Discussion
- Qu'est-ce qui vous a surpris aujourd'hui ?
- Où placez-vous la limite entre assistance et écriture ?
- Qui, dans votre rédaction, devrait décider des outils ?

## 17:15–17:30 · Bilan : qu'allez-vous tester lundi matin ?
type: discussion
cas: Évaluation à chaud
pages: 133 à 135
activité: lundi

### Discussion
- Une tâche précise que vous testerez la semaine prochaine.
- Une question qui reste ouverte.
