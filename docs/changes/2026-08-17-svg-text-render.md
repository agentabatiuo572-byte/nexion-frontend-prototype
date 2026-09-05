# SVG 内文字真渲染(P-121)· Change Proposal

> 主人 2026-08-17 指令原文:「必须自己先定方案再动手(这是全仓示意图的画法决定,不是单点替换)」——方案决定权已预授权给本包,故状态直接 Aligned;拍板项只留「丝印英文豁免是否维持」(见末节)。
> 踩坑登记:`docs/PORT-PITFALLS.md` P-121(症状 / 判据 / 精确范围)。包 `pkg/aw-svg-text`。

- **工作线**:④ uniapp · **日期**:2026-08-17 · **状态**:Shipped(2026-08-18;T1 24/24 · A1/A2 对抗审计全部回修 · T2 增量验收 · full verify 18/18 · 合并主线)

## Why(问题 / 动机)
- 内联 `<svg>` 里写的 `<text>` 被 uni 编译成自定义元素 `<uni-text>`(uni 的文本组件),它不是合法 SVG 子元素,浏览器不排版:实测 `svg uni-text` 6 个、`getBoundingClientRect()` 全 0×0。用户看到的是**没有任何标注**的示意图(关系网没有「你」/「直推」/「扩展」、商品渲染图没有丝印与 GPU/CPU/RAM/SSD)。
- 危险性在于**源码看起来完全正常**:不报错、不留痕、i18n 三道门全绿。所以要两道门(源码 + 运行时)。
- 精确范围(已扫):模板 `<svg>…</svg>` 之内的 `<text>` 共 4 文件 / 13 节点:`product-render.vue`×3 · `globe.vue`×1 · `binary-how.vue`×5 · `network.vue`×4。仓内其余 `<text>` 都在 SVG 外,是正确用法,不动。

## 方案评估(H5 + App 两端 · 暗色字色 · 缩放/换行 · 无障碍 · 可否机器守)

先交底两条本包实测/回源发现的事实,它们决定了评估口径:

1. **App-vue 视图层从源码看压根不渲染模板里的 `<svg>`**(`[COMPUTED]`,读 `@dcloudio/uni-app-plus/dist/uni-app-view.umd.js`:CREATE 动作对非内置标签一律 `document.createElement(nodeName)`,nodeName 已大写(`SVG`/`CIRCLE`/`PATH`…)→ HTML 命名空间的未知元素,不是 SVG;`TEXT` 走 uni-text 组件)。也就是说 App 端不是「13 处字缺」,是**整张图(含全站内联 SVG 图标)都不出**——P-009/P-013 的「App 端也可用」是从 H5 webview 推断的,与源码相悖;DCloud 问答 67267 亦称「template 里没有 svg 标签,动态创建的才可用」。本环境无 HBuilderX / 真机,**无法运行时证实或证伪**,故本包对 App 端只做「不更坏 + 不锁死方向」,并把这条上报为包外 P0 待真机定案(见「拍板项」)。
2. **UnoCSS `presetAttributify` 劫持 SVG 的 `font-size` 属性**(实测):`font-size="9.5"` 被当成 attributify 工具类,生成 `[font-size~="9.5"]{font-size:2.375rem}` → 字号变 4 倍(38px)。SVG 文字此前从未渲染,所以没人见过。`fill-opacity="0.65"` 同样被扫成 `--un-fill-opacity: 0.0065`(目前无消费者,属同族隐患)。

