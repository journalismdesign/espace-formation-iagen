import { defineConfig, loadEnv } from "vite";

/* Politique de sécurité du contenu (CSP), posée en <meta> dans la page construite seulement : le serveur de
   développement de Vite injecte ses propres scripts. GitHub Pages ne permet pas d'en-têtes HTTP, d'où la balise
   <meta> (frame-ancestors n'y est pas pris en compte : l'anti-cadre est fait en JS dans main.js).
   Scripts : ceux du site seulement. Connexions : Supabase (API, temps réel, fonction access). Cadres : le support
   et les présentations Google. Images : le site, les data: (logos, QR) et le https (photos, QR externes). */
function csp(env) {
  let supa = "";
  try { const u = new URL(env.VITE_SUPABASE_URL || ""); supa = ` ${u.origin} wss://${u.host}`; } catch {}
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${supa}`,
    "frame-src https://docs.google.com https://drive.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }],
  };
}

// base relative : le site fonctionne dans un sous-dossier (GitHub Pages, Netlify…)
export default defineConfig(({ mode }) => ({ base: "./", build: { target: "es2022" }, plugins: [csp(loadEnv(mode, process.cwd(), "VITE_"))] }));
