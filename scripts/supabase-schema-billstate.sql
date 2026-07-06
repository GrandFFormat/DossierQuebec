-- Mémoire de l'étape atteinte par chaque projet de loi, pour détecter les
-- changements d'une exécution hebdomadaire à l'autre (voir api/weekly-digest.js).
-- Écrite/lue uniquement par la fonction planifiée avec la clé service_role
-- (côté serveur) — pas d'accès public, donc RLS activé sans aucune policy
-- (personne d'autre que le service_role, qui contourne RLS, ne peut y toucher).
create table public.bill_state (
  bill_id bigint primary key,
  step int not null,
  updated_at timestamptz not null default now()
);

alter table public.bill_state enable row level security;
