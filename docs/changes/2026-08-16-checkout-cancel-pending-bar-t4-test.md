本页判定目标=发票单活票不变量 + 页头/弹层残留回归(来源:任务判据清单)

黑盒回归 · 第 4 轮 · 2026-08-16 · 被测:`http://localhost:5401`(worktree dev server,mock)· 视口 390×844 · Playwright MCP
测试者未参与实现,所有结论均来自运行时观察。起点已把 `nexgrid-locale-v1` 钉为 `{code:"en",userSet:true}` 并整页 reload,全程英文。
登录账号 `+15559876543@demo.nexgrid.ai`;起点该账号 sessions=0、orders=4、usdtBalance=23558.56。
证据截图前缀 `cc3-`,落盘在 **`D:\WORKS\PLAN\`**(MCP 输出目录如此;共 9 张)。

> ⚠️ 本轮环境有并发污染,详见 §三「环境与口径」。所有下表结论都通过 `location.port === '5401'` 守卫 + 「storage 里这张票是不是我刚 mint 的那张(比对 session id / 地址)」双重核对,受污染的读数已丢弃重跑,未进结论。

## 一、判据结论表

| 判据 | 结论 | 证据 | 备注 |
|---|---|---|---|
| **R1** 支付时刻回弹不留活票、不铸第二张 | **pass** | 见下方逐段 | 核心判据,分两段实测 |
| ├ 回弹后 sessions=0 / 无浮动条 / 订单不变 | pass | 压 `usdtBalance=1`+`withdrawableUsdt=1` 后 reload;A1=`TF4DD7FB6FEE0F2AD9EACE881585CB7C00`。点「I've completed the payment →」后 250ms 采样时间线(去重后):`209ms scan n=1` → `8414ms progress n=1` → **`10801ms n=0 step=select toast="You need at least $649.00 USDT to continue."`**。全程 `pill=-`(浮动条从未出现);`ord` 恒为 **4**,未变 | 点击→回弹实测约 **2.4s**(判据写「约 3-4 秒」,实测更快);toast 明确说明余额不足 |
| ├ 再 Continue→Pay now:不弹撞单框 | pass | `masks=0`、body 无 `You have an unpaid order` | — |
| ├ sessions 恰好 1 且地址 ≠ A1 | pass | `n=1`,新票 `pc-9b2a7f6f…` 地址 `TAE951A063992EBD8C398CF05B7C00C0A1` ≠ A1 `TF4DD7FB…7C00`;`cc3-01` | 说明回弹没留下"幽灵票",也没铸第二张 |
| ├ 扫码页不显示浮动条 | pass | 该页 `.pcb-pill` = null | — |
| └ 返回后只显示这一张($649),点条回同一地址 | pass | 返回落地 `#/pages/store/detail?id=stellarbox-s1`:`pillCount=1`、文案 `Awaiting payment $649 · 29:25 Continue →`;点条 → URL 带 `&resume=pc-9b2a7f6f…`,页面地址 `TAE951A0…C0A1` 一致,倒计时 29:25(条)→29:11(页)连续未重置 | — |
| **R2** 撞单框对任何活票都问 | **pass** | 见下方逐段 | — |
| ├ Pro 结算 Pay now 必弹撞单框 | pass | `masks=1`(`nx-mask nx-mask--confirm`);正文 `You have an unpaid order / NexGridBox S1 · $649 is still waiting for payment (27:00 left). Drop it and start this one? If you already sent funds to its address, keep it — you can resume it anytime from the bar at the top.` + `Keep it` / `Drop it, start new`;`cc3-03` | 名称/金额/剩余时间三项俱全 |
| ├ Keep it = 不动 | pass | 点后:`masks=0`、URL 仍 `?product=stellarbox-pro`、步骤仍 `Review order`、页头 `Checkout`+返回键在、浮动条仍 `$649 · 26:19`、storage 仍是 `pc-9b2a7f6f…` / 地址 `TAE951A0…C0A1` 未变 | 逐字段核对 |
| └ 再触发选 Drop:旧票消失、新票 Pro $1,199 新地址、sessions=1 | pass | 旧 `pc-9b2a7f6f…`(s1)消失;新 `pc-ab36b3d8…` = `stellarbox-pro` / 地址 `T33485497C14758DCFB6CBBF2AEBC0214D` / 页面 `Amount 1,199 USDT` / 倒计时 29:51;`n=1` | — |
| **R3** 页头不丢(第 2 轮 P1-1 回归) | **pass** | Pro `Review order`(页头=1)→ 点浮动条 → A 的扫码页(`&resume=pc-9b2a7f6f…`,页头=1)→ 页头返回键 → 回到 Pro `Review order`。**3.6s 内 7 次采样,`.nx-navheader` 恒为 1、`.nx-nav-side` 恒为 2、标题恒为 `Checkout`**;页头 rect `y 0–44`、浮动条 rect `y 52–96`、`Review order` 标题 rect `y 192–209` —— **三者零重叠**;`cc3-04` 截图肉眼确认:返回键、`Checkout` 标题、浮动条、`Review order` / NexGridBox Pro / $1,199 全部正常 | 上一轮 P1-1(返回后页头计数 `1→1→0`、浮动条压住标题 16px)**本轮不再复现** |
| **R4** sheet 不残留(第 2 轮 P1-2 回归) | **pass** | 两个变体各测一次,均整页 load 进 `#/pages/store/checkout?product=stellarbox-pro` | — |
| ├ 变体 a:`How would you like to pay?` 开着直接返回 | pass | 落地 `#/pages/store/detail?id=stellarbox-pro` 后 **5 次采样(横跨 2.8s)**:`tis-root=0`、`tis-backdrop=0`、`[role=dialog]=0`、`nx-mask=0`;浮动条在场 `$1,199 · 28:39`,`elementFromPoint(条中心)` 命中 `SPAN`(条自身文字,无遮挡)。随后**真实点击浮动条成功导航**到 `&resume=pc-ab36b3d8…`;`cc3-05` | 上一轮 P1-2 的 `.tis-root` 残留 + backdrop 挡死浮动条,本轮不再出现 |
| └ 变体 b:先选 `Pay full price` 出 `All slots in use` 再返回 | pass | 同上 5 次采样:`tis-root=0` / `tis-backdrop=0` / `dialog=0` / `mask=0`;浮动条 `$1,199 · 27:46` 在场且 hit 测试无遮挡 | — |
| **R5** 撞单框/取消框开着按返回 | **pass** | 两个弹框各测一次 | — |
| ├ 撞单框开着返回 | pass | 点前 `masks=1`+`dialogBefore=true` → 落地 `#/pages/store/detail?id=stellarbox-pro`:`masks=0`、弹框文案消失、`tis-root=0`、`tis-backdrop=0`;浮动条在场 `$649 · 24:54`,hit 测试命中 `SPAN`(可点) | — |
| └ 取消框开着返回 | pass | 弹框原文 `Cancel this payment? / If you already sent funds to this address, don't cancel — tap "I've completed the payment" instead. / Keep paying / Cancel payment`,点前 `masks=1` → 落地 detail 页:`masks=0`、`tis-root=0`;浮动条 `$1,199 · 29:17` 在场且可点;**会话未被取消**(`pc-ab36b3d8…` / `T33485497…0214D` 完好,n=1) | 返回≠取消,资金动作未被误触发 |
| **R6** 离开/恢复/完成 | **pass**(toast 有口径说明) | 见下方逐段 | — |
| ├ 返回后 toast + 浮动条 | pass | 用**全新会话的第一次离开**测:`pc-bd1e5cd2…`,180ms 间隔采样 → `115ms–2864ms` 连续命中 toast `Order held for 30 min — continue anytime from the bar at the top`,`3231ms` 起消失;同期浮动条 `Awaiting payment $649 · 29:14 Continue →` 一直在并递减 | ⚠️ **口径**:toast 是「每张票只提示一次」,不是每次离开都提示。我第一次测时用的是一张已离开过的票,采样 6s **零命中 toast**(浮动条正常);换全新票后必中。与第 2 轮 B1「toast 不重复」一致,判 pass |
| ├ 点条回同一笔(同地址、倒计时连续) | pass | 条 `$1,199 · 27:04` → 点条 → 页面地址 `T33485497…0214D` 与条同一笔、`Amount 1,199 USDT`、倒计时 26:35(连续,未重置 30:00);扫码页无浮动条 | — |
| └ 余额充足时完成支付 → live / 条消失 / sessions 0 / 订单 +1 | pass | 余额恢复 20000 后点「I've completed the payment →」,250ms 采样:`255ms scan` → `7008ms awaiting` → **`9258ms confirmed:n 1→0、ord 4→5、bal 20000→18801`** → `10758ms activating(带 Track Order)` → `13758ms live(Order placed)`。全程 `pill=n`;`cc3-06`。离开后在 Store tab 复核:`pill=false`、`n=0`、`ord=5` | 扣款 **−1199 恰好一次**,发生在 confirmed 时点 |
| **R7** 超时 | **pass** | 两个变体各测一次(注入 `expiresAt`,因 MCP 往返延迟用了 40–45s 而非 20s,不影响判据) | — |
| ├ 浮动条到 00:00 消失 + storage 清 0 | pass | 在 detail 页 400ms 采样,浮动条从 `00:33` 每秒递减到 `00:01`,下一采样(`33249ms`)**同时** `n=0` + 条消失 | 条与 storage 同步清除,无残留 |
| ├ 停在扫码页 → `Payment window closed` + `Start again` | pass | 采样从 `00:28` 递减到 `00:01`,`28018ms` 时:`n=0`、`cd=00:00`、`Payment window closed=true`、`Start again=true`、地址消失、`I've completed the payment` CTA 消失。页面全文 `USDT-TRC20 / 00:00 / Payment window closed / This address is no longer valid. Start again to get a fresh one. / Start again`;`cc3-08` | 卡头只剩 `USDT-TRC20`,无第 2 轮 P2-3 的 `Send USDT-TRC20` 语义矛盾 |
| └ Start again → Review order → Pay now 得新地址 30:00 | pass | `Start again` → `step=review`;`Pay now` → 新票 `pc-eedbe3f3…` 地址 `TCED2A754169757C5375E2EAF09364D3BE`(≠ 旧 `T86F4CD1E…67E1E`)、倒计时 `29:59`、`leftSec=1798`、`n=1` | — |
| **R8** 浮动条层级(遮罩应盖住它) | **pass**(3 个弹层族全测) | 三族分别实测,均为「遮罩在上、浮动条在下」 | 判据只要求任一弹层,我扩测到全部三族 |
| ├ `.tis-*` 族(结算页 `How would you like to pay?`) | pass | `elementFromPoint(浮动条中心 195,74)` 命中 `UNI-VIEW.tis-backdrop`(全屏 390×844);`cc3-02` 截图可见浮动条被压暗在蒙层下 | — |
| ├ `.nx-sheet-fade-in` 族(我的→设备页 `Device is running a task` 底部 sheet) | pass | 遮罩 `position:fixed / z-index:79 / rgba(8,8,12,0.45) / pointer-events:auto`,浮动条链 `pcb-outer position:absolute z=60`;`elementFromPoint(条中心)` 命中遮罩;`cc3-07`。关掉 sheet(`Back`)后:遮罩数 0、条恢复、hit 命中 `SPAN`(可点) | 79 > 60,层级正确 |
| └ `.nx-mask--confirm` 族(撞单框) | pass | 遮罩 `position:fixed / z-index:9100 / rgba(0,0,0,0.62)`,`elementFromPoint(条中心)` 与 `(195,22)`(页头)**都命中遮罩** | ⚠️ 自我纠错:我先看 `cc3-03` 截图以为条"没被压暗"(0.62 蒙层盖在亮绿 pill 上仍显眼),实测 hit test 才确认遮罩确实在上。截图肉眼判层级不可靠,以 hit test 为准 |
| **R9** console error = 0 | **pass** | `browser_console_messages(level:"error", all:true)` 全程只有 5 条 `Failed to load resource: net::ERR_CONNECTION_REFUSED @ http://localhost:5401/:0`。回源磁盘日志逐条核对:**每一条都紧跟在 `[vite] server connection lost. polling for restart... @ /@vite/client:528` 之后**,是 Vite HMR 客户端重连失败,非应用代码。本轮末次导航后 `all:false` 读数 = **0 errors / 0 warnings** | 另:磁盘日志里两条 `[withdraw] policy fetch failed: REMOTE_API_DISABLED_IN_MOCK_MODE` 的 WARNING 来自 **5411 端口**(另一 agent 的页面),不属本轮被测面,不计入 |

