/* Mode démonstration : même interface que l'accès Supabase, mais tout est
   stocké dans le navigateur (localStorage). Chaque onglet a son propre
   compte (sessionStorage) : ouvrez un onglet formateur et un onglet
   stagiaire pour tester le direct. Aucune donnée ne quitte la machine. */

const KEY = "iagen-demo-db-v9";
const USER_KEY = "iagen-demo-user";
const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("iagen-demo") : null;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const code6 = () => Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, "0");
export const DEMO_TRAINER = "formateur@demo.fr";
export const DEMO_TRAINER_CODE = "SAMSA-DEMO"; // code formateur du mode démonstration

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch {}
  return null;
}
export const SESSION_DEFAULTS = { date2: null, start_time: "09:30", end_time: "17:30", brand_id: null, client_logo: null, client_logo_light: null,
  slides_url: "https://docs.google.com/presentation/d/1G-exjcmMujp3XtEAOMCyzR9Plk3OzgS1qnVdTI0rJkg/edit", emargement_url: "", emargement_qr: null, emargement_label: null, support_unlocked: false, decks: [], trainer_id: null, emargement2_enabled: true, emargement2_text: null,
  evaluation_url: null, evaluation_qr: null, evaluation_title: null, evaluation_text: null };

function seed(defaultActivities) {
  const sid = uid();
  const trainers = [{ id: uid(), name: "Gerald Holubowicz", photo: null,
    roles: [{ label: "Fondateur de", value: "Synth", url: "https://synthmedia.fr" }, { label: "Consultant média", value: "journalism.design", url: "https://journalism.design" },
      { label: "Enseignant", value: "Sciences Po", url: "" }, { label: "Formateur", value: "samsa.fr", url: "https://samsa.fr" }],
    tagline: "Depuis **fin 2017**, je travaille sur **les médias synthétiques**", tagline_sub: "Deepfakes & IA génératives",
    email: "hello@journalism.design", website: "https://journalism.design", socials: [{ label: "@gholubowicz", url: "" }], created_at: now() }];
  const brands = [["Radio France", 1], ["France Télévisions", 2], ["Libération", 3]].map(([name, sort]) => ({ id: uid(), name, logo: null, logo_light: null, sort }));
  const db = {
    trainers, brands, settings: { org_name: "Samsa", org_logo: null, org_logo_light: null, trainer_code: DEMO_TRAINER_CODE }, support: { [sid]: "https://exemple.fr/support-formation.pdf" }, codes: [],
    profiles: [], sessions: [{
      ...SESSION_DEFAULTS, id: sid, title: "Prendre en main les IA génératives", formation: "Prendre en main les IA génératives",
      client: "", brand_id: brands[2].id, date: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10), format: "1",
      code: "DEMO42", status: "live", trainer_id: trainers[0].id, activities: defaultActivities("1"), live: {}, created_at: now(),
      emargement_url: "https://exemple.fr/emargement",
    }],
    members: [], invites: [], resources: [
      { id: uid(), session_id: sid, title: "Gemini Notebook", url: "https://notebooklm.google.com", created_at: now() },
      { id: uid(), session_id: sid, title: "Charte IA de la rédaction (exemple)", url: "https://exemple.fr/charte", created_at: now() },
    ],
    secrets: [{ id: uid(), session_id: sid, label: "Compte Gemini de démonstration", value: "", created_at: now() }],
    projects: [], responses: [], threads: [], posts: [], usage: {},
  };
  save(db, false);
  return db;
}
function save(db, notify = true) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} // stockage indisponible : la démo vit en mémoire
  if (notify) bc?.postMessage({ t: Date.now() });
}

