-- Alertes par courriel des projets suivis (réservées aux abonnés). À exécuter une fois dans
-- Supabase : SQL Editor → coller → Run.
--
--   alertes_etat         ce qu'on a déjà signalé à chaque personne, par projet suivi. Écrit
--                        par api/alertes-projets.js seulement ; aucun accès public.
--   alertes_preferences  « Recevoir les alertes » : l'interrupteur de Mes dossiers, et le lien
--                        de désabonnement de chaque courriel. Chaque compte lit et modifie la sienne.
--   alertes_envois       le journal des courriels envoyés (« Dernière alerte : … »). Chaque compte
--                        lit les siens ; seul le serveur écrit.

create table public.alertes_etat (
  user_id uuid not null references auth.users(id) on delete cascade,
  ville text not null check (ville ~ '^[a-z-]{2,40}$'),
  projet text not null check (projet ~ '^[A-Za-z0-9_-]{1,60}$'),
  etat jsonb not null,
  mis_a_jour timestamptz not null default now(),
  primary key (user_id, ville, projet)
);
alter table public.alertes_etat enable row level security;
-- Aucune politique : seule la clé service_role y touche.

create table public.alertes_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  actif boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.alertes_preferences enable row level security;
create policy "alertes : lire sa préférence" on public.alertes_preferences for select using (auth.uid() = user_id);
create policy "alertes : créer sa préférence" on public.alertes_preferences for insert with check (auth.uid() = user_id);
create policy "alertes : modifier sa préférence" on public.alertes_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.alertes_envois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  envoye_le timestamptz not null default now(),
  projets integer not null default 0,
  changements integer not null default 0,
  essai boolean not null default false -- « M'envoyer un courriel d'essai » (Mes dossiers), limité à 3 par jour
);
create index alertes_envois_par_compte on public.alertes_envois (user_id, envoye_le desc);
alter table public.alertes_envois enable row level security;
create policy "alertes : lire ses envois" on public.alertes_envois for select using (auth.uid() = user_id);

grant select, insert, update, delete on public.alertes_etat to service_role;
grant select, insert, update on public.alertes_preferences to authenticated;
grant select, insert, update on public.alertes_preferences to service_role;
grant select on public.alertes_envois to authenticated;
grant select, insert on public.alertes_envois to service_role;
