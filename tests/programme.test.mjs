// Pauses du déroulé : déplacement dans la demi-journée, horaires recalculés, alerte deux minutes avant.
import { D1, D2 } from "../src/data.js";
import { isLunch, isShortPause, pauseTargets, movePause, shiftPause, pauseAlert, pauseAlertText } from "../src/lib/programme.js";
const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const at = (L, id) => L.find((m) => m.id === id);
const order = (L) => L.map((m) => m.id).join(",");
const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const dur = (m) => mins(m.t[1]) - mins(m.t[0]);

ok(isShortPause(at(D1, "j1-p1")) && isLunch(at(D1, "j1-dej")) && !isShortPause(at(D1, "j1-dej")) && !isLunch(at(D1, "j1-etat")), "pause de 15 min et déjeuner reconnus");
ok(pauseTargets(D1, "j1-dej").length === 0, "le déjeuner ne se déplace pas");
const tg = pauseTargets(D1, "j1-p1");
ok(tg[0] === "j1-etat" && tg.includes("j1-debrief1") && !tg.includes("j1-accueil") && !tg.includes("j1-tour"), "pause du matin : entre deux séquences du matin seulement");

// Déplacement : la pause du matin passe après « Gemini Notebook »
const before = JSON.stringify(D1);
const m1 = movePause(D1, "j1-p1", "j1-nb-exos");
ok(JSON.stringify(D1) === before, "le déroulé d'origine n'est pas modifié");
ok(order(m1).includes("j1-redactions,j1-notebook,j1-p1,j1-nb-exos"), "pause placée entre les deux séquences");
ok(at(m1, "j1-redactions").t.join("-") === "10:20-10:45" && at(m1, "j1-notebook").t.join("-") === "10:45-11:20" && at(m1, "j1-p1").t.join("-") === "11:20-11:35" && at(m1, "j1-nb-exos").t.join("-") === "11:35-12:20", "horaires recalculés en cascade");
ok(D1.every((m) => dur(m) === dur(at(m1, m.id))), "chaque séquence garde sa durée");
ok(at(m1, "j1-debrief1").t[1] === "12:30" && at(m1, "j1-dej").t.join("-") === "12:30-13:30" && order(m1.slice(m1.findIndex((m) => m.id === "j1-dej"))) === order(D1.slice(D1.findIndex((m) => m.id === "j1-dej"))), "fin de matinée, déjeuner et après-midi inchangés");
ok(movePause(D1, "j1-p1", "j1-tour") === null && movePause(D1, "j1-p1", "j1-accueil") === null && movePause(D1, "j1-dej", "j1-etat") === null && movePause(D1, "inconnue", "j1-etat") === null, "places refusées : autre demi-journée, avant la première séquence, déjeuner, pause inconnue");

// ↑ ↓ : une séquence à la fois, jusqu'aux bornes de la demi-journée
const up = shiftPause(D1, "j1-p1", -1);
ok(order(up).includes("j1-overviews,j1-p1,j1-redactions") && at(up, "j1-p1").t.join("-") === "10:20-10:35" && at(up, "j1-redactions").t.join("-") === "10:35-11:00" && at(up, "j1-notebook").t[0] === "11:00", "↑ : la pause avance d'une séquence");
let L = D1, n = 0, nx;
while ((nx = shiftPause(L, "j1-p1", -1))) { L = nx; n++; }
ok(order(L).startsWith("j1-accueil,j1-p1,j1-etat") && at(L, "j1-p1").t.join("-") === "09:40-09:55", `↑ jusqu'à la première place possible (${n} crans), puis plus rien`);
L = D1; while ((nx = shiftPause(L, "j1-p1", 1))) L = nx;
ok(order(L).includes("j1-nb-exos,j1-p1,j1-debrief1"), "↓ jusqu'à la dernière place avant le déjeuner");
ok(shiftPause(D1, "j1-dej", 1) === null, "↓ refusé pour le déjeuner");
const pm = movePause(D1, "j1-p2", "j1-rmctf");
ok(order(pm).includes("j1-tour,j1-p2,j1-rmctf") && at(pm, "j1-p2").t.join("-") === "14:30-14:45" && at(pm, "j1-paliers12").t.join("-") === "15:05-15:30" && at(pm, "j1-paliers").t[0] === "15:30", "pause de l'après-midi : même règle");
const d2 = movePause(D2, "b-p1", "b-rmctf");
ok(D2.filter((m) => m.day === 1).every((m) => JSON.stringify(at(d2, m.id).t) === JSON.stringify(m.t)) && order(d2).includes("b-jargon,b-p1,b-rmctf"), "deux journées : seul le jour concerné bouge");
ok(!pauseTargets(D2, "b-p1").some((id) => at(D2, id).day === 1), "deux journées : pas de passage d'un jour à l'autre");

