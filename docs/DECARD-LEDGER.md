# DECARD-LEDGER — 全站二级页面去卡片化台账

> 规范:`docs/DECARD-SPEC.md`。全站 88 页,5 个一级 tab 页已优化(不动),83 个二级页分 样板+7 批。
> 状态:pending / done(改完+自检)/ verified(独立审查+批末复核过)。surface 数 = 页面 .vue 内联 `background: var(--v5-surface` 计数(组件负载另记备注)。

## 进度

| 批 | 范围 | 页数 | 状态 |
|---|---|---|---|
| S 样板 | leaderboard · wallet-topup · support-tickets · rank-how | 4 | ✅ verified(主人验收 2026-07-08,audit P0=P1=0;how-section 定版 A 透明) |
| B1 | how 组件系页:binary-how、unilevel-how、commissions-how、leadership-pool-how、genesis/how-it-works、staking/how-it-works、wallet-repurchase-how、wallet-exchange-how、trust/nex | 9 | ✅ verified 2026-07-08(binary-how 迁组件系:~15 带边元素→白名单内,独立审查 P0=P1=0;其余 8 页联动实景全过;chrome-baseline 修复(nx_device=off)+ 基线重置 baseline-20260708 自检 PASS;tsc 0 + verify 172 绿)。**排版返工 2026-07-09 完成**:序号错位修复(block/grid 互斥根除)+ 10 页正文归一(SPEC 层级表)+ 步骤行间细线(组件 scoped :last-child)+ header 呼吸 18px 规则 + rank-how phases 收敛进 HowStepRow;主人吐槽区(unilevel 杠杆)终态验收图已发 |
| B2 | team 域:commissions、binary、agent、rank、leadership-pool、network、quota、tree、unilevel | 9 | ✅ verified 2026-07-09(3 agent 并行去卡;全局间距系统上线:header 24px 单源/主版块 36px/序号中线对齐;9 页逐页实景 + re-grep 全清 + chrome-baseline 5 tab 0px + tsc 0 + verify 173 绿。network/tree 可视化容器保守保留白名单) |
| B3 | 钱包+交易:wallet、wallet-withdraw、wallet-bills、wallet-exchange、wallet-nex、wallet-cards、wallet-cards-new、wallet-repurchase、wallet-withdraw-tracking、receipts、proof、tx/hash | 12 | ✅ verified 2026-07-09(3 agent 去卡;独立审查 12/12 PASS,去卡维度 0 P0/P1;金融数字全 ink 大字、支付控件零改、地板光晕清零、withdraw/exchange 对齐 topup、tx/hash 去 hex;tsc0/verify173/main 逐页实景全过)。**溯源备注**:工作树里 proof(buildShareLink 单源)+ receipts(无限滚动分页)是 earlier 会话既有逻辑改动(share.ts=今天18:30、scroll composable=6/4 老基建),非去卡 agent 引入;提交时应与去卡样式分开成独立 commit,勿 revert |
| B4 | me 设置/账户/支持:profile、security、kyc、devices、goals、rewards、achievements、help、support、support/messages、support/chat、language、notifications、preferences、replay-tour、risk-disclosure、trial | 17 | ✅ done 2026-07-09(4 agent 去卡;main 实景 10/17 全干净;tsc0/verify173;聊天气泡 fill 保留、help 补 .ph、trial 保转化 spotlight、risk 排版可读、设置 iOS 分组 form-b;kyc 本就 how 组件系无卡)。✅ 独立审查 17/17 PASS(P0=P1=0,三红线守住:转化零削弱/气泡保fill/控件零改,无夹带逻辑);唯一 P2=rewards 开屏 section label 顶距 46px 已修(secHead 首段收顶距,进 SPEC)。transient meta 词=B4-B 注释 funnel 已自改 |
| B5 | store+growth:store/detail、checkout、orders、order-detail、bundle;genesis/genesis、holder、marketplace;staking;daily、missions、events、learn | 13 | ✅ done 2026-07-09(4 agent 去卡;main 实景 10/13 全干净;tsc0/verify173;支付控件保、商品卡保商业感、genesis 金 spotlight、daily 游戏化保、内容卡保条目身份)。**关键发现**:store/* 5页是 chassis-nav 非 SubPageHeader,全局24px 不生效,已每页加 padding-top:24px(记 [[feedback-decard-two-header-paths]] + SPEC 两路径);B5-C 中和了 streak-power-ups 3处 conversion 注释。✅ 独立审查 13/13 PASS(四硬门全绿);唯一 P1=B5-A 在 orders 越界删了副标题+storeOrders i18n 词条(违反禁改),已**还原**(副标题+en/zh词条+注释复原,tsc0/mirror4036 PASS),去卡批恢复纯样式 |
| B6 | 入口表单:login、register、register/success、session/kicked、onboarding intro/estimator/connect/terms | 8 | ✅ done 2026-07-09(全屏自绘页降力度;connect/terms 真去卡、terms 正文升可读;login/register/success/kicked/intro/estimator 本轮 0 去卡改动——工作树 diff 是 earlier 会话 FEAT-SHARE 邀请链,非去卡)。独立审查 PASS |
| B7 | 营销/杂项:entry-surfaces ×4、compute-share/download、trust/trust、ref/code、globe、search、market、developer | 11 | ✅ done 2026-07-09(12 内容/营销页真去卡全 PASS;entry-surfaces chassis-nav 每页24px;globe 地图可视化保守留;market 顺带清违禁暗 hex;developer dev-only 轻改)。独立审查 PASS |

## ✅ 收尾关键说明(已全部提交 · commit 7f4d71e)

1. **一把合并提交(主人 2026-07-09 定)**:去卡样式 + FEAT-SHARE 邀请链 + 主题选择器三摊在共享文件(i18n en/zh、me/team/proof.vue)里物理交织,无法按文件干净拆分(hunk 级 `git add -p` 交互在本环境不可用),故合并成单 commit `7f4d71e`(194 文件 +4135/−2674),message 里分三段写清。仓库卫生同批处理:wrapped.vue 退役页转干净删除、gitignore chrome-baseline 瞬态输出。
2. **orders 副标题**:earlier 会话已刻意删「追踪硬件发货状态」(IDC 托管不发货,更新日志 2026-07-08 在案)。main 一度误判越界还原,查日志后确认是既有产品决策,**已撤销还原、恢复删除**(net 无变化)。教训:多轮工作树里的「越界」先查更新日志/上下文再动手。
3. **splash 氛围光(主人 2026-07-09 裁定:保持现状)**:intro/ref 是营销闪屏/落地页,氛围光是刻意高级感,保留;entry-surfaces 是 App 内首页(内容页),按去卡规则删光。视作两类页面,不强行统一。login 是纯表单页本就无氛围光。**此项 close,无代码改动。**

## 收尾后主人追加微调(2026-07-09,全 tsc0/mirror4036/verify174 绿)

- **9 处「说明入口」pill 文案统一「规则介绍」/「Rules」**(兑换/质押/创世/等级/版税/领导池/佣金/复投/rank);
- **unilevel**:规则介绍 pill 上移到「本月版税」标题同行(消上方空白);成员列表接邀请榜分页(20/页 + 查看更多,实测 20→40);术语统一「合伙人」(zh 朋友→合伙人、en friend→partner);「合伙人等级」区加大呼吸(块间 gap12→16、note11→12、cards mt12→16、progress mt12→18、filter +6 断点);
- **顶部空白全站扫平(修一处→扫同类)**:unilevel 的 pill 上移只改了 1 页,主人抓「所有页面顶部大空白为什么不改」——同形 how-link pill 悬空模式在另 8 页(binary/rank/staking/genesis/commissions/leadership-pool/repurchase/wallet-exchange)都有,逐页把 pill 从独立悬顶行移进标题/hero/cap 行(rank=currentRank cap · pool=weekPool cap · staking=totalLocked meta · repurchase=hero 标题 · genesis=皇冠 chip 行金调 pill · binary=Balance Match cap · commissions=双列 hero 无单一 cap→紧贴右上 4px · exchange 本就 pill+刷新同行只压缩样式)。9 页逐页浏览器实测 pill 与 cap 同行、header→pill≈24-30px 呼吸无空洞。教训固化 [[feedback-decard-typography]] 坑5(UI 结构性改动改一页必 grep 全站同形调用面)。
- **10 说明页小字加大**:8 处 sub-12 readability 正文→12px + 4 处行距 1.375→1.5(footnote/note/scenario);mono kicker(letterSpacing≥0.1em)与纯数据标注保持。
- 遗留观察:unilevel-how(说明页)正文仍用「朋友的朋友」解释网络结构(解释语境自然,未强改);如需全站统一「合伙人」再单独交办。

## 样板明细(S 批)

| 页 | 改前→改后 surface | 残留白名单归类 | 特殊处理 |
|---|---|---|---|
| team/leaderboard | 9→2(tabs 控件 + podium 列 fill) | tabs=控件;podium 3 列=grid cell;trophy chip=icon tint | hero/my-rank/rest-list/load-more 全透明;**地板 glow 删除(主人终裁)**;hero footer hairline 满宽 |
| me/wallet-topup(+topup-card-form) | 8+8→白名单内 | 地址行 surface-2=input 语义;copy 钮 surface-3;radio tint;awaiting bar=callout;complete 卡=spotlight(中性边);金额区/field/状态卡=fill 无边 | KYC 三步透明化;kycH1 22→20;radio 行删 w-full 修不对称;CTA 字色改 on-brand/on-brand-2 |
| me/support-tickets(+ticket-row/stat-box) | 13→白名单内 | stat tile=tint 8% 无边;tabs surface-2;气泡 fill;输入 surface-3;empty dashed | 一行一卡→hairline 行组(divider prop);.ph 类补定义;stat tile 补 active |
| team/rank-how | 8→白名单内 | how-hero=spotlight 卡;req/start tile=surface-2 fill;callout=例外 | 迁 how 组件系(版 A 透明 + violet accent);死常量清除 |

## 欠账台账(不阻断,按批消化)

- relWhen()/["messages"] 等 i18n 硬编码英文(ticket-row/support-tickets)→ B4 顺带
- how 页正文文案裸露 markdown 语法(unilevel-how `**直接版税**` 星号、commissions-how 反引号)——i18n 文案层既有欠账,`<text>` 不解析 markdown → 文案专项清理(非去卡 scope)
- binary-how SVG 右轨节点 tech-cyan vs 下方 B 轨合计 chip brand-2 语义色错位(迁移前遗留)→ 设计定夺后一并调
- how-step-row.vue 模板 `block`+`grid` 互斥 class 共存(grid 实际胜出,7 页在用)→ 组件小扫尾时删 block
- 「Change」裸文字 tap 区小、copy 36px/markSent 40px < 44px → B3 顺带
- wallet-cards-new/wallet-exchange 表单区与 topup-card-form 风格分叉 → B3 统一
- light 主题 surface-2 tile 比地板浅(全站 IconRow/FaqRow 既有观感)→ 铺量中观察,主人不适再统一调 token
- 全站防回归哨兵(双持卡指纹 grep)→ B7 完成后统一加进 verify.sh
- 产品更新日志:全部批次完成后合并记一条「二级页面视觉去卡片化」
- 一级页 tech-money-card 地板光晕:主人终裁规则适用但属已验收页,主人点名再删
