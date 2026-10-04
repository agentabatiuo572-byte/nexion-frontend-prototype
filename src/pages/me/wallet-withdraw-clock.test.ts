import { expect, test } from "vitest";
import source from "./wallet-withdraw.vue?raw";
import ts from "typescript";

function mountClock() {
  const block = source.slice(source.indexOf("const nowTick = ref(mockServerNow());"), source.indexOf("const freezeLeftMs ="));
  const code = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const hooks: Record<string, Array<() => void>> = { mounted: [], show: [], hide: [], unmounted: [] };
  const timers = new Map<number, () => void>(); let sequence = 0; let now = 1000;
  const state = new Function("ref", "mockServerNow", "onMounted", "onShow", "onHide", "onUnmounted", "setInterval", "clearInterval", "remoteApiEnabled", "payout", "retryWithdrawalFacts", "refreshPendingAttempt", "stopWithdrawalFactsRuntimeWatch", code + ";return {nowTick};")(
    (value: number) => ({value}), () => now,
    (fn: () => void) => hooks.mounted.push(fn), (fn: () => void) => hooks.show.push(fn), (fn: () => void) => hooks.hide.push(fn), (fn: () => void) => hooks.unmounted.push(fn),
    (fn: () => void) => { timers.set(++sequence, fn); return sequence; }, (id: number) => timers.delete(id),
    false, {}, () => Promise.resolve(), () => {}, () => {},
  );
  const run = (name: string) => hooks[name].forEach(fn => fn());
  return {state, timers, run, advance: (value: number) => { now = value; }};
}

test("hidden withdrawal pages stop ticking and remount cleanup is idempotent", () => {
  const c = mountClock(); c.run("mounted"); c.run("show"); expect(c.timers.size).toBe(1);
  c.run("hide"); expect(c.timers.size).toBe(0);
  c.run("show"); c.run("show"); expect(c.timers.size).toBe(1);
  c.run("unmounted"); c.run("unmounted"); expect(c.timers.size).toBe(0);
});

test("returning refreshes the server clock immediately before the next tick", () => {
  const c = mountClock(); c.run("mounted"); c.run("show"); c.run("hide"); c.advance(99000);
  c.run("show"); expect(c.state.nowTick.value).toBe(99000);
});
