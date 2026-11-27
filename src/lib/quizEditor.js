/* Éditeur de quiz, de sondages et de nuages de mots : un seul formulaire, affiché en page dans la bibliothèque
   (#/admin/quiz/<id>) et en panneau dans le Jour J d'une session.
   - Quiz : titre, puis questions (énoncé, 2 à 6 réponses, bonne réponse, explication facultative) ;
     monter, descendre, dupliquer, supprimer une question.
   - Sondage : titre court, question, 2 à 8 réponses. Nuage de mots : titre court, question.
   Contrôles à l'enregistrement (cleanQuiz / cleanPoll, quizzes.js). Brouillon automatique dans le stockage local
   (même préfixe que draft.js) : un onglet fermé par erreur ne perd rien. Les questions gardent leur identifiant :
   les réponses déjà enregistrées restent rattachées. */
import { $, $$, T, esc } from "./dom.js";
import { cleanQuiz, cleanPoll, newQid, LIMITS, KINDS } from "./quizzes.js";

const PREFIX = "iagen-draft:";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(PREFIX + k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(PREFIX + k); } catch {} },
};
const hhmm = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const blankQuestion = () => ({ id: newQid(), q: "", o: ["", "", "", ""], ok: null, why: "" });
export function blankValue(kind) {
  if (kind === "quiz") return { titre: "", questions: [blankQuestion()] };
  return kind === "poll" ? { titre: "", q: "", o: ["", "", ""] } : { titre: "", q: "" };
}
// Valeur d'éditeur depuis un élément de bibliothèque, une copie de session ou une activité
export function valueOf(kind, src) {
  if (kind === "quiz") return { titre: src.titre || "", questions: (src.questions || src.content?.questions || []).map((q) => ({ ...q, o: [...q.o] })) };
  const c = src.content || src;
  return { titre: src.titre || "", q: c.q || "", ...(kind === "poll" ? { o: [...(c.o || [])] } : {}) };
}

/* root : élément qui reçoit le formulaire.
   opts : { kind, value, draftKey, saveLabel, onSave(value) → vrai si enregistré, onCancel, note } */
