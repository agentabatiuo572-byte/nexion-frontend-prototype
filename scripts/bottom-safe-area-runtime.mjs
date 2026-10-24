import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { identify } from './lib/dev-server-pool.mjs';
import { treeFingerprint } from './lib/verify-scope.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sessions = new WeakMap();
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const settleMotion = page => page.evaluate(async () => {
  // Await short entrance transitions; long-running decorative effects are not readiness.
  const entrance = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().endTime <= 2500);
  await Promise.all(entrance.map(a => a.finished.catch(() => {})));
});
function abortCheck() { if (process.env.WORKFLOW_ABORT_FILE && existsSync(process.env.WORKFLOW_ABORT_FILE)) throw Error('Workflow aborted'); }
async function safeArea(page, bottom) {
  let session=sessions.get(page);
  if(!session) {session=await page.context().newCDPSession(page);sessions.set(page,session);}
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom } });
  await settle(page);
  const actual=await page.evaluate(()=>{const e=document.createElement('div');e.style.paddingBottom='env(safe-area-inset-bottom, 0px)';document.body.append(e);const n=parseFloat(getComputedStyle(e).paddingBottom);e.remove();return n;});
  assert.equal(actual,bottom,'Real browser safe-area override');
}
async function measure(locator) {
  return locator.evaluate(e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, clearance: innerHeight-r.bottom,
      padding: parseFloat(s.paddingBottom), hit: !!hit && (e.contains(hit) || hit.contains(e)), viewport: innerHeight };
  });
}
async function scrollEnd(page) {
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('uni-page-body *')) {
      if (e.getClientRects().length && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight) e.scrollTop = e.scrollHeight;
    }
    window.scrollTo(0,document.documentElement.scrollHeight);
  });
  await settle(page);
}

// Used inside the existing all-route integration gate, after its route/animation checks.
export async function checkPageBottom(page) {
  abortCheck();
  await settleMotion(page);
  const cases = [];
  for (const safe of [0,34]) {
    await safeArea(page,safe); await scrollEnd(page);
    const body = page.locator('uni-page-body').last();
    const enter = body.locator('.nx-page-enter:visible');
    const nav = body.locator('.nx-tabbar-pill:visible');
    const hasNav = await nav.count() > 0;
    if (await enter.count()) {
      const r = await measure(enter);
      assert.ok(r.padding >= safe + (hasNav ? 104 : 40) - .1, `Page bottom reserve ${JSON.stringify(r)}`);
      cases.push({ safe, kind:'content-reserve', ...r });
    }
    if (hasNav) {
      const n = await measure(nav);
      assert.ok(n.clearance >= safe+22-.1, `Tab safe area ${JSON.stringify(n)}`);
      cases.push({ safe, kind:'navigation', ...n });
      const bubble=body.locator('.nx-nova-bubble:visible');
      if (await bubble.count()) {
        const r=await measure(bubble);
        assert.ok(r.bottom <= n.top-9.9, `Advisor overlaps navigation ${JSON.stringify({r,n})}`);
        cases.push({safe,kind:'advisor',...r});
      }
    }
    const controls = await body.locator('[role="button"],[role="link"],button,input,textarea,[tabindex="0"]').evaluateAll(els => els.map(e => {
      const r=e.getBoundingClientRect(), s=getComputedStyle(e), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,45),top:r.top,bottom:r.bottom,height:r.height,
        clearance:innerHeight-r.bottom,visible:!!e.getClientRects().length&&s.visibility!=='hidden'&&s.opacity!=='0',hit:!!hit&&e.contains(hit)};
    }).filter(e=>e.visible&&e.hit&&e.top>=0&&e.top<innerHeight));
    assert.ok(controls.every(e=>e.clearance>=safe+12-.5), `Bottom hit target ${JSON.stringify(controls.filter(e=>e.clearance<safe+12-.5))}`);
    cases.push({ safe, kind:'visible-controls-at-scroll-end', controls });
  }
  await safeArea(page,0);
  return cases;
}

