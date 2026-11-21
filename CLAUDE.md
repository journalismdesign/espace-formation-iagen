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

## Parcours et pilotage (v3)
- Entrée stagiaire : `#/join/CODE` (`src/views/entry.js`), en slides plein écran. Étapes : titre, prénom et e-mail, code, émargement, support, puis le tableau de bord. Le drapeau `progress.intro` évite de rejouer l'intro. Le code passe par la fonction Edge `access` (request/verify), qui ouvre une session Supabase via `generateLink`, puis `verifyOtp` côté navigateur.
- Formateur : `#/formateur` (lien magique ou Google). Back-office : `#/admin` (sessions), `#/admin/reglages` (organisme et logos clients), `#/admin/s/:id/{reglages|avant|jour|apres}`, `#/ecran/:id` (écran projeté, à ouvrir depuis le back-office).
- `sessions.live = {view, module, slide, act, qi, reveal, options}`. `view` vaut title, emargement, support, module, slide ou activity. `currentAct()` ne renvoie une activité que si `view` vaut activity.
- Slides Drive : `src/deck.js` contient l'ordre des 135 slides du support par défaut (identifiants de page) et `parsePages("11 à 16, 18")`. Pour un autre support, l'affichage se fait par numéro de page.

## Modèle de données (résumé)
- `profiles` : rôle `trainee` ou `trainer`. Le rôle formateur est attribué si l'e-mail figure dans `trainer_emails`.
- `sessions` : `activities` contient la séquence du jour J, `live` l'état diffusé (`{act, qi, reveal, options}`), `status` vaut draft, live ou closed.
- `session_members` : progression et émargement. `session_invites` sert à l'invitation par e-mail. `join_session(code)` sert au code ou au QR.
- `projects` : cadrage. Le champ `data` contient `{mode, besoin, pourqui, pistes, choix, retenu, analyse:{v1,v2}, steps}`. `trainer_comment` s'écrit via `comment_project`.
- `responses` : une réponse par personne et par activité. Pour un quiz, la clé est `quizId#index`. La lecture collective passe uniquement par `live_results`.
- v3 : `sessions.date2/start_time/end_time/brand_id/client_logo/slides_url/emargement_url/emargement_qr/support_unlocked`, `brands`, `app_settings` (org_name, org_logo), `session_support` (lien lu via `support_status`), `access_codes` (empreintes, purge à expiration et à la clôture), `session_public(code)` lisible sans connexion.
- `threads`/`posts` pour la discussion, `resources`/`session_secrets` pour les ressources de la session, `ai_usage` pour le quota IA.

## Tester
- `npm run test:sql` : migration et droits dans PGlite, avec simulation du schéma `auth`.
- `npm run build && npx vite preview --port 4173`, puis `python3 tests/e2e.py` : parcours complet en démo. La variable `CHROME` permet de choisir le navigateur.

## Points ouverts
- Logos clients : à déposer à partir des fichiers officiels (ne pas les redessiner).
- La session navigateur d'un·e stagiaire survit à l'expiration de son code. Pour couper l'accès après la formation, il faudrait réduire la durée des jetons ou révoquer les sessions à la clôture.
- Fournisseur IA : Anthropic par défaut. Mistral est une alternative possible (adapter `fetch` dans la fonction).
- `legacy/` contient la version claude.ai monofichier, pour mémoire.
