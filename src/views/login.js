/* Connexion : lien magique par e-mail ou compte Google. */
import { $, T, esc, guard } from "../lib/dom.js";

const GATE = "iagen-trainer-gate";

export async function viewTrainerLogin(root, p, ctx) {
  const { api } = ctx;
  let passed = false;
  try { passed = sessionStorage.getItem(GATE) === "1"; } catch {}
  if (!passed) return trainerGate(root, ctx, () => viewTrainerLogin(root, p, ctx));
  const demo = api.mode === "demo";
  root.innerHTML = `
  <div class="login">
    <div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace formateur</div>
      <h1 style="color:var(--ink);margin:4px 0 6px">Prendre en main les IA génératives</h1>
      <p class="muted">${T("Connexion réservée à l'équipe pédagogique : code envoyé par e-mail ou compte Google. Les stagiaires entrent avec le lien ou le QR code de leur session.")}</p>
      <button class="btn google" id="gBtn" type="button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continuer avec Google
      </button>
      <div class="or"><span>ou</span></div>
      <form id="mForm">
        <label class="f" for="mail">Votre adresse e-mail</label>
        <input type="email" id="mail" required autocomplete="email" placeholder="prenom.nom@redaction.fr">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">${demo ? "Entrer" : "Recevoir un code de connexion"}</button>
      </form>
      <form id="mCode" hidden>
        <label class="f" for="mTok">Code reçu par e-mail</label>
        <input id="mTok" required inputmode="numeric" autocomplete="one-time-code" class="mono" placeholder="123456" maxlength="12">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">Se connecter</button>
      </form>
      <div id="mMsg" class="small" style="margin-top:10px"></div>
      ${demo ? `<div class="demo-box small">
        <b>Mode démonstration.</b> Aucun e-mail n'est envoyé : saisissez n'importe quelle adresse.
        <div class="chips" style="margin-top:8px"><button class="chip" id="asTrainer">Entrer comme formateur</button></div>
        <p style="margin:8px 0 0">Côté stagiaire, ouvrez un autre onglet sur <b class="mono">#/join/DEMO42</b> pour tester le direct.</p>
      </div>` : `<p class="small muted" style="margin-top:14px">${T("Pas de mot de passe : un code valable une heure vous est envoyé. Vos réponses et votre cadrage ne sont visibles que de vous et de l'équipe pédagogique.")}</p>`}
    </div>
  </div>`;

  $("#gBtn").onclick = () => guard(() => api.signInGoogle());
  $("#mForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#mail").value.trim();
    const r = await guard(() => api.signInEmail(email));
    if (!r?.sent) return;
    $("#mForm").hidden = true; $("#mCode").hidden = false; $("#mTok").focus();
    $("#mMsg").innerHTML = `<div class="okbox">${T(`Code envoyé à ${esc(email)}. Pensez à vérifier les indésirables.`)}</div>`;
    $("#mCode").onsubmit = async (ev) => {
      ev.preventDefault();
      const b = $("#mCode button"); b.disabled = true; b.textContent = "Vérification…";
      try { await api.verifyEmailOtp(email, $("#mTok").value); }
      catch { b.disabled = false; b.textContent = "Se connecter"; $("#mMsg").innerHTML = `<div class="warn">Code invalide ou expiré.</div>`; $("#mTok").select(); }
    };
  };
  if (demo) {
    $("#asTrainer").onclick = () => api.signInEmail("formateur@demo.fr", true);
  }
}

/* Code d'accès formateur, vérifié côté serveur avant d'afficher la connexion.
   Pas encore de code, ou code oublié : code temporaire par e-mail, puis choix du code. */
