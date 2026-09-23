-- Deux listes de mots-clés, et UN SEUL quota de suivis (21-23 septembre 2026).
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run. Rejouable sans danger.
--
-- 1) Les mots-clés de ville et ceux de l'Assemblée sont deux listes (Martin : « les mots-clés de
--    ville et DQ ne seront probablement pas la même chose »). Une rue ou un quartier sert aux
--    décisions municipales ; un sujet (« logement », « forêt ») sert aux projets de loi.
-- 2) Le quota, lui, est COMMUN (Martin, 23 sept. : « ça devrait être 10 pdl / mot-clé / projet
--    quand même, et pas 10 de chaque ») : 10 suivis en tout avec l'abonnement, 3 sans — projets de
--    ville, projets de loi, mots-clés et organismes confondus. Une seule chose à retenir, et un
--    abonné choisit lui-même comment répartir ses places.
--
-- Avant ce script, le site fonctionne déjà : il lit alertes_mots_cles avec select=*, traite tout
-- mot sans `portee` comme un mot de ville, et cache la boîte « Mots-clés de l'Assemblée » tant que
-- la colonne n'existe pas. Les mots déjà enregistrés deviennent des mots de ville.

-- 1. À quoi sert le mot.
alter table public.alertes_mots_cles
  add column if not exists portee text not null default 'villes' check (portee in ('villes', 'assemblee'));

-- 2. Le même mot peut maintenant être dans les deux listes (« logement » pour la Ville ET pour
--    l'Assemblée) : l'unicité se fait par liste.
alter table public.alertes_mots_cles drop constraint if exists alertes_mots_cles_user_id_mot_key;
create unique index if not exists alertes_mots_cles_par_portee on public.alertes_mots_cles (user_id, portee, mot);

-- 3. Le quota commun : ce que la personne suit, toutes sortes confondues.
--    SECURITY DEFINER comme est_abonne : les déclencheurs tournent pour l'usager, qui ne voit que
--    ses propres lignes. Elle n'est utile qu'à eux.
create or replace function public.suivis_total(uid uuid) returns int
  language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.dossiers_suivis where user_id = uid)
       + (select count(*) from public.alertes_mots_cles where user_id = uid)
       + (select count(*) from public.organismes_suivis where user_id = uid);
$$;
revoke execute on function public.suivis_total(uuid) from public, anon;
grant execute on function public.suivis_total(uuid) to authenticated, service_role;

-- 4. Les trois déclencheurs comptent le MÊME total et disent la même chose.
--    Le verrou (un seul par compte, puisque le quota est commun) : sans lui, dix ajouts envoyés en
--    même temps comptaient chacun les lignes déjà enregistrées sans voir les autres, et passaient
--    tous (relecture du 21 sept. 2026). Il tombe à la fin de l'ajout.
--    Le message garde la forme « limite de N suivis atteinte » : les pages la reconnaissent pour
--    dire au lecteur ce qui s'est passé plutôt que « réessayez ».
create or replace function public.limite_dossiers_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int;
begin
  perform pg_advisory_xact_lock(hashtext('suivis:' || new.user_id::text));
  -- Suivre un projet déjà suivi passe par un upsert « ignoreDuplicates » : ce n'est pas un ajout.
  if exists (select 1 from public.dossiers_suivis
              where user_id = new.user_id and ville = new.ville and dossier_id = new.dossier_id) then
    return new;
  end if;
  plafond := case when public.est_abonne(new.user_id) then 10 else 3 end;
  if public.suivis_total(new.user_id) >= plafond then
    raise exception 'limite de % suivis atteinte', plafond;
  end if;
  return new;
end $$;

create or replace function public.limite_mots_cles() returns trigger language plpgsql set search_path = '' as $$
declare plafond int;
begin
  perform pg_advisory_xact_lock(hashtext('suivis:' || new.user_id::text));
  plafond := case when public.est_abonne(new.user_id) then 10 else 3 end;
  if public.suivis_total(new.user_id) >= plafond then
    raise exception 'limite de % suivis atteinte', plafond;
  end if;
  return new;
end $$;

create or replace function public.limite_organismes_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int;
begin
  perform pg_advisory_xact_lock(hashtext('suivis:' || new.user_id::text));
  plafond := case when public.est_abonne(new.user_id) then 10 else 3 end;
  if public.suivis_total(new.user_id) >= plafond then
    raise exception 'limite de % suivis atteinte', plafond;
  end if;
  return new;
end $$;

-- Rien à faire pour les comptes qui dépassent déjà : un déclencheur BEFORE INSERT ne regarde que
-- les ajouts. Ils gardent ce qu'ils ont, et pourront ajouter de nouveau après en avoir retiré.
