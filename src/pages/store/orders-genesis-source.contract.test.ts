// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * BUG 174: Genesis 未开放被误显示为「订单目录同步失败」。
 *
 * 根因是页面把**资格**判定当成了**订单历史**可用性:资格不可用(无 ACTIVE
 * 系列行)时账号投影其实照常可读,却让 Genesis 源被标成不可用,于是顶层横幅
 * 报「订单目录同步失败」,同刻主内容区又渲染「还没有订单」。
 */
const source = readFileSync(new URL("./orders.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("orders page Genesis source verdict", () => {
  it("keys the Genesis source on the account projection, never on eligibility", () => {
    const wiring = source.slice(source.indexOf("createRemoteOrdersRefresh({"), source.indexOf("})();"));
    expect(wiring).toContain('genesisAccountUnavailable: () => genesis.remoteAccountReadState !== "ready"');
    expect(wiring).not.toContain("remoteEligibilityError");
  });

  it("raises the top-level outage banner only from the per-source verdict, not from eligibility", () => {
    const banner = source.slice(source.indexOf("const unavailableOrderSources"), source.indexOf("const orderPanels"))
      .replace(/\/\/[^\n]*/g, "");
    expect(banner).toContain("commerceOrdersUnavailable.value");
    expect(banner).toContain("genesisOrdersUnavailable.value");
    expect(banner).toContain("t.value.orders.refreshFailed");
    expect(banner).not.toContain("remoteEligibilityError");
    expect(banner).not.toContain("seriesUnavailable");
  });

  it("re-arms the per-source verdict on an explicit resync", () => {
    // 重试必须能真正清掉错误:首次读重置判定,之后每轮都由当轮真实结果覆盖。
    expect(source).toMatch(/if \(!remoteOrdersResolved\.value\) \{[\s\S]{0,220}genesisOrdersUnavailable\.value = false/);
    expect(source).toMatch(/genesisOrdersUnavailable\.value = outcome\.genesisUnavailable/);
  });
});
