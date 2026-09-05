import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync(new URL("../src/pages/login/login.vue", import.meta.url), "utf8");
const withdrawal = readFileSync(new URL("../src/pages/me/wallet-withdraw.vue", import.meta.url), "utf8");

test("password login establishes the real backend session before entering protected flows", () => {
  // 🔴 只钉「authApi 来自运行时层」,不钉导入语句的**写法**(2026-08-12 合并收口):
  // 页面现在是 `import { authApi, remoteApiEnabled } from "@/api/runtime"` —— 合法的等价
  // 写法,而另一道门(server-auth-config-authority)恰好断言的就是这个带两项的形态。
  // 两道门钉同一行的不同写法 = 互相打架,谁改页面都会红一边。判据改成「有这个导入」。
  assert.match(login, /import \{[^}]*\bauthApi\b[^}]*\} from "@\/api\/runtime"/);
  assert.match(login, /await authApi\.login/);
  assert.doesNotMatch(login, /`\$\{country\.value\}\$\{phoneClean\.value\}@demo\.nexgrid\.ai`/);
});

test("a closed withdrawal switch does not masquerade as a fee-policy fetch failure", () => {
  assert.doesNotMatch(withdrawal, /policy !== null\s*&& policy\.withdrawalEnabled\s*&& policy\.enabledNetworks/);
  assert.match(withdrawal, /submitReasonWithdrawalClosed/);
});
