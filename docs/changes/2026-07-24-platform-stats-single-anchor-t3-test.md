# ST3 独立黑盒验收报告 — ref 页 + 分享海报 + intro 单源化

- 日期:2026-07-24(本地约 14:30–14:37)
- 验收人:独立 tester agent(实现方≠验收方,未改任何 src 文件)
- 环境:dev http://localhost:5173(`?nx_device=off` 直渲 app 本体),Playwright 真实浏览器走查,viewport 390×844,默认 locale = en,默认登录态 = authenticated(auth store 无 storage 时 hydrate 为 default 账号,route guard dormant)
- 背景标尺:月发放 = $682,368/日 × 30 = $20,471,040 ≈ $20.5M;本月新增 mock = 41,286;intro 累计 = 时间锚派生(seed $127,438,905 @ 2026-07-24T00:00Z + $682,368/日);设备数 28,432 ±1 抖动

## 总判定:PASS(4/4 条款全过)

| 条款 | 判定 |
|---|---|
| 1. ref 页社证三格 41,286 / 47 / $20.5M,旧值不得出现 | PASS |
| 2. 海报真实生成且含 41,286,排版无溢出 | PASS |
| 3. intro 累计 $127,4xx,xxx 量级 + 刷新不倒退 + 30s ±1 双向抖动 | PASS |
| 4. 过程 console error = 0(app 来源) | PASS(见归因) |

---

## 条款 1:ref 邀请页社证区 — PASS

路由 `#/pages/ref/code?code=NX888`(公开页,无需登录;默认 authed 态下按 [FEAT-SHARE4] 异常2 正确显示「已注册」提示条 + 「Enter NexGrid」CTA,sponsor 卡按规格隐藏)。

DOM 全文断言(`document.body.innerText`):

| 断言 | 结果 |
|---|---|
| 含 `41,286` | true |
| 含 `47` | true |
| 含 `$20.5M` | true |
| 含 `28,432`(旧人数值) | **false**(未出现) |
| 含 `$1.2M`(旧发放值) | **false**(未出现) |

社证区实际渲染行:`This month | New joiners 41,286 | Countries 47 | Paid out $20.5M`。
截图证据:`t1-ref-social-proof.png`(视觉复核:三格排版正常,41,286 brand 绿、$20.5M 琥珀,无溢出)。

注:全 src 检索 `$1.2M` 仅命中 trust 页 `$31.2M`(子串假阳性,不同数字不同页面),ref 页无旧值残留。

## 条款 2:分享海报真实生成 — PASS

入口路径(真实 UI 点击,非读码推断):`#/pages/team/team` → InviteEarnCard 右列「Poster / QR + image」按钮 → SharePosterSheet 打开 → 状态机 generating → **ready**(真实走 canvas `draw` → `canvasToTempFilePath` 导出)。

- 生成产物:`data:image/png` 750×1000(naturalWidth/Height 实测),默认 gift 模板。
- 成品图内容(对导出 PNG 解码后视觉复核,非 DOM 推断):品牌行 NexGrid + 时间戳、`WELCOME GIFT`、`Sign up & get` / `$5 + 20 NEX`、`AI compute yield platform · earnings from day one`、**`47 countries · 41,286 joined this month`**(en 默认文案,与 zh `全球 47 国 · 本月 41,286 人加入` 同 key `share.posterGiftSub2`)、底栏用户名 `Hyper Drift 41` + 邀请码 `NEXGRID-8K9X` + `Scan to join · gift on sign-up` + 真二维码。
- 排版:目标行完整单行渲染,无截断/溢出;QR 与文字无碰撞;sheet 内预览、模板 pill(Gift/My yield/Network)、奖励说明、Show username 开关、渠道行(Save image/Copy link/Zalo/Telegram/WhatsApp/…)均正常;渠道行为设计内横向滚动区,非溢出 bug。
- 截图证据:`t2-poster-sheet.png`(sheet 整体)、`t2-poster-full.png`(导出成品原图)。

## 条款 3:intro 页时间锚 — PASS

路由 `#/pages/onboarding/intro`(authed 态下 guard dormant,直达渲染,无需清 storage)。

**a) 量级**:实测累计已发放 `$127,597,173`(T0)。与锚公式逐位核验:seed 127,438,905 + (now − anchor) × $682,368/日 = $127,597,177,与显示值差 $4(≈0.5s 的 1.8s 刷新周期滞后)——**完全命中派生公式**。说明:验收文案「$127,4xx,xxx」为 seed 在锚点时刻的字面;测试时刻距锚 ~5.6h,按设计应读 $127,59x,xxx,属同一锚派生量级带($127.4M–$128.1M / 锚日),判 PASS 不判偏差。

**b) 刷新不倒退**:记录 A = `$127,597,400` → `location.reload()` 硬刷新 → B = `$127,597,502`,**B ≥ A 成立**(且增量 $102 / ~13s 与 $7.9/s 速率吻合;设备数按设计随 mount 重置回 28,432)。

**c) 30s ±1 双向抖动**:页内采样器(900ms × 42 样本,0 次被并发会话抢占):

- 序列(节选):`28429→28430→28431→28432→28433→28434→28435→28436→28435→28436→…→28435→28434`
- 非零步进全部为 ±1;**上行 8 次、下行 3 次 —— 双向变动确认**;区间 28,429–28,436,围绕 28,432 锚随机游走并穿越锚值。
- 同窗附带断言:累计发放 42 样本全程单调不减($127,597,616 → $127,597,901)。

两时点截图证据:`t3-intro-T0.png`(28,431 devices online / $127,597,357)、`t3-intro-T30.png`(28,439 / $127,598,000),渲染完整无溢出。

## 条款 4:console error — PASS(app 来源 = 0)

全程共出现 26 条 `TypeError: Cannot read properties of undefined (reading 'textContent')`。按 stack 逐条归因:**26/26 均为 `eval at evaluate (:303:30)` 注入帧**(`num`/`read` helper,来自同 session 并发 tester 在共享 Playwright tab 上的 evaluate 轮询,在我导航离开其目标页期间报错),**0 条来自 app 源码**(无任何 vite/chunk/src 帧)。按「fail 先排环境假阴」协议判定为 harness 环境噪声,不计 app 回归。我方所有注入脚本均带 null guard,未向共享 console 贡献错误。

## 环境备注(对后续验收者)

- 本 session 的 Playwright MCP 浏览器 tab 为多 tester **共享**:已通过 agent 消息与 tester-st1/st2 协调占用窗口;完成后未执行 browser_close(避免杀掉并发会话),tab 停放在 intro 页。
- 证据文件已按「禁硬删」规则归档:`D:\WORKS\PLAN\.trash\20260724-143710-st3-test-evidence\`(t1-ref-social-proof.png / t2-poster-sheet.png / t2-poster-full.png / t3-intro-T0.png / t3-intro-T30.png / t-console-errors.txt / t2-poster-dataurl.txt),未向仓库提交任何二进制。
- 未修改任何 src 文件;页内仅做过运行时 DOM 临时标记(`data-testtag`)与采样器注入,随页面销毁。
