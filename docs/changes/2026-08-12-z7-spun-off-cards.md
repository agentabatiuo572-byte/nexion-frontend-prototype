# 包 z7 拆出去的卡 —— 范围外但已确证的缺陷（主人 2026-08-12 拍板 A：收窄 z7）

> 这些是 z7 三轮独立审计（R1 42 agent / R2 6-of-117 撞额度 / R3 43 agent）确证、
> 但**不属于「给回查接口补两个字段」这张卡**的问题。z7 收窄后它们**仍然存在**。
> 本文件是它们的立卡依据与证据存档 —— 写下来是为了「不修」不等于「没看见」。

---

## 卡 1 🔴 提现单合并仲裁重构（原 z7 越界部分，优先级最高）

**缺陷**：账号快照三路合并对提现单**只按状态档位**裁决胜负，而档位是「谁更新」的**替身**。
`frozen` 与四个终态同排最高档，且 `frozen` 是**在途**态 —— 于是：

- `frozen → refunded / review-rejected / tx-failed / address-invalid`（同档）每一次都被丢弃；
- `frozen → processing / sent / confirmed`（降档，后台核查通过**放行回主链**）也全被丢弃。

**后果**（三条，全是永久性的）：该单不在失败清单里 → 退款永不触发；
`occupiesWithdrawalSlot` 恒真 → 换绑收款地址与下一笔提现被永久拦死；账单行永远停在处理中。

**证据**：R1 三条 P0 同根；R2 探针实跑 `frozen→{processing,sent,confirmed}` 三条边全丢；
R3 反向探针 `磁盘 confirmed vs 内存陈旧 frozen` → 得 frozen（已到账退回在途）。

**为什么不在 z7 修**：z7 曾试过，用「最后镜像时刻」当仲裁判据 —— R3 当场打回三条 P1：
① 设备墙钟未校验（偏前一小时即可把单据**永久钉死**，devtools 写 `9e15` 同效）；
② 整行胜者通吃会抹掉败方独有的 `terminalReason`；③ 在途闸是 store 实例级，跨标签页无效
且无超时兜底（一次不返回的请求 = 本会话回读永久停摆）。
**结论：这需要可信时钟来源、字段级冲突规则与跨端协调，是独立的仲裁重构，不是契约卡的附带。**

**已在 z7 内落地的那一半**（保留）：同状态两份快照按**字段**合并，不再整行择一
（`account-cloud.mergeSameStatusWithdrawal`），守门 `spec4-account-cloud-merge-check` 四格 + 红测。

**开工前必读**：`docs/changes/2026-08-11-z7-structural-reflection.md` 第二族。

---

## 卡 2 🔴 提现可提上限用本地假余额算，服务端权威值解析后从不消费

**缺陷**：`wallet-withdraw.vue` 的可提额度 = `app.user.usdtBalance − 两个锁定桶`，
而 `usdtBalance` 在远端档下**没有服务端来源**（mock 种子 24856.56）；
`earnings-release-api` 解析出来的服务端权威 `buckets.withdrawable` **全仓零消费者**。

**R3 实测**（worktree dev server + `dev-stub-backend`）：stub 回 `withdrawable=50`，
页面渲染「可提现 $24,856.56」（497 倍），输入 $5000 通过前端校验并提交成功，
再提 $9000 仍通过 —— 累计 $14,000 打在 $50 的服务端额度上。客户端上限门等于不存在。

**同型**：`policy.smallAmountThresholdUsd`（小额免审线）同样解析后无人消费，取本地写死 50。

---

## 卡 3 🔴 隔壁包（z6/z8）的 NEX 退还门在与本包合并后会变假绿

**缺陷**：`selfcheck-withdraw-nex-refund.mjs` 的 gate ⑪ 判据是
`/nexRefunded/.test(apiSrc.split(/interface WithdrawalStatusSnapshot|parseStatusSnapshot/)[1])` ——
按**字面量在不在某段文本里**判，不是按因果。R3 实跑合并产物（`git merge-tree`）：
命中的是 `parseSubmission` 里的 `rawNexRefunded`，而回查响应契约里**并没有**该字段，门照报 PASS。

**后果**：交接书承诺的「出现状态回查面而响应不带该字段即判红」不成立；
z6/z8 两个包的退还工作在远端档不可达，且无人被告警。

🔴 **谁被挡住：不是 z7，是 z8。** 该门**不在主线上**（只在 `pkg/z8-refund-ts` / z6 分支）。
z7 合并时主线上没有这道门，不会假绿；**风险发生在 z8 合并那一刻** ——
它的门落到一个已经有 z7 `withdrawal-api.ts` 的主线上，`else` 分支的 split 判据当场误判。
**z8 合并前请先把该门的判据从「字面量在不在某段文本里」改成钉因果**（回查响应契约带不带该字段）。

---

## 卡 4 到账时刻解析无合理性窗口（主线既有）

`parseStatusSnapshot` 对 `confirmedAt` 只判「能不能解析成有限正数」：
字符串 `"0"`、秒级时间戳、越界未来值全部放行，而数字串毫秒被丢弃。
终态单不再回查 → 用户永久看到一个假的「实际到账时刻」。

---

## 卡 5 落盘回滚只活到「下一次任意落盘」（主线既有 + z7 补了两处同形）

`persistAccountSnapshot` **无条件** `adoptAccountSnapshot(result.snapshot)`，
而写失败时那份 snapshot 是**磁盘旧行**；全仓另有 13 处丢弃其返回值的调用点。
于是「放回内存」的修补只活到下一次任意落盘，无人补救。
z7 已按同形补了 `refreshRemoteWithdrawals` 与 `advanceWithdrawalArrival` 两处基准还原，
但**根治要改 `persistAccountSnapshot` 自身的契约**（它的类型还声明成 `() => void`，与 boolean 实现相反）。

---

## 其余：R3 报回 56 条 P2

完整清单在审计输出里，本轮未逐条处理。其中与 z7 直接相关、已在包内修掉的见变更提案；
与提现链相关但属上面各卡范围的，随卡带走。