### 为什么 R3 / R4 两条本轮「不再复现」——是修复落地,不是上一轮误报

第 3 轮 tester 提示后我回源核实(`git -C <worktree> show 1722cd9`,git 为准),**证据成立**:

- commit `1722cd9d46805f1bd4a2b8c9a4bec042d418a8ff`,**2026-08-16 21:26:45 +0900(= 12:26:45 UTC)**;我本轮第一次导航在 12:29 UTC —— **修复比我开工早约 2.5 分钟**。
- commit message 里逐字点名两条:「页头 store 按 owner 清(同路由推栈返回不再丢返回键,**T3 P1-1**)」「卸载收置换 sheet(**T3 P1-2**)」。
- diff 落在对应文件:`src/composables/use-page-header.ts`(+14)、`src/store/page-header.ts`(+13)、`src/pages/store/checkout.vue`(+42)、`src/components/pending-checkout-bar.vue`(+8),另配 `scripts/pending-checkout-runtime.mjs`(218 行运行时门,已挂 `verify.sh`)与 `src/store/pending-checkout.test.ts`(143 行)。
- 我实测的层级数字与代码注释对得上:`pending-checkout-bar.vue:64` 写 `z-index: 60; /* … UNDER sheet / modal backdrops (79+) and headers (100) */`,而我在 R8 量到的正是 `pcb-outer z=60` < `nx-sheet-fade-in z=79` < `nx-mask--confirm z=9100`。

