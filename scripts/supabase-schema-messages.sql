-- « Nous écrire » (page Mes dossiers) et « Signaler une erreur » (sous chaque fiche des volets
-- municipaux). À exécuter une fois dans Supabase : SQL Editor → coller → Run.
--
-- Les messages arrivent par api/message.js, qui vérifie la connexion, limite à 5 messages par
-- 24 heures par compte, note si la personne est abonnée, garde le message ici et en envoie une
-- copie par courriel. Aucun accès depuis le navigateur : ni lecture, ni écriture. On les lit
-- dans le tableau de bord Supabase (Table Editor → messages_utilisateurs).

create table public.messages_utilisateurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null check (length(email) <= 200),
  abonne boolean not null default false,
  sujet text not null check (sujet in ('idee', 'probleme', 'erreur')),
  message text not null check (length(message) between 3 and 4000),
  ville text check (ville is null or ville ~ '^[a-z-]{2,40}$'),
  numero text check (numero is null or length(numero) <= 80),
  page text check (page is null or length(page) <= 300),
  courriel_envoye boolean not null default false,
  traite boolean not null default false, -- à cocher à la main une fois réglé
  created_at timestamptz not null default now()
);
create index messages_utilisateurs_par_compte on public.messages_utilisateurs (user_id, created_at desc);

alter table public.messages_utilisateurs enable row level security;
-- Aucune politique : seule la clé service_role (la fonction Vercel) y touche.
grant select, insert, update on public.messages_utilisateurs to service_role;
