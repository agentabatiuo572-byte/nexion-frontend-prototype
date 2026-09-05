# C2 · 零-border 铁律 — 独立验收报告(2026-07-23)

> 验收方 ≠ 实现方。全部结论回源 + 实测(静态 + 运行时双证)。未读实现方 `2026-07-23-c2-verdicts.md`。
> 结论:**不通过(加权 82.7 / 100,门槛 95)**。机器门全绿,但门本身覆盖 10/88 路由、有 3 类可绕过写法,
> 且本批附带引入一处亮色主题 WCAG AA 文字对比度回归。

---

## 1. 本次判定目标

| 判据 | 原文出处 | 来源等级 |
|---|---|---|
| **任何带背景色填充的卡片 / 板块一律零 border**,靠 surface 微差色分层 | 《03》§3 首段(🔵 V5 分层铁律) | **规范明写** |
| border **只属于透明容器**(分组 hairline、empty-state 虚线) | 《03》§3 首段 | **规范明写** |
| 内嵌元素(chip / pill / icon 容器)用 soft bg tint,**禁加 border** | 《03》§6 尾句 | **规范明写** |
| 玻璃 chrome(TabBar / Header / 浮层,`--v5-glass-*` / `--v5-chrome-*`)**不在此约束内** | 《03》§4 第 6 条 | **规范明写** |
| 可访问性强边界(**表单聚焦、非文本 3:1**)归《无障碍规范》,不在此约束 | 《03》§3 末条 | **规范明写** |
| 徽章「隔离描边环」(状态点用页面底色描边做分隔)豁免 | 任务书另列,规范无此词 | **推断** → 相关结论降一档 |
| **按钮**是否属于「卡片 / 板块」 | 规范未写。§3/§4/§6 只点名 卡片/板块/内嵌 chip | **推断** → 相关结论降一档 |

🔴 因「按钮」不在规范明写范围,下文对 `me.vue` 退出登录按钮的判定按**降一档**处理:
它的 border 删不删都不算违规;但删边**顺带换了底色**导致的对比度回归是硬事实(实测),不降档。

---

## 2. 工具自证伪记录(如实记)

| # | 探针 | 已知答案 | 工具首答 | 处置 |
|---|---|---|---|---|
| P1 | 注入 8 种「填充+描边」写法后回读 computed style | 8 个都该有可见填充 + 可见边/环 | 8/8 全部如实渲染(A/B/C/D/E 四边 1px solid;F outline 1px;G `0 0 0 1px` shadow;H `::before` 1px) | ✅ 注入有效,后续「门抓没抓到」的结论才成立 |
| P2 | 亮色主题下卡内像素应 ≈ `--v5-surface` #FFFFFF、卡外 ≈ `--v5-bg` #F4F1E9 | (253,253,254) / (244,241,233) | **首答 (146,145,148) / (145,143,143)** —— 整页被压暗 42% | ❌ **我的工具错了**。根因:落地后 ~1300ms 自动弹出 voucher sheet 带 scrim。加「等过 2.2s + 主动 hide + 复测」后回到已知答案。**首轮所有对比度数字作废,已重测** |
| P3 | 用文字匹配定位元素 | 应命中卡片本体 | `nodes.find(textContent.includes(...))` 命中的是**最外层 chassis**(祖先也含该文本),`position-row` / `me-signout` 首轮量的是页面根 | ❌ 我的工具错了。改成取最深匹配 + 尺寸约束后修正 |
| P4 | scrim 检测器 | 关掉遮罩后应为 false | 恒为 `YES!` | ❌ 我的检测器误报(把 `position:fixed` 的页面根 `.nx-chassis` 当遮罩)。**该字段作废**,以 P2 的像素已知答案为准 |
| P5 | 按钮文字对比度的像素采样 | 应采到粉底 + 红字 | 整块 (0,0,0)、15708px 同色 | ❌ 按钮在首屏之下,viewport 截图采到空白。**改用 computed style 值 + token 值双算**,结论不依赖该像素 |
| P6 | 门自带 selftest | — | 19/19 pass | 参考值,**不作为门可信的依据**(见 §3-B2 我自己的双向红测) |

> 结论:本报告里凡带数字的对比度 / 像素,均为 P2 修正**之后**重测的值。P4/P5 两个坏字段已作废,未用于任何判定。

---

## 3. 逐条判定

### A. 机器门

