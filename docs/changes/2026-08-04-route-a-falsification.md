# 完全版 A 方案 · 证伪台账(2026-08-04)

对象:`2026-08-04-route-a-design.md`(尚未实施)。**动手前证伪修法,不是事后验收成品。**

镜头1(原子性与失败面)已回报,结论:**核心断言不成立**。镜头2(节流热路径)、镜头3(迁移消费者)待回。

---

## 一、方案被推翻的那一条(P0-1,最致命)

> 方案写:「账单并入快照后,资金变更与收据**一次写盘 = 原子**」,同时又写「资金原语……**不动**」。
> **这两句互斥。**

- `src/lib/money-receipt.ts:137-143` —— 收口点是**逐腿调资金原语的循环**:`debitNex` / `debitBalance` / `creditNex` / `creditBalance`;
- 四个原语**各自内部落盘**:`app.ts:920` / `:943` / `:958` / `:973`(每处 `if (!persistAccountSnapshot())`);
- ⇒ **多腿交易今天就是 N 次 CLOUD_KEY 写**。并表只是把账单那次写也打到同一个 key,**次数不变**。

**仓内活体反证**:`scripts/selfcheck-money-receipt.mjs:359`
```js
failKey = (k, n) => k === CLOUD_KEY && n === cloudWrites + 2; // 放行第一腿,炸第二腿
```
这条**正在跑的绿色断言**直接证明两腿交易 = 两次 CLOUD_KEY 写。我写方案时没查它。

**并且并表后会比今天更差**:今天两次写落在两个 key 上,第二次失败时 `bills.addMany` 返回 null、调用方看得见;并表后两次失败在存储层**无法区分**,而唯一能区分它们的补偿被方案删掉了。

多腿不是边缘情况,现役 ≥5 处:`wallet-exchange.vue:436` / `weekly-quest-hero.vue:170` / `achievements.vue:193` / `share.ts:194` / `wallet-cards-new.vue:195`。

---

## 二、其余 P0(逐条待我回源复核后才采纳)

| # | 断言 | 依据 |
|---|---|---|
| P0-2 | 唯一能做到「一次写」的排法(先把账单塞内存再动钱),会造出今天**结构上不可能**的新状态:**磁盘上 N 条收据 + 只动了一腿的钱**。`money-receipt.ts:149` 的 `restoreMoney` 只还钱,不删已上盘的账单行 | `money-receipt.ts:137-152` → `:154` 账单严格在全部资金腿之后 |
| P0-3 | **`adoptAccountSnapshot` 不恢复账单** —— 它只写 `user/devices/earnings/withdrawals`;账单在另一个 store,而架构铁律 P-031 是「store 互不 import」。方案「内存回滚一次到位」按当前代码**是假的**,九条失败路径全中;`app.ts:1145`/`:1379` adopt 的还是**磁盘**快照,会抹掉内存里未落盘的账单 | `app.ts:393-402`(无 bills 赋值)· `bills.ts:134-138` · `docs/PORT-PITFALLS.md:220` · 15 个 adopt 调用点 |
| P0-4 | **跨账号写 `addForAccount` 并表后只能整行覆盖别人的快照** —— 三路合并要 `base && latest`,而 base 是**当前账号**的 `lastCloudSnapshot`,外账号没有 base → 走整行覆盖 → 抹掉那个账号的 user/devices/earnings/withdrawals。今天这条路的爆炸半径只有账单表 | `bills.ts:160-169` · 消费者 `wallet-withdraw.vue:1001/1011` · `account-cloud.ts:410-424`(`:416` 的分支) |
| P0-5 | **`clampAccountFundInvariants` 会在同一次写盘里改钱**,而收据不跟着改,`persisted` 仍返回 true → 「同一次写盘 ⇒ 资金与收据必然一致」被从内部证伪。它的注释自陈存在理由正是「多端并发扣款合并后扣穿为负」——**设计上会发生,不是理论可能** | `account-cloud.ts:379-400`,调用于 `:417`,返回值 `:422` 不含 clamp 信息 |

---

## 三、P1(实质漏洞)

