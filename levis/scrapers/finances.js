// Budget et taxes de la Ville de Lévis (copie de quebec/scrapers/finances.js), d'après le rapport financier des municipalités publié par le
// ministère des Affaires municipales et de l'Habitation (MAMH) sur Données Québec (CC BY 4.0).
//
//   node scrapers/finances.js
//
// Deux fichiers du MAMH, une ligne par municipalité, une colonne par poste du rapport financier :
//   - « Données prévisionnelles » de l'année en cours : les taux de taxes et les tarifs fixes ;
//   - « Données réelles » de la dernière année auditée : les dépenses réelles par service.
// Chaque fichier vient avec sa « Description des postes », qui dit ce que veut dire chaque code.
// On retrouve les postes par leur libellé, pas par un code écrit en dur : le MAMH peut renuméroter.
//
// Recoupé le 12 nov. 2026 avec la page Taxes foncières de la Ville de Lévis : 0,6361 $/100 $ résidentiel,
// eau 264 $, assainissement 189 $, déchets 208 $ — identiques. La taxe de secteur aqueduc-égout
// (0,04869 $/100 $, seulement dans les secteurs desservis) n'est pas dans le calculateur.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const VILLE = 'Lévis';
const COD_GEO = '25213';
const API = 'https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=rapport-financier-des-organismes-municipaux-et-autres-documents';
const UA = { 'User-Agent': 'DossierQuebec/1.0 (+https://dossierquebec.ca/levis/)' };

function csv(texte) {
  const lignes = [];
  let ligne = [], champ = '', guillemets = false;
  texte = texte.replace(/^﻿/, '');
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); ligne = []; champ = ''; }
    else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

const lire = async (url) => {
  const rep = await fetch(encodeURI(decodeURI(url)), { headers: UA });
  if (!rep.ok) throw new Error(`${url} : HTTP ${rep.status}`);
  return csv(await rep.text());
};

// Les ressources du jeu : on prend l'année la plus récente de chaque sorte.
const ressources = (await (await fetch(API, { headers: UA })).json()).result.resources;
const plusRecente = (motif) => ressources
  .map((r) => ({ r, an: (r.name.match(motif) || [])[1] }))
  .filter((x) => x.an)
  .sort((a, b) => b.an - a.an)[0];
const prevSimple = plusRecente(/^Données prévisionnelles non auditées (\d{4}),? Simple/i);
const prevDesc = ressources.find((r) => new RegExp(`prévisionnelles non auditées ${prevSimple.an},? Description`, 'i').test(r.name));
const reelSimple = plusRecente(/^Données réelles (\d{4}),? Simple/i);
const reelDesc = ressources.find((r) => new RegExp(`réelles ${reelSimple.an},? Description`, 'i').test(r.name));
if (!prevDesc || !reelDesc) throw new Error('Description des postes introuvable au MAMH.');

// Libellé et facettes de chaque code, puis la ligne de la Ville.
async function jeu(simple, desc) {
  const d = await lire(desc.url);
  const libelle = new Map(d.slice(1).map((x) => [x[0], { sujet: x[2] || '', facettes: x[3] || '' }]));
  const s = await lire(simple.r.url);
  const entetes = s[0];
  const ligne = s.find((x) => x[0] === COD_GEO && x[1] === VILLE);
  if (!ligne) throw new Error(`${VILLE} absente de ${simple.r.name}.`);
  return entetes.map((code, i) => ({ code, valeur: ligne[i], ...(libelle.get(code) || { sujet: '', facettes: '' }) }));
}

const nombre = (v) => (v === '' || v == null ? null : Number(v));