| 条 | 命令(未走管道,`cmd > log 2>&1; echo exit=$?`) | 结果 | 判定 |
|---|---|---|---|
| A1 | `npm run type-check` | `exit=0`,vue-tsc 无输出 | **PASS** |
| A2 | `bash scripts/verify.sh` | `━━ result: 323 pass, 0 fail ━━` / `EXITCODE=0` | **PASS** |

其中新接入的两条:
- `zero-border selftest(双向红测…)` PASS
- `零-border:无新增 full 违例(基线 15 条,本次消失 0 条)` PASS

---

### B. 门本身可信吗

#### B1 判据忠于规范吗 — **部分 PASS**

`scripts/zero-border-gate.mjs` 的判定链:`hasFill(自身填充) && !chrome && !dashed && !isoRing` → `sides≥3 = full` / `1-2 = partial`。

忠于规范的部分(✅):
- 只看**元素自身**的填充(不含祖先继承)→ 正确对齐「带背景色填充的卡片」而不是「看起来在有色区域里」。
- 透明底 + 四边框放行 → 对齐「border 只属透明容器」。
- 全透明描边 / `style:none` / alpha<0.03 极淡底 → 视觉上不存在,放行合理。
- 走**运行时**判而不是 grep → 方向正确(见 B2:5 种写法一网打尽)。

不忠 / 有洞的部分(❌ 详见 B3/B4):
- `sides≥3` 才叫违例是**自定的分级**,规范没有「三边以上才算描边」这条。`partial`(1-2 边)**永不拦**,而规范只承认**透明** hairline;实测基线里的 `partial` 有多条是**不透明底**上的 hairline(见 B5)。
- 只认 `border-*` 属性。规范说的是"不描边"这个**视觉结果**,门却退回到"只认一种写法",与它自己文件头写的「本门只问渲染结果」自相矛盾。
- `isChrome()` 第二参数 `borderColorRaw` 在运行时恒传 `""`(`evaluate()` 里写死),`var(--v5-glass-border)` 那条分支是**死代码**。
- 文件头声称「判定纯函数(可离线红测)」并 `export`,但模块顶层 `const hits = await sweep()` 无条件执行 → 任何 `import` 都会拉起浏览器,**外部无法离线复用**。(我因此没有复用它,自己重写了一份判定,反而成了独立交叉验证)

`--selftest`:`exit=0`,**19/19 pass**。

#### B2 我自己的双向红测 — **PASS(5/5 全抓)**

在真源文件 `src/pages/staking/staking.vue` 注入 8 种写法(P1 已确认 8 种全部真渲染出填充+描边),然后跑门:

| 变体 | 写法 | 门抓到? | 证据 |
|---|---|---|---|
| A | 内联 `border: '1px solid var(--v5-brand)'` 简写 | ✅ full | `full /pages/staking/staking 60x40 .zbred-a` |
| B | 内联 `borderTopWidth/…` + `borderTopStyle/…` + `borderTopColor/…` 分写 | ✅ full | `.zbred-b` |
| C | UnoCSS class `border-1 border-solid border-[var(--v5-brand)] bg-[var(--v5-surface-2)]` | ✅ full | `.zbred-c` |
| D | `<style scoped>` 里同一个 class 同时给 bg + border | ✅ full | `.zbred-d` |
| E | bg 走内联、border 从 `<style scoped>` 的 class 继承(跨来源) | ✅ full | `.zbred-e` |
| F | `outline: 1px solid`(冒充 border) | ❌ **漏** | 见 B3 |
| G | `box-shadow: 0 0 0 1px`(冒充描边) | ❌ **漏** | 见 B3 |
| H | `::before` 伪元素画满边框 | ❌ **漏** | 见 B3 |

硬门行为:`node scripts/zero-border-gate.mjs` → `exit=1`,报「新增 5 处」并逐条列出。
**精确还原后**(md5 `3d4a65092a55f459c067aeb51a8621b4` 与注入前一致,`git status` 该文件干净)→ 再跑 `exit=0`,`基线 15 条,本次消失 0 条`。双向闭合。

#### B3 假阴性 — **FAIL(3 类可绕过 + 覆盖面缺 89%)**