**结论:第 2/3 轮的 P1-1、P1-2 是真缺陷且已被针对性修复,不是噪声、不是误报。** 本轮 R3 / R4 的 pass 是修复生效的证据,两份报告并排读不矛盾。

---

## 二、其它发现(全部上报,不设数量目标)

### P2

**P2-1|「All slots in use」sheet 在余额不足时把两个动作 CTA 一起禁用,却不说为什么,用户只剩 Cancel**

- 实测(已做变量隔离,两次跑法**只差余额**,sessions 均为 1):
  - `usdtBalance=18801` → `Replace and activate NexGridBox S1` = `tis-cta`(opacity 1)、`Keep all slots — store … in inventory` = `tis-secondary`(opacity 1),**可点**;
  - `usdtBalance=1` → 两者都变 `tis-cta tis-cta-disabled`、opacity **0.5**,**不可点**;`Cancel` 仍可点。
- 问题在于:sheet 全文是 `All slots in use / Your lowest-yield active device must step down before NexGridBox S1 can come online. / Step down: Cloud Share · $0.00/d today / [两个禁用项] / Cancel` —— **没有任何一句提到余额**。用户看到的是"槽位不够"的标题配两个灰掉的按钮,真实原因(钱不够)完全没说。
- 判据相关性:这条不属 R1–R9 任一条,但它就长在 R1 的路径上(压低余额进结算必经此屏)。
- 反方观点:禁用态本身是对的(钱不够确实不该让他往下走),而且**页面主体**那条 `⚠ All 6 activation slots are in use. You can still purchase…` 也在说槽位的事;所以这是"缺一句原因"的文案缺口,不是逻辑错。按项目铁律「业务链必须有下一步 / 禁用原因」,记 P2。

