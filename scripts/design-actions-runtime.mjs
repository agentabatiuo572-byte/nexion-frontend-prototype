// Controlled frontend fixtures; this does not certify native binding or TEST services.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { installFormalProbeSession } from './lib/formal-probe-session.mjs';
import { directAppUrl } from './lib/direct-app-url.mjs';
import { fixture } from './lib/design-review-fixture.mjs';
const base = process.env.DESIGN_BASE || 'http://127.0.0.1:5190';
const output = process.env.DESIGN_OUTPUT || path.join(os.tmpdir(),'uvel-actions-review');
await mkdir(output,{recursive:true});
const browser = await chromium.launch();
const records=[],errors=[];
const variants = [320,390].flatMap(width=>['zh','en','vi'].flatMap(locale=>['dark','light'].map(theme=>({width,locale,theme}))));
try {
  for(const variant of variants) {
    const {width,locale,theme}=variant;
    const context=await browser.newContext({viewport:{width,height:844},colorScheme:theme,reducedMotion:'reduce'});
    const page=await context.newPage(), state={offers:true,taskState:'pending'};
    page.on('pageerror',error=>errors.push({...variant,message:error.message}));
    await installFormalProbeSession(page,{responseFor:(url,request)=>fixture(url,locale,state,request)});
    await page.addInitScript(({locale,theme})=>{
      localStorage.setItem('nexgrid-locale-v1',JSON.stringify({type:'object',data:{code:locale,userSet:true}}));
      localStorage.setItem('nexgrid-theme-v1',JSON.stringify({type:'object',data:{mode:theme}}));
    },{locale,theme});
    const home=directAppUrl(base,'/pages/index/index');
    await page.goto(home,{waitUntil:'networkidle'});
    const todo=page.locator('[data-home-section=actions]'), row=todo.locator('[data-action-key=quest]');
    await row.waitFor();
    assert.equal(await row.locator('.home-action-ring__count').innerText(),'3/6');
    assert.equal(await row.locator('.home-action-reward').innerText(),'500 UVT');
    assert.equal(await todo.locator('.learning-card').count(),0);
    assert.equal(await todo.locator('[data-action-key=phone]').count(),0,'H5 never offers native binding');
    await row.scrollIntoViewIfNeeded();
    await page.evaluate(()=>document.fonts.ready);
    const metrics=await row.evaluate(el=>{
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      const overflow=[...el.querySelectorAll('*')].filter(child=>{const b=child.getBoundingClientRect();return b.width>0&&(b.left<rect.left-1||b.right>rect.right+1);}).map(child=>child.className);
      return {height:rect.height,padding:style.padding,gap:style.gap,overflow};
    });
    assert.equal(metrics.gap,'12px'); assert.deepEqual(metrics.overflow,[]);
    if(width===390&&locale==='zh') assert.equal(metrics.height,64);
    await todo.screenshot({path:path.join(output,`${width}-${locale}-${theme}-todo.png`),animations:'disabled'});
    await row.focus(); await page.keyboard.press('Enter');
    await page.waitForURL(/pages\/missions\/missions/);
    await page.locator('.learning-card').waitFor();
    await page.locator('.learning-card').click();
    await page.waitForURL(/pages\/learn\/course/);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.spv-back').click();
    await page.waitForURL(/pages\/missions\/missions/);
    // Reload the same account: only live actionable states survive in the summary.
    if(width===390&&locale==='zh'&&theme==='dark') {
      for(const taskState of ['complete','claimed','expired','empty','error','legacy']) {
        state.taskState=taskState;
        await page.goto(home,{waitUntil:'networkidle'});
        await page.reload({waitUntil:'networkidle'});
        if(['claimed','expired','empty','error'].includes(taskState)) assert.equal(await todo.count(),0,`${taskState}: ${await todo.allTextContents()}`);
        else {
          await row.waitFor();
          assert.equal(await row.locator('.home-action-ring__count').innerText(),taskState==='complete'?'6/6':'–');
          if(taskState==='legacy') assert.equal(await row.locator('.home-action-reward').count(),0);
          else assert.match(await row.innerText(),/待领取/);
          await todo.screenshot({path:path.join(output,`${taskState}-todo.png`),animations:'disabled'});
        }
      }
      state.taskState='pending';
      await page.goto(home,{waitUntil:'networkidle'});
      await row.waitFor();
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await row.locator('.home-action-ring__count').innerText(),'3/6');
    }
    records.push({...variant,...metrics});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'report.json'),JSON.stringify({records,errors,states:['pending','complete','claimed','expired','empty','error','legacy'],boundary:'frontend fixture only'},null,2));
  console.log(`PASS: ${records.length} layout/keyboard/course-route variants + completion/expiry/legacy/reload states. ${output}`);
} finally { await browser.close(); }
