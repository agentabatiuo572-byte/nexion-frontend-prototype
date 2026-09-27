import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await ensureServer({root,reuseUrl:process.env.UNI_BASE_URL,log:console.log});
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:390,height:844}});
const out=resolve(root,'.codex-runtime/glass');
await mkdir(out,{recursive:true});
const report={cases:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
async function nav(route) {
  await page.evaluate(route=>uni.reLaunch({url:'/pages/'+route}),route);
  await page.waitForURL(url=>url.hash==='#/pages/'+route || route==='index/index'&&url.hash==='#/');
  await page.locator('.nx-tabbar-pill').waitFor();
  for(const s of ['.tcs-dismiss','.vcs-dismiss','.tcs-close','.vcs-close'])if(await page.locator(s).isVisible().catch(()=>false))await page.locator(s).click();
}
try {
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/login/login`,{waitUntil:'domcontentloaded'});
  await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
  await page.getByTestId('mock-preview-password').locator('input').press('Enter');
  await page.waitForURL(/#\/$|#\/pages\/index\/index|pages\/onboarding\/connect/);
  if(page.url().includes('/onboarding/connect'))await page.locator('.cn-back').click();
  for(const width of [320,390])for(const locale of ['zh','en','vi'])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(async({locale,theme})=>{
      (await import('/src/store/locale.ts')).useLocaleStore().setLocale(locale);
      (await import('/src/store/theme.ts')).useTheme().setMode(theme);
    },{locale,theme});
    for(const route of ['index/index','earn/earn','store/store','team/team','me/me']) {
      await nav(route);
      const state=await page.evaluate(()=>{
        const bar=document.querySelector('.nx-tabbar-pill'),s=getComputedStyle(bar);
        return {background:s.backgroundColor,blur:s.backdropFilter,labels:[...bar.querySelectorAll('.nx-tab__label')].map(e=>({shadow:getComputedStyle(e).textShadow,overflow:e.scrollWidth>e.clientWidth+1,text:e.textContent})),icons:[...bar.querySelectorAll('.nx-tab__icon')].map(e=>getComputedStyle(e).filter)};
      });
      assert.equal(state.background,theme==='dark'?'rgba(12, 12, 14, 0.22)':'rgba(255, 255, 255, 0.2)');
      assert.ok(state.blur.includes('blur(40px)'));
      assert.equal(state.labels.length,5);
      assert.ok(state.labels.every(l=>l.shadow!=='none'&&!l.overflow));
      assert.ok(state.icons.every(f=>f.includes('drop-shadow')));
      report.cases.push({width,locale,theme,route,...state});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{(await import('/src/store/locale.ts')).useLocaleStore().setLocale('zh');});
  await nav('store/store');
  const photo=page.locator('uni-image[data-product-id="stellarbox-pro"]');
  await photo.locator('img').evaluate(img=>img.decode());
  await photo.evaluate(e=>{document.querySelector('.nx-content').scrollTop+=e.getBoundingClientRect().top-680;});
  for(const theme of ['dark','light']) {
    await page.evaluate(async theme=>(await import('/src/store/theme.ts')).useTheme().setMode(theme),theme);
    await page.screenshot({path:resolve(out,`${theme}-store.png`)});
    for(const background of ['white','black']) {
      await page.evaluate(background=>{
        let underlay=document.getElementById('contrast-backdrop');
        if(!underlay){underlay=document.createElement('div');underlay.id='contrast-backdrop';document.querySelector('.nx-chassis').append(underlay);}
        Object.assign(underlay.style,{position:'absolute',inset:'0',zIndex:'29',background});
      },background);
      await page.screenshot({path:resolve(out,`${theme}-${background}.png`)});
    }
    await page.evaluate(()=>document.getElementById('contrast-backdrop').remove());
  }
  assert.deepEqual(report.errors,[]);
  console.log(`PASS ${report.cases.length} navigation cases + white/black backdrops`);
} finally {
  await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2));
  await browser.close();server.stop();
}
