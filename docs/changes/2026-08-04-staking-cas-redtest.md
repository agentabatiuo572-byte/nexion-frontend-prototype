# 质押持仓写入乐观并发(CAS)— 跨标签页竞态双记账修复 · 红测留痕(2026-08-04)

存量 P1。`src/store/staking.ts` 的 `earlyWithdraw` / `claim` 是裸 `find → map → persist`,
`persist` 走 `account-scoped-storage.ts` 的 `writeAccountRow` —— **纯覆盖式 last-write-wins**;
全仓又没有任何 storage 事件重新水合持仓。

H5 端 uni storage 就是 localStorage,同源多标签页共享同一份。所以窗口**不是几毫秒的传播延迟,
而是「两个标签页只要都打开过质押页,状态就永久不同步」**:同一笔仓位被两边各领一次,而
`usdtBalance` 在 `account-cloud.ts` 的 `ADDITIVE_NUMBER_KEYS` 里(按增量三路合并)→ 两次入账
都记 = **真·双花**。

实景复现(修复前代码,两个 page 共享一个 context):余额 `24856.56 → 25942.86`,
**+1086.30 = 2 × 543.15**。

## 为什么不是幂等键、也不是写前复读

- **幂等键防不住**:两个标签页是两次**独立的合法操作**,不是同一请求的重试,没有共同的请求 id 可去重。
- **写前复读也不够**:localStorage 没有锁,读完到写之间照样能被另一个进程插队(本红测的
  `①b` 靶就是专门造这一格)。

## 修法:一处闸,四条路径全走它

`account-scoped-storage.ts` 新增共享能力 `writeAccountRowCas(tableKey, accountKey, row, expectedRev)`:
磁盘上该行 `rev` 仍等于 `expectedRev` 才落盘,落盘后 `rev+1`;不符 → `{ ok:false, conflict:true }`
**不写盘**。`accountRowRev()` 把「行不存在 / 老行无 rev」一律读成 0,老行天然接得上,**零迁移**。

`staking.ts` 把四条变更路径(建仓 / 提前赎回 / 领取 / 到期标记)全部收进一个 `commit()`:

1. 基准取**磁盘最新**持仓,不是本标签页可能已经陈旧几小时的内存副本;
2. `apply` 在新鲜状态上**重新校验前置条件** —— 别处已经领走的仓位返回 `null`,调用方拿到
   `ok:false`,绝不会第二次入账(这是双花的根);
3. 带 `rev` 做 CAS 落盘;`rev` 被推进过说明 1→3 之间又被插了一脚,重跑一轮(有界 3 次)。

失败分两类回传:`conflict:true` = 期间被别处改过(页面弹「持仓刚有变动」),
`conflict:false` = 本来就不该成交(不存在 / 未到期 / 已终态,既有语义原样保留)。
`earlyWithdraw` / `claim` 的对外签名与既有 `if (r.ok)` 分支一个字没改,`conflict` 是新增可选字段。

**顺带修掉一个被本修复放大的隐患**:`stake()` 原来用 `id: \`stk-${Date.now()}\``,同一毫秒建的
两笔仓位 id 完全相同。CAS 之前这条被 last-write-wins 掩盖(其中一笔本来就会被顶掉);现在两笔
都留得住,重号会让 `find(id)` 永远只命中第一笔 —— 第二笔从此领不出来。改走全仓统一的
`mockServerId("STK")` 单点。

### 🔴 诚实边界

localStorage 没有锁,「比 rev」与「写回」终究是两步,亚毫秒级插队窗口**无法在客户端消除**
(Web Locks 只有 H5 有,uni 多端不可用)。本机制根治的是真正会发生的那个窗口 ——「状态永久
陈旧」;残余窗口要靠真后端单事务(接后端时 `writeAccountRowCas` 随 mock 一起退役)。

### 向后兼容

`writeAccountRow` **一个字节没动**,28 处老调用方行为完全不变(不读 rev、不写 rev、依旧
last-write-wins)。本轮只接质押一个消费者:79 个 store 文件里只有 `staking.ts` 引了
`writeAccountRowCas`,其余 77 个一行没动(机器门 ④ 逐次点数)。

## 机器门

`scripts/selfcheck-staking-cas.mjs`(**39 pass / 0 fail**),已焊进 `scripts/verify.sh` 末段。
结构断言跑在剥注释后的正主源码上;行为断言 esbuild 载**真 staking store + 真 storage 层**跑真
代码(只 stub pinia/vue 两个运行时外壳,被测对象绝不 stub),两个 store 实例 = 两个标签页共享
一份 JSON 序列化的假 storage(与 localStorage 同语义:跨标签页拿不到同一个对象引用)。

