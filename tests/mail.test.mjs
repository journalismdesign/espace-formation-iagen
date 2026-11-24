// E-mail du code d'accès : le modèle du back-office (src/lib/codeMail.js) et celui de la fonction Edge
// (supabase/functions/access/index.ts) doivent être identiques, puis le rendu doit tenir ses promesses.
import { readFileSync } from "node:fs";
import { renderCodeMail, MAIL_DEFAULTS } from "../src/lib/codeMail.js";

let fails = 0;
const ok = (c, msg) => { console.log((c ? "ok · " : "ÉCHEC · ") + msg); if (!c) fails++; };
const block = (path) => {
  const src = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const m = src.match(/\/\/ >>> modèle du mail du code d'accès\n([\s\S]*?)\/\/ <<< modèle du mail du code d'accès/);
  return m ? m[1] : null;
};
const front = block("src/lib/codeMail.js"), fn = block("supabase/functions/access/index.ts");
ok(front && fn && front === fn, "même modèle dans le back-office et dans la fonction access");

const v = { prenom: "Camille", formation: "IA & presse <Libé>", code: "K7P2QX", validite: "mardi 25 novembre 2026 à 23:59" };
const d = renderCodeMail({}, v);
ok(d.subject === "Votre code d'accès : K7P2QX", "objet par défaut avec le code");
ok(d.text.includes("Bonjour Camille,") && d.text.includes("K7P2QX") && d.text.includes(v.validite), "texte par défaut rempli");
ok(d.html.includes("font-size:28px") && d.html.includes(">K7P2QX</p>"), "code mis en valeur dans le HTML");
ok(d.html.includes("IA &amp; presse &lt;Libé&gt;") && !d.html.includes("<Libé>"), "valeurs échappées dans le HTML");
const c = renderCodeMail({ subject: "Accès {formation}", body: "Salut {prenom} !\nÀ bientôt." }, v);
ok(c.subject === "Accès IA & presse <Libé>", "objet personnalisé");
ok(c.text.endsWith("K7P2QX") && c.html.includes(">K7P2QX</p>"), "code ajouté à la fin quand le message l'oublie");
ok(c.html.includes("Salut Camille !<br>À bientôt."), "retour à la ligne simple conservé");
const i = renderCodeMail({ body: "Votre code : {code}, valable jusqu'au {validite}." }, v);
ok(i.html.includes('<b style="font-family:monospace;letter-spacing:2px">K7P2QX</b>'), "code dans une phrase : en gras");
ok(renderCodeMail({ subject: "  ", body: "\n " }, v).text === renderCodeMail({}, v).text && MAIL_DEFAULTS.body.includes("{code}"), "champs vides = texte par défaut");

if (fails) { console.error(`\n${fails} test(s) de l'e-mail en échec.`); process.exit(1); }
console.log("\nTous les tests de l'e-mail du code passent.");
