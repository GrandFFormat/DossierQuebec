-- « Ce qui vous préoccupe » (Martin, 18 oct. 2026), dans Mon dossier. À exécuter une fois dans
-- Supabase : SQL Editor → coller → Run.
--
-- Une personne connectée écrit, en ses mots, ce qui la préoccupe. Le message n'est JAMAIS publié :
-- une fois par jour, le rafraîchissement (scrapers/preoccupations.js, clé service_role) le classe
-- dans un sujet (ou en crée un), écarte le spam, et publie seulement le tableau des sujets
-- (data/preoccupations.json). Depuis le navigateur, on peut écrire son texte et relire ses propres
-- messages, rien d'autre : ni le statut ni le sujet ne s'écrivent de ce côté.

create table public.preoccupations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texte text not null check (length(texte) between 3 and 500),
  statut text not null default 'nouveau' check (statut in ('nouveau', 'classe', 'spam')),
  sujet text check (sujet is null or sujet ~ '^[a-z0-9-]{2,60}$'),
  created_at timestamptz not null default now()
);
create index preoccupations_par_statut on public.preoccupations (statut, created_at);
create index preoccupations_par_compte on public.preoccupations (user_id, created_at desc);

alter table public.preoccupations enable row level security;

create policy "écrire son message" on public.preoccupations
  for insert to authenticated with check (user_id = auth.uid());
create policy "relire ses messages" on public.preoccupations
  for select to authenticated using (user_id = auth.uid());

-- Le navigateur n'écrit que le texte ; user_id prend auth.uid() par défaut.
grant insert (texte) on public.preoccupations to authenticated;
grant select on public.preoccupations to authenticated;
grant select, insert, update, delete on public.preoccupations to service_role;

-- 3 messages par 24 heures par compte.
create or replace function public.preoccupations_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.preoccupations
      where user_id = new.user_id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'limite de 3 messages par 24 heures atteinte';
  end if;
  return new;
end $$;
create trigger preoccupations_limite before insert on public.preoccupations
  for each row execute function public.preoccupations_limite();
