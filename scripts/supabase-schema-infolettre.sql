-- Le compte rendu mensuel par courriel (api/infolettre.js, api/_infolettre.js, quebec/scripts/infolettre.js).
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
--
--   infolettre_inscriptions  une ligne par adresse ET par ville : on s'inscrit à Québec, à Lévis, ou
--                            aux deux, et on s'en retire ville par ville. Le consentement est gardé
--                            (confirme_le) : c'est ce que demande la loi anti-pourriel.
--   infolettre_numeros       chaque compte rendu publié (édition gratuite et édition abonnés). Le plus
--                            récent part tout de suite à qui s'inscrit ; publié, il part aux inscrits.
--
-- Aucune politique : ni lecture ni écriture depuis le navigateur. Tout passe par le serveur.

create table if not exists public.infolettre_inscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email)),
  ville text not null check (ville ~ '^[a-z-]{2,40}$'),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'confirme', 'desinscrit')),
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'formulaire' check (source in ('formulaire', 'mes-dossiers')),
  created_at timestamptz not null default now(),
  confirmation_envoyee_le timestamptz,
  confirme_le timestamptz,
  desinscrit_le timestamptz,
  dernier_mois text check (dernier_mois is null or dernier_mois ~ '^\d{4}-\d{2}$'),
  unique (email, ville)
);
create index if not exists infolettre_inscriptions_envoi on public.infolettre_inscriptions (ville, statut, dernier_mois);
alter table public.infolettre_inscriptions enable row level security;

create table if not exists public.infolettre_numeros (
  ville text not null check (ville ~ '^[a-z-]{2,40}$'),
  mois text not null check (mois ~ '^\d{4}-\d{2}$'),
  titre text not null check (length(titre) <= 200),
  html text not null,
  html_abonnes text not null,
  publie_le timestamptz,
  envoye_le timestamptz,
  envoyes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ville, mois)
);
alter table public.infolettre_numeros enable row level security;

grant select, insert, update on public.infolettre_inscriptions to service_role;
grant select, insert, update on public.infolettre_numeros to service_role;
