/* Cadrage du cas d'usage, en cinq étapes enregistrées au fil de la saisie.
   Les pistes et l'analyse sont produites par le modèle via la fonction
   Edge (jamais de clé dans le navigateur) ; elles sont à relire. */
import { $, $$, T, esc, fr, NB, guard, toast, debounce, dateFr } from "../lib/dom.js";
import { profileFields, bindProfileFields } from "./profile.js";
import { STEPS, MODES, OUTIL_CIBLE, SENSIB, stepsDone, canValidate } from "./cadrageModel.js";

const MAX_GEN = 3;

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
        <p class="muted">${T("Cinq étapes, dans l'ordre que vous voulez. Tout est enregistré sur votre compte au fil de la saisie : vous pouvez vous arrêter et reprendre plus tard, avant ou pendant la formation. Les suggestions et l'analyse sont produites par une IA : relisez-les. N'indiquez aucune information sensible (source, document sous embargo, donnée personnelle).")}</p>
        ${readOnly ? `<div class="warn small">${T("Aperçu formateur : la saisie n'est pas enregistrée. Les cadrages des stagiaires se consultent dans le back-office.")}</div>` : ""}
        <div class="cad-progress"><span class="bar"><i id="cadBar"></i></span><b class="small" id="cadState"></b><span class="small muted" data-status>${project ? "Enregistré automatiquement" : ""}</span></div>

        <section class="card cad" data-step="profil"><h3><span class="ck"></span>Votre profil</h3>${profileFields(me)}</section>

        <section class="card cad" data-step="besoin"><h3><span class="ck"></span>Votre idée ou votre besoin</h3>
          <p class="small muted">${T("Si vous avez déjà une idée, décrivez-la. Sinon, décrivez une tâche de votre travail qui vous prend du temps : l'IA vous proposera des pistes.")}</p>
          <label class="f">Où en êtes-vous ?</label>
          <div class="chips" id="modes">${MODES.map(([k, l]) => `<button type="button" class="chip pick${data.mode === k ? " on" : ""}" data-v="${k}">${T(l)}</button>`).join("")}</div>
          <label class="f" for="cBesoin">Décrivez votre idée ou la tâche concernée</label>
          <textarea id="cBesoin" maxlength="1500" placeholder="${esc("Ex. Je prépare chaque semaine une revue des délibérations du conseil municipal : des PDF de 80 pages que je lis en entier.")}">${esc(data.besoin || "")}</textarea>
          <label class="f" for="cPourqui">Pour qui ? (facultatif)</label>
          <input type="text" id="cPourqui" maxlength="200" placeholder="Vous, votre service, vos lecteur·ices…" value="${esc(data.pourqui || "")}">
        </section>

        <section class="card cad" data-step="pistes"><h3><span class="ck"></span>Pistes proposées par l'IA</h3>
          <p class="small muted">Facultatif si votre idée est déjà claire.</p>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn ghost" id="genP" type="button"></button><span class="small muted" id="genLeft"></span></div>
          <div id="pistes" class="grid g3" style="margin-top:12px"></div>
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

        <section class="card cad" data-step="analyse"><h3><span class="ck"></span>Analyse V1 / V2</h3>
          <p class="small muted">${T("Une première analyse (V1) relève la faisabilité, les risques et propose un premier prompt R·M·C·T·F. Ajustez votre cas, puis demandez une seconde analyse (V2).")}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="anaBtn" type="button"></button></div>
          <div id="ana"></div>
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

  // Étape 3 : pistes
  const drawPistes = () => {
    const left = MAX_GEN - (project?.ai_generations || 0);
    $("#genP", body).textContent = (data.pistes || []).length ? "Nouvelles suggestions" : "Proposer des pistes";
    $("#genP", body).disabled = left <= 0 || readOnly;
    $("#genLeft", body).textContent = `${Math.max(0, left)} génération${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}`;
    $("#pistes", body).innerHTML = (data.pistes || []).map((p, i) => `<button type="button" class="piste${data.choix === i ? " on" : ""}" data-i="${i}"><b>${T(p.titre)}</b><span class="small">${T(p.description)}</span><span class="tag">${T((p.niveau || "").toUpperCase())}${p.outil ? " · " + T(p.outil) : ""}${data.choix === i ? " · VOTRE CHOIX" : ""}</span></button>`).join("");
    $$("#pistes .piste", body).forEach((b) => (b.onclick = () => {
      const i = +b.dataset.i, p = data.pistes[i];
      data.choix = data.choix === i ? null : i;
      if (data.choix === i) {
        const r = ret(), empty = !r.titre && !r.description;
        if (empty || confirm("Remplacer le titre et la description du cas retenu par cette piste ?")) {
          r.titre = p.titre; r.description = p.description; if (OUTIL_CIBLE.includes(p.outil)) r.outil = p.outil;
          $("#rTitre", body).value = r.titre; $("#rDesc", body).value = r.description;
          $$("#rOutil .pick", body).forEach((x) => x.classList.toggle("on", x.dataset.v === r.outil));
        }
      }
      drawPistes(); drawChecks(); drawAside(); persist();
    }));
  };
  $("#genP", body).onclick = async () => {
    if (!data.besoin || data.besoin.trim().length < 10) { toast("Décrivez d'abord votre idée ou votre besoin (étape 2).", "ko"); return; }
    const btn = $("#genP", body); btn.disabled = true; btn.textContent = "Génération en cours…";
    await flush();
    const txt = await guard(() => api.ai("pistes", sid, { payload: { metier: me.metier, niveau: me.niveau, outils: me.outils, mode: data.mode, besoin: data.besoin, pourqui: data.pourqui } }));
    if (txt) {
      try {
        const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1));
        data.pistes = arr.slice(0, 3).map((p) => ({ titre: String(p.titre || ""), description: String(p.description || ""), outil: String(p.outil || ""), niveau: String(p.niveau || "") }));
        data.choix = null;
      } catch { toast("Réponse illisible, réessayez.", "ko"); }
    }
    project = (await api.myProject(sid)) || project;
    drawPistes(); drawChecks(); persist();
  };

  // Étape 5 : analyse
  let anaTab = data.analyse?.v2 ? "v2" : "v1";
  const fmtAna = (t) => T(t).replace(/^(FAISABILITÉ|DONNÉES ET RISQUES|PREMIER PROMPT R·M·C·T·F|VÉRIFICATION)/gm, "<b>$1</b>");
  const drawAna = () => {
    const a = data.analyse || {};
    $("#anaBtn", body).textContent = !a.v1 ? "Lancer l'analyse (V1)" : !a.v2 ? "Nouvelle analyse (V2)" : "Refaire l'analyse V2";
    $("#anaBtn", body).disabled = readOnly;
    $("#ana", body).innerHTML = a.v1 ? `
      <div class="subnav" style="margin-top:12px">${["v1", "v2"].filter((k) => a[k]).map((k) => `<button data-a="${k}" aria-pressed="${k === anaTab}">${k.toUpperCase()} · ${new Date(a[k + "_at"] || Date.now()).toLocaleDateString("fr-FR")}</button>`).join("")}</div>
      <div class="analysis">${fmtAna(a[anaTab] || a.v1)}</div>` : "";
    $$("[data-a]", body).forEach((b) => (b.onclick = () => { anaTab = b.dataset.a; drawAna(); }));
  };
  $("#anaBtn", body).onclick = async () => {
    if (!data.retenu?.titre || !data.retenu?.description) { toast("Remplissez d'abord le cas retenu (étape 4).", "ko"); return; }
    const btn = $("#anaBtn", body); btn.disabled = true; btn.textContent = "Analyse en cours…";
    await flush();
    const prev = data.analyse?.v2 || data.analyse?.v1;
    const txt = await guard(() => api.ai("analyse", sid, { payload: { profil: { metier: me.metier, niveau: me.niveau, outils: me.outils }, besoin: data.besoin, retenu: data.retenu, analyse_precedente: prev || null } }));
    if (txt) {
      data.analyse = data.analyse || {};
      const k = data.analyse.v1 ? "v2" : "v1";
      data.analyse[k] = txt; data.analyse[k + "_at"] = new Date().toISOString(); anaTab = k;
    }
    drawAna(); drawChecks(); persist();
  };

  // Enregistre immédiatement (avant un appel à l'IA, qui lit le cadrage)
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
        <p class="small muted">${validated ? T(`Validé le ${dateFr(project.validated_at, { day: "numeric", month: "numeric", year: "numeric" })}. Vous pouvez encore le modifier ; après une nouvelle analyse, validez-le à nouveau.`) : canValidate(done) ? T("Tout est prêt. Le formateur verra votre projet et pourra le commenter.") : T("Il faut le profil, le besoin, le cas retenu et une analyse pour valider.")}</p>
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
    const a = data.analyse || {};
    $("#printArea").innerHTML = `<h1>${T(data.retenu?.titre || "Mon cas d'usage")}</h1>
      <p><b>${T(me.full_name || me.email)}</b> · ${T(me.metier || "")} · ${T(session.title)} · ${T(dateFr(session.date))}</p>
      <h2>Besoin</h2><p>${T(data.besoin || "")}</p>${data.pourqui ? `<p><i>Pour : ${T(data.pourqui)}</i></p>` : ""}
      <h2>Cas retenu</h2><p>${T(data.retenu?.description || "")}</p>
      <p>Outil visé : ${T(data.retenu?.outil || "—")} · Documents : ${T(data.retenu?.donnees || "—")} · Code couleur : ${T(SENSIB.find((s) => s[0] === data.retenu?.sensibilite)?.[1] || "—")}</p>
      ${a.v2 || a.v1 ? `<h2>Analyse ${a.v2 ? "V2" : "V1"}</h2><div style="white-space:pre-wrap">${fmtAna(a.v2 || a.v1)}</div>` : ""}
      ${project?.trainer_comment ? `<h2>Retour du formateur</h2><p>${T(project.trainer_comment)}</p>` : ""}
      <p style="margin-top:30px;font-size:11px">${T("Analyse produite par une IA à partir de votre cadrage : à relire. Formation « Prendre en main les IA génératives ».")}</p>`;
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => document.body.classList.remove("printing"), 500);
  }

  drawPistes(); drawAna(); drawAside(); drawChecks();
}
