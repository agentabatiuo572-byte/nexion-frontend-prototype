# 结算页待支付会话(发票)+ 全站浮动条 —— 第 5 轮独立黑盒验收

被测 HEAD da445ec · http://localhost:5401(worktree `ad-checkout-cancel`,分支 `pkg/ad-checkout-cancel`,mock 档)· 执行日期 2026-08-17

工具:node 直驱 playwright(不走共享 MCP 浏览器),每个场景独立 `browser.newContext()`,每次 evaluate 前核 `location.port === "5401"`。脚本在 `C:/Users/jason/AppData/Local/Temp/claude/D--WORKS-PLAN/0b87c7a4-309d-4850-89fc-5ee30691da47/scratchpad/t5/`(未进仓库);未改动任何源码 / 脚本 / 文档。

## 一、结论一览

| 条目 | 结果 |
|---|---|
| R1 开票→后退→浮动条→点条回同一笔 | **pass** |
| R2 恢复后直接付款,成交恰一次 | **pass** |
| R3 窗内领券不阻断付款(实扣 = 票面 649) | **pass** |
| R4 两标签页同一张单次券,只一处带折扣成交 | **pass** |
| R5 两个结算页实例 + 旧机抵扣,按票面 634.08 成交 | **pass** |
| R6 浮动条不压内容(4 个页面 + 滚动) | **pass** |
| R7 撞单 Keep it / 取消 / 超时 / 一票只结算一次 | **pass**(4 子项全过) |
| R8 余额不足回弹 → 会话作废 | **pass** |
| R9 页面 console 无 error | **pass**(0 条) |

## 二、逐条明细

### R1 开票 → 后退 → 浮动条 → 回同一笔

| 判据 | 结果 | 证据 |
|---|---|---|
| 链上 Pay now 开票,金额 = 确认页应付,30 分钟窗 | pass | 会话 `pc-fee4df3a…`,`amountUsdt 649`、`quote.total 649`、地址 `T9B870E7…`,倒计时 29:59 |
| 后退 = 静默保留 + 一次性提示 | pass | 页头返回后 toast「Order held for 30 min — continue anytime from the bar at the top」;storage `sessions.length 1`,`leftNoticeShown` false→true;**再次离开无 toast**(`leave2Toasts []`,会话仍在) |
| 浮动条在别的页面出现 | pass | 首页 `.pcb-pill` = 「Awaiting payment $649 · 29:41 Continue →」,rect y=60 h=44 |
| 点条回来 = 同地址、倒计时连续 | pass | 回到扫码步:id / 地址 / `expiresAt` 三项全等;倒计时 29:59 → 29:36(经过约 23s,未重置);此时浮动条自动隐藏(当前页正展示该票) |

### R2 恢复后直接付款

| 判据 | 结果 | 证据 |
|---|---|---|
| 订单 +1 | pass | `orders` 0 → 1:`ORD-20260816-6198`,`total 649`,`status paid` |
| 会话清零 | pass | `sessions.length` 0,浮动条消失 |
| 余额减少 = 票面 | pass | `usdtBalance` 24856.56 → 24207.56,差 **649.00** |

### R3 窗内领券不阻断付款

| 判据 | 结果 | 证据 |
|---|---|---|
| 无券票面 649 | pass | 确认页 `Total $649`;会话 `quote.voucher {id:null,discount:0}` |
| 窗内真领到券 | pass | 首页券弹层点 Claim → toast「Voucher claimed」;`nexgrid-voucher-accounts-v1` = `claimed:[{id:"vc-newuser-50",usedAt:null}]`(**先证起点**:早前一次点击被里程碑遮罩吃掉、账本仍为空,已排除后重测) |
| 领券不改这一单 | pass | 浮动条仍 $649;恢复后扫码页 `Amount 649 USDT` |
| 付款成交且实扣 = 票面 | pass | 订单 `total 649`、`discount 0`;余额 −**649.00**;无「报价已变」提示,无拒单 |
| 对照:券确实可用(否则本条无意义) | pass | 同一账号紧接着新开 S1 结算 → `Total $599`、`Voucher −$50`;券 `usedAt` 仍为 null(这一单没吃掉它) |

### R4 两标签页同一张单次券

设计上同账号同一时刻只允许一张在窗内的链上票,故两条并存的结算路径取:tab A = 链上票(599),tab B = 同一张券走卡支付(先绑一张 mock 卡)。

