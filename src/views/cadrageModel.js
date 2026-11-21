/* Modèle du cadrage (cas d'usage préparé avant la formation) :
   étapes, complétude, préparation globale. Sans affichage. */

export const METIERS = ["Journalisme", "Secrétariat de rédaction", "Édition, vidéo, réseaux sociaux", "Documentation", "Autre"];
export const NIVEAUX = ["Jamais", "Quelques essais", "Usage régulier", "Usage quotidien au travail"];
export const OUTILS = ["ChatGPT", "Claude", "Gemini", "Mistral Le Chat", "Gemini Notebook / NotebookLM", "Perplexity", "Copilot", "Autres"];
export const MODES = [["idee", "J'ai une idée"], ["pistes", "J'ai quelques pistes"], ["suggestions", "J'aimerais des suggestions"]];
export const OUTIL_CIBLE = ["Gemini Notebook", "Assistant conversationnel", "Les deux"];
export const SENSIB = [["san", "Sans risque", "Documents publics, articles publiés"], ["pre", "Avec précaution", "Notes et brouillons à anonymiser"], ["jam", "Jamais", "Sources, documents sous embargo, données personnelles"]];

export const STEPS = [
  ["profil", "Profil"],
  ["besoin", "Idée ou besoin"],
  ["pistes", "Pistes IA"],
  ["retenu", "Cas retenu"],
  ["analyse", "Analyse V1 / V2"],
];

export const profileDone = (me) => !!(me?.full_name && me?.metier && me?.niveau);

export function stepsDone(me, data = {}) {
  const d = {
    profil: profileDone(me),
    besoin: !!(data.mode && (data.besoin || "").trim().length >= 10),
    pistes: data.mode === "idee" || !!data.choix || (data.pistes || []).length > 0,
    retenu: !!(data.retenu?.titre && data.retenu?.description && data.retenu?.outil),
    analyse: !!data.analyse?.v1,
  };
  return STEPS.map(([k]) => k).filter((k) => d[k]);
}
export const canValidate = (done) => ["profil", "besoin", "retenu", "analyse"].every((k) => done.includes(k));

// Préparation affichée sur « Mon espace » : profil + cadrage validé
export function preparation(me, project) {
  const items = [
    { k: "profil", label: "Compléter mon profil", sub: "Pour personnaliser votre espace", done: profileDone(me) },
    { k: "cadrage", label: "Cadrer mon cas d'usage", sub: "Pour arriver avec un objectif concret", done: project?.status === "validated", started: !!project },
  ];
  return { items, pct: Math.round((items.filter((i) => i.done).length / items.length) * 100) };
}
