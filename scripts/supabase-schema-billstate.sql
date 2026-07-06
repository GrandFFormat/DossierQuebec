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

-- La fonction planifiée (api/weekly-digest.js) utilise la clé secrète Supabase,
-- qui agit comme le rôle `service_role` (contourne RLS). Mais « contourner RLS »
-- ne donne pas les privilèges de base sur la table : il faut les accorder
-- explicitement, sinon 403 « permission denied ». Elle lit/écrit bill_state, et
-- lit follows + bill_flags pour savoir qui alerter.
grant select, insert, update, delete on public.bill_state to service_role;
grant select on public.follows to service_role;
grant select on public.bill_flags to service_role;
