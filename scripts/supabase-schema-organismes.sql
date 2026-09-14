-- Suivre un organisme ou une entreprise (abonnés). À exécuter une fois dans Supabase : SQL Editor →
-- coller → Run.
--
-- Chaque compte lit, ajoute et retire ses propres organismes depuis Mes dossiers ; au plus 30. Le
-- nom est cherché tel quel (sans sa forme juridique, mot entier, sans accents ni majuscules) dans
-- l'objet et le résumé des décisions. Le serveur (api/alertes-projets.js) mémorise ce qu'il a déjà
-- signalé dans alertes_etat, sous la clé « org_<id> ».

create table public.organismes_suivis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nom text not null check (char_length(btrim(nom)) between 3 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, nom)
);
alter table public.organismes_suivis enable row level security;
create policy "organismes : lire les siens" on public.organismes_suivis for select using (auth.uid() = user_id);
create policy "organismes : ajouter les siens" on public.organismes_suivis for insert with check (auth.uid() = user_id);
create policy "organismes : retirer les siens" on public.organismes_suivis for delete using (auth.uid() = user_id);

create or replace function public.limite_organismes_suivis() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.organismes_suivis where user_id = new.user_id) >= 30 then
    raise exception 'limite de 30 organismes suivis atteinte';
  end if;
  return new;
end $$;
create trigger limite_organismes_suivis before insert on public.organismes_suivis
  for each row execute function public.limite_organismes_suivis();

grant select, insert, delete on public.organismes_suivis to authenticated;
grant select on public.organismes_suivis to service_role;
