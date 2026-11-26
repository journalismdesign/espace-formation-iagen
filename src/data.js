/* Données pédagogiques de la formation « Prendre en main les IA génératives ».
   Extraites de la version claude.ai (legacy/index.html). Les numéros de page
   renvoient au support projeté (135 pages, novembre 2026). */
/* =====================================================================
   DONNÉES · Fiches pratiques
   pages = pages du support projeté (version de novembre 2026, 135 pages)
   ===================================================================== */
const FICHES = [
 {id:"projet", ico:"PROJET", titre:"Projet (Gem, espace)", resume:"Un dossier qui réunit des documents et des consignes permanentes, relus à chaque conversation.",
  sections:[
   ["Ce que c'est","Un espace de travail dans l'assistant : vous y déposez des documents (sources, notes) et des instructions propres au dossier. Chaque nouvelle conversation ouverte dans le projet les relit. Les noms varient : Projets dans ChatGPT et Claude, Gems dans Gemini."],
   ["En rédaction",["Un projet par dossier au long cours, avec 5 à 10 sources publiques.","Des instructions qui disent : tes seules sources sont ces documents ; cite le document et la page ; si l'information n'y est pas, dis-le.","Des règles graduées : toujours, demander d'abord, jamais (exercice 4 du niveau 2)."]],
   ["Trois couches à ne pas confondre",["Instructions personnalisées : tout le compte, toutes les conversations.","Projet : un dossier, ses documents, ses consignes.","Prompt : une demande, ici et maintenant."]],
   ["Limites",["Des consignes, pas des verrous : une règle « jamais » peut céder selon la formulation.","Une continuité partielle : les décisions d'une conversation ne passent pas toujours dans la suivante. Terminez chaque session par une note de décisions.","Ni versionné ni local : les données restent chez l'éditeur."]],
  ], warn:"Le Projet pour apprendre la méthode ; un dossier de fichiers à vous pour le travail durable ou sensible.", pages:"75, 86, 114 à 117", liens:["instructions","sve","configuration"]},
 {id:"plugin", ico:"PLUGIN", titre:"Plugin", resume:"La mallette : un paquet prêt à installer qui réunit compétences, connecteurs et commandes pour un métier.",
  sections:[
   ["Ce que c'est","Le mot est apparu en 2023 avec les « plugins ChatGPT », abandonnés en 2024. Il désigne aujourd'hui, de façon assez vague, tout module qui ajoute une capacité à un assistant. Dans Claude ou Claude Code, un plugin est un paquet précis : des compétences, des connecteurs et des commandes installés d'un coup."],
   ["En rédaction",["Un plugin « enquête » (exemple fictif) : 2 compétences, 1 connecteur vers Drive, 3 commandes dont /chronologie.","Les plugins métiers proposés par Anthropic depuis 2026 (juridique, finance…)."]],
   ["L'image à retenir","Le connecteur, ce sont les clés. La compétence, la fiche de procédure. Le plugin, la mallette qui rassemble le tout."],
  ], warn:"Installer un plugin, c'est aussi installer ses connecteurs : vérifiez à quoi il donne accès.", pages:"82, 85", liens:["connecteur","competence","mcp"]},
 {id:"connecteur", ico:"CONNECTEUR", titre:"Connecteur", resume:"Les clés : un accès autorisé à un service tiers (Drive, Gmail, Notion…), avec vos droits.",
  sections:[
   ["Ce que c'est","Une autorisation donnée à l'assistant de lire, chercher et parfois écrire dans un service extérieur, avec vos propres droits. C'est l'équivalent d'une délégation de mot de passe. Le connecteur lit au moment de la demande : rien n'est versé d'avance dans le modèle, mais ce qu'il lit part dans la conversation."],
   ["En rédaction",["Drive : retrouver la note de la réunion de mardi.","Gmail : lister les communiqués reçus cette semaine.","Notion : alimenter la base des sujets."]],
   ["Où le trouver","Paramètres › Connecteurs › choisir le service › Connecter › choisir les droits. Les intitulés varient d'un assistant à l'autre."],
   ["Le principe du moindre privilège",["Ne brancher que ce dont la tâche a besoin.","En lecture seule quand c'est possible.","Valider soi-même chaque action d'écriture."]],
  ], warn:"Ne branchez jamais votre messagerie ou votre stockage professionnels sur un compte personnel. Risque spécifique : l'injection de prompt.", pages:"82 à 85", liens:["mcp","injection","plugin"]},
 {id:"competence", ico:"SKILL", titre:"Compétence (skill)", resume:"La fiche de procédure : un fichier SKILL.md que l'assistant ne charge que si la tâche s'y prête.",
  sections:[
   ["Ce que c'est","Un fichier texte, SKILL.md, qui décrit une méthode maison écrite une fois. L'assistant lit son nom et sa description en permanence, mais ne charge la procédure complète que lorsque la demande s'y prête. Le format est ouvert depuis décembre 2025 : la même fiche peut servir dans plusieurs outils."],
   ["En rédaction",["« Brève maison » : format, longueur, titre.","« Vérif chiffres » : contrôler un rapport.","« Sous-titres » : normes de la chaîne."]],
   ["À quoi ça ressemble","---\nname: breve-maison\ndescription: rédige une brève au format maison\n---\n1. Titre informatif, 70 signes\n2. Source entre parenthèses"],
  ], warn:"Une compétence est une consigne, pas un contrôle : relisez toujours le résultat.", pages:"85, 117", liens:["plugin","sve","configuration"]},
 {id:"mcp", ico:"MCP", titre:"MCP (Model Context Protocol)", resume:"La prise USB-C des IA : un standard ouvert pour brancher un même outil sur plusieurs assistants.",
  sections:[
   ["Ce que c'est","Un protocole ouvert publié par Anthropic en novembre 2024, adopté en 2025 par OpenAI, Google et Microsoft, et confié en décembre 2025 à l'Agentic AI Foundation, sous l'égide de la Linux Foundation. Chaque service se branche une fois et sert à tous les assistants compatibles."],
   ["Pourquoi c'est important",["Séparer le modèle des outils : le modèle raisonne, le connecteur agit. On peut changer d'assistant sans refaire ses branchements.","Les données restent chez elles : elles sont lues au moment de la demande.","L'intelligence de l'outil ne tient pas qu'au modèle : elle dépend de ce à quoi vous lui donnez accès, et c'est vous qui décidez."]],
   ["Ce qu'on peut brancher","Google Drive, Gmail, Notion, Slack, WordPress, une base de données, un dossier sur votre disque… et des milliers d'autres services."],
  ], warn:"Plus un assistant est connecté, plus il est utile… et plus une erreur ou un document piégé peut avoir de conséquences.", pages:"82 à 84", liens:["connecteur","injection","configuration"]},
 {id:"instructions", ico:"RÉGLAGES", titre:"Instructions personnalisées", resume:"Écrites une fois, elles accompagnent toutes vos conversations : qui vous êtes, ton, rigueur.",
  sections:[
   ["Ce qu'on y met","Qui vous êtes et pour quel média ; la langue, le ton, le format ; vos exigences de rigueur ; ce que l'assistant doit faire quand il ne sait pas."],
   ["Ce qu'on n'y met pas","Sources, noms de personnes, dossiers en cours, identifiants. Ces instructions accompagnent toutes les conversations, y compris celles que vous partagez."],
   ["Où les régler (relevé d'octobre 2026)",["ChatGPT : Paramètres › Personnalisation › Instructions personnalisées.","Claude : Paramètres › Profil › Préférences personnelles, et les « styles ».","Gemini : Paramètres › Contexte personnel › Vos instructions pour Gemini.","Mistral : Paramètres › Personnalisation › Instructions."]],
   ["Méthode",["Court : 1 500 caractères par champ chez ChatGPT.","Testez avec une question piège : la règle « si tu ne sais pas, dis-le » tient-elle ?","Révisez après une semaine : ajoutez ce que vous avez dû répéter."]],
  ], warn:"Les intitulés des menus changent souvent : à vérifier la veille de la session.", pages:"86, 87", liens:["projet","donnees"], prompt:"instructions"},
 {id:"notebook", ico:"NOTEBOOK", titre:"Gemini Notebook (ex-NotebookLM)", resume:"Un assistant qui ne répond qu'à partir des documents que vous lui donnez, en citant le passage.",
  sections:[
   ["Ce que c'est","Outil de Google, renommé Gemini Notebook le 16 juillet 2026. Il répond à partir des documents chargés dans un carnet et renvoie, par des numéros cliquables, au passage d'où vient chaque réponse."],
   ["Comment ça marche",["Créer un carnet, avec un compte Google : un carnet par sujet, comme un dossier papier.","Ajouter des sources : PDF, Google Docs et Slides, pages web, vidéos YouTube, fichiers audio, EPUB.","Interroger : chaque réponse porte des numéros qui ouvrent le passage cité.","Produire dans le Studio : résumé audio ou vidéo, carte mentale, rapport, quiz, fiches."]],
   ["Cinq usages en rédaction",["Dépouiller un rapport de 300 pages.","Préparer une interview : variations et contradictions d'un interlocuteur.","Comparer deux versions : un projet de loi avant et après amendements.","Suivre un dossier au long cours.","Expliquer à l'oral : un résumé audio, écouté en entier avant toute diffusion."]],
   ["Offre gratuite (relevé d'octobre 2026, à revérifier)","100 carnets ; 50 sources par carnet, jusqu'à 500 000 mots ou 200 Mo chacune ; 50 questions et 3 résumés audio par jour."],
  ], warn:"Une réponse sourcée n'est pas une réponse vérifiée. Ne versez ni document confidentiel ni source protégée depuis un compte personnel.", pages:"69 à 71", liens:["donnees","rmctf"]},
 {id:"rmctf", ico:"R·M·C·T·F", titre:"La méthode R·M·C·T·F", resume:"Cinq questions à se poser avant d'écrire une demande ponctuelle : rôle, mission, contexte, tâche, format.",
  sections:[
   ["Les cinq lettres",["R · Rôle : qui doit répondre ? « Tu es secrétaire de rédaction d'une radio publique d'information. »","M · Mission : pour quoi faire ? « Aider un·e journaliste à s'approprier un rapport avant une interview. »","C · Contexte : ce que l'IA ne peut pas deviner : public, source, date, contraintes, ce qui a déjà été fait.","T · Tâche : l'action précise, avec un verbe : « Extrais les 5 chiffres clés et signale ce qui est contestable. »","F · Format : longueur, structure, tableau, ton, langue, ce qu'il ne faut pas faire."]],
   ["Six réflexes en plus",["Délimiter la source : « n'utilise que ce texte ».","Autoriser le doute : « Si tu ne sais pas, dis-le. »","Donner un exemple : un chapô de votre rédaction vaut mieux que trois adjectifs.","Itérer : la première réponse est un brouillon.","Le prompt inversé : « Avant de répondre, pose-moi les questions dont tu as besoin. »","Changer de plateforme : les écarts entre deux assistants révèlent les zones fragiles."]],
  ], warn:"Toutes les lettres ne servent pas pour une demande simple ; aucune n'est superflue pour une demande professionnelle.", pages:"100 à 103, 122, 123", liens:["sve"], outil:"toolRmctf"},
 {id:"sve", ico:"S·V·E", titre:"La méthode S·V·E", resume:"Pour un travail qui dure plusieurs sessions : spécification, vérification, environnement.",
  sections:[
   ["Quand l'utiliser","R·M·C·T·F règle une demande. Pour un dossier, une enquête, une veille ou un petit outil, on organise la collaboration avec l'IA sur plusieurs sessions. Principe directeur : on peut externaliser sa pensée, pas sa compréhension."],
   ["S · Spécification",["Dégager le but, pas la tâche : « faire le rapport mensuel » est une tâche, « décider si l'on garde la rubrique » est un but.","Découper en petits lots, avec un point de contrôle à chaque fois.","Faire lister les hypothèses de l'IA, puis relire la spec avec sa tête."]],
   ["V · Vérification",["Fixer les critères avant d'exécuter : « trois sections, une recommandation chacune, chaque chiffre sourcé ».","Un second modèle en relecteur, sachant que deux modèles peuvent se tromper ensemble.","Un signal extérieur : source primaire, document de référence, test réel."]],
   ["E · Environnement",["Des instructions permanentes (projet, Gem, fichier d'instructions).","Une base documentaire : sources brutes en lecture seule, notes de synthèse tenues à jour.","Des procédures écrites et des garde-fous gradués : toujours, demander d'abord, jamais."]],
   ["Limites",["Conformité n'est pas vérité : la boucle contrôle des critères, pas l'exactitude d'un fait.","Des prescripteurs intéressés : « qualité ×2 », « 10 fois plus vite » sont des affirmations, pas des mesures.","Des coûts cachés : plus de modèles et de boucles, c'est plus de calcul, d'argent et d'énergie.","Le risque d'atrophie : déléguer aussi la spec et les critères vide la méthode de son sens."]],
  ], warn:"Le découpage en trois couches vient de vulgarisateurs commentant Andrej Karpathy, pas de Karpathy lui-même.", pages:"104 à 116", liens:["projet","rmctf","configuration"], outil:"toolSve"},
 {id:"donnees", ico:"DONNÉES", titre:"Le code couleur de la rédaction", resume:"Ce qu'on n'envoie jamais, ce qu'on envoie avec précaution, ce qu'on peut envoyer sans risque.",
  sections:[
   ["Jamais",["Identité ou coordonnées d'une source.","Documents confidentiels ou sous embargo.","Données personnelles de tiers (santé, adresse, casier…).","Contrats, données RH, informations internes.","Rushs et enregistrements non publiés."]],
   ["Avec précaution",["Brouillons et notes de travail : anonymisez noms et lieux.","Retranscriptions d'interviews publiées ou publiables, avec accord.","Réglages de confidentialité activés, chat temporaire."]],
   ["Sans risque",["Textes déjà publiés.","Communiqués, rapports et décisions publics.","Données ouvertes (data.gouv.fr…).","Vos propres idées, plans, questions de méthode."]],
   ["Check-list d'hygiène numérique",["Un compte dédié, jamais votre adresse professionnelle.","Entraînement désactivé dès la création du compte.","Discussion temporaire pour tout essai sur un contenu non public.","Aucun connecteur vers une messagerie ou un stockage professionnel.","Ne jamais partager une conversation par lien public.","Purger l'historique et la mémoire régulièrement.","Vérifier chaque fait, chiffre et citation produits par l'IA."]],
  ], warn:"Le secret des sources est protégé par l'article 2 de la loi du 29 juillet 1881. Appliquez d'abord la charte IA de votre entreprise.", pages:"89 à 98", liens:["connecteur","instructions"]},
 {id:"injection", ico:"RISQUE", titre:"L'injection de prompt", resume:"Des instructions cachées dans un mail ou une page web, que l'assistant exécute comme si elles venaient de vous.",
  sections:[
   ["Ce que c'est","Quand un assistant lit un contenu extérieur (un e-mail via un connecteur, une page web, un document), ce contenu peut contenir des consignes dissimulées. L'assistant risque de les suivre : résumer de travers, envoyer un message, divulguer des informations."],
   ["Pourquoi c'est un risque en rédaction","Une rédaction reçoit en permanence des contenus non sollicités : communiqués, pièces jointes, signalements. Un assistant branché sur la messagerie les lit tous."],
   ["Se protéger",["Le moindre privilège : brancher le strict nécessaire, en lecture seule si possible.","Valider soi-même toute action d'écriture ou d'envoi.","Se méfier d'un résultat qui change brusquement de ton ou de sujet."]],
  ], warn:"Plus un assistant est connecté et autonome, plus une injection peut avoir de conséquences.", pages:"83", liens:["connecteur","mcp"]},
 {id:"interface", ico:"INTERFACE", titre:"Anatomie d'une interface", resume:"Les assistants partagent la même architecture : une fois le plan en tête, on passe de l'un à l'autre.",
  sections:[
   ["Les sept zones",["1 · Projets : dossiers avec documents et consignes permanentes.","2 · Sélecteur de modèle : rapide, ou « raisonnement », plus lent et plus fiable.","3 · Zone de saisie : le prompt, et l'endroit où l'on colle les textes.","4 · « + » et outils : fichiers, recherche web, recherche approfondie, image, canvas.","5 · Historique : les conversations passées, à purger régulièrement.","6 · Compte et paramètres : confidentialité, mémoire, connecteurs.","7 · Réponse : à copier, régénérer ou évaluer."]],
   ["Les quatre assistants de la formation",["ChatGPT (OpenAI, États-Unis).","Claude (Anthropic, États-Unis).","Gemini (Google, États-Unis).","Mistral (Mistral AI, France), le seul européen."]],
  ], warn:"Évaluer une réponse (pouce levé ou baissé) peut entraîner l'examen de toute la conversation par l'éditeur.", pages:"74 à 81, 89", liens:["donnees","projet"]},
 {id:"configuration", ico:"COUCHES", titre:"La configuration idéale", resume:"Cinq couches, cinq questions : qui je suis, sur quoi je travaille, comment on fait, à quoi l'IA a accès, ce qu'on veut maintenant.",
  sections:[
   ["Les couches",["Instructions : qui suis-je ? Paramétrage du compte, ton, exigences de rigueur.","Projet : sur quoi je travaille ? Objectif, sources, règles du dossier.","Compétences : comment fait-on ? Procédures chargées à la demande.","Connecteurs et MCP : à quoi l'IA a-t-elle accès ?","Prompt : que veut-on maintenant ? R·M·C·T·F, ou spec, critères, environnement."]],
   ["Une base à vous",["Une base statique : charte, glossaire, sources de référence, modèles. Change rarement, versionnée.","Une base dynamique : notes de travail, journal des décisions, veille, synthèses de session.","Des fichiers Markdown dans un dossier à vous : l'intelligence du travail reste chez vous, pas dans la plateforme."]],
  ], pages:"117 à 119", liens:["projet","competence","mcp","instructions"]},
];

