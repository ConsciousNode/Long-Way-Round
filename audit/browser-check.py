import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1300,'height':1500})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('file://../delivery-1/long-way-round.html')
        res={}
        for preset in ['preset-sample','preset-max','preset-cancel','preset-zero']:
            await pg.click('#'+preset); await pg.click('#go-btn'); await pg.wait_for_timeout(2500)
            res[preset]={'answer':await pg.inner_text('#final-answer'),'status':await pg.inner_text('#answer-status'),'note':await pg.inner_text('#answer-note')}
        await pg.click('#preset-sample'); await pg.click('#go-btn'); await pg.wait_for_timeout(4000)
        await pg.screenshot(path='../audit/browser-sample.png', full_page=True)
        res['errors']=errs
        print(json.dumps(res, ensure_ascii=False, indent=1))
        await b.close()
asyncio.run(main())
