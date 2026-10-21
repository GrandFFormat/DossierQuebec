-- Le retour des abonnements OFFERTS (21 octobre 2026). Rejouable tel quel.
-- À exécuter dans Supabase : SQL Editor → coller → Run.
-- Suppose déjà exécutés supabase-schema-cadeaux.sql et supabase-schema-miroir.sql (la table
-- codes_cadeaux et la fonction utiliser_code_cadeau, qui restent celles de Martin et des
-- bibliothèques) : le premier bloc s'arrête net s'ils manquent.
--
-- Le parcours : une personne connectée paie une fois chez Stripe (api/abonnement.js, action=cadeau) ;
-- le webhook fabrique un code de 12 caractères et l'envoie par courriel à l'ACHETEUR, qui le donne à
-- qui il veut. La personne qui le reçoit le colle sur /abonnement (action=code) : le serveur appelle
-- echanger_code_cadeau, ci-dessous, qui compte les essais puis délègue à utiliser_code_cadeau.
--
-- Rien ne change pour les comptes de consultation : ni les déclencheurs refus_lecture_seule, ni
-- la colonne lecture_seule, ni les codes de bibliothèque déjà remis.

do $$
begin
  if to_regclass('public.codes_cadeaux') is null or to_regprocedure('public.utiliser_code_cadeau(text)') is null then
    raise exception 'exécuter d''abord scripts/supabase-schema-cadeaux.sql puis scripts/supabase-schema-miroir.sql';
  end if;
end $$;

-- ---------- les codes payés ----------
-- La session Stripe qui a produit le code. Unique : un paiement, un code, même si Stripe relivre.
alter table public.codes_cadeaux add column if not exists stripe_session_id text unique;
-- Le compte qui a payé : il voit ses codes dans Mon dossier.
alter table public.codes_cadeaux add column if not exists acheteur uuid references auth.users(id) on delete set null;
-- L'adresse où le code est parti, et quand : sans la date, un courriel raté ne se distingue pas
-- d'une livraison faite, et chaque relivraison de Stripe renverrait le courriel.
alter table public.codes_cadeaux add column if not exists destinataire text;
alter table public.codes_cadeaux add column if not exists courriel_envoye_le timestamptz;
create index if not exists codes_cadeaux_acheteur on public.codes_cadeaux (acheteur);

alter table public.codes_cadeaux enable row level security;
-- L'acheteur lit SES codes, et seulement les siens (les codes de Martin n'ont pas d'acheteur :
-- personne ne les voit). Personne n'écrit depuis le navigateur : seul le serveur (service_role)
-- crée et marque les codes.
drop policy if exists "codes cadeaux : l'acheteur lit les siens" on public.codes_cadeaux;
create policy "codes cadeaux : l'acheteur lit les siens" on public.codes_cadeaux
  for select to authenticated using (acheteur = auth.uid());
revoke all on public.codes_cadeaux from anon, authenticated;
grant select on public.codes_cadeaux to authenticated;
grant select, insert, update on public.codes_cadeaux to service_role;

-- ---------- les essais ----------
-- Une ligne par code tenté, réussi ou non : 10 par heure par compte, pour qu'on ne devine pas.
create table if not exists public.essais_codes_cadeaux (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  le timestamptz not null default now()
);
create index if not exists essais_codes_cadeaux_user_le on public.essais_codes_cadeaux (user_id, le);
alter table public.essais_codes_cadeaux enable row level security;
-- AUCUNE politique : seul le serveur y touche.
revoke all on public.essais_codes_cadeaux from anon, authenticated;
grant select, insert, delete on public.essais_codes_cadeaux to service_role;

-- ---------- faire valoir un code, côté serveur ----------
-- Appelée par api/abonnement.js avec la clé service_role, pour le compte vérifié par le jeton de
-- session. Elle compte l'essai (il reste compté même si le code est faux), puis délègue à
-- utiliser_code_cadeau, qui lit auth.uid() : on le lui fournit pour cette transaction seulement.
-- Toute la logique existante est donc reprise telle quelle : code déjà servi, abonnement Stripe
-- actif refusé, accès permanent intouché, prolongation de la date de fin, codes de consultation.
create or replace function public.echanger_code_cadeau(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_essais int;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'raison', 'connexion');
  end if;
  -- Un essai à la fois par compte : dix requêtes lancées ensemble ne passent pas toutes sous la limite.
  perform pg_advisory_xact_lock(hashtext('essais_codes_cadeaux:' || p_user::text));
  select count(*) into v_essais from public.essais_codes_cadeaux
   where user_id = p_user and le > now() - interval '1 hour';
  if v_essais >= 10 then
    return jsonb_build_object('ok', false, 'raison', 'trop');
  end if;
  insert into public.essais_codes_cadeaux (user_id) values (p_user);
  delete from public.essais_codes_cadeaux where le < now() - interval '1 day';

  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  return public.utiliser_code_cadeau(p_code);
end $$;

revoke execute on function public.echanger_code_cadeau(uuid, text) from public, anon, authenticated;
grant execute on function public.echanger_code_cadeau(uuid, text) to service_role;

-- Le navigateur ne fait plus valoir de code lui-même (depuis le 27 sept. 2026, plus rien ne
-- l'appelle) : sans ce retrait, il contournerait la limite d'essais en appelant la fonction directement.
revoke execute on function public.utiliser_code_cadeau(text) from public, anon, authenticated;

-- ---------- consulter ----------
--   select c.code, c.mois, c.note, a.email as acheteur, b.email as utilise_par, c.utilise_le
--     from public.codes_cadeaux c
--     left join auth.users a on a.id = c.acheteur
--     left join auth.users b on b.id = c.utilise_par
--    where c.stripe_session_id is not null order by c.cree_le desc;
