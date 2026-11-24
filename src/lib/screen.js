/* Écran projeté, dans la direction artistique du support Google Slides :
   format 16:9, Montserrat, marine #0A2D4E, bleu #124F90, panneau clair
   #F2F4F7, surtitres #C3CADD (sur fond marine) ou #4A6A95 (sur fond clair),
   titres en capitales grasses, pastilles carrées alternées pour les lettres,
   bandeau bleu en pied avec le logo Samsa et « JOURNALISME & IA · année ».
   Les tailles sont exprimées en cqw (largeur du conteneur) : la même
   maquette sert à l'écran plein et à l'aperçu du back-office. */
import { T, esc } from "./dom.js";
import { QUIZ } from "../data.js";
import { currentAct, quizQ, countOf } from "./activities.js";
import { datesFr, hhmm, titleDate, samsaHtml, pickLogo, emargementLabels, MAIL_ICON, evaluationInfo } from "./brand.js";
import { modulesFor, typeLabel } from "./content.js";
import { slideEmbedUrl, deckEmbedUrl, deckKind, parsePages } from "../deck.js";
import { skinFooter } from "./skin.js";

const LETTERS = "ABCDEFGHIJKL";
const year = (s) => (s.date ? s.date.slice(0, 4) : String(new Date().getFullYear()));

// Pied de slide commun
function foot(session, right) {
  return `<div class="ds-foot">${samsaHtml(true, "foot")}<b>${esc(skinFooter().toUpperCase())} · ${year(session)}</b><span class="ds-foot-r">${right}</span></div>`;
}
// Slide sombre (titre, séparateur de partie)
const dark = (session, inner, right, cls = "") => `<div class="deck-slide dark ${cls}"><div class="ds-body">${inner}</div>${foot(session, right)}</div>`;
// Slide claire : panneau gauche (surtitre, titre, texte) + contenu à droite
const light = (session, panel, main, right, cls = "") => `<div class="deck-slide light ${cls}"><div class="ds-body ds-split"><div class="ds-panel">${panel}</div><div class="ds-main">${main}</div></div>${foot(session, right)}</div>`;

// Bloc client « Une formation pour » (tuile blanche, comme sur le titre du support)
function clientBlock(branding) {
  const c = branding?.client; if (!c) return "";
  const logo = pickLogo(c, true); // slide de titre : fond marine → version claire
  if (!logo && !c.name) return "";
  return `<div class="ds-client"><span class="ds-kick">Une formation pour</span><span class="ds-tile">${logo ? `<img src="${esc(logo)}" alt="${esc(c.name)}">` : T(c.name)}</span></div>`;
}

// Réponses : lignes à pastilles carrées alternées
function deckBars(opts, counts, good = -1) {
  const mx = Math.max(1, ...counts);
  return `<div class="ds-opts">${opts.map((o, i) => `<div class="ds-opt${i === good ? " good" : ""}">
    <span class="ds-letter${i % 2 ? " alt" : ""}">${LETTERS[i]}</span>
    <div class="ds-opt-t"><div class="ds-opt-l">${T(o)}</div><span class="ds-track"><i style="width:${(counts[i] / mx) * 100}%"></i></span></div>
    <b class="ds-n">${counts[i]}</b></div>`).join("")}</div>`;
}
function deckCloud(rows) {
  const f = {};
  rows.forEach((r) => (Array.isArray(r.value) ? r.value : [r.value]).forEach((w) => {
    const k = String(w).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); if (!k) return;
    f[k] = f[k] || { w: String(w), n: 0 }; f[k].n += r.n;
  }));
  const L = Object.values(f).sort((a, b) => b.n - a.n);
  if (!L.length) return `<div class="ds-wait">En attente des premiers mots…</div>`;
  const mx = L[0].n;
  return `<div class="ds-cloud">${L.map((x, i) => `<span class="${i % 2 ? "alt" : ""}" style="font-size:${1.4 + (x.n / mx) * 3.6}cqw">${esc(x.w)}</span>`).join("")}</div>`;
}
const joinBox = (session, qrUrl) => (qrUrl ? `<div class="ds-join"><img src="${qrUrl}" alt="QR code pour rejoindre"><div>Rejoindre<br><b class="mono">${esc(session.code)}</b></div></div>` : "");

