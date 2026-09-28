-- Retrait de l'abonnement payant (27 sept. 2026). À exécuter une fois dans Supabase
-- (SQL Editor → New query → coller → Run).
--
-- Tous les plafonds de suivis passent par public.est_abonne (supabase-schema-limites.sql et
-- supabase-schema-mots-cles-portee.sql : « 10 si abonné, sinon 3 »). En lui faisant répondre
-- « non » pour tout le monde, le plafond devient 3 pour tous, sans toucher aux déclencheurs.
-- Rien n'est effacé : la table abonnements et ses lignes restent, elles ne donnent simplement
-- plus rien.
create or replace function public.est_abonne(uid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select false;
$$;
revoke execute on function public.est_abonne(uuid) from public, anon;
grant execute on function public.est_abonne(uuid) to authenticated, service_role;
