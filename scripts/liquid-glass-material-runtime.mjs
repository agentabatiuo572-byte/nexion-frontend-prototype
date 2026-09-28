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

async function clearMaterialPixels(page, engine, theme) {
  await page.evaluate(async theme=>{
    (await import('/src/store/theme.ts')).useTheme().setMode(theme);
  },theme);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(engine=>document.querySelector('.nx-glass-track')?.dataset.glassStrategy===(engine==='webkit'?'webgl':'svg'),engine);
  await page.screenshot({path:resolve(out,`${engine}-${theme}-page.png`)});
  await page.evaluate(async()=>{
    const {mountLiquidGlass}=await import('/src/lib/liquid-glass-renderer.ts');
    const scope=document.createElement('div');scope.className='nx-chassis';scope.id='probe-clear-scope';
    scope.style.cssText='position:fixed;inset:0;z-index:9999';
    const source=document.createElement('canvas');source.className='probe-clear-source';source.width=390;source.height=844;
    source.style.cssText='position:absolute;inset:0;width:390px;height:844px';
    const ctx=source.getContext('2d');
    for(let y=0;y<844;y+=8)for(let x=0;x<390;x+=8){ctx.fillStyle=(x+y)%16===0?'#181c22':'#f0f2f5';ctx.fillRect(x,y,8,8);}
    // Clone the rendered component so uni's generated CSS scope attributes and
    // every tint/specular/rim layer are exercised, not just an unstyled filter.
    const host=document.querySelector('.nx-glass-track').cloneNode(true);host.id='probe-clear-host';
    host.classList.remove('nx-glass-track');host.querySelectorAll('svg,canvas').forEach(el=>el.remove());
    host.dataset.glassStrategy='preparing';
    host.style.cssText='position:absolute;left:25px;top:280px;width:340px;height:68px;border-radius:34px';
    scope.append(source,host);document.body.append(scope);
    window.__clearMaterialProbe={scope,host,controller:mountLiquidGlass(host,{radius:34,tone:'navigation',backdrop:'.probe-clear-source'})};
  });
  try {
    await page.waitForFunction(engine=>document.getElementById('probe-clear-host')?.dataset.glassStrategy===(engine==='webkit'?'webgl':'svg'),engine);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const clip={x:25,y:280,width:340,height:68};
    await page.screenshot({clip,path:resolve(out,`${engine}-${theme}-material.png`)});
    // Judge optical detail independently of the readability veil. A high
    // contrast requirement on the final composite rewards illegible see-through UI.
    await page.locator('#probe-clear-host').evaluate(el=>el.querySelectorAll('.nx-liquid-tint,.nx-liquid-rim,.nx-liquid-specular').forEach(layer=>layer.style.visibility='hidden'));
    const refracted=await page.screenshot({clip,path:resolve(out,`${engine}-${theme}-optics.png`)});
    // WebGL optics explicitly sets visibility:visible, which can override an
    // ancestor's hidden visibility. Remove the whole surface for a true baseline.
    await page.locator('#probe-clear-host').evaluate(el=>el.style.display='none');
    const bare=await page.screenshot({clip});
    const result=await page.evaluate(async({refracted,bare})=>{
      async function pixels(data){const im=new Image();im.src=data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}
      const a=await pixels(refracted),b=await pixels(bare),inside=[],reference=[];
      let edgeChanged=0,edgePixels=0;
      for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
        const i=(y*a.width+x)*4;
        if(x>48&&x<a.width-48&&Math.abs(y-a.height/2)<5){inside.push(.2126*a.data[i]+.7152*a.data[i+1]+.0722*a.data[i+2]);reference.push(.2126*b.data[i]+.7152*b.data[i+1]+.0722*b.data[i+2]);}
        // Ignore the decorative one-pixel rim: only moved background squares
        // can change these interior edge pixels by more than 80 luminance units.
        const inset=Math.min(x,y,a.width-1-x,a.height-1-y);
        if(inset>=3&&inset<=15){edgePixels++;if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>240)edgeChanged++;}
      }
      const contrast=values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length*.9)]-values[Math.floor(values.length*.1)];};
      return {contrastRatio:contrast(inside)/contrast(reference),edgeChangedRatio:edgeChanged/edgePixels};
    },{refracted:'data:image/png;base64,'+refracted.toString('base64'),bare:'data:image/png;base64,'+bare.toString('base64')});
    cases.push({id:`${engine}-${theme}-clear-refraction`,...result});
    assert.ok(result.contrastRatio>.7,`Fine background detail was frosted: ${JSON.stringify(result)}`);
    assert.ok(result.edgeChangedRatio>.08,`No convex edge refraction: ${JSON.stringify(result)}`);
  } finally {
    await page.evaluate(()=>{const p=window.__clearMaterialProbe;p.controller.destroy();p.scope.remove();delete window.__clearMaterialProbe;});
  }
}