// Accroche : les **passages** entre doubles astérisques passent en bleu
const highlight = (t) => T(t || "").replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>');
const bare = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

// Slide « L'intervenant », sur le modèle de la page 5 du support
export function trainerSlideHtml(session, t, cls = "", right = "") {
  if (!t) return dark(session, `<div class="ds-left"><div class="ds-kick">L'intervenant</div><div class="ds-title xxl">Fiche à choisir</div><div class="ds-sub">Onglet Réglages de la session.</div></div>`, right, cls);
  const contacts = [t.email ? `<a>${esc(t.email)}</a>` : "", t.website ? `<span>${esc(t.website)}</span>` : "", ...(t.socials || []).map((x) => `<a>${esc(x.label)}</a>`)].filter(Boolean).join("<br>");
  return light(session, `<div class="ds-kick barred">L'intervenant</div><div class="ds-title ds-black">${T(t.name)}</div>
      ${contacts ? `<div class="ds-contact"><div class="ds-kick">Contact pro</div><div class="ds-contact-l">${contacts}</div></div>` : ""}`,
    `<div class="ds-trainer">
      <div class="ds-banner"><span class="ds-banner-logo">${samsaHtml(true, "banner")}</span>${t.photo ? `<img class="ds-photo" src="${esc(t.photo)}" alt="${esc(t.name)}">` : ""}</div>
      <div class="ds-roles">${(t.roles || []).map((r) => `<div class="ds-role"><span>${T(r.label)}</span>${r.value ? `<i>▸</i><u>${T(r.value)}</u>` : ""}</div>`).join("")}</div>
      ${t.tagline ? `<div class="ds-tagline">${highlight(t.tagline)}</div>` : ""}
      ${t.tagline_sub ? `<div class="ds-tagline-sub">${T(t.tagline_sub)}</div>` : ""}
    </div>`, right, cls);
}

// d = { session, rows, participants, qrUrl, projects, branding, emQr, support, trainer }
/* Avancer ou reculer d'une page (flèches du clavier, télécommande) : nouvel état « live » ou null.
   Page du support : pages de la séquence (ou ±1 hors liste) ; séquence → sa première page ;
   présentation Google Slides : page ±1. */
export function stepLive(session, dir) {
  const live = session.live || {}, now = new Date().toISOString();
  const mod = live.module ? modulesFor(session).find((m) => m.id === live.module) : null;
  const pages = mod ? parsePages(mod.pages) : [];
  if ((live.view === "slide" || live.view === "module") && pages.length && session.slides_url) {
    const i = live.view === "slide" ? pages.indexOf(live.slide) : -1;
    if (i < 0 && live.view === "slide") { const p = Math.max(1, (live.slide || 1) + dir); return { ...live, view: "slide", slide: p, started_at: now }; }
    const j = Math.min(pages.length - 1, Math.max(0, i + dir));
    if (live.view === "slide" && j === i) return null;
    return { ...live, view: "slide", slide: pages[j], started_at: now };
  }
  if (live.view === "slide" && session.slides_url) return { ...live, slide: Math.max(1, (live.slide || 1) + dir), started_at: now };
  if (live.view === "deck") {
    const d = (session.decks || []).find((x) => x.id === live.deck);
    if (d && deckKind(d.url) === "slides") { const p = Math.max(1, (live.page || 1) + dir); return p === (live.page || 1) ? null : { ...live, page: p, started_at: now }; }
  }
  return null;
}
// Touches de pilotage : flèches, Page suivante/précédente (télécommandes de présentation), espace
export function pageKey(e) {
  const t = e.target, tag = t?.tagName;
  if (e.altKey || e.ctrlKey || e.metaKey || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return 0;
  if (["ArrowRight", "PageDown", "ArrowDown"].includes(e.key)) return 1;
  if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) return -1;
  return 0;
}

/* Page suivante de ce qui est projeté : { src, label } ou null.
   Page du support → page suivante de la séquence (ou +1) ; séquence avec pages → sa première page ;
   présentation Google Slides → page +1. */
