-- Espace abonnés des volets municipaux (dossierquebec.ca/quebec/, /montreal/, et les villes à
-- venir). À exécuter une fois dans Supabase : SQL Editor → coller → Run.
--
-- Quatre tables, une par besoin :
--   dossiers_suivis            « Suivre ce dossier » — chaque compte ne voit que les siens.
--   abonnements                qui a accès au détail. Écrit par le serveur seulement (plus tard
--                              par Stripe) ; chaque compte peut lire SA ligne pour afficher son statut.
--   abonnement_liste_attente   « Me prévenir » de la page d'abonnement, tant que le paiement
--                              n'est pas ouvert. Insertion publique, AUCUNE lecture publique.
--   details_argent             le détail de l'argent vérifié, par ville et par dossier. Aucun
--                              accès public : seule la fonction api/detail.js le lit, avec la clé
--                              serveur, après avoir vérifié l'abonnement. C'est pour ça qu'il ne
--                              vit plus dans le dépôt GitHub, qui est public.

-- ---------- dossiers suivis ----------
create table public.dossiers_suivis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ville text not null check (ville ~ '^[a-z-]{2,40}$'),
  dossier_id text not null check (length(dossier_id) between 1 and 120),
  numero text,
  objet text check (length(objet) <= 600),
  created_at timestamptz not null default now(),
  unique (user_id, ville, dossier_id)
);
alter table public.dossiers_suivis enable row level security;
create policy "suivis : lire les siens" on public.dossiers_suivis for select using (auth.uid() = user_id);
create policy "suivis : ajouter les siens" on public.dossiers_suivis for insert with check (auth.uid() = user_id);
create policy "suivis : retirer les siens" on public.dossiers_suivis for delete using (auth.uid() = user_id);

-- Garde-fou : pas plus de 500 dossiers suivis par compte.
create or replace function public.limite_dossiers_suivis() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.dossiers_suivis where user_id = new.user_id) >= 500 then
    raise exception 'limite de 500 dossiers suivis atteinte';
  end if;
  return new;
end $$;
create trigger limite_dossiers_suivis before insert on public.dossiers_suivis
  for each row execute function public.limite_dossiers_suivis();

-- ---------- abonnements ----------
create table public.abonnements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  statut text not null check (statut in ('actif', 'annule')),
  source text not null default 'manuel', -- 'manuel' pour l'instant, 'stripe' plus tard
  fin timestamptz,                        -- null = sans date de fin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.abonnements enable row level security;
create policy "abonnement : lire le sien" on public.abonnements for select using (auth.uid() = user_id);
-- Aucune politique d'écriture : seul le serveur (clé service_role) écrit.

-- ---------- liste d'attente ----------
create table public.abonnement_liste_attente (
  id bigint generated always as identity primary key,
  email text not null check (length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ville text check (ville is null or ville ~ '^[a-z-]{2,40}$'),
  created_at timestamptz not null default now()
);
alter table public.abonnement_liste_attente enable row level security;
create policy "liste d'attente : s'inscrire" on public.abonnement_liste_attente for insert to anon, authenticated with check (true);
-- Aucune politique de lecture : la liste ne se consulte que depuis le tableau de bord Supabase.

-- ---------- détail de l'argent ----------
create table public.details_argent (
  ville text not null,
  dossier_id text not null,
  detail jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (ville, dossier_id)
);
alter table public.details_argent enable row level security;
-- Aucune politique : ni lecture ni écriture depuis le navigateur. La clé service_role passe outre.

-- ---------- droits explicites (comme scripts/supabase-schema-feed.sql) ----------
-- Les politiques RLS disent QUELLES lignes ; ces droits disent QUELLES opérations. Explicites,
-- pour ne pas dépendre des droits par défaut du projet.
grant select, insert, delete on public.dossiers_suivis to authenticated;
grant select on public.abonnements to authenticated;
grant select, insert, update on public.abonnements to service_role;
grant insert on public.abonnement_liste_attente to anon, authenticated;
grant select on public.abonnement_liste_attente to service_role;
grant select, insert, update on public.details_argent to service_role;

-- ---------- pour te donner accès toi-même, en attendant Stripe ----------
-- Remplacer l'adresse par celle de ton compte (celle avec laquelle tu te connectes au site) :
--
--   insert into public.abonnements (user_id, statut, source)
--   select id, 'actif', 'manuel' from auth.users where email = 'ton@courriel.ca'
--   on conflict (user_id) do update set statut = 'actif', updated_at = now();