**P2-2|置换 sheet 把 3 台同型号设备列成 3 条一字不差的选项,用户无法分辨自己在拿哪一台去换**

- 实测(Pro 结算页 `How would you like to pay?`):`.tis-opt-list` 下 5 条,前 3 条 **innerHTML 完全相同** —— `Trade in NexGridBox S1 · $486.75 credit` × 3,再加 `Trade in Cloud Share · $14.92 credit` 与 `Pay full price · keep current devices`。
- 3 条 DOM 里没有任何区分字段(无序列号、无购入时间、无当前日产、无设备 id),点第 1 条和点第 3 条在界面上无从判断差别。
- 为什么算问题:置换是**不可逆的资金动作**(拿一台设备换 credit),而三个选项在用户眼里是同一个东西。按项目铁律「可枚举值用 select 不手输 / 业务链必须有下一步」,这里缺的是**每台设备的身份**。
- 反方观点:若产品口径是"同型号设备完全等价,换哪台都一样",那么三条并列只是冗余、不是风险,合并成「Trade in NexGridBox S1 ×3」即可。两种口径都需要改,只是改法不同。

**P2-3|商品详情页主 CTA「Buy now」与设备页动作项没有 `role` / `tabindex`,键盘与读屏用户够不到**

- 实测节点属性:
  - `.scb-cta`(商品详情页底部「Buy now」,主购买入口):`tagName=UNI-VIEW`、`role=null`、`tabindex=null`、`aria-label=null`;
  - 设备页 `Deactivate`:`role=null`、`tabindex=null`;
  - 置换 sheet 全族 `.tis-opt` / `.tis-cta` / `.tis-secondary` / `.tis-ghost` / `.tis-close`:实测 `role=null, tabindex=null`(与第 3 轮记录的 `.tis-close` 无 `role`/`aria-label` 同源,本轮确认整族都是)。
