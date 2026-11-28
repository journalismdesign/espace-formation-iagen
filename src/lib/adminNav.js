/* Navigation du back-office : trois onglets principaux, dans une barre sous le bandeau du haut (header de main.js) :
   - « Studio » : les outils de création, en deux onglets (Création de programmes, Quiz et sondages) ;
   - « Sessions » : sessions à venir et archivées, et chaque session (réglages, pilotage, suivi) ;
   - « Participants et formateurs » (administration) : adresses des stagiaires, comptes et accès, fiches intervenant·es.
   L'engrenage, à droite des onglets, ouvre les réglages généraux (organisme, habillages, entreprises, e-mail).
   Formateur·ices : Sessions seulement. Invité·es : leurs sessions de démo. */
export const MAIN_TABS = [
  ["studio", "Studio", "#/admin/trames"],
  ["sessions", "Sessions", "#/admin"],
  ["participants", "Participants et formateurs", "#/admin/participants"],
];
// Onglet principal de l'adresse en cours (aperçu stagiaire d'une session compris)
export function mainTabOf(h) {
  if (/^#\/admin\/(trames|quiz)\b/.test(h)) return "studio";
  if (/^#\/admin\/(participants|equipe|formateurs)\b/.test(h)) return "participants";
  if (/^#\/admin\/reglages\b/.test(h)) return "reglages";
  if (/^#\/admin\b/.test(h) || /^#\/s\//.test(h)) return "sessions";
  return "";
}

export const STUDIO_TABS = [["trames", "Création de programmes", "#/admin/trames"], ["quiz", "Quiz et sondages", "#/admin/quiz"]];
export const SETTINGS_TABS = [["organisme", "Organisme", "#/admin/reglages/organisme"], ["habillages", "Habillages", "#/admin/reglages/habillages"],
  ["entreprises", "Entreprises clientes", "#/admin/reglages/entreprises"], ["mail", "E-mail stagiaires", "#/admin/reglages/mail"]];
export const PARTICIPANTS_TABS = [["stagiaires", "Stagiaires", "#/admin/participants"],
  ["comptes", "Comptes et accès", "#/admin/equipe"], ["fiches", "Fiches intervenant·es", "#/admin/equipe/fiches"]];

const flagHtml = (n) => (n ? ` <span class="tab-flag" title="${n} point${n > 1 ? "s" : ""} à régler">${n}</span>` : "");
const tabs = (list, cur, flags = {}) => `<div class="phases">${list.map(([k, l, href]) => `<a href="${href}"${k === cur ? ' aria-current="page"' : ""}>${l}${flagHtml(flags[k])}</a>`).join("")}</div>`;
const head = (title, sub) => `<div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>${title}</h1>${sub ? `<p class="muted" style="margin:0;max-width:760px">${sub}</p>` : ""}</div></div>`;

export const studioHead = (cur) => `${head("Studio", "Les outils de création, réutilisables d'une session à l'autre : programmes de 1 à 5 journées, quiz, sondages et nuages de mots.")}
  ${tabs(STUDIO_TABS, cur)}`;
export const settingsHead = (cur) => `${head("Réglages généraux")}${tabs(SETTINGS_TABS, cur)}`;
// Administration seule. flags : points à régler par onglet.
export const participantsHead = (cur, { flags = {} } = {}) => `${head("Participants et formateurs",
  "Adresses des stagiaires, comptes de l'équipe et fiches des intervenant·es.")}
  ${tabs(PARTICIPANTS_TABS, cur, flags)}`;

// Icônes fines (trait), en couleur du texte
export const ICON = {
  expand: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
  shrink: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/></svg>`,
};
