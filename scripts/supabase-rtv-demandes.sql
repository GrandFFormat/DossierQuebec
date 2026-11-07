-- « Représentez votre ville » : les demandes gardées sur le site (7 nov. 2026). À exécuter une fois
-- dans Supabase : SQL Editor → coller → Run. Peut être relancé sans dommage.
--   api/represente.js écrit avec la clé service (aucun accès anon). Les comptes de la table `admins`
--   lisent les demandes et changent leur statut, depuis la page Lexique (sous les préoccupations).

create table if not exists public.rtv_demandes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ville text not null check (length(ville) between 1 and 80),
  ville_cle text not null,
  nom text not null check (length(nom) between 1 and 120),
  courriel text not null check (length(courriel) between 3 and 200),
  profil text not null default 'citoyen' check (profil in ('citoyen', 'organisme', 'entreprise')),
  message text not null default '' check (length(message) <= 2000),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'repondue', 'archivee'))
);
create index if not exists rtv_demandes_ville_cle_idx on public.rtv_demandes (ville_cle);

alter table public.rtv_demandes enable row level security;

drop policy if exists "les admins lisent tout" on public.rtv_demandes;
create policy "les admins lisent tout" on public.rtv_demandes
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
drop policy if exists "les admins corrigent" on public.rtv_demandes;
create policy "les admins corrigent" on public.rtv_demandes
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

revoke all on public.rtv_demandes from anon, authenticated;
grant select on public.rtv_demandes to authenticated;
grant update (statut) on public.rtv_demandes to authenticated;
grant all on public.rtv_demandes to service_role;
