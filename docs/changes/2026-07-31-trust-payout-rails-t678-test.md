# T6 / T7 / T8 独立验收报告(2026-07-31)

**验收方**:独立 tester(非实现方) · **被测**:T6 到账推进 / T7 追踪页 / T8 三语文案
**环境**:dev 5173(未重启、未杀 node)· `localhost` + `?nx_device=off` · Playwright headless 390×844
**纪律**:只按 AC 实测,不看实现叙述;「代码里写了」不计通过;只报不修。

---

## 0. 墨菲清单(动手前先列「最可能崩的点」,逐个当它一定会崩去验)

| # | 预判崩点 | 实测结论 |
|---|---|---|
| M1 | 推进顺手改余额 / 重复记账 | 未崩(对照组实验,见 T6-2) |
| M2 | 人工审核 / 冻结态过点被自动推进 | 未崩(9 种状态×路由组合逐个试) |
| M3 | `confirmedAt` 记成「打开 App 那刻」而非「到点那刻」 | 未崩(离线 3 天实测差值 3.00 天) |
| M4 | 到账时效被写死 24h,后台改了不生效 | 未崩(改 2h 立即生效,真提交路径复验) |
| M5 | 审查窗口取值取反(取更早者) | 未崩(72h/24h/96h 三组边界) |
| M6 | 追踪页自己偷偷推进 | 未崩(1.5s 早采样 + 只开首页对照) |
| M7 | 已到账最后一步还在转圈 | 未崩(转圈实测 0) |
| M8 | 空状态白屏 / 让用户干等 | 未崩(159ms 出内容,全程 0 骨架) |
| M9 | 加载态是通用转圈不是骨架 | 未崩(600ms 骨架 19 块,同期转圈 0) |
| M10 | 置灰按钮只是视觉灰,点了照跳 | 未崩(hash 未变) |
| M11 | 进度条长得像按钮 | 未崩(5 行全量 computed style 体检) |
| **M12** | **占位符没替换,页面直出 `{n}`** | **崩了 —— 见 D-1** |

### 🔴 harness 自证伪(先证伪工具再证伪产品)

本轮抓到 **3 个假结论**,全部来自我自己的检测器而非产品,已修正后重跑:

1. **`page.goto` 只改 hash = 同文档导航,根本没重载**。`window.__docMarker` 实测在 goto 后仍在 → 所谓「打开 App」其实是 SPA 路由跳转。修法:加唯一 query 强制真重载,并焊死 `T6-0.realReload` 断言(标记必须丢失)才继续。
2. **转圈判据永远匹配不上(假绿)**。`style` 属性被 CSSOM 序列化成 `animation: 1s linear 0s infinite normal none running spin`,字符串匹配 `"animation: spin"` 恒为 false → 「已到账无转圈」曾是**空集全过**的假 PASS。修法:改用 computed `animationName === "spin"`,红测样本(processing 态)确认能数出 1。
3. **账单增长 0→45 的假 FAIL**。账单是首次读时惰性播种的 30 天 mock 流水,与推进无关。修法:做同时间线对照组(会推进 vs 注入即 confirmed),两组 withdraw 类账单 1 条/合计 −20 完全一致。

另有 1 个假 FAIL 来自环境:T7 首轮 `frozen` 态因连续几十次整页重载触发 `ERR_INSUFFICIENT_RESOURCES`(页面根本没加载,文本仅 14 字符),独立浏览器隔离复跑即 PASS。

---

## 1. T6 · 到账推进(钱 + 状态机)

机器门:`node scripts/selfcheck-arrival.mjs` → **55 pass / 0 fail**;`npm run type-check` → **0 错**。

