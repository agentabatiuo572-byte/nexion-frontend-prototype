import { computed, reactive, ref } from "vue";
import { expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./how-it-works.vue?raw";

function setup() {
  let finish!: (ready: boolean) => void;
  const staking = reactive({ isMockMode: false, remoteReady: false, remoteHasSnapshot: false, remoteError: null as string | null,
    pools: [] as Array<{ enabled: boolean; killed: boolean; status: string }>,
    syncRemote: vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })),
  });
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile("how.ts", script, ts.ScriptTarget.Latest, true);
  const parts = ast.statements.filter(node => ts.isVariableStatement(node)
    ? node.declarationList.declarations.some(d => d.name.getText(ast) === "stakingAvailable")
    : ts.isFunctionDeclaration(node) && node.name?.text === "refreshStakingAvailability");
  const js = ts.transpileModule(parts.map(n => n.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const page = new Function("staking", "computed", "ref", `${js};return { stakingAvailable, refreshStakingAvailability };`)(staking, computed, ref);
  return { staking, page, finish: (ready: boolean) => finish(ready) };
}

it("reflects the winning store snapshot when the page's older read is superseded", async () => {
  const h = setup(); const oldRead = h.page.refreshStakingAvailability();
  h.staking.pools = [{ enabled: true, killed: false, status: "ACTIVE" }];
  h.staking.remoteHasSnapshot = h.staking.remoteReady = true;
  h.finish(false); await oldRead;
  expect(h.page.stakingAvailable.value).toBe(true);
});
it("tracks a paused pool, real authority failure and account-snapshot reset without stale availability", async () => {
  const h = setup(); const read = h.page.refreshStakingAvailability();
  h.staking.pools = [{ enabled: true, killed: false, status: "ACTIVE" }];
  h.staking.remoteHasSnapshot = h.staking.remoteReady = true;
  h.finish(true); await read;
  expect(h.page.stakingAvailable.value).toBe(true);
  h.staking.pools[0].killed = true; expect(h.page.stakingAvailable.value).toBe(false);
  h.staking.remoteError = "OFFLINE"; h.staking.remoteReady = false;
  expect(h.page.stakingAvailable.value).toBeNull();
  h.staking.remoteError = null; h.staking.remoteReady = true; h.staking.remoteHasSnapshot = false;
  expect(h.page.stakingAvailable.value).toBeNull();
});
