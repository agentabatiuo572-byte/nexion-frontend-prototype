import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error The isolated legacy-JS realm is used only by the Node test runner.
import { createContext, runInContext } from "node:vm";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { useUI } from "@/store/ui";
import { nexGridBrandText } from "@/lib/brand-copy";

const source = readFileSync(new URL("./goals.vue", import.meta.url), "utf8");

function legacyNativePage() {
  const context = createContext({ module: { exports: {} } });
  runInContext(`
    delete Array.prototype.at;
    this.goalsStore = {
      accountEpoch: 1, status: "ready", goals: [], lifetimeEarningsUsdt: 0,
      recommendationStatus: "ready", recommendation: null,
      saves: [], recommendations: [], failNextSave: false,
      async setGoal(intent) {
        this.saves.push({ ...intent });
        if (this.failNextSave) {
          this.failNextSave = false;
          throw new Error("GOAL_SAVE_FAILED");
        }
        this.goals.push({ id: "saved-goal", targetUSDT: intent.targetUSDT,
          deadlineMs: intent.deadlineMs, createdAt: Date.now(), achieved: false });
        return "saved";
      },
      async refreshRecommendation(target, deadline) {
        this.recommendations.push({ target, deadline });
      },
    };
    this.ui = { toasts: [], pushToast(toast) { this.toasts.push(toast); } };
    this.exports = this.module.exports;
  `, context);
  context.require = (id: string) => {
    if (id === "vue") return { ...Vue, onMounted: () => {}, onUnmounted: () => {} };
    if (id === "@dcloudio/uni-app") return { onShow: () => {}, onHide: () => {} };
    if (id === "@/store/goals") return { useGoals: () => context.goalsStore };
    if (id === "@/store/ui") return { useUI: () => context.ui };
    if (id === "@/store/app") return { useApp: () => ({ accountKey: "user:3778", accountBindingEpoch: 1 }) };
    if (id === "@/i18n/use-t") return { useT: () => ({ value: { goals: zh.goals } }) };
    if (id === "@/i18n/format") return { fmt };
    if (id === "@/api/runtime") return { remoteApiEnabled: true };
    if (id === "@/lib/brand-copy") return { nexGridBrandText: (value: string) => value };
    if (id === "@/lib/route") return { navReset: () => {} };
    if (id.endsWith(".vue")) return { __esModule: true, default: {} };
    throw new Error(`Unexpected goals script import: ${id}`);
  };
  const { descriptor } = parse(source, { filename: "goals.vue" });
  const script = compileScript(descriptor, { id: "goals-native-save" });
  const implementation = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  runInContext(implementation, context);
  const scope = Vue.effectScope();
  const page = scope.run(() => context.module.exports.default.setup({}, { expose() {} }));
  return { context, page, scope };
}

describe("native goal save without Array.at", () => {
  it("does not describe unread earnings as zero while loading or after a failed read", () => {
    for (const status of ["idle", "loading", "error", "ready"]) {
      const { context, page, scope } = legacyNativePage();
      try {
        context.goalsStore.status = status;
        const subtitle = page.heroSubLine.value;
        if (status === "ready") expect(subtitle).toContain("$0.00");
        else {
          expect(subtitle).not.toContain("$0.00");
          expect(subtitle).toBe(status === "error" ? zh.goals.serverUnavailable : zh.goals.loading);
        }
      } finally { scope.stop(); }
    }
  });

  it("confirms one saved goal, restores its term and shows success in the actual page script", async () => {
    const { context, page, scope } = legacyNativePage();
    try {
      expect(runInContext("typeof [].at", context)).toBe("undefined");
      expect(context.goalsStore.goals.at).toBeUndefined();
      page.selectTarget(500);
      page.selectDays(30);
      context.goalsStore.recommendations.length = 0;
      await page.onSave();
      expect(context.goalsStore.saves).toHaveLength(1);
      expect(context.goalsStore.goals).toHaveLength(1);
      expect(context.ui.toasts).toEqual([{ kind: "success", title: "目标已保存：$500 / 30 天" }]);
      expect(page.restoredGoal.value).toEqual({ targetUSDT: 500, days: 30 });
      expect(page.savePending.value).toBe(false);
      expect(page.saveBlocked.value).toBe(true);
      expect(context.goalsStore.recommendations).toEqual([{
        target: 500, deadline: context.goalsStore.goals[0].deadlineMs,
      }]);
      await page.onSave();
      expect(context.goalsStore.saves).toHaveLength(1);
    } finally { scope.stop(); }
  });

  it("preserves a failed save intent for retry and then confirms success without duplicating the goal", async () => {
    const { context, page, scope } = legacyNativePage();
    try {
      page.selectTarget(500);
      page.selectDays(30);
      context.goalsStore.failNextSave = true;
      await page.onSave();
      expect(context.goalsStore.goals).toHaveLength(0);
      expect(context.ui.toasts).toEqual([{ kind: "warn", title: zh.goals.serverUnavailable }]);
      expect(JSON.stringify(context.ui.toasts)).not.toContain("GOAL_SAVE_FAILED");
      expect(page.savePending.value).toBe(false);
      await page.onSave();
      expect(context.goalsStore.saves).toHaveLength(2);
      expect(context.goalsStore.saves[1]).toEqual(context.goalsStore.saves[0]);
      expect(context.goalsStore.goals).toHaveLength(1);
      expect(context.ui.toasts[1]).toEqual({ kind: "success", title: "目标已保存：$500 / 30 天" });
    } finally { scope.stop(); }
  });
});