- 对照:同页 `[role="button"]` 是有的(FAQ 折叠项、数量 ±、浮动条 `.pcb-pill` 都有),所以不是全局未接,而是**这几处漏了**。
- 与项目规则的关系:`CLAUDE.md` 明写「自造控件只需声明 `role` + `tabindex="0"`,Enter/Space 由平台层 `lib/a11y-activate.ts` 自动提供」,并配有机器门 `scripts/a11y-activate-gate.mjs`。这批控件没声明 = 拿不到那层键盘语义;门没拦住,提示该门可能只扫了已有 `role` 的节点(**这是我的推断,未读门脚本,请实现方回源核实**)。
- 与本次改动的关系:不是本次改的,属存量;但浮动条 `.pcb-pill` 自己是合规的(有 `role="button"`),对比之下更显这几处是漏网。

**P2-4|`Review order` 步仍然只有 `Pay now` / `Change payment method`,没有取消或回商城的出口**(第 2 轮 P2-7 / 第 3 轮 P2-4 同项,本轮复验仍在)

- 实测 `cc3-04`:该屏可点控件只有 `Pay now`、`Change payment method`、顶部返回键、浮动条;**无 tabbar**。
- 但本轮情况已明显好转:**页头返回键稳定在场**(R3 已证实 3.6s 内恒为 1),所以不再是死角。上一轮之所以严重,是因为叠加了 P1-1(页头被拆掉)才真的无路可退;那个前提本轮已消失。
- 仍记 P2 的理由:弱化的 `Cancel` 只存在于上一步 select-payment,两步之间取消出口不一致。

**P2-5|撞单框仍把破坏性动作做成视觉最强项**(第 2 轮 P2-1 / 第 3 轮 P2-1 同项,本轮复验仍在)

- `cc3-03`:`Drop it, start new` 是红色实心,`Keep it` 是暗底幽灵按钮;而弹框正文本身在劝阻(`If you already sent funds to its address, keep it`)。
- **注意:R2 判据本身要求「Keep it / Drop it, start new」这个形态,所以不算判据失败**,只作设计口径的可辩论项登记。反方观点:红色=破坏性是通行约定,改成"安全项最强"会与全站其它确认框不一致,要改得整族一起改。

**P2-6|裸改 `location.hash` 进结算页时,URL 与渲染内容会不一致**(与第 3 轮 P2-5 同源,但本轮观察到的表现更具体)

