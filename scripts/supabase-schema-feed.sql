-- Lectures du flux RSS (api/feed.js). Répond à une seule question : est-ce que
-- quelqu'un s'abonne au flux ? Vercel Analytics ne peut pas y répondre — un
-- fichier XML n'exécute aucun JavaScript, donc aucune balise ne s'y déclenche.
--
-- CE QU'ON ENREGISTRE, ET RIEN D'AUTRE : la date et le User-Agent. Pas
-- d'adresse IP, pas de cookie, pas d'identifiant. Aucune personne n'est
-- identifiable, ce qui évite d'avoir à demander un consentement.
--
-- Pourquoi le User-Agent suffit : les lecteurs RSS s'y annoncent, et Feedly
-- comme Inoreader y inscrivent le NOMBRE D'ABONNÉS —
--   « Feedly/1.0 (+http://www.feedly.com/fetcher.html; 12 subscribers) »
-- que api/feed.js extrait dans la colonne `abonnes`. C'est la réponse la plus
-- directe à la question posée.
create table public.feed_hits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ua text,
  abonnes int
);

alter table public.feed_hits enable row level security;

-- Écrit uniquement par api/feed.js, côté serveur, avec la clé secrète. Aucun
-- accès public : ni lecture, ni écriture depuis le navigateur.
grant insert on public.feed_hits to service_role;
grant select on public.feed_hits to service_role;

create index feed_hits_created_at_idx on public.feed_hits (created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- POUR LIRE LES RÉSULTATS, dans l'éditeur SQL de Supabase.
--
-- Qui lit le flux, et combien d'abonnés déclare chaque lecteur ?
--
--   select
--     split_part(ua, '/', 1)      as lecteur,
--     count(*)                    as lectures,
--     max(abonnes)                as abonnes_declares,
--     max(created_at)             as derniere_lecture
--   from public.feed_hits
--   where created_at > now() - interval '30 days'
--   group by 1
--   order by lectures desc;
--
-- ⚠️ Lire « lectures » avec prudence : un lecteur interroge le flux toutes les
-- 15 à 60 minutes, qu'il ait 1 abonné ou 500. Un gros nombre de lectures ne
-- veut PAS dire un gros lectorat. La colonne `abonnes_declares` est le seul
-- chiffre qui parle de personnes ; elle est vide pour les lecteurs qui ne la
-- publient pas (Thunderbird, NetNewsWire, curl…).
--
-- Y a-t-il de VRAIES personnes derrière, ou juste des robots d'indexation ?
--
--   select count(*) filter (where ua ilike '%subscriber%') as avec_abonnes,
--          count(*) filter (where ua ilike '%bot%' or ua ilike '%spider%') as robots,
--          count(*) as total
--   from public.feed_hits
--   where created_at > now() - interval '30 days';
-- ───────────────────────────────────────────────────────────────────────────
