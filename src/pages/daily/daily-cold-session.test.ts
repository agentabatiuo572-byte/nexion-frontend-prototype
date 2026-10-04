// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { binarySessionReady as accountSessionReady } from '@/lib/binary-session-ready';
import { createScopedReadCoalescer } from '@/lib/binary-read-coalescer';
const source = readFileSync(new URL('./daily.vue', import.meta.url), 'utf8');
const code = ts.transpileModule(source.slice(source.indexOf('const t = useT();'), source.indexOf('// Per-second tick')) + ';return {refreshDaily,refreshBalance,remoteRefreshError,remoteInitialLoading};', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function setup() {
  const app = reactive({accountKey:'default', accountBindingEpoch:1,refreshRemoteFleet:vi.fn().mockResolvedValue(true)});
  const auth = reactive({isAuthenticated:false,accountId:'default'});
  const read = vi.fn().mockResolvedValue(true);
  const faucet = {refreshRemote:read, ensureRemote:read};
  const bills = {refreshSummary:vi.fn().mockResolvedValue(undefined)};
  const show:Array<()=>void> = [];
  const dispose:Array<()=>void> = [];
  const deps = {ref,computed,watch,remoteApiEnabled:true,useT:()=>ref({}),useNexFaucet:()=>faucet,useApp:()=>app,useBills:()=>bills,useLuckySpin:()=>({}),useAuth:()=>auth,accountSessionReady,createScopedReadCoalescer,sessionVault:{read:()=>({user:{userId:607}})},captureRuntimeRevision:()=>({epoch:1,runId:null}),subscribeRuntimeRevision:()=>()=>{},onShow:(f:()=>void)=>show.push(f),onUnmounted:(f:()=>void)=>dispose.push(f)};
  const scope=effectScope();
  const result=scope.run(()=>new Function(...Object.keys(deps),code)(...Object.values(deps)));
  return {app,auth,faucet,bills,result,show:()=>show.forEach(f=>f()),close:()=>{dispose.forEach(f=>f());scope.stop();}};
}
describe('Daily cold session recovery',()=>{
  it('shares lifecycle balance reads while an explicit retry requests a new read',async()=>{
    const s=setup();try {
      s.auth.isAuthenticated=true;s.auth.accountId='user:607';s.app.accountKey='user:607';await nextTick();
      expect(s.app.refreshRemoteFleet).toHaveBeenCalledWith(undefined,{coalesce:true});
      s.app.refreshRemoteFleet.mockRejectedValueOnce(new Error('offline'));
      await expect(s.result.refreshBalance(false)).resolves.toBeUndefined();
      expect(s.app.refreshRemoteFleet).toHaveBeenLastCalledWith(undefined,{coalesce:false});
      expect(s.result.remoteRefreshError.value).toBe(false);
    }finally{s.close();}
  });
  it('finishes loading when onShow runs before the queued binding watcher',async()=>{
    const s=setup();try {
      s.auth.isAuthenticated=true;s.auth.accountId='user:607';s.app.accountKey='user:607';s.show();
      await nextTick();await Promise.resolve();await Promise.resolve();
      expect(s.result.remoteInitialLoading.value).toBe(false);
    } finally{s.close();}
  });
  it('waits for restored account binding and automatically reads both views',async()=>{
    const s=setup();try {
      s.show();await nextTick();expect(s.faucet.refreshRemote).not.toHaveBeenCalled();expect(s.bills.refreshSummary).not.toHaveBeenCalled();expect(s.app.refreshRemoteFleet).not.toHaveBeenCalled();
      s.auth.isAuthenticated=true;s.auth.accountId='user:607';await nextTick();expect(s.faucet.refreshRemote).not.toHaveBeenCalled();
      s.app.accountKey='user:607';await nextTick();expect(s.faucet.refreshRemote).toHaveBeenCalledTimes(1);expect(s.bills.refreshSummary).toHaveBeenCalledTimes(1);expect(s.app.refreshRemoteFleet).toHaveBeenCalledTimes(1);
    } finally{s.close();}
  });
  it('rebinds without letting an old failed read mark the new view failed',async()=>{
    const s=setup();try {
      let finish!:(ok:boolean)=>void;
      s.faucet.refreshRemote.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
      s.auth.isAuthenticated=true;s.auth.accountId='user:607';s.app.accountKey='user:607';s.show();await nextTick();
      s.app.accountBindingEpoch++;await nextTick();expect(s.faucet.refreshRemote).toHaveBeenCalledTimes(2);
      finish(false);await Promise.resolve();await Promise.resolve();expect(s.result.remoteRefreshError.value).toBe(false);
    } finally{s.close();}
  });
});
