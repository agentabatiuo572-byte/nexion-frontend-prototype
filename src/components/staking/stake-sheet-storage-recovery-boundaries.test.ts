import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {reactive,watch} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
import ts from 'typescript';
import source from './stake-sheet.vue?raw';
import {RemoteIntentKeyRegistry} from '@/lib/g-remote-intent';
import {ApiError} from '@/api/errors';
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
 const deps={props:reactive({open:true,term:30}),app:reactive({accountKey:account,accountBindingEpoch:1}),amount:{value:137.25},minAmount:{value:20},canOpen:{value:true},remotePending:{value:false},pendingOpen:{value:null},recoveryBlocked:{value:false},remoteGate:registry(),staking:store,risk:{checkGate:vi.fn(()=>gate)},t:{value:{staking:{remoteUnavailableClosed:'UNSENT'},stakingV3:{toast:{openFailedTitle:'FAILED'},sheet:{failedTitle:'TERMINAL',pendingHint:'WAIT'}}}},toast:{error:vi.fn(),success:vi.fn()},emit:vi.fn(),watch,onBeforeUnmount:(f:()=>void)=>{unmount=f;},navTo:vi.fn(),fmt:vi.fn(),ApiError,normalizeCommandAmount:(v:number)=>v};
 deps.emit.mockImplementation((_event,open)=>{deps.props.open=open;});
 const actions=new Function('formatAmount',...Object.keys(deps),compiled)(String,...Object.values(deps));
 deps.amount.value=payload.amountUsdt;
 return {...deps,...actions,riskResolve,riskReject,unmount:()=>unmount()};
}
function oldLease(scope='G1',who=account,p:any=payload){const r=registry(scope),l=r.acquire(who,'open',p);r.complete(l,false);return l;}
function newAllowed(store:any){const l=store.prepareOpen(payload.tierKey,payload.amountUsdt);expect(store.releasePreparedOpen(l)).toBe(true);}

describe('Staking cancellation recovery boundaries',()=>{
 it('cancelled proof lost by store reconstruction stays conservatively unresolved, NOT_FOUND never POSTs',async()=>{
  const h=await harness(),running=h.submit(),old=registry().lookup(account,'open',payload)!;
  h.emitClose();failWrites=100;h.riskResolve();await running;failWrites=0;
  setActivePinia(createPinia());const fresh=await harness();fresh.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);
  await fresh.submit();expect(api.stakingApi.openStatus).toHaveBeenCalledWith(payload.tierKey,payload.amountUsdt,old.key);
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('recovered cancellation cannot dispatch through old lease even after a new identical preparation exists',async()=>{
  const h=await harness(),old=h.staking.prepareOpen(payload.tierKey,payload.amountUsdt);
  failWrites=1;expect(h.staking.releasePreparedOpen(old)).toBe(false);h.staking.refreshPendingOpen();
  const next=h.staking.prepareOpen(payload.tierKey,payload.amountUsdt);expect(next.key).not.toBe(old.key);
  await expect(h.staking.openRemote(payload.tierKey,payload.amountUsdt,old.key)).rejects.toThrow('G1_PENDING_RECOVERY_REQUIRED');
  expect(registry().lookup(account,'open',payload)?.key).toBe(next.key);expect(h.staking.releasePreparedOpen(old)).toBe(false);
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();expect(h.staking.releasePreparedOpen(next)).toBe(true);
 });
 it('close while financial call is in flight and write failure never turns dispatched unknown into retiring',async()=>{
  const h=await harness();let reject!:(e:Error)=>void;
  api.stakingApi.openStakingPosition.mockImplementation(()=>new Promise((_r,j)=>{reject=j;}));
  const running=h.submit(),old=registry().lookup(account,'open',payload)!;h.riskResolve();await flush();
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);h.emitClose();failWrites=100;
  expect(h.staking.releasePreparedOpen(old)).toBe(false);h.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);
  reject(new Error('real timeout'));await running;failWrites=0;h.props.open=true;h.staking.refreshPendingOpen();await h.submit();
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
 });
 it('late financial success after A to B cannot clear A original intent or change B snapshot',async()=>{
  const h=await harness();let resolve!:(s:any)=>void;
  api.stakingApi.openStakingPosition.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const running=h.submit(),old=registry().lookup(account,'open',payload)!;h.riskResolve();await flush();
  api.stakingApi.fetchStakingPositions.mockResolvedValue({...snap(),walletBalanceUsdt:789});
  h.app.accountKey=other;h.app.accountBindingEpoch++;h.staking.bindAccount(other);await flush();
  resolve({...snap(),walletBalanceUsdt:12});await running;h.staking.refreshPendingOpen();
  expect(h.staking.walletBalanceUsdt).toBe(789);expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);expect(h.toast.success).not.toHaveBeenCalled();
 });
 it('corrupt read during retirement remains fenced, restored original bytes permit exact unsent cleanup',async()=>{
  const h=await harness(),old=h.staking.prepareOpen(payload.tierKey,payload.amountUsdt);
  failWrites=1;expect(h.staking.releasePreparedOpen(old)).toBe(false);const good=structuredClone(saved.get(KEY));
  saved.set(KEY,{schema:999,pending:{}});expect(()=>h.staking.refreshPendingOpen()).not.toThrow();expect(h.staking.pendingOpenCount).toBe(-1);
  expect(()=>h.staking.prepareOpen(payload.tierKey,payload.amountUsdt)).toThrow();
  saved.set(KEY,good);h.staking.refreshPendingOpen();expect(registry().lookup(account,'open',payload)).toBeNull();newAllowed(h.staking);
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('write succeeds but immediate verification read fails: no resurrection and new prepare remains possible',async()=>{
  const h=await harness(),old=h.staking.prepareOpen(payload.tierKey,payload.amountUsdt);
  failWrites=1;expect(h.staking.releasePreparedOpen(old)).toBe(false);let reads=0;
  (globalThis as any).uni.getStorageSync=(k:string)=>{if(++reads===2)throw new Error('readback failure');return saved.get(k);};
  h.staking.refreshPendingOpen();expect(registry().lookup(account,'open',payload)).toBeNull();
  (globalThis as any).uni.getStorageSync=(k:string)=>saved.get(k);newAllowed(h.staking);
  await expect(h.staking.openRemote(payload.tierKey,payload.amountUsdt,old.key)).rejects.toThrow('G1_PENDING_RECOVERY_REQUIRED');
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('replacing key while an authoritative old-status response is in flight preserves replacement',async()=>{
  const h=await harness(),old=oldLease();let resolve!:(s:string)=>void;
  api.stakingApi.openStatus.mockImplementation(()=>new Promise(r=>{resolve=r;}));const running=h.submit();
  const state:any=structuredClone(saved.get(KEY));state.pending[old.fingerprint]='g1-open-s2-replaced';saved.set(KEY,state);
  resolve('SUCCEEDED');await running;h.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)?.key).toBe('g1-open-s2-replaced');expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('same-account epoch change with failed cancellation cleanup recovers proof but never dispatches old preparation',async()=>{
  const h=await harness(),running=h.submit(),old=registry().lookup(account,'open',payload)!;
  h.app.accountBindingEpoch++;h.staking.bindAccount(account);failWrites=100;h.riskResolve();await running;
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);failWrites=0;h.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)).toBeNull();newAllowed(h.staking);
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
});
