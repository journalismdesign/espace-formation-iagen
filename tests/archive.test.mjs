// Fin de formation et archivage (src/lib/archive.js)
import { ARCHIVE_DAYS, lastDate, archiveDate, isArchived, daysLeft, sessionEnded, nextTrainingDay, addDays, daysBetween, joursTxt } from "../src/lib/archive.js";

const ok = (c, m) => { if (!c) { console.error("ÉCHEC :", m); process.exitCode = 1; } else console.log("ok ·", m); };
const one = { date: "2026-12-06", format: "1", status: "draft" };
const two = { date: "2026-12-06", date2: "2026-12-08", format: "2", status: "draft" };
const endOf = (n) => ({ 1: "17:30", 2: "16:30" })[n];

ok(ARCHIVE_DAYS === 5, "archivage 5 jours après la fin");
ok(addDays("2026-12-30", 5) === "2027-01-04" && daysBetween("2026-12-06", "2026-12-11") === 5, "calcul des dates (changement d'année compris)");
ok(addDays("2026-03-27", 5) === "2026-04-01", "calcul des dates au passage à l'heure d'été");
ok(lastDate(one) === "2026-12-06" && lastDate(two) === "2026-12-08", "dernier jour : jour 1, ou jour 2 en deux journées");
ok(lastDate({ ...two, format: "1" }) === "2026-12-06", "une date de jour 2 oubliée en une journée est ignorée");
ok(archiveDate(two) === "2026-12-13" && archiveDate({}) === null, "date d'archivage, rien sans date");
ok(!isArchived(two, "2026-12-12") && isArchived(two, "2026-12-13") && isArchived(two, "2027-01-01"), "archivée à partir du 5e jour après la fin");
ok(!isArchived({ status: "closed" }, "2030-01-01"), "sans date : jamais archivée");
ok(daysLeft(one, "2026-12-06") === 5 && daysLeft(one, "2026-12-10") === 1 && daysLeft(one, "2026-12-11") === 0 && daysLeft({}) === null, "jours d'accès restants");
ok(joursTxt(1) === "1 jour" && joursTxt(5) === "5 jours", "1 jour, 5 jours");

ok(sessionEnded({ ...one, status: "closed" }, { today: "2026-12-01" }), "close : terminée, quelle que soit la date");
ok(!sessionEnded(one, { today: "2026-12-06", hm: "12:45", endOf }), "dernier jour, déjeuner : pas terminée (va reprendre)");
ok(!sessionEnded(one, { today: "2026-12-06", hm: "17:00", endOf }), "dernier jour, pause avant la fin : pas terminée");
ok(sessionEnded(one, { today: "2026-12-06", hm: "17:30", endOf }), "dernier jour, salle fermée à l'heure de fin : terminée");
ok(!sessionEnded({ ...one, status: "live" }, { today: "2026-12-06", hm: "18:00", endOf }), "salle encore ouverte le dernier jour : pas terminée");
ok(sessionEnded({ ...one, status: "live" }, { today: "2026-12-07", hm: "09:00", endOf }), "le lendemain du dernier jour : terminée, même salle ouverte");
ok(!sessionEnded(two, { today: "2026-12-06", hm: "18:00", endOf }), "deux journées, soir du jour 1 : pas terminée");
ok(sessionEnded(two, { today: "2026-12-08", hm: "16:30", endOf }), "deux journées : la fin du jour 2 compte");
ok(!sessionEnded({ status: "draft" }, { today: "2030-01-01" }), "sans date : terminée seulement si close");

ok(nextTrainingDay(two, { today: "2026-12-06", hm: "18:00", endOf }) === "2026-12-08", "soir du jour 1 : reprise le jour 2");
ok(nextTrainingDay(two, { today: "2026-12-06", hm: "12:45", endOf }) === null, "jour 1, déjeuner : reprise dans quelques minutes");
ok(nextTrainingDay(two, { today: "2026-12-08", hm: "18:00", endOf }) === null && nextTrainingDay(one, { today: "2026-12-06", hm: "18:00", endOf }) === null, "dernier jour : pas de journée suivante");
ok(nextTrainingDay({ ...two, status: "live" }, { today: "2026-12-06", hm: "18:00", endOf }) === null, "salle ouverte : pas d'attente");

// Clôture automatique : 15 minutes après l'heure de fin des réglages, le dernier jour, même salle ouverte
import { plusMin, AUTO_CLOSE_MIN } from "../src/lib/archive.js";
ok(AUTO_CLOSE_MIN === 15 && plusMin("17:30:00", 15) === "17:45" && plusMin("23:50", 15) === "24:05", "heure de fin + 15 min");
const fin = { ...one, status: "live", end_time: "17:30:00" };
ok(!sessionEnded(fin, { today: "2026-12-06", hm: "17:44" }), "salle ouverte, 14 min après la fin : pas encore terminée");
ok(sessionEnded(fin, { today: "2026-12-06", hm: "17:45" }), "salle ouverte, 15 min après la fin : terminée");
ok(!sessionEnded({ ...two, status: "live", end_time: "17:30:00" }, { today: "2026-12-06", hm: "18:00" }), "deux journées : la fin du jour 1 ne clôt pas");
