/* Choix de l'accès aux données :
   - Supabase si VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies (.env) ;
   - sinon mode démonstration, entièrement local. */
import { createSupabaseApi } from "./supabase.js";
import { createDemoApi } from "./demo.js";
import { defaultActivities } from "../lib/activities.js";

// Tolère une URL copiée avec /rest/v1/ ou une barre finale : seule la racine du projet compte
const URL = (import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/(rest|auth|storage|functions)\/v1\/?.*$/, "").replace(/\/+$/, "");
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const api = URL && KEY ? createSupabaseApi(URL, KEY) : createDemoApi({ defaultActivities });
