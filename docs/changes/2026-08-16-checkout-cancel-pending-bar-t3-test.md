本页判定目标=撞单/残留弹框回归(来源:任务判据清单)

黑盒回归 · 第 3 轮 · 2026-08-16 · 被测:`http://localhost:5401`(worktree dev server,mock)· 视口 390×844 · Playwright MCP
测试者未参与实现,所有结论均来自运行时观察。起点已把 `nexgrid-locale-v1` 钉为 `{code:"en",userSet:true}` 并整页 reload,全程英文。
为使判据可判,起点把 `nexgrid-pending-checkout-accounts-v1` 三个账号的 sessions 全部清空(仅动 storage,未改代码),再从 UI 真实下单重建会话。
证据截图前缀 `cc2-`,落盘在 **`D:\WORKS\PLAN\`**(不是 worktree 内,MCP 输出目录如此;共 10 张)。

## 一、判据结论表

| 判据 | 结论 | 证据 | 备注 |
|---|---|---|---|
| **R1** 撞单弹框内容 | **pass** | `cc2-01-r1-collision-dialog.png`。标题 `You have an unpaid order`;正文 `NexGridBox S1 · $649 is still waiting for payment (28:09 left). Drop it and start this one? If you already sent funds to its address, keep it — you can resume it anytime from the bar at the top.`;实测 computed style:`Keep it` bg `rgb(31,31,31)`(非红)、`Drop it, start new` bg `rgb(255,92,92)`(红),两者 134×46 并排 | A 名称 / 金额 / 剩余时间三项均在正文内 |
| **R2** 点遮罩 = 什么都不动 | **pass** | 真实鼠标点击 `page.mouse.click(195,780)`,点击前 `elementFromPoint` 确认落点是 `nx-mask nx-mask--confirm`。结果:弹框关闭、`.nx-mask` 数 0;URL 仍 `?product=stellarbox-pro`;页面仍在 `Review order`;`.nx-navheader` 标题 `Checkout` + 返回键均在;浮动条仍 `Awaiting payment $649 · 27:10 Continue →`;storage 中 A(`pc-8cd8a987…`,addr `T0DE4E0C…2618`)原样。`cc2-02-r2-mask-noop.png` | 上一轮此项 fail(点遮罩会跳去 A 的扫码页),本轮已修复 |
| **R3** 点「Keep it」= 与 R2 相同 | **pass** | 重新触发弹框后点 `Keep it`:URL `?product=stellarbox-pro`、步骤 `Review order`、页头 `Checkout`+返回键、浮动条 `$649 · 26:47`、storage 会话 `pc-8cd8a987…` 地址不变 | 与 R2 逐字段一致 |
| **R4** 浮动条 → A 扫码页 → 返回 | **pass**(带缺陷,见 P1-1) | 点浮动条 → URL `#/pages/store/checkout?product=stellarbox-s1&resume=pc-8cd8a987-6efa-42cb-893f-86c70eb9e88a`(带 `resume=`);地址 `T0DE4E0C…2618` 与 A 一致;倒计时 条 26:27 → 页 26:25(实测间隔 1.07s,连续未重置为 30:00);页头 `Checkout`+返回键在;该页 `.pcb-pill` = null。`cc2-03-r4-resume-a-scan.png`。返回后落回 B 的 `Review order`(`product=stellarbox-pro` / `NexGridBox Pro` / `$1,199`),浮动条重新出现 `$649 · 26:02` | 判据字面各项全 pass。**但返回落地后 B 的页头整个消失**(`.nx-navheader` 数 0),浮动条压住 `Review order` 标题 —— 见 P1-1,`cc2-04-r4-back-header-gone.png` |
| **R5** 「Drop it, start new」 | **pass** | 干净复跑(整页 load 进 s1 结算页,页头在场时触发撞单):旧会话 Pro/$1,199 从 storage 消失,新会话 `pc-63fd7b86…` = stellarbox-s1 / **$649** / 新地址 `TE868CF64983860472146AE1A208AF8BC1` / 剩 29:59;扫码页页头 `Checkout`+返回键在、`.pcb-pill` 为 null。`cc2-06-r5-drop-new-session.png` | 首次跑该项时扫码页无页头,经隔离确认是 R4 返回带来的遗留态(P1-1),非 R5 自身缺陷;故用干净起点复跑并以复跑为准。首跑截图保留为 `cc2-05-r5-scan-no-header-carryover.png` |
| **R6** P1-1 回归:撞单弹框开着点返回键 | **pass** | 弹框开(`.nx-mask` 数 1)→ 点 `.nx-navheader .nx-nav-side` → 落到 `#/pages/store/detail?id=stellarbox-pro`:弹框 null、`.nx-mask` 数 **0**;`elementFromPoint(195,120)` / `(195,780)` 均命中真实内容(无遮罩拦截);浮动条在场且递减 29:06→29:04;storage 会话仍 1 笔。随后**未刷新**逐个走 Home(`#/`)/ Me / Earn / Team / Store 五个 tab:弹框 null、遮罩 0、浮动条全在且 28:27→28:05 持续递减。`cc2-07-r6-store-tab-clean.png` | **确定性复现 2 次**(第二次独立复跑同样全绿)。上一轮 P1-1 的三个症状(弹框跨页残留 / 全站遮罩拦截 / 浮动条被全站抑制)本轮全部不再出现 |
| **R7** 取消支付确认框开着点返回键 | **pass** | 扫码页点 `Cancel` → 弹框 `Cancel this payment? … Keep paying / Cancel payment`(`.nx-mask` 数 1)→ 点返回键 → 落到 `#/pages/store/store`:弹框 null、遮罩 0;会话 `pc-63fd7b86…`(addr `TE868CF64…F8BC1`)完好未被取消;浮动条在场且递减 27:23→27:21;`elementFromPoint(195,400)` 命中真实内容。`cc2-08-r7-after-back-store-tab.png` | 落地页是 tab 页,用品牌页头而非 `.nx-navheader`,截图已确认渲染正常,非缺陷 |
| **R8** 超时态页头 | **pass** | 注入 `expiresAt = Date.now()+20000` 后整页 reload → 浮动条 `00:19` → 点条进扫码页 → 等到 00:00。归零瞬间:正文不再含 `Send USDT`(卡头只剩网络名 **`USDT-TRC20`**)、副标题 `Network confirms in ~5 min` **消失**、地址消失;正文为 `Payment window closed` + `This address is no longer valid. Start again to get a fresh one.` + `Start again`。`cc2-09-r8-timeout-header.png` | 上一轮 P2-3(超时态仍写 `Send USDT-TRC20`)已修复 |
| **R9-B1** 返回后 toast + 浮动条 | **pass** | 离开扫码页后 0–1750ms 连续 8 次采样:`.nx-toast-host` 全命中 `Order held for 30 min — continue anytime from the bar at the top`;`.pcb-pill` = `Awaiting payment $649 · 29:45 Continue →`,并递减到 29:43 | — |
| **R9-B2** 点浮动条回同一笔 | **pass** | 同 R4:URL 带 `resume=`、地址 `T0DE4E0C…2618` 与条上同一笔一致、倒计时 26:27→26:25 连续、金额 649 USDT、扫码页无浮动条 | — |
| **R9-B4** 完成支付路径 | **pass** | 点 `I've completed the payment →` 后逐秒 7 秒时间线:s1–s2 `Awaiting Payment Confirmation` → **s3** `Payment Confirmed`(orders 1→**2**、sessions 1→**0**)→ s4–s6 `Activating Device`(带 `Track Order →`)→ **s7** `Order placed`。全程 `.pcb-pill` = no;新订单 `ORD-20260816-1038`。离开该页后 Home / Store / Me 三页 `.pcb-pill` 均 no、sessions 0 | 订单 +1、浮动条消失、会话清空三项均实测 |
| **R10** console error = 0 | **pass**(带说明) | `browser_console_messages(level:"error", all:true)` 全程恒为 **1 条**:`Failed to load resource: net::ERR_CONNECTION_REFUSED @ http://localhost:5401/:0`。该条紧跟在 `[LOG] [vite] server connection lost. polling for restart...` 之后、`[vite] connecting…/connected.` 之前,是 Vite HMR 客户端重连失败一次,非应用代码。且 `all:true` 缓冲区里混有**上一轮**的记录(含 login/register 页的 `[DOM] Password field…`,本轮我从未访问这两页),该 ERROR 很可能早于本轮 | 另做干净口径核对:本轮末尾一次导航后 `all:false` 读数 = **0 errors / 0 warnings**;整轮结束再读 `all:true` 仍是 1 条,未新增 |

