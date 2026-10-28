import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./detail.vue?raw";
import { eventDetailCopy, eventReminderCopy } from "@/i18n/event-detail";
import * as display from "./event-detail-display";
import { formatAmount } from "@/lib/amount-display";
import { formatUsd } from "@/lib/usd-display";
import { displayDeadline } from "@/lib/promotion-display";
import { ApiError } from "@/api/errors";
import type { EventDetail } from "@/api/event-detail-api";

const script = compileScript(parse(source).descriptor, { id: "event-detail-behavior" });
const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const disposals: Array<() => void> = [];
afterEach(() => disposals.splice(0).forEach(stop => stop()));
const snapshot = (status: EventDetail["userStatus"] = "AVAILABLE") => ({
  event: { eventCode: "evt-1", state: "ongoing", trackable: true, href: "/pages/team/team", kind: "referral", title: "Invite", subtitle: "Invite friends", rewardName: "Device", rewardType: "DEVICE", rewardAmount: 1, featured: false, targetValue: 5, progressValue: 0, userStatus: status, geo: "", startsAt: null, endsAt: null },
  enabled: true, eligible: true, eligibilityReason: status === "CLAIMED" ? "CLAIMED" : "IN_PROGRESS",
  userStatus: status, rules: {}, rewards: [], results: [], progressValue: 0, targetValue: 5,
}) as EventDetail;

function mount() {
  const account = Vue.reactive({ accountKey: "user:a", accountBindingEpoch: 0 });
  const locale = Vue.reactive({ code: "zh" }); const runtime = { epoch: 0 };
  const read = vi.fn().mockResolvedValue(snapshot()), join = vi.fn().mockResolvedValue({}), claim = vi.fn().mockResolvedValue({}), remind = vi.fn().mockResolvedValue({}), navTo = vi.fn();
  const hooks: Record<string, (...args: any[]) => void> = {};
  const unsubscribe = vi.fn();
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": { onLoad: (fn: () => void) => { hooks.load = fn; }, onShow: (fn: () => void) => { hooks.show = fn; }, onHide: (fn: () => void) => { hooks.hide = fn; } },
    "@/components/app-chassis.vue": {}, "@/components/sub-page-header.vue": {},
    "@/components/ui/nx-button.vue": {},
    "@/api/errors": { ApiError },
    "@/api/runtime": { apiClient: {}, eventsApi: { join, claim }, remoteApiEnabled: true },
    "@/api/order-api": { captureRuntimeRevision: () => runtime, subscribeRuntimeRevision: (fn: () => void) => { hooks.runtime = fn; return unsubscribe; } },
    "@/api/event-detail-api": { createEventDetailApi: () => ({ detail: read, remind }) },
    "@/store/app": { useApp: () => account }, "@/store/locale": { useLocaleStore: () => locale },
    "@/i18n/event-detail": { eventDetailCopy, eventReminderCopy }, "@/lib/route": { navTo, takeNavigationQuery: () => "" },
    "@/lib/promotion-display": { displayDeadline }, "@/lib/amount-display": { formatAmount }, "./event-detail-display": display,
    "@/lib/usd-display": { formatUsd },
  };
  const output: any = {};
  new Function("require", "exports", code)((id: string) => modules[id], output);
  const scope = Vue.effectScope();
  const state = scope.run(() => output.default.setup({}, { expose() {} }));
  disposals.push(() => { hooks.unmount(); scope.stop(); });
  hooks.load({ id: "evt-1" }); hooks.show();
  return { state, account, locale, runtime, hooks, unsubscribe, read, join, claim, remind, navTo };
}
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); };

