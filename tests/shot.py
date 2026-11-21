import asyncio, pathlib, os
HERE = pathlib.Path(__file__).resolve().parent
URL = (HERE.parent / "index.html").as_uri()
os.chdir(HERE)
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width":1280,"height":900})
        errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append("console:"+m.text) if m.type=="error" else None)
        await pg.goto(URL)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="s1.png", full_page=False)
        # open notebook module
        await pg.click(".mod[data-id='j1-notebook'] .mhead")
        await pg.click(".mod[data-id='j1-notebook'] [data-startquiz]")
        await pg.click(".mod[data-id='j1-notebook'] .qq[data-i='0'] .opt >> nth=1")
        await pg.locator(".mod[data-id='j1-notebook']").scroll_into_view_if_needed()
        await pg.screenshot(path="s2.png")
        await pg.click(".seg button[data-fmt='2']")
        await pg.wait_for_timeout(200)
        await pg.screenshot(path="s3.png")
        await pg.goto(URL+"#ressources"); await pg.wait_for_timeout(300)
        await pg.click("[data-fiche='mcp']"); await pg.wait_for_timeout(400)
        await pg.screenshot(path="s4.png")
        await pg.keyboard.press("Escape")
        await pg.goto(URL+"#outils"); await pg.wait_for_timeout(300)
        await pg.fill("#toolRmctf [data-k='R']","Tu es SR"); 
        await pg.screenshot(path="s5.png", full_page=True)
        await pg.goto(URL+"#direct"); await pg.wait_for_timeout(300)
        await pg.click("#trainerBox summary"); await pg.check("#isTrainer"); await pg.click("[data-p='niveau']")
        await pg.click("#liveAct .opt >> nth=2")
        await pg.screenshot(path="s6.png", full_page=True)
        await pg.goto(URL+"#assistant"); await pg.wait_for_timeout(300)
        await pg.click("#sugg .chip >> nth=0"); await pg.wait_for_timeout(200)
        await pg.screenshot(path="s7.png")
        print("ERRORS:", errs)
        await b.close()
asyncio.run(main())
