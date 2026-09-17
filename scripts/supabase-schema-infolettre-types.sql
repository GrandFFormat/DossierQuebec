-- Trois sortes de courriels par ville (api/_infolettre.js), au lieu d'un seul compte rendu mensuel.
-- À exécuter une fois dans Supabase, APRÈS scripts/supabase-schema-infolettre.sql.
--
--   mensuel         le gros compte rendu du mois, toutes instances
--   conseil         après chaque séance du conseil de la ville (environ aux deux semaines)
--   arrondissement  après chaque séance du conseil d'un arrondissement choisi
--
-- Une ligne par adresse, par ville, par sorte et par arrondissement : on s'inscrit au mensuel de
-- Québec, au conseil de Québec et à deux arrondissements sans que ça se mélange. `arrondissement`
-- vaut '' quand la sorte n'en demande pas (plus simple qu'un NULL pour la clé unique et l'upsert).

alter table public.infolettre_inscriptions
  add column if not exists type text not null default 'mensuel' check (type in ('mensuel', 'conseil', 'arrondissement')),
  add column if not exists arrondissement text not null default '' check (arrondissement ~ '^[a-z0-9-]{0,60}$');

alter table public.infolettre_inscriptions drop constraint if exists infolettre_inscriptions_email_ville_key;
create unique index if not exists infolettre_inscriptions_unique
  on public.infolettre_inscriptions (email, ville, type, arrondissement);
create index if not exists infolettre_inscriptions_envoi2
  on public.infolettre_inscriptions (ville, type, arrondissement, statut, dernier_mois);

-- Les numéros : même découpage. `mois` garde son nom, mais porte la clé du numéro — « 2026-08 »
-- pour le mensuel, « 2026-09-15 » (la date de la séance) pour les deux autres.
alter table public.infolettre_numeros
  add column if not exists type text not null default 'mensuel' check (type in ('mensuel', 'conseil', 'arrondissement')),
  add column if not exists arrondissement text not null default '' check (arrondissement ~ '^[a-z0-9-]{0,60}$');

alter table public.infolettre_numeros drop constraint if exists infolettre_numeros_pkey;
alter table public.infolettre_numeros add primary key (ville, type, arrondissement, mois);

-- (17 sept. 2026) Les deux contraintes du premier schéma n'acceptaient que « AAAA-MM » : un numéro
-- de séance (« 2026-09-15 ») aurait été refusé à la publication, et l'inscription qui l'a reçu aussi
-- (dernier_mois). Ré-exécutable : on retire puis on remet.
alter table public.infolettre_numeros drop constraint if exists infolettre_numeros_mois_check;
alter table public.infolettre_numeros add constraint infolettre_numeros_mois_check check (mois ~ '^\d{4}-\d{2}(-\d{2})?$');
alter table public.infolettre_inscriptions drop constraint if exists infolettre_inscriptions_dernier_mois_check;
alter table public.infolettre_inscriptions add constraint infolettre_inscriptions_dernier_mois_check check (dernier_mois is null or dernier_mois ~ '^\d{4}-\d{2}(-\d{2})?$');
