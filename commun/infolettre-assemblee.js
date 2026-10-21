// L'inscription à l'infolettre mensuelle de DossierQuébec sur l'Assemblée nationale (21 oct. 2026),
// sur l'accueil : une petite boîte sous « Votre compte ». Même chemin que les courriels des villes
// (POST /api/infolettre?action=inscrire, ville « assemblee ») : un courriel « Confirmer mon
// inscription », puis le dernier numéro (ou un mot qui dit quand part le premier). Mon dossier a la
// case à cocher (commun/infolettre.js). Sans dépendance : l'accueil ne charge pas Supabase pour ça.

const zone = document.getElementById('infolettreAssemblee');
const en = () => document.documentElement.lang === 'en';
const t = (fr, anglais) => (en() ? anglais : fr);
const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let message = '';

function dessiner() {
  if (!zone) return;
  zone.innerHTML = `
    <b class="promo-compte-titre">${t('Recevoir l’infolettre de l’Assemblée', 'Get the National Assembly newsletter')}</b>
    <p class="promo-compte-note" style="margin-top:0">${t('Un courriel au début de chaque mois : les projets de loi, les votes, ce qui a bougé. Gratuit ; on se désinscrit en un clic.', 'One email at the start of each month: the bills, the votes, what moved. Free; one click unsubscribes.')}</p>
    <form class="promo-compte-ligne" novalidate>
      <input type="email" name="email" required maxlength="200" autocomplete="email" placeholder="${t('Votre courriel', 'Your email')}" aria-label="${t('Votre courriel', 'Your email')}">
      <input type="text" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
      <button class="account-btn" type="submit">${t('M’inscrire', 'Subscribe')}</button>
    </form>
    <p class="promo-compte-note" aria-live="polite">${message}</p>`;
  zone.hidden = false;
  zone.querySelector('form').addEventListener('submit', envoyer);
}

async function envoyer(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const email = form.email.value.trim();
  const note = zone.querySelector('[aria-live]');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { note.textContent = t('Entrez une adresse courriel valide.', 'Enter a valid email address.'); return; }
  const bouton = form.querySelector('button');
  bouton.disabled = true;
  note.textContent = t('Envoi…', 'Sending…');
  const r = await fetch('/api/infolettre?action=inscrire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, choix: [{ ville: 'assemblee', type: 'mensuel', langue: 'fr' }], site_web: form.site_web.value }),
  }).catch(() => null);
  bouton.disabled = false;
  if (!r?.ok) {
    note.textContent = r?.status === 429
      ? t('Trop de demandes en ce moment. Réessayez dans une heure.', 'Too many requests right now. Try again in an hour.')
      : t('Une erreur est survenue. Réessayez dans un moment.', 'Something went wrong. Try again in a moment.');
    return;
  }
  message = t(`<strong>Presque fini :</strong> on vient d’écrire à ${echapper(email)}. Cliquez sur « Confirmer mon inscription » dans ce courriel.`,
    `<strong>Almost done:</strong> we just emailed ${echapper(email)}. Click “Confirmer mon inscription” in that email.`);
  dessiner();
}

// Redessinée quand la langue change (dq.js change l'attribut lang de <html>).
if (zone) {
  dessiner();
  new MutationObserver(dessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}
