import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import vm from "node:vm";

const result = buildSync({
  entryPoints: ["src/lib/recoverable-funds-operation.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
vm.runInNewContext(`(function(module,exports,require){${result.outputFiles[0].text}\n})(module,module.exports,require)`, {
  module,
  require,
});
const { runRecoverableFundsOperation } = module.exports;

for (const reason of [
  "Table 'nx_funds_sandbox_wallet' doesn't exist",
  "HTTP_401",
  "NETWORK_UNAVAILABLE",
]) {
  test(`rejected funds request becomes a safe retryable UI state: ${reason}`, async () => {
    let visibleError = "";
    let loading = true;
    const safeMessage = "操作暂时没有完成，请稍后重试。";
    const result = await runRecoverableFundsOperation(
      async () => { throw new Error(reason); },
      {
        success: () => assert.fail("rejection must not enter success"),
        failure: (message) => { visibleError = message; },
        settled: () => { loading = false; },
      },
      safeMessage,
    );
    assert.equal(result, null);
    assert.equal(visibleError, safeMessage);
    assert.notEqual(visibleError, reason);
    assert.equal(loading, false);
  });
}
