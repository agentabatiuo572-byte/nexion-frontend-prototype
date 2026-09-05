# DECARD-SPEC — 二级页面去卡片化规范

> 主人 2026-07-08 验收 4 样板页后固化。铺量 B1-B7 每个执行 agent 的第一份必读文件。
> 样板参照(改后真实代码):`pages/team/leaderboard.vue` · `pages/me/wallet-topup.vue` · `pages/me/support-tickets.vue` · `pages/team/rank-how.vue`。

## 目标

二级页面对齐 5 个一级 tab 页的视觉语法:**留白分区 + hairline 行 + 少量白名单卡**。解决卡片堆砌、层级不清、无呼吸感。

## 三种内容形态(DROP 卡壳后的落法)

**(a) 透明 hairline 列表** — 信息行/导航行组。参照 `wallet-topup.vue` channel list、`support-tickets.vue` ticket 行组、`home/earnings-ledger-card.vue`:

```html
<!-- 组容器:border-top 开组 + 2px 光学缩进;行:borderTop/Bottom hairline,末行无线 -->
<view style="padding: 0 2px; border-top: 1px solid var(--v5-border)">
  <view v-for="(r, i) in rows" :style="{ padding: '13px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--v5-border)' : 'none' }">…</view>
</view>
```

**(b) 单容器多行** — N 个"一行一卡"合并为 1 个 `var(--v5-surface)` radius-16 容器(**无 border**),内部行间 hairline,末行无线。参照 `home/my-fleet-section.vue` + `device-row.vue`(divider prop 模式,`ticket-row.vue` 同款)。

**(c) 去卡 hero** — 大数字直接坐页面地板,cap label(11px mono)+ 数字 + 辅助行;区内收尾行用 hairline。参照 `leaderboard.vue` prize hero:

```js
const heroStyle = { padding: "6px 2px 0" };  // 无 bg/border/radius/glow
const heroFooterStyle = { margin: "12px -2px 0", padding: "12px 2px 0", borderTop: "1px solid var(--v5-border)", fontSize: "11px" };
```

## 🔴 地板光晕一律直接删(主人终裁 2026-07-08)

源页面有「直接铺在页面底色上的 glow/aurora/radial 装饰」→ **连元素一起删,不迁移不调参**;顺带清 relative/isolate/z-index 失效属性。判定:光晕直接父级有 bg+overflow-hidden = 卡内合法保留(how-hero aurora、KYC complete wash);坐地板 = 删。审查实测:改后页面 `radial-gradient` DOM 元素数,地板光晕必须 0。

## 留卡白名单(改后每个残留 surface 必须对得上一条)

分段 tab 控件(surface-2 容器无 border + active pill)/ 行容器·nav list·icon-grid(形态b)/ spotlight hero 卡(单屏 ≤1,如 how-hero、完成态卡;中性 border)/ chip·pill·icon 底(soft tint **无 border**)/ 主 CTA(brand pill 999)/ 输入框(**surface-3 recessed 无 border**)/ 交互选择控件(radio 行 tint、支付方式)/ 聊天气泡(fill 无 border)/ 空态(dashed var(--v5-border-strong) 无 fill)/ accent callout(tint+border 双持唯一例外,如 HowCalloutBox)。

## 删 bg 配套动作(每删一个卡壳必做)

1. 清内层横向 padding → 内容齐 16px gutter(页面 px-4/mx-4),组容器 2px 光学缩进;
2. hairline + 间距 + section label 补回区域划分(不许"删完就散");
3. 清失效属性:border-radius / overflow-hidden / relative / isolate / z-index(有 absolute 子元素要裁剪的除外);
4. **UnoCSS `border` class 与 inline borderColor 必须同生共死**(class 单独残留会画默认色 1px 边);
5. 可点行保住 affordance:rest 态可见(chevron/箭头/tint)+ `active:opacity-70` + tap ≥44px。

## 🔴 正文排版层级(主人 2026-07-08 加码:去壳不等于排版,防"文字堆砌")

| 层 | 规格 | 用途 |
|---|---|---|
| 段落正文 | 13.5px / lh 1.65 / var(--v5-ink-2),段间 mt 10px | section 内说明性长段 |
| 行内单元标题 | 13.5px / 600 / lh 1.4 / var(--v5-ink),标题→正文间 5px | 步骤/图标行/FAQ 的标题 |
| 行内单元正文 | 13px / lh 1.62 / var(--v5-ink-2) | 同上的正文 |
| 引导句 caption | 12.5px / lh 1.6 / var(--v5-ink-3),与后续内容块间 14px | section 标题下的一句引导 |
| 数据标注 | 10-12px mono / ink-3/4 | 表格、图形内小字 |

颜色层级:标题 ink > 正文 ink-2 > 辅助 ink-3 > 脚注 ink-4——**正文禁用 ink-3**(灰蒙蒙一坨的根源)。组间距:步骤组 gap 14 / IconRow·FaqRow 组 gap 10。
### 🔴 全局间距系统(主人 2026-07-09 定稿,参照支付宝/币安/微信;反复被判"太紧"后一次性建立)

