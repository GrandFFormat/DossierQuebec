// Le compte rendu mensuel par courriel : l'inscription, par ville, et la désinscription.
//
//   GET  /api/infolettre?action=etat          (jeton facultatif) → { villes, connecte, courriel, inscriptions }
//   POST /api/infolettre?action=inscrire      { email, villes: ['quebec'] } — formulaire public
//        Connecté avec la même adresse : confirmé tout de suite (l'adresse est déjà vérifiée) et le
//        plus récent compte rendu part. Sinon : un courriel « Confirmer mon inscription ».
//   POST /api/infolettre?action=preferences   (connecté) { villes: { quebec: true } } — Mes dossiers
//   GET  /api/infolettre?action=confirmer&ids=…&s=…    le lien du courriel de confirmation
//   GET|POST /api/infolettre?action=desinscrire&ids=…&s=…[&tout=1]   le lien de chaque compte rendu
//
// Personne n'est inscrit sans l'avoir demandé et confirmé (loi anti-pourriel) ; la réponse du
// formulaire est la même qu'une adresse soit déjà inscrite ou non.

import { supabase, site } from './_alertes.js';
import { utilisateurDe } from './_stripe.js';
import { COURRIEL, VILLES_INFOLETTRE, deMois, echapper, envoyerBienvenue, envoyerCourriels, idsSignes, lienSigne, prochainEnvoi, dernierNumero } from './_infolettre.js';

const jetonDe = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
const corpsDe = (req) => {
  if (typeof req.body !== 'string') return req.body ?? {};
  try { return JSON.parse(req.body); } catch { return {}; }
};

