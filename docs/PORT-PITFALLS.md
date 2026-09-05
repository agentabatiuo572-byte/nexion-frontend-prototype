# PORT-PITFALLS — Next.js/React → uni-app 迁移踩坑登记

<!-- STALE-TERMS-OK: 踩坑登记 = 事故叙事,按定义记录的是当时的代码形态;删掉旧动作名等于删掉事故本身(见全局铁律:降噪不删事故叙事)。 -->

> 「反思 → 进化」台账。每批迁移收尾把新踩的坑追加于此，并尽量转化为
> `scripts/verify.sh` 哨兵或 `nexion-uniapp-port` SKILL 硬规则，让机制随每轮变强。
> 对标后台 `NEXION_DEFECT_REGISTER` / `PORT-LEDGER`。

格式：`#编号 [阶段] 症状 → 根因 → 对策(+是否已转哨兵/规则)`

---

## Batch 0（地基 + 机制）— 已踩 9 坑

### P-001 [脚手架] `unocss/vite` ESM-only 致 vite config 加载失败
- **症状**：`ERROR: "unocss/vite" resolved to an ESM file. ESM file cannot be loaded by require` → `failed to load config`。
- **根因**：vite 默认按 CJS bundle `vite.config.ts`；unocss 66 是 pure ESM，require 不了。
- **对策**：`package.json` 加 `"type": "module"`（项目自身无 .js，对 uni 影响面小）。
- **已转**：SKILL「脚手架」硬规则。

### P-002 [脚手架] type:module 后 `uni is not a function`
- **症状**：加 type:module 后，config 走 ESM，`import uni from "@dcloudio/vite-plugin-uni"` → `uni is not a function`。
- **根因**：vite-plugin-uni 是 CJS，ESM interop 下可调用体落在 `.default`。
- **对策**：`const uni = (uniPlugin as any).default ?? uniPlugin;`（见 vite.config.ts）。
- **已转**：SKILL「脚手架」硬规则 + 注释在 vite.config.ts。

### P-003 [依赖] pinia 装不上（ERESOLVE）
- **症状**：`npm i pinia` / `pinia@2` 均 ERESOLVE，要 `vue@^3.5.11`，但 uni 锁 `vue@3.4.21`。
- **根因**：pinia ≥2.3 把 peer 提到 vue 3.5+。uni 的 vue 版本滞后。
- **对策**：`npm i pinia@2.2.8 --legacy-peer-deps`（运行时与 vue 3.4 兼容）。
- **已转**：SKILL「依赖版本锁」+ PORT-LEDGER 依赖表。

### P-004 [架构] uni 的 App.vue 不渲染 template（无 root layout）
- **症状**：想把全局 overlay（toast/confirm）挂 App.vue 失败。
- **根因**：uni App.vue 仅 onLaunch/全局样式，无 `<template>` 渲染；uni 没有 Next 的 root layout。
- **对策**：全局 overlay（GlobalUi）挂进 **chassis 组件**（每页外壳 AppChassis）。每个页面用 `<AppChassis>` 包裹。
- **已转**：SKILL「chassis = 页面外壳」架构规则。

### P-005 [搬运] CRLF 行尾致正则失配
- **症状**：脚本搬 globals.css 时 `@theme inline` 块没删掉。
- **根因**：源文件是 CRLF；正则 `\n\}\n` 匹配不了 `}\r\n`。
- **对策**：用 `\r?\n` 或对无嵌套块用 `[^}]*\}`。处理 Windows 源文件正则一律加 `\r?`。
- **已转**：本台账 + SKILL「Windows/CRLF」注意项。

### P-006 [样式] token 体系靠任意值，不需 UnoCSS theme 映射
- **现象（正向经验）**：原项目 3219 处 `[var(--*)]` + 1889 处 inline `var()`。
- **结论**：UnoCSS 用 `presetWind3` + 内置任意值即可，token 作全局 CSS 变量（tokens.css），**零映射**就能让全部引用生效（H5 + App webview 均验证）。
- **已转**：SKILL「样式策略」。

### P-007 [渲染] uni 标签改名，evaluate 选择器别用标签名
- **症状**：`document.querySelectorAll('.nx-content text')` 返回 0，误以为内容没渲染。
- **根因**：uni H5 把 `<view>→<uni-view>`、`<text>→<uni-text>`、`<image>→<uni-image>`。
- **对策**：browser self-check 的选择器一律用 **class**，不用标签名。
- **已转**：SKILL「browser self-check」规则。

### P-008 [验证] uni H5 是 CSR SPA，curl 拿不到渲染内容
- **症状**：想 `curl | grep needle` 验证页面文案，拿到的是空 app 壳。
- **根因**：uni H5 客户端渲染，curl 只得 index.html 壳 + JS 引用。
- **对策**：verify.sh 只验 **编译 + HTTP200 路由 + 源码哨兵**；渲染 needle 交给 **Playwright evaluate**（review 阶段）。
- **已转**：verify.sh 注释 + SKILL「自测 vs 审查」分工。

### P-009 [跨端] 内联 `<svg>` 在 .vue 双端可用（因全 webview 渲染）
- **现象（正向经验）**：tab 图标用内联 `<svg><path>` 在 H5 渲染正常（bell + 9 path 全出）。
- **结论**：因决定**全用 .vue（webview 渲染）不用 .nvue**，SVG / CSS 变量 / CSS 动画在 App 端也可用。代价是 App 性能略低于纯原生 nvue，但换来 H5 代码最大复用。
- **已转**：SKILL「.vue not .nvue」架构铁律。

### 已知无害（不阻断）
- favicon.ico 404（dev 期，uni 默认无 favicon）→ chassis/index.html 阶段补 `<link rel=icon>` 即可。

---

## Batch 1（样板页 intro + home）

### P-010 [环境] cwd 漂移致 `Missing script: dev:h5`
- **症状**：重启 dev server 报 `Missing script "dev:h5"`，但 package.json 完好。
- **根因**：读原项目时 `cd Nexion-prototype`，Bash cwd 持续，重启 dev 命令在错目录跑。
- **对策**：所有 Nexion-uniapp 命令显式 `cd /d/WORKS/PLAN/Nexion-uniapp && ...`，不依赖持续 cwd。
- **已转**：SKILL 提醒 + 本台账。

### P-011 [路由] pages.json 新增页需**重启 dev server**（HMR 不处理）
- **症状**：新建页 .vue + 注册 pages.json 后，navigate 该路由不渲染（元素全空，但 token/theme 正常）。
- **根因**：uni 路由是编译期从 pages.json 生成，HMR 只热更已存在页面，不处理新增路由。
- **对策**：每次 pages.json 增删页面 → kill dev server + 重启。
- **已转**：SKILL「port 阶段」步骤 + 本台账。

### P-012 [机制] verify 哨兵 `framer-motion` 太宽，匹配注释误报
- **症状**：intro.vue 的注释 `/* framer-motion → CSS */` 被 framer-motion 哨兵 FAIL。
- **根因**：哨兵 `framer-motion|motion\.[a-z]` 匹配纯文本提及，非真 import。
- **对策**：精确化为 `from .framer-motion|<motion\.`（只查真 import / JSX 标签）。
- **已转**：verify.sh 已改（机制进化一例）。

### P-013 [正向·重大] uni H5 完整支持内联 SVG + SMIL 动画
- **现象**：intro 的 ComputeOrb（16 circle + 11 个 `<animate>`/`<animateMotion>` + `<radialGradient>` + `<feGaussianBlur>`）零改照搬，H5 全渲染 + 动画运行。framer-motion 入场也成功转 CSS `@keyframes`。
- **结论**：复杂 SVG 视觉/动画可**直接照搬**（因全 .vue webview 渲染）。framer-motion → CSS keyframes + `animation-delay` 是可靠映射。
- **已转**：SKILL cookbook「lucide/SVG/动画」。

### P-014 [审查] mcp-chrome 浏览器反复 closed / already in use
- **症状**：navigate 后 `Target page closed`，重 navigate 报 `Browser is already in use`，evaluate 跑不了。
- **根因**：mcp-chrome 进程不稳定（wedged），与 connect 页无关（dev output 无错、tsc 0）。
- **对策**：精准杀 `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where CommandLine -match 'ms-playwright\\mcp-chrome' | %{ Stop-Process $_.ProcessId -Force }` 后重 navigate。若反复不稳，**降级**：verify.sh(tsc+哨兵) 验代码正确性 + 信任同源逻辑（已验证页模式），完整视觉验证延后到 mcp 稳定。
- 注意：残留 console-*.log 可能是别项目(3002 admin)的旧日志，别误读。

### P-015 [机制] meta 哨兵 `funnel` 匹配代码注释误报（同 P-012 模式）
- **症状**：auth.ts 注释 "don't bounce them through funnel" 被 meta/ponzi 哨兵 FAIL。
- **根因**：`funnel` 是中性技术术语（onboarding funnel），哨兵 grep 含代码注释。
- **对策**：迁移时**代码注释用中性词**（onboarding flow，不写 funnel/conversion/庞氏），避哨兵误报；哨兵保留（防用户可见文案泄 meta）。
- **元教训**：源码哨兵扫注释会误报技术术语（framer-motion/funnel）。注释纪律 = 避 meta/框架专名；或哨兵后续排除注释行。

---

## Batch 2（home 基础层 — 6 v3 store + 4 primitives）

### P-016 [i18n] 迁移页引用 `t.ns.key` 前必须 grep 目标 namespace 真实 key 列表
- **症状**：register/login 迁移时臆测 i18n key（invitedYou / useOtp / usePassword / finish / errorInvalidCredentials / resetDone）被 vue-tsc 全抓。
- **根因**：凭印象写 key 名，源 en.ts/zh.ts 实际命名不同。
- **对策**：写 template 前 `grep -nE "key1|key2" src/i18n/messages/en.ts` 确认存在;vue-tsc 是 i18n key 的可靠门(`Messages` 类型 property 不存在即报错)。
- **已转**：SKILL「转换」步骤 + 本台账。（自 ledger Batch 1 note 归并）

### P-017 [类型] Pinia setup store 显式返回类型注解与 Ref unwrap 冲突
- **症状**：`trial-config.ts` 基线 `vue-tsc` FAIL TS2740 —— `Type 'Ref<{…}>' is missing the following properties from type 'TrialConfig'`。
- **根因**：setup store 写了显式返回注解 `defineStore("trialConfig", (): TrialConfigStore => {…})`，接口里 `config: TrialConfig`(裸值) 与实际 `return { config }`(`Ref<TrialConfig>`) 不匹配。zustand → Pinia 移植惯性带来的。
- **对策**：setup store **不写显式返回注解**，让 Pinia 推断（对齐已验证的 market.ts / profile.ts）。需要导出 store 类型时用 `ReturnType<typeof useStore>`，或抽独立 data interface(如 v-rank 的 `VRankData`)给纯函数用。
- **已转**：✅ verify.sh 哨兵 `no defineStore setup return annotation`（pattern `defineStore\(.*\(\): *[A-Za-z_]`）。机制进化一例。

### P-018 [架构决策·正向] CardStagger 弃 useNavMemory 依赖，framer staggerChildren → CSS nth-child
- **现象**：源 `card-stagger.tsx` 用 framer-motion `staggerChildren` + `useNavMemory`(back-nav skip 优化)。
- **结论**：uni 版用全局 `@keyframes nx-card-stagger-in` + `> *:nth-child(n)` 的 `animation-delay: calc(... var(--nx-cs-step))` 实现等效错落入场，`stagger` prop 经 CSS 变量参数化;**省略 back-nav skip**（非样本必需,避免为一个动画优化再移一个 store）。reduced-motion 用 `@media` 关闭。
- **已转**：SKILL cookbook「framer-motion → CSS」可补「staggerChildren → nth-child calc delay」条目。

### P-019 [跨端·重大] uni H5 里 `<view>` 的 template ref 返回组件实例,不是 DOM Element
- **症状**：home ZONE-1 挂载后 console 报 `TypeError: Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'` @ use-scroll-grow-progress.ts。verify 9/9 全绿、tsc 0,但**只有 Playwright 实景跑才暴露**(P-008 印证:verify 绿 ≠ client OK)。
- **根因**：plain Vue/web 里 `ref="elRef"` 绑在原生元素上 → `elRef.value` 是 DOM Element;但 uni 的 `<view>` 是注册组件(`uni-view`),ref 拿到的是**组件实例**,不是裸 Element → `IntersectionObserver.observe()` / `getBoundingClientRect()` 直接挂。
- **对策**：composable/组件里取 DOM 节点时**经 `$el` 解析**：`const el = raw instanceof Element ? raw : (raw as {$el?:Element})?.$el instanceof Element ? raw.$el : null`。已修 `use-scroll-grow-progress.ts`。
- **元教训**：所有 **DOM 测量类**逻辑(IntersectionObserver / getBoundingClientRect 宽度审计 / scrollIntoView)在 uni 都要走 `$el`;且这类 bug **tsc + 源码哨兵都抓不到**,必须 Playwright 实景验 console=0。**单页/批 port 后必跑一次 browser self-check**,不能只信 verify 绿。
- **已转**：composable 内置 $el 解析 + 注释;SKILL「审查」阶段已强调 Playwright console=0,本坑加强为 DOM-ref 必经 $el 的硬规则。

## Batch 2（store 主列表页）

### P-020 [类型] `importsNotUsedAsValues:error` 下纯类型 vue 导入必须 `import type`，不能用 `import { type X }`
- **症状**：`store-hero.vue` / `vs-phone-hero.vue` vue-tsc FAIL `TS1371: This import is never used as a value and must use 'import type' because 'importsNotUsedAsValues' is set to 'error'`。
- **根因**：这两个组件的 style 对象全用 `const s: CSSProperties = {…}`（无 `computed<CSSProperties>`），所以从 `vue` 只取了**类型** `CSSProperties`、没取任何运行时值。项目 tsconfig 开了 `importsNotUsedAsValues: error`，此时 `import { type CSSProperties } from "vue"`（内联 type 修饰但整条 import 无 value 用途）被判为「import 从未作为 value 使用」→ 必须整条写成 `import type`。已验证组件能用 `import { type CSSProperties } from "vue"` 是因为它们**同时**从 vue 取了 `computed`/`ref`（有 value 用途），混合导入下内联 type 合法。
- **对策**：组件**只从 vue 取类型**（仅静态 style 对象、无 computed/ref）时写 `import type { CSSProperties } from "vue"`；**同时取运行时值 + 类型**时才用 `import { computed, type CSSProperties } from "vue"`。
- **元教训**：`import type` vs 内联 `import { type }` 取决于该 import 语句**整体**有无 value 用途，不是单个符号。纯类型 import 用 `import type` 最稳。
- **已转**：本台账 + SKILL「port 要点」可补一条。vue-tsc 是可靠门(TS1371 直接抓)。

## Batch 2（购买→订单生命周期：checkout / orders / order-detail）

### P-021 [跨端·生命周期] 组件里 `onUnload` 不触发 → 定时器泄漏，须用 `onUnmounted`
- **症状**：把页面里验证过的「`onLoad`/`onUnload` 成对清定时器」惯性照搬到**子组件**（chain-payment.vue 的 30min 倒计时 + 12s auto-detect）时，`onUnload` 永不触发——组件 v-else-if 切走后定时器仍在跑（H5 内存泄漏；App 端同理）。
- **根因**：`@dcloudio/uni-app` 的 `onLoad`/`onShow`/`onUnload`/`onUnload` 是**页面级**生命周期，只在 `pages.json` 注册的 page 根组件上触发；普通子组件（被 page `import` 的 `.vue`）拿不到这些钩子，只有 Vue 的 `onMounted`/`onUnmounted`。
- **对策**：**页面**用 `onLoad`(读 query) + `onUnload`/`onUnmounted`(双保险，对齐 login.vue)；**子组件**一律用 Vue 的 `onMounted`/`onUnmounted`，绝不用 uni 页面钩子做副作用/清理。已修 chain-payment.vue（`onUnload`→`onUnmounted`）。
- **元教训**：「页面 vs 组件」的生命周期来源不同——`@dcloudio/uni-app` 钩子=页面专属；`vue` 钩子=组件通用。迁移时凡是带定时器/订阅的**子组件**，cleanup 必挂 `onUnmounted`。tsc + 哨兵都抓不到（import 合法、调用合法），属运行时泄漏，靠规则前置。
- **已转**：SKILL cookbook 可补「页面级 `useEffect(mount)`→onLoad/onShow；**组件级**→onMounted/onUnmounted」一条 + 本台账。

### P-022 [正向·样式] `${color}10` 透明度 hex 后缀 → uni 用 `color-mix(... transparent)`
- **现象**：源 order-detail 用 `backgroundColor: ${STATUS_COLOR}10` / `${color}20` / `${color}40`（把 8 位 hex alpha 拼到颜色字符串上）做状态色淡底/边框/光环。但 STATUS_COLOR 在 uni 是 CSS 变量 `var(--v5-brand)` 等——`var(--v5-brand)10` 不是合法颜色。
- **结论**：用 `color-mix(in srgb, var(--v5-x) N%, transparent)` 等效表达「颜色 @ N% 不透明度」，H5 + App webview 均支持（因全 .vue webview 渲染）。当前点 ring（源 `ring-4 ring-[var]/15`）用 `box-shadow: 0 0 0 4px color-mix(... 15%, transparent)`。
- **已转**：本台账（正向技法）。

## Batch 2（me / wallet 域：me / wallet / wallet-topup / wallet-withdraw）

### P-023 [跨端·样式] scoped `<style>` 里的 `@keyframes` 不跨组件边界 → 共享动画须放 tokens.css
- **症状**：me/wallet 子页的 spinner（`animation: spin …`）+ 步骤入场（`class="nx-step-in"`）不动——`spin`/`nx-step-in` keyframe 只定义在 `checkout.vue` 的 **scoped** `<style>` 里，别的页面/组件引用不到（Vue scoped 给选择器加 `[data-v-xxx]` 属性隔离，keyframe 名也被该组件“私有化”，跨组件 `animation-name` 解析为 undefined → 不播）。
- **根因**：Vue SFC `<style scoped>` 的 `@keyframes` 仅在该组件内可见；`nx-card-stagger-in`/`v5-*` 之所以全局可用，是因为它们定义在 `src/styles/tokens.css`（全局、无 scoped）。
- **对策**：任何被 **≥2 组件/页面**复用的 keyframe 一律定义在 `src/styles/tokens.css`（全局）。本批把 `@keyframes spin` + `@keyframes nx-step-in` + `.nx-step-in` 工具类（含 `prefers-reduced-motion`）加进 tokens.css。组件内 `animation: spin …` / `class="nx-step-in"` 即生效。
- **元教训**：迁 framer-motion → CSS 动画时，若动画要在多个 .vue 间复用，**先看 tokens.css 有没有**（grep keyframe 名），没有就**加到 tokens.css**，不要复制到各组件 scoped `<style>`（既不 DRY 又因 scoped 隔离失效）。tsc + 哨兵都抓不到（CSS 不进类型系统），属运行时静默失效，靠规则前置。
- **已转**：本台账 + tokens.css 注释。SKILL cookbook「framer-motion → CSS」可补一条「共享 keyframe 放 tokens.css 不放 scoped」。

### P-024 [类型] filter 后的联合类型不收窄 → 赋值给窄 ref 须显式 narrow 函数
- **现象（正向技法）**：`Channel.id: Withdrawal["network"] | "CARD"`；`KYC_CHANNELS = ALL_CHANNELS.filter(c => c.id===USDT…)` 运行时只剩 USDT，但 **TS 仍保留 `Channel["id"]` 联合**（filter 不收窄数组元素类型）。模板 `@click="network = c.id"`（`network: ref<Withdrawal["network"]>`）→ TS2322「"CARD" 不可赋」。
- **对策**：包一层 narrow 函数 `selectKycNetwork(id: Channel["id"]) { if (id==="CARD") return; network.value = id }`，在 `id==="CARD"` 分支 return 后 TS 把剩余收窄为 `Withdrawal["network"]`。对齐源的 `setNetwork(c.id as Withdrawal["network"])`，但用类型守卫比 `as` 更稳（不掩盖真错）。
- **已转**：本台账。vue-tsc 是可靠门（TS2322 直接抓）。

### P-025 [SFC·重大] `<script>` 缺 `</script>` 闭合 → vue-tsc 绿但 vite:vue 编译 500
- **症状**：`me/profile-row.vue`（错在 line 33）、`me/wallet-card.vue`（line 95）`curl` 取到 `<!DOCTYPE`（ErrorOverlay HTML，500），报 `Element is missing end tag`，错误帧 `^` 指向 `<script setup lang="ts">` 那一行；导致整个 me 域页面运行时 500。但 `vue-tsc --noEmit` = 0、Volar 不报错。
- **根因**：这两个文件**结尾就缺 `</script>` 闭合标签**（最后一行是 `};\n`，`<script setup>` 块一直延伸到 EOF 也没闭合；也无 `<style>`）。`@vue/compiler-sfc` 的块解析器（`vite:vue` 运行时用）**强制要求**显式 `</script>`，找不到就把 `<script>` 起始标签判为「missing end tag」并抛错。而 **Volar / vue-tsc 对缺尾 `</script>` 宽容**——它把脚本块当作延伸到 EOF 仍能抽取并类型检查，所以 tsc 全绿 → 又一例 **P-008「vue-tsc 绿 ≠ uni/vite 编译 OK」**。
- **为何 bisection 一度误导**：手敲的 stripped 复现文件 heredoc 自带 `</script>` 都能编译；只有 `cp` 原文件（保留截断）才同样 500。最终用 `grep -c "</script>"` 扫全 me 域，发现**有且仅有这 2 个文件**缺闭合（其余 22 个 me 文件都有），定位干净。可能是上游 port 时写文件被截断/漏写尾标签。
- **对策**：给两文件末尾补 `</script>`（保持视觉/逻辑零改，纯补标签）。修后两文件 `curl` 返回 `import{…}`，me 500-scan 清空，me.vue 编译，vue-tsc 仍 0，home/store 无回归。
- **元教训**：SFC 三块（`<template>`/`<script>`/`<style>`）**只要开了就必须闭**；`vite:vue` 严格、Volar 宽容，缺尾 `</script>` 是 tsc 抓不到的运行时 500。任何「tsc 绿但页面 500」先 `grep -c "</script>"` 排查块闭合。
- **已转**：✅ verify.sh 哨兵 `every .vue closes its <script>/<template>`（遍历所有 `.vue`，开了 `<script`/`<template` 却无对应闭合即 FAIL；已做正/负用例验证）。机制进化一例。

## Batch 2（earn 标签页 + bundle）

### P-026 [跨端·渲染] 裸插值 `<view>{{ x }}</view>` 在 App 端不渲染文本 → 必裹 `<text>`
- **症状**：device-card-pc 的「背景模式」帮助框照搬源 `<div className=...>{hint}</div>` 写成 `<view ...>{{ t.earn.phoneRequirementsHint }}</view>`。H5 webview 里这种裸文本**能显示**（uni H5 把 `<view>` 渲成 `<uni-view>`=div，浏览器容忍裸文本节点），但 **App 端 nvue/原生不渲染** `<view>` 的直接文本子节点——文案静默消失。vue-tsc 0、curl-compile 返回 `import{…}`（编译合法）、verify 哨兵全绿，**全都抓不到**（属 App 端运行时渲染差异，H5 自测也看不出）。
- **根因**：HARD RULE「ALL bare text→`<text>`」的反面——源 React 的 `<div>{text}</div>` 直译成 `<view>{{text}}</view>` 看着对、H5 也对，但跨端要求文本必须在 `<text>` 里。最易漏的是**单一文案直接塞容器**（不像 `名字<span>...` 那种会自然想到拆）。
- **对策**：任何 `<view>` 的直接文本子（含 `{{ }}` 插值、字面量）一律包一层 `<text>`。已修 device-card-pc 帮助框。
- **元教训**：H5 webview 对裸文本宽容 = 又一例「H5 绿 ≠ App OK」（同 P-008/P-019/P-025 家族，只是这次连 Playwright H5 都看不出，要 App 端真机/模拟器才暴露）。写 template 时把「容器只放容器、文本只放 `<text>`」当硬习惯，别等跨端验。
- **已转**：✅ verify.sh 哨兵 `no bare {{ }} directly in <view>`（pattern `<view[^>]*>\{\{[^}]+\}\}</view>`，单行裸插值容器）。机制进化一例。多行裸文本仍靠 review（哨兵只覆盖单行）。

## Batch 2（market + team 域：market / team / commissions / binary / agent）

### P-027 [响应式] React `useState(new Set())` 切换不能直译为 Vue `ref(new Set())` → 用 `reactive<Record<string,boolean>>`
- **症状（前置规避）**：源 market `const [stars, setStars] = useState<Set<string>>(...)` + `setStars(prev => { const next = new Set(prev); next.add/delete; return next })`。若直译成 Vue `const stars = ref(new Set())` 再 `stars.value.add(sym)`，**模板里 `stars.value.has(sym)` 不会重新求值**——Vue 的 `ref(Set)` 只追踪 `.value` 整体替换，不追踪 Set 内部 `add`/`delete`（响应式 Set 需 `reactive(new Set())` 且仍有模板 `.has()` 不触发 re-render 的边角）。
- **根因**：Vue 3 reactivity 对 `Set`/`Map` 的细粒度追踪在模板 getter（`.has()`）里不稳；React `useState` 每次 `setStars` 换新引用强制 re-render，Vue 无此机制。
- **对策**：把"集合成员"建模成 `reactive<Record<string, boolean>>({...})`，`has = (k) => state[k] === true`、`toggle = (k) => state[k] = !state[k]`。`Record` 的属性增改 Vue 稳定追踪，模板/computed 都会重算（market.vue stars 已用此法，filtered computed 读 `starState[sym]` 正确响应）。
- **元教训**：迁 `useState(Set/Map)` 一律换 `reactive(Record)` 或 `ref<string[]>` + includes，别直译 `ref(new Set())`。tsc 抓不到（类型合法），属运行时响应式静默失效，靠规则前置。
- **已转**：本台账。SKILL cookbook 可补「useState(Set)→reactive(Record)」一条。

### P-028 [跨端·正向] `navigator.share`/`navigator.clipboard` → uni `uni.share?.()` + `uni.setClipboardData`，须 optional-chain + typeof 双保险
- **现象（正向技法）**：源 InviteEarnCard 用 `navigator.share`（有则原生分享）+ `navigator.clipboard.writeText`（fallback 复制）。uni H5 无 `navigator.share` 的统一保证、App/小程序才有 `uni.share`。
- **对策**：复制一律 `uni.setClipboardData({ data, showToast:false, fail:()=>{} })`（双端可用）。分享用 `uni.share?.({ provider, type, href, title, summary, success, fail })`（App/小程序）——但 `uni.share` 在纯 H5 是 `undefined`，须 `uni.share?.(...)` optional-chain **且** 额外 `if (typeof uni.share !== "function") { 复制 fallback }`，否则 H5 点击主 CTA 静默无反应。`fail` 回调里也接复制兜底（App 用户取消/无微信时）。
- **元教训**：跨端 API（share/clipboard/scanCode…）H5 与 App 能力不一，必 optional-chain + 显式 typeof 兜底，不能假设 uni.* 都存在。
- **已转**：本台账（正向技法）。

### P-029 [架构·正向] zustand `useMemo(() => deriveFrom(store))` 聚合 → Pinia `computed(() => deriveFrom(storeRefs))`，跨 store 派生在页面层组合
- **现象（正向经验）**：team 页源把 commission 月聚合 / binary 对碰 / 网络分层全用 `useMemo([...deps], ...)` 在组件里算；这些读多个 zustand store 的字段。
- **结论**：uni 版每个聚合写成 `const ledger = computed(() => { for (const e of events.value) {...} return {...} })`，再 `const monthUSDT = computed(() => ledger.value.monthUSDT)` 拆字段。store 互不 import（对齐架构铁律），聚合逻辑落在**页面 computed**。`nextRankProgress(state)` 这类纯函数直接传 store 解构的数据对象（uni store 已把 setter 从签名去掉，只收 `VRankData` 数据字段）。
- **已转**：本台账（正向技法）。

## Batch 2（genesis + staking + daily 域）

### P-030 [跨端·渲染] 文本叶子默认写成 `<view>` 而非 `<text>` → 系统性铺开,App 端文本静默消失
- **症状**：genesis/staking/daily 域一次性写了 7 页 + 17 组件,文本叶子(label / value / 段落 / 单行文案)惯性写成 `<view :style="...">{{ x }}</view>`(把 React 的 `<div>{text}</div>` 直译成 `<view>{{text}}</view>`,且套了 inline style 看着像个"文本块")。verify.sh 单行哨兵 `no bare {{ }} directly in <view>`(P-026)一跑抓出 131 处。H5 webview 容忍(渲成 `<uni-view>`=div),但 **App 端 `<view>` 的直接文本子节点不渲染** → 全站文案静默丢。vue-tsc 0、curl-compile 全 `import{…}`、H5 自测都看不出(同 P-026 家族,只是这次是**整批系统性**而非零星)。
- **根因**：「容器 = `<view>`、文本 = `<text>`」是硬约束(P-026 的反面)。但写大批页面时,**文本叶子套了 `:style` 后视觉上像个 block,极易当成 `<view>` 写**。尤其纯 `{{ interp }}` 或字面量直接塞带样式的容器——不像 `名字<span>...` 那种会自然想到拆 text。一旦养成习惯,一个域几十上百处全错。
- **对策**：① 写 template 时硬习惯——**任何只含文本/插值的叶子一律 `<text class="block" :style="...">`,不是 `<view>`**(对齐已发布 store/detail.vue / me.vue 的 `<text class="block">` 模式;uni `<text>` 默认 inline,加 `block` 类得块级行为)。② 系统性已铺开时用 Node `fs` 脚本批量转:正则 `^(\s*)<view\b([^>]*)>([^<]*?)</view>(\s*)$`(单行、子内容无 `<` = 纯文本叶子)→ 换 `<text>` 并补 `block` 类;**别 shell out grep**(Windows Node 跑 cmd.exe 无 grep,用 fs.readdirSync 递归)。本批一次转 131 处,转后 vue-tsc 仍 0 + 哨兵 11/11 + curl 28/28 import。③ 多行文本叶子(`<view>` 换行后下一行才是裸文本)单行哨兵抓不到,靠 review 阶段扫 `<view ...>$` 后跟非标签行(本批写了 scan-multiline 脚本验 = 0)。
- **元教训**：P-026 是「零星漏一个」,P-030 是「**整批养错习惯铺几十处**」。写新页第一原则:**容器只放容器,文本只放 `<text>`**,当肌肉记忆,别等 verify 哨兵/跨端验回头改一片。哨兵(P-026 单行)是安全网不是设计——设计在写的时候就对。
- **已转**：✅ 已被 verify.sh 哨兵 `no bare {{ }} directly in <view>`(P-026,单行)覆盖;SKILL「HARD RULES」已有「ALL bare text→`<text>`」。本坑强化为「文本叶子默认 `<text class="block">` 不是 `<view>`」的写法肌肉记忆 + 系统性铺开时的 Node fs 批量转范式。

## Batch 2（me 子页 batch 1：devices / profile / security / kyc / goals）

### P-031 [架构·正向] 跨 store 不变量(slot-cap)用「参数注入」由页面组合,保 store 权威 + 不破 store-互不-import
- **现象**：源 `activateDevice(id)` 内部调 `trialReservesSlotNow()`(读 free-trial store)做 MAX_DEVICES 槽位上限——active 设备数 + 试用占的 shadow 槽 ≥ MAX_DEVICES 即拒。但架构铁律是**store 互不 import**(app.ts 不能 import free-trial)。
- **对策**：把跨 store 的那部分入参化——`activateDevice(id, reservedSlots = 0)`，**MAX_DEVICES 上限判断仍在 store 里(权威不外泄)**，但「试用占几个槽」由**页面**算好(`trialReserved = trialActive ? 1 : 0`)传进来。页面层本就同时持有 app + free-trial 两 store(组合是页面职责),store 之间零耦合。默认 `reservedSlots=0` 让 orders.advanceOrder 的纯设备 spawn 调用(`app.activateDevice(id)`)无需关心试用、直接通过。
- **元教训**：跨 store 的**判定逻辑**留在拥有该不变量的 store(此处 MAX_DEVICES cap 属 app),跨 store 的**输入数据**由调用方(页面)组合后注入。比「store 互相 import」或「把 cap 判断挪到页面」都干净——前者破铁律,后者让 store 失去不变量权威(别处调 activateDevice 可绕过 cap)。zustand 版能内部 `getState()` 别的 store,Pinia 版坚持铁律改用参数注入。
- **已转**：本台账(正向技法)。SKILL「架构铁律·无后端/store 互不 import」可补一条「跨 store 不变量:判定留 owner store,输入由页面注入」。

### P-032 [架构·正向] chassis-store 驱动的全局 sheet → uni 用 page 挂载 + `:device` prop + emit(因无 root layout P-004)
- **现象**：源 DeactivateSheet 在 chassis(IOSFrame)挂一次,用 zustand `useDeactivateSheet` store(`show(device)`/`hide()`)从任意页打开。uni 无 root layout(P-004:App.vue 不渲染 template),没法在 chassis 级挂一个全局 sheet host 给子页共享。
- **对策**：sheet 改成**普通组件**,由**用它的那一页**直接挂在模板里,用 `:device="sheetDevice"`(null=隐藏)prop 驱动 + `@wait/@force/@dismiss` emit 把动作回抛页面 handler(app-store mutation 在页面组合,sheet 只管 UI + 自己的进度时钟)。页面用一个 `ref<Device|null>` 当开关(`handleDeactivate` 里 `sheetDevice.value = d` 打开)。sheet 自带 `position:fixed inset` scrim + slide-up(framer→tokens.css keyframe),`onMounted/onUnmounted` 管自己的 1s nowMs 时钟(组件级 P-021)。
- **元教训**：源里「chassis 级单例 overlay + store 驱动」的模式(deactivate-sheet / 各种 bottom sheet),uni 一律降级为「页面挂载 + prop/emit」——因 P-004 没有可共享的 root host。只在**多页复用同一 overlay** 时才值得做 GlobalUi 式 chassis 内挂载(如 toast/confirm);单页用的 sheet 就近挂、prop 控、emit 抛,最简。
- **已转**：本台账(正向技法)。与 P-004 同族(uni 无 root layout 的连锁影响)。

## Batch 2（me 子页 batch 2：wallet-bills / exchange / nex / cards / cards-new / receipts / proof / wrapped）

### P-033 [类型·已有约定] uni `<input>` 的 `@input` 处理器 vue-tsc 判 DOM `Event` → 不能直接标 `(e: { detail: { value } })`
- **症状**：把 React `onChange={(e)=>x(e.target.value)}` 直译为 uni `@input="(e: { detail: { value: string } })=>…"`（或 `function onPan(e: { detail: { value: string } })`），vue-tsc FAIL `TS2322: Type '(e: { detail: {…} }) => void' is not assignable to type '(payload: Event) => void'`。uni H5 的 `<input>` 在 vue-tsc 眼里事件类型是标准 DOM `Event`（无 `detail.value`），但**运行时** uni 走的是 `e.detail.value`（小程序事件模型）。类型与运行时不一致。
- **根因**：uni 的 `@input` 既要满足 vue-tsc 的 DOM `Event` 签名（编译期），又要在运行时读 `e.detail.value`（uni 事件）。直接把参数标成 `{detail:{value}}` 与 vue 推断的 `(payload: Event)=>void` 冲突。
- **对策**：处理器参数标 `(e: Event)`，用一个 `detailVal(e: Event)` 助手桥接：`return (e as unknown as { detail: { value: string } }).detail.value;`。**这是 `topup-card-form.vue` 既有约定**（本批 wallet-exchange / wallet-cards-new 沿用）。迁任何带受控 `<input>` 的页面，input 处理器一律 `(e: Event)` + `detailVal`，别直译 React 的 `e.target.value` 也别标 `{detail:{value}}`。
- **元教训**：uni 事件「编译期 DOM 类型 vs 运行时小程序 detail」的二象性——`@input`/`@change`/`@confirm` 都属此类。vue-tsc 是可靠门（TS2322 直接抓），但写时按既有 `detailVal` 约定可一次过。
- **已转**：本台账 + SKILL「port 要点」可补「uni input 事件→`(e: Event)`+`detailVal`」。既有 `topup-card-form.vue` 为范例。

### P-034 [架构·正向] zustand `getState()` 跨 store 副作用 + 周期 `useEffect` → Pinia 直引 store + 页面 onMounted/onUnmounted interval
- **现象（正向技法）**：源 exchange 页用 `useEffect(()=>{ const s = useExchangeV3.getState(); s.resetIfNewDay(); s.setKycVerified(walletPaired); }, [walletPaired])`（避免 depend on store 触发循环，errata #24）+ 两个 `useEffect` setInterval(refreshRate 15s / secsAgo 500ms)。
- **结论**：uni 版 Pinia 无 `getState()` 静态访问惯性——直接 `const v3 = useExchangeV3()` 持有 store，`onMounted` 里调 `v3.resetIfNewDay()`/`v3.setKycVerified(walletPairing.walletPaired)`（一次，不放 watch 避免循环，对齐源意图）。周期 interval 是**页面级** → `onMounted` setInterval + `onUnmounted` clearInterval（P-021：page 也用 Vue 钩子清理最稳，别用 `onUnload`）。源「subscribe-for-render-but-getState-for-action」的循环规避在 Pinia 不需要（Pinia action 调用不强制组件 re-render），直接调即可。
- **已转**：本台账（正向技法）。与 P-021（组件/页面 interval onUnmounted）同族。

### P-035 [架构·正向] 535 行多子组件 modal → 通用 `sections` 描述符数组 v-for 渲染（DRY）
- **现象（正向技法）**：源 ReceiptModal 用 8+ 小组件（Section/Row/RowCopy/Divider/DetailsRows/LossCurve/KycSections/VerifiedStamp）+ KYC 与 task 两套结构 + 6 种 detail kind 分支，535 行。直译成等量 uni 子组件既冗长又难维护。
- **结论**：把「每段若干行」建模为 `DescSection { heading?, rows: DescRow[], checks? }` + `DescRow { k, v?, accent?, muted?, strong?, copyValue?, hint?, divider? }` 的**描述符数组**（computed `sections`），模板用嵌套 v-for 通用渲染一次（copy 行 `@click` 走 `uni.setClipboardData`，accent/muted/strong 经 `valueStyle(row)` 派生）。KYC vs task 只是 `sections` computed 里的两条返回分支。FT 的 loss_curve mini-svg 等纯装饰省略。比逐组件直译省 ~60% 代码且单点可维护。
- **已转**：本台账（正向技法）。受 ≥2 形态复用、行级高度同构的详情面板适用此法。

### P-036 [架构·重大] Batch-0 chassis 被简化，未字段级对齐原型（全站 chrome 偏离）
- **症状**：主人一瞥即指出「底部导航栏样式不对」+ 顺带标了 earn/me 的按钮。排查发现 3 个按钮其实**字段级对齐原型且渲染正确**（fill-slot/sign-out/add-device 都对），真根因是 **Batch-0 我快速搭的 `app-chassis.vue` 被简化**，不忠实：
  1. **TabBar**：原型是**浮动磨砂玻璃 pill**（`mx-3` + `rounded-22` + `backdrop-filter blur(40)` + active **渐变 brand pill** 背景 + label 12px + Liquid-Glass boxShadow），我做成了**实色满宽 bar**（`var(--v5-surface)` + border-top + label 10px + active 仅变色无 pill）。
  2. **Header**：原型 tab 页是「N badge + Nexion v3.2(home)/页面标题 + 搜索图标 + bell 通知角标」，我只有「Nexion + 光秃 bell」（无 N badge/标题/搜索/角标）。
  3. **子页 chrome（~56 页）**：原型子页**隐藏 5-tab bar**（只 home indicator）+ header 显示 back+标题；我所有页都显示实色 5-tab bar + Nexion 行（子页还叠了自己的 in-page back → 双 header + 错的底栏）。
- **根因**：地基组件（chassis）在 Batch 0 是我手搭并「verify 8/8 + 截图看着像」就过了，**没和原型 tab-bar.tsx / header.tsx 做字段级 diff**。「看着像 tab bar」≠「是原型那个 pill」。chassis 全站共享 → 一处简化 = 全站 chrome 偏离 = 用户一眼可见。
- **对策**：**chassis 路由感知重写**（`getCurrentPages()` 自检 tab/子页模式，零页面改动修全站）：tab 页→品牌/标题 header + 搜索 + bell角标 + 浮动 pill TabBar + active 渐变 brand pill + home indicator；子页→无品牌行 + 无 5-tab bar（页面自带 in-page back）+ home indicator。token `--v5-tabbar-bg`(dark `rgba(12,12,14,0.22)`) 已在 tokens.css。
- **元教训**：① **地基/chrome 组件（chassis/header/tabbar/sheet）必须和原型源码字段级 diff**，不能「看着像」就 verify 过——它们全站共享，简化代价 ×N 页。② 主人指一处 chrome 错 = 全站共享层的系统样本，必查同层全部维度（pill/header/sub-page/active 态）+ 跨 tab/子页两态实景，不只修被点那处。
- **已转**：✅ verify.sh 哨兵 `no native <button> tag`（cookbook：uni 原生 `<button>` 自带默认 chrome，必 `<view @click>`；迁移注释带 → 排除）。chassis 字段级保真本身机器难测 → 归本台账 + skill「审查」阶段「chrome 与原型 tab-bar.tsx/header.tsx 字段级 diff」硬项。

### P-037 [架构·重大] chrome 完整性盲区——只搬 Header+TabBar，漏 IOSFrame 挂载的其余 always-on chrome（nova 浮标 + 下拉刷新 + bell 角标）
- **症状**：P-036 修完 chassis 的 header/tabbar 后，主人再指「缺失 nova 浮标入口」+「缺下拉刷新功能和样式」+ 截图显 bell 有「15」角标我没有。运行时核查（直查 DOM/Pinia 实例）：tabbar-pill ✅、header N徽标/v3.2/搜索 ✅（P-036 已修对，主人截图 2/4 是修复前旧图），但 **3 项真缺**：① **StellaBubble（nova 浮标）** 完全没移植（`stella/` 只港了 avatar+card-slot+store，漏 bubble+drawer+triggers）；② **下拉刷新** chassis scroll-view 无 refresher；③ **bell 角标数**=0（notifications 未播种）。
- **根因**：移植 chassis 时我把「chrome」窄化为「**Header + TabBar**」两件，但原型的 chrome 拥有者是 `app/components/ios-frame.tsx`（≠ `(main)/layout.tsx`），它在 chassis 级**还挂着一整套 always-on 元素**：StellaBubble（+drawer+triggers）、PullToRefresh/PullableContent、SystemHost。我只盯着视觉最显眼的 header/tabbar，没**枚举 IOSFrame 的全部子挂载**逐一核对在不在。这是 P-036「声明即覆盖」幻觉的**完整性变体**：查了「搬来的对不对」（header/tabbar 字段级），漏了「该搬的全不全」（IOSFrame 还挂了啥没搬）这个正交维度。
- **对策**：
  1. **下拉刷新**：原型是 web 自定义 document-touch 手势（App 无 document，必换）→ 用 **uni 原生 `<scroll-view refresher-enabled :refresher-triggered @refresherrefresh>`**（双端通用）。`src/store/refresh.ts`（Pinia）`refresh()` 推进同款 mock：`useApp().tick(3500)`+`tickOrders()`+`useExchange().refreshRate()` + ~900ms 合成时延。
  2. **nova 浮标**：港 `stella/stella-bubble.vue`（fixed 右下 bottom 100px，`unread>0` 才显，含 badge + StellaAvatar + 内嵌 drawer + 触发器）+ `stella/stella-drawer.vue`（slide-up 聊天面板，framer→CSS keyframe，lucide→inline svg，input P-033，**bold/换行 markdown → `<text>` 分段** P-026，scroll-into-view 自动滚底）+ `mock/stella-templates.ts`（welcome + 4 快捷回复，复用 `getLockedTeasers`）。
  3. **bell 角标 + nova 角标**：港 StellaTriggers/V3 的聚焦子集（welcome + team/staking/market 三通道）进 bubble 的 `onMounted`，每条 push 同时喂 stella（nova 角标）+ notifications（bell 角标），首发延时缩到 1.2~9s 让两角标 ~10s 内出现（原型截图即已填充态）。timer 在 `onUnmounted` 清（P-021）；cooldown 在 app-singleton store 里 → 每页 chassis 重挂不会重复 welcome/刷屏。
- **运行时铁证**（不靠合成触摸——uni H5 refresher 阈值对合成 TouchEvent 不响应，工具限制非缺陷）：直查 `#app.__vue_app__` → Pinia 实例 → `refresh.refresh()` 实跑（`isRefreshing` false→true→false 无抛错，证 `@refresherrefresh→onRefresh→refresh()` 整链 + `:refresher-triggered` 驱动 spinner）；nova 浮标 DOM 在位（右下 badge「4」）+ 点开 drawer（头部 Nova/4 消息/中文快捷 chips）+ bell 角标「3」+ console 仅 favicon 404。
- **元教训**：**chrome 完整性 = 枚举原型壳层（IOSFrame）的全部 always-on 子挂载逐一核「在不在」**，不只搬最显眼的 header/tabbar。「我把 chrome 搬了」要追问「壳层一共挂了几件？我搬全了吗？」——和后台「动作完整性门 / 字段级门」同型：门只在被设计去看的维度有效，**正交的「该有的在不在」要单独枚举核对**。
- **已转**：✅ verify.sh 哨兵 `chassis_chrome_complete`（枚举断言 app-chassis.vue 含 `nx-header`+`nx-tabbar-pill`+`StellaBubble`+`refresher-enabled`，少一件即 FAIL，防 always-on chrome 再被静默简化）。verify 现 **13**。剩 1 同类偏离：bell 点击我接 `/pages/me/notifications` 整页 vs 原型 chassis 级 in-place slide-in MessageDrawer（功能可用，保真改进项，待主人定夺，未擅自重建）。

### P-038 [地基·重大] 全站字体变 Times New Roman + 全站 box-sizing 偏大——next/font 变量未定义 + 缺 Tailwind Preflight
- **症状**：主人发 4 个按钮截图（查看测算/填满槽位/添加设备/退出登录）问「这里对吗？为什么不改」——质疑我上轮「这 3 个按钮字段级对齐原型」的结论。我**上轮只 Read 源码就断言对齐，没和原型实景并排 diff**（违反自己的「不回源不实景」铁律）。这轮真做并排 computed-style diff，揪出**两个地基级系统 bug**：
  1. **全站字体 = Times New Roman 衬线**：按钮 computed `fontFamily: "Times New Roman"`。根因——`--font-v5`/body/`.font-mono-tabular` 的 `font-family` 链里引用 **`var(--font-display)` / `var(--font-jet-mono)`**，这俩在原型是 **next/font 注入到 :root 的变量**（`Manrope`/`JetBrains_Mono`，由 `app/layout.tsx` 注入）。**uni 没有 layout.tsx，这俩变量从未定义** → 按 CSS 规范含未定义 `var()`（无 fallback）的整条 `font-family` 声明是「guaranteed-invalid」→ **被丢弃 → 退回浏览器初始字体 = Times New Roman**。且 index.html **从没加载 General Sans/Manrope**（原型靠 layout.tsx 的 Fontshare `<link>`）。颜色/圆角/边框 token 全对（rgb 数值并排 match），唯独字体全错——**整站每个字、每个数字都在用宋体衬线**，肉眼一看就「不对」。
  2. **全站 box-sizing = content-box（元素偏大）**：add-device pill computed `height:66`（原型 44），sign-out `46`（原型 44）。根因——原型靠 **Tailwind v4 Preflight** 的全局 `*{box-sizing:border-box}`；uni **无任何全局 reset**，UnoCSS `presetWind3` **不注入 preflight**（reset 是独立 `@unocss/reset`，没引）→ 默认 content-box → 凡「显式 height/width + padding/border」的元素都比原型大（padding 外加而非内含）。我的组件全是原型(border-box)的字段级拷贝、本就为 border-box 写的，跑在 content-box 下才是 bug。
- **对策**（两个地基 patch，一次修全站）：
  1. tokens.css `:root` **定义 `--font-display` + `--font-jet-mono`**（含完整 sans/mono fallback 链）→ 所有 `var()` 解析成功 → 声明有效 → 即便字体没加载也退到 Segoe UI/Arial 干净无衬线，绝不再 Times New Roman。
  2. index.html `<head>` **加载 General Sans(Fontshare)+Manrope+JetBrains Mono(Google)**，`display=swap` 防 FOIT → 与原型同源同字体。
  3. tokens.css 顶部加 **全局 `*,::before,::after{box-sizing:border-box}`** → 对齐原型 Preflight。
- **运行时铁证**：修后 computed `fontFamily` 链解析到 **General Sans**（`document.fonts.check('16px "General Sans"')=true`，loaded 列表含 General Sans+JetBrains Mono）、`isTimesNewRoman=false`；add-device/sign-out height **44/44**（曾 66/46）、boxSizing `border-box`。home/me/earn 三页全页截图肉眼复验：全 General Sans、布局无破坏、按钮尺寸对齐原型。
- **元教训**：① **「字段级对齐」必须是实景并排 computed-style diff，不是只 Read 源码**——源码 + token 可以字字相同，但**运行环境缺失的地基（字体加载 / 全局 reset / next/font 注入的 var）**让渲染完全不同。我上轮只读源码就说「对齐」是错的，被主人当场抓出。② **跨框架移植必查「框架隐式地基」**：Next.js 的 next/font 注入 :root var + Tailwind Preflight 的全局 box-sizing，都是「源码里看不见、但渲染依赖」的隐式基础设施；uni 一概没有，必须显式补。③ 主人指一处「样式不对」= 地基样本：单个按钮色/形对不上往往是**全站字体/盒模型**这种地基塌方的局部投影，必往「全站共因」深挖，别只盯被点的那个按钮。
- **已转**：✅ verify.sh 哨兵 `css_foundation`（断言 tokens.css 定义 `--font-display`+`--font-jet-mono` + 含 `box-sizing:border-box` + index.html 有 `general-sans` 字体链接，任一缺即 FAIL）。verify 现 **14**。

### P-039 [架构·重大] `<scroll-view>` 独立合成层杀死 fixed chrome 的 backdrop-filter 磨砂 + 缺全局页面入场动画
- **症状**：主人指「导航栏透明度不够，header 也需要透明，透明色彩渲染范围要和原型一致」+「每页载入入场动画缺失 + 下拉刷新按钮颜色要和主题一致」。
- **根因**：① **磨砂失效**——chrome token（`--v5-chrome-bg` rgba(0,0,0,0.55)/`--v5-tabbar-bg` rgba(12,12,14,0.22)）+ `backdrop-filter` 与原型**逐字段一致**，computed 也都在，但**视觉无磨砂**。注入亮色块实测：header/pill 后的内容**锐利实色、完全没被磨砂** → 因为我 chassis 内容用了 **uni `<scroll-view>`**，它渲染在**独立合成层**，fixed chrome 的 backdrop-filter **抓不到**滚动内容 → 只磨砂到 chassis 近黑底 → 看着扁平不透。原型用的是普通 `absolute inset-0 overflow-y-auto` **div（同一绘制层）**，fixed header 能磨砂它。② **入场动画**——原型有全局 `PageTransition`（opacity 0→1 + y 12→0 + 360ms ease-out-expo，每页 mount 重放），我只港了 home 的 card-stagger，**漏了全局页面入场**。③ **下拉刷新 spinner 色**——我用 uni 原生 `refresher-default-style="white"`，只能 black/white，无法主题色。
- **对策**（一个 chassis 重写解决三者）：**`<scroll-view>` → 普通 `<view class="nx-content" style="overflow-y:auto">`**（恢复 backdrop 磨砂，对齐原型架构）。下拉刷新没了原生 refresher → **港原型的 touch 手势**（`@touchstart/move/end`，scrollTop===0 才 arm，DAMP 0.5/TRIGGER 70/HOLD 56，调 `refresh.refresh()`）+ **自绘品牌色 spinner**（深色 chip + `stroke:var(--v5-brand)` 旋转弧，一并解决 #1b）。`<slot>` 包 `.nx-page-enter`（`@keyframes nx-page-in` fade+translateY，每页 chassis 重挂重放）实现全局入场。header/statusbar blur 20→24 对齐原型。
- **运行时铁证**：① 滚动正常（plain view scrollTop 生效）；② 注入亮内容滚到 header 后方——**透过 header 磨砂隐约可见**（不再锐利实色），磨砂恢复；③ 合成 touch 下拉：refresher 可见 + `spinnerStrokeColor=rgb(158,220,29)`（=#9EDC1D 品牌绿）+ 松手 `isRefreshing=true`；④ home/me 截图布局无破坏（scroll-view→view 安全，因 .vue webview 支持 CSS overflow 滚动，与原型同款）。
- **元教训**：跨端「token + CSS 字段级一致」**仍可能渲染不同**——`backdrop-filter` 这类**依赖合成层关系**的效果，受**容器类型**（scroll-view vs 普通 overflow div）影响。组件的「框架隐式地基」不止 next/font + Preflight（P-038），还有 **scroll 容器的合成行为**。磨砂/`position:fixed` 锚定/`mix-blend` 等效果**必须实景注入对照测**，computed 有值 ≠ 视觉生效。
- **已转**：✅ verify.sh 哨兵 `chassis_chrome_complete` 升级（加断言含 `nx-refresher`+`nx-page-enter`，且**禁止** `<scroll-view class="nx-content">`——用 scroll-view 即 FAIL，防磨砂再被破坏）。verify 仍 **14**。

### P-040 [架构·重大] 磨砂第二根因：`-webkit-overflow-scrolling:touch` 动量层 + `position:fixed` 仍杀 backdrop-filter（P-039 首修不彻底）
- **症状**：P-039 把 `<scroll-view>` 换成普通 `<view overflow:auto>` 后我**自认磨砂修好了**（看到滚动内容透过 header「隐约可见」就下结论）——**但主人复看仍说「tabbar 和 header 透明效果没生效」**。我那次「隐约可见」是被 `rgba(0,0,0,0.55)` 的 **55% 半透（锐利不糊）** 骗了，误当成磨砂。
- **根因（两个残留）**：① 我给 `.nx-content` 加了 **`-webkit-overflow-scrolling: touch`**（iOS 动量滚动）——它和 `<scroll-view>` 一样**提升独立合成层**，fixed/absolute chrome 的 backdrop-filter 抓不到。② chrome + content 我全用 **`position: fixed`**，原型是 **`position: absolute`**（chassis 才是定位容器，children 全 absolute）。两者叠加仍破坏磨砂。
- **对策**：`.nx-content` **删 `-webkit-overflow-scrolling: touch`** + chrome/content 全部 **`position: fixed` → `absolute`**（`.nx-chassis` 保持 fixed inset:0 作定位容器，对齐原型 IOSFrame 结构）。
- **决定性铁证**（这次用**细条纹注入**，不再靠「隐约可见」自欺）：往 header 后方注入 `repeating-linear-gradient` 红白 6px 细条纹——**header 区条纹糊成柔和粉灰渐变、header 下方条纹锐利红白**，对比刀切般清晰 = backdrop-filter 真磨砂。
- **元教训（叠加 P-038/039）**：① **磨砂/半透必须用「锐利图案(细条纹/文字)」注入测**——纯色块或「隐约可见」分不清「半透(锐利)」vs「磨砂(模糊)」，我就是用纯色+肉眼「隐约」自欺了一轮。② 破坏 backdrop-filter 合成的元凶是一族：`<scroll-view>` / `-webkit-overflow-scrolling:touch` / 某些 `transform`/`will-change`/`contain` / `position:fixed` 嵌套——逐个排除并实景验。③ **我又犯了「自认为 OK」**——主人明令「禁止自认为 OK」，磨砂这种视觉效果**只认锐利图案注入对照**，computed 有值/纯色隐约可见都不算。
- **附带修复**：下拉 spinner 居中下拉空白（`translateY = indicatorY/2 - 18`，实测 center 107 = gap[52,162] 中点）；nova 输入框底部 padding `+16→+22px` 叠 `env(safe-area-inset-bottom)` 避让 iOS 横条。
- **已转**：哨兵 `chassis_chrome_complete` 已禁 `<scroll-view>` 做 nx-content；位置/动量层难机器测 → 归本台账「磨砂必锐利图案注入实景验」硬项。verify 仍 **14**。

### P-041 [架构·重大] Liquid Glass 真根因：内容容器从 header 下方起 + 裁切 → chrome 后无内容可磨砂（连栽 3 轮假阳性）
- **症状**：主人**连续 3 轮**说「tabbar/header 透明效果没生效、没有 Liquid Glass」，我 P-039/P-040 改了两轮（scroll-view→view、去 webkit-overflow-scrolling、fixed→absolute）每轮都**自认修好**，主人每轮都说还是没生效。
- **真根因（我前两轮全没找到）**：我的 `.nx-content` 用 `top: contentTop`（从 header **下方**起）+ `overflow:auto` **裁切**——内容区根本不覆盖 header(0-52)/tabbar 区域 → **chrome 背后永远没有内容可磨砂**，backdrop-filter 只能磨砂 chassis 黑底 = 看着死黑、毫无玻璃感。原型的 scroll 容器是 `absolute inset-0`（**top:0 铺满整个 chassis**）+ 给内容 `paddingTop`，内容滚动时**穿到 header 后面**被磨砂。我漏了这个铺满+padding 结构。**另**:我那个 `transform:translateY(0)` 常驻 pull-wrap（P-041 子因）也把内容提升合成层挡磨砂——空闲必须移除 transform（已改 pullActive 条件 + 入场动画 backwards）。
- **对策**：`.nx-content` 改 `top:0;bottom:0`（铺满 chassis）+ 内层 `.nx-page-enter` 加 `paddingTop:contentTop / paddingBottom:contentBottom`（内容视觉上仍在 chrome 下，但 scroll 容器铺满 → 内容滚到 chrome 后被磨砂）；refresher 锚到 `top:contentTop`；pull-wrap transform 仅下拉/刷新时挂、空闲移除。
- **决定性验证法（终于不自欺）**：前几轮我用「纯色块/隐约可见/locator.screenshot」都被骗（纯色分不清半透vs磨砂；条纹注在 transform 层外假阳性；locator.screenshot 不含 backdrop 显纯黑）。**最终用 `backdrop-filter: invert(1)` 临时强替 + 全屏截图**——header 区清晰显示**反色内容**（顶部变白、"N"反色）→ 铁证 ①backdrop-filter 在此 uni H5 结构真生效 ②内容真在 chrome 后。这是验 backdrop-filter「是否真磨砂到目标内容」的**金标准**（invert 比 blur 直观一万倍，纯色/深色底都骗不了它）。
- **元教训（最痛）**：① **磨砂这类合成效果，验证只认 `invert(1)` 注入实景** —— blur 在深色底上看不出、纯色块/「隐约可见」/单元素截图全是自欺陷阱，我连栽 3 轮就是每次用了弱验证就报「修好」。② backdrop-filter 要生效，**目标内容必须真的绘制在 chrome 背后**（容器铺满 + padding，不是从 chrome 下方起+裁切）——这是比「合成层」更前置的结构前提，我查合成层查了两轮却漏了「背后压根没内容」。③ 主人能看到原型生效=浏览器支持 backdrop-filter，问题 100% 在我结构 —— 这个推理早该让我直接对标原型 `absolute inset-0` 结构，而非逐个试。
- **已转**：哨兵难测「内容是否绘制在 chrome 后」→ 归本台账「Liquid Glass 必用 invert(1) 注入验 + 容器必铺满 chassis+padding」硬项。verify 仍 **14**。

### P-042 [完整性·中] 「领取试用」UI 缺失——store+触发已接线但 chassis sheet UI 没港（P-037 同类，按铁律全扫同型）
- **症状**：主人指「缺失领取试用的 UI/UX 内容」。排查：uni **有** `store/trial-claim-sheet.ts`(open/show/hide)+`trial-config`+`free-trial.canStart`+i18n `t.trial.sheet*` 全键+触发组件(trial-hero-banner/trial-entry 都调 `claimSheet.show()`)——**唯独缺 `trial-claim-sheet.vue` UI**，点领取 store.open=true 但无渲染。
- **根因**：又是 P-037「IOSFrame 挂的 chassis sheet 漏港」——逻辑(store)港了、视觉(sheet)没港，且触发已接线 → 「能点不弹」的隐性断裂。
- **对策**：港 `trial-claim-sheet.vue`(底部 sheet：sparkle 头部+cap label+标题+关闭 / 影子收益 hero `$shadowDaily×days`+grid / 3 ValueProp / 领取 CTA→`navigateTo wallet-cards-new?returnTo=/pages/me/trial?trial=1&trial=1` / dismiss；framer→CSS keyframe，lucide→inline svg，canStart 守卫+toast.info)，chassis 无条件挂载。**铁证**:store.show() 后 sheet 渲染(标题「NexionBox S1 免费试用」/hero $116/3 ValueProp/领取CTA「立即免费试用」)+背景 backdrop blur 生效。
- **按铁律全扫同型(被指一处=系统排查)**：盘点原型 IOSFrame 全部 chassis sheet vs uni——**已港**:genesis purchase-sheet / staking stake-sheet / device-deactivate-sheet / receipt-modal / stella-drawer / trial-claim(本次)。**trial-claim 是唯一「store+触发接线但缺 UI」的真断裂**。**未港(连 store 都无=整功能缺失,非断裂)**:slot-action-sheet / tradein-sheets / lucky-spin-sheet / trial-extension-sheet / trial-unbind-retention-sheet / genesis-dock / message-drawer / sticky-cta-bar——这些入口在 uni 走简化路径(如 empty-slots「填满槽位」直接 navigateTo /store,非开 slot-action sheet)或未实现,待主人定是否补。
- **元教训**:「store/逻辑港了」≠「功能可用」——chassis 级 sheet 必须同时港 **store + UI + 挂载**三件,且查「触发是否接线但 UI 缺失」(能点不弹=最隐蔽)。验证用 store.show() 直触发看渲染。
- **已转**:本台账 + 上方 chassis sheet 清单(已港6/未港8)。哨兵难测语义完整 → 归「port 任一 sheet 必同时港 store+UI+chassis 挂载」硬项。

### P-043 [完整性·重大] 8 个 chassis sheet 整功能缺失——接 P-042「未港8」清单全港 + 挂载
- **症状**：主人「补全部 / 全部清完」。P-042 盘点出 8 个原型 IOSFrame chassis sheet 在 uni **连 store 都无**（整功能缺失，非断裂）：slot-action / sticky-cta / tradein / lucky-spin / trial-extension / trial-unbind-retention / genesis-dock / message-drawer。
- **根因**：Batch 简化只港了 MVP 漏斗主路径，这 8 个 overlay 入口走简化 navigateTo 或未实现。
- **对策**：5 个并行 agent 港全部 8 个（每个 `.vue` UI + `.ts` store + i18n 镜像 key），chassis 无条件挂载 9 overlay（StellaBubble/TrialClaimSheet/SlotActionSheet/TradeinSheets/LuckySpinSheet/TrialExtensionSheet/TrialUnbindRetentionSheet/StickyCtaBar/GenesisDockHost/MessageDrawer/GlobalUi）。补 App.vue 缺失的 trial poll（SimulationProvider TRIAL_TICK 4s）。**铁证**：逐个 store.show() 触发，DOM 增长 393 节点，每个 sheet 渲染验证。
- **已转**：`chassis_chrome_complete` 哨兵枚举 always-on chrome；sheet 完整性归「港任一 sheet 必同时 store+UI+chassis 挂载」硬项（P-042）。

### P-044 [架构·中] `?trial=1` deep-link 在 hash-only 导航到已挂载页时 onLoad 不重触发
- **症状**：`/pages/me/wallet-cards-new?returnTo=...&trial=1` 刷新/深链时，试用自动扣款披露框不显示。
- **根因**：uni `onLoad(query)` 只在页面**首次**加载触发；H5 hash-only 导航到已挂载页不重新 onLoad，query 拿不到。
- **对策**：`parseHashQuery()` H5 回退——直接解析 `window.location.hash` 的 query，onLoad override 合并。`?trial=1` 在刷新/深链都能正确显示披露。**铁证**：Playwright 刷新带 `?trial=1` 的 URL → 披露框渲染。
- **已转**：本台账；归「uni onLoad query 在 H5 需 parseHashQuery 回退」硬项。

### P-046 [架构·重大] 原型逻辑路径 vs uni flatten 路由——raw `navigateTo` 静默失败「点击无跳转」（连栽 3 处，全扫同型）
- **症状**：主人「团队 创世节点 点击无跳转」。排查发现是**系统性**：stella / 通知 CTA 数据里 `ctaHref` 是原型 **web 逻辑路径**（`/team/commissions`、`/genesis`、`/me/wallet/exchange`、`/staking`、`/trust`、`/team/leadership-pool`、`/team/binary`、`/team/rank`、`/store` 等），但 uni 路由是 flatten 后的 `/pages/...`。直接 `uni.navigateTo({url: 逻辑路径, fail: ()=>{}})` → 路由不存在 → **fail 回调吞掉 → 静默无跳转**。
- **根因**：uni 把原型嵌套路径**拍平**且**单段着陆要双写**：`/genesis`→`/pages/genesis/genesis`（单段着陆双写）、`/team/commissions`→`/pages/team/commissions`（2段直通）、`/me/wallet/exchange`→`/pages/me/wallet-exchange`（3+段 dash 拍平）、tab 根→reLaunch。3 个消费出口各错各的：message-drawer 喂 raw 逻辑路径（全断）；stella-drawer 朴素 `/pages${href}` 前缀（断单段 `/genesis`→`/pages/genesis` 不存在 + 断嵌套 `/me/wallet/exchange`→`/pages/me/wallet/exchange`）；**notifications.vue 漏网**（stella-bubble line 112 把逻辑路径 ctaHref **push 进 notifications store**，notifications.vue onTap raw navigateTo 消费 → 同病）。team 卡片另有字面量笔误 `/pages/genesis`（缺第二段）。
- **对策**：建 `src/lib/route.ts` 单一映射器 `toUniRoute(href)`/`navTo(href)`——`/pages/` 开头直通、tab 根 reLaunch、单段双写、2+段首段作目录 + 其余 dash 拍平。三出口（message-drawer / stella-drawer / notifications.vue）全部改用 `navTo`。team 卡片字面量补全 `/pages/genesis/genesis`。**铁证**：notifications 页真实上下文 `navTo('/genesis')`→`#/pages/genesis/genesis`、`navTo('/team/commissions')`→`#/pages/team/commissions`、`navTo('/me/wallet/exchange')`→`#/pages/me/wallet-exchange` 全部真跳，console 0 错。
- **按铁律全扫同型**：①静态——全站 74 个 `/pages/` 路由字面量 vs pages.json 逐一核对，0 broken（team 笔误已修）。②动态——扫所有 navigateTo/reLaunch 的**变量 url**：`/pages/` 模板字面量类安全；**数据驱动 href 类**逐个核源——终极 grep「任意字段 = `/xxx` 非 /pages 逻辑路径」**仅命中 stella-bubble + stella-templates 两文件**，三出口已全经 navTo；其余 class-B 消费者（events/learn/me settings/wallet/search/quick-action/sticky-cta/tab.route）数据源全是 `/pages/`。
- **元教训**：跨框架迁移时**逻辑路由 ≠ 物理路由**；`fail:()=>{}` 是「点击无跳转」的隐形元凶（吞错）。数据驱动导航必须有**单一映射层**，绝不让组件各自拼路由。验证要在**真实页面上下文**跑 navTo 看 location.hash 真变（非只读源码）。
- **已转**：①`src/lib/route.ts` 单一映射器（消除各组件自拼路由）。②`verify.sh` 新增 `nav_routes_valid` 哨兵——node 跨核全站 `/pages/` 字面量 ⊆ pages.json（跳过注释行防误报），防 team 笔误类回归（机器可测层）。③本台账 + 元教训「逻辑路径必经 navTo」硬项（语义层）。**verify 15/15**。

### P-047 [工具·中] WSL bash 内 Linux `curl` 误判 Windows H5 dev server 不在线，导致 HTTP probe 被跳过
- **症状**：`Get-NetTCPConnection` 与 Windows `curl.exe -I http://localhost:5173/` 都证明 H5 dev server 返回 200，但 `bash scripts/verify.sh` 的 `[2] H5 routes HTTP 200` 仍显示 `SKIP dev server not running`。
- **根因**：当前命令从 Windows PowerShell 调起 WSL bash，脚本内裸 `curl` 命中 Linux curl；在本机 WSL/Windows localhost 转发场景下，Linux curl 不能稳定访问 Windows 侧 Vite dev server。脚本把工具链连通性问题误判为 dev server 未启动，导致 H5 HTTP probe 缺失。
- **对策**：`scripts/verify.sh` 增加 `CURL_BIN` 选择：检测到 WSL 且存在 `curl.exe` 时优先用 Windows `curl.exe`，否则沿用环境提供的 `curl`。`check_http` 和 dev-server online probe 全部走 `"$CURL_BIN"`。
- **运行时铁证**：修后 `bash scripts/verify.sh` 输出 `Home shell [200] /`，总计 **15 pass / 0 fail**，H5 probe 不再 SKIP。
- **已转**：机器层：verify 内置 WSL `curl.exe` fallback。语义层：Windows/WSL 混合项目里，HTTP probe 被 skip 不能当作通过；必须确认是真离线还是验证工具访问错端。

### P-048 [交互·重大] UniApp H5 `<input>`/`<view @click>` 视觉存在不等于真实业务可操作
- **症状**：`SPEC-L3c02` persona proof 跑 FT-013/014/015 时连续抓到两类“看起来有,实际不稳”的控件问题：① 提现地址 input 的 host 卡片可见,但内层 `.uni-input-input` 高度为 0,`agent-browser fill` 地址时焦点仍留在金额框,地址文本会污染 amount；② 提现提交、回购、团队 finance 入口都是 `<view @click>` 文案按钮,文本 locator 能找到,但 H5 下不稳定触发业务事件,会停留原页或不写 store。
- **根因**：uni H5 渲染的可视 host 不等于真实输入/点击 target。`<input>` 外层尺寸和内层原生 input 尺寸可能脱钩；`<view @click>` 没有 native button 语义,纯靠文案定位时可能点到内部 text/包装层或 offscreen 状态,不触发期望的业务 handler。此前泛动作采样只证明“有可见控件/有路由”,没有证明“这个控件能完成承诺的业务结果”。
- **对策**：
  1. 对需要自动化和真实业务 proof 的关键控件加稳定业务类名,如 `nx-withdraw-submit-cta`、`nx-repurchase-submit-cta`、`nx-team-*-link`。
  2. 对关键 `<input>` 同时验证 host 与内层 `.uni-input-input`:必要时用 `:deep(.xxx .uni-input-input)` 固定 `min-height/height/line-height`,并在 proof 中断言 `activeClass` 与 input value。
  3. proof 点击用 `scrollintoview + click(selector)`,业务结果必须回源断言 storage/route/body,不能只看点击无报错。
  4. 弹窗 proof 必查业务语义控件:例如 exchange modal 不能只证明弹窗出现,还要断言 `NEX 10 -> USDT`、primary confirm、swap history、v3 caps、双 bill。
- **运行时铁证**：`node scripts/uniapp-persona-walkthrough-proof.mjs` 7/7 passed。FT-013 写入 WD tracking + points 100→95 + pending withdraw bill；FT-014 写 swap history/v3 cap/2 bills + repurchase points 95→195/stake/bill；FT-015 四个 team finance 入口进入 commissions/rank/binary/leadership-pool。
- **已转**：机器层：admin `verify.sh` 新增 `uniapp-persona-walkthrough-proof` gate。语义层：关键业务控件必须有可点 selector + 业务结果回源断言；“按钮文案存在/弹窗出现/grep 到 @click”一律不算交互闭环。

### P-049 [架构·中] 同页 hash query 切换不重触发 `onLoad` → KYC Express 同页跳转仍停在普通充值
- **症状**：`SPEC-L3c03` feature-mapping proof 首跑 FM-004 时,从 `/pages/me/wallet-topup` 切到 `/pages/me/wallet-topup?kyc=1` 后页面仍显示普通充值状态,KYC Express 的生成地址/付款确认控件不可操作。
- **根因**：与 P-044 同族,但发生在同一个已挂载页面内部。UniApp H5 hash-only 同页 query 改变时不保证重新触发 `onLoad(query)`,组件仍沿用旧的 `mode=topup` 状态。
- **对策**：`wallet-topup.vue` 增加 H5 hash query 回源解析和 `hashchange` 监听:`routeHasKyc()` 同时读 `onLoad` options 与 `window.location.hash`;`syncKycRoute()` 在 onLoad/onMounted/hashchange 都执行;onUnmounted 清 listener。
- **运行时铁证**：`node scripts/feature-mapping-walkthrough-proof.mjs` PASS。FM-004 从普通 top-up TRC20 通道进入 `?kyc=1`,KYC Express 生成检查 `KYC-2026-A78235`,显示 exact amount,写入 `KYC-KYC-2026-A78235` bill。
- **已转**：机器层：admin `verify.sh` 新增 `feature-mapping-walkthrough-proof` gate。语义层：任何同页 query 驱动的 H5 状态切换不能只信 `onLoad`;必须有 hash-query 回退或明确重挂载策略。

### P-050 [工具·中] PowerShell→WSL bash 验证链里 `node`/`curl` 执行端会漂移,导致假失败或假跳过
- **症状**：L5 终验首跑时,Next/UniApp/Admin verify 在独立 PowerShell 下可过,但被汇总脚本或 bash 调用时出现两类工具链问题:① WSL bash 的 PATH 找不到 Windows Node,脚本直接 `node: command not found`;② Linux curl 访问 Windows 侧 dev server 得到 `000` 或被脚本判断为 offline。
- **根因**：当前项目常从 Windows PowerShell 调起 WSL bash。bash 内的 `node`/`curl` 不一定和 Windows 端 dev server/runtime 同端,裸命令会把“工具链错端”误判成“产品坏了”。
- **对策**：
  1. `verify.sh` 统一定义 `NODE_BIN`,优先环境变量,找不到时回退 `node.exe`,仍找不到才 fail。
  2. WSL 环境且存在 `curl.exe` 时 HTTP probe 使用 Windows `curl.exe`,否则才用当前 bash 的 `curl`。
  3. L5 汇总脚本调用 Windows `.cmd` 不走 `shell:true`,改用 `cmd.exe /d /s /c` 并记录 stdout/stderr/spawn-error。
- **运行时铁证**：Next `bash scripts/verify.sh all` **230/0**; UniApp `bash scripts/verify.sh` **16/0**; Admin `npm run verify` **148/0**; L5 `node scripts\l5-final-sweep.mjs --run-verifiers` **12/12 passed**。
- **已转**：Next/UniApp/Admin verify 均有 `NODE_BIN`/`CURL_BIN` 选择;L5 汇总日志保留 `l5-*.log`,工具链错误会显式出现在日志里。

### P-051 [架构·中] navigateTo 页在 enter 翻转「共享 store 开关」必须 onUnload 对称复位 + 一次性回复 timer 须 onUnload 清
- **症状**：会话中心 chat.vue(`?type=ai`)进 AI 聊天调 `stella.open()` 置 `isOpen=true` 清 Nova 未读；但离开页(navigateBack)时无人复位 → `isOpen` 永真 → 此后 stella-bubble 的 team/staking/market 推送命中 `push()` 的 `unread = isOpen ? 0 : unread+1` 恒取 0 → **首访 AI 聊天后浮标再不显示 Nova 未读**(隐性回归,3-agent audit Round 1 Agent A 报 P1,main Read 复核精确定位 `isOpen` 卡死为真根因——A 原报「幽灵回复推高 unread」经核不准:`conversations.pushAgentReply` 不动 unread、AI push 因 isOpen 真而置 0)。
- **根因**：原 stella-drawer 由 `close()` 复位 isOpen;退役 drawer + chat 页接管「open 视图」后,只在 onLoad `open()` 置真,**漏了「离页复位」这一对称面**(维度②:flag set on enter 没有对称的 reset on exit)。
- **对策**：chat.vue 持 `pendingTimers[]` + `onUnload`/`onUnmounted` 双钩子 cleanup:清所有一次性回复 `setTimeout`(防卸载后幽灵回复写 singleton store)+ `isAi` 时 `stella.close()`(复位 isOpen)。页用 `onUnload`(uni 页生命周期)+ `onUnmounted`(组件保险,对齐 P-021)。
- **元教训**：① 任何「进页置 flag/占资源」必须有对称的「离页复位/释放」,尤其 flag 在**共享 app-singleton store** 上影响别处累加逻辑时——单看本页对、跨页累加错。② navigateTo 页(非 chassis)有副作用(timer/flag)必走 onUnload 清理(同 P-021)。
- **已转**：本台账 + skill「页 lifecycle:enter 置的 flag/timer 必 onUnload 对称复位」硬项。跨页运行时状态机器难测 → 归流程层。

### P-052 [验证方法·中] Playwright `page.goto` 同路径仅改 query 不重触发 uni `onLoad` → chat→chat 读到陈旧 state（P-044/P-049 的「测试侧」变体）
- **症状**：验证时 `page.goto('.../chat?cid=A')` 后再 `page.goto('.../chat?cid=B')`,第二次页面仍显示 A 的 header/消息。一度误判类型路由有 bug。
- **根因**：uni H5 是 hash 路由 SPA;page.goto 同路径仅改 query 是**同文档 hash 变更**,不重载文档 → `onLoad(query)` 不重触发(P-044/P-049 同根)→ cid/isAi 仍是首次值。**这是测试方法假象,非产品 bug**:真 app 里 chat→chat 走 `uni.navigateTo`(每次 push 新页实例→fresh onLoad,已实景验「转人工 pill」AI→support 正确切换)。
- **对策**：验证同路径不同 query 的页,要么 **about:blank → 目标 URL 强制整文档重载**,要么**走真 in-app `uni.navigateTo`**(点 UI 触发);绝不用「page.goto 同路径换 query」断言路由切换。
- **元教训**：H5 SPA「同页 query 不重 onLoad」既是产品坑(P-044/P-049 需 hashchange 兜底)也是**验证坑**——测试方法本身被同一机制骗。判路由切换必用整文档重载或真 navigateTo。
- **同根扩展(2026-06-16)**：同一「hash-nav 不重载 JS」机制也骗 **mid-session 源码/config 改动的运行时验证**——编辑 `trial-config.ts`(shadowDailyUSD 38.52→7)后 hash-nav 到 earn,运行中 **Pinia 单例仍持编辑前载入的旧模块默认值** → trial banner 一度显旧「$38.52/d × 3 = $116」,差点误报成信息岛;`about:blank → 目标 URL` 整文档重载后正确显「$7.00/d × 3 = $21」。**判据**:验证任何 store/config/常量模块的 mid-session 改动的运行时效果,必整文档重载(about:blank→back)或重启,**勿凭 hash-nav 断言**(verify 绿 + 代码对 ≠ 运行中单例已更新)。
- **已转**：本台账(验证方法纪律,已含 query 切换 + mid-session 模块改动两面)。

### P-053 [工具/语义·中] 数值重校准的「同形 grep」漏三类：裸整数 prose · 派生值句子 · 营销圆整造的第二值
- **症状**：经济重校准（旧 S1 $38.50/d → $7/d 等）首轮用小数锚点 grep（`38\.5`/`142\.6`/`640×`）扫净 src，宣布信息岛清零。3-agent 审计却补抓出 4 处旧值残留：① tier1 标题/buyCta 写 `$38/day`（裸整数，小数 grep 漏）；② 提现锁定文案「S1 13 小时达 $20」（按旧 $38.50/d 推算的**派生值**，新 $7/d 应「不到 3 天」，任何值 grep 都抓不到）；③ vs-phone 手机 `+12 NEX`（与 device 规格 `baseRateNEX:10` 不一致的陈旧 marketing 值）；④ 营销文案手动圆整成 `120×`，而实时计算徽章 `Math.round(7/0.06)=117×` → 同一钩子两个倍数值并存（**圆整本身造了信息岛**）。
- **根因**：值 grep 只匹配「字面等于旧值」的串。但旧值在产品里有三种逃逸形态：(a) **裸整数/不同小数位**（`$38` vs `$38.50`、`$142` vs `$142.60`）；(b) **派生句子**——「X 时间达 $Y」「N× 手机」「N 天回本」是从费率**算出来**的，改费率后这些句子整体失真，但没有任何一个旧数字字面出现；(c) **营销圆整**——人为把 116.7 写成「120×」做 hook，与数据派生的 117× 不等，制造了「营销值 ≠ 计算值」的岛。
- **对策**：重校准的同形 grep 必扫三轮——① 每个旧值的**小数 + 裸整数**双形式（`\$38\b` 和 `38\.5` 都扫）；② 全量 `$N/day`/`$N/天`/`N×`/`N 倍`/`N hours`/`N 天回本`/`N 小时达` 类 prose **逐句按新费率重算**核对（不是值匹配，是语义重算）；③ 营销显示的圆整数 **= 数据派生计算值**（计算 `Math.round(s1/phone)=117` 就全站用 117，勿手动圆成 120），否则圆整即岛。
- **元教训**：「数字一致性」审计不能只问「旧值还在不在」（值匹配），要问「**每个露出的数字/时长/倍数，按当前 SoT 重算后还成立吗**」（语义重算）。派生值 + 裸整数 + 圆整三类靠值 grep 永远漏，必须语义层 + 实景层兜（本轮即靠 3-agent 审计 + browser 实景才补净）。
- **已转**：done-review/审计语义层（派生值需逐句重算，非值匹配，难无脆机器门）；本台账记规则。重校准任务的 P1 Done-when 应含「全站 prose 数字按新 SoT 语义重算 = 0 失真」。
- **同根扩展(2026-06-17)**：统一某个派生值（如 phone→box 倍数 117×）时，**同一量可能有多个计算点、各自圆整方式不同**——审计当时只改了营销文案串（hero/vsMore/faq→117×），漏了 `detail.vue` 的 `speedup = round(daily/0.06/10)*10`（round-to-10 → Pro 220× / S1 120×），与卡片 `round(daily/0.06)`（217×/117×）并存。主人看详情页才发现 220 vs 217。**判据**：统一倍数/比率类派生值，必 grep 所有计算点（`/0.06`、`/PHONE_RATE`、`/10)*10` 等同形）核对圆整方式一致，不只改字面文案串——计算公式也是「同形」的一种。

### P-054 [架构·高] 子页冷开点返回卡死——uni H5 `navigateBack` 单页栈走 success 空操作、fail 不触发
- **症状**：deep-link/刷新直开任一子页（如 `/pages/store/detail?id=...`）点返回按钮无反应，卡在原页；in-app 进入（有历史）则正常。
- **根因**：uni-app H5 在单页栈（`getCurrentPages().length===1`，冷开/刷新）时 `uni.navigateBack()` **返回 success 的空操作、`fail` 回调永不触发**（Playwright 探针 `navigateBack({success,fail})` 实测：返回 SUCCESS）。全站 12 处返回逻辑都用 `uni.navigateBack({ fail: () => 回退 })` 模式 → 回退分支是冷开下的死代码。与 P-044/P-049（hash-nav onLoad 不重触发）同属 H5 SPA 路由族，但症状不同。
- **对策**：新增共享 `navBack(fallbackHref?)`（`src/lib/route.ts`）：`getCurrentPages().length>1` 才 `navigateBack`；否则 `reLaunch` 到声明的 backHref（navTo 兜底；无 href 兜到 home，永不死路）。12 处全收口到 helper（app-chassis navBack / sub-page-header goBack / 10 页 goBack）。
- **已转**：`verify.sh` 哨兵「no raw uni.navigateBack」（除 route.ts 外 grep `uni.navigateBack(` 必 0，防回归）+ 本台账。实景验冷开 detail/binary-how/terms 返回 + in-app pop 无回归 + console 0。
- **元教训**：H5 平台 API 的「失败」语义未必走 fail 回调（navigateBack 把「无法后退」当 success）——任何「赌 fail 兜底」的逻辑必须改为**前置条件判断**（查真栈深 `getCurrentPages()`），不能依赖 SDK 在边界情况报错。

## P-055 · `v-else` 非相邻 → 组件编译失败、整页动态导入挂掉(vue-tsc 漏 + verify 只 curl 首页漏)

- **现象**：购买门 Buy 按钮里写 `<svg v-if="gateLockedView"/> <text>{{buyLabel}}</text> <svg v-else/>`——`v-else` 与 `v-if` 之间夹了 `<text>`。vite vue-plugin 报 `v-else/v-else-if has no adjacent v-if`，product-card.vue 编译失败 → 引用它的 `store.vue` 动态导入 `Failed to fetch dynamically imported module` → 商城整页不渲染。
- **双重盲区**：① `vue-tsc --noEmit` = 0(它只查**类型**,不查模板语义 `v-if/v-else` 相邻性)→ 机器门「假绿」；② `verify.sh` 只 `curl /`(首页 shell HTTP200,P-008 SPA 空壳),**不编译/不渲染 store 路由**,漏掉路由级编译错。两道门都过、实际整页崩——只有浏览器实景(preview console + 渲染断言)抓到。
- **对策**：`v-else` 必**紧邻** `v-if` 元素;中间隔了别的元素时,改用两个独立条件 `v-if="cond"` / `v-if="!cond"`。
- **元教训**：**vue-tsc 0 ≠ vite 编译过 ≠ 页面渲染**。模板语义错(v-else 相邻/未注册组件/指令误用)只在 vite vue-plugin transform 时报,且只在该路由被**实际加载**时触发——必须浏览器 navigate 到改动路由实景验,不能只信 tsc+verify。
- **待转哨兵(建议)**：`verify.sh` 增「关键非首页路由编译探针」——对 store/team/me 等改动密集路由 curl `/src/pages/<route>.vue` 模块(非 200 / 含 transform error 即 fail),把路由级编译错从「实景才发现」提前到机器门。

<!-- 后续每批新坑追加于下，转哨兵/规则后标注「已转」 -->

## P-056 · meta-words 哨兵排除 /i18n/messages → 用户可见文案的 funnel-meta 泄漏处在盲区

- **现象**：首日任务分类标签 `转化/convert`(运营漏斗黑话)印在用户端 chip 上;全站排查同类又揪出 2 条用户可见文案——`转化路径/conversion paths`(签到 footer)、`转化门槛/conversion gate`(充值档位 body)。3 处都绕过了现有「no meta/ponzi words」哨兵。
- **根因**：`sentinel_absent`(verify.sh:50)对所有哨兵统一 `grep -vE '/i18n/messages/'`——为容忍货币 "conversion"(NEX↔USDT 兑换)+ `upsell:` 命名空间 key 的合法出现而排除了 i18n 文案文件。但**用户可见文案恰恰全在 i18n/messages**,于是 meta 哨兵对「文案级 meta」完全失明(标签当初正因此漏过门)。
- **对策**：① 修 3 处(标签 `转化`→`推荐`、key `dayOneCatConvert`→`dayOneCatRecommend`;footer/body 去 meta 改 benefit 框架),双语同步。② 加**专扫 i18n/messages 的独立门**(不走排除 i18n 的 sentinel_absent):`转化路径|转化门槛|转化率|转化漏斗|"转化"|conversion path|conversion gate|conversion funnel|conversion rate`——复合词 + 带引号裸 `"转化"` 是无歧义 meta(货币在文案里写「兑换/exchange」),零误报。
- **已转**：`verify.sh` 哨兵「no funnel-meta in i18n copy」+ 本台账。**负向探针验真**:5 个 meta 串全 CAUGHT、5 个合法串(货币 conversion / 兑换 / 推荐 / 注释裸转化)全放行;verify 24/0;5175 实景验 chip=推荐、控制台 0。
- **元教训**：哨兵的**排除范围**本身可能制造盲区——「为避免误报而 `grep -v` 某目录」时必问「该目录里有没有正该被这条哨兵守的东西」。文案 meta 的权威位置是 i18n/messages,守它的门必须扫它(用精准 pattern 规避误报,而非整目录排除)。

## P-057 · `now % ONE_WEEK` 周界错对齐到周四(纪元是周四)→ 结算倒计时偏差数天

- **现象**：领导奖池 `store/leadership-pool.ts` 用 `weekStart = now - (now % ONE_WEEK)` 算周界。JS 纪元 1970-01-01 是**周四**,故 `now % ONE_WEEK == 0` 落在**周四 00:00 UTC**——weekStart 与派生的 `nextPayoutTs = weekStart + ONE_WEEK` 都对齐到周四,而非周一。页面 hero「N 天后结算」实测显示 ~1 天,实际到下周一应 ~5 天。
- **口径矛盾**：权威口径(PRD §8.5.3 + 玩法说明页 i18n「周一 00:00 UTC 开新池 → 周日 23:59 UTC 快照」)明写周一周界——代码却算周四,**声明(文案)≠实现(代码)**,且 vue-tsc/verify 全绿(纯逻辑值错,无类型/渲染症状),只有实景核对倒计时数字才暴露。
- **对策**：新增 `weekStartMondayUTC()` 助手——`getUTCDay`(周一→0…周日→6)+ `Date.UTC` 取本周一 00:00 UTC,替换 epoch-modulo 式;`nextPayoutTs`(下周一)/ history(往周一)随之正确。
- **已转**：`verify.sh` 哨兵「no epoch-modulo week boundary」grep `% ONE_WEEK`(排除 JSDoc/`//` 注释行,容忍文档引用反例)。**负向探针验真**:真代码行 `now % ONE_WEEK` CAUGHT、注释行 EXCLUDED;verify 25/0;5173 双语实景「5天 / settles in 5d」与玩法页周一/周日 UTC 口径自洽、console 0。
- **元教训**：**纪元锚点不是周一**——任何「时间戳 `% 周期`」做日历对齐都隐含「从周四起算」的偏差。日历周界(周/月)必须走 `getUTCDay`/`Date.UTC` 显式派生,绝不用 epoch-modulo。纯逻辑值 bug 无机器症状,必**回源核权威口径(PRD/文案)+ 实景核派生数字**,不能只信 tsc+verify 绿。

## P-058 · playwright 脚本顶层 frame 裸 import 源码模块 → 双 Pinia「no active Pinia」稳定假红

- **现象**:`scripts/spec4-account-cloud-app-sync.mjs` 在 verify 中稳定 FAIL:`page.evaluate` 里 `await import("/src/store/app.ts")` 后 `useApp()` 报「getActivePinia() was called but there was no active Pinia」;页面本身 console 0 error 运行正常。git stash 判别与工作区改动无关(干净 HEAD 同样挂)。
- **根因**:uni-app H5 dev 把应用渲染在**同源 iframe** 里;`page.evaluate` 默认跑在**顶层 frame**。顶层 frame 裸动态 import `/src/store/app.ts` 时 vite 照样服务模块,但这是在一个从没跑过 `main.ts` 的 realm 里**凭空构建第二套模块图**——第二份 pinia 模块自然没有 active 实例。模块图分裂不是时序 flake,是 frame 上下文错位,必然复现。
- **对策**:脚本改用应用 frame 上下文——`page.frames().find(f => f !== page.mainFrame())` 轮询取 iframe(build 产物无 iframe 时回退主 frame),`appFrame.evaluate(...)`。同 frame 内动态 import 命中 vite 模块缓存,拿到的就是页面主链的 store 实例,零产品代码改动。
- **已转**:本台账 + 修复落地(verify 169/0)。硬规则:**任何要碰 store/import 源码模块的 walkthrough/验收脚本,evaluate 必须进应用 iframe frame**(参照 spec4-app-sync 的 `resolveAppFrame()` 写法);纯 localStorage 读写因同源共享可豁免但建议统一走 frame。
- **元教训**:「脚本以前过、现在稳定挂、代码没动」≠ 环境玄学——先 **git stash 二分定责**(我的改动 vs 存量),再看**执行上下文**(frame/realm/进程)是否与被测物错位;evaluate 的 frame 归属是 playwright 对 iframe 型应用(uni H5 dev)的第一陷阱。

## P-059 · 同元素 @tap+@click 双绑 → H5 真实点击/触摸链路 handler 双触发(步进器 ±2、开关开了又关、导航栈损毁)

- **现象**:PR-C 验收实测(2026-07-07 复证):H5 端同一元素同挂 `@tap` 与 `@click`,一次触摸 handler 跑两次——数量步进器一摸 1→3(+2);折叠开关开了立刻关(回原位,看似"没反应");导航类 `navigateTo` 连发两次,第二次撞 uni 导航锁 fail → `navTo` fallback 链(redirectTo/reLaunch)把页面栈**重写坍缩**(实测 [index,…] → 仅 [目标页],用户按返回=直接退出而非回上页)。全仓清扫揪出存量 **57 处双绑 / 16 文件**(checkout 13 处最重)。
- **根因**:uni H5 runtime 把 `@tap` 与 `@click` **都注册为 click 监听**(H5 无原生 tap,tap 即 click 别名+触摸增强)——同一个 click 事件依次触发两个 handler。所以不止真机触摸:**鼠标点击、`el.click()`、任何合成 click 都双触发**。写双绑的动机(「保险起见两端都绑」)在 uni 语义下是反的:uni 编译器在小程序端把 `@click` 自动映射为 tap,`@click` 单绑本就全端正确,`@tap` 没有任何补充价值。
- **对策**:**单绑 `@click` 是全端唯一正确姿势**(修饰符照常:`@click.stop` 等)。双绑一律删 `@tap` 保 `@click`;单绑 `@tap` 也统一改名 `@click`(风格与哨兵一致)。修复实测:同一触摸序列步进器 1→2、开关正常展开、导航栈 +1。
- **已转**:`verify.sh` 哨兵「no @tap binding」——扫绑定形态 `@tap(\.[a-z]+)*=`,命中即 fail;**先涂空注释体再扫**(script 的 `//` 行与 `/* */`、template 的 `<!-- -->`;涂空时保留换行 → 报出的行号不漂),故注释里**引用**完整绑定写法不误伤。2026-08-07 修:原实现直接 grep 原文,「提及不带等号所以安全」的假设被 `behavior-analytics.ts` 的 JSDoc(逐字写了 `@tap="trackBehaviorTap"`)推翻,门恒红。双向红测:CRLF 文件里真造 `@tap="x"` / `@tap.stop="x"` 均 CAUGHT 且行号精确;多行 `<!-- -->`、多行 `/* */`、`//` 行注释里的同款写法全部放行。
- **元教训**:「两端都绑更保险」类**冗余防御**在编译器已做端间映射的体系里=自我攻击;跨端事件这类「框架承诺」要用**真实事件链路**(触摸序列/合成 click)实测验证,不能靠肉眼「渲染了、能点」——双触发的开关类症状(开了又关)恰恰伪装成「没反应」,极易误判为"点击不灵"再叠一层错误修补。

## P-060 · 把 store 存储改按账号「还不够」——消费者把设备级源镜像进账号字段=隔离被击穿(P2-8 第二批 audit 抓)

- **现象**:P2-8 把 `exchange-v3.kycVerified` 改成按账号分行(存储层已隔离、机器门 + 首轮 A/B/A 都过)。对抗审计仍抓出真跨账号泄漏:`wallet-exchange.vue` onMounted 无条件 `v3.setKycVerified(walletPairing.walletPaired)`,而 `walletPairing` 当时**仍是设备级单键**。账号 A 配对钱包(walletPaired=true 设备全局)→ 换 B → B 打开兑换页 → 镜像把 true 写进 B 的账号级 KYC 字段 → **B 绕过 >$100 KYC 闸**。存储改对了,值被设备级源经镜像重新灌回。
- **根因**:账号隔离是**数据流全链路**属性,不只是「这个 store 的持久化按账号」。只要有任一消费者在 mount/watch 里 `账号级store.setX(设备级store.y)`,设备级源就会在换账号后把 X 重新污染成上一账号的值——存储层的隔离形同虚设。
- **对策**:**修源头,不修镜像**——把被镜像的设备级 store(walletPairing)也按账号隔离,镜像自然变成 per-account 一致(B 的 walletPaired=false → 镜像置 B 的 KYC=false)。镜像代码本身不动(它拿本账号态镜像本账号字段是对的)。反面:去 gate 镜像=治标,源头仍是设备级泄漏面。
- **已转**:本台账 + `nexion-audit` 跨-store 镜像镜头(每批 P2-8 audit 专查「有没有设备级源经 onMounted/watch 灌进账号字段」);account-scope 收口哨兵保证**源头 store 已按账号**(walletPairing 已补入 rebind + 哨兵)。运行时复验:跑 `wallet-exchange.vue:225` 原样镜像那行,断言 B 的 KYC 仍 false。
- **元教训**:改「按账号隔离」时,`grep` 该字段的**所有 setter 调用点**,凡是入参来自另一个 store 的,追那个 store 是否也按账号——**account-scope 一个 store 时要顺带审它的上游镜像源**。存储层测试(机器门 + 存储 A/B/A)会「假绿」,只有把**真实消费链路**(页面 mount 的镜像)纳入运行时验收才抓得到。同 P-058「存储改对 ≠ 数据流对」族。

## P-061 · 账号隔离改动的验证方法论——纯 hash 导航留 HMR 陈旧假红 + 迁 persist key 必同步所有护栏

- **现象 A(HMR 陈旧假红)**:改完 store 后,Playwright `page.goto` 只改 hash(`#/a`→`#/b`)**不触发整页重载**,app 仍是改动前那个实例;HMR 只补了 `account-scope.ts`(调 12 个 bindAccount),但改动前已实例化的旧 Pinia store 实例**没有新加的 bindAccount 方法**(setup store 定义变更 HMR 不干净重注册)→ bootstrap 报 `useVoucher(...).bindAccount is not a function`,看似真 bug 实为 HMR 陈旧。
- **现象 B(迁 key 漏改护栏)**:把 `nexion-bills-v1` / `nexion-milestones-v1` 迁成 `*-accounts-v1` 后,`spec6-entry-surface-runtime.mjs` 反泄漏护栏仍盯旧死键 → 未来真泄漏它读到空串**静默失明不报红**(修一处漏改哨兵)。
- **对策**:**A**:改 store 后验证必**换 query**(`?b2=1#/...`,query 变=整页重载)拿 fresh app 实例,纯 hash 导航只用于同 app 内累积实例化;reach Pinia 走 `document.querySelector('#app').__vue_app__` → provides 里找 `._s instanceof Map` 的 pinia,`_s.get(id)` 取真 store 实例,对真实例调 `bindAccount` + 真 action 造数据(跑的是产品确切代码)。**B**:迁任一 persist key,`grep` 全站(尤其 `scripts/*.mjs` 护栏 + verify.sh)该旧键,同步改到新键;把清单 DRY 成单源防再漂移;加哨兵机器化断言护栏跟踪迁移键(`spec6 guard tracks new key`)。
- **已转**:B 半已机器化(verify.sh「spec6 guard tracks new key」哨兵);A 是验证程序,记本台账 + nexion-workflow P4 实景门(store 改动实景验必换 query 重载)。voucher/cart 的 `watch` 异步持久化:A/B/A 测须在切号前 `await` 一拍让 watcher flush(模拟真实使用的事件循环分 turn,否则同步测造人造 race 假红)。
- **元教训**:store 结构变更的实景验证有两个**测试侧**陷阱(非产品 bug):HMR 陈旧(纯 hash 不重载,同 P-052 hash-nav 族)与异步 watcher 未 flush;判「假 bug」先**换 query 整页重载复现**再定责。护栏键与被守数据同生死——**迁数据键=迁所有引用该键的护栏键**,否则守卫静默失明比没有还危险(给「已守」的假象)。

## P-060 · uni scroll-view 有两层 `.uni-scroll-view`(外 wrapper overflow=0 + 内真滚层)+ 声明式滚不到底 → 聊天「自动到底」查错元素假通过、实际差一截

- **现象**:会话中心聊天页「发消息/收回复自动滚到最新」实测**没到底**(差 ~75-177px);更隐蔽的是**验证一直假通过**——脚本查 `.nx-conv-list`(uni-scroll-view 标签外壳)的 `scrollHeight-clientHeight` 恒 =0,`atBottom`(差值<8)恒真,导致「没到底」这个真 bug 被绿灯放过多轮。
- **根因**:① uni H5 `<scroll-view>` 编译成**两层**都含 class `uni-scroll-view` 的节点——外层标签 `overflow:0`(wrapper,不滚),深一层 div 才是真滚动层(`overflow>0`);`host.querySelector('.uni-scroll-view')` 命中**第一个(wrapper)**,设它 `scrollTop` 无效。② uni 声明式 `:scroll-top`/`:scroll-into-view` 都对**布局前高度**算偏移——刚 append 的 reply 气泡还没进 scrollable range,滚动量偏小停在半路;`:scroll-top` 设超大值本想让 view clamp 到底,但 `bump` 抖动只差 1px 被 uni 判定"未变"不重滚。
- **对策**:H5 用 **DOM 直接驱动真滚层**——`[host,...host.querySelectorAll('*')].find(e => e.scrollHeight-e.clientHeight>4)`(按**实际溢出**找,不认 class),`scroller.scrollTop = scroller.scrollHeight`;双 kick(nextTick 立即 + `setTimeout 90` 补偿异步气泡布局);App 端保留 `:scroll-into-view` fallback(条件编译 `#ifdef H5`)。实景确认 `top:602 max:602 atBottom:true`。
- **已转**:本台账 + `components/support/conversation-thread.vue` 的 `domToBottom()`。硬规则:**验证滚动位置/尺寸必须查「真正溢出的元素」(find `scrollHeight-clientHeight>4`),绝不查 `.nx-conv-list` 这类 uni-scroll-view 外壳**(其 max 恒 0 → 一切 atBottom 断言假通过);uni 聊天滚到底 H5 走 DOM,不信声明式 scroll-top/into-view。
- **元教训**:**「验证工具查错元素」比 bug 本身更危险**——外壳 max=0 让 atBottom 恒真,把「没到底」伪装成「到底了」骗过多轮自检(完成铁律"运行时证明对"的反面活样本:渲染了 ≠ 位置对)。查任何滚动/尺寸断言前,先证伪「我查的这个元素真的是会变的那个吗」(打印 sh/ch/scrollable 三元组);uni 同 class 多层节点是 H5 port 的隐形陷阱。

## P-061 · uni H5 `navigateTo` 前进离开 = 「隐藏但存活」中间态,`onUnload`/`watch` 全漏 → Nova 未读被永久压制 + 返回后列表跳顶

- **现象**:两个 P1(对抗审查揪出,实景复现):① AI 聊天页发消息后 1.1s 内点「转人工」pill 前进离开,延时的 `nova.push` 触发时 `isOpen` 仍 true → 未读被吃,且 `isOpen` **永久卡 true**,之后所有 Nova 主动推送未读全静默丢失(直到点 tab reLaunch 才复位)。② 聊天滚到底 → 前进离开(`display:none` 清零内部 scrollTop)→ `navigateBack` 返回(keep-alive 不重新 mount)→ `watch([messages,typing])` 不触发 → 列表停在顶部,用户「消息全没了」。
- **根因**:uni H5 `navigateTo` 是 **push/keep-alive**——前进离开时源页只 `display:none` **不销毁**,`onUnload`/`onUnmounted` 都不触发(它们只在真 `navigateBack` 销毁时跑);清理逻辑(`nova.close`)与滚动恢复(数据 watch)全挂在这两个漏掉的时机上。这个「隐藏但存活」中间态是 keep-alive 型路由的通用盲区。
- **对策**:用 uni **页面级 `onShow`/`onHide`** 覆盖中间态——`onHide` 关 Nova(前进离开也置 isOpen=false → 后续 push 正常累积未读);`onShow`(首次进 + navigateBack 再现都触发)重开 Nova 清未读 + bump `revealTick` 让 thread 重新滚到底。`onShow` 无条件递增 `revealTick`、`conversation-thread` 的 watch 纳入 `revealTick` → 返回即回底。
- **已转**:本台账 + `pages/support/chat.vue` 的 `onShow`/`onHide`。硬规则:**keep-alive 页面(uni 所有 navigateTo 目标)里「离开要清、回来要恢复」的逻辑必须挂 `onHide`/`onShow`,不能只挂 `onUnload`/`onUnmounted`**(那俩只覆盖真销毁,漏掉前进离开);验证这类必跑「发消息→前进离开→等副作用→navigateBack」完整往返,不能只测真返回。
- **元教训**:同物理路由互跳(如 `/pages/support/chat?type=ai` → `?cid=x`)uni `navigateTo` 会**坍缩成 redirectTo 不 push**——验证「前进再返回」要用**不同路由**页面前进(实测用 `/pages/genesis/genesis`),否则栈没那一层、navigateBack 直接回更上层,验证路径本身就错。

## P-062 · bare 全屏页(不套 AppChassis)缺 `GlobalUi` 宿主 → toast/confirm/netError 进 store 却无处渲染,静默失败

- **现象**:聊天页 `chat.vue` 是 `position:fixed inset:0` 的 bare 全屏页(为聚焦对话不要 tabbar/nova 浮标,刻意不套 `AppChassis`)。发送限频命中时 `toast.warn(...)` 正常写进 ui store,但**用户看不到任何提示**——限频「拦」对了,「提示」没落地。
- **根因**:toast/confirm/netError 的**渲染宿主 `<GlobalUi />` 只在 `AppChassis` 里挂**。bare page 不套 chassis → 该页整条 overlay 链无渲染出口,任何在此页 raise 的 toast/confirm 都进 store 石沉大海。
- **对策**:bare page 自带宿主——`chat.vue` 模板末尾加 `<GlobalUi />`(它自 gate `showBusinessOverlays` 按路由判,chat 路由非 static-review → 正常显示;与 `login.vue`/`register.vue` 既有 bare 页挂法一致)。实景确认限频 toast 双语弹出。
- **已转**:本台账。硬规则:**任何 bare 全屏页(不套 `AppChassis`)只要可能 raise toast/confirm/netError,必须自带 `<GlobalUi />`**;写 bare page 时先自问「这页的 overlay 往哪渲染」。
- **元教训**:全局能力(toast/confirm)默认**依附某个容器**(这里 AppChassis)——脱离容器的页面白拿一个「调了不报错但没效果」的静默陷阱;「声明(调了 toast)≠实现(渲染出来)」,验证反馈类交互必**实景看到那个 toast/弹窗**,不能只确认「代码调了」。

## P-063 · canvas 无法解析 CSS var → 海报/图形绘制的 token 纪律需「运行时读取 + 画稿常量」双轨

- **现象**:FEAT-SHARE01 邀请海报用 uni canvas 绘制,`setFillStyle("var(--v5-brand)")` 无效(canvas 2D 填充不走 CSS 级联),若直接写死 hex 又违反「颜色用 token 不写 hex」铁律,且亮/暗主题切换后海报 brand 色会与 app 当前主题脱节。
- **根因**:canvas 是位图绘制 API,不在 DOM 样式系统内——CSS 自定义属性对它天然不可见;而 V5 token 铁律的适用前提是「样式走 CSS」。
- **对策**:双轨——① 主题相关色(brand / on-brand / accent)运行时 `getComputedStyle(document.documentElement).getPropertyValue("--v5-*")` 读真值(H5;非 H5 回退常量),海报随当前主题;② 画稿固有色(海报暗底渐变、暗底上的墨色)= 营销画面常量,与 UI 主题无关,文件头注释声明豁免理由。禁第三种形态(裸写死主题色)。
- **已转**:本台账 + `share-poster-sheet.vue` 头注 + `cssVar()` helper。硬规则:**canvas/位图绘制里的主题色必须运行时读 token(带回退),画稿常量必须头注声明豁免**;审查 canvas 代码时把 `setFillStyle/fillStyle` 里的 hex 逐个归类「主题色(必须 cssVar)/画稿常量(必须有豁免注释)」。
- **⚠️ 适用域更新(2026-07-08)**:主人拍板分享海报为**恒定深色画稿**(浅/深模式同一张图),`share-poster-sheet.vue` 已删 `cssVar()`,全部颜色转画稿常量(轨②)并头注豁免——「轨①运行时读 token」对该文件不再适用,**勿按本条把 cssVar 加回去**。双轨规则对未来其它「需随主题变」的 canvas 场景仍有效。
- **元教训**:铁律有隐含适用域(token 铁律 ⊆ CSS 渲染域);出域场景(canvas / 邮件模板 / 导出图)要人为把「单源」精神翻译过去,而不是机械 grep hex=0 或干脆放弃纪律。

## P-064 · uni H5 storage 值带 `{type,data}` 包装 → 外部/测试直写 localStorage 必须同格式,否则 hydrate 静默回退默认值

- **现象**:实景走查想模拟登出,直接 `localStorage.setItem('nexion-auth-v1', JSON.stringify({isAuthenticated:false,...}))`,刷新后仍是登录态——像「改不动」;读侧 `JSON.parse(...).pendingCode` 也一直 undefined,像「没写进去」。
- **根因**:uni H5 端 `uni.setStorageSync` 会把对象包装成 `{"type":"object","data":{…}}` 落 localStorage;`uni.getStorageSync` 读到**裸 JSON**(无包装)时按字符串返回,store 的 `typeof s === "object"` hydrate 守卫判失败 → 静默走默认值分支。写读两侧都「不报错但不生效」。
- **对策**:任何绕开 uni API 直操 localStorage 的场景(Playwright 走查注入 / 调试脚本 / 数据迁移)一律读改写 `{type:"object",data:…}` 包装;或干脆在页面上下文里调 `uni.setStorageSync`。走查前先 `getItem` 看一眼真实格式再动手。
- **已转**:本台账。硬规则:**E2E/走查脚本注入 uni 持久层,必须先读真实存储格式对齐包装**;凡「注入后行为没变」先怀疑格式不匹配,不是逻辑没生效。
- **元教训**:框架适配层会给「标准 API」加私有约定;测试代码绕过适配层时,绕过的不只是 API 还有约定——注入型测试的第一步永远是「看一条真数据长什么样」。

## P-065 · bottom sheet 底部留白必须「基础值 + env(safe-area-inset-bottom)」,新组件要对齐工程 38px 众数基准

- **现象**:FEAT-SHARE01 两个新分享 sheet 底部贴屏幕边——渠道面板 `padding-bottom: env(safe-area-inset-bottom)` 裸用(浏览器/无刘海设备 env=0 → 基础留白 0),海报面板基础值只给 16px;主人指出「离屏幕边框太近,要考虑 iOS 底部小横条」。
- **根因**:两层——① `env(safe-area-inset-bottom)` 只在 iOS 刘海屏 PWA/App 内有值,它是「避开小横条的系统区」,不是「视觉留白」,裸用=在其他环境完全贴边;② 写新 sheet 时没先 grep 工程既有 sheet 的基准:全站 10+ 个 bottom sheet 全是 `calc(env(safe-area-inset-bottom) + 38px)`,38px 是众数基准(同 `feedback_width_alignment_audit` 「先实测众数」的纵向版)。
- **对策**:bottom sheet 一律 `padding-bottom: calc(env(safe-area-inset-bottom) + 38px)`;非 sheet 的贴底条(聊天输入条等)最低 22px。新做任何贴底组件前先 grep `safe-area-inset-bottom` 对齐既有基准。
- **已转**:verify.sh 哨兵 `safe-area-inset-bottom base padding >=22px (P-065)`(node 解析两种词序 + env fallback 形态,基础值 <22px 即 FAIL;已探针验证真抓 0px/16px 反例)。
- **元教训**:safe-area 类 env 变量是「条件性系统补偿」,永远要叠加设计留白而不是替代它;新组件的间距基准先问「工程里同类怎么写」,不是拍脑袋给个小值。

## P-066 · 试用提前购买扣款失败仍记「已购买」账单——裸 `app.debitBalance()` 丢弃 false 返回值

- **现象**:试用期点「立即购买」提前兑换,余额预检查(确认框前)通过后、确认框停留期间余额被别端(多端/其它购买)消耗光;确认后 `app.debitBalance()` 返回 false(不扣款),但代码照常 `bills.add({type:"purchase"})` + creditBalance + addDevice → 账本记一笔「已购买」但钱没动、白发设备(账单与实际扣款不一致,非偿付性,审计相邻发现)。
- **根因**:裸语句 `app.debitBalance(chargeAmount);` 丢弃 boolean 返回值;第 206 行余额预检查在 `await confirm()` 的并发窗口下已 stale。且 `redeemEarly()` 在 debit 之前已把试用状态推进到 `redeemed` 终态——只 return 会留下「显示已兑换、实则没钱没设备」的死状态 + 冷却锁死。
- **对策**:检查返回值,false 时 `freeTrial.markChargeFailed("insufficient_funds")`(翻 failed 保留 finishedAt 起冷却) + toast + return,后续记账/加余额/发设备全不执行。对齐 App.vue handleAutoRedeem / checkout.vue 既有正确写法;全站 12 处 debit 调用同形排查,trial 是唯一漏点。
- **已转**:verify.sh 哨兵 `debit_return_checked`(grep 行首裸 `app.debit(Balance|Nex)(...);` = bug 形态;现有 12 调用点零误报、原 bug 形态真抓,5 形态自测过)。
- **元教训**:返回 boolean 的资金原语(debit/扣款/校验)裸语句调用 = 静默吞掉失败信号;凡「先检查后执行」跨 await/用户确认,检查必在真正动钱那步复核(预检查只是前置过滤,不是授权)。

## P-067 · 重开先刷新心跳再结算 → 被杀 App 的离线墙钟差按在线档倒补

- **现象**:手机曾在线后杀掉 App 数小时，重开第一拍直接拿到完整在线加成；同一段离线时间从 H5 看是基础托管，从 App 重开看却被倒补在线收益。
- **根因**:tick 先把 `onlineHeartbeatAt` 写成当前时间，再用这个新心跳给 `now - lastSettledAt` 的历史墙钟差定价，把“现在重新上线”错误外推成“整个离线区间都在线”。
- **对策**:结算顺序固定为“读取旧心跳 → 给本次墙钟差定价 / 累计 attestation → 刷新新心跳供下一拍使用”；暂停、退役、重校准、会话失效同步清理心跳和结算锚点，多端合并忽略未来时间戳。
- **已转**:`scripts/r7-device-detail-runtime.mjs` 覆盖 null / 新鲜 / 超时边界 / 未来心跳、6 小时陈旧重开、生命周期清理与多端合并；`verify.sh` 锁先结算后刷新顺序和全站在线判定单一入口。
- **元教训**:心跳是区间末端的观测，不是对上一整段时间的证明。任何“刷新状态 + 按时间差结算”链都必须先用旧状态封账，再让新状态影响未来。

## P-068 · uni H5 弹层靠 `@keydown.tab` 困焦点 → Shift+Tab 仍逃到背景

- **现象**:设备快捷菜单能由 Shift+F10 打开并把焦点送入，但首项按 Shift+Tab 会跳到页面背景按钮；只测“打开 / Escape / 回焦”的脚本仍全绿。
- **根因**:uni H5 的 `<view>` 事件包装下，弹层容器的 `.tab` 键修饰和并列 keydown handler 没有稳定拦截原生 Tab 默认行为；Vue 状态和 ARIA 看起来正确，但浏览器焦点已越界。
- **对策**:H5 在菜单打开期间用 `document.addEventListener('keydown', handler, true)` 捕获原生键盘事件，关闭 / 卸载时对称解绑；边界 Tab 明确 `preventDefault + stopPropagation` 并手动首尾循环，Escape 走同一 handler。
- **已转**:runtime 新增“首项 Shift+Tab → 末项、末项 Tab → 首项”双向断言，再验证 Escape 关闭与焦点回到设备卡；verify 锁 capture listener、focus trap 和 modal 语义。
- **元教训**:无障碍弹层不能只证明“焦点进得去、关得掉”，还必须对抗性证明两个边界都出不去；框架键修饰不是原生默认行为已被阻止的证据。

## P-069 · bare 登录注册页未继承 chassis 系统栏 → 顶部状态栏、Home Indicator 与底部安全区成了逐页漏项

- **现象**:主应用页面由 `AppChassis` 提供 iOS 状态栏和 Home Indicator，但 onboarding / login / register 是 bare 全屏页，各自只画业务内容；estimator CTA 仅留 24px 底距，既和注册成功页的 38px 基线不齐，也会贴近 Home Indicator。
- **根因**:系统 chrome 的所有权只落在 `AppChassis`，bare 页面没有等价共享壳；页面作者只能逐页记 `env(safe-area-inset-*)`，导致“内容渲染正确”掩盖“该有的系统层不存在”这个完整性盲区。
- **对策**:新增 `standalone-page-shell.vue`，复用 `DeviceStatusBar` + `DeviceHomeIndicator`，统一计算 App 真状态栏 / H5 设备预览 54px 状态栏与 `env(safe-area-inset-bottom) + 38px` 底部基线；9 个登录入口/auth/onboarding 页面全部接入。可滚动 bare 页的系统栏用 viewport-fixed，避免随内容滚走；系统 chrome 层级高于页面弹层。
- **已转**:`verify.sh` 自动扫描 onboarding/login/register/ref/session 目录，任一新增页漏接共享壳、主操作标记、Home Indicator 抽取回退或 38px 基线未实际应用即失败；总门禁直接运行 `scripts/auth-system-chrome-runtime.mjs`，在 430×940 与 320×568 逐页记录滚动前几何，再用真实滚轮验证可达性、状态栏 / Home Indicator / 控件安全距离与弹层层级，并锁 estimator 与 register-success 首屏 CTA 同坐标；AUTH02 真实 referral 礼包成功态另锁 `scrollTop=0` + 16px 安全距。
- **元教训**:系统状态栏和 Home Indicator 不是页面装饰，是页面壳不变量。以后设计任何 full-screen 页面先选 `AppChassis` 或 `StandalonePageShell`，不能从零开始猜上下留白。

## P-070 · 扫描器的「相等」与「上下文」两个口径都太窄 → 两次得出「已清完」的假结论

- **现象(C1 批次,我的工具连错两次,均在下结论前被已知答案探针拦住)**:
  ① 判「字面量是不是某 token 的副本」时按**颜色值全等**比 —— `rgba(14,142,74,0.30)` 与 `--v5-success` 的 `#0E8E4A` **只差 alpha**,不全等 → 漏掉 `vault-row` / `how-callout-box` 共 5 处真 bug,还会给出「全站只有 13 处」的假清单。
  ② 用「同行必须出现 `color`/`background`/`border` 等属性关键词」当上下文过滤 → 变量赋值行(`const tint = … : "#C26658"`)、对象字段行(`lemon: "rgba(…)"`)全在盲区,再漏 5 处。
- **根因**:两个口径都是**为了降噪而设的启发式**,但降噪门槛设在了「违例的实际书写形态」之上。同一个语义色在真实代码里有至少 5 种形态:`#RGB` / `#RRGGBB` / `#RRGGBBAA` / `rgb()` / `rgba()`,再乘上「改 alpha 做描边/底色」的派生用法;它出现的位置也不限于 CSS 声明行,可以是常量表、三元表达式、模板字符串。
- **对策(第一性原理重定判据)**:
  - 比 **RGB 三元组、忽略 alpha** —— 变透明度副本同样必失配。
  - **去掉上下文启发式** —— 颜色字面量本身就只可能是颜色,不需要属性关键词佐证;降噪改用「显式豁免台账 + reason 必填」。
  - 只钉**亮值 ≠ 暗值**的 token(单主题 token 的副本不会失配),真灰 `r=g=b` 排除(是通用光影不是语义色)——用**判据精度**降噪,不用**匹配面收窄**降噪。
- **已转**:`scripts/token-copy-sentinel.mjs`(已接 verify.sh,`--selftest` 25 条双向红测:5 种书写形式 + 变 alpha 阳性全中,`var()`/`color-mix`/真灰/三种注释阴性全 0)+ `docs/TOKEN-COPY-ALLOWLIST.json`。旧的 4 色 hex 哨兵保留为无豁免硬地板。
- **③ 同病第三次发作(同批 ROUND 2,由 audit 门抓出)**:清「弹层遮罩」时我用 `grep 'rgba(0,0,0,0.5x)'` 这类**值**匹配,只捞到 9/20;漏的 11 个写的是 `rgba(8,8,12,0.45)`/`rgba(7,9,15,0.62)`/`rgba(0,0,0,0.72)`。
  🔴 **用「值」去找「扮演某角色的东西」必然漏 —— 角色不由值定义。** 遮罩的角色特征是「选择器叫 `*-backdrop`/`*-mask`」或「铺满视口 + 有底色的覆盖层」,与它取什么值无关。
  已转 `scripts/scrim-single-source.mjs`(按**角色**扫,19 条双向红测 + 仓内红测;已接 verify.sh);全站 20 个遮罩收敛为 `var(--v5-bg-color-mask)` 单源。
- **元教训**:**「扫描器报 0」只等于「我的正则口径内是 0」。** 焊哨兵前先拿一批**已知的真违例位置**当靶子反查,靶子没被命中就说明口径有洞 —— 而不是等报 0 就宣布清完。
  推论(本条三次发作共有的形状):**清理某一"类"东西时,先定义这个类的「角色判据」,再去找;不要用手头碰巧见过的几个「值 / 写法」当类的定义。** 值是角色的实例,不是角色本身。
  这是「验证工具用错」元模式在本仓的第 3 个样本(前两个:tsc 被管道吞退出码、字号 codemod 与哨兵共用只认 kebab 的正则)。

### P-055 [验证方法·中] 门的结论用管道判 = 静默放过;跨语言占位符不能做硬门

- **症状(两条同源:都是「门看起来在守,其实没守/守错」)**:
  ① 红测新哨兵时写 `node gate.mjs 2>&1 | head -4; echo exit=$?` —— 打印的是 `head` 的退出码恒为 0,**种了真缺陷也显示"通过"**。这是本仓 EVOLUTION 台账记过的同类坑第 2 次(前次:verify 的 tsc 被 `| tail` 吞退出码误报 PASS)。
  ② 新加的「三语插值占位符必须逐键相等」硬门,首跑即报 4 条,回源后**全部是误报**。
- **根因**:① shell 管道的 `$?` 是最后一个命令的退出码,`head`/`tail`/`grep` 都会覆盖真实门结果。② 占位符集合跨语言**天然不同**:英文复数/语法标记(`seat{s}`、`direct {label}`)中文无对应,调用点传 `{ s: qty > 1 ? "s" : "" }`,中文少写是正确的;组件还可传占位符**超集**供各语言各取所需(`binary-how.vue:193` 明写「zh 用 `{freq}`、en 用 `{unit}`,两者都传,fmt 忽略未用占位符」)。
- **对策**:① 判门结论一律**落文件再读**:`cmd > log 2>&1; echo "exit=$?"`,或用 `${PIPESTATUS[0]}`;禁止 `cmd | head` 后读 `$?`。② 占位符检查降为 **INFO 级清单**(打印供人审阅,不 fail);键镜像仍是硬门(红测:改一个键名 → 真实退出码 1)。真正的风险「文案要的参数组件没传」需解析全部 fmt 调用点,非镜像脚本职责。
- **已转**:`scripts/i18n-key-mirror.mjs` 扩 AST 收集占位符(495 条带插值文案纳入 INFO 监控),硬门维持键集镜像;本条元教训写入 PITFALLS。
- **元教训**:**一个会稳定误报的门,必然被加白名单绕过,最终等于没门** —— 焊门前先问「它的误报率是否可长期为 0」,做不到就降级成报告,别用白名单硬撑。另:**验证「门有效」本身也要用无管道的方式验**,否则是用一个坏方法去验一个门。

### P-056 [并发·高] 哨兵把「设计值」写死进自测 → 该值事实上不可改;并发 session 撞车先撤回

- **症状**:本会话把 5 个亮色语义 token 加深到无障碍达标(色相 0 偏移),`verify.sh` 立刻红——不是我的改动有错,而是**另一个并发 session 新建的 `token-copy-sentinel.mjs`,其 selftest 把当前色值硬写进 fixture**(`p("--v5-success@light(#0E8E4A) 入表", ...)`、`scanText('color: "#0E8E4A"', ...)`)。改值后 fixture 找不到对应色 → `scanText` 返回空 → `isAllowed(undefined)` 抛 TypeError,**整个自测崩溃而非失败**。
- **根因(两层)**:①**哨兵设计缺陷**:断言依赖「具体设计值」而非「值之间的关系」,等于把设计值焊死——任何合法的设计演进都会崩它,与哨兵本意(防 token 值被抄成字面量)无关。②**并发协作盲区**:两个 session 在同一领域(颜色)作业,后者不知前者存在;发现方式是工作树里出现 untracked 的陌生脚本 + 其数据文件自带批次标注(`_updated: "2026-07-23 · C1 …批次"`、`pending:` 在途条目)。
- **对策**:
  - 哨兵侧:自测**从 tokens.css 动态读当前值**构造 fixture,断言改为**关系式**(「亮暗两值都能扫出」「两值不等」「同值 token 不入表」);取不到元素时让该 probe FAIL 并打印原因,**禁止崩溃**(崩溃会掩盖真实结论)。
  - 协作侧:🔴 察觉并发迹象(陌生 untracked 脚本 / 数据文件带他人批次标注 / 自测因自己改动崩)→ **先撤回自己的改动让对方跑完**,而不是改对方的在途代码;撤回后立刻验证机器门恢复,并把**分析结论留档**(撤的是改动不是结论)。
- **已转**:结论与目标值留档 `docs/changes/2026-07-23-after-c1-followup.md`(含 C1 收口判据 + 哨兵改造方案 + 颜色目标值表 + rem 修复受控实验步骤);本条元教训入 PITFALLS。
- **元教训**:**「哨兵越严格越好」是错的——哨兵该钉住的是不变量(关系),不是当期取值**。钉住取值的哨兵,会把「本应可演进的设计决策」变成「改不动的水泥」,并在第一次合法演进时以崩溃形式暴露。判据:问自己「这个断言在设计合法演进后还成立吗?」不成立就说明钉错了层。

## P-057 · 运行时探针的可信度必须先于结论(C3 2026-07-23)

**现象**:新写的 tap 探针首跑报 203 条「缺按下反馈」,四轮修正后只剩 31 条 —— **172 条是工具 bug**。

**四类根因**(每类都已落成 selftest 红测锚,见 `scripts/tap-feedback-probe.mjs`):

1. **SPA 状态跨路由累积** —— hash 变化不重载页面,一次弹出的 sheet / celebration overlay 会跟着
   后面所有路由被采样(一个 tradein 关闭按钮记进 68 个路由)。**判据:同一元素出现在几十个
   不相干路由 = 先怀疑扫描污染,不是产品全站缺陷。** 修法:URL 加每轮变化的 query 强制整页重载。
2. **过渡起点值** —— `CSS.forcePseudoState` 之后立刻读 computed style,带 `transition` 的元素
   拿到的是过渡**起点**(旧值)→ 明明有反馈判成没有。修法:注入 `transition-duration:0s`。
3. **`:active` 会应用到整条祖先链** —— 反馈写在父容器、click 绑在内层 `<text>`(store 主 CTA 的写法),
   只测元素自身必然误报。修法:自身无变化时再查 4 层祖先。
4. **可见性判定过度杀伤** —— 一度改用 `elementFromPoint` 命中测试,把首屏之外的正常内容
   全判成不可见,目标数 1443 → 225(84% 假阴)。**弹层本工程一律 `v-if`,不在 DOM 即不计,
   不需要视口判定兜底。**

**元教训**:探针的每一次「异常发现」都先当作**工具的嫌疑**,跑已知答案探针证伪自己,再看产品。
四轮里任何一轮直接开修,都会产出一大批「修了不存在的问题」的改动。

## P-058 · inline `style` 会静默吃掉 class 写的 `:active` 反馈(C3 2026-07-23)

`team/agent.vue` 的 bucket 行写着 `class="... active:opacity-70"`,UnoCSS 也确实生成了
`.active\:opacity-70:active{opacity:.7}` —— 但同元素的 `:style` 里有 `opacity: unlocked ? 1 : 0.7`。

**inline style 优先级高于任何 class 规则**,所以这个反馈:
- 锁定态:基础值本来就是 0.7,`:active` 也是 0.7 → 零变化
- 解锁态:inline 的 `opacity:1` 直接压掉 `:active` 的 0.7 → 零变化

**两种状态下都完全失效**,而 grep class 名的检查一律看不出来 —— 只有运行时实测 `:active` 前后
computed style 才抓得到。修法:反馈换用 inline 没写的属性(这里改 `active:scale-[0.98]`)。

全站扫过一遍(88 路由,查 class 有 `active:opacity` 而 inline 有 `opacity` 的元素):**仅此一处**,不是系统性问题。

同形还有一种「声明了等于没有」:`trial-hero-banner` 的 `active:scale-[0.998]` —— 0.2% 缩放,
肉眼与探针都测不出。**反馈值必须与基础值有可感知差异,写了不等于生效。**

## P-059 · SFC 模板 HMR 静默不生效,i18n 却热更了 → 误判「代码没写对」(卡通道 2026-07-27)

同一批改动横跨两层:i18n 新增 key(`cardLimitHint`)+ 组件模板里消费它的那两行。实景检查看到的是:
文案层**是新的**(费用行显示未插值的 `卡通道费 {rate}`,而旧文案写死 `3.5%`),但插值没替换、
新加的限额提示整行不存在 —— 看起来像「`fmt` 调用写错了 + 模板行没保存」。

真因:**i18n 的 .ts 模块热更了,.vue 组件没热更**,页面跑的是「新文案 × 旧模板」的混合体。
旧模板直接 `{{ t.x.cardFeeLabel }}` 输出未插值原文,于是占位符原样显示;限额行本就不在旧模板里。
`location.reload()` 后两处立刻正常,代码一个字没改。

**教训**:改动同时横跨「数据/文案模块」和「组件模板」时,HMR 可能只更新一半,产出一个
两边都不是的中间态。**实景检查前先硬刷新**,别拿混合态的现象去改代码 —— 这次若直接
「修 fmt 调用」,改的是一个根本不存在的问题。(同族:探针异常先怀疑工具见 P-057 元教训。)

## P-060 · verify 的空状态探针存在偶发假红(2026-07-27)

同一份代码连跑三次 verify:第一次 1 fail、第二次 2 fail(含 `pages/search/search` 空状态未渲染)、
第三次 0 fail;而单独跑 `node scripts/empty-state-probe.mjs` 是 20/20 全过。
即该探针在 verify 全量上下文里(前序检查已开过多个 headless 浏览器)会偶发超时假红。

**处置**:遇到空状态探针红,先单跑该探针复核 —— 单跑过 = 假红,不要去改产品代码。
长期修法(未做):探针内部加重试,或让浏览器实例在检查间复用。

## P-061 · 哨兵可以在你以为它在守的时候早就什么都不守了(2026-07-27 audit)

品牌改名(07-22)把 uniapp 的 storage 键从旧前缀改成了 `nexgrid-*`。三处连锁失效,一处比一处隐蔽:

1. **跨仓走查空跑**:admin 的 `*-walkthrough-proof.mjs` 往浏览器注入的仍是旧前缀键,前端读不到 →
   注入全部落空 → 页面保持默认态,于是 FT/FM 那批业务闭环断言**一直在红**,被当成「走查脆性」搁置。
2. **看守它的哨兵自己瞎了**:`uni-storage-key-sentinel.mjs` 的 `KEY_RE` 也只认旧前缀,
   「现役键集」恒为**空集** —— 空集导致「消费键 ∉ 现役集」对每个键都成立,把 30+ 条正常引用全报成废弃。
3. **修完消费侧,哨兵变假绿**:把脚本里的键改成 `nexgrid-` 之后,哨兵按旧前缀既扫不到消费键、
   也扫不到现役键 → 输出「0 处引用全部现役(前端键集 **0 个**)」+ 退出码 0。
   **绿得比真绿还干净,而它一个键都没检查。**

抓住它的只有一个细节:PASS 那行括号里写着「前端键集 0 个」。修好后同一行是「57 个」。

**教训**:
- **改任何全局命名(品牌前缀 / 存储键 / 路由段),必须同时 grep 哨兵与 harness 的判据**,
  它们通常把旧命名硬编码在正则里,而且不会因为失效而报错 —— 只会变绿。
- **哨兵的 PASS 行必须打印「检查了多少个」**,否则空集假绿无法与真绿区分。本条已是本仓惯例,
  这次正是靠它抓到的;新写哨兵一律照办。
- 双向红测要连**判据本身**一起测:阴性(当前代码不报)+ 阳性(注入违规能报)+ **样本量非零**。
  只测前两条,空集也能全过。

(同族:harness 键不同步见 memory `feedback_verify_harness_storage_keys`;
未验证工具输出别建叙事见 `feedback_tool_output_self_distrust`。)

## P-062 · 「N 个步骤失败」多半是第一步挂了,后面根本没跑到(B4 收口 2026-07-27)

admin verify 长期报 `FM-004/005/008/013/016 业务闭环失败`(5 个)+ `FT-013/014/015 失败`(3 个),
读起来像 8 处功能都坏了,实际各只有**一处**根因,修一行整条链就全绿:

| 走查 | 唯一根因 | 表面症状 |
|---|---|---|
| FM(7 步) | 网络 chip 的 label 由 `USDT-TRC20` 缩短为 `TRC20`(uniapp 9d66d4d),class 与文案随之变,走查断言未同步 | 第一步 `.nx-dep-net-usdt-trc20` 找不到 → 抛错 → 后 6 步未执行 |
| FT(7 步) | 脚本引用了一个**从未定义**的常量 `WITHDRAW_ADDRESS`(ReferenceError) | 同上,一进 FT-013 就死 |

**教训**:
- 走查/测试报「一批 ID 失败」时,**先看第一个 ID 的第一条错**,别按数量估工作量 —— 顺序执行的
  链式脚本里,后面的 ID 只是「没轮到」,不是「也坏了」。
- 反过来:**修好第一处后要重跑**,因为后面那些从未真正执行过,可能藏着各自独立的问题
  (本次 FT 修完第一处,立刻暴露第二处坏断言:`seeded.boundAddress` 字段从未被返回过,恒 undefined)。
- 同一批还暴露:门 A 恒失败会掩盖门 B 的问题(`fe-be-mapping-coverage` 的 11/11 全绿断言
  长期挂着,导致它后面的「运营面禁工程名词」检查从未执行,其扫描范围错配也就一直没暴露)。
  **一个 verify 项里串了多个断言时,前面的长期红 = 后面的全部失明。**

## P-063 · 哨兵里 pin 死像素尺寸 = 定时假红,因为行高是「跑门那台机器装了什么字体」的函数(2026-07-28)

零-border 门报 `/pages/team/network 新增 1 处「有填充 + 四边描边」358x390`,读起来像新违例。
实际那个元素**早就在 allowlist 里**、理由写了整段并经主人拍板,只是条目 pin 的是 `358x391` ——
高度掉了 1px,`size` 精确匹配失配,豁免整条落空。

**根因不在代码**:9d66d4d(基线重建)→ HEAD 之间 `src/` 只动了入金 store 逻辑、i18n 文案、
充值卡表单和商品图,`network.vue` 自 3c9aa7c 起零改动,`uno.config.ts` 那次改动去掉注释后与前一版**逐字节相同**。
1px 来自字体度量:`tokens.css` 的字体栈首选 **General Sans**,而本工程 `index.html` 只取
Manrope / JetBrains Mono —— 那句「loaded via `<link>` in layout.tsx」是从 Next 原型抄来的,**在 uni 侧不成立**。
于是 General Sans 渲不渲得出来,取决于**跑门那台机器装没装它**;换机器、装个设计软件,全站文字行高就集体差 1px。
本次同批漂移的还有 3 处(都是 partial 不拦门):`compute-share/download` 46→45、`me/devices` 46→45、
`trust/trust` 39→38,外加 `me/notifications` 多出一条 65(原 66)。**四处同向 −1px,没有一处是真的样式改动。**

**同一根因这是第 3 次发作**,前两次都只改了数字:C3 genesis hero 232→242、B4 orb 卡 388→391。
B4 当时的对策是在 commit message 里写「改字号必顺手核对各基线里 pin 了尺寸的条目」——
**把机器能测的事交给人记,4 天后原样再犯。**

**教训**:
- **哨兵的判据里出现像素值,先问它是不是字体度量的函数**;是,就必须给容差,不能 pin 死。
  已落地:`zero-border-gate.mjs` 的 `sizeMatches()`,allowlist 尺寸走 **±2px**
  (真实设计改动的位移是 3~10px,仍会失配被拦下复核;只放行度量抖动那 1~2px),配 8 条双向红测。
- **容差只给没有自愈路径的那一层**。allowlist 是人工裁决,失配会把人推向 `--update-baseline`,
  那会把「带理由的例外」洗成「无理由的存量」;基线本身有自愈路径(`--update-baseline` 被 `added=0` 守着),
  所以**不给**基线容差。⚠️ 遗留敞口:基线里的 `full` 条目若也漂 1px,仍会报成「新增违例」误导人,
  目前靠 full 条目少(3 条)扛着,要不要一并给容差是门的语义决策,留给主人拍板。
- **报「新增违例」之前先查它在不在 allowlist**:同 route+cls 只差尺寸的,九成是漂移不是新违例。
  照着 FAIL 提示去删 border,删掉的会是一条有理由的例外(C2 第二轮就这么误删过一次)。

---

## P-071 · 限额「先查后建」在异步窗口里必被绕过;判定被没被接上是第二道门

**症状**:FEAT-WD01b「每日提现 1 笔」。独立验收两个标签页同刻点提交,**3 轮 3 中**各自建单成功
(两个不同单号、两页都跳追踪页);同一轮 code review 独立指出同一处。

**根因**:实现成「读计数判超限 → 600ms 风控评估(异步)→ 建单 → `commitWithdrawal` 里 +1」。
检查点与占用点之间隔着整个提交流程,两边都能在对方写盘前读到「今天还没提过」。
**不是并发处理写得糙,是限额模型选错了**:限额只能「先占后建」(claim),不能「先查后建」。
讽刺的是同一个 `submitWithdrawal` 里 60 行外的**余额**并发透支门当天刚做过「落盘再核」的同款修复,
新加的计数门没抄——**加新的资源限额门前,先看同类门(余额/库存)是怎么防并发的**。

**修法**:纯函数 `claimDailySlot(counter, limit, now) → {allowed, next}`;
存储层 `claimWithdrawSlot` 做一次**同步**读-改-写;调用点放在所有拒绝条件之后、建单之前;
`commitWithdrawal` 不再事后 +1。被拒不递增(被拒的提交不该白吃额度)。
残余窗口(跨进程读写交错)写进注释,PROD 由服务端 `UPDATE ... WHERE count < limit` 兜底。

**第二个坑(更值钱)**:验收 F3 实测——把写计数那**一行整个摘掉**(限额彻底失效),
`selfcheck-fastlane` 43/0、`feegate` 14/0、`type-check` 0 错、`verify.sh` 全绿。
判定层有 63 条行为断言守着,「这个判定有没有被调用」**零覆盖**。
判定对不对 / 判定有没有被接上,是两个正交维度,必须分别设门。

**已转哨兵**(`scripts/selfcheck-fastlane.mjs` 第 8/9 节,7 路红测全部会红):
- 行为门:claim 的准入/递增/跨日/坏配置/NaN,平台日边界随机 5000 样本
- **接线门**:claim 调用存在 + 失败 return null · claim 源码位置早于建单 ·
  `commitWithdrawal` 不再计数 · 存储层判据来自 core · 提现路径不直读 `Date.now()`
  (用**精确表达式**不用关键词;每条都有红测)

**顺带**:`floor(ts/86400000)` 切的是 UTC 日,越南(UTC+7)用户额度在当地早 7 点重置。
平台日改按 UTC+7;文案从写死「明日 X 重置」改成绝对时刻「MM-DD HH:mm 后可再提」——
用户本地时钟与平台日未必同一天,写死的相对词在某些时段必然说错(验收实测本地 08-01 02:00 时仍写「明日」)。

**⚠️ 2026-08-11 后续:上面的「修法」段已作废,别照着复活它**(包 z2 / z1 审计 P0-1)。
`claimDailySlot` / `claimWithdrawSlot` / `withdraw-daily-count.ts` **整体删除**。
原因不是那套 claim 写错了,而是**它解的题没了**:c37e642 把建单让渡服务端事务后,
客户端不再有「建单前必须原子占一格」这个需求,而那次删本地扣款链时顺手删掉了唯一的占用调用,
计数器从此无人递增 —— 判定恒 0、预检恒不触发,四处 UI 承诺全不可达,**却没有任何门变红**
(那时的接线门守的是「claim 被调用」,调用连同被调方一起消失时,它守的主语也没了)。
现在改成从提现单列表按平台日现算(`countWithdrawalsOnPlatformDay`):
提交成功与计数 +1 是同一件事,没有第二份状态可以掉队;并发交由服务端事务拒第二笔。

**本条真正可迁移的教训一个字没变,而且更值钱了**:
① 判定对 / 判定有没有被接上,是两个正交维度,必须分别设门 —— 这条第二次救场;
② 但接线门要钉在**不变量**上,别钉在**当期实现的函数名**上:钉函数名的门,
   在「函数和调用方一起消失」时会安静地永远为真。新门改钉两条不变量 ——
   「计数只许来自提现单列表」+「上限只许来自服务端 policy」,谁再引入第二份计数就红。

**哨兵位置更新**:原第 8/9 节 → 现 `scripts/selfcheck-fastlane.mjs` **第 7 节**(行为:平台日边界
四向固定靶 / 恰好到达上限 / 两页判据随机 2000 组恒等)+ **第 9 节的日限接线门**(四条),
11 组注入逐个隔离红测。原第 8 节整节删除(它测的是已删模块的内部实现)。

---

## P-072 · 判据钉在「会变的东西」上 —— 一次重构同时造出假红与假绿

**症状**(2026-07-31 audit 横切 C 实测):FEAT-WD01 收尾时 `verify.sh` **本身是红的**,
而且同一批哨兵里既有假红也有假绿:

| 形态 | 实例 | 后果 |
|---|---|---|
| 钉局部变量名 | 哨兵 pin `readAccountSnapshot(accountKey.value)`,重构把它改名 `acct` | 无害重命名 → 资金门变红 |
| 钉重构后的死代码 | 哨兵 pin `nextWithdrawable = Math.min(`,而该变量已被 `applyDebit` 取代、零消费者 | 真 clamp 改坏也不红(**假绿**);`tsconfig` 无 `noUnusedLocals`,tsc 也不报 |
| 禁用串被新名超集覆盖 | 禁 `app.advanceWithdrawal`,新函数叫 `advanceWithdrawalArrival`,连**注释**里提一句都命中 | 假红,且诱导后人「放宽哨兵」消红 |
| 整行过滤的白名单 | 品牌哨兵 `grep -viE` 是**整行**过滤,为放行工程目录名加了 `cc|janus` | 同一行里的真违规被一起放行(红测 4 组漏 3 组) |

**根因一句话**:判据锚定的对象比它要守的不变量**变得更快**。变量名、函数名、行内其它内容都会变,
不变量不会。

**修法(已落地)**:
- 别 pin 局部变量名 → 改数**门的道数**(「提现链上必须恰有 2 处重读落盘余额」),少一处即红;
- 别 pin 可能变成死代码的表达式 → 先删死代码,再把哨兵指向真正在跑的实现;
- 禁用串加收尾定界(`app.advanceWithdrawal(` 而不是 `app.advanceWithdrawal`)且**剥注释再判**;
- 整行过滤的白名单**不要为一处例外放宽** —— 改那一处例外本身(哨兵自己的注释里就写着这条正解)。

**衍生**:接线门断言在本轮随实现升级了三次。每次都要**回源改判据**而不是改代码去迁就旧断言 ——
后者等于让哨兵反过来锁死实现。

**同源**:P-071(限额先占后建)· memory `feedback_sentinel_green_without_checking`(判据失效=空集全过)。

---

## P-073 · 提现单据从「单条」改成「列表」——与真后端同构才是根治

**症状**(2026-07-31 audit 两个独立 P0,同一根因):
① 第二笔提现建单会把第一笔**整个顶掉** —— 第一笔的钱已扣、单据从此不可达、到账推进永不再碰它。
  默认配置(每日 1 笔 + 到账 24h)下必然发生:今晚 20:00 提一笔,明早 09:00 平台日已重置就能再提。
② 为兜①加的「在途不许再提」闸,遇上**人工审核单在 mock 里没有任何出口**,把用户**永久锁死**
  (首提 > 小额线即转人工 → 钱扣了 → 此后再也提不了)。补丁比病更糟。

**根因**:`latestWithdrawal: Withdrawal | null` —— 只存最新一条。真后端 `GET /api/withdrawals`
返回的是**列表**。这违反项目 🔴🔴 铁律「Mock 必须 100% 真后台结构、随时可接真后台零重写」。
主人拍板「一切按真接后端处理」后定位清楚:**不是 mock 里怎么变通,是模型本身错了**。

**修法**(结构性,不是打补丁):
- `AccountCloudSnapshot.withdrawals: Withdrawal[]`;读盘处把老快照的单条**自动升级**成列表(不升 schema、老数据不丢)
- 合并层 `mergeWithdrawals`:**按单号取并集**,同一单状态取 rank 更靠后的那份
  (跨进程「读最新」会读到旧值,last-write 会把已到账的单退回处理中)
- store 里 `withdrawals` 是源真理,`latestWithdrawal` 变**派生 computed** —— 十几处消费面一行没改
- 建单 = 追加;到账推进 = **全表扫**(单条版只看最新一笔,前面那笔到点了也永远推不动)
- 单槽闸整条删除 —— 它本就是为兜单槽模型加的产品限制

**运行时证明**:注入老格式(只有单条)→ 重新加载 → 落盘变成 2 条列表、**两笔各自推进到已到账**、老字段清掉。
**已转哨兵**(5 条接线门 + 5 路红测,每路都能打红):列表化 / 追加不覆盖 / 全表扫 / 落盘失败回滚 / 单槽闸不得回归。
合并语义测试补了列表化才有的不变量:**两端各自新建的单必须都保留**(单条版这里会互相顶掉)。

**教训**:补丁修补丁,先问「这个洞是不是模型选错了」。②那个「更糟的补丁」正是没问这句的代价。

---

## P-074 · 「每轮红的脚本都不一样、单跑全过」= 先查环境,而且要查到**具体那个请求**

**症状**:`verify.sh all` 连续 6 轮,每轮红 1-3 条,**每轮红的脚本都不同**,报错却都是同一句
「Failed to load resource: 500」;逐个单跑**全部 PASS**。

**我先后判错两次根因**:
1. 「headless 浏览器孤儿堆积压垮 dev server」—— 实测确有 53 个 `chrome-headless-shell.exe` 孤儿,
   清掉后**恰好**跑出一次 362/0,于是收工。**这是巧合,不是因果。**
2. 「dev server 跑了一整天涨到 811MB 劣化」—— 干净重启后**照样红**。也不是。

**真根因**(12 并发压测 + `page.on("response")` 抓 4xx/5xx 的**具体 URL** 才现形):
`index.html` 外链字体 `https://api.fontshare.com/...`,**并发下被限流返 500**;
而这些脚本把「控制台有任何报错」一律判失败 → **外部网络抖动变成本项目的假红**。
Vite 日志里查不到(不是它发的 500),所以看服务端日志会一路查空。

**修法**:新增 `scripts/lib/console-origin-filter.mjs` —— 只忽略**第三方源的资源加载失败**,
判据写成「白名单本 origin」而不是「黑名单某域名」(换 CDN 不用改门);
第三方脚本抛的 JS 异常、自家任何报错**一条都不放过**。已接入 4 个受影响脚本,
配 8 条双向红测哨兵 `selfcheck-console-filter.mjs`(已进 verify 循环)。修完 **363 pass / 0 fail** 且稳定。

**教训(比这个 bug 本身值钱)**:
- 「同一症状、不同位置、单跑即过」→ 先查环境。**但别停在第一个看起来合理的环境解释上** ——
  我两次都找到了「真实存在且看起来足够」的环境异常(孤儿进程、内存膨胀),两次都不是因果。
- 判据是:**能不能指到那个具体的失败请求**。指不到就还没找到根因,清进程 / 重启只是在换骰子。
  抓法:并发复现 + `page.on("response", r => r.status()>=400 && log(r.url()))`。
- 「一次跑绿了」不等于修好了。修好的标志是**根因被指认 + 判据能解释此前每一次红**。

## P-075 · 能力跑通了 ≠ 用户知道 —— 「静默生效」的功能等于没做

2026-08-01,FEAT-WD01 小额免审快车道。判定层 92 条断言全绿、每道风控闸都有固定靶,
端到端确实在免闸。可走查一坐下来就发现:**表单上一个字都没提**。
输 $30 页面什么都不说(用户以为「这平台本来就快」);输 $80 只说「需人工确认」,
**不说「小一点就能立刻处理」**——用户按字面读只会得出「我这地址提多少都得审」,然后老实等一天。
功能的产品目的(让新用户第一笔小额成功)完全落空,而所有机器门都是绿的。

同批次牵出的三个同族坑:

- **判据混用**:`fastLaneApplied` 只表示「金额在小额线内」,老用户提 $10 也是 true 但一道闸没免。
  拿它当「享受了免审」的渲染判据 → 弹出一句空的「已免去:」。判据必须是 `waivedGates`。
- **假承诺**:免了两道冷启动闸 ≠ 这笔能立刻走(风控闸快车道免不掉)。共用地址 + $30 时
  横幅喊「这笔可立即处理」而实际照样进人工队列。能对用户承诺的**只有最终 route**。
- **常显提示当场对打**:「首次提现审核 24 小时内」原本无条件挂着,于是免审横幅刚说完立即处理,
  下一行就说要审 24 小时;已提过现的老用户也照样被吓一次。且 24 是写死的,
  运营改 `payoutSlaHours` 它不跟着变——空头承诺。

**规则**:

- 任何「静默生效」的能力(免闸 / 提速 / 降费 / 优待),**必须有一条面向用户的告知**,
  且**双向**:生效时正向说出来,不生效时说清「改成什么样就能生效」并给一键改的下一步。
- 「该不该劝他改」用**把目标值代进同一个判定函数**问一次,不许用 `amount > line` 这类启发式——
  启发式会在风控闸命中时照样劝,等于骗用户白改一次金额。
- 判定结果里的每个字段各有语义(`fastLaneApplied` / `waivedGates` / `route`),渲染前先问
  「我要对用户说的这句话,由哪个字段负责」,不许拿相近的字段顶替。
- 判定层的哨兵证明不了这一类问题:它们守的是「算得对不对」,守不了「有没有说出来」。
  接线门(选择器/条件表达式的精确串 + 逐条红测)是正交的第二道门。

已焊 `selfcheck-fastlane.mjs` 接线门 8 条,逐条红测 8/8 命中对应门。

## P-076 · 「显示出来的数字」也是承诺 —— 提交不了的动作不许报价,兑现不了的时限不许写

2026-08-01,FEAT-WD01 收尾的独立走查(把自己当第一次用的越南新用户,真点真输)。
机器门 363 全绿、console 0 报错,却挖出 3 个 P0,全是**数字在骗人**:

- **账单页的「余额」差 400 倍**。`recomputeBalance` 从 0 正向累加账单里 `posted` 的 USDT 行,
  而账单是**部分**流水(收益按 tick 累加不写账单),永远补不齐;提现在提交时就扣了款、
  账单却落 `pending`,只数 posted 又把扣掉的钱算回来。实测账单写「余额 $60.31」、
  钱包写「$24,826.56」。用户看对账单第一反应是「我的两万四被吞了」。
  **修法**:`balanceAfter` 的正主是服务端复式账本,store 不编造;mock 期由页面
  **以当前真实余额为锚往回倒推**,保证最上面那条(用户唯一会核对的一条)= 钱包上的数。
- **超过可提余额时照样出完整报价**。余额 $24,856 输 99999,页面把网络费 / 惩罚费 / NEX 抵扣 /
  「你会收到 $84,750.20」整套算完,底下还接一张「质押 180 天变成 $139,450」的预测卡,
  只有最底下按钮的小字说余额不够。低于最低额、今日笔数用完时同理。
  **修法**:报价是对「你提交后会发生什么」的承诺 —— **提交不了就没有会发生什么**。
  判据直接取页面已有的拦截单源 `submitDisabledReason`,不另起一套(另起必然漂移成
  「明细区说能提、按钮说不能提」)。
- **提交前强制勾选确认的风险披露 §04 写着「标准提现约 30 天」**,而系统实际是
  提交 + `payoutSlaHours`(24h);「> $1,000 进 45 天增强审查窗口」而该窗口当前阶段配置为 0。
  同一笔提现全站四个说法:5 分钟(链上)/ 立即处理(免审横幅)/ 24 小时(页脚 + 追踪页)/ 30 天(披露)。
  **修法**:时限数字全部从配置插值;大额审查窗口配 0 时**整句不出现**,而不是显示「0 天窗口」。

**规则**:

- **凡是显示给用户的钱和时间,都要能指出它从哪个单源来。** 指不出来的,要么接单源,要么别显示。
- 派生「运行余额 / 累计值」这类量,**不要从局部列表正向累加** —— 列表几乎总是不完整的。
  以权威当前值为锚**往回倒推**,至少保证用户会核对的那一端是对的。
- **报价只对真能提交的输入出。** 精确到分的数字会被读成承诺,给一个提交不了的金额报价,
  比不报价更伤信任。判据必须复用页面已有的拦截单源。
- **合规文本(用户勾选「我已阅读」的那份)是最硬的承诺**,里面的时限 / 阈值一个都不许写死;
  条件不成立的条款整句不出现,不要退化成「0 天 / $0」这种自曝配置的写法。

已焊 `selfcheck-slacopy.mjs`(16 断言,红测 7/7)并挂 `verify.sh`;
`selfcheck-feegate` 的两条判据同步从「pin 整串」改成**结构锚定 + 允许附加条件**
(pin 整串会在正当地多挂一道门时假红),红测 5/5 仍能挡住历史漏网形态。

## P-077 · 防线自己需要被防线检验 —— 为 P0 建的门,对那个 P0 是敞开的

2026-08-01,FEAT-WD01 收尾跑 nexion-audit 五层(7 个独立 agent)。机器门 364 全绿、
类型 0 错、走查报的 3 个 P0 已修 —— 审计仍挖出 9 个 P0,其中**多条出在当轮的修复本身上**。

**最该记的三条(都是关于「验证手段」而不是「代码」):**

1. **哨兵对中文失明**。新建的时限哨兵判据用 `/\b\d+\s*(天|days?|ngày)\b/`,
   而 JS 的 `\b` **只认 ASCII** —— 「天」是非词字符、后面的句号也是,两个非词字符之间没有边界。
   实测:走查抓到的原始 P0 文案「标准提现约 30 天。」原样贴回去,哨兵照样全绿;
   en 的 `days` / vi 的 `ngày` 以字母结尾反而正常命中。
   **唯独中文那一面完全不设防,而中文是主人验收看的那一面。**
2. **红测「红了」是靠错的理由**。断言是「占位符在 **且** 没写死时长」两个合取项;
   红测注入把 `{h} 小时` 换成 `30 天`,**同时破坏了两项**,于是因第一项而红。
   「不许写死时长」这个子判据从头到尾没被触发过一次。真正的漏洞形态是
   `30 天({h} 小时内完成审核)` —— 占位符还在、时长也写死了,整条断言 PASS。
3. **哨兵把漏洞焊死当成正确行为**。换绑闸用的「在途状态白名单」漏了 sent / frozen,
   而 selfcheck-rebind 里有一行断言写着「sent / frozen … 判假」—— 哨兵在守护那个漏洞。
   后果:风控冻结中、钱已扣的账户可以在放款前改收款地址。

**归层规则**:

- **红测按合取项拆**:断言有 N 个条件就要有 N 个注入,每个只破坏其中一个、其余保持合法。
  一个注入打红多个条件时,那次红测只能算验了「最先失败的那一项」。
- **红测的注入形态取自真实事故现场**,不要另编一个更容易被抓的;修完必须用原始事故文案再打一次。
- **CJK 文本的判据禁用 `\b`**。要表达「这里不许有数字」,直接写「挖掉占位符后不得出现任何 `\d`」,
  范围收窄到**枚举出来的 key 白名单**,别靠正则在整段里猜边界(顺带消掉 staking 锁仓档位的误伤)。
- **`indexOf` 返回 -1 一律直接判失败**,禁止喂给 `slice`(切出空串 → 正则不命中 → 判 PASS)。
- **结构化文本用真解析**(esbuild transform + import 读对象),不用正则抠 —— 折行 / 单引号 / 模板串 /
  嵌套同名 key / 跨 namespace 取错值,五类坑一次全消。取函数体用**括号配对**,不找字面 `});`。
- **同一个概念只许有一份判据**;白名单与黑名单的失败方向相反(白名单漏一个 = 放行,黑名单漏一个 = 拦住),
  涉及钱一律取保守那一侧。
- **参与建单的每一个输入都要在提交开始时冻成快照**。曾冻了费用与 NEX 余额,唯独漏了金额;
  下单读调用那一刻、写账单是 await 之后重读同一个 ref → 扣款额 ≠ 账单额。
- **没有后台配置面的「配置项」是假的**。为了不写死数字而新增一个 admin 里不存在、
  且没有任何机制按它执行的字段,只是把硬编码换个地方藏,比原来更糟。

**顺带一条工具坑**(本条自己就踩了):往 Bash 里传含反引号的中文长文本,
反引号会被 shell 当命令替换**执行掉**,内容静默消失且 exit 0。写台账 / 注释这类含代码标记的长文本,
一律先把脚本 Write 到 scratchpad 再 node 跑,不走 `node -e` 或 heredoc。

本轮修完:新增/重写机器门 3 个文件,红测 **15/15** 逐项命中对应门(含用原始中文 P0 文案打的那一发)。


## P-078 · 「一半生效」比「完全不生效」更难查 —— 改状态要走这个 store 公认的入口

2026-08-01,给提现失败终态补退款。自己拼了一段 `user.value = { ...user.value, usdtBalance: +(...), earningBuckets: {...} }`,
tsc 绿、哨兵绿、幂等键也写进去了。实景一验:**可提桶加上了 40,总余额纹丝不动**。

根因:account-cloud 的三方合并把余额当**增量计数器**(ADDITIVE_NUMBER_KEYS),
直接写绝对值会在合并时按基线差值算回去;而 earningBuckets 不在那张表里,所以照原样落盘。
同一次赋值里两个字段走了两条不同的合并规则 —— 于是「改了一半」。

**如果只跑机器门,这个 bug 会完整地活下来**:类型对、断言对、幂等对,只有钱不对。

**规则**:

- **改余额 / 状态一律走这个 store 已有的 action**(`creditRewardBucketOnce` / `creditBalance` / `debitBalance`),
  不要在新代码里自己拼 `user.value = {...}`。那些 action 之所以存在,就是因为它们知道合并规则、持久化时机、幂等键该怎么写。
- 确实要新写一条路径时,**先问这个字段在合并表(additive / time-anchor / status-rank)里是哪一类**,
  再问「同一次赋值里的其它字段是不是同一类」。不同类混在一起改,必然一半生效。
- 「幂等键写进去了」≠「这次操作真发生了」。幂等键只证明**走到了那一步**,不证明**结果落地**。
  验收要盯**被改的那个数**,不是盯副产物。
- 这一族只有实景能抓:机器门断言的是「代码长什么样」,而这里代码写得完全正确 —— 错的是它对底层合并规则的假设。

同批还确认了一条正向经验:**退款与置账单失败必须在同一处完成**。
此前两个缺口分开看都像「反正 mock 里走不到」(没有 failed 生产者、也没有退款实现),
合起来就是「钱扣了、单子废了、没人还」。现在两件事写在 `reconcileBills()` 的同一段里,
接后端时不可能只做一半。

---

## P-079 · 「判据失效必红」的门红了,会把它后面整块检查一起吞掉

2026-08-07,在 linked worktree(`.claude/worktrees/<name>/`)里跑 verify,3 条恒红。
根因是几处读兄弟仓写的是**裸相对路径**(`../Nexion-admin-prototype` / `../admin-ops`),
worktree 下解析进了 `.claude/worktrees/` 里,文件恒读不到 —— 是环境假红,不是真漂移。

**真正的教训不在假红本身,在它吞掉的东西。**创世门检查 ⑧ 的写法是
「兄弟仓两文件可读」判完再 `if (可读) { ⑧a…⑧d + 各自红测 }`。第一条红了之后,
后面 7 项**连同它们的红测一起被跳过**——日志上只显示 1 条红,而实际上
这道跨仓一致性门在 worktree 里是**全暗的**。修完 48 pass/1 fail → 56 pass/0 fail,
差额 8 条全是原本被吞的检查。

**规则**:

- **读兄弟仓一律走解析,不写裸相对路径**。`verify.sh:36-44` 早就有 worktree 感知的
  `ADMIN_ROOT`(同级优先 → 落空用 `git rev-parse --git-common-dir` 反推主 checkout 根),
  病灶只是别处没复用它。`selfcheck-genesis-gate.mjs` 现在有同款 `siblingRepo()`。
  **不要抄「`../x` 和 `../../../../x` 双候选」那种写死层级的写法**——层级一变又哑。
- **看到「判据失效」类的红,先问它吞了多少检查**,别只数红的条数。
  一条红后面挂着 7 条静默跳过,和一条红就是一条红,在日志里长得一模一样。
- 判假红还是真漂移:**直接读主 checkout 下那个真文件**,确认要比对的字面量真在里面。
  「文件读不到」和「读到了但内容真漂移」在 grep 日志里无法区分。

**已转**:`verify.sh` platform-anchor 段改走 `$ADMIN_ROOT`;
`selfcheck-genesis-gate.mjs` ⑧ 加 `siblingRepo()` 解析(git 不可用时落回同级路径,读不到照旧判红,fail-closed 未变)。

---

## P-080 · 探针 fail-open:探不到 ≠ 无违例

同一天,给上面那条做双向验证时撞出来的 —— **是双向验证本身抓到的,不是审阅代码看出来的**。

`scripts/tap-feedback-probe.mjs` 把 `BASE_URL` 指向一个死端口,5 条路由全部
`ERR_CONNECTION_REFUSED`,它却打印 **「tap-feedback 无新违例(扫 5 路由 / 0 个 tap 目标)」
并 exit 0**。机制:逐路由的 `try/catch` 把导航失败降级成一行 `!` 警告,
然后 0 个目标 → 0 条违例 → 一路走到隐式 exit 0。空集让全称判据恒真。

更险的是 `--update-ledger`:拿这么一次坏跑去重建基线,会把 11 条存量黄灯**清成空台账**
——门连自己的基线一起丢。

**规则**:

- **凡是「扫了 N 个 / 0 违例」形态的门,都要回头验一次 N=0 时它红不红。**
  这条和 P-079 是同一个病的两面:一个是判据被跳过,一个是判据在跟空集比。
- 覆盖面 witness 要放在**任何写盘/重建基线之前**,否则坏跑会污染基线。
- 双向验证不是走过场:这个洞存在多久没人知道,是「把 BASE_URL 指向死端口看它红不红」
  这一步逼出来的。**只验绿的那一面,等于没验。**

**已转**:`tap-feedback-probe.mjs` 加覆盖面 witness
(任一路由探测失败 或 总目标数 = 0 → 判红 exit 1),置于 `--update-ledger` 分支之前。
同族的 `dom-qa` / `invisible-fill-scan` 实测本来就是非零退出,`empty-state-probe` 亦然。

### P-057 [验证方法·高] 红测/走查的环境不冷启不独占 → 伪 bug 吃掉 40 分钟 + A/B 误判

- **症状**(2026-08-07 守卫重构):走查结果与磁盘代码矛盾(守卫行为忽对忽错、
  同条件两次结果不同),一度得出「我的 diff 引入回归」的错误 A/B 判决,受控重放后推翻。
- **根因**(三个变体,同族于「dev server 供旧模块图」):
  1. 对 `App.vue` 的「改了再还原」红测探针,每次写盘都 HMR 进正开着的页面 → 模块图搅浑;
  2. 僵尸旧标签页(旧代码实例)与被测页共享 localStorage,定时器还在写;
  3. `localStorage.clear()` + 跳转 ≠ 白纸——濒死页的计时器在 clear 后、卸载前把旧状态写回。
- **对策**:🔴 红测前停 dev server(或对不被供应的副本做);🔴 走查前关光同源旁页 +
  冷重启 dev;🔴 状态手术在静默态做;🔴 **行为敏感改动先在旧代码上录基线**,
  A/B 是第一步不是最后的破案工具,两侧测量条件必须对等。
- **已转**:memory `feedback-dev-server-stale-module-graph` 族条目扩容(四条新规)。

### P-058 [框架假设·待真机验证] H5 的 onShow 唯一触发源是 visibilitychange —— bfcache 恢复场景未验证

- **来源**:2026-08-07 守卫增量独立审查 Finding D(读框架源码证实:uni-h5 只挂
  visibilitychange 一根线,无 pageshow/pagehide 兜底;onShow 在 H5 上没有第二条触发路径)。
- **影响面**:**全部** onShow 驱动的生命周期(采矿 tick / 结算 / 各轮询 / 守卫自愈环)——
  若某浏览器/webview 在 bfcache 恢复时不补发 visibilitychange,回前台后所有循环不重启,
  整个应用静止(守卫只是其中之一,非它独有)。属**既有全局假设**,守卫修复让它多了一个依赖方。
- **待验证**:真机/多浏览器矩阵走「整页跳出 → 系统返回」路径(不是切标签页/切 App——那些必触发)。
  旁支:reLaunch 对在途同目标导航的并发语义未查到源码,慢设备上 1s 重试理论存在活锁可能,一并真机验。
- **另记**(同审查 (a)):白名单前缀集合与 quest 路由集合互斥是无哨兵看守的隐性前提,
  谁往白名单里加 quest 路由,守卫返回 false 的语义就悄悄变了。

---

## P-081 · 安全装置被归进它自己要管的那组开关里

**症状**(2026-08-07,守卫存活性族**第三次**复发):全站唯一的周期性权限守卫,在若干页面上
整个生命周期都不启动 —— 未登录的人只用页面自带链接就能走进提现页并停留、操作;已登录的人
中途路过一次静态评审页,守卫当场失效,之后在别的标签退出登录也踢不掉他。

**为什么前两轮都没修掉**:R1 修「守卫看错路由」(读取口归一)、R2 修「冷启动那一枪被吞」
(onShow 无条件启动)——**两轮修的都是「武装侧」**。没人动「解除武装侧」,因为
`stopQuestWatch()` 就写在 `stopBusinessLoops()` 里,看起来天经地义。

**根因(第一性原理)**:守卫是**安全装置**,却被归类成**业务循环**。于是每一处
「本页不该跑业务」的判断都会顺手把它一起关掉 —— 而恰恰是这些页面最需要它:它们正是
未授权者能停留、并借以跳进业务页的跳板。叠加 H5 的 App 级 `onShow` 只在整页加载 /
标签页重新可见时触发、**不随应用内跳转触发**,关掉就没有任何重新武装的路径。

**同根因的第二条腿**:落地页被当成本次页面加载的**永久状态**。`scheduleAccountSessionBootstrap`
在评审页落地时直接 return,而认领是一次性的 → 该标签**永无 sessionId** →
`session.validate()` 首行「没有 sessionId 就算 active」→ 跨标签登出与运营吊销永远踢不掉它,
哪怕守卫活着、哪怕早已走到业务页。

**规则**:

- 🔴 **给任何「批量停止」函数划成员时,先问:这里面有没有安全装置?** 安全装置不跟业务共用开关,
  它的开关只跟「进程/前台是否存在」绑定(本例:`onShow` 起、`onHide` 停,一对一)。
- 🔴 **冷启动落地页不决定本次加载的余生。** 凡是「落地在 X 就跳过 Y」的一次性决定,都要问
  「用户走开之后 Y 还补不补?」——不补就是永久跳过。
- 🔴 **同型第三次复发 = 停下来重画结构,不许再打第三个补丁。** 前两轮都在同一侧修,
  说明大家看的是同一张不完整的图。

**已转**:`scripts/selfcheck-guard-liveness.mjs`(挂 `verify.sh`)——守 4 条不变量
(守卫不在业务停止组里 / 唯一停点在 onHide / onShow 无条件武装 / 守卫每拍补会话认领),
每次运行对内存副本做 4 组缺陷注入自证判据还活着(判据死了也判红)。已双向红测:
撤回任一处修复,对应那条判据判红并点名。

**追记(独立审计 2026-08-07,同轮)**:这一族其实有**三条腿**,y1 只收了前两条。

第三条腿 = 「谁都能停,只有一处能起」的不对称:五个业务循环
(`startTick / startArrivalPoll / startTrialPoll / startOrderPoll / startMilestonePoll`)
**全站唯一起点在 `onShow` 里**,而 `stopBusinessLoops()` 有 8 个调用点。
路过一次静态评审页,到账推进/账单结算/退款/里程碑/试用/订单在本次页面加载内**全部永久停摆**。
**未修,详情与建议改法见 `docs/audit/2026-08-07-probe-and-guard-audit.md`「第三条腿」段。**

**再追一条方法论**:本轮为这一族焊的第一版哨兵,被独立审计用 **7 种改法全部绕过**
(挪进另一个失败分支 / 包一层壳函数 / 内联 clearInterval / 一行式 return / 裹进永假条件 /
挪到短路之后 / 把节拍稀释到 30 分钟),而它照报 8 pass / 0 fail。
根因:**判据形态是「某个函数体里有没有这个字符串」= 形状判据**,搬个地方就绕过去了。
🔴 **规则:守「只许谁做某件事」的不变量,判据要写成「全文件扫谁在做,集合必须恰好等于允许集」,
不要写成「在某个地方查有没有」。** 前者对搬家/包壳天然免疫,后者是打地鼠。
🔴 **同一族出过 N 种形状之后,形状判据已经不够了,必须补一道行为门**
(`scripts/guard-liveness-runtime.mjs`:真浏览器跑那条越权路径,代码怎么重构都拦得住)。

---

## P-082 有真信号时,替身判据一律不许参与裁决(否则「修一处」只修好三分之一)

**现场(包 z7,2026-08-11/12)**:账号快照三路合并对提现单的胜负,判据只有 `WITHDRAWAL_STATUS_RANK`
(状态档位)。档位是「谁更新」的**替身** —— 而 `frozen` 排在最高档却是**在途**态,于是:

- `frozen → refunded / tx-failed`(同档)平局丢弃 → 冻结单被处置的结论进不来 →
  退款永不触发、单槽永久占用、换绑与下一笔提现被永久拦死;
- 状态没变、只改了终态原因 / 可重试 → 平局丢弃 → **新加的字段在运行时零生效**。

R1 我给 `mirroredAt`(回读时刻)加了一个**平局分支**:`c > a || (c === a && ct > at)`。
R2 探针实跑证明只修好 1/3 —— `frozen → processing / sent / confirmed` 三条**降档**边仍全被丢弃
(后台核查通过、放行回主链的每一次都进不来,坏结局反而走得通),
反向一份陈旧的高档内存行还能把磁盘上更新的 `confirmed` 顶回 `frozen`。

**根因**:我把真信号当成**替身制度内部的裁决补丁**,主判据仍是替身。
于是只有「替身打平」这一条路径用得上真信号,「替身排序说反了」的两条路径原样带病。

🔴 **规则**:引入真信号(时间戳 / 版本号 / 序列号)时,**它必须取代替身当主判据**,
替身只在真信号两侧都缺席时兜底。写成 `if (有真信号) { 按真信号裁决; return } 否则按替身`,
**不要**写成 `替身判据 || (替身打平 && 真信号)`。后者永远只覆盖三分之一的方向。

**判据怎么验**:对 from×to 做**矩阵**,不要只测「应该赢」的那几格。本仓 `spec4-account-cloud-merge-check.mjs`
的提现段此前四格全落在平局侧,`c > a` 与 `c < a` 两条分支一次都没执行过,而门的失败文案
写着「冻结单的每一条出边」—— **会误报安全的门比没有门更坏**。现已补齐两个方向共七格。

## P-083 抛不抛,判据是「这个字段驱动什么」,不是「类型对不对」

**现场(包 z7)**:提现状态回读的解析器,我按「类型不合法就抛协议错」写。独立审计指出:
抛出去的异常被调用方 `.catch(() => null)` 吞掉 → **整张单据镜像失败** → 这一单永久停在
「处理中」,换绑入口与下一笔提现连带永久拦死 —— 而代价只是**一句话没显示**。
`confirmedAt: 0`(服务端最常见的「未设置」哨兵值)也在这条路上,一个哨兵值就能锁死一张单。
**这正是本包立项要消灭的缺陷,我用「严格」的名义又造了一遍。**

🔴 **规则**:同一个报文里的字段要**分档**,不能一刀切:

| 字段驱动什么 | 认不出时 |
|---|---|
| 钱 / 状态机 / 身份(状态码、单号) | **必抛**,fail-closed。猜一个等于拿钱赌 |
| 只驱动「显示哪一句话」(时刻、原因、标记) | **降级成「没给」,绝不抛**。抛 = 用锁死一张单换不显示错一句话 |

配套:**开放增长的码表**(运营随时会加新码)不认识的**字符串**码回落兜底档而不抛 ——
抛的话后台加一个码就打死全体老客户端;漂移的**预防**放机器门(跨仓逐值 parity),不放运行期异常。
但非字符串一律当没给,别用 `String(值)` 兜底 —— 那会把 `{}` 编成真实原因码、
把 `["RISK_HIT"]` 当成合法码显示给用户。

## P-084 门读「另一个工作树的文件」时,合并顺序会改变它的判定

**现场(2026-08-12,包 z7 R3 审计)**:`selfcheck-withdraw-nex-refund.mjs`(z6/z8 的门)有两条分支 ——
本仓没有状态回查面时,去读**隔壁 worktree** `../z7-withdraw-status/` 的文件打 INFO;
本仓有回查面时,用 `/nexRefunded/.test(apiSrc.split(/interface WithdrawalStatusSnapshot|parseStatusSnapshot/)[1])` 判红。

合并之后走的是第二条分支,而那个 `split()` 会把**整个文件下半截**(含 `parseSubmission` 里的
`rawNexRefunded`)算进「回查面」→ 回查契约其实**不带**该字段,门照报 PASS。
R3 用 `git merge-tree` 实跑合并产物证实:`gate11PASS=true`,而合并后的回查契约仍是 5 字段。

🔴 **两条规则**:
1. **门的判定不该随「哪个包先合」而变**。跨 worktree 读文件的分支只能打 INFO,
   真判据必须只看**本仓最终状态**;否则同一份代码在合并前后得到相反结论,而没人会去复跑。
2. **「字面量在不在某段文本里」不是判据**(同 P-082 家族)。这里要钉的因果是
   「回查响应契约**带不带**这个字段」——判据应解析那个 interface 的成员,不是对整文件做 split。

**排查同族**:`grep -rn '"\.\."' scripts/*.mjs` 找所有跨工作树取材的门,
逐个问「合并后这条分支还走吗?换一条分支后判据还成立吗?」

## P-085 shell 的工作目录会跨命令留存 —— 一个 `cd` 能让后面的写落进别人的分支

**现场(2026-08-12,同一轮收尾)**:为核实隔壁包的门,我 `cd` 进了主 checkout;
几步之后用相对路径 `cat >> docs/PORT-PITFALLS.md` 追加本条教训 ——
**它落进了主 checkout**,而主 checkout 此刻停在**另一个会话的分支** `pkg/z8-refund-ts`
且带着对方未提交的改动。等于把我的东西写进了别人正在改的工作树。
(已当场 `git diff` 发现并逐字撤回,对方 WIP 未受影响。)

🔴 **规则**:多工作副本并存时,**写操作一律用绝对路径**,不依赖当前工作目录;
读操作可以 `cd`,但**任何一次写之前先确认 `pwd` 与分支**。
判据:`git branch --show-current` 不是我这个包的分支 → 这次写就是错的。
同族:[[feedback_commit_split_interleaved_worktree]](并发会话会切走 HEAD)。
## P-082 · 禁用了原生元素,就等于接管了它白送的语义

**症状**(2026-08-12,由包 z2 三轮审计顺带发现):全仓 151 个自造控件键盘不可达 ——
108 个写了 `role="button" tabindex="0"` 却没有任何 keydown,另外 43 个连 tabindex 都没写。
浏览器实景复核:tabindex 确实落到 DOM、`focus()` 确实成功,也就是**焦点能停上去、按 Enter
没反应** —— 最坏的组合(读屏念出「按钮」,键盘用户按了什么都不发生)。WCAG 2.1.1 不达标。

**根因(第一性原理)**:原生 `<button>` 白送键盘行为,没人给 `<button>` 写 keydown。本仓因
uni 默认 chrome 过重而禁用原生 `<button>`(P-036),**丢掉了那份免费语义却没有补上替代层**,
于是每个自造按钮只能各自手搓。这不是 151 个独立 bug,是一个架构缺口的 151 个症状 ——
手搓漏改率实测 40%,而且未来每个新控件都要重新记得写一遍。

🔴 **规则:禁用一个原生元素时,先列清楚它免费提供了什么(键盘、焦点、语义、表单参与),
逐条决定由哪一层补上。** 只换外观不补语义,等于把平台的活摊派给每一个调用点。

**修法**:补平台层 `src/lib/a11y-activate.ts` —— 声明 `role` + `tabindex` 即得到键盘激活,
和原生 `<button>` 的工作方式一致。零调用点改动,151 处与未来所有新控件一并覆盖。

**门**:`scripts/a11y-activate-gate.mjs`,判据遍历「全仓每一个模板元素」这个开放集合,
检测失败特征(半个承诺 / 缺 `.prevent` / 平台层缺失 / 悬空 aria 引用),**不枚举控件名**。
verify.sh 里原有 4 条具名 keyboard-accessible 哨兵守住 4 个控件时,问题面是 151 个 ——
枚举式判据的覆盖率天花板就是这个比例,已就地注明不要再往那张清单里加。

**🔴 附带:同一个坑第二次踩 —— 子串哨兵不剥注释**(前案见「绑卡审计教训」:子串哨兵必剥注释
+ 双向红测)。本轮 D 判据写成 `/installKeyboardActivation\(\)/`,红测把那行注释掉之后
**门照样绿**(字符串还在文件里)。上次修在 memory(心智层),挡不住这次 —— 写门时不会逐条
回忆 memory,**同层再修一次等于没修**。这次落到机器层:门在判定平台层是否还在之前**先剥注释**(v2 重写后该逻辑内联在 D 判据段,
不再是独立函数——文档一度写成 `stripCode()`,与代码不符,已按门的实际输出回校),
且 D 的真正依托改成行为门(`a11y-activate-behavior.test.mjs`,真按 Enter 看有没有 click),
形状判据只留作不启动测试进程的快速失败。
🔴 **规则:新写的哨兵必须同轮配红测,且红测要逐条隔离注入**(一次注入多条时,只要有一条
能让门变红,其余几条完全失效也看不出来)。本轮 8 条判据逐条注入,当场抓出 2 条是死的。

**🔴🔴 同族第三次,而且是在一张主题正是批评它的卡上 —— 「字符串在不在」不能代替「它是否生效」**

本轮我把新门挂进两条链后自查了一句:`p.scripts.verify.includes("test:a11y-activate")` → true,
于是报告「两条链都登记生效」。独立审计实测:`npm run verify` 那条链**在更早的一步就断了** ——
新建的 `a11y-activate-behavior.test.mjs` 没登记进 `run-contract-suite.mjs` 的 REGISTRY,
而 `test:contracts` 排在 `test:a11y-activate` **之前**,于是三道门在那条链里**一次都没执行过**。
更讽刺的是,那道登记门的报错文案里就写着「新建即孤儿的根因」——教训早已焊成机器门,我照样踩进去。

三次同族(子串哨兵不剥注释 → 门的 role 判据只认静态字面量 → 链登记只查字符串在不在),
共同根因是**同一个思维习惯**:用「文本里有没有这个形状」代替「它在运行时是否真的成立」。
🔴 **规则:凡是要断言「某个门/某条链/某个开关生效了」,判据必须是行为的 —— 跑它,看它的
退出码与汇总行;或者破坏它,看它是否变红。永远不要用 grep/includes 断言「生效」。**

**🔴 附带二:视觉门与无障碍要求正面冲突(同族第二次,前案是"注释外不许有中文" vs "必须有中文")**

给弹层加了「打开后焦点自动移入第一个控件」之后,`zero-border-gate` 报出一条新增违例:
`.vcs-close` 是「有填充 + 四边描边」的容器 —— 而那个类的样式里**根本没写过 border**。
根因:该门把 `outline` 计入描边(judge 里 ring/outline 等同四面环),而浏览器给**当前聚焦
元素**画的焦点环走的正是 outline;焦点可见又恰恰是 WCAG 2.4.7 的硬要求。
两道门方向相反 → 任何源码状态都不可能同时绿。
修法:视觉门扫描前先 `blur()`,并在代码里写明边界——**焦点态不属于"设计描边"**。
🔴 **规则:新增任何"必须有 X"的无障碍要求前,先扫「谁在断言不许有 X」**
(`grep -rn "<要加的形态>" scripts/`),反向亦然。这与前案是同一条规则的两个方向。

**🔴 附带三:给元素补上正确身份,会把它送进**别的门**的判定域 —— 新冒出的违例未必是你引入的**

包 k2 给钱路径 88 处可点区域补 `role="button" tabindex="0"` 之后,`dom-qa` 报出一条新的
tap-target 违例(商品卡「以旧换新」链接 49×17 < 44pt)。查判据发现:那道门只管
**带 button/link/tab 身份**的元素(`dom-qa.mjs:106`),而该链接此前是裸 `<text @click>`,
**压根不在它的判定域内** —— 热区不足是既有问题,补身份只是让它第一次被看见。

🔴 **判据:门报出新违例时,先查那道门的判定域是什么、被判元素是怎么进去的。**
「我改完就红了」有两种截然不同的解释 —— ① 我引入了缺陷;② 我让一个既有缺陷变得可见。
两者的处置完全相反:前者该回滚或修改动,后者该独立评估那个既有问题(修它、或写明理由豁免),
**绝不能为了让门变绿而撤掉正确的改动**。本轮判为合法例外并把四条理由写进 DOM-QA 台账,
后人重估时看得到来龙去脉。
> 推论:一次「补语义」的改动,会顺带提高全仓被其它质量门覆盖的面积。这是收益不是负担,
> 但要预留出评估这些新可见问题的时间,别把它当成返工。
本轮据此把 D 判据的依托从子串改成行为门(真按 Enter 看有没有 click),并给每条判据配了
逐条隔离的注入红测(18 条),另加「可见性断言」类型——故意不阻断的判据要断的是「看得见」,
拿阻断断言去测它只会得到一条永远失败的红测。

## P-086 双向分叉合并:git 不提示的那一半才是真危险

**现象(2026-08-12 两条开发线合流实测)**:本地主线积累 41 笔、远端 19 笔,在同一祖先岔开。
git 报了 17 个文件约 30 处冲突——那部分反而安全,因为**它逼你逐处做决定**。
真正出事的是**另外 9 处 git 一声不吭就自动采纳的地方**:一处代码只有一边动过,
git 直接取那一边,不问你另一边的上下文是否还成立。其中 3 处直接关系到钱:

1. **退款被关死而扣款还活着** —— A 侧加了「服务端模式不本地退款」的闸,B 侧则让
   「本地扣款」只在沙箱轨让位。两边各自都对,合起来就是:服务端每拒一单,
   用户的钱被扣走且永不退回。
2. **同一笔提现双扣** —— 沙箱轨的建单响应已带扣完的钱包并整体重投影,页面又扣一次。
3. **对账/退款的驱动整条被关** —— 在 store 层修好的退款,调用方根本跑不到。

另外 6 处是门被悄悄削弱:判据从「按磁盘真相自动扫」退回「手写清单」、
空表单弹卡的修复被冲掉、占位哨兵被还原成「在合法域内的 0」、
测试桩里新开关恒为真导致整族门测的不是它以为的那一档……

**Why**:冲突标记只标「两边都改了同一行」。而**语义冲突不需要文本重叠**——
一边改判据、另一边改被判对象;一边加闸、另一边改闸的适用范围。这类合并后
类型检查全过、门也可能全绿(因为门自己就是被削弱的那一方)。

**How to apply**:
1. 🔴 合并后**不要只看冲突清单**。至少对「钱 / 状态机 / 门脚本」三类文件跑一遍
   `git diff <base>...<theirs>` 与 `git diff <base>...<ours>` 对照,问一句
   「对面这处改动,在我这边的新上下文里还成立吗」。
2. 🔴 **成对的东西要一起看**:扣款↔退款、加闸↔闸的适用范围、判据↔被判对象、
   生产者↔台账。本次三处资金缺陷全是「成对的一半被改、另一半没跟上」。
3. 🔴 合并后必须**跑全链**,而且要读懂每一条红:本次 15 条红全部出自同一道门,
   根因是「门的前提(本地能落盘)被新架构取消了」—— 那种情况要改门的前提,
   不是放宽断言,更不是改产品代码去迁就旧门。
4. 判据里的行尾一律 `\r?`(本仓 CRLF):本次一道红测的注入因为正则写死 `\n`
   永不命中,而它正确地把「注入没生效」判成失败,于是整条链崩在那里——
   这是好设计,但也说明**红测自己也会过期**。
## P-087 · verify 对着「另一棵树」跑,还一路报 PASS —— 假红门批量制造机

**踩坑(2026-08-11,独立审计 v4 报「37-38 条既有红门」追根)**

审计结论是:`verify.sh` 末行 `[ $fail -eq 0 ]`,但链上有 37-38 条既有失败(两次跑还分别是 37 / 38),
所以退出码恒 1、新门由 PASS 翻 FAIL 不可观测。回源实测后,**这个前提本身不成立**:

| 跑法 | 靶子 | 结果 |
|---|---|---|
| A | `BASE_URL` 默认 5173 = **主 checkout** 的 server,且是 remote 模式 | 408 pass / **10 fail** |
| B / B2 | 本 worktree + `VITE_NEXGRID_API_MODE=mock`,显式传 `BASE_URL` | 418 pass / **0 fail**(两次完全一致) |

**根因**:`BASE_URL` 默认 `http://localhost:5173`,而 worktree 里 5173 上跑的是主 checkout 的 dev server。
`[2]` 段那道「认工程」的判据用 `vi.ts` 在不在,只能分辨「是不是本产品」(vs janus / CC),
**分辨不了「是不是本 checkout」——每棵 worktree 都有 vi.ts**。于是 13 道 `BASE_URL` 运行时门
整体验了另一棵树上的另一个分支,还报 PASS;剩下那些跨不过 remote 模式的就变成「既有红门」。
A 里那 10 条红(`SESSION_EXPIRED` / `API_ENVELOPE_INVALID` / 「OTP 步骤没出现」)全是 remote 模式的症状,
不是代码回归。所谓「不稳定的 37 / 38」也是同一个假象:换成正确靶子后两次跑一模一样。

**为什么以前没抓到**:`CLAUDE.md` 当时写的是「dev server 必须在 5173 跑」——
这条指令在 worktree 里的字面执行结果,就是「把 verify 指向主 checkout」。文档本身在制造这个坑。

**修法(三层都落了)**

1. **机器门** `[2.6] 树身份 preflight`:`VITE_ROOT_DIR`(`@dcloudio/vite-plugin-uni` 注入,就是 vite 的 root)
   与 `PROJECT_DIR` 规范化后比对,不等即红。这个值 `[2.5]` 早就拉进 `served_env_head` 了,白捡。
   🔴 **探不到也红**(P-080):uni 哪天不发这个键,门要红给人看,不能静默变空门。
   红测 5 例:本树 mock(绿)/ 别的树 remote(红)/ **别的树但 mock(红 —— 这一例证明老的 API-mode 门抓不到)**/
   mock 但没 `VITE_ROOT_DIR`(红)/ 没 server(红)。
2. **文档** `CLAUDE.md`:删掉「必须在 5173 跑」,改成「先确认靶子是本树 + mock」并给出 worktree 的换端口跑法。
3. **心智**:🔴 **判「门红了」之前先判「验的是不是本树」**。同型见 memory「认树别靠 HTTP 200,靠差集指纹」。

**连带修掉的两件事**

- **退出码送不到人手里**:`.claude/settings.json` 直接挂 `bash scripts/verify.sh all` 当 Stop hook,
  而 hook 语义是 exit 2 才阻断且只回喂 **stderr**,verify 只会给 0/1 且 158 处 FAIL 全打 **stdout**
  → 红了既拦不住也说不出话。改法照抄同工作区 `Nexion-admin-prototype` 早就写对的
  `.claude/hooks/verify-on-stop.mjs`(捕获 → stderr → exit 2),并且**环境不满足(靶子不对 / 没 server)
  只警告不阻断**,免得没起 server 的机器每回合被顶回去。
- **管道吞退出码**(WF-7 2026-07-09 / WF-10 2026-08-06,同型第 2 次,admin-ops 已焊、本仓一直挂账):
  `verify.sh` 末尾 `trap EXIT` 原子写 `.verify-exit.code`,**外部判定读文件不读管道**。
  `trap` 覆盖 `set -u` 半路暴毙那条路径 —— 那条路连 result 行都不会打,只有哨兵文件还能说真话。
- **SKIP 不进账**:6 处 SKIP 以前是裸 `printf`,两个计数器都不碰,「0 fail」既可能是全跑过了也可能是
  少跑了 6 道。现在 `skipped()` 计数,末行改成 `[ $fail -eq 0 ] && [ $skip -eq 0 ]`。

**方法论**:🔴 **「一堆既有红门」先当环境假象查一遍再当技术债**。
先问「靶子对不对」,再问「门对不对」——顺序反了,就会去给 37 条假红建「已知失败台账」,
把环境噪声永久焊成「已知正常」。同仓已有前车之鉴:
`docs/audit/2026-08-07-probe-and-guard-audit.md:600`(dom-qa 的 `--update-ledger` 对着坏 origin 收编一次,
从此对「探不到」全盲)。

**收尾(主人 2026-08-11 拍板 A)**:`.claude/hooks/` + `.claude/settings.json` 放开入库,
让质量门本身跟着代码走版本 —— 原来 6 棵树各存一份、改一处要手拷 5 次,靠手动同步的守卫
迟早漂移失效。gitignore 写法要注意:必须写 `.claude/*` 而不是 `.claude/`,父目录被整体忽略时
git 不会递归进去、底下的 `!` 豁免会**静默失效**(经典陷阱)。已实测 `git add -A --dry-run`:
只多进 2 个文件,主 checkout 底下那 9 棵 worktree 和 `settings.local.json` 一个没漏进来。
连带语义变化:这道门从「装饰品」变成**真会拦人**的门 —— 但只在「靶子是本树 mock server」时拦;
靶子不对(平时 remote 模式)只警告不拦,不会把没起 server 的人每回合顶回去。

**追记(合并主线时,2026-08-11 同日)**:本条焊门时本树落后主线 10 个提交,
主线 `ac25eab` 已**独立加过同一道树身份判据**(z1 R2 对抗审计 P1-24 提出)——
两处独立发现同一个坑,说明这个坑是结构性的、不是偶然。

但主线那版在 Windows + Git Bash 下**恒红**(用 `origin/UniApp` 原字节实测复现,不是推断):

    served_root = D:/WORKS/...   ← VITE_ROOT_DIR,uni 注入的盘符写法
    expect_root = /d/WORKS/...   ← PROJECT_DIR=$(pwd),Git Bash / MSYS 写法

两边只转了反斜杠再各自小写,**盘符写法没抹平 → 永不相等 → 靶子完全正确也判「别的工作树」**。
配套自启壳 `run-legacy-suite.mjs` 同样 `spawnSync("bash", …)`、`PROJECT_DIR` 同样来自 `pwd`,绕不开。

🔴 **这条本身就是本 P-082 的活体样本**:一道恒红的门 = 退出码恒 1 = 「新门翻红不可观测」。
修「验错树」的门,自己变成了制造恒红的门。**教训:凡是比对路径的判据,必须先问
「两边是不是同一种路径写法」** —— Windows 上至少有三种(`D:\`、`D:/`、`/d/`),
Git Bash 的 `pwd` 和 Windows 程序注入的环境变量天然属于不同种。判据写完必须**正向红测**
(靶子正确时判绿),只测「错靶子判红」会漏掉恒红——**错的门在错靶子下同样判红,测不出来**。

**关于 `_check/` 的口径(更正我先前的判断)**:我曾据「全仓只有写入、零读取」推断
`scripts/.baseline/_check/` 整个不该入库、建议把 `chk.png` / `w.png` 移出跟踪。
主线 `5f77966` 已就同一问题表态,口径是:**只忽略每轮重生成的临时对照图
(`h5-runtime-home.png` / `sticky-frost.png`),`chk.png` / `w.png` 是有意跟踪的参考图**。
「没有代码读它」不等于「没用」——它可以是人工目视对照的基准。**以主线口径为准,我先前的建议作废。**
## P-088 · 幂等键**每次点击现铸** = 幂等键在它唯一该管的场景里从不生效

独立审计 2026-08-11 抓出的 P0。`wallet-withdraw.vue` 的提现幂等键写在 `handleSubmit` 里现铸
(`withdrawal:{account}:{Date.now()}:{random}`),于是:超时 → 服务端已建单但回执丢了 →
客户端 catch 把**所有**异常一律报成「费率已更新,请重试」→ 用户重试 → **新键 → 同一笔钱两张单**。
幂等键存在的唯一场景就是这个场景,而它在这个场景里必然换新值。

**这一族有四条腿,只焊一条都不成立**:

1. **键要稳** —— 同一笔意图的重试必须复用同一个键;
2. **body 要一起冻** —— 本仓服务端契约(`docs/specs/PAY-…生产架构_v2.0-DRAFT.md` §幂等)是
   「同 key + 同 body 返回原结果;**同 key + 异 body 返回 409 并记安全事件**」。只稳键不冻 body,
   费率一发布 `policyVersion` 就变 → 要么撞 409,要么(把 body 塞进指纹)换新键 → 又是两张单;
3. **要落盘,不能只在内存** —— 用户面对卡住的请求最常做的三件事是杀 App / 刷页面 / 开第二个标签页,
   内存 Map 在这三件事下全丢。H5 的 uni storage 就是 localStorage,顺带把「两个标签页各铸一个键」
   一起关掉(同型待办见下方「同型未收」);
4. **失败要按结果分层** —— 只有「服务端完整应答并拒绝」(business / auth / 400·403·422…)才算定局、
   才可以退役键;**408 / 409 / 425 / 429 都是 4xx 但语义是「我可能已经收到了」**,与超时 / 断网 /
   5xx / 应答解析不了同属「结果未知」,键必须原样留着。特别是**应答解析失败**:它抛在服务端
   已经 200 之后,单据反而**一定存在**。

**规则**:

- 🔴 **给动钱的写请求配幂等键时,先问「重试路径上这个键还是不是同一个」**——答不上来就等于没配。
- 🔴 **键与它那一次的 body 是一个原子**:冻一半 = 在「换新键建两张单」和「撞 409 安全事件」之间二选一。
- 🔴 **「结果未知」不许说成「请重试」**。钱路径上的失败文案第一句必须交代**钱的下落**;
  推不确定的用户去重试,就是亲手制造第二笔出款。
- 🔴 **写不进落盘就拒发(fail closed)**:存不下重放凭据 = 这一笔一旦超时就再也认不回来。
  宁可这笔发不出去(钱一分没动、原因和下一步都给了)。

**已转**:`scripts/selfcheck-withdraw-freeze.mjs` 新增 4 条判据(键不在提交函数里现铸 /
快照优先取落盘的冻结件 / 落盘在请求发出前且失败即拒发 / 失败按结果分层且未知时不刷费率不喊重试)
+ `scripts/withdraw-idempotency-contract.test.mjs`(定局判据逐 kind 固定靶 · 落盘往返与半个 body
必须当没有 · 「超时重放同键同 body、定局后才换新键」四组时序靶)。4 条新判据已逐条变异红测
(改坏源码必红,文件逐字节还原)。

**同型未收(独立审计同轮扫全仓 25 个远端幂等调用点)**:`genesis.ts:418/479/519/544`、
`wallet-exchange.vue:419/223`、`account-api.ts:15-19` 仍是「每次调用现铸」,其中创世购买与
NEX↔USDT 兑换是动钱的;`checkout.vue:619-620` 在「上一次结果未知」时也会退役键。
**本轮只收提现一条链**(主人指定范围),其余待主人拍板。哨兵现状:`selfcheck-claim-idempotency`
守的是本地记账 `ref`,**不看 HTTP 幂等键**,这一族目前没有全仓机器门。
## P-089 · 拿路径字符串当判据:同一个目录有四种写法,门在「官方链」绿、在「文档教的跑法」必红

`verify.sh` 的 [2.5] 树身份门比 `VITE_ROOT_DIR`(server 报的)和 `PROJECT_DIR`(套件所在)
是否相等,只把反斜杠换成了斜杠。而同一个目录在本仓有**四种写法**:
`D:\WORKS\x`(Node 的 `process.cwd()` 序进 vite env JSON)· `D:/WORKS/x`(Node 起的 bash 里 pwd)·
`/d/WORKS/x`(Git Bash 的 pwd)· `/mnt/d/WORKS/x`(WSL 的 pwd)。于是:

- `npm run verify` → `run-legacy-suite.mjs` 用 Node spawn bash,两边都是 `D:/x` → **恰好判等,门是绿的**;
- CLAUDE.md 让人直接敲的 `bash scripts/verify.sh`(Git Bash)→ `D:/x` vs `/d/x` **永不相等**,
  门**必红**,还红成「server 服的是别的工作树」这种指错方向的结论。

**偏偏后者才是这道门唯一有意义的用法** —— 前者由自启壳自起自验,树身份天然相等,
判据是同义反复。也就是说:门在它不管用的地方绿着,在它该管用的地方一直红着。

**规则**:

- **两个路径要判等,先归一形态再比**(反斜杠/正斜杠 · 盘符 `D:/x` ↔ `/d/x` ↔ `/mnt/d/x` ·
  大小写 · 末尾斜杠),别拿原样字符串比。只 `tr A-Z a-z` 不叫归一。
- **一道门如果在某条常用跑法上「一直是红的」,那不是已知技术债,是判据坏了**。
  门一旦落下「公认的正常红」,人就学会了跳过它,它就不再是门(与 P-079 同族:
  一个是判据被跳过,一个是判据被人跳过)。
- **判红之后要问「哪条路径在跑它」**:这条洞能长期存在,是因为官方链绿、只有手跑红,
  而手跑的人默认「worktree 里本来就这样」。

**已转**:`verify.sh` [2.5] 加 `norm_root()` 归一 + **常驻双向红测**
(四种写法判等 / 嵌套工作树·异盘符判不等),自检不过则树身份判断不许发绿灯。
已实测双向:同树四种写法全 PASS;真指到 sibling worktree(`z2-withdraw-cap`)
与父树(`Nexion-uniapp`)时照旧 FAIL。

## P-090 红测报「没红」时,先证变异生效,再怀疑门

**现场(2026-08-12 收口会话,一天之内两次)**:

① 给树身份归一化加了六格双向自检后做红测。「归不拢」方向如期判红;
「归过头」方向(不同工作树被折成相等 —— 比恒红危险得多)显示**没红**。
按字面读,这道自检对更危险的那个方向是瞎的。
查下去:**变异根本没落地** —— 用 `node -e` 写 sed 表达式时 shell 吃掉一层反斜杠,
`s|^\([a-z]\)/.*|\1|` 变成 `s|^([a-z])/.*||`,一个永不匹配的空操作。
改用 Edit 工具直接改文件重做,确认 `/d/works/x` 与 `/d/works/x/.claude/worktrees/w1`
真的都被折成 `d` 之后,自检如期判红。

② 给提现分诊建重放感知门时,一个变异(把 409 移出 `UNSETTLED_4XX`)显示 0 红。
这次不是变异没落地,而是**变异对本门的契约无效**:409 在判定里先被
`isIdempotencyConflict` 认掉,去留结论不变。据实换了打得中的变异(给 409 档也加
`!isReplay`),当场判红。

🔴 **规则**:红测出现「没红」时,**先证明这三件事,再下结论**:
1. **变异真的写进文件了**(回源 grep / 打印被改行,不是看脚本报告「已替换」);
2. **变异真的改变了行为**(把被改的函数直接跑一遍,看输出确实不同);
3. **这个变异打在本门的契约上**(它守的不变量真的被破坏了,而不是破坏了一个它本来就不守的东西)。

三条都成立还不红,才是门的洞。

**为什么这条值钱**:「没红」的字面读法是「门是瞎的」,而顺着这个结论走,
下一步就是**去改一道本来好好的门** —— 把一道有效的门改成无效的,或者更糟,
把判据放宽到「这次能红」为止。①里若信了那个「没红」,我会去动一道刚刚验证过是对的归一化。

**同族**:P-082「门的门」、以及本仓反复出现的「每格先证起点再证结果」——
靶没进它想测的分支时,恒绿与误判都毫无察觉。本轮还有两个实例:
抠 catch 段用固定 4000 字符窗口(段首注释就把窗口吃光,判据根本没扫到目标);
换成大括号配平后仍抠错(`handleSubmit` 里有**两个** `} catch (err) {`,前一个是资格评估的)。
两处都改成「从特征行反向定位 + 断言目标标记齐全,抠错时本门自己判红」。

## P-091 `git add -A` 会把冲突标记当成「已解决」提交进去

**现场(2026-08-12,3 个文件)**:合并后顺手 `git add -A` 再提交。
而 `git add` 作用在一个 UU 状态的文件上,语义是**「标记为已解决」** ——
文件里那三行 `<<<<<<<` / `=======` / `>>>>>>>` 原样跟着进了提交。
中招的包括 `scripts/selfcheck-money-receipt.mjs`(一个**资金门**),
`node --check` 实测那两笔提交上它是 `SyntaxError`,**完全跑不起来**。

**为什么现有的门一个都没拦住**:tsc 只看 `.ts/.vue`;契约登记门只扫 `scripts/*.test.mjs`;
而 verify.sh 里能抓它的那道门排在 2884 行,**远在 preflight 崩点(245 行)之后** ——
真出事时它恰恰跑不到。

🔴 **已焊机器门**:`scripts/conflict-marker-gate.mjs` 扫**全部被 git 跟踪的文本文件**
(不维护「哪些类型要查」的清单 —— 清单必漏,而漏掉的那类正是下次出事的那类),
候选集塌了本门自己判红。并且**前移到 `[0]` 段**:不依赖 dev server 的纯静态门,
一律排在任何可能中止的 preflight 之前。

**推论(比这条本身更通用)**:门的**位置**也是判据的一部分。
一道排在崩点之后的门,等于在它最该发挥作用的那一刻缺席。

## P-092 收紧一个条件之前,先验它在**现实输入**上还成不成立(恒假的合取项 = 把路堵死)

**现场(2026-08-12,提现失败分诊)**:独立审计指出「日限那档用**服务端可控的文案子串**
决定幂等键的去留,等于把资金安全押在文案上」。这条批评成立。我的收敛动作是给它加一个更严的合取项:

```
if (!isReplay && isSettledRejection(err)) forgetWithdrawAttempt(...)
```

看起来无懈可击:只有「首次提交 + 服务端明确拒绝」才退役键。
**但它在唯一的现实输入上恒假** —— 日限拒单的实测线型是 HTTP 429,而 429 是被**故意**
放进 `UNSETTLED_4XX` 的(网关限流时上游可能已转发过一次)⇒ `isSettledRejection(429) === false`。

后果比原来更坏:首提撞日限 → 键不退役 → 账号被锁进重放模式 → 重放又撞同一个日限 → **闭环**,
提现功能当天报废。原来的写法只是「判据不牢」,新写法是「路被堵死」。

🔴 **规则**:给一个已有条件**加合取项**(`&& 某判定`)时,必须先回答:

1. **这一档的现实输入是什么线型?**(不是「理论上可能是什么」,是回源查实测记录 /
   页面注释 / 后端契约里那个具体的 status + kind)
2. **把那个真实输入代进新条件,结果是什么?** 拿**真模块**跑一遍,别在脑子里推。
3. 若结果恒假 —— 那不是「更严格」,是**这一档从此不执行**。

**同族反面**:恒真的合取项同样坏(见 [[P-090]] 里那格「按构造必然包含」的门)。
判据里出现常量真/假,都意味着那段逻辑事实上不存在,而代码读起来像它存在 —— 声明≠实现。

**为什么会犯**:批评是对的(不该押在字符串上),我急着回应批评,却把「更严」当成了「更好」。
**更严的条件如果永不成立,它守的那件事就永远不发生。** 正确的收敛是换判据的**来源**
(让服务端给一个有契约的错误码),不是给一个坏来源套一层更严的壳。

**判据怎么验**:任何一条带 `&&` 的资金判定,机器门里必须有一格**用该档的真实线型**跑到
它的 then 分支 —— 跑不到就是恒假,当场判红。本轮新门的
「首次撞日限必须退役」就是这一格。

## P-093 抠函数体一律用大括号配平,别用「找下一个 `\n}`」

**现场(2026-08-13,一天内第三次同族)**:重锚 SPEC-2 生产守卫判据时,我用
`body.indexOf("\n}")` 截函数体。而 `config.ts` 里那几个 `_dev*` 后门**嵌套在 store 里**,
结尾是缩进的 `  }` —— `"\n}"` 匹配不到它,一路截到很后面的顶层 `}`,
于是**邻居函数的守卫也被算进了这一段**。

后果:判据对两种真实变异**都不红** ——「拆掉某个后门的守卫」和「新增一个没守的后门」
实测双双放行。它看起来在守三个后门,实际只要文件里**任何一处**有 `IS_PRODUCTION` 就全过。

**同族的另外两次(同一天)**:
· 抠 catch 段用固定 4000 字符窗口 —— 段首注释就把窗口吃光,判据根本没扫到目标;
· 换成配平后仍抠错 —— 同一个函数里有**两个** `} catch (err) {`,前一个是别的分支的。

🔴 **规则**:
1. **抠代码块一律大括号配平**,从块的 `{` 起数,深度归零处结束。不用行首模式、不用固定长度。
2. **配平失败必须判红**(`close < 0` 就抛),别默默用一个半截的段去判。
3. **抠完先证「抠对了」**:断言这一段里必须出现该块的特征标记(函数名 / 分支关键字),
   缺一个就说明抠错了目标 —— 此时判据无论红绿都不说明任何事。
4. 定位起点用**特征行反向定位**,别用「某某之后的第一个」——同名结构往往不止一处。

**为什么这一族特别隐蔽**:抠错窗口的失败形态是**恒绿**,不是报错。
判据看起来在守 N 个东西,实际守的是「文件里任何一处出现过那个词」——
而这恰好在正常代码里永远成立。

### P-059 [机制] verify 哨兵的 selftest 演习弹会污染共享信号通道;文本计数门被同形注释抵消
- **症状**:重试包装的 selftest 每轮注入失败靶自证,靶的重试事件写进真登记簿 → 每轮全绿运行都打「⚠ 有重试」块,常态假警报(狼来了,恰是该特性要消灭的);独立 tester 另证:接线计数门(grep 文本行数)可被一条含同形写法的注释抵消一处真解包,门恒绿。
- **根因**:① selftest 与生产共用同一信号通道(登记簿/计数器),演习流量与真流量不可分;② 计数判据数「文本出现次数」而非「可执行调用点」,注释也是文本。
- **对策**:① selftest 期间**换草稿通道**(临时改指 scratch 文件,演习完还原并删除),生产通道零污染,并断言真通道 0 字节;② 计数判据**锚定行首**(`^\s*if <函数名> `)——注释行以 # 开头天然不匹配;红测必须含「仅诱饵→仍绿」+「诱饵+真解包→红」组合靶,单测解包不够。
- **同族提醒**:任何「gate 自测时真跑一遍失败路径」的哨兵都要过一遍「演习弹落在哪个通道」;任何 grep 计数门都要问「注释里写同形文本会怎样」。出处:pkg/zj 独立证伪轮(P1-1/P2-3),2026-08-15。

## P-094 「连接服务器超时」= dev 依赖重打包窗口,不是网络/后端问题

- **症状**:mock 模式下打开某页(实测 earn)黑屏转圈 60s 后弹「连接服务器超时」;console 一串模块请求 500 + `Async component timed out after 60000ms`。该文案是 uni-h5 运行时内置的,src 里 grep 不到。
- **根因**:uni 按需编译下,vite 冷启动的依赖扫描抓不到**只被懒编译页面引用**的依赖(qrcode-generator 仅 proof.vue / share-poster-sheet.vue 引用)。冷启动后第一次有人访问引它的页面 → 运行时「new dependencies optimized」全量重打包 → 窗口内在途模块请求 500 → uni 异步页面组件等满 60s 报超时。自愈型:窗口过后刷新即好,极易误判成后端/网络问题。
- **对策**:此类依赖显式写进 `vite.config.ts` → `optimizeDeps.include`(已加 qrcode-generator);**新增「仅页面级引用」的 npm 依赖时同步补 include**。诊断口径:见到该文案先看 dev server 日志有无 `new dependencies optimized` / `restarting server`,再谈网络。
- **判据来源**:server 日志时间线(20:44:50 重打包 = 报障时刻)+ 修复后重启同路径访问日志零重打包行、二维码页直接渲染。2026-08-15。

## P-095 shell locale 会改写文本门语义:中文 LANG 下 sed 剥注释静默失败

- **症状**:同一提交、同一 verify.sh,`bash.exe <script>` 跑 448/0,`bash.exe -lc`(login shell)跑 447/1 —— platform-anchor 禁令报「paidCumulativeNowOf 出现在代码面」,而该符号全 src 唯一出现处是一行 `//` 注释(本应被剥掉)。
- **根因**:login shell 的 profile 注入 `LANG=zh_CN.UTF-8`,GNU sed(4.9)转入多字节模式后,对含 emoji(🔴)的注释行执行 `s|(^\|[^:])//.*$|\1|` **静默失败**(不报错、原样放行)。A/B 各 2 次全复现:LANG unset(C locale)剥净→绿,zh_CN.UTF-8 存活→红。**反向更险**:剥注释失败会让「符号消费计数 ≥2」类门把注释行计进去 —— 死代码假绿。
- **对策**(已焊,b0c9e14):verify.sh 头部 `export LC_ALL=C`,全部文本门按字节语义跑,判定与启动者 shell 环境解耦;脚本内 UTF-8 模式串按字节比对,中文/emoji 字面匹配不受影响。修后用敌意方式(-lc)复跑 448/0 作红转绿证明。
- **同族提醒**:① 任何会话里临时写的 grep/sed 判定管道,若跑在 `-lc`/交互 shell 下,同样带着 zh locale —— 判定类管道自带 `LC_ALL=C` 前缀;② 「单跑绿、全跑红」或反之,先比对两次调用的 env(locale/PATH),再怀疑树被并发改;③ 与 P-059(演习弹污染共享通道)互补:本次三轮排查顺序 = 先疑并发注入、再疑树漂移、最后 env 对比才定罪 —— env 差异应提早进入证伪矩阵。2026-08-15。

## P-096 跨仓 junction 成环:vite 监视器无限递归,dev server ~2.5h 必 OOM 崩

- **症状**:主 5173 长跑约 2.5 小时后 exit 134 连崩(加 4GB 堆照崩,更快见底)。崩前日志出现**无限自我嵌套路径**:`[vite] page reload .claude/worktrees/nexion-ops-console/.claude/worktrees/Nexion-uniapp/.claude/worktrees/nexion-ops-console/…`,末尾 GC 日志 `FATAL: JavaScript heap out of memory`。
- **根因**:跨仓门取材面在两个仓各挂了一条 junction —— uniapp 侧 `.claude/worktrees/nexion-ops-console → admin-ops`,admin 侧 `.claude/worktrees/Nexion-uniapp → Nexion-uniapp`,构成**双向环**;vite 的文件监视器(chokidar)跟随 junction 在环里无限递归,监视条目路径每圈翻倍直至堆爆。触发即崩的不是流量而是**时间**,与页面操作无关。只有主检出中招(worktree 检出里没有那些 junction),所以 5399 从不崩、5173 必崩,极易误判成「偶发内存不足」。
- **对策**(已焊):`vite.config.ts` → `server.watch.ignored: ["**/.claude/**", "**/dist/**", "**/.trash/**"]`——`.claude`(worktrees/junction 基础设施)、`dist`(构建产物;verify 链每跑 build:h5 都会触发整页 reload 打断浏览者)、`.trash`(删除暂存)都不是源码,监视器一律拉黑。加内存(`start-services.ps1` 5173 行已带 4GB)只是缓冲,不是修复。
- **同族提醒**:① 新挂任何跨仓 junction 前,想一句「对面仓会不会也挂回来」——环一旦成立,**两边所有跟随符号链接的递归工具**(watcher / find / 备份 / 打包)都会中招;② dev server「定时炸弹式」崩溃(固定 uptime 后崩、与负载无关)优先查监视面无限增长,GC 日志和崩前 watch 路径是第一现场;③ 与 env_windows_shell「junction 递归删除穿透」同族:junction 的风险面 = 一切递归遍历,不止删除。2026-08-16。
## P-097 toLocale* 不传 locale = 跟浏览器语言,应用语言≠设备语言时全站混语日期
<!-- 编号注:本条与上一条在两个并行会话各自以 P-096 落笔,合并时按主线先落地者保号,本条顺延 P-097(下一条顺延 P-098)。 -->

- **症状**:独立 tester 验收 proof 页发现:应用 en + 浏览器 zh 时 "Member since 2026年7月"、vi 页 "Thành viên từ 2026年7月";同字符串还画进分享海报 canvas。全站同型 22 处(无参 / `undefined` / `[]` 三种形态),散在 17 个文件。
- **根因**:`Date#toLocaleDateString/toLocaleTimeString/toLocaleString` 的 locale 参数缺省 = 宿主环境语言(浏览器/OS),与应用自选语言(locale store)是两个独立轴。wallet-bills 曾单点修过(本地 `localeTag` computed + 注释写明理由),但没有全站扫同型、没有焊门 → 其余 21 处照旧(修一处 ≠ 修全部)。
- **对策**(pkg/zp):① `src/i18n/format.ts` 单源 `dateLocale()`——应用语言→BCP-47(en-US/vi-VN/zh-CN),词典未落地的语言随 UI 文案一起回退 en-US(避免反向混语);读 locale store,computed 内调用随切换语言重算。② 全站 22 处全部改传 `dateLocale()`,wallet-bills 本地实现收编进单源。③ verify.sh 焊 `date toLocale* pins app locale` 哨兵(修前基线 22 命中 = 哨兵四个分支的天然红证)。**ceiling**:变量持有的 Date 调裸 `.toLocaleString()` 与数字千分位同形,grep 兜不住,靠 review;数字 `Number#toLocaleString()` 千分位分组是另一族(约 150 处,部分定点 en-US),有意不动。
- **同族提醒**:任何「宿主环境缺省」参数(locale / timezone / 首日周起点)都要问一句「这该跟设备还是跟应用?」——跟应用的必须显式传值并锁单源。2026-08-15。
- **对抗轮加固**(同日 skeptic 证伪三条 P1,全部采纳):① 12/24 小时制随语言联动——en-US 默认 12h("02:05 PM" 8 字符),修后跟应用语言反而把命中面从「设备恰好 en-US」扩到「选英文 UI 的所有人」,且落在 feed 两处无溢出防护的固定 px 栅格列;两处 `toLocaleTimeString` 钉 `hour12: false`(设计栅格按 "14:05" 定宽)。② `DATE_LOCALE_TAGS` 与 `DICTS` 是两张独立手抄表、无门无类型锁——正是 wallet-bills 本地 localeTag 分叉旧账的复刻;根治:tag 表补全 11 语并 `Record<LocaleCode, string>` 锁类型(加语言码不补 tag 编译即红),启用与否由 `code in DICTS` 派生(词典上线日期自动跟上,无第二张开关表)。③ 哨兵可被 `navigator.language` / 字符串字面量 tag / `Intl.DateTimeFormat` / `[ ]`(带空格)四类写法绕过——正则四分支扩容 + ceiling 注释改如实;红测用 eval 提取 verify.sh 原行重建有效正则(防手抄转义偏差),合成探针 11/11 全红、真实 src 0 误伤。

## P-098 dev server 喂满一轮 verify 流量会队列拥塞式退化;探针假红与「一门一浏览器」模式共振

> 根因后注(合并时补):当晚进程膨胀 4.8GB 的根源即上文 **P-096 junction 环**(邻会话已焊 `server.watch.ignored` 修复)——两案互证:环让监视面无限增长,监视面撑爆的进程把转译队列拖成分钟级。

- **症状**:全量 verify 的运行时探针族(auth/entry/dom-qa/tap/orphan/empty-state/theme)跨三轮稳定集体 FAIL,形态清一色 page.goto 超时 / 「app DOM coverage 为空」,零断言失败;同期同一页面在交互式浏览器里秒级渲染。
- **根因**:① uni/vite dev server 处理完一轮探针流量后进程膨胀(实测 4.8GB 工作集),空载 shell 响应 4~31s;② 更关键的是**服务器侧请求队列拥塞**——超时被杀的探针客户端不取消服务器侧转译,积压排队,后来的请求随机排到几十秒(最小复现:同一秒内裸 `/` goto 超时 30s、紧接的 hash 路由 528ms 成功);③ 探针「一门起一个 browser、20-30s 预算」的模式与该病理共振,重试也落进同一拥塞窗口;当晚机器同时跑 3 个 uni dev server 加剧。auth 门脚本内早有注释记过「并发跑多个 headless chromium 时这条稳定误报」——是同族先兆。
- **对策**:① 判「代码坏 vs 环境坏」用三件套:交互式浏览器实景渲染 + curl shell 延迟 + 最小 playwright goto 复现(同秒失败/成功对照 = 队列拥塞铁证);② 预热/走查类脚本用「**单 browser 串行耐心 + 失败等 3s 重试**」模式(当晚 176 次 goto 全成);对轮询页(首页 live feed)禁用 networkidle 判据(永不触发),用「等目标文本」;③ 长跑判据:verify 前后各 curl 一次 shell 延迟,>2s 即环境红,先重启 server 再谈门的结论;④ 已焊(2026-08-16,同日):verify.sh `[2.7] dev server health preflight` —— 开跑前对 `$BASE_URL/` 连续 2 次 curl 测 `time_total`,任一次 >2s 即判**环境红**并直接中止(输出 ENV-RED 横幅 + 「重启后再跑」处置;退出码钉 **3** 与门红的 1 区分,`.verify-exit.code` 老读法只跟 0 比不受影响;server 压根连不上时不重复计红,交 [2.5] 判)。收尾处再测 1 次,总结行报「首尾延迟」,首绿尾超阈 = server 在本轮中途退化,后段 runtime 红先疑环境。红测:3.5s 延迟假 server 实测第 1 采样 3.506s → 环境红中止([3] 起零段落跑过、进程与哨兵退出码均 3);恢复真 server 后全量复跑 [2.7] PASS(0.005s/0.005s,收尾 0.011s),无误伤。
- **判别套件补一件(同日 R4 后)**:`build:h5` 产物 + 10 行 node 静态服务器 + 全新 context 裸启动 = **零转译队列的代码健康终极判别**——dev 模式残差门(entry/onboarding/register 这类整文档冷载「启动图」页)在静态产物上 1-2s 全挂载,即可把「代码 vs dev-server 病理」一刀切开;比无限重跑 verify 省一个数量级时间。

## P-099 账号内部 key 经 email 兜底链上屏:profile 身份行直出裸 "default"

- **症状**:中文界面 `/pages/me/profile` 昵称「Hyper Drift 41」正下方渲染一行裸英文 `default`(2026-08-15 date-locale T1 独立验收发现#2,截图 evidence-date-locale/profile-zh.png)。模板 grep 不到字面 —— 值来自 store 直出。
- **根因**:三层叠加。① `user.email` 的多条兜底链(seed 工厂 / bindAccount 绑定闸)把**账号内部 key 当联系身份**灌入:匿名 boot key 字面就是 `"default"`;② 竞态铸造:App.vue 启动恢复的 `bindAccount("default")` 若抢在 boot 种子首次落盘前执行,`readAccountSnapshot` 读空 → 用 rawAccountKey(="default")重播种**并持久化**——毒行一旦落盘即棘轮式永久污染;③ 静态评审路由(`?nx_device=off` 走查/验收视角)下 `scheduleAccountSessionBootstrap` 直接 return,bind 永不执行,boot 直读毒行原样上屏 —— 修在绑定闸的第一版对该视角完全无效(实测)。
- **对策**(pkg/zr):归一化整体内置进 `readAccountSnapshot`(全部 9 处存储读、含三路 merge 的 latest 视图的**唯一入口**):`user.email` 非邮箱形(不含 `@`)一律归一成 demo 身份 `alex@nexgrid.ai`;判据取「像邮箱」而非枚举 key 形状(key 形状是开放集合,枚举必漏)。铸造侧两快照工厂加 `asEmailIdentity` 筛(不再铸毒)。**归一化不能只折叠成空串把补值留给个别消费者**——三路 merge 会把空串当 latest 差异反噬回治过的内存值(实测中招后改为整体归一)。
- **已转哨兵**:`scripts/profile-identity-check.mjs` 运行时门(挂 `test:h5-runtime` 并行组):fresh boot + 注入旧 bug 真实落盘形状的毒快照双场景,断言页面无 standalone `default` 文本节点且身份行邮箱形;红测台账:M-A 撤 read 层归一 → 毒场景红(served 产物核过变异真生效)。诚实边界:seed 工厂筛被 read 层遮蔽(竞态窗不可外部确定性触发),`createServerEmptySnapshot`(remote)无可达渲染面,两处靠 review。
- **同族提醒**:① 任何「id/key 兜底进展示字段」的链都问一句「这个值像不像它假装的身份」;② 验收/走查视角(静态评审路由)会**停掉会话 bootstrap**——修「启动时自愈」类 bug 必须在该视角下复验,bind 层的修法在这里不存在;③ 红测冷重启前**先杀口再起**:`--strictPort` 撞被占端口会静默退出,探针打到旧 server = 变异「没生效」假象(本轮实测两次)。2026-08-16。

## P-100 P-096 的后遗症:`**/.claude/**` 把整棵 worktree 的源码一起拉黑,dev server 静默不跟进

- **症状**:`.claude/worktrees/*` 里起的 dev server **永不跟进源码改动**,且完全静默(不报错、不 warn):改完 `curl $BASE_URL/src/<file>` 返回的仍是改动前的转译产物,vite 日志也不出 `page reload` 行,杀了 server 重起才更新。实付代价:一次「拆掉退款守卫、印钞路径必须变红」的红测跑出**全绿**,换新 server 重跑立刻变红(9999 → 10479.25)。
- **根因**:P-096 为切断跨仓 junction 环加的 `server.watch.ignored: ["**/.claude/**", …]` 本身是对的,但 **worktree 整棵树就住在 `<主 checkout>/.claude/worktrees/<name>/` 下面** —— 通配版把 worktree 的全部源文件一并拉黑。真 chokidar 实测(复刻 vite `resolveChokidarOptions` 的 ignore 清单):worktree 根下 `watchedDirs=0`(整树拉黑),锚定后 97。主检出的源码不在 `.claude/` 下,所以这坑**只在 worktree 里现形**;而项目不变量要求功能包都在 `pkg/*` worktree 上做,`scripts/verify.sh` 自己又不起 server(只认 `BASE_URL` 上已有的那个)→「改代码 → 重跑 verify / 重跑运行时门 / 做红测」这个标准循环默认验的是旧代码。
- **对策**(pkg/zv):把 `.claude` 那条锚在**配置文件所在树**的绝对路径 —— `` ignored: [`${selfDir}/.claude/**`, …] ``,`selfDir = __dirname.replace(/\\/g, "/")`(`__dirname` 由 vite 打包 config 时注入 `__vite_injected_original_dirname`,ESM 配置下同样可用)。chokidar 的 ignore 两侧都过 `normalize-path` 归一成正斜杠(与 vite 自己拉黑 `cacheDir` 同款写法),绝对路径 glob 在 Windows 下照样匹配。`dist` / `.trash` 保持通配:它们在任何树里都是构建产物 / 删除暂存,通配语义本来就对(`src` 下无同名目录,实测 0 误伤)。
- **已转哨兵**:`scripts/vite-watch-anchor-gate.mjs`(挂 verify `[0]` 静态门)——走 vite 自己的 `loadConfigFromFile` 读**求值后**的 ignore 清单(顺带证明 `__dirname` 注入确实可用,不是对源码做文本猜测),断言拉黑 `.claude` 的条目恰好 1 条且等于 `<本树>/.claude/**`。红测台账:改回 `**/.claude/**` → 门 FAIL(实跑,exit 1)。
- **双向活体实证**(2026-08-16):① 绿——worktree 起 mock server(5391),给 `src/lib/carrier.ts` 追一行**代码**(注释不行,esbuild 会把注释剥掉,拿注释当标识会恒查不到),curl 立刻见到新导出、日志出 `page reload src/lib/carrier.ts`,不重起 server;② 红——同一探针在通配版配置下,磁盘确实有改动而 curl 恒返回旧产物、日志无 reload 行;③ P-096 未复发——锚定后主检出真 chokidar 实测 `watchedDirs=104`、`.claude` 泄漏 0,junction 环仍然进不去。
- **同族提醒**:① 任何 `**/` 开头的忽略 / 排除模式,先问一句「本工程会不会有一天住在那个目录名底下」——worktree / CI cache / 容器挂载都会让「基础设施目录」与「源码树」重叠,通配一律改锚定;② 监视器静默失效 = 一切「改完重跑」的结论作废,判红绿前先证明 server 跑的是当前源码;③ 与 P-096 是同一行代码的两面:环要拉黑、源码不能拉黑,判据是**锚定**而非通配。2026-08-16。

## P-101 门腐烂:实现改了链路形状,门的桩面/判据锚没跟上 —— 门整体空转而**首格照绿**
<!-- 编号注:本条原以 P-099 落笔,合并时主线 pkg/zr 先落地保号;P-100 让给 pkg/zv(`**/.claude/**` 把整棵 worktree 拉黑),本条顺延 P-101。 -->

- **症状**:`BASE_URL=<mock> node scripts/withdraw-bill-runtime.mjs` 20 格里 18 红(基线同红),形态是「账单 0 条 / 落盘 0 条 / 金额 undefined / 退款不动作」—— 看着像提现链整条烂了;而**第一格「提交链路走通」照 PASS**。同批 `scripts/selfcheck-withdraw-nex-refund.mjs` 在 `monthOf` 处直接 ReferenceError 崩掉,自 ⑬ 起十几格一格没跑。
- **根因**:两条都不是产品回归,是**门的锚过期**,各有一种形态:
  ① **桩面缺一处**——`4c32a50`(sandbox 商城闭环批次)在提现页「确认之后、建单之前」插了一次新的服务端往返 `risk.checkGate`,它在 mock 下由 **store 层**首行 `if (!remoteApiEnabled) throw` 拒掉(桩 `riskDisclosureApi` 够不到、`remoteApiEnabled` 是模块级 const 改不了)。链停在那里,后面 17 格全在空集上判假,而首格判的只是「弹窗弹了、被点了」——**它证的不是提交**。
  ② **判据锚过期**——同一批把余额权威搬去服务端(页面删掉 `applyWithdrawalDebit(wd)`,改 `refreshRemoteFleet()` 重读 `fleet.walletUsdt`),而 `refreshRemoteFleet` 首行 `if (!remoteApiEnabled) return true`。于是「余额少了 480.25」在 mock 下**结构上不可能成立**,⑥⑦ 不是红了,是问错了问题。
  ③ **抠源码型判据的第二种腐烂**——P-097 把账单页分月键从 `localeTag.value` 改成 `dateLocale()`,门里 `new Function("ts","localeTag",…)` 注入的名字对不上,**首次调用**才 ReferenceError;而它写在 module 级、外层无 catch,一抛把后面全部断言带走。
- **对策**(已焊进两个门):① 桩面按「**服务端往返**」枚举而不是按方法名,新增往返即补桩;② **桩生效与否自己钉一格**(`gateCalls === 2`),桩不上给一条读得懂的红,而不是让人从 17 条红里往回猜;③ 资金面判据**按页面实际接的那条腿分流**,判据从页面源码剥注释后读(`strip()`),两支各有各的红线,共有一格钉不变量本身「提交→失败终态一个往返净零」(同时挡住扣了不退=丢钱、没扣却退=印钞);④ 抠源码构造的判据**构造后当场试跑一次**,失败不抛、回常量哨兵让依赖它的那两格自己红,其余断言照跑。
- **红测**(全部实跑):拆掉 app.ts `refundWithdrawalDebit` 的「没扣过就没得退」守卫 → 余额 9999 → **10479.25**,两格 ⑦ 当场红(逐分复现 2026-08-11 那条印钞实录);删掉页面 `risk.checkGate` 调用 → 只红 `gateCalls` 那一格(「实测调了 0 次」),其余 18 格照跑;把 `applyWithdrawalDebit(wd)` 接回页面 → 判据自动切到另一支,21/0 全绿(证明门跟着页面走、不写死方向);把同形文本塞进注释 → 剥注释后判据不动(不剥则假阳性)。
- **同族提醒**:① **「首格绿 + 后面全红」是门腐烂的典型指纹**,不是「实现整条烂了」—— 先问「第一格到底证了什么」,它通常只证到链路的**第一步**;② 任何「20 格里 N 格红」先看**这些格是不是全在空集上判假**(链没跑到),空集上再多断言也是零信息;③ 门与实现对立时(本轮 `selfcheck-fastlane` 三格要求页面必须调 `applyWithdrawalDebit`,`funds-server-sandbox-regression` 要求 `applyWithdrawalDebit` 必须 `if (remoteApiEnabled) return false` —— 两者互斥)**别在自己这道门里替别人裁决**:把判据改成「跟着实现走」,哪边赢都不必回来改门;④ 并发跑 verify 时 `/tmp/uniapp-*.log` 是**写死的共享路径**,几个检出互相覆盖 —— 自己那轮的结论只认自己那条命令的 stdout,别读共享 /tmp(实测读到别的检出跑的旧版脚本日志,时间戳却是「刚刚」,差点据此判定自己的改动没生效);⑤ 「跑的是不是当前源码」这一层由 P-100 单独管,判红绿前先过那一关。2026-08-16。

## P-102 契约 .mjs 的三个静默失效面:报错长得像「实现坏了」,其实是 harness 跑不动

- **症状**:`node scripts/run-contract-suite.mjs` 163 pass / 10 fail,红面看起来像一批实现回退。逐条查完:**8 条与实现无关**——4 条是 harness 自己跑不动(报 `ERR_MODULE_NOT_FOUND` / 裸 `ReferenceError`,极易被读成模块没了、代码坏了),4 条是断言落后于已拍板的实现变更(全部溯源到同一提交 `4c32a50`)。另有 2 条是路径写死在别人机器上(`D:/workspace/...`,见对策③)。
- **根因**(三个互不相干、但都表现为「门红且指向实现」):
  ① **Node 原生 ESM 不补扩展名**:契约 .mjs 直接 import 仓内 `../src/**/*.ts` 跑真实现,而 src 内部相对导入按本仓风格无扩展名(`./order-api`)。被 import 的 .ts 一旦新增**运行时**相对导入(`4c32a50` 给 `trial-api.ts` 加了一条),整个测试文件加载失败 —— 8 条断言一条都没跑。类型导入不算(编译期擦除),所以这类地雷平时看不见。vitest/Vite 会补全,故 vitest 孪生测试全绿,更显得「只有这条坏了」。
  ② **手维护的注入名单**:`h3-quest-race` 靠「正则剥掉 import + `new Function` 手工注入同名参数」跑真 store。名单是开放集合:`6d93739` 给 `quest.ts` 加了 `ref`,三条竞态断言当场全灭在 `createStore` 里,一条都没执行到。
  ③ **绝对路径锚死**:`oauth-` / `risk-disclosure-sandbox-contract` 把兄弟仓与**本仓**文件都写成 `D:/workspace/...`;绝对路径还绕开一切解析器,把仓克隆到标准兄弟位也救不回来。risk-disclosure 更读在模块顶层 → 缺兄弟仓时纯本仓的两条断言被连坐。
- **对策**:① `scripts/lib/ts-ext-resolve.mjs` —— 只在解析**已失败后**兜底试 `.ts/.tsx/index.ts`,一个候选都不存在就原样抛出(真缺模块照红);由 `run-contract-suite` 以 `--import` 注入(Windows 下必须传 `file://` URL)。② 注入名单改成构造性判据:扫剥掉的具名导入与名单求差,有差 **exit 2 指名报出**;注入表与名单同源(`assert.deepEqual(Object.keys(INJECT), INJECTED_NAMES)`),防守的一份与跑的一份漂移。③ 兄弟仓走本仓 idiom(`NEXGRID_BACKEND_ROOT` 否则 `../nexion-backend`),**显式配了却指向空气 = 硬抛**(不许降级成 skip);缺仓只 skip 跨仓断言、本仓断言照跑;`run-contract-suite` 原过滤器把 `skipped` 计数与逐条理由一并吞掉(结果读起来像全绿)→ 改为打印并加「统计与明细对不上即判红」。
- **已转哨兵**:`scripts/ts-ext-resolve.redtest.mjs`(挂 `test:contract-registry` 前置)—— 靶①无 hook 必红/有 hook 必绿(先证起点:证明它真走了兜底分支)、靶②真缺模块必红(证明兜底不吞真缺失);h3 守卫红测:给 `quest.ts` 变异加一条 `import { computed }` → 门红并点名 `computed`;4 条改写后的断言逐条变异验证(阈值改回写死 0 / 免闸改客户端自算 / 降额兜底改 fail-open ×2 / 已售改回 847 / 行情不读服务端投影 / 栅栏不推进代次)7 靶全部**变异前绿、变异后红**。
- **同族提醒**:① 门红先问「红的是实现,还是我跑门的方式」——`ERR_MODULE_NOT_FOUND` / `ReferenceError` / 整文件级失败这三种形态,十有八九是后者;② 凡「手工枚举 + 靠人记得同步」的清单(注入名单 / 豁免名单 / 路径候选),都要焊一条构造性判据把它变成发现即红,否则它静默失效时**红的方式恰好是最容易误判的那种**;③ 改断言去迁就实现是高危动作:只有当新行为有权威依据(规格 / 拍板)或新断言严格更强时才允许,且**每条改写必须变异验证**,否则等于把真回退洗白;④ 该轮 4 条过期断言全出自同一提交,而那轮收尾只报了新建的门、没跑 `test:contract-registry` —— 新门链架空旧门链的又一例。⑤ `wallet-withdraw.vue` 等文件**行尾混用**(实测 1496 CRLF + 106 LF),红测靶别用跨行字符串,用全文唯一的单行串;⑥ **临时 worktree 里跑跨仓门会出假红**——本轮在 `scratchpad/` 下的 worktree 跑出 `withdraw-terminal-reason-parity` 2 红,一度被我判成「主线自带的红」还挂了芯片,回主检出实跑是 5 pass / 0 fail:该门要在兄弟位找 `admin-ops`/`nexion-ops-console`,scratchpad 下两者都没有。跨仓门的结论**只认兄弟位齐全的检出**(同 P-098 家族:先证环境,再判代码)。2026-08-16。
- **2026-08-16 收口(同族第 4 面 + 一个方向相反的新坑)**:③ 的治法当时只落在 `oauth-` / `risk-disclosure` 两个文件,`test:cross-repo` 那 4 个(`funds-server-sandbox` / `funds-run-scoped-isolation` / `h8-run-scoped-referral-projection` / `behavior-analytics-active-route-catalog`)是同一病灶的漏网:本机缺 `nexion-backend` → 5 fail 全是 ENOENT,`npm run verify` 聚合链恒红在此。其中 `funds-server-sandbox` 连 `test()` 都没有,8 条本仓断言与 2 个后端读取全在模块顶层 —— 缺仓时本仓断言一条没跑,报出来的只是一句 ENOENT(连坐的极端形态)。已按 ③ 统一改造:跨仓断言 `{ skip: 理由 }`、本仓断言单列照跑;`behavior-analytics` 原先连 `NEXGRID_BACKEND_ROOT` 都不认(写死 `../nexion-backend`),一并接上。
  🔴 **新坑,而且方向和 ⑥ 相反**:把 ENOENT 硬红改成 skip 之后,「兄弟位算错」这个老毛病会从**假红翻成假绿** —— linked worktree 里 `<appRoot>/..` 落在 `.claude/worktrees/`,仓明明在工作区根也判成缺席,于是**永久静默 skip**,而 ⑥ 那种一眼可见的红没有了。硬红时路径算错会自己叫;转 skip 后它只会安静。凡把某个门的失败降级成 skip,必须同时把「依赖到底在不在」的判据加强一档,否则等于用一个更难发现的失效面换掉一个显眼的。治法:兄弟仓解析收口到 `scripts/lib/sibling-repo.mjs`(env 优先 → 裸兄弟位 → git common-dir 反推主 checkout 再取同级,idiom 同 `verify.sh:72-82` 的 ADMIN_ROOT),6 个跨仓文件全部改用它;skip 理由把**试过的两条路径都写出来**,读的人一眼能判「是真没仓,还是我算错了位置」。
  **已转哨兵**:`scripts/cross-repo-skip.redtest.mjs`(挂 `test:cross-repo` 末尾)—— A 拿内容全错的假兄弟仓喂进去,缺仓时 skip 的那批必须**逐条**变 fail(按 test 名逐条比对,不是只看 fail>0);B 缺仓基线 0 fail + 本仓断言照跑 + 每条 skip 都带得出理由;C 显式配 env 指向空气必须硬抛。4 靶变异验证全部**变异前绿、变异后红**:M1 无视 env 恒 skip → A 三条全红;M2 skip 理由留空 → B 红;M3 配错路径不炸 → C 红;M4 把后端读取搬回模块顶层(还原连坐)→ B 基线红。判 skip 集用 TAP reporter(`ok N - 名字 # SKIP 理由`),不认 spec reporter 的记号字形(会随 node 版本漂)。
  **口径**(与铁律「机器门禁『依赖缺席就跳过』」的边界):禁的是**静默**跳过和「绿 = 已验证」的误读,不是 skip 本身。三条同时成立才允许 skip —— 理由可见、缺席范围最小化(只 skip 真依赖它的断言,不连坐)、有红测证明依赖在场时断言真跑真红。三条缺一条就退回硬红。反例是按 registry `excluded` 整份排除:那会把同文件里纯本仓的断言一起停掉(本轮 4 个文件里有 5 条),用真实的覆盖损失换一句好看的登记。

## P-103 「基数台账」守不住覆盖面:总数只能守「已扫到的变少」,守不住「压根没扫到」

- **症状**:`selfcheck-remote-refresh-resilience` 的 `EXPECTED_SEAMS` 一路人肉同步 16 → 27 → 28 → 29,每次都写着「逐条回源确认」。门全程绿。实际同期有 **3 条真刷新缝从建门起就没进过覆盖**:`app#refreshFundsSandboxForAccount`(就在最近一次补登的 `refreshRemoteWithdrawalList` 隔壁一行被 `void` 调用)、`bills#refreshServerLedger`、`janus-c2#runJanusC2`。
- **根因**(判据的**顺序**错了,不是数字写错了):台账断言的是「实扫总数 == 记录值」,而实扫总数由扫描器产出 —— **扫描器漏掉的缝,两边同时不算,等式恒成立**。于是数字只对「已经扫到、后来变少」敏感,对「压根没扫到」完全失明。而后者恰恰是这道门实际漏掉的全部三条。三个漏因各自独立、且全都以 `continue` 静默退出:① `SCAN_DIRS = ["store","composables","lib"]` 手工目录白名单,`src/services/` 不在名单;② decl 正则只认三族,`function f(...): Promise<T>` 这一族认不出;③ 「函数体含 `/Api\b/`」量的是 decl 之后 2000 字符窗口,引用落窗口外就漏,且 `Api` 是**猜名字**(`payoutAddressServerEnabled` 这类旗标本来就不带 Api 后缀)。
- **判别式(可直接复用)**:一个「总数/基数」判据值不值钱,只问一句 —— **它的两边是不是同一个可疑组件算出来的?** 是,就等于没守。台账要有牙,记录的必须是**身份**(谁在里面)而不是**基数**,或者干脆把可疑组件本身变成构造性判据。
- **对策**:四样一起换掉,让每个 `void <fn>(` 调用点必须落进一个**有账的桶**,静默 `continue` 归零 —— 扫描面 = 全仓 walk + `import "@/api/runtime"` 判据(目录白名单消失);decl 四族收编 `function f(): Promise` + **宽判据交叉验**(本文件明明声明了、四族却认不出 → 红,即第五族写法出现时门自己会叫);函数体 = 括号配对的真体 + 该文件真实 import 名单(窗口魔数与猜名都消失);两个构造性排除桶(跨模块调用 / 函数体不碰 runtime 导入)**逐条打印**。`EXPECTED_SEAMS` 随之删除。覆盖面 29 → 32。
- **顺带把口头约定焊成门**:本门不变量的正确表述是「rejection 不许冒到顶层」,**自吞只是其中一种实现**;另一种是「缝保留 reject、由每个调用点 `.catch()` 兜底」(`orders#refreshRemote` / `bills#refreshServerLedger` / `janus-c2#runJanusC2` 属此族)。这族此前只活在注释里(「z6 已核…调用点全带 catch」),**零机器判据** —— 删掉那个 `.catch()` 门不会红。现改为从磁盘验证:全仓(含 `.vue`,调用点常在页面里)每一个 `void …fn(…)` 都必须紧跟 `.catch(`。同名跨文件只会让判据更严,不会放水。`UNREACHABLE` 登记项也一并受这条约束 —— **登记只豁免探针执行,不豁免不变量**。
- **已转哨兵 / 变异验证**(新旧两门跑同一组变异,逐条对照):M1 自吞被删 → 旧红/新红;M2 调用点 `.catch` 换成 `.then` → **旧绿/新红**;M3 第五族写法 → 旧红/新红;M5 新增第四族写法的缝且 reject 冒泡 → **旧绿/新红**;M8 登记项调用点 `.catch` 被换掉 → **旧绿/新红**;M9 runtime 改成 `import * as` 命名空间导入 → **新红**(见下条)。净账:**+4 颗牙**(M2/M5/M8/M9,全是实证发生过或新引入的失效类)。
- **自查出的一个「修 bug 时顺手挖的新坑」**:重建把文件过滤从宽判据 `/from "@\/api\/runtime"/` 换成了带花括号的具名 import 正则(为了拿到 import 名单)。全仓 52 个文件今天写法一致(实测新旧命中集合 **52 == 52,差集为空**),但 `import * as rt from "@/api/runtime"` 一旦出现就会**整个文件连同它的缝一起静默消失** —— 和我正在根治的病一模一样。已补第三条判据:引了 runtime 却取不到具名清单的文件,红。**教训:换判据时要对新旧判据做集合差,并且问一句「新判据的『没匹配上』分支通往哪里」——通往 `continue` 就是又一个静默面。**
- 🔴 **故意丢掉的一颗牙,不藏**:M6 删掉一条 `void` 调用点 → **旧红/新绿**。旧数字顺带守着「删除向棘轮」,新判据不守这一面。取舍理由:缝**存不存在**是功能契约(归 PRD / 功能门),缝**韧不韧性**才是本门的不变量;而那颗牙的代价是每次增删都要人肉同步一个数字,并且它提供了「数字绿 = 覆盖全」的假安全感 —— 这份假安全感已实测掩护了 3 条真缝。**判据方向一翻,牙不守恒(见 memory `gate-assertion-inversion-loses-teeth`),必须新旧两门对跑同一变异集,并把丢掉的那颗明写出来。**
- **同族提醒**:① 变异测试删调用点时注意**同一函数常有多个调用点**,只删第一处等于没做变异(本轮 `quest#refreshRemote` 有两处,`replace` 改 `replaceAll` 才测出真结果);② 变异测试改 `src/**` 必须**字节级打补丁 + 字节级还原**,别用 Edit 工具(CRLF 会被成片改写,见 memory `edit-tool-rewrites-crlf`;本轮 4 个靶文件全是 CRLF);③ 正则扫源码前先**剥注释**,否则注释里的示例代码会伪造出调用点(`deposits.ts` 那段讲「不要写成 `const refresh = 条件 ? A : B`」的注释,实测伪造出一条 `deposits#refresh`)。2026-08-16。

## P-104 判据「否定式 → 肯定式」翻转会静默丢牙:存在性判据对**方向**天生瞎

- **症状**:架构从「客户端扣款」改成「服务端权威」后,把门里那条「**禁止**出现 `remoteApiEnabled`」改写成「**必须**出现 `remoteApiEnabled`」—— 判据方向随架构一起翻转,看起来是等价的对称改写。门仍报 117 pass / 0 fail,断言总数、下限、pass 数一个都没变,例行复跑看不出任何异常。独立门审用变异测试实测:`if (!remoteApiEnabled) return false;`(闸**取反** ⇒ remote 档本地扣款、mock 档反而不扣)与 `const _unused = remoteApiEnabled;`(闸删了、只留装饰性提及)**双双判绿**;而被替换掉的那版否定式判据**抓得住取反**。这个动作把门在这一维上从有效改成了无效。
- **根因**:两种判据的抗变异能力**不对称、不守恒**。
  - 「禁止出现 X」:要让判据为真就得**把 X 拿掉**,而拿掉往往等于把闸真拿掉 —— 判据与语义天然绑定;取反(`!X`)因为 X 还在,照样被禁令抓住。
  - 「必须出现 X」:只要求 X **在文本里露个面**,不要求它参与控制流、更不要求方向。取反、`&&` 挂条件、死变量赋值,全部满足。
  - 一句话:**存在性判据只回答「这个词在不在」,不回答「它朝哪个方向」**。
- **对策**:① 涉及钱 / 权限 / 状态机的闸,判据钉**定型串** `body.includes("if (remoteApiEnabled) return false;")`,不用词元正则 —— 正则的「灵活」在这里正是漏洞;② **判据方向一旦翻转,必须重跑变异集**,不许因为「改前改后都是一条断言、pass 数没变」就假定强度不变;③ 决定「哪一档动钱」的**分流语句本身**要钉住,只钉「调用行在不在」时,把分流拍平成无条件执行会全绿;④ 两条腿钉不同旗标时(扣腿钉 A、退腿钉 B),补一格 **A 与 B 逐字同式**的断言 —— 今天同式不等于明天同式,一分化就是「扣了不退」。加固后 7 个变异全部判红(加固前漏 5 个)。
- **同族**:函数体切片别用 `indexOf("\n}")` 取第一个列首 `}` —— 函数体里任何列首 `}`(多行模板串 / 异常排版的对象或 switch)都会把切片**提前截断**,截断点之后的违例对否定项不可见;fail-closed 必须同时覆盖「切空」和「**切短**」,用括号配对的抠取器。
- **元教训**:改门最危险的不是「忘了改」,而是「改了、而且改得看起来很对称」。**一道门的价值 = 它能判红的变异集合,不等于它的断言条数** —— 所以改门必须连同变异测试一起改;写完先自问「哪几种改法能让它假绿」。与 P-103(基数台账守不住「压根没扫到」)同族:两条都是**门看着在守、判据其实恒真**,区别在 P-103 丢的是覆盖面、本条丢的是方向。2026-08-16。

## P-105 架构迁移后没跟上的门:它不只是「白红一条」,它会**奖励回退**
<!-- 编号注:本条原以 P-104 落笔,合并时主线 pkg/zac 先落地保号,本条顺延 P-105。 -->

- **症状**:`selfcheck-fastlane` 长期 3 格红(`applyWithdrawalDebit 不受 API 模式影响` / `建单后真的调了扣款` / `三个评估点全吃这份事实`)。看上去像「已知技术债,先挂着」。实际上前两格守的是 `4c32a50` **已经废弃的客户端扣款架构**,第三格是判据自身的 bug。
- **根因**:`4c32a50` 把提现的余额权威搬到服务端(`applyWithdrawalDebit` 首行成了 `if (remoteApiEnabled) return false;`,页面改成建单成功后 `await app.refreshRemoteFleet()` 重读舰队 `walletUsdt`)。同批改动里 `withdraw-bill-runtime.mjs` **已按新架构重锚**并在头注写明「selfcheck-fastlane 那三格…**那笔账在别处结**」——但那笔账一直没人结。这是 P-102 同族提醒④(新门链架空旧门链)的又一例,只是这次悬账被显式登记了却仍被漏掉。
- 🔴 **最要命的一点(本条的真正价值)**:过期的门不是「白红一条」那么无害 —— 变异实测,**它在回退发生时反而变绿**。旧门基线 fail=3;把 `if (remoteApiEnabled) return false;` 删掉(= 影子扣款回归,与服务端同一笔事务双扣)后 fail 掉到 **2**;把页面改回接本地扣款腿,fail 同样掉到 2。也就是说旧门对「回到已废弃的危险架构」这个动作**给出正反馈**。一条红着的过期门,方向可以是反的。
- **与 P-104 的关系(两条必须一起读)**:本条重锚时正好要把「禁止出现 `remoteApiEnabled`」翻成「必须出现」—— 就是 P-104 点名的那个高危动作。按它的结论,这里钉的是**定型串** `body.includes("if (remoteApiEnabled) return false;")` 而不是词元正则,并专门跑了「守卫取反」那一支变异(N2)确认判红。合起来看:P-104 说**翻转**会丢牙,本条说**不翻**(放着过期方向不管)会反向奖励回退 —— 所以过期的门只有「重锚」一条路,既不能挂着不管,也不能随手翻个方向了事。
- **判别式**:门红了先问「它守的架构还存在吗」。判据里出现**具体实现形态**(必须调某函数 / 某腿不许有模式守卫)而不是不变量本身(钱不许多扣、也不许不减)时,它一定会随架构迁移过期。治法是**判据从源码读「实际接的是哪条腿」再分流**(范式见 `withdraw-bill-runtime.mjs` ⑥⑦:哪边赢门都不用回来改),而不是写死方向。
- **顺带补了一条全仓真空的不变量**:服务端持有余额时,「建单成功后必须重拉服务端余额」**一道门都没有**。实测删掉页面那一行 `await app.refreshRemoteFleet();`,tsc + verify 449 格全绿,而用户提现成功后余额会停在旧数字直到下次重载(还能照旧数字接着提)。`withdraw-bill-runtime` ⑥ 守的是「不许影子扣款」(别多扣),守不到「必须重拉」(别不减)——**两条是相反方向的漏,各守各的,别以为有一条就够**。
- **变异验证**(新旧两门跑同一组,旧门基线 fail=3 / 新门基线 fail=0;只看红绿分不出「抓到了」和「本来就红」,所以数 **fail 条数**):

  | 变异 | 旧门 | 新门 |
  |---|---|---|
  | N1 删模式守卫(影子扣款回归) | fail 3→**2**(奖励回退) | 1 ✓ |
  | N2 模式守卫**取反** | 3(没察觉) | 1 ✓ |
  | N3 删掉建单后重拉(余额停在旧数字) | 3(没察觉) | 1 ✓ |
  | N4 删退款腿「没扣过就没得退」前置 | 3(没察觉) | 1 ✓ |
  | N5 提交前复检改吃活值 | 3(没察觉) | 1 ✓ |
  | N7 页面改回接本地扣款腿 | 3→**2**(奖励回退) | 1 ✓ |
  | N8 只让展示侧资格预检漏喂(隔离新牙) | 3(没察觉) | 1 ✓ |

- **第三格的独立教训 —— 无锚的否定式**:它原本是「全文不许出现 `requestWithdrawalEligibility(…dailyFacts.value,`」,成立前提是全页只有提交前复检一处调用;后来加了两处**展示侧**调用(吃活值本来就对),这条否定式于是**对正确实现判红**。改成按调用点各自该吃什么分别断言(实参用括号配对抠,按首参是不是冻结的 `snap.*` 分类),严格更强:旧版只会说「有活值就红」,新版还抓「展示侧漏喂」——N8 证明旧版对这一向判绿。**否定式判据必须锚到具体调用点,`全文不许出现 X` 会随调用点增多而失真。**
- **同族提醒**:① 变异测试的靶串要用**全文唯一的单行串**——`wallet-withdraw.vue` 行尾混用(实测 1496 CRLF + 106 LF),跨行靶按 `\r\n` 拼会静默不命中,而不命中的变异**看起来就是「门抓到了」**(本轮 N8 第一次就是这么假成功的,靠打印锚点命中情况才发现);② 判行尾别用 `grep -c \r'` 拼命令替换,实测在 `$( )` 里会给出与 `wc -l` 相同的假数(把混用文件报成纯 CRLF),用 node 数 `/\r\n/g` 与 `/(?<!\r)\n/g`;③ 改 CRLF 源文件的注释要**字节级替换**,改完用 `git diff --stat` 与 `git diff --ignore-cr-at-eol --numstat` 对比,两者一致才证明没洗行尾。2026-08-16。

## P-106 判据里**手写的标志名**认不出同义别名 —— 门声称在守 A,实际 A 早已不成立

- **症状**:P-105 重锚后的三格里,`refundWithdrawalDebit` 那格断言的是「**退款腿保持模式无关**」,注释还特意警告「别顺手加一道会把 mock 轨退款打死的闸」。门报绿。**而那道闸早就在了**:`refundFailedWithdrawals` 首行就是 `if (fundsServerEnabled) return [];`,退款腿在服务端档整条不执行。门声称在守的那件事,在它报绿的同时**根本不成立**。
- **根因**:判据写成 `!/remoteApiEnabled/.test(callerBody)` —— **手写了一个标志名**。而 `runtime.ts` 里 `fundsServerEnabled` 与 `remoteApiEnabled` **同为** `apiRuntimeConfig.mode !== "mock"`(`app.ts` 亦注明「≡」)。同义别名一换,词元正则当场瞎掉。讽刺的是,同文件上方那段「能力上界」注释**亲手写过**这条:「① 把 `remoteApiEnabled` 换成别名函数(如 `apiIsRemote()`)—— 正则扫不到」;写下警告的人和被警告命中的是同一道门。
- **为什么比「漏一条」更坏**:假绿伪装成「已验证」。这格门每轮都在报「退款腿模式无关 ✓」,读的人会据此相信 mock 轨退款是活的、remote 轨退款也是活的 —— 而事实是 remote 轨整条关闭。**门给出的是一个关于架构的错误事实,不只是少守了一条。**
- **对策**:① 判据涉及的标志名一律从**定义处解析出等价类**,不手写(`[...runtimeSrc.matchAll(/export const (\w+) = apiRuntimeConfig\.mode !== "mock";/g)]`),解析面为空即 fail-closed 判红;② 判「这条腿被闸挡住没有」钉**正向定型串** `if (<flag>) return`,不用词元正则 —— 词元式对取反(`if (!flag)`)与装饰性提及(`const _x = flag;`)双双判绿(P-104 同族),而这两种在本格分别等于「打死 mock 轨退款」与「闸没了」;③ 判据改成钉**关系**(退款腿与扣款腿**同档**)而不是钉方向 —— 服务端持有余额时两条腿一起关是对的,一开一关才是缺陷(「扣了不退」= 丢钱、「没扣却退」= 印钞,两向同一格接住),架构哪天翻回客户端持有余额,判据不必回来改。
- **修法不是拆闸**:服务端持有余额时扣与退都归服务端,两条腿同档关闭**是对的**;错的是判据的措辞。别被「门红了就改实现」带着走 —— 先问「门声称的那件事,今天还成立吗」。
- **已转哨兵**:`scripts/withdraw-rail-alias.redtest.mjs`(挂 verify.sh [1.6] fastlane 之后)—— 6 靶全部**变异前绿、变异后红**且还原逐字节一致,其中 **4 靶是「旧判据报绿、新判据报红」**(退款腿闸被拆=印钞 / 被取反=打死 mock 轨退款 / 只剩装饰性提及 / 扣款腿闸被拆=生产轨双扣),另 2 靶守「没扣过就没得退」前置(P-105 的贡献,证明重写时没弄丢)与解析面为空 fail-closed。元验证:把同档判据削成恒真 → 红测精确报 4 靶 ✗ 并 exit 1;第 4 靶此时红的是**隔壁格**,红测按格名比对判 ✗ —— 证明它不会被邻格的红蒙混过关。
- **同族提醒**:① 凡判据里出现**手写的标识符**(标志名 / 端点名 / 键名),都要问「这个名字有没有同义写法」——有就必须解析等价类,否则失效方式恰好是**报绿**(与 P-102 提醒② 同源:靠人记得同步的清单都会静默失效);② 红测判「红的是不是**这一格**」要按**格名**比对,只看 `fail > 0` 会被隔壁格的红蒙混过关(本轮元验证第 4 靶实证);③ 靶在 `app.ts` 这类大文件里定位,用**函数体切片内的单行串**——`if (fundsServerEnabled) return [];` 全文有两处,全文级替换会打错地方,而跨行靶受混用行尾影响(P-105 提醒①)。2026-08-16。

## P-107 「禁令退役了,门没留下」—— 被审计否决过的修法,没有任何门拦住它重来

- **症状**:2026-08-16 实测,往 `src/App.vue` 的对账里塞一句 `app.applyWithdrawalDebit(wd);`,`selfcheck-fastlane` 117 格 + `tsc` + `verify` 451 格**全绿**。而「谁减记余额」这件事已经失控:第二个调用点会写扣款幂等键,而退款腿的「没扣过就没得退」正是按这个键判 —— 键被凭空置位 = 退一笔本客户端从没扣过的钱。
- **根因**:这**不是**假想中的违规。同一段代码正下方就躺着一条 🗑 记录:2026-08-13 真有人在 App.vue 对账里加过「扣款补扣格」,被 R1 独立审计**整格否决**(立论前提错 + z5 明令禁止无条件遍历补扣)。实现回退了、门也随实现一起退役了 —— 于是**禁令本身一道门都不剩**。下一个人照着同样的直觉再写一遍,不会有任何东西拦他。
- **这是一类模式,不是一次疏忽**:「实现被否决 → 把守它的门一起删掉」看起来很干净(留着就是绿着守死代码,这个理由本身没错),但删的时候**没人问「否决结论要不要留一道门」**。被否决的修法方向恰恰是**最可能复发**的那一种——它当初能被写出来,就说明它符合直觉。
- **对策**:① 判据用**集合等式**而不是「不许出现 X」:全 src 的 `.applyWithdrawalDebit(` 调用点集合必须等于「页面接了本地扣款腿就恰好是提现页那一处、没接就空集」,与同块两支同一个分流,哪条架构赢都不必回来改门;② 该格的失败方向特殊——没接本地腿时**期望就是空集**,于是「扫不到」与「没违规」产出同一个绿,故判据**自带扫描面证据**(`scannedFiles.length >= 100`),否则扫描面一坏它就是永久假绿;③ 扫描器提到模块级复用(原先block-scoped,两处各写一份必然漂移)。
- **已转哨兵**:`scripts/withdraw-rail-alias.redtest.mjs` 加 2 靶(共 12 靶,全部变异前绿·变异后红·还原逐字节一致)——「第二个减记者藏在别的文件」(补门前主线对它**全绿**,补门后红并报出具体文件名)与「调用点扫描面塌成空」(证明那道自证真会红,变异的是**门脚本自己**)。
- **同族提醒**:① **退役一道门之前,先问「它守的那条禁令是否仍然成立」**——实现没了不等于禁令没了;若禁令还在,门要**换锚**而不是删除(与 P-101「门腐烂」正好是一枚硬币的两面:那边是「实现变了门没跟上」,这边是「实现没了门跟着一起没,而规矩还在」);② 凡「审计否决了某个修法方向」的结论,落地物应当是**一道门**,不能只是一条注释——注释拦不住下一个人,而且本仓实测过注释里的同形文本反而会让扫描判据假阳/假阴;③ 「不许出现 X」型判据在**期望本就是空集**的场景下天然退化成假绿,这类判据必须自带扫描面证据(同 P-103「基数台账守不住没扫到的」)。2026-08-16。
- 🔴 **同格第二轮自查(按轴查出的两个新假绿面)**:上面那版判据扫的是 `.applyWithdrawalDebit(` 这种**调用写法**,拿「轴」复查时实测出两条它完全看不见的等价规避 —— ① **间接引用**:`const debitFn = app.applyWithdrawalDebit; debitFn(wd);`,缺陷实体与直接调用一模一样(第二个减记者、照写扣款幂等键),带左括号的判据一个字扫不到,**补此轴前主线全绿**;② **改名**:函数一改名那个串恒不命中 → 实扫空集,而没接本地腿时期望**也是**空集 → 判绿(那次靠同块邻格连带报红兜住,但本格自己是瞎的,不能指望邻格)。**治法**:判据从「扫调用写法」换成「**提到这个名字的文件集合 + 每个文件提几行**」,期望里**含定义处**(app.ts 的函数声明 + 导出、types.ts 的接口)—— 期望非空,空集就再也换不到绿,改名/删除一并判红;同一文件里多提一次(第二个减记者藏在 store 自己内部)由行数抓。⚠️ 且必须用**词边界** `/\bapplyWithdrawalDebit\b/` 而不是 `includes`:`applyWithdrawalDebitV2` **包含**原名子串,includes 版对它照样计数、行数不变,改名轴仍旧判绿 —— 这一格因此修了两次。
- 🔴 **元教训(比这一格值钱)**:「按轴查」不是查一遍就完 —— **补完一轮要拿新判据把整套轴重跑一遍**,因为新判据会带来新的轴。本轮实证:换成集合等式修好了「间接引用」,却引入了「子串包含」这条原判据没有的轴,再跑一遍才发现改名仍旧判绿。轴清单(滚动补充):删除 / 取反 / 同义别名 / 改名 / 间接引用 / 挪位 / 装饰性保留 / 扫描面塌空 / 子串包含。红测 12 → 14 靶。

## P-108 契约写对了、数字写反了 —— 门只编码了契约的一部分,剩下那面「违反」与「全绿」长期并存

- **症状**:2026-08-16 独立走查实测,首页里程碑庆祝浮层叠在已弹出的代金券领取弹层**正上方**,并用自带的 `backdrop-filter: blur(8px)` 把它糊住数十秒。而 `captcha-slider.vue` 里那张**全站层级秩序单源表**,那一行原文写的是「8900 里程碑庆祝 —— **必须在业务 UI 之下**」,紧挨着的上一行正是「790/800 业务半屏」。**注释与数值直接打架,而两道相关机器门当时都是绿的。**
- **根因**:门只编码了契约的**一个子集**。`zindex-order.mjs` 的阶梯是「登录/注册页同时挂载的 6 层」——`.ms-overlay < .nx-toast-host < .cc-sheet < .nx-mask < .cs-layer < .nx-standalone-home`,业务半屏**一条都不在表里**(全文搜不到任何半屏文件名);它另有一条天花板规则会扫全部 248 个 `.vue`,但只问「有没有超过滑块 9500」,790/800 轻松通过。`selfcheck-milestone-queue` 的 z 断言同样只比了庆祝对 toast、对 `.nx-mask`。于是「庆祝必须在业务 UI 之下」这句话,**被守住的是它跟 toast/mask 的关系,没被守住的恰恰是它跟"业务 UI"本身的关系** —— 而后者才是这句话的主语。
- **为什么比「漏一条」更坏**:契约白纸黑字写在单源表里,门每轮报绿,读的人合理地相信这条秩序成立。**门给出的是「契约已被机器保证」这个错误事实**,而实际被保证的是另一件事。P-106 是判据措辞失真,这一格是**判据覆盖面从一开始就不含契约的主语**。
- **对策**:① 判据用**扫描出的整条带**而不是手写清单 —— 业务浮层带定义为 z ∈ [700, 8999](底盘 chrome 最高 200,9000 起是瞬时/阻断层已由阶梯覆盖),断言 `.ms-overlay < min(带内全部成员)`;手写清单认不出**新加进来的面**,而扫描出的带天然认得;② 带内**扫不到任何成员即判红** —— 期望是空集的断言天然假绿(同 P-103 / P-107 提醒③);③ 同一条契约在两道门里都补(层级门守静态秩序,队列门守它跟具体两个领取弹层的关系),一道门被改坏另一道还在。
- **时间维度另立一层**:层级只是兜底。真正的修法是 `src/store/popup-arbiter.ts` 的占屏令牌 —— **同一时刻只允许一个会吃交互的自动弹出面占屏**。此前互斥靠两两手写 `!对方.open`,全站只有代金券↔试用**这一对**,加第三个面(庆祝)时没人补,于是它对谁都不让。n 个面要 n(n−1) 句判断的写法,失效方式必然是「加面时漏」。
- **已转哨兵**:`zindex-order.mjs` 新增契约③(3 靶:回退 8900 / 新增一个 z=750 的业务半屏 / 业务带扫描面塌空,全部变异后红);`selfcheck-milestone-queue.mjs` 新增 ⑤⑥ 两组(31 → 48 格),红测 4 靶全部变红且还原后回绿 —— 删掉「有人占屏就挂起」判据、层级改回 8900、底盘评弹层前不申请令牌、优先级表顺序违背拍板,各自精确命中对应格。
- **同族提醒**:① **读到「必须 X」这类注释时,先去门里找 X 的主语在不在扫描面内** —— 本格里「业务 UI」这个主语从来没进过任何一张表;② 一张**单源表**(本仓的层级秩序表)只有在**每一行都有门**时才是单源,否则它是一份「看起来权威、实际部分失效」的文档,比没有更危险;③ **盘点类结论不要只认一种触发形态**——本轮排查时我第一版把自动弹出面报成 3 个,漏了「载入时调函数再异步弹」(结算页以旧换新拦截)、「`watch` 带 `immediate`」(商品详情常驻条)、「组件自带定时器」(Nova 浮标)三类,只因扫描写法只认「载入后十几行内把开关置 true」;全量重扫后是 8 个面。2026-08-16。
- 🔴 **同格第二轮(三路独立审计后的按轴复查)**:第一版判据「z ∈ [700, 8999] 取业务浮层带」看着像扫描式,其实是**两个手写魔数**换了个位置 —— 对**窗外**违例天生失明。实测:把付款半屏退回 79/80(比下沿低一个数量级),门 `0 违例` 照报绿,而那正是「庆祝盖住锁仓按钮」的现场;审计用 `elementFromPoint` 实测命中链是 `.ms-backdrop → .ms-overlay`,点击真的被吃掉。**治法:判据换成结构式** —— 认「全屏模态遮罩」这个形态(`position: fixed` + 四边贴边 + 有 z-index),与数值无关。换判据后当场又抓出两个数值窗口看不见的同族(`globe.vue` 与 `network.vue` 的抽屉,均 z=70,两份审计都没列到)。**新轴:区间外规避**——凡判据自带数值窗口,「窗内扫不到成员就判红」只防全塌,不防违例落在窗外;窗口边界必须由被守护对象自己算出来,不能手填。另三条新轴:**同文件豁免造成盲区**(`!== SELF_FILE` 会在被排除文件内部开洞)、**测试自带接线**(集成测试自己把两个零件接起来跑,证明的是「能接对」而不是「接上了」——判据:把生产代码的接线整行删掉,测试还绿就是这一轴)、**判据在注释里也成立**(同一脚本一部分剥注释、一部分不剥,是这一轴的可靠信号;实测把编排整段删掉、字面量只留注释里,门 57/57 全绿)。红测 5 → 11 靶,门 31 → 67 格。2026-08-16。
- 🔴 **同格第三轮(清欠账清单时发现判据只认一种写法)**:第二轮把判据换成结构式(`position:fixed` + 四边贴边 + 有 z-index)之后,三处残留登记进了 `SCRIM_EXEMPT` 欠账清单。2026-08-17 清这三条时,先做了一件该做的事:**逐条摘掉、看门到底会不会红** —— 结果三条里**只有一条**真被门挡着。另两条摘掉后门照样 `0 违例`,因为**同一个「全屏遮罩」形态在本仓有三种写法,而判据只扫了其中一种**:① `<style>` 块里的 CSS 规则(判据在扫);② `<template>` 里的**内联 style**(PC 设备卡长按菜单 `position:fixed;inset:0;z-index:200`,判据先把 `<template>` 整段抹掉再扫,天然看不见);③ `<script>` 里的 **JS 样式对象**(`position: "fixed"` + `zIndex: 790`,由 `:style` 绑上去 —— 引号 + camelCase,CSS 正则一个字符都对不上)。
- **代价是实账,不是假想**:补上第三种写法后当场扫出**三处从没被任何门看见过的违例** —— `device-deactivate-sheet` / `fx-rate-line` / `wallet-withdraw` 的费用说明半屏全是 `79/80`,正是第二轮修付款半屏时那个「比 790/800 少一位数」的笔误**同族**。那一轮只修好了写在 `<style>` 里的三张,写成 JS 对象的这三张连红都没红过;`wallet-withdraw.vue` 里的注释还写着「同 device-deactivate-sheet 范式」——**笔误跟着「范式」被抄走了**,而门对这条抄写路径全程失明。
- **新轴:同一形态的多种写法**。判据认「形态」比认「数值」强(第二轮的结论没错),但**形态本身也有多种书写载体**;少扫一种,那一种就是缺陷的稳定藏身处。判断方法:问「这个东西在本仓有几种写法能表达出来」,而不是「我这条正则覆盖了几个文件」。
- **另一条新轴:清单清空 ≠ 缺陷清零**。欠账清单为空是目标状态,但「删掉清单条目」和「门真的开始管它」是两件事 —— **删条目之前必须先证明门会红**(逐条摘除实验),否则清单从「显式欠账」退化成「隐式盲区」,账面反而更好看。
- 🔴 **补完轴要拿新判据把整条轴再扫一遍(本格当场兑现)**:补完 ②③ 之后我按自己写下的规矩重扫,又找到**第四种写法** —— `class="fixed inset-0" style="z-index: 900"`:**定位来自 UnoCSS 原子类,层级来自内联 style,两者分居两处**。前三种判据都隐含「position 与 z-index 出现在同一段声明体里」,对这一种天生失明。命中 `capacity-explainer-sheet` / `tradein-ladder-sheet` 两张说明半屏——它们眼下是 900、没违例,**但补轴之前把它们改成 90 也不会红**。判据补成按**标签**取属性再判(class 给定位 + style/`z-<n>` 给层级)。至此扫描面 19 → 22 个成员、四种写法。**教训:第三轮里我一边写下「少扫一种就是藏身处」,一边自己只补到三种;规矩写完当轮必须按它自查全文,否则「焊了规则」≠「执行了规则」。**
- **已转哨兵**:`scanFullScreenScrims` 四种写法全扫;新增 `BAND_ANCHOR` 钉住这三处「必须一直在扫描面内」(与 `SCRIM_EXEMPT` 极性相反:那张是「别管这些」,这张是「这些必须在管辖内」)—— 因为**光断言数值挡不住形态回退**:把消息抽屉的 `position` 改回 `absolute`,判据就整块失明,z 掉回 110 也全绿。红测 18 → 28 靶,新增 5 条轴各一靶(内联写法 / JS 对象写法 / 原子类定位 / 形态回退 / 锚定文件消失)+ 三处数值回退各一靶 + 两处事故现场原样(提现费用说明退回 79、说明半屏退回 90)。⚠️ 顺带修掉一处**红测自己的盲区**:「扫描面塌空」那一靶原先用 `scanAll`(只认 CSS 的 `z-index:`)挑要剔除的文件,对 JS 对象的 `zIndex:` 是瞎的 → 带根本塌不空,这一靶测不到它想测的东西,已改用 `scanFullScreenScrims` 本身。2026-08-17。
- **副产物(形态归一带出的真缺陷)**:把消息抽屉从 `position:absolute` 改成 `fixed`(为了让它落进扫描面)之后,`a11y-activate` 门**立刻判红** —— 抽屉是「可开关的全屏弹层却没接 `useDialogA11y`」。这个洞一直都在(抽屉全文 `tabindex` 数为 **0**,关闭 / 分类 / 标记全读 / 条目 CTA 键盘一个都点不到,Tab 还会径直走到背景的提现下单按钮),只是**它写成 absolute 时门不把它当全屏弹层,所以从来没红过**。已按仓内统一写法补 role+tabindex(6 个控件)并接平台层焦点管理。**教训:把一个东西挪进机器门的视野,常会连带暴露它躲着的别的门。**

## P-109 i18n 门整条轴是反的 —— 只查「中文跑出词典」,不查「英文跑进界面」

- **症状**:中文态商品详情页(`/pages/store/detail?id=stellarbox-s1`)渲染出「你的手机 unavailable」。实测不止报的那一处,同页共 **4 处**中英混排(`你的手机` / `数据中心` / `在线率 SLA` / `质保` 各配一个英文 `unavailable`),外加同根的第 5 处缺陷:`speedup` 兜底成 0 时,商品名旁的倍数徽章渲染出 **`0×`** —— 在一个卖设备的页面上宣称「本机是你手机的 0 倍」。三语全中(en 态看着正常纯属巧合,英文哨兵值撞上了英文界面)。
- **根因**:`4c32a50` 做服务端权威化改造,把规格兜底从 locale-neutral 的 `"—"` 改成 `?? "unavailable"` 五处,**推翻了 `4111322` 那轮 i18n 硬编码清理的成果**(那轮刚把 `Datacenter`/`Singapore`/`24 months` 收进三语词典,还留下了 `specDatacenterValue`/`specWarrantyValue` 两个 key —— 现已成孤儿)。更讽刺的是 `product-catalog-contract.ts` 里**白纸黑字写着**「"unavailable" is a deliberate server truth, never a client fallback」,而同一个提交在页面里造了 5 处 client fallback。**注释不是门。**
- **为什么半个多月没有一道门响**:既有三道 i18n 门整条轴是反的 —— ① `i18n-hardcoded-cjk-sentinel` 判「页面里不许出现**中文**」,英文字面量天然免检;② `i18n-key-mirror` 只保证**已进词典**的 key 三语齐,压根没进词典的字符串无感;③ `product catalog i18n parity` 只查每个 SKU 有 catalog 文案,不查**字段值**怎么渲染。三道门都在看「中文有没有跑出词典」,**没有一道看「英文有没有跑进界面」**。这不是「漏了一条规则」,是**缺了一整条轴**(同 [[gate-assertion-inversion-loses-teeth]] 的族)。
- **对策**:① 哨兵值提成契约层导出常量 `SPEC_UNAVAILABLE`,页面只 import 不写字面量;② 页面收一条 `specText()` 降级映射(`undefined` / 空串 / 哨兵值 → `t.store.specValueUnavailable`),5 处调用点全走它 —— 一处映射管两个产源(mock 缺字段 + 服务端主动下发哨兵);③ `0×` 徽章补 `speedup > 0` 守卫(同页第 129 行的同款徽章本来就有这道守卫,第 94 行**漏了** —— 同一文件里同一个值两种守卫,是漏写不是设计)。
- **🔴 门自己两次被证明有盲区,两次都不是靠实景发现的**:第一版 Rule A/B 判的都是**写出来的字面量**,而 `{ k: s.specGpu, v: p.gpu }` 一个字面量都没有 —— 契约测试第 21 行明写服务端可对 `gpu`/`vram` 也下发哨兵,这两行是**裸渲染**,门全绿、mock 档也永远看不见(mock 恒给 gpu/vram 赋值)。**自查**补了 Rule C(判 `v:`/`value:` 取值)。紧接着**独立审计**又证伪了 Rule C:它只认对象字面量键值对,对 Vue 模板 `{{ product.gpu }}` 全瞎 —— `locked-product-card.vue:41,43`(商城「即将上线」卡 + 详情页锁定态,两条真实可达路径)就是这个形态,门依旧报绿。
- **判据最终形态(第三版才站得住)**:不再猜「哪里是展示位」——**渲染面上任何一次 `.<displayString 字段>` 读取都必须裹在降级映射的实参里**(括号配对求实参区间),读了不裹即违规;确有非展示用途(取数值去算术)在本行或紧邻上一行写 `spec-sentinel-ok` 显式豁免。默认收紧、例外留痕。这一版把「对象字面量 / 模板插值 / 局部变量转手 / 跨行拆分 / 字符串模板拼接」五种形态一次性收进同一条判据 —— 前两种是各漏过一次的实证形态,后三种是补判据时按轴补的。扫描面同时从 `*/store` 两个目录(23 文件)扩到全部 `src/pages` + `src/components`(249 文件):**审计实测同类漏洞完全可能落在圈外,把面收窄等于给自己留盲区**。Rule B(裸字面量)仍只圈商品域,因为别的域拿 `"unavailable"` 当状态枚举成员是合法写法。
- **教训(比这个 bug 本身值钱)**:① **判据只覆盖「错误的写法」时,对「什么都没写」天然失明** —— 兜底缺失不产生任何可 grep 的痕迹,枚举展示位形态则永远漏下一种写法,只有反过来判「读了就必须裹」才收敛;② **门写完当轮就要按轴自我证伪一遍**,别等审计——本轮 Rule C 从提出到被推翻只隔了一次独立审查,说明「我刚补的门」正是最该被攻击的对象;③ 缩小扫描面来消误报是**用盲区换清净**,正确做法是让判据本身更精确(Rule C 靠字段名定位)+ 给真误报留显式豁免。
- **已转哨兵**:`scripts/spec-sentinel-render-gate.mjs`(挂 verify.sh catalog parity 之后,含 `--selftest`)。Rule A 全仓禁 `??`/`||` 兜底到哨兵;Rule B 商品渲染面(`src/pages/store` / `src/components/store`)禁裸字面量;Rule C 见上条 —— 不扩到全仓是因为 network-rank / fx / genesis 拿 `"unavailable"` 当**状态枚举成员**是合法的。**needle 不写死,从契约源码现读**(`export const X = "..."`),常量改名或改值门自动跟着改,读不到即判红。红测 A/B 4 靶 + C 4 靶全部变异后红、还原后绿:真回归塞回(`?? "unavailable"`)/ 间接引用(`?? SPEC_UNAVAILABLE`)/ 降级文案三语全删(**此时 key 镜像门是全绿的**)/ 对照还原。selftest 逐格覆盖 删除·取反·改名·间接引用·挪位·子串包含·注释剥离·扫描面塌空(格数以 `--selftest` 实际输出为准,不在文档里写死数字)。
- **同族提醒**:① 判「文案有没有问题」的门,**两个方向都要有** —— 「本地语言跑出词典」与「源语言跑进界面」是两条独立的轴,补了一条不等于补了另一条;② 契约文件里的**注释体规则**(「X 绝不能当 Y」)是最该优先焊成门的东西 —— 它证明有人已经想到了这个坑,却只留了一句话拦不住任何人;③ 本仓 worktree 在 `.claude/worktrees/` 下,而 `vite.config.ts` 的 `watch.ignored` 含 `**/.claude/**`(P-100 的修复尚未并入 origin/UniApp)—— **HMR 与整页 reload 都拿不到新代码**,实景验证前必须先 `curl $BASE_URL/src/<改过的文件>` 确认吐的是当前源码,否则会对着旧模块判「修了没生效」(本轮实付两次)。2026-08-16。

## P-110 契约把「装饰性字段」设成必填 —— 少一个规格 = 整份目录作废 = 商城空掉

- **症状(接真后端才炸,本地永远看不见)**:`parseProductCatalogPayload` 把 8 个显示规格字段全部走 `nonEmptyString`,缺任意一个即 `invalid()` 抛错。而抛错是**整份 payload 级**的,上游 `refreshProductCatalog` 的 catch 里是 `clearProductCatalog()` + `status="error"` —— **不是「少一行规格」,是一件商品都没有**。运行时实测:拿一份按 admin-ops `BackendSku` 形状拼的真后端响应喂进去,直接 `PRODUCT_CATALOG_RESPONSE_INVALID`。
- **为什么缺失是常态而非异常**:① `uptime` / `warranty` / `phoneDailyEarn` / `phoneDailyEarnNEX` 这 4 个字段**后端根本不存在** —— admin-ops 全仓 `.ts/.tsx` 零命中(既无 DTO 字段、无运营录入框),数据字典 `nx_admin_device_sku` 无此列,前后台两份 PRD 均未承诺;它们只活在前端 `src/mock/products.ts`。② 另 4 个(`gpu`/`vram`/`power`/`datacenter`)后端 DTO 是 `string | null`,后台表单 `formToSku` 是 `f.power.trim() || undefined` —— **运营在后台把功率输入框留空,线上商城就空掉**。
- **判据本身自欺在哪**:测试文件名叫「strict specification contract」,4 个 case 全都从一个**带齐 8 个字段**的 fixture 派生,于是「字段压根不在」这一格从来没被测过。同 [[gate-assertion-inversion-loses-teeth]] 的**缺失轴**:判据只覆盖「值写错了」,对「值没写」天然失明。
- **对策**:显示规格改 optional —— 缺失 / null / 空白 → `undefined` → 渲染层降级成本地化占位串(P-109 那条降级路径正好是它的落点);**类型不对仍然拒收**(数字/对象照样抛)。`Product.gpu` / `vram` 也从必填改可选,与后端可空对齐。规格不全这件事**本来就有专门的优雅通道**:`purchaseBlocked` + `purchaseBlockedReason`(服务端标「未认证故不可购买」),旧写法等于把同一诉求又实现了一遍、还实现成了灾难性的 —— **同一个关切有两套实现时,先问哪一套的失败模式更小**。
- **已转测试**:`product-catalog-contract.test.ts` 加 3 格(服务端整批省略 8 字段仍出货 / 每个字段 × undefined·null·""·空白 四种缺失形态逐格不抛 / 类型不对仍抛)。红测:把契约改回 `nonEmptyString`,精确是新加的那两格变红,还原后 7 格全绿。
- **同族提醒**:① **「严格」和「致命」不是一回事** —— 判据严格是好事,但失败半径要与字段重要性匹配:装饰性规格不该有能清空整个目录的权力;② 契约字段的必填性要**回源后端**核实,别按前端 mock 的丰满程度推断(mock 把 8 个字段填得齐齐整整,正是它掩盖了 4 个字段在后端压根不存在);③ 本轮那句中文测试断言消息被 `i18n-hardcoded-cjk-sentinel` 逮住 —— 测试里的诊断串也算源码,写英文。2026-08-17。

## P-111 前端契约里的「幽灵字段」—— 后端从来没有,却当商品属性养了很久

- **背景**:P-110 把 8 个显示规格改可选后,页面不再崩,但代价是接真后端时在线率 / 质保 / 手机对比三行**永久显示「暂无数据」**,「117× 你的手机」这个核心转化钩子形同废掉。查后端才发现根子不在「后端还没实现」,而在**归属搞错了**。
- **事实(逐条回源核实,不是推断)**:`uptime` / `warranty` / `phoneDailyEarn` / `phoneDailyEarnNEX` 四个字段 —— admin-ops 全仓 `.ts/.tsx` 零命中(无 DTO 字段、无运营录入框)、数据字典 `nx_admin_device_sku` 无此列、前后台两份 PRD 均未承诺。它们**只活在前端 mock**,而 mock 把它们填得齐齐整整,于是本地永远像「后端会给」。
- **正解不是等后端加列,是各归其位**:① **在线率**是平台统一的托管承诺(改前对每件商品都渲染同一个 99.9%)→ i18n 文案;② **质保按 SKU 不同**(整机 24 个月、Pro v2 / Rack P1 五年、Rack P2 十年,各自卖点文案里写着)→ 收成**月数** `warrantyMonths`,单位由前端按语言拼(与 `ai.*` 同一个已跑通的模式),天然三语;③ **手机日收益**是平台手机档位配置,`mock/phone-tiers.ts` 的注释里早就写明 **Tier 3 锚定「典型手机」($0.06/d)营销口径**,remote 档由 `/api/config/phone-tiers` 覆盖整张表 → 走 `typicalPhoneDailyUsdt()`。三者都**离开商品契约**。
- **🔴 差点自己造出一个假承诺**:我给主人的推荐原话是「在线率、质保是全平台统一承诺,放回文案即可」。**质保那半句是错的** —— 照做会让 10 年质保的 Rack P2 在规格表显示「24 个月」。更要命的是**改前就已经是这样**了:4c32a50 之前那行渲染的是固定文案 `specWarrantyValue: "24 个月"`,对所有 SKU 一视同仁。也就是说这个假承诺在页面上挂了很久,谁都没发现,因为它「看起来很合理」。**发现它靠的不是审查,是动手前把 6 个 SKU 的数据逐个列出来比对。**
- **教训**:① 字段该归谁,判据是**「它会不会随这个实体变」**——不随商品变的(平台 SLA)放平台层,随商品变的(质保年限)必须留在商品上;把二者搞混,一个方向是重复存储,另一个方向是**假承诺**;② **给主人的推荐里每一个「XX 是统一的」都要有数据支撑**,我这次是凭「听起来像平台承诺」下的判断,查数据当场被推翻;③ 幽灵字段的识别法:前端契约要求它 + 后端全仓零命中 + PRD 未承诺 + **mock 里填得很完整** —— 第四条是它能长期存活的原因。
- **已转测试**:契约测试新增两格 —— 「不许把这四个字段投影回商品模型」(即使服务端硬塞也不接)与「质保只收正整数月、字符串/0/负数/小数一律拒收、null 降级」。哨兵渲染门的字段表现读自契约,自动从 8 个收窄到 4 个。2026-08-17。

### P-111 附:全站运行时遍历扫出的一条(抽查漏掉的)

走 `done-review` 维度④「同形全扫」时逐个跑完 6 个 SKU + 商城列表(而不是抽查 2-3 个),扫出 **Cloud Share 渲染了一张硬件规格表**:GPU「Distributed」/ 显存「—」/ 功耗「暂无数据」/ 数据中心「暂无数据」/ 在线率 99.9% / **质保「暂无数据」**。它是 $19.9 的入门级日产出产品,用户**不拥有任何硬件**,谈不上质保;PRD §7.2 的 Cloud Share variant 也明写要隐藏硬件专属区块(点名了 ROI hero strip 与计算器,没点名规格表 —— 实现照着字面做,于是规格表留下了)。

这条**不是本轮引入的**:改之前它渲染的是 4 个英文 `unavailable`,现在是 3 行「暂无数据」,已经变好但没到位。**留作待拍板**,因为「空规格行该隐藏还是该显示占位串」是影响全部 SKU 的信息架构决定,不该由实现方单方面又改一次。

- **方法论价值**:这条是**抽查绝对扫不到**的 —— 我先抽查了 S1 / Rack P1 / Pro v2 三个,全绿;第 4 个才炸。矩阵要求「全站运行时遍历,不 grep、不肉眼抽查」不是仪式,`done-review` 走完整比走形式多找出一条。

### P-111 附 2:空规格行按行隐藏(主人 2026-08-17 拍板)

上一条附记留的拍板项已定:**规格表里没有值的行整行不渲染**,而不是显示「暂无数据」。空行不携带信息,在购买页上印一行占位反而像「我们还没告诉你」。实测 Cloud Share 的硬件规格表从「GPU / 显存 / 功耗暂无 / 数据中心暂无 / 在线率 / 质保暂无」6 行收敛成「GPU / 显存 / 在线率」3 行;有值的机型一行没少(Rack P1 仍是 GPU / 显存 / 功耗 / 在线率 / 质保「5 年」)。

- **判据取源值,不比对渲染串**:拿「这一格是不是等于本地化占位文案」来判空,会在文案改字或切语言时静默失效。行构造器 `specRow(label, raw)` 收在 `lib/product-copy.ts`,与 `specText` 同处消化哨兵值。
- **单值展示位不适用**:卡片上的「GPU · 显存」是一行内的并列值,隐藏一侧要处理分隔符,继续用 `specText` 的占位串。「按行隐藏」只适用于表格行。
- 🔴 **改写法时别给自己的门打豁免**:换成 `specRow` 后,哨兵门的 Rule C(渲染面读了字段就必须裹在认可的包装里)会认不出新写法。**正确做法是把新包装收进认可名单**(它同样集中消化哨兵值),不是在调用点撒 `spec-sentinel-ok` —— 后者等于在门最该守的地方逐个拆牙。名单里只许收「集中消化哨兵值」的函数,每多一个,Rule C 的判定面就少一块。配套红测 2 靶:拆掉包装裸读判红、包装函数改名判红(证明是「认了新写法」而不是「放松了」)。

## P-115 worktree 下的 dev server **没有 HMR** —— vite 把 `**/.claude/**` 整个拉黑,而 worktree 根就在它底下

- **症状**:在 `.claude/worktrees/<x>` 起的 dev server 改文件不热更、也不整页 reload;浏览器里跑的是**旧模块图**,与磁盘不一致却毫无提示。实测形态:改了 checkout.vue 的 cleanup 逻辑,页面「返回后会话保留态没写盘」,像是逻辑坏了 —— 其实浏览器根本没拿到新代码;更阴险的是**混合图**(有的模块新有的旧),行为看似随机。
- **根因**:`vite.config.ts` 2026-08-15/16 为断 junction 递归环(主 5173 连崩)加了 `server.watch.ignored: ["**/.claude/**", …]`。该 glob 按**绝对路径**匹配,worktree 根 `…/Nexion-uniapp/.claude/worktrees/<x>/src/**` 全命中 → 自己的源码一个都不监视。
- **对策**:① worktree 里每次改完源码**冷重启** dev server(kill → 起),再验;② 判「代码坏 vs 环境坏」先 `curl <dev>/src/<file>` 与磁盘 grep 比对(同 [[feedback_dev_server_stale_module_graph]]);③ 根治候选(未落地,待主人点头):把 ignore 改成只拉黑**本树根**下的 `.claude`(`path.resolve(__dirname, ".claude") + "/**"`),主检出仍断环、worktree 恢复监视 —— 改的是共享构建配置,归包外决策。2026-08-16。
- **已修(2026-08-17 接手合并 pkg/zv)**:根治在 P-100 —— `vite.config.ts` 把 ignore 锚到本配置文件所在树(`${selfDir}/.claude/**`),worktree 源码恢复可见,`scripts/vite-watch-anchor-gate.mjs` 守住不退回通配写法。本条保留作诊断口径(判「代码坏 vs 环境坏」的 curl 比对法仍适用);「冷重启」不再是必需动作。

## P-116 同路由推栈 / 重定向后 chassis 导航头被**上一页的卸载清掉**(useSetPageHeader 曾是无主单槽)

- **症状**:① `checkout(B)` → 浮动条 push `checkout(A)?resume=…` → 返回 B:B 的返回键与「Checkout」标题**没了**,浮动条压住 Review order 标题(T3 黑盒 P1-1,主路径确定性复现);② 同路由 `uni.redirectTo` 也一样;跨路由 redirectTo 反而正常。
- **根因**:`usePageHeader` 是全局单槽 store;页面 A 的 onHide/onUnmounted 与页面 B 的 onShow **没有先后保证**——A 卸载晚一拍执行 `clear()`,把 B 刚重新 set 的头抹掉。
- **落地修法(1722cd9)**:单槽保留,但**记 owner**:`set(payload, ownerSymbol)` / `clear(ownerSymbol)`,`useSetPageHeader` 每个页面实例一个 symbol,clear 只清自己登记的那条 —— A 的晚清对 B 是 no-op。为什么不改成「按实例的表」([[feedback_single_slot_model_must_be_a_list]] 一族):渲染面永远只要「当前页那一个头」,表只多存了永远不渲染的历史;owner 标记已经把「谁的清谁的」这条不变量钉住,再加表是给不存在的消费者建模。它依赖 onShow 重新 set(P-044 的补丁)——两者互为前提,写在 use-page-header.ts 头注释里。
- **顺带的对策**:结算撞单「保留它」= 什么都不动(不再原地切商品,原地切换方案已被 T2 推翻);浮动条从任何页(含另一结算页)一律 `navTo` push。
- **同族提醒**:全局单槽 store(page-header / sticky-cta / 各类 sheet 的 open 位)凡是「谁 set 谁 clear」而 set/clear 分属两个页面实例的,都要问一句「清的是不是自己那条」。2026-08-16。
- **同族第二例(2026-08-17,审计 R5 P0,运行时红测复现)**:结算页的抵扣上下文 `tradein.appliedTradein` 也是无主单槽 —— 浮动条 / 绑卡返回让两个结算页实例同栈,上层实例 cleanup 的 `clearApplied()`(含晚一拍的 onUnmounted 第二次调用)把在世实例的抵扣抹掉,它的活票随即按全价复算、被「金额已变」拒单并销票(用户已转的钱成孤儿)。修法同款:store 记 owner(`applyTradein(..., owner)` / `clearApplied(owner)` 只清自己的)+ 页面镜像自己可见时的选择、onShow 重挂 + cleanup 幂等(`pageAlive` 门,第二次直接返回)。**判据**:一个页面写全局单槽后,把它 push 出第二个自己再返回,槽还在不在。

## P-117 钱路上「落盘 / CAS 的判决当语句丢掉」是一族,不是一处 —— 逐轮补调用点补了五次才升成 AST 门

- **症状**:同一形状在审计 R4→R6 连出五次:`persistAccountSnapshot();`(旧机下架没落盘,设备复活扣款照旧)、orders `persist();`(内存孤儿单)、`voucher.markUsed()` 返回 void(单次券两处各结算一次)、free-trial `persist();`(convert 报 ok 但没落终态,试用福利可二次兑现)、`writeAccountRow()` 写恢复行(唯一补写入口随 onShow 蒸发)、`voucher.release()`(券放不回还弹「什么都没记录」)、orders `advanceOrder` 的 `persist();`(下一 tick 再发一台设备)。每一处单看都像「忘了接返回值」,合起来是**结构**:store 的写盘原语返回布尔,页面把它当动作而不是判决。
- **为什么补调用点收敛不了**:调用点是开放集合(每一轮修法自己都会新增),审计只能抓已存在的;而「返回值被丢弃」不产生任何运行时痕迹(mock storage 平时不坏),tester / 运行时门都看不见。
- **升层**:`scripts/selfcheck-persist-verdict.mjs` —— TypeScript AST(vue 只取 `<script>` 块),钱路 6 个文件里 17 个落盘 / CAS / 资金原语(`persist / writeAccountRow / persistAccountSnapshot / markUsed / release / consume / restoreMoney / debitBalance / creditBalance / createOrder(s) / cancelOrder / postMoneyBill / postReceiptOnly / commit …`)**不许作为裸表达式语句出现**;`void x()` 是显式丢弃放行,确需忽略写 `persist-verdict-ok: <理由>`。`--selftest` 4 红 7 绿,真文件塞一行 `persist();` 即红;已挂 verify.sh。首跑抓 14 处(含审计的 2 处 + 12 处同形),逐个消费或标注理由(远端命令键 4 处 → HANDOFF U-21)。
- **同族提醒**:① 「返回布尔的动作」在钱路上必须被 if / const / return 接住,接不住就写下为什么;② 一族修到第二次就该问「能不能机器测」——这条本可以在 R4 就焊,晚了两轮;③ 门的判据用 AST 不用正则:换行 / 链式 / 泛型实参 / 模板字符串都不影响,正则版一定漏。2026-08-17。

## P-118 「已接入名单」型的门,对压根没接的页面天然隐形 —— 空态门 20/20 连绿,而空白页就在名单外

- **症状**:创世市场 `#/pages/genesis/marketplace`「在售(0)」时,页签下方约 400px 纯空白(探针确认该区间零元素)。同页「我的」页签有空态,订单 / 商城 / 收据页也都有空态,唯独这里没有。而空态哨兵 `scripts/empty-state-probe.mjs` 一路 **20/20 报绿**,建门至今没红过。最后是靠人肉全站走查抓到的。
- **根因**:那道门的 `ROUTES` 是**手工登记表**,注释写明语义是「接了 EmptyState 的页面」。门本身很硬(逐页强制清空 store 数组让空态显形 + 断言 `.nx-empty` 出现 / 插画 `naturalWidth>0` / 标题非空 / 不横向溢出 / 零 console error),但**判据的定义域由名单决定**:压根没接空态的页面不在名单里 ⇒ 它对这类页面**天然失明**。门守的是「已入册的变差」,守不住「没入册」。同族根因见 [[count-ledger-blind-to-unscanned]](总数恒等式两边同源)。
- **落地修法**:① 两个空分支(listings / activity)改接全站共享的 `components/empty-state.vue`(《06 缺省页规范》唯一实现,与订单 / 商城 / 收据同款),**不新造样式**;② 把 `pages/genesis/marketplace` 登记进 `ROUTES`,门从 20/20 变 21/21。
- 🔴 **未收口的那条轴(补名单 ≠ 补门)**:「哪些页**该有**空态却没有」仍在这张表的视野之外——今天补的只是本页纳管,下一个漏接空态的页面依旧隐形。真要守住得**反过来判**:凡渲染列表 / feed 的模板分支,要么有空态兄弟分支,要么带显式豁免标记;候选必须落进一个有账的桶,不许静默跳过(构造性判据,别再用名单)。**这条尚未实现,是已知欠账。**
- **同族提醒**:看到白名单 / 登记表 / `EXPECTED_N` / 「已接入 X 的清单」这种形状,一律先问一句——**没入册的东西谁来发现?** 答不上来,这道门就只是在给已知项做回归,不是在做覆盖。另:被这类门保护的样式别顺手删,`emptyCardStyle` 那种**空态整框虚线是合法保留项**(与「卡内横向虚线清零」不是一回事)。2026-08-17。

## P-119 运行时探针会被机器负载压红:判「真红 vs 抖动」只认干净树 A/B,不认重跑一次

- **症状**(2026-08-17,一天内三条包各撞一次):`verify-h5-runtime.mjs` 家族的探针(`guard-liveness-runtime` 周期性权限守卫 · `auth-guard-verify` 路由覆盖 · `backnav-check`)在全量门链里**随机红一条**,判据文案长得像真缺陷:「登出态经评审页进业务页,20s 内仍停在 pages/me/wallet-withdraw —— 周期性权限守卫没在工作」。同一棵树、同一条命令,前后跑四次是**绿绿绿红**;而且**重试机制内两次重试红在不同探针上**(第一次 guard-liveness、第二次 auth-guard)。
- **根因**:这几道探针都带**墙钟上限**(20s 内必须完成跳转)。本机常有 3-6 个会话并发跑 dev server + Playwright 实例,负载一高就够不到那个上限。它红的不是代码,是**当时的机器**。
- 🔴 **判据(别再靠「重跑一次绿了就算了」)**:重跑复绿只能证明"这次没红",不能证明"红的不是我"——万一是竞态型真缺陷,重跑同样会时绿时红。**要的是 A/B**:
  1. 拿一棵**不含本次任何改动**的干净树(`git worktree add … --detach origin/UniApp`),
  2. 在它上面单跑那道门(`node scripts/verify-h5-runtime.mjs`,它自带隔离起服,不需要全量链),
  3. **干净树红在同一条判据 = 与本次改动无关**;干净树绿而本树稳定红 = 真是自己引入的,老老实实查。
- **配套**:单跑一道门约 1-2 分钟,全量链约 13 分钟——**先 A/B 再决定要不要重跑全量**,别一红就无脑重跑整链。多轮重跑还会让「跑绿的那棵树」与「要合的那棵树」不断错位(合并守卫按树对象比对),越跑越合不进去。
- **反面**:也别把这条当免死金牌。**同一道门连续在干净树上红** = 主线真有问题,该报该修;判据是「干净树同判据同样红」,不是「我觉得是抖动」。2026-08-17。
## P-120 全套 i18n 机器门只守**中文**这一面 —— 英文文案跑进界面,456 格门一条不响

- **症状**:`src/components/me/wallet-card.vue` 的槽位行长期写成 `{{ onlineCount }} live · {{ emptySlots }} slots open`,中文 / 越南语界面**直出英文**。发现它靠的是独立验收 agent 在越南语截图里**肉眼**看到,不是任何一道门。
- **根因是整条轴单面**,不是某一道门写坏了:`i18n-hardcoded-cjk-sentinel` 判「不许出现中文」(它最后一条红测 `["纯英文页面 0 命中", …, "<view>Loading…</view>", 0]` **明确把英文放行**);`i18n-key-mirror` 只保证已进词典的 key 三语齐,压根没进词典的字符串无感;`spec-sentinel-render-gate` 只守 product-catalog 那一个哨兵值。三道门都在看「中文有没有跑出词典」,没有一道看「英文有没有跑进界面」。
- 🔴 **判据形状是量出来的,不是猜的,而且第一直觉被数据推翻**。起点直觉是「≥2 个连续小写英文词即拦」。先写粗探针量规模(249 个 `.vue`、渲染位上含拉丁字母 244 条),再逐条人工分类,结论是这个判据会**漏掉大多数真违规**:
  | 词形带 | 样本 | 真违规实例 |
  |---|---|---|
  | ≥2 小写词 | 9 | `No completed task earnings yet.` |
  | 1 小写词 | 18 | `Task lock` · `{{n}} min` · `{{n}}d ago` · `$… vol` · `… matured` |
  | 0 小写词 | 145 | `Unavailable`×3 · `Cooling` · `VERIFIED` · `YOU` / `DIRECT` / `EXTENDED` · `Earns +$…/d` |
  全大写与首字母大写的单词同样是文案,占真违规的一半以上。**判据换成构造式**:渲染位上出现的**每个**英文词都必须被显式授权(ticker / 品牌 / 认证注册名 / 单位 / 格式掩码),否则拦 —— 与中文门同一个方向(必须不具备,而不是不得含某些词)。
- 🔴 **反过来,判定面必须收窄,否则候选淹没真命中**:`<script>` 里的字符串字面量有 **15579 条**(≥2 小写词的 6317 条)—— 英文是代码本身的语言,路由 / 存储键 / 事件名 / class 名全长这样,判据无从区分「文案」与「标识符」。那条轴要守只能靠**出口收口**(toast / throw 走同一个必须收 i18n key 的入口),不是字面量扫描。已写进门文件末尾的 KNOWN GAPS,不留给下一个人重新发现。
- **落地**:`scripts/i18n-hardcoded-en-copy-sentinel.mjs`,判定面 = 模板文本节点(含内联 SVG `<text>`)/ 静态可见属性(绑定写法自动排除)/ 插值里的展示位字面量(比较位操作数挖掉)/ `pages.json` 标题;`--selftest` 53 格逐条隔离;已挂 verify.sh。首跑抓 **55 处**:44 处收进三语词典(30 个新 key,其中 8 处发现**词典里早就有对应 key**、页面只是没去读),11 处工程话 / 丝印写 `i18n-en-ok: 理由` 留痕。
- **区域感知的注释剥离器**从中文门抽到 `scripts/lib/sfc-strip-comments.mjs` 两门共用 —— 留在一处让另一处复制,就是「修了一道门、漏了另一道」的标准形态(`lib/strip-code.mjs` 的文件头注记着同一个坑)。中文门那批注释红测同时是共享模块的回归靶。
- 🔴 **门的「0 命中即失效」判据当场证明自己有用**:`CertiK audited` 收进词典后 `CertiK` 在判定面再无命中,门立刻判红要求删掉这条授权。死授权不是「白留一条」,它是给未来英文文案开的静默后门。
- **同族提醒**:① **一道门的红测里那条「阴性放行」样本,往回读就是它的盲区声明** —— 中文门写着「纯英文页面 0 命中」,那句话本身就是这个缺口的自白,半年没人往回读;② 不变量是「双语 / 三语」时,问一句**每一面都有门吗**,别只数门的条数(456 格门,英文那面 0 格);③ 判据形状定型前先量规模,量出来的分布会推翻直觉(本轮直觉判据会漏掉 60% 的真违规)。2026-08-17。

### P-120 追记(同日,独立审计 3 P1 + 20 P2 之后):门 v1 的判定面是「表层形态白名单」,整族同义别名逃逸

第一版判定面按「属性名白名单 + 双引号 + 非绑定写法」圈,独立审计当场证伪:

- **活证据**:`src/pages/store/bundle.vue:97/114` 的 `:aria-label="`Remove ${p.name}`"` 是读屏用户听得到的英文,门 0 命中 —— 因为它是**绑定**写法。而门注释里给的理由「绑定属性的值是 JS 表达式不是文案」对 `:title="t.x"` 成立、对 `:title="'No orders yet'"` 不成立;错的是**理由**,不是漏了一条。
- **同族**:单引号 / 无引号属性放行(宽严取决于引号风格,而这条纪律中文门早就立过);任何没进白名单的组件 prop 放行(`desc` 单项 32 个调用点)。
- 🔴 **根因是形状**:`VISIBLE_ATTRS` 是**手写闭集 × 开放集合**(组件 prop 可以随时新增),失败形态是静默全绿 —— 本仓元门 `selfcheck-gate-targets.mjs` 的全部教训就是这一条,我把它又踩了一遍。

**改法是反转,不是补名单**:属性**默认进判定面**,靠「非文案属性名」豁免表挖掉(几何 / SMIL 动画 / ARIA 状态 / 输入机制 / 事件处理器 / 枚举 prop,每组带理由 + 0 命中即失效)。新增一个展示 prop 默认被判,而不是默认逃逸。

- **反转的代价是可量的**:全量首跑 274 处,逐一分类后噪声收敛在 **31 个属性名**(SVG/HTML/uni 属性是标准化的闭集),补完豁免表剩 **2 处 —— 正是白名单漏掉的那两条活证据**。判定面反转的正确性判据就是这个:噪声集合有限且封闭,真命中留下来。
- 授权词也从「词级」升了一层:`Type` / `Level` / `Node` 是认证注册名(`SOC 2 Type II` / `PCI DSS Level 1` / `Genesis Node`)里的**普通英文名词**,按词授权会让 `<text>Node Type</text>` 整句放行。改成 `TECH_PHRASES` 整串授权,拆开的单词不放行。

🔴 **五条可迁移的门设计教训**(比这个 bug 值钱):

1. **一道门红测里的「阴性放行」样本,往回读就是它的盲区声明。** 中文门写着 `["纯英文页面 0 命中", …, "<view>Loading…</view>", 0]` —— 那句话本身就是本缺口的自白,躺了半年没人往回读。**审一道门先读它的阴性样本**。
2. **豁免防线必须按「门自己推荐的写法」测。** v1 的「裸标记不算豁免」在**同行注释**写法下恒不成立(`<!-- i18n-en-ok: --><text>Dev build</text>` 里被判的那个 `<text>` 自己冒充了理由),而同行正是门在失败提示里推荐的写法。4 条豁免红测全把裸标记放在独占行上 —— 变异集缺了「标记与代码同行」这一整条轴。
3. **假绿防线要护「判决」路径,不只护「抽取」路径。** v1 的授权词存活台账绕过 `unauthorized()` / `exemptAt()` 独立累计,于是把判据整体取反(`unauthorized` 恒空 / `exemptAt` 恒真)时,台账照样满格、门照样 PASS。判决函数本身要有红测钉住。
4. **判「在不在注释里」别自己配注释语法 —— 用剥离器留下的空白痕迹。** 自配 `<!-- … -->` 的版本在**多行注释的续行**上必瞎(那一行看不到开头),而仓里 5 处豁免恰恰都写在多行注释最后一行,全量实测当场翻红。判据换成「`src[i]` 非空白而 `clean[i]` 是空白 ⇒ i 在注释里」,顺带把「理由只能取注释内的字符」也一并精确了。
5. **门的存活台账意外地是最强的抗变异装置。** 对照实测:把抽取面删掉 / 削弱(T 面、A 面、I 面、扫描目录)共 9 种变异,全部被「授权词 0 命中即失效」判红 —— 因为削弱抽取面会让授权词一起消失。设计这条台账时想的是「防死授权」,实收是「防判定面塌缩」。

**另外两条环境教训**(不是门的问题,是验门的方法):

- 🔴 **模板里打一个空格不等于渲染出空格。** 把分隔空格从词典值的前导空格挪进模板后,Vue 的空白折叠把标签边上的空白删掉,实景渲染成 `+$550来自复投`(粘字)。要显式拼进表达式(`{{ " " + fmt(...) }}`)。**「把不可见契约显式化」这个改法本身也会引入不可见契约。**
- 🔴 **注入语言必须在 app 启动之前。** locale store 只在 app init 时 hydrate 一次,之后写存储 + hash 导航不会重新 hydrate —— 于是「三语走查」三轮全在验同一种语言,而输出看起来完全正常(页面确实是本地化的,只是同一种)。正确做法:`context.addInitScript` 写 `uni` 的存储壳格式(`{"type":"object","data":{…}}`,直接写裸 JSON 读不出来)+ 每种语言用**独立 context**。验完要能给出「en 下 30 个英文原串全部仍在(渲染等价)/ zh·vi 下只剩 N 个」这种双向数字,单向只看「变中文了」证明不了没改坏英文。

### P-120 追记 2:套件**运行期间**改 `scripts/verify.sh`,会崩成「语法错」的样子

- **症状**:`npm run test:legacy-suite` 跑到一半突然 `scripts/verify.sh: line 1927: e: command not found` + `line 1929: syntax error near unexpected token 'fi'`,只跑了 356 格(下限 400),套件自带的下限守卫判 FAIL 并提示「中途中止,不是判红」。
- **根因**:bash **按字节偏移增量读**脚本,不是一次性载入。我在它执行到一半时改了同一个文件(给两条日志名加 PID),文件长度变了,bash 从错位的偏移继续读,读出半条命令。
- **判据**:比 `scripts/verify.sh` 的 mtime 与日志最后一行的时间 —— 本例 19:06:58 改、19:07:07 崩,9 秒。**先看这个,再怀疑代码**。
- **教训**:① 套件在跑时,`scripts/verify.sh` 与它 `source` 的任何 shell 文件一律不许动(`.mjs` / `.ts` 无此问题,node 每次是新进程、整文件读);② 这种崩法**长得像自己刚写的代码有语法错**,最容易把人引去改无关的东西 —— 套件自带的「跑格数低于下限即判中止」那条守卫在这里救了一次,它比红门数可信。
- **同族**:[[suite-run-mutates-source-in-place]] 说的是反向(套件会就地改 `src/` 再还原);这条是「我改了套件正在执行的脚本」。两条合起来的口径:**套件在跑 = 树处于不可变期,双向都别动。** 2026-08-17。
## P-121 `<svg>` 里的 `<text>` 在 uni H5 下编成 `<uni-text>`,**0×0 不渲染**

- **症状**:内联 SVG 里的文字标签用户完全看不见。实测 `src/pages/team/network.vue` 的关系网示意图中心节点上没有「你 / YOU」、两条轨道环上没有「直推 / 扩展」;`src/components/store/product-render.vue` 的产品渲染图上没有丝印与 GPU/CPU/RAM/SSD 字样。
- **判据**:`document.querySelectorAll("svg text").length === 0`,而 `svg uni-text` 有 6 个、`getBoundingClientRect()` 全是 `0×0`。原生 SVG 需要 `<text>` 元素,uni 把模板里的 `<text>` 一律编译成自定义元素 `<uni-text>`,它不是合法的 SVG 子元素,浏览器不排版。
- **范围**(精确扫,不是估):模板 `<svg>…</svg>` 之内的 `<text>` 共 **4 个文件 / 13 个节点** —— `product-render.vue`×3 · `globe.vue`×1 · `binary-how.vue`×5 · `network.vue`×4。仓内其余 `<text>` 都在 SVG 之外,是正确用法。
- **与本轮的关系**:这 13 个节点里有几个是硬编码英文(`YOU` / `DIRECT` / `EXTENDED` / `CLOUD SHARE` / `DISTRIBUTED · NO HARDWARE`),英文文案门照判(判据是「渲染位上有没有英文」,而它们在源码上确实是渲染位)。把它们接进词典**不改变可见结果**,因为压根不可见 —— 这属于**另一个缺陷**:该有的文字不在。
- **留给主人拍板**(不擅自改):要让 SVG 里的文字显示,得改画法(改用原生 SVG `text` 需要绕过 uni 的组件编译,或者把文字挪到 SVG 外用绝对定位叠上去),这是全仓示意图的画法决定,不是单点修补。**判据教训**:`<text>` 在本仓有两种语义(uni 组件 / SVG 元素),写在 SVG 里的那种是**静默失效**——不报错、不留痕,只是没有字。2026-08-17。
### P-121 追记(2026-08-17,包 aw):修法 = `<SvgText>` 渲染函数组件;两道门;两颗顺手挖出的雷

- **修法(H5)**:`src/components/svg-text.ts` —— `defineComponent` + `h("text", attrs, slot)`,不经模板编译的标签改写;Vue 把父级 `<svg>` 的命名空间传给子组件子树,所以它以 `createElementNS(svg,"text")` 建出**真 SVG 文字**。4 文件 13 处 `<text …>` 只改标签名为 `<SvgText …>`,属性 / 绑定 / `v-if` / `v-for` / `i18n-en-ok` 注释全部原样;丝印与芯片字样字重 700/800 → 600(V5 上限,之前不可见故无人管)。实测(mock,`?nx_device=off`,414×896):4 路由 16 个 `svg text` 全部 bbox>0,en/zh/vi 三语各自出词典值,console 0。
- **为什么不是 foreignObject / 绝对定位叠字 / v-html / canvas**:候选逐项评估见 `docs/changes/2026-08-17-svg-text-render.md`。一句话:问题的本质只是「`<text>` 在 uni 模板里有两个意思」,给 SVG 那个意思一个不会被改写的名字就够了 —— 零几何重算、零结构重排、i18n 三道门继续判到这些文本节点;foreignObject 的换行优势这 13 处用不上却要 13 份盒几何 + WebKit filter/transform 下的历史坑;叠字是两套坐标系的长期税;v-html 让文案离开模板判定面且它对 App 的好处本环境证不了(见 P-124);canvas 丢交互丢主题。仓内 lucky-spin 转盘用的是 v-html 版(先例保留,不改)。
- **两道门(同一提交落地;独立审计 A1 后加固)**:发现谓词(svg 跨度带深度、自闭合不开跨度、属性值里的 `</svg>` 不算、foreignObject 岛、SvgText / svg-text / 别名 import、`<text>` / `<component>` / `v-html` 候选)抽在 `scripts/lib/svg-text-predicate.mjs` **两门共用一份** —— A1 P1-2 指出两门各写一份谓词时源码门的每个盲区同时就是运行时门的盲区。`scripts/svg-text-source-gate.mjs`(源码:svg 内禁 `<text`/`<Text` · **同族** uni 内置标签(view / image / switch / button …)也禁 · SvgText 只许在 svg 内(抽出的子图组件用 `svg-text-outside-ok:` 注释放行)· 用了必 import(kebab / 大小写变体 / 别名一律认)· 启用 attributify 即红 · 判定面塌缩判红;`--selftest` 48 格)+ `scripts/svg-text-render-probe.mjs`(运行时:逐路由 `svg text` 数量 ≥ 期望(v-for 承载的写 min+whyMin,min≤0 判红)· bbox 宽高**都** > 0 · 非空 · **可见**(自身与祖先 visibility / opacity 链、fill alpha、fill-opacity)· svg 盒内 · 文档内 · 未被 overflow:hidden 祖先裁掉 · `svg uni-text`=0 · **全页 svg 元素呈现属性 == 计算值**(font-size / letter-spacing / font-weight / opacity / fill-opacity / stroke-width;attributify 劫持在这里现形)· console error 与 **Vue「Failed to resolve component」warn** = 0;svg 里有任何文字候选的文件必须登记路由,未登记即红不静默跳过;`--selftest` 38 格用合成页面逐条隔离)。真文件红测:塞回一个 `<text>` → 源码门 [svg-text] 红 + 运行时门 [uni-text-in-svg] 红;kebab `<svg-text>` + 删 import(A1 P0-1 原案)→ 源码门 [svgtext-import] 红 + 运行时门 [count]+[console VUE-WARN] 红;整份备份还原后 hash 相等、复绿。 **第二轮对抗审计(A2)后再加固**:`<SvgText>` 渲染出的文字带出处标记 `data-svgtext`,运行时门 [count] 只数带标记的(页面上别的 svg 文字不能顶数,A2 P0-1);foreignObject 岛按深度 / 自闭合 / 只在 svg 内成立、岛内嵌套 svg 回到判定面(A2 P1-1);`import { default as X }` / `* as ns` / `defineAsyncComponent(() => import())` / `.js` 后缀都认,字符串里的假 import 不认,import 了却零用法判红(A2 P1-2/P2-5/P2-6);`route:null` 不得过半、探到 0 路由判红(A2 P1-3);呈现属性比对收百分比 / 科学计数 / 负数并打印跳过数(A2 P1-4);逃生阀只认注释里的标记且一对一放行(A2 P2-1);[masked](clip-path / mask)与渐变全透明 fill 判 [invisible](A2 P2-3);变异测试存活的 8 条分支各补一格阳性红测(源码门 64 格 · 运行时门 57 格)。已知不判(如实):字色与背景同色 / 被别的层盖住 / 标签互相重叠 —— 属对比度与遮挡,由走查与 a11y 工具判。
- **顺手挖出的雷 ①**:UnoCSS attributify 劫持 SVG 呈现属性(`font-size` 裸属性字大 4 倍;绑定式 `:opacity` 让全球节点图大陆点隐形)→ P-123,已摘掉 attributify。**雷 ②**:App-vue 视图层从源码看压根不渲染模板里的 `<svg>` → P-124(P-009 / P-013 的「App 端也可用」是从 H5 webview 推断的)。
- **同族提醒**:一个词在框架里有两个意思(uni 的 `<text>` 组件 vs SVG 的 `<text>` 元素、uni 的 `<image>` vs SVG 的 `<image>`!)时,写在另一个语境里的那个会**静默**走错分支;判据是「运行时量出来的形状」(bbox / 命名空间),不是源码长得像不像。仓内 SVG 里的 `<image>` 目前 0 处,门只守 text;真要用 SVG `<image>` 先照 SvgText 的路子做一个 SvgImage 并把门扩到它。
## P-122 长期红的门,红绿方向可能是**反的** —— 判据锚在「实现形态」上,一次加固就够让它开始奖励回退

- **症状**:`scripts/h2-trial-remote-api.test.mjs:157` 断言 `src/store/free-trial.ts` 里必须出现 `if (remoteApiEnabled) return;`,长期红,挡在 `npm run verify` 第 2 步(`test:contract-registry`)—— 47 个契约测试里唯一的红,全链一次跑不通;其余 46 条 + 后 15 步 + legacy-suite 458 格全绿。这两个文件自 `5030cd1` 起一个字未变,不是新回归。
- **根因**:判据写于 `5d3c92e`,那时 `persist()` 是 void。`da445ec`(审计 R5)为了让 convert 能判「终态到底落没落盘」,把 `persist()` 改成返回落盘判决(`if (remoteApiEnabled) return true;`),判据从此永不命中。**架构没退化,是被加固了** —— 判据钉的是实现形态而不是不变量,加固一样让它过期。
- **危险在方向不在红**(2×2 实测:判据新旧 × 源码当前/回退):旧判据 × 当前源码 = 红;旧判据 × **回退源码(persist 退回 void)= 绿**;新判据 × 当前源码 = 绿;新判据 × 回退源码 = 红。也就是说,**拆掉审计 R5/R6/R7 焊进来的落盘判决族(P-117),这道门会转绿给正反馈**。
- **落地修法**:判据锚到函数头 —— `/function persist\(\)[^{]*\{\s+if \(remoteApiEnabled\) return true;/`,要求短路是函数**第一句**。锚定一次性守住四条变异轴:删除 / 取反 / 注释掉 / **挪位**;其中挪位是关键 —— 守卫字符串原样还留在文件里,无锚点的存在式判据对它完全失明,而写盘已经发生了。
- **顺带补的两条缝**:① 测试名承诺「never persists **or locally advances**」,而「本地推进」那一半原先**一条断言都没有**(缺失轴天然假绿)—— 补 `advanceTo()` 同款锚定;② 守卫在位 ≠ 绕不过去 —— 补「落盘口唯一」(`writeAccountRow[<(]` 恰好 1 处),否则在远端分支另开一条写盘口,两条守卫全都健在也照样绕过。
- **同族提醒**:① 判长期红的门第 0 步问「它守的形态是不是被一次**加固**改掉了」,不只问「架构还在吗」——[[stale-gate-rewards-regression]] 的第一例是迁移,这例是变强,同样过期;② 门只有一条 assert 时「数 fail 条数」这招失效(任何变异都是红),改跑 **2×2 真值表**才看得出方向;③ 把测试名当规格逐句读,每个分句都得有断言接着;④ 变异集落盘为 `scripts/h2-trial-remote-gate.redtest.mjs`(9 条,单条隔离注入 + 注入不生效当场炸 + 收尾复绿),挂在 `test:contract-registry`;⑤ 判据带 tag 消息(`[persist-guard]` / `[advance-guard]` / `[single-writer]`),红测才能断定「红的是这一条」而不是被别的判据顺带抓到 —— 靠行号会随编辑漂。2026-08-17。

### P-120 追记 3(第二轮独立验收之后):我自己写下的「已收成一处」是假的,以及三条门设计教训

第一轮审计验的是门的 v1,而我据此把判定面**整个反转重写**。**v2 没有被任何独立验收看过**——
这个缺口是我自己在走 `done-review` 时才意识到的,补派一轮专攻 v2,报 6 P1 + 15 P2,逐条回源全部坐实。

🔴 **最扎心的一条:注释里的「收成一处」是我自己写的,而它是假的。**
我在 `lib/v-rank-copy.ts` 写「头衔收成一处,谁渲染头衔都从这里取」,实际还有 6 处直出英文
(`network.vue` 有自己一份同名局部函数、`team.vue` / `v-badge.vue` / `proof.vue` / `agent.vue` 直读 `.title`)。
实景:中文界面「我的等级 V2 Operator」与 V 级页「V2 操作员」同时存在。
**声明式的注释不构成证据,而我把它当成了自己已完成的凭据。**

- 🔴 **修法带出的通用技巧:给共享函数加一个必填参数,让编译器替你做全站扫描。**
  把 `rankTitle(v, isZh)` 改成 `rankTitle(v, isZh, ladder)` 之后,`vue-tsc` 一次点出 **9 个**漏改点。
  比 grep 可靠得多 —— grep 只找得到「长得像」的写法,类型检查找得到**全部**调用点。
  同族场景:任何「把散落的逻辑收口到一处」的重构,都可以用「加必填参数 / 收窄类型」把漏改变成编译错误。
- 🔴 **顺带发现的真缺陷**:那个函数直读 `V_RANKS`,而它源码明写 `⚠️ MOCK-ONLY`,store 的 `ladder`
  在 remote 档是**空数组**。本地永远看不出来,接上真后端会照旧显示 mock 头衔。
  **凡是「从常量表取展示值」的写法,先问那张表在 remote 档还存不存在。**

🔴 **装饰性红测:样本必须打在修法的那一面上。**
撤掉共享注释剥离器里全部 5 处「开标签锚行首」,84 + 30 格红测**照样全绿**——因为我那格红测用
`<style>` 做样本,而只有 `<script>` 区域会把 `//` 当行注释,对这条修法有牙的只有 script 那一面。
**判别法:把修法本身撤掉(不是把被判对象改坏),红测必须有格变红;不变红就是装饰性靶。**
同一轮同型第二例:把 `namespaceBlock` 改成 `return source`(退化成整文件),两个契约测试 10/10 照样绿。

🔴 **两张表的判据强度不守恒。**
「死授权是静默后门」这条纪律逐条焊在 25 个授权词上,却没焊在 161 个豁免属性名上——而判定面反转后,
**真正决定宽严的是豁免表**。实测 47 个全仓 0 命中(纯投机)。已剪掉 + 补逐名存活 + 跨组重名判据 +
「同一属性名不许既是文案属性又是非文案属性」。
🔴 但**存活规则要按性质分两类**(红测逼出来的):**语言级**写法(Vue 指令 / 事件处理器)不要求存活,
因为「它的值不是文案」是可从规范推出的语言事实;一律要求存活会把 `v-on:` 长写法剪掉,让第一个用它的人
吃一条纯误报。只有**对本仓的观察**(组件 prop 名)才逐名判存活。
**「同一条纪律套到所有表」本身也是一种不加分辨。**

### P-120 追记 4:桩环境里「零 console error」这类断言天然脆 —— 那 3 个 500 是结构性的

- **症状**:`withdraw-bill-runtime` 的 9 条断言 **8 条通过**,唯一失败的是「零 console error」,
  而 console 里是 3 个 HTTP 500:`/api/content/i18n` · `/api/config/platform` · `/api/config/referral-rewards`。
- **根因**:`run-legacy-suite.mjs` 起的所谓「remote 资金边界 server」**就是另一个 vite dev server**
  (`VITE_NEXGRID_API_MODE=remote`),**背后没有任何真后端**。remote 档下每个 `/api/*` 调用都必然 500。
  所以这条断言实际在判「页面在断言窗口内**恰好没发起**哪些后端调用」——与被测行为无关的时序。
- 🔴 **判真红的口径**(与主线 P-119 同向,这里给出更强的一半):**先看失败的是哪一条断言**。
  行为断言全绿而只有「零 console error / 零网络错误」这类环境断言失败时,先查那些错误的**来源域**
  ——落在「桩环境本就不存在的后端」上,就不是被测代码的问题。
- **本轮实证**:五轮套件里红在 3 个浏览器探针之间**轮换**(第 3 轮提现账单、第 4 轮起服门、
  第 5 轮主题门),而我引入的 2 条真红修掉后**再没出现过**——
  **「红门轮换」是**检测**不稳的指纹;它说明不了「被检出的东西是假的」。**
- **A/B 做法**:① 查失败断言碰的文件在不在自己的差集里(本例权限守卫在 `App.vue`,不在);
  ② 同一棵树**独占**单跑那道门(本例 22 场景 + 6 探针全 PASS,含套件里失败的那条守卫存活性 3/3)。
  两条都成立,才能判**「不是我引入的」**。

🔴 **同轮的自我更正 —— 「检测抖动」≠「被检出的东西不存在」,我把这两件事混了一次:**

主题门那条我判成「抖动、不是稳定的新指纹」(同树三次跑出 1/0/1)。**归因「不是我引入的」是对的,
但「那个元素是幻影」这半句是错的**:几分钟后主线一个提交
(`fix(home): 英雄卡辉光改走 --v5-nex,恢复双主题跟随`)正好修掉它 —— 首页英雄卡的辉光原本写死
`#7C5CFF`(= 报告里那个 `rgb(124,92,255,0.45)`),**确实没跟主题**。改成 `color-mix(var(--v5-nex) 45%)`
之后,同一道门连跑三次**稳定无新增**(此前 1/0/1)。

- **两件事必须分开判**:**检测的稳定性**(探针在负载/动画/轮播下是否每次都抓到)与
  **被检出对象的真实性**(那个元素是否真的违反不变量)。前者不稳,不构成后者不存在的证据。
- **正确表述**:「同树多次跑结果不一致 ⇒ 这道门此刻**不能作为我引入回归的证据**」,
  而不是「这条报告是假的」。差别在于:后者会让人把一条真缺陷当噪声关掉。
- **可迁移判据**:遇到间歇性报告,除了做 A/B 判归属,还要**顺手看一眼被点名的那个对象本身**
  (本例:那行样式确实写着 hex 而非 token,读一眼源码 10 秒就能确认它该被修)——
  归属与真实性两问都答了,才算判完。

### P-120 追记 5:标签边上的空格会被 Vue 空白折叠吃掉 —— 一族「粘字」,不止我修的那一处

- **症状**:两个字之间该有的空格没了,渲染成粘在一起的一坨。三语皆然,不是译文问题。
- **根因**:Vue 模板编译默认 `whitespace: "condense"`,**紧贴标签边界的空白被删掉**。
  所以下面两种写法都不产生空格:
  - `<text>{{ x }} </text>` —— 尾空格贴着 `</text>`(实测:套餐页渲染成 `价格$649` / `Price$649` / `Giá$649`);
  - `<text> {{ fmt(...) }}</text>` —— 首空格贴着 `>`(实测:质押页渲染成 `+$550来自复投`)。
- **两个都不是好解法**:
  - 把空格藏进**词典值**的首/尾(`" from compounding …"`)——不可见契约,任何 trim 型格式化会静默吃掉;
  - 只在模板里打一个空格 —— 就是上面这两种被折叠掉的写法。
- 🔴 **正解:显式拼进表达式** `{{ " " + fmt(...) }}`,或用 `&nbsp;`(注意 nbsp 会阻止该处换行,窄屏要权衡)。
- **存量**(2026-08-18 扫到、未修,留给后续包):`src/pages/store/bundle.vue:94` 与 `:120` 的
  `{{ t.uiChrome.price }} </text>` 两处。当轮没顺手改的理由:它在我没碰的那半行上、属既有缺陷,
  而改了就得再跑一轮完整验证(约半小时)才敢说没弄坏别的 —— 但**「我口头跟主人提过」不等于登记了**,
  这条追记就是补那个缺口(我先前对主人说「已在登记里」,而当时只有 SVG 那条真在登记里)。
- **可迁移**:凡是「把不可见契约显式化」的改法,**改完必须实景看一眼渲染结果** ——
  我把空格从词典挪到模板时,第一版就是被折叠掉的那种写法,是三语走查的 DOM 文本把它抓出来的,
  门与 type-check 都不会响。2026-08-18。

### P-120 追记 6:追记 4 那次「检测抖动」的具体机制 —— 冷 dev server 让运行时门报假绿,判据是「消失 N」不是「新增 0」

- **背景**:另一个并发会话独立踩到同一处(`tech-money-card.vue` 的 `--accent-purple` 辉光),诊断一致、修法一致(改走 `--v5-nex`),抢先落到主线(`62a8eb0`)。本条只补追记 4 没写透的一半:**为什么** `theme-constant-gate.mjs` 单跑会 1/0/1 抖动,以及怎么一眼判断这次结果算不算数。
- **机制**:该门对着**刚起的** dev server 单跑时,输出 `双主题恒定着色:无新增(基线 4 条,本次消失 3 条)`,exit 0;同一棵树、同一提交、同一条命令,server 跑热后再跑是 `新增 1 条(基线 4,消失 0)`,exit 1。唯一变量是 server 冷不冷。根因是 Vite dev **按需编译**——门一次 goto 5 条路由,冷跑时每条都要现编译,`waitUntil: "networkidle"` 在编译间隙就可能满足,探针量到的是**还没渲染完的页**,元素少→命中少→`added` 为空→判绿。
- **判据**(不用再靠「多跑几次看运气」):基线是棘轮,存量违例不会自己消失。看输出里的「消失 N」——若本轮没修过对应页面而 `消失 > 0`,说明这轮扫描是瞎的,绿不作数,不用纠结「1/0/1 到底该信哪次」。实测冷跑 `消失 3`(4 条基线只找回 1 条),热跑 `消失 0`(4 条全找回)。
- **为什么全链没被这个坑掩护**:这道门跑在 `test:legacy-suite` 460 格里靠后的位置,前面几百格早把 5 条路由踩热了,全链里它是真红;假绿只出现在「照着复现命令单跑这一道门」那条路上——而那恰好是排查时会走的路。
- **同族**:`added = hits.filter(不在基线)`,`hits` 因为瞎而为空时 `added` 也为空,一路绿到底,与 [[count-ledger-blind-to-unscanned]](守不住没扫到的)同根;也呼应追记 4 的「检测抖动 ≠ 被检出对象不存在」——这条给出的是那句话背后可操作的具体判据。2026-08-18。
### P-120 追记 7:同一道门的**第二条**假绿路径 —— 「疑似 → 重扫确认」这步会把**带动画的**真违例当轮播错位丢掉

- **与追记 6 的区别**:追记 6 是冷 server 让整轮扫描变瞎(判据 `消失 > 0`)。本条这轮 `消失 0`(扫描是好的),门**确实扫到了**真违例,却在下一步自己把它扔了 —— 两条路径独立,补追记 6 的判据挡不住这条。
- **实测**(2026-08-18,主线合入 `62a8eb0` 之前的树):`theme-constant-gate.mjs` 输出 `疑似新增 1 条,重扫一次确认(轮播错位会在这一步消失)… [偶发·已忽略] /pages/index/index backgroundImage = rgb(124,92,255,0.45)`,末行 `无新增(基线 4 条,本次消失 0 条)` → 绿。而 `rgb(124,92,255,0.45)` 正是 `--accent-purple` 那层双主题恒定的英雄卡极光,是**真违例**。
- **机制**:那层带 `animation: v5-aurora-drift`,尺寸在两次快照间漂 1-2px(实测 `359x134` → `360x136` → `361x138`)。门的配对键是 `tag|class|WxH|top` 含几何,重扫时几何又漂了 → 该指纹「这次没出现」→ 被判定为轮播错位造成的偶发 → 忽略。**为消假阳性加的复扫,对会动的元素就是一条假绿通道。**
- **同一个坑我自己也踩了**:独立写盘点脚本时同样用几何当配对键,首页 4 层辉光**一层没报**,输出是干干净净的「0 命中」;改成给节点盖 `data-*` 戳、按戳读两遍(切主题不重载页面,DOM 是同一批节点,配对与几何无关)后,全站找回 23 层。
- **修法方向**(未落地,留给动这道门的人):配对键去掉几何,改打戳;或对 `animation-name != none` 的元素豁免「偶发」判定 —— 它们本来就该按内容而非几何认。**别把动画冻成 `animation-play-state: paused`**:进场动画第一帧常是 `opacity:0`,一冻整页变不可见,`checkVisibility()` 会把 69 层判成 61 层不可见(实测),要冻就让它瞬间跑完停终态(`animation-duration:1ms + iteration-count:1 + fill-mode:forwards`)。
- **同族**:与追记 6、[[count-ledger-blind-to-unscanned]] 同根 —— 都是「没扫到 / 被丢掉」与「没问题」在输出里长得一模一样。2026-08-18。
## P-123 UnoCSS attributify 把 SVG 呈现属性当工具类:真 SVG 文字放大 4 倍、全球节点图 669 个大陆点隐形 —— 摘掉它,别加豁免

- **症状 ①**:P-121 修好、SVG 文字第一次真渲染出来时,`font-size="9.5"` 的标注量出来是 38px(2.375rem),`font-size="22"` 会是 88px。文字是「有了」,但大得离谱、被视口裁掉。此前 SVG 文字从没渲染过,所以谁也没见过。**症状 ②**(独立审计 A1 P0-2 实测):`src/pages/globe/globe.vue` 的大陆点 `:opacity="d.bright ? 0.5 : 0.25"` 渲染成 **0.0025 / 0.005**(367 + 302 个圆点),整片大陆点阵肉眼不可见,页面只剩 6 个区域光点 —— 这条**一直存在**,不是本包引入的,页面文案还写着 Brighter green = denser cluster。
- **根因**:`uno.config.ts` 开着 `presetAttributify()`。attributify 的提取器把源码里**任何**属性名当工具类前缀扫(`font-size="9.5"` → 候选 `font-size-9.5`),preset-mini 有 `(text|font)-size-*` 规则 → 生成 `[font-size~="9.5"]{font-size:2.375rem}`(数字 × 0.25rem),`opacity="0.25"` → `[opacity~="0.25"]{opacity:0.0025}`(百分比处理器 ÷100),选择器正好匹配渲染出来的元素,CSS 覆盖了 SVG 呈现属性。UnoCSS 自己的默认豁免表 `ignoreAttributes` 已经为同一件事豁免了 `fill` / `opacity` / `stroke-opacity`,**但提取器先查豁免表、后剥 `v-bind:` / `:` 前缀** —— 绑定式 `:opacity` 永远匹配不到豁免表,却生成剥完前缀的选择器。所以「加豁免」只修裸写法这一半(本包第一版就是这么修的,被 A1 证伪)。
- **修法**:摘掉 `presetAttributify`。证据:① 整仓源码喂 UnoCSS 生成器做 A/B —— attributify 相对纯 presetWind3 只多出几十条撞上 SVG 属性 / 组件 prop 名(`size` / `accent` / `duration` / `px` …)的意外选择器,**没有一条是有意使用的属性式工具类**;`prefixedOnly:true` 变体产出 0 条有值规则;class 工具类不受影响;② 实景 served CSS:属性选择器 48 → 0,`.px-4` / `.rounded-2xl` / `.border` 原样;③ globe 圆点 opacity 直方图 {0.0025:367, 0.005:302} → {0.25:367, 0.5:302},大陆点阵可见;④ 4 路由 16 个 SVG 文字字号 == 属性。守卫:`svg-text-source-gate.mjs` [attributify](启用即红,除非 `prefixedOnly:true`;判据看剥掉注释后的代码)+ `svg-text-render-probe.mjs` [attr-hijacked](运行时,全页 svg 元素的 font-size / letter-spacing / font-weight / opacity / fill-opacity / stroke-width 属性值 == 计算值)。
- **同族提醒**:① 「原子化 CSS 的属性模式」与「SVG 呈现属性」是同一个语法位上的两套语义,凡启用 attributify 的工程,SVG 的 `font-size` / `opacity` / `stroke-width` / `fill-opacity` 都是嫌疑人 —— 判据是**运行时属性值 vs 计算值**,不是看源码;② 「加豁免」这类修法要问一句**豁免在哪一步查** —— 查在变换之前就挡不住变换后的形态;③ 「第一次真渲染出来」的东西要当新功能验一遍,它身上可能压着别的、从没被触发过的雷;④ 一个 preset 全仓 0 使用却在生成 CSS,它生成的每一条都是意外 —— 直接摘,别维护 denylist。2026-08-17。
## P-124 App-vue 视图层从源码看**不渲染模板里的任何 `<svg>`**(不只是 P-121 的字缺)—— P-009 / P-013 的「App 端也可用」是推断,未真机证实

- **发现路径**:评估 P-121 候选方案的「App(iOS/Android webview)是否成立」轴时回源读 `@dcloudio/uni-app-plus/dist/uni-app-view.umd.js`(3.0.0-4080420251103001)。
- **事实(`[COMPUTED]`,读源码不是跑出来的)**:App-vue 是服务层(JS 引擎跑 Vue)→ 视图层(webview)DOM 同步。服务层 `UniElement` 的 `nodeName = tagName.toUpperCase()`,不带命名空间;视图层 CREATE 动作 `Zy(id, nodeName, …)`:`Xy[nodeName]`(VIEW / TEXT / IMAGE … 内置组件表)命中则建对应组件,**否则 `document.createElement(nodeName)`** —— `SVG` / `CIRCLE` / `PATH` / `G` 全部走这条,得到的是 **HTML 命名空间的未知元素**,不是 SVG,浏览器不画;`TEXT` 走 uni-text 组件(= P-121 在 App 上的同款)。`v-html` 走 `setAttr("innerHTML")` → `this.$.innerHTML = …`,由浏览器解析,是唯一能在 App-vue 出真 SVG 的模板内路径(未真机证实)。DCloud 问答 67267 也说「template 里没有 svg 标签,动态创建的才可用」。
- **独立复核(A1,置信 HIGH ≈92%)**:机制成立且被低估 —— 命名空间不是到视图层才丢的:服务层的 Vue 被 DCloud 打过补丁,`hostCreateElement(vnode.type, container)` **删掉了 namespace 参数**(`@dcloudio/uni-app-vue/dist/vue.runtime.esm.dev.js`;对照 H5 侧 `@dcloudio/uni-h5-vue` 保留了它),DOM 同步协议 `CreateAction` 也没有命名空间字段;`nodeName.toUpperCase()` 只是查表用大写,不是病因(HTML 文档下 createElement 永远是 HTML 命名空间,与大小写无关)。失败长相要说准:矢量几何(path / circle)0 宽不出;`<text>` 子节点会落到 uni-text,以**无定位的行内文字**漏出来 —— 同一结论,不是「一个字节都不出」。本仓 `package.json` 目前没有任何 `dev:app` / `build:app` 脚本、`manifest.json` 的 app-plus 块是预设默认值,所以是**潜在不是活体**;但仓里带着 App 契约(`#ifdef APP-PLUS` 与 verify.sh 的 App 条件编译门),第一次 `uni build -p app` 就转活体。
- **意味着什么**:全站几十处内联 SVG 图标(lucide 风格)与四张示意图,在 App-vue 上从源码看**几何一张都不出、文字变成飘着的行内字**;这远大于 P-121。P-009(「内联 svg 在 .vue 双端可用」)/ P-013(「uni webview 渲染 SVG + SMIL」)是在 H5 上验证后**推断**到 App 的,与源码相悖。本环境无 HBuilderX / 真机,**无法运行时证实或证伪**,不据此改任何 App 策略。
- **本包的处理**:不更坏(`<SvgText>` 在 App 服务层同样落到 TEXT 节点,与其它 svg 子元素一样不出)、不锁死方向(v-html / renderjs / iconfont / `<image src=svg>` 都仍可选);上报为包外 P0 待真机定案,HANDOFF 已登记。
- **同族提醒**:「webview 渲染 = 浏览器行为」这个推断在 App-vue 上**不成立**,因为中间隔着一层 DOM 同步协议,协议不传的东西(命名空间、innerHTML 之外的原生元素)webview 就没有;凡「App 端也可用」这类跨端断言,要么真机跑过、要么读过视图层源码,二者都没有的一律标 `[INFERRED]`。2026-08-17。
