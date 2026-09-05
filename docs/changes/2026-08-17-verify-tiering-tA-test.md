# verify 三档制 · Tester A 独立验收报告(T2 / T3)

> 角色:独立黑盒 tester(**非实现方**)· 2026-08-17 · 分支 `pkg/ar-verify-tiering` · worktree `.claude/worktrees/ar-verify-tiering`
> 起跑时 HEAD `9c4018b` · `HEAD^{tree}` `57140dfaa44aaf9c2ba20f65996ddf73fdb861a4`;收尾时工作树带实现方 6 个未提交改动(树指纹 `3fef582454`)。
> 我没有提交任何东西。红测改过的 tracked 文件逐个 `git checkout --` 还原;收尾 `git status --short` 只剩**实现方那 6 个 `M`**(不是我的)+ 本报告 `??`。

## 一句话结论

**三档制骨架是真的**(A1-A4、A6-A10 全 PASS):分档、跳过三态点名、不 fail-fast、树指纹锚定、重试大声、manifest 门的门,逐条实测通过。
**A5 曾是 P0:`type-check` 那一维是一道会假绿的门** —— 我在验收中确认(双向、各复现 2 次),实现方当场改了,**我已对新代码复验通过**。
剩 7 条 P2,最值得拍板的一条:**scoped 档在「改门基建」类包上根本用不上,且即便用上也不是 2-5 min(实测 23.9 min)。**

| # | AC | 判定 | 关键证据 |
|---|---|---|---|
| A1 | runner 非 fail-fast + 步骤分类 | **PASS**(记录是 **2 红**不是 1 红) | 18 步全跑 · `not_run=0` · FAIL = contract-registry **+ h5-runtime** |
| A2 | static 档不需要任何 dev server | **PASS** | exit 0 · 247s · `mode=static` · `0 skip` · `dev server not running` 0 次 |
| A3 | scoped 档按输入交集缩范围 | **机制 PASS · 干净计时 NOT-TESTED**(机械原因) | 命中 `src/store/**` 的门 run:true;`login-entry-chrome-runtime` run:false;`ran 8/10 probes, SCOPED-SKIP 2` |
| A4 | 未声明的门在 static 照跑 | **PASS** | `no meta/ponzi words` 无 `scope_hit` 包裹,static 档 PASS |
| A5 | typecheck 缓存 | **P0 已确认 → 修法已复验 PASS**(1 条设计性偏差保留) | 注入真错:修前 exit 0 假绿 → 修后 **exit 2** |
| A6 | h5-result 复用守卫 | **负向 PASS ×2(实景)· 正向 code-read** | static `复用` 命中 0;树变了真的拒绝复用并重跑 |
| A7 | manifest lint 是真门 | **PASS** | 注入 `tester-bogus` → exit 1 且点名;还原 → PASS |
| A8 | `.verify-chain.code` 两行 | **PASS** | `0` + `mode=static pass=2 fail=0 scoped_skip=16 not_run=0 tree=57140dfa…` |
| A9 | 三个契约测试 | **PASS** | tests 17 / pass 17 / fail 0 · 1s |
| A10 | runtime 步骤重试大声 | **PASS(双向注入式实测)** | 首败后成 = `PASS(after-retry ⚠)`+`.attempt1`;恒败**不洗绿** |

**环境排除声明(墨菲前置)**:验收期同机有别的 tester 在跑浏览器探针,峰值 **62 chrome / 119 node 进程**。浏览器探针的耗时与偶发红一律先归负载,下文逐处标注。`test:contract-registry` 的红是**包外既有红**(`h2-trial-remote-api.test.mjs` 期望 `if (remoteApiEnabled) return;`),不记本包账。

---

## A5 · P0:`type-check:cached` 的 `--incremental` 路径双向给错结论(已确认 → 已修 → 已复验)

### 修前:实测矩阵

靶子:`src/lib/route.ts` 末尾追加 `const __t: number = "x";`(真 TS2322;该文件干净时 88 行)。

