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
  const read = vi.fn().mockResolvedValue(snapshot()), join = vi.fn().mockResolvedValue({}), claim = vi.fn().mockResolvedValue({}), navTo = vi.fn();
  const hooks: Record<string, (...args: any[]) => void> = {};
  const unsubscribe = vi.fn();
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onUnmounted: (fn: () => void) => { hooks.unmount = fn; } },
    "@dcloudio/uni-app": { onLoad: (fn: () => void) => { hooks.load = fn; }, onShow: (fn: () => void) => { hooks.show = fn; }, onHide: (fn: () => void) => { hooks.hide = fn; } },
    "@/components/app-chassis.vue": {}, "@/components/sub-page-header.vue": {},
    "@/components/ui/nx-button.vue": {},
    "@/api/runtime": { apiClient: {}, eventsApi: { join, claim }, remoteApiEnabled: true },
    "@/api/order-api": { captureRuntimeRevision: () => runtime, subscribeRuntimeRevision: (fn: () => void) => { hooks.runtime = fn; return unsubscribe; } },
    "@/api/event-detail-api": { createEventDetailApi: () => ({ detail: read }) },
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
  return { state, account, locale, runtime, hooks, unsubscribe, read, join, claim, navTo };
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
