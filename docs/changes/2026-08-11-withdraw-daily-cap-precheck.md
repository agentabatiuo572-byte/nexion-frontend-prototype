# 提现每日笔数上限:客户端预检恒不触发(z1 审计 P0-1)

- **状态**:Shipped(2026-08-11 合入主线 `UniApp` = `32e0c50`;合并后全量 verify 425 pass / 0 fail / 0 skip)
  - 此前:Aligned(主人 2026-08-11 拍板:① 保留并修好客户端预检 ② 计数口径「全算」维持现有规则)
  - 🔴 **未推远端**:本地主线比 `origin/UniApp` 多 18 少 10,推之前需先合远端那 10 个提交并重跑全门。
    代价:后端同事从 GitHub 拉不到本轮写进 `docs/HANDOFF` 的 U-4 / U-7 / U-8 三条待定口径。
- **包分支**:`pkg/z2-withdraw-cap`(worktree `.claude/worktrees/z2-withdraw-cap`,基线 `UniApp@c587c0d`)
- **定级**:M(跨 4 个源文件 + 3 个门脚本;钱路径 → 子任务加 code-review)

## Why

`c37e642` 把提现改成 remote-only 后,`claimWithdrawSlot` / `releaseWithdrawSlot`
在 `src/` 全站零调用 —— 它们是 `withdraw-daily-count.ts` 里**唯一**写计数器的函数。
于是:

```
计数器无人递增 → readWithdrawCounter 恒 null → todayWithdrawCount 恒 0
→ isOverDailyCap 恒 false → decision.dailyLimitReached 恒 false
```

四个消费面全部不可达(承诺还在,执行没了):

| # | 位置 | 承诺 |
|---|---|---|
| 1 | `wallet-withdraw.vue:250` | 渲染「每日最多 N 笔」 |
| 2 | `wallet-withdraw.vue:782` | 达上限时置灰提交 + 给下次可提时刻 |
| 3 | `wallet-withdraw.vue:948` | 提交后二次判定的 toast |
| 4 | `wallet-withdraw-tracking.vue:193` | 「再提一笔」置灰 |

用户看到承诺,预检永不生效,只能在提交时吃服务端拒单。

### 回源时发现的第二处缺陷(同一根因族:同一概念两份判据)

「每日最多几笔」这个数字在客户端有**两个来源**,且互不相干:

| 消费面 | 取的数 | 来源 |
|---|---|---|
| UI 文案「每日最多 N 笔」 | `withdrawalPolicy.dailyLimitCount` | `GET /api/withdrawals/policy`(**服务端权威,提交时真正执行的那把尺子**) |
| 预检判定 | `config.withdrawRules.dailyWithdrawLimitCount` | 本地种子常量 `1` |

`config.ts` 的远端同步**只覆盖** `featureFlags / onlineBonus / rewards / computeShare`,
`withdrawRules` 永远是前端写死值。所以只修「计数」而不修「限额来源」,
会造出一个新故障:服务端配 3 笔、客户端按 1 笔拦 —— 用户被自己的 App 挡在门外,
比现状更糟(现状至少不冤枉人)。

### 对派单前提的一处更正

派单说「app.withdrawals 来自 `GET /api/withdrawals`」。回源核实:
`withdrawal-api.ts` 只有 `policy()` 与 `submit()` 两个方法,**没有列表端点**。
`app.withdrawals` 是**本地持久化的账号级镜像**:随账号快照存取(`app.ts:454/470`),
每次 `POST /api/withdrawals` 成功后把服务端返回的单据前插并按 id 去重(`app.ts:1281`)。
代码注释里的「与真后端 GET /api/withdrawals 同构」指的是**形状同构**,不是数据来源。

结论不变——它仍是当前最好的计数源(每笔成功提交恰好落一行、带服务端单号、
跨刷新存活、按账号隔离、就是追踪页渲染的那份数据),但它是**本地镜像**这一点
必须写进 HANDOFF:接后端时应改由服务端返回当日已用笔数或提现列表。

## What changes

### 1. 计数源:本地计数器 → 提现单列表现算

删除 `src/store/withdraw-daily-count.ts` 整个模块(Move 到 `.trash/`)。
它存在的理由是「客户端必须在建单前原子占用一格额度」—— 建单权让渡服务端后,
这个问题本身消失了;CAS + 令牌 + 150ms 回读那套并发机制是在解一道已经不存在的题。

core 新增纯函数(判定仍全部留在 core,外壳一个表达式都不剩):

```ts
export function countWithdrawalsOnPlatformDay(
  rows: ReadonlyArray<{ submittedAt: number }> | null | undefined,
  now: number,
): number
```

`WithdrawalStoreSnapshot.withdrawCounter` → `withdrawals`(外壳原样转发 `app.withdrawals`)。

**连带删除**(全部只被上述模块消费,删后即死代码):
core 的 `todayCountFrom` / `claimDailySlot` / `isClaimOwner` / `MAX_SANE_DAILY_COUNT`,
以及它们在 `selfcheck-fastlane.mjs` §7/§8、`selfcheck-money-cas.mjs` ①②⑥、
`selfcheck-staking-cas.mjs` 的 `CAS_CONSUMERS` 名单里的条目。

