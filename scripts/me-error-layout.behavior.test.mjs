import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json');
const {parse,compileScript,compileStyle}=require('@vue/compiler-sfc'),ts=require('typescript'),{chromium}=require('playwright');
const {compile}=require('@vue/compiler-dom');
const sourceRef=process.env.MY_ERROR_LAYOUT_SOURCE_REF;
const read=file=>sourceRef&&['src/pages/me/me.vue','src/components/me/wallet-overview.vue'].includes(file)
 ?execFileSync('git',['-C',root,'show',sourceRef+':'+file],{encoding:'utf8'}):readFileSync(root+'/'+file,'utf8'),modules={},styles=[];
const actualComponents=new Set(['src/pages/me/me.vue','src/components/me/wallet-card.vue','src/components/me/wallet-overview.vue',
 'src/components/me/wallet-action-btn.vue','src/components/ui/nx-section.vue','src/components/ui/nx-list-row.vue','src/components/ui/nx-list-group.vue','src/components/ui/nx-button.vue']);
const stub=new Set(['src/lib/passive-tab-read.ts','src/api/runtime.ts','src/api/order-api.ts','src/lib/account-scope.ts','src/lib/route.ts','src/lib/app-version.ts','src/i18n/use-t.ts','src/composables/use-tab-page-lifecycle.ts']);
function resolve(id,from){if(id==='vue')return id;let file=id.startsWith('@/')?'src/'+id.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(from),id));if(!/\.(vue|ts)$/.test(file))file+='.ts';return file;}
// Resolve imports relative to their owning source, including recursive dictionaries.
function add(file){
 if(file==='vue'||stub.has(file)||file.startsWith('src/store/')||file.endsWith('.vue')&&!actualComponents.has(file)||file in modules)return;
 modules[file]='';let input=read(file),scope='';
 if(file.endsWith('.vue')){const d=parse(input).descriptor;scope='data-v-my-'+Object.keys(modules).length;
  input=d.scriptSetup||d.script?compileScript(d,{id:scope,inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:t=>['view','text'].includes(t)}}}).content:
   'exports.default={render:new Function("Vue",'+JSON.stringify(compile(d.template.content,{mode:'function',prefixIdentifiers:true,isCustomElement:t=>['view','text'].includes(t)}).code)+')(require("vue"))};';
  for(const style of d.styles)styles.push(compileStyle({source:style.content,filename:file,id:scope,scoped:!!style.scoped}).code);}
 let code=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 code=code.replace(/require\("([^"]+)"\)/g,(_all,id)=>{const next=resolve(id,file);add(next);return 'require('+JSON.stringify(next)+')';});
 modules[file]=code+(scope?'\nexports.default.__scopeId='+JSON.stringify(scope)+';':'');
}
for(const language of ['zh','en','vi'])add('src/i18n/messages/'+language+'.ts');add('src/pages/me/me.vue');
const browser=await chromium.launch({headless:true});after(()=>browser.close());
const records=[];after(()=>{if(process.env.MY_ERROR_LAYOUT_OUTPUT)writeFileSync(process.env.MY_ERROR_LAYOUT_OUTPUT,JSON.stringify(records,null,2)+'\n');});
async function screen(language='vi',width=375,theme='dark'){
 const page=await browser.newPage({viewport:{width,height:812}});
 await page.setContent('<html data-theme="'+theme+'"><head></head><body><div id="app"></div></body></html>');
 await page.addScriptTag({path:root+'/node_modules/vue/dist/vue.global.js'});
 await page.addStyleTag({content:read('src/styles/tokens.css')+'\n'+styles.join('\n')+'\nview{display:block}text{display:inline}body{margin:0;font-family:Arial,sans-serif;background:var(--v5-bg)}.block{display:block}.flex{display:flex}.flex-1{flex:1}.items-center{align-items:center}.grid{display:grid}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.flex-col{flex-direction:column}.px-4{padding-inline:16px}.pt-3{padding-top:12px}.pb-4{padding-bottom:16px}.space-y-3>:not([hidden])~:not([hidden]){margin-top:12px}.nx-card-recovery-action{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;box-sizing:border-box}.nx-card-recovery-action:focus-visible{outline:2px solid var(--v5-brand)}'});
 await page.evaluate(({modules,language})=>{
  const V=window.Vue,calls=[],hooks={show:[],hide:[],unload:[]},locale=V.reactive({code:language}),visibility=V.reactive({hidden:false,mask:value=>visibility.hidden?'••••':String(value)});
  const call=name=>async()=>{calls.push(name);return true;};
  const app=V.reactive({accountKey:'user:1',accountBindingEpoch:1,visibleDevices:[],activeSlotCount:0,slotCap:6,remoteFleetHasSnapshot:true,remoteFleetStatus:'ready',remoteWalletReceiptHasSnapshot:false,
   user:{usdtBalance:10297.08,nexBalance:4268.32,earningBuckets:{pendingReviewUsdt:0,bonusLockedUsdt:0}},earnings:{today:2,total:1054.11},homeTruthStatus:'ready',homeTruth:{earnings:{today:{usdt:2},all:{usdt:1054.11}}},primaryWithdrawal:{amount:20,status:'sent',network:'BANK-VND',displaySubmittedAt:1792131060000},remoteWithdrawalListStatus:'ready',
   refreshRemoteFleet:call('funds'),refreshHomeTruth:call('home'),refreshRemoteWithdrawalList:call('withdrawal'),ensureHomeTruth:call('ensure-home')});
  const commission=V.reactive({eventsStatus:'ready',eventsEvidence:{aggregate:{totalUSDT:1313.69}},totalUSDTLifetime:()=>1313.69,refreshCanonicalEvents:call('commission'),ensureCanonicalEvents:call('ensure-commission')});
  const cfg=V.reactive({syncFailed:false,config:{rewards:{enabled:false,inviterReward:{nexAmount:0}}},revalidate:call('config')});
  const release=V.ref({serverCanonical:true,buckets:{pending_review:0,bonus_locked:0}}),releaseHas=V.ref(true),releaseStatus=V.ref('ready');
  const auth=V.reactive({isAuthenticated:true,accountId:'user:1'});
  const shared=V.reactive({orders:[],claimedUnused:[],hasUnseen:false,actionableUnread:0,displayName:'Fixture',remoteReady:true,nexPriceUSDT:.124,isMockMode:false,myRank:1,myOwned:0,mode:'dark',authorityStatus:'ready',authorityServerState:null,status:'none',promoSlot:'unknown',summaryStatus:'ready',summary:{monthBillCount:0},
   refresh:call('refresh'),refreshRemote:call('orders'),syncRemote:call('sync'),refreshSummary:call('bills'),refreshEligibilityRemote:call('trial-eligibility'),refreshRemoteVietQrDeposits:call('deposits')});
  let dictionaries;
  const slot={inheritAttrs:false,setup:(_props,{slots,attrs})=>()=>V.h('view',attrs,slots.default?.())};
  const fixed={vue:V,'src/store/app.ts':{useApp:()=>app},'src/store/commission.ts':{useCommission:()=>commission},'src/store/config.ts':{useConfig:()=>cfg},'src/store/auth.ts':{useAuth:()=>auth},'src/store/locale.ts':{useLocaleStore:()=>locale},
   'src/store/data-visibility.ts':{useDataVisibility:()=>visibility},'src/store/earning-release.ts':{earningsReleaseSnapshot:release,earningsReleaseHasSnapshot:releaseHas,earningsReleaseStatus:releaseStatus,refreshEarningsReleaseStatus:call('release')},
   'src/store/ui.ts':{confirm:call('confirm'),toast:{error(){},success(){},warn(){}}},'src/store/product-catalog.ts':{revalidateProductCatalog:call('catalog')},
   'src/lib/passive-tab-read.ts':{runPassiveTabRead:(_key,fn)=>fn(),invalidatePassiveTabRead:key=>calls.push('invalidate:'+key),passiveTabReadScope:()=>app.accountKey+':'+app.accountBindingEpoch},
   'src/api/runtime.ts':{remoteApiEnabled:true,fundsServerEnabled:true,sessionVault:{read:()=>({user:{userId:1}})},accountApi:{securityOverview:async()=>({twoFactorEnabled:false})},authApi:{}},
   'src/api/order-api.ts':{subscribeRuntimeRevision:()=>()=>{}},'src/lib/account-scope.ts':{captureAccountScope:()=>({}),isCurrentAccountScope:()=>true,rebindAccountScopedStores(){}},
   'src/lib/route.ts':{navTo:href=>calls.push('nav:'+href),navReset:()=>{}},'src/lib/app-version.ts':{compiledResourceVersion:{},formatResourceVersion:()=> 'UVEL fixture',readNativeResourceVersion:()=>{}},
   'src/composables/use-tab-page-lifecycle.ts':{onShow:fn=>hooks.show.push(fn),onHide:fn=>hooks.hide.push(fn),onUnload:fn=>hooks.unload.push(fn)},
   'src/i18n/use-t.ts':{useT:()=>V.computed(()=>dictionaries[locale.code]),get DICTS(){return dictionaries}},
   'src/components/card-stagger.vue':{default:slot},'src/components/tab-page-frame.vue':{default:slot},
   'src/components/me/profile-row.vue':{default:{render:()=>V.h('view',{style:'height:64px'},'Profile')}},
   'src/components/ui/data-visibility-toggle.vue':{default:{render:()=>V.h('view',{style:'width:44px;height:44px'})}}
  },cache={};
  function require(id){if(id in fixed)return fixed[id];if(id in cache)return cache[id];if(id.startsWith('src/store/'))return new Proxy({},{get:(_target,key)=>key==='trialReservesSlotNow'?()=>false:()=>shared});
   if(id.endsWith('.vue')&&!(id in modules))return{default:{render:()=>null}};
   const exports=cache[id]={};new Function('require','exports',modules[id])(require,exports);return exports;}
  dictionaries=Object.fromEntries(['zh','en','vi'].map(code=>[code,require('src/i18n/messages/'+code+'.ts')[code]]));
  const instance=V.createApp(require('src/pages/me/me.vue').default);instance.mount('#app');
  window.meFixture={app,commission,cfg,release,releaseHas,releaseStatus,releaseApi:fixed['src/store/earning-release.ts'],shared,calls,hooks,auth,locale,visibility,instance,copy:dictionaries[locale.code],settle:()=>V.nextTick(),
   fail:source=>{if(source==='all'||source==='config')cfg.syncFailed=true;if(source==='all'||source==='funds')app.remoteFleetStatus='error';if(source==='all'||source==='release')releaseStatus.value='error';if(source==='all'||source==='earnings'){app.homeTruthStatus='error';commission.eventsStatus='error'}if(source==='all'||source==='withdrawal')app.remoteWithdrawalListStatus='error';},
   recover:()=>{cfg.syncFailed=false;app.remoteFleetStatus='ready';releaseStatus.value='ready';app.homeTruthStatus='ready';commission.eventsStatus='ready';app.remoteWithdrawalListStatus='ready';},
   anchors:()=>Object.fromEntries(['.wallet-overview-card','.me-shortcuts','.me-network-grid','[data-quick-key="security"]','[data-me-action="sign-out"]','.font-mono-tabular'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{y:r.y+scrollY,height:r.height}]}))};
 },{modules,language});
 return page;
}
for(const language of ['zh','en','vi'])for(const width of [320,375,430])for(const theme of ['dark','light'])test(`combined Me multi-error anchors and recovery ${language}/${width}/${theme}`,async()=>{
 const p=await screen(language,width,theme);try{
  const before=await p.evaluate(()=>{const f=window.meFixture,anchors=f.anchors();scrollTo(0,Math.max(0,anchors['.me-shortcuts'].y-300));return{anchors,scroll:scrollY,calls:[...f.calls]}});
  await p.evaluate(async()=>{window.meFixture.fail('all');await window.meFixture.settle()});
  const failed=await p.evaluate(()=>{const f=window.meFixture;return{anchors:f.anchors(),scroll:scrollY,count:document.querySelectorAll('.wallet-recovery').length,text:document.body.textContent,copy:f.copy,
   afterFooter:[...document.querySelectorAll('.wallet-recovery')].every(node=>node.getBoundingClientRect().y+scrollY>f.anchors()['.font-mono-tabular'].y),metricCount:document.querySelectorAll('[data-wallet-metric]').length,calls:[...f.calls],overflow:document.documentElement.scrollWidth>innerWidth}});
  records.push({language,width,theme,before:before.anchors,failed:failed.anchors,scrollBefore:before.scroll,scrollFailed:failed.scroll});
  assert.equal(failed.count,5);assert.equal(failed.afterFooter,true);assert.deepEqual(failed.anchors,before.anchors);assert.equal(failed.scroll,before.scroll);assert.equal(failed.metricCount,4);assert.deepEqual(failed.calls,before.calls);
  assert.equal(failed.overflow,false);
  for(const copy of [failed.copy.wallet.syncFailedBody,failed.copy.wallet.fundsStaleBody,failed.copy.wallet.releaseDetailsUnavailable,failed.copy.wallet.earningsUnavailable,failed.copy.empty.errorDesc])assert.ok(failed.text.includes(copy));
  const retries=p.locator('.wallet-recovery [role="button"]');assert.equal(await retries.count(),4);
  for(const retry of await retries.all()){await retry.scrollIntoViewIfNeeded();const box=await retry.boundingBox();assert.ok(box.width>=44&&box.height>=44);await retry.focus();assert.equal(await retry.evaluate(node=>getComputedStyle(node).outlineStyle),'solid');}
  await p.evaluate(async()=>{window.meFixture.recover();await window.meFixture.settle()});
  assert.equal(await p.locator('.wallet-recovery').count(),0);assert.deepEqual(await p.evaluate(()=>window.meFixture.anchors()),before.anchors);
 }finally{await p.close()}
});
test('existing retry actions remain reads, with no duplicate automatic dispatch or metric instances',async()=>{
 const p=await screen();try{
  assert.deepEqual(await p.evaluate(()=>window.meFixture.calls),[]);
  await p.evaluate(async()=>{window.meFixture.fail('all');await window.meFixture.settle()});
  const copy=await p.evaluate(()=>window.meFixture.copy);
  for(const [text,expected] of [[copy.wallet.fundsStaleBody,['invalidate:remote-fleet','funds']],
    [copy.wallet.releaseDetailsUnavailable,['invalidate:earning-release','release']],
    [copy.wallet.earningsUnavailable,['home','commission']],[copy.empty.errorDesc,['withdrawal']]]){
    await p.evaluate(()=>{window.meFixture.calls.length=0});
    await p.locator('.wallet-recovery').filter({hasText:text}).locator('[role="button"]').click();
    assert.deepEqual(await p.evaluate(()=>window.meFixture.calls),expected);
  }
  await p.locator('.wallet-withdrawal-activity').click();assert.ok((await p.evaluate(()=>window.meFixture.calls)).includes('nav:/pages/me/wallet-withdraw-tracking'));
  const metrics=await p.locator('[data-wallet-metric]').allTextContents();assert.ok(metrics.every(value=>!value.includes('$0.00')));assert.equal(metrics.length,4);
 }finally{await p.close()}
});
test('cold unknown, ordinary pending, failures and subsequent recovery retain the static shell',async()=>{
 const p=await screen();try{
  const base=await p.evaluate(()=>window.meFixture.anchors());
  await p.evaluate(async()=>{const f=window.meFixture;f.app.homeTruth=null;f.commission.eventsEvidence=null;f.releaseHas.value=false;f.release.value=null;
   f.app.homeTruthStatus='loading';f.commission.eventsStatus='loading';f.releaseStatus.value='loading';await f.settle()});
  assert.equal(await p.locator('.wallet-recovery').count(),0);assert.deepEqual(await p.evaluate(()=>window.meFixture.anchors()),base);
  assert.ok((await p.locator('[data-wallet-metric="all-time"]').textContent()).includes('-'));
  await p.evaluate(async()=>{window.meFixture.fail('all');await window.meFixture.settle()});assert.equal(await p.locator('.wallet-recovery').count(),5);
  await p.evaluate(async()=>{const f=window.meFixture;f.recover();f.app.homeTruth={earnings:{today:{usdt:2},all:{usdt:0}}};f.commission.eventsEvidence={aggregate:{totalUSDT:0}};
   f.release.value={serverCanonical:true,buckets:{pending_review:0,bonus_locked:0}};f.releaseHas.value=true;await f.settle()});
  assert.equal(await p.locator('.wallet-recovery').count(),0);assert.ok((await p.locator('[data-wallet-metric="all-time"]').textContent()).includes('$0.00'));
 }finally{await p.close()}
});
test('release retry is a single real dispatch through pending, repeated failure and successful readback',async()=>{
 const p=await screen();try{
  await p.evaluate(async()=>{const f=window.meFixture;f.releaseHas.value=false;f.release.value=null;f.fail('release');
   f.releaseApi.refreshEarningsReleaseStatus=()=>{f.calls.push('release');f.releaseStatus.value='loading';return new Promise((resolve,reject)=>{window.releaseResult={resolve,reject}})};await f.settle()});
  const copy=await p.evaluate(()=>window.meFixture.copy),button=p.locator('.wallet-recovery').filter({hasText:copy.wallet.releaseDetailsUnavailable}).locator('[role="button"]');
  await button.click();await p.evaluate(()=>window.meFixture.settle());assert.equal(await p.locator('.wallet-recovery').count(),0);
  assert.equal((await p.evaluate(()=>window.meFixture.calls)).filter(call=>call==='release').length,1);
  assert.ok((await p.locator('[data-wallet-metric="locked"]').textContent()).includes('—'));
  await p.evaluate(async()=>{window.meFixture.releaseStatus.value='error';window.releaseResult.reject(new Error('offline'));await window.meFixture.settle()});
  assert.equal(await p.locator('.wallet-recovery').count(),1);await button.click();
  await p.evaluate(async()=>{const f=window.meFixture;f.release.value={serverCanonical:true,buckets:{pending_review:4.5,bonus_locked:7}};f.releaseHas.value=true;f.releaseStatus.value='ready';window.releaseResult.resolve(true);await f.settle()});
  assert.equal(await p.locator('.wallet-recovery').count(),0);assert.ok((await p.locator('[data-wallet-metric="locked"]').textContent()).includes('$7.00'));
  assert.equal((await p.evaluate(()=>window.meFixture.calls)).filter(call=>call==='release').length,2);
 }finally{await p.close()}
});
test('unread indicators and all static entries survive multi-source failure and successful recovery',async()=>{
 const p=await screen();try{
  await p.evaluate(async()=>{const f=window.meFixture;f.shared.hasUnseen=true;f.shared.actionableUnread=7;await f.settle()});
  const dots=await p.locator('.me-row-dot').count(),entries=await p.locator('[data-quick-key]').count();assert.ok(dots>0);
  await p.evaluate(async()=>{window.meFixture.fail('all');await window.meFixture.settle()});
  assert.equal(await p.locator('.me-row-dot').count(),dots);assert.equal(await p.locator('[data-quick-key]').count(),entries);
  await p.evaluate(async()=>{window.meFixture.recover();await window.meFixture.settle()});assert.equal(await p.locator('.me-row-dot').count(),dots);
 }finally{await p.close()}
});
test('removing tail feedback may clamp a bottom reader, while original document anchors remain unchanged',async()=>{
 const p=await screen();try{
  const before=await p.evaluate(()=>window.meFixture.anchors());
  await p.evaluate(async()=>{window.meFixture.fail('all');await window.meFixture.settle();scrollTo(0,document.documentElement.scrollHeight)});
  const failed=await p.evaluate(()=>({scroll:scrollY,max:document.documentElement.scrollHeight-innerHeight}));
  await p.evaluate(async()=>{window.meFixture.recover();await window.meFixture.settle()});
  const recovered=await p.evaluate(()=>({scroll:scrollY,max:document.documentElement.scrollHeight-innerHeight,anchors:window.meFixture.anchors()}));
  assert.deepEqual(recovered.anchors,before);assert.ok(recovered.max<failed.max);assert.ok(recovered.scroll<=recovered.max);
  records.push({boundary:'bottom-tail-removal',failed,recovered});
 }finally{await p.close()}
});
for(const source of ['config','funds','release','earnings','withdrawal'])test(`single ${source} failure stays after existing Me content`,async()=>{
 const p=await screen();try{const before=await p.evaluate(()=>window.meFixture.anchors());await p.evaluate(async source=>{window.meFixture.fail(source);await window.meFixture.settle()},source);
 assert.equal(await p.locator('.wallet-recovery').count(),1);assert.deepEqual(await p.evaluate(()=>window.meFixture.anchors()),before);
 }finally{await p.close()}
});
for(const language of ['zh','en','vi'])for(const theme of ['dark','light'])test(`confirmed long subtotals keep their structure through unknown ${language}/${theme}`,async()=>{
 const p=await screen(language,320,theme);try{
  await p.evaluate(async()=>{const f=window.meFixture;f.app.homeTruth.earnings.all.usdt=12345678.12;f.commission.eventsEvidence.aggregate.totalUSDT=23456789.23;await f.settle()});
  const before=await p.evaluate(()=>({anchors:window.meFixture.anchors(),height:document.querySelector('[data-wallet-metric="all-time"] .wallet-metric-sub').getBoundingClientRect().height}));
  const breakdown=p.locator('[data-wallet-metric="all-time"] .wallet-metric-sub');
  const label=await breakdown.getAttribute('aria-label');assert.ok(label.includes('$12,345,678.12'));assert.ok(label.includes('$23,456,789.23'));
  const amounts=breakdown.locator('.wallet-metric-breakdown__amount');assert.deepEqual(await amounts.allTextContents(),['$12,345,678.12','$23,456,789.23']);
  await p.evaluate(async()=>{window.meFixture.fail('all');await window.meFixture.settle()});
  const failed=await p.evaluate(()=>({anchors:window.meFixture.anchors(),height:document.querySelector('[data-wallet-metric="all-time"] .wallet-metric-sub').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.deepEqual(failed.anchors,before.anchors);assert.equal(failed.height,before.height);assert.equal(failed.overflow,false);
  assert.deepEqual(await amounts.allTextContents(),['-','-']);assert.ok(!(await breakdown.getAttribute('aria-label')).includes('12,345,678'));
  await p.evaluate(async()=>{window.meFixture.recover();await window.meFixture.settle()});assert.deepEqual(await p.evaluate(()=>window.meFixture.anchors()),before.anchors);
  records.push({case:'long-confirmed-subtotals',language,theme,before,failed});
 }finally{await p.close()}
});
test('localized label fragments remain literal text around recognized amount placeholders',async()=>{
 const p=await screen('en',320);try{
  await p.evaluate(async()=>{const f=window.meFixture;f.copy.wallet.allTimeSublabel='constructor {c} toString {tm}';f.app.homeTruth.earnings.all.usdt+=1;await f.settle()});
  assert.deepEqual(await p.locator('.wallet-metric-breakdown__part:not(.wallet-metric-breakdown__amount)').allTextContents(),['constructor ',' toString ']);
  assert.ok((await p.locator('.wallet-metric-breakdown').getAttribute('aria-label')).startsWith('constructor $'));
 }finally{await p.close()}
});