| 跑法 | 树的真实状态 | 结论 | 对不对 |
|---|---|---|---|
| `npx vue-tsc --noEmit`(裸跑 = `npm run type-check`) | 有真错 | exit 2 · `src/lib/route.ts(89,7): error TS2322` | ✅ |
| `typecheck-cached.mjs --force --no-incremental` | 有真错 | exit 2 · 同一条 | ✅ |
| `typecheck-cached.mjs --force`(默认档,**无** buildinfo 冷跑) | 有真错 | exit 2 | ✅ |
| **`typecheck-cached.mjs`(默认档,buildinfo 记「上一跑干净通过」)** | **有真错** | **exit 0 · `vue-tsc 0 errors (ran 14.1s · incremental · fp 31d52cda)`** | **❌ 假绿** |
| **`typecheck-cached.mjs --force`(默认档,buildinfo 记「上一跑有错」)** | **完全干净(`git status` 空)** | **exit 1 · 报 `route.ts(89,7)` —— 文件只有 88 行** | **❌ 假红** |
| `npx vue-tsc --noEmit`(同一棵干净树,取 ground truth) | 干净 | exit 0 · 零输出 | ✅ |

两方向各复现 2 次,互为镜像。机制一句话:**warm 的 `--tsBuildInfoFile` 把上一跑的诊断集整套端出来,不管这一跑的源码变成了什么。**

### 为什么当时定 P0

1. **假绿方向正是门存在的唯一理由那一格**:现实顺序永远是「干净树跑绿(buildinfo 记下干净)→ 有人写进一个类型错 → 门说 0 errors」。我复现的就是这条顺序,不是人为构造的罕见次序。
2. **落盘把假绿钉成粘性的**:那一跑后 `.verify-cache/typecheck.json` 是 `{"fp":"31d52cda…","verdict":"pass"}` —— 指纹由**带错源码**算出;之后同一棵错树 0.3s 报 `(cached)` PASS。
3. **两个消费者都在这条路径上,链上再无裸跑对照**:`verify-chain.mjs:118`(三档第 1 步)+ `verify.sh:281`(`[1]` 那格);`npm run type-check`(裸跑)**已不在任何门链上**。即 T2 AC3①「注入 tsc 错 → type-check FAIL」不成立。
4. 环境 `vue-tsc 1.8.27` + `typescript 4.9.5`。`[INFERRED, MED]` 上游 TS 4.x 在 `--noEmit + --incremental` 下语义诊断持久化本就不可靠、vue-tsc 1.x 的 program 包装放大之;**不引 issue 号,判据以上表实测为准**。
5. 当时那棵树**没藏真错**:对干净树裸跑 `vue-tsc` exit 0 零输出 —— 既有那条 `CACHED` 绿在结论上是对的,坏的是机制。

### 修后复验(实现方 20:28 改,我在冻结后的树上重跑)

改法:`noIncremental` 写死 true、真跑改裸 `vue-tsc --noEmit`、顺手删掉历史 `tsbuildinfo`。**全仓 grep 过:除 `npm run type-check` 外 `typecheck-cached.mjs` 是唯一 vue-tsc 调用方,没有第二处 `--incremental` 要同步** —— 修在唯一咽喉上,不是补丁在调用点。

| 复验步骤 | 结果 | 判定 |
|---|---|---|
| 干净树 | exit 0 · `vue-tsc 0 errors (ran 28.3s · 裸跑 · fp aa1ec973)` | ✅ |
| 注入真 TS2322 | **exit 2** · `src/lib/route.ts(89,7): error TS2322` | ✅(修前是 exit 0) |
| FAIL 后的 `typecheck.json` | **文件已删** —— 不存在该错指纹的 pass 记录 | ✅(修前会写 pass) |
| `git checkout` 还原 | exit 0 · `(ran 25.2s · 裸跑 · fp aa1ec973)` | ✅ 指纹回到原值 = 确定性 |
| 同树再跑 | `(cached · fp aa1ec973 · 588 输入文件未变)` | ✅ 缓存仍在省时间 |

**→ P0 判定:已修,已复验。**

**保留的 1 条设计性偏差(不是 bug,但 AC 文本要改)**:AC-A5 写「还原文件后再跑应 `(cached)`」。实测是 `(ran)` —— 缓存是**单槽**(只存最近一次通过的指纹),改回去等于换了指纹、记录不匹配,要真跑一次(25s)。方向是**保守的**(宁可多跑,绝不拿旧裁决冒充新树),故判合格,只建议改 AC 措辞。

**唯一遗留建议**:`typecheck-cached.mjs` **一条自证都没有**。同仓 `verify.sh` 的 `probe_retry_selftest` 就是正确形态(恒败不洗绿 / 首败后成 / 接线 19/19,static 档实测 PASS)。这次 P0 是外部 tester 逮到的,不是门逮到的 —— 建议补一条「注入真错必须红」的变异测试,否则同型第二次仍然只能靠人。