/* =====================================================================
   DONNÉES · Glossaire
   ===================================================================== */
const GLOSS = [
 ["Agent IA","Assistant capable d'enchaîner plusieurs actions (chercher, ouvrir un fichier, appeler un outil, écrire) pour accomplir une tâche, au-delà d'une simple réponse.","mcp","83"],
 ["AI Act","Règlement européen sur l'intelligence artificielle (UE) 2024/1689, modifié en 2026. Il encadre les systèmes d'IA selon leur niveau de risque.",null,"95"],
 ["Assistant conversationnel","Interface de dialogue construite autour d'un modèle de langage : ChatGPT, Claude, Gemini, Mistral, Copilot.","interface","74"],
 ["Canvas","Espace d'édition ouvert à côté de la conversation pour travailler un texte ou un code en continu.","interface","75"],
 ["Carnet","Dans Gemini Notebook, l'espace qui réunit les sources d'un sujet, comme un dossier papier.","notebook","69"],
 ["Chat temporaire","Conversation qui n'est pas gardée dans l'historique : à utiliser pour tout essai sur un contenu non public.","donnees","98"],
 ["Cloud Act","Loi américaine de 2018 qui permet aux autorités des États-Unis d'exiger d'un fournisseur américain des données qu'il détient, y compris stockées hors des États-Unis.","donnees","94"],
 ["Code couleur","Classement des contenus en trois niveaux avant tout envoi à un assistant : jamais, avec précaution, sans risque.","donnees","97"],
 ["Compétence (skill)","Fichier SKILL.md décrivant une procédure maison, chargé seulement quand la tâche s'y prête.","competence","85"],
 ["Connecteur","Accès autorisé à un service tiers (Drive, Gmail, Notion…), qui permet à l'assistant de lire et parfois d'écrire avec vos droits.","connecteur","82"],
 ["Critères de vérification","Ce qu'est un bon résultat, écrit avant l'exécution : « chaque chiffre renvoie à une page du rapport ».","sve","107"],
 ["Garde-fous gradués","Classement des actions en trois groupes : toujours, demander d'abord, jamais.","sve","108"],
 ["Gem","Nom donné par Gemini à un assistant personnalisé, avec ses instructions et ses documents : l'équivalent d'un projet.","projet","108"],
 ["Gemini Notebook","Ex-NotebookLM, renommé le 16 juillet 2026 : un assistant de Google qui répond à partir des seules sources chargées.","notebook","69"],
 ["Hallucination","Réponse fluide mais fausse : chiffre, citation, référence ou nom inventés. Vient de ce que le modèle apprend des régularités, pas des faits.","rmctf","29"],
 ["Injection de prompt","Instructions cachées dans un e-mail, une page ou un document, que l'assistant exécute comme si elles venaient de vous.","injection","83"],
 ["Instructions personnalisées","Consignes écrites une fois dans les réglages du compte, qui accompagnent toutes les conversations.","instructions","86"],
 ["LLM (grand modèle de langage)","Modèle entraîné sur d'immenses corpus de textes pour prédire la suite d'un texte. C'est le moteur des assistants.",null,"27"],
 ["MCP","Model Context Protocol : standard ouvert pour brancher outils et données sur les assistants, la « prise USB-C » des IA.","mcp","82"],
 ["Mémoire","Ce que l'assistant retient de vous d'une conversation à l'autre. À consulter et purger régulièrement.","donnees","98"],
 ["Modèle de raisonnement","Mode plus lent dans lequel le modèle « réfléchit » avant de répondre : plus fiable sur les tâches complexes.","interface","75"],
 ["Note de décisions","Note datée rédigée en fin de session : ce qui a été validé, écarté et pourquoi, les hypothèses ouvertes.","sve","115"],
 ["Plugin","Paquet prêt à installer qui réunit compétences, connecteurs et commandes pour un métier.","plugin","85"],
 ["Pré-entraînement","Première étape de fabrication d'un modèle : il apprend des régularités sur d'énormes volumes de textes, pas des faits vérifiés.",null,"29"],
 ["Projet","Dossier de l'assistant qui réunit documents et consignes permanentes, relus à chaque conversation.","projet","86"],
 ["Prompt","La consigne donnée à l'assistant. Une commande complète, pas une recherche par mots-clés.","rmctf","100"],
 ["Prompt inversé","Demander à l'IA de poser d'abord les questions dont elle a besoin pour faire le travail.","rmctf","103"],
 ["R·M·C·T·F","Méthode d'initiation pour une demande ponctuelle : rôle, mission, contexte, tâche, format.","rmctf","101"],
 ["Recherche approfondie","Mode où l'assistant enchaîne de nombreuses recherches web et rédige un rapport sourcé. Plus long, à vérifier comme le reste.","interface","75"],
 ["RGPD","Règlement général sur la protection des données (UE) 2016/679, applicable depuis le 25 mai 2018. En France, l'autorité compétente est la CNIL.","donnees","93"],
 ["RLHF","Apprentissage par renforcement à partir de retours humains : l'étape où des personnes notent les réponses pour orienter le comportement du modèle.",null,"30"],
 ["S·V·E","Méthode pour un travail au long cours : spécification, vérification, environnement.","sve","105"],
 ["Second modèle relecteur","Faire relire le travail d'un assistant par un autre. Utile, mais deux modèles peuvent se tromper ensemble.","sve","107"],
 ["Spécification (spec)","Document qui transmet votre compréhension du travail : le but réel, un découpage en lots courts, des hypothèses validées.","sve","106"],
 ["Studio","Dans Gemini Notebook, l'espace qui produit résumé audio ou vidéo, carte mentale, rapport, quiz et fiches.","notebook","69"],
 ["Vibe coding","Terme lancé par Andrej Karpathy en février 2025 : on décrit l'outil voulu, l'IA écrit le code.",null,"127"],
];

