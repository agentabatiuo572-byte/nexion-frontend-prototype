import { computed, reactive, ref } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./lucky-spin-sheet.vue?raw";
import { ApiError } from "@/api/errors";
import { spinFailure } from "@/lib/lucky-spin-failure";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const ast = ts.createSourceFile("spin.ts", parse(source).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const names = new Set(["spinSubmitting", "doSpin", "executeSpin", "hasPendingSpin"]);
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name!.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast))));
const script = ts.transpileModule(selected.map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function mount(copy = zh) {
  let available = 1;
  const spin = reactive({ activeEventCode: "evt-spring-spin", pendingSpin: null as {key:string}|null, pendingStorageError:false, hasFreeSpinToday: () => true, availableSpins: () => available,
    spinRemote: vi.fn().mockResolvedValue({ok:true,prizeId:"tier"}) });
  const overlay = { show: vi.fn(), hide: vi.fn() }, warn = vi.fn(), confirm = vi.fn().mockResolvedValue(true);
  const deps = { computed, reactive, ref, spin, t:ref(copy), remoteApiEnabled:true, accountGeneration:0, confirm,
    netError:overlay, toast:{warn}, clearSettleTimer:vi.fn(), settleTimer:null, settleSpin:vi.fn(), setTimeout:vi.fn() };
  const actions = new Function(...Object.keys(deps), `${script}\nreturn {doSpin,hasPendingSpin,changeScope(){accountGeneration++;}};`)(...Object.values(deps));
  return { ...actions, spin, overlay, warn, confirm, noSpins:()=>{available=0;} };
}

it.each([zh,en,vietnamese])("shows a localized definite-rejection message and retires that intent", async copy => {
  const page = mount(copy);
  const failure = spinFailure(new ApiError({kind:"http",status:409,code:409,message:"WHEEL_PAYOUT_MUTEX_UNAVAILABLE"}));
  page.spin.spinRemote.mockResolvedValueOnce({ok:false,prizeId:null,failure});
  await page.doSpin();
  expect(page.warn).toHaveBeenCalledWith(copy.luckySpin.spinFailedTitle,copy.luckySpin.spinUnavailable);
  expect(page.overlay.show).not.toHaveBeenCalled(); expect(page.hasPendingSpin.value).toBe(false);
  expect(page.spin.spinRemote).toHaveBeenCalledWith("evt-spring-spin", false);
});

it("retains the same key and recovery CTA after an uncertain response and zero refreshed spins", async () => {
  const page = mount();
  page.spin.spinRemote.mockResolvedValueOnce({ok:false,prizeId:null,failure:spinFailure(new Error("lost response"))});
  await page.doSpin(); page.spin.pendingSpin = {key:"persisted-original"}; page.noSpins();
  expect(page.hasPendingSpin.value).toBe(true);
  const overlay = page.overlay.show.mock.calls[0][0];
  expect(overlay.message).toBe(zh.luckySpin.spinUnknown);
  page.spin.spinRemote.mockImplementationOnce(async () => { page.spin.pendingSpin=null; return {ok:true,prizeId:"tier"}; });
  await page.doSpin(true);
  expect(page.spin.spinRemote.mock.calls).toEqual([["evt-spring-spin",false],["evt-spring-spin",true]]);
  expect(source).not.toContain("pendingSpinKeys");
  expect(page.hasPendingSpin.value).toBe(false); expect(page.confirm).not.toHaveBeenCalled();
  expect(source.indexOf('v-if="hasPendingSpin')).toBeLessThan(source.indexOf('v-else-if="spin.remoteEnded"'));
});

it("does not replay a stale overlay callback into a new account or event", async () => {
  const page = mount();
  page.spin.spinRemote.mockResolvedValue({ok:false,prizeId:null,failure:spinFailure(new Error("lost"))});
  await page.doSpin(); const retry = page.overlay.show.mock.calls[0][0].onRetry;
  page.changeScope(); retry(); await Promise.resolve();
  expect(page.spin.spinRemote).toHaveBeenCalledTimes(1);
});

it("never renders unknown diagnostic strings as public error text", () => {
  const failure = spinFailure(new ApiError({kind:"http",status:409,message:"request contains private payload"}));
  expect(failure).toMatchObject({ambiguous:true,messageKey:"spinUnknown",businessCode:undefined});
  for (const copy of [zh,en,vietnamese]) expect(Object.values(copy.luckySpin).filter(value=>typeof value==='string').join(' ')).not.toMatch(/区块链网络繁忙|抽奖券没扣|ticket is untouched|vé quay của bạn vẫn còn nguyên/);
});

it.each([
  ["WHEEL_PAYOUT_MUTEX_UNAVAILABLE", "spinUnavailable"],
  ["WHEEL_COMFORT_TIER_MISSING", "spinUnavailable"],
  ["WHEEL_EVENT_NOT_OPEN", "spinClosed"],
  ["WHEEL_DAILY_LIMIT_REACHED", "spinLimit"],
  ["WHEEL_SPIN_TICKET_CONFLICT", "spinLimit"],
])("recognizes explicit HTTP and business-envelope %s rejections", (message, messageKey) => {
  for (const error of [new ApiError({kind:"http",status:409,code:409,message}),new ApiError({kind:"business",status:200,code:409,message})]) {
    expect(spinFailure(error)).toMatchObject({ambiguous:false,messageKey,businessCode:message});
  }
  expect(spinFailure(new ApiError({kind:"http",status:503,message})).ambiguous).toBe(true);
});