---

## A1 · runner 非 fail-fast + 步骤分类 —— PASS,但记录是 2 红

读既有全量记录 `.verify-cache/last-run.json`(先备份再被后续跑覆盖,备份见文末):

```
mode "full" · requestedMode "full" · upgraded null
verdict "fail" · treeMoved false · dirty false
headTree ed6be5310705730eeaa555fcea13837ba16f6b19 · head 8086ff22365a32c24cc660f77d2c8d6b03599a38
totalMs 1549207(25.8 min)
steps 18 —— PASS 15 · CACHED 1 · FAIL 2 · SCOPED-SKIP 0 · NOT-RUN 0
```

- **不 fail-fast 成立(强证据)**:`test:contract-registry` 在**第 2 步**就红,后面 16 步照跑到底,`not_run=0`;18 步之和 15+1+2 = 18 ✓。
- **三态分类齐**:`.verify-chain.code` 第 2 行 `mode=full pass=16 fail=2 scoped_skip=0 not_run=0 tree=ed6be531…`,与记录逐项对得上;`.verify-exit.code` 第 2 行 `pass=459 fail=0 skip=0 mode=full scoped_skip=0 tree=ed6be531…`。
- **⚠ 与 AC-A1 文本的差异**:AC 写「contract-registry FAIL 而另外 17 步 PASS/CACHED」,实际 **`test:h5-runtime` 也 FAIL**(63.7s · exit 1):
  `FAIL ① 登出态经评审页进业务页,20s 内仍停在 pages/me/wallet-withdraw —— 周期性权限守卫没在工作` / `守卫存活性行为门 2/3 通过 / 1 fail`。
  脆性排除:**同一探针在我今天的 scoped 全跑里 3/3 场景通过** → 归负载抖动,不记 P。但必须点名:**那份记录是 2 红不是 1 红**,拿它当「只剩一条既有红」的凭据会读错。
- **树对象比对**:记录 `headTree=ed6be531…` ≠ 当时 `HEAD^{tree}=57140dfa…`(记录产于上一提交 `8086ff2`)。差异符合预期,如实并列。
- **该记录不能用来证 A10**:steps 条目里**没有 `retried` 字段**,而当前 runner 必写它 —— 记录产于重试特性落地**之前**。同时说明那次 h5-runtime 的红**没被重跑过**(今天的代码会重跑一次)。

## A2 · static 档:无任何 dev server 也跑完 —— PASS

**先证靶子**:`netstat -ano | grep LISTENING | grep -E ':5173|:5399'` → **无命中**。同机在听的是 `5179`(Janus)/ `5174`,与本树无关。

`node scripts/verify-chain.mjs --static`:

| 项 | 实测 |
|---|---|
| exit code | **0** |
| wall | **247s(4.1 min)**(`CLAUDE.md` 写 ~3 min,略低估) |
| `pool:` 行 | **0 次** |
| 汇总 | `PASS 1 · CACHED 1 · FAIL 0 · SCOPED-SKIP 16 · NOT-RUN 0 / 18 步` + 明写「不等于全量绿」 |
| verify.sh banner | `mode=static(请求 static → 改动命中全局不变量清单… → 静态门全跑(不起 server))· tree 57140dfaa4` |
| verify.sh 结果行 | `━━ result: 433 pass, 0 fail, **0 skip**, **17 scoped-skip** · mode=static(≠ 全量绿…)━━` |
| `.verify-exit.code` 第 2 行 | `pass=433 fail=0 skip=0 **mode=static scoped_skip=17** tree=57140dfaa44aaf…` |
| `dev server not running` | **0 次** |

`0 skip` 的机制(回源核过,不是碰巧):那些 `skipped "dev server not running"` 分支**整段被 `scope_hit` 包在外面**(如 `route-http`:`if scope_hit route-http; then … else skipped … fi; fi`),static 走不到;而末尾判据是 `[ $fail -eq 0 ] && [ $skip -eq 0 ]` —— static 能 exit 0 靠的正是这个结构,不是「exit 只看 fail」的特例。

