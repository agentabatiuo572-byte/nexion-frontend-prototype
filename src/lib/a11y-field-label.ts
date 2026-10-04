/**
 * 表单控件的可访问名补齐层。
 *
 * 【为什么需要这一层】
 * 本仓的输入控件走 uni 的 `<input>` / `<textarea>`。它们**不是**原生元素,而是
 * `<uni-input>` / `<uni-textarea>` 自定义元素包一个内部原生控件:
 *
 *     <uni-input aria-label="充值金额(USDT)">        ← 宿主,AX 树里是 role=generic
 *       <div class="uni-input-wrapper">
 *         <input class="uni-input-input">            ← 真控件,AX 树里是 role=textbox,name=""
 *
 * 2026-09-20 在真实页面上实测(Chrome + CDP Accessibility.getFullAXTree):宿主上的
 * `aria-label` **不会**落到内部控件上。内部控件的属性是从固定白名单渲染的
 * (type / maxlength / step / enterkeyhint / autocomplete / inputmode / pattern /
 * class / style / value),`aria-*` 不在其中。于是:
 *
 *   · 写在 `<input>` 上的 `:aria-label` 是**惰性的** —— 它落在 generic 宿主上,
 *     真 textbox 的可访问名仍是空串。读屏聚焦只念「文本框」。
 *   · 旁边的可见 `<text>` 标签不构成程序化关联(不是 `<label for>`,也没有
 *     aria-labelledby),读屏同样念不出用途。
 *
 * 实测证据(修复前,真实 dev server):
 *   /pages/me/wallet-cards-new  textbox name="" ×2   (源码里两个 aria-label 都在)
 *   /pages/me/security          textbox name="" ×2
 *   /pages/me/help              textbox name="" ×2
 *   /pages/search/search        textbox name=""
 *   /pages/support/chat         textbox name=""
 *   /pages/developer/developer  textbox name="" ×2
 * 同页的 `<view role="button" :aria-label>` 全部正常 —— 说明问题只在 uni 的
 * 输入控件这一条渲染路径上,不是「aria 没写」,是**写了不生效**。
 *
 * 【为什么不是逐个改模板】
 * 全仓 59 处 `<input>` / `<textarea>`。逐处改模板治不了下一个新输入框,而且写法上
 * 没有「正确写法」可用 —— 只要用 uni 的 `<input>`,宿主/内部控件的分裂就存在。
 * 这跟 lib/a11y-activate.ts 治的是同一类病:平台层丢了原生元素白送的东西,补回那一层,
 * 作者继续用正常写法即可。
 *
 * 【契约】在 uni 输入控件宿主上声明 `aria-*` = 内部真控件得到该属性。
 *
 * 【本层不做什么 —— 边界写清楚,免得下一个人以为它管了】
 * · **不管 `<label for>` 代理**:uni 的 `<label>` 靠 `uni-label-click-*` 事件把点击
 *   转发给内部控件,但**不建立可访问名关联**。想用可见标签命名,写 `aria-label`
 *   (或用 `aria-labelledby` 指向一个真实存在的 id) —— 两条都由本层转发。
 * · **不管 role**:内部原生控件已经是 textbox/searchbox,再改只会更糟。
 * · **不管 `<picker>` / `<checkbox>` / `<radio>`**:那些走的是另一条渲染路径,
 *   且本仓的互斥控件是自造 `<view role=radio>`,不经本层。
 * · **不发明名字**:宿主没声明 `aria-label`/`aria-labelledby` 就什么都不做 ——
 *   拿 placeholder 冒充可访问名会把「提示」和「名称」混为一谈(placeholder 在输入
 *   后就消失了,不是稳定的名称)。名字要么在模板里写,要么就别假装有。
 */

/**
 * 需要镜像到内部真控件的属性。
 *
 * 只收**描述这个控件是什么、现在什么状态**的那几个:
 *   · aria-label / aria-labelledby —— 名称,本层存在的理由
 *   · aria-describedby / aria-errormessage —— 说明与错误关联(错误提示要能被念出)
 *   · aria-required / aria-invalid —— 必填与校验态
 *   · aria-disabled —— 置灰态(uni 的 disabled 只管能不能输入,不表达"不可提交")
 *   · aria-autocomplete —— 补全语义
 * 不收 aria-hidden / aria-live / aria-controls:前者会把控件从 AX 树里摘掉,
 * 后者在输入控件上没有意义,收进来只会扩大误伤面。
 */
const MIRRORED = [
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-errormessage",
  "aria-required",
  "aria-invalid",
  "aria-disabled",
  "aria-autocomplete",
] as const;