async function openRoute(browser,baseUrl,route,{width=390,height=844,locale='zh',theme='dark',safe=34}={}) {
  abortCheck();
  const context=await browser.newContext({viewport:{width,height}});
  await context.addInitScript(({locale,theme})=>{
    localStorage.setItem('nexgrid-locale-v1',JSON.stringify({type:'object',data:{code:locale,userSet:true}}));
    localStorage.setItem('nexgrid-theme-v1',JSON.stringify({type:'object',data:{mode:theme}}));
  },{locale,theme});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(15000);
  for(const prefix of ['tcs','vcs']) await page.addLocatorHandler(page.locator(`.${prefix}-root:visible`),async()=>{
    await page.locator(`.${prefix}-dismiss:visible,.${prefix}-close:visible`).first().click();
  });
  await safeArea(page,safe);
  const flag=route==='pages/compute-share/download'?'computeShareEnabled':/^pages\/(staking\/|me\/wallet-repurchase(?:-how)?$)/.test(route)?'stakingVisible':null;
  await page.goto(`${baseUrl}/?nx_device_inner=1#/${flag?'pages/me/devices':route}`,{waitUntil:'domcontentloaded'});
  if(flag) {
    await page.locator('.nx-chassis:visible').waitFor();
    await page.evaluate(async()=>{window.__bottomConfig=(await import('/src/store/config.ts')).useConfig();});
    await page.waitForFunction(()=>!window.__bottomConfig.loading&&!window.__bottomConfig.syncFailed);
    await page.evaluate(async({flag,route})=>{window.__bottomConfig._devSetFlag(flag,true);await new Promise((resolve,reject)=>uni.navigateTo({url:'/'+route,success:resolve,fail:reject}));},{flag,route});
  }
  await page.waitForFunction(route=>typeof getCurrentPages==='function'&&getCurrentPages().at(-1)?.route===route.split('?')[0],route);
  await page.locator('uni-page-body').last().waitFor({state:'attached'});
  await page.locator('body').click({trial:true});
  await page.waitForFunction(()=>[...document.querySelectorAll('.nx-page-enter')].filter(e=>e.getClientRects().length).every(e=>getComputedStyle(e).transform==='none'));
  await settleMotion(page);
  return {page,context,errors};
}

export async function checkBottomOverlays(browser,baseUrl,out) {
  const cases=[];
  for(const spec of [{width:390,height:844,safe:0,locale:'zh',theme:'dark'},
    {width:390,height:844,safe:34,locale:'en',theme:'light'},
    {width:320,height:568,safe:34,locale:'vi',theme:'dark'},
    {width:390,height:420,safe:34,locale:'zh',theme:'light'}]) {
    for(const route of ['pages/genesis/genesis','pages/team/leaderboard','pages/earn/earn','pages/login/login','pages/support/chat?cid=cv-advisor-1','pages/onboarding/estimator']) {
      const {page,context,errors}=await openRoute(browser,baseUrl,route,spec);
      const label=route.replaceAll('/','-').replaceAll('?','-')+'-'+spec.width+'-'+spec.height+'-'+spec.safe;
      const measurements=[];
      async function control(selector,min) {
        const target=page.locator(selector).last(); await target.waitFor();
        await settleMotion(page);
        await target.scrollIntoViewIfNeeded(); await settle(page);
        await target.evaluate(e=>{const panel=e.closest('.sas-panel,.lss-panel,.nx-glass-sheet.absolute.bottom-0');if(panel)panel.scrollTop=panel.scrollHeight;});
        await settle(page);
        const r=await measure(target); assert.ok(r.clearance>=spec.safe+min-.5&&r.top>=0&&r.hit,`${label} ${selector} ${JSON.stringify(r)}`);
        measurements.push({selector,...r}); return target;
      }
      try {
        if(route.includes('genesis')) await control('.nx-genesis-dock>[role="button"]',38);
        if(route.includes('leaderboard')) {
          const sticky=page.locator('uni-view[style*="position: sticky"]').last();
          const r=await measure(sticky.locator(':scope > uni-view').first());
          assert.ok(r.clearance>=spec.safe+38-.5,JSON.stringify(r)); measurements.push({selector:'leaderboard sticky',...r});
          await scrollEnd(page);
          await sticky.locator(':scope > uni-view').first().click();
          await page.waitForURL(/pages\/team\/team/);
        }
        if(route.includes('earn/')) {
          await page.evaluate(async()=>{(await import('/src/composables/use-capacity-explainer.ts')).useCapacityExplainer().open();});
          const panel=page.locator('.nx-glass-sheet.absolute.bottom-0').last(); await panel.waitFor();
          const bounds=await measure(panel); assert.ok(bounds.top>=23.5,JSON.stringify(bounds));
          const cta=await control('.nx-glass-sheet.absolute.bottom-0 > :last-child',38);
          await cta.click(); await page.waitForURL(/pages\/store\/store/);
          await page.evaluate(async()=>{(await import('/src/store/slot-action-sheet.ts')).useSlotActionSheet().show();});
          const cancel=await control('.sas-cancel',28);await cancel.click();await page.locator('.sas-root').waitFor({state:'detached'});
          await page.evaluate(async()=>{(await import('/src/store/lucky-spin.ts')).useLuckySpin().openSheet();});
          const pool=await control('.lss-pool-toggle',32);await pool.click();assert.ok(await page.locator('.lss-pool-grid').isVisible());
          await page.locator('.lss-close').click();await page.locator('.lss-root').waitFor({state:'detached'});
        }
        if(route.includes('login')) {
          const phone=page.getByTestId('mock-preview-phone').locator('input');await phone.fill('13800138000');
          await page.locator('.lg-phone__cc').click();
          await page.waitForFunction(()=>{const e=document.querySelector('.cc-sheet');return e&&getComputedStyle(e).transform==='none';});
          const list=page.locator('.cc-list .uni-scroll-view-scrollbar-hidden');
          await list.evaluate(e=>e.scrollTop=e.scrollHeight);await settle(page);
          const row=await measure(page.locator('.cc-row').last()), frame=await measure(list);
          assert.ok(row.bottom<=frame.bottom+.5&&row.clearance>=spec.safe+24-.5,JSON.stringify({row,frame}));
          measurements.push({selector:'country last option',...row});
          await page.locator('.cc-head__close').click(); assert.equal(await phone.inputValue(),'13800138000');
          await page.locator('.lg-phone__cc').click();await page.locator('.cc-row:not(.cc-row--disabled)').nth(1).click();
          await page.locator('.cc-sheet').waitFor({state:'detached'});assert.equal(await phone.inputValue(),'13800138000');
        }
        if(route.includes('support/chat')) {
          const input=page.locator('.nx-conv-input-row input');await input.fill('safe-area draft');await input.focus();
          await control('.nx-conv-input-row input',38);const send=await control('.nx-conv-input-row > :last-child',38);
          assert.ok(await send.isVisible());assert.equal(await input.inputValue(),'safe-area draft');
        }
        if(route.includes('estimator')) await control('.est-go',38);
        await page.screenshot({path:resolve(out,label+'.png')});assert.deepEqual(errors,[]);
        cases.push({id:label,measurements,errors}); console.log('PASS '+label);
      } finally {await context.close();}
    }
  }
  return cases;
}

