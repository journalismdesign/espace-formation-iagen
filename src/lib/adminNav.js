/* Navigation du back-office (administration) :
   - « Studio » : trames de conducteur et bibliothèque de quiz et sondages, en deux onglets ;
   - « Réglages généraux » (engrenage de la liste des sessions) : organisme, habillages, entreprises, e-mail des
     stagiaires, et l'équipe (comptes et fiches intervenant·es). */
export const STUDIO_TABS = [["trames", "Trames de conducteur", "#/admin/trames"], ["quiz", "Quiz et sondages", "#/admin/quiz"]];
export const SETTINGS_TABS = [["organisme", "Organisme", "#/admin/reglages/organisme"], ["habillages", "Habillages", "#/admin/reglages/habillages"],
  ["entreprises", "Entreprises clientes", "#/admin/reglages/entreprises"], ["mail", "E-mail stagiaires", "#/admin/reglages/mail"], ["equipe", "Équipe et accès", "#/admin/equipe"]];

const tabs = (list, cur) => `<div class="phases">${list.map(([k, l, href]) => `<a href="${href}"${k === cur ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</div>`;

// En-tête commun : retour aux sessions, surtitre, titre, onglets
export const studioHead = (cur) => `<p><a href="#/admin">← Sessions</a></p>
  <div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>Studio</h1>
    <p class="muted" style="margin:0;max-width:760px">Les trames de conducteur et les quiz et sondages, réutilisables d'une session à l'autre.</p></div></div>
  ${tabs(STUDIO_TABS, cur)}`;
export const settingsHead = (cur) => `<p><a href="#/admin">← Sessions</a></p>
  <div class="pagehead"><div><div class="kicker-d">Back-office</div><h1>Réglages généraux</h1></div></div>
  ${tabs(SETTINGS_TABS, cur)}`;

// Icônes fines (trait), en couleur du texte
export const ICON = {
  gear: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/></svg>`,
};
