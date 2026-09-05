# 滑块验证层级修正 + 全站层级秩序机器门(R2 P1)

日期:2026-08-04 · 文件:`src/components/captcha-slider.vue` · 门:`scripts/zindex-order.mjs`

## 1. 缺陷与根因

`.cs-layer`(滑块人机验证的最外层)`z-index: 90`,输给全站几乎所有浮层。滑块是**阻断式安全控件**:
它弹出时,发码流程正停在它上面等它解开 —— 被盖住不是「晚点再看」,是**死锁**。

**z-index 90 的来源判定:不是遮罩重构带入,是建档起就有。**

| 提交 | 日期 | 该行 |
|---|---|---|
| `a2e3340` feat: 短信验证码防轰炸闸门(FEAT-AUTH01) | 2026-07-06 | `.cs-mask { position: fixed; inset: 0; z-index: 90; … }` ← **首次出现** |
| `c778889` fix(ui): 滑块遮罩关闭 | 2026-08-03 | `-.cs-mask { … z-index: 90; … }` → `+.cs-layer { … z-index: 90; … }` ← 原样搬运 |

`c778889` 把遮罩从「卡片外层 + `.self`」改成「`.cs-layer` 外层 + `.cs-mask` 独立兄弟层」,
z-index 值一字未改。重构验证了「点遮罩能关」,但没有验证这一层在全域层级里的相对位置 ——
这是**正交维度漏检**,不是重构引入的新缺陷。

## 2. 层级秩序表(修前 vs 修后)

同一 stacking context 内,数值大小 = 真实压盖顺序(已用 `elementFromPoint` 实测验证过这个前提:
`.nx-chassis` / `.nx-content` / `.nx-page-enter` 入场动画结束后均无 transform/filter/z-index,不造 context)。

| 层 | 修前 | 修后 | 说明 |
|---|---|---|---|
| 页内装饰 / 页面 chrome | 0–50 | 同 | aurora · refresher 5 · tabbar 30 · stickyCTA 35 · sub-page header 50 |
| 底盘 chrome | 90 / 100 | 同 | `.nx-top-chrome` 90 · `.nx-header`/`.nx-navheader` 100 |
| 底盘之上常驻件 | 110–200 | 同 | 设备状态栏 110 · 消息抽屉 110/120 · opensea 120 · PC 设备卡 200 |
| 业务半屏 | 790/800 | 同 | trial-claim · slot-action · lucky-spin · voucher-claim · tradein · trial |
| 说明型半屏 | 900 | 同 | capacity-explainer · tradein-ladder |
| 分享半屏 | 8000/8001 | 同 | share-channel · share-poster |
| 里程碑庆祝 | 8900 | 同 | 必须在业务 UI 之下(2026-08-03 定) |
| 瞬时层 / 选择器 | 9000/9001 | 同 | toast host · 国家区号半屏 |
| 阻断式弹窗 | 9100 | 同 | confirm / netError 的 `.nx-mask` |
| **🔴 滑块人机验证** | **90** ❌ | **9500** ✅ | 见下方定序理由 |
| 模拟设备 chrome | 10050 | 同 | standalone-page-shell 的状态栏 / Home Indicator |

### 定序理由(为什么是「业务面最顶,但不是全局最顶」)

**先说反方**:确认弹窗(9100)也是阻断式的,凭什么滑块压它?两者互相盖,用户关掉上面那个都能看到下面那个,
表面上对称。

**打破对称的两点**:
1. 别的浮层被盖住,底下的流程**不需要它**就能继续;滑块被盖住,流程**没有它就不往下走** —— 用户看到的是
   「我按了发送验证码,什么都没发生」,而不是「有个东西挡住了」。这是唯一一个「被盖 = 流程停摆」的层。
2. `netError` / `confirm` 可以被后台重试**反复重新抬起**;排在滑块上面会构成循环遮挡,而滑块只由用户操作
   一次性关闭,不会反向骚扰。

**为什么不干脆排全局最顶(< 10050)**:10050 是模拟硬件 chrome(顶部状态条 + Home Indicator,后者
`pointer-events:none`),模拟的是手机自身的系统层;它与垂直居中的滑块卡片**零几何重叠**(实测卡片
y=259..586,状态条 y<54),压在上面不影响任何操作。让硬件层保持在最顶是正确的。

## 3. 同形全扫结果

`grep -rn "z-index" src/components/ src/pages/ src/styles/` → 77 处取值,全部过目。低值可疑者逐个**运行时普查**
(遮罩在场时枚举全文档 position≠static 且 z-index 为数字的元素,再对高于遮罩者做 elementFromPoint):