- 实测一次:从 `#/pages/me/devices` 直接把 hash 改成 `#/pages/store/checkout?product=stellarbox-pro`,页面渲染出来的是**当时那张活票(S1)的扫码页**(地址 `T6463909C…4E22A` / `Amount 649 USDT`),而 URL 写着 `product=stellarbox-pro`。整页 reload 后恢复正常(正确显示 Pro $1,199)。
- 置信度说明:这条与「裸 hash 改写不触发 uni 路由重新初始化」这个已知测试手法产物**混在一起**,我没有把两者拆开(要拆需要构造 App 内的同路由跳转)。所以**不主张它是独立缺陷**,只作为观察项登记,供实现方判断是否与 `resume` 路径共用同一段逻辑。H5 下用户手改地址栏可达,App 端不可达。

### 未复现 / 本轮未覆盖

- **第 2 轮 P2-4 / 第 3 轮 P2-3「对同一商品有过期会话时再次进入结算直接落在超时态」:本轮未测**。R7 里我是从 resume 链接进的同一张票,不是"新入口重新进结算",两者不是一回事,不能拿 R7 的观察冒充复验。
- **第 2 轮 P2-5「Sign out 确认框跨路由残留」:本轮未测**(未进设置页)。
- **第 2 轮 P2-8「语言中途自己从 en 变 zh」:未复现**,但本轮全程 `userSet:true`,正好绕开了那条路径(该 bug 需要 `userSet:false`),所以**不构成"已修"的证据**。
- **第 2 轮 P2-9「商品详情页顶部 ticker 叠字」:本轮未专门看**。

---

## 三、环境与口径(影响可信度,必读)

**1. Playwright 浏览器是全会话共享的,本轮被另一 agent 干扰两次,已隔离**

- 现象 a(抢 tab):测到一半,当前 tab 被导航到 **5411** 端口;我用 `browser_tabs new` 开的新 tab 也被拽走过两次。
- 现象 b(**更严重,写数据**):我刚 mint 的会话 `pc-bd1e5cd2…`(剩 29 分钟)凭空消失,回读 `nexgrid-pending-checkout-accounts-v1` 变成
  `{"default":{"sessions":[{"id":"pc-audit-5","productId":"starter","amountUsdt":1299.5,"address":"TQ9aud1TfakeAddrForAuditxxxxxxxxxx",…}],"rev":5}}`
  —— 有 agent 在往 **5401 的 localStorage** 里写 audit 夹具,整个 accounts 映射被替换成只剩 `default` 一行,我登录账号那一行被抹掉。
- **我的隔离手段**:此后每个 `browser_evaluate` 第一行都是 `if (location.port !== '5401') return { GUARD_FAIL: location.href }`,读到别的端口一律丢弃重跑;每次下结论前额外核对「storage 里这张票的 session id / 地址,是不是我上一步刚 mint 的那张」。
- **为什么结论仍可信**:夹具形状与我的数据完全不同(`pc-audit-*` + `productId:"starter"` + 假地址 `TQ9aud1Tfake…`),我表里引用的每一个 session id(`pc-9b2a7f6f` / `pc-ab36b3d8` / `pc-bd1e5cd2` / `pc-a2853dab` / `pc-40bc6bc8` / `pc-eedbe3f3`)和地址都是我自己 mint 并当场回读的,没有混淆可能。被污染的那一次读数(`ord=0`)已识别并丢弃,未进任何结论。
- 现象 c(**起点数据与上一轮交底对不上 —— 已有更简解释,非污染**):第 3 轮 tester 交底说他收尾时留下「`+15559876543` 有 1 笔会话 `pc-b6576e93…` + 2 笔订单」,而我起点实测该账号是 **0 笔会话 + 4 笔订单**(`default` 的 2 笔订单对得上)。
  `[INFERRED, MED]` 最简解释是**修复作者在两轮之间跑流程自验**:走完一笔支付恰好「消掉 1 笔会话 + 加 1 笔订单」,把遗留那张跑完得 3 笔订单,再新开一张跑完就是 **0 会话 / 4 订单**,与实测完全吻合。结合上文已核实的 `1722cd9`(12:26:45 UTC 落地,就在我开工前),这是正常的修复自验,**不是第三方乱动**。原稿此处写「污染」措辞过重,已改。

