// Parler au modèle, et vérifier ce qu'il rend. Copié de quebec/scrapers/details-argent.js :
// les volets sont indépendants, on ne s'importe pas l'un l'autre.
//
// Deux outils de contrôle qui ne demandent aucune intelligence, et c'est leur force :
//   compacter  ramène un texte à ses lettres et chiffres, sans accents ni espaces, pour que
//              « 349 367 000 $ » et « 349 367 000 $ » se retrouvent ;
//   nombresDe  sort tous les nombres d'un texte — c'est avec eux qu'on vérifie qu'un
//              récapitulatif ne cite aucun chiffre absent de ses sources.

export const MODELE = 'claude-opus-5';
export const TARIF = { entree: 5, sortie: 25 }; // $ US par million de jetons

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const compacter = (s) => sansAccents(String(s)).toLowerCase().replace(/[\s  ]/g, '');
export const nombresDe = (s) =>
  (String(s).match(/\d[\d   ]*(?:[,.]\d+)?/g) ?? [])
    .map((t) => t.replace(/[\s  ]/g, '').replace(/[.,]$/, '').replace('.', ','))
    .filter(Boolean);

export async function appeler(client, { system, outil, effort, texte }) {
  const flux = client.beta.messages.stream({
    model: MODELE,
    max_tokens: 64000,
    // Repli côté serveur si le modèle décline : rien de sensible dans un procès-verbal, mais
    // un refus ne doit pas faire tomber le rafraîchissement.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    tools: [outil],
    // Pas d'appel forcé : un outil imposé désactive la réflexion. Le schéma strict garantit
    // les champs.
    thinking: { type: 'adaptive' },
    output_config: { effort },
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: texte }],
  });
  const message = await flux.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error('refus du modèle');
  const bloc = message.content.find((b) => b.type === 'tool_use' && b.name === outil.name);
  if (!bloc) throw new Error(`le modèle n'a pas appelé ${outil.name} (${message.stop_reason})`);
  return { entree: bloc.input, usage: message.usage, modele: message.model };
}
