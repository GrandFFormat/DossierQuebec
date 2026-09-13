// Le détail de l'argent d'un dossier, réservé aux abonnés — pour tous les volets municipaux.
//
//   GET /api/detail?ville=quebec&dossier=AP2026-271.pdf
//   Authorization: Bearer <jeton de session Supabase>   (facultatif)
//
// Réponses :
//   { existe: false }                          aucun détail vérifié pour ce dossier
//   { existe: true, acces: 'apercu', apercu }  visiteur ou compte non abonné
//   { existe: true, acces: 'complet', detail } compte abonné
//
// Le détail vit dans la table Supabase `details_argent` (voir scripts/supabase-schema-abonnes.sql),
// jamais dans le site ni dans le dépôt GitHub public : c'est ce qui le rend réellement réservé.
// L'abonnement est vérifié ici, côté serveur, avec la clé service_role ; le navigateur ne voit
// jamais la table.

const VILLES = new Set(['quebec', 'montreal']);
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

async function supabase(chemin, { jeton } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${jeton ?? cle}` },
  });
  if (!res.ok) return { ok: false, statut: res.status };
  return { ok: true, donnees: await res.json() };
}

async function estAbonne(jeton) {
  if (!jeton) return false;
  const utilisateur = await supabase('/auth/v1/user', { jeton });
  const id = utilisateur.ok ? utilisateur.donnees?.id : null;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return false;
  const r = await supabase(`/rest/v1/abonnements?user_id=eq.${id}&select=statut,fin`);
  const ligne = r.ok ? r.donnees?.[0] : null;
  return Boolean(ligne && ligne.statut === 'actif' && (!ligne.fin || new Date(ligne.fin) > new Date()));
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const ville = String(req.query.ville ?? '');
  const dossier = String(req.query.dossier ?? '');
  if (!VILLES.has(ville) || !DOSSIER.test(dossier)) return res.status(400).json({ erreur: 'paramètres invalides' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ erreur: 'service non configuré' });

  const r = await supabase(`/rest/v1/details_argent?ville=eq.${ville}&dossier_id=eq.${encodeURIComponent(dossier)}&select=detail`);
  if (!r.ok) return res.status(r.statut === 404 ? 503 : 502).json({ erreur: 'détail indisponible' });
  const d = r.donnees?.[0]?.detail;
  if (!d || d.verification?.utilisable === false) return res.status(200).json({ existe: false });

  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
  if (await estAbonne(jeton)) return res.status(200).json({ existe: true, acces: 'complet', detail: complet(d) });
  return res.status(200).json({ existe: true, acces: 'apercu', apercu: apercu(d) });
}