export function nextPage(session) {
  const live = session.live || {};
  const mod = live.module ? modulesFor(session).find((m) => m.id === live.module) : null;
  const pages = mod ? parsePages(mod.pages) : [];
  if (live.view === "slide") {
    const cur = live.slide || 1, n = pages.includes(cur) ? pages[pages.indexOf(cur) + 1] : cur + 1;
    return n ? { src: slideEmbedUrl(session.slides_url, n), label: `Page ${n} du support` } : null;
  }
  if (live.view === "module" && pages.length && session.slides_url) return { src: slideEmbedUrl(session.slides_url, pages[0]), label: `Page ${pages[0]} du support` };
  if (live.view === "deck") {
    const d = (session.decks || []).find((x) => x.id === live.deck);
    if (d && deckKind(d.url) === "slides") { const n = (live.page || 1) + 1; return { src: deckEmbedUrl(d.url, n), label: `${d.title} · page ${n}` }; }
  }
  return null;
}

export function screenHtml(d, compact = false) {
  const { session, rows = [], participants = 0, qrUrl = "", projects = [], branding = null, emQr = null, support = null, evalQr = null, trainer = null, forTrainee = false, joinLabel = "" } = d;
  const cls = compact ? "compact" : "";
  const live = session.live || {};
  const isLive = session.status === "live";
  const act = isLive ? currentAct(session) : null;
  // salle fermée : seuls les écrans d'ouverture et de clôture se projettent (les stagiaires, eux, ne les voient pas)
  const view = isLive || ["title", "trainer", "emargement", "support", "evaluation", "qr"].includes(live.view) ? live.view : null;
  const mod = live.module ? modulesFor(session).find((m) => m.id === live.module) : null;
  const right = forTrainee ? "" : `Code ${esc(session.code)} · ${participants} participant${participants > 1 ? "s" : ""}`;

  // Slide de titre (et activité « Accueil ») : reprend la page 1 du support
  if (view === "title" || act?.type === "welcome") {
    return dark(session, `<div class="ds-center">
        ${clientBlock(branding)}
        <div class="ds-title xl">${T(session.formation)}</div>
        ${samsaHtml(true, "big")}
        <div class="ds-sub">${session.title && session.title !== session.formation ? T(session.title) + "<br>" : ""}${T(titleDate(session))}</div>
      </div>${joinBox(session, qrUrl)}`, right, cls);
  }

  // Page du support Google Slides
  if (view === "slide") {
    const cur = live.slide || 1;
    const src = slideEmbedUrl(session.slides_url, cur);
    // Page suivante préchargée, invisible : quand le formateur avance, elle s'affiche sans attendre Google
    const pages = mod ? parsePages(mod.pages) : [];
    const nxt = pages.includes(cur) ? pages[pages.indexOf(cur) + 1] || null : cur + 1;
    const pre = nxt ? slideEmbedUrl(session.slides_url, nxt) : null;
    return `<div class="deck-slide frame ${cls}">${src ? `<iframe src="${esc(src)}" title="Support, page ${cur}" allowfullscreen></iframe>${pre ? `<iframe src="${esc(pre)}" title="Page suivante (préchargée)" data-preload aria-hidden="true" tabindex="-1"></iframe>` : ""}` : dark(session, `<div class="ds-kick">Support</div><div class="ds-title">Aucune présentation associée</div><div class="ds-sub">Ajoutez le lien Google Slides dans l'onglet Réglages.</div>`, right)}</div>`;
  }

  // Présentation supplémentaire (Google Slides par page, ou PDF dans la visionneuse Drive)
  if (view === "deck") {
    const d = (session.decks || []).find((x) => x.id === live.deck);
    const src = d ? deckEmbedUrl(d.url, live.page || 1) : null;
    const pre = d && deckKind(d.url) === "slides" ? deckEmbedUrl(d.url, (live.page || 1) + 1) : null;
    return `<div class="deck-slide frame ${cls}">${src ? `<iframe src="${esc(src)}" title="${esc(d.title)}" allowfullscreen allow="autoplay"></iframe>${pre ? `<iframe src="${esc(pre)}" title="Page suivante (préchargée)" data-preload aria-hidden="true" tabindex="-1"></iframe>` : ""}` : dark(session, `<div class="ds-kick">Présentation</div><div class="ds-title">Présentation introuvable</div>`, right)}</div>`;
  }

  // Séquence du déroulé : comme les séparateurs de partie du support
  if (view === "module" && mod) {
    return dark(session, `<div class="ds-left">
        <div class="ds-kick">${T(typeLabel(mod.type))}${mod.tf ? ` · Temps fort ${mod.tf}` : ""} · ${T(mod.t[0].replace(":", " h "))} – ${T(mod.t[1].replace(":", " h "))}</div>
        <div class="ds-title xxl">${T(mod.titre)}</div>
        ${mod.cas ? `<div class="ds-sub">${T(mod.cas)}</div>` : ""}
        ${mod.exo ? `<div class="ds-sub">Exercice : ${T(mod.exo.titre)} · ${mod.exo.duree} min</div>` : ""}
      </div>`, right, cls);
  }

  // Émargement en deux étapes, comme la page « Informations générales » du support
  if (view === "emargement") {
    const L = emargementLabels(session, branding);
    return light(session, `<div class="ds-kick barred">Informations générales</div><div class="ds-title">${L.second && L.client ? "Deux étapes pour émarger" : "Émargement"}</div>`,
      `<div class="ds-em">
        <div class="ds-em-col"><div class="ds-em-h">Pour <u>${T(L.org)}</u></div><div class="ds-em-t">Signez la feuille de présence grâce à ce QR code</div>
          ${emQr ? `<div class="ds-qrbox"><img src="${emQr}" alt="QR code d'émargement"></div>` : `<div class="ds-wait">QR code à configurer (onglet Réglages).</div>`}</div>
        ${L.second && L.client ? `<div class="ds-em-col"><div class="ds-em-h">Pour ${T(L.client)}</div><div class="ds-em-t">${T(L.text)}</div><div class="ds-mail">${MAIL_ICON}</div></div>` : ""}
      </div>`, right, cls);
  }

  if (view === "trainer") return trainerSlideHtml(session, trainer, cls, right);

  // Évaluation de fin de stage (modèle de la page « Avant de télécharger la présentation »)
  if (view === "evaluation") {
    const e = evaluationInfo(session);
    return `<div class="deck-slide light ${cls}"><div class="ds-body ds-eval">
        <div class="ds-eval-txt"><div class="ds-title ds-black">${T(e.title)}</div><div class="ds-em-t">${T(e.text)}</div></div>
        <div class="ds-eval-qr">${evalQr ? `<div class="ds-qrbox"><img src="${evalQr}" alt="QR code de l'évaluation"></div>` : `<div class="ds-wait">QR code à configurer (onglet Réglages).</div>`}
          ${e.url ? `<div class="ds-eval-url">${esc(e.url)}</div>` : ""}</div>
      </div>${foot(session, right)}</div>`;
  }

  if (view === "support") {
    const when = support?.unlock_at ? new Date(support.unlock_at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : null;
    return light(session, `<div class="ds-kick">Le support</div><div class="ds-title">${support?.unlocked ? "Le support est disponible" : "Le support vous attend"}</div><p class="ds-text">${T("Dans votre espace, menu « Support de formation ».")}</p>`,
      `<div class="ds-bignote"><span class="ds-letter big">${support?.unlocked ? "↓" : "🔒"}</span><div>${support?.unlocked ? "Téléchargeable dès maintenant" : `Téléchargeable${when ? ` à partir de <b>${when}</b>` : " en fin de formation"}`}</div></div>`, right, cls);
  }

  if (act?.type === "projects") {
    return light(session, `<div class="ds-kick">Les projets du groupe</div><div class="ds-title">Cas d'usage</div><p class="ds-text">${projects.length} cas cadré${projects.length > 1 ? "s" : ""} et validé${projects.length > 1 ? "s" : ""} avant la formation.</p>`,
      projects.length ? `<div class="ds-projects">${projects.slice(0, 9).map((p, i) => `<div class="ds-proj"><span class="ds-letter sm${i % 2 ? " alt" : ""}">${i + 1}</span><div><b>${T(p.titre)}</b><span>${T(p.auteur || "")}</span><p>${T((p.description || "").slice(0, 160))}</p></div></div>`).join("")}</div>` : `<div class="ds-wait">Aucun cas d'usage validé pour l'instant.</div>`, right, cls);
  }

  if (act) {
    const n = countOf(rows);
    let kick = act.titre, q = act.q || act.titre, main;
    if (act.type === "quiz") {
      const Q = quizQ(act, live);
      kick = `${QUIZ[act.quiz].titre} · question ${(live.qi || 0) + 1} sur ${QUIZ[act.quiz].q.length}`;
      q = Q?.[0] || "";
      const counts = (Q?.[1] || []).map((_, i) => rows.filter((r) => r.value === i).reduce((a, r) => a + r.n, 0));
      main = Q ? deckBars(Q[1], counts, live.reveal ? Q[2] : -1) + (live.reveal ? `<div class="ds-expl">${T(Q[3])}</div>` : "") : "";
    } else if (act.type === "cloud") {
      main = deckCloud(rows);
    } else {
      const opts = act.type === "vote" ? (live.options || act.options || []).map((o) => o.titre + (o.auteur ? ` · ${o.auteur}` : "")) : act.o || [];
      const counts = opts.map((_, i) => rows.filter((r) => r.value === i).reduce((a, r) => a + r.n, 0));
      main = opts.length ? deckBars(opts, counts) : `<div class="ds-wait">Aucune option.</div>`;
    }
    return light(session, `<div class="ds-kick">${T(kick)}</div><div class="ds-title q">${T(q)}</div>
        <div class="ds-count"><b>${n}</b><span>${n > 1 ? "réponses" : "réponse"}</span></div>${joinBox(session, qrUrl)}`,
      n || act.type === "cloud" ? main : `<div class="ds-wait">En attente des premières réponses…</div>${main}`, right, cls);
  }

  // Accueil en salle : grand QR code, lien court et étapes de connexion (vue « qr » et écran d'attente)
  // L'adresse tient sur une ligne : au-delà de 36 caractères, la police rétrécit (chasse fixe : 0,6 em par caractère)
  const addr = joinLabel || session.code || "";
  const addrSize = Math.min(2.4, 52 / (Math.max(addr.length, 1) * 0.6)).toFixed(2);
  const joinSlide = (kick, title, sub = "") => dark(session, `<div class="ds-joinbig">
      <div class="ds-joinbig-txt"><div class="ds-kick">${T(kick)}</div><div class="ds-title">${T(title)}</div>${sub ? `<div class="ds-sub">${T(sub)}</div>` : ""}
        <ol class="ds-steps"><li>${T("Scannez le QR code, ou tapez l'adresse :")}<b class="mono ds-addr" style="font-size:${addrSize}cqw">${esc(addr)}</b></li><li>${T("Indiquez votre prénom et votre e-mail")}</li><li>${T("Saisissez le code reçu par e-mail")}</li></ol></div>
      ${qrUrl ? `<div class="ds-joinbig-qr"><img src="${qrUrl}" alt="QR code pour rejoindre"><b class="mono">${esc(session.code)}</b></div>` : ""}
    </div>`, right, cls);
  if (view === "qr") return joinSlide("Rejoindre l'espace de formation", "Connectez-vous", session.title);

  // Rien de lancé : écran d'attente
  if (session.status !== "closed" && qrUrl) return joinSlide("En attente", "La formation va commencer", session.title);
  const next = session.activities?.[0];
  return dark(session, `<div class="ds-left">
      <div class="ds-kick">${session.status === "closed" ? "Fin de la formation" : "En attente"}</div>
      <div class="ds-title xxl">${session.status === "closed" ? "Merci" : "La formation va commencer"}</div>
      ${session.status !== "closed" && next ? `<div class="ds-sub">${T(session.title)}</div>` : ""}
    </div>${session.status !== "closed" ? joinBox(session, qrUrl) : ""}`, right, cls);
}
