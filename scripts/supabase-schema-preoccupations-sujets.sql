-- « Ce qui vous préoccupe », 3e étape (Martin, 18 oct. 2026 : il range les messages lui-même, sans IA).
-- Le sujet d'un message devient son libellé (« Coût du logement ») : accents et espaces permis.
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.

alter table public.preoccupations drop constraint if exists preoccupations_sujet_check;
alter table public.preoccupations add constraint preoccupations_sujet_check
  check (sujet is null or length(sujet) between 2 and 80);
