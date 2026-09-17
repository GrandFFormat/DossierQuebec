import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentsDePage, dateDuDocument, seancesDesDocuments } from '../lib/plateau.js';

const PAGE = `
<table><tr><td>Séance du conseil</td>
<td><a href="/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=odj&amp;doc=17404">Ordre du jour et documents décisionnels [3100 ko]</a></td>
<td><a href='/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&amp;doc=8483'>Procès-verbal</a></td></tr>
<tr><td><a href="/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=odj&amp;doc=17502">Ordre du jour</a></td>
<td><a href="/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&amp;doc=8483">doublon</a></td>
<td><a href="https://ville.montreal.qc.ca/autre.pdf">pas le visualiseur</a></td></tr></table>`;

test('les liens du visualiseur sont résolus contre la page, typés, dédoublonnés', () => {
  const docs = documentsDePage(PAGE);
  assert.deepEqual(
    docs.map((d) => [d.genre, d.doc]),
    [['ODJ', '17404'], ['PV', '8483'], ['ODJ', '17502']]
  );
  assert.equal(docs[1].url, 'https://ville.montreal.qc.ca/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&doc=8483');
});

test('la date et l’heure se lisent dans les premières lignes du procès-verbal', () => {
  const lignes = [
    "Procès-verbal de la séance ordinaire du conseil d'arrondissement",
    'tenue le lundi 6 juillet 2026 à 18 h 30',
    '3933, avenue du Parc-La-Fontaine',
  ];
  assert.deepEqual(dateDuDocument(lignes), { date: '2026-07-06', heure: '18h30', variante: 'ORDI', heureLue: true });
});

test('« 1er », l’heure sur la ligne suivante, et une séance extraordinaire', () => {
  const lignes = ['ORDRE DU JOUR', 'SÉANCE EXTRAORDINAIRE DU MERCREDI 1er AVRIL 2026', 'à 9 h', 'CA26 25 0001'];
  assert.deepEqual(dateDuDocument(lignes), { date: '2026-04-01', heure: '09h00', variante: 'EXTRA', heureLue: true });
});

test('sans heure lisible, l’heure du conseil ; sans date, rien', () => {
  assert.deepEqual(dateDuDocument(['Ordre du jour du 8 septembre 2026', '465, avenue du Mont-Royal Est']), {
    date: '2026-09-08', heure: '18h30', variante: 'ORDI', heureLue: false,
  });
  assert.equal(dateDuDocument(['Ordre du jour', 'CA26 25 0172']), null);
});

test('un numéro de résolution ou d’adresse n’est pas une heure', () => {
  const lignes = ['Procès-verbal de la séance du 6 juillet 2026', '3933, avenue du Parc-La-Fontaine', 'CA26 25 0172'];
  assert.equal(dateDuDocument(lignes).heure, '18h30');
  assert.equal(dateDuDocument(lignes).heureLue, false);
});

test('ordre du jour et procès-verbal d’une même date font une seule séance, à l’heure du PV', () => {
  const s = seancesDesDocuments(
    [
      { genre: 'ODJ', doc: '17404', url: 'u-odj', date: '2026-07-06', heure: '18h30', variante: 'ORDI', heureLue: false },
      { genre: 'PV', doc: '8483', url: 'u-pv', date: '2026-07-06', heure: '18h30', variante: 'ORDI', heureLue: true },
      { genre: 'ODJ', doc: '17502', url: 'u-odj2', date: '2026-09-08', heure: '18h30', variante: 'ORDI', heureLue: false },
      { genre: 'PV', doc: '1', url: 'vieux', date: '2025-12-01', heure: '19h00', variante: 'ORDI', heureLue: true },
    ],
    { annee: 2026 }
  );
  assert.deepEqual(s.map((x) => x.id), ['CA_Pmr_2026-07-06_18h30', 'CA_Pmr_2026-09-08_18h30']);
  assert.deepEqual(s[0].documents, { ODJ: 'u-odj', PV: 'u-pv' });
  assert.equal(s[0].preuve, 'u-pv');
  assert.equal(s[1].documents.PV, undefined);
  assert.equal(s[0].arrondissement, 'Le Plateau-Mont-Royal');
  assert.equal(s[0].nomInstance, "Conseil d'arrondissement du Plateau-Mont-Royal");
});

import { nomConseil, corrigerNomConseil } from '../lib/mtl.js';
test('l’article du nom d’arrondissement se contracte', () => {
  assert.equal(nomConseil('Le Plateau-Mont-Royal'), "Conseil d'arrondissement du Plateau-Mont-Royal");
  assert.equal(nomConseil('Le Sud-Ouest'), "Conseil d'arrondissement du Sud-Ouest");
  assert.equal(nomConseil("L'Île-Bizard–Sainte-Geneviève"), "Conseil d'arrondissement de L'Île-Bizard–Sainte-Geneviève");
  assert.equal(nomConseil('Verdun'), "Conseil d'arrondissement de Verdun");
  assert.equal(corrigerNomConseil("Procès-verbal — Conseil d'arrondissement de Le Sud-Ouest, séance"), "Procès-verbal — Conseil d'arrondissement du Sud-Ouest, séance");
  assert.equal(corrigerNomConseil(null), null);
});
