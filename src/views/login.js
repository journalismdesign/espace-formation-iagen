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
      <h1 style="color:var(--navy);margin:4px 0 6px">Prendre en main les IA génératives</h1>
      <p class="muted">${T("Connexion réservée à l'équipe pédagogique : lien envoyé par e-mail ou compte Google. Les stagiaires entrent avec le lien ou le QR code de leur session.")}</p>
      <button class="btn google" id="gBtn" type="button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continuer avec Google
      </button>
      <div class="or"><span>ou</span></div>
      <form id="mForm">
        <label class="f" for="mail">Votre adresse e-mail</label>
        <input type="email" id="mail" required autocomplete="email" placeholder="prenom.nom@redaction.fr">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">${demo ? "Entrer" : "Recevoir un lien de connexion"}</button>
      </form>
      <div id="mMsg" class="small" style="margin-top:10px"></div>
      ${demo ? `<div class="demo-box small">
        <b>Mode démonstration.</b> Aucun e-mail n'est envoyé : saisissez n'importe quelle adresse.
        <div class="chips" style="margin-top:8px"><button class="chip" id="asTrainer">Entrer comme formateur</button></div>
        <p style="margin:8px 0 0">Côté stagiaire, ouvrez un autre onglet sur <b class="mono">#/join/DEMO42</b> pour tester le direct.</p>
      </div>` : `<p class="small muted" style="margin-top:14px">${T("Pas de mot de passe : un lien valable une heure vous est envoyé. Vos réponses et votre cadrage ne sont visibles que de vous et de l'équipe pédagogique.")}</p>`}
    </div>
  </div>`;

  $("#gBtn").onclick = () => guard(() => api.signInGoogle());
  $("#mForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#mail").value.trim();
    const r = await guard(() => api.signInEmail(email));
    if (r?.sent) $("#mMsg").innerHTML = `<div class="okbox">${T(`Lien envoyé à ${email}. Ouvrez-le depuis cet appareil ; pensez à vérifier les indésirables.`)}</div>`;
  };
  if (demo) {
    $("#asTrainer").onclick = () => api.signInEmail("formateur@demo.fr", true);
  }
}

/* Code d'accès formateur, vérifié côté serveur avant d'afficher la connexion */
async function trainerGate(root, { api, go }, onOk) {
  const configured = await api.trainerCodeConfigured().catch(() => false);
  root.innerHTML = `
  <div class="login">
    <div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace formateur</div>
      <h1 style="color:var(--navy);margin:4px 0 6px">Code d'accès</h1>
      ${configured ? `<p class="muted">${T("Saisissez le code d'accès de l'équipe pédagogique.")}</p>
      <form id="gF"><input type="password" id="gC" required autocomplete="current-password" class="mono" placeholder="Code formateur" aria-label="Code formateur">
        <button class="btn" type="submit" style="margin-top:10px;width:100%">Continuer</button></form>
      <div id="gMsg" class="small" style="margin-top:8px;color:var(--ko)"></div>`
      : `<div class="warn small">${T("Aucun code formateur n'est défini. Dans Supabase → SQL Editor, exécutez : select public.set_trainer_code('votre-code');")}</div>`}
      <p class="small" style="margin-top:18px"><a href="#/login">← Espace stagiaire</a></p>
    </div>
  </div>`;
  $("#gF")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#gF button"); btn.disabled = true; btn.textContent = "Vérification…";
    const ok = await api.checkTrainerCode($("#gC").value).catch(() => false);
    if (ok) { try { sessionStorage.setItem(GATE, "1"); } catch {} onOk(); }
    else { $("#gMsg").textContent = "Code incorrect."; btn.disabled = false; btn.textContent = "Continuer"; $("#gC").select(); }
  });
  $("#gC")?.focus();
}

/* Entrée stagiaire sans lien : saisie du code de session */
export async function viewLogin(root, _p, { go }) {
  root.innerHTML = `
  <div class="login">
    <div class="login-card card">
      <div class="kicker" style="color:var(--muted)">Espace stagiaire</div>
      <h1 style="color:var(--navy);margin:4px 0 6px">Rejoindre votre formation</h1>
      <p class="muted">${T("Scannez le QR code projeté par votre formateur, ou saisissez le code de session à six caractères.")}</p>
      <form id="sForm" class="askrow" style="margin-top:12px"><input type="text" id="sCode" maxlength="6" required class="mono" style="text-transform:uppercase" placeholder="Code de session" aria-label="Code de session"><button class="btn" type="submit">Continuer</button></form>
      <p class="small" style="margin-top:22px"><a href="#/formateur">Espace formateur →</a></p>
    </div>
  </div>`;
  $("#sForm").onsubmit = (e) => { e.preventDefault(); go("#/join/" + $("#sCode").value.trim().toUpperCase()); };
}
