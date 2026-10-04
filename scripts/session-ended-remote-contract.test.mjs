import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0, `missing ${start}`);
  assert.ok(to > from, `missing ${end}`);
  return source.slice(from, to);
}

describe("formal remote session-ended boundary", () => {
  it("clears and rebinds account-scoped state for both confirmed remote invalid-session exits", () => {
    const app = read("src/App.vue");
    const cleanup = between(app, "function clearInvalidRemoteSessionState", "// ── Account session guard");

    assert.match(cleanup, /sessionVault\.clear\(\);/);
    assert.match(cleanup, /useSession\(\)\.signOutSession\(\);/);
    assert.match(cleanup, /auth\.signOut\(\);/);
    assert.match(cleanup, /app\.bindAccount\("default"\);/);
    assert.match(cleanup, /rebindAccountScopedStores\("default"\);/);
    assert.match(cleanup, /stopBusinessLoops\(\);/);
    assert.doesNotMatch(cleanup, /interruptAllTasks/);

    const guard = between(app, "if (remoteApiEnabled && (!serverSession", "if (!auth.isAuthenticated)");
    const unauthorized = between(app, "setRemoteUnauthorizedHandler(() =>", "configureBehaviorAnalyticsContext");
    assert.match(guard, /clearInvalidRemoteSessionState\(auth\);/);
    assert.match(unauthorized, /clearInvalidRemoteSessionState\(auth\);/);
  });

  it("uses a generic, server-qualified public session-ended message for unknown reasons", () => {
    const page = read("src/pages/session/kicked.vue");
    assert.match(page, /session\.kickedReason === "logged-out"/);
    assert.match(page, /kickedBodySessionEnded/);
    assert.doesNotMatch(page, /voided \+ rolled back/);

    const locales = [
      { file: "src/i18n/messages/zh.ts", serverRecord: /服务器记录为准/, unsupported: /未结算部分不计入|账户与资金不受影响/ },
      { file: "src/i18n/messages/en.ts", serverRecord: /server records shown after you sign in again/, unsupported: /unsettled rewards are forfeited|account and funds are unaffected/i },
      { file: "src/i18n/messages/vi.ts", serverRecord: /bản ghi máy chủ/, unsupported: /phần thưởng chưa quyết toán bị mất|tài khoản và tiền không bị ảnh hưởng/i },
    ];
    for (const locale of locales) {
      const messages = read(locale.file);
      assert.match(messages, /kickedBodySessionEnded:/);
      assert.match(messages, /kickedTaskNote:/);
      assert.match(messages, locale.serverRecord);
      assert.doesNotMatch(messages, locale.unsupported);
    }
  });
});
