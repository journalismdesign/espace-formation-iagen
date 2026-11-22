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
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
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
        await tr.goto(URL + "#/formateur"); await tr.wait_for_selector("#gBtn")
        await shot(tr, "01-connexion")
        await tr.click("#asTrainer"); await tr.wait_for_selector("text=Démarrer une session")
        await shot(tr, "02-sessions")
        await tr.click("table a"); await tr.wait_for_selector(".phases")
        sid = tr.url.split("/admin/s/")[1].split("/")[0]
        # Réglages : horaires, émargement, support
        await tr.goto(URL + f"#/admin/s/{sid}/reglages"); await tr.wait_for_selector("#regF")
        await tr.fill("#gE", "17:30"); await tr.fill("#gEm", "https://exemple.fr/emargement-qualiopi")
        await tr.wait_for_selector("#emPrev img"); await tr.click("#regF button[type=submit]"); await tr.wait_for_timeout(500)
        await shot(tr, "02b-reglages")
        await tr.goto(URL + f"#/admin/s/{sid}/avant"); await tr.wait_for_selector("#invF")
        await tr.fill("#invT", "alice@demo.fr"); await tr.click("#invF button"); await tr.wait_for_timeout(300)
        await tr.goto(URL + "#/admin/reglages"); await tr.wait_for_selector("#bF"); await shot(tr, "02c-reglages-generaux")

        # Stagiaire : slide de titre → prénom + e-mail → code → émargement → support → tableau de bord
        st = await ctx.new_page(); watch(st, "stagiaire")
        await st.goto(URL + "#/join/DEMO42"); await st.wait_for_selector(".slide-page.title")
        await shot(st, "03a-slide-titre")
        await st.click("#go"); await st.wait_for_selector("#reqF")
        await st.fill("#fn", "Bob"); await st.fill("#em", "bob@demo.fr"); await st.click("#reqF button")
        await st.wait_for_selector(".demo-code b"); code = (await st.inner_text(".demo-code b")).strip()
        await st.fill("#cd", "ZZZZZZ"); await st.click("#codeF button"); await st.wait_for_timeout(300)  # mauvais code refusé
        assert await st.locator("#codeF").count() == 1
        await st.fill("#cd", code); await st.click("#codeF button")
        await st.wait_for_selector(".slide-qr"); await shot(st, "03b-emargement")
        await st.click("#next"); await st.wait_for_selector(".lockbox"); await shot(st, "03c-support-verrouille")
        await st.click("#next"); await st.wait_for_selector(".side"); await shot(st, "03-stagiaire-direct-attente")

        # Formateur : Jour J, pilote la slide de titre puis une séquence et une page du support
        await tr.goto(URL + f"#/admin/s/{sid}/jour"); await tr.wait_for_selector("#opening")
        await tr.click("[data-view='title']"); await tr.wait_for_selector("#preview .deck-slide.dark .samsa.big")
        await st.wait_for_selector("#liveCard h3:has-text('Bienvenue')", timeout=5000)
        await tr.click("[data-em='j1-matin']"); await tr.wait_for_selector("#preview .ds-qrbig img")
        await st.wait_for_selector("#liveCard h3:has-text('Émargement')", timeout=5000)
        assert "présenté" in await tr.inner_text("[data-em='j1-matin']"), "l'émargement du matin doit être marqué comme présenté"
        assert await tr.locator("[data-em='j1-aprem']").count() == 1, "créneau d'émargement de l'après-midi attendu"
        await tr.click("[data-mod='j1-comprendre']"); await tr.wait_for_selector("[data-page]")
        await tr.click("[data-page] >> nth=2"); await tr.wait_for_selector("#preview iframe")
        await st.wait_for_selector("#liveCard:has-text('page')", timeout=5000)
        await shot(tr, "05a-formateur-pilotage"); await shot(st, "04a-stagiaire-sequence")
        await st.wait_for_timeout(800); ptxt = await st.inner_text("#parcours")
        assert "En ce moment" in ptxt or "EN CE MOMENT" in ptxt, "la séquence pilotée doit être signalée"
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

        # Stagiaire : cadrage complet
        await st.goto(URL + f"#/s/{sid}/cadrage"); await st.wait_for_selector("section.cad")
        await st.fill("#pName", "Bob Martin")
        await st.click("[data-chips=metier] .pick >> nth=0"); await st.click("[data-chips=niveau] .pick >> nth=1"); await st.click("[data-chips=outils] .pick >> nth=0")
        await st.click("#modes .pick >> nth=2")
        await st.fill("#cBesoin", "Je lis chaque semaine les délibérations du conseil municipal, des PDF de 80 pages.")
        await st.click("#genP"); await st.wait_for_selector("#pistes .piste", timeout=5000)
        await st.click("#pistes .piste >> nth=0"); await st.wait_for_timeout(300)
        await st.click("#rSens .pick >> nth=0")
        await st.click("#anaBtn"); await st.wait_for_selector(".analysis", timeout=5000)
        await st.wait_for_timeout(1200)
        await shot(st, "09-cadrage")
        await st.click("#cVal"); await st.wait_for_timeout(600)
        assert "Projet validé" in await st.inner_text("#cadAside"), "le projet doit être validé"
        await st.evaluate("window.scrollTo(0,0)"); await shot(st, "10-cadrage-valide")

        # Stagiaire : mon espace, fiches, discussion, assistant, ressources
        await st.goto(URL + "#/"); await st.wait_for_selector(".prep-square"); await shot(st, "11-mon-espace")
        assert "100" in await st.inner_text(".prep-square")
        await st.goto(URL + f"#/s/{sid}/fiches"); await st.wait_for_selector(".fcard"); await shot(st, "12-fiches")
        await st.click(".fcard >> nth=0"); await st.wait_for_selector("article");
        await st.goto(URL + f"#/s/{sid}/discussion/new"); await st.fill("#tTitle", "Gemini garde-t-il mes documents ?"); await st.click("#newT button")
        await st.wait_for_selector("#reply"); await st.fill("#rBody", "Question pour la pause."); await st.click("#reply button"); await st.wait_for_selector(".post")
        await st.goto(URL + f"#/s/{sid}/assistant"); await st.click("[data-s] >> nth=0"); await st.wait_for_selector(".msg.a .ref", timeout=5000); await shot(st, "13-assistant")
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

        # Nouvelle session + duplication
        await tr.goto(URL + "#/admin"); await tr.click("#newBtn"); await tr.fill("#nTitle", "Test · deux jours"); await tr.select_option("#nFmt", "2"); await tr.click("#newForm button[type=submit]")
        await tr.wait_for_selector(".phases"); await tr.goto(URL + "#/admin"); await tr.wait_for_selector("table")
        rows = await tr.locator("tbody tr").count()
        assert rows == 2, f"2 sessions attendues, {rows} trouvées"
        await b.close()
    bad = [e for e in errors if "favicon" not in e]
    print("ERREURS :", bad if bad else "aucune")
    print("OK : parcours complet")

asyncio.run(main())
