-- Campagne « demander une explication » : mémoire par projet de loi pour le
-- digest aux 2 semaines (voir api/weekly-digest.js). On n'expose JAMAIS qui a
-- demandé quoi — uniquement des agrégats (le total par projet) et l'état de la
-- campagne. La table bill_flags (qui, elle, contient les identités) reste
-- protégée par sa RLS : chaque personne ne voit que ses propres lignes, sauf
-- les admins. Voir scripts/supabase-schema-flags.sql.

-- 1) Palmarès public : les projets à partir de 500 demandes (1er palier).
--    (Remplace la version qui filtrait à 1000.) N'expose que le total, jamais
--    les identités — sûr côté vie privée.
create or replace function public.flag_counts()
returns table (bill_id bigint, cnt bigint)
language sql stable security definer set search_path = public as $$
  select bill_id, count(*)::bigint as cnt
  from public.bill_flags
  group by bill_id
  having count(*) >= 500
  order by count(*) desc;
$$;
grant execute on function public.flag_counts() to anon, authenticated;

-- 2) Tous les comptes (sans seuil), pour le cron du digest — côté serveur
--    seulement (service_role). Ne renvoie que des totaux, jamais d'identité.
create or replace function public.flag_counts_all()
returns table (bill_id bigint, cnt bigint)
language sql stable security definer set search_path = public as $$
  select bill_id, count(*)::bigint as cnt
  from public.bill_flags
  group by bill_id;
$$;
grant execute on function public.flag_counts_all() to service_role;

-- 3) État de campagne par projet challengé.
--    - last_count       : nombre de demandes au dernier digest envoyé (sert à
--                         détecter les caps franchis « depuis la dernière fois »).
--    - threshold        : seuil de pétition courant (monte via le bouton admin
--                         « Resend » : 1000 -> 5000 -> 25000…).
--    - escalation_pending : posé par l'admin (Resend) → le prochain digest inclut
--                         le message d'escalade, puis on le remet à false.
--    - terminal_notified : le « devenu loi sous le seuil » a déjà été annoncé
--                         (pour ne pas le répéter à chaque digest).
create table if not exists public.bill_campaign (
  bill_id bigint primary key,
  last_count int not null default 0,
  threshold int not null default 1000,
  escalation_pending boolean not null default false,
  terminal_notified boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.bill_campaign enable row level security;

-- Le cron (service_role, contourne RLS) lit/écrit tout — mais « contourner RLS »
-- n'accorde pas les privilèges de base : il faut les donner explicitement.
grant select, insert, update, delete on public.bill_campaign to service_role;

-- Les admins (table public.admins) peuvent lire et agir (boutons Resend/Reset).
-- Personne d'autre n'y touche.
create policy "admins read campaign" on public.bill_campaign for select
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy "admins write campaign" on public.bill_campaign for insert
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy "admins update campaign" on public.bill_campaign for update
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy "admins delete campaign" on public.bill_campaign for delete
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
