// Les élus de la Ville de Laval : le maire et les 22 conseillères et conseillers municipaux.
//
//   node scrapers/elus.js
//
// Source : la page officielle « Conseillères et conseillers municipaux » de laval.ca
// (lib/lav.js, PAGE_ELUS) et les 23 fiches de profil qu'elle relie. La page liste une carte par
// personne — photo (chargée à l'affichage : l'adresse est dans `data-lazy-src`, l'attribut `src`
// est un SVG vide), « Isabelle Piché, District 01 – Saint-François », courriel `@laval.ca`,
// téléphone, lien « Voir son profil ». La fiche ajoute le parti (« Parti politique : Mouvement
// lavallois »), le nombre d'habitants du district et une biographie. Le maire n'a ni district ni
// parti sur sa fiche : on n'en écrit pas.
//
// LE PARE-FEU. laval.ca refuse les robots (Cloudflare, 403 — README, étape 2). On essaie quand
// même en ligne à chaque passage, poliment et sans insister ; sur refus, on lit la capture faite
// à la main dans un navigateur, data/sources/elus-laval.json ({ capture, page, liste: HTML du
// <main>, profils: [{ url, statut, html }] }). Le fichier de sortie dit d'où vient la lecture
// (`obtenu`). Ni l'un ni l'autre : le fichier de la veille reste en place.
//
// Comme à Québec et à Longueuil, on travaille sur le texte de chaque bloc (regex sur le HTML
// d'une carte, d'une fiche), jamais sur la position d'une balise : la page peut changer de
// gabarit sans que la lecture casse, et ce qui casse se voit (nombre de membres, avertissements).
//
// LE GENRE de la fonction n'est jamais deviné : il vient de l'attribut `alt` de la photo
// (« Portrait de la conseillère municipale … », « Portrait du conseiller municipal … »,
// « Portrait du maire … »). Sans `alt` reconnu, `fonction` reste null.
//
// LES RÔLES AU COMITÉ EXÉCUTIF viennent de l'en-tête d'un procès-verbal du comité exécutif
// (le texte mis en cache par decisions.js dans data/textes/CE-*_PV.json) : « MM. Ray Khalil,
// vice-président du comité exécutif, et Nicholas Borne ainsi que Mmes Christine Poirier et
// Flavia Alexandra Novac, sous la présidence de M. Stéphane Boyer, maire et président du comité
// exécutif, formant la totalité des membres du comité exécutif ». On prend le procès-verbal le
// plus récent qui dit « formant la totalité des membres » (tout le comité y est nommé) ; à défaut
// le plus récent tout court, et `rolesSource` dit lequel. Un membre absent ce jour-là n'y est
// pas : on ne complète pas avec un autre procès-verbal, on ne devine pas. Piège : « vice-
// président » coupé par un retour de ligne dans le PDF.

import { writeFile, readFile, readdir } from 'node:fs/promises';
import { texte, PAGE_ELUS, ErreurBloque } from '../lib/lav.js';
import { cle, normaliserEspaces } from '../lib/noms.js';
import { normaliserTexte } from '../lib/pv.js';

const OUT = new URL('../data/elus.json', import.meta.url);

// Le fichier publié de l'exécution précédente, quand il existe : il sert de filet pour les rôles
// au comité exécutif, que seul le cache des procès-verbaux permet de relire.
async function lireJsonSiPossible(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}
const CAPTURE = new URL('../data/sources/elus-laval.json', import.meta.url);
const TEXTES = new URL('../data/textes/', import.meta.url);

// Le maire et 22 districts (découpage en vigueur depuis l'élection de novembre 2025).
const MEMBRES_ATTENDUS = 23;

// ---------- le HTML en texte ----------

const ENTITES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ocirc: 'ô', ecirc: 'ê', icirc: 'î', ucirc: 'û', iuml: 'ï', euml: 'ë', hellip: '…', ndash: '–', mdash: '—' };

export function decoderEntites(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m);
}

// Les balises retirées, les entités décodées, les espaces (dont l'insécable) ramenées à une.
export function texteBrut(html) {
  return normaliserEspaces(decoderEntites(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/[  ]/g, ' '));
}

