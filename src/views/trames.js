/* Trames de conducteur (#/admin/trames, administration) : liste, puis éditeur (#/admin/trames/<id> ou /nouvelle).
   L'éditeur, en trois colonnes :
   - palette : blocs (séquences, pause), quiz et sondages de la bibliothèque, slides du support (tuiles numérotées
     et aperçu de la slide choisie) ;
   - journées (1 à 5) : émargement, matinée, déjeuner (heure modifiable, 12 h 30 par défaut), émargement de
     l'après-midi, après-midi, fin de la journée ou de la formation. Ces temps forts restent fixes ; les séquences se
     glissent entre eux et leurs horaires se recalculent (src/lib/trame.js) ;
   - inspecteur de la séquence choisie : type, titre, description, durée, slides, activités en salle, quiz en
     autonomie, outil, objectifs, points clés, questions, exercice.
   Tout se fait au glisser-déposer ; chaque geste a aussi un bouton (clavier, tablette). Import et export .md au
   format du conducteur (src/lib/conducteur.js). Brouillon automatique dans le stockage local. */
import { $, $$, T, esc, guard, toast, download, debounce } from "../lib/dom.js";
import { D1, D2, QUIZ } from "../data.js";
import { parsePages, formatPages, slideEmbedUrl, deckId, DECK_PAGES, DEFAULT_DECK_ID } from "../deck.js";
import { parseConducteur, conducteurMarkdown } from "../lib/conducteur.js";
import { typeLabel, TOOL_LABELS } from "../lib/content.js";
import {
  fromProgramme, toProgramme, timeline, moveItem, addItem, updateItem, removeItem, duplicateItem, updateDay, addDay, removeDay,
  find, pagesUsage, blankTrame, BLOCKS, MAX_DAYS,
} from "../lib/trame.js";

const BASE = "#/admin/trames";
const MIG = "Trames pas encore activées : la migration 20261129010000_trames.sql doit être exécutée dans Supabase.";
const DRAFT = (id) => `iagen-draft:trame:${id}`;
const hfr = (t) => String(t || "").slice(0, 5).replace(/^0/, "").replace(":", " h ");
const durTxt = (n) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${String(n % 60).padStart(2, "0")}` : ""}` : `${n} min`);
const lines = (a) => (a || []).join("\n");
const unlines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const countSeq = (c) => (c?.modules || []).filter((m) => m.type !== "pause").length;
const when = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export async function viewTrames(root, [id], ctx) {
  const { api, go } = ctx;
  const [list, bank] = await Promise.all([api.listTrames().catch(() => ({ ready: false, items: [] })), api.listBank().catch(() => ({ ready: false, items: [] }))]);
  if (id) return editor(root, id, list, bank, ctx);

  root.innerHTML = `
    <div class="pagehead"><div><a href="#/admin" class="small">← Sessions</a><h1 style="margin:4px 0">Trames de conducteur</h1>
      <p class="muted" style="margin:0;max-width:760px">${T("Des déroulés réutilisables, de une à cinq journées : séquences, slides, quiz et sondages. Construisez-les ici au glisser-déposer, puis appliquez-les à une session dans ses réglages (Conducteur).")}</p></div>
      ${list.ready ? `<div class="head-actions">
        <a class="btn" href="${BASE}/nouvelle">+ Nouvelle trame</a>
        <button class="btn ghost" type="button" data-from="1">À partir du déroulé d'une journée</button>
        <button class="btn ghost" type="button" data-from="2">… de deux journées</button>
        <label class="btn ghost" style="cursor:pointer">Importer un .md<input type="file" id="trImp" accept=".md,.markdown,.txt" hidden></label></div>` : ""}</div>
    ${list.ready ? "" : `<div class="warn small" style="margin-bottom:14px">${T(MIG)}</div>`}
    <div class="card table-card">${list.items.length ? `<table class="tbl"><thead><tr><th>Trame</th><th>Journées</th><th>Séquences</th><th>Modifiée</th><th></th></tr></thead><tbody>
      ${list.items.map((t) => `<tr><td><a href="${BASE}/${t.id}"><b>${T(t.titre)}</b></a>${t.content?.formation ? `<div class="small muted">${T(t.content.formation)}</div>` : ""}</td>
        <td>${t.content?.nDays || 1}</td><td>${countSeq(t.content)}</td><td class="small muted">${when(t.updated_at)}</td>
        <td class="actions"><button class="iconbtn" data-exp="${t.id}" title="Exporter en .md" aria-label="Exporter « ${esc(t.titre)} » en .md">⤓</button><button class="iconbtn" data-dup="${t.id}" title="Dupliquer" aria-label="Dupliquer « ${esc(t.titre)} »">⧉</button><button class="iconbtn danger" data-del="${t.id}" title="Supprimer" aria-label="Supprimer « ${esc(t.titre)} »">✕</button></td></tr>`).join("")}
      </tbody></table>` : `<p class="empty">${T(list.ready ? "Aucune trame pour l'instant. Créez la première, ou partez du déroulé par défaut." : "Les trames apparaîtront ici une fois la migration exécutée.")}</p>`}</div>`;

  const byId = (x) => list.items.find((t) => t.id === x);
  const create = async (titre, content) => { const row = await guard(() => api.saveTrame({ titre, content }), "Trame créée."); if (row) go(`${BASE}/${row.id}`); };
  $$("[data-from]", root).forEach((b) => (b.onclick = () => {
    const two = b.dataset.from === "2";
    create(two ? "Deux journées (déroulé par défaut)" : "Une journée (déroulé par défaut)", toProgramme(fromProgramme({ formation: "Prendre en main les IA génératives", nDays: two ? 2 : 1, modules: two ? D2 : D1, slides_url: `https://docs.google.com/presentation/d/${DEFAULT_DECK_ID}/edit`, slides_n: DECK_PAGES.length })));
  }));
  if ($("#trImp", root)) $("#trImp", root).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 300000) return toast("Fichier trop lourd (300 ko au plus).", "ko");
    const r = parseConducteur(await f.text(), knownOf(bank));
    if (r.errors.length) return toast(`Import impossible : ${r.errors[0]}`, "ko");
    if (r.warnings.length) toast(`${r.warnings.length} remarque(s) : ${r.warnings[0]}`, "");
    create(r.programme.formation || f.name.replace(/\.(md|markdown|txt)$/i, ""), toProgramme(fromProgramme(r.programme)));
  };
  $$("[data-exp]", root).forEach((b) => (b.onclick = () => exportMd(byId(b.dataset.exp).titre, fromProgramme(byId(b.dataset.exp).content))));
  $$("[data-dup]", root).forEach((b) => (b.onclick = () => { const t = byId(b.dataset.dup); create(`${t.titre} (copie)`.slice(0, 120), JSON.parse(JSON.stringify(t.content))); }));
  $$("[data-del]", root).forEach((b) => (b.onclick = async () => {
    const t = byId(b.dataset.del);
    if (!confirm(`Supprimer la trame « ${t.titre} » ?\nLes sessions où elle a été appliquée gardent leur déroulé.`)) return;
    if (await guard(() => api.deleteTrame(t.id).then(() => true), "Trame supprimée.")) go(BASE);
  }));
}

