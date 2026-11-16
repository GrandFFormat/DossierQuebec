// Consultations publiques de la Ville de Montréal (16 nov. 2026) → data/consultations.json.
//
// Source : données ouvertes « Événements publics » (donnees.montreal.ca, CC BY 4.0, mises à jour
// chaque jour), lues par l'API CKAN plutôt que par le CSV (le CSV redirige vers une adresse signée).
// On garde les types « Consultation publique » et « Assemblée publique » (assemblées d'urbanisme),
// à venir ou en cours. Une requête par jour, sans IA. Format commun : voir quebec/scrapers/consultations.js.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const RESSOURCE = '6decf611-6f11-4f34-bb36-324d804c9bad';
const API = `https://donnees.montreal.ca/api/3/action/datastore_search?resource_id=${RESSOURCE}&limit=10000`;
const JEU = 'https://donnees.montreal.ca/dataset/evenements-publics';
const TYPES = ['Consultation publique', 'Assemblée publique'];

// Sans User-Agent de navigateur, le portail répond 403.
const res = await fetch(API, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DossierQuebec/1.0; +https://dossierquebec.ca)' } });
if (!res.ok) throw new Error(`Événements publics : HTTP ${res.status}`);
const j = await res.json();
const fiches = j.result?.records ?? [];
if (!fiches.length) throw new Error('Événements publics : aucune ligne (le jeu a changé ?)');

const auj = new Date().toISOString().slice(0, 10);
const jour = (s) => String(s ?? '').slice(0, 10);
const heure = (s) => { const m = /[T ](\d{2}):(\d{2})/.exec(String(s ?? '')); return m && m[0].trim() !== '00:00' && `${m[1]}:${m[2]}` !== '00:00' ? `${Number(m[1])} h${m[2] !== '00' ? ' ' + m[2] : ''}` : null; };

const items = fiches
  .filter((r) => TYPES.includes(r.type_evenement) && jour(r.date_fin || r.date_debut) >= auj)
  .map((r) => {
    const debut = jour(r.date_debut), fin = jour(r.date_fin);
    return {
      id: `${r.url_fiche}|${debut}`,
      titre: String(r.titre).trim(),
      type: r.type_evenement,
      debut, fin: fin && fin !== debut ? fin : null,
      heure: heure(r.date_debut),
      lieu: [r.titre_adresse, r.adresse_principale].filter((x) => x && x !== 'nan').join(', ') || null,
      secteur: r.arrondissement && r.arrondissement !== 'nan' && r.arrondissement !== 'Ville de Montréal' ? r.arrondissement : null,
      url: r.url_fiche,
      annule: /annul/i.test(r.titre),
    };
  })
  .sort((a, b) => a.debut.localeCompare(b.debut));

mkdirSync('data', { recursive: true });
writeFileSync('data/consultations.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: { nom: 'Ville de Montréal, données ouvertes (CC BY 4.0)', url: JEU }, items }, null, 1));
console.log(`Consultations : ${items.length} à venir.`);
