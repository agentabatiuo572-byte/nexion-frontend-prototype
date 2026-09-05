# 2026-08-15 date-locale-unify T1 独立黑盒验收报告

- **被测**:`Nexion-uniapp` 分支 `pkg/zp-date-locale`,dev server `http://localhost:5223`(H5 mock 模式)
- **验收方**:独立黑盒 tester(未读实现代码/实现叙述,未改任何源文件)
- **方法**:Playwright chromium headless(仓库 node_modules),viewport 390×844 @2x。每轮单 browser 实例串行访问;**每种语言用全新 context 且 `locale` 设为与被验应用语言不同的值**(en 案 context=zh-CN;vi/zh 案 context=en-US),context 内 `navigator.language` 实测值已逐案记录。语言切换**全部走 /pages/me/language 真实 UI 点击行**,脚本零存储注入(无 addInitScript / localStorage / setStorage 调用,脚本已归档见下)。proof/profile 均以 goto+reload **全新文档加载**取证(同时证明了切换的持久化)。goto 用 `waitUntil:'domcontentloaded'`,后续显式等页面文本;失败等 3s 重试,每次加载 ≤3 attempts。
- **执行时间**(UTC):Run1 17:17–17:26,Run2 17:27–17:31,HTTP 探针 + Run3 随后
- **证据目录**:`docs/changes/evidence-date-locale/`(4 png + 3 个测试脚本归档 `test-script-run1.js` / `run2-retry.js` / `run3-profile.js`)

---

## AC1 — proof 页月份跟应用语言、不跟浏览器语言:**PASS**(三语全过)

| 应用语言 | context locale(实测 `navigator.language`) | 「Member since」行实测原文 | 判定 |
|---|---|---|---|
| en | zh-CN(实测 `zh-CN`,`Intl` resolved `zh-CN`) | `Member since Jul 2026` | PASS:英文月份缩写,无中文「年/月」、无 thg/tháng 混入 |
| vi | en-US(实测 `en-US`) | `Thành viên từ thg 7 2026` | PASS:越南语 `thg 7`,无英文月份、无中文混入 |
| zh | en-US(实测 `en-US`) | `加入于 2026年7月` | PASS:中文 `年/月` 格式,无英文月份、无 thg 混入 |

- **反向对照成立**:若跟浏览器语言,en 案(浏览器 zh-CN)会渲染 `2026年7月`,实渲 `Jul 2026`;zh 案(浏览器 en-US)会渲染 `Jul 2026`,实渲 `2026年7月`。两个方向都证明了「跟应用语言、不跟浏览器」。
- **跨语言日期一致**:`Jul 2026` = `thg 7 2026` = `2026年7月`,三语同指 2026-07,无数据分叉。
- 每案 proof 页整页文本抽样(存于测试 JSON,片段):en 页全英文(`Earnings Proof / Total earned / ACHIEVEMENTS...`)、vi 页全越南语(`Bằng chứng thu nhập / Tổng thu nhập...`)、zh 页全中文(`收益证明 / 累计收益 / 成就徽章...`)——整页语言纯净,非仅该行。

## AC2 — 切换走真实 UI、不注入存储:**PASS**

- 三案均为:goto `http://localhost:5223/?nx_device=off#/pages/me/language` → 等语言行文本可见 → **点击行本体**(`English` / `Tiếng Việt` / `简体中文`)→ 1.5s 后 goto+**reload** proof 页。
- reload 后整页呈目标语言 ⇒ 点击已**持久化**(全新文档从存储恢复语言),而非仅当次会话内存态。
- 脚本可审计:归档的 3 个脚本内不存在任何 `addInitScript` / `localStorage` / `setStorage` / storage 注入调用;唯一的 `page.evaluate` 均为只读(读 `navigator.language`、`document.body.innerText`)。

## AC3 — 三语截图:**PASS**(已逐张目检确认日期行清晰可见)

| 文件 | 大小 | 目检要点 |
|---|---|---|
| `evidence-date-locale/proof-en.png` | 351,713 B | 「Member since Jul 2026」可见,整页英文 |
| `evidence-date-locale/proof-vi.png` | 363,490 B | 「Thành viên từ thg 7 2026」可见,整页越南语 |
| `evidence-date-locale/proof-zh.png` | 346,911 B | 「加入于 2026年7月」可见,整页中文 |

## AC4 — proof 页 console 无错误:**PASS**

