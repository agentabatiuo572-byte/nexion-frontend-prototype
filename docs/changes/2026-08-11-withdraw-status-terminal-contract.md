# 提现回查契约补终态原因与可重试标记 + 把回读链路焊进机器门

- **状态**：**Shipped**（2026-08-12 合入主线 `67dc757`；PRD §9.3.6 已同步）· 三轮独立审计（R1 42 agent / R2 6-of-117 撞额度 / R3 43 agent 完整）
- **范围**：主人 2026-08-12 拍板 **收窄回卡片范围** —— R1 起我把「提现单合并仲裁」一并重构了，
  R3 证明那次重构自己产出 3 条 P1（未校验的设备时钟可永久钉死单据 / 整行覆盖抹掉原因 / 在途闸跨端无效且无超时兜底）。
  已**撤回**该重构（时间戳与在途闸整个移除），只保留「同状态两份快照按字段合并」这一窄修。
  拆出去的卡见 [2026-08-12-z7-spun-off-cards.md](2026-08-12-z7-spun-off-cards.md)（5 张，含证据）
- **包分支**：`pkg/z7-withdraw-status`（worktree `.claude/worktrees/z7-withdraw-status`，基线 `UniApp` @ b96db89）
- **定级**：L（钱 · 状态机 · 契约 · 三语文案）

## Why

立卡描述是「客户端没有任何按单号回查提现状态的接口」。**回源后该描述在主线不成立**：
`withdrawalApi.get()`、消费者 `app.refreshRemoteWithdrawals()`、调用点 `App.vue` 三件都在，
2026-08-11 由 `36209f6` / `d5da9af` 落地。立卡时工作树站在 `pkg/z5-withdraw-debit`，
那条分支落后主线 9 个提交，在它上面看句句属实。

回源反而暴露了三个**主线上真实存在**的缺口：

1. **门守错了层**。全仓唯一守这条链的断言是 `typeof app.refreshRemoteWithdrawals === "function"`
   （`remote-authority-simulation.test.mjs`）。它只证「函数存在」，不证「真被调用、返回值真被消费」。
   **红测实测**：把 `App.vue` 的调用行换成 `void Promise.resolve([])`，contract-suite 仍 40 pass / 0 fail。
   调用点被摘掉 = 在途单永不终结 → 换绑入口与下一笔提现被永久拦死，而所有门全绿。
2. **状态映射漏了后台真会产生的终态**。后台 D2 的状态表含 `TX_ORPHANED` / `DEAD`（孤块/死亡信件），
   客户端 `canonicalStatus` 两个都不认 → 抛 `WITHDRAWAL_STATUS_INVALID` →
   `withdrawalApi.get().catch(() => null)` 静默吞 → **这一单永久停在「处理中」**。
   立卡描述的症状在主线上以这个窄口径真实存活着。
3. **契约缺终态原因与可重试标记**。快照只有 单号 / 状态 / 到账时刻。失败单在追踪页只有一句
   「审核拒绝」，没有原因；「再提一笔」的置灰只看本地日限，不看服务端判定。

## What changes

契约（`src/api/withdrawal-api.ts`）：

| 字段 | 线上名 | 类型 | 语义 |
|---|---|---|---|
| 终态原因 | `terminalReason` | 闭集 \| null | 仅终态有值。**码表与后台 D2「拒绝原因码」下拉同源**，不是本仓自造 |
| 可重试 | `retriable` | boolean \| null | 服务端判定「用户能否就这笔重新发起」。null = 不适用/未给 |

终态原因闭集（ground truth = `admin-ops/app/components/domain-views/d-tabs/d2-withdrawals.tsx`）：
`RISK_HIT` · `ADDRESS_RISK` · `DATA_MISMATCH` · `USER_CANCELLED` · `OTHER`
→ 客户端归一成 kebab-case，与 `canonicalStatus` 同套路。

状态映射：`TX_ORPHANED` / `DEAD` → 归到既有 `tx-failed`；`PENDING` → 归到 `submitted`
（R1 审计 P0：`PENDING` 是后台 D2 里 `SUBMITTED` 的别名，同一张表、同一个 switch，首版只补了孤块那两个没扫全）。
**不新增客户端状态值** —— 对用户而言都是「转账没走成」，归到 `tx-failed`
即刻接上既有的失败终态处理（账单结算成失败 + 客服出口）；新增状态要动 6 处枚举与三语文案，
零用户可见收益。