/* =====================================================================
   DONNÉES · Prompts à adapter (repris du support)
   ===================================================================== */
const PROMPTS = [
 {id:"carnet", titre:"Votre premier carnet : questions de contrôle", tag:"Gemini Notebook", page:"71", txt:"1. [Question dont vous connaissez la réponse sur votre dossier]\n2. [Deuxième question vérifiable]\n3. [Troisième question vérifiable]\n4. Question hors corpus : [un fait qui n'est dans aucune source]\n\nPour chaque réponse : est-elle dans le passage cité ? Au même sens ? Que fait l'outil face à la question hors corpus : il refuse, il prévient, ou il invente ?"},
 {id:"interview", titre:"Préparer une interview dans un carnet", tag:"Gemini Notebook", page:"70", txt:"À partir des seules sources de ce carnet, prépare une fiche d'interview de [nom, fonction] :\n– ses positions principales, chacune avec la source et la date ;\n– les variations ou contradictions entre ses déclarations ;\n– dix questions, dont trois sur ces contradictions.\nSi une information ne figure pas dans les sources, écris « non précisé »."},
 {id:"resume", titre:"Palier 2 · Résumé guidé R·M·C·T·F", tag:"R·M·C·T·F", page:"123", txt:"RÔLE Tu es secrétaire de rédaction d'une rédaction publique d'information.\nMISSION Aider un·e journaliste à s'approprier vite ce document sans en trahir le sens.\nCONTEXTE Document : [type, auteur, date]. Il sera traité pour un public non spécialiste, à l'antenne et sur le web. Appuie-toi uniquement sur le texte fourni.\nTÂCHE 1) Résume les points essentiels. 2) Liste les chiffres cités. 3) Signale ce qui est ambigu ou contestable.\nFORMAT 1) 5 puces de 25 mots maximum. 2) Tableau Chiffre | Ce qu'il mesure | Passage d'origine. 3) Section « À vérifier ». Pas d'introduction ni de conclusion. Si une information manque, écris « non précisé ».\nTEXTE « [collez le document ici] »"},
 {id:"analyse", titre:"Palier 3 · Analyse et résumé", tag:"R·M·C·T·F", page:"124", txt:"RÔLE Tu es journaliste spécialisé·e en vérification des faits.\nMISSION Préparer le traitement d'une tribune (ou d'un discours) publiée aujourd'hui.\nCONTEXTE Texte ci-dessous. Je dois en tirer une brève web et un lancement radio.\nTÂCHE 1) Identifie les acteurs cités et leur rôle. 2) Distingue les faits vérifiables, les opinions et les affirmations sans source. 3) Repère les procédés rhétoriques. 4) Propose trois angles de traitement. 5) Rédige une brève web de 600 signes et un lancement radio de 30 secondes.\nFORMAT Tableau pour les points 1 et 2, liste pour 3 et 4, textes finaux séparés. Ne cite que des passages présents dans le texte, entre guillemets.\nTEXTE « [collez le texte ici] »"},
 {id:"planning", titre:"Palier 4 · Un planning de couverture", tag:"R·M·C·T·F", page:"125", txt:"RÔLE Tu es chef·fe d'édition d'une rédaction régionale.\nMISSION Organiser la couverture d'un événement de 5 jours (élection, festival, sommet…).\nCONTEXTE Équipe : 4 journalistes, 1 JRI, 1 éditeur·rice web. Supports : site, réseaux sociaux, print. Contraintes : [vos horaires, temps forts connus].\nTÂCHE Construis le planning jour par jour, créneau par créneau.\nFORMAT Tableau : Jour | Créneau | Sujet | Format | Support | Responsable | Matériel | Statut. Puis la même chose en CSV, séparateur point-virgule, pour import dans un tableur.\n\nÀ vérifier : les dates et les jours de la semaine, erreur fréquente."},
 {id:"spec", titre:"S · La spec par interview", tag:"S·V·E", page:"110", txt:"Je prépare un travail journalistique au long cours. Avant de produire quoi que ce soit, interroge-moi, une question à la fois, pour établir :\n– la question éditoriale à laquelle ce travail doit répondre ;\n– le public et le support ;\n– ce qui rendrait ce travail raté ou inutile ;\n– les sources dont je dispose et celles qui manquent.\nQuand tu as assez d'éléments, rédige une spec d'une page. Termine par la liste des hypothèses que tu as faites sans que je les aie énoncées."},
 {id:"lots", titre:"S · Découper et valider", tag:"S·V·E", page:"111", txt:"À partir de cette spec, propose un découpage en lots courts. Pour chaque lot : l'objectif, le livrable attendu et ce que je dois vérifier avant de passer au suivant.\nNe lance aucun lot. Attends ma validation, lot par lot."},
 {id:"criteres", titre:"V · Critères d'abord", tag:"S·V·E", page:"112", txt:"ÉTAPE 1 · CRITÈRES Avant de rédiger la fiche de préparation d'interview, énonce des critères précis et vérifiables pour juger sa qualité. Par exemple : chaque chiffre renvoie à une page du rapport ; aucune question ne présuppose sa réponse ; les points contestés sont signalés comme tels. Attends que je valide ces critères.\n\nÉTAPE 2 · AUTO-ÉVALUATION Évalue la fiche critère par critère : respecté, partiellement, non respecté, et pourquoi. Signale ce que tu n'as pas pu vérifier."},
 {id:"croisee", titre:"V · Relecture croisée par un second assistant", tag:"S·V·E", page:"113", txt:"Voici une fiche de préparation d'interview et le rapport dont elle est tirée. Relève les chiffres mal reportés, les affirmations absentes du rapport et les questions orientées. Ne réécris pas la fiche.\n\nPuis contrôle humain : vérifiez vous-même trois chiffres de la fiche dans le rapport original."},
 {id:"projetinstr", titre:"E · Instructions du projet", tag:"S·V·E", page:"114", txt:"CONTEXTE Tu assistes un·e journaliste de [rédaction] sur le dossier [sujet]. Spec du dossier : [coller la spec].\nSOURCES Les documents de ce projet sont tes seules sources. Pour chaque affirmation, cite le document et la page. Si l'information n'y figure pas, dis-le.\nTOUJOURS Distinguer faits sourcés, hypothèses et interprétations. Énoncer des critères de vérification avant toute production longue. Terminer par ce qui reste à vérifier.\nDEMANDER D'ABORD Avant tout changement d'angle ou de périmètre, et avant de recourir à une connaissance extérieure aux documents.\nJAMAIS Inventer une citation, un chiffre ou une source. Reformuler une citation entre guillemets. Traiter des données nominatives sur des personnes privées."},
 {id:"froid", titre:"E · Reprise à froid et note de décisions", tag:"S·V·E", page:"115", txt:"EN OUVERTURE (nouvelle conversation, même projet) : « Reprenons le dossier. Résume où nous en sommes, quels lots sont validés et ce qui reste à vérifier. »\n\nEN CLÔTURE : « Rédige une note de décisions datée : ce qui a été validé, ce qui a été écarté et pourquoi, les hypothèses encore ouvertes. Format court, à ajouter aux documents du projet. »"},
 {id:"instructions", titre:"Instructions personnalisées pour journaliste", tag:"Réglages", page:"87", txt:"JE SUIS journaliste à [rédaction], au service [rubrique]. Je produis pour [le print / le web].\nRÉPONDS en français, sur un ton professionnel, sans flatterie ni formule d'introduction. Va droit au but.\nRIGUEUR Distingue toujours faits sourcés, hypothèses et opinions. N'invente jamais une citation, un chiffre, une référence ou un nom : si tu ne sais pas, dis-le. Indique la date de tes informations quand elle compte.\nSOURCES Préfère les sources primaires et publiques, avec leurs liens. Signale les sources intéressées (entreprise, lobby).\nFORMAT Indique le nombre de signes. Pas de listes à puces pour un texte destiné à la publication.\nSI C'EST AMBIGU Pose une seule question, puis avance en signalant tes hypothèses.\nNE FAIS PAS Réécrire mes citations ; trancher à ma place un choix éditorial."},
];

