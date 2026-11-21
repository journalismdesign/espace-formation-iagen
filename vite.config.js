import { defineConfig } from "vite";
// base relative : le site fonctionne dans un sous-dossier (GitHub Pages, Netlify…)
export default defineConfig({ base: "./", build: { target: "es2022" } });
