// Offrir un abonnement RÉCURRENT (21 oct. 2026) : ce que partagent api/abonnement.js (qui ouvre
// Stripe, liste les abonnements offerts et ouvre le portail) et api/_stripe.js (synchroniser, appelé
// par le webhook, qui confie ici tout abonnement Stripe marqué « offert »).
//
// LE PARCOURS. Une personne connectée (le DONATEUR) prend un abonnement Stripe ordinaire — mêmes
// prix STRIPE_PRIX_*, mode « subscription » — mais marqué metadata.type = « offert ». Une fois le
// premier paiement confirmé, le webhook fabrique un code (même format que les codes cadeaux) lié à
// CET abonnement Stripe, et l'envoie par courriel au donateur. La personne qui le reçoit (le
// DESTINATAIRE) le colle dans la case « Mettez votre code ici » : echanger_code_cadeau
// (scripts/supabase-cadeau-recurrent.sql) lui ouvre une ligne `abonnements` avec source = 'offert'
// et le stripe_subscription_id du donateur.
//
// LE MODÈLE.
//   abonnements_offerts  une ligne par abonnement offert : code, donateur, forfait, abonnement et
//                        client Stripe, statut et fin (copiés de Stripe), destinataire une fois le
//                        code utilisé, date du courriel.
//   abonnements          la ligne du DESTINATAIRE : source 'offert', même stripe_subscription_id,
//                        stripe_customer_id vide (le client est celui du donateur : le portail ne
//                        s'ouvre jamais pour le destinataire).
// Chaque renouvellement, échec de paiement ou annulation recopie statut et fin dans les deux. La
// ligne du donateur n'est jamais lue ni écrite ici : son abonnement personnel reste le sien.

import { supabase, site } from './_alertes.js';
import { carteATransferer, codeAffiche, codeNettoye, envoyer, nouveauCode } from './_cadeau.js';
import { echapper } from './_infolettre.js';
import { ACTIFS, finDe, FORFAITS, modeStripe, prixDe, stripe } from './_stripe.js';

const UUID = /^[0-9a-f-]{36}$/;
const CHAMPS = 'code,donateur,forfait,stripe_subscription_id,stripe_customer_id,statut,fin,annulation_prevue,beneficiaire,utilise_le,courriel_envoye_le,cree_le';

const rythme = (forfait, en) => ({
  mensuel: en ? 'every month' : 'chaque mois',
  trimestriel: en ? 'every 3 months' : 'chaque trimestre',
  annuel: en ? 'every year' : 'chaque année',
}[forfait] ?? '');

const lire = async (abonnementId) =>
  (await supabase(`/rest/v1/abonnements_offerts?stripe_subscription_id=eq.${encodeURIComponent(abonnementId)}&select=${CHAMPS}`))?.[0] ?? null;

// ---------- le courriel envoyé au donateur ----------
export function courrielOffert({ code, forfait, langue }) {
  const en = langue === 'en';
  const c = echapper(codeAffiche(code));
  const lien = `${site()}/abonnement`;
  const sujet = en ? 'Your DossierQuébec subscription code to give' : 'Votre code d’abonnement offert DossierQuébec';
  const html = en
    ? `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.55">
  <p>Here is the code of the subscription you are giving (renewed ${rythme(forfait, true)}):</p>
  <p style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${c}</p>
  <p>Give this code to the person you are subscribing. They paste it on <a href="${lien}">dossierquebec.ca/abonnement</a>, in the “Enter your code here” box. You pay until you cancel.</p>
  <p style="font-size:13px;color:#5B6570">The first period started with your payment. You find the code, and the button to cancel, in My file.</p>
  ${carteATransferer({ code, en: true, texteEn: 'You have been given a DossierQuébec subscription' })}
</div>`
    : `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.55">
  <p>Voici le code de l’abonnement que vous offrez (renouvelé ${rythme(forfait, false)}) :</p>
  <p style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${c}</p>
  <p>Donnez ce code à la personne que vous abonnez. Elle le colle sur <a href="${lien}">dossierquebec.ca/abonnement</a>, dans la case « Mettez votre code ici ». Vous payez tant que vous n’annulez pas.</p>
  <p style="font-size:13px;color:#5B6570">La première période a commencé avec votre paiement. Vous retrouvez le code, et le bouton pour annuler, dans Mon dossier.</p>
  ${carteATransferer({ code, en: false, texteFr: 'On vous offre un abonnement à DossierQuébec' })}
</div>`;
  return { sujet, html };
}

// Un code qui n'existe ni chez les codes cadeaux ni chez les abonnements offerts (31^12 : la
// collision est théorique, mais la case unique sert les deux).
async function codeLibre() {
  for (let i = 0; i < 5; i++) {
    const c = nouveauCode();
    const [cadeau] = (await supabase(`/rest/v1/codes_cadeaux?code=eq.${c}&select=code`)) ?? [];
    const [offert] = (await supabase(`/rest/v1/abonnements_offerts?code=eq.${c}&select=code`)) ?? [];
    if (!cadeau && !offert) return c;
  }
  throw new Error('aucun code libre');
}

