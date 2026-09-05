# R5 五项(两条路线下都成立)· 红测留痕 — 2026-08-04

对应实现:`fix(money): 回滚失败不再静默 + 质押存储异常如实回报 + 试用消耗排在扣款后 + 并发回滚不造钱(R5 五项)`
背景与路线选择:`docs/changes/2026-08-04-structural-reflection-r5.md`(路线 A/B 待主人拍板;本轮只做两条路线下都成立的 5 项)。

## 方法学(每条都照做)

- **按合取项逐个隔离**:一个断言里有几条独立成立的要求,就分几次注入,每次只破坏一条 ——
  同时破坏两条时,靠 A 红了而 B 从没被验过。
- **注入形态取自真实事故现场**:①③⑤ 的注入就是缺陷本体的原貌(把修好的代码改回去),不是随手造一个坏值。
- **`cp` 备份还原,禁 `git checkout`**:本仓多方并发,工作树里有别的 agent 未提交的改动。
- **注入未生效必须报错终止**:跑手比对注入前后 sha256,没变化直接抛错,拒绝把空转当红测。
- **还原后 byte-identical + 复绿**:还原后再算一次 sha256 必须与注入前逐字节相同,并重跑该门确认回到全绿。

跑手:`<scratchpad>/r5-redtest.mjs`(一次性脚本,不入库)。

## 逐靶结果

| # | 项 | 注入(破坏的那一条合取项) | 门 | 注入后 | 关键 FAIL 行 | 还原 |
|---|---|---|---|---|---|---|
| R1 | ① | `staking.ts` 存储异常分支改回「只塞内存 + 返回 ok:true」 | money-rollback | exit 1 | `① storage 写不进去 → ok=false` / `① 仓位既没落盘也没进内存 — disk=0 mem=2` / `⑥ 分支不再写内存兜底` | byte-identical + 28/0 |
| R2a | ② | `money-receipt.ts` **第 2 处**(收据腿)回滚返回值改回丢弃 | money-rollback | exit 1 | `② 结果可分辨(stuck)— outcome=failed` / `② 用户看到的不是通用「交易未保存」— ["error","Transaction not saved"]` / `② 还原快照进待对账队列` | byte-identical + 28/0 |
| R2b | ② | 同上但破坏**第 1 处**(资金腿)—— 另一条合取项单独隔离 | money-rollback | exit 1 | `⑥ 两处回滚返回值都被消费 — 命中 1 处(期望 2)` / `⑥ 没有任何一处裸调 restoreMoney` | byte-identical + 28/0 |
| R2c | ②b | `app.ts` 摘掉「无事可回滚」短路 | money-rollback | exit 1 | `②b 一分钱没动过 → failed(不是 stuck)— stuck` | byte-identical + 28/0 |
| R3 | ③ | `checkout.vue` 把 `convert()` 挪回扣款之前(缺陷原貌) | checkout-trial-quote | exit 1 | `⑤convert 拒绝 → 刚扣的钱被精确退回` / `⑤退款也失败 → 响亮终态` / `W8 convert 判定在扣款之后` / `W8b 退款返回值被消费` | byte-identical + 52/0 |
| R3b | ③ | 同文件只破坏「退款返回值被消费」(顺序不动) | money-rollback | exit 1 | `⑥ 结算页:convert 排在扣款之后,且失败时退款 + 消费返回值` | byte-identical + 28/0 |
| R3c | ③ | **判据自身**:结算切片终点改回扣款那一行(切少了 = 静默漏测) | checkout-trial-quote | exit 1 | `checkout.vue 结算切片里没有 convert() —— 切片区间与实现已经对不上` | byte-identical + 52/0 |
| R4a | ④ | 往 `stake-sheet.vue` 注入一处裸调 `bills.addMany([...])` | money-receipt | exit 1 | `⑥ 裸调 bills 写入不许新增 — stake-sheet.vue: 1 > 0` | byte-identical + 61/0 |
| R4b | ④ | **判据自身**:同一处注入 + 把名单退回 R5 之前(无 `addMany`) | money-receipt | **exit 0** | 一条都没抓到 —— 证明 R5 之前多腿原语**零监控**,不是修辞 | byte-identical + 61/0 |
| R5 | ⑤ | `app.ts` 冲正改回写绝对值(缺陷原貌) | money-rollback | exit 1 | `⑤ 各回滚一次后磁盘余额回到 $100 — 实测 $130` / `可提额度 130` / `内存 A=70 B=130` | byte-identical + 28/0 |

R4b 是**反向**红测:期望它**不红**。判据(而不是实现)被退回旧版后,同一处真实缺陷完全不被察觉 —— 这正是
「哨兵会假绿不会报错」的活体证明,也是 ④ 那一项存在的理由。

## ⑤ 的并发靶长什么样(为什么单实例跑一遍测不出来)

`scripts/selfcheck-money-rollback.mjs` 的 ⑤ 段:pinia stub 按 `globalThis.__nxTab` 分实例,
**两个 store 实例 = 两个标签页**,共享同一份 JSON 序列化的假 storage(与 localStorage 同语义:
跨标签页拿不到同一个对象引用)。复现审计给的场景:

```
磁盘 $100
 tab0: capture → debitBalance(30)   → 磁盘 70(tab0 base=70)
 tab1: capture → debitBalance(30)   → 磁盘 40(tab1 base=40,它的 base 已吸收 tab0 那笔)
 tab0: restoreMoney(undo0)
 tab1: restoreMoney(undo1)
```

- **写绝对值(旧)**:tab0 的 delta = 100 − 70 = +30 → 磁盘 70;tab1 的 delta = 100 − 40 = +60 → 磁盘 **$130**。
  两笔各回滚一次,账户凭空多出 $30(R5 注入实测数字与审计逐字一致)。
- **按增量(新)**:各自只退「我自己动过的 −30」→ 磁盘 70 → **$100**。别的标签页的改动一分不动。

负控同轴:单标签页扣 30 再退,余额精确回到 100(并发修复没有误伤正常路径)。

## 机器门

新增 `scripts/selfcheck-money-rollback.mjs`,已焊进 `scripts/verify.sh` 末段
(`money_rollback_gate`,PASS 行打样本量)。全量 `bash scripts/verify.sh` = **406 pass / 0 fail**。