| AC | 结果 | 证据(运行时实读) |
|---|---|---|
| 注入已过期「已提交」单 → 打开 App 应已到账 + 记实际到账时间 | **PASS** | 注入自证落盘 `status=submitted, est=1785488663663`;真整页重载(`T6-0.realReload`:window 标记丢失)后 storage 实读 `status=confirmed`、`confirmedAt=1785488663663`(= 预计到账时刻,非打开时刻)。余额 24856.56 → 24856.56 |
| 关 App 三天再打开 → 一次补齐、不重复推进 | **PASS** | est = 3 天前 → 一次打开即 `confirmed`,`confirmedAt` 距今 **3.00 天**(记的是到点那刻);重开 2 次 + 跨 2 个 5s 轮询 tick 后 `confirmedAt` 一字未变 |
| 不重复记账(余额不因推进变化) | **PASS** | 对照实验:推进组 vs 不推进组,withdraw 类账单均 **1 条 / 合计 −20**,无任何账单引用被推进单号 `WD-CTRL-0001`(0 条);余额两组同为 24856.56;可提额度 24856.56 未动 |
| 🔴 人工审核态过点绝不推进;冻结态、各异常终态同样不推进 | **PASS** | 9 组逐个注入(est = 5 天前)+ 跨轮询 tick 后状态原地不动、`confirmedAt` 全无、余额未动:`review-pending/manual`、`review-pending/delay`、`frozen/freeze`、`review-rejected`、`address-invalid`、`tx-failed`、`refunded`,以及**状态正常但路由为 manual / freeze** 两组(证明路由闸与状态闸各自独立生效) |
| 到账时间算法:提交 + 后台「到账时效」;24h → 2h 生效 | **PASS** | seed `payoutSlaHours=24` → +24h;改 2 → +2h(非缓存)。**真 `submitWithdrawal` 路径复验**:时效 24 的新单 `estimatedCompletion − submittedAt = 24h`(单号 WD-20260731-1063),改 2 后新单 = **2h**(单号 WD-20260731-6838) |
| 大额命中审查窗口取更晚者 | **PASS** | 窗口 3 天 + $1500(≥ 大额线 $1000)→ **+72h**(取窗口);同配置 $999 → +24h(小额不受影响);时效调到 96h > 窗口 72h → **+96h**(取时效)。三组均为取更晚者 |
| 推进只由 App 层驱动,追踪页自己不推进 | **PASS** | ① 已停在追踪页时把过点单塞进内存态,**1.5s(早于 5s 轮询)后仍是 `submitted`** → 页面渲染本身不推进;再等到跨过轮询周期变 `confirmed` → 驱动确在 App 层。② 反向对照:**只打开首页、全程未进追踪页**,单据照样补齐为 `confirmed` 且 `confirmedAt` = 到点时刻 |
| 哨兵 55/0 + 自选 2 处注入确认会红 | **PASS** | 见下表 |

### 红测(cp 备份还原,严禁 git checkout)

| 注入 | 哨兵结果 | 命中断言 |
|---|---|---|
| `ADVANCEABLE` 加入 `review-pending` | **53 pass / 2 fail**,exit **1** | 「🔴 状态是 review-pending 但路由被写成 pass,仍不推进(状态是第二道闸)」×2 |
| `estimateArrivalAt` 去掉 `Math.max`(直接 `return base`) | **53 pass / 2 fail**,exit **1** | 「🔴 大额 + 审查窗口 3 天 → 取更晚者」/「金额正好等于大额线 → 算命中(「≥」口径)」 |

还原自证:两次还原后 `sha256(src/store/withdrawal-arrival-core.ts)` = `4eb2e4239c4de29a3f1f1b6ec63b2742e1d07c450752fee36e719993a0f260d3`,与改动前基线**完全一致**;复跑 **55 pass / 0 fail**;`type-check` 0 错。

---

## 2. T7 · 追踪页(展示面)

