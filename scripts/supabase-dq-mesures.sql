-- La mesure maison de DQ (14 nov. 2026) : où vont les gens et sur quoi ils pèsent, sur le site de
-- l'Assemblée et les cinq volets de ville. Lue par la page /admin (commun/admin.js), écrite par
-- commun/mesure.js sur toutes les pages. À exécuter une fois dans Supabase : SQL Editor → coller →
-- Run. Peut être relancé sans dommage.
--
--   Aucune donnée personnelle : pas d'adresse IP, pas de témoin, pas de compte. Le « jeton de
--   session » est un nombre au hasard qui vit le temps d'un onglet (sessionStorage) : il sert
--   seulement à compter les visites distinctes, jamais à reconnaître quelqu'un d'une fois à l'autre.
--   La clé anon écrit seulement ; les comptes de la table `admins` lisent, par la fonction
--   dq_mesures_resume, qui purge au passage tout ce qui a plus de 90 jours.

create table if not exists public.dq_mesures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type text not null check (type in ('page', 'clic')),
  ville text not null default '' check (length(ville) <= 40),
  page text not null default '' check (length(page) <= 200),
  titre text not null default '' check (length(titre) <= 160),
  cible text not null default '' check (length(cible) <= 120),
  provenance text not null default '' check (length(provenance) <= 120),
  langue text not null default 'fr' check (langue in ('fr', 'en')),
  session text not null default '' check (length(session) <= 40)
);
create index if not exists dq_mesures_created_at_idx on public.dq_mesures (created_at);

alter table public.dq_mesures enable row level security;

drop policy if exists "tout le monde ajoute une mesure" on public.dq_mesures;
create policy "tout le monde ajoute une mesure" on public.dq_mesures
  for insert to anon, authenticated with check (true);
drop policy if exists "les admins lisent tout" on public.dq_mesures;
create policy "les admins lisent tout" on public.dq_mesures
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

revoke all on public.dq_mesures from anon, authenticated;
grant insert (type, ville, page, titre, cible, provenance, langue, session) on public.dq_mesures to anon, authenticated;
grant select on public.dq_mesures to authenticated;
grant all on public.dq_mesures to service_role;

-- Le résumé que lit /admin : un seul appel, tout déjà compté côté serveur. `jours` = période
-- (1, 7, 30 ou 90). Refuse quiconque n'est pas dans `admins`. Purge les lignes de plus de 90 jours.
create or replace function public.dq_mesures_resume(jours int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  depuis timestamptz := now() - make_interval(days => greatest(1, least(jours, 90)));
  r jsonb;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'réservé aux admins' using errcode = '42501';
  end if;

  delete from public.dq_mesures where created_at < now() - interval '90 days';

  select jsonb_build_object(
    'depuis', depuis,
    'pages_vues', (select count(*) from dq_mesures where type = 'page' and created_at >= depuis),
    'visites', (select count(distinct session) from dq_mesures where type = 'page' and created_at >= depuis and session <> ''),
    'clics', (select count(*) from dq_mesures where type = 'clic' and created_at >= depuis),
    'par_jour', (select coalesce(jsonb_agg(jsonb_build_object('jour', j, 'pages', p, 'visites', v) order by j), '[]'::jsonb) from (
        select (created_at at time zone 'America/Montreal')::date as j, count(*) as p, count(distinct session) as v
        from dq_mesures where type = 'page' and created_at >= depuis group by 1) t),
    'par_ville', (select coalesce(jsonb_agg(jsonb_build_object('ville', ville, 'pages', p, 'visites', v) order by p desc), '[]'::jsonb) from (
        select ville, count(*) as p, count(distinct session) as v
        from dq_mesures where type = 'page' and created_at >= depuis group by 1) t),
    'par_page', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'titre', titre, 'ville', ville, 'pages', p, 'visites', v) order by p desc), '[]'::jsonb) from (
        select page, max(titre) as titre, max(ville) as ville, count(*) as p, count(distinct session) as v
        from dq_mesures where type = 'page' and created_at >= depuis group by 1 order by 4 desc limit 40) t),
    'par_cible', (select coalesce(jsonb_agg(jsonb_build_object('cible', cible, 'page', page, 'clics', c) order by c desc), '[]'::jsonb) from (
        select cible, max(page) as page, count(*) as c
        from dq_mesures where type = 'clic' and created_at >= depuis group by 1 order by 3 desc limit 40) t),
    'par_provenance', (select coalesce(jsonb_agg(jsonb_build_object('provenance', provenance, 'visites', v) order by v desc), '[]'::jsonb) from (
        select provenance, count(distinct session) as v
        from dq_mesures where type = 'page' and created_at >= depuis group by 1 order by 2 desc limit 20) t),
    'par_langue', (select coalesce(jsonb_agg(jsonb_build_object('langue', langue, 'pages', p) order by p desc), '[]'::jsonb) from (
        select langue, count(*) as p from dq_mesures where type = 'page' and created_at >= depuis group by 1) t)
  ) into r;
  return r;
end;
$$;

revoke all on function public.dq_mesures_resume(int) from public, anon;
grant execute on function public.dq_mesures_resume(int) to authenticated;
