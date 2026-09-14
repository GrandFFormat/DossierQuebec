-- Alertes par mot-clé (abonnés) : les mots que chaque abonné surveille (« 1re Avenue »,
-- « Limoilou », « déneigement »). À exécuter une fois dans Supabase : SQL Editor → coller → Run.
--
-- Chaque compte lit, ajoute et retire ses propres mots depuis Mes dossiers ; au plus 20. Le
-- serveur (api/alertes-projets.js) les lit chaque matin et mémorise ce qu'il a déjà signalé dans
-- alertes_etat (scripts/supabase-schema-alertes.sql), sous la clé « mot_<id> ».

create table public.alertes_mots_cles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mot text not null check (char_length(btrim(mot)) between 2 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, mot)
);
alter table public.alertes_mots_cles enable row level security;
create policy "mots-clés : lire les siens" on public.alertes_mots_cles for select using (auth.uid() = user_id);
create policy "mots-clés : ajouter les siens" on public.alertes_mots_cles for insert with check (auth.uid() = user_id);
create policy "mots-clés : retirer les siens" on public.alertes_mots_cles for delete using (auth.uid() = user_id);

create or replace function public.limite_mots_cles() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.alertes_mots_cles where user_id = new.user_id) >= 20 then
    raise exception 'limite de 20 mots-clés atteinte';
  end if;
  return new;
end $$;
create trigger limite_mots_cles before insert on public.alertes_mots_cles
  for each row execute function public.limite_mots_cles();

grant select, insert, delete on public.alertes_mots_cles to authenticated;
grant select on public.alertes_mots_cles to service_role;
