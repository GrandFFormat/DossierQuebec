-- Langue des courriels (Montréal bilingue). À coller une fois dans Supabase → SQL Editor → Run.
-- Chaque inscription / numéro porte une langue : fr (défaut) ou en.
-- Clé unique élargie : (email, ville, type, arrondissement, langue).

alter table public.infolettre_inscriptions
  add column if not exists langue text not null default 'fr'
    check (langue in ('fr', 'en'));

alter table public.infolettre_numeros
  add column if not exists langue text not null default 'fr'
    check (langue in ('fr', 'en'));

-- Remplacer l'unicité sans langue
drop index if exists public.infolettre_inscriptions_unique;
create unique index if not exists infolettre_inscriptions_unique
  on public.infolettre_inscriptions (email, ville, type, arrondissement, langue);

-- Numéros : clé primaire avec langue
alter table public.infolettre_numeros drop constraint if exists infolettre_numeros_pkey;
alter table public.infolettre_numeros
  add primary key (ville, type, arrondissement, mois, langue);

create index if not exists infolettre_inscriptions_envoi_langue
  on public.infolettre_inscriptions (ville, type, arrondissement, langue, statut);
