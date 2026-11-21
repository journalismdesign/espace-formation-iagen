/* Profil : nom, métier, niveau, outils déjà utilisés. */
import { $, $$, T, esc, guard } from "../lib/dom.js";
import { METIERS, NIVEAUX, OUTILS } from "./cadrageModel.js";

export function profileFields(me) {
  const chips = (name, list, val, multi) => `<div class="chips" data-chips="${name}" data-multi="${multi ? 1 : ""}">${list.map((x) => `<button type="button" class="chip pick${(multi ? (val || []).includes(x) : val === x) ? " on" : ""}" data-v="${esc(x)}">${T(x)}</button>`).join("")}</div>`;
  return `
    <label class="f" for="pName">Votre nom, tel qu'il apparaîtra dans la discussion</label>
    <input type="text" id="pName" maxlength="80" value="${esc(me.full_name || "")}" placeholder="Prénom Nom">
    <label class="f">Votre métier</label>${chips("metier", METIERS, me.metier)}
    <label class="f">Avez-vous déjà utilisé un assistant d'IA générative ?</label>${chips("niveau", NIVEAUX, me.niveau)}
    <label class="f">Outils déjà utilisés (facultatif)</label>${chips("outils", OUTILS, me.outils, true)}`;
}
// Branche les puces ; onChange(patch) reçoit le profil modifié
export function bindProfileFields(root, me, onChange) {
  const state = { full_name: me.full_name || "", metier: me.metier, niveau: me.niveau, outils: [...(me.outils || [])] };
  $("#pName", root).oninput = (e) => { state.full_name = e.target.value.trim(); onChange({ ...state }); };
  $$("[data-chips]", root).forEach((box) => $$(".pick", box).forEach((b) => (b.onclick = () => {
    const k = box.dataset.chips, v = b.dataset.v;
    if (box.dataset.multi) { state[k] = state[k].includes(v) ? state[k].filter((x) => x !== v) : [...state[k], v]; b.classList.toggle("on"); }
    else { state[k] = state[k] === v ? null : v; $$(".pick", box).forEach((x) => x.classList.toggle("on", x === b && state[k] === v)); }
    onChange({ ...state });
  })));
}

export async function viewProfile(root, _p, { api, me, refreshMe }) {
  root.innerHTML = `<div class="pagehead"><div><h1>Mon profil</h1><p class="muted">${T("Ces informations aident le formateur à adapter la journée. Elles ne sont visibles que de vous et de l'équipe pédagogique.")}</p></div></div>
    <div class="card" style="max-width:760px">${profileFields(me)}
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center"><button class="btn" id="pSave">Enregistrer</button><span class="small muted">${esc(me.email)}</span></div>
    </div>`;
  let patch = null;
  bindProfileFields(root, me, (p) => (patch = p));
  $("#pSave").onclick = async () => { if (patch) { await guard(() => api.updateMe(patch), "Profil enregistré."); await refreshMe(); } };
}
