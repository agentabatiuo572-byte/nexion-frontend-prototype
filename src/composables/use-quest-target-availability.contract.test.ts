/**
 * 任务目标业务可用性的**取数接线**契约(BUG 127 / 155)。
 *
 * 原缺陷不是判据写错,而是**判据拿不到输入**:`stakingClosed` 要求「远程快照已就绪
 * 且没有任何一档可开」,而 `remoteReady` 只由 `bindAccount` / `syncRemote` 置位 ——
 * 任务页(首页、任务中心)从不调它们。于是 `remoteReady` 恒为 false、
 * `stakingClosed` 恒为 false,**闸门在任务面上永远是开的**:质押四档全部
 * 「暂停售卖」时,周任务 hero 照样渲染「去完成」。
 *
 * 所以判据钉两件事:
 *   ① 本 composable 自己把质押快照拉起来(与兑换那一路同形);
 *   ② 拉取失败 / 未就绪仍然算「可用」——「不知道」不许变成「已停售」,
 *      否则一次网络抖动就会把用户的任务说成被下掉了。
 */
import { describe, expect, it } from "vitest";
import source from "@/composables/use-quest-target-availability.ts?raw";

describe("任务可用性读数自己取数,不依赖别的页面先跑一遍(BUG 127/155)", () => {
  it("质押「还有没有档位可售」由本 composable 自己读公开目录", () => {
    // 判据不能挂在 staking.remoteReady 上:那个标志由 syncRemote 置位,而它同时还要拉
    // 用户持仓 —— 任务页不调它,或持仓那一半读失败,remoteReady 就留在 false,
    // stakingClosed 恒 false,闸门永远开着。
    expect(source).toContain("stakingApi.fetchStakingPools()");
    expect(source).toContain("remotePools");
    expect(source).not.toContain("staking.syncRemote()");
    expect(source).not.toContain("remoteReady: staking.remoteReady");
  });

  it("兑换开关仍然按公开只读 caps 拉取,失败算「不知道」", () => {
    expect(source).toContain("exchangeApi.fetchCaps()");
    expect(source).toContain("exchangeClosed.value = false");
  });

  it("读不到目录一律判「可用」,不把未知当成已停售", () => {
    // 读失败 → remotePools 保持 null → 提前 return false(可用)。这一行是 fail-open 的唯一闸。
    expect(source).toContain("if (!pools) return false;");
    // 全部档位都不可开,才算整个业务停售。
    expect(source).toContain("!STAKING_TERMS.some((term) => canOpenStakingPool(state, term))");
  });
});
