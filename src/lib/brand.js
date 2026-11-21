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
    return { client: { name: session.client || "", logo: session.client_logo || null }, org: { name: session.org_name || "", logo: session.org_logo || null } };
  }
  const [brands, settings] = await Promise.all([api.listBrands().catch(() => []), api.getSettings().catch(() => ({}))]);
  const b = brands.find((x) => x.id === session.brand_id);
  return {
    client: { name: session.client || b?.name || "", logo: session.client_logo || b?.logo || null },
    org: { name: settings.org_name || "", logo: settings.org_logo || null },
  };
}

// onDark : logos posés sur fond bleu (slides, bandeau) plutôt que sur fond blanc
export function logosHtml(br, cls = "", onDark = false) {
  const one = (x) => (x.logo ? `<span class="logo-tile ${cls}"><img src="${esc(x.logo)}" alt="${esc(x.name)}"></span>` : x.name ? `<span class="logo-tile text ${cls}">${T(x.name)}</span>` : "");
  const a = one(br.client);
  // Organisme : logo déposé dans les réglages, sinon le logo Samsa intégré
  const b = br.org.logo ? one(br.org) : samsaHtml(onDark, cls);
  return a || b ? `<div class="logos">${a}${a && b ? `<span class="logo-x" aria-hidden="true">×</span>` : ""}${b}</div>` : "";
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
