# 完全版 A · 设计方案 v1 —— 🔴 已作废,不要照本文实施

> **本文已被三路独立证伪推翻。** 核心断言「账单并入快照 = 一次写盘 = 原子」**不成立**:
> 收口点是逐腿调资金原语,而每个原语自己就落一次盘,合表不改变写盘次数。
> 另一条「心跳落盘节流」会把风控扣留资金的**释放**判定与它的入账撕开(实测崩溃损失 0.20 NEX、
> 台账 120 秒虚记 44%),必须整个撤掉。
>
> - 现行方案:**[`2026-08-04-route-a-design-v2.md`](2026-08-04-route-a-design-v2.md)**
> - 证伪台账:[`2026-08-04-route-a-falsification.md`](2026-08-04-route-a-falsification.md)
>
> 本文保留仅供追溯「哪些前提被推翻、为什么」。**文中行号有多处偏差,以 v2 为准。**
> 尤其 §二 那段「如实声明的行为差异」是**推断出来的、不存在的现象**(心跳超时是 3 分钟,
> 10 秒陈旧不触发降级;且该路径在 H5 验收环境根本不执行)。

---

# (以下为作废原文)

# 完全版 A · 设计方案(2026-08-04)

**目标(主人拍板,不变)**:资金变更与它的收据**一次写盘落地 = 原子**,让「钱动了、账没记上」在结构上不可能发生,从而消灭补偿回滚的无穷回归(见 `2026-08-04-structural-reflection-r5.md`)。

---

## 零、一个前提被实测推翻,方案随之修正

我在收割计划 §四 里写过:「拆成『高频(收益/设备)』与『低频(资金/提现/账单)』两张表,再把账单并入低频表」。

**这条前提不成立。** 回源实测:

- `app.ts:139-142` —— 挖矿结算走 `withdrawable` 路线时,**直接给 `user.usdtBalance` 加钱**:
  ```ts
  nextBuckets.withdrawableUsdt = +(nextBuckets.withdrawableUsdt + usdt).toFixed(2);
  nextUser.usdtBalance = +(nextUser.usdtBalance + usdt).toFixed(2);
  nextUser.nexBalance  = +(nextUser.nexBalance  + nex ).toFixed(2);
  ```
- 这个函数由 `settle()` 每一拍调用(`app.ts:622`),而 `settle()` 挂在 `App.vue:34` 的 1 秒 `setInterval` 上。

⇒ **`usdtBalance` / `nexBalance` / 四个资金桶本来就在每秒热路径上。** 「资金字段搬进低频表」在这个产品里结构上做不到 —— 除非把挖矿累积与余额解耦,那是比本次更大的改动,且会打乱合并层的 additive 语义。

**修正后的方案**:不按「字段冷热」拆表,按「**谁必须与谁同生共死**」定表;热路径的代价用**落盘节流**解决,而节流是安全的 —— 理由见第二节。

---

## 一、方案(两条改动,一条约束)

### 改动① 账单并入账户快照(`AccountCloudSnapshot.bills`)

`nexgrid-bills-accounts-v1` 退役为**只读的迁移源**;账单成为快照的第 9 个顶层字段。

- `postMoneyBill` 里「改资金 + 写账单」变成**改同一个内存对象 + 一次 `persistAccountSnapshot()`**;
- 落盘失败 → 两者一起没发生(内存回滚仍是 `adoptAccountSnapshot(previousSnapshot)`,一次到位);
- **`restoreMoney` 这条补偿链在收口点里可以整条删掉** —— 没有「第一腿成了第二腿没成」这个状态了。

> 🔴 `restoreMoney` / `captureMoney` **本身不删**:结账页那种「扣款成功 → 后续业务动作失败(如 `acquireSecondary` 拒绝)」的冲正仍然需要它。删的是收口点内部那条「账单写失败 → 退回资金」的补偿。

### 改动② 心跳落盘节流(热路径的解法)

`settle()` 末尾的 `persistAccountSnapshot()`(`app.ts:636`)改为**节流版**:距上次落盘不足 `HEARTBEAT_PERSIST_MS`(拟 10s)就只留在内存。

