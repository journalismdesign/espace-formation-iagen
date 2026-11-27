/* « Mon espace » (stagiaire) : la seule chose à faire maintenant, la
   préparation, le parcours, les discussions et toutes les sessions. */
import { canView } from "../lib/roles.js";
import { isArchived, sessionEnded } from "../lib/archive.js";
import { $, $$, T, esc, dateFr, guard, NB } from "../lib/dom.js";
import { preparation } from "./cadrageModel.js";
import { datesFr } from "../lib/brand.js";
import { hasCadrage } from "../lib/content.js";
import { chatOn } from "../lib/chat.js";

export const STATUS = { draft: "À venir", live: "En direct", closed: "Terminée" };

export async function viewHome(root, _p, { api, me, go }) {
  if (canView(me)) { go("#/admin"); return; } // la vue stagiaire reste accessible depuis chaque session
  await api.closeFinished().catch(() => 0);
  const sessions = await api.listSessions();
  // Sessions en cours ou à venir : ni terminées, ni archivées (5 jours après la fin)
  const open = sessions.filter((s) => !sessionEnded(s) && !isArchived(s));
  const stateOf = (s) => (isArchived(s) ? "Archivée" : sessionEnded(s) ? "Terminée" : STATUS[s.status]);
  const next = open.find((s) => s.status === "live") || open[0] || null;
  const cad = next ? hasCadrage(next) : false; // pas de cadrage pour une formation d'une journée
  const project = next && cad ? await api.myProject(next.id).catch(() => null) : null;
  const prep = preparation(me, project, cad);
  // Discussion : en formation en ligne seulement ; en salle, le glossaire prend toute la largeur
  const chat = !!next && chatOn(next);
  const threads = chat ? (await api.listThreads(next.id)).slice(0, 3) : [];

  const todo = next ? `
    <div class="card todo">
      <div class="kicker-d">À faire maintenant</div>
      <h2 style="margin:6px 0 0">${next.status === "live" ? "Suivre la formation" : "Préparer ma session"}</h2>
      <h3 class="muted" style="margin:2px 0 4px">${T(next.title)}</h3>
      <p class="small muted" style="margin:0 0 12px">${T(datesFr(next))}</p>
      ${prep.items.map((i) => `<div class="todo-item"><span class="ring${i.done ? " on" : ""}">${i.done ? "✓" : ""}</span><div><b>${T(i.label)}</b><div class="small muted">${T(i.sub)}</div></div>
        ${i.done ? `<span class="small"><b>Terminé</b></span>` : `<a class="small" href="${i.k === "profil" ? "#/profil" : `#/s/${next.id}/cadrage`}">${i.started ? "Continuer" : "Commencer"}</a>`}</div>`).join("")}
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        ${next.status === "live" ? `<a class="btn" href="#/s/${next.id}/direct">Rejoindre le direct →</a>` : ""}
        <a class="btn${next.status === "live" ? " ghost" : ""}" href="${!prep.items[0].done || !cad ? "#/profil" : `#/s/${next.id}/cadrage`}">${prep.pct === 100 ? "Revoir ma préparation" : "Continuer ma préparation"} →</a>
      </div>
    </div>
    <div class="card prep">
      <div class="kicker-d">Ma préparation</div>
      <div class="prep-square">${prep.pct}${NB}%</div>
      <p class="small muted" style="text-align:center;margin:0">${prep.items.filter((i) => i.done).length}/${prep.items.length} étapes prêtes · quelques minutes suffisent</p>
    </div>` : `
    <div class="card todo" style="grid-column:1/-1">
      <div class="kicker-d">À faire maintenant</div>
      <h2 style="margin:6px 0">Rejoindre votre session</h2>
      <p class="muted">${T("Votre formateur vous a donné un code de session, ou un QR code à scanner. Si vous avez été invité·e par e-mail, la session apparaît ici automatiquement.")}</p>
      ${joinForm()}
    </div>`;

  root.innerHTML = `
    <div class="pagehead"><div><h1>Mon espace</h1><p class="muted">${T("Le bloc « À faire maintenant » indique toujours la seule chose à faire aujourd'hui. Le reste du parcours s'ouvre au fur et à mesure.")}</p></div>
      ${canView(me) ? `<a class="btn ghost sm" href="#/admin">Back-office</a>` : ""}</div>
    <div class="grid home-top">${todo}</div>
    ${next ? `
    <div class="card" style="margin-top:14px">
      <div class="kicker-d">Mon parcours de formation</div>
      <p class="small muted" style="margin:4px 0 12px">${cad ? "Deux moments : le cadrage avant, la formation le jour J. Vous pouvez y revenir à tout instant." : "Tout se passe le jour J : sondages, quiz, exercices et déroulé s'affichent au bon moment."}</p>
      <div class="grid g2">
        ${cad ? `<a class="step-card" href="#/s/${next.id}/cadrage"><span class="ring${project?.status === "validated" ? " on" : ""}">${project?.status === "validated" ? "✓" : "1"}</span><div><div class="kicker-d">Avant la formation</div><b>Je cadre mon cas d'usage</b><div class="small muted">Préparé pas à pas, avec le retour du formateur.</div><span class="small">${project ? "Revoir" : "Commencer"} →</span></div></a>` : ""}
        <a class="step-card" href="#/s/${next.id}/direct"><span class="ring">${cad ? "2" : "✓"}</span><div><div class="kicker-d">Le jour J</div><b>Je suis la formation en direct</b><div class="small muted">Sondages, quiz et déroulé s'affichent au bon moment.</div><span class="small">Ouvrir →</span></div></a>
      </div>
    </div>
    <div class="grid home-mid${chat ? "" : " solo"}" style="margin-top:14px">
      ${chat ? `<div class="card">
        <div style="display:flex;justify-content:space-between"><div class="kicker-d">Discussions</div><a class="small" href="#/s/${next.id}/discussion">Voir tout</a></div>
        ${threads.length ? threads.map((t) => `<a class="res" style="display:block" href="#/s/${next.id}/discussion/${t.id}"><b>${T(t.title)}</b><div class="small muted">${T(t.author_name)} · ${t.count} réponse${t.count > 1 ? "s" : ""}</div></a>`).join("") : `<p class="small muted">Aucune discussion pour le moment.</p>`}
        <a class="small" href="#/s/${next.id}/discussion/new">Lancer une discussion →</a>
      </div>` : ""}
      <a class="card dark" href="#/s/${next.id}/fiches"><div><h2>Glossaire</h2><p class="small">Fiches, termes, prompts et exemples de rédactions, réservés aux stagiaires.</p></div><span class="roundico" aria-hidden="true">|||</span></a>
    </div>` : ""}
    <div class="card" style="margin-top:14px">
      <div class="kicker-d">Mes sessions</div>
      <div class="grid g3" style="margin-top:10px">
        ${sessions.length ? sessions.map((s) => `<div class="sess-card">
          <div class="kicker-d">${s.status === "live" && !sessionEnded(s) && !isArchived(s) ? `<span class="live-tag"><span class="dot on"></span>En direct</span>` : stateOf(s)} · ${T(dateFr(s.date, { day: "numeric", month: "long" }))}</div>
          <b>${T(s.title)}</b>
          <div class="small muted">${T(s.formation)}${s.format === "2" ? " · 2 jours" : ""}</div>
          <div style="display:flex;gap:6px;margin-top:10px"><a class="btn sm" href="#/s/${s.id}">${isArchived(s) ? "Voir" : sessionEnded(s) ? "Revoir" : "Rejoindre"}</a>${chatOn(s) && !sessionEnded(s) && !isArchived(s) ? `<a class="btn sm ghost" href="#/s/${s.id}/discussion">Discussion</a>` : ""}</div>
        </div>`).join("") : `<p class="small muted">Aucune session pour l'instant.</p>`}
      </div>
      ${next ? `<details style="margin-top:12px"><summary class="small" style="cursor:pointer">Rejoindre une autre session avec un code</summary>${joinForm()}</details>` : ""}
    </div>`;

  $$("form[data-join]", root).forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const sid = await guard(() => api.joinSession($("input", f).value), "Session rejointe.");
    if (sid) go(`#/s/${sid}`);
  }));
}

const joinForm = () => `<form data-join class="askrow" style="max-width:380px;margin-top:8px"><input type="text" maxlength="8" placeholder="Code (ex. DEMO42)" aria-label="Code de session" class="mono" style="text-transform:uppercase" required><button class="btn" type="submit">Rejoindre</button></form>`;