| AC | 结果 | 证据 |
|---|---|---|
| 已到账 → 5 步走满 + 最后一步不转圈 + 显示实际到账时刻 | **PASS** | 打勾 **5/5**、空心圈 0、**转圈 0**(判据用 computed `animationName`,非字符串);页面实读「实际到账 07-31 17:06」。截图 `t7-state-confirmed.png` |
| 无记录 → 空状态引导 + 「去提现」入口 + 禁白屏 + 不干等 | **PASS** | 实读「提现状态 ⏎ 暂无进行中的提现。 ⏎ 发起新的提现 →」;**48 帧采样全程 0 骨架**、`aria-busy=0`、首帧内容 **+159ms**;点入口 → hash 变 `#/pages/me/wallet-withdraw`(真跳转) |
| 加载中 → 进度条骨架(不是通用转圈) | **PASS(已抓到)** | 25ms 逐帧采样:**60 帧中 25 帧有骨架,持续 ≈600ms**,峰值 **19 个骨架块**(= hero 3 + 标题 1 + 5 步×3 的同形骨架);**骨架期内通用转圈帧数 = 0**;`aria-busy="true"` 覆盖 25 帧 |
| 人工审核 → 停第 1 步 + 说明不自动放款 + 客服入口点得动 | **PASS** | 打勾 0 / 转圈 1 / 空心 4 = 停在第 1 步;实读「人工审核中 · 提现正在等待账户和地址审核,**不会自动推进到打款**。」;无误报「预计 N 小时内完成」;客服入口「联系人工客服 →」热区 **85×44**,点击后 hash → `#/pages/me/support`。截图 `t7-review.png` |
| 进度条不能长得像按钮 | **PASS** | **5 个步进行全量** computed style:`role`/`tabindex` 全 null、`cursor: auto`、背景 `rgba(0,0,0,0)`、圆角 `0px`、`box-shadow: none`;同页真按钮对照 = 背景 `rgb(158,220,29)`、圆角 `999px`、高 44 → 按钮相步进行 **0 个** |
| 「再提一笔」额度用完 → 置灰 + 说明 + 点了真不跳 | **PASS** | `aria-disabled=true`、`opacity=0.6`、背景 `rgb(31,31,31)`、字色 `rgb(107,115,133)`;原因实读「今日提现次数已用完,08-01 02:00 后可再提。」;点击后 hash **未变**。截图 `t7-limit-reached.png` |
| 额度没用完 → 点了能跳提现页 | **PASS** | `aria-disabled=false`、`opacity=1`、背景 `rgb(158,220,29)`、原因文案消失;点击 → `#/pages/me/wallet-withdraw` |
| 五种状态逐个注入核渲染 | **PASS** | 已提交 0勾/1转/4空 · 处理中 2勾/1转/2空 · 已到账 5勾/0转/0空 · 人工审核中 0勾/1转/4空 · 冻结 0勾/1转/4空(冻结态隔离复跑,实读「…已被冻结;如需协助请联系客服。」+ 客服入口在) |

---

## 3. T8 · 三语文案

机器门:`node scripts/i18n-key-mirror.mjs` → **PASS**(en/zh/vi 4587 keys · 540 条插值文案占位符对齐)。

| AC | 结果 | 证据 |
|---|---|---|
| zh/en/vi 三语切换,提现页与追踪页全部状态都有文案 | **PASS** | 追踪页 5 态 + 空态 + 提现页 = 7 个面 × 3 语,全部渲染成功且**两两文本不同**(非回退到同一份)。例:空态 en「No active withdrawal. / Submit a new withdrawal →」· vi「Không có lệnh rút nào đang xử lý. / Tạo lệnh rút mới →」;提现页 en「Compliance check required」· vi「Cần kiểm tra tuân thủ」 |
| 无中英文硬编码残留 | **PASS** | en / vi 两语 × 7 个面 = **14 组全站文本扫描,汉字残留行数均为 0** |
| **无占位符没替换** | **FAIL** | **见 D-1** |
| 每条拦截文案都给了下一步 | **PASS** | 金额太小(输入 $5)→「最低提现:$20。上方手续费可通过烧 NEX 抵扣。」;超出可提(输入 $999999)→「可提现: $24856.56」;今日超限 → 提现页实读「今日提现次数已用完,**08-01 02:00 后可再提**。」(需先满足更高优先级的钱包认证闸;首轮读不到是我 harness 未配对所致,配对后复验通过);审核中 →「不会自动推进到打款」+ 可点客服入口 |
| 不出现工程名词 / 字段名 / 错误码 | **PASS** | 6 个面扫 19 个黑名词(`riskRoute`/`review-pending`/`estimatedCompletion`/`confirmedAt`/`payoutSlaHours`/`first-withdrawal-review`/`new-address-large-amount`/`manual_or_reject`/`PAY04`/`SPEC-7`/`null`/`undefined`/`NaN`/「路由」…)**命中 0**;风控原因已转业务话术:「提现地址更换未满 7 天,大额提现需人工审核」「首次提现需人工确认」 |

