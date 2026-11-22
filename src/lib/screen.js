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
import { datesFr, hhmm, samsaHtml, pickLogo, emargementLabels, MAIL_ICON, evaluationInfo } from "./brand.js";
import { modulesFor, typeLabel } from "./content.js";
import { slideEmbedUrl, deckEmbedUrl } from "../deck.js";

const LETTERS = "ABCDEFGHIJKL";
const year = (s) => (s.date ? s.date.slice(0, 4) : String(new Date().getFullYear()));

// Pied de slide commun
function foot(session, right) {
  return `<div class="ds-foot">${samsaHtml(true, "foot")}<b>JOURNALISME &amp; IA · ${year(session)}</b><span class="ds-foot-r">${right}</span></div>`;
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

// d = { session, rows, participants, qrUrl, projects, branding, emQr, support }
export function screenHtml(d, compact = false) {
  const { session, rows = [], participants = 0, qrUrl = "", projects = [], branding = null, emQr = null, support = null, evalQr = null } = d;
  const cls = compact ? "compact" : "";
  const live = session.live || {};
  const isLive = session.status === "live";
  const act = isLive ? currentAct(session) : null;
  const view = isLive ? live.view : null;
  const mod = live.module ? modulesFor(session.format).find((m) => m.id === live.module) : null;
  const right = `Code ${esc(session.code)} · ${participants} participant${participants > 1 ? "s" : ""}`;

  // Slide de titre (et activité « Accueil ») : reprend la page 1 du support
  if (view === "title" || act?.type === "welcome") {
    return dark(session, `<div class="ds-center">
        ${clientBlock(branding)}
        <div class="ds-title xl">${T(session.formation)}</div>
        ${samsaHtml(true, "big")}
        <div class="ds-sub">${session.title && session.title !== session.formation ? T(session.title) + "<br>" : ""}${T(datesFr(session))} · ${hhmm(session.start_time)} – ${hhmm(session.end_time)}</div>
      </div>${joinBox(session, qrUrl)}`, right, cls);
  }

  // Page du support Google Slides
  if (view === "slide") {
    const src = slideEmbedUrl(session.slides_url, live.slide || 1);
    return `<div class="deck-slide frame ${cls}">${src ? `<iframe src="${esc(src)}" title="Support, page ${live.slide}" allowfullscreen></iframe>` : dark(session, `<div class="ds-kick">Support</div><div class="ds-title">Aucune présentation associée</div><div class="ds-sub">Ajoutez le lien Google Slides dans l'onglet Réglages.</div>`, right)}</div>`;
  }

  // Présentation supplémentaire (Google Slides par page, ou PDF dans la visionneuse Drive)
  if (view === "deck") {
    const d = (session.decks || []).find((x) => x.id === live.deck);
    const src = d ? deckEmbedUrl(d.url, live.page || 1) : null;
    return `<div class="deck-slide frame ${cls}">${src ? `<iframe src="${esc(src)}" title="${esc(d.title)}" allowfullscreen allow="autoplay"></iframe>` : dark(session, `<div class="ds-kick">Présentation</div><div class="ds-title">Présentation introuvable</div>`, right)}</div>`;
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

  // Rien de lancé : écran d'attente
  const next = session.activities?.[0];
  return dark(session, `<div class="ds-left">
      <div class="ds-kick">${session.status === "closed" ? "Fin de la formation" : "En attente"}</div>
      <div class="ds-title xxl">${session.status === "closed" ? "Merci" : "La formation va commencer"}</div>
      ${session.status !== "closed" && next ? `<div class="ds-sub">${T(session.title)}</div>` : ""}
    </div>${session.status !== "closed" ? joinBox(session, qrUrl) : ""}`, right, cls);
}
