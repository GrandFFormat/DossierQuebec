-- Mots-clés des villes et mots-clés de l'Assemblée : deux listes (21 septembre 2026).
-- Martin : « les mots-clés de ville et DQ ne seront probablement pas la même chose ». Une rue ou
-- un quartier sert aux décisions municipales ; un sujet (« logement », « forêt ») sert aux projets
-- de loi. À exécuter une fois dans Supabase : SQL Editor → coller → Run. Rejouable sans danger.
--
-- Avant ce script, le site fonctionne déjà : il lit la table avec select=*, traite tout mot sans
-- `portee` comme un mot de ville, et cache la boîte « Mots-clés de l'Assemblée » de Mes dossiers
-- tant que la colonne n'existe pas. Les mots déjà enregistrés deviennent des mots de ville.

-- 1. À quoi sert le mot.
alter table public.alertes_mots_cles
  add column if not exists portee text not null default 'villes' check (portee in ('villes', 'assemblee'));

-- 2. Le même mot peut maintenant être dans les deux listes (« logement » pour la Ville ET pour
--    l'Assemblée) : l'unicité se fait par liste.
alter table public.alertes_mots_cles drop constraint if exists alertes_mots_cles_user_id_mot_key;
create unique index if not exists alertes_mots_cles_par_portee on public.alertes_mots_cles (user_id, portee, mot);

-- 3. La limite de 5 vaut pour CHAQUE liste (scripts/supabase-schema-limites.sql en comptait 5 en
--    tout). Même message, que Mes dossiers reconnaît déjà.
create or replace function public.limite_mots_cles() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.alertes_mots_cles
       where user_id = new.user_id and portee = coalesce(new.portee, 'villes')) >= 5 then
    raise exception 'limite de 5 alertes par mot-clé atteinte';
  end if;
  return new;
end $$;
