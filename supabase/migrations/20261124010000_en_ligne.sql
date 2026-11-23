-- =====================================================================
-- Mode « en ligne » : formation à distance, sans vidéoprojecteur.
-- Quand il est activé, chaque stagiaire voit dans son espace (onglet
-- « Le jour J ») ce que montre l'écran projeté : pages du support,
-- présentations, séquences, émargement, évaluation.
-- La colonne suit les droits existants de `sessions` (lecture par les
-- membres, écriture par l'équipe qui gère la session).
-- À exécuter après 20261124000000_discussion.sql
-- =====================================================================
alter table public.sessions add column if not exists online boolean not null default false;
