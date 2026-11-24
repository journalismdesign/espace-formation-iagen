# Espace formation · Prendre en main les IA génératives

Plateforme de formation en deux faces :

- **Back-office formateur** : sessions, invitations, QR code, suivi des cadrages avec retour écrit, animation du jour J (nuage de mots, sondages, quiz, vote, mur des projets) avec écran projeté, émargement, bilan CSV, duplication, ressources et accès par session.
- **Espace stagiaire** : une session par stagiaire invité·e (ou rejointe par code), « À faire maintenant », préparation, cadrage du cas d'usage en quatre étapes (sans IA, commenté par le formateur), direct, déroulé avec quiz, fiches pratiques, glossaire, prompts, outils R·M·C·T·F et S·V·E, discussion.

**Stagiaires** : ils entrent par le lien ou le QR code de la session. Le parcours d'entrée s'affiche en slides plein écran :
1. titre de la formation (logos de l'entreprise et de l'organisme, une ou deux dates) ;
2. connexion avec le prénom et l'e-mail : un **code personnel** est envoyé par e-mail ;
3. émargement (QR code de l'organisme) ;
4. support, téléchargeable une heure avant la fin.

Le code fonctionne sur tous les appareils jusqu'au dernier jour, 23 h 59, puis il est détruit, ou dès la clôture de la session.

**Formateur·ices** : connexion par lien magique ou par Google sur `#/formateur`.

**Pilotage depuis le Jour J** : le formateur choisit ce que montrent l'écran projeté et l'espace des stagiaires.
- Ouverture en discussion libre : slide de titre, émargement, support.
- Séquence en cours du déroulé.
- Pages du support Google Slides pendant les séquences « Comprendre ».
- Activités en direct.

## Démarrer en mode démonstration (sans rien configurer)

```bash
npm install
npm run dev        # http://localhost:5173
```

Sans fichier `.env`, l'application tourne entièrement dans le navigateur (localStorage).

- Côté formateur : ouvrez `#/formateur`, saisissez le code `SAMSA-DEMO`, puis cliquez sur « Entrer comme formateur ».
- Côté stagiaire : dans un autre onglet, ouvrez `#/join/DEMO42`. Le code d'accès s'affiche à l'écran au lieu d'être envoyé.
- L'écran projeté s'ouvre depuis le back-office (Jour J → « Ouvrir l'écran projeté »).

## Mettre en production avec Supabase

Supabase fournit l'authentification, la base Postgres, le temps réel et les fonctions serveur. Le service est open source et peut être auto-hébergé. Choisissez une région européenne (Paris `eu-west-3` ou Francfort).

1. **Créer le projet** sur supabase.com, région UE.
2. **Créer le schéma** : SQL Editor → coller et exécuter `supabase/migrations/20261121000000_init.sql`. Vous pouvez aussi utiliser `supabase db push` avec la CLI.
3. **Déclarer les formateur·ices et le code d'accès formateur** (SQL Editor) :
   ```sql
   insert into trainer_emails values ('gerald@journalism.design');
   ```
   Le code d'accès formateur se choisit à la première visite de `#/formateur` : un code temporaire est envoyé par e-mail à l'adresse déclarée, puis la page demande le code d'accès définitif. Le même parcours sert en cas d'oubli (« Code oublié ? »). Pour que le code figure dans l'e-mail, ajoutez `{{ .Token }}` aux modèles *Magic Link* et *Confirm signup* (Authentication → Emails), par exemple : `<p>Votre code : <b>{{ .Token }}</b></p>`. On peut toujours le définir à la main : `select public.set_trainer_code('un-code-secret');`.
4. **Authentification** (Authentication → Providers) :
   - *Email* : activé. Les liens magiques passent par le SMTP de Supabase, limité à quelques e-mails par heure. Pour une vraie session, branchez votre propre SMTP (Authentication → SMTP Settings), par exemple Brevo ou le SMTP de votre hébergeur.
   - *Google* : créer un identifiant OAuth « Application Web » dans Google Cloud Console (APIs & Services → Credentials). L'URI de redirection autorisée est `https://<projet>.supabase.co/auth/v1/callback`. Collez ensuite le Client ID et le secret dans Supabase.
   - *URL Configuration* : *Site URL* est l'adresse publique du site. Ajoutez-la, avec `http://localhost:5173`, dans *Redirect URLs*.
5. **Variables du site** : copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Project Settings → API). La clé *anon* est publique par conception : les droits sont dans la base (RLS).
6. **Codes d'accès des stagiaires** (fonction `access`). L'envoi passe par Brevo (société française, offre gratuite de 300 e-mails par jour). Créez une clé d'API et validez l'adresse d'expédition, puis :
   ```bash
   supabase functions deploy access --no-verify-jwt
   supabase secrets set BREVO_API_KEY=xkeysib-... MAIL_FROM=formation@journalism.design MAIL_FROM_NAME="Formation IA générative" CODE_PEPPER=$(openssl rand -hex 32)
   ```
   Exécutez aussi `supabase/migrations/20261122000000_v3_acces_pilotage.sql` puis `20261122010000_logos_clair_sombre.sql` `20261122020000_emargement_libelle.sql` , `20261122030000_presentations.sql` , `20261122040000_emargement_second.sql` , `20261122050000_evaluation.sql` , `20261122060000_code_formateur.sql`, `20261122070000_formateurs.sql`, `20261122080000_premiere_connexion.sql`, `20261122090000_droits_explicites.sql`, `20261122100000_conducteur_habillages.sql`, `20261123000000_roles_admin.sql`, `20261123010000_reponses.sql`, `20261124000000_discussion.sql`, `20261124010000_en_ligne.sql`, `20261124020000_duplication.sql` et `20261124030000_pages_masquees.sql`. Activez pg_cron (Database → Extensions) pour la purge horaire des codes expirés. Sans pg_cron, les codes expirés sont refusés et purgés à chaque demande.
7. **Logos** : dans Back-office → Réglages généraux, déposez une fois pour toutes les logos de Radio France, France Télévisions, Libération et de votre organisme, chacun en version sombre (fonds clairs) et en version claire (fonds marine). Utilisez les fichiers officiels fournis par les clients.
8. **Pas d'assistant IA** : retiré pour son coût. La fonction `supabase/functions/assistant` reste dans le dépôt pour mémoire ; inutile de la déployer.
9. **Héberger sur GitHub Pages (le plus simple)** : poussez le dépôt sur GitHub, puis :
   - Settings → Pages → Source : « GitHub Actions » ;
   - Settings → Secrets and variables → Actions → onglet Variables : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

   Chaque envoi sur `main` lance les tests SQL, construit le site et le publie (`.github/workflows/deploy.yml`). Le domaine personnalisé se règle dans Settings → Pages, par exemple `formation.journalism.design` avec un enregistrement CNAME vers `<compte>.github.io`. Ajoutez cette adresse dans Supabase → Authentication → URL Configuration.
10. **Ou héberger ailleurs** : `npm run build`, puis publier le dossier `dist/` sur n'importe quel hébergement statique (Netlify, Vercel, GitHub Pages, OVH…). Le routage par ancre (`#/…`) ne demande aucune règle de réécriture.

## Données et droits

Toutes les règles sont dans la base (Row Level Security), testées par `npm run test:sql` :

- les codes d'accès ne sont stockés que sous forme d'empreinte (SHA-256 + poivre secret) et ne sont lisibles par aucun client ; 8 essais au plus ;
- le lien du support n'est communiqué aux stagiaires qu'une fois débloqué (`support_status`) ;
- un·e stagiaire ne voit que ses sessions, son cadrage, ses propres réponses et la discussion de ses sessions ;
- les résultats collectifs (sondages, quiz, nuages) ne sortent que sous forme agrégée (`live_results`), jamais nominative ;
- impossible pour un·e stagiaire de se promouvoir formateur, de s'émarger ou d'écrire le retour du formateur (droits par colonne) ;
- la liste des formateur·ices (`trainer_emails`) n'est lisible par aucun client.

Ce qui est stocké : e-mail, nom et profil déclaratif (métier, niveau, outils), cadrage, réponses aux activités, messages, progression. Aucun traceur, aucune police chargée depuis un service tiers (polices auto-hébergées). Pensez à mentionner la plateforme et le sous-traitant Supabase dans votre information RGPD aux stagiaires. Vous devez aussi définir une durée de conservation : supprimer une session efface ses cadrages, réponses et discussions.

## Tests

```bash
npm run test:sql                 # schéma et droits, dans un Postgres embarqué (PGlite)
npm run build && npx vite preview --port 4173 &
python3 tests/e2e.py             # parcours complet formateur + stagiaire en mode démo (Playwright)
```

## Organisation du code

```
index.html, src/main.js     entrée, authentification, routage #/…
src/api/                    supabase.js (production) · demo.js (navigateur) · index.js (choix)
src/data.js                 contenus pédagogiques (fiches, glossaire, prompts, quiz, déroulés)
src/lib/                    dom.js (utilitaires) · content.js (parcours, fiches, outils)
                            activities.js (activités du direct) · screen.js (écran projeté)
src/views/                  login, home (mon espace), profile, session (espace stagiaire), cadrage,
                            admin (sessions), adminSession (avant / jour J / après), screen
supabase/                   migration SQL · fonction Edge « assistant »
legacy/                     version claude.ai d'origine (un seul fichier HTML)
```


## Conducteur et habillages

- **Conducteur** : dans une session, Réglages → Conducteur → « Importer un conducteur (.md) ». Un aperçu liste les séquences, les erreurs et les remarques avant d'appliquer. Le format est décrit dans `docs/conducteurs/FORMAT.md` ; `conducteur-1-jour.md` et `conducteur-2-jours.md` reprennent les déroulés actuels, `conducteur-test-atelier.md` sert à vérifier un import. « Télécharger le conducteur actuel » exporte le déroulé en cours pour le modifier.
- **Habillages** : Réglages généraux → Habillages. Un habillage par centre de formation (INA, Journalism.design, ESJ, CFJ…) : couleur d'accent, couleur sombre facultative, logo clair et sombre, mention du pied des écrans. Il se choisit dans les réglages de chaque session ; celui marqué « par défaut » s'applique aux autres. Sans habillage, la palette Samsa d'origine reste en place.
