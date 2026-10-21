-- Retour du suivi des organismes (21 oct. 2026), septième outil de l'abonnement : « Suivre une
-- entreprise ou un organisme », par ses mémoires déposés en commission à l'Assemblée nationale
-- (api/_organismes.js). À exécuter une fois dans Supabase (SQL Editor → New query → coller → Run),
-- APRÈS scripts/supabase-abonnement-retour.sql et scripts/supabase-alertes-retour.sql. Rejouable sans
-- danger.
--
-- La table existe déjà (supabase-schema-organismes.sql) : aucune nouvelle table dans public ; les
-- GRANT sont répétés par sûreté.
--
-- Ce qui change :
--   - Organismes : 10 pour un·e abonné·e (est_abonne, même règle qu'api/_stripe.js), 0 sinon, et
--     seulement ceux de l'Assemblée nationale (portee « assemblee »). Le nom gardé est la CLÉ de
--     l'organisme (cleOrganisme, api/_organismes.js), jusqu'à 400 caractères (mémoires communs).
--   - Les anciennes lignes (avant le 27 sept. 2026, noms cherchés dans les décisions des VILLES)
--     prennent la portee « villes » : elles restent, ne comptent nulle part et ne déclenchent rien.
--   - suivis_total ne compte plus les organismes. Le suivi gratuit des projets de loi, des élus et
--     des projets de ville reste 3 pour tout le monde : limite_dossiers_suivis n'est pas touché.

-- 1. La portée, comme alertes_mots_cles. Les lignes qui existent déjà sont municipales.
alter table public.organismes_suivis
  add column if not exists portee text not null default 'villes' check (portee in ('villes', 'assemblee'));
-- La clé d'un mémoire commun peut dépasser 120 caractères.
alter table public.organismes_suivis drop constraint if exists organismes_suivis_nom_check;
alter table public.organismes_suivis drop constraint if exists organismes_suivis_nom_longueur;
alter table public.organismes_suivis
  add constraint organismes_suivis_nom_longueur check (char_length(btrim(nom)) between 2 and 400);
-- Un même nom peut exister dans les deux portées.
alter table public.organismes_suivis drop constraint if exists organismes_suivis_user_id_nom_key;
create unique index if not exists organismes_suivis_par_portee on public.organismes_suivis (user_id, portee, nom);

-- 2. Le total des suivis gratuits : les projets seulement (de loi et de ville). Les mots-clés en
--    sont sortis le 21 oct. 2026 (supabase-alertes-retour.sql), les organismes aussi.
create or replace function public.suivis_total(uid uuid) returns int
  language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.dossiers_suivis where user_id = uid)::int;
$$;
revoke execute on function public.suivis_total(uuid) from public, anon;
grant execute on function public.suivis_total(uuid) to authenticated, service_role;

-- 3. Le plafond des organismes : 10 pour un·e abonné·e, 0 sinon, Assemblée seulement. Verrou par
--    compte : dix ajouts envoyés en même temps ne passent pas tous. Messages reconnus par
--    commun/dq.js (« réservés aux abonnés », « limite de N organismes »).
create or replace function public.limite_organismes_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int;
begin
  if new.portee is distinct from 'assemblee' then
    raise exception 'organismes : seulement pour l''Assemblée nationale';
  end if;
  perform pg_advisory_xact_lock(hashtext('organismes:' || new.user_id::text));
  plafond := case when public.est_abonne(new.user_id) then 10 else 0 end;
  if plafond = 0 then
    raise exception 'organismes réservés aux abonnés';
  end if;
  if (select count(*) from public.organismes_suivis where user_id = new.user_id and portee = 'assemblee') >= plafond then
    raise exception 'limite de % organismes atteinte', plafond;
  end if;
  return new;
end $$;
drop trigger if exists limite_organismes_suivis on public.organismes_suivis;
create trigger limite_organismes_suivis before insert on public.organismes_suivis
  for each row execute function public.limite_organismes_suivis();
-- Une ligne ne change pas après coup (l'écran ne fait qu'ajouter et retirer).
revoke update on public.organismes_suivis from authenticated;

-- 4. Les GRANT (table existante, répétés par sûreté). Le serveur lit les suivis pour les alertes du
--    matin (api/_alertes-assemblee.js).
grant select, insert, delete on public.organismes_suivis to authenticated;
grant select on public.organismes_suivis to service_role;
