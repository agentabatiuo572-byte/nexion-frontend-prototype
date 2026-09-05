# NexGrid 改名 + 设计对齐 · 实施方案

- **配对提案**:`2026-07-22-nexgrid-rebrand.md` · **PRD**:`PRD/Nexion_产品功能架构设计文档_v3.7.md`(品牌词 P7 同步) · **定级**:L
- **北极星**:产品对外身份从 Nexion 全面切换为 NexGrid(三语可见层零残留),并把 90 页存量 UI 对齐 `UI/规范/` 11 册新设计系统(逐批可验收、批间可停)。
- **状态**:Planned
- 执行顺序:R1→R7(改名一次收口)→ B0 → B1 → B2..B8。设计批开批时在本文件追加该批细案(违规清单→整改项),不预写。

## 子任务 · 批次 R(改名)

### [x] R1 · i18n 三语品牌词替换 ✅ tester PASS(`…-t1-test.md`:105 namespace + 3842 叶子键三语镜像,NEX 未误伤)
- **范围**:`src/i18n/messages/zh.ts` `vi.ts` `en.ts`(~334 处)
- **AC**:
  - AC1:三文件 `grep -i nexion` = 0;NEX 代币词保留不误伤(精确词边界复查,防 learn/earn 型子串假阳性)。
  - AC2:三语键集合与顺序镜像不破;键名含品牌词的连同全部调用点改,tsc 0。
- **测试指令**:5173,`?nx_device=off`,三语切换抽 10 处对照。
- **敏感度**:普通

### [x] R2 · store/mock 用户可见字符串 ✅ tester PASS(`…-t2-test.md`:五档设备名实渲染 NexGrid,stellar* 内部 id 未动,admin parity 由 verify device_yield_parity 品牌中性覆盖)
- **范围**:`src/store/device-types.ts`(显示名)`orders.ts`(状态文案)`config-types.ts`(短链域)`src/mock/*.ts`(products/tasks/faq/events/leaderboard/tickets/nova-templates)
- **AC**:
  - AC1:运行时设备卡/订单流显示 NexGridBox·NexGridRack·NexGrid network,内部 id `stellarbox-*` 不动。
  - AC2:admin 跨仓镜像哨兵核查:比对显示名则外科同步 admin 镜像值,admin verify 不留红。
- **测试指令**:5173 → store/earn/orders 路由实景。
- **敏感度**:🔴 商品数据(加 code-review agent)

### [x] R3 · 组件/页面模板内联品牌词 ✅ tester 4AC 中 3 过;AC-R3-1 字面 fail 经 main 回源仲裁改判 PASS——8 处命中全是 `/static/img/products/nexionbox-*.png` 路径字符串(物理文件名,改则 404),属已签提案白名单「图片文件名」;AC 下发时漏带该豁免系 main 措辞疏漏。副产物:2 张 ranking 图 src 零引用 = dead asset,记入收尾清理。
> 回源三问(R1+R3):①服务北极星(三语可见层 0 残留,运行时 5 页正证据)②偏差 = AC 措辞缺白名单条目,非规格/实现错,已在此仲裁记录③下步成立。
- **范围**:grep 圈定的 ~30 个 `.vue`(live-feed-card、purchase-ticker、conversion-banner、trial 系、entry-surfaces 系等)
- **AC**:AC1:`src/**/*.vue` 模板/脚本字符串层 `grep -i nexion` = 0(注释白名单除外);AC2:改动页运行时抽查无布局回归。
- **测试指令**:5173 逐改动路由。
- **敏感度**:普通

