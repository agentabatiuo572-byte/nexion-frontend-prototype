/**
 * 自造控件的键盘激活层。
 *
 * 【为什么需要这一层】
 * 原生 button 元素白送键盘行为——没人给它写 keydown。本仓禁用了原生
 * button(uni 默认 chrome 过重:border + min-height + ::after hairline + bg,
 * PITFALLS P-036),于是**丢掉了原生按钮免费附带的键盘语义,却没有补上替代层**,
 * 每个自造按钮只能各自手搓 `@keydown.enter/.space`。
 *
 * 2026-08-11 全仓实测的结果:108 个控件写了 role="button" tabindex="0" 却没有
 * 任何 keydown,另有 43 个连 tabindex 都没写。浏览器实景复核:tabindex 确实落到
 * DOM、focus() 确实成功——也就是**焦点能停上去,按 Enter 没反应**,是最坏的组合
 * (读屏念出「按钮」,键盘用户按了什么都不发生,WCAG 2.1.1 不达标)。
 *
 * 【为什么不是逐个补 keydown】
 * 151 处手工补,漏改率实测 40%,而且未来每个新控件都要重新记得写一遍——这不是
 * 151 个独立 bug,是一个架构缺口的 151 个症状。补上缺失的那一层之后,作者只需
 * 声明 `role` + `tabindex`(本来就该声明的两样),键盘行为由平台给,大体上回到
 * 原生 button 的工作方式(**不完全等同**:见下面 ev.repeat 那条,本层更严格)。
 *
 * 【契约】声明 role + tabindex = 得到键盘激活。机器门 a11y-activate-gate.mjs
 * 守住这个契约的两端:半个承诺(只写其一)会被拦,本层被删/未挂载也会被拦。
 *
 * 【本层不做什么 —— 边界写清楚,免得下一个人以为它管了】
 * · **不管手写了 keydown 的控件**:它们 `.prevent` 之后本层直接让路(见 defaultPrevented)。
 *   仓内约 67 处属于此类,它们的按住连发、Space 语义都由自己负责。
 * · **不管弹层遮罩**:遮罩只拦指针,不拦键盘;背景控件仍可被 Tab 聚焦并激活。
 *   曾考虑在这里加几何命中测试来挡,独立证伪后否决——遮罩层级不是单源(遮不住页头/状态栏)、
 *   `pointer-events:none` 子树会返回祖先、动画期间包围盒失真会让真按钮按不动,是拿脆弱的
 *   几何启发式治症状。正解是弹层自己上 `inert` + 焦点陷阱(仓内 country-code-sheet 与
 *   device-card-pc 有现成写法),属弹层焦点管理专项,不在本层。
 * · **不替控件判断"能不能点"**:`aria-disabled` 只是不激活(见下),真正的守卫在各 handler 里。
 */

/**
 * 按 ARIA 规范可用键盘激活的 role → 它接受哪些键。
 *
 * 键的分配照规范来,不是一律 Enter+Space:link 只认 Enter(在链接上按 Space
 * 是翻页,拦掉会把页面滚动吃了);radio 只认 Space(Enter 在单选组里是提交)。
 *
 * 页面控件也遵守同一语义:role="link" 不额外拦截 Space。
 */
const ACTIVATION_KEYS: Readonly<Record<string, readonly string[]>> = {
  button: ["Enter", " "],
  link: ["Enter"],
  switch: ["Enter", " "],
  checkbox: ["Enter", " "],
  radio: [" "],
  tab: ["Enter", " "],
  option: ["Enter", " "],
  menuitem: ["Enter", " "],
  menuitemcheckbox: ["Enter", " "],
  menuitemradio: ["Enter", " "],
};

/** 正在打字的元素——它们自己要吃 Enter/Space,一律不拦。 */
const TYPING_TAGS = /^(INPUT|TEXTAREA|SELECT|UNI-INPUT|UNI-TEXTAREA)$/;