---

## 4. 缺陷清单

### 🔴 D-1(HIGH):追踪页进行中状态直出未替换占位符 `{n}`,并与下一行重复同一句话

- **位置**:`src/pages/me/wallet-withdraw-tracking.vue:211-219`(`etaTitle`)
- **现象**:`submitted` / `processing` 态下,ETA 区块**标题**渲染为 `预计 {n} 小时内完成`(原始模板,占位符未替换),**副标题**紧接着渲染 `预计 24 小时内完成`(已插值)。同一句话出现两遍,其中一遍是坏的。
- **根因**:`etaSub` 走了 `fmt(t.value.wallet.trackEtaPending, { n: ... })`,而 `etaTitle` 的兜底分支直接取了**同一个带插值的 key** 的原文:

  ```js
  const etaTitle = computed(() =>
    wd.value?.status === "confirmed" ? t.value.wallet.trackEtaDone
      : isFrozenHold.value ? t.value.wallet.routeHeldFrozenTitle
        : routeHeld.value ? t.value.wallet.withdrawRouteHeldTitle
          : t.value.wallet.trackEtaPending,   // ← 未 fmt,{n} 原样进 DOM
  );
  ```

- **复现范围**:**3 语 × 2 态 = 6 处全中**,无一幸免
  - zh:`预计 {n} 小时内完成`
  - en:`Expected within {n} hours`
  - vi:`Dự kiến trong {n} giờ`
- **证据**:截图 `t7-state-submitted.png`(肉眼可见 `预计 {n} 小时内完成`)+ 6 条 DOM 实读断言
- **为什么是 HIGH**:出现在提现(钱)页面的主状态行,且**每一个正常提现的用户都必然看到**(pass 路由 → submitted/processing 是必经态);机器门(i18n-key-mirror / selfcheck-arrival / type-check / verify 源码哨兵)**全部绿**却漏掉它 —— 它只在渲染后的 DOM 里现形。
- **建议**:标题另起一个不带插值的 key(如「到账倒计时 / Payout in progress」),把带 `{n}` 的句子留给副标题;顺带消掉重复。

### ⚪ D-2(LOW · 仅记录不拦):已到账态「实际到账 07-31 18:06」在第 5 步与 ETA 副标题重复出现两次
截图 `t7-state-confirmed.png`。两处相距约 20px,读起来是同句复述。与 D-1 同源(标题/副标题分工不清),修 D-1 时可一并收敛。

### 建议补的机器门(防同类回归)
现有哨兵没有任何一条覆盖「渲染后 DOM 里出现 `{xxx}`」。建议在走查脚本里加一条**全站渲染文本占位符扫描**(判据 `/\{[a-zA-Z_][a-zA-Z0-9_]*\}/`,三语 × 各状态),否则下一个「取了带插值 key 的原文」还是只能靠人眼。

---

## 5. 收尾

- 未重启 / 未杀 5173 的 node;红测只用 `cp` 备份还原,`sha256` 自证一致,复跑 55/0;`type-check` 0 错。
- 本轮跑过的断言:T6 **25 pass / 1 fail(该 fail 经对照实验证伪,实为账单惰性播种,非缺陷)**+ 对照组 4/0;T7 **24 pass / 1 fail(资源耗尽,隔离复跑 PASS)**;T8 **36 pass / 6 fail(全部为 D-1 同一处)** + 拦截/黑词 10 pass;补充探针 2/0。
- 控制台错误:除首轮资源耗尽外,各套件 console error = 0。

**归一后未通过项:1 条(D-1)。**

裁决(第一轮): FAIL(1 条)

---

# D-1 复验(2026-07-31 第二轮 · 只复验 T8)

T6 / T7 上轮已判全 PASS,本轮不重跑。修法核对:标题改用**不带插值**的新 key `wallet.trackEtaTitlePending`(zh「提现处理中」/ en「Processing」/ vi「Đang xử lý」),副标题维持 `fmt()`。

