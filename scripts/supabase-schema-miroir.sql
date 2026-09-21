-- Un compte maître et ses postes miroirs (21 septembre 2026).
-- À exécuter APRÈS scripts/supabase-schema-cadeaux.sql. SQL Editor → coller → Run.
--
-- Le cas : une bibliothèque. Un compte RESPONSABLE choisit les projets que la succursale suit,
-- et cinq comptes de CONSULTATION, ouverts sur les postes publics, affichent cette sélection
-- sans pouvoir y toucher. Sans ça, chaque poste montre une liste vide et le choix du
-- responsable ne sert à rien.
--
-- LES CODES PARTENT PAR LOT. Un lot = une succursale : un code maître, N codes de poste, tous
-- avec le même `groupe`. Le maître active le sien en premier ; chaque poste activé ensuite se
-- rattache à lui. C'est ce qui évite d'avoir à connaître le compte du responsable au moment où
-- on fabrique les codes — on ne le connaît pas encore.
--
-- CE QUI DEMANDE DE LA PRUDENCE ICI, et rien d'autre : on ajoute une règle de LECTURE sur des
-- tables qui contiennent les suivis de TOUS les abonnés. Une erreur exposerait la liste d'un
-- abonné à un autre. La règle est donc la plus étroite possible : elle ne rend visibles que les
-- lignes du compte que `miroir_de` désigne explicitement, et `miroir_de` n'est posé que par la
-- fonction d'activation, jamais par le navigateur.

-- ---------- le lot, sur les codes ----------
alter table public.codes_cadeaux add column if not exists groupe text;
alter table public.codes_cadeaux add column if not exists maitre boolean not null default false;

-- ---------- le lien, sur les abonnements ----------
-- Le compte dont celui-ci est le miroir. Null pour tout le monde sauf les postes d'une
-- succursale. Jamais écrit depuis le navigateur : aucune politique d'écriture n'existe sur
-- `abonnements`, seul le serveur et la fonction d'activation y touchent.
alter table public.abonnements add column if not exists miroir_de uuid references auth.users(id) on delete set null;

create or replace function public.maitre_de(uid uuid) returns uuid
  language sql stable security definer set search_path = '' as $$
  select miroir_de from public.abonnements where user_id = uid;
$$;
revoke execute on function public.maitre_de(uuid) from public, anon;
grant execute on function public.maitre_de(uuid) to authenticated, service_role;

-- ---------- voir la sélection de son maître ----------
-- Une politique SUPPLÉMENTAIRE, pas une modification : « lire les siens » reste intacte. Sous
-- PostgreSQL, plusieurs politiques permissives s'additionnent — un compte ordinaire voit donc
-- exactement ce qu'il voyait avant, puisque maitre_de() lui renvoie null.
--
-- En LECTURE seulement. L'écriture reste refusée par les déclencheurs posés dans
-- supabase-schema-cadeaux.sql : un poste ne peut rien ajouter ni retirer, ni chez lui ni chez
-- son maître.
drop policy if exists "suivis : lire ceux de son maître" on public.dossiers_suivis;
create policy "suivis : lire ceux de son maître" on public.dossiers_suivis for select
  using (user_id = public.maitre_de(auth.uid()));

drop policy if exists "mots-clés : lire ceux de son maître" on public.alertes_mots_cles;
create policy "mots-clés : lire ceux de son maître" on public.alertes_mots_cles for select
  using (user_id = public.maitre_de(auth.uid()));

drop policy if exists "organismes : lire ceux de son maître" on public.organismes_suivis;
create policy "organismes : lire ceux de son maître" on public.organismes_suivis for select
  using (user_id = public.maitre_de(auth.uid()));