| 候选 | H5 | App(iOS/Android webview) | 暗色字色 | 缩放 / 换行 | 无障碍 | 机器门 | 代价 |
|---|---|---|---|---|---|---|---|
| **A** `<foreignObject>` 包 `<view>/<text>` | ✅ 实测渲染(uni-text 85×24) | ✗ 外层模板 svg 在 App-vue 不渲染 → 无助 | ✅ token | ✅ 随 viewBox 缩放;✅ 可换行 | ✅ HTML 文本 | ✅ | 每处 5 行 + 逐标签算盒几何(13 处);WebKit 对 filter/transform 祖先下的 foreignObject 有历史缺陷 |
| **B** 文字挪出 SVG 绝对定位叠加 | ✅ | ⚠ 只有字出、图不出(App-vue 图本身不渲染) | ✅ | ✗ 字号不随 SVG 缩放(要 cqw 或 JS 量宽);product-render 的 viewBox 800×360 塞在 1:1 容器里有 letterbox,叠加要另算偏移 | ✅ | ✅ | 两套坐标系永远要手工同步;4 张图各自重排结构 |
| **C** `v-html` 字符串绕过编译 | ✅(仓内已有先例 lucky-spin 转盘) | ✅ 唯一能让**整张图**在 App-vue 出来的路(innerHTML 走浏览器解析,`[COMPUTED]` 未真机证实) | ✅ | ✅ 原生 SVG;✗ 不换行 | ✅ SVG text | ✅ | 4 张图改成字符串拼装 + 转义;globe/network 的节点点击要改事件委托(App 端 `e.target` 语义未证);脉冲 tick 重解析整图重启 SMIL;文案离开模板判定面,英文文案门看不见它 |
| **D** canvas / 图片 | ✅ | ✅ | ✗ 图片无 token;canvas 要自绘双主题 | ✗ 三语×双主题多套资产 / DPR | ✗ | ✅ | 丢交互(节点点击)、丢 SMIL、丢 i18n 文本布局 |
| **E(选定)** 渲染函数组件 `<SvgText>` = `h("text", attrs, slot)`,不经 uni 标签改写 | ✅ 实测:真 `svg:text`,bbox 353×90;嵌套 `<g>` / `v-for` / 插值全通 | ✗ 同 A(App-vue 图本身不出;`h("text")` 在 App 服务层同样落到 TEXT 节点) | ✅ token 原样 | ✅ 原生 SVG 随 viewBox 缩放;✗ 不换行(13 处里最长是丝印 `DISTRIBUTED · NO HARDWARE` 25 字符,三语实景全部落在 svg 盒内;需要换行的场景目前没有) | ✅ SVG text 进无障碍树 | ✅ 源码门:svg 内禁 `<text`,必 `<SvgText>`;运行时门:`svg text` bbox>0 + `font-size` 属性 == 计算值 | 一个 ~20 行组件 + 13 处标签改名,属性 / 绑定 / 事件全部原样;i18n 三道门继续判到这些文本节点 |

**为什么选 E**:它是唯一「零几何重算、零结构重排、绑定原样、i18n 门原样」的修法——问题的本质只是「`<text>` 这个字在 uni 模板里有两个意思」,那就给 SVG 那个意思一个不会被改写的名字。不选 A:换行这个唯一优势这 13 处用不上,却要 13 份盒几何 + WebKit 历史坑;不选 B:两套坐标系是长期维护税;不选 C:代价最高、且它对 App 的好处本环境证不了,而「全站内联 SVG 在 App-vue 不渲染」是比 P-121 大得多的整站决策,不该由 4 张图先斩后奏;不选 D:丢交互丢主题。
**attributify 劫持**在根上修 —— **摘掉 `presetAttributify`**(不是加 ignoreAttributes:独立审计 A1 P0-2 证伪了「加豁免 = 根上修」—— UnoCSS 提取器先查豁免表、后剥 `:` 前缀,绑定式 `:opacity="d.bright ? 0.5 : 0.25"` 永远匹配不到豁免表,却生成 `[opacity~="0.25"]{opacity:0.0025}`,全球节点图 669 个大陆点此前一直是 0.25% 透明度、肉眼不可见)。全仓 A/B(整仓源码喂 UnoCSS 生成器 + 实景 served CSS)证明:attributify 在本仓**没有一条被有意使用的规则**,产出的只有几十条撞上 SVG 呈现属性的意外选择器;`prefixedOnly:true` 变体产出 0 条有值规则,class 工具类不受影响。摘掉后实测:served CSS 里属性选择器 48 → 0,`.px-4` 等 class 规则原样,globe 圆点 opacity 直方图从 {0.0025:367, 0.005:302} 变回 {0.25:367, 0.5:302},大陆点阵可见。运行时门用「所有 svg 元素的呈现属性值 == 计算值」钉住这条不变量,源码门则「启用 attributify 即红(除非 prefixedOnly:true)」。