async function main() {
  const before=treeFingerprint();
  const arg=key=>process.argv[process.argv.indexOf(key)+1];
  const baseUrl=arg('--url'),out=resolve(arg('--out'));
  await fs.mkdir(out,{recursive:true});const identity=await identify(baseUrl,{root});assert.ok(identity.ok,JSON.stringify(identity));
  const browser=await chromium.launch();const cases=[];let error;
  try {
    if(process.argv.includes('--sweep')) {
      const routes=[...(await fs.readFile(resolve(root,'src/pages.json'),'utf8')).matchAll(/"path"\s*:\s*"([^"]+)"/g)].map(m=>m[1]);
      for(const route of routes) {
        const {page,context,errors}=await openRoute(browser,baseUrl,route);
        try {cases.push({id:route,cases:await checkPageBottom(page)});assert.deepEqual(errors,[]);console.log('PASS route '+route);}
        catch(e) {cases.push({id:route,error:e.stack});console.error('FAIL route '+route+': '+e.message);}
        finally {await context.close();}
      }
    }
    cases.push(...await checkBottomOverlays(browser,baseUrl,out));
    assert.ok(cases.every(c=>!c.error),'Route failures recorded in result.json');
  } catch(e) {error=e.stack;console.error(error);process.exitCode=1;}
  finally {
    await browser.close();const after=treeFingerprint(),treeMoved=before?.fingerprint!==after?.fingerprint||before?.head!==after?.head;
    if(treeMoved) {error??='Source tree changed during runtime check';process.exitCode=1;}
    const verdict=error?'fail':'pass';
    await fs.writeFile(resolve(out,'result.json'),JSON.stringify({at:new Date().toISOString(),verdict,mode:'full',scope:'bottom-safe-area runtime (not full repository verify)',treeMoved,before,after,capability:'runtime',innerSkipped:0,
      taskId:process.env.WORKFLOW_TASK_ID,stepId:process.env.WORKFLOW_STEP_ID,checkId:process.env.WORKFLOW_CHECK_ID,runId:process.env.WORKFLOW_RUN_ID,
      repo:process.env.WORKFLOW_REPO??root,snapshotHash:process.env.WORKFLOW_SNAPSHOT_HASH,
      steps:[{id:'bottom-safe-layout',status:verdict,evidence:[resolve(out,'result.json'),`${cases.length} route and overlay cases; actual Chromium safe-area env override; short viewport is not native IME`]}],cases,error},null,2));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