| # | 漏法 | 证据 | 严重度 |
|---|---|---|---|
| 1 | **`box-shadow: 0 0 0 Npx` 冒充描边** | 注入 G 未被抓。**且线上真有**:`src/components/home/live-feed-card.vue:160` → `boxShadow: "0 1px 2px rgba(0,0,0,0.10), 0 0 0 0.5px var(--v5-border)"`,作用在实底 `rgb(20,20,20)` 的分段控件("Activity" 68x44)上,**就在门覆盖的 `/pages/index/index`**。用的还正好是 `--v5-border` —— 语义上就是一条 border,只是换了属性名 | **HIGH** |
| 2 | **`outline` 冒充 border** | 注入 F 未被抓;门从不读 `outlineWidth/Style/Color` | MED |
| 3 | **伪元素画边** | 注入 H 未被抓;`getComputedStyle(el)` 不带 `::before/::after` 参数 | MED |
| 4 | **路由覆盖只有 10/88 = 11%** | `pages.json` 实有 88 条路由;`ROUTES` 写死 10 条。我用同判据扫全部 88 条 × 双主题:**75 条 full 违例**,其中门覆盖范围内只有 2 条,**73 条门永远看不到** | **HIGH** |
| 5 | **探针标签清单不全** | 只查 `uni-view,view,uni-text,text,uni-button,button`。实测漏掉 `UNI-INPUT`(4 处)、`DIV.uni-checkbox-input`(1 处);`uni-image / uni-scroll-view / uni-swiper` 同理未覆盖 | MED |
| 6 | **条件渲染的 UI 基本扫不到** | 本批修的 `milestone-celebration`(`v-if="m.active"`)、`tradein-window-banner`(`v-if="best"`)、`compute-share-entry`(`v-if=配置开关`)、`team.vue` royalty hero(`v-if="myRank>=3"`)在默认态**都不渲染**。门只做 goto + 滚到底,不点任何东西 → 这批的一半改动**门根本没验证过** | **HIGH** |
| 7 | **交互态 border 不覆盖** | 只测 rest 态,`:focus / :active / :hover` 上才出现的 border 一律看不到 | LOW |
| 8 | **<8×8px 元素跳过** | `if (r.width < 8 \|\| r.height < 8) return` —— 细分隔条 / 小徽标带边逃逸 | LOW |
| 9 | **指纹含 `size`** | `key = route\|kind\|cls\|size`。内容变动导致尺寸差 1px,存量违例就变成"新增"被拦(假阳性方向,保守,可接受);反向若新违例撞上老指纹会被静默吃掉(低概率) | LOW |
| 10 | **结果不确定** | 实测同一路由两次跑,voucher sheet(落地 ~1300ms 自动弹)、milestone 庆祝浮层、toast 时有时无 → 基线里 `vcs-panel` 在,我 1s 时刻查却查不到。门的产出**依赖跑的那一瞬间** | MED |

#### B4 假阳性 / 豁免放行过头 — **FAIL(1 处实锤 + 2 处判据不足)**

我把 10 条门路由 × 双主题里「**被 3 条内建豁免放行的、真·填充 + ≥3 边描边**」元素全枚举了:

| 元素 | 豁免理由 | 我的判定 |
|---|---|---|
| **`.nx-refresher` 36×36** `bg: var(--v5-surface)` + `border: 1px solid var(--v5-border)` | chrome 正则 | 🔴 **过头**。它用的是**卡片 token**(`--v5-surface` / `--v5-border`),不是《03》§4 点名的 `--v5-glass-*` / `--v5-chrome-*`;而且 `nx-refresher` 这个词是**本批 diff 里现加进正则的**(`scripts/zero-border-gate.mjs` 第 79 行)。等于「改门让违例合法」而不是删那 1 行 CSS(`app-chassis.vue:733`)。它还带 `box-shadow: 0 4px 16px`,与 §4「不用 box-shadow 做层级」也擦边 |
| `.nx-tabbar-pill` / `.nx-toast` / `.spv-glass` / `.nx-nova-btn` | chrome 正则 | ✅ 合理(TabBar / 浮层 / 玻璃砖,§4 明写) |
| `.nx-nova-badge` 18×18(橙底 + 黑边=页面底色) | chrome 正则 | ✅ 结果对,**理由错**:它其实是「隔离描边环」,但 18px > 16px 阈值,isoRing 兜不住,纯靠 `nx-nova` 这个词碰巧命中 |
| store 8×8 紫点(边=`rgb(20,20,20)`=卡底色) | isoRing | ✅ 合理 |
| — | dashed | 线上 0 命中 |

判据不足的两条(**目前没被利用,但洞在**):
- `dashed` 是**无条件**放行:任何**填充卡**只要把 border 写成 `dashed` 就合法。规范说的是"empty-state 虚线"属**透明容器**,门没有校验「底是不是透明」也没校验「是不是空态」。
- `isoRing` 不校验**描边色是否等于父级/页面底色**。一个 16px 圆形 chip 配品牌色描边 + 填充,会被当成隔离环放行。技法之所以合法是因为"用底色切一刀",色不对就不是这个技法。

