/* Mode invitation : l'API vue par un·e invité·e (rôle « guest »). Seules les lectures passent ; toute écriture
   renvoie une promesse rejetée avec un message clair (jamais d'exception synchrone : plusieurs appels enchaînent
   .catch()). Ce n'est qu'un garde-fou de l'interface : la base refuse de toute façon (…_invites_lecture.sql).
   Quelques lectures sont adaptées : discussion aux auteurs masqués, ni invitations ni codes d'exercice, jamais
   de participation à une session (l'aperçu côté stagiaire reste un aperçu). */
import { READ_ONLY_MSG } from "../lib/roles.js";

const READ = new Set([
  // connexion et compte
  "currentUser", "me", "onAuthChange", "signInEmail", "signInGoogle", "signOut", "sendTrainerOtp", "verifyEmailOtp",
  "trainerCodeConfigured", "checkTrainerCode", "sessionPublic", "warmAccess",
  // lectures du back-office
  "listSessions", "getSession", "memberCounts", "roster", "listProjects", "results", "listResources", "supportStatus",
  "listTrainers", "listStaff", "listBrands", "listSkins", "listBank", "getSettings", "guestDiscussion", "watch",
]);

export function readOnlyApi(api) {
  // Discussion masquée : une lecture par session, réutilisée quelques secondes (liste des conversations puis messages)
  let disc = null;
  const load = async (sid) => {
    if (disc && disc.sid === sid && Date.now() - disc.t < 4000) return disc;
    const rows = await api.guestDiscussion(sid);
    const posts = rows.filter((r) => r.kind === "post").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const threads = rows.filter((r) => r.kind === "thread").map((t) => {
      const ps = posts.filter((p) => p.thread_id === t.id);
      return { ...t, session_id: sid, count: ps.length, last: ps.at(-1)?.created_at || t.created_at };
    });
    return (disc = { sid, t: Date.now(), threads, posts: posts.map((p) => ({ ...p, session_id: sid })) });
  };
  const over = {
    listThreads: async (sid) => (await load(sid)).threads,
    getThread: async (id) => disc?.threads.find((t) => t.id === id) || null,
    listPosts: async (tid) => { if (!disc) return []; disc.t = 0; await load(disc.sid); return disc.posts.filter((p) => p.thread_id === tid); },
    myMembership: async () => null, // l'aperçu côté stagiaire reste un aperçu, même pour un·e ancien·ne stagiaire
    myProject: async () => null,
    myResponse: async () => null,
    listInvites: async () => [], // adresses masquées
    listSecrets: async () => [], // codes d'exercice : jamais
    claimInvites: async () => 0,
  };
  return new Proxy(api, {
    get(target, key) {
      if (key in over) return over[key];
      const v = target[key];
      if (typeof v !== "function") return v;
      if (READ.has(key)) return v.bind(target);
      return async () => { throw new Error(READ_ONLY_MSG); };
    },
  });
}
