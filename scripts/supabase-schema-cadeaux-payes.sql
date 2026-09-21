-- Les cadeaux PAYÉS en ligne (21 septembre 2026).
-- À exécuter APRÈS supabase-schema-cadeaux.sql et supabase-schema-miroir.sql.
--
-- Le parcours : sur /abonnement, quelqu'un inscrit l'adresse de la personne à qui il offre, son
-- propre nom (ou coche « rester anonyme »), paie chez Stripe ; le webhook fabrique un code et
-- l'envoie à la personne, qui l'active comme n'importe quel code cadeau.
--
-- Deux colonnes seulement. La première est ce qui empêche un paiement de produire DEUX codes :
-- Stripe peut livrer le même événement plusieurs fois, et il le fait dès que le webhook répond
-- autre chose que 200.

-- La session de paiement Stripe qui a produit ce code. Unique : un paiement, un code.
alter table public.codes_cadeaux add column if not exists stripe_session_id text unique;

-- À qui le code a été envoyé, et quand. Sans la date, on ne saurait pas distinguer « code créé
-- mais courriel parti en erreur » de « tout est fait » — et on renverrait le courriel à chaque
-- nouvelle livraison de Stripe.
alter table public.codes_cadeaux add column if not exists destinataire text;
alter table public.codes_cadeaux add column if not exists courriel_envoye_le timestamptz;
