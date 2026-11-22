/* Rôles : « admin » gère tout ; « trainer » (formateur·ice) ne pilote que les sessions attribuées à sa fiche.
   L'interface s'adapte, mais la vraie protection est côté base (règles d'accès et fonctions SQL). */
export const isStaff = (me) => me?.role === "trainer" || me?.role === "admin";
export const isAdmin = (me) => me?.role === "admin";