// ---------- la fonction, d'après l'alt de la photo ----------

const FONCTIONS = { maire: 'Maire', mairesse: 'Mairesse', 'conseillère municipale': 'Conseillère municipale', 'conseiller municipal': 'Conseiller municipal' };

export function fonctionDepuisAlt(alt) {
  const m = texteBrut(alt).match(/^Portrait (?:du|de la|de l[’']) (maire|mairesse|conseillère municipale|conseiller municipal)\b/i);
  return m ? FONCTIONS[m[1].toLowerCase()] : null;
}

// « District 05 – Marigot » -> { numero: 5, nom: 'Marigot' }. Tiret demi-cadratin, cadratin ou
// simple : la page n'est pas constante. Rien de reconnu -> null.
export function lireDistrict(s) {
  const m = texteBrut(s).match(/^District\s*(\d{1,2})\s*[–—-]\s*(.+?)$/i);
  return m ? { numero: Number(m[1]), nom: m[2].trim() } : null;
}

// Le parti, tel que la fiche l'écrit, à la casse près : « Mouvement lavallois » et « Mouvement
// Lavallois » sont le même parti. « Indépendante » reste tel quel : c'est le mot de la Ville.
const PARTIS = { 'mouvement-lavallois': 'Mouvement lavallois', 'action-laval': 'Action Laval', 'parti-laval': 'Parti Laval' };

export function normaliserParti(s) {
  const t = texteBrut(s);
  if (!t) return null;
  return PARTIS[cle(t)] ?? t;
}

// La photo : `data-lazy-src` (chargement différé de la page), sinon `data-src`, sinon un `src`
// qui soit une vraie adresse (pas le SVG vide de remplacement).
function photoDe(bloc) {
  const m = bloc.match(/data-lazy-src="([^"]+)"/) ?? bloc.match(/data-src="([^"]+)"/) ?? bloc.match(/<img[^>]*\ssrc="(https?:[^"]+)"/);
  return m ? m[1] : null;
}

// ---------- la liste ----------

// Une carte par personne : « <article class="municipal-councilor-item"> … </article> ».
export function parserListe(html) {
  const cartes = String(html ?? '').split(/<article\b[^>]*municipal-councilor-item[^>]*>/).slice(1);
  const membres = [];
  for (const carte of cartes) {
    const bloc = carte.split('</article>')[0];
    const titre = texteBrut(bloc.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]);
    if (!titre) continue;
    const virgule = titre.indexOf(',');
    const nomComplet = virgule > 0 ? titre.slice(0, virgule).trim() : titre;
    const reste = virgule > 0 ? titre.slice(virgule + 1).trim() : '';
    const alt = decoderEntites(bloc.match(/<img[^>]*\salt="([^"]*)"/)?.[1] ?? '');
    const district = lireDistrict(reste);
    membres.push({
      nomComplet,
      fonction: fonctionDepuisAlt(alt),
      titre: reste || null,
      districtNumero: district?.numero ?? null,
      district: district?.nom ?? null,
      courriel: bloc.match(/href="mailto:([^"?]+)/)?.[1]?.trim() ?? null,
      telephone: texteBrut(bloc.match(/municipal-councilor-item__phone[^>]*>([^<]*)</)?.[1]) || null,
      profil: bloc.match(/href="([^"]+)"[^>]*municipal-councilor-item__link/)?.[1] ?? null,
      photo: photoDe(bloc),
      alt: alt || null,
    });
  }
  return membres;
}

// ---------- une fiche ----------