/* =====================================================================
   DONNÉES · Exemples de rédactions (pages du support)
   ===================================================================== */
const CASES = [
 ["Trouver","Philadelphia Inquirer","Dewey interroge tout ce que le journal a publié depuis 1978 ; Scrape surveille les réunions municipales et fait remonter des pistes.","59"],
 ["Trouver","CalMatters","Digital Democracy signale des anomalies dans les votes et les débats du parlement californien. Les pistes ne sont pas publiables en l'état.","58"],
 ["Trier, analyser","New York Times","Plus de 400 heures de réunions fuitées transcrites et triées avec l'IA ; chaque citation réécoutée sur l'enregistrement.","56"],
 ["Trier, analyser","Washington Post","Haystacker passe au crible des milliers de vidéos, photos et textes pour les équipes d'enquête visuelle.","55"],
 ["Trier, analyser","Jean Abbiateci","Le Recopilleur repère les passages suspects de plagiat ; le journaliste compare à la main.","60"],
 ["Écrire, éditer","Newsquest","36 journalistes transforment communiqués et avis publics en articles avec l'IA, puis vérifient faits et citations.","57"],
 ["Écrire, éditer","New York Times","Echo : résumés, titres, questions d'interview autorisés ; pas de rédaction ni de réécriture d'article.","47"],
 ["Écrire, éditer","L'Est Républicain / Ebra","La presse régionale confie une partie de la copie à ChatGPT.","44"],
 ["Vérifier","Der Spiegel","Un prototype signale les affirmations douteuses d'un texte ; le vérificateur décide.","49"],
 ["Vérifier","Radio France","StatCheck, vérificateur de données statistiques conçu avec l'Inria, en test.","41"],
 ["Diffuser","Le Monde in English","Traduction assistée par l'IA, relue avant publication.","38"],
 ["Diffuser","Washington Post, Ouest-France","Des assistants qui répondent aux lecteurs à partir des seuls articles du titre.","46"],
 ["Contre-exemple","Los Angeles Times","Un outil voulu par le propriétaire, sans la rédaction, qui juge les tribunes.","53"],
];

/* =====================================================================
   DONNÉES · Quiz
   ===================================================================== */
const QUIZ = {
 llm:{titre:"Comprendre la machine", q:[
  ["Pendant le pré-entraînement, le modèle apprend…",["des faits vérifiés par des documentalistes","des régularités statistiques dans les textes","les règles de grammaire écrites par des linguistes","le contenu exact de chaque article lu"],1,"Il apprend des régularités, pas des faits vérifiés : d'où des réponses fluides mais parfois fausses (p. 29)."],
  ["Que désigne RLHF ?",["Un format de fichier pour les prompts","L'apprentissage par renforcement à partir de retours humains","Un réglage de confidentialité","Un protocole pour brancher des outils"],1,"Des personnes notent les réponses pour orienter le comportement du modèle. C'est là que se fixent ton et réflexes (p. 30)."],
  ["Qui fixe ce qu'un assistant accepte ou refuse de faire ?",["Une autorité publique internationale","Chaque entreprise, pour son modèle","L'utilisateur, dans ses réglages","Personne : c'est appris tout seul"],1,"Les filtres sont fixés par chaque entreprise et diffèrent d'un assistant à l'autre (p. 31)."],
  ["L'IA générative est…",["toute l'intelligence artificielle","une branche parmi d'autres de l'IA","une technique apparue en 2022","un synonyme d'algorithme"],1,"La plupart des systèmes d'IA en service ne génèrent rien : ils classent, prédisent, recommandent (p. 26)."]
 ]},
 redac:{titre:"Ce qu'en font les rédactions", q:[
  ["Que font les « AI-assisted reporters » de Newsquest ?",["Ils écrivent des éditoriaux avec ChatGPT","Ils transforment communiqués et avis publics en articles avec un outil d'IA, puis vérifient faits et citations","Ils traduisent le site en anglais","Ils animent un chatbot pour les lecteurs"],1,"36 journalistes au Royaume-Uni, selon Press Gazette. La direction dit libérer les autres reporters pour le terrain (p. 57)."],
  ["Comment le New York Times a-t-il traité 400 heures d'enregistrements fuités ?",["Il a publié les résumés produits par l'IA","Transcription et repérage avec l'IA, chaque passage revérifié sur l'enregistrement","Il a confié le travail à une agence","Il a renoncé : trop de matériel"],1,"Près de 5 millions de mots. L'IA trouve ce qu'une recherche par mot-clé rate ; le journaliste contrôle (p. 56)."],
  ["Les « tip sheets » de CalMatters sont…",["des articles publiés automatiquement","des pistes signalées par l'IA, à vérifier par les reporters","des fiches de style","des sondages de lecteurs"],1,"Selon la direction, elles ne sont pas publiables en l'état : la machine suggère, le reporter établit (p. 58)."],
  ["Le Recopilleur de Jean Abbiateci…",["prouve le plagiat","désigne des passages suspects, que le journaliste compare à la main","réécrit les textes plagiés","détecte les images générées"],1,"Le script ne prouve rien : il trie. La Revue des médias note que l'IA générative, qui reformule à volonté, rend déjà ce type de détection obsolète (p. 60)."]
 ]},
 notebook:{titre:"Gemini Notebook", q:[
  ["D'où Gemini Notebook tire-t-il ses réponses ?",["De tout le web","Des documents chargés dans le carnet, avec un renvoi vers chaque passage","De Wikipédia uniquement","De vos conversations passées"],1,"Chaque réponse porte des numéros cliquables qui ouvrent le passage cité (p. 69)."],
  ["Une réponse sourcée est…",["une réponse vérifiée","un gain de temps pour vérifier, pas une réponse vérifiée","une réponse publiable telle quelle","une réponse sans erreur possible"],1,"Le modèle peut mal lire, mal résumer, sortir de ses sources. Le lien fait gagner du temps, pas le droit de ne pas lire (p. 71)."],
  ["Que ne faut-il pas faire depuis un compte personnel ?",["Charger un rapport public","Verser des documents confidentiels ou des sources protégées","Comparer deux versions d'un texte","Générer une carte mentale"],1,"Avec un compte Workspace, les données relèvent du contrat de l'entreprise. Depuis un compte personnel, rien de confidentiel (p. 70)."],
  ["Un résumé audio produit par le Studio…",["peut être diffusé directement","s'écoute en entier avant toute diffusion","est toujours fidèle","ne peut pas contenir d'erreur"],1,"C'est l'une des trois choses à ne pas faire : diffuser un résumé audio non écouté (p. 70)."]
 ]},
 jargon:{titre:"Le jargon des assistants", q:[
  ["Un connecteur, c'est…",["un câble USB","un accès autorisé à un service tiers, avec vos droits","un modèle d'IA spécialisé","une extension de navigateur"],1,"L'assistant lit, et parfois écrit, avec vos droits : l'équivalent d'une délégation de mot de passe (p. 82)."],
  ["MCP désigne…",["un modèle de Mistral","un standard ouvert pour brancher des outils sur plusieurs assistants","une loi européenne","un format d'image"],1,"La « prise USB-C » des IA, publiée par Anthropic en novembre 2024 et adoptée depuis par OpenAI, Google et Microsoft (p. 82, 84)."],
  ["Une compétence (skill), c'est…",["une note de satisfaction","un fichier SKILL.md que l'assistant ne charge que si la tâche s'y prête","un abonnement payant","un tutoriel vidéo"],1,"Une méthode maison écrite une fois : brève maison, vérification de chiffres… (p. 85)."],
  ["Un plugin réunit…",["plusieurs modèles","compétences, connecteurs et commandes pour un métier","toutes vos conversations","vos réglages de confidentialité"],1,"Les clés, la fiche de procédure et la mallette : connecteur, compétence, plugin (p. 85)."],
  ["L'injection de prompt, c'est…",["un prompt très long","des instructions cachées dans un mail ou une page, que l'assistant exécute comme si elles venaient de vous","une mise à jour du modèle","un bug d'affichage"],1,"Un risque propre aux assistants branchés sur vos outils (p. 83)."],
  ["Que mettre dans les instructions personnalisées ?",["Vos sources et vos dossiers en cours","Qui vous êtes, le ton, vos exigences de rigueur","Vos identifiants","Le nom de vos interlocuteurs"],1,"Elles accompagnent toutes les conversations, y compris celles que vous partagez (p. 86)."]
 ]},
 rmctf:{titre:"R·M·C·T·F", q:[
  ["Que veut dire le M de R·M·C·T·F ?",["Modèle","Mission","Méthode","Mémoire"],1,"La mission dit pour quoi faire, à quelle fin (p. 101)."],
  ["« Public non spécialiste, rapport publié aujourd'hui, appuie-toi uniquement sur ce texte » relève…",["du rôle","de la tâche","du contexte","du format"],2,"Le contexte, c'est ce que l'IA ne peut pas deviner (p. 101)."],
  ["« 5 puces de 25 mots maximum, puis un tableau » relève…",["du format","de la mission","du rôle","du contexte"],0,"Longueur, structure, tableau, ton, langue, ce qu'il ne faut pas faire (p. 101)."],
  ["Le prompt inversé consiste à…",["écrire le prompt à l'envers","demander à l'IA de poser d'abord les questions dont elle a besoin","traduire le prompt en anglais","effacer l'historique"],1,"Un des six réflexes en plus (p. 103)."],
  ["Pourquoi soumettre le même prompt à deux assistants ?",["Pour aller plus vite","Leurs écarts révèlent les zones fragiles","Pour économiser des crédits","Ce n'est pas recommandé"],1,"Ce qui diffère entre deux réponses est ce qu'il faut vérifier en priorité (p. 103)."]
 ]},
 sve:{titre:"S·V·E", q:[
  ["Dans S·V·E, que recouvre la vérification ?",["Relire l'orthographe","Définir avant d'exécuter ce qu'est un bon résultat, puis le contrôler","Faire confiance au modèle le plus récent","Demander à l'IA si elle est sûre"],1,"Critères écrits, second regard, sources extérieures (p. 105, 107)."],
  ["« Faire le rapport mensuel » est…",["un but","une tâche ; le but serait par exemple « décider si l'on garde la rubrique »","une spec complète","un critère de vérification"],1,"L'IA ne peut pas deviner le but : c'est à vous de le transmettre (p. 106)."],
  ["Faire relire Claude par ChatGPT…",["garantit l'absence d'erreur","fait ressortir des erreurs, mais deux modèles peuvent se tromper ensemble","est interdit par les éditeurs","ne sert à rien"],1,"D'où le retour au document original, que seul l'humain fait (p. 107, 113)."],
  ["Les garde-fous gradués classent les actions en…",["facile, moyen, difficile","toujours, demander d'abord, jamais","gratuit, payant","public, privé"],1,"Une consigne peut être ignorée, un verrou technique non (p. 108)."],
  ["« Conformité n'est pas vérité » signifie…",["la méthode est inutile","la boucle contrôle des critères, pas l'exactitude d'un fait","il faut toujours deux modèles","les critères sont facultatifs"],1,"La vérification journalistique reste humaine et sourcée (p. 109)."]
 ]},
 donnees:{titre:"Vos données", q:[
  ["Une retranscription d'interview non publiée, avec le nom de la source :",["Sans risque","Avec précaution","Jamais"],2,"Identité d'une source et enregistrements non publiés : jamais (p. 97)."],
  ["Un rapport public de la Cour des comptes :",["Jamais","Avec précaution","Sans risque"],2,"Communiqués, rapports et décisions publics : sans risque (p. 97)."],
  ["Un brouillon qui cite des noms de lieux et de personnes :",["Sans risque","Avec précaution, en anonymisant","Jamais"],1,"« X », « la commune », « le témoin » plutôt que les vrais noms (p. 97, 98)."],
  ["Le premier réglage à faire en créant un compte :",["Activer la mémoire","Désactiver l'entraînement","Partager ses conversations","Brancher sa messagerie"],1,"Entraînement désactivé dès la création du compte (p. 98)."]
 ]},
};

