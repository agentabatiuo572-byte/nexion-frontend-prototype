import { afterEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref, watch } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import source from "./events.vue?raw";
import missionsSource from "../missions/missions.vue?raw";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { createRemotePageRequestFence } from "@/lib/remote-page-request-fence";

vi.mock("@/api/order-api", () => ({ captureRuntimeRevision: () => ({}), isCurrentRuntimeRevision: () => true }));
const ast = ts.createSourceFile("events.ts", parse(source).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? node.name?.text === "loadRemoteEvents"
  : ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(ast) === "watch" && node.expression.arguments[0].getText(ast) === "() => luckySpin.open");
const code = ts.transpileModule(selected.map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const disposals: Array<() => void> = [];
afterEach(() => disposals.splice(0).forEach(stop => stop()));
const flush = async () => { await nextTick(); await Promise.resolve(); };
function mount() {
  const read = vi.fn().mockResolvedValue({ events: [{ eventCode: "wheel", userStatus: "JOINED", progressValue: 1 }] });
  const luckySpin = reactive({ open: false });
  const remoteEvents = ref<unknown[]>([]), remoteEventsError = ref(false), remoteEventsLoading = ref(false);
  const epoch = createRemoteAccountEpoch("user:a"), scope = effectScope();
  const deps = { watch, luckySpin, remoteEvents, remoteEventsError, remoteEventsLoading, language: ref("zh"),
    eventsApi: { state: read }, sessionVault: { read: () => ({}) }, remoteApiEnabled: true, epoch, createRemotePageRequestFence };
  const page = scope.run(() => new Function("deps", `const {${Object.keys(deps)}}=deps;
    let mounted=true;const remoteRequestFence=createRemotePageRequestFence(epoch,()=>mounted);
    ${code};return {hide(){mounted=false;remoteRequestFence.invalidate();}};`)(deps));
  disposals.push(() => { page.hide(); scope.stop(); });
  return { read, luckySpin, remoteEvents, remoteEventsError, remoteEventsLoading, epoch, ...page };
}

it("refreshes once per close, including the same Events component embedded in Missions", async () => {
  const page = mount(); await flush(); expect(page.read).not.toHaveBeenCalled();
  page.luckySpin.open = true; await flush(); expect(page.read).not.toHaveBeenCalled();
  page.luckySpin.open = false; await flush();
  expect(page.read).toHaveBeenCalledExactlyOnceWith("zh");
  expect(page.remoteEvents.value[0]).toEqual({ eventCode: "wheel", userStatus: "JOINED", progressValue: 1 });
  page.luckySpin.open = false; await flush(); expect(page.read).toHaveBeenCalledTimes(1);
  expect(missionsSource).toContain('<EventsContent v-else-if="activePanel === \'events\'" embedded />');
});

it("keeps a failed close refresh in the normal error state without retrying", async () => {
  const page = mount(); page.remoteEvents.value = [{ eventCode: "old" }];
  page.read.mockRejectedValue(new Error("offline"));
  page.luckySpin.open = true; await flush(); page.luckySpin.open = false; await flush(); await flush();
  expect(page.remoteEvents.value).toEqual([]); expect(page.remoteEventsError.value).toBe(true);
  expect(page.remoteEventsLoading.value).toBe(false); expect(page.read).toHaveBeenCalledTimes(1);
});

it("does not refresh hidden pages", async () => {
  const page = mount(); page.luckySpin.open = true; await flush(); page.hide();
  page.luckySpin.open = false; await flush(); expect(page.read).not.toHaveBeenCalled();
});

it.each(["hide", "account"])("drops a late close-refresh response after %s changes", async change => {
  const page = mount(); let resolve!: (value: unknown) => void;
  page.read.mockReturnValue(new Promise(done => { resolve = done; }));
  page.luckySpin.open = true; await flush(); page.luckySpin.open = false; await flush();
  if (change === "hide") page.hide(); else page.epoch.bind("user:b");
  resolve({ events: [{ eventCode: "stale-a" }] }); await flush();
  expect(page.remoteEvents.value).toEqual([]); expect(page.read).toHaveBeenCalledTimes(1);
});
