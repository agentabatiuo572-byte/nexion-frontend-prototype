本页判定目标=结算可取消/可中断 + 待支付会话浮动条(来源:任务判据清单)

黑盒验收 · 2026-08-16 · 被测:`http://localhost:5401`(worktree dev server,mock 模式)· 视口 390×844 · Playwright MCP
测试者未参与实现,所有结论均来自运行时观察(源码仅用于定位选择器与 i18n key)。

## 一、判据结论表

| 判据 | 结论 | 证据 | 备注 |
|---|---|---|---|
| **A1** select-payment 有弱化 Cancel,点击回商品页 | **pass** | `cc-01-select-payment-cancel.png`、`cc-02-a1-cancel-lands-detail.png`;computed style 实测:Continue = `bg rgb(158,220,29)` / 15px / weight 600,Cancel = `bg rgba(0,0,0,0)` / 13px / weight 400 / `color rgb(155,163,181)`,位于 Continue 下方(y 647 vs 599);点击后 URL → `#/pages/store/detail?id=stellarbox-s1` | 两者高度均 44px,满足 tap ≥44pt |
| **A2** 扫码页停留 ≥60s 不自行推进 / 余额不变 / 不建单 | **pass** | `cc-03-a2-pay-instructions-t0.png` → `cc-04-a2-pay-after-66s.png`;实测间隔 66.0s(t0=1786871878830 → t1=1786871944871);倒计时 29:44→28:38;仍在扫码页;`nexgrid-orders-accounts-v1` 订单数 1→1;`usdtBalance` 23558.56 前后一致;地址 `T78D2ACA5B0B3DA617C0874610E048103D` 未变 | — |
| **A3** awaiting / activating 的 Track Order 出口 | **pass** | 逐秒轮询:awaiting(s1–s2)无 `Track Order`(mock 下无订单号,符合预期);activating(s4–s6)有 `Track Order →`;**在 activating 阶段点击**→ `#/pages/store/order-detail?id=ORD-20260816-9599`(`cc-11-a3-track-order-detail.png`) | 在 activating 窗口内点击已实测,非用 live 阶段替代 |
| **B1** 返回后一次性 toast + 浮动条 + 跨 tab + 刷新存活 + toast 不重复 | **pass** | toast 原文 `Order held for 30 min — continue anytime from the bar at the top`,DOM `.nx-toast-host` 连续 6 次采样均命中;浮动条 `Awaiting payment $649 · 28:09 · Continue →`(`cc-05`、`cc-09`);Home/Earn/Team/Me 四 tab 均在且倒计时递减(27:18→27:14);整页 `location.reload()` 后仍在且连续(25:58→25:45);第二次离开扫码页:toast 0 命中(2.4s 采样全空),浮动条仍在 | toast 存活约 2s,截图往返慢于它,故以 DOM 采样为准 |
| **B2** 点浮动条回同一笔(地址/倒计时/金额一致,扫码页不显示浮动条) | **pass** | `cc-06-b2-resume-same-session.png`;URL → `?product=stellarbox-s1&resume=pc-2adaad60-4b43-415b-b115-db45b7585f71`;地址仍 `T78D2ACA…103D`;倒计时 25:16(条)→25:14(页),**未重置为 30:00**;金额 649 USDT 一致;扫码页 `.pcb-pill` 查询为 null | — |
| **B3** 扫码页 Cancel → 确认框;点遮罩=继续支付;确认=浮动条消失 + 回 Review order | **pass** | `cc-07-b3-cancel-confirm-dialog.png` 文案 `Cancel this payment?` / `Keep paying` / `Cancel payment`;点遮罩(`.nx-mask--confirm`)→ 弹框关闭、仍在扫码页、会话地址不变、会话数 1;点 `Cancel payment` → storage 变 `{"sessions":[]}`、`.pcb-pill` 消失、页面回到 `Review order`(`cc-08`) | — |
| **B4** 完成购买全链路 + 浮动条消失 + sessions 清空 + 订单 +1 | **pass** | 26 秒逐秒时间线:awaiting →(s3)confirmed:订单 1→**2**、sessions 1→**0** →(s4)activating(带 Track Order)→(s7)live `Order placed`(`cc-10`);全程 `.pcb-pill` 均为 null;`usdtBalance` 23558.56 → **22909.56**(恰好 −649,仅扣一次) | 扣款确在 confirmed 时点发生 |
| **B5** 超时:浮动条归零消失;扫码页转「Payment window closed」;Start again 得新地址 + 30:00 | **pass** | 页内:`cc-12-b5-payment-window-closed.png`,00:00 时地址消失、无 `I've completed the payment`、仅 `Start again`;页外:浮动条 00:05→00:03→消失,storage 会话被剪除为 0;`Start again` → `Review order`;`Pay now` → 新地址 `TECD3E053FEFACFCEADE021F692C6BBB1E`(≠ 旧 `TB2E8008…1357`),倒计时 29:59 | 过期用 `expiresAt` 注入 + 整页 reload |
| **B6** 撞单弹框 / 遮罩 / Resume it / Drop it | **部分 fail(遮罩一项 fail,其余 pass)** | 见下方逐项 | 详见 §二-1 |
| ├ 弹框内容 | pass | `cc-13-b6-collision-dialog.png`:`You have an unpaid order` + `NexGridBox S1 · $649 is still waiting for payment (29:26 left)…` | 名称/金额/剩余时间均正确 |
| ├ 点遮罩 = 不动(留在 B 的 Review order) | **fail** | 点击目标经事件捕获确认为 `UNI-VIEW.nx-mask nx-mask--confirm`;结果:弹框关闭但**页面跳到 A 的扫码页**(649 USDT / `TF55665B940DD630F5F84BD6DD42CCE584`),而 URL 仍是 `?product=stellarbox-pro`(`cc-14`) | 旧会话保住(非破坏性),但不满足「不动」;且 URL 与所显示商品不一致 |
| ├ Resume it = 原地回 A 的扫码页 | pass | 点击前后 hash 均为 `…?product=stellarbox-pro`(原地未跳转);地址=A 的 `TF55665B…E584`;`.nx-navheader` 存在、标题 `Checkout`、`.nx-nav-side` 返回键存在;金额 649(A)非 1199(B) | — |
| └ Drop it, start new(红色) | pass | 按钮 `background rgb(255,92,92)`;旧会话消失;新会话 = `stellarbox-pro` / **$1,199** / 新地址 `T928E3710E5222F4B365CBC68203176045` / 倒计时 29:59 | — |
| **B7** 账号隔离 | **pass** | 用注册流(滑块 + OTP)真实新建两个账号。`+15559876543@demo.nexgrid.ai`(新)在 Home/Store/商品页/Me/Earn 全部 `NO_BAR`;storage 按 accountKey 分行:`default`=1 笔(pro/$1199)、`+1555987…`=1 笔(s1/$649)、`+1555111…`=0 笔;登回 `+1555987…` 后浮动条恢复(`Awaiting payment $649 · 26:43 · Continue →`,`cc-15`) | 无法切回隐式 `default` 账号(它没有可登录凭据),故改用「新账号 B 建会话 → 注册账号 C 验隔离 → 登回 B 验恢复」等价路径 |
| **B8** 三语(en/zh/vi)无英文硬编码 | **pass** | 浮动条:`待支付 $649 · 26:02 继续支付 →` / `Chờ thanh toán $649 · 29:09 Tiếp tục →`;toast:`订单已为你保留 30 分钟,随时从顶部继续支付` / `Đơn được giữ 30 phút — tiếp tục bất cứ lúc nào từ thanh phía trên`;超时态:`支付已超时 / 此地址已失效,请重新下单获取新地址。/ 重新下单`(`cc-17`,正文无残留拉丁字母)、`Hết thời gian thanh toán / Địa chỉ này không còn hiệu lực…/ Bắt đầu lại`;撞单:`cc-16`(zh)、`cc-18`(vi);取消框:`取消这笔支付?/ 继续支付 / 取消支付`、`Hủy thanh toán này? / Tiếp tục thanh toán / Hủy thanh toán` | 五个界面 × 三语均运行时实测 |
| **B9** console error = 0 | **pass** | `browser_console_messages(level:"error", all:true)` → 0 errors / 0 warnings;磁盘日志(`.playwright-mcp/console-2026-08-16T09-*.log`)本轮 5401 页面仅有 Chrome `[VERBOSE] [DOM] Password field is not contained in a form`(登录/注册页,浏览器提示非应用错误) | 唯一 ERROR 级条目是 `[vite] server connection lost` 伴随的 `net::ERR_CONNECTION_REFUSED`(Vite HMR 客户端,dev 工具噪声,非应用代码);另:旧日志(08:24)里的 `[DBG checkout]` 调试 log 已不在当前源码中,本轮未复现 |