// ---------- recopier un abonnement offert (appelé par synchroniser) ----------
//
// IDEMPOTENT, comme synchroniser : relu chez Stripe, rejouer un événement ne change rien.
//   1. pas encore de ligne et l'abonnement est payé ? on la crée avec un code (stripe_subscription_id
//      est unique : deux livraisons croisées, une seule ligne) ;
//   2. statut et fin recopiés dans la ligne, et dans celle du destinataire s'il y en a un ;
//   3. courriel au donateur s'il n'est pas déjà parti. Un envoi raté LÈVE l'erreur : le webhook
//      répond 500, Stripe réessaie, l'étape 1 retrouve le code.
export async function synchroniserOffert(sub) {
  const actif = ACTIFS.includes(sub.status);
  const m = sub.metadata ?? {};
  let ligne = await lire(sub.id);
  if (!ligne) {
    // Rien à créer pour un abonnement qui n'a jamais été payé (« incomplete ») ou déjà terminé.
    if (!actif) return 'offert-inactif';
    const donateur = UUID.test(m.donateur ?? '') ? m.donateur : null;
    if (!donateur || !Object.hasOwn(FORFAITS, m.forfait)) {
      console.error('ABONNEMENT OFFERT ILLISIBLE (donateur ou forfait manquant) — à régler à la main :', sub.id);
      return 'offert-illisible';
    }
    // Le prix payé doit être celui du forfait : un abonnement fabriqué ailleurs ne donne rien ici.
    const prix = sub.items?.data?.[0]?.price?.id;
    if (!prix || prix !== prixDe(m.forfait)) {
      console.error('ABONNEMENT OFFERT : prix inattendu', sub.id, prix, m.forfait);
      return 'offert-prix';
    }
    await supabase('/rest/v1/abonnements_offerts?on_conflict=stripe_subscription_id', {
      methode: 'POST',
      entetes: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      corps: [{
        code: await codeLibre(), donateur, forfait: m.forfait,
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
        statut: 'actif',
        note: modeStripe() === 'test' ? '[ESSAI]' : null,
      }],
    });
    // Relu plutôt que supposé : c'est la ligne enregistrée qui fait foi.
    ligne = await lire(sub.id);
    if (!ligne) throw new Error('abonnement offert introuvable après insertion');
  }

  const annulationPrevue = Boolean(sub.cancel_at_period_end || sub.cancel_at);
  const finMs = finDe(sub, ligne.fin);
  const etat = {
    statut: actif ? 'actif' : 'annule',
    fin: finMs ? new Date(finMs).toISOString() : null,
    annulation_prevue: annulationPrevue,
    updated_at: new Date().toISOString(),
  };
  await supabase(`/rest/v1/abonnements_offerts?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}`, {
    methode: 'PATCH', entetes: { Prefer: 'return=minimal' }, corps: etat,
  });
  // La ligne du destinataire, et SEULEMENT si elle porte encore cet abonnement offert : un compte qui
  // a changé de source depuis (il s'est abonné lui-même après une annulation) n'est pas touché.
  if (ligne.beneficiaire && UUID.test(ligne.beneficiaire)) {
    await supabase(`/rest/v1/abonnements?user_id=eq.${ligne.beneficiaire}&source=eq.offert&stripe_subscription_id=eq.${encodeURIComponent(sub.id)}`, {
      methode: 'PATCH', entetes: { Prefer: 'return=minimal' }, corps: etat,
    });
  }

  if (!ligne.courriel_envoye_le && actif) {
    const client = ligne.stripe_customer_id ? await stripe(`/customers/${encodeURIComponent(ligne.stripe_customer_id)}`) : null;
    if (!client?.email) {
      console.error('ABONNEMENT OFFERT sans courriel du donateur — code à transmettre à la main :', sub.id);
    } else {
      const { sujet, html } = courrielOffert({ code: ligne.code, forfait: ligne.forfait, langue: m.langue });
      await envoyer({ a: client.email, sujet, html });
      await supabase(`/rest/v1/abonnements_offerts?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}`, {
        methode: 'PATCH', entetes: { Prefer: 'return=minimal' }, corps: { courriel_envoye_le: new Date().toISOString() },
      });
    }
  }
  return actif ? 'offert-actif' : 'offert-annule';
}

// Les abonnements offerts par ce compte, pour Mon dossier.
export async function offertsDe(userId) {
  const lignes = await supabase(`/rest/v1/abonnements_offerts?donateur=eq.${userId}&select=${CHAMPS}&order=cree_le.desc`) ?? [];
  return lignes.map((l) => ({
    code: codeAffiche(l.code),
    forfait: l.forfait,
    actif: l.statut === 'actif' && (!l.fin || new Date(l.fin) > new Date()),
    fin: l.fin,
    annulationPrevue: Boolean(l.annulation_prevue),
    utilise: Boolean(l.beneficiaire || l.utilise_le),
  }));
}

// Un abonnement offert de CE donateur, retrouvé par son code (pour le portail et l'annulation).
export async function offertDuDonateur(userId, brut) {
  const code = codeNettoye(brut);
  if (!code) return null;
  const [l] = (await supabase(`/rest/v1/abonnements_offerts?donateur=eq.${userId}&code=eq.${code}&select=${CHAMPS}`)) ?? [];
  return l ?? null;
}
