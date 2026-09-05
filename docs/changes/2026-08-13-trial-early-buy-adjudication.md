# 试用「主动早购」接口方法的裁决 —— 删除,并撤销同日那条豁免

> 立卡来源:`scripts/verify.sh` 的 FEAT-TRIAL02 哨兵在 2026-08-13 给 `redeemEarly` 开了一条
> 「名字 × 文件」的临时豁免,并写明「豁免是临时的,取决于这张卡的结论」。
> 本文件是那张卡的结论 + 证据链。

## 判定

**删掉 `src/api/trial-api.ts` 的 `redeemEarly` 方法与接口成员,并撤销 verify.sh 里对它的豁免。**

它不是「接口先行」,是**改名之后没跟上的残留**。

---

## 一、这个端点是什么(不从名字推断,从两份权威文档比对得出)

卡时代的前端 PRD 与现行前端 PRD,同一张 §9.11a.2 用户端端点表里的**同一行**:

| | 端点 | 用途原文 |
|---|---|---|
| 卡时代(repo 内 `PRD/` 旧副本,2026-07-28) | `/api/trial/redeem-early` | 主动早购,server 调 PSP 扣 `trialPriceUSD` − 早购促销(`discountRate` 封顶 `discountCapUSD`)− 收益抵扣(`min(shadow, trialOffsetCapUSD)`);`remainderUSD` 购后入余额。返回价格拆解供二次确认弹窗预览 |
| 现行(根 PRD `D:\WORKS\PLAN\PRD\NexGrid_产品功能架构设计文档_v3.7.md`,2026-08-12) | `/api/trial/convert` | 用抵扣金购机,server 结算 `trialPriceUSD` − 早购促销(`discountRate` 封顶 `discountCapUSD`)− 收益抵扣(`min(accrued, trialOffsetCapUSD)`);`remainderUSD` 购后入余额。返回价格拆解供结算页确认前预览 |

**结算公式逐字相同**,差异只有两处,且都是 2026-08-02 无卡化(FEAT-TRIAL02)带来的必然改写:
「server 调 PSP 扣」→「用抵扣金购机」(卡没了)、「二次确认弹窗」→「结算页确认前」(合规前置改到结算页)、
`shadow` → `accrued`(卡时代管试用累计收益叫 shadow)。

⇒ **语义 = 试用期内主动把试用结成购机(提前转正)**,`/api/trial/redeem-early` 是它改名前的旧名。

签字规格 `D:\WORKS\PLAN\PRD\specs\FEAT-TRIAL02-cardless-trial.md` 独立佐证:状态机只有
`active | grace →(用抵扣金购机)converted`,全文没有 redeem 概念。

### ⚠️ 有一件事本地确认不了,已交底给后端

**后端服务上现在到底还挂不挂 `redeem-early` 这条路径**,本仓无从核实:后端是另一个单体仓
(见 U-14:本机全盘搜不到 `AppWithdrawalService.java`),没有可调的环境,交接书里也没有试用条目。
已加 **U-17** 请后端确认以哪个名字为准,并写明:若线上真是旧名,我们按后端的名字重接。

同时写进 U-17 的一条反向事实:**就算名字对上,被删的那个方法也用不了** ——
PRD 说这个端点返回**价格拆解**,而该方法解析的是 state 信封(`parseTrialAuthorityState` 要求
`authoritative` / `state` / `version` / `serverNowEpochMs` / `source` / `paymentRail`),
真收到价格拆解会直接抛 `TRIAL_RESPONSE_INVALID`。响应契约本来就对不上。

---

## 二、为什么它此前零调用却存在 —— 遗留,且是「一半的移植」

时间线(逐笔回源):

| 时间 | 事件 | 对本方法的影响 |
|---|---|---|
| 2026-07-28 `82d4f51` | 建 `src/api/trial-api.ts`,镜像**卡时代**契约 | 建出 `redeemEarly`(当时返回 `TrialSnapshot \| TrialChargeFailure`),同批还有 `/api/trial/extension` |
| 2026-08-02 包 F(`9ac923f`,FEAT-TRIAL02) | 去绑卡不回潮:删 store 侧 `redeemEarly` / `startWithCard` / `acceptExtension` / `markChargeFailed`,删页面层 `handleRedeem`,转化动作定为 `convert()`;根 PRD 同步改名 | 服务端侧的名字没人跟着改 |
| 2026-08-12 `5d3c92e` | 重写 `trial-api.ts` 为无卡 authority 契约 | **丢了 `extension`、留了 `redeemEarly`**,没加当前 PRD 要求的 `convert`,也没接任何消费点 |

判「遗留」不判「接口先行」的三条独立证据:

1. **名字站在改名的错误一侧** —— 用的是被 PRD 退役的旧名,不是现行的 `convert`。
2. **同一次重写里,兄弟方法被删了、它被留下** —— 如果是有意的前瞻设计,不会只保留一个卡时代
   端点而删掉另一个;这是逐行搬运时的漏网,不是选择。
3. **响应契约对不上**(见上)—— 真要接这个端点,写出来的解析器不会长这样。

---

## 三、删除前的依赖排查(证「没有别的门 / 别的路径依赖它」)

| 面 | 结果 |
|---|---|
| `src/` 消费点 | 0(`trialApi` 本身在用,但只用到 `state` / `eligibility` / `start` / `cancel`) |
| `scripts/` 门与测试 | 只有 `verify.sh` 的 TRIAL02 配对;`h2-trial-remote-api.test.mjs` 只断言 `start:` 与 `body: { deviceName }`,不碰本方法 |
| 接口台账哨兵 `endpoint-citation-sentinel.mjs` | **从来没看见过它** —— 该门 `if (!isComment[i]) return;`,**只扫注释行**;本方法的路径是代码字符串 `path: "/api/trial/redeem-early"`。所以「不在台账里」不是漏登记,是**扫不到**;而且台账规则②「台账有、代码注释没有 → 判红」意味着它**根本没法登记**,除非先在注释里引用它 |
| tsc | 接口成员与实现同批删除 |

