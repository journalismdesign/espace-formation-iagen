/* Cadrage du cas d'usage, en quatre étapes enregistrées au fil de la saisie.
   Aucun appel à un modèle : le cadrage se discute avec le formateur, qui le commente dans le back-office. */
import { $, $$, T, esc, fr, NB, guard, toast, debounce, dateFr } from "../lib/dom.js";
import { profileFields, bindProfileFields } from "./profile.js";
import { STEPS, MODES, OUTIL_CIBLE, SENSIB, VERIF, stepsDone, canValidate } from "./cadrageModel.js";

export async function renderCadrage(body, side, ctx, session, readOnly) {
  const { api, refreshMe } = ctx;
  const sid = session.id;
  let me = ctx.me;
  let project = await api.myProject(sid).catch(() => null);
  let data = structuredClone(project?.data || {});
  let saving = false;

  const persist = debounce(async () => {
    if (readOnly) return;
    data.steps = stepsDone(me, data);
    saving = true; status("Enregistrement…");
    const p = await guard(() => api.saveProject(sid, { data }));
    saving = false;
    if (p) { project = p; status("Enregistré automatiquement"); drawSide(); drawAside(); drawChecks(); }
  }, 800);
  const saveMe = debounce(async (patch) => { if (readOnly) return; me = await guard(() => api.updateMe(patch)) || me; await refreshMe(); data.steps = stepsDone(me, data); drawSide(); drawChecks(); persist(); }, 800);
  const status = (t) => $$("[data-status]").forEach((el) => (el.textContent = fr(t)));

  body.innerHTML = `
    <div class="cad-layout">
      <div>
        <div id="trainerFb"></div>
        <div class="kicker-d">Mon cas d'usage</div>
        <h1 style="margin:4px 0 6px">Préparer votre projet</h1>
        <p class="muted">${T("Quatre étapes, dans l'ordre que vous voulez. Tout est enregistré sur votre compte au fil de la saisie : vous pouvez vous arrêter et reprendre plus tard, avant ou pendant la formation. Le formateur lit votre cadrage et vous fait un retour.")}</p>
        ${readOnly ? `<div class="warn small">${T("Aperçu formateur : la saisie n'est pas enregistrée. Les cadrages des stagiaires se consultent dans le back-office.")}</div>` : ""}
        <div class="cad-progress"><span class="bar"><i id="cadBar"></i></span><b class="small" id="cadState"></b><span class="small muted" data-status>${project ? "Enregistré automatiquement" : ""}</span></div>

        <section class="card cad" data-step="profil"><h3><span class="ck"></span>Votre profil</h3>${profileFields(me)}</section>

        <section class="card cad" data-step="besoin"><h3><span class="ck"></span>Votre idée ou votre besoin</h3>
          <p class="small muted">${T("Si vous avez déjà une idée, décrivez-la. Sinon, décrivez une tâche de votre travail qui vous prend du temps : nous chercherons des pistes ensemble pendant la formation.")}</p>
          <label class="f">Où en êtes-vous ?</label>
          <div class="chips" id="modes">${MODES.map(([k, l]) => `<button type="button" class="chip pick${data.mode === k ? " on" : ""}" data-v="${k}">${T(l)}</button>`).join("")}</div>
          <label class="f" for="cBesoin">Décrivez votre idée ou la tâche concernée</label>
          <textarea id="cBesoin" maxlength="1500" placeholder="${esc("Ex. Je prépare chaque semaine une revue des délibérations du conseil municipal : des PDF de 80 pages que je lis en entier.")}">${esc(data.besoin || "")}</textarea>
          <label class="f" for="cPourqui">Pour qui ? (facultatif)</label>
          <input type="text" id="cPourqui" maxlength="200" placeholder="Vous, votre service, vos lecteur·ices…" value="${esc(data.pourqui || "")}">
        </section>


        <section class="card cad" data-step="retenu"><h3><span class="ck"></span>Le cas retenu</h3>
          <label class="f" for="rTitre">Titre du cas d'usage</label><input type="text" id="rTitre" maxlength="120" value="${esc(data.retenu?.titre || "")}">
          <label class="f" for="rDesc">Description : ce que vous voulez obtenir, à partir de quoi</label><textarea id="rDesc" maxlength="1500">${esc(data.retenu?.description || "")}</textarea>
          <label class="f">Outil visé</label>
          <div class="chips" id="rOutil">${OUTIL_CIBLE.map((o) => `<button type="button" class="chip pick${data.retenu?.outil === o ? " on" : ""}" data-v="${esc(o)}">${T(o)}</button>`).join("")}</div>
          <label class="f" for="rDocs">Documents ou données utilisés (facultatif)</label><input type="text" id="rDocs" maxlength="300" placeholder="Délibérations publiées, rapports publics…" value="${esc(data.retenu?.donnees || "")}">
          <label class="f">Code couleur de ces documents</label>
          <div class="chips" id="rSens">${SENSIB.map(([k, l, d]) => `<button type="button" class="chip pick sens-${k}${data.retenu?.sensibilite === k ? " on" : ""}" data-v="${k}" title="${esc(d)}">${T(l)}</button>`).join("")}</div>
          <div id="sensWarn"></div>
        </section>

        <section class="card cad" data-step="verif"><h3><span class="ck"></span>Points de vigilance</h3>
          <p class="small muted">${T("Trois questions à vous poser avant la formation. Cochez quand c'est fait : le formateur reprendra avec vous ce qui coince.")}</p>
          <div id="verif">${VERIF.map(([k, l]) => `<label class="vcheck"><input type="checkbox" data-vk="${k}"${data.verif?.[k] ? " checked" : ""}${readOnly ? " disabled" : ""}> <span>${T(l)}</span></label>`).join("")}</div>
          <label class="f" for="vPrompt">Votre première consigne (facultatif)</label>
          <textarea id="vPrompt" maxlength="2000" placeholder="${esc("Rôle : … Mission : … Contexte : … Ton : … Format : …")}">${esc(data.verif?.consigne || "")}</textarea>
        </section>
      </div>
      <aside class="cad-aside" id="cadAside"></aside>
    </div>
    <div id="printArea"></div>`;

  // Étape 1 : profil (écrit dans le profil du compte)
  bindProfileFields(body, me, (p) => { me = { ...me, ...p }; drawChecks(); saveMe(p); });

  // Étape 2
  $$("#modes .pick", body).forEach((b) => (b.onclick = () => { data.mode = data.mode === b.dataset.v ? null : b.dataset.v; $$("#modes .pick", body).forEach((x) => x.classList.toggle("on", x.dataset.v === data.mode)); drawChecks(); persist(); }));
  $("#cBesoin", body).oninput = (e) => { data.besoin = e.target.value; drawChecks(); persist(); };
  $("#cPourqui", body).oninput = (e) => { data.pourqui = e.target.value; persist(); };

  // Étape 4
  const ret = () => (data.retenu = data.retenu || {});
  $("#rTitre", body).oninput = (e) => { ret().titre = e.target.value; drawChecks(); drawAside(); persist(); };
  $("#rDesc", body).oninput = (e) => { ret().description = e.target.value; drawChecks(); drawAside(); persist(); };
  $("#rDocs", body).oninput = (e) => { ret().donnees = e.target.value; persist(); };
  const pickOne = (sel, key) => $$(`${sel} .pick`, body).forEach((b) => (b.onclick = () => {
    ret()[key] = ret()[key] === b.dataset.v ? null : b.dataset.v;
    $$(`${sel} .pick`, body).forEach((x) => x.classList.toggle("on", x.dataset.v === ret()[key]));
    drawChecks(); drawSens(); persist();
  }));
  pickOne("#rOutil", "outil"); pickOne("#rSens", "sensibilite");
  const drawSens = () => {
    const s = data.retenu?.sensibilite;
    $("#sensWarn", body).innerHTML = s === "jam" ? `<div class="warn small" style="margin-top:10px">${T("Ces documents ne doivent pas être versés dans un assistant grand public, ni depuis un compte personnel. Choisissez un corpus public pour l'exercice, ou anonymisez.")}</div>` : s === "pre" ? `<p class="small muted" style="margin-top:8px">${T("Remplacez noms, lieux et identifiants par « X », « la commune », « le témoin » avant de les charger.")}</p>` : "";
  };
  drawSens();

  // Étape 4 : points de vigilance
  $$("[data-vk]", body).forEach((c) => (c.onchange = () => { data.verif = { ...(data.verif || {}), [c.dataset.vk]: c.checked }; drawChecks(); persist(); }));
  $("#vPrompt", body).oninput = (e) => { data.verif = { ...(data.verif || {}), consigne: e.target.value }; persist(); };

  // Enregistre immédiatement
  async function flush() {
    if (readOnly) return;
    data.steps = stepsDone(me, data);
    project = await guard(() => api.saveProject(sid, { data })) || project;
  }

  // Coches des étapes et barre de progression
  function drawChecks() {
    const done = stepsDone(me, data);
    $$("section.cad", body).forEach((s) => s.classList.toggle("done", done.includes(s.dataset.step)));
    const pct = Math.round((done.length / STEPS.length) * 100);
    $("#cadBar", body).style.width = pct + "%";
    $("#cadState", body).textContent = project?.status === "validated" ? "Projet validé" : `${done.length}/${STEPS.length} étapes`;
    drawSide(done);
  }
  function drawSide(done = stepsDone(me, data)) {
    if (!side) return;
    side.innerHTML = `<div class="side-label" style="display:flex;justify-content:space-between"><span>Les étapes</span><span>${project?.status === "validated" ? "Projet validé" : `${done.length}/${STEPS.length}`}</span></div>
      <span class="bar thin"><i style="width:${(done.length / STEPS.length) * 100}%"></i></span>
      <ul class="side-steps">${STEPS.map(([k, l]) => `<li class="${done.includes(k) ? "on" : ""}"><a href="#" data-go="${k}"><span class="ring sm${done.includes(k) ? " on" : ""}">${done.includes(k) ? "✓" : ""}</span>${T(l)}</a></li>`).join("")}</ul>
      <p class="small muted" data-status>${saving ? "Enregistrement…" : project ? "Enregistré automatiquement" : ""}</p><a class="small" href="#/">Retour à mon espace</a>`;
    $$("[data-go]", side).forEach((a) => (a.onclick = (e) => { e.preventDefault(); $(`section[data-step="${a.dataset.go}"]`, body)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  }

  // Colonne de droite : résumé, validation, retour formateur
  function drawAside() {
    const done = stepsDone(me, data), validated = project?.status === "validated";
    $("#trainerFb", body).innerHTML = project?.trainer_comment ? `<div class="card fb"><div class="kicker-d">✓ Retour du formateur</div><p style="margin:6px 0 0;white-space:pre-wrap">${T(project.trainer_comment)}</p></div>` : "";
    $("#cadAside", body).innerHTML = `
      <div class="card"><div class="kicker-d">Votre projet</div><h3 style="margin:6px 0">${T(data.retenu?.titre || "Pas encore de titre")}</h3><p class="small muted" style="margin:0">${T(data.retenu?.description || "Le cas retenu s'affichera ici.")}</p></div>
      <div class="card ${validated ? "validated" : ""}">
        <h3 style="margin-top:0">${validated ? "Projet validé" : "Valider mon projet"}</h3>
        <p class="small muted">${validated ? T(`Validé le ${dateFr(project.validated_at, { day: "numeric", month: "numeric", year: "numeric" })}. Vous pouvez encore le modifier ; après une modification importante, validez-le à nouveau.`) : canValidate(done) ? T("Tout est prêt. Le formateur verra votre projet et pourra le commenter.") : T("Il faut le profil, le besoin et le cas retenu pour valider.")}</p>
        <label class="f" for="cQ">Une question pour le formateur (facultatif)</label>
        <textarea id="cQ" maxlength="1000">${esc(project?.question || "")}</textarea>
        <button class="btn" id="cVal" style="margin-top:10px" ${canValidate(done) && !readOnly ? "" : "disabled"}>${validated ? "Valider à nouveau" : "Valider"}</button>
        <button class="btn ghost" id="cPdf" style="margin-top:8px">Télécharger en PDF</button>
      </div>`;
    $("#cVal", body).onclick = async () => {
      data.steps = stepsDone(me, data);
      const p = await guard(() => api.saveProject(sid, { data, status: "validated", validated_at: new Date().toISOString(), question: $("#cQ", body).value.trim() }), "Projet validé : le formateur le verra dans son tableau.");
      if (p) { project = p; drawAside(); drawChecks(); }
    };
    $("#cQ", body).oninput = debounce(async (e) => { if (!readOnly && project) project = await guard(() => api.saveProject(sid, { question: e.target.value.trim() })) || project; }, 900);
    $("#cPdf", body).onclick = printProject;
  }

  function printProject() {
    $("#printArea").innerHTML = `<h1>${T(data.retenu?.titre || "Mon cas d'usage")}</h1>
      <p><b>${T(me.full_name || me.email)}</b> · ${T(me.metier || "")} · ${T(session.title)} · ${T(dateFr(session.date))}</p>
      <h2>Besoin</h2><p>${T(data.besoin || "")}</p>${data.pourqui ? `<p><i>Pour : ${T(data.pourqui)}</i></p>` : ""}
      <h2>Cas retenu</h2><p>${T(data.retenu?.description || "")}</p>
      <p>Outil visé : ${T(data.retenu?.outil || "—")} · Documents : ${T(data.retenu?.donnees || "—")} · Code couleur : ${T(SENSIB.find((s) => s[0] === data.retenu?.sensibilite)?.[1] || "—")}</p>
      ${data.verif?.consigne ? `<h2>Première consigne</h2><div style="white-space:pre-wrap">${T(data.verif.consigne)}</div>` : ""}
      ${project?.trainer_comment ? `<h2>Retour du formateur</h2><p>${T(project.trainer_comment)}</p>` : ""}
      <p style="margin-top:30px;font-size:11px">${T(`Formation « ${session.formation || "Prendre en main les IA génératives"} ».`)}</p>`;
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => document.body.classList.remove("printing"), 500);
  }

  drawAside(); drawChecks();
}