const render=new Function('Vue',compile(parse(source).descriptor.template!.content,{mode:'function',prefixIdentifiers:true,isCustomElement:tag=>['view','text'].includes(tag)}).code)(Vue);
async function renderSnapshot(detail:EventDetail,language='zh') {
  const page=mount();page.read.mockResolvedValue(detail);page.locale.code=language;await flush();await page.state.load();
  return renderToString(Vue.createSSRApp({render,setup:()=>({...page.state}),components:{AppChassis:{props:['active'],setup:(_props:unknown,{slots}:any)=>()=>slots.default?.()},SubPageHeader:{render:()=>null}}}));
}
it.each(['zh','en','vi'] as const)('renders regional personal and regional total rewards separately at up to four decimals in %s',async language=>{
  const value=snapshot('CLAIMED');value.event.kind='regional';value.event.state='ended';value.targetValue=1;
  value.myRewardAmount=0.002634;value.results=[{region:'CN',rank:1,volume:7554.1,rewardAmount:1}];
  const html=await renderSnapshot(value,language),copy=eventDetailCopy[language];
  expect(html).toContain(copy.myReward);expect(html).toContain('$0.0026');
  expect(html).toContain(copy.regionPrize);expect(html).toContain('$1.00');
  expect(html).toContain('$7,554.10');
  expect(value.myRewardAmount).toBe(0.002634);
  expect(html).not.toContain(copy.progress);expect(html).not.toContain('role="progressbar"');
});
it.each([null,undefined,0])('does not turn personal pool reward %s into another status or a pool estimate',async amount=>{
  const value=snapshot('CLAIMED');value.event.kind='regional';value.event.state='ended';value.myRewardAmount=amount;
  value.results=[{region:'CN',rewardAmount:1}];const html=await renderSnapshot(value);
  if(amount==null)expect(html).not.toContain(eventDetailCopy.zh.myReward);
  else {expect(html).toContain(eventDetailCopy.zh.myReward);expect(html).toContain('$0.00');}
});
it('keeps meaningful holding progress while showing only its returned personal payment',async()=>{
  const value=snapshot('CLAIMED');value.event.kind='holding';value.myRewardAmount=0.17196;
  const html=await renderSnapshot(value);
  expect(html).toContain('role="progressbar"');expect(html).toContain('$0.172');
  expect(value.myRewardAmount).toBe(0.17196);
});

it("coalesces repeated taps and resolves a lost join response from authoritative readback", async () => {
  const page = mount(); await flush();
  let reject!: (reason: unknown) => void;
  page.join.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no; }));
  const first = page.state.run(); await page.state.run(); expect(page.join).toHaveBeenCalledTimes(1);
  expect(page.join).toHaveBeenCalledWith("evt-1", "h4-event-join:evt-1");
  page.read.mockResolvedValue(snapshot("JOINED")); reject(new Error("lost response")); await first;
  expect(page.state.detail.value.userStatus).toBe("JOINED"); expect(page.state.commandError.value).toBe(false);
});
it("never claims locally and retains an unknown outcome until the server confirms it", async () => {
  const page = mount(); page.read.mockResolvedValue(snapshot("CLAIMABLE")); await flush(); await page.state.load();
  page.claim.mockRejectedValue(new Error("timeout")); await page.state.run();
  expect(page.state.commandError.value).toBe(true); expect(page.state.detail.value.userStatus).toBe("CLAIMABLE");
  page.read.mockResolvedValue(snapshot("CLAIMED")); await page.state.load();
  expect(page.state.commandError.value).toBe(false); expect(page.state.action.value).toBeNull();
});
it.each(["account", "binding", "language", "runtime", "hide"])("drops prior details and late reads after %s changes", async kind => {
  const page = mount(); await flush(); expect(page.state.detail.value).not.toBeNull();
  let resolve!: (value: EventDetail) => void;
  page.read.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const loading = page.state.load();
  page.read.mockResolvedValue(snapshot("JOINED"));
  if (kind === "account") page.account.accountKey = "user:b";
  if (kind === "binding") page.account.accountBindingEpoch += 1;
  if (kind === "language") page.locale.code = "vi";
  if (kind === "runtime") { page.runtime.epoch += 1; page.hooks.runtime(); }
  if (kind === "hide") page.hooks.hide();
  await flush(); resolve(snapshot("CLAIMED")); await loading;
  expect(page.state.detail.value?.userStatus).toBe(kind === "hide" ? undefined : "JOINED");
});
it("recovers from a failed read without leaving previous event data actionable", async () => {
  const page = mount(); await flush();
  page.read.mockRejectedValueOnce(new Error("offline")); await page.state.load();
  expect(page.state.detail.value).toBeNull(); expect(page.state.action.value).toBeNull(); expect(page.state.error.value).toBe(true);
  page.read.mockResolvedValue(snapshot()); await page.state.load(); expect(page.state.error.value).toBe(false);
});

