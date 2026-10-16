import { StakingOpenRejectedError } from '@/api/staking-open-rejection';
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { reactive, watch } from "vue";
import ts from "typescript";
import source from "./stake-sheet.vue?raw";
import { RemoteIntentKeyRegistry } from "@/lib/g-remote-intent";
import { normalizeCommandAmount } from "@/lib/command-amount";
import { formatAmount } from "@/lib/amount-display";
import { zh } from "@/i18n/messages/zh";
import { ApiError } from "@/api/errors";

const runtime = vi.hoisted(() => ({ remoteApiEnabled: true, stakingApi: {
  fetchStakingPools: vi.fn(), fetchStakingPositions: vi.fn(), openStakingPosition: vi.fn(),
  openStatus: vi.fn(), claimStakingPosition: vi.fn(), earlyWithdrawStakingPosition: vi.fn(),
} }));
vi.mock("@/api/runtime", () => runtime);
const { useStaking } = await import("@/store/staking");
const lifecycle = source.slice(source.indexOf("let sheetOpenGeneration"), source.indexOf("const titleText"));
const close = source.slice(source.indexOf("function emitClose()"), source.indexOf("async function submit()"));
const submit = source.slice(source.indexOf("async function submit()"), source.indexOf("  const billRef = `STAKE-OPEN-"));
const compiled = ts.transpileModule(lifecycle + close + submit + "\n}\nreturn {submit,emitClose};", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const account = "user:900123";
const payload = { tierKey: "usdt30d", amountUsdt: 137.25 };
let storage: Map<string, unknown>;
const registry = () => new RemoteIntentKeyRegistry("G1", {
  read: () => storage.get("nexgrid-g-remote-intents-v1"),
  write: value => storage.set("nexgrid-g-remote-intents-v1", structuredClone(value)),
});
const pools = () => [30,90,180,365].map((term, i) => ({
  poolId:i+1,tierKey:`usdt${term}d`,currency:"USDT",termDays:term,apy:.12,penalty:.05,
  minAmountUsdt:20,enabled:true,killed:false,status:"ACTIVE",
}));
const snapshot = () => ({ positions:[],positionsPage:{total:0,pageNum:1,pageSize:50},
  walletBalanceUsdt:1000,serverTime:Date.now(),sourceEnvironment:"PRODUCTION",runId:"" });
async function flush() { for (let i=0;i<6;i++) await Promise.resolve(); }
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("uni", { getStorageSync:(key:string)=>storage.get(key),
    setStorageSync:(key:string,value:unknown)=>storage.set(key,structuredClone(value)) });
  setActivePinia(createPinia());
  Object.values(runtime.stakingApi).forEach(method=>method.mockReset());
  runtime.stakingApi.fetchStakingPools.mockResolvedValue(pools());
  runtime.stakingApi.fetchStakingPositions.mockResolvedValue(snapshot());
  runtime.stakingApi.openStakingPosition.mockResolvedValue(snapshot());
  runtime.stakingApi.openStatus.mockResolvedValue("NOT_FOUND");
});
async function harness() {
  const staking = useStaking();
  staking.bindAccount(account); await flush();
  expect(staking.remoteReady).toBe(true);
  let finishRisk!:()=>void, unmount!:()=>void;
  const gate=new Promise<void>(resolve=>{finishRisk=resolve;});
  const deps={
    props:reactive({open:true,term:30}),amount:{value:137.25},minAmount:{value:20},canOpen:{value:true},
    app:reactive({accountKey:account,accountBindingEpoch:1}),remotePending:{value:false},
    pendingOpen:{value:null},recoveryBlocked:{value:false},remoteGate:registry(),staking,
    risk:{checkGate:vi.fn(()=>gate)},t:{value:zh},toast:{error:vi.fn(),success:vi.fn()},
    emit:vi.fn(),watch,onBeforeUnmount:(callback:()=>void)=>{unmount=callback;},
    navTo:vi.fn(),fmt:vi.fn(),ApiError,StakingOpenRejectedError,normalizeCommandAmount,
  };
  deps.emit.mockImplementation((_name:string,open:boolean)=>{deps.props.open=open;});
  const actions=new Function("formatAmount",...Object.keys(deps),compiled)(formatAmount,...Object.values(deps)) as {
    submit:()=>Promise<void>;emitClose:()=>void;
  };
  deps.amount.value=137.25;
  return {...deps,...actions,finishRisk,unmount:()=>unmount()};
}
function expectFreshAllowed(staking:ReturnType<typeof useStaking>, previousKey:string) {
  const next=staking.prepareOpen(payload.tierKey,payload.amountUsdt);
  expect(next.key).not.toBe(previousKey);
  expect(staking.releasePreparedOpen(next)).toBe(true);
}

