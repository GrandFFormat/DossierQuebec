-- La veille par thème (21 oct. 2026), sixième outil de l'abonnement. À exécuter une fois dans
-- Supabase (SQL Editor → New query → coller → Run), APRÈS scripts/supabase-alertes-retour.sql.
-- Rejouable sans danger.
--
-- Pas de nouvelle table : les thèmes cochés vont dans une colonne de alertes_preferences (une ligne
-- par compte, déjà lue et écrite par son propriétaire, RLS en place depuis
-- supabase-schema-alertes.sql, déjà protégée contre les comptes de consultation par
-- supabase-schema-cadeaux.sql). Ce qui a déjà été envoyé vit dans alertes_etat (projet « veille »),
-- où seule la clé service_role écrit.
--
-- Les codes permis : la même liste que THEMES dans api/_veille-theme.js et VEILLE_THEMES dans
-- commun/dq.js. Un code ajouté ou retiré doit l'être aux trois endroits.

-- 1. La colonne.
alter table public.alertes_preferences
  add column if not exists veille_themes text[] not null default '{}';
alter table public.alertes_preferences drop constraint if exists alertes_preferences_veille_themes_codes;
alter table public.alertes_preferences add constraint alertes_preferences_veille_themes_codes check (
  veille_themes <@ array['sante', 'education', 'logement', 'environnement', 'economie', 'travail', 'justice',
    'immigration', 'transports', 'agriculture', 'culture', 'municipal', 'famille', 'gouvernance']::text[]
);

-- 2. Réservé aux abonné·e·s : cocher un thème demande un abonnement actif (est_abonne, même règle
--    qu'api/_stripe.js). Vider la liste reste permis à tout le monde (le lien de désabonnement, un
--    abonnement terminé). L'interrupteur des alertes (colonne actif) n'est pas touché.
create or replace function public.veille_reservee_abonnes() returns trigger language plpgsql set search_path = '' as $$
begin
  if cardinality(new.veille_themes) > 0
     and (tg_op = 'INSERT' or new.veille_themes is distinct from old.veille_themes)
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.est_abonne(new.user_id) then
    raise exception 'veille par thème réservée aux abonnés';
  end if;
  return new;
end $$;
drop trigger if exists veille_reservee_abonnes on public.alertes_preferences;
create trigger veille_reservee_abonnes before insert or update on public.alertes_preferences
  for each row execute function public.veille_reservee_abonnes();

-- 3. Les GRANT (table existante ; répétés par sûreté, la colonne nouvelle en hérite).
grant select, insert, update on public.alertes_preferences to authenticated;
grant select, insert, update on public.alertes_preferences to service_role;
grant select, insert, update, delete on public.alertes_etat to service_role;
