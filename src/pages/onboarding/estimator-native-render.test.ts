// @ts-expect-error Node-only SFC preprocessing harness.
import { createRequire } from "node:module";
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./estimator.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { formatAmount } from "@/lib/amount-display";
import * as flow from "@/lib/phone-calibration-flow";
import * as scope from "@/lib/estimator-scope";
import { createNativeGpuRequest } from "@/lib/native-gpu-request";
const require = createRequire(import.meta.url);
const {initPreContext,preHtml,preJs} = require("@dcloudio/uni-cli-shared");
// Native host nodes deliberately have no DOM classList, matching the failed transition boundary.
type Host={tag:string;text:string;props:Record<string,any>;parent:Host|null;children:Host[]};
const node=(tag:string,text=""):Host=>({tag,text,props:{},parent:null,children:[]});
const renderer=Vue.createRenderer<Host,Host>({
 createElement:tag=>node(tag),createText:text=>node("#text",text),createComment:()=>node("#comment"),
 setText:(n,t)=>{n.text=t;},setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,_old,v)=>{n.props[k]=v;},
 parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,
 insert:(n,p,a)=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=p;const i=a?p.children.indexOf(a):-1;i<0?p.children.push(n):p.children.splice(i,0,n);},
 remove:n=>{if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);},
});
const all=(n:Host):Host[]=>[n,...n.children.flatMap(all)];
const text=(n:Host):string=>n.text+n.children.map(text).join("");
const cleanups:Array<()=>void>=[];
afterEach(()=>{cleanups.splice(0).forEach(f=>f());vi.useRealTimers();vi.unstubAllGlobals();});
async function settle(){for(let i=0;i<20;i++)await Vue.nextTick();}
const record={userId:42,deviceId:"phone-1",serverCanonical:true,source:"server",sourceEnvironment:"PRODUCTION",runId:"",revision:3,
 activationStatus:"CALIBRATED",calibrationAvailable:true,calibrationStatus:"MATCHED",computeValue:8,tierName:"Tier 1",baseRateUsdt:0.04,comparisonConfig:[]};