未删任何文件,故无 `.trash` 归档(本仓「删文件先 Move 到 .trash」是文件级规矩;本次是方法级编辑,历史在 git)。

---

## 四、同日那条豁免:它从没生效过

`0765bf0` 的提交信息写「三条指纹判据直跑全绿」「红测:塞一个 `redeemEarly` → 判红;还原 → 全绿」。
**对 `redeemEarly` 这条,两句都不成立。**

那笔改动把名字加进了新的「名字 × 文件」配对循环,但**没有从上面的全禁名单里删掉**
(提交信息里自述「已从全禁名单移出」,diff 里那一行一个字没动)。后果是同一次跑里:

```
FAIL  TRIAL02 card-era fingerprint 'redeemEarly' resurfaced in src        ← 全禁名单那轮
PASS  TRIAL02 src fingerprint 'redeemEarly' = 0 outside allow-list [...]  ← 配对那轮
```

一条红、一条绿,紧挨着。「还原 → 全绿」读的是下面那条。
**这是「弄坏会红」验了、「还原会绿」没验的典型**:红测只做单向,起点本身是红的都看不出来。

本次删除同时消掉这条 FAIL 与那条已无意义的豁免。

---

## 五、新增判据

在 TRIAL02 全禁名单里补一条 **`redeem-early`(路径拼法)**。

why:只钉驼峰名 `redeemEarly` 的话,**换个方法名重新引用同一条旧端点**一个字都抓不到 ——
被删的那处命中恰恰是 `path: "/api/trial/redeem-early"` 这种代码字符串。而接口台账哨兵只扫注释行,
代码字符串是它的盲区,所以这里是那块盲区在试用域的唯一覆盖面。

---

## 六、拆出去的卡(本卡确证、但不属于本卡范围,一律不修)

### 卡 1 🔴🔴 真后台档下试用转化整条链没接线

`src/store/free-trial.ts` 的 `convert()` 第一行是 `if (remoteApiEnabled) return false;`,
而结算页 `src/pages/store/checkout.vue:1096` 是 `if (applyTrial && !freeTrial.convert())` ——
真后台档下扣款成功后必然走进回滚分支。接口层也没有 `convert` 方法(本卡确认过:整个
`trial-api.ts` 只有 state / eligibility / start / cancel)。

即:**真后台档下,持试用的用户走不完结算**。mock 档不受影响(现在跑的就是 mock 档),
所以所有机器门与实景走查都看不到它。

不在本卡修的理由:这是接一条服务端资金链路(请求体 / 价格拆解响应 / 幂等键 / 失败态),
要后端契约先落(已进 U-17),属功能实现不属残留清理。

### ✅ 卡 2(已做 · 主人 2026-08-13 拍板「先焊门再收存量」,见 `2026-08-13-endpoint-ledger-code-surface.md`)接口台账哨兵看不见代码字符串端点

> ⚠️ **下面这个「51 条」是错的,留作错题**:当时的临时正则漏了全部 `${}` 模板串,
> 而模板串形态占一大半。焊完门实测是 **77 条**。教训:**用临时正则量出来的底数不算数**,
> 要用最终要焊进门里的那套归一化去量。

`endpoint-citation-sentinel.mjs` 只扫注释行。实测:`src/` 下**代码字符串**形态的 `/api/...`
共 73 条不重复,其中 **51 条不在台账里**(逐条列表见本卡附录脚本输出,含
`/api/genesis/purchase`、`/api/stakes`、`/api/payment-methods/bind`、`/api/points/sign-in` 等)。
本卡处理的那条只是其中一例 —— **同型缺陷至少还有 50 个**。

不在本卡修的理由:按本仓铁律,覆盖类任务要**先焊机器门再收存量**;而这 51 条每条都要回 PRD
核出处或写明 TBD 理由,是独立一张卡的工作量,顺手补进来只会变成一批没核实的台账条目。

### ✅ 卡 3(已修 · 主人 2026-08-13 当场拍板做,commit `27ce4fb`)`docs/业务流程说明.md` §1 整节仍是卡时代

该节完整描述**绑卡 → 自动扣款**的试用流程(`startWithCard` / `autoChargeAtEnd` /
`acceptExtension` / `markChargeFailed` / `redeemEarly` / `handleAutoRedeem` /
`me/trial.vue handleRedeem`),全部动作在 2026-08-02 包 F 已删除。
它描述的正是 FEAT-TRIAL02 明令禁止的那套流程。

TRIAL02 哨兵只扫 `src`,扫不到 docs;而把 docs 纳入扫描需要豁免清单(变更卡本身就要引用旧名,
本文件即是),属独立设计。**风险很实:下一个人照这份文档「恢复」旧行为是完全可能的。**

**处理**:主人当场拍板做,已按签字规格 + 回源读现有实现重写 §1.1–§1.9(`27ce4fb`)。
顶部留了醒目的重写说明写清「旧版讲的是什么、为什么不能照做」—— 删过期内容不等于删事故叙事。
⚠️ **根问题没解**:docs 仍在所有指纹门的扫描面之外,下一份过期文档照样没人会响。
「把 docs 纳入扫描 + 建豁免清单」仍是待办。

---

## 七、机器门

见本文件同目录 `2026-08-13-trial-early-buy-redtest.md`(双向红测记录)。