## What changes(改动点)
- 新增 `src/components/svg-text.ts`:`SvgText` 渲染函数组件(`inheritAttrs:false`,`h("text", attrs, slots.default?.())`),文件头注释写明只许用在 `<svg>` 内与原因。
- 4 文件 13 处:`<text …>` → `<SvgText …>`(属性、绑定、`v-if`/`v-for`、`i18n-en-ok` 注释全部原样);`product-render.vue` 丝印 / 芯片字样字重 700 / 800 → 600(V5 字重上限,之前不可见故无人管)。
- `uno.config.ts`:摘掉 `presetAttributify`(注释写明为什么不许再加;P-123)。
- **两道门**(同一提交落地):`scripts/svg-text-source-gate.mjs`(源码:svg 内禁 `<text`、`<SvgText>` 只许在 svg 内、uno.config 的 attributify 豁免在位;`--selftest` 逐条隔离红测)· `scripts/svg-text-render-probe.mjs`(运行时:4 路由逐张断言 `svg text` 数量 ≥ 期望、每个 bbox>0、非空、位于 svg 视口内、`svg uni-text`=0、`font-size` 属性==计算值;`--selftest` 用合成页面逐条隔离);登记 `scripts/verify.sh` + `scripts/gates.manifest.json`。
- 文档:P-121 追记(方案 + 两颗新雷)· `docs/前端产品更新日志.md` · HANDOFF(App 端待真机)· PORT-LEDGER 那句「保留为 SVG text(P-013 webview 渲染)」加更正指针。
- **Out of scope(明确不做)**:不动 SVG 外的任何 `<text>`;不改 App-vue 的 SVG 渲染策略(整站决策,上报拍板);不改 lucky-spin 的 v-html 先例;不改 `rgba(198,255,58,…)` 这类既有字面色(不在本包缺陷内,token-copy 门亦不判它);不做 presetAttributify 整体摘除(疑似 0 使用,列为可选拍板)。

## Impact(影响面)
- **页面 / 组件**:`pages/team/network` · `pages/team/binary-how` · `pages/globe/globe` · `components/store/product-render`(商品详情 Cloud Share 档)。
- **Store / model / i18n**:不改;文案继续读 `t.network.*` / `t.globe.*` / `w.*` 三语词典;丝印两行保留 `i18n-en-ok` 豁免(见拍板项)。
- **设计**:颜色 token 原样;字重收到 ≤600;无新文案。
- **构建配置**:`uno.config.ts`(gates.manifest globals → 本包 verify 走 full)。
- **PRD 章节**:纯渲染缺陷修复,不改功能契约 → 不同步 PRD。
- **不变量风险**:三语(labels 走词典,三语走查在 app 启动前注入语言,每语言独立 context)· 双主题字色(token)· 亮底文字 `--v5-on-brand`(network 中心节点原样)· 机器门与被判实现同提交。

## Done-when(可证伪)
- [x] mock 档 `?nx_device=off` 下,`pages/team/network` 有 4 个真 `svg text`(YOU / 头衔 / DIRECT / EXTENDED)、`pages/team/binary-how` 5 个、`pages/globe/globe` 1 个、`pages/store/detail?id=cloud-share` 6 个(2 丝印 + 4 芯片),每个 bbox 宽高 > 0,`svg uni-text` = 0(运行时门实测:4 路由 16 个,en/zh/vi 各一遍;T1 24 组 / T2 12 组独立复测)。
- [x] 每个 SVG 文本的计算字号 == 其 `font-size` 属性(attributify 已整体摘掉;运行时门 [attr-hijacked] 全页 svg 呈现属性 == 计算值;源码门 [attributify] 启用即红,真文件红测:把 presetAttributify 加回去 → 红)。
- [x] 三语(en/zh/vi,启动前注入)截图里 network 的 4 个标注、binary-how 的 5 个、globe 的 1 个都是对应语言的词典值;en 下 product-render 丝印可见(T1 报告 AC-5 三语两两不同,截图在 `.claude/pkg-dev/tester/`)。
- [x] 源码门红测:svg 内塞回 `<text>` → 红;`<SvgText>` 放到 svg 外 → 红;svg 内注释里的 `<text>` → 绿;svg 外的 `<text>` → 绿(selftest 64 格 + 真文件 3 变异)。运行时门红测:合成页面 svg 内 `uni-text` 0×0 → 红;字号被 CSS 劫持 → 红;空文本 → 红;数量不足 → 红;合法 → 绿(selftest 57 格 + 真文件 kebab/删 import 变异)。
- [x] `npm run type-check` 0 错;`npm run verify`(full)18/18 步 · legacy-suite 466 pass / 0 fail(主线那 1 条契约红已由上游 P-122 修掉;唯一 after-retry 是上游已登记的提现账单行探针抖动,干净 origin 树 A/B 同款首败后成)。