⚠️ 首版这里有两句话说满了，已在代码注释与本段一并改正（R1 复核自查）：
- 「即刻接上既有的**退款**全套」——退款有**两条腿，状态不同**（2026-08-12 并入 z5 后复核）：
  USDT 本金腿已由 z5 改走 `refundWithdrawalDebit`（无远端早退），**remote 下会真退**；
  NEX 抵扣费腿仍走 `creditRewardBucketOnce`（remote 下恒 false），**仍是空转**，归 z6。
  因此本包只声称账单与客服出口，不替 NEX 那条腿打包票。
  ⚠️ 本条首版写的是「整条退款腿都空转」—— 那是 fork 时的事实，并入 z5 后已过期，已改。
- 「孤块与死亡信件的区别由 `terminalReason` 承载」——**闭集里没有对应档位**。
  `terminalReason` 承载的是「为什么终结」（风控 / 地址 / 资料 / 撤回 / 其他），
  不是「哪一种链上失败」。用户侧两者本就同一句话；要区分得先在后台加码，属新契约。

消费者（都是既有渲染面，不新建 UI）：
- 追踪页失败态正文：从静态一句话改成「服务端给的原因 + 下一步」
- 「再提一笔」：**不动它**。`retriable === false` 只在这笔单的详情里如实说明并把客服入口摆在同一屏
  （R1 审计 P1：`retriable` 是**单据级**结论，「再提一笔」是**账号级**动作；失败单永久留存 +
  终态不再回查 → 拿它置灰会让一张历史废单把入口永久锁死。首版就是这么写的，已改）

机器门：
- 新增 `scripts/withdraw-status-mirror-runtime.mjs`（真页面 · 真 store · 只桩 transport）：
  守**调用 + 消费 + 落地**，红测自证（摘掉调用点必红）
- 新增 `scripts/withdraw-terminal-reason-parity.test.mjs`:逐值比对客户端**原因码与状态码**与后台 D2 两张表
- 加强既有 `scripts/spec4-account-cloud-merge-check.mjs`:补同状态字段合并双向 + 双方都有值 + 档位不等两方向,共六格(它此前只测赢的一侧)

### R2/R3 审计后:先加后撤 —— 合并仲裁重构已移出本包

R1 我把 `mirroredAt`(最后镜像时刻)当平局裁决,R2 证明只修好 1/3(降档三条边仍丢),
于是 R3 前我把它升成主判据「有真信号就不看档位」。**R3 把这次升级本身打回三条 P1**:
设备墙钟未校验(偏前一小时即可永久钉死单据)· 整行胜者通吃抹掉败方的终态原因 ·
在途闸是 store 实例级(跨标签页无效)且无超时兜底(一次不返回的请求让本会话回读永久停摆)。

主人 2026-08-12 拍板 A:**撤回整块仲裁改造**,只留下 z7 自己那条缺陷的窄修 ——
**同状态的两份快照按字段合并**(谁有值取谁,双方都有以内存为准),不引入任何时序字段。
这样 z7 的两个新字段照样落得了盘,而三条 P1 是**从构造上不存在**,不是被修好。
代价:「frozen 与四个终态同档 → 冻结单收不到最终结论」这条**主线既有缺陷**在本包内仍存在,已独立立卡。

### R2 审计后追加(历史记录:R1 的修补只补了一半 —— 同族第二次)

R1 我把 `mirroredAt` 当成**档位制度内部的平局裁决**,主判据仍是档位。探针实跑证明只修好了 1/3:
frozen→refunded / tx-failed(平局)通了,而 frozen→processing / sent / confirmed(降档)三条边
**仍全被丢弃** —— 后台核查通过、把冻结单放行回主链的每一次都进不来,坏结局反而走得通;
反向一份陈旧的高档内存行还能把磁盘上更新的 confirmed 顶回 frozen。

根治(结构性反思结论):**有真信号时替身一律不参与裁决** ——
任一侧被镜像过就纯按镜像时刻裁决、**完全不看档位**;两侧都没被镜像过才回落档位。
档位从此只是兜底,「frozen 排第几」不再有后果。

同轮另修 4 条 P1:
① 回读加在途闸(两拍叠加时迟到的旧结论会带更大时间戳赢下裁决);
② 补丁基底取 await **之后**的当前行(陈旧整行覆盖会抹掉并发写入的原因/可重试,且终态后永久补不回);
③ 落盘失败时**基准一起还原**(只还原内存 = 下次资金写失败会按被污染的基准把单据抹掉),
   同形的 `advanceWithdrawalArrival` 一并补;
④ 原因码补类型闸(原来 `String(值)` 会把 `{}` 吞成 other、把 `["RISK_HIT"]` 当成合法码)。

### R1 审计后追加(同根三条 P0)

