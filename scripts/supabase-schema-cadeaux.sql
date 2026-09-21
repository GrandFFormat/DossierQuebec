-- Offrir un abonnement, et les comptes de consultation (21 septembre 2026).
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
--
-- DEUX CHOSES, dans le même fichier parce qu'elles vont ensemble :
--
--   1. des CODES CADEAUX que Martin crée ici et remet à qui il veut ; la personne les fait
--      valoir sur la page d'abonnement. Rien ne touche Stripe, le webhook ni le courriel.
--   2. des COMPTES DE CONSULTATION : un abonnement qui ouvre la lecture payante mais ne peut
--      rien modifier. C'est le cas d'une bibliothèque dont le compte reste ouvert sur les
--      postes publics — sans ça, n'importe quel usager peut ajouter « Beauport » aux alertes,
--      retirer les projets suivis, demander des détails d'argent ou se déconnecter du poste.
--
-- POURQUOI source = 'manuel' ET NON 'cadeau'. api/_stripe.js ne protège qu'une seule valeur :
--
--     if (existant?.source === 'manuel' && estActive(existant)) return 'manuel';
--
-- Un abonnement offert marqué « cadeau » se ferait écraser au prochain webhook Stripe touchant
-- ce compte. Plutôt que d'élargir cette garde — c'est-à-dire modifier la chaîne de paiement
-- pour une fonction qui n'en a pas besoin — on réutilise la valeur déjà protégée et déjà
-- éprouvée. La trace du cadeau ne se perd pas : elle vit dans codes_cadeaux.utilise_par.

-- ---------- le drapeau « consultation » ----------
-- Sur `abonnements` plutôt que sur le compte : c'est l'abonnement qui est de consultation, et
-- la colonne survit aux écritures de Stripe, qui ne l'envoie jamais (un upsert PostgREST ne
-- touche que les colonnes qu'il liste).
alter table public.abonnements add column if not exists lecture_seule boolean not null default false;

