import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv.find(v => v.startsWith('--stage='))?.split('=')[1] ?? 'integration';
const out = resolve(root, '.codex-runtime/liquid-glass', stage);
await mkdir(out, { recursive: true });
const server = await ensureServer({ root, reuseUrl: process.env.LIQUID_GLASS_BASE_URL, log: console.log });
const browser = await chromium.launch();
const errors = [], cases = [], evidence = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
for (const prefix of ['tcs','vcs']) {
  await page.addLocatorHandler(page.locator(`.${prefix}-root:visible`), async () => {
    await page.locator(`.${prefix}-dismiss:visible,.${prefix}-close:visible`).first().click();
  });
}
const active = () => page.locator('.nx-chassis:visible').last();
const nav = () => active().locator('.nx-tabbar-pill');
const options = rail => rail.locator(':scope > .nx-glass-option');
async function settled() { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function closeTransient() {
  for (const s of ['.tcs-dismiss', '.vcs-dismiss', '.tcs-close', '.vcs-close']) {
    const el = page.locator(s).filter({ visible: true }).first();
    if (await el.count()) await el.click();
  }
}
async function goto(route) {
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.nx-chassis:visible,.cp-root:visible').first().waitFor();
  await closeTransient();
}
async function settings(locale, theme) {
  await page.evaluate(async ({locale,theme}) => {
    (await import('/src/store/locale.ts')).useLocaleStore().setLocale(locale);
    (await import('/src/store/theme.ts')).useTheme().setMode(theme);
  }, {locale,theme});
  await settled();
}
async function aligned(rail) {
  await rail.locator('.nx-glass-indicator').waitFor();
  await page.waitForFunction(id => {
    const el=document.getElementById(id), item=el?.querySelector(':scope > [data-selected="true"]'), lens=el?.querySelector(':scope > .nx-glass-indicator');
    if(!item || !lens || getComputedStyle(lens).visibility!=='visible' || el.dataset.glassMoving==='true') return false;
    const a=item.getBoundingClientRect(),b=lens.getBoundingClientRect();
    return Math.max(Math.abs(a.left-b.left),Math.abs(a.top-b.top),Math.abs(a.width-b.width),Math.abs(a.height-b.height))<=1.6;
  }, await rail.getAttribute('id'));
  const result = await rail.evaluate(el => {
    const item = el.querySelector(':scope > [data-selected="true"]'), lens = el.querySelector(':scope > .nx-glass-indicator');
    const a = item.getBoundingClientRect(), b = lens.getBoundingClientRect();
    return { delta: Math.max(Math.abs(a.left-b.left),Math.abs(a.top-b.top),Math.abs(a.width-b.width),Math.abs(a.height-b.height)), height: a.height, strategy: lens.dataset.glassStrategy };
  });
  assert.ok(result.delta <= 1.6, `selection geometry: ${JSON.stringify(result)}`);
  assert.ok(result.height >= 44, `touch target ${result.height}`);
  return result;
}
function log(id, data) { cases.push({id,...data}); console.log(`PASS ${id}`); }

let passed = false;
try {
  await goto('earn/earn');
  await settings('zh','dark');
  const earn = active().locator('.nx-glass-segments--filter').first();
  assert.equal(await options(earn).count(),4);
  for (const value of ['Week','Month','All','Today']) {
    await earn.locator(`[data-glass-value="${value}"]`).click();
    assert.equal(await earn.locator('[data-selected="true"]').getAttribute('data-glass-value'),value);
    await aligned(earn);
  }
  await earn.locator('[data-glass-value="Week"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await earn.locator('[data-selected="true"]').getAttribute('data-glass-value'),'Week');
  await aligned(earn);
  log('earn-selection-keyboard',{ count:4 });

  for (const key of ['store','team','me','home','earn']) {
    await nav().locator(`[data-glass-value="${key}"]`).click();
    await page.waitForURL(url=> key === 'home' ? /#\/$|#\/pages\/index\/index/.test(url.href) : url.hash === `#/pages/${key}/${key}`);
    await closeTransient();
    assert.equal(await nav().locator('[aria-current="page"]').getAttribute('data-glass-value'),key);
    await aligned(nav());
    log('navigation-'+key,{ url:page.url() });
  }
  await active().locator('.nx-content').evaluate(el=>el.scrollTop=480);
  await nav().locator('[aria-current="page"]').click();
  await page.waitForFunction(()=> [...document.querySelectorAll('.nx-chassis')].filter(el=>el.getBoundingClientRect().width && getComputedStyle(el).display!=='none').at(-1)?.querySelector('.nx-content')?.scrollTop < 2);
  log('repeat-navigation-scroll-top',{});

  for (const width of [320,390]) for (const locale of ['zh','en','vi']) for (const theme of ['dark','light']) {
    await page.setViewportSize({width,height:844}); await settings(locale,theme);
    const filter = active().locator('.nx-glass-segments--filter').first();
    const geometry = await aligned(filter); await aligned(nav());
    const labels = await nav().locator('.nx-tab__label').evaluateAll(els=>els.map(e=>({text:e.textContent,overflow:e.scrollWidth>e.clientWidth+1,width:e.getBoundingClientRect().width})));
    assert.ok(labels.every(l=>!l.overflow),JSON.stringify(labels));
    log(`matrix-${width}-${locale}-${theme}`,{geometry,labels});
  }

  await page.setViewportSize({width:390,height:844}); await settings('zh','dark');
  await nav().locator('.nx-glass-track[data-glass-strategy="svg"]').waitFor();
  await page.evaluate(()=> {
    const root=[...document.querySelectorAll('.nx-chassis')].filter(el=>el.getBoundingClientRect().width).at(-1);
    const test=document.createElement('div');test.id='glass-optical-test';
    test.style.cssText='position:absolute;inset:0;z-index:29;pointer-events:none;background:repeating-linear-gradient(90deg,red 0 24px,blue 24px 48px,lime 48px 72px)';root.append(test);
  });
  await settled();
  const clip=await nav().boundingBox();
  const refracted=await page.screenshot({clip});
  const scale=await nav().locator('.nx-glass-track feDisplacementMap').getAttribute('scale');
  assert.ok(Number(scale)>0);
  await nav().locator('.nx-glass-track feDisplacementMap').evaluate(el=>el.setAttribute('scale','0'));
  await settled();const flat=await page.screenshot({clip});
  const changed=await page.evaluate(async({a,b})=>{
    async function pixels(src){const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,c.width,c.height).data;}
    const x=await pixels(a),y=await pixels(b);let count=0;for(let i=0;i<x.length;i+=4)if(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])>18)count++;return count/(x.length/4);
  },{a:'data:image/png;base64,'+refracted.toString('base64'),b:'data:image/png;base64,'+flat.toString('base64')});
  assert.ok(changed>.005,`No visible optical displacement: ${changed}`);
  await nav().locator('.nx-glass-track feDisplacementMap').evaluate((el,value)=>el.setAttribute('scale',value),scale);
  await page.evaluate(()=>document.getElementById('glass-optical-test').remove());
  await writeFile(resolve(out,'optics-refracted.png'),refracted);await writeFile(resolve(out,'optics-zero-displacement.png'),flat);
  log('actual-optical-pixel-difference',{changed,scale});

  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=active().locator('.nx-glass-segments--filter').first();
  await reduced.locator('[data-glass-value="All"]').click();await settled();
  assert.equal(await reduced.locator('.nx-glass-indicator').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length),0);
  log('reduced-motion',{});await page.emulateMedia({reducedMotion:'no-preference'});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  await nav().locator('.nx-glass-track[data-glass-strategy="solid"]').waitFor();
  log('reduced-transparency',{});
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});await cdp.detach();

  if (stage !== 'foundation') {
    const routes=['index/index','earn/earn','me/wallet-bills','me/wallet-topup','market/market','team/leaderboard','events/events','developer/developer','genesis/marketplace','me/proof','me/receipts','me/help','me/notifications','me/support-tickets','team/commissions','team/unilevel','support/messages'];
    for (const route of routes) {
      await goto(route);await settings('zh','dark');
      const rails=active().locator('.nx-glass-segments--filter');
      const count=await rails.count();
      assert.ok(count>0,`Missing selector on ${route}`);
      for (const rail of await rails.all()) {
        const items=options(rail); const length=await items.count();assert.ok(length>0);
        if(length>1)await items.nth(1).click();await aligned(rail);
        await items.first().click();await aligned(rail);
      }
      await page.screenshot({path:resolve(out,route.replaceAll('/','-')+'.png')});
      log('selector-'+route,{count});
    }
    // Conditional visual fixtures stay in this isolated browser context. No
    // purchase action or persistent remote data is written.
    await goto('genesis/marketplace');
    await page.evaluate(async()=>{
      const genesis=(await import('/src/store/genesis.ts')).useGenesis();
      window.__glassListings=genesis.remoteListings;
      genesis.remoteListings=[
        {tokenId:101,holdingNo:'glass-probe-a',priceUSDT:200,seller:'0xA',listedAt:2},
        {tokenId:102,holdingNo:'glass-probe-b',priceUSDT:100,seller:'0xB',listedAt:1},
      ];
    });
    const sortRail=active().locator('.nx-glass-segments').filter({has:page.locator('[data-glass-value="floor"]')});
    for(const value of ['recent','lastSale','floor']){
      await sortRail.locator(`[data-glass-value="${value}"]`).click();await aligned(sortRail);
      assert.equal(await sortRail.locator('[data-selected="true"]').getAttribute('data-glass-value'),value);
    }
    await page.evaluate(async()=>{(await import('/src/store/genesis.ts')).useGenesis().remoteListings=window.__glassListings;delete window.__glassListings;});
    await sortRail.waitFor({state:'hidden'});
    log('conditional-market-sort',{choices:3});
    for(const surface of ['page','drawer']){
      await goto(surface==='page'?'me/notifications':'earn/earn');
      if(surface==='drawer')await active().locator('.nx-bell').click();
      const filter=surface==='page'?active().locator('.nx-glass-segments--filter'):page.locator('.md-panel:visible .nx-glass-segments');
      await page.evaluate(async()=>{
        const s=(await import('/src/store/notifications.ts')).useNotifications();window.__glassNotifs=s.items;
        s.items=[{id:'glass-count-probe',kind:'market',priority:'normal',title:'probe',ts:Date.now(),readAt:null}];
      });
      await filter.locator('[data-glass-value="market"]').click();await aligned(filter);
      await page.evaluate(async()=>(await import('/src/store/notifications.ts')).useNotifications().items=[]);
      await filter.locator('[data-glass-value="market"]').waitFor({state:'hidden'});
      assert.equal(await filter.locator('[data-selected="true"]').getAttribute('data-glass-value'),'all');
      await aligned(filter);
      await page.evaluate(async()=>{(await import('/src/store/notifications.ts')).useNotifications().items=window.__glassNotifs;delete window.__glassNotifs;});
      if(surface==='drawer')await page.locator('.md-panel:visible .md-close').click();
      log('notification-empty-category-'+surface,{});
    }
    await goto('earn/earn');
    await active().locator('.nx-bell').click();
    const drawer=page.locator('.md-panel:visible');await drawer.waitFor();
    const rail=drawer.locator('.nx-glass-segments');assert.ok(await rail.count());await aligned(rail);
    log('message-drawer',{});
    await drawer.locator('.md-close').click();
    await goto('me/me');
    assert.ok(await page.locator('.nx-chassis:visible').count());
    for (const theme of ['light','dark','system']) {
      await active().locator('[data-quick-key="theme"]').click();
      const themeRail=page.locator('.nx-theme-options:visible');
      await aligned(themeRail);
      await themeRail.locator(`[data-glass-value="${theme}"]`).focus();
      await page.keyboard.press('Space');
      await themeRail.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(async()=>(await import('/src/store/theme.ts')).useTheme().mode),theme);
      await page.reload();await active().waitFor();await closeTransient();
      assert.equal(await page.evaluate(async()=>(await import('/src/store/theme.ts')).useTheme().mode),theme);
    }
    log('theme-picker-persisted',{modes:3});
    await active().locator('[data-quick-key="theme"]').focus();await page.keyboard.press('Enter');
    await page.locator('.nx-theme-options [data-glass-value="system"]').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('.nx-theme-dialog')));
    await page.keyboard.press('Escape');await page.locator('.nx-theme-options').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-quick-key')),'theme');
    log('theme-keyboard-cancel',{});
    await goto('team/team');await settings('zh','dark');
    await active().locator('.nx-invite-actions > uni-view').first().focus();await page.keyboard.press('Space');
    const poster=page.locator('.ps-sheet:visible');await poster.waitFor();
    const templateRail=poster.locator('.ps-thumbs');
    for(const item of await options(templateRail).all()) {
      await item.click();await aligned(templateRail);
      await poster.locator('.ps-preview__img').waitFor();
      await page.waitForFunction(()=>!!document.querySelector('.ps-preview__img img')?.complete);
    }
    const posterPath=resolve(out,'poster-template.png');await page.screenshot({path:posterPath});evidence.push(posterPath);
    log('poster-template-preview',{templates:await options(templateRail).count()});
    await templateRail.locator('[data-glass-value="yield"]').click();
    await page.evaluate(async()=>{
      const app=(await import('/src/store/app.ts')).useApp();window.__glassDevices=app.devices;app.devices=[];
    });
    await page.waitForFunction(()=>!document.querySelector('.ps-thumbs [data-glass-value="yield"]'));
    assert.equal(await options(templateRail).count(),2);
    assert.equal(await templateRail.locator('[data-selected="true"]').getAttribute('data-glass-value'),'gift');
    await aligned(templateRail);
    await page.evaluate(async()=>{(await import('/src/store/app.ts')).useApp().devices=window.__glassDevices;delete window.__glassDevices;});
    log('poster-no-devices-fallback',{templates:2});
    await page.keyboard.press('Escape');await poster.waitFor({state:'hidden'});
    assert.ok(await page.evaluate(()=>document.activeElement===document.querySelector('.nx-invite-actions > uni-view')));
    await goto('earn/earn');await active().locator('.nx-nova-bubble').click();
    await page.waitForURL(/pages\/support\/messages/);
    await active().locator('[data-glass-value="ai"]').click();
    await active().locator('.nx-conv-row').first().click();
    await page.waitForURL(/pages\/support\/chat/);
    await page.locator('.cp-back').focus();await page.keyboard.press('Enter');
    await page.waitForURL(/pages\/support\/messages/);
    log('nova-and-chat-return',{});
    await goto('me/wallet-bills');await page.reload({waitUntil:'domcontentloaded'});await active().waitFor();
    await active().locator('.spv-back').focus();await page.keyboard.press('Space');
    await page.waitForURL(/#\/pages\/me\/wallet$/);
    log('subpage-keyboard-back',{});
  }

  if (stage === 'integration') {
    await goto('index/index');
    for (const width of [320,390]) for (const locale of ['zh','en','vi']) {
      await page.setViewportSize({width,height:844}); await settings(locale,'dark');
      const entries=active().locator('.nx-glass-action[role="link"]');
      const boxes=await entries.evaluateAll(els=>els.map(el=>{
        const r=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
        return {x:r.x,right:r.right,width:r.width,height:r.height,parentRight:parent.right,overflow:el.scrollWidth>el.clientWidth+1};
      }));
      assert.equal(boxes.length,4);
      assert.ok(boxes.every((b,i)=>b.width>=44 && b.height>=44 && b.right<=b.parentRight+1 && !b.overflow && (!i || b.x>=boxes[i-1].right)),JSON.stringify(boxes));
      log(`home-shortcuts-${width}-${locale}`,{boxes});
    }
    await page.setViewportSize({width:390,height:844}); await settings('zh','dark');
    const source=await readFile(resolve(root,'src/pages.json'),'utf8');
    const routes=[...source.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map(m=>m[1]);
    for(const route of routes) {
      await page.goto(`${server.baseUrl}/?nx_device_inner=1&glass_route=${encodeURIComponent(route)}#/${route}`,{waitUntil:'domcontentloaded'});
      // The existing disabled compute-sharing route deliberately redirects.
      const expected=route==='pages/compute-share/download'?'pages/me/devices':route;
      await page.waitForFunction(route=>getCurrentPages().at(-1)?.route===route,expected);
      await page.locator('uni-page-body').last().waitFor({state:'attached'});
      await page.waitForFunction(()=>document.querySelector('uni-page-body')?.textContent?.trim().length>0);
      await closeTransient(); await settled();
      const surfaces=await page.locator('uni-page-body').last().locator('.nx-glass-card,.nx-glass-sheet,.nx-glass-action').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{
        const s=getComputedStyle(el,el.classList.contains('nx-glass-action')?'::before':null);
        return {text:el.textContent?.trim().slice(0,70),radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundImage};
      }));
      assert.ok(surfaces.every(s=>s.shadow!=='none' && parseFloat(s.radius)>0),`Missing content material ${route}: ${JSON.stringify(surfaces)}`);
      const shot=resolve(out,'route-'+route.replaceAll('/','-')+'.png');
      await page.screenshot({path:shot}); evidence.push(shot);
      log('route-'+route,{actualRoute:expected,textLength:(await page.locator('uni-page-body').last().innerText()).length,surfaces});
    }
  }
  await goto('earn/earn');await page.reload({waitUntil:'domcontentloaded'});await active().waitFor();
  await closeTransient();await settings('zh','dark');await page.waitForTimeout(1800);
  for(const theme of ['dark','light']){await settings('zh',theme);const path=resolve(out,`earn-${theme}.png`);await page.screenshot({path});evidence.push(path);}
  assert.deepEqual(errors,[]);
  passed=true;
} finally {
  const ids=stage==='foundation'?['glass-material-navigation']:stage==='rollout'?['glass-selector-coverage','glass-auxiliary-feedback']:['glass-integrated-runtime'];
  const report={at:new Date().toISOString(),verdict:passed?'pass':'fail',mode:'full',treeMoved:false,capability:'runtime',taskId:process.env.WORKFLOW_TASK_ID,stepId:process.env.WORKFLOW_STEP_ID,checkId:process.env.WORKFLOW_CHECK_ID,runId:process.env.WORKFLOW_RUN_ID,repo:process.env.WORKFLOW_REPO??root,snapshotHash:process.env.WORKFLOW_SNAPSHOT_HASH,innerSkipped:0,steps:ids.map(id=>({id,status:passed?'pass':'fail',verdict:passed?'pass':'fail',evidence:[resolve(out,'result.json'),...evidence]})),cases,errors};
  await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2));
  if(process.env.WORKFLOW_RUN_ID){const target=resolve(process.env.USERPROFILE,'.codex/workflow-runs/uvel-liquid-glass-20260927',`${stage}-runtime.json`);await writeFile(target,JSON.stringify(report,null,2));}
  await browser.close();server.stop();
}