## 1. 修复实测(以 DOM 为准)

| 复验项 | 结果 | 证据 |
|---|---|---|
| `submitted`/`processing` × zh/en/vi 六组,标题实读 | **PASS** | 逐组读 ETA 区块的第 1/第 2 个 `uni-text`:zh「**提现处理中**」· en「**Processing**」· vi「**Đang xử lý**」,与新 key 值逐字一致 |
| 标题与副标题不再是同一句话 | **PASS** | 六组全部 `title !== sub`:zh 副标题「预计 24 小时内完成」· en「Expected within 24 hours」· vi「Dự kiến trong 24 giờ」。截图 `d1-zh-submitted.png` 肉眼复核:标题 + 明细两行,不再复读 |
| 六组 DOM 无任何未替换占位符 | **PASS** | 正则 `/\{[A-Za-z_][A-Za-z0-9_]*\}/` 扫标题+副标题,命中 0 |
| 全状态三语回归扫描(不止这两态) | **PASS** | 追踪页 5 态 + 空态 + 提现页 = **7 面 × 3 语 = 21 组**全页 innerText 扫描,未替换占位符 **命中 0**(上轮同一扫描命中 6);三语两两文本不同(非回退);en/vi 汉字残留 0 行。合计 **42 pass / 0 fail** |

## 2. T8 其余 AC 回归

| AC | 结果 | 证据 |
|---|---|---|
| 拦截文案给下一步 | **PASS** | 金额太小(输入 $5)→「最低提现:$20…」;超出可提($999999)→「可提现: $24856.56」;今日超限 →「今日提现次数已用完,**08-01 02:00 后可再提**。」(需先配对钱包,否则更高优先级的「需要钱包认证」闸先显示 —— 与上轮同一 harness 前提,非缺陷);审核中 →「不会自动推进到打款」+ 可点客服入口 |
| 无工程名词 / 字段名 / 错误码 | **PASS** | 6 面 × 19 个黑名词,命中 0 |
| `node scripts/i18n-key-mirror.mjs` | **PASS** | en/zh/vi **4588** keys(+1 = 新增标题 key)· 540 条插值占位符对齐 |
| `node scripts/selfcheck-i18n-interp.mjs` | **PASS** | **3 pass / 0 fail**,exit 0;已接进 `verify.sh` 第 [1.6] 组循环(`for sc in … arrival i18n-interp`) |
| `npm run type-check` | **PASS** | 0 错 |

## 3. 新哨兵红测(cp 备份还原,严禁 git checkout)

把追踪页标题 key 改回带插值的 `trackEtaPending`:

```
FAIL  🔴 带占位符的文案全部过了 fmt(),没有原样直出 DOM —
      src\pages\me\wallet-withdraw-tracking.vue:222  t.value.wallet.trackEtaPending  → 文案含占位符却未过 fmt()
2 pass / 1 fail        真实 exit code = 1
```

还原自证:`sha256(wallet-withdraw-tracking.vue)` = `2c190ee9d5e6c30377c1dc8a5d7a2e8fd55ce2f4f3242b0d8ebcef07d46963aa`,与改动前基线一致;复跑 **3 pass / 0 fail**。**这道门能抓住 D-1 的原始形态。**

## 4. 🔴 已知盲区:同样漏替换、哨兵抓不到的写法(实测构造成功)

### 盲区 1 — 别名 namespace(**已实测:哨兵全绿 + DOM 真漏**)

哨兵的引用正则 `\bt(?:\.value)?((?:\.[A-Za-z0-9_]+){2,3})\b` 要求引用**字面上以 `t.` / `t.value.` 开头**。本工程另有一种常见写法:先把 namespace 存成局部 computed,再用别名取 key ——

```js
const w = computed(() => t.value.binaryHowItWorks);   // src/pages/team/binary-how.vue:187
const s4IntroText = computed(() => w.value.s4Intro);  // ← 去掉 fmt,哨兵看不见
```

**实测结果**(改后立刻跑,改完即用 cp 还原):

