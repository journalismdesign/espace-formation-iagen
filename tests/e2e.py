"""Parcours complet en mode démonstration (Playwright).
Prérequis : `npm run build && npx vite preview --port 4173` dans un autre terminal.
Un onglet formateur et un onglet stagiaire partagent le même stockage local :
on vérifie l'invitation par code, le direct, le cadrage, le retour, le bilan.
Usage : python3 tests/e2e.py   (variable CHROME pour un navigateur précis)"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright

URL = os.environ.get("URL", "http://localhost:4173/")
OUT = pathlib.Path(__file__).parent
errors = []

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e} | {(e.stack or '')[:300]}"))
    page.on("console", lambda m: errors.append(f"{who} console: {m.text}") if m.type == "error" else None)
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))

async def shot(page, name):
    await page.wait_for_timeout(350)
    await page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1366, "height": 860}, locale="fr-FR")
        tr = await ctx.new_page(); watch(tr, "formateur")
        await tr.goto(URL); await tr.wait_for_selector("#sForm")   # entrée stagiaire par défaut
        await tr.goto(URL + "#/formateur"); await tr.wait_for_selector("#gF")      # code d'accès formateur
        await tr.fill("#gC", "mauvais"); await tr.click("#gF button"); await tr.wait_for_selector("#gMsg:has-text('incorrect')")
        await tr.fill("#gC", "SAMSA-DEMO"); await tr.click("#gF button"); await tr.wait_for_selector("#gBtn")
        await shot(tr, "01-connexion")
        await tr.click("#asTrainer"); await tr.wait_for_selector("text=Démarrer une session")
        await shot(tr, "02-sessions")
        await tr.click("table a"); await tr.wait_for_selector(".phases")
        sid = tr.url.split("/admin/s/")[1].split("/")[0]
        # Réglages : horaires, émargement, support
        await tr.goto(URL + f"#/admin/s/{sid}/reglages"); await tr.wait_for_selector("#regF")
        # Accordéons : émargement ouvert à l'arrivée, un seul ouvert à la fois
        assert await tr.locator("details[data-acc='em'][open]").count() == 1
        await tr.click("details[data-acc='sl'] summary"); await tr.wait_for_timeout(200)
        assert await tr.locator("details.acc-set[open]").count() == 1 and await tr.locator("details[data-acc='sl'][open]").count() == 1, "un seul accordéon ouvert"
        # Entreprise : champs « Autre » masqués quand une entreprise préenregistrée est choisie
        assert await tr.locator("#otherFields").is_hidden()
        await tr.click("input[name='brand'][value=''] >> xpath=.."); assert await tr.locator("#otherFields").is_visible()
        await tr.click("input[name='brand'] >> nth=2 >> xpath=.."); assert await tr.locator("#otherFields").is_hidden()
        for k in ["em", "ev"]:
            await tr.click(f"details[data-acc='{k}'] summary"); await tr.wait_for_timeout(150)
            if k == "em": await tr.fill("#gE", "17:30"); await tr.fill("#gEm", "https://exemple.fr/emargement-qualiopi"); await tr.fill("#gEl", "FTV"); await tr.fill("#gEt", "Signez via le lien reçu de la DRH")
            if k == "ev": await tr.fill("#gEvU", "https://bit.ly/outilsIA-FranceTV"); await tr.wait_for_selector("#evPrev img")
        await tr.click("details[data-acc='sl'] summary"); await tr.wait_for_timeout(150)
        await tr.fill("#dkT", "Étude de cas (PDF)"); await tr.fill("#dkU", "https://drive.google.com/file/d/1cWhTM8HR0KR33QIud2ZQxYAw1JcxbKHE/view?usp=drive_link"); await tr.click("#dkAdd")
        await tr.wait_for_selector("#deckList .prow")
        await tr.click("#regF .draft-save"); await tr.wait_for_timeout(500)
        await shot(tr, "02b-reglages")
        # Brouillon automatique : la saisie survit à un changement de page, « Tout réinitialiser » vide les champs
        await tr.click("details[data-acc='em'] summary"); await tr.fill("#gEt", "Texte en cours de saisie"); await tr.wait_for_timeout(700)
        await tr.goto(URL + f"#/admin/s/{sid}/avant"); await tr.wait_for_selector("#invF")
        await tr.goto(URL + f"#/admin/s/{sid}/reglages"); await tr.wait_for_selector("#regF .draft-warn")
        assert await tr.input_value("#gEt") == "Texte en cours de saisie", "brouillon restauré"
        await shot(tr, "02d-brouillon")
        await tr.click(".draft-reset"); await tr.click(".draft-reset"); await tr.wait_for_timeout(200)
        assert await tr.input_value("#gEt") == "" and await tr.input_value("#gT") == "", "champs vidés"
        await tr.goto(URL + f"#/admin/s/{sid}/avant"); await tr.wait_for_selector("#invF")
        await tr.goto(URL + f"#/admin/s/{sid}/reglages"); await tr.wait_for_selector("#regF")
        assert await tr.input_value("#gEt") == "Signez via le lien reçu de la DRH", "réinitialiser n'enregistre rien"
        await tr.goto(URL + f"#/admin/s/{sid}/avant"); await tr.wait_for_selector("#invF")
        assert (await tr.inner_text("#jl")).strip().endswith("/DEMO42"), "lien court attendu"
        await tr.fill("#invT", "alice@demo.fr"); await tr.click("#invF button"); await tr.wait_for_timeout(300)
        await tr.goto(URL + "#/admin/reglages"); await tr.wait_for_selector("#bF")
        # Logos de test (fictifs) : version sombre puis version claire pour la 3e entreprise (Libération)
        fx = OUT / "fixtures"
        await tr.locator("input[data-kind='dark']").nth(3).set_input_files(str(fx / "logo-sombre.png")); await tr.wait_for_timeout(600)
        await tr.locator("input[data-kind='light']").nth(3).set_input_files(str(fx / "logo-clair.png")); await tr.wait_for_timeout(600)
        assert await tr.locator(".brand-row >> nth=2").locator("img").count() == 2, "deux versions du logo attendues"
        await shot(tr, "02c-reglages-generaux")

        # Stagiaire : slide de titre → prénom + e-mail → code → émargement → support → tableau de bord
        st = await ctx.new_page(); watch(st, "stagiaire")
        await st.goto(URL + "DEMO42"); await st.wait_for_selector(".slide-page.title")   # lien court
        await shot(st, "03a-slide-titre")
        light_src = await st.locator(".for-client img").get_attribute("src")
        await st.click("#go"); await st.wait_for_selector("#reqF")
        await st.fill("#fn", "Bob"); await st.fill("#em", "bob@demo.fr"); await st.click("#reqF button")
        await st.wait_for_selector(".demo-code b"); code = (await st.inner_text(".demo-code b")).strip()
        await st.fill("#cd", "ZZZZZZ"); await st.click("#codeF button"); await st.wait_for_timeout(300)  # mauvais code refusé
        assert await st.locator("#codeF").count() == 1
        await st.fill("#cd", code); await st.click("#codeF button")
        await st.wait_for_selector(".em-qr img"); await shot(st, "03b-emargement")
        assert "POUR FTV" in (await st.inner_text(".em-steps")).upper(), "2e étape d'émargement au nom du client"
        await st.click("#next"); await st.wait_for_selector(".lockbox"); await shot(st, "03c-support-verrouille")
        await st.click("#next"); await st.wait_for_selector(".side"); await shot(st, "03-stagiaire-direct-attente")
        dark_src = await st.locator(".side .for-client img").get_attribute("src")
        assert light_src and dark_src and light_src != dark_src, "version claire sur fond marine, version sombre sur fond clair"

        # Formateur : Jour J, pilote la slide de titre puis une séquence et une page du support
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.wait_for_selector("#opening")
        await tr.click("[data-view='title']"); await tr.wait_for_selector("#preview .deck-slide.dark .samsa.big")
        await st.wait_for_selector("#liveCard h3:has-text('Bienvenue')", timeout=5000)
        # Salle fermée : les écrans d'ouverture se projettent sans ouvrir la salle et restent invisibles des stagiaires
        await tr.click("[data-status='draft']"); await tr.wait_for_selector("[data-status='live']")
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.wait_for_selector("#opening")
        await tr.click("[data-view='emargement']"); await tr.wait_for_selector("#preview .ds-em, #preview .deck-slide", timeout=5000)
        assert await tr.locator("[data-status='live']").count() == 1, "la salle reste fermée"
        await st.wait_for_selector("#liveCard .empty", timeout=5000)
        assert "Bienvenue" not in await st.inner_text("#liveCard") and "émarger" not in (await st.inner_text("#liveCard")).lower(), "rien côté stagiaire salle fermée"
        await tr.click("[data-status='live']"); await tr.wait_for_timeout(500)
        await st.wait_for_selector("#liveCard .dot.on", timeout=5000)
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.wait_for_selector("#opening")
        await tr.click("[data-view='trainer']"); await tr.wait_for_selector("#preview .ds-trainer")
        assert "GERALD HOLUBOWICZ" in (await tr.inner_text("#preview")).upper()
        await st.wait_for_selector("#liveCard .tr-card", timeout=5000)
        await shot(tr, "05d-intervenant")
        # Formation en ligne : le stagiaire voit l'écran du formateur dans son espace
        await tr.check("#onlineMode"); await st.wait_for_selector("#olScr .deck-slide", timeout=6000)
        assert "GERALD HOLUBOWICZ" in (await st.inner_text("#olScr")).upper(), "écran du formateur côté stagiaire"
        assert "participant" not in (await st.inner_text("#olScr")).lower(), "pas de compteur côté stagiaire"
        await tr.click("[data-view='title']"); await st.wait_for_selector("#olScr .ds-title.xl", timeout=6000)
        await shot(st, "03d-stagiaire-en-ligne")
        await tr.uncheck("#onlineMode"); await st.wait_for_selector("#liveCard h3", timeout=6000)
        assert await st.locator("#olScr").count() == 0, "retour à la carte classique"
        await tr.click("[data-em='j1-matin']"); await tr.wait_for_selector("#preview .ds-qrbox img")
        assert "POUR FTV" in (await tr.inner_text("#preview")).upper()
        assert "lien reçu de la DRH" in await tr.inner_text("#preview"), "texte du second émargement modifiable"
        await shot(tr, "05b-emargement-ecran")
        await st.wait_for_selector("#liveCard h3:has-text('émarger')", timeout=5000)
        # Bouton vert « Émargement » sous « En direct » pendant que le formateur l'affiche ; parcours : Le jour J avant Mon cadrage
        await st.wait_for_selector("#sideEm .side-em", timeout=5000)
        assert await st.locator(".side-nav a:has-text('Émargement')").count() == 0, "Émargement retiré de la liste des ressources"
        path = await st.inner_text(".side-path")
        assert "Mon cadrage" not in path or path.index("Le jour J") < path.index("Mon cadrage"), "Le jour J au-dessus de Mon cadrage"
        await shot(st, "03e-stagiaire-emargement")
        assert "présenté" in await tr.inner_text("[data-em='j1-matin']"), "l'émargement du matin doit être marqué comme présenté"
        assert await tr.locator("[data-em='j1-aprem']").count() == 1, "créneau d'émargement de l'après-midi attendu"
        await tr.click("[data-view='evaluation']"); await tr.wait_for_selector("#preview .ds-eval .ds-qrbox img")
        assert "bit.ly/outilsIA-FranceTV" in await tr.inner_text("#preview")
        await st.wait_for_selector("#liveCard a[href*='bit.ly']", timeout=5000)
        await shot(tr, "05c-evaluation")
        assert await tr.locator("[data-em='j1-eval']").count() == 1, "créneau d'évaluation en fin de déroulé"
        await tr.click("[data-deck]"); await tr.wait_for_selector("#preview iframe[src*='/preview']")
        await st.wait_for_selector("#liveCard h3:has-text('Étude de cas')", timeout=5000)
        await tr.click("[data-mod='j1-etat']"); await tr.wait_for_selector("[data-page]")
        await tr.click("[data-page] >> nth=2"); await tr.wait_for_selector("#preview iframe")
        # Page suivante préchargée ; en avançant, l'iframe préchargée devient la page affichée (pas de rechargement)
        await tr.wait_for_selector("#preview iframe[data-preload]", state="attached")
        await tr.evaluate("document.querySelector('#preview iframe[data-preload]').__marque = 1")
        await tr.click("[data-sl='next']"); await tr.wait_for_timeout(700)
        assert await tr.evaluate("[...document.querySelectorAll('#preview iframe:not([data-preload])')].some(f => f.__marque === 1)"), "page préchargée réutilisée"
        assert await tr.locator("#preview iframe[data-preload]").count() == 1, "nouvelle page préchargée"
        # Formateur : aperçu de la page suivante et horloge avec temps écoulé
        await tr.wait_for_selector("#nextBox:not([hidden]) #nextPrev iframe", state="attached", timeout=5000)
        assert "page" in (await tr.inner_text("#nextLbl")).lower()
        ck = await tr.inner_text("#clock")
        assert " h " in ck and ("écoulé" in ck.lower() or "prévu" in ck.lower()), "horloge du pilotage : " + ck  # avant l'heure de début de la session : « début prévu à »
        # Flèches du clavier : page suivante puis retour
        p0 = await tr.inner_text(".slidebar .chip.on")
        await tr.locator("body").press("ArrowRight"); await tr.wait_for_timeout(600)
        p1 = await tr.inner_text(".slidebar .chip.on")
        assert int(p1) == int(p0) + 1, f"flèche droite : {p0} → {p1}"
        await tr.locator("body").press("ArrowLeft"); await tr.wait_for_timeout(600)
        assert await tr.inner_text(".slidebar .chip.on") == p0, "flèche gauche"
        # « Projeter le QR code » : grand QR et adresse sur l'écran projeté (aperçu)
        await tr.click("#pjQ"); await tr.wait_for_selector("#preview .ds-joinbig-qr img", timeout=5000)
        assert "DEMO42" in await tr.inner_text("#preview")
        await shot(tr, "05f-qr-projete")
        await tr.click("[data-mod='j1-etat']"); await tr.wait_for_selector("[data-page]")
        await tr.click("[data-page] >> nth=2"); await tr.wait_for_selector(".slidebar .chip.on")
        await st.wait_for_selector("#liveCard:has-text('page')", timeout=5000)
        await shot(tr, "05a-formateur-pilotage"); await shot(st, "04a-stagiaire-sequence")
        await st.wait_for_timeout(800); ptxt = await st.inner_text("#parcours")
        assert "En ce moment" in ptxt or "EN CE MOMENT" in ptxt, "la séquence pilotée doit être signalée"
        assert await st.locator(".mod.passed[data-id='j1-accueil']").count() == 1, "la séquence passée doit être validée en vert"
        assert await st.locator(".mod.em-slot.passed[data-slot='j1-matin']").count() == 1, "émargement du matin présenté : validé dans le déroulé"
        assert await st.locator(".mod.em-slot[data-slot='j1-aprem']").count() == 1, "émargement de l'après-midi dans le déroulé"
        await st.locator(".mod.em-slot >> nth=0").scroll_into_view_if_needed(); await shot(st, "04b-deroule-emargement")
        # Outils d'exercice : masqués tant que l'exercice n'est pas lancé, puis disponibles pour de bon
        assert await st.locator("#navOutils[hidden]").count() == 1, "outils masqués avant l'exercice"
        await tr.click("[data-mod='j1-rmctf']"); await st.wait_for_selector("#navOutils:not([hidden])", timeout=5000)
        await tr.click("[data-mod='j1-etat']"); await st.wait_for_timeout(1200)
        assert await st.locator("#navOutils:not([hidden])").count() == 1, "les outils restent disponibles"
        await st.goto(URL + f"#/s/{sid}/outils"); await st.wait_for_selector("#toolRmctf")
        assert await st.locator("#toolRmctf:visible").count() == 1 and await st.locator("#toolSve:visible").count() == 0, "seul l'outil de l'exercice lancé"
        await st.goto(URL + f"#/s/{sid}/direct"); await st.wait_for_selector("#liveCard")
        await tr.click("[data-a='niveau']"); await tr.wait_for_timeout(500)
        await st.wait_for_selector("#liveIn .opt", timeout=5000)
        await st.click("#liveIn .opt >> nth=2"); await st.wait_for_timeout(600)
        await shot(st, "04-stagiaire-sondage")
        await tr.wait_for_timeout(800); await shot(tr, "05-formateur-jourj")
        prev = await tr.inner_text("#preview")
        assert "1" in prev, "la réponse doit apparaître dans l'aperçu"

        # Nuage de mots
        await tr.click("[data-a='attente']"); await st.wait_for_selector("#liveIn input[type=text]", timeout=5000)
        for w in ["vérification", "gain de temps"]:
            await st.fill("#liveIn input[type=text]", w); await st.click("#liveIn button[type=submit]"); await st.wait_for_timeout(400)
        # Quiz : réponse puis correction
        await tr.click("[data-a='quiz-llm']"); await st.wait_for_selector("#liveIn .opt", timeout=5000)
        await st.click("#liveIn .opt >> nth=1"); await tr.wait_for_timeout(500)
        await tr.click("[data-rev]"); await st.wait_for_selector("#liveIn .expl", timeout=5000)
        await shot(st, "06-stagiaire-quiz-correction")

        # Écran projeté
        async with ctx.expect_page() as pinfo:   # ouverte depuis le back-office (même compte)
            await tr.click("#openScr")
        scr = await pinfo.value; watch(scr, "écran")
        await scr.wait_for_selector(".deck-slide"); await shot(scr, "07-ecran-projete")
        await tr.click("[data-a='attente']"); await scr.wait_for_timeout(1200); await shot(scr, "08-ecran-nuage")
        await scr.close()

        # Formation d'une journée : pas de cadrage
        await st.goto(URL + f"#/s/{sid}/direct"); await st.wait_for_selector(".side-path")
        assert await st.locator(".side-path a[href$='/cadrage']").count() == 0, "pas de cadrage en une journée"
        await st.goto(URL + f"#/s/{sid}/cadrage"); await st.wait_for_selector("#liveCard")
        assert "/direct" in st.url, "le cadrage renvoie au jour J"
        assert await tr.locator(".phases a:has-text('Avant — inscription')").count() == 1
        assert await tr.locator("[data-a='vote']").count() == 0, "pas de vote sur les projets en une journée"
        # Passage en deux journées (cadrage, vote et projets réapparaissent)
        await tr.evaluate("""() => { const k = 'iagen-demo-db-v9', db = JSON.parse(localStorage.getItem(k)); const x = db.sessions[0];
          x.format = '2'; const d = new Date(x.date + 'T12:00:00'); d.setDate(d.getDate() + 1); x.date2 = d.toISOString().slice(0, 10);
          x.activities.push({ id: 'vote', type: 'vote', titre: 'Vote', q: "Quel cas d'usage voulez-vous voir testé devant le groupe ?" }, { id: 'projets', type: 'projects', titre: 'Projets' });
          localStorage.setItem(k, JSON.stringify(db)); }""")
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.reload(); await tr.wait_for_selector("[data-a='vote']")
        await st.reload()
        # Stagiaire : cadrage complet
        await st.goto(URL + f"#/s/{sid}/cadrage"); await st.wait_for_selector("section.cad")
        await st.fill("#pName", "Bob Martin")
        await st.click("[data-chips=metier] .pick >> nth=0"); await st.click("[data-chips=niveau] .pick >> nth=1"); await st.click("[data-chips=outils] .pick >> nth=0")
        await st.click("#modes .pick >> nth=2")
        await st.fill("#cBesoin", "Je lis chaque semaine les délibérations du conseil municipal, des PDF de 80 pages.")
        assert await st.locator("#genP, #anaBtn").count() == 0, "plus aucun appel à l'IA dans le cadrage"
        await st.fill("#rTitre", "Revue des délibérations"); await st.fill("#rDesc", "Résumer chaque délibération publiée et repérer les votes.")
        await st.click("#rOutil .pick >> nth=0"); await st.click("#rSens .pick >> nth=0")
        for k in ["donnees", "controle", "prompt"]: await st.check(f"[data-vk='{k}']")
        await st.fill("#vPrompt", "Rôle : secrétaire de rédaction. Mission : résumer chaque délibération en trois lignes.")
        await st.wait_for_timeout(1200)
        await shot(st, "09-cadrage")
        await st.click("#cVal"); await st.wait_for_timeout(600)
        assert "Projet validé" in await st.inner_text("#cadAside"), "le projet doit être validé"
        await st.evaluate("window.scrollTo(0,0)"); await shot(st, "10-cadrage-valide")

        # Stagiaire : mon espace, fiches, discussion, ressources
        await st.goto(URL + "#/"); await st.wait_for_selector(".prep-square"); await shot(st, "11-mon-espace")
        assert "100" in await st.inner_text(".prep-square")
        await st.goto(URL + f"#/s/{sid}/fiches"); await st.wait_for_selector(".fcard"); await shot(st, "12-fiches")
        await st.click(".fcard >> nth=0"); await st.wait_for_selector("article");
        # Messagerie : premier message → conversation « Général » créée, bulle à droite
        await st.goto(URL + f"#/s/{sid}/discussion"); await st.wait_for_selector(".chat .chat-compose textarea")
        await st.fill(".chat-compose textarea", "Gemini garde-t-il mes documents ?"); await st.press(".chat-compose textarea", "Enter")
        await st.wait_for_selector(".chat-row.mine .chat-bubble", timeout=5000)
        assert "Général" in await st.inner_text(".chat-title")
        await st.fill(".chat-compose textarea", "Question pour la pause, avec un lien https://exemple.fr"); await st.press(".chat-compose textarea", "Enter")
        await st.wait_for_selector(".chat-row.mine.grouped .chat-body a", timeout=5000)
        await shot(st, "13-discussion")
        # Back-office : le widget affiche le fil ; la réponse du formateur porte le badge Équipe côté stagiaire
        await tr.goto(URL + f"#/admin/s/{sid}/jour")
        await tr.wait_for_selector("#chatAdm .chat-bubble", timeout=6000)
        assert "Gemini" in await tr.inner_text("#chatAdm")
        await tr.fill("#chatAdm textarea", "Oui, selon vos réglages : on en parle à la pause."); await tr.press("#chatAdm textarea", "Enter")
        await st.wait_for_selector(".chat-bubble.staff .chat-badge", timeout=6000)
        await shot(tr, "05e-widget-discussion")
        assert await st.locator("a[href$='/assistant']").count() == 0, "onglet Assistant retiré"
        await st.goto(URL + f"#/s/{sid}/ressources"); await st.wait_for_selector("details.acc"); await shot(st, "14-ressources")
        await st.goto(URL + f"#/s/{sid}/direct"); await st.wait_for_selector(".mod[data-id]")
        await st.click(".mod[data-id] .check >> nth=0"); await st.wait_for_timeout(800)

        # Formateur : vote, retour sur le cadrage, après
        await tr.click("[data-a='vote']"); await st.wait_for_selector("#liveIn .opt", timeout=5000); await st.click("#liveIn .opt >> nth=0")
        await tr.goto(URL + f"#/admin/s/{sid}/avant"); await tr.wait_for_selector("[data-proj]")
        await shot(tr, "15-formateur-avant")
        await tr.click("[data-proj]"); await tr.wait_for_selector("#fbT"); await tr.fill("#fbT", "Parfait, gardez le corpus aux délibérations publiées."); await tr.click("#fbS")
        await tr.wait_for_timeout(400)
        await tr.goto(URL + f"#/admin/s/{sid}/apres"); await tr.wait_for_selector("#resBox .res-block", timeout=6000)
        await tr.click("[data-att]"); await shot(tr, "16-formateur-apres")
        async with tr.expect_download() as dl:
            await tr.click("#csv")
        csv = await (await dl.value).path()
        txt = open(csv, encoding="utf-8-sig").read()
        assert "Bob Martin" in txt and "validé" in txt, "bilan CSV incomplet"
        await st.goto(URL + f"#/s/{sid}/cadrage"); await st.wait_for_selector(".card.fb"); await shot(st, "17-retour-formateur")
        # Clôture : le stagiaire garde ressources, fiches, exercices, support ; perd discussion, émargement, déroulé
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.wait_for_selector("#closeDay"); await tr.check("#closeDay"); await tr.wait_for_timeout(600)
        await st.goto(URL + f"#/s/{sid}/discussion"); await st.wait_for_url(f"**/#/s/{sid}/ressources", timeout=5000)
        nav = await st.inner_text(".side-nav")
        assert "Discussion" not in nav and "Émargement" not in nav and "Fiches pratiques" in nav and "Support" in nav, "accès réduit après clôture : " + nav
        assert await st.locator("#parcours").count() == 0, "déroulé masqué après clôture"
        await shot(st, "18-stagiaire-apres-cloture")
        await tr.goto(URL + f"#/admin/s/{sid}/apres"); await tr.wait_for_selector("#chatAdm .chat-bubble", timeout=6000)
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.wait_for_selector("#closeDay"); await tr.uncheck("#closeDay"); await tr.wait_for_timeout(600)
        # Équipe : tout effacer dans la discussion
        await tr.click("#chatAdm .chat-clear"); await tr.wait_for_selector("#chatAdm .chat-hint", timeout=6000)
        assert await tr.locator("#chatAdm .chat-bubble").count() == 0, "discussion effacée"

        # Fiches formateurs : création avec aperçu
        await tr.goto(URL + "#/admin/formateurs"); await tr.wait_for_selector(".trainer-card")
        await tr.goto(URL + "#/admin/formateurs/nouveau"); await tr.wait_for_selector("#tF")
        await tr.fill("#tN", "Camille Test"); await tr.locator("#tRoles .rl").first.fill("Journaliste"); await tr.locator("#tRoles .rv").first.fill("Le Média")
        await tr.fill("#tTg", "Je forme **depuis 2020**")
        assert "CAMILLE TEST" in (await tr.inner_text("#tPrev")).upper()
        await tr.click("#tF .draft-save"); await tr.wait_for_url("**/formateurs/*-*")
        await tr.goto(URL + "#/admin/formateurs"); assert await tr.locator(".trainer-card").count() == 2

        # Habillages : ajout d'un centre, couleur d'accent, application à la session
        await tr.goto(URL + "#/admin/reglages"); await tr.wait_for_selector("#skinsCard")
        await tr.click("[data-sugg='INA']"); await tr.wait_for_selector(".skin-row[data-skin]")
        row = tr.locator(".skin-row[data-skin]").first
        await row.locator("[data-hex='accent']").fill("#c2185b"); await row.locator("[data-f='footer']").fill("Formation continue")
        await row.locator("[data-sksave]").click(); await tr.wait_for_timeout(400)
        await shot(tr, "23-habillages")
        await tr.goto(URL + f"#/admin/s/{sid}/reglages"); await tr.wait_for_selector("#gSk")
        await tr.select_option("#gSk", label="INA"); await tr.click("#regF .draft-save"); await tr.wait_for_timeout(500)
        acc = await tr.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()")
        assert acc == "#c2185b", f"accent appliqué attendu, obtenu {acc}"
        # Conducteur : import d'un .md, aperçu, application
        await tr.set_input_files("#condFile", str(pathlib.Path(__file__).parent.parent / "docs/conducteurs/conducteur-test-atelier.md"))
        await tr.wait_for_selector("#condApply"); await shot(tr, "24-conducteur-apercu")
        assert await tr.locator(".cond-table tbody tr").count() == 5
        await tr.click("#condApply"); await tr.wait_for_selector("#condReset:not([hidden])")
        assert "Conducteur importé" in await tr.inner_text("#condSrc")
        await st.goto(URL + f"#/s/{sid}/jour"); await st.wait_for_selector("#parcours")
        ptxt2 = await st.inner_text("#parcours")
        assert "Comprendre la machine" in ptxt2 and "interroger ses propres sources" in ptxt2 and "argent, énergie" not in ptxt2, "parcours stagiaire = conducteur importé"
        acc2 = await st.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()")
        assert acc2 == "#c2185b", "habillage côté stagiaire"
        await shot(st, "25-stagiaire-habille")
        # Retour au déroulé par défaut
        await tr.click("#condReset"); await tr.wait_for_selector("#condReset[hidden]", state="attached")

        # Nouvelle session + duplication
        await tr.goto(URL + "#/admin"); await tr.click("#newBtn"); await tr.fill("#nTitle", "Test · deux jours"); await tr.select_option("#nFmt", "2"); await tr.click("#newForm button[type=submit]")
        await tr.wait_for_selector(".phases"); await tr.goto(URL + "#/admin"); await tr.wait_for_selector("table")
        rows = await tr.locator("tbody tr").count()
        assert rows == 2, f"2 sessions attendues, {rows} trouvées"
        # Duplication depuis la liste : intitulé et dates, copie en brouillon avec réglages et déroulé repris
        await tr.click("tbody tr:has-text('Test · deux jours') [data-dup]"); await tr.wait_for_selector(".modal #dD2")
        await tr.fill("#dT", "Test · deux jours · mars"); await tr.fill("#dD", "2027-03-04"); await tr.fill("#dD2", "2027-03-05")
        await shot(tr, "28-dupliquer"); await tr.click(".modal button[type=submit]")
        await tr.wait_for_url("**/reglages")
        await tr.wait_for_selector("h1:has-text('Test · deux jours · mars')", timeout=6000)
        await tr.goto(URL + "#/admin"); await tr.wait_for_selector("table")
        assert await tr.locator("tbody tr").count() == 3, "copie ajoutée à la liste"

        # Rôles : l'admin ajoute une formatrice, lui crée une fiche et lui attribue une session ; elle ne voit que celle-ci
        await tr.goto(URL + "#/admin/equipe"); await tr.wait_for_selector("#addF")
        await tr.fill("#aMail", "fanny@demo.fr"); await tr.click("#addF button"); await tr.wait_for_selector("text=fanny@demo.fr")
        await shot(tr, "26-equipe")
        await tr.goto(URL + "#/admin/formateurs/nouveau"); await tr.wait_for_selector("#tN")
        await tr.fill("#tN", "Fanny Martin"); await tr.fill("#tLog", "fanny@demo.fr"); await tr.click("#tF .draft-save"); await tr.wait_for_url("**/formateurs/*-*")
        await tr.goto(URL + "#/admin"); await tr.wait_for_selector("#newBtn"); await tr.click("#newBtn")
        await tr.fill("#nTitle", "Session de Fanny"); await tr.select_option("#nTr", label="Fanny Martin"); await tr.click("#newForm button[type=submit]")
        await tr.wait_for_url("**/reglages")
        fp = await ctx.new_page(); watch(fp, "formatrice")
        await fp.goto(URL + "#/formateur"); await fp.wait_for_selector("#gF"); await fp.fill("#gC", "SAMSA-DEMO"); await fp.click("#gF button")
        await fp.wait_for_selector("#mForm"); await fp.fill("#mail", "fanny@demo.fr"); await fp.click("#mForm button"); await fp.wait_for_selector("h1:has-text('Mes sessions')")
        rows = await fp.locator("tbody tr").all_inner_texts()
        assert len(rows) == 1 and "Session de Fanny" in rows[0], f"la formatrice ne voit que sa session : {rows}"
        assert await fp.locator("#newBtn, a[href='#/admin/reglages'], [data-del], select.assign").count() == 0, "pas d'outils d'administration"
        await fp.goto(URL + "#/admin/reglages"); await fp.wait_for_url("**/#/admin")
        await fp.click("tbody tr a"); await fp.wait_for_selector(".phases"); await fp.click("text=Réglages"); await fp.wait_for_selector("#gTr")
        assert await fp.locator("#gTr[disabled]").count() == 1 and await fp.locator("#gSk[disabled]").count() == 1, "attribution et habillage verrouillés"
        await shot(fp, "27-formatrice")
        await fp.close()

        # Code oublié : code temporaire par e-mail, puis nouveau code d'accès
        c2 = await b.new_context(viewport={"width": 1280, "height": 860}); fx = await c2.new_page(); watch(fx, "oubli")
        await fx.goto(URL + "#/formateur"); await fx.wait_for_selector("#gForgot"); await fx.click("#gForgot")
        await fx.fill("#oM", "inconnu@exemple.fr"); await fx.click("#oF button"); await fx.wait_for_selector("#demoOtp"); otp = await fx.inner_text("#demoOtp")
        await fx.fill("#vC", "000000"); await fx.click("#vF button"); await fx.wait_for_selector("#oMsg .warn")
        await fx.fill("#vC", otp); await fx.click("#vF button")
        await fx.wait_for_selector("#sOut"); await shot(fx, "20-adresse-non-declaree"); await fx.click("#sOut")
        await fx.wait_for_selector("#gForgot"); await fx.click("#gForgot")
        await fx.fill("#oM", "formateur@demo.fr"); await fx.click("#oF button"); await fx.wait_for_selector("#demoOtp")
        await shot(fx, "21-code-temporaire")
        await fx.fill("#vC", await fx.inner_text("#demoOtp")); await fx.click("#vF button"); await fx.wait_for_selector("#cF")
        await fx.fill("#c1", "Nouveau-1"); await fx.fill("#c2", "Autre-22"); await fx.click("#cF button"); await fx.wait_for_selector("#cMsg:has-text('diffèrent')")
        await fx.fill("#c2", "Nouveau-1"); await shot(fx, "22-choix-code"); await fx.click("#cF button"); await fx.wait_for_url("**/#/admin")
        await fx.click("#logout"); await fx.evaluate("sessionStorage.clear()"); await fx.goto(URL + "#/formateur"); await fx.wait_for_selector("#gF")
        await fx.fill("#gC", "Nouveau-1"); await fx.click("#gF button"); await fx.wait_for_selector("#gBtn")
        await c2.close()
        await b.close()
    bad = [e for e in errors if "favicon" not in e]
    print("ERREURS :", bad if bad else "aucune")
    print("OK : parcours complet")

asyncio.run(main())
