import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'.codex-runtime/liquid-glass/material');
await mkdir(out,{recursive:true});
const server=await ensureServer({root,reuseUrl:process.env.LIQUID_GLASS_BASE_URL,log:console.log});
const cases=[],errors=[],failedAssets=[];
try {
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    const browser=await engine.launch();
    try {
      const context=await browser.newContext({viewport:{width:390,height:844}});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(name+': '+e.message));
      page.on('requestfailed',r=>{
        if(['script','stylesheet','font'].includes(r.resourceType())) failedAssets.push({engine:name,url:r.url(),error:r.failure()?.errorText});
      });
      page.on('response',r=>{
        if(r.status()>=400 && ['script','stylesheet','font'].includes(r.request().resourceType())) failedAssets.push({engine:name,url:r.url(),status:r.status()});
      });
      await page.goto(server.baseUrl+'/?nx_device_inner=1#/pages/earn/earn',{waitUntil:'domcontentloaded'});
      const track=page.locator('.nx-tabbar-pill .nx-glass-track');
      await track.locator('.nx-liquid-optics').waitFor({state:'attached'});
      await track.locator('xpath=.').filter({visible:true}).waitFor();
      await page.waitForFunction(({name})=>document.querySelector('.nx-glass-track')?.dataset.glassStrategy===(name==='webkit'?'webgl':'svg'),{name},{timeout:45000});
      const fonts=await page.evaluate(async()=>{
        const names=['General Sans','Manrope','JetBrains Mono'];
        const loaded=await Promise.all(names.map(async family=>({family,count:(await document.fonts.load(`400 16px "${family}"`,'Tiếng Việt 012345')).length})));
        await document.fonts.ready;
        return {loaded,external:performance.getEntriesByType('resource').filter(r=>/fonts\.(googleapis|gstatic)\.com|api\.fontshare\.com/.test(r.name)).map(r=>r.name)};
      });
      assert.ok(fonts.loaded.every(font=>font.count>0),'All three original font families must load');
      assert.deepEqual(fonts.external,[]);cases.push({id:name+'-bundled-fonts',...fonts});
      if(name==='chromium') {
        // App renderjs has a separate empty Vue instance. Exercise the exact
        // adapter with a comment $el and explicit host ID, including scrolled rails.
        const bridge=await page.evaluate(async()=>{
          const {default:material,segmentsView}=await import('/src/lib/liquid-glass-view.ts');
          const host=document.createElement('div');host.id='probe-app-host';host.className='nx-liquid-glass';
          host.style.cssText='position:fixed;top:200px;left:10px;width:180px;height:54px';
          for(const cls of ['optics','tint','specular','rim']){const el=document.createElement('div');el.className='nx-liquid-'+cls;host.append(el);}
          document.body.append(host);
          const vm={$el:document.createComment('app renderjs')};
          material.methods.update.call(vm,{hostId:host.id,radius:24,tone:'control'});
          material.mounted.call(vm);
          await new Promise(r=>setTimeout(r,300));
          const strategy=host.dataset.glassStrategy;
          material.beforeUnmount.call(vm);
          const svgAfterDestroy=host.querySelectorAll('svg').length;host.remove();
          const rail=document.createElement('div');rail.id='probe-app-rail';rail.style.cssText='position:fixed;top:300px;left:10px;width:120px;display:flex;overflow:auto';
          const lens=document.createElement('div');lens.className='nx-glass-indicator';lens.style.cssText='position:absolute;left:0;top:0';rail.append(lens);
          let clicks=0;
          for(const value of ['a','b','c']){const el=document.createElement('div');el.className='nx-glass-option';el.tabIndex=0;el.setAttribute('role','button');el.style.cssText='flex:0 0 100px;height:44px';el.textContent=value;el.addEventListener('click',()=>clicks++);rail.append(el);}
          document.body.append(rail);
          const sv={$el:document.createComment('app renderjs')},config={hostId:rail.id,value:'c',values:['a','b','c'],fromValue:'a',layout:'scroll',variant:'filter'};
          segmentsView.methods.update.call(sv,config);segmentsView.mounted.call(sv);
          await new Promise(r=>setTimeout(r,350));
          rail.scrollLeft=80;segmentsView.methods.update.call(sv,{...config,value:'b'});
          await new Promise(r=>setTimeout(r,250));
          const item=rail.querySelectorAll('.nx-glass-option')[1],a=item.getBoundingClientRect(),b=lens.getBoundingClientRect();
          item.focus();item.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
          const delta=Math.abs(a.left-b.left),scroll=rail.scrollLeft;
          segmentsView.beforeUnmount.call(sv);
          const animations=rail.getAnimations({subtree:true}).length;rail.remove();
          return {strategy,svgAfterDestroy,delta,scroll,clicks,animations};
        });
        assert.equal(bridge.strategy,'svg');assert.equal(bridge.svgAfterDestroy,0);
        assert.ok(bridge.delta<1 && bridge.scroll>0);assert.equal(bridge.clicks,1);assert.equal(bridge.animations,0);
        cases.push({id:'app-view-contract',...bridge});
        const cdp=await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
        await page.waitForFunction(()=>document.querySelector('.nx-glass-track')?.dataset.glassStrategy==='solid');
        const solid=await track.evaluate(el=>{const s=getComputedStyle(el.querySelector('.nx-liquid-optics'));return {visibility:s.visibility,background:s.backgroundColor};});
        assert.equal(solid.visibility,'visible');assert.ok(!solid.background.startsWith('rgba'));
        cases.push({id:'solid-opaque',...solid});
      } else {
        const before=await track.locator('canvas').evaluate(el=>el.toDataURL());
        await page.locator('.nx-content').evaluate(el=>el.scrollTop=480);
        await page.waitForTimeout(350);
        const after=await track.locator('canvas').evaluate(el=>el.toDataURL());
        assert.notEqual(after,before);
        cases.push({id:'webkit-scroll-texture',beforeBytes:before.length,afterBytes:after.length});
        await page.evaluate(async()=>{
          const {mountLiquidGlass}=await import('/src/lib/liquid-glass-renderer.ts');
          const scope=document.createElement('div');scope.className='nx-chassis';scope.id='probe-capture-scope';scope.style.cssText='position:fixed;inset:0;z-index:9999';
          const source=document.createElement('div');source.className='probe-capture-source';source.style.cssText='width:390px;height:844px;background:red';
          const host=document.createElement('div');host.id='probe-capture-host';host.className='nx-liquid-glass';host.style.cssText='position:absolute;left:20px;top:300px;width:240px;height:64px;border-radius:32px';
          for(const cls of ['optics','tint','specular','rim']){const el=document.createElement('div');el.className='nx-liquid-'+cls;host.append(el);}
          scope.append(source,host);document.body.append(scope);
          window.__glassProbe={scope,source,host,controller:mountLiquidGlass(host,{radius:32,tone:'navigation',backdrop:'.probe-capture-source'}),draw:CanvasRenderingContext2D.prototype.drawImage,failures:0};
        });
        const probe=page.locator('#probe-capture-host');
        await page.waitForFunction(()=>document.querySelector('#probe-capture-host')?.dataset.glassStrategy==='webgl',{},{timeout:30000});
        const initial=await probe.locator('canvas').evaluate(el=>el.toDataURL());
        await page.evaluate(()=>{
          const p=window.__glassProbe;
          CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
            if(image instanceof HTMLImageElement && String(image.src).startsWith('data:image/svg+xml')){p.failures++;throw new Error('controlled capture failure');}
            return p.draw.call(this,image,...args);
          };
          p.source.style.background='lime';
        });
        await page.waitForFunction(()=>document.querySelector('#probe-capture-host')?.dataset.glassReason==='capture-failed');
        assert.equal(await probe.locator('.nx-liquid-optics').evaluate(el=>getComputedStyle(el).visibility),'hidden');
        await page.evaluate(()=>{const p=window.__glassProbe;CanvasRenderingContext2D.prototype.drawImage=p.draw;p.source.style.background='blue';});
        await page.waitForFunction(()=>document.querySelector('#probe-capture-host')?.dataset.glassStrategy==='webgl');
        assert.equal(await probe.locator('.nx-liquid-optics').evaluate(el=>getComputedStyle(el).visibility),'visible');
        assert.notEqual(await probe.locator('canvas').evaluate(el=>el.toDataURL()),initial);
        await page.evaluate(()=>{
          const p=window.__glassProbe,gl=p.host.querySelector('canvas').getContext('webgl');
          p.gpu=gl;p.loss=gl.getExtension('WEBGL_lose_context');
          if(!p.loss)throw new Error('WebGL context-loss extension unavailable');
          p.loss.loseContext();
        });
        await page.waitForFunction(()=>window.__glassProbe.gpu.isContextLost());
        await page.evaluate(()=>{window.__glassProbe.source.style.background='yellow';});
        await page.waitForTimeout(600);
        assert.equal(await probe.getAttribute('data-glass-strategy'),'frosted');
        assert.equal(await probe.locator('.nx-liquid-optics').evaluate(el=>getComputedStyle(el).visibility),'hidden');
        await page.evaluate(()=>window.__glassProbe.loss.restoreContext());
        await page.waitForFunction(()=>document.querySelector('#probe-capture-host')?.dataset.glassStrategy==='webgl');
        cases.push({id:'webkit-gpu-loss-refresh-recovery'});
        const failures=await page.evaluate(()=>{const p=window.__glassProbe;p.controller.destroy();p.scope.remove();return p.failures;});
        assert.ok(failures>0);cases.push({id:'webkit-capture-failure-recovery',failures});
      }
      await page.screenshot({path:resolve(out,name+'.png')});
      console.log('PASS '+name+' material runtime');
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(failedAssets,[], 'Glass and font assets must load without failed requests');
} finally {
  await writeFile(resolve(out,'result.json'),JSON.stringify({cases,errors,failedAssets},null,2));
  server.stop();
}