另:`.spv`(子页头,`bg: rgba(0,0,0,0.55)` + 底边 hairline)**没有**被 chrome 正则识别(只有 `.spv-glass` 命中),于是它以 `partial` 身份躺进基线 —— 说明这套按类名字符串识别 chrome 的做法本身脆。

#### B5 基线逐条回源 — **基本 PASS,注释有事实错误**

`docs/ZERO-BORDER-BASELINE.json` 15 条 = 2 full + 13 partial。我跑 `--list` 复核,**live 结果与基线逐条对齐**(还原注入后:2 full + 13 partial)。

| 条 | 我的核查 |
|---|---|
| 2 条 full(`/pages/genesis/genesis` 金色 hero + Claim 按钮) | ✅ **是真违例,但留基线的理由站得住**:note 明写「待主人拍板,删金色描边会改旗舰品主视觉」,属设计决策不是机械修,且标了 🔴。**不是拿基线掩盖 bug**。代价要说清:门"绿"的同时,全站仍有 2 处已知 full 违例在线上 |
| 13 条 partial | ⚠️ **进基线是无效的**:门的 `added` 过滤器写死 `h.kind === "full"`,partial 永远不会拦,写不写进基线结果一样。放进去会让读的人误以为"这些被盯住了" |
| 13 条 partial 的 note:「属《03》§3 认可的**透明** hairline」 | 🔴 **事实错误**。实测 `.spv` 底色 `rgba(0,0,0,0.55)`(不透明);`/pages/store/store .grid items-center gap-3` 底色 `rgb(31,31,31)`(实底)+ 1px 上边。它们是**实底上的 hairline**,不是规范说的透明 hairline。分级决定(不拦)可以接受,**给出的理由不成立** |

`docs/ZERO-BORDER-ALLOWLIST.json` = 空数组 + reason 必填 selftest ✅。

---

### C. 实景(verify 绿 ≠ 渲染 OK)

环境:5173 先探活 `curl` → `200`,复用未杀进程;`?nx_device=off`;390×844;主题走 pinia `theme.setMode()`。

#### C1 逐个改动点:border 真没了 + 边界仍可辨 — **9/10 PASS,1 项无法在默认态验证**

对比度 = 卡内 5 点 + 上下各 1 点 与 卡外同高度 5 点 + 上下各 1 点的**真实截图像素**均值(绕开"渐变在 backgroundImage"和"半透明要逐层合成"两个坑 —— 不算,直接量)。

| 改动点(文件) | 运行时 borderWidth | dark 对比度 / ΔL | light 对比度 / ΔL | 判定 |
|---|---|---|---|---|
| `staking/compound-calculator.vue` | 0/0/0/0 | 1.201 / +9.0 | 1.110 / +4.1 | ✅ 双主题可辨 |
| `staking/position-row.vue` | 0/0/0/0 | 卡底 `rgb(20,20,20)` on `#000` | 卡底白 on `#F4F1E9`,截图可辨 | ✅(截图见 assets) |
| `staking/vault-row.vue` tier chip | 0/0/0/0 | 1.565 / +17.1 | 1.144 / −5.3 | ✅ soft tint 够 |
| `staking/vault-row.vue` ribbon | 0/0/0/0 | 1.297 / +11.1 | 1.122 / −4.6 | ✅ |
| `team/team-ledger-card.vue` | 0/0/0/0 | 1.189 / +8.5 | 1.081 / +3.1 | ✅ |
| `voucher-claim-sheet.vue` `.vcs-card` | 0/0/0/0 | 1.261 / +10.1 | 1.171 / −6.3 | ✅ |
| `milestone-celebration.vue` `.ms-card` | 0/0/0/0 | 1.125 / +6.0 | 3.768 / +44.4 | ✅(浮层需手工触发 store) |
| `store/tradein-window-banner.vue` | 0/0/0/0 | 1.137 / +6.2 | **1.002 / −0.1** | ⚠️ 见下 |
| `pages/me/me.vue` 退出按钮 | 0/0/0/0 | 1.123 / +5.5 | 1.072 / −2.7 | ⚠️ 边界可辨,但**文字对比度回归**,见 §5-① |
| `earn/compute-share-entry.vue` | — | — | — | ⛔ `v-if="cfg.isEnabled('computeShareEnabled')"` 默认关,**默认态不渲染,无法实景验证** |
| `pages/team/team.vue` royalty hero | — | — | — | ⛔ `v-if="myRank >= 3"`,mock 默认 V2,**默认态不渲染,无法实景验证** |

