// Le détail de l'argent d'un dossier, réservé aux abonnés — pour tous les volets municipaux.
//
//   GET /api/detail?ville=quebec&dossier=AP2026-271.pdf
//   Authorization: Bearer <jeton de session Supabase>   (facultatif)
//
// Réponses :
//   { existe: false, lu: false }               aucun détail pour ce dossier
//     + pour un abonné : demandable: true et demande: { le, parVous } s'il est déjà demandé
//   { existe: false, lu: true }                lu, mais le document ne donne pas un détail fiable
//   { existe: true, acces: 'apercu', apercu }  visiteur ou compte non abonné
//   { existe: true, acces: 'complet', detail } compte abonné
//
//   POST /api/detail?ville=quebec&dossier=AP2026-271.pdf   (abonné)
//   Demande que ce détail soit lu en priorité (table demandes_details, au plus 10 par 24 h) :
//   { ok: true, demande: { le, parVous: true } }. Le matin, quebec/scripts/details-du-jour.js lit
//   les demandes avant les nouveaux dossiers.
//
//   Refus : 403 { erreur: 'réservé aux abonnés' } sans session, 403 { erreur: 'abonnement inactif' }
//   pour un compte sans abonnement actif, 503 { erreur: 'abonnement non vérifiable' } si Supabase
//   ne répond pas (le client dit alors « réessayez », jamais « votre abonnement n'est plus actif »).
//
// Le détail vit dans la table Supabase `details_argent` (voir scripts/supabase-schema-abonnes.sql),
// jamais dans le site ni dans le dépôt GitHub public : c'est ce qui le rend réellement réservé.
// L'abonnement est vérifié ici, côté serveur, avec la clé service_role ; le navigateur ne voit
// jamais la table.

import { estActive } from './_stripe.js';

const VILLES = new Set(['quebec', 'montreal', 'levis', 'longueuil', 'laval']);
const DOSSIER = /^[\w.\-]{1,120}$/;

const NATURES = {
  depense: 'dépense',
  plafond_subvention: 'subvention maximale',
  subvention_recue: 'reçu par la Ville',
  pret: 'prêt',
  valeur_au_role: "valeur au rôle d'évaluation",
  revenu: 'revenu pour la Ville',
  investissement_prive: 'investissement privé',
  fermeture_emprunt: "fermeture d'emprunts",
  autre: 'montant',
  aucun: 'aucun montant',
};

const DEMANDES_PAR_JOUR = 10;