**立即落盘(不节流)的场合**,一处不能漏:
- 全部资金原语与收口点(`creditBalance` / `debitBalance` / `creditNex` / `debitNex` / `restoreMoney` / `recordDeposit` / `creditRewardBucketInternal` / `submitWithdrawal` / …)—— 它们本来就各自调 `persistAccountSnapshot()`,不动;
- `bindAccount`(换账号)、`interruptAllTasks`(登出/被踢);
- **页面隐藏 / 卸载**(`App.vue` 的 `onHide` + `visibilitychange` + `beforeunload`)——补一个 flush;
- 设备增删改激活等用户动作 —— 本来就是独立调用点,不动。

### 约束 `account-cloud.ts` 仍须 value-import-free

`spec4-account-cloud-merge-check.mjs:8-17` 把它 transpile 进裸 node VM(sandbox 只有 `exports/require/console/Date/Map/JSON/Math`)。加 `bills` 只能用**类型导入**,不许引 `bills.ts` 的值。

---

## 二、为什么节流是安全的(承重论证,已实测)

`settleDevice`(`app.ts:230-268`)按**锚点**计价:

```ts
const deltaMs = now - d.lastSettledAt;
if (deltaMs < SETTLE_MIN_MS) return d;
... inc = (baseRate * … * deltaMs) / ONE_DAY
return { ...d, todayEarnings: +(d.todayEarnings + inc), lastSettledAt: now };
```

**锚点与被记的钱在同一份快照里,同生共死。** 于是:

- 不落盘时,内存里锚点与余额一起前进,磁盘上两者一起停在旧值 —— **不存在「锚点走了、钱没记」的错位**;
- 刷新/重开后,磁盘旧锚点 → `deltaMs` 覆盖整段间隔 → **一次补齐**(源码注释原话:*catches its offline gap up in one shot*);
- 所以节流**不丢钱**,只是磁盘上的数字延迟 ≤10s 追上内存。

### 🔴 一处如实声明的行为差异(不是 bug,但必须写出来)

若标签页在两次落盘之间被**强杀**,重开时磁盘的 `onlineHeartbeatAt` 也是旧的 → `isDeviceOnline()` 为 false → **手机设备**那段 ≤10s 的间隔按 `h5BaseFactor`(离线基准率)计价,而非在线率。

- 影响面:只影响 `kind === "phone"`(其余机型 `phoneFactor = 1`,`app.ts:253-258`);
- 量级:≤10 秒 × (在线率 − 基准率),分位在**分币级**;
- 判断:这其实**更符合语义**(那 10 秒 App 确实没在跑),且现有代码本就是这么设计的(注释:*prevents a killed App from reopening and back-paying the entire offline gap at the online rate*)。节流只是把这个既有窗口从 1 秒放宽到 10 秒。

---

## 三、合并层:新增 `bills` 分支(不加不行)

`mergeAccountSnapshots`(`account-cloud.ts:354-371`)返回的是**对象字面量**,不是 spread —— **加进类型却没加进这个字面量的字段,每次合并被静默抹掉**,而且只在 `base && latest` 都在时才触发,首写看起来完全正常。

`bills` 用**按 id 取并集**(账单是 append-only,id 唯一):复用既有 `mergeArrayByIdentity`(`account-cloud.ts:193-219`),按 `ts` 倒序。

> 状态推进(`settleByRef` 把 `pending` 推成 `posted`/`failed`)需要「同 id 取更新的那条」的语义,照 `mergeWithdrawals` 的 rank 单调(`account-cloud.ts:326-347`)办:`pending → posted|failed` 单向,**不许回退**。

---

## 四、迁移:读时升级,不写批量脚本

照抄 `upgradeLegacyWithdrawals`(`account-cloud.ts:127-149`)的范式:

```
readAccountSnapshot(key):
  row = table[key]
  if (!Array.isArray(row.bills))          // 老行没有 bills 字段
      row.bills = 老表[key]?.bills ?? []  // 从 nexgrid-bills-accounts-v1 搬
  ...
```

- **幂等**:升级过的行有 `bills` 数组,再读不会重复搬;
- **覆盖全部账号**:每个账号在自己被读到时升级,不需要遍历(直接回应墨菲③);
- **老表不删**:留作只读迁移源;老表的写入面全部拆掉(否则会出现「新表读、老表写」的双份真相)。

---

## 四点五、改前基线(实测,`node scripts/measure-persist-cost.mjs`)

静置 60 秒不做任何操作,5 台种子设备 / 40 条种子账单:

| 存储键 | 写入次数 / 60s | 单次均 | 合计 |
|---|---|---|---|
| `nexgrid-account-cloud-v1` 🔴 | **60** | 4,326 B | **253.5 KB** |
| `nexgrid-earning-ledger-v1` | 29 | 2,469 B | 69.9 KB |
| `nexgrid-risk-registry-v1` | 29 | 337 B | 9.5 KB |