⚠️ `tradein-window-banner` 亮色主题:左边缘卡内 (250,239,232) vs 卡外 (244,241,233) —— **亮度差几乎为 0(ΔL −0.1)**,边界完全靠色相(暖橙 vs 暖米)撑。截图看整体仍读得出(渐变右下角收到纯白 surface,加上内容块强),**判为 NOTE 不是缺陷**,但它是本批唯一一个「删边后靠亮度已经分不出」的卡,且正好是转化触点。

截图证据(双主题):`docs/changes/assets/c2-acceptance/*.png`,原始数值 `edge-report.json`。

#### C2 反向扫全站 — **FAIL(65 处同类漏修)**

我用**同一套判据**(不复用被验收方的 sweep —— 它顶层有副作用无法 import)扫全部 88 路由 × 双主题:

```
routes=88 themes=dark/light  full=198(次) partial=268 extra=42 consoleErrs=0
去主题去重后 full = 75
  ├─ 表单控件类 8 → 《03》§3 末条明写归《无障碍规范》,合法豁免
  │   (uni-input×4 / .uni-checkbox-input / .lg-phone / .rg-phone / .lg-field-wrap / .nx-conv-input)
  └─ 真违例 67 → 门覆盖内 2(genesis,已在基线)· 门覆盖外 65
```

65 处漏网按形态:大卡 21 · 满宽条/按钮 12 · 胶囊圆形(chip/avatar)5 · 卡内嵌套 callout 块 5 · 其余混合形态 22。
热点路由:`team/commissions-how`(5)、`trust/trust`(5)、`me/wallet-cards-new`(4)、`genesis/how-it-works`(4)、`me/wallet-exchange-how`(4)、`trust/nex`(4)、`onboarding/estimator`(3)、`login`(3)、`me/wallet-withdraw`(3)、`me/kyc`(3)、`team/unilevel-how`(3)、`staking/how-it-works`(3)……共 36 条路由。

42 次 `extra`(outline / shadow-ring / 伪元素)去重后 11 处,其中 8 处是 `0 0 0 7~13px` 的 pulse / halo 光晕(装饰,非描边,**不算违例** —— 不做过度判定);真正是"1px 环冒充 border"的只有 §3-B3 第 1 条那处 `live-feed-card`。

#### C3 console / pageerror / requestfailed — **PASS**

不止 5 tab:**88 路由 × 双主题,console error = 0,pageerror = 0,requestfailed = 0**。

#### C4 布局副作用 — **PASS**

```
node scripts/overflow-probe.mjs --out … --diff docs/OVERFLOW-BASELINE.json
OVERFLOW PROBE: 38 处横向溢出 / 5 路由
DIFF vs baseline: 新增溢出 0 · 消失 0
```
删 border 会让盒子少 2px,理论上可能触发重排/塌陷 —— 实测无新增溢出,截图逐个看也无位移/塌陷。

---

### D. 防洁癖 / 防过度整改

#### D1 有没有把该留的删掉 — **PASS**

10 处删除逐个回源,**没有一处**属于「透明容器分组 hairline / empty-state 虚线 / chrome / 隔离环 / 表单聚焦框」:

| 删除点 | 删前底色 | 是否填充 | 该删? |
|---|---|---|---|
| compute-share-entry | `color-mix(tech-cyan 8%, var(--v5-surface))` | 实底 | ✅ |
| milestone `.ms-card` | `--v5-surface` + radial | 实底 | ✅(浮层身份可争,见下) |
| compound-calculator | `var(--v5-surface)` | 实底 | ✅ |
| position-row | `var(--v5-surface)` | 实底 | ✅ |
| vault-row tier chip / ribbon | `*-soft` tint | 半透明有色 | ✅ §6 尾句明写「内嵌 chip 禁加 border」 |
| tradein-window-banner | `linear-gradient(… , var(--v5-surface) 70%)` | 渐变填充 | ✅ |
| team-ledger-card | 2×radial + `var(--v5-surface)` | 实底 | ✅ |
| `.vcs-card` | `color-mix(brand 6%, var(--v5-surface-2))` | 实底 | ✅ |
| team royalty hero | radial + `var(--v5-surface)` | 实底 | ✅ |
| me 退出按钮 | `var(--v5-surface)` | 实底 | ⚠️ 按钮不在规范明写范围(**推断项,降一档**);且不是纯删边,见 §5-① |

一个可争的点(不扣分,记录):`milestone-celebration` 是**模态浮层**,《03》§4 把"浮层"和 TabBar/Header 并列写进 chrome 豁免。删它的边和留它的边都能从规范找到依据。实现方选了删,不算错。