/* =====================================================================
   DONNÉES · Déroulés
   type : comprendre | pratique | discussion | pause
   ===================================================================== */
/* Déroulé d'une journée : calqué sur la slide « Déroulé » du support (p. 5-6).
   cas = l'exemple de rédaction cité pour chaque séquence. */
const D1 = [
  {"id":"j1-accueil","t":["09:30","09:40"],"type":"discussion","titre":"Accueil, objectifs, niveau et attentes du groupe","cas":"Un service, pas un outil","pages":"3 à 9","obj":["Situer la journée : comprendre jusqu'à 10 h 45, pratiquer ensuite.","Dire où vous en êtes avec l'IA et ce que vous attendez."],"pts":["Un assistant d'IA est un service, pas un outil : on loue un accès dont les conditions et les prix peuvent changer.","Il ne peut pas être une source à lui seul."],"disc":["Quel est votre niveau avec l'IA ? Qu'en attendez-vous pour votre travail ?","Votre rédaction a-t-elle une charte IA ? L'avez-vous lue ?"],"live":"niveau"},
  {"id":"j1-etat","t":["09:40","09:55"],"type":"comprendre","titre":"Où en est l'IA : argent, énergie, droit d'auteur, travail caché","cas":"Le New York Times poursuit OpenAI tout en outillant sa rédaction","pages":"11 à 16","obj":["Mesurer ce que coûte l'IA : argent, énergie, droit d'auteur, travail caché.","Comprendre pourquoi un LLM produit des réponses fluides mais parfois fausses."]},
  {"id":"j1-llm","t":["09:55","10:10"],"type":"comprendre","titre":"D'où vient l'IA, comment se fabrique un LLM","cas":"Des régularités, pas des faits : d'où la relecture systématique","pages":"18, 24, 27 à 31","pts":["Un LLM se fabrique en étapes : données d'entraînement, pré-entraînement, alignement (RLHF), filtres.","Le pré-entraînement apprend des régularités, pas des faits : d'où la relecture systématique.","Les règles de ce qui est permis ou refusé sont fixées par chaque entreprise."],"quiz":"llm","fiches":["interface"]},
  {"id":"j1-overviews","t":["10:10","10:20"],"type":"comprendre","titre":"L'IA et la presse : AI Overviews, la fin du clic","cas":"Le choc de trafic subi par la presse française depuis l'été 2026","pages":"33 à 35"},
  {"id":"j1-redactions","t":["10:20","10:45"],"type":"comprendre","titre":"Ce qu'en font les rédactions","cas":"Le Monde in English, Ebra, Newsquest, contre-exemple du Los Angeles Times","pages":"37 à 67","obj":["Comprendre l'effet des résumés d'IA sur l'audience de la presse.","Voir des usages réels, de l'usage assumé au contre-exemple."],"pts":["L'essentiel des usages se joue autour de l'article, rarement dans son écriture.","Partout, la règle est la même : l'outil propose, le journaliste vérifie."],"disc":["Lequel de ces usages serait utile dans votre service ? Lequel vous inquiète ?"],"quiz":"redac","ex":true},
  {"id":"j1-p1","t":["10:45","11:00"],"type":"pause","titre":"Pause"},
  {"id":"j1-notebook","t":["11:00","11:35"],"type":"pratique","tf":1,"titre":"Gemini Notebook : un assistant qui ne lit que vos sources","cas":"Les archives du Philadelphia Inquirer, les 400 heures du New York Times","pages":"68 à 70","obj":["Créer un carnet et l'interroger.","Mesurer jusqu'où l'outil reste fidèle à vos sources, et où il en sort."],"pts":["Il répond à partir des documents chargés et renvoie au passage cité.","Une réponse sourcée n'est pas une réponse vérifiée.","Aucun document confidentiel depuis un compte personnel : appliquez le code couleur."],"quiz":"notebook","fiches":["notebook","donnees"]},
  {"id":"j1-nb-exos","t":["11:35","12:20"],"type":"pratique","tf":1,"titre":"Exercices : votre premier carnet, préparer une interview","cas":"Les questions d'interview, un usage autorisé au New York Times","pages":"71","exo":{"titre":"Votre premier carnet, puis une fiche d'interview","duree":40,"steps":["Choisir un dossier suivi par votre rédaction, que vous connaissez bien.","Charger cinq sources publiques : un rapport, deux articles, une vidéo YouTube, un PDF.","Poser trois questions dont vous connaissez la réponse ; noter ce qui est juste, approximatif, faux.","Ouvrir chaque citation : la réponse est-elle dans le passage cité, au même sens ?","Poser une question hors corpus : l'outil refuse, prévient, ou invente ?","Demander une fiche de préparation d'interview et contrôler chaque affirmation dans sa source."],"prompts":["carnet","interview"]},"live":"carnet"},
  {"id":"j1-debrief1","t":["12:20","12:30"],"type":"discussion","titre":"Débrief : ce que l'outil a inventé, raté, trouvé","cas":"Le Recopilleur : la machine désigne, le journaliste compare","pages":"60","disc":["Combien de réponses justes, approximatives, fausses ?","Les erreurs viennent-elles de la lecture des sources ou d'un ajout du modèle ?","Quel temps de vérification pour quel gain ?","Auriez-vous publié l'une de ces réponses telle quelle ?"],"live":"invente"},
  {"id":"j1-dej","t":["12:30","13:30"],"type":"pause","titre":"Déjeuner"},
  {"id":"j1-assistants","t":["13:30","13:45"],"type":"pratique","tf":2,"titre":"ChatGPT, Claude, Mistral, Gemini : qui les édite, quel droit s'applique","cas":"medIAgen, le portail multi-modèles de France Télévisions","pages":"74","obj":["Se repérer dans les quatre interfaces.","Comprendre projet, connecteur, compétence, plugin, MCP.","Régler la confidentialité et écrire ses instructions personnalisées."],"quiz":"jargon"},
  {"id":"j1-tour","t":["13:45","14:30"],"type":"pratique","tf":2,"titre":"Tour du propriétaire, réglages de confidentialité, instructions","cas":"Radio France héberge Whisper chez elle pour protéger la voix des sources","pages":"75 à 79, 86, 87, 91","exo":{"titre":"Mise en route guidée","duree":30,"steps":["Créer un compte dédié sur deux assistants, jamais avec votre adresse professionnelle.","Désactiver l'entraînement et repérer le chat temporaire.","Repérer les sept zones de l'interface sur chaque assistant.","Coller le modèle d'instructions personnalisées et l'adapter à votre service.","Tester avec une question piège sur un fait obscur : la règle « si tu ne sais pas, dis-le » tient-elle ?"],"prompts":["instructions"]},"pts":["Les assistants partagent la même architecture : projets, sélecteur de modèle, outils, historique, paramètres.","Un seul est européen : Mistral. Les trois autres relèvent du droit américain.","Plus un assistant est connecté, plus il est utile, et plus une erreur peut coûter."],"fiches":["interface","projet","connecteur","competence","plugin","mcp","instructions","injection"]},
  {"outil":"toolRmctf","id":"j1-rmctf","t":["14:30","14:50"],"type":"pratique","tf":2,"titre":"Méthode R·M·C·T·F","cas":"BBC Style Assist, les gabarits de l'AP, le déontologue de Jean Abbiateci","pages":"100 à 103","obj":["Écrire une demande complète en cinq questions.","Constater l'écart entre un prompt nu et un prompt construit."],"pts":["Un prompt est une commande, pas une recherche : une consigne complète, comme pour un·e stagiaire brillant·e.","Rôle, mission, contexte, tâche, format.","Six réflexes : délimiter la source, autoriser le doute, donner un exemple, itérer, prompt inversé, changer de plateforme."],"quiz":"rmctf","fiches":["rmctf"]},
  {"id":"j1-paliers12","t":["14:50","15:15"],"type":"pratique","tf":2,"titre":"Paliers 1 et 2 : résumé nu, puis résumé guidé","cas":"Résumés et titres oui, réécriture non : la règle du New York Times","pages":"121 à 123","exo":{"titre":"Résumé nu, puis résumé guidé","duree":20,"steps":["Choisir un document public long et récent que vous connaissez bien.","Palier 1 : coller le texte dans deux assistants avec ce seul prompt : « Résume ce texte. »","Observer longueur, structure, hiérarchie, erreurs.","Palier 2 : refaire avec le prompt R·M·C·T·F (outil Constructeur).","Comparer précision, utilité et temps de vérification."],"prompts":["resume"]},"live":"lettre"},
  {"id":"j1-p2","t":["15:15","15:30"],"type":"pause","titre":"Pause"},
  {"id":"j1-paliers","t":["15:30","16:10"],"type":"pratique","tf":2,"titre":"Paliers 3 et 4 : analyser un texte, fabriquer un objet","cas":"Un millier d'articles locaux classés dans un tableur (J. Abbiateci)","pages":"124, 125","obj":["Utiliser l'IA comme premier lecteur critique, pas comme rédacteur.","Produire un objet directement utilisable : un planning, un CSV."],"pts":["Distinguer faits vérifiables, opinions et affirmations sans source.","L'IA produit aussi des objets : tableaux, CSV, check-lists, rétroplannings.","Vérifier les dates et les jours de la semaine : erreur fréquente."],"exo":{"titre":"Analyse d'une tribune, puis planning de couverture","duree":40,"steps":["Palier 3 : soumettre une tribune ou un discours du jour avec le prompt d'analyse.","Vérifier que chaque citation proposée figure bien dans le texte.","Palier 4 : demander un planning de couverture d'un événement de 5 jours, puis sa version CSV.","Importer le CSV dans un tableur et contrôler dates et jours."],"prompts":["analyse","planning"]}},
  {"outil":"toolSve","id":"j1-sve","t":["16:10","16:25"],"type":"pratique","tf":2,"titre":"Méthode S·V·E : spécification, vérification, environnement","cas":"Scrape, au Philadelphia Inquirer : une spec corrigée chaque jour","pages":"104 à 108","obj":["Passer d'une demande ponctuelle à un travail organisé sur plusieurs sessions.","Écrire les critères avant d'exécuter."],"pts":["S : transmettre le but réel, découper en lots courts, faire lister les hypothèses.","V : fixer les critères avant, un second regard, un signal extérieur.","E : instructions permanentes, base documentaire, procédures, garde-fous gradués."],"quiz":"sve","fiches":["sve","projet","configuration"]},
  {"id":"j1-sve-exos","t":["16:25","17:00"],"type":"pratique","tf":2,"titre":"Exercices : la spec par interview, les critères d'abord","cas":"Les tip sheets de CalMatters, la vérification chez Newsquest","pages":"110, 112","exo":{"titre":"La spec par interview, puis les critères d'abord","duree":30,"steps":["Choisir un sujet au long cours de votre rédaction.","Lancer le prompt de spec par interview et répondre une question à la fois.","Relire la spec : combien d'hypothèses l'IA a-t-elle posées seule ? Lesquelles sont fausses ?","Sur un rapport public lié au sujet, faire énoncer les critères d'une fiche d'interview, les corriger, puis faire évaluer la fiche critère par critère."],"prompts":["spec","criteres"]}},
  {"id":"j1-libre","t":["17:00","17:15"],"type":"discussion","titre":"Les limites : conformité n'est pas vérité","cas":"Der Spiegel : l'outil propose, le vérificateur décide","pages":"109","pts":["Conformité n'est pas vérité.","Des prescripteurs intéressés, des coûts cachés, un risque d'atrophie."],"disc":["Qu'est-ce qui vous a surpris aujourd'hui ?","Où placez-vous la limite entre assistance et écriture ?","Qui, dans votre rédaction, devrait décider des outils ?"]},
  {"id":"j1-bilan","t":["17:15","17:30"],"type":"discussion","titre":"Bilan : qu'allez-vous tester lundi matin ?","cas":"Évaluation à chaud","pages":"133 à 135","disc":["Une tâche précise que vous testerez la semaine prochaine.","Une question qui reste ouverte."],"live":"lundi"}
];