export function parserProfil(html) {
  const h = String(html ?? '');
  const district = lireDistrict(h.match(/<h2[^>]*>\s*(District[^<]*)<\/h2>/i)?.[1] ?? '');
  const habitantsBrut = texteBrut(h.match(/district-population[^>]*>([^<]*)</)?.[1]);
  const habitants = /habitants/i.test(habitantsBrut) ? Number(habitantsBrut.replace(/\D/g, '')) || null : null;
  // « Découvrez qui est … » : un <h3> sur les fiches des conseillers, un <h2> sur celle du maire.
  const bio = h.match(/<h[23][^>]*>\s*Découvrez qui est[^<]*<\/h[23]>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const alt = decoderEntites(h.match(/<img[^>]*\salt="(Portrait[^"]*)"/)?.[1] ?? '');
  return {
    districtNumero: district?.numero ?? null,
    district: district?.nom ?? null,
    parti: normaliserParti(h.match(/Parti politique\s*:\s*([^<]+)</i)?.[1]),
    habitants,
    biographie: bio ? texteBrut(bio) : null,
    telephone: texteBrut(h.match(/href="tel:[^"]*"[^>]*>([^<]*)</)?.[1]) || null,
    photo: photoDe(h),
    fonction: fonctionDepuisAlt(alt),
  };
}

// ---------- les rôles au comité exécutif ----------

// L'en-tête d'un procès-verbal du comité exécutif : de « sont présents: » à « formant … » ;
// { passage, totalite } ou null quand il n'est pas reconnu.
export function enteteComite(texteBrutPv) {
  const t = normaliserTexte(texteBrutPv).replace(/\s+/g, ' ');
  const m = t.match(/sont pr[ée]sents?\s*:\s*(.*?)\s*,?\s*formant (la totalité des membres|quorum)/i);
  if (!m) return null;
  return { passage: m[1].replace(/vice-\s+pr/gi, 'vice-pr'), totalite: /totalité/i.test(m[2]) };
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const majuscule = (s) => s.charAt(0).toLocaleUpperCase('fr-CA') + s.slice(1);

// Les rôles des membres nommés dans l'en-tête : « Président du comité exécutif »,
// « Vice-président du comité exécutif », « Membre du comité exécutif ». Seuls les noms de la liste
// des élus sont reconnus (`inconnus` : ce qui reste de l'en-tête, pour vérification).
export function rolesDepuisEntete(passage, membres) {
  const roles = new Map();
  let reste = normaliserTexte(passage).replace(/\s+/g, ' ');
  for (const m of membres) {
    const nom = normaliserTexte(m.nomComplet).replace(/\s+/g, ' ');
    const re = new RegExp(`(?:MM\\.|Mmes|Mme|M\\.)?\\s*${echapper(nom)}\\s*(?:,\\s*(?:maire(?:sse)?(?: suppléante?)? et )?(vice-)?(présidente?) du comité exécutif)?`, 'i');
    const trouve = reste.match(re);
    if (!trouve) continue;
    const role = trouve[2] ? `${trouve[1] ? 'Vice-' : ''}${trouve[2].toLowerCase()} du comité exécutif` : 'Membre du comité exécutif';
    roles.set(cle(nom), majuscule(role));
    reste = reste.replace(re, ' ');
  }
  // Ce qu'on n'a pas su lire : des suites de mots capitalisés, civilités retirées (sinon
  // « Mmes Christine Poirier » masquerait le nom). « Teams » seul n'en est pas une.
  const inconnus = reste.replace(/\b(?:MM\.|Mmes|Mme|M\.)\s*/g, ' ').match(/\b[A-ZÀ-Ý][\p{L}'’-]+(?: [A-ZÀ-Ý][\p{L}'’-]+)+/gu) ?? [];
  return { roles, inconnus };
}

// Le procès-verbal du comité exécutif à lire : le plus récent qui nomme toute la composition,
// sinon le plus récent. Rend { seanceId, date, url, totalite, passage } ou null.
export async function entetePlusRecent(dossier = TEXTES) {
  let fichiers;
  try {
    fichiers = (await readdir(dossier)).filter((f) => /^CE-\d{8}-[A-Z]+-\d{2}h\d{2}_PV\.json$/.test(f)).sort().reverse();
  } catch {
    return null;
  }
  let repli = null;
  for (const f of fichiers) {
    let doc;
    try {
      doc = JSON.parse(await readFile(new URL(f, dossier), 'utf8'));
    } catch {
      continue;
    }
    const entete = enteteComite(doc.texte);
    if (!entete) continue;
    const seanceId = f.replace(/_PV\.json$/, '');
    const date = seanceId.replace(/^CE-(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3');
    const candidat = { seanceId, date, url: doc.url ?? null, ...entete };
    if (entete.totalite) return candidat;
    repli ??= candidat;
  }
  return repli;
}

// ---------- la source : en ligne, sinon la capture ----------

async function lireCapture() {
  try {
    const c = JSON.parse(await readFile(CAPTURE, 'utf8'));
    if (!c?.liste) return null;
    return c;
  } catch {
    return null;
  }
}

// { liste, profils: Map(url -> html), obtenu, avertissements } ; null si rien n'a marché.
export async function lireSource() {
  const avertissements = [];
  try {
    const liste = await texte(PAGE_ELUS, { notFoundIsNull: false, accept: 'text/html' });
    const profils = new Map();
    for (const m of parserListe(liste)) {
      if (!m.profil) continue;
      const html = await texte(m.profil, { accept: 'text/html' });
      if (html) profils.set(m.profil, html);
      else avertissements.push(`Fiche introuvable (404) : ${m.profil}`);
    }
    return { liste, profils, obtenu: 'en ligne', avertissements };
  } catch (err) {
    console.log(err instanceof ErreurBloque || err?.bloque ? `laval.ca refuse le robot (${err.message.split(' — ')[0]}) : lecture de la capture.` : `Page des élus inaccessible (${err.message}) : lecture de la capture.`);
  }
  const capture = await lireCapture();
  if (!capture) return null;
  const profils = new Map();
  for (const p of capture.profils ?? []) {
    if (p.statut === 'ok' && p.html) profils.set(p.url, p.html);
    else avertissements.push(`Fiche absente de la capture (${p.statut ?? 'sans statut'}) : ${p.url}`);
  }
  return { liste: capture.liste, profils, obtenu: capture.capture ?? 'capture manuelle', avertissements };
}

// ---------- assemblage ----------

export function assembler(liste, profils, { entete = null, precedent = null } = {}) {
  const avertissements = [];
  const membres = [];
  for (const carte of liste) {
    const fiche = carte.profil && profils.has(carte.profil) ? parserProfil(profils.get(carte.profil)) : null;
    if (carte.profil && !fiche) avertissements.push(`${carte.nomComplet} : fiche non lue (${carte.profil})`);
    const estMaire = /^Maire/.test(carte.fonction ?? '') || /^Maire/i.test(carte.titre ?? '');
    const districtNumero = carte.districtNumero ?? fiche?.districtNumero ?? null;
    const district = carte.district ?? fiche?.district ?? null;
    if (fiche?.districtNumero && carte.districtNumero && fiche.districtNumero !== carte.districtNumero) {
      avertissements.push(`${carte.nomComplet} : district ${carte.districtNumero} sur la liste, ${fiche.districtNumero} sur la fiche — la liste est retenue`);
    }
    if (!estMaire && !districtNumero) avertissements.push(`${carte.nomComplet} : aucun district reconnu (« ${carte.titre ?? ''} »)`);
    if (!estMaire && !fiche?.parti) avertissements.push(`${carte.nomComplet} : parti non trouvé sur la fiche`);
    const morceaux = carte.nomComplet.split(' ');
    membres.push({
      nom: morceaux.slice(1).join(' ') || carte.nomComplet,
      prenom: morceaux[0],
      nomComplet: carte.nomComplet,
      fonction: carte.fonction ?? fiche?.fonction ?? null,
      districtNumero: estMaire ? null : districtNumero,
      district: estMaire ? null : district,
      arrondissement: null,
      parti: fiche?.parti ?? null,
      roles: [],
      telephone: carte.telephone ?? fiche?.telephone ?? null,
      courriel: carte.courriel ?? null,
      formulaireCourriel: null,
      profil: carte.profil ?? null,
      habitants: fiche?.habitants ?? null,
      biographie: fiche?.biographie ?? null,
      photo: carte.photo ?? fiche?.photo ?? null,
      siegeAuConseilMunicipal: true,
    });
  }

  let rolesSource = null;
  if (entete) {
    const { roles, inconnus } = rolesDepuisEntete(entete.passage, membres);
    for (const m of membres) {
      const role = roles.get(cle(m.nomComplet));
      if (role) m.roles.push(role);
    }
    rolesSource = { seanceId: entete.seanceId, date: entete.date, url: entete.url, compositionComplete: entete.totalite, membresNommes: roles.size };
    if (inconnus.length) avertissements.push(`En-tête du comité exécutif (${entete.seanceId}) : noms non reconnus « ${inconnus.join(' », « ')} »`);
    if (!entete.totalite) avertissements.push(`En-tête du comité exécutif (${entete.seanceId}) : le procès-verbal ne dit pas « formant la totalité des membres » — un membre absent ce jour-là n'a pas de rôle`);
  } else if (precedent?.rolesSource) {
    let repris = 0;
    for (const m of membres) {
      const avant = (precedent.membres ?? []).find((p) => cle(p.nomComplet) === cle(m.nomComplet));
      if (avant?.roles?.length) {
        m.roles.push(...avant.roles);
        repris++;
      }
    }
    rolesSource = { ...precedent.rolesSource, reprisDeLExecutionPrecedente: true };
    avertissements.push(
      `Aucun procès-verbal du comité exécutif dans data/textes/ : les rôles de ${repris} membre(s) sont repris de l'exécution précédente (procès-verbal ${precedent.rolesSource.seanceId}), ils n'ont pas été relus.`
    );
  } else avertissements.push('Aucun procès-verbal du comité exécutif lu dans data/textes/ : rôles au comité exécutif non remplis');

  const partis = {};
  for (const m of membres) if (m.parti) partis[m.parti] = (partis[m.parti] ?? 0) + 1;
  return {
    membres,
    partis: Object.entries(partis)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([nom, n]) => ({ nom, n })),
    rolesSource,
    avertissements,
  };
}

async function main() {
  const source = await lireSource();
  if (!source) {
    let precedent = null;
    try {
      precedent = JSON.parse(await readFile(OUT, 'utf8'));
    } catch {
      // rien à conserver
    }
    if (precedent) {
      console.warn(`⚠ Ni la page en ligne ni la capture data/sources/elus-laval.json : data/elus.json du ${precedent.generatedAt?.slice(0, 10)} conservé.`);
      return;
    }
    throw new Error('Ni la page des élus en ligne, ni la capture data/sources/elus-laval.json, ni un data/elus.json précédent.');
  }
  const liste = parserListe(source.liste);
  if (!liste.length) throw new Error("Aucune carte « municipal-councilor-item » dans la page des élus — le gabarit a changé ?");
  const entete = await entetePlusRecent();
  const precedentPublie = await lireJsonSiPossible(OUT);
  const { membres, partis, rolesSource, avertissements } = assembler(liste, source.profils, { entete, precedent: precedentPublie });
  avertissements.unshift(...source.avertissements);
  if (membres.length !== MEMBRES_ATTENDUS) avertissements.push(`${membres.length} membres au lieu de ${MEMBRES_ATTENDUS} (le maire et 22 districts) — la page a peut-être changé`);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PAGE_ELUS,
    obtenu: source.obtenu,
    nombre: membres.length,
    partis,
    rolesSource,
    avertissements,
    membres,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`${membres.length} membres du conseil municipal écrits dans data/elus.json (${source.obtenu}).`);
  console.log('Partis : ' + (partis.map((p) => `${p.nom} ${p.n}`).join(' · ') || 'aucun'));
  const avecRole = membres.filter((m) => m.roles.length);
  console.log(`Comité exécutif : ${avecRole.map((m) => `${m.nomComplet} (${m.roles.join(', ')})`).join(' ; ') || 'non lu'}${rolesSource ? ` — d'après ${rolesSource.seanceId}` : ''}`);
  for (const nom of ['fonction', 'parti', 'photo', 'habitants', 'biographie', 'courriel', 'telephone']) {
    const sans = membres.filter((m) => m[nom] == null && !(m.fonction?.startsWith('Maire') && ['parti', 'habitants', 'courriel', 'telephone'].includes(nom)));
    if (sans.length) console.log(`Sans ${nom} : ${sans.map((m) => m.nomComplet).join(', ')}`);
  }
  if (avertissements.length) {
    console.log('\n⚠ Avertissements :');
    for (const a of avertissements) console.log('  ' + a);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