三案 proof 页加载阶段(含 reload)全部 console 消息逐条采集,**`console.error` = 0,`pageerror` = 0**:

- en 案 proof 阶段:仅 `[vite] connecting... / connected.`(debug,豁免项)
- vi 案 proof 阶段:`[vite] connecting/connected` ×2 + 2 条 `requestfailed net::ERR_ABORTED`(`fonts.gstatic.com` JetBrains Mono woff2 外链字体请求;为网络请求失败记录,**非** console error,详见发现 #3)
- zh 案 proof 阶段:仅 `[vite] connecting/connected` ×4(含重试轮)
- favicon 404 未出现(无需动用豁免)

## AC5 — 同型页抽验 /pages/me/profile:**PASS(实质)**,附一处与任务书不符的事实

- zh 应用语言 + en-US 浏览器 context 下,profile 页 join 行实测原文:**`加入时间 2026年7月17日`** —— 中文年月日格式,无英文月份/越南语混入,日期随应用语言 ✅(且与 proof 页 `2026年7月` 同月一致,profile 为日精度)。
- 截图:`evidence-date-locale/profile-zh.png`(目检确认);该页加载阶段 console error/pageerror = 0。
- ⚠️ **事实差异**:该行标签是「**加入时间**」,不是任务书所写的「加入于」(「加入于」是 proof 页的标签)。行为(日期跟应用语言)符合 AC 意图,故判 PASS;若 main 按字面「加入于」判,请自行改判——此差异导致我前两轮自动化等待「加入于」在 profile 页两次 25s 超时,第三轮无条件 dump 页面文本才定位到真标签。

---

## AC 之外的发现(全量列出,未合并、未自审删除)

1. **profile 页 join 行标签与任务书不一致**:实为「加入时间」,任务书写「加入于」(详见 AC5)。两页同型行用了两个不同标签(proof=「加入于」,profile=「加入时间」),是否需要统一措辞由产品侧定夺。
2. **zh 页面上出现裸英文值 `default`**:profile 页昵称「Hyper Drift 41」正下方渲染了一行原文 `default`(见 `profile-zh.png`)。在中文页面上是一个未翻译的英文原始值,疑似枚举/字段值直出,涉嫌违反「页面文案禁止字段名/枚举值」项目不变量。与本次日期改动是否相关未核(黑盒不读码),建议 main 回源判定。
3. **外链字体依赖**:加载中观测到对 `fonts.gstatic.com`(JetBrains Mono woff2)与 `cdn.fontshare.com` 的请求被 `net::ERR_ABORTED`。abort 本身多半是导航中断所致,但 app 依赖外网字体 CDN 这一点在离线/受限网络下会字体退化。[INFERRED] vi 截图中统计卡小标题的越南语组合变音符视觉分离(`Sô´ngày h...`)可能与该 mono 字体未加载、回退字体渲染组合符有关——仅为推测,未回源验证。
4. **统计卡标签截断**:proof 页三张统计卡第三张,en 显示 `Top 1% of ...`、vi 显示 `Số ngày h...`(省略号截断),zh(`全网前 1%`)完整。属文案长度差异下的 ellipsis 表现,是否设计如此需回源;与日期改动无关。
5. **mock 收益实时递增佐证**:三案 Total earned 分别 $28452.18 / $28452.20 / $28452.23(按访问先后递增),为 mock 动态收益的正常表现,非数据不一致;加入月份三语一致(见 AC1)。

## 环境失败记录(未计入功能判定)

任务预告的「请求队列拥塞」实测成立,全部按预案(3s 退避 ≤3 重试、单实例串行)处理:

- Run1 en 案:language 页 goto 3×30s 全超时(整案弃),Run2 重跑首 attempt 即过 ⇒ 环境问题非功能问题。
- Run1/Run2 zh profile:reload/waitFor 多轮超时(其中两轮实为「页面已载入但等错标签」,见 AC5;其余为真超时)。
- HTTP 探针(Invoke-WebRequest,15s 超时 ×6,间隔 5s):2 次 200(2.2s / 7.7s)、4 次超时 ⇒ server 间歇性拥塞、未宕机。
- Run3 改用 90s 耐心超时 + 语言点击后 SPA 内航到 profile(少一次全量 doc load),一次通过。
- 全程未出现「连续 3 页 ×3 重试全超时」的环境不可用判据(除 Run1 en 单页外均在重试内恢复),验收完整完成。

---

**结论:AC 5/5 pass**