#### D2 有没有夹带 — **PASS(源码零夹带);另有一处归属存疑**

`git diff -- src/` 12 个 hunk 通读,**全部是 border 相关**,无任何无关改动:
- `vault-row.vue` 顺带删了 `TierTone.borderColor` 字段和 4 条 tone 里的 `borderColor` 值 —— 删边后确已无消费者,`vue-tsc` 0 错验证,属**必要的死字段清理**,不算夹带。
- `me.vue` 同 hunk 里换了 `background`(surface → danger-soft),严格说是"删边 + 换底"两件事,但它是同一处的配套改动,不算夹带(问题在结果,见 §5-①)。

🟡 **归属存疑(工作树压着多批次 + 有并发会话在写,不直接算到本批头上)**:
`scripts/zero-border-gate.mjs` **不是本批新建的** —— 它已在 HEAD `ee0b91e`(C1 批次)里提交,232 行。但我核了 `git show HEAD:scripts/verify.sh`,**HEAD 的 verify.sh 里没有任何 zero-border 调用**,`docs/ZERO-BORDER-BASELINE.json` / `ALLOWLIST.json` 至今**未被 git 跟踪**。
即:C1 的 commit message 写「新增 token-copy / scrim-single-source / theme-constant / **zero-border 四道哨兵与其基线**」,而 zero-border 那道当时是**一个没人调用、没有基线的死脚本**。真正把它接成门的是本批(C2)。
→ 这条对 C1 是 commit message 过度声称;对 C2 是**加分项**(把死件接活)。请裁决方自行归属。

---

### E. 完整性

#### E1 同类全站扫 — **FAIL**

「改了 A 漏了 B」证据(同形态、不同路由):

| 本批修的形态 | 全站同形态还剩 | 举例 |
|---|---|---|
| 卡内嵌套 callout / inner block(compute-share-entry、`.vcs-card`) | 至少 5 组 × 多路由 | `353x77/95/113 r12px` 的 💡/⚠️/✓ callout,出现在 `*-how` 全系 7 个页面(`how-callout-box.vue`) |
| 填充卡 + 四边框(compound-calculator、position-row、team-ledger-card) | 21 处 | `trust/trust 357x155`、`trust/nex 353x252`、`me/goals 357x195`、`session/kicked .ks-card`、`ref/code 358x158`… |
| 填充按钮 + 描边(me 退出按钮) | 12 处 | `.cta-secondary`(onboarding/intro)、`.lg-social__btn`/`.rg-social__btn` ×8、`events` 的 6 个满宽 CTA、`genesis/how-it-works` 的 "Browse secondary market" |
| 圆形填充 + 描边(vault chip) | 5 处 | `trust/trust` 5 个 40×40 头像环、`me/wallet-exchange` 44×44 图标按钮 |

#### E2 门的路由清单够不够 — **FAIL**

`ROUTES` 10 条 / `pages.json` 88 条 = **11.4%**。且这 10 条全是主链路 tab + 4 个二级页,**登录/注册/onboarding/所有 `*-how` 说明页/trust 系/wallet 子页/events/missions 全在射程外**,而实测违例恰恰扎堆在这些页(65/67)。
加上 B3-6(条件渲染 UI 扫不到)、B3-5(标签清单不全),这道门的真实覆盖率**远低于 11%**。

---

## 4. 六维评分

