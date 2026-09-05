/**
 * 键盘激活层的**行为**门。
 *
 * 为什么静态判据不够:红测实测过——把 `installKeyboardActivation();` 注释掉、把
 * `target.click();` 注释掉,子串哨兵照样全绿(字符串还在文件里)。同族形状还有一堆:
 * 挂在永不执行的分支里、挂了但 handler 立即 return……形状判据是打不完的地鼠。
 * 所以这里**真的执行它**,断言「按下 Enter 之后 click 有没有真的发生」。
 *
 * 用最小 DOM stub 而不是引 jsdom:本层只用到 addEventListener / getAttribute /
 * tagName / click 四件事,20 行 stub 就够,不值得为它加一个依赖。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { installKeyboardActivation, uninstallKeyboardActivation } from "../src/lib/a11y-activate.ts";

/** 最小 document stub:只实现本层用到的部分。 */
function stubDocument() {
  const listeners = [];
  globalThis.document = {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: (type, fn) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  return listeners;
}

/** 造一个可聚焦控件。click() 记账,便于断言「到底有没有被激活」。 */
function el({ tag = "UNI-VIEW", role, ariaDisabled, isContentEditable = false } = {}) {
  const attrs = {};
  if (role !== undefined) attrs.role = role;
  if (ariaDisabled !== undefined) attrs["aria-disabled"] = ariaDisabled;
  return {
    tagName: tag,
    isContentEditable,
    clicks: 0,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    click() { this.clicks += 1; },
  };
}

/** 派发一次 keydown 给已挂载的 handler,返回该事件(可查 preventDefault 有没有被调)。 */
function press(listeners, key, target, extra = {}) {
  const ev = {
    key,
    target,
    defaultPrevented: false,
    altKey: false, ctrlKey: false, metaKey: false,
    preventDefault() { this.defaultPrevented = true; },
    ...extra,
  };
  for (const l of listeners) if (l.type === "keydown") l.fn(ev);
  return ev;
}

function setup() {
  uninstallKeyboardActivation();
  const listeners = stubDocument();
  installKeyboardActivation();
  assert.equal(listeners.filter((l) => l.type === "keydown").length, 1, "平台层没有挂上 keydown 监听");
  return listeners;
}

test("Enter 激活 role=button —— 本层存在的全部理由", () => {
  const L = setup();
  const btn = el({ role: "button" });
  const ev = press(L, "Enter", btn);
  assert.equal(btn.clicks, 1, "按 Enter 没有产生 click");
  assert.equal(ev.defaultPrevented, true, "激活后没有 preventDefault");
});

test("Space 激活 role=button 并拦掉翻页", () => {
  const L = setup();
  const btn = el({ role: "button" });
  const ev = press(L, " ", btn);
  assert.equal(btn.clicks, 1);
  assert.equal(ev.defaultPrevented, true, "Space 不 preventDefault 会连带滚一屏");
});

test("role=link 只认 Enter,不认 Space(Space 在链接上是翻页)", () => {
  const L = setup();
  const link = el({ tag: "UNI-TEXT", role: "link" });
  press(L, " ", link);
  assert.equal(link.clicks, 0, "link 不该被 Space 激活");
  press(L, "Enter", link);
  assert.equal(link.clicks, 1, "link 应该被 Enter 激活");
});

test("控件自己处理过就让路 —— 防双触发", () => {
  const L = setup();
  const btn = el({ role: "button" });
  press(L, "Enter", btn, { defaultPrevented: true });
  assert.equal(btn.clicks, 0, "已被自身 handler 处理的事件仍被合成 click = 同一动作跑两次");
});

test("aria-disabled 的控件键盘也进不去 —— 与视觉置灰、handler early-return 并列的第三道", () => {
  const L = setup();
  const btn = el({ role: "button", ariaDisabled: "true" });
  press(L, "Enter", btn);
  press(L, " ", btn);
  assert.equal(btn.clicks, 0, "置灰控件被键盘绕过了");
});

test("正在打字的元素不拦 —— 输入框里按 Enter 不该激活任何东西", () => {
  const L = setup();
  for (const tag of ["INPUT", "TEXTAREA", "UNI-INPUT", "UNI-TEXTAREA"]) {
    const field = el({ tag, role: "button" }); // 即便误挂了 role 也不该拦
    press(L, "Enter", field);
    assert.equal(field.clicks, 0, `${tag} 上的 Enter 被拦截了`);
  }
  const rich = el({ role: "button", isContentEditable: true });
  press(L, "Enter", rich);
  assert.equal(rich.clicks, 0, "contenteditable 上的 Enter 被拦截了");
});

test("没有可激活 role 的元素不被激活", () => {
  const L = setup();
  const plain = el({});
  const decorative = el({ role: "presentation" });
  press(L, "Enter", plain);
  press(L, "Enter", decorative);
  assert.equal(plain.clicks + decorative.clicks, 0);
});

test("带修饰键的是快捷键,不是激活", () => {
  const L = setup();
  const btn = el({ role: "button" });
  press(L, "Enter", btn, { ctrlKey: true });
  press(L, "Enter", btn, { metaKey: true });
  press(L, "Enter", btn, { altKey: true });
  assert.equal(btn.clicks, 0);
});

test("按住不放只激活一次 —— 长按是运动障碍用户最常见的按法", () => {
  const L = setup();
  const btn = el({ role: "button" });
  press(L, "Enter", btn);                     // 首次按下
  press(L, "Enter", btn, { repeat: true });   // 按住后浏览器持续派发的那些
  press(L, "Enter", btn, { repeat: true });
  assert.equal(btn.clicks, 1, "按住 Enter 被合成了多次 click —— 落在提现/下单上就是连续提交");
  const sw = el({ role: "switch" });
  press(L, " ", sw);
  press(L, " ", sw, { repeat: true });
  assert.equal(sw.clicks, 1, "按住 Space 让开关来回翻转");
});

test("重复挂载幂等 —— HMR 下不会变成一次按键激活两次", () => {
  const L = setup();
  installKeyboardActivation();
  installKeyboardActivation();
  assert.equal(L.filter((l) => l.type === "keydown").length, 1, "监听器被重复挂上了");
  const btn = el({ role: "button" });
  press(L, "Enter", btn);
  assert.equal(btn.clicks, 1);
});
