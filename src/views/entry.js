/* Parcours d'entrée du stagiaire, en slides plein écran :
   1. titre de la formation (logos, dates)
   2. connexion : prénom + e-mail → code personnel reçu par e-mail
   3. émargement (QR code de l'organisme)
   4. support de formation (téléchargeable une heure avant la fin)
   → tableau de bord de la session. */
import { $, T, esc, guard, toast } from "../lib/dom.js";
import { resolveBranding, logosHtml, datesFr, hhmm, titleDate, emargementQr, samsaHtml, emargementLabels, emargementStepsHtml } from "../lib/brand.js";
import { skinFooter } from "../lib/skin.js";

export async function viewEntry(root, [code], ctx) {
  const { api, go } = ctx;
  const pub = await api.sessionPublic(code);
  document.body.classList.add("bare");
  if (!pub) {
    root.innerHTML = slide(`<div class="slide-title">Session introuvable</div><p class="slide-sub">${T("Ce code ne correspond à aucune formation en cours. Vérifiez le lien ou le QR code fourni par votre formateur.")}</p><a class="btn light" href="#/login">Saisir un code</a>`);
    return;
  }
  api.warmAccess?.(); // la fonction d'envoi du code démarre pendant la lecture de la slide de titre
  const br = await resolveBranding(api, pub);
  let user = await api.currentUser();
  let step = "title", email = "", first = "", demoCode = null;

  const draw = async () => {
    user = await api.currentUser();
    if (step === "title") {
      root.innerHTML = slide(`
        ${logosHtml(br, "lg", true)}
        <div class="slide-title">${T(pub.formation)}</div>
        ${samsaHtml(true, "slidebig")}
        ${pub.title && pub.title !== pub.formation ? `<p class="slide-sub">${T(pub.title)}</p>` : ""}
        <p class="slide-date">${T(titleDate(pub))}</p>
        <button class="btn light big" id="go">Commencer →</button>`, "title");
      $("#go").onclick = async () => {
        if (!user) { step = "login"; return draw(); }
        const m = await api.myMembership(pub.id).catch(() => null);
        if (!m) await guard(() => api.joinSession(code));
        step = m?.progress?.intro ? "done" : "emargement"; draw();
      };
    } else if (step === "login") {
      root.innerHTML = slide(`
        ${logosHtml(br, "", true)}
        <div class="slide-kick">Connexion</div>
        <div class="slide-title sm">Recevez votre code d'accès</div>
        <p class="slide-sub">${T("Un code personnel vous est envoyé par e-mail. Il fonctionne sur tous vos appareils pendant la formation, puis il est détruit.")}</p>
        <form class="slide-form" id="reqF">
          <label for="fn">Prénom</label><input type="text" id="fn" required maxlength="60" autocomplete="given-name" value="${esc(first)}">
          <label for="em">E-mail</label><input type="email" id="em" required autocomplete="email" value="${esc(email)}">
          <button class="btn light big" type="submit">Recevoir mon code</button>
        </form>
        <button class="linkbtn light" id="haveCode">J'ai déjà un code</button>`);
      $("#reqF").onsubmit = async (e) => {
        e.preventDefault();
        first = $("#fn").value.trim(); email = $("#em").value.trim().toLowerCase();
        const btn = $("#reqF button"); btn.disabled = true; btn.textContent = "Envoi…";
        const r = await guard(() => api.requestAccess(pub.id, first, email));
        if (r) { demoCode = r.demoCode || null; step = "code"; draw(); } else { btn.disabled = false; btn.textContent = "Recevoir mon code"; }
      };
      $("#haveCode").onclick = () => { step = "code"; draw(); };
    } else if (step === "code") {
      root.innerHTML = slide(`
        ${logosHtml(br, "", true)}
        <div class="slide-kick">Connexion</div>
        <div class="slide-title sm">Saisissez votre code</div>
        <p class="slide-sub">${email ? T(`Envoyé à ${email}. Pensez à vérifier les indésirables.`) : T("Le code reçu par e-mail pour cette formation.")}</p>
        ${demoCode ? `<p class="demo-code">Mode démonstration : votre code est <b class="mono">${esc(demoCode)}</b></p>` : ""}
        <form class="slide-form" id="codeF">
          ${email ? "" : `<label for="em2">E-mail</label><input type="email" id="em2" required autocomplete="email">`}
          <label for="cd">Code à six caractères</label>
          <input type="text" id="cd" required maxlength="8" autocomplete="one-time-code" class="mono code-input" placeholder="ABC123" autocapitalize="characters">
          <button class="btn light big" type="submit">Entrer</button>
        </form>
        <button class="linkbtn light" id="back">Recevoir un nouveau code</button>`);
      $("#cd").focus();
      $("#codeF").onsubmit = async (e) => {
        e.preventDefault();
        if (!email) email = $("#em2").value.trim().toLowerCase();
        const ok = await guard(() => api.verifyAccess(pub.id, email, $("#cd").value));
        if (ok) {
          await ctx.refreshMe?.();
          const m = await api.myMembership(pub.id).catch(() => null);
          step = m?.progress?.intro ? "done" : "emargement"; draw();
        }
      };
      $("#back").onclick = () => { step = "login"; draw(); };
    } else if (step === "emargement") {
      const s = await api.getSession(pub.id);
      const qr = s ? await emargementQr(s) : null;
      root.innerHTML = slide(`
        <div class="slide-kick">Étape 1 sur 2</div>
        <div class="slide-title sm">${s && emargementLabels(s, br).second && emargementLabels(s, br).client ? "Deux étapes pour émarger" : "Émargement"}</div>
        ${s ? emargementStepsHtml(s, qr, emargementLabels(s, br), true) : ""}
        <button class="btn light big" id="next">Continuer →</button>`);
      $("#next").onclick = () => { step = "support"; draw(); };
    } else if (step === "support") {
      const st = await api.supportStatus(pub.id).catch(() => ({ unlocked: false }));
      root.innerHTML = slide(`
        <div class="slide-kick">Étape 2 sur 2</div>
        <div class="slide-title sm">Le support de la formation</div>
        ${supportBlock(st, true)}
        <button class="btn light big" id="next">Accéder à mon tableau de bord →</button>`);
      $("#next").onclick = async () => {
        const m = await api.myMembership(pub.id).catch(() => null);
        if (m) await api.saveProgress(pub.id, { ...(m.progress || {}), intro: true }).catch(() => {});
        step = "done"; draw();
      };
    } else {
      document.body.classList.remove("bare");
      go(`#/s/${pub.id}`);
    }
  };
  await draw();
  return () => document.body.classList.remove("bare");
}