**三个把方案钉死的数字:**

1. **40 条种子账单序列化 6,662 B —— 比整份快照(4,326 B)还大。** 直接并表不节流 → **643.8 KB/分**,2.5 倍劣化。节流不是优化,是这个方案能不能成立的前提。
2. **真实产出只发生 ~29 次**(收益台账写了 29 次,≈ 60s ÷ `SETTLE_MIN_MS` 1.8s),**60 次落盘里 31 次是纯空写** —— 快照内容一个字节没变也照写。
3. 按 10s 节流估算:6 次 × (4,326 + 6,662) ≈ **66 KB/分**,比改前**低 74%**。判据 ①(总字节必须降)有余量。

⇒ 第 2 条还给出一条**零行为变更**的补充改动:**落盘前比对内容,没变就不写**(`updatedAt` 排除在比对外)。它独立于节流、不引入任何延迟窗口,单独就能砍掉一半写入。两者叠加。

---

## 五、墨菲三点的验法(数出来,不是看功能对不对)

| # | 验什么 | 怎么验 | 通过判据 |
|---|---|---|---|
| ① | 热路径没被账单拖垮 | `node scripts/measure-persist-cost.mjs`(真推 60 拍,不是估算)| 次数 **≤8**;**每分钟总字节数必须低于改前基线 253.5 KB** —— 硬判据,不是「差不多就行」 |
| ② | 合并没把账单合丢 | 双标签页各提交一笔(各自写一条账单),合并后读账单 | **2 条,不是 1 条**;并补进 `spec4-account-cloud-merge-check.mjs` 成为常驻用例 |
| ③ | 迁移没漏掉其它账号 | 同一浏览器造 2 个账号各自有账单 → 迁移 → **分别登录** | 两个账号的账单都在,条数与迁移前一致 |

**另加两条我自己列的**(墨菲前置:最可能崩的点):

| # | 最可能崩的点 | 验法 |
|---|---|---|
| ④ | 落盘失败时账单与资金**没有一起回滚**(收口点删了补偿链后,回滚全靠 `adoptAccountSnapshot`) | 注入式落盘失败,断言资金**与账单条数**同时不变 |
| ⑤ | 节流让**资金动作**也被延迟(把 flush 点漏了一个) | 逐个资金入口跑「动钱 → 立刻读磁盘」,断言磁盘**当场**就有;并焊一道门:`settle()` 之外的 `persistAccountSnapshot` 调用点**一个都不许**变成节流版 |

---

## 六、爆炸半径(要跟着改的机器门)

| 脚本 | 为什么受影响 |
|---|---|
| `scripts/selfcheck-money-receipt.mjs` | 通篇建立在「两个 key 分两次写」上 —— 需重写(⑦ 多腿原子性、②「钱动了账没记」的固定靶都要改口径) |
| `scripts/spec4-account-cloud-merge-check.mjs` | 必须补 `bills` 合并用例(新分支不补 = 新分支从未被验证过) |
| `scripts/selfcheck-money-rollback.mjs` | pin 了 `money-receipt.ts` 里 `app.restoreMoney(` 恰好 3 次 —— 收口点删补偿后次数会变 |
| `scripts/verify.sh` P2-8 账单账号隔离哨兵 | 判据钉着 `bills.ts` 的 `writeAccountRow` 旧写法 |
| `scripts/auth-register-existing-runtime.mjs:172` | 写死读 `nexgrid-bills-accounts-v1[acct].bills` |
| `scripts/selfcheck-money-cas.mjs` / `selfcheck-staking-cas.mjs` | 大概率不受影响,实施后各跑一次确认无隐式耦合 |

---

## 七、明令不许走的路(证伪已排除)

- 🔴 **账单成为唯一真相、余额由账单推导** —— 历史事故:按账单累加算余额与真实余额**差 400 倍**,因为账单只是**部分流水**(心跳累积的收益从不进账单)。
- 🔴 **并发方案叠加** —— 仓内现有三套(账户快照三路增量合并 / 质押的 CAS / 其余表的裸读写)。账户快照**继续留在三路合并**,不要 CAS 通过后再跑三路合并(两套失败语义会搅在一起)。
- 🔴 **继续加「回滚的回滚」** —— 那是把无穷回归当工作量。
