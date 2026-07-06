-- Personnes qui se sont désabonnées du digest hebdomadaire (lien « Se désabonner »
-- dans chaque courriel). On ne supprime PAS leurs suivis ni leurs demandes
-- d'explications (données civiques, comptent toujours dans les totaux) — on note
-- juste qu'elles ne veulent plus de courriels. La fonction api/weekly-digest.js
-- exclut ces personnes de l'envoi.
create table public.email_optout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.email_optout enable row level security;

-- Lu par la fonction du digest, écrit par la fonction de désabonnement — les
-- deux côté serveur avec la clé secrète (service_role). Pas d'accès public.
grant select, insert on public.email_optout to service_role;