export function createDemoApi({ defaultActivities }) {
  let db = load() || seed(defaultActivities);
  const listeners = new Set();
  const refresh = () => { db = load() || db; listeners.forEach((f) => f()); };
  bc && (bc.onmessage = refresh);
  window.addEventListener("storage", (e) => e.key === KEY && refresh());
  const commit = () => { save(db); listeners.forEach((f) => f()); };

  let memUser = null; // repli si sessionStorage est indisponible
  const user = () => { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); } catch { return memUser; } };
  const setUser = (u) => { memUser = u; try { u ? sessionStorage.setItem(USER_KEY, JSON.stringify(u)) : sessionStorage.removeItem(USER_KEY); } catch {} };
  let authCb = () => {};
  const need = () => { const u = user(); if (!u) throw new Error("Connectez-vous d'abord."); return u; };
  const prof = (id) => db.profiles.find((p) => p.id === id);
  const isTrainer = () => prof(user()?.id)?.role === "trainer";
  const needTrainer = () => { if (!isTrainer()) throw new Error("Réservé aux formateur·ices."); };
  const isMember = (sid) => db.members.some((m) => m.session_id === sid && m.user_id === user()?.id);
  const canSee = (sid) => isTrainer() || isMember(sid);
  const nameOf = (id) => { const p = prof(id); return p ? (p.full_name || p.email.split("@")[0]) : "?"; };

  const lastDay = (x) => (x.format === "2" && x.date2) || x.date;
  const pub = (x) => {
    const b = db.brands.find((y) => y.id === x.brand_id);
    return { id: x.id, title: x.title, formation: x.formation, client: x.client || b?.name || "", date: x.date, date2: x.format === "2" ? x.date2 : null,
      start_time: x.start_time, end_time: x.end_time, format: x.format, status: x.status, client_logo: x.client_logo || b?.logo || null,
      client_logo_light: x.client_logo_light || b?.logo_light || null,
      org_name: db.settings.org_name, org_logo: db.settings.org_logo, org_logo_light: db.settings.org_logo_light,
      ...(() => { const k = (db.skins || []).find((y) => y.id === (x.skin_id || db.settings.default_skin)); return k ? { skin_id: k.id, skin_name: k.name, skin_accent: k.accent, skin_dark: k.dark, skin_logo: k.logo, skin_logo_light: k.logo_light, skin_footer: k.footer } : {}; })() };
  };

  const api = {
    mode: "demo",

    // Accès par code : en démonstration, le code s'affiche à l'écran au lieu d'être envoyé
    async sessionPublic(code) { const x = db.sessions.find((y) => y.code === String(code).trim().toUpperCase() && y.status !== "closed"); return x ? pub(x) : null; },
    async requestAccess(sid, first, email) {
      email = email.trim().toLowerCase();
      const x = db.sessions.find((y) => y.id === sid);
      if (!x || x.status === "closed") throw new Error("Session inconnue ou close.");
      if (!first.trim()) throw new Error("Indiquez votre prénom.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
      let p = db.profiles.find((y) => y.email === email);
      if (!p) { p = { id: uid(), email, full_name: first.trim(), role: email === DEMO_TRAINER ? "trainer" : "trainee", metier: null, niveau: null, outils: [], created_at: now() }; db.profiles.push(p); }
      else if (!p.full_name) p.full_name = first.trim();
      if (!db.members.some((m) => m.session_id === sid && m.user_id === p.id)) db.members.push({ session_id: sid, user_id: p.id, joined_at: now(), attended: false, progress: {} });
      const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (v) => A[v % A.length]).join("");
      const exp = new Date((lastDay(x) || new Date().toISOString().slice(0, 10)) + "T23:59:00").toISOString();
      db.codes = db.codes.filter((c) => !(c.session_id === sid && c.email === email));
      db.codes.push({ session_id: sid, email, code, expires_at: exp, attempts: 0 });
      commit();
      return { sent: true, expires_at: exp, demoCode: code };
    },
    async verifyAccess(sid, email, code) {
      email = email.trim().toLowerCase();
      const c = db.codes.find((y) => y.session_id === sid && y.email === email);
      if (!c || new Date(c.expires_at) < new Date()) throw new Error("Aucun code valide pour cette adresse : demandez-en un nouveau.");
      if (c.attempts >= 8) throw new Error("Trop d'essais : demandez un nouveau code.");
      if (c.code !== String(code).trim().toUpperCase()) { c.attempts++; commit(); throw new Error(`Code incorrect (${8 - c.attempts} essai(s) restant(s)).`); }
      c.attempts = 0; commit();
      const p = db.profiles.find((y) => y.email === email);
      setUser({ id: p.id, email }); authCb(user());
      return true;
    },

    async listTrainers() { if (!user()) throw new Error("Connectez-vous d'abord."); return [...(db.trainers || [])].sort((a, b) => a.name.localeCompare(b.name)); },
    async saveTrainer(t) {
      needTrainer(); db.trainers = db.trainers || [];
      const row = { name: t.name, photo: t.photo ?? null, roles: t.roles || [], tagline: t.tagline || null, tagline_sub: t.tagline_sub || null, email: t.email || null, website: t.website || null, socials: t.socials || [] };
      if (t.id) { const x = db.trainers.find((y) => y.id === t.id); Object.assign(x, row); commit(); return x; }
      const x = { id: uid(), created_at: now(), ...row }; db.trainers.push(x); commit(); return x;
    },
    async deleteTrainer(id) { needTrainer(); db.trainers = db.trainers.filter((x) => x.id !== id); db.sessions.forEach((x) => x.trainer_id === id && (x.trainer_id = null)); commit(); },
    async trainerCodeConfigured() { return !!(db.settings.trainer_code ?? DEMO_TRAINER_CODE); },
    async checkTrainerCode(code) { await new Promise((r) => setTimeout(r, 300)); return String(code).trim() === (db.settings.trainer_code ?? DEMO_TRAINER_CODE); },
    async sendTrainerOtp(email) {
      email = email.trim().toLowerCase();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      db.otp = { email, code, exp: Date.now() + 3600000 }; commit();
      return { sent: true, demoCode: code };
    },
    async verifyEmailOtp(email, token) {
      email = email.trim().toLowerCase();
      const o = db.otp;
      if (!o || o.email !== email || o.exp < Date.now() || o.code !== String(token).replace(/\s/g, "")) throw new Error("Code invalide ou expiré.");
      delete db.otp; commit();
      await api.signInEmail(email);
      return true;
    },
    async claimTrainer() { const u = user(); return !!u && prof(u.id)?.role === "trainer"; },
    async setTrainerCode(code) { needTrainer(); if (String(code).trim().length < 6) throw new Error("Le code doit compter au moins 6 caractères."); db.settings.trainer_code = String(code).trim(); commit(); return true; },
    async listBrands() { return [...db.brands].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)); },
    async saveBrand(b) {
      needTrainer();
      if (b.id) { const x = db.brands.find((y) => y.id === b.id); x.name = b.name; x.logo = b.logo ?? null; x.logo_light = b.logo_light ?? null; commit(); return x; }
      const x = { id: uid(), name: b.name, logo: b.logo ?? null, logo_light: b.logo_light ?? null, sort: 100 }; db.brands.push(x); commit(); return x;
    },
    async deleteBrand(id) { needTrainer(); db.brands = db.brands.filter((y) => y.id !== id); commit(); },
    async listSkins() { need(); return [...(db.skins || [])].sort((a, b) => a.name.localeCompare(b.name)); },
    async saveSkin(k) {
      needTrainer(); db.skins = db.skins || [];
      if (!k.name?.trim()) throw new Error("Indiquez un nom.");
      const row = { name: k.name.trim(), accent: k.accent || "#124F90", dark: k.dark || null, logo: k.logo ?? null, logo_light: k.logo_light ?? null, footer: k.footer || null };
      if (k.id) { const x = db.skins.find((y) => y.id === k.id); Object.assign(x, row); commit(); return x; }
      const x = { id: uid(), ...row }; db.skins.push(x); commit(); return x;
    },
    async deleteSkin(id) {
      needTrainer(); db.skins = (db.skins || []).filter((y) => y.id !== id);
      db.sessions.forEach((x) => { if (x.skin_id === id) x.skin_id = null; });
      if (db.settings.default_skin === id) db.settings.default_skin = null;
      commit();
    },
    async getSettings() { return { ...db.settings }; },
    async saveSetting(k, v) { needTrainer(); db.settings[k] = v; commit(); },

    async supportStatus(sid) {
      if (!canSee(sid)) throw new Error("Accès refusé.");
      const x = db.sessions.find((y) => y.id === sid), d = lastDay(x);
      const at = d ? new Date(new Date(`${d}T${x.end_time || "17:30"}:00`).getTime() - 3600000).toISOString() : null;
      const unlocked = !!x.support_unlocked || (!!at && Date.now() >= new Date(at).getTime());
      const url = db.support[sid] || null;
      return { unlocked, unlock_at: at, url: unlocked || isTrainer() ? url : null, configured: !!url };
    },
    async setSupport(sid, url) { needTrainer(); if (url) db.support[sid] = url; else delete db.support[sid]; commit(); },

    async currentUser() { return user(); },
    onAuthChange(cb) { authCb = cb; },
    async signInEmail(email, asTrainer = false) {
      email = email.trim().toLowerCase();
      let p = db.profiles.find((x) => x.email === email);
      if (!p) {
        p = { id: uid(), email, full_name: "", role: asTrainer || email === DEMO_TRAINER ? "trainer" : "trainee", metier: null, niveau: null, outils: [], created_at: now() };
        db.profiles.push(p); commit();
      }
      setUser({ id: p.id, email });
      authCb(user());
      return { sent: false };
    },
    async signInGoogle() { return api.signInEmail("prenom.nom@gmail.com"); },
    async signOut() { setUser(null); authCb(null); },

    async me() { const u = user(); return u ? { ...prof(u.id) } : null; },
    async updateMe(patch) {
      const p = prof(need().id);
      ["full_name", "metier", "niveau", "outils"].forEach((k) => patch[k] !== undefined && (p[k] = patch[k]));
      commit(); return { ...p };
    },
    async claimInvites() {
      const u = need(); let n = 0;
      db.invites.filter((i) => i.email === u.email).forEach((i) => {
        if (!db.members.some((m) => m.session_id === i.session_id && m.user_id === u.id)) { db.members.push({ session_id: i.session_id, user_id: u.id, joined_at: now(), attended: false, progress: {} }); n++; }
      });
      if (n) commit(); return n;
    },

    async listSessions() { return db.sessions.filter((s) => canSee(s.id)).sort((a, b) => (a.date || "9").localeCompare(b.date || "9")); },
    async getSession(id) { return canSee(id) ? db.sessions.find((s) => s.id === id) || null : null; },
    async createSession(s) {
      needTrainer();
      const row = { ...SESSION_DEFAULTS, id: uid(), formation: "Prendre en main les IA génératives", client: "", date: null, format: "1", code: code6(), status: "draft", activities: [], live: {}, created_at: now(), ...s };
      db.sessions.push(row); commit(); return row;
    },
    async updateSession(id, patch) {
      needTrainer(); const s = db.sessions.find((x) => x.id === id); Object.assign(s, patch);
      if (s.status === "closed") db.codes = db.codes.filter((c) => c.session_id !== id); // codes détruits à la clôture
      commit(); return s;
    },
    async deleteSession(id) {
      needTrainer();
      db.sessions = db.sessions.filter((s) => s.id !== id);
      ["members", "invites", "resources", "secrets", "projects", "responses", "threads", "posts"].forEach((t) => (db[t] = db[t].filter((r) => r.session_id !== id)));
      commit();
    },
    async duplicateSession(id) {
      needTrainer();
      const s = db.sessions.find((x) => x.id === id);
      const n = await api.createSession({ title: s.title + " (copie)", formation: s.formation, client: s.client, format: s.format, activities: s.activities,
        brand_id: s.brand_id, client_logo: s.client_logo, client_logo_light: s.client_logo_light, slides_url: s.slides_url, start_time: s.start_time, end_time: s.end_time, emargement_url: s.emargement_url, emargement_qr: s.emargement_qr,
        emargement_label: s.emargement_label, emargement2_enabled: s.emargement2_enabled, emargement2_text: s.emargement2_text, decks: s.decks,
        trainer_id: s.trainer_id, evaluation_url: s.evaluation_url, evaluation_qr: s.evaluation_qr, evaluation_title: s.evaluation_title, evaluation_text: s.evaluation_text });
      if (db.support[id]) db.support[n.id] = db.support[id];
      db.resources.filter((r) => r.session_id === id).forEach((r) => db.resources.push({ ...r, id: uid(), session_id: n.id }));
      db.secrets.filter((r) => r.session_id === id).forEach((r) => db.secrets.push({ ...r, id: uid(), session_id: n.id, value: "" }));
      commit(); return n.id;
    },
    async joinSession(code) {
      const u = need();
      const s = db.sessions.find((x) => x.code === code.trim().toUpperCase() && x.status !== "closed");
      if (!s) throw new Error("Code inconnu ou session close.");
      if (!db.members.some((m) => m.session_id === s.id && m.user_id === u.id)) { db.members.push({ session_id: s.id, user_id: u.id, joined_at: now(), attended: false, progress: {} }); commit(); }
      return s.id;
    },
    async memberCounts() { return db.members.reduce((a, r) => ((a[r.session_id] = (a[r.session_id] || 0) + 1), a), {}); },

    async listInvites(sid) { needTrainer(); return db.invites.filter((i) => i.session_id === sid); },
    async addInvites(sid, emails) {
      needTrainer();
      emails.forEach((email) => { if (!db.invites.some((i) => i.session_id === sid && i.email === email)) db.invites.push({ session_id: sid, email, created_at: now() }); });
      commit();
    },
    async removeInvite(sid, email) { needTrainer(); db.invites = db.invites.filter((i) => !(i.session_id === sid && i.email === email)); commit(); },
    async roster(sid) {
      needTrainer();
      return db.members.filter((m) => m.session_id === sid).map((m) => {
        const p = prof(m.user_id), pr = db.projects.find((x) => x.session_id === sid && x.user_id === m.user_id);
        return { user_id: m.user_id, email: p.email, full_name: p.full_name, metier: p.metier, niveau: p.niveau, attended: m.attended, joined_at: m.joined_at, progress: m.progress,
          project_id: pr?.id ?? null, project_status: pr?.status ?? null, project_title: pr?.data?.retenu?.titre ?? null, project_steps: pr?.data?.steps?.length ?? 0 };
      });
    },
    async setAttended(sid, u, v) { needTrainer(); const m = db.members.find((x) => x.session_id === sid && x.user_id === u); if (m) { m.attended = v; commit(); } },
    async removeMember(sid, u) { needTrainer(); db.members = db.members.filter((x) => !(x.session_id === sid && x.user_id === u)); commit(); },
    async myMembership(sid) { const u = need(); return db.members.find((m) => m.session_id === sid && m.user_id === u.id) || null; },
    async saveProgress(sid, progress) { const m = await api.myMembership(sid); if (m) { m.progress = progress; commit(); } },

    async myProject(sid) { const u = need(); return db.projects.find((p) => p.session_id === sid && p.user_id === u.id) || null; },
    async saveProject(sid, patch) {
      const u = need();
      if (!isMember(sid)) throw new Error("Rejoignez d'abord la session.");
      let p = await api.myProject(sid);
      if (!p) { p = { id: uid(), session_id: sid, user_id: u.id, data: {}, status: "draft", validated_at: null, question: "", trainer_comment: "", ai_generations: 0 }; db.projects.push(p); }
      ["data", "status", "validated_at", "question"].forEach((k) => patch[k] !== undefined && (p[k] = patch[k]));
      p.updated_at = now(); commit(); return { ...p };
    },
    async listProjects(sid) { needTrainer(); return db.projects.filter((p) => p.session_id === sid); },
    async commentProject(pid, text) { needTrainer(); const p = db.projects.find((x) => x.id === pid); p.trainer_comment = text; commit(); },

    async respond(sid, activity_id, value) {
      const u = need();
      if (!isMember(sid)) throw new Error("Rejoignez d'abord la session.");
      const r = db.responses.find((x) => x.session_id === sid && x.user_id === u.id && x.activity_id === activity_id);
      if (r) { r.value = value; r.created_at = now(); } else db.responses.push({ session_id: sid, user_id: u.id, activity_id, value, created_at: now() });
      commit();
    },
    async myResponse(sid, activity_id) { const u = need(); return db.responses.find((x) => x.session_id === sid && x.user_id === u.id && x.activity_id === activity_id)?.value; },
    async results(sid, activity_id) {
      if (!canSee(sid)) throw new Error("Accès refusé.");
      const m = new Map();
      db.responses.filter((r) => r.session_id === sid && r.activity_id === activity_id).forEach((r) => { const k = JSON.stringify(r.value); m.set(k, (m.get(k) || 0) + 1); });
      return [...m].map(([k, n]) => ({ value: JSON.parse(k), n }));
    },

    async listResources(sid) { return canSee(sid) ? db.resources.filter((r) => r.session_id === sid) : []; },
    async addResource(sid, r) { needTrainer(); const row = { id: uid(), session_id: sid, created_at: now(), ...r }; db.resources.push(row); commit(); return row; },
    async removeResource(id) { needTrainer(); db.resources = db.resources.filter((r) => r.id !== id); commit(); },
    async listSecrets(sid) { return canSee(sid) ? db.secrets.filter((r) => r.session_id === sid) : []; },
    async addSecret(sid, label, value = "") { needTrainer(); const row = { id: uid(), session_id: sid, label, value, created_at: now() }; db.secrets.push(row); commit(); return row; },
    async updateSecret(id, value) { needTrainer(); db.secrets.find((r) => r.id === id).value = value; commit(); },
    async removeSecret(id) { needTrainer(); db.secrets = db.secrets.filter((r) => r.id !== id); commit(); },

    async listThreads(sid) {
      if (!canSee(sid)) return [];
      return db.threads.filter((t) => t.session_id === sid).map((t) => ({ ...t, count: db.posts.filter((p) => p.thread_id === t.id).length })).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async createThread(sid, title, body) {
      const u = need(); if (!canSee(sid)) throw new Error("Accès refusé.");
      const t = { id: uid(), session_id: sid, author: u.id, author_name: nameOf(u.id), title, body, created_at: now() };
      db.threads.push(t); commit(); return t;
    },
    async getThread(id) { const t = db.threads.find((x) => x.id === id); return t && canSee(t.session_id) ? t : null; },
    async listPosts(tid) { return db.posts.filter((p) => p.thread_id === tid).sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async addPost(tid, sid, body) { const u = need(); const p = { id: uid(), thread_id: tid, session_id: sid, author: u.id, author_name: nameOf(u.id), body, created_at: now() }; db.posts.push(p); commit(); return p; },
    async deleteThread(id) { db.threads = db.threads.filter((t) => t.id !== id); db.posts = db.posts.filter((p) => p.thread_id !== id); commit(); },
    async deletePost(id) { db.posts = db.posts.filter((p) => p.id !== id); commit(); },

    watch(_sid, cb) { const f = () => cb({ table: "*" }); listeners.add(f); return () => listeners.delete(f); },

    // Pas de modèle de langage en démo : des réponses types, signalées comme telles
    async ai(mode, sid, extra = {}) {
      if (mode === "assistant") return null; // l'interface bascule sur la recherche locale
      const p = await api.myProject(sid);
      if (mode === "pistes") {
        if ((p?.ai_generations ?? 0) >= 3) throw new Error("Plus de génération disponible.");
        p.ai_generations = (p.ai_generations || 0) + 1; commit();
        const b = (extra.payload?.besoin || "votre besoin").slice(0, 80);
        return JSON.stringify([
          { titre: "Carnet de dossier sourcé", description: `Réunir dans Gemini Notebook les documents publics liés à « ${b} » et les interroger avec renvoi au passage cité. Chaque réponse est revérifiée sur le document.`, outil: "Gemini Notebook", niveau: "accessible" },
          { titre: "Fiche de préparation d'interview", description: "À partir de sources publiques, produire une fiche : positions, contradictions, questions ouvertes, chacune sourcée et datée.", outil: "Les deux", niveau: "accessible" },
          { titre: "Prompt maison réutilisable", description: "Écrire avec R·M·C·T·F un prompt pour une tâche répétitive du service, le tester sur deux assistants et comparer les écarts.", outil: "Assistant conversationnel", niveau: "intermédiaire" },
        ]);
      }
      const r = extra.payload?.retenu || {};
      return `FAISABILITÉ — « ${r.titre || "Votre cas"} » tient en une journée si vous limitez le corpus à cinq ou six documents publics et une seule tâche précise. (Réponse type du mode démonstration : en production, l'analyse est rédigée par le modèle à partir de votre cadrage.)

DONNÉES ET RISQUES — Classez chaque document avec le code couleur : rapports et articles publiés sans risque ; notes et brouillons nominatifs avec précaution, anonymisés ; identité des sources et documents sous embargo jamais.

PREMIER PROMPT R·M·C·T·F —
RÔLE Tu es documentaliste d'une rédaction d'information.
MISSION Aider un·e journaliste à préparer « ${r.titre || "ce dossier"} ».
CONTEXTE Appuie-toi uniquement sur les documents fournis. Public : rédaction interne.
TÂCHE Extrais les faits, chiffres et positions, chacun avec le document et la page.
FORMAT Tableau Fait | Source | Page, puis trois points à vérifier.
Si tu ne sais pas, dis-le. N'invente ni chiffre, ni citation, ni source.

VÉRIFICATION — 1. Chaque chiffre renvoie à un document et une page. 2. Aucune citation reformulée entre guillemets. 3. Les points contestés sont signalés comme tels.`;
    },

    // Outils propres à la démo
    reset() { try { localStorage.removeItem(KEY); } catch {} setUser(null); location.reload(); },
  };
  return api;
}
