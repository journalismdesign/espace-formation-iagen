/* Accès aux données via Supabase (authentification, base, temps réel).
   Toutes les règles d'accès sont dans la base (RLS) : ce fichier ne fait
   que traduire les appels de l'interface. */
import { createClient } from "@supabase/supabase-js";

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

  const api = {
    mode: "supabase",

    /* ---------- Accès stagiaire par code personnel (fonction Edge « access ») ---------- */
    async sessionPublic(code) { return ok(await sb.rpc("session_public", { p_code: code }))?.[0] || null; },
    async requestAccess(sid, first_name, email) { return invoke("access", { action: "request", session_id: sid, first_name, email }); },
    async verifyAccess(sid, email, code) {
      const { token_hash } = await invoke("access", { action: "verify", session_id: sid, email, code });
      let r = await sb.auth.verifyOtp({ token_hash, type: "email" });
      if (r.error) r = await sb.auth.verifyOtp({ token_hash, type: "magiclink" });
      if (r.error) throw new Error("Ouverture de session impossible : " + r.error.message);
      profileCache = null;
      return true;
    },

    /* ---------- Identité visuelle et réglages ---------- */
    async listBrands() { return ok(await sb.from("brands").select("*").order("sort").order("name")); },
    async saveBrand(b) {
      const row = { name: b.name, logo: b.logo ?? null, logo_light: b.logo_light ?? null };
      if (b.id) return ok(await sb.from("brands").update(row).eq("id", b.id).select().single());
      return ok(await sb.from("brands").insert(row).select().single());
    },
    async deleteBrand(id) { ok(await sb.from("brands").delete().eq("id", id)); },
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
    async deleteSession(id) { ok(await sb.from("sessions").delete().eq("id", id)); },
    async duplicateSession(id) { return ok(await sb.rpc("duplicate_session", { p_session: id })); },
    async joinSession(code) { return ok(await sb.rpc("join_session", { p_code: code })); },
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
      const u = await api.currentUser();
      ok(await sb.from("responses").upsert({ session_id: sid, user_id: u.id, activity_id: activityId, value, created_at: new Date().toISOString() },
        { onConflict: "session_id,user_id,activity_id" }));
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
    async listThreads(sid) { return ok(await sb.from("threads").select("*, posts(count)").eq("session_id", sid).order("created_at", { ascending: false })).map((t) => ({ ...t, count: t.posts?.[0]?.count ?? 0 })); },
    async createThread(sid, title, body) { return ok(await sb.from("threads").insert({ session_id: sid, title, body }).select().single()); },
    async getThread(id) { return ok(await sb.from("threads").select("*").eq("id", id).maybeSingle()); },
    async listPosts(tid) { return ok(await sb.from("posts").select("*").eq("thread_id", tid).order("created_at")); },
    async addPost(tid, sid, body) { return ok(await sb.from("posts").insert({ thread_id: tid, session_id: sid, body }).select().single()); },
    async deleteThread(id) { ok(await sb.from("threads").delete().eq("id", id)); },
    async deletePost(id) { ok(await sb.from("posts").delete().eq("id", id)); },

    /* ---------- Temps réel ---------- */
    watch(sid, cb) {
      const ch = sb.channel("s-" + sid + "-" + Math.random().toString(36).slice(2, 7));
      const on = (table, filter) => ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, (p) => cb({ table, payload: p }));
      on("sessions", `id=eq.${sid}`);
      ["responses", "threads", "posts", "projects", "session_members"].forEach((t) => on(t, `session_id=eq.${sid}`));
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
