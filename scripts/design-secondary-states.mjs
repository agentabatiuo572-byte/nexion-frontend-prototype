// Focused post-review evidence for the changed Team failure and wallet states.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './lib/design-review-fixture.mjs';
import {installFormalProbeSession} from './lib/formal-probe-session.mjs';
import {directAppUrl} from './lib/direct-app-url.mjs';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:5190';
const out=path.resolve(process.env.DESIGN_OUTPUT||'../uvel-design-preview/evidence');
await mkdir(out,{recursive:true});
const browser=await chromium.launch(),records=[],errors=[];
try {
 for(const width of [320,390]) for(const locale of ['zh','en','vi']) for(const theme of ['dark','light']) {
  const context=await browser.newContext({viewport:{width,height:1100},colorScheme:theme,reducedMotion:'reduce'});
  const page=await context.newPage(),state={offers:true,messages:false};
  page.on('pageerror',error=>errors.push(error.message));
  await installFormalProbeSession(page,{responseFor:(url,request)=>fixture(url,locale,state,request)});
  await page.addInitScript(({locale,theme})=>{
   localStorage.setItem('nexgrid-locale-v1',JSON.stringify({type:'object',data:{code:locale,userSet:true}}));
   localStorage.setItem('nexgrid-theme-v1',JSON.stringify({type:'object',data:{mode:theme}}));
  },{locale,theme});
  for(const name of ['team','me']) {
   await page.goto(directAppUrl(base,`/pages/${name}/${name}`),{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);
   if(name==='team') {
    await page.locator('.invite-card__unavailable').waitFor();
    assert.equal(await page.locator('.nx-invite-actions').count(),0);
    assert.equal(await page.locator('.invite-card__history').count(),0);
    const box=await page.locator('.invite-card').boundingBox();
    assert.ok(box.height<180,'Missing invitation code uses a compact retry card');
    await page.locator('.invite-card__unavailable .invite-card__retry').press('Enter');
    await page.locator('.invite-card__unavailable [aria-busy=false]').waitFor();
   } else {
    await page.locator('.nx-wallet-summary').waitFor();
    assert.equal(await page.locator('.nx-wallet-summary .nx-wallet-details').count(),1);
    assert.equal(await page.locator('.nx-wallet-summary .nx-wallet-bills').count(),1);
   }
   await page.screenshot({animations:'disabled',path:path.join(out,`${width}-${locale}-${theme}-${name}-final.png`)});
  }
  records.push({width,locale,theme});await context.close();console.log(`PASS secondary ${width}-${locale}-${theme}`);
 }
}finally {await browser.close();await writeFile(path.join(out,'secondary-report.json'),JSON.stringify({frontendFixtureOnly:true,records,errors},null,2));}
assert.equal(errors.length,0);assert.equal(records.length,12);
