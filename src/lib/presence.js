/* Numéro de session et émargement par demi-journée (migration …_numeros_emargements.sql). Pur, testé dans
   tests/presence.test.mjs.
   - Numéro : année de création + rang dans l'année, attribué par la base (« 2026-012 »). Deux sessions peuvent porter
     le même titre : le numéro et les dates les distinguent. Les sessions de démo des invité·es n'en ont pas.
   - Émargement : session_members.presence = { "j1-matin": { self, staff, by, at }, … }. Les clés sont celles des
     créneaux d'emargementSlots (matin et après-midi de chaque journée). « self » : heure à laquelle le ou la
     stagiaire a touché « J'ai émargé » ; « staff » : correction de l'équipe (true présent·e, false absent·e), qui
     l'emporte. */
import { emargementSlots } from "./content.js";

export const sessionNo = (s) => (s && s.num_seq ? `${s.num_year}-${String(s.num_seq).padStart(3, "0")}` : "");

export const SLOT_RE = /^j[1-5]-(matin|aprem)$/;

// Demi-journées d'une session, dans l'ordre (sans le créneau de l'évaluation de fin de stage)
export const halfDays = (session) => emargementSlots(session).filter((s) => !s.kind && SLOT_RE.test(s.key)).map((s) => {
  const half = s.key.endsWith("matin") ? "matin" : "aprem";
  return { key: s.key, day: s.day, half, t: s.t, date: s.date, label: `J${s.day} ${half === "matin" ? "matin" : "après-midi"}` };
});

// État d'une demi-journée : present (validé par l'équipe), absent (idem), self (déclaré), none (rien)
export function stateOf(p) {
  if (p && typeof p.staff === "boolean") return p.staff ? "present" : "absent";
  return p?.self ? "self" : "none";
}
// Clic de l'équipe sur une case : rien ou déclaré → présent·e → absent·e → retour à la déclaration
export const nextValue = (state) => (state === "present" ? false : state === "absent" ? null : true);
// Compte comme présent·e : validé par l'équipe, ou déclaré sans correction
export const isPresent = (state) => state === "present" || state === "self";

const hm = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", " h ").replace(/^0(\d)/, "$1");
export function stateText(p) {
  const st = stateOf(p);
  if (st === "present") return p.self ? `présent·e (émargé à ${hm(p.self)}, validé)` : "présent·e (validé par l'équipe)";
  if (st === "absent") return p.self ? `absent·e (émargé à ${hm(p.self)}, corrigé)` : "absent·e";
  if (st === "self") return `émargé à ${hm(p.self)}`;
  return "";
}

// Présences par demi-journée : nombre de personnes présentes sur chaque créneau
export const totals = (slots, rows) => slots.map((s) => rows.filter((r) => isPresent(stateOf(r.presence?.[s.key]))).length);

// Tableur : nom, adresse, puis une colonne par demi-journée. Cellules protégées contre les formules.
const cell = (v) => { const s = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
export function presenceCsv(session, rows) {
  const slots = halfDays(session);
  const head = ["Nom", "E-mail", ...slots.map((s) => `${s.label}${s.date ? ` (${s.date})` : ""}`)];
  const lines = rows.map((r) => [r.full_name || "", r.email || "", ...slots.map((s) => stateText(r.presence?.[s.key]))]);
  return [head, ...lines].map((l) => l.map(cell).join(";")).join("\r\n");
}

/* Adresses des stagiaires (list_trainees : une ligne par personne et par session) → une entrée par adresse, avec ses
   sessions ; la plus récente inscription en tête. */
export function groupTrainees(rows, sessions) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const map = new Map();
  for (const r of rows) {
    const email = String(r.email || "").toLowerCase(); if (!email) continue;
    const e = map.get(email) || { email, full_name: "", metier: "", niveau: "", sessions: [], joined: false, last: "" };
    e.full_name ||= r.full_name || ""; e.metier ||= r.metier || ""; e.niveau ||= r.niveau || "";
    const s = byId.get(r.session_id);
    if (s && !e.sessions.some((x) => x.id === s.id)) e.sessions.push({ id: s.id, no: sessionNo(s), title: s.title, date: s.date || "", joined: !!r.joined });
    if (r.joined) e.joined = true;
    const d = s?.date || r.joined_at?.slice(0, 10) || "";
    if (d > e.last) e.last = d;
    map.set(email, e);
  }
  return [...map.values()].map((e) => ({ ...e, sessions: e.sessions.sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.last.localeCompare(a.last) || a.email.localeCompare(b.email));
}
export function traineesCsv(list) {
  const head = ["Nom", "E-mail", "Métier", "Niveau", "Statut", "Sessions"];
  const lines = list.map((e) => [e.full_name, e.email, e.metier, e.niveau, e.joined ? "inscrit·e" : "invité·e",
    e.sessions.map((s) => `${s.no ? s.no + " " : ""}${s.title}${s.date ? ` (${s.date})` : ""}`).join(" | ")]);
  return [head, ...lines].map((l) => l.map(cell).join(";")).join("\r\n");
}

/* Bouton « J'ai émargé » de l'espace stagiaire, pendant un créneau ouvert (emargementOpen) ; une fois touché, l'heure
   enregistrée. T : échappement et typographie (dom.js). Enregistré par sign_presence ; l'équipe peut corriger. */
const halfWord = (key) => (key.endsWith("matin") ? "ce matin" : "cet après-midi");
export function signHtml(slot, mine, T, { dark = false, preview = false } = {}) {
  if (!slot || !SLOT_RE.test(slot.key)) return "";
  const done = mine?.[slot.key]?.self;
  return `<div class="sign-box${dark ? " dark" : ""}">${done
    ? `<span class="pill ok">✓ ${T(`Émargement enregistré à ${hm(done)}`)}</span>`
    : `<button type="button" class="btn ok-btn${dark ? " big" : ""}" data-sign="${slot.key}">${T(`J'ai émargé ${halfWord(slot.key)}`)}</button>
      <span class="small${dark ? "" : " muted"}">${T(preview ? "Aperçu : le bouton que voient les stagiaires pendant le créneau." : "Touchez ce bouton une fois les signatures faites : votre formateur·ice le voit sur la feuille d'émargement.")}</span>`}</div>`;
}
// Message clair si la migration manque encore
export const signError = (e) => (/schema cache|Could not find the function|does not exist/i.test(e?.message || "")
  ? "L'enregistrement de l'émargement n'est pas encore activé : signalez-le à votre formateur·ice." : e?.message || "Émargement non enregistré.");
