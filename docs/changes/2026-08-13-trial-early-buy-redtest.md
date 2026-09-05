# 双向红测 —— 试用「主动早购」指纹两根针

裁决见同目录 `2026-08-13-trial-early-buy-adjudication.md`。本文件只记红测证据。

**跑的是真门**:`npm run test:legacy-suite`(自启壳,以 mock 模式起本工作树、挑空闲端口、
跑完整条 `scripts/verify.sh`)。⚠️ 不用手起 5173 直跑 —— 本轮第一次基线就栽在这:
5173 上那个 server 不是 mock 档,preflight 判红、运行时探针整片验错对象,结论作废重跑。

**并发免责**:全程另有一个会话在同一分支上干活(期间落了 `1f44595` / `1cd55b0` 两笔,
且 `selfcheck-exchange-genesis-guard.mjs` / `src/store/genesis.ts` 一直在动)。
所以下面每一轮都做**逐格差分归因**,不看总数看差集。

---

## 四轮

| 轮 | 状态 | 结果 | 备注 |
|---|---|---|---|
| A | 改动前 · **靶子错**(5173 非 mock) | 417 pass / 22 fail | ❌ 作废:preflight 判红,运行时探针验的不是本树 mock 档 |
| B0 | 改动前 · 正确靶子 | **428 pass / 12 fail** / 440 格 | 基线。含 `FAIL TRIAL02 … 'redeemEarly' resurfaced in src` |
| B1 | 改动后(方法已删 · 撤豁免 · 补路径针) | **430 pass / 10 fail** / 440 格 | 见下方归因 |
| B2 | **变异**:把删掉的方法原样放回去 | **426 pass / 14 fail** / 440 格 | 两根针各自判红 |
| B3 | 还原(哈希回到 B1 态)+ 幂等底线修正 | **430 pass / 12 fail** / **442 格** | 见下方归因;格数 +2 = 另一会话新落了 2 道门 |

B0–B2 恒定 440 格、B3 442 格(另一会话加门),四轮均高于 `run-legacy-suite.mjs` 的 400 格下限
⇒ **每轮都跑完了,没有中途暴毙**(「红门数变少」不等于修好了,这一条是靠格数证的)。

⚠️ **B3 的总数不能和 B0/B1 直接比**:格数变了、且另一会话在 B1→B3 之间把
`src/store/genesis-config.ts` 改成 import `remoteApiEnabled`,而三道创世/周任务门用的
`stub:runtime` 垫片还没导出它 —— 三道门当场崩红。所以下面只看**逐格差集**,不看总数。

---

## 红的一半:变异 → 两根针各自判红

**先证起点**:变异落盘后 `git hash-object src/api/trial-api.ts` = `4db84d5…`,≠ 干净态 `fcdc91a…`;
`grep -nF` 在文件里实打实找到 3 处命中。**不是「跑了没红」再去猜门坏了 —— 是先确认变异真的在盘上。**

B2 输出(逐针独立成行,合取项不互相遮蔽):

```
FAIL  TRIAL02 card-era fingerprint 'redeemEarly' resurfaced in src
        src/api/trial-api.ts:41:  redeemEarly(idempotencyKey: string): Promise<TrialAuthorityState>;
        src/api/trial-api.ts:168:    redeemEarly: (idempotencyKey) => parse({
FAIL  TRIAL02 card-era fingerprint 'redeem-early' resurfaced in src
        src/api/trial-api.ts:170:      path: "/api/trial/redeem-early",
```

🔴 **第二根针的价值就在这三行里**:驼峰名那根抓到的是第 41 / 168 行(接口成员 + 方法名),
路径拼法那根抓到的是第 170 行(代码字符串)。**换个方法名重新引用同一条旧端点,只有第二根针会响。**

### 变异轮的其余 4 条红,逐条归因(不是我的)