---

## 二、其它发现(全部上报,不设数量目标)

### P1

**P1-1|在撞单弹框打开时按返回键 → 弹框变成全站阻断遮罩,且待支付浮动条被全站抑制,只有刷新能恢复**

- 复现(全部为普通用户动作,已确定性复现 2 次):
  1. 账号已有商品 A(NexGridBox S1 / $649)的待支付会话;
  2. 进入商品 B(Pro)结算 → 继续 → 立即支付 → 弹出撞单框「你有一笔待支付订单」;
  3. **不选任何选项,直接点页头返回键**;
  4. 落到 Pro 商品详情页,撞单框仍然显示在页面之上。
- 实测后果:
  - 弹框跟随到**每一个页面**(首页 / 赚钱 / 团队 / 我的 / 商城 tab 全部命中),`cc-20-p1-stale-collision-dialog-on-store-tab.png`、`cc-19-detail-ticker-overlap.png`;
  - 遮罩 `position:fixed; z-index:9100; background:rgba(0,0,0,0.62); pointer-events:auto`,`elementFromPoint(195,120)` 与 `(195,780)` 均命中遮罩 → **真实点击被挡住**;
  - 弹框里的「继续那一笔」失效:点了只关闭弹框,**不跳转到待支付页**(hash 实测 UNCHANGED);
  - 同时 `.pcb-pill` 浮动条在**所有页面消失**,而 storage 里该会话仍然存在(`sessions=1`,剩 26 分钟)。关掉弹框也不恢复;
  - **只有整页刷新才恢复**(刷新后浮动条回来:`待支付 $649 · 26:42 继续支付 →`,会话完好)。