| 判据 | 结果 | 证据 |
|---|---|---|
| 两个 page 都应用了同一张券 | pass | A、B 报价页均 `Total $599`;A 的票 `quote.voucher {id:"vc-newuser-50",discount:50}` |
| 只有一处带折扣成交 | pass | B 成交:`ORD-20260816-3379`、`total 599`、`discount 50`、`method card`;券 `usedAt` 被打戳 |
| 另一处被拒回报价步 | pass | A 点「已完成付款」→ toast「Voucher discount changed — review the updated total before paying」,落回付款方式步且 `Total $649`(券已失效);`sessions []`,该票作废 |
| 订单 / 余额对得上 | pass | 全程只有 **1 笔**订单;余额 24856.56 → 24236.59,差 **619.97** = 卡单 599×1.035,链上那笔一分未扣 |

### R5 两个结算页实例 + 旧机抵扣

| 判据 | 结果 | 证据 |
|---|---|---|
| 接受抵扣后票面 634.08 | pass | 确认页 `Subtotal $649 / Trade-in credit −$14.92 / Total $634.08`;会话 `amountUsdt 634.08`、`quote.tradeIn.deviceId "cloud-share-seed"` |
| 推第二实例 → 关 sheet → 返回,第一实例抵扣仍在 | pass | `getCurrentPages()` 1 → 2 → 1;第二实例同样显示 `Cloud Share credit −$14.92` 并显示浮动条;返回后仍在扫码步,倒计时 29:59 → 29:53 连续,会话 tradeIn 未变 |
| 成交按票面 | pass | `ORD-20260816-7614`:`total 634.08`、`tradeInCredit 14.92`、`tradeInDeviceId "cloud-share-seed"`、`status paid` |
| 旧机消失 / 会话清零 / 无 Amount due changed | pass | 设备表 5 → 4,`cloud-share-seed` 已移除;`sessions 0`;余额 −**634.08**;全程无金额变更提示 |

### R6 浮动条不压内容

静止态(首屏)按「浮动条矩形 × 页面内可见且会绘制的元素」求交集面积:

| 页面 | 静止态重叠 | 浮动条 / 页内 sticky 头 rect | 结果 |
|---|---|---|---|
| `/pages/daily/daily` | **0** | pill 8→52,`.spv` 60→104,间隙 8px | pass |
| `/pages/me/wallet-nex` | **0** | pill 8→52,`.spv` 60→104,间隙 8px | pass |
| `/pages/store/detail?id=stellarbox-s1` | **0**(命中项只有一个透明布局壳与一条临时 toast) | 页头 0→56,pill 64→108,主图从条下开始 | pass |
| 首页 tab | **0** | pill 60→104,券横幅 / 问候语在条下 | pass |
| 向下滚一屏后 sticky 行位置 | `.spv.top 60` > `pill.bottom 52`,差 **+8px**(daily / wallet-nex 同) | sticky 停在浮动条下沿,未钻到条底下 | pass |

截图:`r6rest-daily.png` / `r6rest-wallet-nex.png` / `r6rest-store-detail.png` / `r6rest-home.png`(静止)与 `r6-daily.png` / `r6-wallet-nex.png`(滚动后)。滚动后有页面内容从浮动条**背后**掠过,属浮动条的正常层叠(条本身不透明),不计为遮挡。

### R7 撞单 / 取消 / 超时 / 一票只结算一次

| 子项 | 判据 | 结果 | 证据 |
|---|---|---|---|
| 撞单框 | 已有活票再 Pay now 弹确认框 | pass | 走真实路径(Pro 详情页 → Buy now,栈内推新实例,Pro 报价 `Total $1,199`)→ Pay now 弹框:「You have an unpaid order NexGridBox S1 · $649 is still waiting for payment (29:50 left). Drop it and start this one? If you already sent funds to its address, keep it — you can resume it anytime from the bar at the top.」按钮 `Keep it` / `Drop it, start new` |
| Keep it | 什么都不动 | pass | 会话 id / 地址 / expiresAt 三项全等,`sessions 1`,订单 0,余额 24856.56 未变 |
| 点遮罩 | 等同 Keep it | pass | 同上三项全等,订单仍 0 |
| 取消 | 扫码页 Cancel → 确认框 → 确认即作废回 confirm | pass | 框文案「Cancel this payment? If you already sent funds to this address, don't cancel — tap I've completed the payment instead.」按钮 `Keep paying` / `Cancel payment`;点遮罩 = 不取消(`sessions 1` 仍在扫码步);点 `Cancel payment` → `sessions 0`、回 confirm 步(Review order / Pay now)、浮动条消失、订单 0、余额未变 |
| 超时 | 归零进超时态,唯一出口 | pass | 把 `expiresAt` 提前(窗口仍在合法域内)后硬刷新 → 扫码页倒计时跑到 `00:00` → 「Payment window closed / This address is no longer valid. Start again to get a fresh one.」,页面**只剩 1 个出口** `Start again`;`sessions 0`、浮动条消失、订单 0、余额未变;点 `Start again` 回确认步可重新下单 |
| 一票只结算一次 | 第二个 tab 结算后第一个 tab 不再扣款并给提示 | pass | B 结算 → 1 笔订单 / `sessions 0` / 余额 −649;A 在过期扫码步再点「已完成付款」→ toast「**This payment was already completed or cancelled elsewhere — choose a payment method to pay again.**」,订单仍 1 笔、余额无二次变动,落回 confirm 步 |