---

## 二、其它发现(全部上报,不设数量目标)

### P1

**P1-1|从浮动条恢复另一笔订单再返回,原结算页的页头被整个拆掉,浮动条随即压住页面标题**

- 复现(纯 App 内动作,**确定性复现 2/2**):
  1. 账号已有商品 A(S1 / $649)待支付会话;
  2. 整页进入商品 B(Pro)结算页 → Continue → 停在 `Review order`(此时 `.nx-navheader` 数 = 1,返回键在);
  3. 点顶部浮动条 → 进入 A 的扫码页(`?product=stellarbox-s1&resume=…`,此时页头仍 = 1);
  4. 点页头返回键 → 回到 B 的 `Review order`。
- 实测后果(等 3.6s 共 6 次采样,状态稳定不自愈):
  - `document.querySelectorAll('.nx-navheader').length` = **0**,`.nx-nav-side` = **0** —— 没有「Checkout」标题、**没有返回键**;
  - 浮动条上移贴顶(rect `y 60–104`),`Review order` 标题 rect `y 88–105` —— 17px 高的标题被压掉 16px,`elementFromPoint(60,95)` 命中 `.pcb-pill`,截图里只剩半个「R」;
  - 该页此时全部可点控件只剩 `Pay now` / `Change payment method` / 浮动条(通向 A)。`.nx-tabbar-wrap` 只有 22px 高的 home indicator,**没有 tabbar**。也就是说:用户在 B 的结算页上,失去了「不付钱也不去 A、单纯退回商城」的 App 内出口(H5 还有浏览器后退,App 端只剩硬件返回键);
  - 整页刷新可恢复。
  - 证据:`cc2-04-r4-back-header-gone.png`;两次复跑的 `navheader` 计数序列均为 `1 → 1 → 0`。