### 2. 限额源:本地配置 → 服务端 policy

`evaluateWithdrawal` / `dailyLimitStatus` 改为由调用方传入服务端 policy 的
`dailyLimitCount` 与提现单列表;`config.withdrawRules.dailyWithdrawLimitCount`
从类型与种子里删净(admin-ops 已核实无镜像消费者)。

`wallet-withdraw-tracking.vue` 需要自己取一次 policy(现在只有提现页取)——
否则追踪页拿不到权威限额,又会退化成「追踪页说能提、提现页说不能提」。
policy 取不到时限额为 0 → 现有规则「上限 ≤0 视为未配置 → 不限制」→ **fail-open**,
不会因为后端不可达把提现锁死。

### 3. 门(要求 ①)

`selfcheck-fastlane.mjs` 行为断言半区新增一组固定靶:平台日边界(UTC+7)、
恰好到达上限、跨日归零、坏 `submittedAt` 被忽略、限额非法时不限制。
外加**接线门**:计数必须来自提现单列表、限额必须来自服务端 policy
(判定对 ≠ 接上,同 `feedback_quota_claim_before_create` 族)。

### 4. 关于要求 ②

本修法**不复活** `claimWithdrawSlot`,而是删除它 —— 故不触发「复活须同批恢复
三条实现级断言」。原「claimWithdrawSlot 仍无调用方」的看门人断言随模块一并删除,
其职责由上面的接线门接管(守「计数源必须是订单列表、限额必须是服务端 policy」,
比守「某个死函数不许复活」更接近不变量本身)。

## Out of scope

- 服务端计数口径核对(无 `nexion-backend` 可验)→ 记 HANDOFF。
- `submittedAt` 目前是客户端 `Date.now()` 落的戳(`toCanonicalWithdrawal` 默认参数)。
  接真后端后应改用服务端下发的建单时刻 → 记 HANDOFF。
- 提现页 policy 取不到时文案显示「每日最多 0 笔」(既有小瑕疵,该状态下提交已被
  `withdrawalEnabled !== true` 拦住并给了原因)→ 本包不动,记 HANDOFF。

## Done-when(P6 逐条回测)

1. 平台日(UTC+7)内提交 N 笔(N = 服务端 `policy.dailyLimitCount`)后,提现页提交按钮置灰,
   理由是日限文案并带下次可提的绝对时刻;追踪页「再提一笔」同步置灰同文案。
2. 把其中一笔的 `submittedAt` 改到上一个平台日,提交按钮**恢复可点**(跨日归零真生效)。
3. `policy.dailyLimitCount` 从 1 改成 3 时,今日已 1 笔仍可提(限额跟着服务端走,
   不再被本地 `1` 卡住)。
4. ~~policy 取不到(后端不可达)时**不拦**提交(fail-open,不把提现锁死)。~~
   🔴 **2026-08-11 更正:这条我写错了,且当时的走查方式验不出来。**
   用本地假后端跑真页面实测:policy 取不到时页面**整页禁提交**(费率闸先拦),
   所以「不把提现锁死」在页面层**不成立**。fail-open 只在**日限判定这一层**成立
   (`isOverDailyCap` 对 ≤0 返回 false)。当时的走查只断言了 `dailyLimitReached=false`,
   没断言「真的能提交」—— 判定值对 ≠ 用户能提交,这正是本包反复栽的那个坑。
   **改写为**:policy 取不到时,日限**不额外加一道锁**(拦不拦由费率闸与服务端决定)。
5. `src/` 全站无 `withdraw-daily-count` 残留引用;`grep claimWithdrawSlot` = 0。
6. 机器门:`npm run type-check` 0 错 + `bash scripts/verify.sh` 全绿(含新增行为门,
   且新门经红测证明「改坏必红」)。

## 实施拆解

- [ ] **t1 · core 计数改为列表现算**(`withdrawal-eligibility-core.ts`)
      AC:`countWithdrawalsOnPlatformDay` 纯函数;`WithdrawalStoreSnapshot.withdrawals`;
      `isDailyLimitReached` 改签名;删 `todayCountFrom`/`claimDailySlot`/`isClaimOwner`/`MAX_SANE_DAILY_COUNT`。
      敏感度:钱 → 加 code-review agent。
- [ ] **t2 · 外壳与页面接线**(`withdrawal-eligibility.ts` / `wallet-withdraw.vue` / `wallet-withdraw-tracking.vue`)
      AC:限额来自服务端 policy;列表来自 `app.withdrawals`;追踪页自取 policy;
      删 `withdraw-daily-count.ts`(Move 到 `.trash/`)与 `dailyWithdrawLimitCount` 配置字段。
- [ ] **t3 · 门**(`selfcheck-fastlane.mjs` / `selfcheck-money-cas.mjs` / `selfcheck-staking-cas.mjs`)
      AC:行为固定靶 5 条 + 接线门 2 条;删净被删机制的旧断言;每条新门红测留痕。