| 维度 | 权重 | 分 | 证据(每条都有实测,无证据不给分) |
|---|---:|---:|---|
| 跨端兼容 | 25% | 90 | 10 处改动全是**纯删 CSS 声明**,无平台 API / 条件编译,H5 与 App(webview)同源渲染,不引入端差异;`vue-tsc` 0 错。扣分项:门只跑 H5(`localhost:5173` + `?nx_device=off`),mp-weixin / App 端零覆盖 —— 属项目既有约定,不单独重罚 |
| 视觉对齐规范 | 20% | 62 | 加分:10 处删边**运行时逐个确认 borderWidth=0/0/0/0**;双主题边界可辨(dark ΔL +5.5~+17.1、light ΔL 3.1~6.3,唯一例外 tradein 亮色 ΔL −0.1 靠色相撑);无溢出/位移(overflow diff 0/0)。扣分:同判据扫 88 路由仍有 **67 处真违例**、其中 65 处在门射程外;基线里 2 处 full 违例带绿上线;`.nx-refresher` 被"改正则"豁免而非删边 |
| 业务逻辑一致 | 20% | 85 | 无状态/store/路由改动;`vault-row` 死字段清理经 tsc 验证;`verify.sh` 323 pass 0 fail 覆盖 i18n 镜像 / 路由有效性 / SFC 闭合 等既有不变量。扣分:`me.vue` 把"删边"扩成"换语义底色",超出批次口径 |
| 转化 + 文案 | 15% | 85 | 零文案改动(diff 无 i18n / 字符串变更);转化触点视觉未削弱(store trade-in banner 截图实拍仍抢眼、Claim/Track CTA 未动)。扣分:tradein banner(转化触点)亮色边界亮度差归零;退出登录按钮**视觉权重被抬高**(白底细红边 → 整块粉底),与"取消/退出类动作要弱于主 CTA"的既有纪律方向相反 |
| i18n | 10% | 100 | diff 内 0 处 `src/i18n/` 改动;`verify.sh` 的 i18n key 镜像哨兵(94 namespace)PASS;88 路由 en 渲染 console 0 |
| token 纪律 | 10% | 80 | 删除的都是 `var(--v5-*)` / `color-mix(var(--v5-*))`,未引入任何 hex;新底色 `var(--v5-danger-soft)` 是表内 token,`token-copy` / `theme-constant` 两道哨兵 PASS。扣分:**token 配对**出错 —— 亮色 `--v5-danger #B9554A` 配 `--v5-danger-soft #F8E1DC` = **3.73:1**,15px/500 正文未达 AA 4.5:1(见 §5-①) |

**加权总分 = 0.25×90 + 0.20×62 + 0.20×85 + 0.15×85 + 0.10×100 + 0.10×80 = 82.7**

→ **< 95,不通过。**

---

## 5. 我找到的、清单之外的问题(按真影响用户排序)

### ① 🔴 HIGH — 退出登录按钮亮色主题文字对比度跌破 AA(本批引入)

`src/pages/me/me.vue:462-466`,`background: var(--v5-surface)` → `var(--v5-danger-soft)`,`color: var(--v5-danger)` 不变。

| 主题 | 文字 / 底 | 对比度 | 15px·500 需 4.5:1 |
|---|---|---:|---|
| light **改前** | `#B9554A` on `#FFFFFF` | **4.71** | ✅ 通过 |
| light **改后** | `#B9554A` on `#F8E1DC` | **3.73** | ❌ **不通过** |
| dark 改前 | `#FF5C5C` on `#141414` | 6.09 | ✅ |
| dark 改后 | `#FF5C5C` on `rgba(255,92,92,0.18)`/#000 合成 | ≈5.8 | ✅ |

双证:① 运行时 computed style 实测 `color: rgb(185,85,74)` / `background-color: rgb(248,225,220)` / `15px` / `500`;② token 表原值 `tokens.css:80-81` 独立复算,两路一致。
截图 `assets/c2-acceptance/me-signout-light.png` 肉眼即可见文字发糊。
现有机器门**抓不到**:DOM-QA 5 探针是 溢出 / <10px / tap<44 / img broken / 按钮无可达名,**没有对比度探针**。
建议:亮色档改用 `--v5-danger` 深一档做文字色,或底色改回中性;并给 verify 补一条「soft 底 + 同语义实色文字」的对比度哨兵(这个组合被 nexion-design 的"soft-tint 派生公式"鼓励,一旦亮色档 token 不达标就会成批复现)。

### ② 🔴 HIGH — `live-feed-card.vue:160` 用 `box-shadow: 0 0 0 0.5px var(--v5-border)` 在实底元素上画描边

就在门覆盖的首页。语义上 100% 是一条 border(连色 token 都是 `--v5-border`),只是换了属性名 → 铁律事实上没落地,门也永远看不见。
建议:要么删,要么把它纳入门(读 `outline` + 解析 `box-shadow` 的 0-blur ring)。

### ③ 🟠 MED — 门用「加正则词」豁免掉 `.nx-refresher`,而不是删那 1 行 CSS

`app-chassis.vue:733` 的下拉刷新指示器是 `--v5-surface` + `--v5-border` 的实底圆片,不是玻璃 chrome。本批 diff 把 `nx-refresher` 加进 `isChrome()` 正则。
这是**门被改去适应违例**的样本模式 —— 一旦成惯例,门就会随时间被稀释。建议改回删边(它已有 `box-shadow` 撑浮起)。

### ④ 🟠 MED — 门的结果不确定(voucher sheet / milestone / toast 随机出现)