function deferred<T>() { let resolve!: (value:T)=>void, reject!: (reason:unknown)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
function renderLive(state:any) {
  type Node={tag:string;text:string;children:Node[];parent:Node|null;props:Record<string,unknown>};
  const node=(tag:string,text=''):Node=>({tag,text,children:[],parent:null,props:{}});
  const renderer=Vue.createRenderer<Node,Node>({
    createElement:tag=>node(tag),createText:text=>node('#text',text),createComment:text=>node('#comment',text),
    setText:(el,text)=>{el.text=text;},setElementText:(el,text)=>{el.text=text;el.children=[];},
    parentNode:el=>el.parent,nextSibling:el=>el.parent?.children[el.parent.children.indexOf(el)+1]??null,
    insert:(el,parent,anchor=null)=>{if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1);el.parent=parent;const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,el);},
    remove:el=>{el.parent?.children.splice(el.parent.children.indexOf(el),1);el.parent=null;},patchProp:(el,key,_old,value)=>{el.props[key]=value;},
  });
  const app=renderer.createApp({render,setup:()=>({...state}),components:{AppChassis:{setup:(_p:unknown,{slots}:any)=>()=>slots.default?.()},SubPageHeader:{render:()=>null},NxButton:{render:()=>null}}});
  const root=node('root');app.mount(root);disposals.push(()=>app.unmount());
  const all=():Node[]=>{const walk=(n:Node):Node[]=>[n,...n.children.flatMap(walk)];return walk(root);};
  return {all,find:(cls:string)=>all().find(n=>String(n.props.class??'').split(' ').includes(cls))};
}
it.each(['zh','en','vi'])('retains the same mounted regional sections during %s read refresh and network retry',async language=>{
  const page=mount();await flush();page.locale.code=language;await flush();
  const value=snapshot('CLAIMED');value.event.kind='regional';value.event.state='ended';value.myRewardAmount=0;value.results=[{region:'VN',rewardAmount:0}];page.read.mockResolvedValueOnce(value);await page.state.load();
  const view=renderLive(page.state),section=view.find('event-section'),result=view.find('event-result');expect(result).toBeDefined();
  const next=deferred<EventDetail>();page.read.mockReturnValueOnce(next.promise);const loading=page.state.load();await flush();
  expect(page.state.detail.value).toEqual(value);expect(view.find('event-section')).toBe(section);expect(view.find('event-result')).toBe(result);
  expect(view.all().some(n=>n.text===eventDetailCopy[language as 'zh'].loading)).toBe(false);
  next.reject(new ApiError({kind:'network',message:'offline'}));await loading;await flush();
  expect(page.state.error.value).toBe(true);expect(page.state.detail.value).toEqual(value);expect(page.state.action.value).toBeNull();expect(view.find('event-result')).toBe(result);
  const alert=view.all().find(n=>n.props.role==='alert');expect(alert).toBeDefined();expect(view.all().indexOf(alert!)).toBeGreaterThan(view.all().indexOf(result!));
  page.read.mockResolvedValueOnce(value);await page.state.load();await flush();expect(page.state.error.value).toBe(false);expect(view.find('event-result')).toBe(result);
});
it.each(['join','claim','remind','open'] as const)('blocks stale %s commands while a retained read is pending or failed',async action=>{
 const page=mount();await flush();const value=snapshot(action==='claim'?'CLAIMABLE':'AVAILABLE');if(action==='remind')value.event.state='upcoming';if(action==='open')value.event.trackable=false;page.read.mockResolvedValueOnce(value);await page.state.load();expect(page.state.action.value).toBe(action);const view=renderLive(page.state),primary=view.find('event-primary');
 const next=deferred<EventDetail>();page.read.mockReturnValueOnce(next.promise);const loading=page.state.load();expect(page.state.loading.value).toBe(true);await Vue.nextTick();if(primary){expect(view.find('event-primary')).toBe(primary);expect(primary.props['aria-disabled']).toBe(true);}await page.state.run();expect(page.join).not.toHaveBeenCalled();expect(page.claim).not.toHaveBeenCalled();
 next.reject(new ApiError({kind:'network',message:'offline'}));await loading;await page.state.run();expect(page.join).not.toHaveBeenCalled();expect(page.claim).not.toHaveBeenCalled();expect(page.remind).not.toHaveBeenCalled();expect(page.navTo).not.toHaveBeenCalled();
});
it.each(['auth','business','http','protocol','configuration','unknown'])('clears presentation after strict %s failure',async kind=>{
 const page=mount();await flush();page.read.mockRejectedValueOnce(kind==='unknown'?new Error('offline'):new ApiError({kind:kind as 'auth',message:'failed'}));await page.state.load();expect(page.state.detail.value).toBeNull();expect(page.state.action.value).toBeNull();expect(page.state.error.value).toBe(true);
});
it.each(['account','binding','language','runtime','event','hide','unmount'])('clears retained data synchronously and rejects old success/failure for %s',async kind=>{
 const page=mount();await flush();const old=deferred<EventDetail>(),older=deferred<EventDetail>(),fresh=deferred<EventDetail>();page.read.mockReturnValueOnce(older.promise).mockReturnValueOnce(old.promise).mockReturnValue(fresh.promise);
 const first=page.state.load(),second=page.state.load();
 if(kind==='account')page.account.accountKey='user:b';if(kind==='binding')page.account.accountBindingEpoch++;if(kind==='language')page.locale.code='vi';if(kind==='runtime'){page.runtime.epoch++;page.hooks.runtime();}if(kind==='event')page.hooks.load({id:'evt-2'});if(kind==='hide')page.hooks.hide();if(kind==='unmount')page.hooks.unmount();
 expect(page.state.detail.value).toBeNull();old.resolve(snapshot('CLAIMED'));older.reject(new ApiError({kind:'network',message:'late'}));await Promise.all([first,second]);expect(page.state.detail.value).toBeNull();expect(page.state.error.value).toBe(false);
 if(!['hide','unmount'].includes(kind)){fresh.resolve(snapshot('JOINED'));await flush();expect(page.state.detail.value?.userStatus).toBe('JOINED');}
});
it('latest refresh wins without enabling an older result and cold failure never invents data',async()=>{
 const page=mount();await flush();const a=deferred<EventDetail>(),b=deferred<EventDetail>();page.read.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);const one=page.state.load(),two=page.state.load();a.resolve(snapshot('CLAIMABLE'));await one;expect(page.state.loading.value).toBe(true);await page.state.run();expect(page.join).not.toHaveBeenCalled();expect(page.claim).not.toHaveBeenCalled();b.resolve(snapshot('CLAIMED'));await two;expect(page.state.action.value).toBeNull();expect(page.state.detail.value.userStatus).toBe('CLAIMED');
 page.hooks.hide();page.read.mockRejectedValueOnce(new ApiError({kind:'network',message:'offline'}));page.hooks.show();await flush();expect(page.state.detail.value).toBeNull();expect(page.state.error.value).toBe(true);
});