- **对 `pc-audit-5` 的补充核查(现象 b 仍未获解释)**:我回源搜过 `grep -rn "pc-audit\|TQ9aud1T" scripts/ src/` —— **零命中**;且 `1722cd9` 新增的运行时门 `scripts/pending-checkout-runtime.mjs:23` 默认 `BASE_URL = http://localhost:5173`(不是 5401)。所以那张 `pc-audit-5` / `TQ9aud1TfakeAddrForAuditxxxxxxxxxx` 夹具**既不来自本仓代码,也不来自新挂的那道门**,现象 b(测试中途 5401 的 accounts 映射被整体替换、我的账号行被抹掉)至今没有对得上的来源。**我不指认是谁**,只记录:它确实发生过,发生在我 mint 会话之后,且不是上面那次修复自验能解释的形状。
  **扩大范围复核(我自己重跑过一遍,非转述)**:`grep -rIl -e "pc-audit" -e "fakeAddrForAudit" -e "TQ9aud1T"` 扫整个 `D:\WORKS\PLAN`(排除 node_modules/.git/.trash/dist/.next)+ 用户级 `~/.claude/{skills,agents,hooks}` —— **全工作区唯一命中就是本报告自己**。`[INFERRED, HIGH]` 它不来自任何落盘产物,而是某个 agent 运行时用 inline evaluate 把字符串直接拼进 localStorage 写的;这也解释了「整个 accounts 映射被替换、其它账号行一并消失」的形状(整体 `setItem(key, JSON.stringify(whole))` 覆盖写,不是 append)。

- 🔴 **由此得到的通用风险(比这次事故本身更值钱,建议后续轮次照做)**:Playwright MCP 共享的不只是**浏览器**,还有**被测页面的 localStorage**。端口守卫只防「我读到了别人的页面」,**防不住「别人写了我的页面」** —— 任何 agent 一句 `browser_evaluate` + `setItem` 就能覆盖掉另一个 agent 在途的 mock 数据。
  下一轮实操:凡依赖 storage 的判据,**读之前记 snapshot、下结论前再复核一次**,两次不一致就判 `ENV_TAINTED` 重跑(与端口守卫同思路,守的是写侧)。更省事的做法是自验/夹具注入换端口(5402 / 5423 都在跑),别和在途测试共用 5401。
- 已发消息给 team-lead 备案。

**2. 点击手法**:CTA / sheet 选项 / 弹框按钮混用了 `browser_click`(Playwright 真实事件)与页内 `el.click()`。关键判据(R1 的支付按钮、R2 的 Keep it/Drop it、R3 的浮动条与返回键、R4 的浮动条可点性)用的是 `browser_click` 真实点击;为对抗 tab 抢占,后段的长链路(关 sheet→Continue→Pay now)改用页内 `el.click()` 串联以减少往返次数。层级判定一律用 `elementFromPoint` 而非截图肉眼(R8 那条自我纠错就是这么抓出来的)。

**3. 超时注入用的是 40–45s 而非判据写的 20s**:MCP 单次往返约 5–15s,20s 窗口会在"注入→reload→开始采样"的间隙里跑完,导致抓不到"归零前浮动条还在"的那一段。放宽到 40–45s 只是让采样能覆盖全程,不改变被测逻辑。

**4. 收尾数据状态**(已按要求恢复):登录账号 `+15559876543@demo.nexgrid.ai`,`usdtBalance` / `withdrawableUsdt` 均已改回 **20000** 并 reload 生效;该账号残留 **1 笔** s1/$649 待支付会话(`pc-eedbe3f3…` / `TCED2A754…4D3BE`)、**5 笔**订单;locale 仍 `en/userSet:true`。全程只改 storage,**未触碰任何源码**。

**5. 截图**:9 张 `cc3-*.png` 落在 `D:\WORKS\PLAN\` 根(与前两轮的 `cc-*` / `cc2-*` 同处),报告引用中,未删除,请 main 在结案时一并清理。
