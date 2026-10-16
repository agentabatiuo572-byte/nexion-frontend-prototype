import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {reactive,watch} from 'vue';
import * as Vue from 'vue';
import {compile} from '@vue/compiler-dom';
import {createPinia,setActivePinia} from 'pinia';
import ts from 'typescript';
import source from './stake-sheet.vue?raw';
import {RemoteIntentKeyRegistry} from '@/lib/g-remote-intent';
import {ApiError} from '@/api/errors';
import {StakingOpenRejectedError} from '@/api/staking-open-rejection';
const api=vi.hoisted(()=>({remoteApiEnabled:true,stakingApi:{fetchStakingPools:vi.fn(),fetchStakingPositions:vi.fn(),openStakingPosition:vi.fn(),openStatus:vi.fn(),claimStakingPosition:vi.fn(),earlyWithdrawStakingPosition:vi.fn()}}));
vi.mock('@/api/runtime',()=>api);
const {useStaking}=await import('@/store/staking');
const lifecycle=source.slice(source.indexOf('let sheetOpenGeneration'),source.indexOf('const titleText'));
const close=source.slice(source.indexOf('function emitClose()'),source.indexOf('async function submit()'));
const submit=source.slice(source.indexOf('async function submit()'),source.indexOf('  const billRef = `STAKE-OPEN-'));
const compiled=ts.transpileModule(lifecycle+close+submit+'\n}\nreturn {submit,emitClose};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const KEY='nexgrid-g-remote-intents-v1',account='review:s3:a',other='review:s3:b';
const payload={tierKey:'usdt30d',amountUsdt:137.25};
let saved:Map<string,unknown>,failWrites:number;
const snap=()=>({sourceEnvironment:'PRODUCTION',runId:'',serverTime:Date.now(),positions:[],walletBalanceUsdt:1000});
const pools=()=>[{poolId:1,tierKey:'usdt30d',currency:'USDT',termDays:30,apy:.12,penalty:.05,minAmountUsdt:20,enabled:true,killed:false,status:'ACTIVE'}];
function storageWrite(key:string,value:unknown){if(failWrites>0){failWrites--;throw new Error('temporary local storage unavailable');}saved.set(key,structuredClone(value));}
function registry(scope='G1'){return new RemoteIntentKeyRegistry(scope,{read:()=>saved.get(KEY),write:v=>storageWrite(KEY,v)});}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
beforeEach(()=>{
 saved=new Map();failWrites=0;
 vi.stubGlobal('uni',{getStorageSync:(k:string)=>saved.get(k),setStorageSync:storageWrite});
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('NETWORK_FORBIDDEN');}));
 setActivePinia(createPinia());Object.values(api.stakingApi).forEach(f=>f.mockReset());
 api.stakingApi.fetchStakingPools.mockResolvedValue(pools());api.stakingApi.fetchStakingPositions.mockResolvedValue(snap());
 api.stakingApi.openStakingPosition.mockResolvedValue(snap());api.stakingApi.openStatus.mockResolvedValue('NOT_FOUND');
});
afterEach(()=>{expect(globalThis.fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();});
async function harness(){
 const store=useStaking();store.bindAccount(account);await flush();
 let riskResolve!:()=>void,riskReject!:(e:Error)=>void,unmount=()=>{};
 const gate=new Promise<void>((a,b)=>{riskResolve=a;riskReject=b;});
 const deps={props:reactive({open:true,term:30}),app:reactive({accountKey:account,accountBindingEpoch:1}),amount:{value:137.25},minAmount:{value:20},canOpen:{value:true},remotePending:{value:false},pendingOpen:{value:null},recoveryBlocked:{value:false},remoteGate:registry(),staking:store,risk:{checkGate:vi.fn(()=>gate)},t:{value:{staking:{remoteUnavailableClosed:'UNSENT'},stakingV3:{toast:{openFailedTitle:'UNKNOWN',insufficient:'BALANCE',minAmount:'MINIMUM'},sheet:{failedTitle:'TERMINAL',pendingHint:'WAIT',checkPrevious:'CHECK'}}}},toast:{error:vi.fn(),success:vi.fn()},emit:vi.fn(),watch,onBeforeUnmount:(f:()=>void)=>{unmount=f;},navTo:vi.fn(),fmt:vi.fn(),ApiError,StakingOpenRejectedError,normalizeCommandAmount:(v:number)=>v};
 deps.emit.mockImplementation((_event,open)=>{deps.props.open=open;});
 const actions=new Function('formatAmount',...Object.keys(deps),compiled)(String,...Object.values(deps));
 deps.amount.value=payload.amountUsdt;
 return {...deps,...actions,riskResolve,riskReject,unmount:()=>unmount()};
}
function oldLease(scope='G1',who=account,p:any=payload){const r=registry(scope),l=r.acquire(who,'open',p);r.complete(l,false);return l;}
function newAllowed(store:any){const l=store.prepareOpen(payload.tierKey,payload.amountUsdt);expect(store.releasePreparedOpen(l)).toBe(true);}

describe('Fresh staking OPEN refusals through the real store and sheet',()=>{
 const refusals = [
  ['STAKING_WALLET_INSUFFICIENT',409,'BALANCE'],
  ['STAKING_POOL_NOT_ACTIVE',409,'UNSENT'],
  ['STAKING_POOL_KILLED',409,'UNSENT'],
  ['STAKING_POOL_STOPPED',409,'UNSENT'],
  ['STAKING_GLOBAL_GATE_DISABLED',409,'UNSENT'],
  ['STAKING_MIN_AMOUNT_NOT_MET',422,'MINIMUM'],
  ['STAKING_AMOUNT_INVALID',422,'TERMINAL'],
  ['STAKING_TIER_INVALID',422,'TERMINAL'],
  ['A4_SCHEMA_PROPERTY_NOT_REGISTERED',422,'UNSENT'],
  ['A4_SCHEMA_PROPERTY_TYPE_MISMATCH',422,'UNSENT'],
  ['A4_SCHEMA_REQUIRED_PROPERTY_MISSING',422,'UNSENT'],
 ] as const;
 it.each(refusals)('HTTP refusal %s retires only its fresh key and shows the reason',async(message,code,title)=>{
  const h=await harness();api.stakingApi.openStakingPosition.mockRejectedValue(new ApiError({kind:'http',status:code,code,message}));
  const running=h.submit(),old=registry().lookup(account,'open',payload)!;h.riskResolve();await running;
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
  expect(api.stakingApi.openStatus).not.toHaveBeenCalled();
  expect(registry().lookup(account,'open',payload)).toBeNull();
  expect(h.staking.pendingOpenCount).toBe(0);expect(h.staking.remoteReady).toBe(true);
  expect(h.toast.error).toHaveBeenCalledWith(title,undefined);expect(h.toast.success).not.toHaveBeenCalled();
  await expect(h.staking.openRemote(payload.tierKey,payload.amountUsdt,old.key)).rejects.toThrow('G1_PENDING_RECOVERY_REQUIRED');
  newAllowed(h.staking);
 });
 it('HTTP200 business refusal is terminal without automatic replay',async()=>{
  const h=await harness();api.stakingApi.openStakingPosition.mockRejectedValue(new ApiError({kind:'business',status:200,code:409,message:'STAKING_WALLET_INSUFFICIENT'}));
  const running=h.submit();h.riskResolve();await running;
  expect(registry().lookup(account,'open',payload)).toBeNull();expect(h.toast.error).toHaveBeenCalledWith('BALANCE',undefined);
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
 });
 it.each([
  new ApiError({kind:'business',status:200,code:500,message:'STAKING_WALLET_INSUFFICIENT'}),
  new ApiError({kind:'http',status:500,code:409,message:'STAKING_WALLET_INSUFFICIENT'}),
  new ApiError({kind:'http',status:409,code:422,message:'STAKING_AMOUNT_INVALID'}),
  new ApiError({kind:'http',status:422,code:422,message:'IDEMPOTENCY_RESULT_UNKNOWN'}),
  new ApiError({kind:'http',status:409,code:409,message:'IDEMPOTENCY_CONFLICT'}),
  new ApiError({kind:'protocol',status:200,code:409,message:'STAKING_WALLET_INSUFFICIENT'}),
  new ApiError({kind:'http',status:500,code:422,message:'A4_SCHEMA_PROPERTY_NOT_REGISTERED'}),
  new ApiError({kind:'http',status:422,code:422,message:'A4_SCHEMA_UNRECOGNIZED_ERROR'}),
  new Error('transport timeout'),
 ])('unqualified refusal %s keeps the original key and only GETs on recovery',async(error)=>{
  const h=await harness();api.stakingApi.openStakingPosition.mockRejectedValue(error);
  const running=h.submit(),old=registry().lookup(account,'open',payload)!;h.riskResolve();await running;
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);expect(h.toast.error).toHaveBeenCalledWith('UNKNOWN');
  await h.submit();expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
  expect(api.stakingApi.openStatus).toHaveBeenCalledWith(payload.tierKey,payload.amountUsdt,old.key);
 });
 it('failed retirement preserves recovery without calling the rejected result unknown',async()=>{
  const h=await harness();api.stakingApi.openStakingPosition.mockImplementation(async()=>{
   failWrites=100;throw new ApiError({kind:'http',status:422,code:422,message:'STAKING_MIN_AMOUNT_NOT_MET'});
  });
  const running=h.submit(),old=registry().lookup(account,'open',payload)!;h.riskResolve();await running;
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);
  expect(h.staking.pendingOpenRejection).toBe('minimum');
  expect(h.toast.error).toHaveBeenCalledWith('MINIMUM','CHECK');
  const template=source.split('<template>')[1].split('</template>')[0];
  const render=new Function('Vue',compile(template,{mode:'function',prefixIdentifiers:true,isCustomElement:()=>true}).code)(Vue);
  const tree=render({open:true,term:30,recovering:true,staking:h.staking,pendingOpen:h.pendingOpen.value,
   pendingTerm:'30',t:{...h.t.value,ui:{close:'CLOSE'}},remotePending:false,recoveryBlocked:false,
   formatAmount:String,fmt:()=>'',submit:h.submit,emitClose:h.emitClose},[]);
  function texts(node:any):string {return Array.isArray(node)?node.map(texts).join('|'):typeof node==='string'?node:node&&typeof node==='object'?texts(node.children):'';}
  expect(texts(tree)).toContain('TERMINAL');expect(texts(tree)).toContain('CHECK');
  expect(texts(tree)).not.toContain('UNKNOWN');expect(texts(tree)).not.toContain('WAIT');
  expect(()=>h.staking.prepareOpen(payload.tierKey,payload.amountUsdt)).toThrow('G1_PENDING_RECOVERY_REQUIRED');
  await expect(h.staking.openRemote(payload.tierKey,payload.amountUsdt,old.key)).rejects.toThrow('G1_PENDING_RECOVERY_REQUIRED');
  failWrites=0;api.stakingApi.openStatus.mockResolvedValue('FAILED');await h.submit();
  expect(registry().lookup(account,'open',payload)).toBeNull();expect(h.staking.pendingOpenRejection).toBeNull();
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
 });
 it.each(['account','epoch','replacement'])('late refusal preserves %s isolation',async(mode)=>{
  const h=await harness();let reject!:(e:Error)=>void;
  api.stakingApi.openStakingPosition.mockImplementation(()=>new Promise((_r,j)=>{reject=j;}));
  const running=h.submit(),old=registry().lookup(account,'open',payload)!;h.riskResolve();await flush();
  if(mode==='account'){h.staking.bindAccount(other);h.app.accountKey=other;}
  if(mode==='epoch'){h.staking.bindAccount(account);h.app.accountBindingEpoch++;}
  if(mode==='replacement'){const state:any=structuredClone(saved.get(KEY));state.pending[old.fingerprint]='g1-open-replaced';saved.set(KEY,state);}
  reject(new ApiError({kind:'http',status:422,code:422,message:'STAKING_AMOUNT_INVALID'}));await running;
  expect(registry().lookup(account,'open',payload)?.key).toBe(mode==='replacement'?'g1-open-replaced':old.key);
  if(mode!=='replacement')expect(h.toast.error).not.toHaveBeenCalled();
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
 });
});