// Clés acceptées à l'import (« quiz: », « activité: ») : celles de la bibliothèque
const knownOf = (bank) => ({ quizzes: bank.items.filter((b) => b.kind === "quiz").map((b) => b.id), live: bank.items.filter((b) => b.kind !== "quiz").map((b) => b.id) });
function exportMd(titre, model) {
  const p = toProgramme(model);
  download(`trame-${String(titre).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "conducteur"}.md`,
    conducteurMarkdown(p.modules, { formation: p.formation, days: p.days, slides_url: p.slides_url, slides_n: p.slides_n }), "text/markdown;charset=utf-8");
}

/* ======================================================================= Éditeur */
function editor(root, id, list, bank, { api, go }) {
  const isNew = id === "nouvelle";
  const row = isNew ? null : list.items.find((t) => t.id === id);
  if (!isNew && !row) { root.innerHTML = `<div class="card"><h2>Trame introuvable</h2><p class="muted">Elle a peut-être été supprimée.</p><a class="btn" href="${BASE}">Trames</a></div>`; return; }
  if (!list.ready) { root.innerHTML = `<div class="warn">${T(MIG)}</div>`; return; }

  // État : titre de la trame + modèle ; brouillon repris s'il existe
  let titre = row?.titre || "Nouvelle trame", model = row ? fromProgramme(row.content) : blankTrame("Prendre en main les IA génératives");
  let saved = JSON.stringify({ titre, model }), sel = null, dirty = false, palette = "blocs", preview = 0, filter = "";
  try { const d = JSON.parse(localStorage.getItem(DRAFT(id)) || "null"); if (d?.model?.days?.length && JSON.stringify(d) !== saved) { ({ titre, model } = d); dirty = true; } } catch {}
  const bankById = new Map(bank.items.map((b) => [b.id, b]));
  const actTitle = (k) => bankById.get(k)?.titre || QUIZ[k]?.titre || k;
  const actKind = (k) => bankById.get(k)?.kind || (QUIZ[k] ? "quiz" : "poll");
  const KIND_LABEL = { quiz: "Quiz", poll: "Sondage", cloud: "Nuage" };

  const keepDraft = debounce(() => { try { localStorage.setItem(DRAFT(id), JSON.stringify({ titre, model })); } catch {} }, 400);
  const change = (m, select) => { model = m; if (select !== undefined) sel = select; dirty = JSON.stringify({ titre, model }) !== saved; keepDraft(); draw(); };

  root.innerHTML = `
    <div class="pagehead tr-head"><div style="flex:1;min-width:0"><a href="${BASE}" class="small">← Trames</a>
      <input class="tr-title" id="trT" maxlength="120" value="${esc(titre)}" aria-label="Titre de la trame">
      <input class="tr-formation" id="trF" maxlength="140" value="${esc(model.formation)}" placeholder="Intitulé de la formation" aria-label="Intitulé de la formation"></div>
      <div class="head-actions"><span class="small muted" id="trState"></span>
        <label class="btn ghost sm" style="cursor:pointer">Importer .md<input type="file" id="trImp2" accept=".md,.markdown,.txt" hidden></label>
        <button class="btn ghost sm" id="trExp" type="button">Exporter .md</button>
        <button class="btn" id="trSave" type="button">Enregistrer</button></div></div>
    <div class="tr-grid">
      <aside class="tr-palette card" id="trPal"></aside>
      <section class="tr-days" id="trDays" aria-label="Journées"></section>
      <aside class="tr-insp card" id="trInsp"></aside>
    </div>`;
  const pal = $("#trPal", root), days = $("#trDays", root), insp = $("#trInsp", root);

  /* ---------- Journées ---------- */
  function cardHtml(m, t) {
    const pages = parsePages(m.pages), acts = m.acts || [];
    return `<article class="tr-card t-${m.type}${sel === m.id ? " on" : ""}" draggable="true" data-id="${esc(m.id)}" tabindex="0" aria-label="${esc(`${m.titre}, ${hfr(t[0])} à ${hfr(t[1])}`)}">
      <span class="tr-grip" aria-hidden="true">⠿</span>
      <span class="tr-time mono">${hfr(t[0])}<br><span class="muted">${hfr(t[1])}</span></span>
      <span class="tr-body"><span class="pill ${m.type}">${typeLabel(m.type)}</span> <b>${T(m.titre)}</b>${m.cas ? `<span class="small muted tr-cas">${T(m.cas)}</span>` : ""}
        <span class="tr-chips">${pages.length ? `<span class="chip sm">p. ${esc(formatPages(pages))}</span>` : ""}${acts.map((k) => `<span class="chip sm act">${KIND_LABEL[actKind(k)] || "Activité"} · ${T(actTitle(k))}</span>`).join("")}${m.quiz ? `<span class="chip sm">Quiz en autonomie · ${T(actTitle(m.quiz))}</span>` : ""}${m.outil ? `<span class="chip sm">${T(TOOL_LABELS[m.outil] || m.outil)}</span>` : ""}</span></span>
      <span class="tr-dur small">${durTxt(m.dur)}</span></article>`;
  }
  function draw() {
    $("#trState", root).textContent = dirty ? "Modifications non enregistrées" : "Enregistré";
    $("#trSave", root).disabled = !dirty && !isNew;
    const n = model.days.length;
    days.innerHTML = model.days.map((day, d) => {
      const tl = timeline(day), last = d === n - 1;
      return `<section class="tr-day card" data-d="${d}">
        <div class="tr-dayhead"><b>Jour ${d + 1}</b>
          <input class="tr-daytitle" data-dtitle="${d}" value="${esc(day.titre)}" placeholder="Titre de la journée (facultatif)" maxlength="120" aria-label="Titre du jour ${d + 1}">
          <label class="small">Début <input type="time" step="300" data-dstart="${d}" value="${esc(day.start)}"></label>
          ${n > 1 ? `<button class="iconbtn danger" type="button" data-drm="${d}" title="Retirer cette journée" aria-label="Retirer le jour ${d + 1}">✕</button>` : ""}</div>
        <div class="tr-fixed em"><span class="mono">${hfr(tl.emargements[0])}</span> Émargement du matin</div>
        <div class="tr-list" data-d="${d}" data-half="am">${tl.am.map((m) => cardHtml(m, m.t)).join("") || `<p class="tr-empty small muted">Glissez ici une séquence du matin.</p>`}</div>
        ${tl.overflow ? `<p class="warn small tr-over">${T(`La matinée déborde de ${durTxt(tl.overflow)} sur le déjeuner : raccourcissez une séquence ou déplacez-la l'après-midi.`)}</p>` : ""}
        <div class="tr-fixed lunch"><span class="mono">${hfr(tl.lunch.t[0])}</span> Déjeuner
          <label class="small">à <input type="time" step="300" data-dlunch="${d}" value="${esc(day.lunch.at)}"></label>
          <label class="small">durée <select data-dlunchdur="${d}">${[30, 45, 60, 75, 90, 120].map((v) => `<option value="${v}"${day.lunch.dur === v ? " selected" : ""}>${durTxt(v)}</option>`).join("")}</select></label></div>
        <div class="tr-fixed em"><span class="mono">${hfr(tl.emargements[1])}</span> Émargement de l'après-midi</div>
        <div class="tr-list" data-d="${d}" data-half="pm">${tl.pm.map((m) => cardHtml(m, m.t)).join("") || `<p class="tr-empty small muted">Glissez ici une séquence de l'après-midi.</p>`}</div>
        <div class="tr-fixed end"><span class="mono">${hfr(tl.end)}</span> ${last ? "Fin de la formation" : "Fin de la journée"}</div>
      </section>`;
    }).join("") + (n < MAX_DAYS ? `<button class="btn ghost tr-addday" type="button" id="trAddDay">+ Ajouter une journée (${n + 1} sur ${MAX_DAYS})</button>` : `<p class="small muted">Cinq journées au plus.</p>`);
    bindDays(); drawPalette(); drawInsp();
  }

  function bindDays() {
    $$("[data-dtitle]", days).forEach((i) => (i.onchange = () => change(updateDay(model, +i.dataset.dtitle, { titre: i.value }))));
    $$("[data-dstart]", days).forEach((i) => (i.onchange = () => i.value && change(updateDay(model, +i.dataset.dstart, { start: i.value }))));
    $$("[data-dlunch]", days).forEach((i) => (i.onchange = () => i.value && change(updateDay(model, +i.dataset.dlunch, { lunchAt: i.value }))));
    $$("[data-dlunchdur]", days).forEach((i) => (i.onchange = () => change(updateDay(model, +i.dataset.dlunchdur, { lunchDur: +i.value }))));
    $$("[data-drm]", days).forEach((b) => (b.onclick = () => {
      const d = +b.dataset.drm, cnt = model.days[d].am.length + model.days[d].pm.length;
      if (cnt && !confirm(`Retirer le jour ${d + 1} et ses ${cnt} séquence(s) ?`)) return;
      change(removeDay(model, d), null);
    }));
    $("#trAddDay", days)?.addEventListener("click", () => change(addDay(model)));
    $$(".tr-card", days).forEach((c) => {
      c.onclick = () => { sel = c.dataset.id; draw(); };
      c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sel = c.dataset.id; draw(); } };
      c.ondragstart = (e) => { e.dataTransfer.setData("text/x-trame-item", c.dataset.id); e.dataTransfer.effectAllowed = "move"; c.classList.add("dragging"); };
      c.ondragend = () => { c.classList.remove("dragging"); clearDrop(); };
    });
  }

  /* ---------- Glisser-déposer (délégation sur les journées) ---------- */
  const types = (e) => [...(e.dataTransfer?.types || [])];
  const isSeqDrag = (e) => types(e).some((t) => t === "text/x-trame-item" || t === "text/x-trame-block");
  const isOnCard = (e) => types(e).some((t) => t === "text/x-trame-act" || t === "text/x-trame-page");
  let line = null;
  const clearDrop = () => { line?.remove(); line = null; $$(".tr-card.drop-on", days).forEach((c) => c.classList.remove("drop-on")); };
  const indexAt = (listEl, y) => { const cards = $$(".tr-card:not(.dragging)", listEl); const i = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }); return i < 0 ? cards.length : i; };
  days.addEventListener("dragover", (e) => {
    if (isSeqDrag(e)) {
      const listEl = e.target.closest?.(".tr-list"); if (!listEl) return;
      e.preventDefault(); e.dataTransfer.dropEffect = types(e).includes("text/x-trame-item") ? "move" : "copy";
      const i = indexAt(listEl, e.clientY), cards = $$(".tr-card:not(.dragging)", listEl);
      line ||= Object.assign(document.createElement("div"), { className: "tr-drop-line" });
      if (cards[i]) listEl.insertBefore(line, cards[i]); else listEl.appendChild(line);
    } else if (isOnCard(e)) {
      const card = e.target.closest?.(".tr-card"); $$(".tr-card.drop-on", days).forEach((c) => c !== card && c.classList.remove("drop-on"));
      if (!card) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; card.classList.add("drop-on");
    }
  });
  days.addEventListener("dragleave", (e) => { if (!days.contains(e.relatedTarget)) clearDrop(); });
  days.addEventListener("drop", (e) => {
    const item = e.dataTransfer.getData("text/x-trame-item"), block = e.dataTransfer.getData("text/x-trame-block");
    const act = e.dataTransfer.getData("text/x-trame-act"), page = e.dataTransfer.getData("text/x-trame-page");
    if (item || block) {
      const listEl = e.target.closest?.(".tr-list"); if (!listEl) return clearDrop();
      e.preventDefault();
      const to = { d: +listEl.dataset.d, half: listEl.dataset.half, index: indexAt(listEl, e.clientY) };
      clearDrop();
      if (item) { const from = find(model, item); if (from && from.d === to.d && from.half === to.half && from.i < to.index) to.index++; change(moveItem(model, item, to), item); }
      else { const r = addItem(model, block, to); change(r.model, r.id); }
    } else if (act || page) {
      const card = e.target.closest?.(".tr-card"); clearDrop(); if (!card) return;
      e.preventDefault();
      if (act) addAct(card.dataset.id, act); else addPage(card.dataset.id, +page);
    }
  });
  const addAct = (mid, k) => { const m = find(model, mid)?.item; if (!m) return; if ((m.acts || []).includes(k)) return toast("Déjà dans cette séquence."); change(updateItem(model, mid, { acts: [...(m.acts || []), k] }), mid); };
  const addPage = (mid, n) => { const m = find(model, mid)?.item; if (!m || !n) return; change(updateItem(model, mid, { pages: formatPages([...parsePages(m.pages), n]) }), mid); };

  /* ---------- Palette ---------- */
  function drawPalette() {
    const tabs = [["blocs", "Blocs"], ["quiz", "Quiz et sondages"], ["slides", "Slides"]];
    let body = "";
    if (palette === "blocs") {
      body = `<p class="small muted">${T("Glissez un bloc dans une journée, ou touchez-le pour l'ajouter après la séquence choisie.")}</p>
        <div class="tr-blocks">${Object.entries(BLOCKS).map(([k, b]) => `<button type="button" class="tr-block t-${b.type}" draggable="true" data-block="${k}"><span class="pill ${b.type}">${typeLabel(b.type)}</span> <span class="small">${durTxt(b.dur)}</span></button>`).join("")}</div>`;
    } else if (palette === "quiz") {
      const items = bank.items.filter((b) => !filter || `${b.titre} ${b.id}`.toLowerCase().includes(filter.toLowerCase()));
      body = `<p class="small muted">${T("Glissez un quiz ou un sondage sur une séquence : il y sera joué en salle. Touchez-le pour l'ajouter à la séquence choisie.")}</p>
        <input type="search" id="trQ" placeholder="Chercher" value="${esc(filter)}" aria-label="Chercher un quiz ou un sondage">
        ${["quiz", "poll", "cloud"].map((k) => { const l = items.filter((b) => b.kind === k); return l.length ? `<div class="kicker-d" style="margin-top:10px">${{ quiz: "Quiz", poll: "Sondages", cloud: "Nuages de mots" }[k]}</div>
          <div class="tr-acts">${l.map((b) => `<button type="button" class="tr-act" draggable="true" data-act="${esc(b.id)}" title="${esc(b.id)}">${T(b.titre)}</button>`).join("")}</div>` : ""; }).join("") || `<p class="small muted">Aucun élément.</p>`}
        <p class="small"><a href="#/admin/quiz" target="_blank" rel="noopener">Gérer la bibliothèque ↗</a></p>`;
    } else {
      const url = model.slides_url || "", n = model.slides_n || (deckId(url) === DEFAULT_DECK_ID ? DECK_PAGES.length : 0);
      const used = pagesUsage(model, parsePages);
      body = `<label class="f" for="trDeck">Présentation Google Slides</label><input type="url" id="trDeck" value="${esc(url)}" placeholder="https://docs.google.com/presentation/d/…">
        <label class="f" for="trN">Nombre de slides</label><input type="number" id="trN" min="0" max="400" value="${n || ""}" placeholder="ex. 141">
        ${url && deckId(url) ? (n ? `<p class="small muted">${T("Glissez une slide sur une séquence, ou touchez-la pour la voir ; « Ajouter » la met dans la séquence choisie.")}</p>
          <div class="tr-tiles">${Array.from({ length: n }, (_, i) => i + 1).map((p) => `<button type="button" class="tr-tile${preview === p ? " on" : ""}${used.has(p) ? " used" : ""}" draggable="true" data-page="${p}" title="${used.has(p) ? `Slide ${p} · déjà dans ${used.get(p).length} séquence(s)` : `Slide ${p}`}">${p}</button>`).join("")}</div>
          ${preview ? `<div class="tr-prev"><div class="tr-prevbox"><iframe src="${esc(slideEmbedUrl(url, preview))}" title="Slide ${preview}" loading="lazy"></iframe></div>
            <div class="tr-prevbar"><button class="btn sm ghost" type="button" data-pv="-1" aria-label="Slide précédente">←</button><b class="small">Slide ${preview}</b><button class="btn sm ghost" type="button" data-pv="1" aria-label="Slide suivante">→</button>
            <button class="btn sm" type="button" id="trAddPage"${sel ? "" : " disabled"}>Ajouter à la séquence</button></div></div>` : ""}`
          : `<p class="small muted">Indiquez le nombre de slides pour afficher les tuiles.</p>`) : `<p class="small muted">${T("Collez le lien de la présentation (elle doit être visible de votre navigateur) pour voir et glisser ses slides.")}</p>`}`;
    }
    pal.innerHTML = `<div class="tr-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${palette === k}" data-tab="${k}">${l}</button>`).join("")}</div>${body}`;
    $$("[data-tab]", pal).forEach((b) => (b.onclick = () => { palette = b.dataset.tab; drawPalette(); }));
    $$("[data-block]", pal).forEach((b) => {
      b.ondragstart = (e) => { e.dataTransfer.setData("text/x-trame-block", b.dataset.block); e.dataTransfer.effectAllowed = "copy"; };
      b.onclick = () => { const at = sel && find(model, sel); const to = at ? { d: at.d, half: at.half, index: at.i + 1 } : { d: model.days.length - 1, half: "pm" }; const r = addItem(model, b.dataset.block, to); change(r.model, r.id); };
    });
    $$("[data-act]", pal).forEach((b) => {
      b.ondragstart = (e) => { e.dataTransfer.setData("text/x-trame-act", b.dataset.act); e.dataTransfer.effectAllowed = "copy"; };
      b.onclick = () => (sel ? addAct(sel, b.dataset.act) : toast("Choisissez d'abord une séquence."));
    });
    $$("[data-page]", pal).forEach((b) => {
      b.ondragstart = (e) => { e.dataTransfer.setData("text/x-trame-page", b.dataset.page); e.dataTransfer.effectAllowed = "copy"; };
      b.onclick = () => { preview = +b.dataset.page; drawPalette(); };
    });
    $$("[data-pv]", pal).forEach((b) => (b.onclick = () => { const n = model.slides_n || DECK_PAGES.length; preview = Math.min(Math.max(1, preview + +b.dataset.pv), n); drawPalette(); }));
    $("#trAddPage", pal)?.addEventListener("click", () => sel && addPage(sel, preview));
    $("#trQ", pal)?.addEventListener("input", debounce((e) => { filter = e.target.value; drawPalette(); $("#trQ", pal)?.focus(); }, 250));
    $("#trDeck", pal)?.addEventListener("change", (e) => { const v = e.target.value.trim(); if (v && !deckId(v)) return toast("Lien Google Slides non reconnu.", "ko"); preview = 0; change({ ...model, slides_url: v }); palette = "slides"; });
    $("#trN", pal)?.addEventListener("change", (e) => change({ ...model, slides_n: Math.max(0, Math.min(400, parseInt(e.target.value, 10) || 0)) }));
  }

  /* ---------- Inspecteur ---------- */
  function drawInsp() {
    const at = sel && find(model, sel);
    if (!at) {
      insp.innerHTML = `<h3 style="margin-top:0">Séquence</h3><p class="small muted">${T("Touchez une séquence pour la modifier : titre, description, durée, slides, quiz et sondages, objectifs, exercice.")}</p>
        <p class="small muted">${T("Les temps forts (émargements, déjeuner, fin de journée) restent à leur place. L'heure et la durée du déjeuner se règlent dans chaque journée.")}</p>`;
      return;
    }
    const m = at.item, quizzes = bank.items.filter((b) => b.kind === "quiz");
    const half = model.days[at.d][at.half], pause = m.type === "pause";
    insp.innerHTML = `<div class="tr-insp-head"><h3 style="margin:0">Séquence</h3><button class="iconbtn" type="button" id="iClose" aria-label="Fermer">×</button></div>
      <div class="days tr-types" role="group" aria-label="Type">${["comprendre", "pratique", "discussion", "pause"].map((t) => `<button type="button" data-itype="${t}" aria-pressed="${m.type === t}">${typeLabel(t)}</button>`).join("")}</div>
      <label class="f" for="iT">Titre</label><input id="iT" maxlength="160" value="${esc(m.titre)}">
      ${pause ? "" : `<label class="f" for="iC">Description</label><input id="iC" maxlength="200" value="${esc(m.cas || "")}" placeholder="Exemple, sous-titre…">`}
      <label class="f" for="iD">Durée (minutes)</label><input id="iD" type="number" min="5" step="5" max="480" value="${m.dur}">
      ${pause ? "" : `
      <label class="f" for="iP">Slides</label><input id="iP" value="${esc(m.pages || "")}" placeholder="11 à 16, 18">
      <div class="kicker-d" style="margin-top:12px">Quiz et sondages en salle</div>
      <div class="tr-iacts">${(m.acts || []).map((k, i) => `<div class="prow"><span class="small">${KIND_LABEL[actKind(k)] || "Activité"} · ${T(actTitle(k))}</span><span>${i ? `<button class="iconbtn" type="button" data-aup="${i}" aria-label="Monter">↑</button>` : ""}<button class="iconbtn danger" type="button" data-arm="${i}" aria-label="Retirer">✕</button></span></div>`).join("") || `<p class="small muted" style="margin:4px 0">${T("Aucun : glissez-en un depuis la palette.")}</p>`}</div>
      <label class="f" for="iQ">Quiz en autonomie (dans le déroulé des stagiaires)</label><select id="iQ"><option value="">Aucun</option>${quizzes.map((q) => `<option value="${esc(q.id)}"${m.quiz === q.id ? " selected" : ""}>${T(q.titre)}</option>`).join("")}</select>
      <label class="f" for="iO">Outil d'exercice débloqué</label><select id="iO"><option value="">Aucun</option>${Object.entries(TOOL_LABELS).map(([k, l]) => `<option value="${k}"${m.outil === k ? " selected" : ""}>${T(l)}</option>`).join("")}</select>
      <details class="tr-more"${m.obj || m.pts || m.disc || m.exo ? " open" : ""}><summary class="small">Objectifs, points clés, questions, exercice</summary>
        <label class="f" for="iObj">Objectifs (un par ligne)</label><textarea id="iObj" rows="3">${esc(lines(m.obj))}</textarea>
        <label class="f" for="iPts">Points clés (un par ligne)</label><textarea id="iPts" rows="3">${esc(lines(m.pts))}</textarea>
        <label class="f" for="iDisc">Questions de discussion (une par ligne)</label><textarea id="iDisc" rows="3">${esc(lines(m.disc))}</textarea>
        <label class="f" for="iExT">Exercice : titre</label><input id="iExT" maxlength="160" value="${esc(m.exo?.titre || "")}" placeholder="Sans titre, pas d'exercice">
        <label class="f" for="iExD">Exercice : durée (minutes)</label><input id="iExD" type="number" min="5" step="5" value="${m.exo?.duree || ""}">
        <label class="f" for="iExS">Exercice : étapes (une par ligne)</label><textarea id="iExS" rows="4">${esc(lines(m.exo?.steps))}</textarea>
      </details>`}
      <div class="tr-iactions">
        <button class="btn sm ghost" type="button" id="iUp"${at.i === 0 ? " disabled" : ""}>↑ Monter</button>
        <button class="btn sm ghost" type="button" id="iDown"${at.i === half.length - 1 ? " disabled" : ""}>↓ Descendre</button>
        <button class="btn sm ghost" type="button" id="iDup">Dupliquer</button>
        <button class="btn sm ghost danger" type="button" id="iDel">Supprimer</button>
      </div>
      <label class="f" for="iMove">Déplacer vers</label><select id="iMove">${model.days.flatMap((_, d) => [["am", "matin"], ["pm", "après-midi"]].map(([h, l]) => `<option value="${d}:${h}"${d === at.d && h === at.half ? " selected" : ""}>Jour ${d + 1}, ${l}</option>`)).join("")}</select>`;
    const upd = (patch) => change(updateItem(model, sel, patch));
    $("#iClose", insp).onclick = () => { sel = null; draw(); };
    $$("[data-itype]", insp).forEach((b) => (b.onclick = () => upd({ type: b.dataset.itype, ...(b.dataset.itype === "pause" && !/^pause/i.test(m.titre) ? { titre: "Pause" } : {}) })));
    $("#iT", insp).onchange = (e) => upd({ titre: e.target.value.trim() || "Séquence" });
    $("#iD", insp).onchange = (e) => upd({ dur: +e.target.value || 5 });
    if (!pause) {
      $("#iC", insp).onchange = (e) => upd({ cas: e.target.value.trim() || undefined });
      $("#iP", insp).onchange = (e) => { const p = parsePages(e.target.value); upd({ pages: p.length ? formatPages(p) : undefined }); };
      $("#iQ", insp).onchange = (e) => upd({ quiz: e.target.value || undefined });
      $("#iO", insp).onchange = (e) => upd({ outil: e.target.value || undefined });
      [["iObj", "obj"], ["iPts", "pts"], ["iDisc", "disc"]].forEach(([i, k]) => ($(`#${i}`, insp).onchange = (e) => { const v = unlines(e.target.value); upd({ [k]: v.length ? v : undefined }); }));
      const exo = () => { const t = $("#iExT", insp).value.trim(), steps = unlines($("#iExS", insp).value); upd({ exo: t ? { titre: t, duree: parseInt($("#iExD", insp).value, 10) || Math.max(5, m.dur - 5), steps } : undefined }); };
      ["iExT", "iExD", "iExS"].forEach((i) => ($(`#${i}`, insp).onchange = exo));
      $$("[data-arm]", insp).forEach((b) => (b.onclick = () => { const a = [...m.acts]; a.splice(+b.dataset.arm, 1); upd({ acts: a.length ? a : undefined }); }));
      $$("[data-aup]", insp).forEach((b) => (b.onclick = () => { const a = [...m.acts], i = +b.dataset.aup; [a[i - 1], a[i]] = [a[i], a[i - 1]]; upd({ acts: a }); }));
    }
    $("#iUp", insp).onclick = () => change(moveItem(model, sel, { d: at.d, half: at.half, index: at.i - 1 }));
    $("#iDown", insp).onclick = () => change(moveItem(model, sel, { d: at.d, half: at.half, index: at.i + 2 }));
    $("#iDup", insp).onclick = () => { const r = duplicateItem(model, sel); change(r.model, r.id); };
    $("#iDel", insp).onclick = () => { if (confirm(`Supprimer « ${m.titre} » ?`)) change(removeItem(model, sel), null); };
    $("#iMove", insp).onchange = (e) => { const [d, half] = e.target.value.split(":"); change(moveItem(model, sel, { d: +d, half })); };
  }

  /* ---------- En-tête : titre, formation, import, export, enregistrement ---------- */
  $("#trT", root).oninput = () => { titre = $("#trT", root).value; dirty = true; keepDraft(); $("#trState", root).textContent = "Modifications non enregistrées"; $("#trSave", root).disabled = false; };
  $("#trF", root).onchange = () => change({ ...model, formation: $("#trF", root).value.trim() });
  $("#trExp", root).onclick = () => exportMd(titre, model);
  $("#trImp2", root).onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 300000) return toast("Fichier trop lourd (300 ko au plus).", "ko");
    const r = parseConducteur(await f.text(), knownOf(bank));
    if (r.errors.length) return toast(`Import impossible : ${r.errors[0]}`, "ko");
    if (!confirm(`Remplacer le contenu de la trame par « ${f.name} » (${r.programme.modules.filter((x) => x.type !== "pause").length} séquences, ${r.programme.nDays} journée(s)) ?`)) return;
    if (r.warnings.length) toast(`${r.warnings.length} remarque(s) : ${r.warnings[0]}`, "");
    change(fromProgramme(r.programme), null);
    $("#trF", root).value = model.formation;
  };
  $("#trSave", root).onclick = async () => {
    const t = $("#trT", root).value.trim();
    if (!t) return toast("Donnez un titre à la trame.", "ko");
    const out = await guard(() => api.saveTrame({ id: isNew ? undefined : id, titre: t, content: toProgramme(model) }), "Trame enregistrée.");
    if (!out) return;
    try { localStorage.removeItem(DRAFT(id)); } catch {}
    if (isNew) return go(`${BASE}/${out.id}`);
    titre = out.titre; model = fromProgramme(out.content); saved = JSON.stringify({ titre, model }); dirty = false; draw();
  };
  const leave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", leave);
  draw();
  if (dirty && !isNew) toast("Brouillon repris : modifications non enregistrées.");
  return () => window.removeEventListener("beforeunload", leave);
}