- 与上一轮的关系:上一轮把同一现象记为 **P2-6**,并注明「触发方式是原始 hash 改写,不是我在 App 内找到的任何控件,按用户可达性低记 P2」。**该判断不成立**——本轮用纯 App 内一次点击(浮动条 → 返回)即稳定触发,而这条路径正是本功能的主路径。故升为 P1。
- 补充分辨:本轮我确认「裸改 `location.hash`」也会丢页头(detail→checkout 亦然),那是绕过 uni 路由的测试手法产物;而 App 自身的 `resume` 跳转**去程**页头是好的,**只有返回程**会丢。两者不是一回事,上一轮的归因偏窄。

**P1-2|结算页的两个 sheet(`tis-root` 族)在返回后仍留在落地页,并以全屏 backdrop 挡住整页(含浮动条)**

- 复现(确定性,两个 sheet 各 1 次):
  - 变体 a:整页进入 `#/pages/store/checkout?product=stellarbox-pro` → 自动弹出 `How would you like to pay?` → **不选任何项,直接点页头返回键**;
  - 变体 b:同上,先选 `Pay full price · keep current devices` 弹出 `All slots in use` → **直接点页头返回键**。
- 实测后果:
  - 落到 `#/pages/store/detail?id=stellarbox-pro` 后,sheet **仍在**(`[role=dialog].tis-root`,`position:fixed; z-index:790; pointer-events:auto`,rect 覆盖整个 390×844);
  - `.tis-backdrop` 拦截全页点击。Playwright 尝试点浮动条时直接报 `<uni-view class="tis-backdrop"> … subtree intercepts pointer events`,`elementFromPoint(浮动条中心)` 也命中 `tis-backdrop` —— **本功能的核心入口(待支付浮动条)被这层挡死**;
  - `cc2-10-p1-tradein-sheet-survives-back.png`:一个「你想怎么付款?」的付款方式选择面板,叠在商品详情页上。
- 可逃生:`.tis-close`(✕)在落地页上仍然有效,点掉后浮动条恢复、无需刷新。故未定 P0。
- 为什么仍算 P1:这是**上一轮 P1-1 的同族缺陷**(弹层不随路由回收)。本轮 `.nx-mask` 那一族(撞单框 R6、取消框 R7)已修好,但 `.tis-root` 这一族没修 —— 修一处没有全站扫同类。且触发路径极短:进任意结算页、不做任何选择、直接返回,就中。
- 附带:`.tis-close` 元素上没有 `role` 也没有 `aria-label`(实测该节点 `role=null, aria-label=null`),仅靠 svg 图标呈现;而 sheet 根节点是 `aria-modal="true"` 的 dialog。屏幕阅读器用户在这层里可能找不到关闭出口。

