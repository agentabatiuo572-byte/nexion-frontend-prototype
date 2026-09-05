import { watch, nextTick, onBeforeUnmount, type Ref } from "vue";

/**
 * 弹层的键盘可用性:焦点移入 → Tab 只在层内循环 → Esc 关闭 → 关闭后焦点归还。
 *
 * 【为什么要抽出来】
 * 遮罩只拦指针,不拦键盘。全仓 15 个可开关的全屏遮罩里,此前只有 1 个做了焦点管理,
 * 其余 14 个打开后 Tab 会直接走到背景 —— 而背景里有提现、下单这类按钮。
 * 2026-08-11 的键盘可达性整改给 43 个控件补了 tabindex,**把这个既有缺陷放大了**:
 * 能被 Tab 到的背景控件比以前多。
 *
 * 逐个手写焦点管理的下场,看这次量面就知道:15 个里 14 个没写。所以抽成一处,
 * 弹层只需调用一次,行为由这里保证。写法抄自仓内两个已经做对的实现
 * (`country-code-sheet.vue` 的焦点归还、`earn/device-card-pc.vue` 的 Tab 陷阱)。
 *
 * 【为什么是 Tab 陷阱而不是给背景上 inert】
 * uni 的弹层就渲染在页面自己的组件树里(不是传送到 body 末尾),"背景"是同一棵树里的
 * 兄弟节点,拿不到一个稳定的"页面根"来上 inert。Tab 陷阱不依赖 DOM 结构,对键盘用户
 * 等效,且不会误伤别的东西。
 *
 * @param open 弹层开关(响应式)
 * @param root 弹层根:给根元素的选择器(如 `.vcs-root`),或自己取元素的函数。
 *             用选择器是因为 uni 的 template ref 可能拿到组件实例而非 DOM
 *             (`country-code-sheet.vue` 为此专门写了 `$el` 兜底类型);按根类名找最稳,
 *             `earn/device-card-pc.vue` 的既有实现也是这么做的。
 * @param close Esc 时怎么关。**可以不传** —— 有些弹层没有"取消"这个语义
 *              (断网遮罩只有「重试」一条路),给它接上 Esc 等于凭空造出一个
 *              用户以为处理了、其实什么都没处理的出口。不传则 Esc 不做任何事,
 *              但 Tab 陷阱与焦点归还照常。
 */
export function useDialogA11y(
  open: Ref<boolean>,
  root: string | (() => HTMLElement | null | undefined),
  close?: () => void,
): void {
  let previousFocus: HTMLElement | null = null;

  const rootEl = (): HTMLElement | null | undefined =>
    typeof root === "string"
      ? (typeof document === "undefined" ? null : document.querySelector<HTMLElement>(root))
      : root();

  /** 层内当前可聚焦的元素。offsetParent 为空的是隐藏元素,Tab 不该停在上面。 */
  function focusables(): HTMLElement[] {
    const el = rootEl();
    if (!el) return [];
    const root_ = el;
    const sel = '[tabindex]:not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]';
    // 🔴 用 getClientRects 判可见,不用 offsetParent:`position: fixed` 元素的 offsetParent
    // **恒为 null**(除非祖先有 transform),而弹层里恰恰常有 fixed 的吸底操作条 ——
    // 拿 offsetParent 过滤会把它们整批当成"隐藏"剔掉,Tab 就再也停不到确认按钮上。
    return Array.from(root_.querySelectorAll<HTMLElement>(sel)).filter((x) => x.getClientRects().length > 0);
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (!open.value) return;
    if (ev.key === "Escape") {
      if (!close) return;   // 没有取消语义的弹层:别吃掉 Esc,更别假装关掉了
      ev.preventDefault();
      ev.stopPropagation();
      close();
      return;
    }
    if (ev.key !== "Tab") return;
    const items = focusables();
    if (!items.length || typeof document === "undefined") return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    // 焦点已经在层外(current < 0)也要拉回来 —— 否则从背景 Tab 进来的人会继续往背景走。
    if (ev.shiftKey && current <= 0) {
      ev.preventDefault();
      ev.stopPropagation();
      items[items.length - 1].focus();
    } else if (!ev.shiftKey && (current < 0 || current === items.length - 1)) {
      ev.preventDefault();
      ev.stopPropagation();
      items[0].focus();
    }
  }

  function detach(): void {
    if (typeof document === "undefined") return;
    // capture 阶段:要赶在层内控件自己的 handler 之前拿到 Tab/Esc。
    document.removeEventListener("keydown", onKeydown, true);
  }

  watch(open, async (isOpen) => {
    if (typeof document === "undefined") return;
    detach();
    if (isOpen) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener("keydown", onKeydown, true);
      await nextTick();
      // 焦点必须真的移进来:不移的话读屏用户不知道弹层开了,键盘用户按 Tab 时
      // 焦点还在背景的触发按钮上,第一下 Tab 就走去了背景的下一个控件。
      focusables()[0]?.focus();
      return;
    }
    await nextTick();
    // 关闭后把焦点还回触发它的那个控件,否则焦点回到文档开头,用户要重新 Tab 一遍。
    previousFocus?.focus();
    previousFocus = null;
  // immediate:有些弹层不是靠自身的 v-if 开关,而是**整个组件被父级 v-if 挂载**
  // (captcha-slider 就是这样)。它们的 open 恒为 true,不给 immediate 的话 watch
  // 永远不触发,焦点管理一次都不会生效。对 open 初值为 false 的弹层,immediate 只会
  // 走一次"关闭"分支,而那时 previousFocus 是 null,无副作用。
  }, { immediate: true });

  onBeforeUnmount(detach);
}