describe("actual sheet + real Pinia preparation ownership and dispatch boundary",()=>{
  it.each(["close","reopen","term","account","binding","unmount"])("retires only a fresh unsent request after %s during disclosure",async mode=>{
    const h=await harness(), running=h.submit();
    const lease=registry().lookup(account,"open",payload)!;
    expect(lease).not.toBeNull();
    if(mode==="close"||mode==="reopen")h.emitClose();
    if(mode==="reopen")h.props.open=true;
    if(mode==="term")h.props.term=90;
    if(mode==="account"){h.app.accountKey="user:900124";h.staking.bindAccount(h.app.accountKey);await flush();}
    if(mode==="binding"){h.app.accountBindingEpoch++;h.staking.bindAccount(account);await flush();}
    if(mode==="unmount")h.unmount();
    h.finishRisk();await running;
    expect(runtime.stakingApi.openStakingPosition).not.toHaveBeenCalled();
    expect(registry().lookup(account,"open",payload)).toBeNull();
    expect(h.toast.success).not.toHaveBeenCalled();
    expectFreshAllowed(h.staking,lease.key);
  });

  it.each(["not-ready","missing-pool","stopped","raised-minimum"])("retires a fresh request rejected by actual store %s preflight without a financial API call",async mode=>{
    const h=await harness(),running=h.submit(),lease=registry().lookup(account,"open",payload)!;
    if(mode==="not-ready")h.staking.remoteReady=false;
    if(mode==="missing-pool")h.staking.pools=[];
    if(mode==="stopped")h.staking.pools[0].enabled=false;
    if(mode==="raised-minimum")h.staking.pools[0].minAmountUsdt=500;
    h.finishRisk();await running;
    expect(runtime.stakingApi.openStakingPosition).not.toHaveBeenCalled();
    expect(registry().lookup(account,"open",payload)).toBeNull();
    expect(h.pendingOpen.value).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith(zh.staking.remoteUnavailableClosed);
    expectFreshAllowed(h.staking,lease.key);
  });

  it("retains the key after a genuinely called financial API rejects, and NOT_FOUND never clears or re-POSTs it",async()=>{
    const h=await harness();
    runtime.stakingApi.openStakingPosition.mockRejectedValue(new Error("timeout"));
    const running=h.submit(),lease=registry().lookup(account,"open",payload)!;
    h.finishRisk();await running;
    expect(runtime.stakingApi.openStakingPosition).toHaveBeenCalledExactlyOnceWith(payload.tierKey,payload.amountUsdt,lease.key);
    expect(registry().lookup(account,"open",payload)?.key).toBe(lease.key);
    await h.submit();
    expect(runtime.stakingApi.openStatus).toHaveBeenCalledExactlyOnceWith(payload.tierKey,payload.amountUsdt,lease.key);
    expect(registry().lookup(account,"open",payload)?.key).toBe(lease.key);
    expect(()=>h.staking.prepareOpen("usdt90d",999)).toThrow("G1_PENDING_RECOVERY_REQUIRED");
    expect(runtime.stakingApi.openStakingPosition).toHaveBeenCalledTimes(1);
    setActivePinia(createPinia());
    const reloaded=useStaking();reloaded.bindAccount(account);await flush();
    expect(reloaded.releasePreparedOpen(lease)).toBe(false);
    expect(()=>reloaded.prepareOpen(payload.tierKey,payload.amountUsdt)).toThrow("G1_PENDING_RECOVERY_REQUIRED");
    expect(registry().lookup(account,"open",payload)?.key).toBe(lease.key);
  });

  it("cancelled original-account preparation cannot clear a different current account's old lease",async()=>{
    const h=await harness(),running=h.submit();
    const original=registry().lookup(account,"open",payload)!;
    const otherPayload={tierKey:"usdt90d",amountUsdt:222.25};
    const other=registry().acquire("user:900124","open",otherPayload);registry().complete(other,false);
    h.app.accountKey="user:900124";h.staking.bindAccount(h.app.accountKey);await flush();
    h.finishRisk();await running;
    expect(registry().lookup(account,"open",payload)).toBeNull();
    expect(registry().lookup("user:900124","open",otherPayload)?.key).toBe(other.key);
    expect(h.staking.releasePreparedOpen(other)).toBe(false);
    expect(registry().lookup("user:900124","open",otherPayload)?.key).toBe(other.key);
    expect(runtime.stakingApi.openStakingPosition).not.toHaveBeenCalled();
    h.staking.bindAccount(account);await flush();expectFreshAllowed(h.staking,original.key);
  });

  it("one-use preparation cannot dispatch after its original account epoch is rebound",async()=>{
    const h=await harness(),lease=h.staking.prepareOpen(payload.tierKey,payload.amountUsdt);
    h.staking.bindAccount(account);await flush();
    await expect(h.staking.openRemote(payload.tierKey,payload.amountUsdt,lease.key)).rejects.toThrow("G1_REMOTE_AUTHORITY_UNAVAILABLE");
    expect(runtime.stakingApi.openStakingPosition).not.toHaveBeenCalled();
    expect(h.staking.releasePreparedOpen(lease)).toBe(true);
    expectFreshAllowed(h.staking,lease.key);
  });
});