function page(titre, message) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
    <link rel="icon" type="image/svg+xml" href="/commun/icone.svg">
    <title>${titre} — DossierQuébec</title>
    <style>body{font-family:Arial,sans-serif;background:#F7F8FA;color:#16191D;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
    .carte{background:#fff;border:1px solid #DDE2E7;border-top:5px solid #0B8A4B;border-radius:12px;padding:32px;max-width:460px;text-align:center;line-height:1.55}
    h1{font-size:21px;margin:0 0 12px}a{color:#076338;font-weight:bold}.note{font-size:13px;color:#5B6570}</style>
    </head><body><div class="carte"><h1>${titre}</h1>${message}</div></body></html>`;
}

async function inscriptionsDe(email) {
  return supabase(`/rest/v1/infolettre_inscriptions?email=eq.${encodeURIComponent(email)}&select=id,email,ville,statut,confirmation_envoyee_le`);
}

async function etat(u) {
  const inscriptions = {};
  if (u?.email) for (const i of await inscriptionsDe(u.email.toLowerCase())) inscriptions[i.ville] = i.statut;
  return { villes: Object.entries(VILLES_INFOLETTRE).map(([cle, nom]) => ({ cle, nom })), connecte: Boolean(u), courriel: u?.email ?? null, inscriptions };
}

// Confirme (ou crée confirmées) les inscriptions d'une adresse vérifiée, et envoie la bienvenue aux nouvelles.
async function confirmerPour(email, villes, { userId = null, source = 'formulaire' } = {}) {
  const existantes = await inscriptionsDe(email);
  const maintenant = new Date().toISOString();
  const nouvelles = [];
  for (const ville of villes) {
    const e = existantes.find((x) => x.ville === ville);
    if (e?.statut === 'confirme') continue;
    const [ligne] = await supabase('/rest/v1/infolettre_inscriptions?on_conflict=email,ville', {
      methode: 'POST',
      corps: [{ email, ville, statut: 'confirme', confirme_le: maintenant, desinscrit_le: null, source, ...(userId ? { user_id: userId } : {}) }],
      entetes: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });
    if (ligne) nouvelles.push(ligne);
  }
  await envoyerBienvenue(nouvelles);
  return nouvelles.length;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'DIGEST_FROM', 'CRON_SECRET']) {
    if (!process.env[v]) return res.status(503).json({ erreur: `variable manquante : ${v}` });
  }
  const action = String(req.query?.action ?? '');

  // ---------- les liens des courriels : des pages ----------
  if (action === 'confirmer' || action === 'desinscrire') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const ids = idsSignes(action, req.query?.ids, req.query?.s);
    if (!ids) return res.status(400).send(page('Lien invalide', "<p>Ce lien n'est pas valide. Il a peut-être été coupé par votre logiciel de courriel.</p>"));
    try {
      const lignes = await supabase(`/rest/v1/infolettre_inscriptions?id=in.(${ids.join(',')})&select=id,email,ville,statut`);
      if (!lignes.length) return res.status(404).send(page('Inscription introuvable', `<p>Cette inscription n'existe plus. <a href="${site()}/quebec/">Revenir au site</a></p>`));
      const noms = (ls) => [...new Set(ls.map((l) => VILLES_INFOLETTRE[l.ville] ?? l.ville))].join(' et ');

      if (action === 'confirmer') {
        const aConfirmer = lignes.filter((l) => l.statut === 'en_attente');
        if (!aConfirmer.length) {
          return res.status(200).send(page('Déjà confirmé', `<p>Votre inscription au compte rendu de ${echapper(noms(lignes))} est déjà active.</p><p><a href="${site()}/quebec/">Revenir au site</a></p>`));
        }
        await supabase(`/rest/v1/infolettre_inscriptions?id=in.(${aConfirmer.map((l) => l.id).join(',')})`, {
          methode: 'PATCH', corps: { statut: 'confirme', confirme_le: new Date().toISOString() }, entetes: { Prefer: 'return=minimal' },
        });
        await envoyerBienvenue(aConfirmer);
        const numeros = (await Promise.all([...new Set(aConfirmer.map((l) => l.ville))].map(dernierNumero))).filter(Boolean);
        return res.status(200).send(page(
          "C'est confirmé 📬",
          `<p>Vous recevrez le compte rendu mensuel de la Ville de ${echapper(noms(aConfirmer))}.</p>
           <p>${numeros.length ? `<strong>Celui ${echapper(deMois(numeros[0].mois))} vient de partir vers votre boîte.</strong> Le prochain arrive ${prochainEnvoi()}.` : `<strong>Le premier arrive ${prochainEnvoi()}.</strong>`}</p>
           <p class="note">Pas dans votre boîte d'ici quelques minutes ? Regardez dans les courriels indésirables.</p>
           <p><a href="${site()}/${aConfirmer[0].ville}/">Voir les décisions de la Ville</a></p>`
        ));
      }

      // désinscrire : cette ville, ou toutes celles de l'adresse
      const cibles = req.query?.tout === '1' ? await inscriptionsDe(lignes[0].email) : lignes;
      await supabase(`/rest/v1/infolettre_inscriptions?id=in.(${cibles.map((l) => l.id).join(',')})`, {
        methode: 'PATCH', corps: { statut: 'desinscrit', desinscrit_le: new Date().toISOString() }, entetes: { Prefer: 'return=minimal' },
      });
      if (req.method === 'POST') return res.status(200).send('ok'); // désinscription en un clic des messageries
      return res.status(200).send(page(
        "C'est fait",
        `<p>Vous ne recevrez plus le compte rendu de ${echapper(noms(cibles))}.</p>
         <p class="note">Changé d'idée ? Réinscrivez-vous en tout temps sur l'accueil du volet de votre ville, ou dans Mes dossiers.</p>
         <p><a href="${site()}/${cibles[0].ville}/">Revenir au site</a></p>`
      ));
    } catch (erreur) {
      console.error('infolettre :', action, erreur);
      return res.status(500).send(page('Erreur', '<p>Une erreur est survenue. Réessayez dans un moment.</p>'));
    }
  }

  // ---------- le formulaire et Mes dossiers : du JSON ----------
  try {
    const u = await utilisateurDe(jetonDe(req));
    if (action === 'etat' && req.method === 'GET') return res.status(200).json(await etat(u));
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non permise' });
    const corps = corpsDe(req);

    if (action === 'inscrire') {
      if (corps.site_web) return res.status(200).json({ ok: true, attente: true }); // pot de miel : un robot
      const email = String(corps.email ?? '').trim().toLowerCase();
      const villes = [...new Set((Array.isArray(corps.villes) ? corps.villes : []).filter((v) => Object.hasOwn(VILLES_INFOLETTRE, v)))];
      if (!COURRIEL.test(email)) return res.status(400).json({ erreur: 'adresse invalide' });
      if (!villes.length) return res.status(400).json({ erreur: 'choisissez au moins une ville' });

      // Connecté avec cette adresse : elle est déjà vérifiée par le lien de connexion.
      if (u?.email && u.email.toLowerCase() === email) {
        await confirmerPour(email, villes, { userId: u.id });
        return res.status(200).json({ ok: true, confirme: true, prochain: prochainEnvoi() });
      }

      // Garde-fous contre l'envoi de courriels de confirmation à la chaîne : 10 minutes par adresse,
      // 30 par heure en tout.
      const existantes = await inscriptionsDe(email);
      const recent = existantes.some((e) => e.confirmation_envoyee_le && Date.now() - new Date(e.confirmation_envoyee_le) < 10 * 60e3);
      const heure = new Date(Date.now() - 3600e3).toISOString();
      const parHeure = await supabase(`/rest/v1/infolettre_inscriptions?confirmation_envoyee_le=gte.${encodeURIComponent(heure)}&select=id&limit=31`);
      if (parHeure.length > 30) return res.status(429).json({ erreur: 'trop de demandes, réessayez plus tard' });

      const aDemander = villes.filter((v) => existantes.find((e) => e.ville === v)?.statut !== 'confirme');
      if (aDemander.length && !recent) {
        const lignes = await supabase('/rest/v1/infolettre_inscriptions?on_conflict=email,ville', {
          methode: 'POST',
          corps: aDemander.map((ville) => ({ email, ville, statut: 'en_attente', confirmation_envoyee_le: new Date().toISOString() })),
          entetes: { Prefer: 'resolution=merge-duplicates,return=representation' },
        });
        const noms = lignes.map((l) => VILLES_INFOLETTRE[l.ville]).join(' et ');
        await envoyerCourriels([{
          a: email,
          sujet: `Confirmez votre inscription — le compte rendu de la Ville de ${noms}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16191D;line-height:1.55">
            <h1 style="font-size:21px;margin:0 0 12px;color:#0B8A4B">📬 Une dernière étape</h1>
            <p>Quelqu'un — vous, on l'espère — a demandé à recevoir le compte rendu mensuel de la Ville de ${echapper(noms)} à cette adresse.</p>
            <p style="margin:22px 0"><a href="${lienSigne('confirmer', lignes.map((l) => l.id))}" style="display:inline-block;padding:11px 20px;border-radius:6px;background:#0B8A4B;color:#ffffff;font-weight:bold;text-decoration:none">Confirmer mon inscription</a></p>
            <p>Dès que c'est confirmé, le plus récent compte rendu part vers votre boîte. Ensuite, un par mois.</p>
            <p style="font-size:13px;color:#5B6570">Ce n'est pas vous ? Ignorez ce courriel : rien ne vous sera envoyé.<br>DossierQuébec — site citoyen indépendant, sans publicité. ${site()}</p>
          </div>`,
        }]);
      }
      return res.status(200).json({ ok: true, attente: true });
    }

    if (action === 'preferences') {
      if (!u?.email) return res.status(401).json({ erreur: 'connexion requise' });
      const email = u.email.toLowerCase();
      const choix = corps.villes && typeof corps.villes === 'object' ? corps.villes : {};
      const oui = Object.keys(choix).filter((v) => Object.hasOwn(VILLES_INFOLETTRE, v) && choix[v] === true);
      const non = Object.keys(choix).filter((v) => Object.hasOwn(VILLES_INFOLETTRE, v) && choix[v] === false);
      await confirmerPour(email, oui, { userId: u.id, source: 'mes-dossiers' });
      if (non.length) {
        await supabase(`/rest/v1/infolettre_inscriptions?email=eq.${encodeURIComponent(email)}&ville=in.(${non.join(',')})&statut=neq.desinscrit`, {
          methode: 'PATCH', corps: { statut: 'desinscrit', desinscrit_le: new Date().toISOString() }, entetes: { Prefer: 'return=minimal' },
        });
      }
      return res.status(200).json({ ok: true, prochain: prochainEnvoi(), ...(await etat(u)) });
    }

    return res.status(400).json({ erreur: 'action inconnue' });
  } catch (erreur) {
    console.error('infolettre :', action, erreur);
    return res.status(502).json({ erreur: 'service indisponible' });
  }
}
