-- Libellé du client sur la slide d'émargement (« Pour FTV ») ; à défaut, le nom de l'entreprise
alter table public.sessions add column if not exists emargement_label text check (emargement_label is null or length(emargement_label) <= 60);
