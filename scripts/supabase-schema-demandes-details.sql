-- Demander le détail de l'argent d'un dossier qui ne l'a pas encore (abonnés). À exécuter une fois
-- dans Supabase : SQL Editor → coller → Run.
--
-- Un abonné clique « Demander ce détail » : api/detail.js (POST) vérifie l'abonnement et ajoute
-- la demande ici, au plus 10 par 24 heures. Chaque matin, quebec/scripts/details-du-jour.js lit
-- les demandes en attente AVANT les nouveaux dossiers (dans le même plafond quotidien), puis
-- note traite_le et le résultat : « lu », « deja-lu » ou « sans-montant ». Table du serveur
-- seulement : aucun accès depuis le navigateur.

create table public.demandes_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ville text not null,
  dossier_id text not null,
  created_at timestamptz not null default now(),
  traite_le timestamptz,
  resultat text,
  unique (user_id, ville, dossier_id)
);
create index demandes_details_en_attente on public.demandes_details (ville, created_at) where traite_le is null;
alter table public.demandes_details enable row level security;

grant select, insert, update on public.demandes_details to service_role;
