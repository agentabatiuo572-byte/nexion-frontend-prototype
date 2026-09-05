# R4 自伤 3 条 —— 修复 + 红测留痕(2026-08-04)

三条缺陷都是**上一轮修复自己引入的**,不是存量。共同点:修的时候只盯着「被点名的那一处」,没把同一条不变量在**所有出口**上拉平。

| # | 缺陷 | 根因一句话 |
|---|---|---|
| A | 兑换展示值 ≠ 实际到账 | 报价单源化只解决了「两次报价一致」,没解决「报价被展示层二次舍入」 |
| B | 质押重试耗尽后静默丢钱 | `stake()` 只对「storage 不可用」有兜底,对「版本冲突耗尽」零处置,而签名无论如何都返回仓位 |
| C | 我们焊的两道 i18n 门自己假绿 | 判据是**子串扫描 key 名**,不是取值;比对两边又都可能是 `undefined`,等式恒成立 |

---

## A · 兑换展示值 ≠ 实际到账

### 定量:精度选哪个、为什么

**选「统一到 2 位小数」,不选「NEX 取整」。** 判据不是审美,是**账本自己的精度**:

`src/store/app.ts` 四个资金原语落账时一律 `+(...).toFixed(2)` —— `creditBalance` / `debitBalance` / `creditNex` / `debitNex` 全部如此。**USDT 与 NEX 的真实最小成交单位都是 0.01**,这是既成事实,不是可选项。

于是「NEX 取整」被排除的理由是硬的:

1. **与账本矛盾**:NEX 余额本来就是两位小数(抽奖 / 任务 / 水龙头都经 `creditNex` 落两位),报价强行取整不会让余额变整数,只会让报价与余额两套口径。
2. **凭空造出隐性费率**:最小兑换额是 1 USDT,`r≈0.085` 时约 12 NEX。取整误差最大 0.5 NEX ≈ **4% 的本金**,而这个入口写着「网络费 Free」。向下取整是无声抽成,向上取整是无声补贴,两个都不能接受。
3. **同屏自相矛盾**:余额药丸 `toLocaleString()` 本来就会显示 `11.76`,报价却显示整数。

反过来,**「过细」也是同一个病的另一面**:`quoteTo` 原本对 NEX→USDT 返回 4 位小数,而账本只落 2 位 —— 报价 `10.5374`、实际入账 `10.54`,差 0.0026。任务单里写的「反方向无此问题」只在「两个展示口彼此一致」的意义上成立,**在「展示 == 入账」的意义上同样不成立**。本轮一并堵掉。

### 落地(`src/pages/me/wallet-exchange.vue`)

一个取整口径 `money()`,一个展示口径 `amtLabel()`,四个展示口全部经由它:

| 位置 | 改前 | 改后 |
|---|---|---|
| `quoteTo` 报价 | `usdt2nex` 取 2 位 / `nex2usdt` 取 4 位 | `money(...)`,两个方向同一口径 |
| `fromAmount` 输入 | 原样 `parseFloat`(1.2345 直通资金链路) | `money(n)`,进资金链路即归一 |
| 收款卡 `toAmountLabel` | `maximumFractionDigits: USDT?4:0` | `amtLabel(toAmount)` |
| 确认弹窗 message | `toFixed(USDT?4:0)` | `amtLabel(snap.*)` |
| 成功 toast | `String(snap.*)` | `amtLabel(snap.*)` |
| 历史行 `swapLine` | `toFixed(USDT?4:0)` | `amtLabel(h.*)` |

**同时修「付出腿」**:任务单只点了收款腿,但余额 11.76 NEX 时点 MAX,弹窗与历史同样把付出腿显示成「12 NEX」而实扣 11.76 —— 同一缺陷的另一面,不能只修一面。

---

## B · 质押重试耗尽后静默丢钱

`stake()` 返回形状对齐 `earlyWithdraw` / `claim`:`{ ok, position, conflict? }`。三条路径:

- CAS 落盘成功 → `{ ok: true, position }`
- storage 写不进去(`!conflict`)→ 内存兜底 + `{ ok: true, position }`(仓位**存在**,用户看得见、能赎回,既有行为不变)
- **3 次版本冲突耗尽(`conflict`)→ `{ ok: false, position: null, conflict: true }`**

这一路**不做内存兜底**:仓位没落盘,内存兜底只会让它「本标签页看得见、刷新即蒸发」,比明确失败更糟。

两个调用方都接住失败并冲正(`stake-sheet.vue` / `wallet-repurchase.vue`),形态一致:扣款⊗记账原子提交 → 建仓 → 失败则反向分录 + `restoreTo` 精确还原。

### 退款必须用 `restoreTo`,不能用裸 `creditBalance`

`debitBalance` 会 clamp `withdrawableUsdt = min(withdrawable, 余额)`,而 `creditBalance` **只加总余额、不还可提额度** —— 一次「扣款→失败→退款」就把用户可提额永久压低(实测场景 $8000 → $1)。

**这一条是本轮自己踩出来的**:第一版退款写的正是裸 `creditBalance`。机器门当场把它照红(见 B4 靶),改用 `restoreTo` 才绿。

---

## C · 两道 i18n 门自己假绿

改前(两处同型):

```js
src.includes(`${k}:`)                          // 纯子串扫描:key 名写进注释就骗过
x[1] === EN.exchange.quoteStaleTitle           // key 缺失时两边都 undefined,恒等成立
```

改后:

1. **真解析取值** —— esbuild bundle 出 locale 模块,断言 `typeof v === "string" && v.trim().length > 0`,不是在文件文本里找 key 名。
2. **比对前先断言非空** —— `nonEmpty(EN.…) && toast 命中`,杜绝 `undefined === undefined`。
3. **顺带补一条子串扫描永远看不出的**:三语文案互不相同(有值但整份复制粘贴 = 没翻译)。

---

## 红测逐靶

纪律:**一靶只破坏一个合取项**;还原**只用 `cp` 备份**(本仓有并发未提交改动,`git checkout` 会抹掉整轮工作);needle 命中数 ≠ 1 直接抛错终止(注入没生效就不许把结果算数);还原后校验 sha256 byte-identical。

harness 会核对**红在哪一条**,而不只是「整体红了」—— 红错地方 = 门在守别的东西。

| 靶 | 只破坏什么 | 门 | 红在哪条 |
|---|---|---|---|
| A1 | 收款卡恢复按币种取整 | 兑换 | 展示口全经 amtLabel / 旧写法 0 残留 / ⑥ 展示==入账 |
| A2 | 确认弹窗恢复 `toFixed` | 兑换 | ⑥ 4 个展示口读出的数 == 入账 |
| A3 | 历史行恢复 `toFixed` | 兑换 | 同上(历史行 `"1.00 USDT → 12 NEX"`) |
| A4 | 报价恢复分方向取整 | 兑换 | A② 报价实现单源 + A④ 账本精度单源 |
| A5 | 输入不再归一 | 兑换 | A④ 输入进资金链路即归一 |
| B1 | store 冲突耗尽仍报 ok | 质押 | ⑦ ok=false/conflict/position=null |
| B2 | stake-sheet 不接失败 | 质押 | ⑦b 余额补回 / 失败提示 |
| B3 | repurchase 不接失败 | 质押 | ⑦b 余额补回 / 失败提示 |
| B4 | 退款摘掉 `restoreTo` | 质押 | ⑦b **可提额度被还原**(总余额看着没事,只有可提额度被压低) |
| **C1** | **负控**:en 兑换文案值删掉只留注释 | 兑换 | C① 拒单断言 + i18n 真解析 |
| **C2** | **负控**:zh 同上(证明三语都真查) | 兑换 | i18n 真解析 |
| **C3** | **负控**:vi 质押文案值删掉只留注释 | 质押 | ⑥ i18n 真解析 |
| **C4** | **负控**:本轮新增建仓失败文案删掉 | 质押 | ⑥ i18n 真解析 |
| **C5** | **负控**:文案有值但三语相同 | 质押 | ⑥ 三语互不相同 |

**14 靶全过**,还原后两道门复绿、文件 byte-identical。

> C1–C4 就是审计复现假绿用的那一手(删值、只在注释里留 key 名)。改前两道门 43/39 全绿,改后当场红 —— 负控成立。

---

## 运行时证明

`http://localhost:5173/?nx_device=off#/pages/me/wallet-exchange`,真做 1 USDT → NEX(汇率实时抖动,取成交那一刻的值):

| | 值 |
|---|---|
| 汇率 | 0.04714 |
| 收款卡显示 | **21.21** |
| 确认弹窗 | `USDT 1.00 → NEX 21.21` |
| 历史行 | `1.00 USDT → 21.21 NEX @ 0.04714` |
| 成功 toast | `USDT 1.00 → NEX 21.21` |
| NEX 余额 | 6627.14 → **6648.35(+21.21)** |
| USDT 余额 | 24854.56 → 24853.56(−1.00) |
| console error | 0 |

**五个数字完全一致。** 旧实现在这一笔会显示「21」而实际入账 21.21,差 0.21。

> 期间曾撞到 `bills.addMany is not a function`,而磁盘上该函数存在 —— 硬刷新后复跑 3 次干净 0 error,判定为 Pinia setup store 的 HMR 陈旧实例,非缺陷。**先证伪环境再归因**,没有据此改代码。

---

## 机器门

- `scripts/selfcheck-exchange-genesis-guard.mjs`:新增 A④(5 条结构:取整单源 / 输入归一 / 展示口径 min=max 双钉 / 4 个展示口全经 amtLabel / **4 种旧写法 0 残留**)+ ⑥(8 条行为固定靶,含 1÷0.085 实测反例、付出腿、以及「过细」的 4 位小数一面)+ i18n 真解析 2 条。
- `scripts/selfcheck-staking-cas.mjs`:新增 ⑦(建仓冲突耗尽,**注入未生效直接抛错**)+ ⑦b(两个调用方**正主函数原文注入**,验退款含可提额度还原)+ i18n 真解析 2 条。app 桩补上与 `app.ts` 同款的 `withdrawableUsdt` clamp —— 桩不建 clamp,裸 `creditBalance` 与 `restoreTo` 在门下长得一模一样。

两个脚本都已挂在 `scripts/verify.sh`(本轮未新增 verify 段落,沿用既有两段)。

---

## 留给后续的两条(本轮范围外,不自作主张)

1. **`wallet-exchange.vue` 的 `billsStore.add` 返回值没人接**(同族「钱动了、账没记上」最后一处)。兑换是一进一出两条分录,冲正语义比单边复杂 —— 已交给负责该族的 agent,本轮只动展示精度。
2. **`creditBalance` / `debitBalance` 不对称**是全仓性的(每条退款路径都受影响),已由 `restoreTo` 在收口点解决;仍在用裸 `creditBalance` 退款的其它路径值得单独扫一遍。
