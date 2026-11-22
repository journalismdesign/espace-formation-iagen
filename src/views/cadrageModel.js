/* Modèle du cadrage (cas d'usage préparé avant la formation) :
   étapes, complétude, préparation globale. Sans affichage. */

export const METIERS = ["Journalisme", "Secrétariat de rédaction", "Édition, vidéo, réseaux sociaux", "Documentation", "Autre"];
export const NIVEAUX = ["Jamais", "Quelques essais", "Usage régulier", "Usage quotidien au travail"];
export const OUTILS = ["ChatGPT", "Claude", "Gemini", "Mistral Le Chat", "Gemini Notebook / NotebookLM", "Perplexity", "Copilot", "Autres"];
export const MODES = [["idee", "J'ai une idée"], ["pistes", "J'ai quelques pistes"], ["suggestions", "Je cherche encore"]];
export const OUTIL_CIBLE = ["Gemini Notebook", "Assistant conversationnel", "Les deux"];
export const SENSIB = [["san", "Sans risque", "Documents publics, articles publiés"], ["pre", "Avec précaution", "Notes et brouillons à anonymiser"], ["jam", "Jamais", "Sources, documents sous embargo, données personnelles"]];

export const STEPS = [
  ["profil", "Profil"],
  ["besoin", "Idée ou besoin"],
  ["retenu", "Cas retenu"],
  ["verif", "Points de vigilance"],
];
// Auto-vérification (sans IA) : trois questions à se poser avant la formation
export const VERIF = [
  ["donnees", "Les documents que je compte utiliser peuvent être versés dans l'outil visé (code couleur vert ou orange anonymisé)."],
  ["controle", "Je sais comment je vérifierai le résultat : sources d'origine, chiffres, citations."],
  ["prompt", "J'ai écrit une première consigne R·M·C·T·F, même imparfaite (ci-dessous)."],
];

export const profileDone = (me) => !!(me?.full_name && me?.metier && me?.niveau);

export function stepsDone(me, data = {}) {
  const d = {
    profil: profileDone(me),
    besoin: !!(data.mode && (data.besoin || "").trim().length >= 10),
    retenu: !!(data.retenu?.titre && data.retenu?.description && data.retenu?.outil),
    verif: VERIF.every(([k]) => data.verif?.[k]),
  };
  return STEPS.map(([k]) => k).filter((k) => d[k]);
}
export const canValidate = (done) => ["profil", "besoin", "retenu"].every((k) => done.includes(k));

// Préparation affichée sur « Mon espace » : profil + cadrage validé
export function preparation(me, project, withCadrage = true) {
  const items = [
    { k: "profil", label: "Compléter mon profil", sub: "Pour personnaliser votre espace", done: profileDone(me) },
    ...(withCadrage ? [{ k: "cadrage", label: "Cadrer mon cas d'usage", sub: "Pour arriver avec un objectif concret", done: project?.status === "validated", started: !!project }] : []),
  ];
  return { items, pct: Math.round((items.filter((i) => i.done).length / items.length) * 100) };
}
