-- Offrir un abonnement RÉCURRENT (21 octobre 2026). Rejouable tel quel.
-- À exécuter dans Supabase : SQL Editor → coller → Run.
-- Suppose déjà exécutés supabase-schema-stripe.sql et supabase-cadeaux-retour.sql : le premier bloc
-- s'arrête net s'ils manquent.
--
-- Le parcours : un DONATEUR connecté paie un abonnement Stripe ordinaire (mêmes prix), marqué
-- « offert » (api/abonnement.js, action=offrir). Le webhook crée une ligne dans abonnements_offerts,
-- avec un code de 12 caractères envoyé au donateur (api/_offert.js). Le DESTINATAIRE colle le code
-- dans la case habituelle (action=code → echanger_code_cadeau, ci-dessous) : il reçoit une ligne
-- `abonnements` avec source = 'offert' et le stripe_subscription_id du donateur. Chaque
-- renouvellement, échec de paiement ou annulation de cet abonnement Stripe est recopié dans sa ligne.
-- La ligne du donateur n'est jamais touchée.

do $$
begin
  if to_regclass('public.abonnements') is null or to_regclass('public.codes_cadeaux') is null
     or to_regprocedure('public.utiliser_code_cadeau(text)') is null
     or to_regprocedure('public.echanger_code_cadeau(uuid, text)') is null then
    raise exception 'exécuter d''abord scripts/supabase-schema-stripe.sql puis scripts/supabase-cadeaux-retour.sql';
  end if;
end $$;

-- ---------- une nouvelle source d'abonnement ----------
alter table public.abonnements drop constraint if exists abonnements_source_check;
alter table public.abonnements add constraint abonnements_source_check check (source in ('manuel', 'stripe', 'offert'));

-- ---------- les abonnements offerts ----------
create table if not exists public.abonnements_offerts (
  id bigint generated always as identity primary key,
  -- Même format que les codes cadeaux, rangé sans tirets.
  code text not null unique check (code ~ '^[A-Z0-9]{12}$'),
  donateur uuid references auth.users(id) on delete set null,
  forfait text not null check (forfait in ('mensuel', 'trimestriel', 'annuel')),
  -- Unique : un abonnement Stripe, un code, même si Stripe relivre l'événement.
  stripe_subscription_id text not null unique,
  stripe_customer_id text,
  -- Copiés de Stripe par le webhook, comme dans `abonnements`.
  statut text not null default 'actif' check (statut in ('actif', 'annule')),
  fin timestamptz,
  annulation_prevue boolean not null default false,
  -- Le compte qui a utilisé le code (une seule fois).
  beneficiaire uuid references auth.users(id) on delete set null,
  utilise_le timestamptz,
  courriel_envoye_le timestamptz,
  note text,
  cree_le timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists abonnements_offerts_donateur on public.abonnements_offerts (donateur);
create index if not exists abonnements_offerts_beneficiaire on public.abonnements_offerts (beneficiaire);

alter table public.abonnements_offerts enable row level security;
-- Le donateur lit ses abonnements offerts, le destinataire celui qu'il a reçu. Personne n'écrit
-- depuis le navigateur : seul le serveur (service_role) crée et met à jour les lignes.
drop policy if exists "abonnements offerts : donateur et destinataire lisent les leurs" on public.abonnements_offerts;
create policy "abonnements offerts : donateur et destinataire lisent les leurs" on public.abonnements_offerts
  for select to authenticated using (donateur = auth.uid() or beneficiaire = auth.uid());
revoke all on public.abonnements_offerts from anon, authenticated;
grant select on public.abonnements_offerts to authenticated;
grant select, insert, update on public.abonnements_offerts to service_role;

-- `abonnements` : chacun lit déjà sa ligne (supabase-schema-abonnes.sql) ; répété ici pour ne pas
-- dépendre de l'ordre d'exécution.
grant select on public.abonnements to authenticated;
grant select, insert, update on public.abonnements to service_role;

-- ---------- faire valoir un code, côté serveur ----------
-- Remplace celle de supabase-cadeaux-retour.sql : même compte des essais, puis
--   1. un code d'abonnement OFFERT ? il est traité ici ;
--   2. sinon, utiliser_code_cadeau, inchangée (codes cadeaux, codes de Martin et des bibliothèques).
create or replace function public.echanger_code_cadeau(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_essais int;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_off public.abonnements_offerts%rowtype;
  v_abo public.abonnements%rowtype;
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

  select * into v_abo from public.abonnements where user_id = p_user;

  -- 1. Un abonnement offert.
  select * into v_off from public.abonnements_offerts where code = v_code for update;
  if found then
    if v_off.beneficiaire is not null then
      return jsonb_build_object('ok', false, 'raison', 'utilise');
    end if;
    if v_off.donateur = p_user then
      return jsonb_build_object('ok', false, 'raison', 'soi_meme');
    end if;
    if v_off.statut <> 'actif' or (v_off.fin is not null and v_off.fin <= now()) then
      return jsonb_build_object('ok', false, 'raison', 'termine');
    end if;
    -- Un compte déjà abonné (par carte, par un code ou par un autre abonnement offert) : refusé, le
    -- code reste neuf. Rien ne se perd : ni le temps qui reste, ni l'abonnement payé.
    if v_abo.user_id is not null and v_abo.statut = 'actif' and (v_abo.fin is null or v_abo.fin > now()) then
      return jsonb_build_object('ok', false, 'raison', case when v_abo.source = 'stripe' then 'stripe' else 'deja_abonne' end);
    end if;

    insert into public.abonnements (user_id, statut, source, fin, lecture_seule, miroir_de,
                                    stripe_customer_id, stripe_subscription_id, annulation_prevue, updated_at)
    values (p_user, 'actif', 'offert', v_off.fin, false, null,
            null, v_off.stripe_subscription_id, v_off.annulation_prevue, now())
    on conflict (user_id) do update
      set statut = 'actif', source = 'offert', fin = v_off.fin, lecture_seule = false, miroir_de = null,
          -- Le client Stripe reste celui du donateur, jamais copié ici : le destinataire n'a pas de portail.
          stripe_customer_id = null, stripe_subscription_id = v_off.stripe_subscription_id,
          annulation_prevue = v_off.annulation_prevue, updated_at = now();

    update public.abonnements_offerts set beneficiaire = p_user, utilise_le = now(), updated_at = now()
     where id = v_off.id;

    return jsonb_build_object('ok', true, 'offert', true, 'forfait', v_off.forfait, 'fin', v_off.fin);
  end if;

  -- 2. Un code cadeau. Pas par-dessus un abonnement offert actif : il remplacerait la source, et le
  --    lien avec l'abonnement du donateur serait perdu.
  if v_abo.user_id is not null and v_abo.source = 'offert' and v_abo.statut = 'actif'
     and (v_abo.fin is null or v_abo.fin > now()) then
    return jsonb_build_object('ok', false, 'raison', 'offert');
  end if;

  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  return public.utiliser_code_cadeau(p_code);
end $$;

revoke execute on function public.echanger_code_cadeau(uuid, text) from public, anon, authenticated;
grant execute on function public.echanger_code_cadeau(uuid, text) to service_role;

-- ---------- consulter ----------
--   select o.code, o.forfait, o.statut, o.fin, d.email as donateur, b.email as destinataire, o.utilise_le
--     from public.abonnements_offerts o
--     left join auth.users d on d.id = o.donateur
--     left join auth.users b on b.id = o.beneficiaire
--    order by o.cree_le desc;