### R8 余额不足

| 判据 | 结果 | 证据 |
|---|---|---|
| 回弹并给出原因 | pass | 票面 649 在窗内时把余额压到 10 并硬刷新 → 点「已完成付款」→ toast「You need at least $649.00 USDT to continue.」,落回付款方式步 |
| 会话作废 | pass | `sessions.length 0` |
| 浮动条消失 | pass | 当前页与首页均 `.pcb-pill` 不存在 |
| 无订单 / 不扣款 | pass | `orders []`,余额仍为 10 |

### R9 console

| 判据 | 结果 | 证据 |
|---|---|---|
| 无 pageerror / console.error | pass | 一次贯通采集(报价→确认→开票→离开→home / daily / wallet-nex / detail / store / me / orders 七页各滚一屏→点条恢复→成交→订单页):**error 0 条、warning 0 条**;另外 R1–R8 每个场景各自独立采集,同样全部为 0 |

## 三、观察项(不计 fail)

- **浮动条覆盖面**:活票在窗内时,home / daily / wallet-nex / store detail / store / me / orders 七个页面全部出条,量到的静止态重叠均为 0。
- **当前页正展示该票时条自动隐藏**:扫码步、以及新标签页点条回到扫码步后,`.pcb-pill` 均不存在 —— 与「当前结算页未展示它才显示」一致。
- **卡支付不开票**:走卡路径全程 `sessions 0`,直接成交(实测 `total 671.72` 一单),与「卡支付不开票」一致。

## 四、未测项

| 项 | 原因 |
|---|---|
| 收据恢复卡(账单未记录 / Retry)不遮蔽活票 | 不在本轮 R1–R9 清单内;要造该状态需构造「订单已成交但账单未落账」的存量,本轮未构造,故不下任何结论 |
| 存款类(`kind:"deposit"`)会话 | 本轮只覆盖 `kind:"purchase"` |
| 真实链上 / 远端后端档 | 本轮只测 mock 档 |

## 五、环境备注(脆性与排除办法)

1. **里程碑庆祝遮罩 `.ms-overlay` 会吞点击**:它的 dismiss 挂在 `.ms-overlay` 上,而遮罩正中就是 `@click.stop` 的 `.ms-card` —— 点 `.ms-backdrop` 中心永远关不掉(实测连点 12 次仍在)。改为点 `.ms-overlay` 左上角 (4,4) 后一次即关。**按 Escape 也能关,但会连带关掉券弹层**,所以领券场景只能用角点击。
2. **领券失败会静默**:第一次跑 R3 时 Claim 点击被 `.ms-overlay` 挡住,券账本 `nexgrid-voucher-accounts-v1` 为 null,但流程照常走完、付款照常成功 —— 若不回读账本就会把「没领券」误判成「领券不阻断付款 pass」。本轮所有涉券结论都以**账本里 `claimed[]` 真出现**为起点判据。
3. **`page.goto` 到只有 hash 不同的 URL 不会重载文档**:活票在窗内时,同一 tab 用 `goto` 切到 `?product=stellarbox-pro` 仍显示 S1 那张票的扫码步(`Amount 649 USDT`)。这是 hash 路由同文档导航的产物,不是产品缺陷 —— 同一 URL 走 `page.reload()` 硬刷新即正确显示 Pro 报价 `Total $1,199` + S1 浮动条;新开 tab 深链同样正确。凡需换商品 / 换步骤的场景本轮一律用硬刷新或新 tab。
4. **结算页步骤会被持久化**:绑卡中途会推出第二个结算页实例,回到第一实例仍停在选卡步。要回到付款方式步得走 `Cancel` → `Change payment method`(本轮封装为 `ensureMethodStep`)。
5. **入口置换 sheet(`.tis-root`)会在多处再次弹出**(超时后、绑卡返回后),已纳入统一的遮罩清理;`.tis-close` 关闭 = 不接受抵扣,选第一个 `.tis-opt` 再点 `.tis-cta` = 接受。
6. **toast 是瞬时的**:R7 最后一子项第一次跑在点击后 3.4s 才采样,漏掉了「already completed or cancelled elsewhere」这条,险些误报缺失。改为点击后按 150ms 间隔连续轮询 7s,才稳定捕获。所有 toast 类判据均按此法取证。
7. 语言按要求在 `addInitScript` 里钉 `nexgrid-locale-v1` 为 en;URL 一律带 `?nx_device=off`(在 `#` 前)关掉手机壳。
