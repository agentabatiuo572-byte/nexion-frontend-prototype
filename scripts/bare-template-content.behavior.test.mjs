import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, compileScript } from '@vue/compiler-sfc';
import { build } from 'esbuild';
import ts from 'typescript';
import { chromium } from 'playwright';

// Full production SFC setup + full template in a real DOM. Only transport,
// account facts and unrelated presentation shells are process-local fixtures.
const root=process.cwd(), files={daily:'src/pages/daily/daily.vue',power:'src/components/daily/streak-power-ups.vue',nex:'src/pages/trust/nex.vue',trust:'src/pages/trust/trust.vue',invite:'src/components/team/invite-detail-sheet.vue'};
const compiled=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,ts.transpileModule(compileScript(parse(process.env.CONTENT_SOURCE_REF ? execFileSync('git',['show',process.env.CONTENT_SOURCE_REF+':'+file],{encoding:'utf8'}) : fs.readFileSync(file,'utf8')).descriptor,{id:'content-'+name,inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>['view','text'].includes(tag)}}}).content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText]));
const entry=`
import * as Vue from 'vue';import * as __fx64000 from './src/i18n/trust-center';
import {zh} from './src/i18n/messages/zh';import {en} from './src/i18n/messages/en';import {vi} from './src/i18n/messages/vi';
import * as amount from './src/lib/amount-display';import {fmt} from './src/i18n/format';
import {formatTrialDateTime} from './src/lib/trial-date';import {formatDisplayDate} from './src/lib/display-date';
import * as rewards from './src/pages/daily/daily-reward-view';import {dailyCheckInSuccessCopy} from './src/pages/daily/daily-success-copy';
import {binarySessionReady} from './src/lib/binary-session-ready';import {createScopedReadCoalescer} from './src/lib/binary-read-coalescer';
import * as powerCopy from './src/lib/power-up-copy';import {canonicalPowerUpTarget} from './src/lib/remote-powerup-target';import {questActionDomain} from './src/lib/quest-business-availability';
import {teamRedesignCopy,referralSettlementStatus} from './src/i18n/team-redesign';
import {networkReauditCopy} from './src/i18n/network-reaudit';import {continuityCopy} from './src/i18n/continuity-fixes';
import {trustResources} from './src/pages/trust/trust-resources';import {trustCategoryMaterial} from './src/pages/trust/trust-category-material';import * as trustFields from './src/lib/trust-fields';import {resolvePublishedNexNarrative} from './src/lib/nex-published-content';
const codes=${JSON.stringify(compiled)}, dictionaries={zh,en,vi};
const shell=Vue.defineComponent({props:['label','title','sub','q','a'],setup:(p,{slots})=>()=>Vue.h('view',{},[p.label,p.title,p.sub,p.q,p.a,slots.default?.()])});
window.mountContent=(kind,language,state)=>{
 const locale=Vue.reactive({code:language}),io={checkIn:0,milestone:0,saver:0,power:0,navigate:0,credit:0};
 const command=name=>async()=>{io[name]++;return {ok:false}};
 const powerRows=[['ROYALTY_BOOST','团队成长徽章','/team',7,true],['STREAK_BADGE','连续签到徽章','/me/rewards',14,true],['STAKING_APY','质押活动入口','/wallet/staking',30,false],['GENESIS_ALLOWLIST','Genesis 资格入口','/market/genesis',60,false]].map(([powerUpCode,name,targetPath,unlockStreakDays,businessAvailable],i)=>({powerUpId:i+1,powerUpCode,name,targetPath,unlockStreakDays,businessAvailable,effectType:'ROUTE_BADGE',effectValue:'published note',status:'LOCKED'}));
 const faucet=Vue.reactive({remoteReadState:state,signInStreak:3,longestStreak:4,streakSavers:1,lastSignedInAt:0,remoteCheckedInToday:false,remoteNextResetAt:Date.now()+3600000,claimedMilestones:[],remoteRules:[],remoteMilestones:[{milestoneDay:7,rewardType:'NEX',rewardAmount:15,status:'LOCKED'}],remotePowerUps:powerRows,topStreakers:[],history:[],ensureRemote:async()=>state==='ready',refreshRemote:async()=>true,checkInRemote:command('checkIn'),claimMilestoneRemote:command('milestone'),useSaverRemote:command('saver')});
 const app=Vue.reactive({accountKey:'user:1',accountBindingEpoch:1,user:{nexBalance:12},remoteFleetHasSnapshot:true,remoteFleetStatus:'ready',refreshRemoteFleet:async()=>true});
 const auth=Vue.reactive({accountId:'user:1',isAuthenticated:true});
 const bills=Vue.reactive({summaryStatus:state==='ready'?'ready':state,summary:{settledRewardsNex:15,withdrawalOffsetNexSpent:0,recentNexBills:[]},refreshSummary:async()=>true});
 const apiRuntimeConfig=Vue.reactive({environment:'dev'}),sections=Vue.ref([{sectionKey:'leadership',version:'v1',fields:[{key:'leader1Name',value:'Published Leader'},{key:'leader1Role',value:'Published Role'},{key:'leader1Url',value:'https://example.invalid/profile'}]}]);
 const published={sections,status:Vue.ref('ready'),refreshing:Vue.ref(false),refreshError:Vue.ref(false),refresh:async()=>true};
 const rewardsStore=Vue.reactive({loading:false,error:null,snapshot:{lifetimeInviterNex:12,settledCount:1,pendingCount:0,recentRewards:[{settlementNo:'fixture',settledAt:'2026-10-01T00:00:00Z',amountNex:12,releaseBucket:'AVAILABLE'}]},refresh:async()=>true});
 const noop=()=>{},toast={success:noop,error:noop,warn:noop,info:noop},nav=()=>io.navigate++;
 const deps={vue:Vue,'@/composables/use-trust-documents':{useTrustDocuments:()=>({documents:Vue.ref(null),status:Vue.ref('ready'),refresh:async()=>true})},'@/i18n/trust-center':__fx64000,'@dcloudio/uni-app':{onShow:noop,onHide:noop},'@/lib/amount-display':amount,'@/lib/route':{navTo:nav,navBack:nav,navReplace:nav},'@/i18n/use-t':{useT:()=>Vue.computed(()=>dictionaries[locale.code])},'@/store/locale':{useLocaleStore:()=>locale},'@/i18n/format':{fmt,dateLocale:()=>locale.code},'@/store/nex-faucet':{useNexFaucet:()=>faucet},'@/store/app':{useApp:()=>app},'@/store/auth':{useAuth:()=>auth},'@/store/bills':{useBills:()=>bills},'@/store/lucky-spin':{useLuckySpin:()=>({})},'@/store/ui':{toast},'@/api/runtime':{remoteApiEnabled:true,apiRuntimeConfig,sessionVault:{read:()=>({user:{userId:1}})}},'@/lib/binary-session-ready':{binarySessionReady},'@/lib/binary-read-coalescer':{createScopedReadCoalescer},'@/api/order-api':{captureRuntimeRevision:()=>({runId:'',epoch:1}),subscribeRuntimeRevision:()=>noop},'@/lib/trial-date':{formatTrialDateTime},'@/lib/display-date':{formatDisplayDate},'@/lib/wallet-bill-display':{resolveWalletBillMemo:()=>''},'@/api/geo-policy-error':{geoPolicyUserMessage:()=>null},'@/lib/money-receipt':{postMoneyBillsOnce:()=>io.credit++},'./daily-reward-view':rewards,'./daily-success-copy':{dailyCheckInSuccessCopy},'@/lib/power-up-copy':powerCopy,'@/store/config':{useConfig:()=>({isEnabled:()=>true,syncFailed:false,config:{verifiedStats:null,rewards:{welcomeGift:{nexAmount:0}}}})},'@/store/daily-powerup':{useDailyPowerUp:()=>({hasClaimed:()=>false,claimRemote:command('power')})},'@/lib/remote-powerup-target':{canonicalPowerUpTarget},'@/lib/quest-business-availability':{questActionDomain},'@/composables/use-quest-target-availability':{useQuestTargetAvailability:()=>Vue.ref({stakingClosed:true})},'@/composables/use-genesis-sale-gate':{useGenesisSaleGate:()=>({block:Vue.ref(null),secondaryBlock:Vue.ref(null)})},'@/store/genesis-config':{genesisBlockIsKnownUnavailable:()=>false},'@/store/referral-reward':{useReferralReward:()=>rewardsStore},'@/i18n/team-redesign':{teamRedesignCopy,referralSettlementStatus},'@/store/data-visibility':{useDataVisibility:()=>({mask:String})},'@/composables/use-dialog-a11y':{useDialogA11y:noop},'@/i18n/network-reaudit':{networkReauditCopy},'@/i18n/continuity-fixes':{continuityCopy},'./trust-resources':{trustResources},'./trust-category-material':{trustCategoryMaterial},'@/lib/trust-fields':trustFields,'@/composables/use-published-trust':{usePublishedTrust:()=>published,recordPublishedTrustViews:noop},'@/lib/nex-published-content':{resolvePublishedNexNarrative},'@/store/market':{useMarket:()=>({isMockMode:false,remoteReady:false,nexPriceUSDT:0,syncRemote:async()=>true})}};
 function component(name){const e={};new Function('require','exports',codes[name])(id=>{if(id==='@/components/daily/streak-power-ups.vue')return {default:component('power')};if(id.endsWith('.vue'))return {default:shell};if(!(id in deps))throw new Error('Missing fixture import '+id);return deps[id]},e);return e.default;}
 const mounted=Vue.createApp(component(kind),kind==='invite'?{open:true,mode:'records'}:{});mounted.mount('#app');
 window.fixture={locale,faucet,app,auth,bills,io,apiRuntimeConfig,unmount:()=>mounted.unmount(),ready:()=>Vue.nextTick(),copy:()=>dictionaries[locale.code],sections};
};`;
const bundle=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'full-content-fixture.js'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'alias',setup(b){
 b.onResolve({filter:/^@\/store\/(locale|i18n-runtime)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useLocaleStore=()=>({code:"en"});export const useI18nRuntime=()=>({});'}));
 b.onResolve({filter:/^@\//},args=>({path:path.join(root,'src',args.path.slice(2)+(/\.[a-z]+$/.test(args.path)?'':'.ts'))}));
}}]});
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser.close();});
async function pageFor(kind,language='vi',state='ready'){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',route=>route.abort());
 await page.setContent('<style>view,text{display:block}body{margin:0}svg{max-width:24px;max-height:24px}.block{display:block}:root{--v5-surface:#111;--v5-ink:#fff;--font-v5:sans-serif;--ui-space-inline:12px}</style><div id="app"></div>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(([k,l,s])=>window.mountContent(k,l,s),[kind,language,state]);
 await page.evaluate(()=>window.fixture.ready());return page;
}
const visibleText=async(page,label)=>page.evaluate(label=>[...document.querySelectorAll('text')].some(el=>el.textContent===label&&el.getBoundingClientRect().height>0),label);
for(const language of ['zh','en','vi'])for(const state of ['ready','loading','idle','error'])test(`full Daily DOM exposes static sections in ${language}/${state} while unknown commands remain blocked`,async()=>{
 const page=await pageFor('daily',language,state);try{
  const labels=await page.evaluate(()=>{const d=window.fixture.copy().daily;return [d.activeStreak,d.milestones.label,d.powerUps.label,d.saver.label,d.topStreakers.label,d.balance,d.recent,d.powerUps.footer]});
  for(const label of labels)assert.equal(await visibleText(page,label),true,'inert/missing section: '+label);
  assert.equal(await page.locator('#app template').count(),0);
  assert.equal(await page.locator('text.tabular-nums').first().textContent(),state==='ready'?'3':'—');
  if(state!=='ready'){
   await page.evaluate(()=>{for(const b of document.querySelectorAll('[role=button][aria-disabled=true]'))b.click()});
   assert.deepEqual(await page.evaluate(()=>window.fixture.io),{checkIn:0,milestone:0,saver:0,power:0,navigate:0,credit:0});
  }else{
   const names=await page.evaluate(()=>{const w=window.fixture.copy().daily.powerUps;return [w.teamGrowthBadge,w.checkInStreakBadge,w.stakingActivityEntry,w.genesisEligibilityEntry]});
   for(const name of names)assert.equal(await visibleText(page,name),true,name);
  }
 }finally{await page.close()}
});
test('full Daily DOM keeps its static shell through ready/loading/error and account/environment invalidation',async()=>{
 const page=await pageFor('daily');try{
  for(const change of ['loading','error','account','environment']){
   await page.evaluate(change=>{const f=window.fixture;if(change==='account')f.app.accountBindingEpoch++;else if(change==='environment')f.apiRuntimeConfig.environment='prod';else f.faucet.remoteReadState=change;},change);
   await page.evaluate(()=>window.fixture.ready());
   const labels=await page.evaluate(()=>{const d=window.fixture.copy().daily;return [d.activeStreak,d.milestones.label,d.powerUps.label,d.powerUps.footer]});
   for(const label of labels)assert.equal(await visibleText(page,label),true,label);
   if(change!=='loading')assert.equal(await page.locator('text.tabular-nums').first().textContent(),'—');
  }
  assert.deepEqual(await page.evaluate(()=>window.fixture.io),{checkIn:0,milestone:0,saver:0,power:0,navigate:0,credit:0});
 }finally{await page.close()}
});
test('full NEX explanation DOM renders its static published shell in an unknown read',async()=>{
 const page=await pageFor('nex');try{const labels=await page.evaluate(()=>{const w=window.fixture.copy().nexHowItWorks;return [w.s1Title,w.s2Title,w.faqTitle]});for(const label of labels)assert.ok((await page.locator('body').innerText()).includes(label),label);assert.equal(await page.locator('#app template').count(),0);}finally{await page.close()}
});
test('full Trust DOM renders the published, permitted leadership branch',async()=>{
 const page=await pageFor('trust');try{assert.ok((await page.locator('body').innerText()).includes('Published Leader'));assert.equal(await page.locator('#app template').count(),0);}finally{await page.close()}
});
test('full invite-record dialog DOM exposes current scoped reward rows',async()=>{
 const page=await pageFor('invite');try{assert.equal(await page.locator('.invite-detail__total').evaluate(el=>el.getBoundingClientRect().height>0),true);assert.ok((await page.locator('body').innerText()).includes('12.00 UVT'));assert.equal(await page.locator('#app template').count(),0);}finally{await page.close()}
});