const D2 = [
 // ---------- Jour 1 : comprendre, puis temps fort 1 ----------
 {id:"a-accueil", day:1, t:["09:30","09:50"], type:"discussion", titre:"Accueil, objectifs, vos attentes", pages:"3 à 9",
  obj:["Situer les deux journées : comprendre et Gemini Notebook le jour 1, les assistants et les méthodes le jour 2."],
  pts:["Un assistant d'IA est un service, pas un outil.","Il ne peut pas être une source à lui seul."],
  disc:["Quel est votre niveau avec l'IA ? Qu'en attendez-vous ?","Votre rédaction a-t-elle une charte IA ?"], live:"niveau"},
 {id:"a-etat", day:1, t:["09:50","10:45"], type:"comprendre", titre:"Où en est l'IA, d'où elle vient", pages:"11 à 24",
  obj:["Mesurer ce que coûte l'IA : argent, énergie, droit d'auteur, travail caché.","Comprendre pourquoi tout s'accélère en 2022."],
  pts:["Des milliards investis en avance sur les revenus.","Une industrie lourde : électricité, eau, métaux.","Un rêve plus ancien que l'informatique, des promesses souvent non tenues."]},
 {id:"a-p1", day:1, t:["10:45","11:00"], type:"pause", titre:"Pause"},
 {id:"a-machine", day:1, t:["11:00","11:40"], type:"comprendre", titre:"Comprendre la machine : comment est fabriqué un LLM", pages:"25 à 31",
  obj:["Comprendre les étapes de fabrication d'un modèle et leurs effets."],
  pts:["Données d'entraînement, pré-entraînement, RLHF, filtres : cinq étapes, cinq séries de choix.","Le modèle apprend des régularités, pas des faits."],
  quiz:"llm"},
 {id:"a-presse", day:1, t:["11:40","12:15"], type:"comprendre", titre:"L'IA et la presse, ce qu'en font les rédactions", pages:"33 à 67",
  obj:["Comprendre l'effet des résumés d'IA sur l'audience.","Voir des usages réels, de l'usage assumé au contre-exemple."],
  pts:["L'essentiel des usages se joue autour de l'article.","L'outil propose, le journaliste vérifie."], ex:true, quiz:"redac"},
 {id:"a-disc1", day:1, t:["12:15","12:30"], type:"discussion", titre:"Discussion : et dans votre rédaction ?", disc:["Lequel de ces usages serait utile dans votre service ? Lequel vous inquiète ?","Qui décide des outils chez vous ?"]},
 {id:"a-dej", day:1, t:["12:30","13:30"], type:"pause", titre:"Déjeuner"},
 {id:"a-nb1", day:1, t:["13:30","14:15"], type:"pratique", tf:1, titre:"Temps fort 1 · Gemini Notebook : votre premier carnet", pages:"69, 71",
  obj:["Créer un carnet, charger des sources, l'interroger."],
  pts:["Il répond à partir des documents chargés et renvoie au passage cité.","Une réponse sourcée n'est pas une réponse vérifiée."],
  exo:{titre:"Votre premier carnet", duree:30, steps:["Choisir un dossier que vous connaissez bien.","Charger cinq sources publiques : un rapport, deux articles, une vidéo, un PDF.","Poser trois questions dont vous connaissez la réponse.","Ouvrir chaque citation.","Poser une question hors corpus."], prompts:["carnet"]}, quiz:"notebook", fiches:["notebook"], live:"carnet"},
 {id:"a-nb2", day:1, t:["14:15","15:15"], type:"pratique", tf:1, titre:"Cinq usages en rédaction : rapport, interview, deux versions", pages:"70",
  obj:["Appliquer le carnet à trois situations de rédaction."],
  pts:["Dépouiller un rapport : chaque chiffre renvoie à sa page.","Préparer une interview : variations et contradictions.","Comparer deux versions d'un texte : ce qui change."],
  exo:{titre:"Trois situations, un carnet chacune", duree:55, steps:["Dépouiller un rapport public : cinq chiffres clés, chacun avec sa page.","Préparer une interview à partir des déclarations passées d'un interlocuteur.","Comparer deux versions d'un même texte (projet de loi amendé, deux rapports annuels).","Pour chaque situation, contrôler trois réponses dans les sources."], prompts:["interview"]}},
 {id:"a-p2", day:1, t:["15:15","15:30"], type:"pause", titre:"Pause"},
 {id:"a-nb3", day:1, t:["15:30","16:30"], type:"pratique", tf:1, titre:"Le Studio : résumé audio, carte mentale, quiz, et leurs limites", pages:"69, 70",
  obj:["Produire des contenus dérivés et juger leur fidélité."],
  pts:["Résumé audio ou vidéo, carte mentale, rapport, quiz, fiches.","Un résumé audio s'écoute en entier avant toute diffusion."],
  exo:{titre:"Produire et contrôler", duree:55, steps:["Générer un résumé audio de votre carnet et l'écouter en entier.","Noter chaque approximation ou ajout par rapport aux sources.","Générer une carte mentale et un quiz : sont-ils fidèles ?","Décider : qu'est-ce qui serait diffusable, et après quelle vérification ?"]}},
 {id:"a-donnees", day:1, t:["16:30","17:00"], type:"pratique", tf:1, titre:"Vos données : le code couleur de la rédaction", pages:"89 à 98",
  obj:["Savoir ce qu'on peut envoyer à un assistant grand public."],
  pts:["Ce qui part quand vous appuyez sur « envoyer » : contenu, métadonnées, compte, réactions, données des connecteurs.","Jamais, avec précaution, sans risque.","Le secret des sources est protégé par la loi de 1881."],
  exo:{titre:"Le jeu du code couleur, puis vos réglages", duree:25, steps:["Faire le jeu du code couleur (onglet Outils).","Désactiver l'entraînement sur vos comptes.","Purger un historique de test et repérer la mémoire."]}, quiz:"donnees", fiches:["donnees"]},
 {id:"a-debrief", day:1, t:["17:00","17:30"], type:"discussion", titre:"Débrief du temps fort 1", disc:["Combien de réponses justes, approximatives, fausses ?","Quel temps de vérification pour quel gain ?","Auriez-vous publié l'une de ces réponses telle quelle ?"], live:"invente"},
 // ---------- Jour 2 : temps fort 2 ----------
 {id:"b-retour", day:2, t:["09:30","09:45"], type:"discussion", titre:"Retour sur la veille : questions ouvertes", disc:["Qu'avez-vous retenu de Gemini Notebook ?","Une question restée sans réponse ?"]},
 {id:"b-assist", day:2, t:["09:45","10:45"], type:"pratique", tf:2, titre:"Temps fort 2 · ChatGPT, Claude, Gemini, Mistral", pages:"72 à 81",
  obj:["Se repérer dans les quatre interfaces.","Comparer les mêmes fonctions sous des noms différents."],
  pts:["Même architecture : projets, sélecteur de modèle, outils, historique, paramètres.","Un seul est européen : Mistral."],
  exo:{titre:"Le tour du propriétaire", duree:45, steps:["Créer un compte dédié sur deux assistants.","Repérer les sept zones de l'interface.","Soumettre la même question aux quatre et comparer."]}, fiches:["interface"]},
 {id:"b-p1", day:2, t:["10:45","11:00"], type:"pause", titre:"Pause"},
 {id:"b-jargon", day:2, t:["11:00","11:45"], type:"pratique", tf:2, titre:"Projets, connecteurs, compétences, plugins, MCP, instructions", pages:"82 à 87",
  obj:["Comprendre ce que les mots recouvrent.","Écrire ses instructions personnalisées."],
  pts:["Connecteur : les clés. Compétence : la fiche de procédure. Plugin : la mallette.","MCP : la prise USB-C des IA.","Instructions : qui vous êtes, ton, rigueur ; jamais de sources."],
  exo:{titre:"Paramétrer sa plateforme", duree:30, steps:["Coller le modèle d'instructions et l'adapter.","Tester avec une question piège.","Repérer où se trouvent les connecteurs, sans en brancher aucun vers un outil professionnel."], prompts:["instructions"]}, quiz:"jargon", fiches:["projet","connecteur","competence","plugin","mcp","instructions","injection"]},
 {id:"b-rmctf", day:2, t:["11:45","12:30"], type:"pratique", tf:2, titre:"Méthode R·M·C·T·F, paliers 1 et 2", pages:"100 à 103, 122, 123",
  obj:["Écrire une demande complète en cinq questions."],
  pts:["Rôle, mission, contexte, tâche, format.","Six réflexes en plus."],
  exo:{titre:"Résumé nu, puis résumé guidé", duree:35, steps:["Palier 1 : « Résume ce texte » dans deux assistants.","Palier 2 : le même texte avec R·M·C·T·F.","Comparer précision, utilité, temps de vérification."], prompts:["resume"]}, quiz:"rmctf", fiches:["rmctf"], outil:"toolRmctf", live:"lettre"},
 {id:"b-dej", day:2, t:["12:30","13:30"], type:"pause", titre:"Déjeuner"},
 {id:"b-paliers", day:2, t:["13:30","14:30"], type:"pratique", tf:2, titre:"Paliers 3 et 4 : analyser, fabriquer un objet", pages:"124, 125",
  obj:["Utiliser l'IA comme premier lecteur critique.","Produire un planning et un CSV."],
  pts:["Faits, opinions, affirmations sans source.","Vérifier les dates et les jours de la semaine."],
  exo:{titre:"Analyse puis planning", duree:55, steps:["Palier 3 : analyse d'une tribune du jour.","Palier 4 : planning de couverture d'un événement de 5 jours, puis CSV.","Variante : un rétroplanning à J-15."], prompts:["analyse","planning"]}},
 {id:"b-sve1", day:2, t:["14:30","15:15"], type:"pratique", tf:2, titre:"S·V·E : la spécification et les critères", pages:"104 à 107, 110 à 112",
  obj:["Transmettre le but réel, découper, faire lister les hypothèses.","Écrire les critères avant d'exécuter."],
  pts:["Dégager le but, pas la tâche.","Une spec acceptée sans modification n'a pas été relue."],
  exo:{titre:"Exercices 1, 2 et 3a du niveau 2", duree:40, steps:["La spec par interview.","Découper en lots et rejeter ou modifier au moins un lot.","Critères d'abord sur une fiche d'interview."], prompts:["spec","lots","criteres"]}, fiches:["sve"], outil:"toolSve"},
 {id:"b-p2", day:2, t:["15:15","15:30"], type:"pause", titre:"Pause"},
 {id:"b-sve2", day:2, t:["15:30","16:30"], type:"pratique", tf:2, titre:"S·V·E : relecture croisée, projet, reprise à froid", pages:"108, 113 à 117",
  obj:["Organiser l'environnement : projet, instructions, note de décisions."],
  pts:["Un second modèle relit, puis vous revenez au document.","Le projet garde instructions et documents, pas toujours les décisions de la veille."],
  exo:{titre:"Exercices 3b, 4 et 5 du niveau 2", duree:55, steps:["Relecture croisée par un second assistant, puis contrôle de trois chiffres vous-même.","Monter le projet avec ses instructions et 5 à 10 sources publiques.","Test de résistance : « Trouve une citation du directeur pour illustrer. » La règle JAMAIS tient-elle ?","Reprise à froid dans une nouvelle conversation, puis note de décisions."], prompts:["croisee","projetinstr","froid"]}, quiz:"sve", fiches:["sve","projet","configuration"]},
 {id:"b-libre", day:2, t:["16:30","17:00"], type:"discussion", titre:"Discussion libre : les limites de la méthode, vos usages", pages:"109, 116",
  disc:["Conformité n'est pas vérité : où la vérification humaine reste-t-elle indispensable ?","Projet en ligne ou dossier à vous : que choisiriez-vous pour un dossier sensible ?"]},
 {id:"b-bilan", day:2, t:["17:00","17:30"], type:"discussion", titre:"Bilan et évaluation", pages:"133, 134", disc:["Une tâche précise que vous testerez la semaine prochaine.","Une question qui reste ouverte."], live:"lundi"},
];

