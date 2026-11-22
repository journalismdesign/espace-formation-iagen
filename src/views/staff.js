/* Équipe et accès (admin) : qui peut entrer dans le back-office, avec quel rôle.
   - Admin : gère tout (réglages, habillages, fiches, comptes) et attribue les sessions.
   - Formateur·ice : ne voit que les sessions attribuées à sa fiche intervenant·e (adresse de connexion).
   La liste est tenue côté base (trainer_emails) ; ces écrans passent par des fonctions réservées à l'admin. */
import { $, $$, T, esc, guard } from "../lib/dom.js";

export async function viewStaff(root, _p, { api, me, go }) {
  const [staff, trainers] = await Promise.all([api.listStaff(), api.listTrainers().catch(() => [])]);
  root.innerHTML = `
    <p><a href="#/admin">← Sessions</a></p>
    <div class="pagehead"><div><div class="kicker-d">Administration</div><h1>Équipe et accès</h1>
      <p class="muted">${T("Les adresses autorisées à entrer dans le back-office. Une personne de cette liste se connecte sur l'espace formateur avec son adresse (code reçu par e-mail ou Google).")}</p></div></div>
    <div class="grid g2 staff-grid">
      <div class="card">
        <h3>Comptes</h3>
        <table class="tbl"><thead><tr><th>Adresse</th><th>Rôle</th><th>Fiche intervenant·e</th><th></th></tr></thead><tbody>
          ${staff.map((s) => `<tr>
            <td><b>${esc(s.email)}</b><div class="small muted">${s.has_account ? "Compte créé" : "Jamais connecté·e"}</div></td>
            <td><select data-role="${esc(s.email)}" aria-label="Rôle de ${esc(s.email)}"${s.email === me.email ? " disabled" : ""}>
              <option value="trainer"${s.is_admin ? "" : " selected"}>Formateur·ice</option><option value="admin"${s.is_admin ? " selected" : ""}>Admin</option></select></td>
            <td class="small">${s.trainer_name ? T(s.trainer_name) : `<span class="muted">${s.is_admin ? "—" : "Aucune : ne verra aucune session"}</span>`}</td>
            <td class="actions">${s.email === me.email ? `<span class="small muted">vous</span>` : `<button class="iconbtn danger" data-rm="${esc(s.email)}" aria-label="Retirer ${esc(s.email)}" title="Retirer l'accès">✕</button>`}</td>
          </tr>`).join("")}
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
          <li>${T("Ajoutez son adresse ici, avec le rôle « Formateur·ice ».")}</li>
          <li>${T("Dans « Formateurs », créez ou ouvrez sa fiche et renseignez la même adresse dans « Adresse de connexion ».")}</li>
          <li>${T("Choisissez cette fiche comme intervenant·e de la session : dans la liste des sessions, ou dans les réglages de la session.")}</li>
        </ol>
        <p class="small muted">${T("Le formateur ou la formatrice ne voit alors que ses sessions : réglages de la session, inscriptions, pilotage et suivi. L'attribution, l'habillage, les réglages généraux et les comptes restent à l'administration.")}</p>
        <h4 style="margin:14px 0 6px">Fiches intervenant·es</h4>
        <ul class="small" style="padding-left:18px;margin:0">${trainers.map((t) => `<li><a href="#/admin/formateurs/${t.id}">${T(t.name)}</a> · ${t.login_email ? esc(t.login_email) : `<span class="muted">sans adresse de connexion</span>`}</li>`).join("") || `<li class="muted">Aucune fiche.</li>`}</ul>
      </div>
    </div>`;

  const reload = () => viewStaff(root, _p, { api, me, go });
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
}