| # | 断言 | 依据 |
|---|---|---|
| P1-1 | `mergeArrayByIdentity` 与「rank 单调」**互斥**,方案 §三 同时写了两句。前者同 id 走 `mergeFieldByDiff` → 字符串字段落到 last-write-wins;且遇无 `id`/`ts` 直接 `return null`(方案没说 null 怎么办);且**不排序**,而 `recomputeBalance` 期望 ts 倒序 → 新账单掉到列表末尾 | `account-cloud.ts:193-219`(`:195`/`:199`/`:210-212`/`:272`)· `bills.ts:118-120` |
| P1-2 | §四 迁移伪代码**原样搬 `balanceAfter`,把已修的 P0 放回去**。hydrate 本来会剥掉它(注释记录实测盘上 `balanceAfter: 60.3065` 而真实余额两万四) | `bills.ts:126-129` · 渲染面 `wallet-bills.vue:71-74` |
| P1-3 | `createSeedSnapshot` 没有 bills → 新账号「有没有 40 条种子账单」取决于哪个 store 先落盘 = 未定义行为 | `app.ts:207-218` · `bills.ts:122-132` |
| P1-4 | **保留 `restoreMoney` 不足以覆盖「钱动了但业务没成」**,三处不够:①`weekly-quest-hero.vue:160,170` 与 ②`achievements.vue:187,193` 先消费资格再记账、失败只 return 不回滚;③`App.vue:285-293` 的 `markFired` 丢弃 persist 返回值 + `postMoneyBill` 走非幂等 `addMany` → **下一拍 4s 后同一里程碑再发一次 NEX + 再写一条账单(重复发钱)**;④`wallet-withdraw.vue:949-1023` 账单由页面在 store 返回**之后**写,失败只弹 toast、零回滚 —— 改动① 够不到 | 见各行号 |
| P1-5 | 节流后 `appendLedgerEntry` 仍每拍落盘,与桶余额脱节;强杀后重开按旧锚点补齐会**再 append 一次**(台账重计)。缓解:`applyReleaseOutcome` 有 clamp 不会多放钱,但阈值判定看到虚高台账 | `app.ts:631-632` · `earning-release.ts:115-127` |
| P1-6 | 墨菲① 判据**只数写不数读**。一次 persist 实际是 **3 读 1 写**,且 `readTable()` 每次 `JSON.parse` **整张表(全部账号)**。我的基线脚本只插桩了 `setStorageSync` | `account-cloud.ts:415`/`:153`/`:155`/`:419` · `measure-persist-cost.mjs:34-39` |
| P1-7 | clamp 之后 `moneyApplied` 记的是「打算动的」不是「真动的」(`applied` 在 persist **之前**取,而 clamp 在 persist 内部)→ 之后的冲正**退多了**。既有缺陷,但方案把 `restoreMoney` 变成唯一剩下的防线,它就成了承重件 | `app.ts:917-924` · `:1005-1012` · `:418` |

---

## 四、P2

- **P2-1** `mockServerId` 碰撞(自述 ~1/10000 同毫秒内)会让 `account-cloud.ts:208` 的 `if (!hasBefore && hasCurrent) return;` 静默吞掉一条收据 —— 足以证伪方案「结构上**不可能**发生」这句绝对措辞。
- **P2-2** `settleByRef` 只推进 `pending`,已 `posted` 的行永远翻不成 `failed` → `App.vue:98-102` 每 5s 永久空转。**今天不可达**(无 client 路径写那四个失败终态),接后端即可达。
- **P2-3** 老表键名会成为第二处真理源:`account-cloud.ts` 必须 value-import-free,只能把 `"nexgrid-bills-accounts-v1"` 再写一遍字面量。
- **P2-4** §四「覆盖全部账号」**不成立**:`readAccountSnapshot` 在 `row.schema !== 1` 时返回 null → 有账单行但无云快照行的账号,迁移代码根本跑不到,账单静默丢失。
- **P2-5 行号勘误(方案里我写错的)**:`settle()` 调用点是 `app.ts:547` 不是 `:622`;`phoneFactor` 在 `:251-256` 不是 `:253-258`;`addForAccount` 函数体在 `bills.ts:160-169`;R5 反思文档里说 `restoreMoney` 返回值丢弃在 `money-receipt.ts:98/106`,现在是 `:149/:157` **且已被消费**。