export const RESET = "iagen-code-reset";
async function trainerGate(root, ctx, onOk) {
  const { api } = ctx;
  const configured = await api.trainerCodeConfigured().catch(() => false);
  if (!configured) return otpFlow(root, ctx, true);
  root.innerHTML = `
  <div class="login">
    <div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace formateur</div>
      <h1 style="color:var(--ink);margin:4px 0 6px">Code d'accès</h1>
      <p class="muted">${T("Saisissez le code d'accès de l'équipe pédagogique.")}</p>
      <form id="gF"><input type="password" id="gC" required autocomplete="current-password" class="mono" placeholder="Code formateur" aria-label="Code formateur">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">Continuer</button></form>
      <div id="gMsg" class="small" style="margin-top:8px;color:var(--ko)"></div>
      <p class="small" style="margin-top:14px"><button class="linkbtn" id="gForgot" type="button">Code oublié ? Recevoir un code temporaire par e-mail</button></p>
      <p class="small" style="margin-top:6px"><a href="#/login">← Espace stagiaire</a></p>
    </div>
  </div>`;
  $("#gF").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#gF button"); btn.disabled = true; btn.textContent = "Vérification…";
    const ok = await api.checkTrainerCode($("#gC").value).catch(() => false);
    if (ok) { try { sessionStorage.setItem(GATE, "1"); } catch {} onOk(); }
    else { $("#gMsg").textContent = "Code incorrect."; btn.disabled = false; btn.textContent = "Continuer"; $("#gC").select(); }
  });
  $("#gForgot").onclick = () => otpFlow(root, ctx, false);
  $("#gC").focus();
}