function mount(api:any,native=true){
 initPreContext(native?"app-plus":"h5");
 const {descriptor}=parse(preJs(preHtml(source,"estimator.vue"),"estimator.vue"));
 const compiled=compileScript(descriptor,{id:"estimator-native-render",inlineTemplate:true});
 const js=ts.transpileModule(compiled.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const navReset=vi.fn(),confirmDeferredPhoneActivation=vi.fn(),hooks:Record<string,Function>={};
 const auth=Vue.reactive({accountId:"user:42",email:"",isAuthenticated:true,completeOnboarding:vi.fn(()=>true),requireOnboarding:vi.fn(),signOut:vi.fn()});
 const app=Vue.reactive({accountKey:"user:42",devices:[]});
 const modules:Record<string,unknown>={vue:Vue,
  "@dcloudio/uni-app":{onLoad:(f:Function)=>{hooks.load=f;},onBackPress:(f:Function)=>{hooks.back=f;}},
  "@/components/device/standalone-page-shell.vue":{default:{setup:(_p:unknown,{slots}:any)=>()=>Vue.h("view",slots.default?.())}},
  "@/i18n/use-t":{useT:()=>Vue.ref(zh)},"@/lib/amount-display":{formatAmount},"@/lib/route":{navReset},
  "@/store/app":{useApp:()=>app},"@/store/auth":{useAuth:()=>auth},
  "@/store/session":{useSession:()=>({markPhoneActivationDeferred:()=>true})},"@/store/auth-account":{markAuthAccountOnboardingComplete:()=>true},
  "@/lib/device-id":{getDeviceId:()=>"phone-1"},"@/lib/secure-command-id":{requireCryptoUuid:()=>"fixture-command"},
  "@/lib/native-phone-runtime":{hasNativeAndroidPhoneRuntime:()=>native},
  "@/lib/phone-activation-guidance":{resolvePhoneActivationGuidance:()=>({title:zh.myDevices.phoneActivationAppOnlyTitle,body:zh.myDevices.phoneActivationAppOnlyBody})},
  "@/api/runtime":{onboardingCalibrationApi:api,remoteApiEnabled:true},
  "@/lib/account-scope":{captureAccountScope:()=>({key:app.accountKey}),isCurrentAccountScope:(s:any)=>s.key===app.accountKey},
  "@/lib/estimator-scope":scope,"@/lib/phone-calibration-flow":flow,
  "@/components/native-gpu-observer.vue":{default:{setup:()=>()=>Vue.h("view")}},
  "@/lib/native-gpu-request":{createNativeGpuRequest},
  "@/lib/device-signals":{collectDeviceSignals:()=>({})},"@/lib/defer-phone-activation":{confirmDeferredPhoneActivation},
 };
 const exports={default:{} as Vue.Component};new Function("require","exports",js)((id:string)=>{if(id in modules)return modules[id];throw new Error("Unexpected import "+id);},exports);
 const root=node("root"),errors:unknown[]=[];const vm=renderer.createApp(exports.default);vm.config.errorHandler=e=>errors.push(e);
 vi.stubGlobal("uni",{showToast:vi.fn()});vm.mount(root);hooks.load?.({});cleanups.push(()=>vm.unmount());
 return {root,errors,navReset,confirmDeferredPhoneActivation,auth,app};
}
function click(root:Host,label:string){const target=all(root).find(n=>n.props.role==="button"&&text(n)===label);expect(target).toBeDefined();target!.props.onClick();}
it("shows error recovery after a failed read instead of leaving the old loading branch",async()=>{
 const api={result:vi.fn().mockRejectedValue(new Error("offline")),calibrate:vi.fn(),activate:vi.fn()};const p=mount(api);await settle();
 expect(p.errors).toEqual([]);expect(text(p.root)).toContain(zh.onboarding.calibrationFailedTitle);
 expect(text(p.root)).not.toContain(zh.onboarding.detecting);expect(text(p.root)).toContain(zh.onboarding.activationRetry);expect(text(p.root)).toContain(zh.onboarding.activationDefer);
 expect(api.calibrate).not.toHaveBeenCalled();expect(api.activate).not.toHaveBeenCalled();
});
it("pending verification stays visible with retry and defer, without claiming successful calibration",async()=>{
 const api={result:vi.fn().mockResolvedValue({...record,calibrationAvailable:false,calibrationStatus:"PENDING_VERIFICATION"}),calibrate:vi.fn()};const p=mount(api);await settle();
 expect(p.errors).toEqual([]);expect(text(p.root)).toContain(zh.onboarding.phoneCalibrationPendingTitle);
 expect(text(p.root)).toContain(zh.onboarding.activationRetry);expect(text(p.root)).toContain(zh.onboarding.activationDefer);expect(text(p.root)).not.toContain(zh.onboarding.detecting);
});
it("actual retry moves error to loading then the server-matched phone card",async()=>{
 vi.useFakeTimers();const api={result:vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(record),calibrate:vi.fn(),activate:vi.fn()};const p=mount(api);await settle();
 click(p.root,zh.onboarding.activationRetry);await settle();await vi.advanceTimersByTimeAsync(1200);await settle();
 expect(p.errors).toEqual([]);expect(text(p.root)).toContain("Tier 1");expect(text(p.root)).not.toContain(zh.onboarding.detecting);expect(api.result).toHaveBeenCalledTimes(2);
 click(p.root,zh.onboarding.startEarning);expect(p.navReset).toHaveBeenCalledWith(expect.objectContaining({url:"/pages/onboarding/connect"}));expect(api.activate).not.toHaveBeenCalled();
});
it("defer becomes operable from the rendered pending state and only accepted DEFERRED returns home",async()=>{
 const api={result:vi.fn().mockResolvedValue({...record,calibrationAvailable:false,calibrationStatus:"PENDING_VERIFICATION"}),calibrate:vi.fn()};const p=mount(api);await settle();
 p.confirmDeferredPhoneActivation.mockResolvedValue({...record,activationStatus:"DEFERRED"});click(p.root,zh.onboarding.activationDefer);await settle();
 expect(p.errors).toEqual([]);expect(p.confirmDeferredPhoneActivation).toHaveBeenCalledOnce();expect(p.navReset).toHaveBeenCalledWith(expect.objectContaining({url:"/pages/index/index"}));
});
it("an existing DEFERRED result exposes resume rather than auto-activating",async()=>{
 const api={result:vi.fn().mockResolvedValue({...record,activationStatus:"DEFERRED"}),activate:vi.fn()};const p=mount(api);await settle();
 expect(p.errors).toEqual([]);click(p.root,zh.onboarding.calibrationStart);expect(p.navReset).toHaveBeenCalledWith(expect.objectContaining({url:"/pages/onboarding/connect?mode=resume"}));expect(api.activate).not.toHaveBeenCalled();
});
it("H5 remains download-only and never requests or activates a phone",async()=>{
 const api={result:vi.fn(),calibrate:vi.fn(),activate:vi.fn()};const p=mount(api,false);await settle();
 expect(p.errors).toEqual([]);expect(text(p.root)).toContain(zh.myDevices.phoneActivationAppOnlyTitle);expect(p.navReset).toHaveBeenCalledWith(expect.objectContaining({url:"/pages/register/success?download=1"}));
 expect(api.result).not.toHaveBeenCalled();expect(api.calibrate).not.toHaveBeenCalled();expect(api.activate).not.toHaveBeenCalled();
});