function onKeydown(ev: KeyboardEvent): void {
  // 控件自己已经处理过了(手写 keydown 都带 .prevent,门守着)。不查这一条就是双触发:
  // 一次它自己的 handler,一次这里合成的 click。
  if (ev.defaultPrevented) return;
  // 🔴 按住不放会被浏览器持续派发 keydown。不挡就是「按住 Enter 连续提交提现」——
  // 而长按恰恰是运动障碍用户最常见的按键方式,本层要服务的正是他们。
  // 注意这比原生 button 严格:原生按住 Enter 也会重复 click。自造控件没有「按住连发」
  // 的正当用途(那是 spinbutton 的事),所以这里选更安全的默认。
  // ⚠️ 只覆盖本层的激活路径。仓内 67 处自己手写 keydown 的控件不经过这里(上一行就 return 了),
  //    它们的按住连发要各自处理 —— 别把这条读成「全仓都不会连发」。
  if (ev.repeat) return;
  if (ev.key !== "Enter" && ev.key !== " ") return;
  // 带修饰键的是快捷键,不是「激活当前控件」。
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

  const target = ev.target as HTMLElement | null;
  if (!target || typeof target.getAttribute !== "function") return;
  if (TYPING_TAGS.test(target.tagName) || target.isContentEditable) return;

  // 🔴 只认焦点所在的**元素自身**,不用 closest 向上找。
  // keydown 的 target 就是 activeElement,而能拿到焦点的正是那个带 tabindex 的控件。
  // 向上找会把「焦点在卡片内某个不可聚焦子元素上」误判成激活整张卡片——更要命的是
  // 输入框套在可点卡片里时,在输入框按 Enter 会激活整张卡片。
  const keys = ACTIVATION_KEYS[target.getAttribute("role") ?? ""];
  if (!keys || !keys.includes(ev.key)) return;
  // 置灰控件不激活。视觉置灰 + handler 内 early-return 是两道各自独立的防线,这里是第三道。
  //
  // ⚠️ 曾考虑删掉这道闸,理由是「鼠标点置灰按钮会 toast 出原因,键盘按 Enter 却毫无反馈」。
  // 独立核查后否决:仓内 14 个 aria-disabled 控件的 handler **全部**自带守卫(守卫条件 ⊇
  // aria-disabled 条件),所以删闸不会放行禁用操作;但其中**只有 2 个**会 toast 出原因,
  // 其余 12 个本来就是静默 return —— 删了闸,键盘用户只是从「什么都不发生」变成
  // 「什么都不发生」。真正该修的是那 12 处缺反馈,不是这道闸。删闸反而新开一个风险面:
  // 合成的 click 会冒泡,禁用控件若无 .stop 且祖先可点,就会激活祖先。
  // 🔴 语义写窄:本闸只对**可激活 role** 生效。`aria-disabled` 在本仓也挂在 role="status"
  // 和无 role 的 wrapper 上(register/success.vue、deposit-bank-pane.vue),那些不归本层管。
  if (target.getAttribute("aria-disabled") === "true") return;

  // Space 不拦会连带翻页(激活一次 + 滚一屏)。
  ev.preventDefault();
  target.click();
}

let installed = false;

/**
 * 挂载键盘激活层。幂等。
 *
 * 【覆盖到哪一端 —— 只写实测到的】
 * · H5:已实测生效(真键盘 Enter/Space 激活一个无手写 keydown 的控件,摘掉 role 后不再激活)。
 * · 小程序:没有 document,不挂载 —— 那边也没有物理键盘导航,role/tabindex 不参与渲染。
 * · App(iOS/Android):**未实测**。本函数由 App.vue 的 onLaunch 调用,而 uni 的 App 端
 *   逻辑层与视图层分离,逻辑层是否有 document 我没有在真机上验证过。若没有,本层在 App 端
 *   不生效(下面的 typeof 判断会让它安静跳过,不会崩)。该端读屏(VoiceOver/TalkBack)激活
 *   控件走原生 accessibility API 直接派发 click,本就不经过 keydown,所以影响面主要是
 *   「App + 外接物理键盘」这一种组合。要覆盖它需改为在视图层挂载,属独立议题。
 *   —— 这段按实测写,不写「App 端也是 webview 所以没问题」那种没验证过的断言。
 */
export function installKeyboardActivation(): void {
  if (installed) return;
  if (typeof document === "undefined") return;
  installed = true;
  // bubble 阶段(不是 capture):让控件自己的 handler 先跑完,上面
  // `ev.defaultPrevented` 那一条才有判断依据。
  document.addEventListener("keydown", onKeydown);
  // HMR 换模块时,新模块的 installed 会重置为 false,而旧监听器还挂在 document 上 ——
  // 不卸载就是一次按键激活两次。上面的 installed 只挡得住「同一模块实例重复调用」。
  import.meta.hot?.dispose(() => uninstallKeyboardActivation());
}

/** 仅供测试:卸载并复位,让同一进程内可以反复装卸。 */
export function uninstallKeyboardActivation(): void {
  if (!installed || typeof document === "undefined") return;
  document.removeEventListener("keydown", onKeydown);
  installed = false;
}
