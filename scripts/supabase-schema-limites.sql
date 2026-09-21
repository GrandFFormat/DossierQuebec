-- ⚠️ 21 sept. 2026 : limite_mots_cles (5 PAR LISTE, villes et Assemblée) et limite_dossiers_suivis
--    (même limite, sous verrou) sont remplacées par scripts/supabase-schema-mots-cles-portee.sql.
--    Ne pas recoller ces deux fonctions d'ici par-dessus.
-- Les limites du palier citoyen (20 septembre 2026). À exécuter une fois dans Supabase :
-- SQL Editor → coller → Run.
--
-- Jusqu'ici, les plafonds des tables étaient des garde-fous anti-abus (500 projets, 20 mots-clés,
-- 30 organismes) : personne ne les atteignait, et ils ne disaient rien de l'offre. Ils deviennent
-- les limites ANNONCÉES sur la page d'abonnement, ce qui laisse la place à un palier Pro plus tard.
--
--   projets suivis     3 sans abonnement, 10 pour un abonné actif
--   alertes mot-clé    5   (quartier, rue ou mot-clé — réservé aux abonnés)
--   organismes suivis  3   (réservé aux abonnés)
--   exports            10 par mois civil (nouvelle table `exports`, comptée par api/export.js)
--
-- Les comptes qui dépassent déjà ne perdent rien : un trigger BEFORE INSERT ne regarde que les
-- ajouts. Ils ne pourront simplement plus en ajouter tant qu'ils n'en auront pas retiré.

-- ---------- qui est abonné ----------
-- La même règle que partout ailleurs (api/_stripe.js, estActive) : statut actif et fin dans le
-- futur, ou sans date de fin. SECURITY DEFINER parce que les triggers ci-dessous tournent pour
-- l'usager, qui ne lit que SA ligne d'abonnement.
create or replace function public.est_abonne(uid uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.abonnements
     where user_id = uid and statut = 'actif' and (fin is null or fin > now())
  );
$$;
-- Une fonction SECURITY DEFINER est exécutable par tout le monde par défaut : n'importe qui
-- pourrait demander si tel compte paie. Elle ne sert qu'aux triggers ci-dessous, qui tournent
-- pour un usager connecté ou pour le serveur.
revoke execute on function public.est_abonne(uuid) from public, anon;
grant execute on function public.est_abonne(uuid) to authenticated, service_role;

-- ---------- projets suivis : 3 sans abonnement, 10 pour un abonné ----------
create or replace function public.limite_dossiers_suivis() returns trigger language plpgsql set search_path = '' as $$
declare plafond int;
begin
  -- Suivre un projet déjà suivi passe par un upsert « ignoreDuplicates » : ce n'est pas un ajout,
  -- et au plafond pile, le compter en ferait échouer un geste qui n'ajoute rien.
  if exists (select 1 from public.dossiers_suivis
              where user_id = new.user_id and ville = new.ville and dossier_id = new.dossier_id) then
    return new;
  end if;
  plafond := case when public.est_abonne(new.user_id) then 10 else 3 end;
  if (select count(*) from public.dossiers_suivis where user_id = new.user_id) >= plafond then
    raise exception 'limite de % projets suivis atteinte', plafond;
  end if;
  return new;
end $$;

-- ---------- alertes par mot-clé : 5 ----------
create or replace function public.limite_mots_cles() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.alertes_mots_cles where user_id = new.user_id) >= 5 then
    raise exception 'limite de 5 alertes par mot-clé atteinte';
  end if;
  return new;
end $$;

-- ---------- organismes suivis : 3 ----------
create or replace function public.limite_organismes_suivis() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.organismes_suivis where user_id = new.user_id) >= 3 then
    raise exception 'limite de 3 organismes suivis atteinte';
  end if;
  return new;
end $$;

-- ---------- exports : 10 par mois civil ----------
-- Une ligne par fichier produit. Le navigateur fabrique le fichier lui-même ; c'est api/export.js,
-- côté serveur, qui compte et qui refuse — un compteur dans le navigateur se viderait avec le cache.
-- Aucune donnée du fichier n'est gardée : la date et le format suffisent à compter.
create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  format text not null check (format in ('xlsx', 'csv', 'pdf')),
  created_at timestamptz not null default now()
);
create index if not exists exports_user_mois on public.exports (user_id, created_at desc);
alter table public.exports enable row level security;
-- Aucune politique pour `authenticated` : seul le serveur (service_role) écrit et compte.
-- delete : api/export.js rend la dernière réservation quand le fichier n'est jamais sorti.
grant select, insert, delete on public.exports to service_role;