// Alerte deux minutes avant (heure de Paris ; en décembre, Paris = UTC+1)
const day = () => "2026-12-04", t = (hms) => new Date(`2026-12-04T${hms}Z`);
const a1 = pauseAlert(D1, day, t("09:43:30"));
ok(a1?.m.id === "j1-p1" && a1.left === 90 && pauseAlertText(a1) === "La pause commence dans 2 minutes", "10 h 43 min 30 : « La pause commence dans 2 minutes »");
ok(pauseAlertText(pauseAlert(D1, day, t("09:44:30"))) === "La pause commence dans 1 minute", "10 h 44 min 30 : « dans 1 minute »");
ok(pauseAlertText(pauseAlert(D1, day, t("09:45:30"))) === "C'est l'heure de la pause", "10 h 45 min 30 : « C'est l'heure de la pause »");
ok(pauseAlert(D1, day, t("09:42:59")) === null && pauseAlert(D1, day, t("09:46:00")) === null, "rien avant 2 minutes, ni plus d'une minute après");
ok(pauseAlertText(pauseAlert(D1, day, t("11:28:30"))) === "Le déjeuner commence dans 2 minutes", "déjeuner : même alerte");
ok(pauseAlert(D1, () => "2026-12-05", t("09:43:30")) === null && pauseAlert(D1, () => null, t("09:43:30"))?.m.id === "j1-p1", "autre jour : rien ; session sans date : aujourd'hui");
ok(pauseAlert(m1, day, t("10:18:30"))?.m.id === "j1-p1" && pauseAlert(m1, day, t("09:43:30")) === null, "après déplacement, l'alerte suit la nouvelle heure");
const two = (d) => (d === 2 ? "2026-12-05" : "2026-12-04");
ok(pauseAlert(D2, two, new Date("2026-12-05T09:43:30Z"))?.m.id === "b-p1", "deux journées : pause du jour 2 le jour 2");

