/* Numéro de session et adresses des stagiaires (migration …_numeros_emargements.sql). Pur, testé dans
   tests/stagiaires.test.mjs.
   - Numéro : année de création + rang dans l'année, attribué par la base (« 2026-012 »). Deux sessions peuvent porter
     le même titre : le numéro et les dates les distinguent. Les sessions de démo des invité·es n'en ont pas.
   - Adresses : list_trainees (une ligne par personne et par session) regroupé par adresse, et son tableur. */

export const sessionNo = (s) => (s && s.num_seq ? `${s.num_year}-${String(s.num_seq).padStart(3, "0")}` : "");

// Tableur : cellules protégées contre les formules
const cell = (v) => { const s = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };

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