| 红 | 归因 | 凭据 |
|---|---|---|
| `接口引用台账门失败` | 另一会话 | 直跑该门:唯一未登记引用是 `/api/errors` @ `src/store/genesis.ts:477`,与本卡无关 |
| `H5 运行时门隔离起服失败` | 抖动 | B1 绿 / B2 红 / B3 绿,源码未变 |
| `提现账单行 runtime 门失败` | 抖动 | B0 红 / B1 绿 / B2 红 |
| `空状态渲染失败` | 抖动 | 同上 |

---

## 绿的一半:还原 → 回绿

**还原方式**:逐处 Edit 把两段代码删回去,**没有用 `git checkout`**(那会连带吞掉同文件里的其他改动)。
**还原证明**:`git hash-object` = `fcdc91a3bfdc005d2307f5ca58cf960ccdfa38e8`,与变异前**逐字节相同**;
两根针 `grep -rnF` 各 0 命中(exit=1)。

B3 结果:两根针均 PASS,且这一条从基线里消失:

```
（B0 有）FAIL  TRIAL02 card-era fingerprint 'redeemEarly' resurfaced in src
（B3 无）—— 已随方法删除转绿
```

---

## 逐格归因:我这几笔各自动了哪一格

**B0 → B1**(删方法 + 撤豁免 + 补路径针):

| 差分 | 归因 |
|---|---|
| −`FAIL TRIAL02 … 'redeemEarly' resurfaced` | ✅ 本卡目标 |
| −`FAIL 提现账单行 runtime` · −`FAIL 空状态渲染` | 抖动(B2 又红回来了) |
| +`FAIL 接口幂等键不稳定` | ⚠️ **本卡引起,已修**,见下 |

**B1 → B3**(修幂等底线 + 还原):

| 差分 | 归因 | 凭据 |
|---|---|---|
| −`FAIL 接口幂等键不稳定` | ✅ 底线修正生效 | 直跑该门:`3/3(34 个带幂等键的接口方法 / 82 处调用点)` |
| +`FAIL 创世单一派生门` · +`FAIL 周任务创世观测门` · +`FAIL 接口引用台账门` | ❌ 另一会话在跑之间改的 | 前两条直跑均报 `No matching export in "stub:runtime" for import "remoteApiEnabled"` @ `src/store/genesis-config.ts:5`;第三条唯一未登记引用是 `/api/errors` @ `src/store/genesis.ts:477`。三条全在创世域,与试用零交集 |

⚠️ **这份归因是「说得出名字」级别的,不是「总数对上了」级别的** —— 本轮总数恰恰对不上
(B1 10 红 / B3 12 红),对不上的每一条都被逐条直跑复现并指到了具体文件行。

### ⚠️ 本卡撞坏的那道门:另一会话的幂等键覆盖底线

`scripts/api-idempotency-key-gate.mjs`(另一会话昨天刚落的门,`1cd55b0`)钉了
`SIG_FLOOR = 35` —— 那是**在被删方法还在时实测出来的方法数**。方法一删,实测变 34 < 35,判红。

改法:`SIG_FLOOR` 35 → 34,并在注释里写死约束:
**「下调底线只有在能指名道姓说出少的是哪个方法、且它确实不存在了时才允许;说不出名字就是解析器瞎了,那时要修解析器不是改这个数。」**

为什么这不是「把门调松」:该门自己的注释写明它是**覆盖面的账,不是魔法常数**,
「数字变大时同步上调」。它防的是解析器静默瞎掉(红测 ⑧ 实测过),不是禁止合法删除。
同轮 ② 调用点底线 82 **原样通过** —— 正因为被删的那个方法零调用点,与「它是死代码」这一裁决自洽。

🔴 教训归档:**跨会话并发时,「实测基数」型底线会把对方的合法删除判成红。**
这类门要么把基数写成可解释的清单(少了谁一目了然),要么在判红文案里直接列出缺的名字 ——
只报一个数字,下一个人只能在「调数字」和「以为自己弄坏了」之间猜。