四步 reason 逐条核过:`test:h5-runtime` / `test:session-reload-recovery` / `test:withdraw-status-mirror` = `SCOPED-SKIP(static:需要 dev server)`;`build:h5` = `SCOPED-SKIP(full-only(只在全量档跑))`。11 个 test 类步骤全部 `SCOPED-SKIP(static:测试套件留给 scoped/full)`,与 AC 逐字一致。verify.sh 侧 17 条 SCOPED-SKIP 全部点名,真跑的 3 道全是 static 类(`store-unreachable` / `withdraw-rail-alias-redtest` / `remote-refresh-resilience`)。

**第二次独立复现**(A6 那轮,实现方改动后的树 `3fef5824`):裸跑 `VERIFY_MODE=static bash scripts/verify.sh` = **146s · exit 0 · 433 pass / 0 fail / 0 skip / 17 scoped-skip**。static 档在两棵不同的树上都稳。

> chain 报 `scoped_skip=16`(18 步跳 16)与 verify.sh 报 `scoped_skip=17`(20 道重门跳 17)是**两个计数面**,不矛盾。

## A3 · scoped 档 —— 机制 PASS;干净计时 NOT-TESTED(有机械原因)

### ① 按 AC 原样跑:`plan --mode scoped` 是 **full**,不是 scoped

```
mode: full | requested: scoped
upgraded: 改动命中全局不变量清单:.claude/hooks/verify-on-stop.mjs, package.json, scripts/gates.manifest.json, … → 升 full
```

**11 个命中 `globals` 的文件全是本包自己的提交**(不是脏文件):`.claude/hooks/verify-on-stop.mjs` · `package.json` · `scripts/gates.manifest.json` · `scripts/lib/dev-server-pool.mjs` · `scripts/lib/find-bash.mjs` · `scripts/lib/verify-scope.mjs` · `scripts/run-legacy-suite.mjs` · `scripts/typecheck-cached.mjs` · `scripts/verify-chain.mjs` · `scripts/verify-h5-runtime.mjs` · `scripts/verify.sh`。
升档行为**本身是对的**(保守方向,正是 T3-AC2 要的,原因也打印齐全)。但推论是 P2-1:**只要一个包在改门基建,它整条命的 scoped 档就不可用** —— 本包全程如此。

### ② 让 scoped 真的生效(`VERIFY_MAINLINE=HEAD`,改动集 = 只有那个探针文件)

靶子:未跟踪文件 `src/store/__tester-scope-probe.ts`(`export const x = 1;`)。`plan --mode scoped` → `mode: scoped`、`upgraded: null`、改动集 1 个文件。

| 门 | 判定 | reason |
|---|---|---|
| `store-unreachable` | **RUN** | `hit:src/store/__tester-scope-probe.ts` |
| `spec4-runtime` | **RUN** | 同上 |
| `dom-qa-runtime` | **RUN** | 同上 |
| `login-entry-chrome-runtime` | **skip** | `scoped:输入未变`(它不声明 store 输入)← AC 要的那条 |
| `theme-constant-runtime` / `zero-border-runtime` / `tap-feedback-runtime` / `orphan-line-runtime` | skip | `scoped:输入未变` |
| 计数 | gates RUN 15 / skip 5 · steps RUN 17 / skip 1(`build:h5` full-only)· h5Probes RUN 8 / skip 2 |

### ③ `verify-chain --scoped` 全跑(23.9 min · exit 1)

- **子探针缩范围实景成立**:`test:h5-runtime` PASS 393.1s,日志末行
  `H5 runtime gates: PASS (isolated server 53155, 22 scenarios + 6 direct probes · scoped: ran 8/10 probes, SCOPED-SKIP 2)`,
  并逐个点名 `SCOPED-SKIP sticky-check.mjs(输入未变,H5_RUNTIME_ONLY 未列出)` / `SCOPED-SKIP backnav-check.mjs(…)` —— **与 ② 的机器跑单完全一致**(8 跑 2 跳)。
- 汇总:`PASS 15 · CACHED 0 · FAIL 2 · SCOPED-SKIP 1 · NOT-RUN 0 / 18 步`;verify.sh 侧 `scoped-skip 5`。
- **树指纹守卫实景触发**(意外但正好):`⚠ 跑的过程中工作树变了(adb2f30558 → 3fef582454),本次结论不锚定任何一棵树,合并守卫不认` —— 因实现方 20:28 改文件(见「过程记账」)。守卫按设计工作。
- **该轮 legacy 结论作废**:实现方同时改了**正在被 bash 读的** `scripts/verify.sh` → `line 3715: og: command not found` + `line 3716: syntax error near unexpected token 'fi'`(bash 惰性按字节偏移读脚本,改动使解析错位)→ `test:legacy-suite` FAIL 902.9s。
  该轮 legacy 另有一条 `FAIL 资金 ⊗ 收据门失败`:**冻结后单跑不可复现**(`node scripts/selfcheck-money-receipt.mjs` = exit 0 · `91 pass / 0 fail`,**带**与**不带**探针文件各跑一次都绿),且失败行下没有任何明细 → 归入那段并发改写窗口,不记 P。