/** uni 输入控件宿主 → 内部真控件。两端的标签名是 uni-h5 的渲染事实,不是配置。 */
const HOSTS = "uni-input, uni-textarea";
const INNER = "input, textarea";

/** 属性包的最小接口 —— 真 DOM 的 Element 满足它,测试用的 stub 也满足。 */
interface AttributeBag {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
}

/**
 * 把宿主的可访问属性镜像到内部真控件上。
 *
 * 抽成接收两个属性包而不是直接吃 Element,是为了让"镜像语义"本身可被单元测试 ——
 * 这一层的正确性全在这几行里(声明则同步、撤回则移除、值相同不写),把它埋在
 * DOM 查询后面就只能靠浏览器测。
 */
export function mirrorFieldAttributes(host: AttributeBag, inner: AttributeBag): void {
  for (const name of MIRRORED) {
    const declared = host.getAttribute(name);
    if (declared === null) {
      // 宿主撤回了声明(例如语言切换后绑定变成 undefined)→ 内部控件也要撤回,
      // 否则旧语言的名称会留在真控件上,读屏继续念过期的名字。
      if (inner.hasAttribute(name)) inner.removeAttribute(name);
    } else if (inner.getAttribute(name) !== declared) {
      // 值相同不写:观察器会被自己的写入再次触发,相等即收敛,不会自激。
      inner.setAttribute(name, declared);
    }
  }
}

/**
 * 把宿主的可访问属性同步到内部真控件。幂等:值相同不写,所以观察器被自己的写入
 * 再次触发时会立刻收敛(下一轮发现相等,不再写)。
 */
function syncHost(host: Element): void {
  const inner = host.querySelector(INNER);
  if (!inner) return;
  mirrorFieldAttributes(host, inner);
}

function syncAll(root: ParentNode): void {
  for (const host of Array.from(root.querySelectorAll(HOSTS))) syncHost(host);
}

/**
 * 一个新增/变化的节点可能是宿主、可能是宿主的内部控件、也可能两者都不是。
 *
 * 为什么要单独认「内部控件」这一支:uni 在 type / disabled 变化时会**重建**内部
 * `<input>`,新节点是插进来的,而它的属性是从白名单渲染的 —— 重建后名称会丢。
 * 只认宿主的话,输入框在切换密码可见性、置灰之类的操作之后就又变成无名控件了。
 */
function syncNode(node: Node): void {
  if (!(node instanceof Element)) return;
  // uni can insert its wrapper after the host; that wrapper is neither a host
  // nor an input, but its ancestor still needs to name the new inner control.
  const host = node.closest(HOSTS);
  if (host) syncHost(host);
  syncAll(node);
}

let observer: MutationObserver | null = null;
let installed = false;

/**
 * 挂载可访问名补齐层。幂等。
 *
 * 【覆盖到哪一端 —— 只写实测到的】
 * · H5:已实测生效(补层后 /pages/me/wallet-cards-new 的两个 textbox 从 name=""
 *   变成 "Receiving account number · Required" / "Account holder name · Required")。
 * · 小程序 / App:没有 DOM 或不经此渲染路径,下面的 typeof 判断会让它安静跳过。
 *   那些端的读屏走原生 accessibility API,不需要这一层。
 */
export function installFieldNaming(): void {
  if (installed) return;
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  installed = true;
  syncAll(document);
  // 属性与子树都要看:前者管 `:aria-label` 的绑定变化(语言切换、错误态),后者管
  // 条件渲染出来的新输入框和 uni 重建的内部控件。
  observer = new MutationObserver((records) => {
    for (const record of records) {
      // 本层自己写到内部控件上的那次变更不必再回灌:目标就是真控件本身。
      const target = record.target;
      if (record.type === "attributes") {
        if (target instanceof Element) {
          if (target.matches(INNER)) continue;
          syncNode(target);
        }
        continue;
      }
      for (const added of Array.from(record.addedNodes)) syncNode(added);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...MIRRORED],
  });
  // HMR 换模块时旧观察器还挂在 DOM 上,不拆就是两份观察器同时回灌。
  import.meta.hot?.dispose(() => uninstallFieldNaming());
}

/** 仅供测试:卸载并复位,让同一进程内可以反复装卸。 */
export function uninstallFieldNaming(): void {
  observer?.disconnect();
  observer = null;
  installed = false;
}

/** 仅供测试:暴露镜像清单,免得测试另抄一份而与实现漂移。 */
export const MIRRORED_FIELD_ATTRIBUTES: readonly string[] = MIRRORED;
