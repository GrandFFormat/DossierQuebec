-- Demandes d'explications par projet de loi ("ce projet mérite des
-- explications de son parrain"). Une ligne = une personne, un projet de loi.
create table public.bill_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id bigint not null, -- correspond à l'Id stable de Données Québec (bills[].id)
  created_at timestamptz not null default now(),
  unique (user_id, bill_id)
);

alter table public.bill_flags enable row level security;

-- Limite anti-troll : max 10 demandes par compte par période de 30 jours,
-- appliquée ici (pas juste côté navigateur) pour qu'elle ne puisse pas être
-- contournée. Empêche un seul compte d'inonder le système en signalant tous
-- les projets de loi d'un coup.
--
-- ⚠️ Le compte se fait via une fonction SECURITY DEFINER, PAS via une
-- sous-requête directe sur bill_flags dans la policy. Une sous-requête sur
-- bill_flags à l'intérieur d'une policy de bill_flags déclenche
-- « infinite recursion detected in policy for relation bill_flags » dès qu'il
-- y a des lignes (la sous-requête ré-applique les policies SELECT, dont
-- « admins view all flags »). La fonction SECURITY DEFINER contourne la RLS,
-- donc pas de récursion.
create or replace function public.my_recent_flag_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.bill_flags
  where user_id = auth.uid()
    and created_at > now() - interval '30 days';
$$;
grant execute on function public.my_recent_flag_count() to authenticated;

drop policy if exists "insert own flag" on public.bill_flags;
create policy "insert own flag"
  on public.bill_flags for insert
  with check (
    auth.uid() = user_id
    and public.my_recent_flag_count() < 10
  );

create policy "select own flag"
  on public.bill_flags for select
  using (auth.uid() = user_id);

create policy "delete own flag"
  on public.bill_flags for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.bill_flags to authenticated;

-- Liste des comptes ayant la permission de voir les VRAIS chiffres (compte
-- total par projet de loi) — rien d'autre que ça. Pour ajouter quelqu'un,
-- insérer une ligne avec son user_id (visible dans Authentication > Users).
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.admins enable row level security;

create policy "see own admin row"
  on public.admins for select
  using (auth.uid() = user_id);

grant select on public.admins to authenticated;

-- Permet aux admins (et seulement eux) de voir TOUTES les lignes de
-- bill_flags, en plus de leurs propres lignes (policy "select own flag"
-- ci-dessus) — nécessaire pour compter les demandes par projet de loi.
create policy "admins view all flags"
  on public.bill_flags for select
  using (exists (select 1 from public.admins where admins.user_id = auth.uid()));
