/* Bibliothèque « Quiz et sondages » (#/admin/quiz[/<id>|/nouveau-quiz|/nouveau-sondage|/nouveau-nuage]) :
   modèles proposés à la création des sessions et dans le Jour J. Réservée à l'administration.
   Chaque session garde sa propre copie : modifier un modèle ne change pas les sessions déjà créées
   (le Jour J propose alors « Mettre à jour depuis la bibliothèque », tant que l'activité n'a reçu aucune réponse). */
import { $, $$, T, esc, guard, toast } from "../lib/dom.js";
import { KINDS, newItemId } from "../lib/quizzes.js";
import { mountEditor, blankValue, valueOf } from "../lib/quizEditor.js";

const BASE = "#/admin/quiz";
const NEW = { "nouveau-quiz": "quiz", "nouveau-sondage": "poll", "nouveau-nuage": "cloud" };
const SECTIONS = [["quiz", "Quiz"], ["poll", "Sondages"], ["cloud", "Nuages de mots"]];
const MIG = "Bibliothèque pas encore activée : la migration 20261126000000_quiz_sondages.sql doit être exécutée sur Supabase. En attendant, voici le contenu d'origine, en lecture seule. Les sessions fonctionnent normalement.";
const detailOf = (it) => (it.kind === "quiz" ? `${it.content.questions.length} question${it.content.questions.length > 1 ? "s" : ""}` : it.content.q);
const when = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export async function viewQuizBank(root, [id], ctx) {
  const { api, go } = ctx;
  const bank = await api.listBank();
  if (id) return editor(root, id, bank, api, go);

  root.innerHTML = `
    <div class="pagehead"><div><a href="#/admin" class="small">← Sessions</a><h1 style="margin:4px 0">Quiz et sondages</h1>
      <p class="muted" style="margin:0;max-width:720px">${T("Les modèles proposés à la création des sessions et dans le Jour J. Chaque session garde sa propre copie : modifier un modèle ne change pas les sessions déjà créées.")}</p></div>
      ${bank.ready ? `<div class="head-actions"><a class="btn" href="${BASE}/nouveau-quiz">+ Nouveau quiz</a><a class="btn ghost" href="${BASE}/nouveau-sondage">+ Sondage</a><a class="btn ghost" href="${BASE}/nouveau-nuage">+ Nuage de mots</a></div>` : ""}</div>
    ${bank.ready ? "" : `<div class="warn small" style="margin-bottom:14px">${T(MIG)}</div>`}
    ${SECTIONS.map(([k, label]) => { const list = bank.items.filter((b) => b.kind === k); return `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">${label} (${list.length})</h3>
      ${list.length ? `<table class="tbl qb-tbl"><thead><tr><th>Titre</th><th>${k === "quiz" ? "Questions" : "Question"}</th><th>${T("Clé (conducteur)")}</th><th>Modifié</th><th></th></tr></thead><tbody>
        ${list.map((it) => `<tr><td><a href="${BASE}/${esc(it.id)}"><b>${T(it.titre)}</b></a></td><td class="small">${T(detailOf(it))}</td>
          <td class="mono small">${k === "quiz" ? "quiz: " : "activité: "}${esc(it.id)}</td><td class="small muted">${when(it.updated_at)}</td>
          <td class="actions">${bank.ready ? `<button class="iconbtn" data-dup="${esc(it.id)}" title="Dupliquer" aria-label="Dupliquer « ${esc(it.titre)} »">⧉</button><button class="iconbtn danger" data-del="${esc(it.id)}" title="Supprimer" aria-label="Supprimer « ${esc(it.titre)} »">✕</button>` : ""}</td></tr>`).join("")}
        </tbody></table>` : `<p class="empty">Aucun élément.</p>`}</div>`; }).join("")}
    <p class="small muted">${T("La clé sert dans un conducteur importé : « quiz: » pour un quiz en autonomie dans une séquence, « activité: » pour un sondage ou un nuage prévu en salle.")}</p>`;

  const byId = (x) => bank.items.find((b) => b.id === x);
  $$("[data-dup]", root).forEach((b) => (b.onclick = async () => {
    const it = byId(b.dataset.dup), titre = `${it.titre} (copie)`.slice(0, 80);
    const row = await guard(() => api.saveBankItem({ id: newItemId(titre), kind: it.kind, titre, content: JSON.parse(JSON.stringify(it.content)) }), "Copie créée.");
    if (row) go(`${BASE}/${row.id}`);
  }));
  $$("[data-del]", root).forEach((b) => (b.onclick = async () => {
    const it = byId(b.dataset.del);
    if (!confirm(`Supprimer « ${it.titre} » de la bibliothèque ?\nLes sessions qui l'utilisent gardent leur copie.`)) return;
    await guard(() => api.deleteBankItem(it.id), "Supprimé de la bibliothèque.");
    go(BASE);
  }));
}

function editor(root, id, bank, api, go) {
  const kind = NEW[id] || bank.items.find((b) => b.id === id)?.kind;
  const item = NEW[id] ? null : bank.items.find((b) => b.id === id);
  if (!kind || (!item && !NEW[id])) {
    root.innerHTML = `<div class="card"><h2>Élément introuvable</h2><p class="muted">Il a peut-être été supprimé.</p><a class="btn" href="${BASE}">Quiz et sondages</a></div>`;
    return;
  }
  root.innerHTML = `
    <div class="pagehead"><div><a href="${BASE}" class="small">← Quiz et sondages</a>
      <h1 style="margin:4px 0">${item ? T(item.titre) : `Nouveau ${kind === "quiz" ? "quiz" : kind === "poll" ? "sondage" : "nuage de mots"}`}</h1>
      <span class="pill">${KINDS[kind]}</span>${item ? ` <span class="mono small muted">${kind === "quiz" ? "quiz: " : "activité: "}${esc(item.id)}</span>` : ""}</div></div>
    ${bank.ready ? "" : `<div class="warn small" style="margin-bottom:14px">${T(MIG)}</div>`}
    <div class="card qe-card" id="qeBox"></div>`;
  mountEditor($("#qeBox", root), {
    kind, value: item ? valueOf(kind, item) : blankValue(kind), draftKey: `quizbank:${id}`,
    note: T("Les sessions déjà créées gardent leur copie. Dans le Jour J, elles proposent « Mettre à jour depuis la bibliothèque » tant que l'activité n'a reçu aucune réponse."),
    onCancel: () => go(BASE),
    onSave: async (v) => {
      if (!bank.ready) { toast(MIG, "ko"); return false; }
      const { titre, ...content } = v;
      const row = await guard(() => api.saveBankItem({ id: item?.id || newItemId(titre), kind, titre, content }), "Enregistré dans la bibliothèque.");
      if (!row) return false;
      setTimeout(() => go(`${BASE}/${row.id}`), 0); // réaffiche l'élément enregistré (nouvelle référence du brouillon)
      return true;
    },
  });
}