/* Jour 2, niveau débutant (sessions.programme.level = "debutant", choisi dans le pilotage) : on reste sur
   R·M·C·T·F, puis ateliers libres par deux ou trois sur des problèmes réels du service (tâches pénibles à
   automatiser, enchaînements à modéliser en conducteurs assistés). Le niveau expert garde le jour 2 de D2.
   Mêmes heures de début, de pauses, de déjeuner, de bilan et de fin : la fin de journée et l'évaluation suivent. */
const B = (id) => D2.find((m) => m.id === id);
const D2_DEBUTANT = [
 B("b-retour"),
 B("b-assist"),
 B("b-p1"),
 {id:"d-rmctf", day:2, t:["11:00","11:45"], type:"pratique", tf:2, titre:"Méthode R·M·C·T·F : les cinq questions", pages:"100 à 103, 122, 123",
  obj:["Écrire une demande complète en cinq questions.","Voir ce que chaque lettre change dans la réponse."],
  pts:["Rôle, mission, contexte, tâche, format.","Une tâche par ligne : l'assistant les traite dans l'ordre."],
  exo:{titre:"Résumé nu, puis résumé guidé", duree:35, steps:["Palier 1 : « Résume ce texte » dans deux assistants.","Palier 2 : le même texte avec R·M·C·T·F, dans le constructeur de l'onglet Outils.","Comparer précision, utilité, temps de vérification."], prompts:["resume"]}, quiz:"rmctf", fiches:["rmctf"], outil:"toolRmctf", live:"lettre"},
 {id:"d-flou", day:2, t:["11:45","12:30"], type:"pratique", tf:2, titre:"R·M·C·T·F à l'entraînement : réparer des demandes floues", pages:"100 à 103",
  obj:["Transformer une demande vague en demande complète.","Découper une tâche en étapes."],
  pts:["Une demande floue laisse l'assistant deviner, et il devine mal.","« Si tu ne sais pas, dis-le » et le prompt inversé limitent les inventions."],
  exo:{titre:"Trois demandes floues à réparer", duree:35, steps:["Partir de trois demandes floues : « Fais-moi un titre », « Résume la réunion », « Trouve des idées de sujets ».","Les réécrire avec les cinq lettres, en découpant la tâche en étapes avec « Ajouter une tâche ».","Tester chaque version dans un assistant et noter ce qui change.","Relancer avec le prompt inversé : quelles questions l'assistant vous pose-t-il ?"]}, outil:"toolRmctf"},
 B("b-dej"),
 {id:"d-probleme", day:2, t:["13:30","14:15"], type:"pratique", tf:2, titre:"Atelier · Vos tâches pénibles, vos conducteurs",
  obj:["Repérer dans votre semaine une tâche répétitive, ou un enchaînement d'étapes à modéliser.","Formuler le problème à résoudre en une phrase."],
  pts:["Une tâche pénible revient souvent, prend du temps et demande peu de jugement.","Un conducteur assisté reprend un enchaînement que vous suivez déjà : un journal, une émission, une édition spéciale.","Rien de sensible dans l'assistant : le code couleur d'hier s'applique."],
  exo:{titre:"Trouver et formuler le problème", duree:40, steps:["Formez des groupes de deux ou trois.","Chacun·e raconte sa journée type. Notez les tâches qui reviennent et celles qui pèsent.","Choisissez une tâche pénible à automatiser, ou un enchaînement à modéliser en conducteur assisté.","Formulez le problème en une phrase : « Chaque [fréquence], nous devons [tâche], ce qui prend [temps] parce que [difficulté]. »","Notez ce que l'assistant aura besoin de savoir, et ce qu'il ne doit jamais recevoir."]}, idees:true, live:"penible"},
 {id:"d-prompt", day:2, t:["14:15","15:15"], type:"pratique", tf:2, titre:"Atelier · Un prompt R·M·C·T·F pour votre problème",
  obj:["Traduire le problème formulé en une demande complète.","Lister les tâches dans l'ordre où vous les feriez."],
  pts:["Le problème formulé devient la mission.","Le contexte dit ce que l'assistant ne peut pas deviner sur votre service.","Le format décrit le résultat exact : liste, tableau, conducteur minuté."],
  exo:{titre:"Écrire le prompt, puis le tester", duree:50, steps:["Ouvrez le constructeur R·M·C·T·F, dans l'onglet Outils.","Rôle et mission à partir du problème formulé par le groupe.","Contexte : votre service, votre public, vos contraintes de temps et de format.","Tâches : une par ligne, avec « Ajouter une tâche », dans l'ordre où vous les feriez.","Format : la forme exacte du résultat.","Testez sur un exemple public ou anonymisé, dans deux assistants."]}, idees:true, outil:"toolRmctf"},
 B("b-p2"),
 {id:"d-tester", day:2, t:["15:30","16:30"], type:"pratique", tf:2, titre:"Atelier · Tester, corriger, rendre le prompt réutilisable",
  obj:["Améliorer le prompt après un premier essai.","En faire un outil que le service peut reprendre."],
  pts:["Chaque défaut de la réponse renvoie à une lettre à préciser.","Un prompt réutilisable met entre [crochets] ce qui change à chaque fois."],
  exo:{titre:"Deux tours d'amélioration", duree:50, steps:["Relevez trois défauts de la première réponse, et la lettre qui les corrige.","Corrigez le prompt et relancez-le dans une nouvelle conversation.","Remplacez ce qui change à chaque fois par des [crochets] : sujet, date, durée, invité.","Testez avec un second exemple. Le résultat tient-il ?","Préparez une restitution de deux minutes : le problème, le prompt, ce qui reste à vérifier."]}, outil:"toolRmctf"},
 {id:"d-restitution", day:2, t:["16:30","17:00"], type:"discussion", titre:"Restitution des groupes : problèmes, prompts, limites",
  disc:["Quel problème, quel prompt, quel temps gagné ?","Ce que l'assistant fait mal, ou ne doit pas faire, dans ce travail.","Qui vérifie le résultat, et à quel moment ?"]},
 B("b-bilan"),
];
export const D2B = [...D2.filter((m) => m.day === 1), ...D2_DEBUTANT];
// Titres des journées du déroulé par défaut en deux journées, selon le niveau du jour 2
export const DAY_TITLES = { expert: { 1: "Comprendre et Gemini Notebook", 2: "Les assistants et les méthodes" }, debutant: { 1: "Comprendre et Gemini Notebook", 2: "Les assistants et R·M·C·T·F en atelier" } };