账号快照三路合并对提现单的胜负判据原本**只有状态档位**,而档位是「谁更新」的替身:
frozen 与四个终态同档 → 冻结单的每一条出边都被丢弃(退款永不触发 + 单槽永久占用);
状态没变只改字段 → 平局丢弃 → **本包新增的两个字段在运行时零生效**。
根治:给单据加 `mirroredAt`(回读时刻),平局按「谁问服务端问得更晚」裁决。
存量单两边都没有该时刻 → 仍留磁盘值,不造回归(已在 merge 门里钉住)。

### Out of scope

- 不动 z5 / z6 两条在飞包的territory（`applyWithdrawalDebit` / NEX 退还契约）
- 不改 `.catch(() => null)` 的静默吞：它对网络抖动是对的；协议错该不该上报是独立议题，记 HANDOFF
- 不新增重试按钮 —— 追踪页已有「再提一笔」，只给它加一个判据源

## Impact

- 页面：`wallet-withdraw-tracking`
- store：`app.refreshRemoteWithdrawals` 多带两字段落盘；`types.ts` 的 `Withdrawal` 加两个可选字段
- i18n：三语（en / zh / vi）各加 5 条原因文案 + 1 条不可重试理由
- PRD：提现在 §9.3(§9.4 不是提现章节,首版锚错了);两个新线上字段、以及 PENDING / TX_ORPHANED / DEAD 三个状态别名待补进 PRD
- 不变量风险：三语镜像、码表跨仓 parity、终态判定不得被新字段改变

## Done-when（P6 逐条回测）

1. 摘掉 `App.vue` 里 `refreshRemoteWithdrawals` 的调用行 → 新 runtime 门**必红**（红测自证）
2. 服务端回 `TX_ORPHANED` → 单据落到 `tx-failed`（不再永久停在「处理中」），且账单行结算为失败
3. 服务端回 `status=REVIEW_REJECTED, terminalReason=RISK_HIT, retriable=false` →
   追踪页显示该原因的业务话术（非原始码）+ 「这笔不能再发起」的说明，且「再提一笔」**不被置灰**
4. 客户端**原因码与状态码**均与后台 D2 两张表逐值相等；任一侧改动 → parity 门必红
5. 状态没变、只补上原因的那一拍必须**穿过三路合并**落盘，且**已落盘的原因不许被抹掉**（双向；改回整行择一 → 门必红）
6. 三语 key 镜像门过；`npm run type-check` 0 错；`bash scripts/verify.sh` 全绿
   
   ❌ **不在本包 Done-when 内**（收窄后移出，见拆出去的卡 1）：「已落盘的冻结单收到终态结论必须进得来」。
   本包不声称它成立，机器门里也**没有**断言它 —— 门断言一个当前不成立的行为 = 把缺陷焊成规格。

## 实施拆解

- [x] **T1 契约**：`withdrawal-api.ts` 加 `WithdrawalTerminalReason` / 两字段 / `TX_ORPHANED`·`DEAD` 映射 /
      `parseStatusSnapshot` 向后兼容（字段缺省 → null，类型错 → 抛 protocol）
      · AC = Done-when 2；tester 用喂报文的方式逐形态验
- [x] **T2 落盘**：`types.ts` + `app.ts` 把两字段带进本地单据并落盘 · AC = 刷新后仍在
- [x] **T3 文案**：`risk-reason-text.ts` 加 `terminalReasonLine()`（未知码回落通用话术，**不静默吞行**）
      + 三语 key · AC = Done-when 3
- [x] **T4 消费面**：追踪页失败正文 + 「再提一笔」判据 · AC = Done-when 3（敏感：动的是钱路径出口，加 code-review）
- [x] **T5 runtime 门** + 注册 verify.sh · AC = Done-when 1（红测留证）
- [x] **T6 parity 门** + 登记 run-contract-suite REGISTRY · AC = Done-when 4
- [x] **T7 收尾**：后端交接书记服务端义务 + 产品更新日志 + 拆出去的卡落盘 + 结构性反思两族
- [x] **T8 合并顺序核实**（收窄后新增）：R3 说「合并后隔壁包的门会变假绿」，我一度写成
      「z7 合并前必须先修它」—— **回源核实后这句是错的**：那道门（`selfcheck-withdraw-nex-refund.mjs`）
      **不在主线上**，只在 `pkg/z8-refund-ts` / z6 分支。所以它**不挡 z7**；
      风险发生在 **z8 合并那一刻**（它的门落到一个已经有本包文件的主线上，
      split 判据会把 `parseSubmission` 里的 `rawNexRefunded` 当成回查面的证据而报 PASS）。
      → 已记进拆出去的卡 3 与 `docs/PORT-PITFALLS.md` P-084，供 z8 合并时查到