| | 结果 |
|---|---|
| `selfcheck-i18n-interp.mjs` | **3 pass / 0 fail,exit 0 —— 全绿,没抓到** |
| 运行时 DOM(`/pages/team/binary-how`) | **zh 实读 `{freq},系统统计你两条轨道的总活跃业绩…`** |
| | **en 实读 `Each {unit}, the system looks at the total activity…`** |

即:**与 D-1 完全同类的缺陷,换个写法就能整条穿过这道门**,而 DOM 里照样直出 `{freq}` / `{unit}`。
还原自证:`sha256(binary-how.vue)` = `38c20e713268e25feed2f7dec33bb79af5f4b33860b0fac0e91d866c76ad8d4c`,与基线一致;哨兵复跑 3/0。

**盲区面积**(自建扫描器实测,判据自检:红样本必抓到 1、绿样本必 0,否则 exit 2 不出结论):
**23 处**别名 namespace 声明,其中对「带占位符 key」的别名引用 **30 处** —— 这 30 处**全部在哨兵覆盖之外**。
存量泄漏 **0 处**(当前都正确过了 `fmt`),即盲区是空门不是活漏,但 30 处只靠人工守。

### 盲区 2 — 三语占位符**名字**不同,fmt 传错名(未构造,静态已证存在条件)

哨兵只判「有没有被 `fmt(` 包住」,不判「传的参数名对不对上 en/vi 的模板」。全量比对三语占位符集合发现 **4 条 key 集合不一致**,其中 `binaryHowItWorks.s4Intro` 是 **zh `{freq}` vs en/vi `{unit}`**,名字完全不同。当前之所以没漏,是因为消费点**人工把两个名字都传了**(`fmt(w.value.s4Intro, { freq, unit })`,源码里还专门写了注释)。只要有人按 zh 模板只传 `{freq}`,zh 正常、**en/vi 直出 `{unit}`**,而哨兵与 `i18n-key-mirror` 都不会红 —— 后者对这 4 条只报 **INFO**,不是 fail。

### 盲区 3 — 只读 `zh.ts` 定候选集

哨兵用 `zh.ts` 判断「哪些 key 带占位符」。若某 key **只有 en/vi 带占位符、zh 不带**,它压根不进候选集,直出也永远绿。
实测:当前**此类 key 0 条**,盲区暂无触发条件,但判据方向是单语的。

### 建议(按性价比排序)

1. **补别名 namespace 的引用面**(盲区 1,唯一已实测能真漏的):识别 `const X = computed(() => t.value.NS)` 后把 `X(.value)?.key` 一并纳入扫描 —— 我的扫描器已跑通,30 处引用可直接接管。
2. **候选集取三语并集**(盲区 3),并对占位符集合不一致的 key 校验 fmt 实参覆盖并集(盲区 2)。
3. **补一条运行时占位符扫描**:源码层判据永远是代理判据(哨兵注释里也这么写了)。D-1 是在 DOM 里抓到的,盲区 1 也是在 DOM 里证实的 —— 建议在走查脚本里加「渲染文本命中 `/\{[a-zA-Z_]\w*\}/` 即红」,三语 × 各状态,这是唯一直接守住真不变量的门。

## 5. 复验收尾

- 未重启 / 未杀 5173 node;两次红测均 `cp` 备份还原,`sha256` 双双与基线一致,还原后哨兵与 type-check 全绿。
- 本轮断言:D-1 专项 6/6 · 三语全状态扫描 42/0 · 拦截+黑词 9/1(该 1 条为钱包未配对的 harness 前提,配对后复验 1/0)· 新哨兵 3/0 + 红测转红(exit 1)· 盲区构造 1 例实测成功。
- 又踩 1 个 harness 自坑并修正:自建扫描器在模板字符串里写 `\b`,被当成**退格符**导致正则静默失效、恒 0 命中(假绿)。已改为 `String.fromCharCode(92)+"b"` 并加「红/绿样本判据自检」,不通过就 exit 2 拒绝出结论 —— 上面那句「存量 0 处」是在判据自检通过后才成立的。

**D-1 已修复,T8 全部 AC 通过。** 盲区 1-3 属**哨兵覆盖面**问题,不是本次三个子任务的验收缺陷,单列供后续加固。

裁决: PASS