async function tickerCaptureRecovery(page) {
  // A fresh real page isolates this fault from the static capture/GPU probes.
  // Leave its business timers running: they reproduced a refresh promise that
  // never settled even while the library kept producing successful snapshots.
  await page.goto(server.baseUrl+'/?nx_device_inner=1&glass_ticker_recovery=1#/pages/earn/earn',{waitUntil:'domcontentloaded'});
  const track=page.locator('.nx-tabbar-pill .nx-glass-track');
  await page.waitForFunction(()=>document.querySelector('.nx-tabbar-pill .nx-glass-track')?.dataset.glassStrategy==='webgl',{},{timeout:45000});
  await page.evaluate(()=>{
    const p=window.__tickerCaptureProbe={draw:CanvasRenderingContext2D.prototype.drawImage,fail:false,failures:0,successes:0,changes:0};
    // A one-second page update may only rewrite fleet/progress styles while
    // displayed earnings round to the same cents. Observe the actual backdrop
    // updates, including styles, but never count generated glass as business work.
    p.observer=new MutationObserver(records=>{if(records.some(record=>{
      const target=record.target instanceof Element?record.target:record.target.parentElement;
      return target && !target.closest('.nx-liquid-glass') && (record.type==='characterData'||record.attributeName==='style');
    }))p.changes++;});
    p.observer.observe(document.querySelector('.nx-page-enter'),{subtree:true,characterData:true,attributes:true,attributeFilter:['style']});
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
      if(image instanceof HTMLImageElement&&String(image.src).startsWith('data:image/svg+xml')){
        if(p.fail){p.failures++;throw new Error('controlled ticker capture failure');}
        const value=p.draw.call(this,image,...args);p.successes++;return value;
      }
      return p.draw.call(this,image,...args);
    };
  });
  const result={id:'webkit-ticker-capture-failure-recovery',recovered:false};
  try {
    await page.waitForFunction(()=>window.__tickerCaptureProbe.changes>=2,{},{timeout:15000});
    result.before=await page.evaluate(()=>{const p=window.__tickerCaptureProbe;p.fail=true;return {changes:p.changes,successes:p.successes};});
    await page.waitForFunction(()=>document.querySelector('.nx-tabbar-pill .nx-glass-track')?.dataset.glassReason==='capture-failed',{},{timeout:15000});
    assert.equal(await track.locator('.nx-liquid-optics').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    await page.screenshot({path:resolve(out,'webkit-ticker-capture-failed.png')});
    await page.evaluate(()=>{const p=window.__tickerCaptureProbe;p.fail=false;p.restoreAt=performance.now();p.successesAtRestore=p.successes;p.changesAtRestore=p.changes;});
    await page.waitForFunction(()=>document.querySelector('.nx-tabbar-pill .nx-glass-track')?.dataset.glassStrategy==='webgl',{},{timeout:15000});
    assert.equal(await track.locator('.nx-liquid-optics').evaluate(el=>getComputedStyle(el).visibility),'visible');
    result.after=await page.evaluate(()=>{const p=window.__tickerCaptureProbe;return {failures:p.failures,successfulSnapshots:p.successes-p.successesAtRestore,tickerChanges:p.changes-p.changesAtRestore,recoveryMs:performance.now()-p.restoreAt};});
    assert.ok(result.after.failures>0,'The real page must experience a capture failure');
    assert.ok(result.after.successfulSnapshots>0,'Recovery must follow a new successful snapshot');
    assert.ok(result.after.tickerChanges>0,'The page ticker must keep running during recovery');
    result.recovered=true;
    await page.screenshot({path:resolve(out,'webkit-ticker-recovered.png')});
  } catch(error) {
    result.error=error.message;
    result.state=await track.evaluate(el=>({strategy:el.dataset.glassStrategy,reason:el.dataset.glassReason,visibility:getComputedStyle(el.querySelector('.nx-liquid-optics')).visibility}));
    await page.screenshot({path:resolve(out,'webkit-ticker-recovery-failed.png')});
    throw error;
  } finally {
    result.counters=await page.evaluate(()=>{const p=window.__tickerCaptureProbe;CanvasRenderingContext2D.prototype.drawImage=p.draw;p.observer.disconnect();delete window.__tickerCaptureProbe;return {failures:p.failures,successes:p.successes,changes:p.changes};});
    cases.push(result);
  }
}

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
      for(const theme of ['dark','light'])await clearMaterialPixels(page,name,theme);
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
          const settled=async index=>{
            for(let i=0;i<120;i++){
              await new Promise(requestAnimationFrame);
              const a=rail.querySelectorAll('.nx-glass-option')[index].getBoundingClientRect(),b=lens.getBoundingClientRect();
              if(rail.dataset.glassMoving==='false'&&Math.abs(a.left-b.left)<=1.1)break;
            }
          };
          segmentsView.methods.update.call(sv,config);segmentsView.mounted.call(sv);
          await settled(2);
          rail.scrollLeft=80;segmentsView.methods.update.call(sv,{...config,value:'b'});
          await settled(1);
          const item=rail.querySelectorAll('.nx-glass-option')[1],a=item.getBoundingClientRect(),b=lens.getBoundingClientRect();
          item.focus();item.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
          const delta=Math.abs(a.left-b.left),scroll=rail.scrollLeft,moving=rail.dataset.glassMoving;
          segmentsView.beforeUnmount.call(sv);
          const animations=rail.getAnimations({subtree:true}).length;rail.remove();
          return {strategy,svgAfterDestroy,delta,scroll,moving,clicks,animations};
        });
        assert.equal(bridge.strategy,'svg');assert.equal(bridge.svgAfterDestroy,0);
        assert.ok(bridge.delta<=1.1 && bridge.scroll>0,JSON.stringify(bridge));assert.notEqual(bridge.moving,'true');assert.equal(bridge.clicks,1);assert.equal(bridge.animations,0);
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
        await tickerCaptureRecovery(page);
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
