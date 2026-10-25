// Additional state evidence, entirely isolated from live account services.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fixture } from './lib/design-review-fixture.mjs';
import { installFormalProbeSession } from './lib/formal-probe-session.mjs';
import { directAppUrl } from './lib/direct-app-url.mjs';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:5190',out=path.resolve(process.env.DESIGN_OUTPUT||'../uvel-design-preview/evidence');
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
try {
 for(const width of [390,320]) {
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'}),page=await context.newPage(),state={offers:true,messages:true,read:false};
  await installFormalProbeSession(page,{responseFor:url=>fixture(url,'zh',state)});
  await page.addInitScript(()=>{localStorage.setItem('nexgrid-locale-v1',JSON.stringify({type:'object',data:{code:'zh',userSet:true}}));localStorage.setItem('nexgrid-theme-v1',JSON.stringify({type:'object',data:{mode:'dark'}}));});
  const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({animations:'disabled',path:path.join(out,`${width}-zh-dark-${name}.png`)});};
  let release;const held=new Promise(r=>release=r);
  await page.route('**/api/config/v-ranks*',async route=>{await held;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'OK',data:{}})});});
  await page.goto(directAppUrl(base,'/pages/team/rank'),{waitUntil:'domcontentloaded'});
  await page.locator('.rank-state[aria-busy=true]').waitFor();await shot('rank-loading');release();
  await page.locator('.rank-state[role=button]').waitFor({timeout:7000}).catch(async error=>{await shot('rank-diagnostic');console.log(await page.locator('body').innerText());throw error;});await shot('rank-error');
  await page.unroute('**/api/config/v-ranks*');
  await page.locator('.rank-state[role=button]').focus();await page.keyboard.press('Enter');
  await page.locator('.rank-spotlight').waitFor();
  state.highestRank=true;
  await page.reload({waitUntil:'networkidle'});await page.locator('#rank-details-8').waitFor();
  assert.equal(await page.locator('.rank-next-progress').count(),0);await shot('rank-highest');await page.setViewportSize({width,height:2200});await shot('rank-highest-full');await page.setViewportSize({width,height:844});
  await page.goto(directAppUrl(base,'/pages/me/notifications?section=notifications'),{waitUntil:'networkidle'});
  await page.locator('.notification-row').first().click();await page.locator('.notification-detail').waitFor();await shot('messages-expanded');
  const service=page.locator('.message-primary [role=tab]').filter({hasText:'服务'});await service.click();await page.locator('.service-messages').waitFor();assert.equal(await service.getAttribute('aria-selected'),'true');assert.equal(await page.locator('.notification-feed').count(),0);await shot('messages-service');
  state.promotions=true;
  await page.goto(directAppUrl(base,'/pages/index/index'),{waitUntil:'networkidle'});
  await page.locator('.entry-advert').waitFor();await page.locator('.entry-advert').scrollIntoViewIfNeeded();
  await page.locator('.entry-advert').screenshot({animations:'disabled',path:path.join(out,`${width}-zh-dark-promotion.png`)});
  await page.locator('.entry-home-deadline').click();await page.locator('[role=dialog]').waitFor();await shot('promotion-rules');
  await context.close();console.log(`PASS state evidence ${width}`);
 }
}finally{await browser.close();}