describe("earning-goal save account fence", () => {
  it("keeps the submitted retry payload and fences success handling by account epoch", () => {
    expect(source).toMatch(/retryableSaveIntents/);
    expect(source).toMatch(/expectedAccountEpoch === goalsStore\.accountEpoch/);
  });

  it("disables editable goal controls while a save is pending", () => {
    expect(source).toMatch(/:disabled="editorBlocked"/);
    expect(source).toMatch(/editorBlocked = computed\(\(\) => savePending\.value/);
    expect(source).toMatch(/selectTarget\(p\)/);
    expect(source).toMatch(/selectDays\(d\)/);
  });

  it("hides a server-confirmed recommendation when no purchase is required", () => {
    expect(source).toMatch(/recommendation\?\.purchaseRequired/);
    expect(source).toMatch(/recommendationStatus === 'ready'/);
  });

  it("explains an impossible catalog target without offering a purchase CTA", () => {
    expect(source).toMatch(/recommendationError === 'GOAL_NO_ELIGIBLE_PRODUCT'/);
    expect(source).toMatch(/t\.goals\.noEligibleProduct/);
    expect(source).toMatch(/purchaseRequired === true/);
  });

  it("does not round a positive required daily amount down to zero", () => {
    expect(source).toMatch(/function formatGoalDailyRate\(value: number\)/);
    expect(source).toMatch(/formatGoalDailyRate\(goalsStore\.recommendation\?\.requiredDaily/);
  });
});

/**
 * zentao #247:保存成功提示把 90 天期限显示成「$90 天」。
 *
 * 中文文案写成 `"目标已保存 · ${days} 天达成 ${amount}"` —— 把 `${amount}` 的 `$`
 * 复制到了天数上,而 `fmt` 把 `$` 当字面量原样留下。天数不是金额,$ 只属于金额。
 *
 * 判据是**行为**而非文本:用真实 fmt 渲染一遍,断言天数前没有 $、金额前有 $。
 */
describe("goal save toast placeholder contract", () => {
  it("keeps days unitless and groups default and custom amounts", () => {
    expect(source).toMatch(/savedToast, \{ amount: target\.value\.toLocaleString\("en-US"\), days: days\.value \}/);
    expect(fmt(zh.goals.savedToast, { amount: (1000).toLocaleString("en-US"), days: 90 }))
      .toBe("目标已保存：$1,000 / 90 天");
    expect(fmt(zh.goals.savedToast, { amount: (1234.56).toLocaleString("en-US"), days: 180 }))
      .toBe("目标已保存：$1,234.56 / 180 天");
  });

  it("shows both saved terms through the page-bound toast store after an async save", async () => {
    const pagePinia = createPinia();
    const pageUi = useUI(pagePinia);
    const otherPinia = createPinia();
    setActivePinia(otherPinia);
    const goals: Array<{ id: string; targetUSDT: number; deadlineMs: number; createdAt: number; achieved: boolean }> = [];
    const goalsStore = {
      accountEpoch: 1,
      goals,
      setGoal: async (intent: { targetUSDT: number; deadlineMs: number }) => {
        await Promise.resolve();
        goals.push({ id: String(goals.length + 1), targetUSDT: intent.targetUSDT,
          deadlineMs: intent.deadlineMs, createdAt: Date.now(), achieved: false });
        return "saved";
      },
      refreshRecommendation: async () => {},
    };
    const target = { value: 500 };
    const days = { value: 90 };
    const savePending = { value: false };
    const start = source.indexOf("async function onSave()");
    const end = source.indexOf("async function remove(", start);
    const implementation = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const makeSave = new Function("saveBlocked", "target", "days", "goalsStore", "savePending", "ui", "t", "fmt", "restoreEditorFromGoal", "ONE_DAY_MS",
      `let saveEpoch = 0; const retryableSaveIntents = new Map(); ${implementation}; return onSave;`);
    const save = makeSave({ value: false }, target, days, goalsStore, savePending, pageUi,
      { value: { goals: zh.goals } }, fmt, () => {}, 86_400_000) as () => Promise<void>;

    await save();
    expect(pageUi.toasts.at(-1)?.title).toBe("目标已保存：$500 / 90 天");
    days.value = 30;
    await save();
    expect(pageUi.toasts.at(-1)?.title).toBe("目标已保存：$500 / 30 天");
    expect(useUI(otherPinia).toasts).toEqual([]);
    expect(goals).toHaveLength(2);
    expect(savePending.value).toBe(false);
  });
});

const remote=vi.hoisted(()=>({remoteApiEnabled:true,goalsApi:{list:vi.fn(),create:vi.fn(),recommendation:vi.fn(),setStatus:vi.fn(),remove:vi.fn()}}));
vi.mock('@/api/runtime',()=>remote);
vi.mock('@/store/account-scoped-storage',()=>({readAccountRow:()=>null,writeAccountRow:()=>{throw new Error('PERSISTENCE_NOT_ALLOWED');}}));
const { useGoals }=await import('@/store/goals');
const { descriptor }=parse(source,{filename:'goals.vue'});
const script=compileScript(descriptor,{id:'goal-delete-finite'});
const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const mounted: Array<()=>void>=[];
function deferred<T>(){let resolve!:(v:T)=>void;let reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
async function flush(){for(let i=0;i<6;i++)await Promise.resolve();await Vue.nextTick();}
function snapshot(id=9){return{serverCanonical:true,source:'nx_earning_goal',lifetimeEarningsUsdt:0,goals:[{id,targetUsdt:100,deadlineAt:1_900_000_000_000,createdAt:1_800_000_000_000,achieved:false,progressPct:0}]};}
async function setup(){
  const store=useGoals();store.bindAccount('A');await flush();
  const account=Vue.reactive({accountKey:'A',accountBindingEpoch:1,earnings:{total:0}});
  const ui=useUI();const shows: Array<() => void>=[];const hides: Array<() => void>=[];
  const require=(id:string)=>{
    if(id==='vue')return Vue;
    if(id==='@dcloudio/uni-app')return{onShow:(fn:() => void)=>shows.push(fn),onHide:(fn:() => void)=>hides.push(fn)};
    if(id==='@/store/goals')return{useGoals:()=>store};
    if(id==='@/store/app')return{useApp:()=>account};
    if(id==='@/store/ui')return{useUI:()=>ui};
    if(id==='@/i18n/use-t')return{useT:()=>Vue.ref({goals:zh.goals})};
    if(id==='@/i18n/format')return{fmt};
    if(id==='@/api/runtime')return{remoteApiEnabled:true};
    if(id==='@/lib/brand-copy')return{nexGridBrandText};
    if(id==='@/lib/route')return{navReset:vi.fn()};
    if(id.endsWith('.vue'))return{__esModule:true,default:{}};
    throw new Error('UNEXPECTED_IMPORT '+id);
  };
  const module={exports:{} as any};new Function('require','module','exports',code)(require,module,module.exports);
  let page:any;
  const renderer=Vue.createRenderer<any,any>({insert:(child,parent)=>{child.parent=parent;},remove:()=>{},createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText:()=>{},setElementText:()=>{},parentNode:n=>n.parent??null,nextSibling:()=>null,patchProp:()=>{}});
  const component=module.exports.default;
  const app=renderer.createApp({...component,setup:(p:any,c:any)=>{page=component.setup(p,c);return page;},render:()=>null});
  app.mount({});let active=true;const stop=()=>{if(active){active=false;app.unmount();}};mounted.push(stop);await flush();
  const rebind=(key:string)=>{account.accountKey=key;account.accountBindingEpoch++;store.bindAccount(key);};
  return{store,page,account,ui,stop,rebind,hide:()=>hides.forEach(fn=>fn()),show:()=>shows.forEach(fn=>fn())};
}
describe('actual goal page/store deletion feedback scope',()=>{
  beforeEach(()=>{setActivePinia(createPinia());Object.values(remote.goalsApi).forEach(m=>m.mockReset());remote.goalsApi.list.mockResolvedValue(snapshot());remote.goalsApi.recommendation.mockResolvedValue({purchaseRequired:false});vi.stubGlobal('fetch',()=>{throw new Error('NETWORK_NOT_ALLOWED');});vi.useFakeTimers();});
  afterEach(()=>{mounted.splice(0).forEach(stop=>stop());vi.useRealTimers();vi.unstubAllGlobals();});
  it.each(['account','same-account-rebind','unmount','hide-and-show'])('suppresses late failure after %s',async boundary=>{
    const s=await setup();const response=deferred<void>();remote.goalsApi.remove.mockReturnValue(response.promise);
    const pending=s.page.remove('9');expect(remote.goalsApi.remove).toHaveBeenCalledExactlyOnceWith(9);
    if(boundary==='account')s.rebind('B');
    if(boundary==='same-account-rebind')s.rebind('A');
    if(boundary==='unmount')s.stop();
    if(boundary==='hide-and-show'){s.hide();s.show();}
    await flush();response.reject(new Error('OLD_ACCOUNT_DELETE_FAILED'));await pending;
    console.log(JSON.stringify({boundary,account:s.account.accountKey,bindingEpoch:s.account.accountBindingEpoch,storeEpoch:s.store.accountEpoch,toasts:s.ui.toasts.map(t=>({kind:t.kind,title:t.title})),currentGoals:s.store.goals.map(g=>g.id)}));
    expect(s.ui.toasts).toHaveLength(0);
  });
  it('does not dispatch while hidden and permits a current delete after show',async()=>{
    const s=await setup();s.hide();await s.page.remove('9');expect(remote.goalsApi.remove).not.toHaveBeenCalled();
    s.show();await flush();remote.goalsApi.remove.mockResolvedValue(undefined);await s.page.remove('9');
    expect(remote.goalsApi.remove).toHaveBeenCalledExactlyOnceWith(9);expect(s.store.goals).toEqual([]);expect(s.ui.toasts).toHaveLength(0);
  });
  it('current successful removal deletes the intended local row',async()=>{
    const s=await setup();remote.goalsApi.remove.mockResolvedValue(undefined);await s.page.remove('9');
    expect(s.store.goals).toEqual([]);expect(s.ui.toasts).toHaveLength(0);expect(remote.goalsApi.remove).toHaveBeenCalledExactlyOnceWith(9);
  });
  it('current failure remains visible and retains the confirmed row',async()=>{
    const s=await setup();remote.goalsApi.remove.mockRejectedValue(new Error('CURRENT_DELETE_FAILED'));await s.page.remove('9');
    expect(s.ui.toasts).toHaveLength(1);expect(s.ui.toasts[0].title).toBe(zh.goals.serverUnavailable);expect(s.store.goals[0]?.id).toBe('9');
  });
  it('late success after account switch cannot remove the new account row',async()=>{
    const s=await setup();const response=deferred<void>();remote.goalsApi.remove.mockReturnValue(response.promise);const pending=s.page.remove('9');
    s.rebind('B');await flush();expect(s.store.goals[0]?.id).toBe('9');response.resolve();await pending;
    expect(s.store.goals[0]?.id).toBe('9');expect(s.ui.toasts).toHaveLength(0);
  });
});
