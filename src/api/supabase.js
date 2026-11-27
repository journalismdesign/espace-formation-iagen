/* Accès aux données via Supabase (authentification, base, temps réel).
   Toutes les règles d'accès sont dans la base (RLS) : ce fichier ne fait
   que traduire les appels de l'interface. */
import { createClient } from "@supabase/supabase-js";
import { bankFromData } from "../lib/quizzes.js";

// Colonnes lisibles de trainers (login_email est réservé à l'équipe, lu par trainer_logins())
const TRAINER_COLS = "id, name, photo, roles, tagline, tagline_sub, email, website, socials, created_at";
// Bibliothèque « Quiz et sondages » : table absente tant que la migration n'est pas exécutée
const BANK_COLS = "id, kind, titre, content, updated_at";
const NO_BANK = /quiz_bank|schema cache|does not exist/i;
const BANK_MIG = "Bibliothèque pas encore activée : la migration 20261126000000_quiz_sondages.sql doit être exécutée sur Supabase.";

export function createSupabaseApi(url, anonKey) {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const redirect = () => location.origin + location.pathname;
  let profileCache = null;

  const invoke = async (fn, body) => {
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      let msg = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch {}
      throw new Error(msg.charAt(0).toUpperCase() + msg.slice(1) + ".");
    }
    return data;
  };
  // Jeton à usage unique de la fonction access → session Supabase dans ce navigateur
  const openWith = async (token_hash) => {
    let r = await sb.auth.verifyOtp({ token_hash, type: "email" });
    if (r.error) r = await sb.auth.verifyOtp({ token_hash, type: "magiclink" });
    if (r.error) throw new Error("Ouverture de session impossible : " + r.error.message);
    profileCache = null;
  };

  const api = {
    mode: "supabase",

    /* ---------- Accès stagiaire par code personnel (fonction Edge « access ») ---------- */
    async sessionPublic(code) { return ok(await sb.rpc("session_public", { p_code: code }))?.[0] || null; },
    // Réveille la fonction Edge « access » (démarrage à froid) pendant que le stagiaire saisit son nom
    warmAccess() { fetch(`${url}/functions/v1/access`, { method: "OPTIONS" }).catch(() => {}); },
    // Accès direct accordé par l'équipe : la fonction renvoie aussitôt un jeton de connexion ({ direct: true }), sans e-mail
    async requestAccess(sid, first_name, email) {
      const r = await invoke("access", { action: "request", session_id: sid, first_name, email });
      if (r?.token_hash) { await openWith(r.token_hash); return { direct: true }; }
      return r;
    },
    // Code remis à la main par l'équipe (adresse qui ne reçoit pas l'e-mail) : aucun envoi, le code revient en clair
    async issueAccess(sid, first_name, email) {
      try { return await invoke("access", { action: "issue", session_id: sid, first_name, email }); }
      catch (e) { if (/action inconnue/i.test(e.message)) throw new Error("Générateur pas encore activé : la fonction access doit être redéployée sur Supabase."); throw e; }
    },
    // Accès direct : compte créé et inscrit, entrée sans code une seule fois (action « grant »)
    async grantAccess(sid, first_name, email) {
      try { return await invoke("access", { action: "grant", session_id: sid, first_name, email }); }
      catch (e) { if (/action inconnue/i.test(e.message)) throw new Error("Accès direct pas encore activé : la fonction access doit être redéployée sur Supabase."); throw e; }
    },
    async verifyAccess(sid, email, code) {
      const { token_hash } = await invoke("access", { action: "verify", session_id: sid, email, code });
      await openWith(token_hash);
      return true;
    },

    /* ---------- Profils des intervenant·es ---------- */
    // Adresses de connexion (login_email) : illisibles pour les stagiaires, lues par l'équipe via trainer_logins()
    async listTrainers() {
      const list = ok(await sb.from("trainers").select(TRAINER_COLS).order("name"));
      const { data: logins } = await sb.rpc("trainer_logins"); // vide (ou refusé) hors équipe
      const by = Object.fromEntries((logins || []).map((r) => [r.id, r.login_email]));
      return list.map((t) => ({ ...t, login_email: by[t.id] ?? null }));
    },
    async saveTrainer(t) {
      const row = { name: t.name, login_email: (t.login_email || "").trim().toLowerCase() || null, photo: t.photo ?? null, roles: t.roles || [], tagline: t.tagline || null, tagline_sub: t.tagline_sub || null, email: t.email || null, website: t.website || null, socials: t.socials || [] };
      const saved = t.id ? ok(await sb.from("trainers").update(row).eq("id", t.id).select(TRAINER_COLS).single())
        : ok(await sb.from("trainers").insert(row).select(TRAINER_COLS).single());
      return { ...saved, login_email: row.login_email };
    },
    async deleteTrainer(id) { ok(await sb.from("trainers").delete().eq("id", id)); },
    /* ---------- Équipe (admin) ---------- */
    // Liste avec rôle et date de fin d'invitation (list_team) ; avant la migration …_invites_lecture : list_staff
    async listStaff() {
      const r = await sb.rpc("list_team");
      if (!r.error) return r.data || [];
      return (ok(await sb.rpc("list_staff")) || []).map((s) => ({ ...s, role: s.is_admin ? "admin" : "trainer", guest_until: null }));
    },
    // role : trainer, admin ou guest (invité·e : ses sessions de démo, jusqu'à `until`). L'ancienne signature sert pour
    // formateur·ice et admin, ce qui marche avant comme après la migration.
    async saveStaff(email, role, until = null) {
      if (role === "guest") {
        const r = await sb.rpc("save_staff", { p_email: email, p_role: "guest", p_until: until || null });
        if (r.error && /function|schema cache/i.test(r.error.message)) throw new Error("Invité·es : exécutez d'abord la migration 20261128000000_invites_lecture.sql dans Supabase.");
        ok(r); return;
      }
      ok(await sb.rpc("save_staff", { p_email: email, p_admin: role === "admin" }));
    },
    async removeStaff(email) { ok(await sb.rpc("remove_staff", { p_email: email })); },

    /* ---------- Code d'accès formateur ---------- */
    async trainerCodeConfigured() { return ok(await sb.rpc("trainer_code_configured")); },
    async checkTrainerCode(code) { return ok(await sb.rpc("check_trainer_code", { p_code: code })); },
    async setTrainerCode(code) { ok(await sb.rpc("set_trainer_code", { p_code: code })); return true; },
    /* Première connexion / code oublié : code à usage unique envoyé par Supabase Auth */
    async sendTrainerOtp(email) {
      ok(await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect() + "#/formateur", shouldCreateUser: true } }));
      return { sent: true };
    },
    // Invité·e : code par e-mail (le lien éventuel de l'e-mail mène au back-office)
    async sendGuestOtp(email) {
      ok(await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect() + "#/admin", shouldCreateUser: true } }));
      return { sent: true };
    },
    async verifyEmailOtp(email, token) {
      ok(await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: String(token).replace(/\s/g, ""), type: "email" }));
      profileCache = null; return true;
    },
    async claimTrainer() { profileCache = null; return !!ok(await sb.rpc("claim_trainer")); },

    /* ---------- Identité visuelle et réglages ---------- */
    async listBrands() { return ok(await sb.from("brands").select("*").order("sort").order("name")); },
    async saveBrand(b) {
      const row = { name: b.name, logo: b.logo ?? null, logo_light: b.logo_light ?? null };
      if (b.id) return ok(await sb.from("brands").update(row).eq("id", b.id).select().single());
      return ok(await sb.from("brands").insert(row).select().single());
    },
    async deleteBrand(id) { ok(await sb.from("brands").delete().eq("id", id)); },
    /* ---------- Habillages (centres de formation) ---------- */
    async listSkins() { return ok(await sb.from("skins").select("*").order("name")); },
    async saveSkin(k) {
      const row = { name: k.name, accent: k.accent || "#124F90", dark: k.dark || null, logo: k.logo ?? null, logo_light: k.logo_light ?? null, footer: k.footer || null };
      if (k.id) return ok(await sb.from("skins").update(row).eq("id", k.id).select().single());
      return ok(await sb.from("skins").insert(row).select().single());
    },
    async deleteSkin(id) { ok(await sb.from("skins").delete().eq("id", id)); },
    // Bibliothèque « Quiz et sondages ». Sans la migration : contenu de data.js en lecture seule (ready: false)
    async listBank() {
      const { data, error } = await sb.from("quiz_bank").select(BANK_COLS).order("titre");
      if (error) { if (NO_BANK.test(error.message)) return { ready: false, items: bankFromData() }; throw new Error(error.message); }
      return { ready: true, items: data || [] };
    },
    // Trames de conducteur (#/admin/trames) : lues par l'équipe, modifiées par l'administration. Sans la migration : ready false
    async listTrames() {
      const r = await sb.from("conducteur_templates").select("id, titre, content, updated_at").order("updated_at", { ascending: false });
      if (r.error && /conducteur_templates|schema cache|does not exist/i.test(r.error.message)) return { ready: false, items: [] };
      return { ready: true, items: ok(r) || [] };
    },
    async saveTrame({ id, titre, content }) {
      const row = { titre, content };
      return ok(id ? await sb.from("conducteur_templates").update(row).eq("id", id).select("id, titre, content, updated_at").single()
        : await sb.from("conducteur_templates").insert(row).select("id, titre, content, updated_at").single());
    },
    async deleteTrame(id) { ok(await sb.from("conducteur_templates").delete().eq("id", id)); },
    async saveBankItem(it) {
      const { data, error } = await sb.from("quiz_bank").upsert({ id: it.id, kind: it.kind, titre: it.titre, content: it.content }).select(BANK_COLS).single();
      if (error) throw new Error(NO_BANK.test(error.message) ? BANK_MIG : /row-level security/i.test(error.message) ? "Réservé à l'administration." : error.message);
      return data;
    },
    async deleteBankItem(id) { ok(await sb.from("quiz_bank").delete().eq("id", id)); },
    async getSettings() { return Object.fromEntries(ok(await sb.from("app_settings").select("*")).map((r) => [r.key, r.value])); },
    async saveSetting(key, value) { ok(await sb.from("app_settings").upsert({ key, value })); },

    /* ---------- Support de formation ---------- */
    async supportStatus(sid) { return ok(await sb.rpc("support_status", { p_session: sid }))?.[0] || { unlocked: false, configured: false }; },
    async setSupport(sid, url) {
      if (!url) ok(await sb.from("session_support").delete().eq("session_id", sid));
      else ok(await sb.from("session_support").upsert({ session_id: sid, url }));
    },

    /* ---------- Authentification ---------- */
    async currentUser() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((_e, session) => { profileCache = null; cb(session?.user ? { id: session.user.id, email: session.user.email } : null); });
    },
    async signInEmail(email) {
      ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } }));
      return { sent: true };
    },
    async signInGoogle() {
      ok(await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect() } }));
    },
    async signOut() { profileCache = null; await sb.auth.signOut(); },

    /* ---------- Profil ---------- */
    async me(force = false) {
      if (profileCache && !force) return profileCache;
      const u = await api.currentUser(); if (!u) return null;
      profileCache = ok(await sb.from("profiles").select("*").eq("id", u.id).single());
      // Invité·e : date de fin et accès en cours (le bandeau l'affiche ; la base, elle, ferme tout à la date dite)
      if (profileCache?.role === "guest") {
        const g = (await sb.rpc("guest_status")).data?.[0];
        profileCache = { ...profileCache, guest_until: g?.until || null, guest_active: !!g?.active };
      }
      return profileCache;
    },
    async updateMe(patch) {
      const u = await api.currentUser();
      const { full_name, metier, niveau, outils } = patch;
      const clean = Object.fromEntries(Object.entries({ full_name, metier, niveau, outils }).filter(([, v]) => v !== undefined));
      profileCache = ok(await sb.from("profiles").update(clean).eq("id", u.id).select().single());
      return profileCache;
    },
    async claimInvites() { return ok(await sb.rpc("claim_invites")); },

    /* ---------- Sessions ---------- */
    async listSessions() { return ok(await sb.from("sessions").select("*").order("date", { ascending: true, nullsFirst: false })); },
    async getSession(id) { return ok(await sb.from("sessions").select("*").eq("id", id).maybeSingle()); },
    async createSession(s) { return ok(await sb.from("sessions").insert(s).select().single()); },
    async updateSession(id, patch) { return ok(await sb.from("sessions").update(patch).eq("id", id).select().single()); },
    // Clôture automatique des sessions finies (15 min après l'heure de fin, le dernier jour) ; sans la migration : rien
    async closeFinished() { const r = await sb.rpc("close_finished_sessions"); return r.error ? 0 : r.data || 0; },
    async deleteSession(id) { ok(await sb.from("sessions").delete().eq("id", id)); },
    // opts : { title, date, date2, invites (mêmes stagiaires), secretValues (valeurs des codes d'accès) }
    async duplicateSession(id, o = {}) {
      return ok(await sb.rpc("duplicate_session", { p_session: id, p_title: o.title || null, p_date: o.date || null, p_date2: o.date2 || null, p_invites: !!o.invites, p_secret_values: !!o.secretValues }));
    },
    // join_session renvoie null sans erreur quand l'entrée est refusée (pour que la limite anti-abus soit comptée)
    async joinSession(code) { const sid = ok(await sb.rpc("join_session", { p_code: code })); if (!sid) throw new Error("Code inconnu, session close ou réservée aux personnes invitées."); return sid; },
    async memberCounts() {
      const rows = ok(await sb.from("session_members").select("session_id"));
      return rows.reduce((a, r) => ((a[r.session_id] = (a[r.session_id] || 0) + 1), a), {});
    },

    /* ---------- Invitations et participant·es ---------- */
    async listInvites(sid) { return ok(await sb.from("session_invites").select("*").eq("session_id", sid).order("email")); },
    async addInvites(sid, emails) {
      const rows = emails.map((email) => ({ session_id: sid, email }));
      ok(await sb.from("session_invites").upsert(rows, { onConflict: "session_id,email", ignoreDuplicates: true }));
    },
    async removeInvite(sid, email) { ok(await sb.from("session_invites").delete().eq("session_id", sid).eq("email", email)); },
    async roster(sid) { return ok(await sb.rpc("session_roster", { p_session: sid })); },
    // Émargement par demi-journée et adresses des stagiaires (migration …_numeros_emargements.sql)
    async signPresence(sid, slot) { return ok(await sb.rpc("sign_presence", { p_session: sid, p_slot: slot })); },
    async setPresence(sid, uid, slot, v) { return ok(await sb.rpc("set_presence", { p_session: sid, p_user: uid, p_slot: slot, p_value: v })); },
    async presence(sid) { return ok(await sb.rpc("session_presence", { p_session: sid })); },
    async listTrainees() { return ok(await sb.rpc("list_trainees")); },
    async setAttended(sid, uid, v) { ok(await sb.rpc("set_attended", { p_session: sid, p_user: uid, p_value: v })); },
    async removeMember(sid, uid) { ok(await sb.from("session_members").delete().eq("session_id", sid).eq("user_id", uid)); },
    async myMembership(sid) {
      const u = await api.currentUser();
      return ok(await sb.from("session_members").select("*").eq("session_id", sid).eq("user_id", u.id).maybeSingle());
    },
    async saveProgress(sid, progress) {
      const u = await api.currentUser();
      ok(await sb.from("session_members").update({ progress }).eq("session_id", sid).eq("user_id", u.id));
    },

    /* ---------- Cadrages ---------- */
    async myProject(sid) {
      const u = await api.currentUser();
      return ok(await sb.from("projects").select("*").eq("session_id", sid).eq("user_id", u.id).maybeSingle());
    },
    async saveProject(sid, patch) {
      const cur = await api.myProject(sid);
      const fields = {}; ["data", "status", "validated_at", "question"].forEach((k) => patch[k] !== undefined && (fields[k] = patch[k]));
      if (cur) return ok(await sb.from("projects").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", cur.id).select().single());
      return ok(await sb.from("projects").insert({ session_id: sid, ...fields }).select().single());
    },
    async listProjects(sid) { return ok(await sb.from("projects").select("*").eq("session_id", sid)); },
    async commentProject(pid, text) { ok(await sb.rpc("comment_project", { p_project: pid, p_comment: text })); },

    /* ---------- Activités en direct ---------- */
    async respond(sid, activityId, value) {
      ok(await sb.rpc("submit_response", { p_session: sid, p_activity: activityId, p_value: value }));
    },
    async myResponse(sid, activityId) {
      const u = await api.currentUser();
      const r = ok(await sb.from("responses").select("value").eq("session_id", sid).eq("user_id", u.id).eq("activity_id", activityId).maybeSingle());
      return r ? r.value : undefined;
    },
    async results(sid, activityId) {
      return ok(await sb.rpc("live_results", { p_session: sid, p_activity: activityId })).map((r) => ({ value: r.value, n: Number(r.n) }));
    },

    /* ---------- Ressources et accès ---------- */
    async listResources(sid) { return ok(await sb.from("resources").select("*").eq("session_id", sid).order("created_at")); },
    async addResource(sid, r) { return ok(await sb.from("resources").insert({ session_id: sid, ...r }).select().single()); },
    async removeResource(id) { ok(await sb.from("resources").delete().eq("id", id)); },
    async listSecrets(sid) { return ok(await sb.from("session_secrets").select("*").eq("session_id", sid).order("created_at")); },
    async addSecret(sid, label, value = "") { return ok(await sb.from("session_secrets").insert({ session_id: sid, label, value }).select().single()); },
    async updateSecret(id, value) { ok(await sb.from("session_secrets").update({ value }).eq("id", id)); },
    async removeSecret(id) { ok(await sb.from("session_secrets").delete().eq("id", id)); },

    /* ---------- Discussion ---------- */
    async listThreads(sid) {
      const rows = ok(await sb.from("threads").select("*, posts(count), recent:posts(created_at)").eq("session_id", sid)
        .order("created_at", { ascending: false }).order("created_at", { referencedTable: "recent", ascending: false }).limit(1, { referencedTable: "recent" }));
      return rows.map(({ posts, recent, ...t }) => ({ ...t, count: posts?.[0]?.count ?? 0, last: recent?.[0]?.created_at || t.created_at }));
    },
    async createThread(sid, title, body) { return ok(await sb.from("threads").insert({ session_id: sid, title, body }).select().single()); },
    async getThread(id) { return ok(await sb.from("threads").select("*").eq("id", id).maybeSingle()); },
    async listPosts(tid) { return ok(await sb.from("posts").select("*").eq("thread_id", tid).order("created_at")); },
    async addPost(tid, sid, body) { return ok(await sb.from("posts").insert({ thread_id: tid, session_id: sid, body }).select().single()); },
    async deleteThread(id) { ok(await sb.from("threads").delete().eq("id", id)); },
    // Efface toute la discussion d'une session (équipe) : les messages partent avec leurs conversations (on delete cascade)
    async clearDiscussion(sid) { ok(await sb.from("threads").delete().eq("session_id", sid)); },
    async deletePost(id) { ok(await sb.from("posts").delete().eq("id", id)); },

    /* ---------- Temps réel ---------- */
    // tables : limiter l'abonnement (côté stagiaire, la session seule) — chaque table suivie coûte au serveur
    // une vérification des droits par abonné et par écriture
    watch(sid, cb, tables = ["sessions", "responses", "threads", "posts", "projects", "session_members"]) {
      const ch = sb.channel("s-" + sid + "-" + Math.random().toString(36).slice(2, 7));
      const on = (table, filter) => ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, (p) => cb({ table, payload: p }));
      if (tables.includes("sessions")) on("sessions", `id=eq.${sid}`);
      tables.filter((t) => t !== "sessions").forEach((t) => on(t, `session_id=eq.${sid}`));
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },

    /* ---------- IA (fonction Edge « assistant ») ---------- */
    async ai(mode, sid, extra = {}) {
      try { return (await invoke("assistant", { mode, session_id: sid, ...extra })).text; }
      catch (e) { throw new Error("Assistant : " + e.message); }
    },
  };
  return api;
}