### [x] R4 · 运行时标识去 Nexion(存储键/钩子/CSS 变量/账号域) ✅ tester PASS(`…-t2-test.md`:净环境注册全链,9 个 nexgrid-* 键有值 / nexion-* 0 / 账号域 @demo.nexgrid.ai / NEXGRID- 邀请码)
> 回源三问(R2+R4):①服务北极星(显示层+持久层双清)②观察项裁决:nx_otp_* 属品牌中性 nx_ 前缀不改;--nexgrid-header-h 为改名前既有的零消费死变量,记 B0 清理项;无规格/实现偏差③下步成立。
- **范围**:`src/store/*.ts` 全部持久键 `nexion-*→nexgrid-*`(~40 文件)、`__nexionAuthDev→__nexgridAuthDev`、`--nexion-header-h→--nexgrid-header-h`(全消费点)、`@demo.nexion.ai→@demo.nexgrid.ai`、`NEXION-→NEXGRID-`;**无迁移垫片**(主人拍板演示数据作废)
- 偏离说明:>5 文件,单一机械模式一个 AC 簇,不再拆。
- **AC**:
  - AC1:`grep -ri nexion src/` 仅剩溯源注释白名单;tsc 0。
  - AC2:清 storage 后注册→购买→签到→重进浏览器,全链在新键下自洽(新键有值、旧键 0 写入)。
- **测试指令**:5173,DevTools Application 面板核键名;uni 注入用 `{type:'object',data:X}` 包装。
- **敏感度**:🔴 状态机·钱包持久层(加 code-review agent)

### [x] R5 · scripts/哨兵重焊 ✅ tester PASS(`2026-07-22-nexgrid-rebrand-t5-test.md`)
> 回源三问:①服务北极星(哨兵与新品牌一致,机器门可信)②无偏差,device_yield_parity 本就品牌中性无需重焊(tester 定性正确)③下步计划成立。观察项:stellarbox-* 内部 id 属白名单,不另立子任务。
- **范围**:`scripts/*.mjs` + `scripts/verify.sh` 全部键名与文案断言 needle(auth-guard-verify、auth-register-existing-runtime、chrome-baseline、quest-probe、spec6-entry-surface-runtime、dom-qa、l1-shards 等,以 grep 全量为准);根目录 `probe-*.mjs` 临时脚本盘点后 Move `.trash/` 不改名
- **AC**:AC1:`bash scripts/verify.sh` 全绿(在 R1-R4 之后跑);AC2:`grep -ri nexion scripts/` = 0(白名单注释除外)。
- **测试指令**:`cd Nexion-uniapp && bash scripts/verify.sh`。
- **敏感度**:🔴 哨兵体系(改前后各跑一次防静默放过)

### [x] R6 · 品牌图资产重制(2026-07-23 全清)
> 已完成:header logo 亮/暗两版重制(mark 像素复用+NexGrid 字标,Playwright canvas 确定性合成,原图备份 .trash);盘点定谳:s1-v4(机架内部照)与 logo.png 无品牌字保留;ranking×3 + weekly×1 为零引用死资产已入 .trash。
> ✅ 悬挂清账(2026-07-23,两阶段):先在无 key 下用「路径③本地图像编辑」(Playwright+DOM 确定性合成:像素探测原字几何 → 手绘 SVG 字形按原比例/配色/挤出/辉光重排 → 克隆擦除旧字)做出过渡版;当日主人提供 OPENAI_API_KEY 并拍板 `gpt-image-2` → 升级「路径① AI 重生成」为最终版:`images/edits` + 字样区遮罩,每图 2 版选优(box-2/rack-2),逐字母拼写与细节人工终检通过。原图备份 `.trash/20260723-nexgrid-product-imgs/`,路径③产物备份 `.trash/20260723-composite-superseded/`;两条路径工具+遮罩+底图存档 `docs/changes/assets/nexgrid-imgs-composite/`;key 落 `.env.local`(gitignored)。AC1 ✅(在用图 0 张含旧字样);AC2 ✅(store 卡×3 + detail 头图×2 实景走查正常,console 0,AI 版复验同绿)。
- **范围**:`src/static/logo.png`、`img/brand/header-logo-{light,dark}.png`、`img/products/nexionbox-*/nexionrack-*.png`(6)、`img/marketing/nexionbox-s1-weekly.png`;先实景盘点哪些真含 Nexion 字样
- **AC**:AC1:在用图片 0 张含 Nexion 字样(不含字的原图保留);AC2:新图三语三主题实景截图各位置正常(header/商店卡/详情/排行)。logo 先评估 SVG/文本 wordmark,可行则免生图。
- **测试指令**:`npm run gen:image -- --model gpt-image-2`(Key 在 .env.local);5173 实景。
- **敏感度**:普通(生成质量主人终验)

