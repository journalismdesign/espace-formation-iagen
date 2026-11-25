/* Équipe et accès (admin), en deux onglets :
   - « Comptes et accès » (#/admin/equipe) : qui peut entrer dans le back-office, avec quel rôle.
     Admin : gère tout (réglages, habillages, fiches, comptes) et attribue les sessions.
     Formateur·ice : ne voit que les sessions attribuées à sa fiche intervenant·e (adresse de connexion).
   - « Fiches intervenant·es » (#/admin/equipe/fiches[/<id>|/nouveau]) : la présentation de chaque intervenant·e
     (slide « L'intervenant ») et l'adresse de connexion qui relie la fiche à un compte.
   La liste des comptes est tenue côté base (trainer_emails) ; ces écrans passent par des fonctions réservées à l'admin. */
import { $, $$, T, esc, guard } from "../lib/dom.js";
import { trainersListHtml, renderTrainerEditor } from "./trainers.js";

const TABS = [["comptes", "Comptes et accès"], ["fiches", "Fiches intervenant·es"]];
let pendingLogin = null; // adresse à reporter dans une nouvelle fiche ouverte depuis la liste des comptes

export async function viewStaff(root, [tab = "comptes", id], { api, me, go }) {
  if (!TABS.some(([k]) => k === tab)) tab = "comptes";
  const [staff, trainers] = await Promise.all([api.listStaff(), api.listTrainers().catch(() => [])]);
  const ficheOf = (email) => trainers.find((t) => t.login_email === email);
  // Écarts entre les deux listes : un compte formateur·ice sans fiche ne voit aucune session,
  // une fiche dont l'adresse n'est pas autorisée ne donne accès à rien
  const noFiche = staff.filter((s) => !s.is_admin && !ficheOf(s.email));
  const notAllowed = trainers.filter((t) => t.login_email && !staff.some((s) => s.email === t.login_email));
  const flag = (n) => (n ? ` <span class="tab-flag" title="${n} point${n > 1 ? "s" : ""} à régler">${n}</span>` : "");

  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div><div class="kicker-d">Administration</div><h1>Équipe et accès</h1></div></div>
    <div class="phases">${TABS.map(([k, l]) => `<a href="#/admin/equipe${k === "comptes" ? "" : "/" + k}"${k === tab ? ' aria-current="page"' : ""}>${l}${flag(k === "comptes" ? noFiche.length : notAllowed.length)}</a>`).join("")}</div>
    <section id="eqBody"></section>`;
  const box = $("#eqBody", root);

  if (tab === "fiches" && id) {
    await renderTrainerEditor(box, id, { api, go, list: trainers, staff });
    if (id === "nouveau" && pendingLogin) { const i = $("#tLog", box); if (i && !i.value) { i.value = pendingLogin; i.dispatchEvent(new Event("input")); } }
    pendingLogin = null;
    return;
  }

  if (tab === "fiches") {
    box.innerHTML = `
      <div class="eq-head"><p class="muted" style="margin:0">${T("Une fiche présente l'intervenant·e sur la slide « L'intervenant » des écrans de session. Son adresse de connexion la relie à un compte de l'équipe : la personne voit alors les sessions où cette fiche est choisie.")}</p>
        <a class="btn" href="#/admin/equipe/fiches/nouveau">+ Nouvelle fiche</a></div>
      ${trainersListHtml(trainers, staff)}`;
    return;
  }

  box.innerHTML = `
    <p class="muted" style="margin-top:0">${T("Les adresses autorisées à entrer dans le back-office. Une personne de cette liste se connecte sur l'espace formateur avec son adresse (code reçu par e-mail ou Google).")}</p>
    <div class="grid g2 staff-grid">
      <div class="card">
        <h3>Comptes</h3>
        <table class="tbl"><thead><tr><th>Adresse</th><th>Rôle</th><th>Fiche intervenant·e</th><th></th></tr></thead><tbody>
          ${staff.map((s) => { const f = ficheOf(s.email); return `<tr>
            <td><b>${esc(s.email)}</b><div class="small muted">${s.has_account ? "Compte créé" : "Jamais connecté·e"}</div></td>
            <td><select data-role="${esc(s.email)}" aria-label="Rôle de ${esc(s.email)}"${s.email === me.email ? " disabled" : ""}>
              <option value="trainer"${s.is_admin ? "" : " selected"}>Formateur·ice</option><option value="admin"${s.is_admin ? " selected" : ""}>Admin</option></select></td>
            <td class="small">${f ? `<a href="#/admin/equipe/fiches/${f.id}">${T(f.name)}</a>` : s.is_admin ? `<span class="muted">—</span>` : `<span class="tc-access ko">${T("Aucune : ne verra aucune session")}</span><br><button type="button" class="linkbtn small" data-newfiche="${esc(s.email)}">Créer sa fiche</button>`}</td>
            <td class="actions">${s.email === me.email ? `<span class="small muted">vous</span>` : `<button class="iconbtn danger" data-rm="${esc(s.email)}" aria-label="Retirer ${esc(s.email)}" title="Retirer l'accès">✕</button>`}</td>
          </tr>`; }).join("")}
        </tbody></table>
        <form id="addF" style="margin-top:14px">
          <label class="f" for="aMail">Ajouter une adresse</label>
          <div class="askrow"><input type="email" id="aMail" required placeholder="prenom.nom@exemple.fr">
            <select id="aRole" aria-label="Rôle"><option value="trainer">Formateur·ice</option><option value="admin">Admin</option></select>
            <button class="btn" type="submit">Ajouter</button></div>
        </form>
      </div>
      <div class="card">
        <h3>Attribuer une session à un·e formateur·ice</h3>
        <ol class="small" style="padding-left:18px;line-height:1.6">
          <li>${T("Ajoutez son adresse dans « Comptes », avec le rôle « Formateur·ice ».")}</li>
          <li>${T("Dans l'onglet « Fiches intervenant·es », créez ou ouvrez sa fiche et renseignez la même adresse dans « Adresse de connexion ». Le lien « Créer sa fiche » de la liste la remplit pour vous.")}</li>
          <li>${T("Choisissez cette fiche comme intervenant·e de la session : dans la liste des sessions, ou dans les réglages de la session.")}</li>
        </ol>
        <p class="small muted">${T("Le formateur ou la formatrice ne voit alors que ses sessions : réglages de la session, inscriptions, pilotage et suivi. L'attribution, l'habillage, les réglages généraux et les comptes restent à l'administration.")}</p>
        ${notAllowed.length ? `<div class="warn small" style="margin-top:12px"><b>${T(notAllowed.length > 1 ? "Fiches sans compte autorisé :" : "Fiche sans compte autorisé :")}</b> ${notAllowed.map((t) => `<a href="#/admin/equipe/fiches/${t.id}">${T(t.name)}</a> (${esc(t.login_email)})`).join(", ")}. ${T("Ajoutez l'adresse ci-contre pour lui ouvrir ses sessions.")}</div>` : ""}
      </div>
    </div>`;

  const reload = () => viewStaff(root, [tab, id], { api, me, go });
  $("#addF", root).onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#aMail", root).value.trim().toLowerCase();
    if (await guard(async () => { await api.saveStaff(email, $("#aRole", root).value === "admin"); return true; }, `${email} ajouté·e.`)) reload();
  };
  $$("[data-role]", root).forEach((s) => (s.onchange = async () => { await guard(() => api.saveStaff(s.dataset.role, s.value === "admin"), "Rôle mis à jour."); reload(); }));
  $$("[data-rm]", root).forEach((b) => (b.onclick = async () => {
    if (!confirm(`Retirer l'accès de ${b.dataset.rm} ? La personne redevient simple stagiaire ; ses sessions restent attribuées à sa fiche.`)) return;
    await guard(() => api.removeStaff(b.dataset.rm), "Accès retiré."); reload();
  }));
  $$("[data-newfiche]", root).forEach((b) => (b.onclick = () => { pendingLogin = b.dataset.newfiche; go("#/admin/equipe/fiches/nouveau"); }));
}
