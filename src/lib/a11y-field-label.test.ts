/**
 * 输入控件可访问名补齐层的**行为**测试。
 *
 * 为什么是行为而不是形状:这一层的全部价值在于「宿主上的 aria-label 真的落到
 * 内部真控件上」。写成子串哨兵的话,把 mirrorFieldAttributes 的函数体清空、
 * 或把 MIRRORED 清单删到只剩一项,字符串照样在文件里 —— 和
 * scripts/a11y-activate-behavior.test.mjs 开头记录的是同一个坑。
 *
 * 这里直接喂属性包 stub,断言"同步了什么 / 撤回了什么 / 有没有自激"。
 * 真浏览器里的效果(AX 树里 textbox 真的拿到名字)由运行期探针证明,见
 * 文件头记录的实测数据。
 */
import { describe, expect, it, vi } from "vitest";
import { installFieldNaming, MIRRORED_FIELD_ATTRIBUTES, mirrorFieldAttributes, uninstallFieldNaming } from "./a11y-field-label";

/** 最小属性包:只实现本层用到的四个方法。 */
function bag(initial: Record<string, string> = {}) {
  const attrs: Record<string, string> = { ...initial };
  return {
    attrs,
    writes: 0,
    getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
    setAttribute: (name: string, value: string) => { attrs[name] = value; },
    hasAttribute: (name: string) => name in attrs,
    removeAttribute: (name: string) => { delete attrs[name]; },
  };
}

describe("uni 输入控件的可访问名镜像", () => {
  it("把宿主声明的可访问名送到内部真控件 —— 本层存在的全部理由", () => {
    const host = bag({ "aria-label": "充值金额(USDT)" });
    const inner = bag();
    mirrorFieldAttributes(host, inner);
    expect(inner.attrs["aria-label"]).toBe("充值金额(USDT)");
  });

  it("必填/校验/说明等状态属性一并送到真控件", () => {
    const host = bag({
      "aria-required": "true",
      "aria-invalid": "true",
      "aria-describedby": "topup-amount-error",
      "aria-errormessage": "topup-amount-error",
      "aria-disabled": "true",
      "aria-labelledby": "topup-amount-label",
      "aria-autocomplete": "list",
    });
    const inner = bag();
    mirrorFieldAttributes(host, inner);
    for (const name of MIRRORED_FIELD_ATTRIBUTES) {
      expect(inner.attrs[name], name).toBe(host.attrs[name]);
    }
  });

  it("宿主撤回声明时真控件也撤回 —— 换语言后不许留旧名字", () => {
    const host = bag({ "aria-label": "Top-up amount (USDT)" });
    const inner = bag();
    mirrorFieldAttributes(host, inner);
    expect(inner.attrs["aria-label"]).toBe("Top-up amount (USDT)");

    // 语言切到 zh 后绑定短暂变 undefined,随后写成新值。
    delete host.attrs["aria-label"];
    mirrorFieldAttributes(host, inner);
    expect(inner.hasAttribute("aria-label")).toBe(false);
  });

  it("宿主没声明就不发明名字 —— placeholder 不是可访问名", () => {
    const inner = bag();
    mirrorFieldAttributes(bag(), inner);
    expect(inner.attrs).toEqual({});
  });

  it("值相同不写 —— 观察器被自己的写入触发时会收敛,不会自激", () => {
    const host = bag({ "aria-label": "支付金额(USDT)" });
    const inner = bag();
    mirrorFieldAttributes(host, inner);
    let writes = 0;
    const counting = {
      ...inner,
      setAttribute: (name: string, value: string) => { writes += 1; inner.setAttribute(name, value); },
      removeAttribute: (name: string) => { writes += 1; inner.removeAttribute(name); },
    };
    mirrorFieldAttributes(host, counting);
    mirrorFieldAttributes(host, counting);
    expect(writes).toBe(0);
  });

  it("不碰没声明的东西 —— 尤其不能把控件从 AX 树里摘掉", () => {
    const host = bag({ "aria-hidden": "true", "aria-live": "polite" });
    const inner = bag();
    mirrorFieldAttributes(host, inner);
    expect(inner.attrs).toEqual({});
    expect(MIRRORED_FIELD_ATTRIBUTES).not.toContain("aria-hidden");
    expect(MIRRORED_FIELD_ATTRIBUTES).not.toContain("aria-live");
  });

  it("宿主先出现、随后插入内部包装节点时仍给真输入框命名", () => {
    const host = bag({ "aria-label": "手机号码" });
    const inner = bag();
    let onMutations: (records: Array<{ type: string; target: unknown; addedNodes: unknown[] }>) => void = () => {};
    class FakeElement {
      closest() { return host; }
      querySelectorAll() { return []; }
      matches() { return false; }
    }
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("document", { documentElement: new FakeElement(), querySelectorAll: () => [] });
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: typeof onMutations) { onMutations = callback; }
      observe() {}
      disconnect() {}
    });
    const wrapper = new FakeElement();
    Object.assign(host, { querySelector: () => inner });
    try {
      installFieldNaming();
      onMutations([{ type: "childList", target: host, addedNodes: [wrapper] }]);
      expect(inner.attrs["aria-label"]).toBe("手机号码");
    } finally {
      uninstallFieldNaming();
      vi.unstubAllGlobals();
    }
  });
});