- **23.9 min 这个数是上限,但已足够说明问题**:其中 ~6.5 min 是 H5 门因树变了**重跑**;即便复用成功也约 17-18 min。对照 `CLAUDE.md` 的 scoped「2-5 min」差一个量级。根因不是实现 bug 而是**清单设计**:`src/store/**` 被几乎每道 runtime 门声明为输入,11 个 test 步骤又都声明 `src/**`+`scripts/**`,所以「碰一个 store 文件」= 15/20 门 + 17/18 步。scoped 只在改窄面(如单个 `src/pages/onboarding/**`)时才快。

### ④ 为什么不补一次干净计时

冻结后复算:实现方那 6 个未提交改动里有 4 个命中 `globals`(`verify-on-stop.mjs` / `gates.manifest.json` / `typecheck-cached.mjs` / `verify.sh`),而**工作树脏文件永远进改动集、任何 base 都绕不开** → 现在跑 `--scoped` 必升 full(实测 `upgraded: 改动命中全局不变量清单… → 升 full`)。即在实现方的改动落地(提交或还原)之前,**干净的 scoped 计时机械上不可能产出**。故按主派单授权标 NOT-TESTED-clean,证据以 ①②③ 为准。

## A4 · 未在 manifest 声明的门在 static 照跑 —— PASS

`scripts/verify.sh:620` 的 `sentinel_absent "no meta/ponzi words" …`:回源看结构,它上面最近的 `scope_hit`(`server-health-preflight`,:553)在 `[3] grep sentinels over src/` 之前就 `fi` 收掉,该哨兵**处在顶层、无任何 `scope_hit` 包裹**。static 日志:`PASS  no meta/ponzi words (0 hits)`。→「未声明 = 照跑」的保守兜底真的成立,不是靠 manifest 恰好列了它。

## A6 · h5-result 复用守卫 —— 负向 PASS ×2(实景)· 正向 code-read

回源(`scripts/verify.sh:3702-3717`):`if scope_hit h5-runtime-isolated; then` 包住整格;里面**重新算一次当前树指纹** `_h5_tree_now`,只有 `H5_RUNTIME_REUSED_TREE` 与它**全等**才走 `ok "H5 运行时门 — 复用本轮 runner 已跑过的同树结果…未另起服"`,否则走 `probe_retry … verify-h5-runtime.mjs` 真跑。runner 侧只在 `test:h5-runtime` **PASS** 后才把指纹传下去(`verify-chain.mjs:141` / `:130`)—— 红的结果不会被复用。

| 方向 | 实测 |
|---|---|
| **负向 a**:`H5_RUNTIME_REUSED_TREE=deadbeef VERIFY_MODE=static bash scripts/verify.sh` | `复用` 命中 **0 次**;该格 `SCOPED-SKIP h5-runtime-isolated(static:需要 dev server)`;146s · exit 0。static 先被 `scope_hit` 挡掉,伪指纹根本进不了判断 |
| **负向 b(实景,非我安排)**:scoped 全跑中途树真的变了 → 指纹不等 | 门**拒绝复用**,真跑了第二遍 8 个探针:`PASS H5 运行时门隔离起服 — … scoped: ran 8/10 probes … ⚠ after-retry`(多花 ~6.5 min)。**「树动过一个字都不复用」是实景成立的** |
| **正向**:指纹相等时打印 `复用` | **NOT-TESTED**。要它必须让 verify.sh 走到末尾且 `SCOPE_MODE≠static`,即一次带 server 的 full/scoped verify.sh(15-22 min);而如 A3-④ 所述现在也造不出稳定的 scoped 档。判定按 code-read:条件与分支正确,且**失败方向是保守的**(不等就真跑,不是默认复用) |

## A7 · manifest lint(门的门)是真门 —— PASS

