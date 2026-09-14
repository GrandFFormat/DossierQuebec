-- Correctifs des avertissements de sécurité de Supabase (Advisors), 14 sept. 2026. À exécuter une
-- fois : SQL Editor → coller → Run. Ré-exécutable sans erreur. Rien ne change pour les visiteurs.

-- 1) « Function Search Path Mutable » : les trois garde-fous (limite de suivis, de mots-clés,
--    d'organismes). Leurs requêtes nomment déjà public.<table> ; on fixe le search_path pour
--    qu'aucun objet d'un autre schéma ne puisse s'y substituer.
alter function public.limite_dossiers_suivis() set search_path = '';
alter function public.limite_mots_cles() set search_path = '';
alter function public.limite_organismes_suivis() set search_path = '';

-- 2) « RLS Policy Always True » sur la liste d'attente : l'inscription reste ouverte à tous (c'est
--    voulu), mais la règle vérifie maintenant le courriel et la ville au lieu de « true ».
drop policy if exists "liste d'attente : s'inscrire" on public.abonnement_liste_attente;
create policy "liste d'attente : s'inscrire" on public.abonnement_liste_attente for insert to anon, authenticated
  with check (length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and (ville is null or ville ~ '^[a-z-]{2,40}$'));

-- 3) « SECURITY DEFINER Function executable » : Postgres donne EXECUTE à tout le monde (PUBLIC) à la
--    création d'une fonction, même quand le script ne l'accorde qu'à un rôle.
--    - flag_counts_all : réservée au cron du digest (clé service_role).
revoke execute on function public.flag_counts_all() from public, anon, authenticated;
grant execute on function public.flag_counts_all() to service_role;
--    - my_recent_flag_count : sert à la règle d'insertion de bill_flags, pour les comptes connectés
--      seulement ; un visiteur n'en a pas besoin.
revoke execute on function public.my_recent_flag_count() from public, anon;
grant execute on function public.my_recent_flag_count() to authenticated;
--    - rls_auto_enable : fonction créée par Supabase (activation automatique de la RLS sur les
--      nouvelles tables), déclenchée par Postgres lui-même ; personne n'a à l'appeler par l'API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Laissés tels quels, volontairement :
--   - flag_counts() appelable par anon et authenticated : l'accueil de DossierQuébec affiche le
--     total de demandes d'explications par projet de loi, sans connexion. Elle ne renvoie que des
--     totaux, jamais qui a demandé quoi ; SECURITY DEFINER est nécessaire pour compter au-delà de
--     ses propres lignes.
--   - my_recent_flag_count() pour authenticated : nécessaire à la règle anti-abus de bill_flags.
--   - « Leaked Password Protection Disabled » : les comptes se connectent par lien courriel, sans
--     mot de passe ; l'option ne protège rien ici.