**导航栏 → 首屏内容 = 24px,但有两条 header 路径,分别处理**:
- **路径 A · SubPageHeader 页**(team/wallet/me 等 ~55 子页):24px 由 `components/sub-page-header.vue` 的 `.spv { margin-bottom: 24px }` 全局提供。**页面 template 禁止再加 padding-top/mt 顶距**(会叠加变过大);去卡时旧的 padding-top:N/mt-N 一律清 0。判定:页面 import 了 `SubPageHeader`。
- **路径 B · chassis-nav 页**(store/* 5 页 + entry-surfaces:用 `useSetPageHeader`,不走 SubPageHeader):全局 24px **不生效**(chassis contentTop 内容紧贴 nav)。这类页必须**每页 root 加单一 `padding-top: 24px`**(带注释)作为 nav→content 呼吸单源,并清掉旧 mt-1/mt-2 避免叠加。判定:页面无 `SubPageHeader`、有 `useSetPageHeader`。⚠️ 对这类页照搬「禁自加顶距」会让内容怼到 nav 下沿(正是主人吐槽的太紧)——B5-A 已确认此坑。
- **主版块 → 主版块 = 36px**:how 系由 `how-section.vue` 的 `mt-5 (20px) + padding-top 16px` 提供;非 how 页的多 section 页面,section 之间用 `marginTop: 20px` + section label(与 label 的 12-14px 合计 ~34px)。单一主题的连续流页面(leaderboard/钱包/agent 这类)块间 12px 即可,不需要 36px。
- **步骤/编号行对齐(序号与标题中线对齐)**:编号圈 + 标题放同一 `flex items-center` 行(中线对齐),正文缩进到标题下方(`marginLeft: 40px` = 28px 圈 + 12px gap);**禁止**编号圈用 `items-start` 顶对齐标题(圈高数字沉,视觉偏下)。`how-step-row.vue` 已是标准实现,页面本地步骤行照抄。
- **页面以 section label 开屏时,首个 label 收顶距**:section label 自带 `margin-top: 22px`(用于 section 之间);若页面第一个内容就是 section label,它会叠加 header 的 24px 变 46px。修法:首个 section label 顶距降到 ~2px(header 已提供呼吸)。参照 `rewards.vue` 的 `secHead(kind)` 首段判定。
- 步骤行之间:组件 scoped 细 hairline + `padding: 6px 0 13px`(:first/:last 修边)。
**布局关键属性(display/place-items/flex)写 inline style 不写 UnoCSS class**——`block`+`grid` 类互斥共存曾让步骤序号错位(样式表顺序决定谁赢,不同构建下随机)。

## 标题颜色 + 文案卫生(主人 2026-07-09)

- **说明页(how 系)section 标题用页面 accent 色**(HowSection 已内置 ACCENT_TEXT[accent]),与正文灰白形成颜色级区分,不只靠字重。其它域的二级页是否推广彩色标题,以 B2 批过图为准。
- **i18n 文案禁 markdown 记号与路由路径字面量**:`**加粗**`、`` `代码` ``、`` `/team/binary` `` 之类在 `<text>` 里原样裸露;页面引用写人话(「团队 → 平衡匹配」/ Wallet → Exchange)。机器门:verify.sh「no markdown residue in i18n copy」哨兵(2026-07-09 上线)。

## Section label

15px/600/sentence-case/`var(--v5-ink)`/letter-spacing -0.012em,margin `22px 2px 12px`(或复用 `components/me/section-header.vue`,可跨域 import);**禁 text-transform: uppercase**(mono cap 10-11px + tracking 的 kicker 除外)。区块间 24px 留白,**不画满宽分割线**(hairline 只做组开线/行分隔)。

## 设计铁律(违反即返工)

嵌套 ≤2 层 · filled 无 border(单一视觉差异)· 大卡禁 accent border(中性 var(--v5-border))· 字重 ≤600 · 字号 9 档(48/26-30/18-20/15/14-13.5/12-12.5/11-11.5/10-10.5)· 颜色只用 var(--v5-*) 禁 hex · `<text>` 裹 `<view>` · 不新增页面级 position:fixed · 亮底文字必 `--v5-on-brand`(brand-2 底用 `--v5-on-brand-2`,含 svg stroke)· 主 CTA pill radius 999。

## 已踩坑速查(样板期 audit 抓的,铺量必查)

- `w-full` + 负 margin 在 border-box 下只出血左侧不对称 → 负 margin 出血行**不要 w-full**;
- how 页说明区一律用 how/* 组件系(HowHero/HowSection[版A透明]/HowStepRow/HowIconRow/HowFaqRow/HowCalloutBox),accent 支持 violet=brand-2;
- 死样式常量随迁移即删;文件头注释同步改("card"→"row/block");
- 组件被多页引用时先 grep 消费面,逐页确认布局无依赖父卡 padding。

## 禁改清单

script 逻辑 / i18n key / 路由 / mock 数据 / 组件文件位置 / app-chassis / sub-page-header sticky / tokens.css 数值 / 一级 5 tab 页。

## 每页完成流程(主人 2026-07-08 加码:每页独立审查)

1. 改完 → `npm run type-check` 0 错;
2. 浏览器 `http://localhost:5173/?nx_device=off#/<路由>?` 实景:dark 截图 + console 0 error;流程页走全分支;
3. **派 1 个独立审查 agent**(只读):切边(两个裁剪源)/ 板块间距节奏(24px 区隔)/ 对齐(2px 光学缩进一致)/ border class 孤儿 / 白名单归类 / 失效属性残留;
4. 汇报格式:页面 | 改前 N surface → 改后 M | 残留逐个归白名单 | 特殊处理。

批末中心复核:tsc + verify.sh 全量 + re-grep 回审 + light 主题抽查 + 更新 DECARD-LEDGER + 主人过图。
