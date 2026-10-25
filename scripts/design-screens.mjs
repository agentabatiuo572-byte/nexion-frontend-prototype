// Static visual evidence using the isolated review fixture; never a live-service claim.
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installFormalProbeSession } from './lib/formal-probe-session.mjs';
import { directAppUrl } from './lib/direct-app-url.mjs';
import { fixture } from './lib/design-review-fixture.mjs';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:5190';
const out=process.env.DESIGN_OUTPUT||path.resolve('../uvel-design-preview/evidence');
await mkdir(out,{recursive:true});
const routes={home:['index/index',1660,'.vb-card'],rank:['team/rank',2200,'.rank-row-heading'],courses:['learn/courses',1180,'.course-feature'],messages:['me/notifications?section=notifications',920,'.notification-row'],store:['store/store',1620,'.product-card'],checkout:['store/checkout?product=stellarbox-s1',1320,'.checkout-product']};
const browser=await chromium.launch(),records=[];
try {
 for (const width of [390,320]) {
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage(),state={offers:true,messages:true,read:false};
  await installFormalProbeSession(page,{responseFor:url=>fixture(url,'zh',state)});
  await page.addInitScript(()=>{localStorage.setItem('nexgrid-locale-v1',JSON.stringify({type:'object',data:{code:'zh',userSet:true}}));localStorage.setItem('nexgrid-theme-v1',JSON.stringify({type:'object',data:{mode:'dark'}}));});
  for(const name of (process.env.DESIGN_SCREENS||Object.keys(routes).join(',')).split(',')) {
   const [route,height,anchor]=routes[name];
   await page.setViewportSize({width,height});
   await page.goto(directAppUrl(base,'/pages/'+route),{waitUntil:'networkidle'});
   await page.locator(anchor).first().waitFor();
   if(name==='home') await page.locator('.nx-device-row').first().waitFor();
   if(name==='store') await page.locator('.upgrade-spotlight[data-images-ready="true"]').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>Array.from(document.querySelectorAll("img")).every(img=>img.complete));
   await page.screenshot({animations:'disabled',path:path.join(out,`${width}-zh-dark-${name}-full.png`)});
   records.push({width,name,theme:await page.evaluate(()=>document.documentElement.dataset.theme),box:await page.locator(anchor).first().evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,background:getComputedStyle(el).backgroundColor,surface:getComputedStyle(el).getPropertyValue('--ui-content-surface')}))});
   if(name==='home') await page.locator('.home-benefits').screenshot({animations:'disabled',path:path.join(out,`${width}-zh-dark-benefits.png`)});
  }
  await context.close();
 }
}finally{await browser.close();}
await writeFile(path.join(out,'screen-metrics.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify(records,null,2));
