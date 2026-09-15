// Les outils d'appel au modèle et de vérification mécanique partagés par les textes rédigés par
// IA du volet (récapitulatifs de projets). Repris tels quels de quebec/scrapers/details-argent.js,
// où ils servent au détail de l'argent — que Lévis n'a pas encore : on ne copie que ces morceaux.

export const MODELE = 'claude-opus-5';

// Le modèle rend parfois les accents échappés dans les valeurs de l'outil ; avec ou sans
// l'antislash (« é » comme « u00e9 »), seulement les plages des accents latins et de la
// ponctuation typographique pour la forme sans antislash.
export function decoder(v) {
  if (typeof v === 'string') {
    return v
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/u(00[89a-fA-F][0-9a-fA-F]|20[0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  if (Array.isArray(v)) return v.map(decoder);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decoder(x)]));
  return v;
}

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Texte comparable : sans accents, sans casse, sans espaces (y compris insécables).
export const compacter = (s) => sansAccents(String(s)).toLowerCase().replace(/[\s  ]/g, '');
// Les nombres d'un texte, sous une forme comparable (« 32 008 799 $ » → « 32008799 »).
export const nombresDe = (s) =>
  (String(s).match(/\d[\d   ]*(?:[,.]\d+)?/g) ?? [])
    .map((t) => t.replace(/[\s  ]/g, '').replace(/[.,]$/, '').replace('.', ','))
    .filter(Boolean);

// Un appel en streaming, réflexion adaptative, outil au schéma strict (non forcé : un outil imposé
// désactive la réflexion).
export async function appeler(client, { system, outil, effort, texte }) {
  const flux = client.beta.messages.stream({
    model: MODELE,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    tools: [outil],
    thinking: { type: 'adaptive' },
    output_config: { effort },
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: texte }],
  });
  const message = await flux.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error('refus du modèle');
  const bloc = message.content.find((b) => b.type === 'tool_use' && b.name === outil.name);
  if (!bloc) throw new Error(`le modèle n'a pas appelé ${outil.name} (${message.stop_reason})`);
  return { entree: decoder(bloc.input), usage: message.usage, modele: message.model };
}