```
基线:             lint PASS —— gates 20 · steps 18 · h5Probes 10 · globals 27;全部接线一致、glob 均命中   (exit 0)
注入 tester-bogus: lint FAIL:
                   - manifest.gates.tester-bogus 在 verify.sh 里没有 scope_hit 调用点(声明了却没接线 = 空转)  (exit 1)
cp 还原后:         lint PASS —— gates 20 · steps 18 · h5Probes 10 · globals 27                              (exit 0)
```

红测**点名**了 `tester-bogus`,还原后回绿。这道门同时挂在 `verify.sh` 里三档都跑(static 跑里 `PASS gates.manifest 接线门`),不是只能手跑的脚本。

## A8 · `.verify-chain.code` 两行 —— PASS

我的 static 跑之后(`wc -l` = 2):

```
0
mode=static pass=2 fail=0 scoped_skip=16 not_run=0 tree=57140dfaa44aaf9c2ba20f65996ddf73fdb861a4
```

第 1 行纯退出码(老读法 `cat` 直接跟 0 比不受影响),第 2 行带 `mode= / pass= / fail= / scoped_skip= / not_run= / tree=`。A10b 那轮另见 `not_run=17` 被如实写进第 2 行。

## A9 · 三个契约测试 —— PASS

`node --test scripts/server-session-reload-recovery-contract.test.mjs scripts/withdraw-terminal-reason-parity.test.mjs scripts/probe-safety-contract.test.mjs` → `tests 17 · pass 17 · fail 0 · duration_ms 456`,wall 1s。
其中 `probe-safety-contract` 正好守着本包的新风险:「缩范围只挡执行、不许动接线」(每条探针保留字面量 `runGate("<探针>")` 供取证)+「接线 runtime 门必须还挂在 verify 链上(防它变成孤儿)」。

## A10 · runtime 步骤失败重跑 1 次且大声 —— PASS(双向注入式实测)

回源:`verify-chain.mjs:135-153`,只对 `manifest.steps[step].kind === "runtime"` 重跑一次,首败日志 `copyFileSync → *.attempt1`,状态取**第二次**,记录写 `retried:true` + `reason:"after-retry ⚠(首跑 exit N)"`。

无法靠改 tracked 文件制造抖动,所以用**未跟踪的 `--require` 注入**造首跑失败(先自证注入生效:attempt1 exit=1 / attempt2 exit=0),靶子 `test:withdraw-status-mirror`(kind=runtime):

| 变异 | 实测 | 判定 |
|---|---|---|
| **① 首败后成** | `↻ 首跑红(runtime 类步骤),重跑 1 次,首败日志 ….attempt1` → `✓ PASS 22.5s (after-retry ⚠ 首跑 exit 1)`;汇总行 `PASS test:withdraw-status-mirror 22.5s after-retry ⚠(首跑 exit 1)`;`.attempt1` 落盘且内容是首败输出;记录 `{"status":"PASS","retried":true,"reason":"after-retry ⚠(首跑 exit 1)"}` | ✅ 大声,不静默 |
| **② 恒败** | 两跑都红 → `✗ FAIL`、记录 `{"status":"FAIL","code":1,"retried":true}`、exit 1 | ✅ **稳定红不被洗绿** |
| ③ `--only` 的没跑步骤 | `not_run=17` 且 `verdict=fail` | ✅ NOT-RUN 不算绿 |

同族的 verify.sh 侧 `probe_retry` 自带红测,static 跑里实测 `PASS probe-retry selftest(恒败不洗绿 · 首败后成大声转绿 · 接线 19/19)`。**runner 侧目前没有同款自证**(我这次是外挂注入证的)—— 建议照抄一条,理由同 A5 末尾。

---

## P2 清单(逐条可独立拍板)