- 为什么算 P1:这条 bug 直接打掉本功能的目的——用户还有一笔活着的待支付订单,却在全站失去了回到它的入口(浮动条不见),同时被一个指向该订单、按钮又不工作的弹框挡住页面。非破坏性(钱和会话都没丢)、且可通过点遮罩关掉弹框、刷新恢复浮动条,故未定 P0。
- 追加线索(同一根因的可能第二个入口,**未能确定性复现**,如实标注):测试中期还出现过一次「storage 有会话但浮动条全站不显示」,当时路径是「从语言设置页用 hash 直接跳进结算页 → 超时态 → Bắt đầu lại → 立即支付 → 返回」,该次无撞单框参与;后续用 3 种变体(hash 跳转 + 返回、超时→重新下单→支付→返回、正常 resume→返回)均未再复现。两者症状一致(会话在、浮动条被抑制、刷新即恢复),疑似同一处「离开结算页时页面状态没清干净」,但只有撞单框那条路径我能稳定复现。

### P2

**P2-1|撞单弹框点遮罩=执行「Resume it」,不是无操作**(即 B6 的 fail 项)。会跳到另一笔订单的扫码页,且 URL 仍停在 `?product=stellarbox-pro` 而画面是 S1 的发票——URL 与内容不一致。实现上它与「取消支付」弹框是同一套(点遮罩 = 走 cancelLabel 那一档)因而自洽,但与验收判据「点遮罩=不动」相反;两边需要对齐口径。反方观点:遮罩执行「非破坏性那一项」本身是常见模式,若规格改成「遮罩=Resume」也说得通——但那样就得接受「误触遮罩会把用户带走」。

**P2-2|取消支付确认框把破坏性动作做成了视觉最强项**。`Cancel payment` 是红色实心(`rgb(255,92,92)`),安全项 `Keep paying` 是描边幽灵按钮;而弹框正文恰恰在劝阻用户取消(「若你已向此地址转账,请不要取消」)。红色=破坏性是通行约定,所以这是可辩论项,不是硬错;但在「误触=可能丢掉一笔已转账订单」的场景里,建议把安全项做成主视觉。证据 `cc-07`。

**P2-3|超时态卡片头部仍写「Send USDT-TRC20」**,而此时已经不能再转账(地址已撤、CTA 已撤),头部与卡体语义相反。证据 `cc-12`。

