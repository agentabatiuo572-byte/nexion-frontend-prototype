/**
 * 商城手机收益基准的**取数耦合**契约(BUG 28)。
 *
 * 原缺陷形态:商城主列表显示「你的手机 $0.06/天」,点进 NexGridBox S1 详情页却显示
 * 「你的手机 暂无数据」「对比手机 暂无数据」。同一份基准跨页矛盾。
 *
 * 根因不在详情页的渲染(那里早已改读 earnConfig.phoneTiers,与列表同源),而在**取数**:
 * `refreshEarnConfig` 用 `Promise.all([taskPricing(), phoneTiers()])` 把两份互不相干的
 * 权威文档绑成一次全有或全无 —— 任务定价读失败(例如后端缺 nx_admin_device_task 行、
 * 或任务类数不是恰好 6 类)就把 phoneTiers 一起清空。列表那个数来自用户自己的设备投影,
 * 所以列表照常、详情降级,两页于是自相矛盾。
 *
 * 判据钉「两份文档各读各的」,而不是文案:只断言渲染层会把「接了但读不到」放过去。
 */
import { describe, expect, it } from "vitest";
import source from "./earn-config.ts?raw";

describe("商城手机档位与任务定价各自取数(BUG 28)", () => {
  it("两份文档不绑成一次全有或全无", () => {
    // Promise.all 是原缺陷形态:任一面 reject 就一起清空。
    expect(source).toContain("Promise.allSettled([");
    expect(source).not.toContain("await Promise.all([\n      earnConfigApi.taskPricing()");
  });

  it("单面失败只降级那一面,另一面保留", () => {
    // 定价失败时 phoneTiers 仍按自己的结果赋值(而不是被清空)。
    expect(source).toContain('if (pricingResult.status === "fulfilled")');
    expect(source).toContain('if (tiersResult.status === "fulfilled")');
    // 各自独立落值:两处都必须存在,少一处就说明又绑回去了。
    expect(source).toContain("taskPricing.value = pricingResult.value;");
    expect(source).toContain("phoneTiers.value = tiersResult.value;");
  });

  it("只有两面都成功才算 ready", () => {
    // 单面失败仍要报错(不许把半份数据说成 ready),但错误不得清掉已读到的另一面。
    expect(source).toContain("const failures = [pricingResult, tiersResult].filter((r) => r.status === \"rejected\");");
    expect(source).toContain('if (failures.length === 0)');
  });

  it("手机档位读成功时仍要灌进兼容表(列表与详情共用同一份)", () => {
    expect(source).toContain("applyCanonicalPhoneTierYields(tiersResult.value.tiers);");
  });
});
