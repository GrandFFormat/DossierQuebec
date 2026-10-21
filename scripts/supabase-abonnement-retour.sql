-- Retour de l'abonnement facultatif (21 oct. 2026). À exécuter une fois dans Supabase
-- (SQL Editor → New query → coller → Run). Défait scripts/supabase-sans-abonnement.sql, SAUF le
-- plafond de suivis : il reste 3 pour tout le monde, abonné ou non (Martin : le suivi des projets
-- de loi, des élus et des projets de ville reste gratuit). L'abonnement vend des outils en plus.
--
-- Rien n'est créé : la table abonnements existe déjà (supabase-schema-abonnes.sql) avec ses
-- colonnes Stripe (supabase-schema-stripe.sql) et ses GRANT. Les ajouts ci-dessous sont répétés
-- « if not exists » pour ne pas dépendre de l'ordre d'exécution. Aucune nouvelle table dans public.

-- 1. Les colonnes que le webhook Stripe écrit (api/_stripe.js, synchroniser).
alter table public.abonnements
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists annulation_prevue boolean not null default false;
grant select on public.abonnements to authenticated;
grant select, insert, update on public.abonnements to service_role;

-- 2. est_abonne lit de nouveau la vraie table. Même règle qu'api/_stripe.js (estActive) : statut
--    actif et fin dans le futur, ou sans date de fin.
create or replace function public.est_abonne(uid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.abonnements
     where user_id = uid and statut = 'actif' and (fin is null or fin > now())
  );
$$;
revoke execute on function public.est_abonne(uuid) from public, anon;
grant execute on function public.est_abonne(uuid) to authenticated, service_role;

-- 3. Les trois déclencheurs de suivis (supabase-schema-mots-cles-portee.sql) disaient « 10 si
--    abonné, sinon 3 ». Ils ne demandent plus rien à est_abonne : 3 pour tout le monde. Le reste
--    est identique (verrou par compte, total commun, même message « limite de N suivis atteinte »,
--    que les pages reconnaissent).
create or replace function public.limite_dossiers_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int := 3;
begin
  perform pg_advisory_xact_lock(hashtext('suivis:' || new.user_id::text));
  -- Suivre un projet déjà suivi passe par un upsert « ignoreDuplicates » : ce n'est pas un ajout.
  if exists (select 1 from public.dossiers_suivis
              where user_id = new.user_id and ville = new.ville and dossier_id = new.dossier_id) then
    return new;
  end if;
  if public.suivis_total(new.user_id) >= plafond then
    raise exception 'limite de % suivis atteinte', plafond;
  end if;
  return new;
end $$;

create or replace function public.limite_mots_cles() returns trigger language plpgsql set search_path = '' as $$
declare plafond int := 3;
begin
  perform pg_advisory_xact_lock(hashtext('suivis:' || new.user_id::text));
  if public.suivis_total(new.user_id) >= plafond then
    raise exception 'limite de % suivis atteinte', plafond;
  end if;
  return new;
end $$;

create or replace function public.limite_organismes_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int := 3;
begin
  perform pg_advisory_xact_lock(hashtext('suivis:' || new.user_id::text));
  if public.suivis_total(new.user_id) >= plafond then
    raise exception 'limite de % suivis atteinte', plafond;
  end if;
  return new;
end $$;
