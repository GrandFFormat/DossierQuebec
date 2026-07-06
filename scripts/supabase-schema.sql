-- Table des suivis ("Suivre" un ministre ou un·e député·e), liée à un vrai
-- compte utilisateur plutôt qu'au navigateur (localStorage). Une ligne = une
-- personne suivie par un·e utilisateur·rice.
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_type text not null check (person_type in ('minister', 'depute')),
  person_key text not null, -- nom pour un ministre, "nom|circonscription" pour un·e député·e
  created_at timestamptz not null default now(),
  unique (user_id, person_type, person_key)
);

alter table public.follows enable row level security;

-- Chaque personne ne voit et ne modifie que ses propres suivis — jamais ceux
-- de quelqu'un d'autre, même si la clé publique (publishable key) est visible
-- dans le code du navigateur.
create policy "select own follows"
  on public.follows for select
  using (auth.uid() = user_id);

create policy "insert own follows"
  on public.follows for insert
  with check (auth.uid() = user_id);

create policy "delete own follows"
  on public.follows for delete
  using (auth.uid() = user_id);