| # | 事实 | 影响 | 建议 |
|---|---|---|---|
| P2-1 | **scoped 档对「改门基建」类包不可用**:本包 11 个已提交文件命中 `globals`;实现期只要有一个 globals 文件是脏的也照样升 full(两种情形均实测) | 本包全程没有内循环加速可用;未来每个动 `verify.sh` / manifest / `package.json` 的包同理 | 接受(保守方向正确),但把适用条件写进 `CLAUDE.md`:「改门基建的包 scoped 恒等于 full」 |
| P2-2 | **即便 scoped 生效也不是 2-5 min**:碰一个 `src/store/**` 文件 = 15/20 门 + 17/18 步,实测 **23.9 min**(去掉意外重跑约 17-18 min) | `CLAUDE.md` 的「2-5 min」会误导排期 | 数字改成「窄面 2-5 min / 碰 store 约 18 min」,或把 `src/store/**` 这类超宽输入声明拆细 |
| P2-3 | **`SCOPE_BASE` 被 verify.sh 单向丢弃**:`verify.sh:193` 的 `SCOPE_BASE=""` 会覆盖**继承来的已导出**同名变量(实测子进程看到 `""`),而 chain runner 认这个 env → 同一轮里两半可能按不同 base 算改动集 | 只在人为传 `SCOPE_BASE` 时踩,但两半口径不一致是隐性坑 | 改成 `SCOPE_BASE="${SCOPE_BASE:-}"`,或文档化「verify.sh 只认自己算的 base」 |
| P2-4 | **full 档 25.8 min,未达 T2 AC2 的 ≤18 min**(legacy 一步 22.4 min);`CLAUDE.md` 现写 `~24 min` 也略低于实测 | AC 未达 + 排期偏乐观 | 补一次达标实测,或把 AC 与文本一起改成实测值 |
| P2-5 | 恒败步骤的汇总行仍标 `after-retry ⚠(首跑 exit 1)`,字面像「重试后好了」 | 纯观感,状态是 FAIL,不会误判绿 | 恒败时改成 `retried, still red` 之类 |
| P2-6 | `typecheck-cached.mjs` 与 runner 的重试**都没有自证测试**(本轮 P0 与 A10 都靠外部 tester 证) | 同型第二次仍只能靠人 | 各补一条变异自证,形态照 `probe_retry_selftest` |
| P2-7 | static 实测 4.1 min(chain)/ 2.4 min(裸 verify.sh),`CLAUDE.md` 写 ~3 min | 微小 | 写成「裸 2.5 min / 链 4 min」 |

> 修 P0 时带出的 3 处文本漂移(`CLAUDE.md:22` / `gates.manifest.json` 的 `$why` / `verify.sh:280` 仍写 `--incremental`)我 20:31 复查:**实现方已同轮改掉**,不再计账。

## 过程记账(不是包的缺陷,但要留痕)

- **验收期间被审文件被改**(20:28-20:31,实现方按我上报的 P0 救火,改了 `typecheck-cached.mjs` / `verify.sh` / `gates.manifest.json` / `CLAUDE.md` / `verify-on-stop.mjs` / 提案 md)。直接后果三条:① 我 scoped 全跑 `treeMoved:true`、`tree:null`(守卫按设计不认);② H5 门拒绝复用多跑 6.5 min;③ **`verify.sh` 被 bash 边读边改 → 语法错,该轮 legacy 结论作废**。
  实现方已认领并升为机器门:`EVOLUTION-LEDGER` WF-19 + 新 `PLAN/.claude/hooks/audit-dispatch-freeze-guard.mjs`(派单前无冻结信号即 exit 2,红测 12 条);冻结信号 `.claude/.audit-freeze-<sid>.json` 20:44 落盘。之后的 A5 复验 / A6 / A10 全部在冻结树上跑。
- **并发负载**:峰值 62 chrome / 119 node(其它 tester)。h5-runtime 在 scoped 轮耗 393s;提现账单行门与 H5 门各出现一次 `⚠ after-retry` —— 均按脆性排除。
- **我改过又还原的**:`scripts/gates.manifest.json`(A7,`cp` 还原并复跑 lint 绿)· `src/lib/route.ts`(A5,4 次注入,每次 `git checkout --` 还原,末次核 `git status` 空)。
- **我建的临时物**(全部 Move 到 `.trash/tester-A-20260817/`,禁硬删):`src/store/__tester-scope-probe.ts`(A3 探针)· 两份被污染的 `tsbuildinfo` · A10 的合成 `*.attempt1` 日志。
- **产物已还原**:`.verify-cache/last-run.json` / `.verify-chain.code` / `.verify-exit.code` 复原成我到场时的既有全量记录;我各轮的日志与哨兵全量归档在
  `C:\Users\jason\AppData\Local\Temp\claude\D--WORKS-PLAN\6a7223e9-736d-4829-80eb-d495f73868d7\scratchpad\`(`fullrun-backup/` · `static-run/` · `tA-scoped.log` · `tA-a10.log` · `tA-a10b.log` · `tA-a6-static.log` · `scoped-plan.json`)。
- **收尾 `git status --short`**:6 个 `M` 全是实现方未提交的改动(**不是我的,我没动**)+ 本报告 `??`。
