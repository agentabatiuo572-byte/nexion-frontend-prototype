// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import { describe, expect, it, vi } from "vitest";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
const source=readFileSync(new URL("./unilevel.vue",import.meta.url),"utf8");
const code=ts.transpileModule(source.slice(source.indexOf("const t = useT();"),source.indexOf('const filter = ref<FilterId>')) + '; return { remoteState, remoteSnapshot };', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup(ready=false) {
  const auth=reactive({isAuthenticated:ready,accountId:ready?'user:607':'default'});
  const app=reactive({accountKey:ready?'user:607':'default',accountBindingEpoch:1});
  const mount:Array<()=>void>=[], show:Array<()=>void>=[], dispose:Array<()=>void>=[];
  const network={ensureCanonicalNetwork:vi.fn().mockResolvedValue(undefined)};
  const commission={ensureCanonicalConfig:vi.fn().mockResolvedValue(undefined)};
  const api={unilevel:vi.fn().mockResolvedValue({events:[],page:1,pageSize:20,totalRows:0})};
  const deps={computed,ref,watch,useT:()=>ref({}),useApp:()=>app,useAuth:()=>auth,useNetwork:()=>network,useCommission:()=>commission,remoteApiEnabled:true,sessionVault:{read:()=>({user:{userId:607}})},accountSessionReady,createScopedReadCoalescer,onMounted:(f:()=>void)=>mount.push(f),onShow:(f:()=>void)=>show.push(f),onUnmounted:(f:()=>void)=>dispose.push(f),subscribeRuntimeRevision:()=>()=>{},captureAccountScope:()=>app.accountBindingEpoch,isCurrentAccountScope:(epoch:number)=>epoch===app.accountBindingEpoch,captureRuntimeRevision:()=>({epoch:1,runId:null}),isCurrentRuntimeRevision:()=>true,teamInsightsApi:api};
  const scope=effectScope(); const result=scope.run(()=>new Function(...Object.keys(deps),code)(...Object.values(deps)));
  return {auth,app,network,commission,api,result,mount:()=>mount.forEach(f=>f()),show:()=>show.forEach(f=>f()),close:()=>{dispose.forEach(f=>f());scope.stop();}};
}
describe('Unilevel cold session lifecycle',()=>{
  it('starts a new read when the same account is rebound',async()=>{
    const s=setup(true);try{await nextTick();await Promise.resolve();const before=s.api.unilevel.mock.calls.length;s.app.accountBindingEpoch+=1;await nextTick();expect(s.api.unilevel.mock.calls.length).toBe(before+1);}finally{s.close();}
  });
  it('waits for session and account binding, then starts reads without another page event',async()=>{
    const s=setup(); try {s.mount();s.show(); await nextTick(); expect(s.api.unilevel).not.toHaveBeenCalled(); expect(s.commission.ensureCanonicalConfig).not.toHaveBeenCalled(); expect(s.network.ensureCanonicalNetwork).not.toHaveBeenCalled();
      s.auth.isAuthenticated=true;s.auth.accountId='user:607';await nextTick();expect(s.api.unilevel).not.toHaveBeenCalled();
      s.app.accountKey='user:607';await nextTick();await Promise.resolve();expect(s.api.unilevel).toHaveBeenCalledTimes(1);expect(s.commission.ensureCanonicalConfig).toHaveBeenCalledTimes(1);expect(s.network.ensureCanonicalNetwork).toHaveBeenCalledTimes(1);
    } finally{s.close();}
  });
  it('coalesces the ready watcher, mount and show for one account',async()=>{
    const s=setup(true);try{s.mount();s.show();await nextTick();expect(s.api.unilevel).toHaveBeenCalledTimes(1);expect(s.commission.ensureCanonicalConfig).toHaveBeenCalledTimes(1);expect(s.network.ensureCanonicalNetwork).toHaveBeenCalledTimes(1);}finally{s.close();}
  });
});
