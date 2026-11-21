/* Choix de l'accès aux données :
   - Supabase si VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies (.env) ;
   - sinon mode démonstration, entièrement local. */
import { createSupabaseApi } from "./supabase.js";
import { createDemoApi } from "./demo.js";
import { defaultActivities } from "../lib/activities.js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const api = URL && KEY ? createSupabaseApi(URL, KEY) : createDemoApi({ defaultActivities });
