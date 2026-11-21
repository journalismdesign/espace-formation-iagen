# Espace formation IA générative (v2)

Plateforme de formation de Gerald Holubowicz (journalism.design). Elle comprend un back-office formateur et un espace stagiaire, et couvre la formation « Prendre en main les IA génératives » (RF·FTV, Libération 2026). Le README couvre l'installation, Supabase et le déploiement.

## Stack et principes
- Vite et JavaScript vanilla en modules ES, sans framework. Le routage se fait par ancre `#/…` dans `src/main.js`. Les vues sont des fonctions `view(root, params, ctx)` qui renvoient éventuellement une fonction de nettoyage (abonnements temps réel, minuteries).
- Supabase fournit l'authentification (lien magique et Google), Postgres, le temps réel et une fonction Edge. **Toutes les règles d'accès sont en RLS** dans `supabase/migrations/…_init.sql`. Ne jamais compter sur le front pour la sécurité.
- Le mode démonstration (`src/api/demo.js`) expose la même interface que `src/api/supabase.js`. Toute nouvelle méthode d'API doit être ajoutée **aux deux**.
- La clé du modèle de langage n'est jamais dans le navigateur. Les appels passent par `supabase/functions/assistant`, qui authentifie, plafonne (quota quotidien, 3 générations de pistes) et relaie vers l'API Anthropic.
- Les contenus pédagogiques sont dans `src/data.js` : fiches, glossaire, prompts, quiz, déroulés D1 et D2, presets. Les numéros de page renvoient au deck Google Slides `1G-exjcmMujp3XtEAOMCyzR9Plk3OzgS1qnVdTI0rJkg` (135 pages).

## Conventions
- Tout en français : interface, commentaires, messages d'erreur. Écriture inclusive au point médian.
- Espaces insécables avant `: ; ? ! %`. Faire passer les textes affichés par `T()` (échappement et typographie) ou `fr()`.
- Design : palette marine et bleu du deck (`--navy #0A2D4E`, `--blue #124F90`, accent jaune `--yel`), Montserrat et IBM Plex Mono **auto-hébergées** (@fontsource). Le design system Synth a été essayé puis **refusé** : ne pas le réappliquer sans demande.
- Sobriété : pas de dépendance lourde, pas de traceur, pas de ressource tierce au chargement.

## Modèle de données (résumé)
- `profiles` : rôle `trainee` ou `trainer`. Le rôle formateur est attribué si l'e-mail figure dans `trainer_emails`.
- `sessions` : `activities` contient la séquence du jour J, `live` l'état diffusé (`{act, qi, reveal, options}`), `status` vaut draft, live ou closed.
- `session_members` : progression et émargement. `session_invites` sert à l'invitation par e-mail. `join_session(code)` sert au code ou au QR.
- `projects` : cadrage. Le champ `data` contient `{mode, besoin, pourqui, pistes, choix, retenu, analyse:{v1,v2}, steps}`. `trainer_comment` s'écrit via `comment_project`.
- `responses` : une réponse par personne et par activité. Pour un quiz, la clé est `quizId#index`. La lecture collective passe uniquement par `live_results`.
- `threads`/`posts` pour la discussion, `resources`/`session_secrets` pour les ressources de la session, `ai_usage` pour le quota IA.

## Tester
- `npm run test:sql` : migration et droits dans PGlite, avec simulation du schéma `auth`.
- `npm run build && npx vite preview --port 4173`, puis `python3 tests/e2e.py` : parcours complet en démo. La variable `CHROME` permet de choisir le navigateur.

## Points ouverts
- Envoi d'e-mails d'invitation : il n'est pas fait par la plateforme, le formateur transmet le lien lui-même. Piste : une fonction Edge avec un SMTP.
- Fournisseur IA : Anthropic par défaut. Mistral est une alternative possible (adapter `fetch` dans la fonction).
- `legacy/` contient la version claude.ai monofichier, pour mémoire.