async function supabase(chemin, { jeton, methode = 'GET', corps, entetes = {} } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}${chemin}`, {
    method: methode,
    headers: { apikey: cle, Authorization: `Bearer ${jeton ?? cle}`, ...(corps ? { 'Content-Type': 'application/json' } : {}), ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!res.ok) return { ok: false, statut: res.status };
  const texte = await res.text();
  return { ok: true, donnees: texte ? JSON.parse(texte) : null, entetes: res.headers };
}

// L'abonné derrière le jeton : { id, abonne }, null sans session valable, ou { indisponible: true }
// quand Supabase ne répond pas — une panne n'est pas « pas abonné », et le client ne doit pas dire à
// un abonné payant que son abonnement n'est plus actif.
async function abonneDe(jeton) {
  if (!jeton) return null;
  const utilisateur = await supabase('/auth/v1/user', { jeton });
  if (!utilisateur.ok && ![401, 403].includes(utilisateur.statut)) return { indisponible: true };
  const id = utilisateur.ok ? utilisateur.donnees?.id : null;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const r = await supabase(`/rest/v1/abonnements?user_id=eq.${id}&select=statut,fin`);
  if (!r.ok) return { id, indisponible: true };
  // La même règle que tout le site : api/_stripe.js, estActive.
  return { id, abonne: estActive(r.donnees?.[0]) };
}

// 503 quand l'abonnement n'a pas pu être vérifié (le client dit « réessayez ») ; 403 « abonnement
// inactif » pour un compte reconnu sans abonnement actif (le client peut alors le dire) ; 403
// « réservé aux abonnés » sans session.
const refus = (res, qui) => (qui?.indisponible
  ? res.status(503).json({ erreur: 'abonnement non vérifiable' })
  : res.status(403).json({ erreur: qui ? 'abonnement inactif' : 'réservé aux abonnés' }));

// Une demande déjà classée « sans-montant » par le script du matin : le dossier n'a pas de montant à
// détailler. On ne la repropose pas, et on ne fait pas croire à une lecture. Le matin la rouvre de
// lui-même si un résumé refait trouve un montant (details-du-jour.js, rouvrirSansMontant).
async function sansMontant(ville, dossier) {
  const r = await supabase(`/rest/v1/demandes_details?ville=eq.${ville}&dossier_id=eq.${encodeURIComponent(dossier)}&resultat=eq.sans-montant&select=id&limit=1`);
  return Boolean(r.ok && r.donnees?.length);
}

// La demande en attente pour ce dossier : la sienne d'abord ; sinon celle d'un autre abonné, mais
// seulement s'il est encore actif — le script du matin n'en lit pas d'autres, et une demande qui ne
// sera pas lue ne doit ni cacher le bouton ni promettre une lecture. undefined : relecture
// impossible (on ne sait pas) ; null : rien en attente.
async function demandeEnAttente(ville, dossier, userId) {
  const r = await supabase(`/rest/v1/demandes_details?ville=eq.${ville}&dossier_id=eq.${encodeURIComponent(dossier)}&traite_le=is.null&select=user_id,created_at&order=created_at`);
  if (!r.ok) return undefined;
  const sienne = r.donnees?.find((x) => x.user_id === userId);
  if (sienne) return { le: sienne.created_at, parVous: true };
  const autres = [...new Set((r.donnees ?? []).map((x) => x.user_id))].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (!autres.length) return null;
  const a = await supabase(`/rest/v1/abonnements?user_id=in.(${autres.join(',')})&select=user_id,statut,fin`);
  const actifs = new Set((a.ok ? a.donnees ?? [] : []).filter(estActive).map((x) => x.user_id));
  const autre = r.donnees.find((x) => actifs.has(x.user_id));
  return autre ? { le: autre.created_at, parVous: false } : null;
}

// Ce qu'un visiteur voit : de quoi il s'agit et ce qu'il débloquerait, sans les chiffres.
function apercu(d) {
  const sections = [
    d.beneficiaire || d.payeur ? 'qui reçoit et qui paie' : null,
    d.soumissions?.length ? `${new Set(d.soumissions.map((s) => s.entreprise)).size} soumission(s) comparée(s)` : null,
    d.estimationVille ? "l'estimation de la Ville" : null,
    d.repartitionAnnuelle?.length ? 'la répartition par année' : null,
    d.sourceFinancement ? "d'où vient l'argent" : null,
    d.conditions?.length ? 'les conditions' : null,
    d.changementsNotables?.length ? 'ce qui change' : null,
    d.duree ? 'la durée' : null,
  ].filter(Boolean);
  return { nature: NATURES[d.typeMontant] ?? 'montant', beneficiaire: d.beneficiaire ?? null, sections };
}

// Ce qu'un abonné voit : les champs publiables, sans la mécanique interne.
function complet(d) {
  const { verification, jetons, modele, genereLe, ...champs } = d;
  return { ...champs, nature: NATURES[d.typeMontant] ?? 'montant', extraitLe: genereLe ?? null };
}

// Export en tableur (Mes dossiers) : le détail de plusieurs dossiers d'un coup, abonnés seulement.
//   GET /api/detail?ville=quebec&dossiers=AP2026-271.pdf,DE2026-256.pdf   (200 au plus par appel)
//   → { details: { 'AP2026-271.pdf': {…champs publiables…} } } — seulement les détails utilisables.
const LOT_MAX = 200;
async function lot(res, { ville, liste, jeton }) {
  const ids = [...new Set(liste.split(','))];
  if (!ids.length || ids.length > LOT_MAX || !ids.every((id) => DOSSIER.test(id))) return res.status(400).json({ erreur: 'paramètres invalides' });
  const qui = await abonneDe(jeton);
  if (!qui?.abonne) return refus(res, qui);
  const filtre = encodeURIComponent(`(${ids.map((id) => `"${id}"`).join(',')})`);
  const r = await supabase(`/rest/v1/details_argent?ville=eq.${ville}&dossier_id=in.${filtre}&select=dossier_id,detail`);
  if (!r.ok) return res.status(502).json({ erreur: 'détail indisponible' });
  const details = {};
  for (const { dossier_id, detail } of r.donnees ?? []) if (detail && detail.verification?.utilisable !== false) details[dossier_id] = complet(detail);
  return res.status(200).json({ details });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const ville = String(req.query.ville ?? '');
  const dossier = String(req.query.dossier ?? '');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ erreur: 'service non configuré' });
  if (req.method === 'GET' && VILLES.has(ville) && req.query.dossiers !== undefined) {
    return lot(res, { ville, liste: String(req.query.dossiers), jeton: (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null });
  }
  if (!VILLES.has(ville) || !DOSSIER.test(dossier)) return res.status(400).json({ erreur: 'paramètres invalides' });

  const r = await supabase(`/rest/v1/details_argent?ville=eq.${ville}&dossier_id=eq.${encodeURIComponent(dossier)}&select=detail`);
  if (!r.ok) return res.status(r.statut === 404 ? 503 : 502).json({ erreur: 'détail indisponible' });
  const d = r.donnees?.[0]?.detail;
  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;

  if (req.method === 'POST') return demander(res, { ville, dossier, d, jeton });
  if (req.method !== 'GET') return res.status(405).json({ erreur: 'méthode non permise' });

  // Abonnement invérifiable : ni l'aperçu ni le verrou à un abonné — le client dira « réessayez ».
  const qui = await abonneDe(jeton);
  if (qui?.indisponible) return refus(res, qui);
  if (!d || d.verification?.utilisable === false) {
    const reponse = { existe: false, lu: Boolean(d) };
    if (!d && qui?.abonne) {
      if (await sansMontant(ville, dossier)) reponse.sansMontant = true;
      else Object.assign(reponse, { demandable: true, demande: await demandeEnAttente(ville, dossier, qui.id) });
    }
    return res.status(200).json(reponse);
  }
  if (qui?.abonne) return res.status(200).json({ existe: true, acces: 'complet', detail: complet(d) });
  return res.status(200).json({ existe: true, acces: 'apercu', apercu: apercu(d) });
}

async function demander(res, { ville, dossier, d, jeton }) {
  const qui = await abonneDe(jeton);
  if (!qui?.abonne) return refus(res, qui);
  if (d) return res.status(409).json({ erreur: 'déjà lu' });
  if (await sansMontant(ville, dossier)) return res.status(409).json({ erreur: 'sans montant' });
  const depuis = new Date(Date.now() - 864e5).toISOString();
  const recentes = await supabase(`/rest/v1/demandes_details?user_id=eq.${qui.id}&created_at=gte.${depuis}&select=id`, { entetes: { Prefer: 'count=exact', Range: '0-0' } });
  if (!recentes.ok) return res.status(503).json({ erreur: 'demandes indisponibles' });
  const nombre = Number(recentes.entetes.get('content-range')?.split('/')[1] ?? recentes.donnees?.length ?? 0);
  if (nombre >= DEMANDES_PAR_JOUR) return res.status(429).json({ erreur: `au plus ${DEMANDES_PAR_JOUR} demandes par 24 heures` });
  const ajout = await supabase('/rest/v1/demandes_details?on_conflict=user_id,ville,dossier_id', {
    methode: 'POST',
    corps: { user_id: qui.id, ville, dossier_id: dossier },
    entetes: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  });
  if (!ajout.ok) return res.status(502).json({ erreur: "la demande n'a pas été enregistrée" });
  const demande = await demandeEnAttente(ville, dossier, qui.id);
  if (demande === null) {
    // Rien en attente après l'ajout : sa demande existait déjà et a été notée traitée — pourtant le
    // détail n'est pas dans Supabase (sinon, 409 « déjà lu » plus haut) : la lecture n'a pas abouti
    // ou sa publication a échoué. On rouvre la demande plutôt que de répondre « déjà traitée » sans
    // rien montrer, et le matin la relit. (« sans-montant » est refusé plus haut, pas rouvert.)
    const rouverte = await supabase(`/rest/v1/demandes_details?user_id=eq.${qui.id}&ville=eq.${ville}&dossier_id=eq.${encodeURIComponent(dossier)}`, {
      methode: 'PATCH',
      corps: { traite_le: null, resultat: null },
      entetes: { Prefer: 'return=minimal' },
    });
    if (!rouverte.ok) return res.status(502).json({ erreur: "la demande n'a pas été enregistrée" });
  }
  // Relecture impossible juste après un ajout réussi : la demande est bel et bien enregistrée.
  return res.status(200).json({ ok: true, demande: demande ?? { le: new Date().toISOString(), parVous: true } });
}