export function mountEditor(root, { kind, value, draftKey, saveLabel = "Enregistrer", onSave, onCancel, note = "" }) {
  const original = JSON.stringify(value);
  let model = JSON.parse(original), restored = null;
  const saved = draftKey ? store.get(draftKey) : null;
  if (saved?.model && JSON.stringify(saved.model) !== original) { model = saved.model; restored = saved.at; }
  else if (saved) store.del(draftKey);
  const maxO = kind === "quiz" ? LIMITS.quizOpts[1] : LIMITS.pollOpts[1];

  const optRow = (o, j, qi, ok) => `<div class="qe-opt">
      ${kind === "quiz" ? `<input type="radio" name="qe-ok-${qi}" value="${j}"${ok === j ? " checked" : ""} aria-label="Bonne réponse : réponse ${j + 1}" title="Bonne réponse">` : `<span class="qe-n">${j + 1}</span>`}
      <input type="text" name="o" maxlength="${LIMITS.o}" value="${esc(o)}" placeholder="Réponse ${j + 1}" aria-label="Réponse ${j + 1}">
      <button type="button" class="iconbtn" data-act="odel" data-i="${qi}" data-j="${j}" aria-label="Retirer la réponse ${j + 1}"${j < 2 && (kind === "quiz" ? model.questions[qi].o : model.o).length <= 2 ? " disabled" : ""}>✕</button></div>`;
  const optsHtml = (list, qi, ok) => `<div class="qe-opts">${list.map((o, j) => optRow(o, j, qi, ok)).join("")}</div>
      ${list.length < maxO ? `<button type="button" class="linkbtn small" data-act="oadd" data-i="${qi}">+ Ajouter une réponse</button>` : ""}`;
  const questionHtml = (q, i, n) => `<fieldset class="qe-q" data-qid="${esc(q.id)}">
      <legend>Question ${i + 1}</legend>
      <div class="qe-tools">
        <button type="button" class="iconbtn" data-act="up" data-i="${i}" aria-label="Monter la question ${i + 1}"${i === 0 ? " disabled" : ""}>↑</button>
        <button type="button" class="iconbtn" data-act="down" data-i="${i}" aria-label="Descendre la question ${i + 1}"${i === n - 1 ? " disabled" : ""}>↓</button>
        <button type="button" class="linkbtn small" data-act="dup" data-i="${i}">Dupliquer</button>
        <button type="button" class="linkbtn small danger" data-act="del" data-i="${i}">Supprimer</button>
      </div>
      <label class="f" for="qe-q-${i}">Énoncé</label><textarea id="qe-q-${i}" name="q" rows="2" maxlength="${LIMITS.q}">${esc(q.q)}</textarea>
      <div class="f qe-lbl">Réponses <span class="small muted">· cochez la bonne</span></div>
      ${optsHtml(q.o, i, q.ok)}
      <label class="f" for="qe-w-${i}">Explication <span class="small muted">· affichée avec la bonne réponse, facultative</span></label>
      <textarea id="qe-w-${i}" name="why" rows="2" maxlength="${LIMITS.why}">${esc(q.why || "")}</textarea>
    </fieldset>`;

  root.innerHTML = `<form class="qe" novalidate>
      <div class="draftbar small"><span class="draft-st muted"></span></div>
      ${note ? `<div class="qe-note small">${note}</div>` : ""}
      <label class="f" for="qe-titre">${kind === "quiz" ? "Titre du quiz" : "Titre court"} <span class="small muted">· ${kind === "quiz" ? "affiché au-dessus des questions" : "affiché dans la liste des activités"}</span></label>
      <input type="text" id="qe-titre" maxlength="${LIMITS.titre}" value="${esc(model.titre)}">
      ${kind === "quiz" ? `<div id="qe-list"></div><button type="button" class="btn sm ghost" data-act="qadd">+ Ajouter une question</button>`
        : `<label class="f" for="qe-qq">Question</label><textarea id="qe-qq" rows="2" maxlength="${LIMITS.q}">${esc(model.q)}</textarea>
           ${kind === "poll" ? `<div class="f qe-lbl">Réponses</div><div id="qe-list"></div>` : `<p class="small muted">${T("Chaque personne envoie jusqu'à trois mots. Le nuage se forme à l'écran.")}</p>`}`}
      <div class="qe-err" role="alert" aria-live="assertive"></div>
      <div class="qe-actions"><button class="btn" type="submit">${T(saveLabel)}</button>${onCancel ? `<button type="button" class="btn ghost" data-act="cancel">Annuler</button>` : ""}</div>
    </form>`;
  const form = $("form", root), st = $(".draft-st", form), err = $(".qe-err", form);
  const say = (html, cls = "muted") => { st.className = "draft-st " + cls; st.innerHTML = html; };

  // Lecture du formulaire dans le modèle (avant toute modification de structure et à l'enregistrement)
  const read = () => {
    model.titre = $("#qe-titre", form).value;
    if (kind === "quiz") {
      model.questions = $$(".qe-q", form).map((fs, i) => {
        const r = $('input[type="radio"]:checked', fs);
        return { id: fs.dataset.qid, q: $('[name="q"]', fs).value, o: $$('[name="o"]', fs).map((x) => x.value), ok: r ? +r.value : null, why: $('[name="why"]', fs).value };
      });
    } else {
      model.q = $("#qe-qq", form).value;
      if (kind === "poll") model.o = $$('[name="o"]', form).map((x) => x.value);
    }
  };
  const drawList = (focus) => {
    const box = $("#qe-list", form); if (!box) return;
    box.innerHTML = kind === "quiz" ? model.questions.map((q, i, a) => questionHtml(q, i, a.length)).join("") || `<p class="empty">Aucune question.</p>` : optsHtml(model.o, 0, null);
    if (focus) $(focus, form)?.focus();
  };
  drawList();

  // Brouillon : sauvegardé à la frappe, effacé à l'enregistrement
  let timer = null;
  const saveDraft = () => {
    if (!draftKey) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      read();
      if (JSON.stringify(model) !== original) { const at = Date.now(); store.set(draftKey, { at, model }); say(T(`Brouillon sauvegardé à ${hhmm(at)} · non enregistré`)); }
      else { store.del(draftKey); say(""); }
    }, 400);
  };
  if (restored) {
    say(`${T(`Modifications non enregistrées restaurées (saisies à ${hhmm(restored)}). Pensez à enregistrer.`)} <button type="button" class="linkbtn small" data-act="discard">Revenir à la version enregistrée</button>`, "draft-warn");
  }
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    const act = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j;
    if (act === "cancel") { clearTimeout(timer); return onCancel?.(); }
    if (act === "discard") { clearTimeout(timer); if (draftKey) store.del(draftKey); return mountEditor(root, { kind, value: JSON.parse(original), draftKey, saveLabel, onSave, onCancel, note }); }
    read();
    const list = kind === "quiz" ? model.questions : null;
    if (act === "qadd") { list.push(blankQuestion()); drawList(`#qe-q-${list.length - 1}`); }
    else if (act === "up" && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; drawList(`#qe-q-${i - 1}`); }
    else if (act === "down" && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; drawList(`#qe-q-${i + 1}`); }
    else if (act === "dup") { list.splice(i + 1, 0, { ...list[i], o: [...list[i].o], id: newQid() }); drawList(`#qe-q-${i + 1}`); }
    else if (act === "del") {
      const q = list[i];
      if ((q.q.trim() || q.o.some((o) => o.trim())) && !confirm(`Supprimer la question ${i + 1} ?`)) return;
      list.splice(i, 1); drawList();
    } else if (act === "oadd") {
      const o = kind === "quiz" ? list[i].o : model.o;
      if (o.length < maxO) o.push("");
      drawList(kind === "quiz" ? `#qe-q-${i} ~ .qe-opts .qe-opt:last-child input[type="text"]` : `.qe-opt:last-child input[type="text"]`);
    } else if (act === "odel") {
      if (kind === "quiz") { const q = list[i]; q.o.splice(j, 1); if (q.ok === j) q.ok = null; else if (q.ok > j) q.ok--; }
      else model.o.splice(j, 1);
      drawList();
    } else return;
    saveDraft();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    read();
    const { value: v, errors } = kind === "quiz" ? cleanQuiz(model) : cleanPoll(model, kind);
    if (errors.length) {
      err.innerHTML = `<b>${T(errors.length > 1 ? `${errors.length} points à corriger :` : "Un point à corriger :")}</b><ul>${errors.slice(0, 8).map((x) => `<li>${T(x)}</li>`).join("")}</ul>`;
      err.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    err.innerHTML = "";
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    const done = await onSave(v);
    btn.disabled = false;
    if (done) { clearTimeout(timer); if (draftKey) store.del(draftKey); say(""); }
  };
  $("#qe-titre", form).focus({ preventScroll: true });
  return { kindLabel: KINDS[kind] };
}
