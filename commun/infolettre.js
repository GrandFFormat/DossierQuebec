// « Le compte rendu du mois » : le formulaire d'inscription (accueil des volets) et la boîte de
// Mes dossiers. Les villes offertes viennent du serveur (api/infolettre.js, VILLES_INFOLETTRE) :
// une ville apparaît ici le jour où elle a un compte rendu.

import { session, mesurer, echapper, tr } from './abonnes-client.js';

const etatServeur = async (s) => {
  const r = await fetch('/api/infolettre?action=etat', { headers: s ? { Authorization: `Bearer ${s.access_token}` } : {}, cache: 'no-store' }).catch(() => null);
  return r?.ok ? r.json() : null;
};
const listeNoms = (noms) => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} ${tr('et', 'and')} ${noms.at(-1)}` : noms[0] ?? '');

// Le formulaire public. `ville` : celle du volet, cochée d'avance.
export async function formulaireInfolettre(zone, { ville = null } = {}) {
  if (!zone) return;
  const s = await session().catch(() => null);
  const etat = await etatServeur(s);
  if (!etat?.villes?.length) { zone.hidden = true; return; }
  const villes = etat.villes;
  const deja = villes.filter((v) => etat.inscriptions?.[v.cle] === 'confirme');
  const seule = villes.length === 1;

  if (s && deja.length === villes.length) {
    zone.innerHTML = `<section class="ab-infolettre">
      <h2>📬 ${tr('Le compte rendu du mois', 'The monthly report')}</h2>
      <p>✅ ${tr(`Vous recevez le compte rendu de ${echapper(listeNoms(deja.map((v) => v.nom)))} à ${echapper(etat.courriel)}.`, `You receive the ${echapper(listeNoms(deja.map((v) => v.nom)))} report at ${echapper(etat.courriel)}.`)} <a class="ab-lien" href="/mes-dossiers">${tr('Gérer dans Mes dossiers', 'Manage in My files')}</a></p>
    </section>`;
    zone.hidden = false;
    return;
  }

  zone.innerHTML = `<section class="ab-infolettre">
    <h2>📬 ${tr('Le compte rendu du mois', 'The monthly report')}</h2>
    <p>${tr(
      `Une fois par mois, ce que la Ville${seule ? ` de ${echapper(villes[0].nom)}` : ''} a décidé : les plus gros montants, toutes les subventions et tous les contrats, les votes divisés. Gratuit. <strong>Vous recevez tout de suite le compte rendu du mois dernier.</strong>`,
      `Once a month, what the City${seule ? ` of ${echapper(villes[0].nom)}` : ''} decided: the largest amounts, every grant and contract, split votes. Free. <strong>You get last month's report right away</strong> (in French).`
    )}</p>
    <form class="ab-infolettre-form" novalidate>
      ${seule ? '' : `<fieldset class="ab-infolettre-villes"><legend>${tr('Quelles villes ?', 'Which cities?')}</legend>${villes.map((v) => `<label class="ab-case"><input type="checkbox" name="ville" value="${echapper(v.cle)}"${v.cle === ville || deja.some((d) => d.cle === v.cle) ? ' checked' : ''}> <span>${echapper(v.nom)}</span></label>`).join('')}</fieldset>`}
      <div class="ab-form">
        <input type="email" name="email" required maxlength="200" autocomplete="email" placeholder="${tr('Votre courriel', 'Your email')}" aria-label="${tr('Votre courriel', 'Your email')}" value="${echapper(etat.courriel ?? '')}">
        <input type="text" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true" class="ab-pot-de-miel">
        <button type="submit" class="ab-bouton">${tr('Recevoir le compte rendu', 'Get the report')}</button>
      </div>
    </form>
    <p class="ab-note ab-infolettre-etat" aria-live="polite"></p>
    <p class="ab-note">${tr('Un courriel par mois par ville. Désinscription en un clic dans chaque courriel. Aucune publicité, votre adresse ne sert qu’à ça.', 'One email a month per city. One-click unsubscribe in every email. No ads; your address is used for nothing else.')}</p>
  </section>`;
  zone.hidden = false;

  const form = zone.querySelector('form');
  const etatTexte = zone.querySelector('.ab-infolettre-etat');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const choisies = seule ? [villes[0].cle] : [...form.querySelectorAll('input[name="ville"]:checked')].map((c) => c.value);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { etatTexte.textContent = tr('Entrez une adresse courriel valide.', 'Enter a valid email address.'); return; }
    if (!choisies.length) { etatTexte.textContent = tr('Choisissez au moins une ville.', 'Choose at least one city.'); return; }
    const bouton = form.querySelector('button');
    bouton.disabled = true;
    etatTexte.textContent = tr('Envoi…', 'Sending…');
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=inscrire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(courante ? { Authorization: `Bearer ${courante.access_token}` } : {}) },
      body: JSON.stringify({ email, villes: choisies, site_web: form.site_web.value }),
    }).catch(() => null);
    const donnees = r ? await r.json().catch(() => ({})) : {};
    bouton.disabled = false;
    if (!r?.ok) {
      etatTexte.textContent = r?.status === 429 ? tr('Trop de demandes en ce moment. Réessayez dans une heure.', 'Too many requests right now. Try again in an hour.') : tr('Une erreur est survenue. Réessayez dans un moment.', 'Something went wrong. Try again in a moment.');
      return;
    }
    mesurer('infolettre_inscription', { villes: choisies.join(','), connecte: donnees.confirme ? 'oui' : 'non' });
    etatTexte.innerHTML = donnees.confirme
      ? tr(`<strong>C'est fait.</strong> Le compte rendu le plus récent part vers ${echapper(email)} ; le prochain arrive ${echapper(donnees.prochain ?? '')}.`, `<strong>Done.</strong> The latest report is on its way to ${echapper(email)}; the next one arrives ${echapper(donnees.prochain ?? '')}.`)
      : tr(`<strong>Presque fini :</strong> on vient d'écrire à ${echapper(email)}. Cliquez sur « Confirmer mon inscription » dans ce courriel, et le compte rendu du mois dernier part aussitôt. (Pas reçu ? Regardez dans les indésirables.)`, `<strong>Almost done:</strong> we just emailed ${echapper(email)}. Click “Confirmer mon inscription” in that email and last month's report goes out right away. (Not there? Check your spam folder.)`);
    form.reset();
  });
}