### [x] R7 · meta 层 + R 批收口 ✅ 走查 tester PASS(`…-t7-walkthrough.md`:88 路由×三语 DOM 残留 0 · console 0 · logo 双主题截图确认)+ 空 title 移交项已修(pages.json globalStyle + index.html,运行时探针双路由 title=NexGrid)+ 工程 CLAUDE.md 品牌映射注记
> 回源三问:①服务北极星(可见层清零有 88 路由实景背书)②偏差 = 走查抓出「title 历史为空」正交缺口,属实现补齐非规格错,已修+实证③下步(B0)成立。
- **范围**:`index.html`(title)、`src/manifest.json`/`pages.json` 应用名核查、`src/App.vue`、`src/styles/tokens.css` 运行时变量(注释白名单)
- **AC**:AC1:浏览器 tab 标题/应用名 = NexGrid;AC2:R 批 Done-when 前三条全部回测过(独立 tester 全路由 DOM 扫描 `nexion`=0 + 三语抽查报告)。
- **测试指令**:5173 全路由脚本扫 + 肉眼五 tab。
- **敏感度**:普通

## 子任务 · 批次 B(设计对齐;逐批追加细案)

### [x] B0 · token 基建 + 字号映射表 ✅ 基建落地(AC1);⏸ AC2 待主人过目映射表才开 B1
- **范围**:`src/styles/tokens.css`(radius 已在→补 space×8 + type×14 阶梯 token + 全局 reduced-motion catch-all《08》§3 原文;删 --nexgrid-header-h 死变量);`docs/TYPO-MIGRATION-MAP.md`(9→14 档映射表 + 5 风险面)
- **AC1** ✅:阶梯 token 纯 additive 零消费者、reduced-motion 只在系统偏好下激活、死变量 0 消费者(双 tester 证);机器门 tsc 0 + verify **315/0**(含新品牌哨兵)+ value-ladder selftest 5/5+3/3 + browser console 0 + home 实景渲染正常(NexGridRack/NexGridBox live)
- **AC2** ⏸ 停等:映射表已落盘,**待主人过目**(尤其 ≤11.5px 存量 308 处升 12 的溢出风险 + value-ladder matcher 需先升 14 档)才铺 B1
- **敏感度**:🔴 横向基建(全站可见面)

### [ ] B1 · 五 tab 主链路(index / earn / store / team / me + 直属高频组件)· **InProgress**(主人 2026-07-22 批映射表后开工)
- **精确范围**(依赖闭包实算,防与 B2+ 重复劳动):五 tab 页面 + app-chassis 的 `.vue` import 闭包 = **75 文件**,清单落 `2026-07-22-b1-scope.json`。
- **债务画像**:51 文件含档外字号共 **252 处** = 机械可替换 203(13.5→13 ×38 · 11.5→12 ×64 · 11→12 ×39 · 10.5→12 ×37 · 10→12 ×8 · 30→34 ×8 · 18/19→20 ×5 · 其它)+ 需逐处判 49(12.5 ×32 判「理解决策内容→13 / 纯标签→12」· 14 ×8 · 32/28/22/17/48 等)。
- **前置(已完成)**:①字号哨兵口径由旧 9 档「档间黑名单」升 14 档「合法集白名单」(selftest 7/7 + 棘轮方向 4/4;13px 由违例转合法、13.5 由合法转违例,两例留作回归锚)②基线重算 = 全站 570 处/113 文件的「离 14 档距离」债务台账,每批收紧 ③🔴 **改前溢出基线已采**(`scripts/overflow-probe.mjs` + `docs/OVERFLOW-BASELINE.json`:五 tab 存量 42 处横向溢出)——墨菲前置,专打「149 处小字升 12 撑破窄容器」这个头号风险,迁移后 `--diff` 判新增溢出。
- 流程:5 路独立 auditor 按 11 册分镜头(文字 / 色彩+空间分层 / 组件+缺省页 / 无障碍+动效 / 定位+可视化+图标)出违规清单 → main 回源裁决(防洁癖:教条项单列不进 P0/P1)→ 整改 → 溢出 diff + 独立走查 6 维评分 ≥95 + console 0 → 打勾。
- 🔴 **范围自纠(2026-07-22,数据核对抓出 main 的划界失误)**:派 5 路 auditor 时按**目录**给范围(`components/{home,earn,store,team,me}/`),漏掉 **15 个躺在 `components/` 根目录、却被五 tab 直接引用的共享组件**(87 处债务),且恰是转化漏斗核心(trial-claim / trial-extension / trial-unbind-retention / trial-hero-banner / voucher-claim / voucher-banner / tradein / lucky-spin / slot-action / message-drawer / milestone-celebration / sticky-cta-bar / global-ui / nova-bubble / trial-ghost-slot)。已补派第 6 路全镜头 auditor(加挂漏斗纪律镜头:入口零门槛 / cancel 权重 / 0 meta)。**整改以 75 文件依赖闭包 252 处为准,不以 auditor 的 219 处子集为准。**
  - 元教训:**范围按目录划 ≠ 按真实引用划**;横向批次必须先算依赖闭包再派单,否则漏的正好是跨目录复用的关键件(同形于 [[feedback_css_block_deletion_selector_sweep]] 的「复用在类名粒度不在块粒度」)。
