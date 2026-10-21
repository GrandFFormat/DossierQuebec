-- Retour des alertes sur mesure (21 oct. 2026), deuxième outil de l'abonnement. À exécuter une fois
-- dans Supabase (SQL Editor → New query → coller → Run), APRÈS scripts/supabase-abonnement-retour.sql.
-- Rejouable sans danger.
--
-- Les tables existent déjà (supabase-schema-alertes.sql, supabase-schema-mots-cles.sql,
-- supabase-schema-mots-cles-portee.sql) : alertes_etat, alertes_preferences, alertes_envois,
-- alertes_mots_cles. Aucune nouvelle table dans public ; les GRANT sont répétés par sûreté.
--
-- Ce qui change : les mots-clés deviennent un outil PAYANT, à part du suivi.
--   - Mots-clés : 10 pour un·e abonné·e, 0 sinon ; seulement ceux de l'Assemblée nationale
--     (portee « assemblee ») — rien de municipal derrière le paiement (conditions des Villes).
--   - Suivi des projets de loi, des élus et des projets de ville : 3 pour tout le monde, INCHANGÉ.
--     Seul le compte change : suivis_total ne compte plus les mots-clés, sinon un abonné qui pose
--     3 mots-clés ne pourrait plus rien suivre. Les déclencheurs limite_dossiers_suivis et
--     limite_organismes_suivis (supabase-abonnement-retour.sql) ne sont pas touchés.

-- 0. Au cas où supabase-schema-mots-cles-portee.sql n'aurait pas été exécuté.
alter table public.alertes_mots_cles
  add column if not exists portee text not null default 'villes' check (portee in ('villes', 'assemblee'));
alter table public.alertes_mots_cles drop constraint if exists alertes_mots_cles_user_id_mot_key;
create unique index if not exists alertes_mots_cles_par_portee on public.alertes_mots_cles (user_id, portee, mot);

-- 1. Le total des suivis, sans les mots-clés : projets (de loi et de ville) et anciens organismes.
create or replace function public.suivis_total(uid uuid) returns int
  language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.dossiers_suivis where user_id = uid)
       + (select count(*) from public.organismes_suivis where user_id = uid);
$$;
revoke execute on function public.suivis_total(uuid) from public, anon;
grant execute on function public.suivis_total(uuid) to authenticated, service_role;

-- 2. Le plafond des mots-clés : 10 pour un·e abonné·e (est_abonne, même règle qu'api/_stripe.js),
--    0 sinon, et seulement des mots de l'Assemblée. Verrou par compte, comme les suivis : dix ajouts
--    envoyés en même temps ne passent pas tous. Les mots de ville d'avant le 27 sept. 2026 restent
--    (on peut les retirer depuis Mon dossier) mais ne comptent pas et ne déclenchent rien.
create or replace function public.limite_mots_cles() returns trigger language plpgsql set search_path = '' as $$
declare plafond int;
begin
  if new.portee is distinct from 'assemblee' then
    raise exception 'mots-clés : seulement pour l''Assemblée nationale';
  end if;
  perform pg_advisory_xact_lock(hashtext('mots:' || new.user_id::text));
  plafond := case when public.est_abonne(new.user_id) then 10 else 0 end;
  if plafond = 0 then
    raise exception 'mots-clés réservés aux abonnés';
  end if;
  if (select count(*) from public.alertes_mots_cles where user_id = new.user_id and portee = 'assemblee') >= plafond then
    raise exception 'limite de % mots-clés atteinte', plafond;
  end if;
  return new;
end $$;
drop trigger if exists limite_mots_cles on public.alertes_mots_cles;
create trigger limite_mots_cles before insert on public.alertes_mots_cles
  for each row execute function public.limite_mots_cles();
-- Un mot ne change pas de liste après coup (l'écran ne fait qu'ajouter et retirer).
revoke update on public.alertes_mots_cles from authenticated;

-- 3. Les GRANT (tables existantes, répétés par sûreté).
grant select, insert, delete on public.alertes_mots_cles to authenticated;
grant select on public.alertes_mots_cles to service_role;
grant select, insert, update on public.alertes_preferences to authenticated;
grant select, insert, update on public.alertes_preferences to service_role;
grant select on public.alertes_envois to authenticated;
grant select, insert on public.alertes_envois to service_role;
grant select, insert, update, delete on public.alertes_etat to service_role;
grant select on public.dossiers_suivis to service_role;
grant select on public.follows to service_role;
