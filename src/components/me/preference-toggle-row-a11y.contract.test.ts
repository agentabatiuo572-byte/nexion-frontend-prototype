import { describe, expect, it } from "vitest";
const source = (import.meta.glob("./preference-toggle-row.vue", {
  query: "?raw", import: "default", eager: true,
})["./preference-toggle-row.vue"] ?? "") as string;

describe("preference toggle accessibility", () => {
  it("exposes switch state and keyboard activation", () => {
    expect(source).toContain('role="switch"');
    expect(source).toContain(':aria-checked="value ? \'true\' : \'false\'"');
    // 键盘激活仍必须存在(简报 #214 给键盘处理加了 locked 判定,但非锁定行行为不变)。
    expect(source).toMatch(/@keydown\.enter\.prevent="locked \? undefined : emit\('toggle'\)"/);
    expect(source).toMatch(/@keydown\.space\.prevent="locked \? undefined : emit\('toggle'\)"/);
  });

  /**
   * 简报 #214:关键合规通知不可禁用。锁定行必须是**真正的**不可操作项 ——
   * 不只是视觉置灰:指针与键盘都不能激活它,且要向辅助技术声明 aria-disabled
   * 并退出 Tab 序(否则键盘用户会停在一个按了没反应的控件上)。
   */
  it("locked rows cannot be activated and announce it", () => {
    expect(source).toMatch(/:aria-disabled="locked \? 'true' : undefined"/);
    expect(source).toMatch(/:tabindex="locked \? -1 : 0"/);
    expect(source).toMatch(/@click="locked \? undefined : emit\('toggle'\)"/);
  });
});
