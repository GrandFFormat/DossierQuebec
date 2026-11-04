-- Suivis illimités pour les abonné·e·s (Martin, 4 nov. 2026). À exécuter une fois dans Supabase
-- (SQL Editor → New query → coller → Run). Remplace limite_dossiers_suivis de
-- supabase-abonnement-retour.sql : 3 pour un compte gratuit, aucune limite si est_abonne.
-- Les mots-clés et les organismes gardent leur plafond de 10 (supabase-alertes-retour.sql).
create or replace function public.limite_dossiers_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int := 3;
begin
  if public.est_abonne(new.user_id) then
    return new;
  end if;
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