- **AC**:该批违规清单闭环(修复或白名单化留证)+ 溢出无新增 + 评分 ≥95。
- **敏感度**:🔴 主转化链路 + 横向基建
- **机器门缺口(整改后再焊,焊时须为绿)**——auditor 报「三个洞」,main 回源逐个核实后修正口径:
  1. dom-qa 最小字号地板 10px:**不是洞**,是代码注释明写的「9 档过渡期不 gate」刻意设计(`GATE_FONT=10` 硬拦 / `CENSUS_FONT=12` 仅 info 普查)。收紧到 12 会误伤未迁移的 B2-B8 → **等全部批次完成再收**;B1 的收敛由 value-ladder 棘轮基线降低体现。
  2. 防孤字断行哨兵:**uniapp 侧确实缺**,但 admin 侧真实存在(verify.sh:666 断言 globals.css `.dkpage{text-wrap:pretty}`,规则也真在 globals.css:547)→ 性质是**双胞胎工程哨兵不对称**,B1 收尾给 uniapp 补对称件。
  3. 全局字重 ≤600 哨兵:uniapp 仅有 1 处针对单文件的字重断言,**无全局门** → B1 收尾补。
  - 🔴 **方法论纠错留痕**:main 第一次 grep 精确串 `text-wrap: pretty` 未命中,险些下「SKILL 文档虚报哨兵」的错误结论;跑「已知存在断言」探针后发现是**自己的 grep 姿势**(代码里是带通配的正则)。印证 [[feedback_tool_output_self_distrust]]:察觉异常先跑已知答案探针,优先怀疑自己而非外部。

### 🔴 B1 重大发现 · rem 尺度漂移(架构级,待主人拍板是否全站修)

**现象**(main 亲自实测三视口,非 agent 转述):uni-app H5 运行时在 `<html>` 注入 `font-size: 16 × 视口宽/375`;UnoCSS 预设刻度类输出 rem → **全站间距/圆角随视口线性拉伸**。

| 视口 | 根字号 | `rounded-2xl` 实测 | 规范意图 |
|---|---|---|---|
| 375 | 16px | 16px | 16px |
| 390 | 16.64px | **16.64px** | 16px |
| 414 | 17.664px | **17.664px** | 16px |

**三条实锤**:①规范的 8pt grid / 圆角阶梯**只在 375px 视口成立**(414 下变 8.83pt grid,grid 语义失效)②同屏两套单位打架——inline `16px` 与工具类 `16.64px` 并存(实测页面圆角值列表里两者同时出现),即**当前已存在的视觉不一致** ③波及 ~550 处工具类(rounded- 211 / mt- 127 / gap- 114 / px- 74 等)。

**范围澄清(重要)**:**字号不受影响** —— UnoCSS 字号任意值(`text-[11px]`)输出 px 字面量而非 rem,且全站仅 14 处,字号主要走 inline px。故 B0 的 type token(px)与字号迁移策略**不受动摇**,受影响的只有间距/圆角。

**根因前提已证伪确认**:`uno.config.ts:9` 注释「We keep px (not rpx)」属实 —— **全站 rpx 命中 = 0**。即 uni 的 rem 适配机制对本项目**无任何用途**,纯属副作用。

