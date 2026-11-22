/* Habillages : l'apparence suit le centre de formation pour lequel on travaille (Samsa, INA, Journalism.design, ESJ, CFJ…).
   Un habillage = un nom, une couleur d'accent, une couleur sombre facultative, un logo en deux versions et la mention du pied de page.
   Sans habillage, l'interface garde la palette marine et bleu du support Samsa (valeurs par défaut de style.css).
   Avec un habillage, la base devient neutre (gris anthracite) et l'accent remplace le bleu partout. */

let current = null;
export const currentSkin = () => current;

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const rgb = (hex) => { const h = String(hex || "").replace("#", ""); return h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null; };
const toHex = (c) => "#" + c.map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
// mélange avec du blanc (t > 0) ou du noir (t < 0)
export const mix = (hex, t) => { const c = rgb(hex); if (!c) return hex; return toHex(c.map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t)))); };
export const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ""));
// luminance relative : sert à choisir un texte blanc ou foncé sur l'accent
const lum = (hex) => { const c = rgb(hex); if (!c) return 0; const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

const NEUTRAL_DARK = "#1F2328";
const VARS = ["--navy", "--blue", "--sky", "--prat", "--comp", "--tint", "--muted", "--line", "--light", "--dark", "--on-dark", "--on-dark2", "--on-accent", "--ink"];

/** Applique un habillage à toute la page (null : palette Samsa par défaut) */
export function applySkin(skin) {
  const root = document.documentElement;
  current = skin && (isHex(skin.accent) || skin.logo || skin.logo_light) ? skin : null;
  VARS.forEach((v) => root.style.removeProperty(v));
  root.dataset.skin = current ? current.id || "custom" : "samsa";
  if (!current) return;
  const accent = isHex(current.accent) ? current.accent : "#124F90";
  const dark = isHex(current.dark) ? current.dark : NEUTRAL_DARK;
  const set = (k, v) => root.style.setProperty(k, v);
  set("--navy", dark); set("--comp", dark);
  set("--blue", accent); set("--sky", mix(accent, 0.25)); set("--prat", mix(accent, 0.2));
  set("--tint", mix(accent, 0.88));
  set("--muted", "#5B6170"); set("--line", "#D5D8DE"); set("--light", "#F4F5F7"); set("--dark", "#202227");
  set("--on-dark", "#E3E5E9"); set("--on-dark2", "#B9BDC6");
  set("--on-accent", lum(accent) > 0.45 ? "#111111" : "#ffffff");
  // Textes de couleur (titres, intitulés, chiffres clés) : l'accent, assombri s'il est trop clair pour être lu sur fond blanc
  set("--ink", lum(accent) > 0.3 ? mix(accent, lum(accent) > 0.55 ? -0.55 : -0.35) : accent);
}

/** Couleur sombre en cours (QR codes) */
export const skinDark = () => (current ? (isHex(current.dark) ? current.dark : NEUTRAL_DARK) : "#0A2D4E");
/** Mention du pied de page des écrans */
export const skinFooter = () => (current?.footer || "Journalisme & IA");

/** Habillage d'une session : le sien, sinon celui par défaut, sinon aucun (Samsa) */
export function skinFor(session, skins = [], defaultId = null) {
  const id = session?.skin_id || defaultId;
  return (id && skins.find((s) => s.id === id)) || null;
}
/** Habillage reconstitué à partir de session_public (accès sans connexion) */
export const skinFromPublic = (pub) => (pub && (pub.skin_accent || pub.skin_logo || pub.skin_logo_light)
  ? { id: pub.skin_id, name: pub.skin_name, accent: pub.skin_accent, dark: pub.skin_dark, logo: pub.skin_logo, logo_light: pub.skin_logo_light, footer: pub.skin_footer }
  : null);

/* Cache des habillages et de l'habillage par défaut (lus une fois, relus après une modification) */
let cache = null;
export const invalidateSkins = () => { cache = null; };
export async function loadSkins(api) {
  if (cache && Date.now() - cache.at > 60000) cache = null; // relu au plus toutes les minutes
  if (!cache) {
    const [skins, settings] = await Promise.all([api.listSkins().catch(() => []), api.getSettings().catch(() => ({}))]);
    cache = { skins: skins || [], def: settings.default_skin || null, at: Date.now() };
  }
  return cache;
}
/** Habillage à appliquer pour une adresse : session ouverte, entrée stagiaire, sinon l'habillage par défaut */
export async function skinForRoute(api, hash, user) {
  let m;
  if ((m = hash.match(/^#\/join\/([A-Za-z0-9]+)/))) return skinFromPublic(await api.sessionPublic(m[1]).catch(() => null));
  if (!user) return null;
  let { skins, def } = await loadSkins(api);
  if ((m = hash.match(/^#\/(?:s|admin\/s|ecran)\/([\w-]+)/))) {
    const session = await api.getSession(m[1]).catch(() => null);
    // habillage créé depuis un autre onglet ou un autre poste : on relit la liste
    if (session?.skin_id && !skins.some((k) => k.id === session.skin_id)) { invalidateSkins(); ({ skins, def } = await loadSkins(api)); }
    return skinFor(session, skins, def);
  }
  return skinFor(null, skins, def);
}
