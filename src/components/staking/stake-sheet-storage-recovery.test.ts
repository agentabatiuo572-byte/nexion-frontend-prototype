import { StakingOpenRejectedError } from '@/api/staking-open-rejection';
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
 const deps={props:reactive({open:true,term:30}),app:reactive({accountKey:account,accountBindingEpoch:1}),amount:{value:137.25},minAmount:{value:20},canOpen:{value:true},remotePending:{value:false},pendingOpen:{value:null},recoveryBlocked:{value:false},remoteGate:registry(),staking:store,risk:{checkGate:vi.fn(()=>gate)},t:{value:{staking:{remoteUnavailableClosed:'UNSENT'},stakingV3:{toast:{openFailedTitle:'FAILED'},sheet:{failedTitle:'TERMINAL',pendingHint:'WAIT'}}}},toast:{error:vi.fn(),success:vi.fn()},emit:vi.fn(),watch,onBeforeUnmount:(f:()=>void)=>{unmount=f;},navTo:vi.fn(),fmt:vi.fn(),ApiError,StakingOpenRejectedError,normalizeCommandAmount:(v:number)=>v};
 deps.emit.mockImplementation((_event,open)=>{deps.props.open=open;});
 const actions=new Function('formatAmount',...Object.keys(deps),compiled)(String,...Object.values(deps));
 deps.amount.value=payload.amountUsdt;
 return {...deps,...actions,riskResolve,riskReject,unmount:()=>unmount()};
}
function oldLease(scope='G1',who=account,p:any=payload){const r=registry(scope),l=r.acquire(who,'open',p);r.complete(l,false);return l;}
function newAllowed(store:any){const l=store.prepareOpen(payload.tierKey,payload.amountUsdt);expect(store.releasePreparedOpen(l)).toBe(true);}
describe('Staking cancellation storage recovery',()=>{
 it.each(['close','reopen','term','account','binding','unmount'])('fresh cancellation %s clears only owned unsent preparation',async mode=>{
  const h=await harness(),otherPayload={tierKey:'usdt90d',amountUsdt:222};
  const neighbor=oldLease('G7',account,{amountUsdt:333}),otherOld=oldLease('G1',other,otherPayload);
  const running=h.submit(),fresh=registry().lookup(account,'open',payload)!;
  if(mode==='close'||mode==='reopen')h.emitClose();if(mode==='reopen')h.props.open=true;
  if(mode==='term')h.props.term=90;
  if(mode==='account'){h.app.accountKey=other;h.staking.bindAccount(other);}
  if(mode==='binding'){h.app.accountBindingEpoch++;h.staking.bindAccount(account);}
  if(mode==='unmount')h.unmount();
  h.riskResolve();await running;
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();expect(registry().lookup(account,'open',payload)).toBeNull();
  expect(registry('G7').lookup(account,'open',{amountUsdt:333})?.key).toBe(neighbor.key);
  expect(registry().lookup(other,'open',otherPayload)?.key).toBe(otherOld.key);
  h.staking.bindAccount(account);await flush();newAllowed(h.staking);expect(fresh.key).toBeTruthy();
 });
 it.each(['unavailable','pool-removed','disabled','minimum-raised'])('local preflight %s has zero financial dispatch and permits a fresh preparation',async mode=>{
  const h=await harness(),running=h.submit();
  if(mode==='unavailable')h.staking.remoteReady=false;if(mode==='pool-removed')h.staking.pools=[];
  if(mode==='disabled')h.staking.pools[0].enabled=false;if(mode==='minimum-raised')h.staking.pools[0].minAmountUsdt=999;
  h.riskResolve();await running;expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
  expect(registry().lookup(account,'open',payload)).toBeNull();newAllowed(h.staking);
 });
 it('risk rejection is unsent and released without a status or financial call',async()=>{
  const h=await harness(),running=h.submit();h.riskReject(new Error('rejected'));await running;
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();expect(api.stakingApi.openStatus).not.toHaveBeenCalled();newAllowed(h.staking);
 });
 it('true timeout retains exact key through repeat status reads, same-account rebind and reconstruction',async()=>{
  const h=await harness();api.stakingApi.openStakingPosition.mockRejectedValue(new Error('transport outcome unknown'));
  const running=h.submit(),l=registry().lookup(account,'open',payload)!;h.riskResolve();await running;
  h.staking.bindAccount(account);await flush();await h.submit();await h.submit();
  expect(api.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);expect(api.stakingApi.openStatus).toHaveBeenCalledTimes(2);
  expect(registry().lookup(account,'open',payload)?.key).toBe(l.key);expect(h.staking.releasePreparedOpen(l)).toBe(false);
  setActivePinia(createPinia());const reconstructed=useStaking();reconstructed.bindAccount(account);await flush();
  expect(reconstructed.releasePreparedOpen(l)).toBe(false);expect(()=>reconstructed.prepareOpen(payload.tierKey,payload.amountUsdt)).toThrow('G1_PENDING_RECOVERY_REQUIRED');
 });
 it.each(['UNKNOWN','PROCESSING','NOT_FOUND','MISMATCH','FAILED','SUCCEEDED'])('old request status %s preserves or retires only exact original and never POSTs',async status=>{
  const h=await harness(),old=oldLease(),otherPayload={tierKey:'usdt90d',amountUsdt:555},second=oldLease('G1',account,otherPayload);
  api.stakingApi.openStatus.mockResolvedValue(status);await h.submit();
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();expect(h.risk.checkGate).not.toHaveBeenCalled();
  const next=registry().lookup(account,'open',payload);
  if(status==='FAILED'||status==='SUCCEEDED')expect(next).toBeNull();else expect(next?.key).toBe(old.key);
  expect(registry().lookup(account,'open',otherPayload)?.key).toBe(second.key);
 });
 it('late terminal status after same-account rebind cannot retire an old unknown key',async()=>{
  const h=await harness(),old=oldLease();let resolve!:(s:string)=>void;
  api.stakingApi.openStatus.mockImplementation(()=>new Promise(r=>{resolve=r;}));const running=h.submit();
  h.staking.bindAccount(account);h.app.accountBindingEpoch++;resolve('FAILED');await running;
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('F1 regression: recovered storage retires definitely-unsent intent and permits a new request',async()=>{
  const h=await harness(),running=h.submit(),l=registry().lookup(account,'open',payload)!;
  h.emitClose();failWrites=1;h.riskResolve();await running;
  expect(failWrites).toBe(0);expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
  h.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)).toBeNull();
  newAllowed(h.staking);
  expect(api.stakingApi.openStatus).not.toHaveBeenCalled();
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('control: failed terminal storage write can recover by a later authoritative status read',async()=>{
  const h=await harness(),old=oldLease();api.stakingApi.openStatus.mockResolvedValue('FAILED');failWrites=1;
  await h.submit();expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);
  await h.submit();expect(registry().lookup(account,'open',payload)).toBeNull();expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('persistent failure keeps cancelled preparation non-dispatchable; UI restoration retries only after storage recovers',async()=>{
  const h=await harness(),running=h.submit(),old=registry().lookup(account,'open',payload)!;
  h.emitClose();failWrites=100;h.riskResolve();await running;
  expect(registry().lookup(account,'open',payload)?.key).toBe(old.key);
  await expect(h.staking.openRemote(payload.tierKey,payload.amountUsdt,old.key)).rejects.toThrow('G1_PENDING_RECOVERY_REQUIRED');
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
  failWrites=0;h.props.open=true; // actual sheet watcher must drive bounded local cleanup, no status/POST needed.
  expect(registry().lookup(account,'open',payload)).toBeNull();
  expect(api.stakingApi.openStatus).not.toHaveBeenCalled();newAllowed(h.staking);
 });
 it('account B refresh cannot clear cancelled account A proof or B/G7 unknowns; returning A recovers',async()=>{
  const h=await harness(),running=h.submit(),a=registry().lookup(account,'open',payload)!;
  const b=oldLease('G1',other,payload),g7=oldLease('G7',account,{amountUsdt:555});
  h.emitClose();failWrites=100;h.riskResolve();await running;
  failWrites=0;h.staking.bindAccount(other);h.app.accountKey=other;await flush();h.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)?.key).toBe(a.key);
  expect(registry().lookup(other,'open',payload)?.key).toBe(b.key);
  expect(registry('G7').lookup(account,'open',{amountUsdt:555})?.key).toBe(g7.key);
  h.staking.bindAccount(account);await flush();expect(registry().lookup(account,'open',payload)).toBeNull();
  expect(registry().lookup(other,'open',payload)?.key).toBe(b.key);expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
 it('retirement retry cannot delete a replacement key with the same fingerprint',async()=>{
  const h=await harness(),running=h.submit(),old=registry().lookup(account,'open',payload)!;
  h.emitClose();failWrites=100;h.riskResolve();await running;failWrites=0;
  const state:any=structuredClone(saved.get(KEY));state.pending[old.fingerprint]='g1-open-replacement-proof';saved.set(KEY,state);
  h.staking.refreshPendingOpen();
  expect(registry().lookup(account,'open',payload)?.key).toBe('g1-open-replacement-proof');
  expect(()=>h.staking.prepareOpen(payload.tierKey,payload.amountUsdt)).toThrow('G1_PENDING_RECOVERY_REQUIRED');
  expect(api.stakingApi.openStakingPosition).not.toHaveBeenCalled();
 });
});