// Chaque slide porte le bandeau bleu avec le logo Samsa
const slide = (inner, kind = "") => `<div class="slide-page ${kind}"><div class="slide-inner">${inner}</div><div class="slide-bar">${samsaHtml(true, "head")}<b>${esc(skinFooter().toUpperCase())} · ${new Date().getFullYear()}</b></div></div>`;

// Bloc support, partagé avec la page « Support » du tableau de bord
export function supportBlock(st, onDark = false) {
  const when = st.unlock_at ? new Date(st.unlock_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;
  if (!st.configured) return `<p class="${onDark ? "slide-sub" : "muted"}">${T("Le support sera ajouté par le formateur. Vous le retrouverez dans le menu « Support ».")}</p>`;
  if (st.unlocked && st.url) return `<p class="${onDark ? "slide-sub" : "muted"}">${T("Le support est disponible. Il reste accessible depuis le menu « Support ».")}</p><p><a class="btn ${onDark ? "light big" : ""}" href="${esc(st.url)}" target="_blank" rel="noopener noreferrer" download>Télécharger le support ↓</a></p>`;
  return `<div class="lockbox${onDark ? " dark" : ""}"><span class="lock" aria-hidden="true">🔒</span><div><b>Téléchargement disponible en fin de formation</b><div>${when ? T(`À partir de ${when}.`) : T("Une heure avant la fin de la formation.")} ${T("Vous le retrouverez dans le menu « Support ».")}</div></div></div>`;
}