实测同一路由不同时刻 DOM 差异明显(`vcs-panel` 在基线里、我 1.0s 时刻查为 0;staking 页随机弹出 milestone 全屏浮层 + toast)。
→ 基线会随跑的时机漂移,可能出现"CI 偶发红/偶发漏"。建议 sweep 前统一压制这些定时浮层(store 层 hide),或把浮层作为**显式测试态**单独走一轮。

### ⑤ 🟡 LOW — `zero-border-gate.mjs` 顶层有副作用,自称"可离线红测"的导出实际不可用

`const hits = await sweep()` 在模块顶层无条件执行,任何 `import { judge }` 都会拉起 Chromium。建议包一层 `if (import.meta.url === pathToFileURL(process.argv[1]).href)`。

### ⑥ 🟡 LOW — `isChrome()` 的 `borderColorRaw` 分支在运行时是死代码

`evaluate()` 里恒传 `""`,`var(--v5-glass-border)` 那条判断永不触发。

### ⑦ 🟡 LOW — 基线里 13 条 partial 的 note 事实不符

写"属透明 hairline",实测 `.spv` 底 `rgba(0,0,0,0.55)`、store 那条底 `rgb(31,31,31)`,都是**实底**上的 hairline。分级不拦可以,理由要改对。

---

## 6. 教条项(我判为**不该**修的,列出来防洁癖)

| 项 | 为什么不该修 |
|---|---|
| `uni-input` / `.lg-phone` / `.rg-phone` / `.lg-field-wrap` / `.nx-conv-input` / `.uni-checkbox-input` 的边框(8 处) | 《03》§3 末条**明写**「可访问性强边界(表单聚焦、非文本 3:1 对比)详见《无障碍规范》,**不在此用弱 border-subtle**」→ 表单控件的边界归无障碍管,删掉反而违规 |
| 42 次 `box-shadow: 0 0 0 7~13px` 的 pulse / halo(nova 按钮、在线点、rank 徽章) | 大扩散低 alpha 的**光晕动效**,不是描边;§4 允许 glow 装饰 CTA / online dot / Hero。判为"冒充 border"是过度判定 |
| `.nx-nova-badge` / store 8×8 紫点 的底色描边环 | 隔离描边环技法(边色 = 父级底色),用来把徽标从底图上切开;删掉会糊 |
| `.nx-tabbar-pill` / `.nx-toast` / `.spv-glass` 的边 | §4 明写 chrome 身份豁免 |
| `partial`(1-2 边)整类 | 分隔线是《03》§3 认可的合法用法,不该因为"有 border"就一刀切删。**但**判据应改成"底是否透明",不是"边数多少" |
| `milestone-celebration` 的边(本批已删) | 两可:它是模态浮层,§4 的 chrome 豁免点名包含"浮层"。删了不算错,**不建议再回退**(回退成本 > 收益) |
| `genesis` 2 处金色描边(留在基线) | 旗舰品主视觉身份,属**设计决策**不是机械修;实现方标 🔴 待拍板的处理是对的,验收方不应替主人拍 |

---

## 7. 截图与原始数据

`docs/changes/assets/c2-acceptance/`
- 改动点双主题元素截图 ×18(`compound-calculator` / `position-row` / `vault-tier-chip` / `vault-ribbon` / `team-ledger-card` / `me-signout` / `store-tradein-banner` / `milestone-card` / `voucher-card`,各 `-dark.png` / `-light.png`)
- `edge-report.json` — 每个改动点的 computed border / 卡内外像素 / 对比度 / ΔL 原始值

**验收期间对源码的改动已精确还原**:注入文件 `src/pages/staking/staking.vue` md5 与注入前一致(`3d4a65092a55f459c067aeb51a8621b4`),`git status` 该文件干净;本验收只往工作树加了本报告与 assets,未改任何源文件。
无遗留 headless chromium 孤儿(实测在跑的 chrome 全部属 `.agent-browser` / 用户自有 Chrome,playwright 实例均已 `browser.close()`)。

**并发会话时间线声明**:验收开始时(15:12)工作树只有 C2 的 12 个改动;测量全部完成于 15:15–15:28。
15:32 另一会话向工作树写入了 ~40 个新文件(`tokens.css` / 一批组件 / `token-copy-sentinel.mjs`),**不属于本批,未计入任何判定**。
测量后我回源复核过三处载荷结论仍成立:`live-feed-card.vue:160` 的 `0 0 0 0.5px var(--v5-border)` 仍在;
`--v5-danger #B9554A` / `--v5-danger-soft #F8E1DC` 亮色档值未变;`me.vue:466` 仍是 `var(--v5-danger-soft)`。
