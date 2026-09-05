# T9 独立验收 · 提现单据「单槽 → 列表」结构性改动

**验收方**:独立 tester agent(实现方 ≠ 验收方) · **纪律**:只实测不看实现叙述,只报不修
**环境**:dev :5173(全程未重启 / 未杀 node) · `?nx_device=off` · Chromium headless
**探针**:4 轮自建黑盒探针(store 生产 action + 真页面 DOM),脚本在会话 scratchpad,未落进本仓库

---

## 一句话结论

**模型层改对了,消费者层没改全。**
「多笔并存 / 老数据升级 / 跨端合并 / 风控单不推进 / 人工审核单不再锁死」五项**全部实测通过**。
但**三个消费者仍在问 `latestWithdrawal`「只有整张列表才答得了」的问题**,产生 3 个可复现缺陷 ——
其中 1 个把账单台账**双向写错**(该记的不记、不该记的记上)。

三个缺陷是**同一个根因的三种形态**,且**都是本次改动新打开的**:
改动删掉了「在途不许再提」那道闸(AC#4,符合预期),于是「一张在途单 + 一张更新的已到账单」这个
组合**第一次变得可达**;而三处消费者的写法在单槽时代恰好是对的,进了列表时代就全错。

---

## 大白话

| 做了啥 | 结果咋样 | 要主人拍板啥 |
|---|---|---|
| 连提两笔,看两笔在不在、钱扣没扣 | ✅ 两笔都在(内存+落盘),钱正好扣两笔之和 | — |
| 早的先到点、晚的后到点,看是不是各推各的 | ✅ 单据状态各推各的,**没有**只推最新那笔的问题 | — |
| 顺带看账单页跟不跟得上 | ❌ **到账那笔的账单行永远停在「处理中」;还在处理的那笔反被标成「已入账」** | **F1:改不改** |
| 灌一份老格式数据再打开 | ✅ 老单据保住了,自动升级进列表 | — |
| 首提 $80 转人工审核后还能不能再提 | ✅ 能提,按钮没被锁死(真点真输实测) | — |
| 人工审核 / 冻结 / 延迟的单过点 5 天会不会自动到账 | ✅ 一律不动,余额分毫未变 | — |
| 两个标签页各建一笔 | ✅ 两笔都保留(单槽版这里会互相顶掉) | — |
| 那张在途的人工审核单,用户还找不找得到 | ❌ **钱包页入口消失、追踪页也看不到它**(只剩账单页一行流水) | **F2:改不改** |
| 在途人工审核单还在时,能不能换收款地址 | ❌ **能换**(正向对照下是拦住的) | **F3:改不改** |

**主人可自验(3 步)**
1. 开 `http://localhost:5173/?nx_device=off#/pages/me/wallet-withdraw`,先提一笔 **$80**(超 $50 免审线 → 转人工审核)。
2. 把后台每日笔数上限调大后再提一笔 **$30**,等它到账。
3. 回钱包页 → **那张 $80 的在途单已经从页面上消失了**;进「换绑收款地址」→ 本该被拦,现在能进。

---

## 墨菲清单(动手前先列「最可能崩的点」)

| # | 动手前的预判 | 实测结果 |
|---|---|---|
| M1 | 「有没有在途单」这类问题还在读 `latestWithdrawal` | ✅ **中**(F3) |
| M2 | 到账推进只推最新一笔 | ❌ 未中 —— `advanceWithdrawalArrival` 是全表扫,实测正确 |
| M3 | 账单结算跟着 `latestWithdrawal` 走,推进的和结算的不是同一笔 | ✅ **中**(F1,最严重) |
| M4 | 老快照升级只挂在某一条读盘路径上,别的路径丢数据 | ❌ 未中 —— 所有读盘都走 `readAccountSnapshot`,已实测 |
| M5 | 展示面只展示最新一笔 → 旧的在途单不可达 | ✅ **中**(F2) |
| M6 | 跨端合并把两端各自新建的单互相顶掉 | ❌ 未中 —— 按单号取并集 + 状态 rank 单调,实测两笔都留 |

---

## 机器门

| 门 | 期望 | 实测 | 结论 |
|---|---|---|---|
| `npx vue-tsc --noEmit` | 0 错 | 0 错(exit 0) | ✅ |
| `bash scripts/verify.sh all` | 362 pass / 0 fail | **362 pass / 0 fail** | ✅ |
| `node scripts/selfcheck-fastlane.mjs` | 88 pass / 0 fail | 88 pass / 0 fail | ✅ |
| `node scripts/selfcheck-arrival.mjs` | 68 pass / 0 fail | 68 pass / 0 fail | ✅ |
| `node scripts/spec4-account-cloud-merge-check.mjs` | PASS | PASS | ✅ |

⚠️ **verify 首跑 361 pass / 1 fail**(与另外三个 node 自检并发跑时)。清场后串行复跑 = 362 / 0。
首跑输出被我自己的 `| tail -30` 截断,**失败项身份已不可考**。按「并发下的抖动」记录,
**不作为缺陷**,但值得留意:verify 在有其它进程抢 dev server 时会假红。

---

## 行为验收逐条

| AC | 判据 | 裁决 | 运行时证据 |
|---|---|---|---|
| **1** | 两笔并存、都查得到、钱都扣 | ⚠️ **部分** | 内存 `["WD-…-4154","WD-…-7719"]`、落盘同为 2 笔;余额 24856.56 → 24786.56 = **正好 −70**(两笔 $30+$40)。**但「都能查到」只在账单页成立**,状态追踪面查不到旧单 → 见 F2 |
| **2** | 各自到点各自到账,不是只有最新那笔推进 | ⚠️ **部分** | 单据状态:早单(ETA +1h)经 App 层 5s 轮询变 `confirmed` 且 `confirmedAt` 已记,晚单(ETA +24h)仍 `submitted`;时钟再推到 +25h 后晚单也 `confirmed`。**状态推进完全正确**。**账单行跟不上** → 见 F1 |
| **3** | 老格式快照(只有 `latestWithdrawal`)升级不丢单 | ✅ **通过** | 注入无 `withdrawals` 数组的老行 → 整页重载 → 内存 `[{id:"WD-20260101-9999",amount:88.88}]`,落盘已升级为数组 |
| **4** | 人工审核单不再把用户锁死 | ✅ **通过** | **真 UI 实测**:首提 $80 → `review-pending`(route=manual);回提现页输 $30,提交按钮 `aria-disabled="false"`、文案正常,点下去真建出第二笔 |
| **5** | 人工 / 冻结 / 延迟单永不自动到账 | ✅ **通过** | 三笔分别 `review-pending` / `frozen` / `review-pending`,ETA 设成 5 天前,连推 3 次:状态一个没动,余额 24746.56 → 24746.56 |
| **6** | 展示面没坏、控制台 0 报错 | ⚠️ **部分** | 追踪页 5 种状态(submitted / review-pending / processing / confirmed / tx-failed)全部渲染正常、**无占位符残留**;钱包页、账单页均正常;**全程控制台 0 报错**。但可达性有洞 → 见 F2 |
| **7** | 两个标签页各建一笔,两笔都保留 | ✅ **通过** | 顺序建单后两页各自 `persist`:落盘 2 笔全在,**两页内存也都收敛到 2 笔**;真·并发同时提交时成功建出的单一笔不丢(另一笔被并发闸干净拒掉,未建单未扣款) |

---

## 缺陷

### 🔴 F1 · 账单台账被双向写错(P0,钱路径)

**位置**:`src/App.vue:64-70` `advanceArrivalAndSettleBill()`

```js
const ref = app.latestWithdrawal?.id;        // ← 推进之前就把「最新那笔」的单号钉死
if (!app.advanceWithdrawalArrival()) return; // ← 这一步可能推进的是**别的**单(全表扫)
if (ref && !useBills().settleByRef(ref, "posted")) pendingBillSettle.add(ref);
```

推进是全表扫(可一次推进多笔),结算却只认 `latestWithdrawal` 那一个单号,两者不是同一笔。

**实测**(早单 ETA +1h / 晚单 ETA +24h,时钟推到 +70min,等 App 层轮询):

| | 单据状态 | 账单行状态 | 应为 |
|---|---|---|---|
| 早单 `WD-…-4555` | `confirmed` ✅ | **`pending`** ❌ | `posted` |
| 晚单 `WD-…-8159`(= latest) | `submitted` ✅ | **`posted`** ❌ | `pending` |

时钟再推到 +25h、两笔都 `confirmed` 之后,早单账单行**仍然是 `pending`** —— 不是延迟,是永不结算。

**为什么是 P0**:`bills.ts:89-97` 的 `recomputeBalance` **只把 `status === "posted"` 的 USDT 行累进流水余额**。
所以两个方向的错都会落到用户看得见的账单流水上:到账的钱不进流水,没到账的钱先进流水。
这正是 `App.vue` 自己注释里写着要防的那件事 ——「追踪页说到账了、账单页说处理中,同一笔钱两个说法」。

**附带**:失败的 `settleByRef` 会把 latest 单号塞进 `pendingBillSettle` 并每 5s 重试一次,
而它已经是 `posted` → `settleByRef` 恒返回 false → **该单号永久留在重试集里空转**。

---

### 🔴 F2 · 在途单只要不是最新那笔,用户就完全找不到它(P1)

**位置**:`src/pages/me/wallet.vue:189-191`(入口行)· `src/pages/me/wallet-withdraw-tracking.vue:152`(详情页)
**且**:`src/pages/me/` 下**没有任何提现列表 / 历史页**,追踪页也没有通向其它单的导航(只有「再提一笔 / 回钱包 / 联系客服」三个出口)。

```js
// wallet.vue
const showWithdrawal = computed(() => !!latestWithdrawal.value && latestWithdrawal.value.status !== "confirmed");
// wallet-withdraw-tracking.vue
const wd = computed(() => app.latestWithdrawal);
```

**实测(带正向对照,排除选择器失效)**:

| 场景 | 钱包页含 `-$80.00` | 追踪页展示的单 |
|---|---|---|
| 正向对照:只有 1 笔 $80 人工审核在途 | ✅ 有 | ✅ 就是那笔 $80 |
| 本例:$80 人工审核在途 **+** 后提的 $30 已到账 | ❌ **没有**(连 `-$30.00` 也没有,整行消失) | ❌ 展示的是已到账的 $30 |

于是:**$80 已扣款、正在人工审核、用户在 App 里看不到它的状态,也没有针对它的客服入口。**
唯一残留痕迹是账单页的一行流水(只有金额和 memo,没有状态追踪、没有下一步)。

这条与 AC#1 的「两笔单据都在、**都能查到**」直接冲突:存下来了,但查不到。

---

### 🔴 F3 · 人工审核单在途时仍可换收款地址(P1,资金安全)

**位置**:`src/store/wallet-pairing.ts:184-186`
**同形第二处**:`src/pages/me/wallet-withdraw.vue:384` `rebindEntryDisabled`

```js
function hasInFlightWithdrawal(): boolean {
  return isInFlightWithdrawal(useApp().latestWithdrawal?.status);  // ← 只问最新那笔
}
```

正确的问法是「**列表里有没有任意一笔在途**」。

**实测(带正向对照)**:

| 场景 | `rebindBlockReason()` |
|---|---|
| 正向对照:只有 1 笔 `review-pending` 在途 | `"withdrawal-in-flight"` ✅ 拦住 |
| 本例:`review-pending` 仍在途 + 后提的一笔已 `confirmed` | **`null`** ❌ 放行 |

即:一笔钱正在人工审核、还没放款,用户此刻可以把收款地址换掉。
「提现在途禁止换绑」这道闸在单槽时代是有效的,列表化之后**被静默架空**。

---

### 次要项(不阻塞,登记)

| # | 项 | 位置 | 说明 |
|---|---|---|---|
| N1 | 死类型面 `AppState` 仍声明 `latestWithdrawal`、**没有** `withdrawals` | `src/store/types.ts:349` | 全仓库零引用(仅在 types.ts 自己出现 1 次),属迁移残留,留着会误导后来人 |
| N2 | `_devAdvanceWithdrawal` 只推进最新一笔 | `src/store/app.ts:1155-1178` | dev-only 且**全仓库零调用**,与 N1 一起清掉即可 |
| N3 | 本次新不变量**没有配哨兵** | — | 「问列表级问题不得读 `latestWithdrawal`」正是这次破的那条,而 `verify.sh` 里没有对应哨兵(全仓 grep 只有一条 SPEC-7 追踪页不推进)。F1/F2/F3 全部逃过了机器门 —— 362 门全绿而三个缺陷都在 |
| N4 | `persistAccountSnapshot` 会静默丢弃「状态 rank 未变」的同单字段编辑 | `src/store/account-cloud.ts:312-333` | `mergeWithdrawals` 对同 id 只在 rank 更高时取 `next`,rank 相同时保留磁盘版。当前生产路径没有「不改状态只改字段」的更新,**暂无实际影响**;但接真后端后若出现「服务端改了 ETA / 手续费但状态没变」,这类更新会被合并层吃掉 |

---

## 我自己踩的两个假红(方法论留痕)

诚实登记 —— 这两条一度被我当成产品缺陷,复验后证伪:

1. **「第二笔提现建不出来、还把第一笔从内存里抹掉」** —— 假红。
   根因是我在**会话中途** `localStorage.clear()`,把 `lastCloudSnapshot` 搞成了脏基线,
   触发了落盘失败回滚路径。改成「清空 → **整页重载** → 再操作」后,两笔正常并存(AC#1 全绿)。
   → 教训:探针的前置动作本身可能制造出生产上不存在的状态。

2. **「早单到点了却不推进」** —— 假红。
   根因是我改完 `estimatedCompletion` 就调 `persistAccountSnapshot()`,而三路合并对
   「状态 rank 没变的同一单」保留磁盘版、丢弃内存版(即 N4),我的编辑被静默还原了。
   改用「建单前调 `payoutSlaHours` 决定各自 ETA + 推进 `Date.now` 偏移」这两个不会被还原的杠杆后,
   状态推进实测完全正确。
   → 教训:**改了输入却没验输入真的生效**,就会把自己的写入被吞当成被测代码的锅。

F1 / F2 / F3 三条**均带正向对照**(同一探针里先构造「该拦住 / 该显示」的场景验证判据有效,
再构造本例),排除了「判据本身失效导致的假红」。

---

## 红测(证明哨兵真拦得住)

🔴 全程 `cp` 备份 + 还原,**未使用 `git checkout` / `git stash`**;还原后逐个核 sha256。

| # | 注入 | 哨兵 | 注入后 | 还原后 |
|---|---|---|---|---|
| 1 | `withdrawal-arrival-core.ts` 删掉 `riskRoute !== "pass"` 那道闸 | `selfcheck-arrival.mjs` | **64 pass / 4 fail**(exit 1)✅ 拦住 | 68 / 0 |
| 2 | `account-cloud.ts` `mergeWithdrawals` 改成丢弃本端新建的单 | `spec4-account-cloud-merge-check.mjs` | **抛错 `concurrent withdrawals must both survive, got: wd-B`**(exit 1)✅ 拦住 | PASS |
| 3 | `withdrawal-eligibility-core.ts` `claimDailySlot` 恒放行 | `selfcheck-fastlane.mjs` | **85 pass / 3 fail**(exit 1)✅ 拦住 | 88 / 0 |

**完整性核验**:三个文件还原后 sha256 与注入前**逐字节一致**;`git status` 文件数 77 → 77(未变);
备份文件已 Move 到 `.trash/20260801-004146/`,未硬删。

---

## 收尾

- 自起的 `chrome-headless-shell` 已全部退出(收尾核查 0 个);`chrome.exe`(主人的浏览器)未动。
- 无 `.playwright-mcp/`、无遗留 `*.png`;探针脚本全部在会话 scratchpad,**未写入本仓库**。
- dev server 仍在 5173(HTTP 200),全程未重启、未杀 node。
- **未修改任何生产代码**(只报不修)。

---

## 裁决

模型层(存储结构 / 合并 / 升级 / 推进判定)**做对了**,7 条 AC 里 4 条全绿。
但「把单槽换成列表」这件事只改到了模型,**三个消费者还在拿单槽的问法问列表**,
且三条都逃过了 362 道机器门 —— 缺一条守这个不变量的哨兵(N3)。

**裁决: FAIL(3 条)**
