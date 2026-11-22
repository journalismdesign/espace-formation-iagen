/* Identité visuelle d'une session (logo client, organisme de formation),
   dates affichées, import d'images en data URL. */
import QRCode from "qrcode";
import { T, esc, dateFr } from "./dom.js";
import samsaLogo from "../assets/samsa-logo.png";

// Logo Samsa (organisme de formation), blanc : tel quel sur fond bleu,
// teinté en marine par masque CSS sur fond clair
export const SAMSA_LOGO = samsaLogo;
export const samsaHtml = (onDark = true, cls = "") => onDark
  ? `<img class="samsa ${cls}" src="${samsaLogo}" alt="Samsa">`
  : `<span class="samsa-mask ${cls}" role="img" aria-label="Samsa" style="--samsa:url('${samsaLogo}')"></span>`;

// Logos et noms à partir d'une session complète (connecté) ou publique
export async function resolveBranding(api, session) {
  if (session.org_name !== undefined) {
    // déjà résolue par session_public
    return { client: { name: session.client || "", logo: session.client_logo || null, logoLight: session.client_logo_light || null },
      org: { name: session.org_name || "", logo: session.org_logo || null, logoLight: session.org_logo_light || null } };
  }
  const [brands, settings] = await Promise.all([api.listBrands().catch(() => []), api.getSettings().catch(() => ({}))]);
  const b = brands.find((x) => x.id === session.brand_id);
  return {
    client: { name: session.client || b?.name || "", logo: session.client_logo || b?.logo || null, logoLight: session.client_logo_light || b?.logo_light || null },
    org: { name: settings.org_name || "", logo: settings.org_logo || null, logoLight: settings.org_logo_light || null },
  };
}

// Bloc « Une formation pour » + logo de l'entreprise cliente.
// onDark : posé sur fond bleu ; withOrg : ajoute le logo de l'organisme
// (seulement là où le bandeau bleu avec Samsa n'est pas visible).
// Version du logo adaptée au fond : claire sur marine, sombre sur fond clair
export const pickLogo = (x, onDark) => (onDark ? x.logoLight || x.logo : x.logo || x.logoLight) || null;

export function logosHtml(br, cls = "", onDark = false, withOrg = false) {
  const c = { ...br.client, logo: pickLogo(br.client, onDark) };
  const tile = c.logo ? `<span class="logo-tile ${cls}"><img src="${esc(c.logo)}" alt="${esc(c.name)}"></span>` : c.name ? `<span class="logo-tile text ${cls}">${T(c.name)}</span>` : "";
  const client = tile ? `<div class="for-client ${cls}${onDark ? " dark" : ""}"><span class="for-label">Une formation pour</span>${tile}</div>` : "";
  const ol = pickLogo(br.org, onDark);
  const org = withOrg ? (ol ? `<span class="logo-tile ${cls}"><img src="${esc(ol)}" alt="${esc(br.org.name)}"></span>` : samsaHtml(onDark, cls)) : "";
  return client || org ? `<div class="logos">${org}${client}</div>` : "";
}

