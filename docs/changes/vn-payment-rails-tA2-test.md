# tA2 独立验收报告 — 入金数据模型 + 链上到账闭环(store 层)

- 日期:2026-07-23/24 · tester:独立验收 agent(黑盒) · 环境:http://localhost:5173(dev,`?nx_device=off`)
- **总判定:PASS(6/6)**;附 1 项口径 observation 待裁决,不阻塞。
- 中途插曲:验收进行到 AC5 时 impl 侧热修 deposits.ts 两处(persist 失败回滚 + CHANNEL_MEMO 补 bank-vietqr/card-intl)。核对 diff 后确认不改 AC1-4 已验路径语义;另在**新代码**上补跑一笔 BEP20 全径复测(见 AC5-新代码行),证据全部有效。

## 驱动与切号路径(实际走的)

- 驱动:console `__nxDev.simulateIncomingTransfer / resolveDustHold`(登录/注册触发 `rebindAccountScopedStores` 后挂载;未认证冷启也会经 default 绑定路径挂上)。
- 账号 A = 未登录默认上下文 `default`(seed 余额 24856.56);账号 B = 走**真 UI 注册**新建 `+15550019927@demo.nexgrid.ai`(注册页手机 5550019927 → OTP 任意 6 位「123123」→ 设密码 Passw0rd123)。
- 切号全走 UI:A→B 注册即登录;B→A 用 me 页「退出登录」+ 确认弹窗(登出后回 default);二次进 B 走登录页密码模式。未用 localStorage 注入切号。
- 数据证据读取:console 读 uni 包装 localStorage(`nexgrid-account-cloud-v1` 的 `user.usdtBalance/cumulativeDepositUsdt`、`nexgrid-deposits-accounts-v1`、`nexgrid-bills-accounts-v1`)+ 页面截图/innerText。

## 逐 AC 判定

| AC | 判定 | 证据 |
|---|---|---|
| 1 阳光入账 +99 | **PASS** | simulate("usdt-trc20",100) → 返 DP-20260723-5618(gross 100/fee 1/credited 99/20 确认);~11s 后 `usdtBalance` 24856.56→**24955.56(恰 +99)**,`cumulativeDepositUsdt` 0→99,记录 credited@20/20;账单页 UI 顶部「充值·已入账·Top-up · USDT-TRC20 · 0x9587… **+99.0000 USDT**」 |
| 2 真写+刷新还在 | **PASS** | 整页 reload 后余额 24955.56/记录 credited/47 bills 全在,且 `updatedAt` 刷新(live store 重持久化同值);后续又经 2 次冷加载 + HMR 换代码,数据始终在 |
| 3 粉尘不入账 | **PASS** | simulate("usdt-erc20",5) → gross 5/fee 5/credited 0;等 16s 后状态停 **dust_hold**(conf 0),余额 24955.56 不变,账单仍 47 条无新增 |
| 4 幂等 | **PASS** | 固定哈希 0xab12…(64hex)simulate 50 两连发:第 1 发返记录 DP-20260723-8683,**第 2 发返 null**;走满后余额 24955.56→**25004.56(+49 恰一次)**,同哈希 records=1、bills ref 命中=1(账单 47→48) |
| 5 账号隔离 | **PASS** | A 入账后注册切到 B:B 余额=种子 24856.56(**cumDep=0**,非继承 A 的 25004.56)、B 账单 31 条**无** +99/+49/0x 哈希条目(仅种子 topup TX-20260503-7621)、deposits 存储无 B 行;登出回 A:三条记录/25004.56/148/48 bills 全在,+99/+49 均在账单 UI。**反向**:B 在新代码上 simulate("usdt-bep20",20) → B +19(24875.56)、memo「Top-up · USDT-BEP20」、credited@15/15;回 A 后 A 余额不变、账单无 BEP20 泄漏 |
| 6 console error=0 | **PASS** | 前半程(AC1-4)与后半程(注册/登录/BEP20/登出/账单页)两次 onlyErrors 采样均 0 条;无需动用 HMR 豁免 |

加验(非 AC,顺手):dust 处置边界 —— gross≤fee 的 dust `resolveDustHold(id,"credit")` 拒绝返 false(不可核销入账),`"return"` 成功置 returned 且余额不动,**二次 return 返 false**(终态禁再处置)。

## Observation(待主人/A3 裁决,不计 fail)

1. **「余额」口径**:入账走存量原语 `app.recordDeposit` → 加**总余额 `usdtBalance`**(消费场景:购买/兑换/质押可见),**不加**钱包页 hero 显示的 `earningBuckets.withdrawableUsdt`(可提现)。充值本金"可花不可提"是全平台既有语义(银行卡充值 topup-card-form 同路径;debitBalance 注释明示"花钱先消耗不可提部分(如充值本金)"),**非 A2 缺陷**。但 PAY 规格 §5 复式分录写"链上入金 credited → 贷 **用户可提负债** +credited",命名上有张力;且现状用户充值后钱包页**无任何可见数字变化**(要到 A3 的最近入金列表/充值页才有感知面)。建议 A3 落 UI 时明确这条口径。
2. dev 采样时钟:账单条目时间显示 7月24日(mockServerNow 快于真机 1 天),与 AC 无关,记录备查。

## 复现速查

```js
// wallet 页 console(?nx_device=off)
__nxDev.simulateIncomingTransfer("usdt-trc20", 100)          // ~11s 后 +99
__nxDev.simulateIncomingTransfer("usdt-erc20", 5)            // dust_hold 不入账
__nxDev.simulateIncomingTransfer("usdt-trc20", 50, "0x"+"ab12".repeat(16)) // 二次调用返 null
__nxDev.resolveDustHold("<depositId>", "return")             // dust 退回
```