| 组件 | 值 | 判定 | 依据 |
|---|---|---|---|
| `genesis/purchase-sheet` · `genesis/eligibility-sheet` · `staking/stake-sheet` | 79/80 | **安全,不改** | 实测 staking 页遮罩在场时,全页高于 79 的只有它自己的 panel(80);同页共存的是 `.spv` 50 / `.nx-tabbar-wrap` 30。这些页用 `SubPageHeader`(50),**根本不渲染** `.nx-header`(100);`.nx-top-chrome`(90)在这些页高度≈0 且 `pointer-events:none` |
| `globe.vue` · `team/network.vue` 抽屉 | 70 | **安全,不改** | 同上普查:同页最高只有 `.spv` 50 / tabbar 30 |
| 790/800 六处业务半屏 · 900 两处说明半屏 · 8000/8001 分享半屏 | — | **安全** | 高于底盘 chrome 100,低于 toast/confirm —— 这是**正确**的:半屏开着时 toast 和确认弹窗本就该压在上面 |
| `message-drawer` 110/120 · `opensea-modal` 120 · `device-card-pc` 200 · `support/chat` 110 | — | **安全** | 均高于底盘 header 100 |
| `captcha-slider` | 90 | **❌ 唯一违例** | 见 §1 |

**结论**:全站只有滑块一处定错层,且它是全站**唯一**的阻断式安全控件(其余低值浮层从不与 9000/9100 全局宿主
共处一页,或本就应当在其之下)。静态看 79/80/70 很像同形缺陷 —— 运行时普查证否了这个猜测。

## 4. 机器门 + 红测

`scripts/zindex-order.mjs`,已焊进 `scripts/verify.sh`(`zindex_order_gate`,PASS 行打样本量)。
**两个正交断言**:

- **① 阶梯序**:登录/注册页同时挂载的 6 层严格递增 `.ms-overlay < .nx-toast-host < .cc-sheet < .nx-mask < .cs-layer < .nx-standalone-home`。
  **解析不到即红**(不是跳过)—— 覆盖「把 z-index 整行删掉」这个「遍历现存成员」永远走不到的方向。
- **② 天花板**:全站扫 77 处 z-index,白名单(仅 standalone-page-shell,附 reason)外不许有人 ≥ 滑块。
  阶梯只遍历已知成员,**将来新加一个 9600 的浮层它看不见**,②才看得见。

### selftest 红测(每个合取项单独隔离破坏,一次只坏一项)

```
14/14 pass
  基线:磁盘现状 0 违例(阶梯 6 级,天花板扫 77 个 z-index)
  红测①-1..5   逐个相邻对单独抬到越过上一级 → 必红(不同时坏两处)
  红测①-事故现场  .cs-layer 改回 90 → 必红
  红测①-删除    .cs-layer / .nx-mask 的 z-index 行删掉 → 必红(降数/删成员方向)
  红测②        新增 9600 业务浮层 → 必红(阶梯遍历不到的新成员)
  红测②-反向    白名单外的 10050 也必红(白名单按文件不按数值)
  阴性         注释里的层级表不计数 / 剥注释后仍取真实值 / 选择器缺失返回 null 而非 0
```

### 磁盘级红测(禁 `git checkout`,工作树有并发 agent 未提交改动)

`scratchpad/fix-r2-captcha-z/redtest.sh`:`cp` 备份 → 注入 9500→90(注入未生效则 exit 9,不许假红测)→
直跑门 `exit=1`(33 处违例)→ **抽出 `verify.sh` 里那段 wiring 原样跑,出现 `FAIL` 行**(证明「焊了」也「执行了」)→
`cp` 还原 → 复绿 `exit=0` + 两条 `PASS`。

## 5. 运行时证明(真浏览器,`?nx_device=off`,390×844)

`scratchpad/fix-r2-captcha-z/probe.mjs` —— 判据不是「`.cs-layer` 存在」(那是渲染断言不是遮挡断言),
而是对**把手 / 卡心 / 关闭键**三点做 `document.elementFromPoint`,看是否落在 `.cs-layer` 子树内。

场景(register 页,全真实用户路径):点 OAuth 按钮 → `toast.info` 在场 → 填手机号 → 点获取验证码 → 滑块弹出
→ 聚焦区号 chip 回车打开国家区号半屏(滑块层不 trap focus、也不把 `.rg-wrap` 置 inert,**键盘可达**)。

| | 修前 `z=90` | 修后 `z=9500` |
|---|---|---|
| S1 toast(9000)在场 | 三点可达(toast 贴顶 y=64..125、卡片 y=259..586,**几何不重叠**;只证 z 序不证遮挡) | 三点可达 |
| S2 区号半屏(9000/9001)在场 | ❌ 三点全部 `reachable:false`,命中 `cc-row` / `cc-head` | ✅ 三点全部 `reachable:true` |
| S3 真拖把手 | ❌ `.cs-fill` 宽 24px(静止值)= **拖不动** | ✅ 宽 114px = 跟手 |
| console error | 0 | 0 |

截图:`shot-before-s2-countrysheet.png`(滑块被半屏盖死)vs `shot-after-s2-countrysheet.png` / `shot-after-s3-dragging.png`。

> 诚实交底:审计原文列的 toast(9000)在 390×844 下与居中卡片**没有几何重叠**,单靠 toast 不构成遮挡;
> 真正复现死锁的是满屏遮罩类浮层(区号半屏 / confirm mask / 庆祝层)。缺陷成立,但触发面比原描述窄。