-- ---------- activer un code, en tenant compte du lot ----------
create or replace function public.utiliser_code_cadeau(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.codes_cadeaux%rowtype;
  v_abo public.abonnements%rowtype;
  v_maitre uuid;
  v_depart timestamptz;
  v_fin timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'raison', 'connexion'); end if;

  select * into v_code from public.codes_cadeaux
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) for update;
  if not found then return jsonb_build_object('ok', false, 'raison', 'inconnu'); end if;
  if v_code.utilise_par is not null then return jsonb_build_object('ok', false, 'raison', 'utilise'); end if;

  select * into v_abo from public.abonnements where user_id = v_user;

  if v_abo.user_id is not null and v_abo.source = 'stripe' and v_abo.statut = 'actif'
     and (v_abo.fin is null or v_abo.fin > now()) then
    return jsonb_build_object('ok', false, 'raison', 'stripe');
  end if;
  if v_abo.user_id is not null and v_abo.statut = 'actif' and v_abo.fin is null then
    return jsonb_build_object('ok', false, 'raison', 'permanent');
  end if;
  if v_code.lecture_seule and v_abo.user_id is not null and not v_abo.lecture_seule then
    return jsonb_build_object('ok', false, 'raison', 'deja_normal');
  end if;

  -- Un poste cherche le maître de son lot. Le responsable doit donc activer son code EN
  -- PREMIER : sinon le poste n'a personne à refléter, et on le dit plutôt que de le rattacher
  -- à rien en silence.
  if v_code.groupe is not null and not v_code.maitre then
    select utilise_par into v_maitre from public.codes_cadeaux
     where groupe = v_code.groupe and maitre and utilise_par is not null
     limit 1;
    if v_maitre is null then return jsonb_build_object('ok', false, 'raison', 'maitre_absent'); end if;
    if v_maitre = v_user then return jsonb_build_object('ok', false, 'raison', 'maitre_lui_meme'); end if;
  end if;

  v_depart := greatest(now(), coalesce(v_abo.fin, now()));
  v_fin := v_depart + (v_code.mois || ' months')::interval;

  insert into public.abonnements (user_id, statut, source, fin, lecture_seule, miroir_de, updated_at)
  values (v_user, 'actif', 'manuel', v_fin, v_code.lecture_seule, v_maitre, now())
  on conflict (user_id) do update
    set statut = 'actif', source = 'manuel', fin = v_fin,
        lecture_seule = v_code.lecture_seule,
        -- Ne jamais effacer un lien existant avec un code qui n'en porte pas.
        miroir_de = coalesce(v_maitre, public.abonnements.miroir_de),
        updated_at = now();

  update public.codes_cadeaux set utilise_par = v_user, utilise_le = now() where code = v_code.code;

  return jsonb_build_object('ok', true, 'mois', v_code.mois, 'fin', v_fin,
                            'lecture_seule', v_code.lecture_seule,
                            'miroir', v_maitre is not null);
end $$;

revoke execute on function public.utiliser_code_cadeau(text) from public, anon;
grant execute on function public.utiliser_code_cadeau(text) to authenticated;

-- ---------- fabriquer un lot pour une succursale ----------
-- Un maître + cinq postes, tous du même groupe. Changer le nom et le nombre au besoin.
--
--   with lot as (select 'biblio-gabrielle-roy' as g, 'Gabrielle-Roy' as nom, 12 as mois)
--   insert into public.codes_cadeaux (code, mois, lecture_seule, maitre, groupe, note)
--   select upper('BQ' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
--          l.mois, false, true, l.g, l.nom || ' — responsable'
--     from lot l
--   union all
--   select upper('BQ' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
--          l.mois, true, false, l.g, l.nom || ' — poste ' || n
--     from lot l, generate_series(1, 5) n;
--
--   select note, code, maitre, lecture_seule from public.codes_cadeaux
--    where groupe = 'biblio-gabrielle-roy' order by maitre desc, note;
--
-- Qui reflète qui, une fois les codes activés :
--
--   select p.email as poste, m.email as maitre
--     from public.abonnements a
--     join auth.users p on p.id = a.user_id
--     join auth.users m on m.id = a.miroir_de
--    where a.miroir_de is not null;
