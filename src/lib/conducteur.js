/* Conducteur de formation en Markdown : lecture (parseConducteur) et écriture (conducteurMarkdown).
   Format :

   ---
   formation: Prendre en main les IA génératives
   ---
   # Jour 1 · Comprendre, puis Gemini Notebook        ← un titre de niveau 1 par journée (facultatif pour une journée)
   ## 09:30–09:40 · Accueil, objectifs, attentes      ← une séquence : horaires, puis titre
   type: discussion                                   ← comprendre | pratique | discussion | pause
   cas: Un service, pas un outil
   pages: 3, 8, 9
   temps fort: 1
   activité: niveau        quiz: llm       fiches: notebook, donnees       exemples: oui
   ### Objectifs   ### Points clés   ### Discussion   ← listes à puces
   ### Exercice : Votre premier carnet (40 min)       ← étapes numérotées, puis « prompts: carnet, interview »

   Une séquence intitulée « Pause » ou « Déjeuner » est une pause, sans autre précision. */

import { FICHES, PROMPTS, QUIZ, PRESETS } from "../data.js";

const TYPES = { comprendre: "comprendre", théorie: "comprendre", theorie: "comprendre", apport: "comprendre", pratique: "pratique", atelier: "pratique", exercice: "pratique", discussion: "discussion", échange: "discussion", echange: "discussion", débat: "discussion", pause: "pause", déjeuner: "pause", dejeuner: "pause" };
const SECTIONS = { objectifs: "obj", objectif: "obj", "points clés": "pts", "points cles": "pts", "à retenir": "pts", "a retenir": "pts", discussion: "disc", questions: "disc" };
const KEYS = { type: "type", cas: "cas", exemple: "cas", pages: "pages", page: "pages", "temps fort": "tf", tf: "tf", activité: "live", activite: "live", live: "live", quiz: "quiz", fiches: "fiches", fiche: "fiches", exemples: "ex", outil: "outil", id: "id" };