// La boîte de Mes dossiers : une case par ville, pour le compte connecté (adresse déjà vérifiée).
export async function boiteInfolettre(zone, s) {
  if (!zone) return;
  if (!s) { zone.innerHTML = ''; return; }
  const etat = await etatServeur(s);
  if (!etat?.villes?.length) { zone.innerHTML = ''; return; }
  const dessiner = (e, message = '') => {
    zone.innerHTML = `<section class="ab-carte ab-infolettre-boite">
      <h2 style="margin-top:0">📬 ${tr('Le compte rendu du mois', 'The monthly report')}</h2>
      <p class="ab-chapeau" style="margin-bottom:10px">${tr('Une fois par mois, par courriel : les plus gros montants, les subventions, les contrats et les votes divisés de chaque ville cochée. En cochant une ville, vous recevez tout de suite son compte rendu le plus récent.', 'Once a month, by email: the largest amounts, grants, contracts and split votes of each city you check. Check a city to get its latest report right away (in French).')}</p>
      ${e.villes.map((v) => `<label class="ab-case"><input type="checkbox" data-ville="${echapper(v.cle)}"${e.inscriptions?.[v.cle] === 'confirme' ? ' checked' : ''}> <span>${echapper(v.nom)}</span></label>`).join('')}
      <p class="ab-note" aria-live="polite">${message || tr(`Envoyé à ${echapper(e.courriel ?? '')}.`, `Sent to ${echapper(e.courriel ?? '')}.`)}</p>
    </section>`;
  };
  dessiner(etat);
  zone.onchange = async (ev) => {
    const caseVille = ev.target.closest('[data-ville]');
    if (!caseVille) return;
    caseVille.disabled = true;
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courante?.access_token ?? ''}` },
      body: JSON.stringify({ villes: { [caseVille.dataset.ville]: caseVille.checked } }),
    }).catch(() => null);
    const donnees = r?.ok ? await r.json().catch(() => null) : null;
    if (!donnees) {
      caseVille.checked = !caseVille.checked;
      caseVille.disabled = false;
      zone.querySelector('.ab-note').textContent = tr('Impossible pour l’instant. Réessayez dans un moment.', "Couldn't do it right now. Try again in a moment.");
      return;
    }
    const nom = etat.villes.find((v) => v.cle === caseVille.dataset.ville)?.nom ?? '';
    mesurer('infolettre_preferences', { ville: caseVille.dataset.ville, inscrit: caseVille.checked ? 'oui' : 'non' });
    dessiner(donnees, caseVille.checked
      ? tr(`Inscrit au compte rendu de ${echapper(nom)} : le plus récent part vers votre boîte, le prochain arrive ${echapper(donnees.prochain ?? '')}.`, `Subscribed to the ${echapper(nom)} report: the latest one is on its way, the next arrives ${echapper(donnees.prochain ?? '')}.`)
      : tr(`Vous ne recevrez plus le compte rendu de ${echapper(nom)}.`, `You won't receive the ${echapper(nom)} report anymore.`));
  };
}
