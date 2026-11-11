-- « Représentez votre ville » : l'enchère en direct des mois de bannière (Martin, 11 nov. 2026).
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run. Peut être relancé sans dommage.
--   api/represente.js écrit et lit avec la clé service (aucun accès anon) : le classement public
--   ne montre que les montants, jamais les noms ni les courriels. Les comptes de la table `admins`
--   lisent tout (gagnant, courriel) pour envoyer la facture GHL.
--   Une offre compte seulement une fois confirmée par le lien du courriel (confirmee_at).

create table if not exists public.rtv_encheres (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ville text not null check (length(ville) between 1 and 80),
  ville_cle text not null check (length(ville_cle) between 1 and 80),
  mois_debut date not null,
  mois_fin date not null,
  montant integer not null check (montant between 1 and 100000),
  nom text not null check (length(nom) between 1 and 120),
  entreprise text not null check (length(entreprise) between 1 and 120),
  courriel text not null check (length(courriel) between 3 and 200),
  langue text not null default 'fr' check (langue in ('fr', 'en')),
  page text not null default '' check (length(page) <= 300),
  jeton text not null unique,
  confirmee_at timestamptz
);
create index if not exists rtv_encheres_mois_idx on public.rtv_encheres (ville_cle, mois_debut);

-- Une ligne par enchère fermée : le courriel du gagnant à Martin part une seule fois.
create table if not exists public.rtv_encheres_fermees (
  ville_cle text not null,
  mois_debut date not null,
  fermee_at timestamptz not null default now(),
  primary key (ville_cle, mois_debut)
);

alter table public.rtv_encheres enable row level security;
alter table public.rtv_encheres_fermees enable row level security;

drop policy if exists "les admins lisent les offres" on public.rtv_encheres;
create policy "les admins lisent les offres" on public.rtv_encheres
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
drop policy if exists "les admins lisent les fermetures" on public.rtv_encheres_fermees;
create policy "les admins lisent les fermetures" on public.rtv_encheres_fermees
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

revoke all on public.rtv_encheres from anon, authenticated;
revoke all on public.rtv_encheres_fermees from anon, authenticated;
grant select on public.rtv_encheres to authenticated;
grant select on public.rtv_encheres_fermees to authenticated;
grant select, insert, update, delete on public.rtv_encheres to service_role;
grant select, insert, update, delete on public.rtv_encheres_fermees to service_role;
