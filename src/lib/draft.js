/* Brouillon automatique d'un formulaire.
   Les champs sont recopiés dans le stockage local à chaque frappe et restaurés à l'affichage :
   un rechargement, une reconnexion ou une fermeture d'onglet ne fait plus perdre la saisie.
   Le brouillon est effacé à l'enregistrement. « Tout réinitialiser » vide les champs texte. */
import { T } from "./dom.js";

const PREFIX = "iagen-draft:";
const SKIP = new Set(["file", "password", "submit", "button", "reset", "hidden", "image"]);
const TEXTLIKE = new Set(["text", "url", "email", "date", "time", "number", "tel", "search", "textarea"]);

const fields = (form) => [...form.elements].filter((el) => !el.closest(".draftbar") && !SKIP.has(el.type) && (el.id || el.name));
// clé stable : l'id, sinon le nom suivi du rang parmi les champs de même nom
const keyOf = (form, el) => el.id || `${el.name}#${[...form.elements].filter((x) => x.name === el.name).indexOf(el)}`;
const read = (el) => (el.type === "checkbox" || el.type === "radio" ? el.checked : el.value);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(PREFIX + k) || "null"); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(PREFIX + k); } catch {} },
};
const hhmm = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function clearDraft(key) { store.del(key); }

export function keepDraft(form, key, { saveLabel } = {}) {
  if (!form) return () => {};
  const bar = document.createElement("div");
  bar.className = "draftbar small";
  bar.innerHTML = `<span class="draft-st muted"></span><button type="button" class="linkbtn draft-reset">Tout réinitialiser</button>`
    + (saveLabel ? `<button type="submit" class="btn sm draft-save">${T(saveLabel)}</button>` : "");
  if (saveLabel) bar.classList.add("sticky");
  form.prepend(bar);
  const st = bar.querySelector(".draft-st"), resetBtn = bar.querySelector(".draft-reset");
  const say = (txt, cls = "muted") => { st.className = "draft-st " + cls; st.innerHTML = T(txt); };

  // État d'origine (valeurs enregistrées) : sert à savoir s'il y a vraiment des modifications
  const original = Object.fromEntries(fields(form).map((el) => [keyOf(form, el), read(el)]));
  const snapshot = () => Object.fromEntries(fields(form).map((el) => [keyOf(form, el), read(el)]));
  const changed = (snap) => Object.keys(snap).some((k) => snap[k] !== original[k]);

  // Restauration
  const saved = store.get(key);
  if (saved?.values && changed(saved.values)) {
    let n = 0;
    for (const el of fields(form)) {
      const k = keyOf(form, el);
      if (!(k in saved.values) || read(el) === saved.values[k]) continue;
      if (el.type === "checkbox" || el.type === "radio") el.checked = !!saved.values[k]; else el.value = saved.values[k];
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      n++;
    }
    if (n) say(`Modifications non enregistrées restaurées (saisies à ${hhmm(saved.at)}). Pensez à enregistrer.`, "draft-warn");
  } else if (saved) store.del(key);

  // Sauvegarde à la frappe (léger différé)
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const snap = snapshot();
      if (changed(snap)) { const at = Date.now(); store.set(key, { at, values: snap }); say(`Brouillon sauvegardé à ${hhmm(at)} · non enregistré`); }
      else { store.del(key); say(""); }
    }, 400);
  };
  const onEdit = (e) => { if (!e.target.closest(".draftbar")) save(); };
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);
  // Enregistrement : le brouillon n'a plus lieu d'être
  const onSubmit = () => { clearTimeout(timer); store.del(key); say(""); };
  form.addEventListener("submit", onSubmit, true);

  // Tout réinitialiser : deux clics, pour éviter une fausse manœuvre
  let armed = null;
  resetBtn.onclick = () => {
    if (!armed) {
      resetBtn.textContent = "Confirmer : vider tous les champs ?"; resetBtn.classList.add("danger");
      armed = setTimeout(() => { armed = null; resetBtn.textContent = "Tout réinitialiser"; resetBtn.classList.remove("danger"); }, 4000);
      return;
    }
    clearTimeout(armed); armed = null; resetBtn.textContent = "Tout réinitialiser"; resetBtn.classList.remove("danger");
    for (const el of fields(form)) {
      if (!TEXTLIKE.has(el.type) && el.tagName !== "TEXTAREA") continue;
      if (el.value === "") continue;
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    clearTimeout(timer); store.del(key);
    say("Champs vidés. Rien n'est modifié tant que vous n'enregistrez pas.", "draft-warn");
    fields(form).find((el) => TEXTLIKE.has(el.type) || el.tagName === "TEXTAREA")?.focus();
  };

  return () => { clearTimeout(timer); clearTimeout(armed); form.removeEventListener("input", onEdit); form.removeEventListener("change", onEdit); form.removeEventListener("submit", onSubmit, true); };
}