## 实施拆解(M 级内联)
1. [x] `SvgText` 组件 + 4 文件 13 处改名 + uno.config(最终摘掉 attributify)→ 实景截图(dark/light,三语)。
2. [x] 源码门 + 运行时门(各带 `--selftest`,A1/A2 两轮加固后 64 / 57 格)+ verify.sh / manifest 接线 → lint PASS。
3. [x] 三语实景走查(T1 24 组、T2 增量)+ dark/light 字色(network 三处标注改 token 派生并调到 ≥3:1)。
4. [x] 文档三处 + P-121 追记 / P-123 / P-124 + HANDOFF Q-14 → full verify → 审计(A1 / A2 skeptic 证伪 + 回修)→ done-review → close 包。

## 独立验收与对抗审计(实际发生的)
- **T1 黑盒验收**(`.t1-test.md`):4 路由 × 3 语言 × 双主题 = 24 组全 PASS;备注 network 三个小标注在浅色主题下写死柠檬绿几乎不可见 → 已改 token 派生。
- **A1 对抗审计**(`.a1-skeptic.md`):P0-1 kebab 无 import 两门全绿 · P0-2「加豁免 = 根上修」被证伪(绑定式 :opacity,globe 669 点隐形)· P0-3 只判排版不判可见 · P1-1~4 · P2-1~8 · P3 —— 全部按其修法回修(摘 attributify、共用谓词、可见性判据、Vue warn、min/whyMin、坏正则……)。
- **T2 增量验收**(`.t2-test.md`):globe 圆点 opacity {0.25:367, 0.5:302} 精确命中、大陆点阵可见;4 路由 × 3 语言回归 12/12;3 条无关路由构建配置改动后健全;**AC-B FAIL**:EXTENDED 标注浅色主题 1.47:1 → 已改 `--v5-nex` 85%(实测浅色 3.11:1、DIRECT 3.78:1;深色 5.45 / 8.23:1)。
- **A2 对抗审计**(`.a2-skeptic.md`):P0-1 外来 svg 文字可顶数 · P1-1 假岛 · P1-2 `{ default as X }` 隐形 · P1-3 route:null 无下限 · P1-4 百分比属性不比 · P2-1~8 —— 全部回修(出处标记 data-svgtext、岛按深度、import 形态、覆盖下限、属性形态、注释阀一对一、[masked]、变异存活格补齐、日志名)。
- 未覆盖(如实):App 端无真机;小程序端非目标;`npm run verify` full 在最后一次提交后跑(见收尾汇报)。

## 拍板项(不阻塞,已按推荐落地)
- **丝印英文豁免**:`CLOUD SHARE` / `DISTRIBUTED · NO HARDWARE` 现在可见了。选项 ① 维持英文 + `i18n-en-ok`(与同一张渲染图上 `NEXGRID` / `S1` / `Rack P1` 印刷体英文口径一致,是产品图上的字不是界面文案)② 第二行接词典三语。**推荐 ①**(一致性;丝印是排版装饰,一句话即可翻转成 ②)。不做的后果:无——只是主人要知道这两行英文现在真的会被中越用户看到。
- **App-vue 内联 SVG 整站不渲染(源码结论,待真机)**:选项 ① 先真机跑一次 `uni build -p app` 装机看关系网 / 全球节点页(1 小时内定案)② 直接按「App 端不支持模板 svg」立项:图标走 iconfont / `<image src=svg>`,示意图走 v-html 或 renderjs ③ 不管。**推荐 ①**(先花一小时把「源码怎么写」变成「屏幕上有没有」再立项)。不做的后果:App 首发时全站图标与四张示意图全空,且现有门一条都不会响。
- ~~presetAttributify 整体摘除(可选)~~ → **已摘除**(A1 P0-2 证据:ignore-list 挡不住绑定式属性;整仓 A/B 证明 0 有意使用;摘除顺带修好全球节点图大陆点隐形)。若主人希望保留 attributify,唯一可接受形态是 `presetAttributify({ prefixedOnly: true })`(源码门认这个形态),一行可回退。
