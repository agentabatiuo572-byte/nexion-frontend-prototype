import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'.codex-runtime/liquid-glass/motion');
await mkdir(out,{recursive:true});
const server=await ensureServer({root,reuseUrl:process.env.LIQUID_GLASS_BASE_URL,log:console.log});
const cases=[],errors=[],evidence=[];
let passed=false;
try {
  for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]) {
    const browser=await browserType.launch();
    try {
      const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,recordVideo:{dir:out,size:{width:390,height:844}}});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(engine+': '+e.message));
      for(const prefix of ['tcs','vcs']) await page.addLocatorHandler(page.locator(`.${prefix}-root:visible`),async()=>{
        await page.locator(`.${prefix}-dismiss:visible,.${prefix}-close:visible`).first().click();
      });
      const chassis=()=>page.locator('.nx-chassis:visible').last();
      const nav=()=>chassis().locator('.nx-tabbar-pill');
      const filter=()=>chassis().locator('.nx-glass-segments--filter').first();
      const item=(rail,value)=>rail.locator(`[data-glass-value="${value}"]`);
      async function goto(route) {
        // Each route matrix case gets a fresh document; a hash-only goto retains
        // Chromium's synthetic touch gesture state when switching to wheel input.
        await page.goto(`${server.baseUrl}/?nx_device_inner=1&glass_motion_route=${encodeURIComponent(route)}#/pages/${route}`,{waitUntil:'domcontentloaded'});
        await chassis().waitFor(); await page.evaluate(()=>document.fonts.ready);
        await nav().locator(`.nx-glass-track[data-glass-strategy="${engine==='chromium'?'svg':'webgl'}"]`).waitFor();
        if(route==='index/index') {
          // The home arbiter deliberately opens a claim sheet after its settle delay.
          await page.waitForTimeout(2000);
          await nav().hover(); // Runs the registered sheet handler before wheel input.
        }
      }
      async function settled(rail) {
        await page.waitForFunction(id=>{
          const el=document.getElementById(id),lens=el?.querySelector(':scope > .nx-glass-indicator'),selected=el?.querySelector(':scope > [data-selected="true"]');
          if(!lens || !selected || el.dataset.glassMoving==='true')return false;
          const a=lens.getBoundingClientRect(),b=selected.getBoundingClientRect();
          return getComputedStyle(lens).visibility==='visible' && Math.abs(a.x-b.x)<1.1 && Math.abs(a.width-b.width)<1.1;
        },await rail.getAttribute('id'));
      }
      async function trace(kind) {
        await page.evaluate(kind=>{
          window.__glassMotion={frames:[],done:false};
          document.addEventListener('click',()=>{
          const start=performance.now();
          function sample(now) {
            const shell=[...document.querySelectorAll('.nx-chassis')].filter(el=>el.getBoundingClientRect().width).at(-1);
            const rail=shell?.querySelector(kind==='navigation'?'.nx-tabbar-pill':'.nx-glass-segments--filter');
            const lens=rail?.querySelector(':scope > .nx-glass-indicator'),selected=rail?.querySelector(':scope > [data-selected="true"]');
            if(lens && selected) {const a=lens.getBoundingClientRect(),b=selected.getBoundingClientRect();window.__glassMotion.frames.push({t:now-start,x:a.x,y:a.y,w:a.width,h:a.height,to:b.x,value:selected.dataset.glassValue,host:rail.id});}
            if(now-start<1000)requestAnimationFrame(sample);else window.__glassMotion.done=true;
          }
          requestAnimationFrame(sample);
          },{capture:true,once:true});
        },kind);
      }
      async function finishTrace(id) {
        await page.waitForFunction(()=>window.__glassMotion.done);
        const frames=await page.evaluate(()=>window.__glassMotion.frames);
        const path=resolve(out,`${engine}-${id}.json`);await writeFile(path,JSON.stringify(frames));evidence.push(path);
        assert.ok(frames.length>12,`${id} missing animation frames: ${frames.length}`);
        return frames;
      }
      function log(id,data={}){cases.push({engine,id,...data});console.log(`PASS ${engine} ${id}`);}
      async function scrollContent(amount) {
        if(engine==='chromium') {
          const input=await context.newCDPSession(page),start=amount>0?600:270;
          await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:start,id:2}]});
          for(let n=1;n<=8;n++) {
            await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y:start-amount*n/8,id:2}]});
            await page.waitForTimeout(16);
          }
          await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await input.detach();
        } else {await page.mouse.move(190,400);await page.mouse.wheel(0,amount);}
      }

      await goto('earn/earn');await settled(filter());
      await item(filter(),'Today').click();await settled(filter());
      await trace('filter');await item(filter(),'All').click();
      const travel=await finishTrace('filter-spring');await settled(filter());
      const end=travel.at(-1),min=Math.min(...travel.map(f=>f.x)),max=Math.max(...travel.map(f=>f.x));
      assert.ok(end.x-min>150,'no continuous selector travel');
      assert.ok(max-end.x>1,`no rebound: ${max-end.x}`);
      assert.ok(Math.max(...travel.map(f=>f.w))>end.w*1.06,'no liquid stretch');
      assert.ok(new Set(travel.map(f=>Math.round(f.x))).size>8,'teleport instead of continuous travel');
      log('filter-travel-stretch-rebound',{travel:end.x-min,overshoot:max-end.x});

      await item(filter(),'Today').click();await settled(filter());
      await trace('filter');await item(filter(),'All').click();await page.waitForTimeout(70);await item(filter(),'Week').click();
      const reversal=await finishTrace('rapid-reversal');await settled(filter());
      assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'Week');
      const jumps=reversal.slice(1).map((f,i)=>({distance:Math.abs(f.x-reversal[i].x),dt:f.t-reversal[i].t})).filter(f=>f.dt<25);
      assert.ok(jumps.every(f=>f.distance<100),'rapid retarget teleported');log('rapid-retarget',{maxFrameJump:Math.max(...jumps.map(f=>f.distance))});

      await item(filter(),'Today').click();await settled(filter());
      const start=await item(filter(),'Today').boundingBox(),stop=await item(filter(),'All').boundingBox();
      await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
      await page.mouse.move(stop.x+stop.width/2,start.y+start.height/2,{steps:10});
      assert.equal(await filter().getAttribute('data-glass-dragging'),'true');
      assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'Today');
      const held=await filter().locator('.nx-glass-indicator').boundingBox();
      assert.ok(Math.abs(held.x+held.width/2-stop.x-stop.width/2)<12,'lens does not follow pointer');
      await page.mouse.up();await settled(filter());
      assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'All');log('drag-follow-release-once');
      await page.mouse.move(stop.x+stop.width/2,stop.y+stop.height/2);await page.mouse.down();
      await page.mouse.move(start.x+start.width/2,start.y+start.height/2,{steps:6});
      await page.mouse.move(start.x,start.y-70);await page.mouse.up();await settled(filter());
      assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'All');log('drag-outside-cancels');

      await page.mouse.move(stop.x+stop.width/2,stop.y+stop.height/2);await page.mouse.down();
      await page.mouse.move(stop.x-30,stop.y+stop.height/2,{steps:4});
      await filter().evaluate(el=>el.querySelectorAll('.nx-glass-option').forEach(option=>option.setAttribute('aria-disabled','true')));
      await page.mouse.move(start.x,start.y+start.height/2);await page.mouse.up();await settled(filter());
      assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'All');
      await filter().evaluate(el=>el.querySelectorAll('.nx-glass-option').forEach(option=>option.removeAttribute('aria-disabled')));
      log('all-options-disabled-mid-drag');

      if(engine==='chromium') {
        const cdp=await context.newCDPSession(page);
        const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:2,radiusY:2,force:1}]});
        await item(filter(),'Today').click();await settled(filter());
        await filter().evaluate(el=>{window.__touchClicks=0;el.addEventListener('click',()=>window.__touchClicks++);});
        await touch('touchStart',start.x+start.width/2,start.y+start.height/2);
        for(let n=1;n<=8;n++)await touch('touchMove',start.x+start.width/2+(stop.x-start.x)*n/8,start.y+start.height/2);
        assert.equal(await filter().getAttribute('data-glass-dragging'),'true','native touch lost pointer capture');
        await touch('touchEnd');await settled(filter());
        assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'All');
        assert.equal(await page.evaluate(()=>window.__touchClicks),1,'native touch commits exactly once');
        await touch('touchStart',stop.x+stop.width/2,stop.y+stop.height/2);
        for(let n=1;n<=5;n++)await touch('touchMove',stop.x+stop.width/2+(start.x-stop.x)*n/5,start.y+start.height/2);
        await touch('touchCancel');await settled(filter());
        assert.equal(await filter().locator('[data-selected="true"]').getAttribute('data-glass-value'),'All');
        assert.equal(await page.evaluate(()=>window.__touchClicks),1,'cancel must not commit');
        await touch('touchStart',start.x+start.width/2,start.y+start.height/2);
        for(let n=1;n<=8;n++)await touch('touchMove',start.x+start.width/2,start.y+start.height/2-n*16);
        await touch('touchEnd');
        await page.waitForFunction(()=>document.querySelector('.nx-content').scrollTop>40);
        assert.equal(await page.evaluate(()=>window.__touchClicks),1,'vertical scroll must not select');
        await chassis().locator('.nx-content').evaluate(el=>el.scrollTop=0);
        await cdp.detach();log('native-touch-release-cancel-scroll');
      }

      await page.emulateMedia({reducedMotion:'reduce'});await item(filter(),'Today').click();await settled(filter());
      assert.notEqual(await filter().getAttribute('data-glass-moving'),'true');
      await page.emulateMedia({reducedMotion:'no-preference'});log('reduced-motion');

      await trace('navigation');await item(nav(),'me').click();await page.waitForURL(/pages\/me\/me/);
      const navigation=await finishTrace('cross-page-navigation');await settled(nav());
      const arrival=navigation.filter(f=>f.value==='me'),final=arrival.at(-1);
      assert.ok(arrival.some(f=>Math.abs(f.x-final.x)>15),'new page skipped navigation movement');
      assert.ok(Math.max(...arrival.map(f=>f.x))-final.x>.5,'navigation has no rebound');
      log('cross-page-continuity',{frames:arrival.length,overshoot:Math.max(...arrival.map(f=>f.x))-final.x});

      // Interrupt real page transitions. Hidden outgoing rails must not overwrite
      // the newest lens position, and slow capture must not expire the handoff.
      await page.evaluate(()=>{
        window.__rapidNavigation={clicks:[],frames:[],active:true};
        document.addEventListener('click',event=>{
          const option=event.target.closest?.('.nx-tabbar-pill .nx-glass-option');
          if(!option || !window.__rapidNavigation.active)return;
          const rail=option.parentElement,lens=rail.querySelector('.nx-glass-indicator'),selected=rail.querySelector('[data-selected="true"]');
          window.__rapidNavigation.clicks.push({t:performance.now(),host:rail.id,to:option.dataset.glassValue,x:lens.getBoundingClientRect().x,selectedX:selected.getBoundingClientRect().x,targetX:option.getBoundingClientRect().x});
        },true);
        function sample(t){
          const rail=[...document.querySelectorAll('.nx-tabbar-pill')].filter(el=>el.getBoundingClientRect().width).at(-1);
          const lens=rail?.querySelector('.nx-glass-indicator'),selected=rail?.querySelector('[data-selected="true"]');
          if(lens && getComputedStyle(lens).visibility==='visible')window.__rapidNavigation.frames.push({t,host:rail.id,value:selected.dataset.glassValue,x:lens.getBoundingClientRect().x});
          if(window.__rapidNavigation.active)requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      const points={};
      for(const value of ['earn','me','store','team'])points[value]=await item(nav(),value).boundingBox();
      for(const value of ['earn','me','store','team']){
        const point=points[value];
        await page.mouse.click(point.x+point.width/2,point.y+point.height/2);
        await page.waitForFunction(value=>{
          const rail=[...document.querySelectorAll('.nx-tabbar-pill')].filter(el=>el.getBoundingClientRect().width).at(-1);
          const click=window.__rapidNavigation.clicks.at(-1);
          return rail?.querySelector('[data-selected="true"]')?.dataset.glassValue===value
            && window.__rapidNavigation.frames.some(frame=>frame.host===rail.id && frame.value===value && frame.t>=click.t);
        },value);
      }
      await settled(nav());
      const rapid=await page.evaluate(()=>{window.__rapidNavigation.active=false;return window.__rapidNavigation;});
      const rapidPath=resolve(out,`${engine}-rapid-navigation.json`);await writeFile(rapidPath,JSON.stringify(rapid));evidence.push(rapidPath);
      const transfers=rapid.clicks.map(click=>({click,first:rapid.frames.find(frame=>frame.t>=click.t && frame.host!==click.host && frame.value===click.to)}));
      assert.equal(transfers.length,4);assert.ok(transfers.every(row=>row.first),'missing route handoff');
      const interrupted=transfers.filter(row=>Math.abs(row.click.x-row.click.selectedX)>30);
      assert.ok(interrupted.length>0,'no in-flight navigation was interrupted');
      assert.ok(interrupted.every(row=>Math.abs(row.first.x-row.click.selectedX)>2),JSON.stringify(interrupted));
      for(const {click,first} of transfers){
        assert.ok(first.t-click.t<800,'page capture expired the navigation handoff');
        const origin=rapid.frames.filter(frame=>frame.host===click.host && frame.t>=click.t && frame.t<first.t).at(-1)??click;
        if(Math.abs(origin.x-click.targetX)>30)assert.ok(Math.abs(first.x-click.targetX)>2,'new page teleported to the destination');
      }
      assert.equal(await nav().locator('[data-selected="true"]').getAttribute('data-glass-value'),'team');
      log('rapid-page-retarget',{interruptions:interrupted.length});

      if(engine==='chromium'){
        const input=await context.newCDPSession(page);
        const a=await item(nav(),'team').boundingBox(),b=await item(nav(),'earn').boundingBox();
        const touch=(type,x,y)=>input.send('Input.dispatchTouchEvent',{type,touchPoints:/End|Cancel/.test(type)?[]:[{x,y,id:1,radiusX:2,radiusY:2,force:1}]});
        await page.evaluate(()=>{window.__navigationTouchCommits=0;document.addEventListener('click',event=>{if(event.target.closest?.('.nx-tabbar-pill .nx-glass-option'))window.__navigationTouchCommits++;},true);});
        await touch('touchStart',a.x+a.width/2,a.y+a.height/2);
        for(let n=1;n<=8;n++)await touch('touchMove',a.x+a.width/2+(b.x-a.x)*n/8,a.y+a.height/2);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await nav().getAttribute('data-glass-dragging'),'true');
        assert.equal(await nav().locator('[data-selected="true"]').getAttribute('data-glass-value'),'team');
        const held=await nav().locator('.nx-glass-indicator').boundingBox();
        assert.ok(Math.abs(held.x+held.width/2-b.x-b.width/2)<2,`navigation does not follow the finger: ${JSON.stringify({held,target:b})}`);
        await touch('touchEnd');await page.waitForURL(/pages\/earn\/earn/);await settled(nav());
        assert.equal(await page.evaluate(()=>window.__navigationTouchCommits),1);
        await touch('touchStart',b.x+b.width/2,b.y+b.height/2);
        for(let n=1;n<=8;n++)await touch('touchMove',b.x+b.width/2+(a.x-b.x)*n/8,b.y+b.height/2);
        await touch('touchCancel');await settled(nav());
        assert.equal(await nav().locator('[data-selected="true"]').getAttribute('data-glass-value'),'earn');
        assert.equal(await page.evaluate(()=>window.__navigationTouchCommits),1);
        await input.detach();log('native-navigation-drag-release-cancel');
      }

      for(const route of ['index/index','earn/earn','store/store','team/team','me/me']) {
        await goto(route);await settled(nav());
        assert.equal(await chassis().locator('.nx-header__l .nx-liquid-glass').count(),0);
        assert.equal(await chassis().locator('.nx-header__r .nx-liquid-glass').count(),1);
        const before=await chassis().locator('.nx-header__r').boundingBox();
        await scrollContent(340);
        try { await chassis().locator('.nx-header__l[data-hidden="true"]').waitFor({state:'attached',timeout:6000}); }
        catch(error) {
          await page.screenshot({path:resolve(out,`${engine}-logo-failure.png`)});
          console.log(await page.evaluate(()=>({url:location.href,scrolls:[...document.querySelectorAll('.nx-content')].map(el=>({top:el.scrollTop,h:el.scrollHeight,client:el.clientHeight})),logos:[...document.querySelectorAll('.nx-header__l')].map(el=>({hidden:el.dataset.hidden,box:el.getBoundingClientRect().toJSON()})),stack:document.elementsFromPoint(190,400).map(el=>el.className)})));
          throw error;
        }
        assert.deepEqual(await chassis().locator('.nx-header__r').boundingBox(),before);
        await scrollContent(-140);await chassis().locator('.nx-header__l[data-hidden="false"]').waitFor({state:'attached'});
        log('logo-scroll-'+route);
      }
      await goto('store/store');
      for(const theme of ['dark','light']) {
        await page.evaluate(async theme=>(await import('/src/store/theme.ts')).useTheme().setMode(theme),theme);
        await nav().locator(`.nx-glass-track[data-glass-strategy="${engine==='chromium'?'svg':'webgl'}"]`).waitFor();
        const material=await nav().locator('.nx-glass-track').evaluate(el=>({blur:el.querySelector('feGaussianBlur')?.getAttribute('stdDeviation'),tint:getComputedStyle(el.querySelector('.nx-liquid-tint')).backgroundColor}));
        if(engine==='chromium')assert.ok(Number(material.blur)<=.6,JSON.stringify(material));
        await scrollContent(160);
        await chassis().locator('.nx-header__l').waitFor({state:'hidden'});
        const path=resolve(out,`${engine}-store-${theme}.png`);await page.screenshot({path});evidence.push(path);log('clear-material-'+theme,material);
      }
      await chassis().locator('.nx-bell').click();await page.locator('.md-panel:visible').waitFor();
      await page.locator('.md-panel:visible .md-close').click();
      await chassis().locator('.nx-icon-btn').first().click();await page.waitForURL(/pages\/search\/search/);log('search-message-actions');
      await context.close();
    } finally {await browser.close();}
  }
  assert.deepEqual(errors,[]);passed=true;
} finally {
  const report={at:new Date().toISOString(),verdict:passed?'pass':'fail',mode:'full',treeMoved:false,capability:'runtime',taskId:process.env.WORKFLOW_TASK_ID,stepId:process.env.WORKFLOW_STEP_ID,checkId:process.env.WORKFLOW_CHECK_ID,runId:process.env.WORKFLOW_RUN_ID,repo:process.env.WORKFLOW_REPO??root,snapshotHash:process.env.WORKFLOW_SNAPSHOT_HASH,innerSkipped:0,steps:['glass-logo-scroll','glass-elastic-motion','glass-clear-optics'].map(id=>({id,status:passed?'pass':'fail',verdict:passed?'pass':'fail',evidence:[resolve(out,'result.json'),...evidence]})),cases,errors};
  await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2));server.stop();
}
