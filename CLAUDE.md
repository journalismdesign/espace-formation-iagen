# Espace stagiaire · « Prendre en main les IA génératives »

Plateforme web des stagiaires pour la formation IA générative de Gerald Holubowicz (journalism.design). Elle couvre une ou deux journées. Contexte : formations RF·FTV et Libération 2026. Elle suit le support Google Slides « Prendre en main les IA génératives – Formation RF·FTV 2026 » (ID `1G-exjcmMujp3XtEAOMCyzR9Plk3OzgS1qnVdTI0rJkg`). Les numéros de page cités dans le parcours renvoient à ce deck, qui compte 135 pages.

## Conventions
- Tout le contenu destiné aux stagiaires est en français. Les commentaires du code aussi.
- Un seul fichier autonome, `index.html`, sans build ni dépendance npm. Les seules ressources externes sont Google Fonts : Montserrat et IBM Plex Mono.
- Design actuel : palette marine/bleu reprise du deck (`--navy #0A2D4E`, `--blue #124F90`, accent jaune `--yel #FFE94D`). Une variante au design system Synth (noir et blanc, cyan #00E6CC, Coolvetica) a été essayée, puis **abandonnée à la demande de l'auteur**. Ne pas la réappliquer sans demande explicite.
- Espaces insécables avant `: ; ? ! %` dans les textes affichés.

## Architecture de `index.html`
Données en tête du `<script>`. C'est là qu'on modifie le contenu :
- `FICHES` (≈ l. 413) : 13 fiches pratiques (projet, plugin, connecteur, skill, MCP, etc.), ouvertes dans un panneau latéral, adressables par `#fiche-<id>`.
- `GLOSS` : glossaire, 36 termes.
- `PROMPTS` : 12 prompts types, copiables.
- `CASES` : cas d'usage en presse écrite.
- `QUIZ` : quiz par thème (`llm`, `redac`, `notebook`, `jargon`, `rmctf`, `sve`, `donnees`).
- `D1` / `D2` : déroulés à 1 jour et à 2 jours (champ `day` dans D2). Chaque module a un `type` : `comprendre`, `pratique`, `discussion` ou `pause`. La pratique représente environ 2/3 du temps : 69 % sur 1 jour, 65 % sur 2 jours. Deux temps forts : NotebookLM, puis les agents IA (ChatGPT, Claude, Gemini, Mistral) avec les méthodes RMCTF et S·V·E.
- `PRESETS` : activités « en direct » (sondages, nuages de mots).
- `CC` : exercice de tri (jamais / précautions / sans risque).

Vues routées par le hash : `#parcours`, `#ressources`, `#outils`, `#direct`, `#assistant`.

L'état est conservé dans `localStorage`, clé `iagen-formation-v1` : format choisi, modules faits, réponses aux quiz.

La variable d'historique de l'assistant s'appelle `chatHist` et non `history`, pour éviter le conflit avec `window.history`.

## Capacités propres à claude.ai
La page est publiée comme artifact claude.ai :
- slug `a4f75257-8b34-4267-a074-0d232f33b2c1` ;
- URL https://claude.ai/artifact/MNW6QHpf3nQm7LxDMiLPPe ;
- capacités déclarées : `room` et `sample`.

Le bloc en fin de script appelle `claude.use("room")` et `claude.use("sample")`, mais seulement si `window.claude` existe :
- **room** : présence partagée en salle. Le formateur publie `{role:'trainer', act}`, les stagiaires publient `{name, ans:{actId:valeur}}`, et les résultats sont agrégés dans `onPeers`. Rien n'est stocké.
- **sample** : l'assistant d'apprentissage répond via Claude à partir des seules ressources de la page. Il insère des liens `[[fiche:id]]` et `[[prompt:id]]`.

Hors de claude.ai, en local ou sur un autre hébergement, la page se dégrade proprement. Le direct fonctionne alors en local sans partage, et l'assistant passe en recherche locale (`localSearch`). Pour héberger ailleurs avec ces fonctions, il faudrait les remplacer : par exemple un petit backend WebSocket pour `room`, et un proxy vers l'API Anthropic pour `sample`.

## Tester
```bash
pip install playwright && playwright install chromium   # si besoin
python3 tests/shot.py      # ouvre la page, parcourt les vues, écrit des captures s1…s7.png dans tests/
```
Le script affiche `ERRORS: []` si aucune erreur JS ou console n'est relevée.

## Pistes ouvertes
- Aucune tâche en cours. Le dernier changement est le retour au design d'origine (21/11/2026).