### P2

**P2-1|撞单弹框把破坏性动作做成视觉最强项**。`Drop it, start new` 是红色实心 `rgb(255,92,92)`,安全项 `Keep it` 是 `rgb(31,31,31)` 暗底幽灵按钮;而弹框正文本身在劝阻(`If you already sent funds to its address, keep it`)。两按钮字号/字重完全相同(16px / 400),仅靠底色区分。**注意:R1 判据本身就要求「Keep it 非红、Drop it 红」,所以这是合规的,不算判据失败**;此处只作为设计口径的可辩论项登记 —— 在「误触 = 丢掉一笔可能已转账的订单」的场景里,把安全项做成主视觉更稳。

**P2-2|取消支付确认框同上,且与上一轮 P2-2 相比未变**。实测 `Keep paying` bg `rgb(31,31,31)` / `Cancel payment` bg `rgb(255,92,92)`,字号字重同为 16px / 400。上一轮已记,本轮复验仍在。

**P2-3|结算页对同一商品有过期会话时,再次进入会直接落在超时态**(上一轮 P2-4 同项)。本轮在 R8 里再次观察到:注入过期后从浮动条进入,页面直接是 `Payment window closed`,须点 `Start again` 才回到可下单流程。有兜底、语义也讲清楚了,故仍记 P2。

**P2-4|`Review order`(confirm)步没有取消/返回商店出口**(上一轮 P2-7 同项)。该步只有 `Pay now` 和 `Change payment method`;弱化的 `Cancel` 只存在于上一步 select-payment。正常情况下页头返回键兜底 —— 但一旦叠加 P1-1(页头被拆掉),这一步就真的没有 App 内退出口了。两条合起来看比单独看严重。

**P2-5|`?nx_device=off` 下裸改 `location.hash` 会丢页头**。从 `#/pages/store/detail?id=stellarbox-s1` 直接改 hash 到 `#/pages/store/checkout?product=stellarbox-pro`,`.nx-navheader` 返回 null;整页 reload 即恢复。这是绕过 uni 路由的结果,H5 下用户手改地址栏可达,App 端不可达。与 P1-1 是**不同**成因(P1-1 走的是 App 自己的路由),分开登记以免被合并掉。

### 说明 / 口径

- **R5 的两次跑法**:首跑接在 R4 之后,扫码页无页头。我没有直接判 fail,而是先隔离:用整页 load 重建一个页头在场的起点再跑一次,结果全绿,证明页头缺失来自 R4 遗留(P1-1)而非 R5 本身。两次的 storage 结果一致(旧会话消失 / 新会话正确)。
- **R2 的点击手法**:用 `page.mouse.click(x,y)` 真实鼠标事件,不是 `dispatchEvent`;落点先用 `elementFromPoint` 验明是遮罩本体(遮罩中心会落在弹框卡片上,故取 `(195,780)`)。
- **R10 的 0 error 口径**:`browser_console_messages` 的 `all:true` 缓冲区跨会话累积、包含上一轮的记录,不能直接当本轮读数。故另用「本轮末次导航后的 `all:false`」取干净读数 = 0/0,并核对整轮 `all:true` 计数未增长(始终 1 条 Vite HMR 噪声)。
- **未覆盖**:上一轮 P2-5 提到的「Sign out 确认框跨路由残留」我想顺带复验,但当前 Me 页正文里没有 `Sign out` 入口(应在更深的设置页),未继续深挖 —— **该项本轮未验证**。不过 P1-2 已经证明「弹层不随路由回收」这一族缺陷在 `.tis-root` 上仍然存在,可作为同族仍未收敛的旁证。
- **收尾数据状态**:登录账号 `+15559876543@demo.nexgrid.ai`,该账号残留 1 笔 s1/$649 待支付会话(`pc-b6576e93…`)、2 笔订单;`default` 账号 0 笔会话 / 2 笔订单;`+15551112222` 0 笔。locale 仍为 `en/userSet:true`。全程只改 storage,未触碰源码。
- **截图清理**:10 张 `cc2-*.png` 落在 `D:\WORKS\PLAN\` 根(与上一轮 20 张 `cc-*.png` 同处),报告引用中,未删除,请 main 在结案时一并清理。