- [x] **t4 · 实景走查 + HANDOFF**
      HANDOFF 加 U-4/U-5/U-6 三条后端待办;走查见下节。

## 实景走查结果(2026-08-11,dev :5203,本 worktree 独立起服)

**环境限制先说清**:本机没有 `nexion-backend`,`GET /api/withdrawals/policy` 拿不到真响应。
走查用的办法是**把一份合法 policy 直接喂给页面组件**(不改代码、不改判定),
其余全部走真实的 computed 链与模板 —— 网络那一段是唯一被替代的环节。

| # | 场景 | 页面真实结果 |
|---|---|---|
| ① | 上限 2 · 今日 2 笔(其中一笔 `review-rejected`) | 提交被拦,理由「今日提现次数已用完,08-12 02:00 后可再提。」——已驳回的单照样占额度,与主人拍板的口径一致 |
| ② | 把其中一笔改到上一个平台日的最后 1 毫秒 | `dailyLimitReached=false`,日限不再拦(跨日归零真生效) |
| ③ | 改回今日 2 笔 | 又被拦(方向可逆,不是一次性状态) |
| ④ | 服务端上限从 2 调到 3 | 不再拦,页面文案同步变成「每日限额:3 笔/日」 |
| ⑤ | policy 取不到(后端不可达) | 日限不拦(fail-open),且「每日限额」那句话整条消失 |
| ⑥ | 追踪页「再提一笔」 | `aria-disabled=true` · opacity 0.6 · 灰字 · 44px 触达 · 下方显示同一句原因 |

另跑了**浏览器运行时探针**:直接 import dev server 真正供给的 core 模块,用真实钟走 10 个固定靶
(平台日边界四向 + 恰好到达上限 + 上限未配置),与 Node 门结论逐项一致 —— 排除「Node 里对、浏览器里不对」。

**没能验到的一处**:提交后二次判定的那条 toast(`wallet-withdraw.vue` 提交路径),
需要真的建单成功才会走到,无后端到不了。它吃的是同一个 `dailyFacts`,由接线门钉住表达式。

## 🔴 怎么在本机把提现全链路真跑起来(下一个人照做即可)

R3 灾备镜头点名:此前的走查手法**只存在于那次会话**,仓里零残留。现在留成配方:

```bash
# 1. 起假后端(零依赖;契约以 src/api/*.ts 的解析器为准,比文档严)
node scripts/dev-stub-backend.mjs --port 8110

# 2. .env.local 切到 remote + 假后端,然后**重启 dev server**(env 是编译期注入,热更新不生效)
#    VITE_NEXGRID_API_MODE=remote
#    VITE_NEXGRID_API_DEV_BASE_URL=http://127.0.0.1:8110

# 3. 注入失败档 / 查台账
curl -X POST localhost:8110/__stub/mode -H 'content-type: application/json' -d '{"submit":"createdThen504"}'
curl localhost:8110/__stub/log      # orderCount / distinctKeys / 每笔单的幂等键
curl -X POST localhost:8110/__stub/reset
```

页面里还要给一个登录态(vault 是内存态、不落盘):
`(await import("/src/api/runtime.ts")).sessionVault.save({accessToken:"stub-access-token",refreshToken:"stub-refresh-token",tokenType:"Bearer",user:{userId:1001,countryCode:"VN",phone:"900000001",nickname:"stub"}})`

⚠️ **跑 verify 前必须把 `.env.local` 切回 `VITE_NEXGRID_API_MODE=mock` 并重启 dev server** ——
verify 的 API-mode preflight 明写 remote 会让全部运行时探针静默验错对象。

### 用它测出来的事(都是此前只能靠读代码推断的)

| 结论 | 怎么测的 |
|---|---|
| 超时重试**会**重复出账(修前) | `createdThen504` 档:服务端建单后网关超时 → 客户端得 `http/504` → 旧分诊判「确定」→ 换新键重试 → 台账 orderCount **2** |
| 修后不再重复 | 同一实验,orderCount 恒 **1** |
| 超额拒单走 **429**,客户端拿到的是 `http` 不是 `business` | `dailyLimit` 档;因此「按 kind 认日限拒单」认不出它 |
| 后台把日限配成 0 会**打死整个提现页** | 策略三态真值表;已记 HANDOFF U-8 |
| 「策略取不到时不拦提交」**在页面层不成立** | 同上;Done-when 4 已据此更正 |

## 回源扫同类(修一处必扫全族)

同一个数在「服务端 policy / 本地 config」两处都有定义的字段还有:
`smallAmountThresholdUsd`、`payoutSlaHours`、`networkConfirmFeeUsd`,
以及 `policy.minAmount` ↔ `withdrawRules.minWithdrawableUsdt`(同概念异名)。
实测其中 `minWithdrawableUsdt` 确实还是分裂的:页面「最低提现」取服务端,
而 `canSubmit` 里的余额门取本地种子 20。**本包不动** —— 它属于 z1 判决表已立案的
「钱包页与提现页可提现口径分裂」;`smallAmountThresholdUsd` 属于已立案的
「小额免审注释称停用但实际在线」。两条都已在册,不在本包范围内顺手改钱路径。
