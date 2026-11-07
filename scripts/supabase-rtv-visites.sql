-- « Représentez votre ville » : qui visite la page et d'où on arrive (7 nov. 2026). À exécuter une
-- fois dans Supabase : SQL Editor → coller → Run. Peut être relancé sans dommage.
--   La page /represente-ta-ville écrit une ligne par visite (une par session) avec la clé anon :
--   insertion seulement, aucune lecture. Les comptes de la table `admins` lisent, depuis la page Lexique.
--   rtv_demandes gagne la colonne provenance : d'où arrivait la personne qui a rempli le formulaire.

create table if not exists public.rtv_visites (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null default 'direct' check (length(source) <= 120),
  page_interne text not null default '' check (length(page_interne) <= 200),
  campagne text not null default '' check (length(campagne) <= 120),
  langue text not null default 'fr' check (langue in ('fr', 'en'))
);
create index if not exists rtv_visites_created_at_idx on public.rtv_visites (created_at);

alter table public.rtv_visites enable row level security;

drop policy if exists "tout le monde ajoute une visite" on public.rtv_visites;
create policy "tout le monde ajoute une visite" on public.rtv_visites
  for insert to anon, authenticated with check (true);
drop policy if exists "les admins lisent tout" on public.rtv_visites;
create policy "les admins lisent tout" on public.rtv_visites
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

revoke all on public.rtv_visites from anon, authenticated;
grant insert (source, page_interne, campagne, langue) on public.rtv_visites to anon, authenticated;
grant select on public.rtv_visites to authenticated;
grant all on public.rtv_visites to service_role;

alter table public.rtv_demandes add column if not exists provenance text not null default '' check (length(provenance) <= 200);