/* Étape 1 : adresse e-mail · étape 2 : code reçu. La connexion déclenche ensuite le choix du code. */
function otpFlow(root, { api, go }, first) {
  root.innerHTML = `
  <div class="login">
    <div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace formateur</div>
      <h1 style="color:var(--ink);margin:4px 0 6px">${first ? "Première connexion" : "Code oublié"}</h1>
      <p class="muted">${T(first
        ? "Aucun code d'accès n'est encore défini. Recevez un code temporaire sur votre adresse de formateur·ice, puis choisissez le code d'accès de l'équipe."
        : "Recevez un code temporaire sur votre adresse de formateur·ice, puis choisissez un nouveau code d'accès.")}</p>
      <form id="oF">
        <label class="f" for="oM">Votre adresse e-mail</label>
        <input type="email" id="oM" required autocomplete="email" placeholder="prenom.nom@exemple.fr">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">Recevoir le code</button>
      </form>
      <form id="vF" hidden>
        <label class="f" for="vC">Code reçu par e-mail</label>
        <input id="vC" required inputmode="numeric" autocomplete="one-time-code" class="mono" placeholder="123456" maxlength="12">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">Valider</button>
        <p class="small muted" style="margin-top:8px">${T("Valable une heure. Vous pouvez aussi cliquer sur le lien du message, depuis cet appareil.")} <button class="linkbtn" id="vBack" type="button">Changer d'adresse</button></p>
      </form>
      <div id="oMsg" class="small" style="margin-top:10px"></div>
      <p class="small" style="margin-top:14px">${first ? `<a href="#/login">← Espace stagiaire</a>` : `<button class="linkbtn" id="oCancel" type="button">← Saisir le code d'accès</button>`}</p>
    </div>
  </div>`;
  let email = "";
  const msg = (h) => ($("#oMsg").innerHTML = h);
  $("#oF").onsubmit = async (e) => {
    e.preventDefault();
    email = $("#oM").value.trim().toLowerCase();
    const btn = $("#oF button"); btn.disabled = true; btn.textContent = "Envoi…";
    const r = await guard(() => api.sendTrainerOtp(email));
    btn.disabled = false; btn.textContent = "Recevoir le code";
    if (!r?.sent) return;
    try { localStorage.setItem(RESET, "1"); } catch {}
    $("#oF").hidden = true; $("#vF").hidden = false; $("#vC").focus();
    msg(`<div class="okbox">${T(`Code envoyé à ${esc(email)}. Pensez à vérifier les indésirables.`)}</div>`
      + (r.demoCode ? `<div class="demo-box small" style="margin-top:8px"><b>Mode démonstration.</b> Code : <b class="mono" id="demoOtp">${r.demoCode}</b></div>` : ""));
  };
  $("#vBack").onclick = () => { $("#vF").hidden = true; $("#oF").hidden = false; msg(""); };
  $("#vF").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#vF button"); btn.disabled = true; btn.textContent = "Vérification…";
    try {
      await api.verifyEmailOtp(email, $("#vC").value);
      go("#/formateur/code"); // la connexion relance aussi le rendu : main.js redirige vers le choix du code
    } catch {
      btn.disabled = false; btn.textContent = "Valider";
      msg(`<div class="warn">Code invalide ou expiré.</div>`); $("#vC").select();
    }
  };
  $("#oCancel")?.addEventListener("click", () => trainerGate(root, { api, go }, () => go("#/formateur")));
  $("#oM").focus();
}

/* Choix du code d'accès, après connexion par code temporaire */
export async function viewSetTrainerCode(root, _p, { api, go, refreshMe }) {
  const isTrainer = await api.claimTrainer().catch(() => false);
  if (!isTrainer) {
    try { localStorage.removeItem(RESET); } catch {}
    const me = await api.currentUser();
    root.innerHTML = `<div class="login"><div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace formateur</div>
      <h1 style="color:var(--ink);margin:4px 0 6px">Adresse non déclarée</h1>
      <p class="muted">${T(`${esc(me?.email || "Cette adresse")} n'est pas déclarée comme formateur·ice. Dans Supabase → SQL Editor : insert into trainer_emails values ('${esc(me?.email || "votre@adresse.fr")}'); puis recommencez.`)}</p>
      <button class="btn" id="sOut" style="width:100%">Se déconnecter</button>
    </div></div>`;
    $("#sOut").onclick = async () => { await api.signOut(); go("#/formateur"); };
    return;
  }
  root.innerHTML = `<div class="login"><div class="login-card card">
    <div class="kicker" style="color:var(--muted)">Espace formateur</div>
    <h1 style="color:var(--ink);margin:4px 0 6px">Choisissez le code d'accès</h1>
    <p class="muted">${T("Ce code protège l'entrée de l'espace formateur pour toute l'équipe. Au moins 6 caractères.")}</p>
    <form id="cF">
      <label class="f" for="c1">Nouveau code</label>
      <input type="password" id="c1" required minlength="6" autocomplete="new-password" class="mono">
      <label class="f" for="c2" style="margin-top:8px">Confirmation</label>
      <input type="password" id="c2" required minlength="6" autocomplete="new-password" class="mono">
      <button class="btn" type="submit" style="margin-top:12px;width:100%">Enregistrer et entrer</button>
    </form>
    <div id="cMsg" class="small" style="margin-top:8px;color:var(--ko)"></div>
  </div></div>`;
  $("#cF").onsubmit = async (e) => {
    e.preventDefault();
    const a = $("#c1").value.trim(), b = $("#c2").value.trim();
    if (a.length < 6) return ($("#cMsg").textContent = "Au moins 6 caractères.");
    if (a !== b) return ($("#cMsg").textContent = "Les deux saisies diffèrent.");
    if (await guard(() => api.setTrainerCode(a), "Code d'accès enregistré.") === undefined) return;
    try { localStorage.removeItem(RESET); sessionStorage.setItem(GATE, "1"); } catch {}
    await refreshMe?.();
    go("#/admin");
  };
  $("#c1").focus();
}

export async function viewLogin(root, _p, { go }) {
  root.innerHTML = `
  <div class="login">
    <div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace stagiaire</div>
      <h1 style="color:var(--ink);margin:4px 0 6px">Rejoindre votre formation</h1>
      <p class="muted">${T("Scannez le QR code projeté par votre formateur, ou saisissez le code de session.")}</p>
      <form id="sForm" class="askrow" style="margin-top:12px"><input type="text" id="sCode" maxlength="8" required class="mono" style="text-transform:uppercase" placeholder="Code de session" aria-label="Code de session"><button class="btn" type="submit">Continuer</button></form>
      <p class="small" style="margin-top:22px"><a href="#/formateur">Espace formateur →</a></p>
    </div>
  </div>`;
  $("#sForm").onsubmit = (e) => { e.preventDefault(); go("#/join/" + $("#sCode").value.trim().toUpperCase()); };
}