---

## 五、核实为**真**的方案断言(证伪层自己确认的)

1. **§零 前提推翻成立** —— `app.ts:139-142` 确实在 withdrawable 路线直加 `usdtBalance`/`nexBalance`,由 1 秒 tick 驱动。
2. **§二 节流不丢钱的承重论证成立**(逐行核过)—— 且补了一条我没写的证据:`syncDeviceRuntime`(`app.ts:384-385`)在装载时把 `lastTickAggregate` 重新钉到载入设备的 `todayEarnings`,所以重开后的一次性补齐与聚合增量口径一致。
3. **§二 行为差异声明属实**,影响面与量级描述准确。
4. **§三「加类型不加字面量会被静默抹掉」为真**,且首写确实看起来完全正常。
5. **§六 爆炸半径清单基本准确**,并补了确切行号:`selfcheck-money-rollback.mjs:309` pin 了 `app.restoreMoney(` **恰好 3 次**、`:301` pin 了 `consumed === 2`;`selfcheck-money-receipt.mjs:339-340` pin 了 `writesTo(BILLS_KEY) === 1`。
6. **`restoreMoney`/`captureMoney` 本身不能删 —— 真**(`checkout.vue:762-776` 直接用,不经收口点)。
7. **§七「账单不能当唯一真相」—— 真**(`bills.ts:105-120` 记录了实测 400 倍差)。

---

## 六、修正方向(等其余镜头回齐后定稿,先记结论)

证伪指出的根本问题是:**原子性的单位被定错了**。

方案把单位定在「存储键」(合表 ⇒ 一次写),但真实的单位是「**一笔交易**」——而今天每个资金原语**各自落盘**,所以一笔多腿交易天然是 N 次写。合表不改变这一点。

⇒ 正确的方向是**引入显式的事务边界**:让资金原语在事务内**只改内存不落盘**,由收口点在末尾做**唯一一次** commit(账单此时已在同一份快照里)。回滚 = 恢复那份内存快照(含账单)。

这比原方案改动大,且必须同时解决:
- 账单内存态要能被 `adoptAccountSnapshot` 恢复(P0-3);
- 跨账号写不能走整行覆盖(P0-4);
- clamp 必须可观测(P0-5);
- 收口点够不到的四处(P1-4)要各自补或明确写进覆盖边界。

**未定稿,等镜头2/3。**

---

# 证伪镜头3(迁移与消费者面)· 回报

**结论:方案不能照现状实施。** 三处结构性不成立 + §六 机器门清单漏 6 个脚本(其中 1 个会直接崩、1 个会变成永久假绿)。

## P0

