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
- Logo Samsa (organisme, blanc) : `src/assets/samsa-logo.png`, **toujours présent dans le bandeau bleu** (en-tête, slides d'entrée). Sur fond clair, il est teinté en marine par masque CSS (`samsaHtml(false)`). Un logo d'organisme déposé dans les réglages le remplace dans les blocs de logos, jamais dans le bandeau.
- Écran projeté et slides d'entrée : **DA du support Google Slides**. Format 16:9 dimensionné en `cqw`. Marine #0A2D4E, bleu #124F90, panneau #F2F4F7, surtitres #C3CADD (fond marine) ou #4A6A95 (fond clair), titres en capitales grasses, pastilles carrées alternées bleu/marine, pied bleu avec Samsa et « JOURNALISME & IA · année ». Voir `src/lib/screen.js`.
- Logos en deux versions : `logo` (sombre, pour fonds clairs) et `logo_light` (claire, pour fonds marine), pour les entreprises (`brands`), la session (`client_logo`/`client_logo_light`) et l'organisme (`org_logo`/`org_logo_light`). Le choix se fait par `pickLogo(x, onDark)`. Le logo client est toujours sans cadre, sous « Une formation pour ».
- Parcours stagiaire : toute séquence antérieure à celle lancée par le formateur est validée d'office, en vert (« ✓ Validé »), et compte dans la progression.
- Émargement en deux étapes (page « Informations générales » du support) : « Pour Samsa.fr » avec le QR de l'organisme, puis « Pour <client> » avec le lien reçu par e-mail. Le libellé client est modifiable (`sessions.emargement_label`, sinon le nom de l'entreprise). Le second émargement peut être masqué (`emargement2_enabled`) et son texte modifié (`emargement2_text`).
- « En direct » : toujours en rouge (`--live`), avec un rond qui clignote.
- Émargement : deux créneaux par jour, à l'arrivée (heure de début) et à la reprise (fin de la pause déjeuner). Ils sont insérés dans le déroulé du pilotage, avec un rappel de 15 min avant à 30 min après. Ce qui a été présenté est conservé dans `live.emarg`.
- Sobriété : pas de dépendance lourde, pas de traceur, pas de ressource tierce au chargement.

## Parcours et pilotage (v3)
- Entrée stagiaire : `#/join/CODE` (`src/views/entry.js`), en slides plein écran. Étapes : titre, prénom et e-mail, code, émargement, support, puis le tableau de bord. Le drapeau `progress.intro` évite de rejouer l'intro. Le code passe par la fonction Edge `access` (request/verify), qui ouvre une session Supabase via `generateLink`, puis `verifyOtp` côté navigateur.
- Formateur : `#/formateur`, protégé par un code d'accès vérifié côté serveur (`check_trainer_code`, empreinte SHA-256 dans `private_settings` ; code de démo : `SAMSA-DEMO`), puis lien magique ou Google. Sans code défini, ou via « Code oublié ? », le formateur reçoit un code temporaire par e-mail (OTP Supabase Auth, `sendTrainerOtp`/`verifyEmailOtp`), puis choisit le code d'accès sur `#/formateur/code` (drapeau `localStorage` `iagen-code-reset` ; `claim_trainer()` vérifie `trainer_emails`). Back-office : `#/admin` (sessions), `#/admin/reglages` (organisme et logos clients), `#/admin/s/:id/{reglages|avant|jour|apres}`, `#/ecran/:id` (écran projeté, à ouvrir depuis le back-office).
- `sessions.live = {view, module, slide, act, qi, reveal, options}`. `view` vaut title, emargement, support, module, slide ou activity. `currentAct()` ne renvoie une activité que si `view` vaut activity.
- Évaluation de fin de stage : `sessions.evaluation_url/evaluation_qr/evaluation_title/evaluation_text`, vue `live.view = 'evaluation'`. Elle se lance par le bouton du pilotage ou par le créneau placé avant la dernière séquence du dernier jour. Côté stagiaire, elle apparaît au-dessus du téléchargement du support une fois celui-ci débloqué.
- Intervenant·es : table `trainers` (photo, `roles` [{label,value,url}], `tagline` avec `**passages en bleu**`, `tagline_sub`, email, site, `socials`), page `#/admin/formateurs`, choix par session (`sessions.trainer_id`), vue `live.view = 'trainer'` (slide « L'intervenant », modèle de la page 5 du support).
- Réglages de session : colonne droite en accordéons exclusifs, dans l'ordre Émargement (ouvert à l'arrivée), Slides projetées, Évaluation, Support. Le nom et le logo du client ne s'éditent qu'avec « Autre » ; sinon ils viennent de `brands`.
- Lien court de session : `<site>/CODE`. `public/404.html` (GitHub Pages) et le démarrage de `main.js` le redirigent vers `#/join/CODE`. `VITE_SHORT_BASE` permet d'utiliser un domaine plus court.
- Présentations supplémentaires : `sessions.decks` (`[{id,title,url}]`) accepte Google Slides (navigation par page depuis le pilotage) ou un fichier Drive (PDF dans la visionneuse `/preview`, qu'on ne peut pas piloter page par page). Vue `live.view = 'deck'` avec `live.deck` et `live.page`.
- Slides Drive : `src/deck.js` contient l'ordre des 135 slides du support par défaut (identifiants de page) et `parsePages("11 à 16, 18")`. Pour un autre support, l'affichage se fait par numéro de page.

- Formulaires longs (réglages de session, fiche intervenant·e) : brouillon automatique dans `localStorage` (`src/lib/draft.js`, `keepDraft(form, clé)`), restauré à l'affichage, effacé à l'enregistrement, avec « Tout réinitialiser » (deux clics, vide les champs texte sans rien enregistrer). `main.js` ne redessine plus la page quand Supabase réémet la connexion au retour sur l'onglet (même utilisateur·ice).

## Modèle de données (résumé)
- `profiles` : rôle `trainee` ou `trainer`. Le rôle formateur est attribué si l'e-mail figure dans `trainer_emails`.
- `sessions` : `activities` contient la séquence du jour J, `live` l'état diffusé (`{act, qi, reveal, options}`), `status` vaut draft, live ou closed.
- `session_members` : progression et émargement. `session_invites` sert à l'invitation par e-mail. `join_session(code)` sert au code ou au QR.
- `projects` : cadrage. Le champ `data` contient `{mode, besoin, pourqui, pistes, choix, retenu, analyse:{v1,v2}, steps}`. `trainer_comment` s'écrit via `comment_project`.
- `responses` : une réponse par personne et par activité. Pour un quiz, la clé est `quizId#index`. La lecture collective passe uniquement par `live_results`.
- Migrations, dans l'ordre : `…_init.sql`, `…_v3_acces_pilotage.sql`, `…_logos_clair_sombre.sql`, `…_emargement_libelle.sql`, `…_presentations.sql`, `…_emargement_second.sql`, `…_evaluation.sql`, `…_code_formateur.sql`, `…_formateurs.sql`, `…_premiere_connexion.sql`, `…_droits_explicites.sql`. Les projets Supabase récents n'accordent plus de droits par défaut : toute nouvelle table doit recevoir ses `grant` explicitement (les tests SQL tournent sans droits par défaut).
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