**P2-4|商品有过期会话时,再次进入该商品结算页会直接落在「支付已超时」态,而不是支付方式选择步**。用户从商城点进来想重新下单,先撞到一屏「失效」。功能上有 `Start again` 兜底、也算把事说清楚了,故只记为观察项;若产品口径是「新入口=新单」,这里应直接给 select-payment。

**P2-5|弹框会跨路由残留(不止撞单框)**。另一处独立实例:在「我的」页点「退出登录」弹出确认框后导航到登录页,该「Sign out」确认框仍显示在登录页上(snapshot 里 `dialog "Sign out"` 与登录表单并存)。指向同一层 `.nx-mask` 在路由切换时不被回收的共性问题。

**P2-6|结算页 checkout→checkout 同路由跳转会把页头整个打掉**。从 `#/pages/store/checkout?product=stellarbox-s1` 直接改 hash 到 `?product=stellarbox-pro` 后,`document.querySelector('.nx-navheader')` 返回 **null**——没有返回键、没有「Checkout」标题,浮动条紧贴视口顶部压住「Review order」标题(证据:该状态截图见 `cc-13` 上沿,页头位置为空)。整页刷新后恢复正常。触发方式是原始 hash 改写(H5 下用户手改地址栏可达),不是我在 App 内找到的任何控件;`pending-checkout-bar.vue` 顶部注释也提到过同路由 teardown 抢页头的问题。按「用户可达性低」记 P2,但同路由 checkout→checkout 正是「Resume it」的形状,建议顺手加一道防护。

**P2-7|`Review order`(confirm)步没有取消/返回商店出口**,只有 `Pay now` 和 `Change payment method`;A1 的弱化 Cancel 只存在于 select-payment 步。页头返回键可用,所以不是死角,但取消出口在两步之间不一致。

**P2-8|语言会在会话中途自己从 en 变 zh**。`ensureSystemDetected()` 只在首页调用(`src/pages/index/index.vue:316`),而 `DEFAULT_LOCALE = "en"`(`src/i18n/index.ts:38`)。深链进非首页的用户会先看到英文,直到第一次访问首页,全站文案突然整体切换成中文(实测:商品详情页英文 → 访问首页 → 同一页面变中文,`nexgrid-locale-v1` 从 en 变 `{code:"zh",userSet:false}`)。属既有行为、与本次改动无关,但对本功能的直接影响是浮动条文案会跟着中途换语言。

**P2-9|商品详情页顶部图片区文案叠字**。`cc-02` / `cc-09` 可见「47 left in stock」「105 viewing」「115 sold · 24h」等滚动 ticker 与图片下沿互相压字、且有半截被裁的行。与本次改动无关(浮动条覆盖的是更上方的区域),但在同一屏内,一并上报。

**P2-10|注册流的滑块验证在自动化下可解**:拼图目标位置直接可从 DOM 读到(`.cs-slot` 的 computed `left` ÷ 拼图可用宽度 = `targetRatio`,容差 `±0.02`),据此一次拖动即通过,5 次机会一次没用完;OTP 在 mock 下任意 6 位(除 000000/999999)皆通过。这是 mock 的既定设计(`src/store/auth-otp.ts` 注释写明 PROD 要换 server 权威比对),记录在此只为提示上线前必须替换,不作为本功能缺陷。

### 说明 / 未能验证项

- **B7 的「切回原账号」用等价路径完成**:mock 里最初的 `default` 账号是隐式创建的、没有可登录凭据,UI 上「退出登录」后只能走注册/登录,无法再回到 `default`。故改为「登录账号 B 建会话 → 注册账号 C 验隔离 → 登回 B 验恢复」,三行 storage 数据同时佐证隔离。结论仍为 pass,但路径与判据字面不同,特此标注。
- **B9 的 0 error 口径**:`browser_console_messages` 的缓冲区会随导航重置,因此我另外核对了磁盘 console 日志。5401 页面本轮无任何应用级 JS 错误/Vue 警告;唯一 ERROR 级条目来自 Vite HMR 客户端与 dev server 断连(`net::ERR_CONNECTION_REFUSED`),属 dev 工具噪声。
- 全程测试数据落在 mock storage,未触碰源码。测试账号:`+15559876543@demo.nexgrid.ai`、`+15551112222@demo.nexgrid.ai`(密码 `Nexgrid123`),`default` 账号残留 1 笔 pro 待支付会话。