create or replace function public.est_lecture_seule(uid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((select lecture_seule from public.abonnements where user_id = uid), false);
$$;
-- Une fonction SECURITY DEFINER est exécutable par tout le monde par défaut. Celle-ci ne sert
-- qu'aux déclencheurs ci-dessous et au serveur.
revoke execute on function public.est_lecture_seule(uuid) from public, anon;
grant execute on function public.est_lecture_seule(uuid) to authenticated, service_role;

-- ---------- le refus d'écriture ----------
-- Un seul garde-fou, posé sur chaque table où un usager écrit depuis le navigateur. Des
-- DÉCLENCHEURS plutôt qu'une réécriture des politiques RLS : ils s'ajoutent sans toucher aux
-- règles existantes, déjà éprouvées, et c'est le mécanisme que le site utilise déjà pour les
-- limites du palier (voir supabase-schema-limites.sql).
--
-- L'interface masque aussi ces commandes (classe dq-consultation), mais le masquage n'est
-- qu'une politesse : la protection, c'est ici. Un usager de neuf ans qui ouvre la console ne
-- doit pas pouvoir troller la bibliothèque.
create or replace function public.refus_lecture_seule() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  -- Sur un DELETE, `new` est nul ; sur un INSERT, `old` l'est.
  if public.est_lecture_seule(coalesce(new.user_id, old.user_id)) then
    raise exception 'compte de consultation : modification refusée';
  end if;
  return coalesce(new, old);
end $$;

-- Les sept tables qu'un usager peut écrire depuis le navigateur. Relevé le 21 septembre 2026
-- en cherchant tous les .insert/.upsert/.delete du code client ; à refaire si une table s'ajoute.
do $$
declare t text;
begin
  foreach t in array array[
    'dossiers_suivis',      -- les projets suivis
    'alertes_mots_cles',    -- « Beauport » et compagnie
    'alertes_preferences',  -- recevoir ou non les alertes
    'organismes_suivis',
    'follows',              -- ministres et député·e·s suivis sur DossierQuébec
    'bill_flags',           -- signaler un projet de loi
    'demandes_details'      -- demander le détail de l'argent d'un dossier
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'refus_lecture_seule_' || t, t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.refus_lecture_seule()',
      'refus_lecture_seule_' || t, t);
  end loop;
end $$;

-- ---------- les codes ----------
create table if not exists public.codes_cadeaux (
  code text primary key,
  mois int not null check (mois between 1 and 24),
  -- Un code « consultation » crée un abonnement qui ne peut rien modifier : c'est celui qu'on
  -- donne à une bibliothèque. Un code ordinaire crée un abonnement normal.
  lecture_seule boolean not null default false,
  -- À quoi ce code était destiné : « Bibliothèque de Longueuil », « don d'un lecteur ».
  note text,
  cree_le timestamptz not null default now(),
  utilise_par uuid references auth.users(id) on delete set null,
  utilise_le timestamptz
);
-- `create table if not exists` NE RATTRAPE PAS une table déjà créée par une version antérieure
-- de ce fichier : il la saute en silence, et une colonne ajoutée depuis n'apparaît jamais. Le
-- cas s'est produit le 21 septembre 2026 — la table existait sans `lecture_seule`, et
-- l'insertion d'un code de bibliothèque échouait sur « column does not exist ». D'où cet ALTER,
-- qui rend le fichier rejouable tel quel.
alter table public.codes_cadeaux add column if not exists lecture_seule boolean not null default false;

alter table public.codes_cadeaux enable row level security;
-- AUCUNE politique : personne ne lit ni n'écrit cette table depuis le navigateur. Un code se
-- fait valoir par la fonction ci-dessous, qui ne révèle jamais la liste. Sans ça, n'importe qui
-- pourrait lire tous les codes non utilisés et se servir.
grant select, insert, update on public.codes_cadeaux to service_role;

-- ---------- faire valoir un code ----------
-- Renvoie un objet JSON plutôt que de lever une erreur : le navigateur doit pouvoir expliquer
-- CE QUI cloche (code inconnu, déjà utilisé, abonnement Stripe en cours) sans que le message
-- technique de Postgres remonte à l'écran.
create or replace function public.utiliser_code_cadeau(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code public.codes_cadeaux%rowtype;
  v_abo public.abonnements%rowtype;
  v_depart timestamptz;
  v_fin timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'raison', 'connexion');
  end if;

  -- On ne retient que lettres et chiffres, en majuscules : « dq-abcd-1234 », « DQ ABCD 1234 »
  -- et « DQABCD1234 » désignent le même code. Quelqu'un qui recopie un code à la main ne doit
  -- pas échouer sur un tiret.
  select * into v_code
    from public.codes_cadeaux
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu');
  end if;
  if v_code.utilise_par is not null then
    return jsonb_build_object('ok', false, 'raison', 'utilise');
  end if;

  select * into v_abo from public.abonnements where user_id = v_user;

  -- Un abonné qui paie déjà par Stripe : on REFUSE, et on lui dit pourquoi. Écrire
  -- source = 'manuel' sur sa ligne figerait sa synchronisation Stripe (la garde citée en tête
  -- de ce fichier ferait ensuite refuser toute mise à jour), et prolonger `fin` sans changer la
  -- source serait effacé au prochain webhook. Dans les deux cas le cadeau disparaîtrait sans
  -- bruit. Mieux vaut qu'il garde son code pour plus tard, ou qu'il l'offre.
  if v_abo.user_id is not null
     and v_abo.source = 'stripe'
     and v_abo.statut = 'actif'
     and (v_abo.fin is null or v_abo.fin > now()) then
    return jsonb_build_object('ok', false, 'raison', 'stripe');
  end if;

  -- Un cadeau PROLONGE ce qui reste : quelqu'un à qui il reste deux mois et qui fait valoir un
  -- code de douze en a quatorze, pas douze. Une date de fin nulle veut dire « sans fin » (accès
  -- permanent) : on n'y touche pas, sinon on transformerait un accès permanent en accès daté.
  if v_abo.user_id is not null and v_abo.statut = 'actif' and v_abo.fin is null then
    return jsonb_build_object('ok', false, 'raison', 'permanent');
  end if;

  -- Un code de consultation ne doit pas retirer des droits à quelqu'un qui en avait : si le
  -- compte pouvait modifier ses suivis, il le pourra encore. Le drapeau ne se pose donc que sur
  -- un compte neuf ou déjà en consultation.
  if v_code.lecture_seule and v_abo.user_id is not null and not v_abo.lecture_seule then
    return jsonb_build_object('ok', false, 'raison', 'deja_normal');
  end if;

  v_depart := greatest(now(), coalesce(v_abo.fin, now()));
  v_fin := v_depart + (v_code.mois || ' months')::interval;

  insert into public.abonnements (user_id, statut, source, fin, lecture_seule, updated_at)
  values (v_user, 'actif', 'manuel', v_fin, v_code.lecture_seule, now())
  on conflict (user_id) do update
    set statut = 'actif', source = 'manuel', fin = v_fin,
        lecture_seule = v_code.lecture_seule, updated_at = now();

  update public.codes_cadeaux
     set utilise_par = v_user, utilise_le = now()
   where code = v_code.code;

  return jsonb_build_object('ok', true, 'mois', v_code.mois, 'fin', v_fin,
                            'lecture_seule', v_code.lecture_seule);
end $$;

-- Une fonction SECURITY DEFINER est exécutable par tout le monde par défaut : sans ce revoke,
-- un visiteur non connecté pourrait la marteler pour deviner des codes.
revoke execute on function public.utiliser_code_cadeau(text) from public, anon;
grant execute on function public.utiliser_code_cadeau(text) to authenticated;

-- ---------- créer des codes ----------
-- Cinq codes ordinaires de 12 mois :
--
--   insert into public.codes_cadeaux (code, mois, note)
--   select upper('DQ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 12,
--          'Cadeaux — septembre 2026'
--     from generate_series(1, 5);
--
-- Trois codes de CONSULTATION de 12 mois, pour des bibliothèques :
--
--   insert into public.codes_cadeaux (code, mois, lecture_seule, note)
--   select upper('BIB' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)), 12, true,
--          'Bibliothèques — septembre 2026'
--     from generate_series(1, 3);
--
--   select code, mois, lecture_seule, note from public.codes_cadeaux
--    where utilise_par is null order by cree_le desc;
--
-- Qui a utilisé quoi :
--
--   select c.code, c.mois, c.lecture_seule, c.note, u.email, c.utilise_le
--     from public.codes_cadeaux c join auth.users u on u.id = c.utilise_par
--    order by c.utilise_le desc;
--
-- Basculer un compte existant en consultation (ou l'en sortir) :
--
--   update public.abonnements set lecture_seule = true
--    where user_id = (select id from auth.users where email = 'bibliotheque@exemple.ca');