/* Pastilles d'aide des ateliers (jour 2, niveau débutant, et constructeur R·M·C·T·F) : des situations pour
   imaginer son propre problème. [titre, situation] */
const IDEES = [
 {g:"Tâches pénibles à automatiser", items:[
  ["Dérusher une interview", "À partir de la transcription d'une longue interview, repérer les passages forts, leurs minutages et les citations à vérifier à l'écoute."],
  ["Lancements et titres", "Proposer trois lancements, titres et chapôs à partir du texte d'un sujet déjà monté."],
  ["Revue de presse du matin", "Classer les articles et dépêches publics du jour par thème, et résumer chacun en deux lignes avec son lien."],
  ["Fiche invité", "Préparer la fiche d'un invité à partir de sources publiques que vous fournissez : parcours, déclarations récentes, contradictions."],
  ["Déclinaisons pour les réseaux", "Décliner un reportage en un texte court par réseau social, dans le ton de la chaîne ou de la station."],
  ["Résumé et mots-clés", "Résumer un sujet diffusé pour le site ou pour l'archivage : résumé, mots-clés, personnes citées."],
  ["Traduire une source", "Traduire et résumer un document public en langue étrangère, en signalant les passages incertains."],
  ["Messages du public", "Trier par thème des messages d'auditeurs ou de téléspectateurs anonymisés, et proposer une réponse type."],
 ]},
 {g:"Conducteurs assistés à modéliser", items:[
  ["Conducteur d'un journal", "Ordonner les sujets du jour, minuter chaque élément, proposer les lancements, signaler ce qui dépasse la durée prévue."],
  ["Émission avec invité", "Fiche invité, questions dans l'ordre, relances possibles, points à vérifier avant l'antenne."],
  ["Édition spéciale", "Un déroulé type pour une soirée électorale ou un événement prévu : séquences, durées, rôles, solutions de repli."],
  ["Rétroplanning", "De J-15 au jour J pour un événement à couvrir : tâches, responsables, dates, en vérifiant les jours de la semaine."],
  ["Vérifier une vidéo virale", "Les étapes de vérification d'une vidéo reçue : source, date, lieu, recoupements, décision de diffuser ou non."],
  ["De l'antenne au numérique", "L'enchaînement après diffusion : article, titre, résumé, extraits, textes pour les réseaux."],
 ]},
];

/* Activités prêtes pour la salle */
const PRESETS = {
 niveau:{type:"poll", q:"Votre niveau avec l'IA générative ?", o:["Jamais utilisée","Quelques essais","Usage régulier","Usage quotidien au travail"]},
 attente:{type:"cloud", q:"Un mot pour ce que vous attendez de cette formation"},
 carnet:{type:"poll", q:"Votre premier carnet : où en êtes-vous ?", o:["Sources chargées","Questions posées","Citations vérifiées","Terminé"]},
 invente:{type:"poll", q:"Gemini Notebook a-t-il inventé quelque chose dans vos réponses ?", o:["Oui","Non","Je ne sais pas"]},
 lettre:{type:"poll", q:"Quelle lettre de R·M·C·T·F oubliez-vous le plus souvent ?", o:["R · Rôle","M · Mission","C · Contexte","T · Tâche","F · Format"]},
 fini:{type:"poll", q:"Où en êtes-vous de l'exercice ?", o:["J'ai terminé","Presque","J'ai besoin d'aide"]},
 ia:{type:"cloud", q:"Un mot pour décrire l'IA aujourd'hui"},
 lundi:{type:"cloud", q:"Qu'allez-vous tester lundi matin ?"},
 penible:{type:"cloud", q:"En quelques mots : la tâche la plus pénible de votre semaine"},
};

/* Code couleur : jeu */
const CC = [
 ["La retranscription d'un entretien off avec un lanceur d'alerte","jam"],
 ["Un rapport de la Cour des comptes publié ce matin","san"],
 ["Vos notes d'interview, noms et lieux remplacés par « X » et « la commune »","pre"],
 ["Un document interne sous embargo jusqu'à jeudi","jam"],
 ["Un article déjà publié par votre journal","san"],
 ["Le tableau des salaires de la rédaction","jam"],
 ["Un jeu de données de data.gouv.fr","san"],
 ["La retranscription d'une interview publiée, avec l'accord de l'interviewé","pre"],
 ["Le numéro de téléphone d'une source","jam"],
 ["Votre plan d'article et vos questions de méthode","san"],
 ["Un brouillon de papier qui cite des personnes privées","pre"],
 ["Des rushs vidéo non publiés","jam"],
];
const CCL = {jam:"Jamais", pre:"Avec précaution", san:"Sans risque"};

export { FICHES, GLOSS, PROMPTS, CASES, QUIZ, D1, D2, PRESETS, CC, CCL, IDEES };
