import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:5190',out=path.resolve('../uvel-design-preview/evidence/demo-me');
await mkdir(out,{recursive:true});const browser=await chromium.launch(),report=[];
try{
  for(const width of [390,320])for(const locale of ['zh','en','vi'])for(const theme of ['dark','light']){
    const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
    await page.request.get(base+'/preview-language?code='+locale);
    await page.addInitScript(({locale,theme})=>{localStorage.setItem('nexgrid-locale-v1',JSON.stringify({type:'object',data:{code:locale,userSet:true}}));localStorage.setItem('nexgrid-theme-v1',JSON.stringify({type:'object',data:{mode:theme}}));},{locale,theme});
    await page.goto(base+'/?nx_device=off#/pages/me/me',{waitUntil:'networkidle'});
    await page.locator('.me-shortcut-grid').waitFor();
    await page.getByText('52800.64',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
    const metrics=await page.locator('.me-shortcut-grid').evaluate(grid=>({width:grid.getBoundingClientRect().width,colors:[...new Set([...grid.querySelectorAll('.me-row-icon')].map(icon=>getComputedStyle(icon).color))],items:[...grid.querySelectorAll('.me-shortcut')].map(item=>{const r=item.getBoundingClientRect();return {width:r.width,height:r.height,overflow:item.scrollWidth>item.clientWidth+1}})}));
    assert.equal(metrics.items.length,8);assert.ok(metrics.colors.length>=4);assert.ok(metrics.items.every(item=>item.width>=44&&item.height>=44&&!item.overflow));
    const key=`${width}-${locale}-${theme}`;await page.screenshot({path:path.join(out,key+'.png'),animations:'disabled'});
    assert.equal(await page.locator('.nx-support-bubble').count(),0);
    await page.locator('.me-network-grid').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.waitForFunction(()=>!document.querySelector('.nx-chassis[data-scrolling="true"]'));
    await page.screenshot({path:path.join(out,key+'-network.png'),animations:'disabled'});
    await page.locator('[data-quick-key=support]').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.waitForFunction(()=>!document.querySelector('.nx-chassis[data-scrolling="true"]'));
    await page.screenshot({path:path.join(out,key+'-help.png'),animations:'disabled'});
    await page.locator('[data-me-action=sign-out]').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.waitForFunction(()=>!document.querySelector('.nx-chassis[data-scrolling="true"]'));
    const logoutClear=await page.locator('[data-me-action=sign-out]').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});
    assert.ok(logoutClear,key+' logout reachable above navigation');
    await page.screenshot({path:path.join(out,key+'-bottom.png'),animations:'disabled'});
    await page.locator('.me-shortcut[data-quick-key=orders]').focus();await page.keyboard.press('Enter');await page.waitForURL(/store\/orders/);
    report.push({key,metrics,keyboardNavigation:true});await page.close();
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('PASS: 12 Me layouts, colored icons, touch targets, keyboard navigation.');
}finally{const p=await browser.newPage();await p.request.get(base+'/preview-language?code=zh');await browser.close();}