**候选解**(ponytail 阶梯:能一行别加依赖):
- **A(倾向)**:CSS 固定 `html { font-size: 16px }`。一行、不加依赖、直接恢复规范意图;前提(不用 rpx)已证实,安全。代价:非 375 视口下全站间距/圆角**变小约 10%**(回到规范值),视觉更紧凑。
- B:装 `@unocss/preset-rem-to-px` —— 精准但**新增依赖**(node_modules 现无此包),违反「几行能做的事不加依赖」。
- C:维持现状,规范值理解为「375 基准」—— 但同屏两套单位打架的既有缺陷不解决。

**为何未当场实施**:①改动影响**全站 88 页**而非 B1 五 tab,超出本批范围 ②实施时 4 路 auditor 正在实测(改 CSS 会污染其对比度/截图/点击测量)。→ 待 agent 全部收口后做**受控实验**(改前后截图对比 + 溢出 diff),拿数据再请主人拍板是否全站铺开。

### [ ] B2 · 钱包群(wallet + bills/topup/withdraw±tracking/exchange±how/repurchase±how/nex/cards±new,~11 页)
### [ ] B3 · 商店订单群(store/detail/bundle/checkout/orders/order-detail + earn/device-detail,7 页)
### [ ] B4 · team 全家(team + 14 子页)
### [ ] B5 · genesis×4 + staking×2 + globe + market(8 页)
### [ ] B6 · onboarding×4 + login/register×2 + session/ref/entry-surfaces×4(~12 页)
### [ ] B7 · me 其余(profile/devices/achievements/goals/kyc/security/help/support±tickets/notifications/preferences/language/receipts/risk-disclosure/trial/proof/rewards±list,~18 页)
### [ ] B8 · events/daily/missions/trust×2/tx/search/compute-share/developer 等杂项(~10 页)
> B2-B8 各批 AC 同 B1 同构;开批时在此追加该批违规清单与整改项。

## 总回测 · R 批(2026-07-22 收口)
- [x] 全量机器门:vue-tsc 0(独立 tester 复跑)+ verify **315 pass / 0 fail**(314 存量 + 新焊 `no_oldbrand_check` 品牌回流哨兵;哨兵已双向红测:种阳必中/清净归零/拆词防自指)
- [x] 审计(力度匹配的多镜头对抗):5 独立 agent(文案 t1 / 运行时 t2 / 机器门 t5 / 88 路由走查 t7 / 敏感面 code-review),findings 全部 main 回源裁决——t1 字面 fail 仲裁为白名单(记录在 R3)、review MEDIUM 以 .trash 实证驳回、LOW 已修;confirmed P0=P1=0
- [x] 独立端到端走查报告:`2026-07-22-nexgrid-rebrand-t7-walkthrough.md`(88 路由逐行表+三语横切+截图)
- [x] done-review 6 维(证据全出自 agent/机器):①真落地=88 路由运行时 innerText 扫描+注册链新键实证 ②该有的在不在=title 空串被走查抓出并补齐 ③交互完整=注册全链真跑通+console 0 ④同形全站=codemod 全站扫+哨兵防回流 ⑤不变量=三语全扫/双主题 logo 截图/mock 键结构不变仅前缀/NEX 未伤/0 meta 未触 ⑥回源实景=tester 证据逐项抽验+fail/finding 均回源仲裁
- [x] 提案 Done-when 回测:条 1(运行时三语 0 残留)✅ 条 2(grep 白名单外 0 + 机器门绿 + 新键自洽)✅ 条 3 ✅(2026-07-23 补齐:最后 2 张渲染图本地合成重制,R6 全清)→ R 批 13/13 闭环
- [x] P7:前端产品更新日志已记(2026-07-22 条目);品牌回流哨兵已焊入 verify;PRD 品牌词同步 → 收尾报告向主人请示
- 进化闭环:①新机器门 no_oldbrand_check(灭「改名回流」类)②新坑记档:哨兵模式串写进被扫文件=自指假红,必拆词构造+双向红测(PORT-PITFALLS 追加)③memory 修正:gen:image 管线已不存在(reference_nexion_image_gen 过时)
