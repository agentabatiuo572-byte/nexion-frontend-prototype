/**
 * 连签增益与等级奖励的**业务真实性**契约(BUG 195 / 196)。
 *
 * 两条缺陷同型:界面把「配置里写了」当成「用户真能拿到」。
 *   · 195:连签 30/60 天承诺解锁质押入口与 Genesis 资格,而那两项业务当时已整体停用;
 *   · 196:等级卡标题是**当前阶**,展示的却是**下一阶**的培育奖 —— V0 用户看到「奖励:50 NEX」,
 *          而后台 V0 根本没配奖励。
 *
 * 判据取「源码里是否真的接上了权威判据」,而不是文案子串:这两处都是接线缺失,
 * 只断言文案会把「接了但接错」放过去。
 *
 * 用 `?raw` 读源码而不是 node:fs —— 本仓测试跑在浏览器环境,node 内建模块不可用。
 */
import { describe, expect, it } from "vitest";
import streak from "@/components/daily/streak-power-ups.vue?raw";
import team from "@/pages/team/team.vue?raw";
import api from "@/api/points-api.ts?raw";

describe("连签增益只在目标业务可用时承诺可激活(BUG 195)", () => {
  it("依赖业务的档位接上了可用性判据,而不是只看签到天数", () => {
    // 只按天数解锁 = 原缺陷:业务停了照旧给入口。
    expect(streak).toContain("useQuestTargetAvailability");
    expect(streak).toContain("questActionDomain");
    expect(streak).toContain("isBusinessSuspended");
  });

  it("Genesis 主售与二级各用各的闸,不共用一句「创世关了」", () => {
    // 二级卖的是别人手里的存量,主售售罄不妨碍转让 —— 合并判断会在售罄时误停二级。
    expect(streak).toContain("genesisGate.block.value");
    expect(streak).toContain("genesisGate.secondaryBlock.value");
    expect(streak).toContain("genesisBlockIsKnownUnavailable");
  });

  it("服务端声明的可用性优先于客户端推断", () => {
    // 服务端读的是各域自己的读模型,比客户端本地推断更权威;旧服务端不返回时才回退。
    expect(api).toContain("businessAvailable: boolean | null");
    expect(streak).toContain("p.serverBusinessAvailable !== undefined");
    expect(streak).toContain("return p.serverBusinessAvailable === false;");
  });

  it("停用时不再渲染可点的激活入口", () => {
    // 服务端未确认可用时,不展示原权益承诺或激活入口。
    const suspended = streak.indexOf('!isBusinessReady(p)" :style="lockedLabelStyle"');
    const activatable = streak.indexOf('isUnlocked(p)" class="inline-flex items-center active:opacity-85"');
    expect(suspended).toBeGreaterThan(-1);
    expect(activatable).toBeGreaterThan(-1);
    expect(suspended).toBeLessThan(activatable);
    expect(streak).toContain("if (!isBusinessReady(p)) return;");
    expect(streak).toContain("p.labelText ?? w[`${p.key}_label`]");
    expect(streak).toContain("isClaimed(p.id) ? (p.descText");
    expect(streak).toContain('isClaimed(p.id) && !isBusinessReady(p)');
    expect(streak).toContain("isBusinessReady(p) && isUnlocked(p)");
  });

  it("未知一律不算停用(读不到开关不能诬告业务已关闭)", () => {
    const body = streak.match(/function isBusinessSuspended\(p: PowerUp\): boolean \{([\s\S]*?)\n\}/)?.[1];
    expect(body).toBeTruthy();
    const suspended = new Function("p", "questActionDomain", "availability", "genesisPrimaryClosed", "genesisSecondaryClosed", body!);
    const args = [() => "staking", { value: { stakingClosed: true } }, { value: false }, { value: false }];
    expect(suspended({ href: "/wallet/staking", serverBusinessAvailable: null }, ...args)).toBe(false);
    expect(suspended({ href: "/wallet/staking", serverBusinessAvailable: true }, ...args)).toBe(false);
    expect(suspended({ href: "/wallet/staking", serverBusinessAvailable: false }, ...args)).toBe(true);
    expect(suspended({ href: "/wallet/staking" }, ...args)).toBe(true);
  });
});

describe("等级卡不把下一阶奖励说成本阶奖励(BUG 196)", () => {
  it("精简等级卡只展示当前阶位,不把下一阶奖励当成当前奖励", () => {
    const rankCard = team.slice(team.indexOf("<!-- My V-rank summary -->"), team.indexOf("<!-- Unified quick nav -->"));
    expect(rankCard).toContain("{{ myRankDisplay }}");
    expect(rankCard).not.toContain("cultivationBonus");
    expect(rankCard).not.toContain("prize");
  });

  it("等级卡仍能进入服务器阶位详情查看奖励", () => {
    const rankCard = team.slice(team.indexOf("<!-- My V-rank summary -->"), team.indexOf("<!-- Unified quick nav -->"));
    expect(rankCard).toContain("go('/pages/team/rank')");
  });
});