// « mardi 1er décembre 2026 » ou « 1er et 2 décembre 2026 »
export function datesFr(s) {
  const d1 = s.date, d2 = s.format === "2" ? s.date2 : null;
  if (!d1) return "Date à fixer";
  const day = (d) => { const n = new Date(d + "T12:00:00").getDate(); return n === 1 ? "1er" : String(n); };
  if (!d2) return dateFr(d1).replace(/^(\S+) 1 /, "$1 1er ");
  const a = new Date(d1 + "T12:00:00"), b = new Date(d2 + "T12:00:00");
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${day(d1)} et ${day(d2)} ${b.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
  return `${dateFr(d1, { day: "numeric", month: "long" })} et ${dateFr(d2, { day: "numeric", month: "long", year: "numeric" })}`;
}
export const hhmm = (t) => String(t || "").slice(0, 5).replace(/^0/, "").replace(":", " h ");

// QR code d'émargement : image fournie, sinon généré depuis le lien
export async function emargementQr(session, size = 520) {
  if (session.emargement_qr) return session.emargement_qr;
  if (session.emargement_url) return QRCode.toDataURL(session.emargement_url, { width: size, margin: 1, color: { dark: "#0A2D4E", light: "#ffffff" } });
  return null;
}

// Fichier image → data URL, réduit si nécessaire (logos, QR)
export function fileToDataUrl(file, max = 700) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("Choisissez une image (PNG, JPEG, SVG)."));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Lecture du fichier impossible."));
    fr.onload = () => {
      const url = fr.result;
      if (file.type === "image/svg+xml") return url.length < 300000 ? resolve(url) : reject(new Error("SVG trop lourd (300 Ko maximum)."));
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Image illisible."));
      img.src = url;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- Émargement en deux étapes ---------- */
// Libellés : « Pour Samsa.fr » (QR de l'organisme) et « Pour <client> » (lien reçu par e-mail)
export function emargementLabels(session, branding) {
  const org = branding?.org?.name || "Samsa";
  return {
    org: /^samsa$/i.test(org) ? "Samsa.fr" : org,
    client: session.emargement_label || branding?.client?.name || "",
    // second émargement : facultatif, texte modifiable
    second: session.emargement2_enabled !== false,
    text: session.emargement2_text || EM2_DEFAULT,
  };
}
export const EM2_DEFAULT = "Signez la feuille de présence en suivant le lien envoyé par mail";
export const MAIL_ICON = `<svg viewBox="0 0 120 76" aria-hidden="true"><rect x="0" y="0" width="120" height="76" fill="currentColor"/><path d="M2 2 L60 46 L118 2" fill="none" stroke="#fff" stroke-width="4"/><text x="60" y="27" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="800" font-size="20" fill="#fff">@</text></svg>`;

// Version compacte pour l'espace stagiaire (fond clair ou marine)
export function emargementStepsHtml(session, qr, labels, onDark = false) {
  return `<div class="em-steps${onDark ? " dark" : ""}">
    <div class="em-step"><div class="em-h">Pour <u>${T(labels.org)}</u></div><p>Signez la feuille de présence grâce à ce QR code.</p>
      ${qr ? `<div class="em-qr"><img src="${qr}" alt="QR code d'émargement"></div>${session.emargement_url ? `<a class="btn sm${onDark ? " light" : ""}" href="${esc(session.emargement_url)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien ↗</a>` : ""}` : `<p class="small">QR code à venir.</p>`}</div>
    ${labels.second && labels.client ? `<div class="em-step"><div class="em-h">Pour ${T(labels.client)}</div><p>${T(labels.text)}</p><div class="em-mail">${MAIL_ICON}</div></div>` : ""}
  </div>`;
}

/* ---------- Évaluation de fin de stage ---------- */
export const EVAL_TITLE = "Avant de télécharger la présentation, remplissez votre évaluation";
export const EVAL_TEXT = "Merci de prendre le temps de remplir le formulaire que vous trouverez en ligne à l'adresse sous le QR code";
export function evaluationInfo(session) {
  return { url: session.evaluation_url || "", title: session.evaluation_title || EVAL_TITLE, text: session.evaluation_text || EVAL_TEXT, configured: !!(session.evaluation_url || session.evaluation_qr) };
}
export async function evaluationQr(session, size = 520) {
  if (session.evaluation_qr) return session.evaluation_qr;
  if (session.evaluation_url) return QRCode.toDataURL(session.evaluation_url, { width: size, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return null;
}
// Bloc stagiaire : titre, texte, QR, lien
export function evaluationHtml(session, qr, onDark = false) {
  const e = evaluationInfo(session);
  if (!e.configured) return "";
  return `<div class="eval-block${onDark ? " dark" : ""}"><div class="eval-txt"><div class="em-h">${T(e.title)}</div><p>${T(e.text)}</p>
    ${e.url ? `<a class="btn${onDark ? " light" : ""}" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Remplir l'évaluation ↗</a>` : ""}</div>
    ${qr ? `<div class="em-qr"><img src="${qr}" alt="QR code de l'évaluation"></div>` : ""}</div>`;
}
