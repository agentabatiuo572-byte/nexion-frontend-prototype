import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this source contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { isMandatoryNotifKind } from "@/store/preferences";

/**
 * 简报 #214:「关键合规通知不可禁用」是页面自己写的声明,但 `system / 合规 / 监管`
 * 那一类和别的类一样能被关掉 —— 用户以为合规通知仍会送达,实际已被静音。
 *
 * 约束必须在**数据层**成立(而不只是把开关画灰):否则从别处调用 toggle、
 * 或服务端存量值/本地缓存把它关过,页面就会显示关闭态。
 */
const store = readFileSync(new URL("../../store/preferences.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("./preferences.vue", import.meta.url), "utf8");

describe("mandatory compliance notifications cannot be disabled", () => {
  it("classifies the system/compliance category as mandatory", () => {
    // 界面标签就是「系统 / 合规 / 监管」,所以这一类正是声明所指的那一类。
    expect(isMandatoryNotifKind("system")).toBe(true);
    // 其余五类仍是用户可自选的。
    for (const kind of ["commission", "team", "staking", "market", "genesis"] as const) {
      expect(isMandatoryNotifKind(kind)).toBe(false);
    }
  });

  it("refuses to toggle a mandatory category off", () => {
    expect(store).toMatch(/if \(isMandatoryNotifKind\(k\) && notifPrefs\.value\[k\]\) return;/);
  });

  it("normalizes local mandatory categories while preserving server authority", () => {
    const apply = store.match(/function applyVisibleNotifPrefs\(\)[\s\S]*?\n  \}/)?.[0];
    expect(apply, "必须能取到 applyVisibleNotifPrefs").toBeTruthy();
    expect(apply!).toMatch(/if \(!remoteApiEnabled\)\s*\{\s*for \(const kind of MANDATORY_NOTIF_KINDS\) visible\[kind\] = true;/);
  });

  it("locks the row in the UI and explains why", () => {
    expect(page).toMatch(/:locked="isMandatoryNotifKind\(k\)"/);
    expect(page).toMatch(/:hint="isMandatoryNotifKind\(k\) \? w\.notifMandatoryHint : undefined"/);
  });

  it("keeps the three locale strings distinct", () => {
    const zh = readFileSync(new URL("../../i18n/messages/zh.ts", import.meta.url), "utf8");
    const en = readFileSync(new URL("../../i18n/messages/en.ts", import.meta.url), "utf8");
    const vi = readFileSync(new URL("../../i18n/messages/vi.ts", import.meta.url), "utf8");
    for (const [name, src] of [["zh", zh], ["en", en], ["vi", vi]] as const) {
      expect(src, `${name} 必须有锁定说明`).toMatch(/notifMandatoryHint:/);
    }
  });
});
