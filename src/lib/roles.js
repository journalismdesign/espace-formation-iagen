/* Rôles : « admin » gère tout ; « trainer » (formateur·ice) ne pilote que les sessions attribuées à sa fiche ;
   « guest » (invité·e) parcourt le back-office et toutes les sessions en lecture seule, identités des stagiaires
   masquées, jusqu'à sa date de fin. L'interface s'adapte, mais la vraie protection est côté base (règles d'accès
   et fonctions SQL). */
export const isStaff = (me) => me?.role === "trainer" || me?.role === "admin"; // peut modifier
export const isAdmin = (me) => me?.role === "admin";
export const isGuest = (me) => me?.role === "guest";
export const canView = (me) => isStaff(me) || isGuest(me); // entre dans le back-office (en lecture seule pour l'invité·e)
export const READ_ONLY_MSG = "Mode invitation : lecture seule, rien n'est enregistré.";
