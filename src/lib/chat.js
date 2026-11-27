/* Discussion façon messagerie (Signal, Messenger) : conversations à gauche,
   fil de bulles à droite, saisie en bas. Sert côté stagiaire (onglet
   Discussion) et dans le back-office (widget de la session).
   Les conversations sont les `threads`, les messages les `posts` ; le texte
   d'ouverture d'un ancien sujet (`threads.body`) s'affiche comme premier message. */
import { $, $$, T, esc, guard, debounce } from "./dom.js";

const GENERAL = "Général";
const hm = (d) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayKey = (d) => new Date(d).toDateString();
function dayLabel(d) {
  const x = new Date(d), today = new Date(), yest = new Date(Date.now() - 864e5);
  if (x.toDateString() === today.toDateString()) return "Aujourd’hui";
  if (x.toDateString() === yest.toDateString()) return "Hier";
  return x.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function initials(name = "?") {
  const p = String(name).trim().split(/[\s.@_-]+/).filter(Boolean);
  return ((p[0]?.[0] || "?") + (p[1]?.[0] || "")).toUpperCase();
}
// Une teinte stable par personne, prise dans la palette de l'habillage
const HUES = ["var(--blue)", "var(--navy)", "var(--sky)", "var(--muted)", "var(--ok)", "var(--disc)"];
const hueOf = (id = "") => HUES[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

/**
 * Monte la messagerie dans `el`.
 * opts : { api, sid, me, staff (droits de modération), compact (widget), title, readOnly (invité·e : lecture seule,
 *         auteurs masqués par l'API, sans saisie ni suppression, relu toutes les 20 s faute de temps réel) }
 * Renvoie une fonction de nettoyage.
 */
export function mountChat(el, { api, sid, me, staff = false, compact = false, readOnly = false }) {
  let threads = [], cur = null, posts = [], dead = false, mobileList = true;
  if (readOnly) staff = false;
  el.classList.add("chat");
  el.classList.toggle("chat-ro", readOnly);
  el.classList.toggle("compact", compact);
  el.innerHTML = `
    <div class="chat-list">
      <div class="chat-list-head"><b>Conversations</b>${readOnly ? "" : `<button class="chat-new" type="button" title="Nouvelle conversation" aria-label="Nouvelle conversation">+</button>`}</div>
      <form class="chat-newf" hidden><input type="text" maxlength="160" placeholder="Nom de la conversation" required><button class="btn sm" type="submit">Créer</button></form>
      <div class="chat-convs" role="list"></div>
    </div>
    <div class="chat-pane">
      <div class="chat-head"><button class="chat-back" type="button" aria-label="Retour aux conversations">‹</button><div class="chat-title"></div>${staff ? `<button class="chat-clear" type="button" title="Supprimer tous les messages de la session">Tout effacer</button>` : ""}</div>
      <div class="chat-msgs" aria-live="polite"></div>
      <form class="chat-compose"${readOnly ? " hidden" : ""}>
        <textarea rows="1" maxlength="4000" placeholder="Votre message" aria-label="Votre message"></textarea>
        <button class="chat-send" type="submit" aria-label="Envoyer" title="Envoyer (Entrée)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg></button>
      </form>
    </div>`;
  const list = $(".chat-convs", el), msgs = $(".chat-msgs", el), ta = $("textarea", el), title = $(".chat-title", el);
  const setMobile = (v) => { mobileList = v; el.classList.toggle("show-list", v); };

  const nearBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
  const toBottom = () => { msgs.scrollTop = msgs.scrollHeight; };

  function drawList() {
    if (!threads.length) { list.innerHTML = `<p class="chat-empty small">${readOnly ? "Aucune conversation pour l'instant." : `Aucune conversation. Écrivez le premier message : la conversation « ${GENERAL} » sera créée.`}</p>`; return; }
    list.innerHTML = threads.map((t) => `<button type="button" role="listitem" class="chat-conv${cur?.id === t.id ? " cur" : ""}" data-t="${t.id}">
      <span class="chat-av sq" style="background:${hueOf(t.id)}">#</span>
      <span class="chat-conv-txt"><b>${T(t.title)}</b><span class="small">${t.count} message${t.count > 1 ? "s" : ""}</span></span>
      <span class="chat-conv-time small">${hm(t.last || t.created_at)}</span></button>`).join("");
    $$("[data-t]", list).forEach((b) => (b.onclick = () => open(b.dataset.t)));
  }

  function drawMsgs(keepBottom) {
    const stick = keepBottom ?? nearBottom();
    if (!cur) { title.innerHTML = `<b>${GENERAL}</b>`; msgs.innerHTML = `<div class="chat-hint">Posez une question, partagez un lien ou un retour d’expérience. Les participant·es de la session et l’équipe pédagogique lisent cette conversation.</div>`; return; }
    title.innerHTML = `<b>${T(cur.title)}</b><span class="small">Participant·es et équipe pédagogique</span>`;
    const all = (cur.body ? [{ id: "t-" + cur.id, author: cur.author, author_name: cur.author_name, body: cur.body, created_at: cur.created_at, staff: cur.staff, opening: true }] : []).concat(posts);
    if (!all.length) { msgs.innerHTML = `<div class="chat-hint">Pas encore de message ici. Lancez la conversation.</div>`; return; }
    let html = "", prevDay = null, prev = null;
    all.forEach((m) => {
      const d = dayKey(m.created_at);
      if (d !== prevDay) { html += `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`; prev = null; prevDay = d; }
      const mine = m.author === me?.id;
      const grouped = prev && prev.author === m.author && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60e3;
      const canDel = !m.opening && (mine || staff);
      html += `<div class="chat-row${mine ? " mine" : ""}${grouped ? " grouped" : ""}">
        ${mine ? "" : `<span class="chat-av" style="background:${hueOf(m.author)}" aria-hidden="true">${grouped ? "" : esc(initials(m.author_name))}</span>`}
        <div class="chat-bubble${m.staff ? " staff" : ""}">
          ${!mine && !grouped ? `<div class="chat-from">${T(m.author_name)}${m.staff ? ` <span class="chat-badge">Équipe</span>` : ""}</div>` : ""}
          <div class="chat-body">${linkify(m.body)}</div>
          <div class="chat-meta">${hm(m.created_at)}${canDel ? ` <button type="button" class="chat-del" data-del="${m.id}" aria-label="Supprimer le message" title="Supprimer">✕</button>` : ""}</div>
        </div></div>`;
      prev = m;
    });
    msgs.innerHTML = html;
    $$("[data-del]", msgs).forEach((b) => (b.onclick = async () => { if (confirm("Supprimer ce message ?")) { await guard(() => api.deletePost(b.dataset.del)); refreshMsgs(); } }));
    if (stick) toBottom();
  }

  async function loadThreads() {
    const t = await api.listThreads(sid).catch(() => []);
    // la conversation la plus récente en haut, « Général » toujours en tête
    threads = t.sort((a, b) => (a.title === GENERAL ? -1 : b.title === GENERAL ? 1 : String(b.last || b.created_at).localeCompare(String(a.last || a.created_at))));
  }
  async function refreshMsgs(force) {
    if (!cur) return drawMsgs();
    const p = await api.listPosts(cur.id).catch(() => []);
    if (!force && p.length === posts.length && p.at(-1)?.id === posts.at(-1)?.id) return;
    posts = p; drawMsgs();
  }
  async function open(id) {
    cur = threads.find((t) => t.id === id) || null;
    posts = [];
    drawList();
    setMobile(false);
    await refreshMsgs(true);
    toBottom();
    if (!compact) ta.focus();
  }

  // Envoi : Entrée envoie, Maj+Entrée va à la ligne
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; };
  ta.oninput = grow;
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $(".chat-compose", el).requestSubmit(); } };
  $(".chat-compose", el).onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim(); if (!text) return;
    ta.disabled = true;
    try {
      if (!cur) { // première prise de parole : on ouvre « Général »
        const t = await guard(() => api.createThread(sid, GENERAL, ""));
        if (!t) return;
        await loadThreads(); cur = threads.find((x) => x.id === t.id) || t;
      }
      const ok = await guard(() => api.addPost(cur.id, sid, text));
      if (ok) { ta.value = ""; grow(); await loadThreads(); drawList(); await refreshMsgs(true); toBottom(); }
    } finally { ta.disabled = false; if (!compact) ta.focus(); }
  };
  if (!readOnly) $(".chat-new", el).onclick = () => { const f = $(".chat-newf", el); f.hidden = !f.hidden; if (!f.hidden) $("input", f).focus(); };
  $(".chat-newf", el).onsubmit = async (e) => {
    e.preventDefault();
    const name = $(".chat-newf input", el).value.trim(); if (!name) return;
    const t = await guard(() => api.createThread(sid, name, ""));
    if (t) { $(".chat-newf", el).hidden = true; $(".chat-newf input", el).value = ""; await loadThreads(); open(t.id); }
  };
  $(".chat-back", el).onclick = () => setMobile(true);
  // Équipe : effacer toute la discussion de la session (toutes les conversations et tous les messages)
  if (staff) $(".chat-clear", el).onclick = async () => {
    const n = threads.reduce((a, t) => a + (t.count || 0), 0);
    if (!threads.length) return;
    if (!confirm(`Supprimer définitivement toute la discussion de la session (${threads.length} conversation${threads.length > 1 ? "s" : ""}, ${n} message${n > 1 ? "s" : ""}) ? Cette action est irréversible.`)) return;
    if (await guard(() => api.clearDiscussion(sid).then(() => true), "Discussion effacée.")) { cur = null; posts = []; await loadThreads(); drawList(); drawMsgs(); }
  };

  // Temps réel : nouveaux messages et conversations
  const onChange = debounce(async (e) => {
    if (dead) return;
    if (e.table === "threads" || e.table === "posts" || e.table === "*") {
      await loadThreads(); drawList();
      if (!cur || !threads.some((t) => t.id === cur.id)) { cur = threads[0] || null; posts = []; drawList(); return refreshMsgs(true).then(toBottom); }
      await refreshMsgs();
    }
  }, 250);
  const unwatch = api.watch(sid, onChange, ["threads", "posts"]);

  (async () => {
    await loadThreads();
    cur = threads[0] || null;
    drawList();
    await refreshMsgs(true);
    setMobile(!cur && threads.length > 0);
    toBottom();
  })();

  // Lecture seule : pas de temps réel sur la discussion pour l'invité·e (la base ne le lui envoie pas), on relit
  const poll = readOnly ? setInterval(() => onChange({ table: "posts" }), 20000) : null;
  return () => { dead = true; unwatch && unwatch(); if (poll) clearInterval(poll); };
}

// Liens cliquables, le reste échappé et typographié
function linkify(s) {
  return String(s || "").split(/(https?:\/\/[^\s<]+)/g).map((part, i) =>
    i % 2 ? `<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part.length > 60 ? part.slice(0, 57) + "…" : part)}</a>` : T(part)).join("");
}