| # | 断言 | 依据 |
|---|---|---|
| P0-1 | **方案通篇没说「账单在内存里归谁」**,而这决定原子性能否成立。§三 只警告了 `mergeAccountSnapshots` 一个字面量,**漏了两个同型的**:`persistAccountSnapshot`(`app.ts:407-416`)与 `createSeedSnapshot`(`app.ts:207-218`)。漏 persist 那处 → 每次落盘写出 `bills: undefined` → 迁移判据 `!Array.isArray` 重新成立 → **下次读盘把老表陈旧账单搬回来**。症状不是「账单没了」,是**「账单时间倒流」,比丢失更难查** | app.ts 现在不持有 bills 数组(在 `bills.ts:138`);技术上可 import(已 import `useConfig`/`useReceipts`,不成环)但必须写进方案 |
| P0-2 | **与镜头1 独立撞上同一条**:多腿交易资金腿仍逐腿各落一次盘,`money-receipt.ts:149` 的 `restoreMoney(undo)` **不能删**;「整条补偿链可删」只对 `:157` 那一处成立。现成的门会喊:`selfcheck-money-receipt.mjs:339-340` 断言「两条分录一次落盘」,改口径成 CLOUD_KEY 后实测值是 **3 不是 1** | |
| P0-3 | **迁移不覆盖全部账号**:`readAccountSnapshot` 无快照行时返 null,方案伪码照字面实现 `row` 为 undefined **直接 TypeError**;加守卫则迁移不发生。而 `app.ts:434` **无条件** persist → 一旦写出 `bills: []`,判据永久满足 → 老表账单**永远搬不进来,零报错**。可达路径:account-cloud 表比 bills 行大一个量级,配额压力下 `writeTable` 先失败并**静默返回 false**,盘上就是「有账单行、无快照行」 | `account-cloud.ts:121-125` · `app.ts:207-218` / `:424` / `:434` |
| P0-4 | `addForAccount` 在新结构下**没有安全落法**:搬进快照 = 盲覆盖别人整行(无三路合并、无 CAS,因为对别人的账号既无 base 也无内存态)。爆炸半径从「对方账单行」放大到**对方余额/设备/提现单整行** | `bills.ts:160-169` · 调用点 `wallet-withdraw.vue:1001/1011` · 固定靶 `selfcheck-withdraw-freeze.mjs:279-299` |
| **P0-5** | 🔴 **§二 承重论证漏了 settle() 同一拍写的另外两张表** —— `appendLedgerEntry`(`app.ts:632` → `earning-release.ts:106-128`)**当场落盘且没传 idempotencyKey、走随机 id、无去重**;`recordAttestation`(`app.ts:593` → `risk-identity.ts:241-243`)同样当场落盘。节流后窗口内被强杀 → 重开按旧锚点重新计价 → **同一段墙钟再写一次台账、再记一次见证**。台账驱动释放判定与簇熔断,见证驱动 attest 阈值。⇒ 节流不是「分币级」,是**把释放引擎的输入窗口放大 10 倍**。**这条不解决就别上节流** | |
| P0-6 | §五⑤ 拟焊的门对「用户动作把落盘**委托给** settle()」失明 —— `addComputeShareDevice` 成功路径末尾是 `settle()`(`app.ts:782`)不是直接 persist | |

## P1(择要)

- **P1-1 §六 漏了 6 个脚本**:`selfcheck-withdraw-freeze.mjs`(把 account-cloud 整个 stub 成只有 `normalizeAccountKey`,bills.ts 一取其它导出**直接崩**;且是全仓唯一 `seed()` 调用者 + `addForAccount` 固定靶)· `selfcheck-fastlane.mjs:748-752`(pin bills.ts 源码文本)· **`spec6-entry-surface-runtime.mjs:34,38`(单取老表 key → 老表不再被写 = 该断言恒不命中 = 永久假绿)** · `measure-persist-cost.mjs`(判据①的测量工具自身)· `verify.sh:1196` · `selfcheck-trial-encapsulation.mjs:49-50`
- **P1-2** `selfcheck-money-receipt.mjs` 的 ②/⑦ 在新结构下**无法表达**(靠 `failKey` 区分两个 key 注入);且「最省事的修红写法会把门变成空转」(`:206` 的反向断言会因「什么都没写成功」恒真)。另 `reset()` 里 persist 在 `bills.bills = []` **之前**,合表后盘上留 40 条种子 → 一串「一条不留」断言全错
- **P1-3** `mergeArrayByIdentity` 与 `mergeWithdrawals` 语义不兼容(前者同 id 走三路合并 → 字符串落 last-write → `posted` 会被退回 `pending`);两者**都没有删除语义**,而 `bills.seed()` 是整表替换 → 合并后变成「40 条新种子叠加在旧账单上」
- **P1-4** 「老表只读」在 bills.ts 里做不到一半:**11 个**(不是 3 个)`app.bindAccount` 调用点全是 app 先、`rebindAccountScopedStores` 后
- **P1-5** §四 的幂等只在「每次落盘都带 bills」前提下成立,而这个前提**没有门守**;三处字面量必须同步(方案漏了第三处)
- **P1-7/P1-8** 全部消费者会因 `adoptAccountSnapshot` 整体替换数组引用而整树重渲染;且 `reconcileBills` **每 5s** 最多 5 次 `settleByRef`、每次一落盘,与判据①「每分钟总字节必须低于改前」**直接冲突**;而「静置 60 秒」的测法**测不到这条路径**(没有在途提现)

