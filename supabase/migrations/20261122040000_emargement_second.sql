-- Second émargement (celui de l'entreprise cliente) : affichage facultatif et texte modifiable
alter table public.sessions
  add column if not exists emargement2_enabled boolean not null default true,
  add column if not exists emargement2_text text check (emargement2_text is null or length(emargement2_text) <= 300);