样本:6 个跨标签页固定靶 · 2 个 store 实例共享 1 份 storage · 79 个 store 文件扫爆炸半径 · 3 语 i18n。

## 红测:5 个合取项逐个隔离,5/5 命中

驱动脚本按合取项逐个破坏 → 断言对应固定靶必红 → **`cp` 备份还原(禁 `git checkout`,
工作树有并发 agent 的未提交改动)** → sha256 byte-identical 校验 → 复跑复绿。
注入靶点命中数 ≠ 1 或注入没落盘 → **立刻终止,绝不在未生效的注入上判红绿**。

| 编号 | 破坏的合取项 | 期望靶 | 结果 |
|---|---|---|---|
| R1 | `writeAccountRowCas` 的 rev 比对(拿掉版本校验 = 退回纯覆盖) | ①b | exit=1,红 3 条,`ledger=1738.08`(双花复现) |
| R2 | rev 单调递增(版本号写死不推进 = 比对恒过) | ①b | exit=1,红 5 条 |
| R3 | `commit` 以磁盘最新为基准(退回拿本地内存副本) | ⑤ | exit=1,红 7 条(两标签页各建的仓丢了一笔) |
| R4 | `claim` 资格在新鲜状态上复核(拿掉 status 门) | ① | exit=1,红 7 条,`afterB=543.15 final=1086.30`(2×) |
| R5 | 失败原因回传页面(吞掉 `conflict`) | ① | exit=1,红 5 条 |

还原后 `staking.ts` / `account-scoped-storage.ts` 均 sha256 byte-identical,复跑 39 pass / 0 fail。

## 实景证明(Playwright,一个 context 两个 page = 同源两标签页)

| 场景 | 余额变化 | 结论 |
|---|---|---|
| 修复前(git HEAD 代码) | `24856.56 → 25942.86` = **+1086.30** | 2 × 543.15,双花 |
| 修复后 · 慢速(A 已被 4s 自动同步刷新) | `24856.56 → 25399.71` = **+543.15** | 按钮已消失,点不出第二次 |
| 修复后 · 背靠背连点(A 真陈旧) | `24856.56 → 25399.71` = **+543.15** | A 被 CAS 挡下并提示 |

背靠背那一轮:两个标签页都显示 `Claim $543.15`,B 点完 A 立刻点。
B 得到「Position claimed · +$543.15 returned (interest $43.15)」;
A 得到「Positions just changed · This one was already handled elsewhere. We've refreshed it for
you — take a look before you try again.」;行版本 `rev 1 → 2`;console error **0**。

附带效果:质押页每 4s 的 `markMatured` 现在会顺手把磁盘最新态同步进内存 —— 打开着的标签页
自动跟上别处的变更(此前永远看不到)。

## 后续:还有哪些 store 该接 CAS

判据 = 该 store 的行**承载资金/资格,且存在「同一笔只能消费一次」的语义**。按优先级:

| 优先级 | store | 为什么 |
|---|---|---|
| P1 | `deposits.ts` | 充值单状态推进 + 到账入账,两端并发推进会重复入账 |
| P1 | `voucher.ts` | 代金券 claim 记录,同一张券两个标签页各领一次 |
| P1 | `nex-faucet.ts` / `daily-powerup.ts` / `lucky-spin.ts` | 每日限额型领取,单槽计数被覆盖 = 额度绕过 |
| P1 | `withdraw-daily-count.ts` | 提现日限额计数,覆盖式写 = 限额白设(已有 claimToken,但仍是覆盖写) |
| P2 | `event-quest.ts` / `quest.ts` / `weekly-quest.ts` / `achievements.ts` | 任务奖励领取,重复领 = 重复发币 |
| P2 | `orders.ts` / `exchange-v3.ts` | 订单/兑换记录,行覆盖会丢单(不直接双花,但丢凭证) |
| P3 | `cart.ts` / `goals.ts` / `profile.ts` / `security.ts` / `rewards-seen.ts` 等 | 偏好/展示类,覆盖只丢一次编辑,不涉钱 |

本轮**只接质押**(避免扩大爆炸半径);上表其余项建议按 P1 → P2 分批接,每批各自带固定靶 + 红测。