// Fin de la journée : heure modifiable, l'après-midi se recale, le bilan garde sa durée
const { applyEnds, endBounds, dayEnd } = await import("../src/lib/programme.js");
const { modulesFor, baseModules, emargementSlots } = await import("../src/lib/content.js");
const pm2 = (L, d = 2) => L.filter((m) => (m.day || 1) === d && mins(m.t[0]) >= mins("13:30"));
const b2 = endBounds(D2, 2);
ok(b2.base === "17:30" && b2.min === "14:35" && b2.max === "20:00" && b2.bilan.id === "b-bilan", "jour 2 : fin à 17 h 30, au plus tôt 14 h 35, bilan « Bilan et évaluation »");
ok(endBounds(D2, 1).bilan.id === "a-debrief" && endBounds(D1, 1).bilan.id === "j1-libre", "bilan : les séquences de la dernière demi-heure (jour 1 : débrief ; une journée : limites puis bilan)");
const snap = JSON.stringify(D2), e2 = applyEnds(D2, { 2: "16:30" });
ok(JSON.stringify(D2) === snap && at(D2, "b-bilan").t[0] === "17:00", "le déroulé d'origine n'est pas modifié");
ok(dayEnd(e2, 2) === "16:30" && at(e2, "b-bilan").t.join("-") === "16:00-16:30", "fin à 16 h 30 : bilan et évaluation de 16 h 00 à 16 h 30");
ok(at(e2, "b-paliers").t[0] === "13:30" && dur(at(e2, "b-p2")) === 15 && pm2(e2).every((m, i, L) => i === 0 || L[i - 1].t[1] === m.t[0]), "après-midi : départ à 13 h 30, pause de 15 min gardée, horaires qui s'enchaînent");
ok(pm2(e2).filter((m) => m.type !== "pause" && m.id !== "b-bilan").every((m) => dur(m) % 5 === 0 && dur(m) >= 5 && dur(m) < dur(at(D2, m.id))), "séquences de l'après-midi raccourcies, par pas de 5 minutes");
ok(D2.filter((m) => m.day === 1 || mins(m.t[0]) < mins("13:30")).every((m) => JSON.stringify(at(e2, m.id).t) === JSON.stringify(m.t)), "le jour 1 et le matin du jour 2 ne bougent pas");
ok(at(e2, "b-sve2").exo.duree <= dur(at(e2, "b-sve2")) && at(e2, "b-sve2").exo.duree < at(D2, "b-sve2").exo.duree, "exercice raccourci avec sa séquence");
const e3 = applyEnds(D2, { 2: "18:00" });
ok(at(e3, "b-bilan").t.join("-") === "17:30-18:00" && at(e3, "b-sve2").exo.duree === at(D2, "b-sve2").exo.duree, "fin à 18 h : séquences allongées, exercices inchangés");
ok(applyEnds(D2, { 2: "14:30" }) === D2 && applyEnds(D2, { 2: "20:30" }) === D2 && applyEnds(D2, { 2: "1630" }) === D2 && applyEnds(D2, { 2: "17:30" }) === D2 && applyEnds(D2, null) === D2, "heure hors bornes, mal écrite ou d'origine : déroulé inchangé");
ok(dayEnd(applyEnds(D2, { 2: "16:47" }), 2) === "16:47" && dayEnd(applyEnds(D2, { 1: "16:00", 2: "16:00" }), 1) === "16:00", "heure hors pas de 5 min tenue ; deux journées modifiées à la fois");
const e1 = applyEnds(D1, { 1: "16:45" });
ok(at(e1, "j1-libre").t.join("-") === "16:15-16:30" && at(e1, "j1-bilan").t.join("-") === "16:30-16:45" && at(e1, "j1-redactions").t.join("-") === at(D1, "j1-redactions").t.join("-"), "une journée : limites et bilan gardent leur quart d'heure, le matin ne bouge pas");
// Session : modulesFor applique la fin de journée ; les pauses se déplacent sur le déroulé de base
const S = { format: "2", date: "2026-12-04", date2: "2026-12-05", programme: { ends: { 2: "16:30" } } };
ok(modulesFor(S) === modulesFor({ ...S }) && baseModules(S) === D2 && modulesFor({ format: "2" }) === D2, "session : même tableau tant que rien ne change, déroulé par défaut sans fin modifiée");
ok(emargementSlots(S).find((x) => x.kind === "evaluation").t === "16:00", "l'évaluation de fin de stage suit le bilan (16 h 00)");
const moved = movePause(baseModules(S), "b-p2", "b-sve1");
const S2 = { ...S, programme: { formation: "x", modules: moved, base: "defaut", ends: S.programme.ends } };
const [ph, pmin] = at(modulesFor(S2), "b-p2").t[0].split(":").map(Number); // Paris = UTC+1 en décembre : 90 s avant la pause
ok(dayEnd(modulesFor(S2), 2) === "16:30" && order(modulesFor(S2)).includes("b-paliers,b-p2,b-sve1") && pauseAlert(modulesFor(S2), (d) => (d === 2 ? S.date2 : S.date), new Date(Date.UTC(2026, 11, 5, ph - 1, pmin - 2, 30)))?.left === 90, "pause déplacée et fin modifiée : les deux tiennent, l'alerte suit l'heure recalculée");

console.log(process.exitCode ? "\nDES TESTS ÉCHOUENT" : "\nTous les tests des pauses et de la fin de journée passent.");
