-- « Ce qui vous préoccupe », 2e étape (Martin, 18 oct. 2026). À exécuter une fois dans Supabase,
-- après supabase-schema-preoccupations.sql : SQL Editor → coller → Run.
--   1. Les messages passent de 500 caractères à 300 mots (2 000 caractères au plus, le site
--      compte les mots avant l'envoi).
--   2. Les comptes de la table `admins` lisent tous les messages et corrigent leur statut et leur
--      sujet, depuis la page Lexique (sous « Demandes d'explications »).

alter table public.preoccupations drop constraint if exists preoccupations_texte_check;
alter table public.preoccupations add constraint preoccupations_texte_check
  check (length(texte) between 3 and 2000);

create policy "les admins lisent tout" on public.preoccupations
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy "les admins corrigent" on public.preoccupations
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

grant update (statut, sujet) on public.preoccupations to authenticated;
