// « Représente ta ville » (6 nov. 2026) — formulaire d'intérêt de /represente-ta-ville.
//
//   POST /api/represente
//   { ville, nom, courriel, profil: 'citoyen' | 'organisme' | 'entreprise', message?, site_web? }
//
// Pas de compte requis : on mesure la demande. Le champ site_web est un piège à robots (caché) :
// rempli, on répond 200 sans rien envoyer. Le tout part par courriel (Resend) à MESSAGES_A ;
// « Répondre » écrit directement à la personne.
//
// Variables : RESEND_API_KEY, DIGEST_FROM, MESSAGES_A.

const PROFILS = { citoyen: 'Citoyen·ne', organisme: 'Organisme', entreprise: 'Entreprise (commandite)' };
const COURRIEL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,}$/;

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const propre = (s, max) => String(s ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (b.site_web) return res.status(200).json({ ok: true });

  const m = {
    ville: propre(b.ville, 80),
    nom: propre(b.nom, 120),
    courriel: propre(b.courriel, 200),
    profil: PROFILS[b.profil] ? b.profil : 'citoyen',
    message: propre(b.message, 2000),
  };
  if (!m.ville || !m.nom || !COURRIEL.test(m.courriel)) return res.status(400).json({ ok: false });

  const { RESEND_API_KEY, DIGEST_FROM, MESSAGES_A } = process.env;
  if (!RESEND_API_KEY || !DIGEST_FROM || !MESSAGES_A) return res.status(503).json({ ok: false });

  const ligne = (e, v) => (v ? `<tr><td style="padding:2px 12px 2px 0;vertical-align:top">${e}</td><td style="padding:2px 0">${v}</td></tr>` : '');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.5">
    <table style="font-size:14px;border-collapse:collapse">
      ${ligne('Ville', `<b>${echapper(m.ville)}</b>`)}
      ${ligne('Nom', echapper(m.nom))}
      ${ligne('Courriel', echapper(m.courriel))}
      ${ligne('Profil', PROFILS[m.profil])}
    </table>
    ${m.message ? `<p style="white-space:pre-wrap;margin:16px 0 0">${echapper(m.message)}</p>` : ''}
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: DIGEST_FROM,
        to: MESSAGES_A.split(',').map((a) => a.trim()).filter(Boolean),
        reply_to: m.courriel,
        subject: `[Représentez votre ville] ${m.ville} — ${PROFILS[m.profil]}`,
        html,
      }),
    });
    if (!r.ok) {
      console.error('Resend :', r.status, await r.text());
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend :', e);
    return res.status(502).json({ ok: false });
  }
}
