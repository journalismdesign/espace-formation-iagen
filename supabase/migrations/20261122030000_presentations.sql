-- Présentations supplémentaires à projeter (Google Slides ou PDF sur Drive)
-- decks : [{ "id": "…", "title": "…", "url": "…" }]
alter table public.sessions add column if not exists decks jsonb not null default '[]'
  check (jsonb_typeof(decks) = 'array');