// 1. TAUX ET TARIFS (prévisionnel de l'année en cours)
const prev = await jeu(prevSimple, prevDesc);
const tauxDe = (categorie) => {
  // Le même libellé revient pour la base (A), le taux (B) et le revenu (C) : la 5e lettre du code le dit.
  const p = prev.find((x) => x.code[4] === 'B' && /Taxe foncière générale - Taux variés/.test(x.sujet) && x.sujet.includes(categorie) && x.valeur);
  return p ? nombre(p.valeur) : null;
};
const tarif = (service) => {
  const p = prev.find((x) => /Compensations et tarification pour services municipaux résidentiels \(montant fixe\)/.test(x.sujet) && x.sujet.endsWith(service) && x.valeur);
  return p ? nombre(p.valeur) : null;
};
const taxes = {
  annee: Number(prevSimple.an),
  residentiel: tauxDe('Résiduelle'),
  nonResidentiel: tauxDe('Immeubles non résidentiels'),
  // Lévis n'a pas de tarif « Égout » : son « Assainissement » (189 $ en 2026) est classé par le MAMH sous
  // « Traitement des eaux usées » (recoupé avec la page Taxes foncières de la Ville, 12 nov. 2026).
  tarifs: { eau: tarif('Eau'), egout: tarif('Égout') ?? tarif('Traitement des eaux usées'), matieres: tarif('Matières résiduelles') },
};
if (!taxes.residentiel) throw new Error('Taux résidentiel introuvable : le MAMH a peut-être changé ses libellés.');

// 2. DÉPENSES RÉELLES PAR SERVICE (dernière année auditée)
const reel = await jeu(reelSimple, reelDesc);
const FACETTE = /Exercice en cours - Réalisations - Administration municipale - Intégral - Sans ventilation de l'amortissement/;
const charges = reel
  .filter((x) => FACETTE.test(x.facettes) && /^Analyse des charges - /.test(x.sujet) && x.valeur !== '')
  .map((x) => ({ chemin: x.sujet.replace(/^Analyse des charges - /, ''), montant: nombre(x.valeur) }));
const total = charges.find((x) => x.chemin.startsWith('Total des charges sans amortissement'))?.montant;
const services = charges
  .filter((x) => !/\(sommaire\)|^Total|^Amortissement/.test(x.chemin))
  .map((x) => ({ niveaux: x.chemin.split(' - '), montant: x.montant }));
// Les grands services (premier niveau) et, sous chacun, ses postes de deuxième niveau.
const arbre = services
  .filter((x) => x.niveaux.length === 1)
  .map((g) => ({
    nom: g.niveaux[0],
    montant: g.montant,
    postes: services
      .filter((x) => x.niveaux.length === 2 && x.niveaux[0] === g.niveaux[0])
      .map((x) => ({ nom: x.niveaux[1], montant: x.montant })),
  }));
// Quelques postes fins que les gens cherchent, quel que soit leur niveau.
const fin = (suffixe) => services.find((x) => x.niveaux.join(' - ').endsWith(suffixe))?.montant ?? null;
const vedettes = {
  police: fin('Sécurité publique - Police'),
  neige: fin('Réseau routier - Enlèvement de la neige'),
  transportCommun: fin('Transport collectif - Transport en commun'),
  eauEgout: fin('Hygiène du milieu - Eau et égout'),
  matieres: fin('Hygiène du milieu - Matières résiduelles'),
  interets: fin('Dette à long terme - Intérêts'),
};
const somme = arbre.reduce((s, g) => s + (g.montant || 0), 0);
if (total && Math.abs(somme - total) > 1000) console.warn(`⚠ Finances : la somme des services (${somme}) diffère du total (${total}).`);

writeFileSync('data/finances.json', JSON.stringify({
  source: "Rapport financier des organismes municipaux, ministère des Affaires municipales et de l'Habitation, Données Québec (CC BY 4.0)",
  ville: VILLE,
  extraction: new Date().toISOString(),
  taxes,
  depenses: { annee: Number(reelSimple.an), total, services: arbre, vedettes },
}));
console.log(`Finances : taux ${taxes.annee} (${taxes.residentiel} $/100 $), dépenses réelles ${reelSimple.an} (${(total / 1e6).toFixed(1)} M$).`);
