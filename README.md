# Espace formation · Prendre en main les IA génératives

Plateforme de formation en deux faces :

- **Back-office formateur** : sessions, invitations, QR code, suivi des cadrages avec retour écrit, animation du jour J (nuage de mots, sondages, quiz, vote, mur des projets) avec écran projeté, émargement, bilan CSV, duplication, ressources et accès par session.
- **Espace stagiaire** : une session par stagiaire invité·e (ou rejointe par code), « À faire maintenant », préparation, cadrage du cas d'usage en cinq étapes (pistes et analyse produites par l'IA), direct, déroulé avec quiz, fiches pratiques, glossaire, prompts, outils R·M·C·T·F et S·V·E, discussion, assistant d'apprentissage.

Connexion **par lien magique envoyé par e-mail** ou **par Google**. Pas de mot de passe.

## Démarrer en mode démonstration (sans rien configurer)

```bash
npm install
npm run dev        # http://localhost:5173
```

Sans fichier `.env`, l'application tourne entièrement dans le navigateur (localStorage). Boutons « Entrer comme formateur / stagiaire » sur la page de connexion, session de démonstration avec le code `DEMO42`. Ouvrez un onglet formateur et un onglet stagiaire pour tester le direct. L'écran projeté doit être ouvert depuis le back-office (bouton « Ouvrir l'écran projeté »).

## Mettre en production avec Supabase

Supabase fournit l'authentification, la base Postgres, le temps réel et les fonctions serveur. Le service est open source et peut être auto-hébergé. Choisissez une région européenne (Paris `eu-west-3` ou Francfort).

1. **Créer le projet** sur supabase.com, région UE.
2. **Créer le schéma** : SQL Editor → coller et exécuter `supabase/migrations/20261121000000_init.sql`. Vous pouvez aussi utiliser `supabase db push` avec la CLI.
3. **Déclarer les formateur·ices** (SQL Editor) :
   ```sql
   insert into trainer_emails values ('gerald@journalism.design');
   -- si le compte existe déjà :
   update profiles set role = 'trainer' where email = 'gerald@journalism.design';
   ```
4. **Authentification** (Authentication → Providers) :
   - *Email* : activé. Les liens magiques passent par le SMTP de Supabase, limité à quelques e-mails par heure. Pour une vraie session, branchez votre propre SMTP (Authentication → SMTP Settings), par exemple Brevo ou le SMTP de votre hébergeur.
   - *Google* : créer un identifiant OAuth « Application Web » dans Google Cloud Console (APIs & Services → Credentials). L'URI de redirection autorisée est `https://<projet>.supabase.co/auth/v1/callback`. Collez ensuite le Client ID et le secret dans Supabase.
   - *URL Configuration* : *Site URL* est l'adresse publique du site. Ajoutez-la, avec `http://localhost:5173`, dans *Redirect URLs*.
5. **Variables du site** : copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Project Settings → API). La clé *anon* est publique par conception : les droits sont dans la base (RLS).
6. **Assistant IA** (pistes, analyse du cadrage, assistant d'apprentissage) :
   ```bash
   supabase functions deploy assistant
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # obligatoire
   supabase secrets set AI_MODEL=claude-sonnet-5-5 AI_DAILY_LIMIT=60 ALLOWED_ORIGIN=https://votre-site.fr
   ```
   La clé ne quitte jamais le serveur. Chaque appel est authentifié et vérifie l'accès à la session. Il est plafonné par jour et par personne (`AI_DAILY_LIMIT`), et les pistes du cadrage sont limitées à trois générations. Sans la fonction, l'assistant bascule sur une recherche locale dans les ressources.
7. **Construire et héberger** : `npm run build`, puis publier le dossier `dist/` sur n'importe quel hébergement statique (Netlify, Vercel, GitHub Pages, OVH…). Le routage par ancre (`#/…`) ne demande aucune règle de réécriture.

## Données et droits

Toutes les règles sont dans la base (Row Level Security), testées par `npm run test:sql` :

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
src/lib/                    dom.js (utilitaires) · content.js (parcours, fiches, outils, assistant)
                            activities.js (activités du direct) · screen.js (écran projeté)
src/views/                  login, home (mon espace), profile, session (espace stagiaire), cadrage,
                            admin (sessions), adminSession (avant / jour J / après), screen
supabase/                   migration SQL · fonction Edge « assistant »
legacy/                     version claude.ai d'origine (un seul fichier HTML)
```