## P2(择要,含对我的两处纠正)

- **P2-1 我对沙箱的描述理由是错的(结论对)**:`vm.runInNewContext` 创建的是**带完整 ES 内建的新 realm**,sandbox 对象只是追加;实测 `Set/Object/Array` 全在(反证现成:`account-cloud.ts:33,54` 本来就在用 `new Set`)。真正缺的只有 `uni` 与 `process`。实测四格:顶层值导入 → **MODULE_NOT_FOUND 门直接崩**;`import type` + 加字段 → OK;读老表**包 try/catch**(照 `readTable()` 的形)→ **不炸**;不包 → `ReferenceError: uni is not defined`。⚠️ 最后一格今天照样绿,因为门从不调 `readAccountSnapshot` —— 一旦补 bills 用例走 `mergeAndWriteAccountSnapshotResult`(它在 `:415/419` 调两次)当场炸
- **P2-2** `selfcheck-money-cas.mjs` 的 `bills-stub` / `__fakeBills` 是**死代码**(filter 只匹配相对导入 `./bills`,而实际走 `@/store/bills` 别名 → 解析成真 bills.ts),而 `verify.sh:2346` 的注释仍宣称 bills 被换成了可观测假账本 —— **一条既有假绿**
- **P2-4** §二「一次补齐」是**期望值相等不是恒等**(`settleDevice:249-250` 每次抽随机 `marketMult`/`variation`,十次 1 秒 ≠ 一次 10 秒,均值同方差不同)
- **P2-5** `lastTickAggregate` 的再播种依赖 persist→adopt 往返,节流改变其节奏;多标签页下别人的 `todayEarnings` 进来的时机从「每秒一点」变「10 秒一块」,**从没有固定靶证明过**

## 它替我否掉的一条派单假设

两张表的账号 key 归一化**完全一致** —— `account-scoped-storage.ts:1` 直接 import `account-cloud` 的 `normalizeAccountKey`,同一个函数。我派单里「逐个读出来比对,不一致就是迁移错位」的怀疑**不成立**。

---

# 修正方向(累计三个镜头,已能定形)

**① 原子性**:两个镜头独立撞上同一条 —— 必须引入 **app 层的单次事务 action**(一次算完全部腿的 delta + 全部分录,只落一次盘),否则合表毫无意义。这与 `feedback_use_the_store_own_action` 的张力要显式论证。

**② 节流:拆成两半,只取安全的那半**
- ⚠️ **[2026-08-05 已撤销,本条结论作废]** ~~**内容没变不写(脏检查)** —— **行为中性**:快照没变才跳过,跳过时 `appendLedgerEntry`/`recordAttestation` 那一拍本来也没有新分录。单独就砍掉实测 31/60 次空写(52%)。~~
  **作废理由**:① 真浏览器实测**净亏 18.8×**(判据 1176µs/拍 vs 省下 62.5µs/拍;`setItem` 105KB 只要 96.7µs——写盘不是贵的那头,本文当时用的 Node harness 把它做成了 `Map.set`);② 「行为中性」被独立证伪推翻——跳过写等于连内存新值一起丢弃,且排除名单无门可守。见 `2026-08-04-route-a-design-v2.md` §改动⑤ 与 commit `840cc45`。
- ❌ **时间节流(10s)** —— 被 P0-5 毙掉:另外两张表不节流且台账无幂等键,会造成释放引擎输入重复计数。要上必须先给 `appendLedgerEntry` 焊幂等键并与快照同拍原子,那是另一个工程。**本轮不上。**

**③ 账单 owner** 必须先定死(P0-1),且三处字面量同步要焊门 + 红测(摘掉任一处的 bills 行,门必须红)。

**④ 跨账号写** 另给窄原语走 CAS,禁止 `writeAccountSnapshot`。

**⑤ 机器门清单** 从 6 个补到 12 个,其中 `spec6-entry-surface-runtime.mjs` 必须同步否则永久假绿。
