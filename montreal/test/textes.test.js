// Le fichier des textes est un cumul, jamais une photo de la mémoire du jour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionnerTextes } from '../scrapers/decisions.js';

test('un jour sans relecture garde les textes de la veille', () => {
  // Hier : une séance relue, ses textes écrits.
  const hier = fusionnerTextes([{ id: 'CM26 0001', seanceId: 'CM_2026-06-15', dispositif: "d'adopter le budget", motifs: 'Vu la recommandation' }], {});
  assert.deepEqual(hier, { 'CM26 0001': { dispositif: "d'adopter le budget", motifs: 'Vu la recommandation' } });

  // Aujourd'hui : rien relu, la décision revient de decisions.json sans ses textes.
  const aujourdhui = fusionnerTextes([{ id: 'CM26 0001', seanceId: 'CM_2026-06-15' }], hier);
  assert.deepEqual(aujourdhui, hier, 'les textes connus survivent à un jour sans nouveauté');
});

test('une séance relue remplace ses textes, même par rien', () => {
  const connus = { 'CM26 0001': { dispositif: 'un vieux dispositif', motifs: null } };
  // Relue, avec un nouveau dispositif.
  assert.deepEqual(fusionnerTextes([{ id: 'CM26 0001', seanceId: 'S', dispositif: 'le nouveau', motifs: null }], connus), { 'CM26 0001': { dispositif: 'le nouveau', motifs: null } });
  // Relue, et le découpage ne trouve plus rien : le vieux texte ne doit pas rester.
  assert.deepEqual(fusionnerTextes([{ id: 'CM26 0001', seanceId: 'S', dispositif: null, motifs: null }], connus), {});
});
