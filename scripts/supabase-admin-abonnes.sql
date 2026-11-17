-- Le nombre d'abonné·e·s aux courriels de ville, lu par /admin (onglet Villes), 17 nov. 2026.
--
-- La table infolettre_inscriptions n'a aucune politique : le navigateur ne la lit pas. Cette
-- fonction, réservée aux comptes de la table `admins`, rend seulement des totaux, jamais une adresse.
-- Une personne inscrite au mensuel ET au conseil de la même ville compte pour une.
--
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.

create or replace function public.dq_infolettre_abonnes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res jsonb;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'réservé aux admins' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(ville, ligne), '{}'::jsonb) into res
  from (
    select ville,
      jsonb_build_object(
        'personnes',      count(distinct email),
        'mensuel',        count(distinct email) filter (where type = 'mensuel'),
        'conseil',        count(distinct email) filter (where type = 'conseil'),
        'arrondissement', count(distinct email) filter (where type = 'arrondissement'),
        'en_attente',     (select count(distinct i2.email) from public.infolettre_inscriptions i2
                            where i2.ville = i.ville and i2.statut = 'en_attente')
      ) as ligne
    from public.infolettre_inscriptions i
    where statut = 'confirme'
    group by ville
  ) t;

  return res;
end;
$$;

revoke all on function public.dq_infolettre_abonnes() from public, anon;
grant execute on function public.dq_infolettre_abonnes() to authenticated;
