-- L'abonnement payant par Stripe (api/abonnement.js, api/stripe-webhook.js).
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
--
-- La table `abonnements` existe déjà (scripts/supabase-schema-abonnes.sql) ; on y ajoute de quoi
-- relier une ligne à Stripe. Seul le serveur écrit (clé service_role) ; chaque compte lit sa ligne.
--   stripe_customer_id      le client Stripe : ouvre le portail (carte, factures, annulation)
--   stripe_subscription_id  l'abonnement Stripe recopié dans la ligne
--   annulation_prevue       annulé par l'abonné, actif jusqu'à la fin de la période payée

alter table public.abonnements
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists annulation_prevue boolean not null default false;

create unique index if not exists abonnements_stripe_customer on public.abonnements (stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.abonnements drop constraint if exists abonnements_source_check;
alter table public.abonnements add constraint abonnements_source_check check (source in ('manuel', 'stripe'));

-- Déjà donnés par supabase-schema-abonnes.sql ; répétés pour ne pas dépendre de l'ordre d'exécution.
grant select on public.abonnements to authenticated;
grant select, insert, update on public.abonnements to service_role;
