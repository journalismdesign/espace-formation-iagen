/* Rôles : « admin » gère tout ; « trainer » (formateur·ice) ne pilote que les sessions attribuées à sa fiche ;
   « guest » (invité·e) ne voit que ses deux sessions de démonstration, qu'il ou elle pilote librement, jusqu'à sa
   date de fin. L'interface s'adapte, mais la vraie protection est côté base (règles d'accès
   et fonctions SQL). */
export const isStaff = (me) => me?.role === "trainer" || me?.role === "admin"; // peut modifier
export const isAdmin = (me) => me?.role === "admin";
export const isGuest = (me) => me?.role === "guest";
export const canView = (me) => isStaff(me) || isGuest(me); // entre dans le back-office (l'invité·e : ses sessions de démo)