// Outils d'exercice débloqués côté stagiaire quand la séquence est lancée
const TOOLS = { rmctf: "toolRmctf", toolrmctf: "toolRmctf", sve: "toolSve", toolsve: "toolSve", codecouleur: "toolCc", couleur: "toolCc", toolcc: "toolCc" };
const TOOL_NAMES = { toolRmctf: "rmctf", toolSve: "sve", toolCc: "code couleur" };
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "seq";
const hm = (s) => { const m = String(s).trim().match(/^(\d{1,2})\s*[:hH.]\s*(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const list = (v) => v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
const yes = (v) => /^(oui|yes|vrai|true|1|x)$/i.test(v.trim());

/** Lit un conducteur Markdown. Renvoie { programme, warnings, errors } ; programme = { formation, days, modules } */
// known : clés acceptées pour « quiz: » et « activité: » (bibliothèque et session) ; par défaut, celles de data.js
export function parseConducteur(md, known = {}) {
  const quizKeys = new Set(known.quizzes || Object.keys(QUIZ)), liveKeys = new Set(known.live || Object.keys(PRESETS));
  // Les commentaires HTML sont retirés (en gardant les sauts de ligne, pour que les numéros de ligne restent justes)
  const lines = String(md || "").replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, "")).split("\n");
  const errors = [], warnings = [], modules = [], days = {};
  const at = (i, msg, arr = errors) => arr.push(`Ligne ${i + 1} : ${msg}`);
  let formation = null, day = 1, cur = null, section = null, i = 0;

  // En-tête facultatif entre deux lignes « --- »
  if (lines[0]?.trim() === "---") {
    for (i = 1; i < lines.length && lines[i].trim() !== "---"; i++) {
      const m = lines[i].match(/^\s*([^:]+):\s*(.*)$/);
      if (m && /^(formation|titre)$/i.test(m[1].trim())) formation = m[2].trim() || null;
    }
    i++;
  }

  const close = () => {
    if (!cur) return;
    if (!cur.type) cur.type = /^(pause|déjeuner|dejeuner|pause déjeuner)/i.test(cur.titre) ? "pause" : "comprendre";
    if (cur.exo && !cur.exo.steps.length) { at(cur._line, `l'exercice de « ${cur.titre} » n'a aucune étape.`, warnings); }
    modules.push(cur); cur = null; section = null;
  };

  for (; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    if (!line || /^<!--.*-->$/.test(line)) continue;

    let m;
    if ((m = line.match(/^#\s+(.+)$/))) { // Journée
      close();
      const d = m[1].match(/^jour\s*(\d+)\s*(?:[·:—–-]\s*(.*))?$/i);
      if (d) { day = +d[1]; if (d[2]) days[day] = d[2].trim(); }
      else if (!formation && !modules.length) formation = m[1].trim();
      else at(i, `titre de niveau 1 ignoré (attendu : « # Jour 2 · … »).`, warnings);
      continue;
    }
    if ((m = line.match(/^##\s+(.+)$/))) { // Séquence
      close();
      const h = m[1].match(/^(\d{1,2}\s*[:hH.]\s*\d{2})\s*(?:–|—|-|à|a)\s*(\d{1,2}\s*[:hH.]\s*\d{2})\s*(?:[·:—–|-]\s*)?(.*)$/);
      if (!h) { at(i, `horaires introuvables dans « ${m[1]} » (attendu : « ## 09:30–10:15 · Titre »).`); continue; }
      const t0 = hm(h[1]), t1 = hm(h[2]);
      if (!t0 || !t1) { at(i, `horaire invalide dans « ${m[1]} ».`); continue; }
      if (mins(t1) <= mins(t0)) at(i, `la séquence finit avant de commencer (${t0}–${t1}).`);
      cur = { id: "", t: [t0, t1], type: "", titre: (h[3] || "").trim() || "Séquence", day, _line: i };
      continue;
    }
    if (!cur) { at(i, `texte hors séquence ignoré : « ${line.slice(0, 50)} ».`, warnings); continue; }

    if ((m = line.match(/^###\s+(.+)$/))) { // Section
      const name = m[1].trim(), low = name.toLowerCase();
      const ex = name.match(/^exercice\s*(?:[:·—–-]\s*(.*?))?\s*(?:\((\d+)\s*min(?:utes)?\))?\s*$/i);
      if (ex) { cur.exo = { titre: (ex[1] || "Exercice").trim(), duree: ex[2] ? +ex[2] : null, steps: [] }; section = "exo"; }
      else if (SECTIONS[low]) { section = SECTIONS[low]; cur[section] = cur[section] || []; }
      else { at(i, `section « ${name} » inconnue, ignorée (Objectifs, Points clés, Discussion, Exercice).`, warnings); section = "skip"; }
      continue;
    }
    if ((m = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/))) { // Élément de liste
      const v = m[1].trim();
      if (section === "exo") cur.exo.steps.push(v);
      else if (section && section !== "skip") cur[section].push(v);
      else at(i, `élément de liste hors section ignoré.`, warnings);
      continue;
    }
    if ((m = line.match(/^([^:]{2,20}):\s*(.*)$/))) { // Clé : valeur
      const k = m[1].trim().toLowerCase(), v = m[2].trim();
      if (section === "exo" && /^prompts?$/.test(k)) { cur.exo.prompts = list(v); continue; }
      if (section === "exo" && /^dur[ée]e$/.test(k)) { cur.exo.duree = parseInt(v, 10) || null; continue; }
      const key = KEYS[k];
      if (key) {
        if (key === "type") { const t = TYPES[v.toLowerCase()]; if (t) cur.type = t; else at(i, `type « ${v} » inconnu (comprendre, pratique, discussion, pause).`); }
        else if (key === "tf") cur.tf = parseInt(v, 10) || undefined;
        else if (key === "fiches") cur.fiches = list(v);
        else if (key === "ex") cur.ex = yes(v) || undefined;
        else if (key === "outil") { const t = TOOLS[v.toLowerCase().replace(/[^a-z]/g, "")]; if (t) cur.outil = t; else at(i, `outil « ${v} » inconnu (rmctf, sve ou code couleur).`, warnings); }
        else cur[key] = v || undefined;
        continue;
      }
    }
    at(i, `ligne ignorée : « ${line.slice(0, 60)} ».`, warnings);
  }
  close();

  if (!modules.length && !errors.length) errors.push("Aucune séquence trouvée : chaque séquence commence par « ## 09:30–10:15 · Titre ».");

  // Identifiants, ordre, chevauchements, références au contenu pédagogique
  const ids = new Set(), fiches = new Set(FICHES.map((f) => f.id)), prompts = new Set(PROMPTS.map((p) => p.id));
  modules.forEach((mo, k) => {
    let id = mo.id || `d${mo.day}-${slug(mo.titre)}`, n = 2;
    while (ids.has(id)) id = `${mo.id || `d${mo.day}-${slug(mo.titre)}`}-${n++}`;
    ids.add(id); mo.id = id;
    const prev = modules[k - 1];
    if (prev && prev.day === mo.day && mins(mo.t[0]) < mins(prev.t[1])) at(mo._line, `« ${mo.titre} » commence (${mo.t[0]}) avant la fin de la séquence précédente (${prev.t[1]}).`, warnings);
    if (prev && mo.day < prev.day) at(mo._line, `le jour ${mo.day} vient après le jour ${prev.day}.`);
    if (mo.quiz && !quizKeys.has(mo.quiz)) { at(mo._line, `quiz « ${mo.quiz} » inconnu, retiré (disponibles : ${[...quizKeys].join(", ")}).`, warnings); delete mo.quiz; }
    if (mo.live && !liveKeys.has(mo.live)) { at(mo._line, `activité « ${mo.live} » inconnue, retirée (disponibles : ${[...liveKeys].join(", ")}).`, warnings); delete mo.live; }
    if (mo.fiches) { const bad = mo.fiches.filter((f) => !fiches.has(f)); if (bad.length) at(mo._line, `fiche(s) inconnue(s) retirée(s) : ${bad.join(", ")}.`, warnings); mo.fiches = mo.fiches.filter((f) => fiches.has(f)); if (!mo.fiches.length) delete mo.fiches; }
    if (mo.exo?.prompts) { const bad = mo.exo.prompts.filter((p) => !prompts.has(p)); if (bad.length) at(mo._line, `prompt(s) inconnu(s) retiré(s) : ${bad.join(", ")}.`, warnings); mo.exo.prompts = mo.exo.prompts.filter((p) => prompts.has(p)); if (!mo.exo.prompts.length) delete mo.exo.prompts; }
    if (mo.exo && !mo.exo.duree) mo.exo.duree = Math.max(5, mins(mo.t[1]) - mins(mo.t[0]) - 5);
    delete mo._line;
    Object.keys(mo).forEach((x) => mo[x] === undefined && delete mo[x]);
  });
  const nDays = Math.max(1, ...modules.map((x) => x.day || 1));
  if (nDays > 5) errors.push(`Le conducteur compte ${nDays} journées : une session en compte cinq au plus.`);
  if ([...new Set(modules.map((x) => x.day || 1))].length < nDays) warnings.push("Une des journées n'a aucune séquence.");
  return { programme: { formation, days, nDays, modules }, warnings, errors };
}

/** Écrit un conducteur Markdown à partir d'une liste de séquences (déroulé par défaut ou importé) */
export function conducteurMarkdown(modules, { formation, days = {} } = {}) {
  const out = [];
  if (formation) out.push("---", `formation: ${formation}`, "---", "");
  const multi = modules.some((m) => (m.day || 1) > 1);
  let day = null;
  for (const m of modules) {
    const d = m.day || 1;
    if (multi && d !== day) { out.push(`# Jour ${d}${days[d] ? ` · ${days[d]}` : ""}`, ""); day = d; }
    out.push(`## ${m.t[0]}–${m.t[1]} · ${m.titre}`);
    const isPause = m.type === "pause" && /^(pause|déjeuner)/i.test(m.titre);
    if (!isPause) out.push(`type: ${m.type}`);
    if (m.cas) out.push(`cas: ${m.cas}`);
    if (m.pages) out.push(`pages: ${m.pages}`);
    if (m.tf) out.push(`temps fort: ${m.tf}`);
    if (m.live) out.push(`activité: ${m.live}`);
    if (m.quiz) out.push(`quiz: ${m.quiz}`);
    if (m.fiches?.length) out.push(`fiches: ${m.fiches.join(", ")}`);
    if (m.ex) out.push("exemples: oui");
    if (m.outil) out.push(`outil: ${TOOL_NAMES[m.outil] || m.outil}`);
    const sec = (title, arr) => { if (arr?.length) out.push("", `### ${title}`, ...arr.map((x) => `- ${x}`)); };
    sec("Objectifs", m.obj); sec("Points clés", m.pts); sec("Discussion", m.disc);
    if (m.exo) {
      out.push("", `### Exercice : ${m.exo.titre}${m.exo.duree ? ` (${m.exo.duree} min)` : ""}`, ...m.exo.steps.map((s, k) => `${k + 1}. ${s}`));
      if (m.exo.prompts?.length) out.push(`prompts: ${m.exo.prompts.join(", ")}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export const DAY_TITLES_2 = { 1: "Comprendre et Gemini Notebook", 2: "Les assistants et les méthodes" };
