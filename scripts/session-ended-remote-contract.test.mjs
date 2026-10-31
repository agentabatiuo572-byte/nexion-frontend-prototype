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

  it("asks for sign-in and record review without inventing task or settlement outcomes", () => {
    const page = read("src/pages/session/kicked.vue");
    assert.match(page, /session\.kickedReason === "logged-out"/);
    assert.match(page, /kickedBodySessionEnded/);
    assert.doesNotMatch(page, /voided \+ rolled back/);

    // Vietnamese wording follows the 2026-10-29 copy audit (2be70b79).
    const locales = [
      { file: "src/i18n/messages/zh.ts", body: "当前登录已结束。请重新登录后查看任务和结算记录。", taskNote: "任务和结算状态以重新登录后显示的记录为准。", unsupported: /未结算部分不计入|账户与资金不受影响/ },
      { file: "src/i18n/messages/en.ts", body: "This sign-in has ended. Sign in again to view your task and settlement records.", taskNote: "Task and settlement status follows the records shown after you sign in again.", unsupported: /unsettled rewards are forfeited|account and funds are unaffected/i },
      { file: "src/i18n/messages/vi.ts", body: "Phiên đăng nhập này đã kết thúc. Hãy đăng nhập lại để xem lịch sử tác vụ và thu nhập.", taskNote: "Trạng thái tác vụ và thu nhập theo bản ghi hiển thị sau khi đăng nhập lại.", unsupported: /phần thưởng chưa quyết toán bị mất|tài khoản và tiền không bị ảnh hưởng/i },
    ];
    for (const locale of locales) {
      const messages = read(locale.file);
      assert.equal(messages.match(/\bkickedBodySessionEnded:\s*"([^"]*)"/)?.[1], locale.body);
      assert.equal(messages.match(/\bkickedTaskNote:\s*"([^"]*)"/)?.[1], locale.taskNote);
      assert.doesNotMatch(messages, locale.unsupported);
    }
  });
});
