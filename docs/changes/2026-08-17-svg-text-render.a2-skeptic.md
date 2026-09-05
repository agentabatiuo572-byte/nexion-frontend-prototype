# P-121 SVG 内文字 —— 独立对抗审计 A2(第二轮加固的证伪)

- 审计对象:`71bc9ee`(base `2e27d99` / `origin/UniApp`),分支 `pkg/aw-svg-text`,worktree `D:\WORKS\PLAN\Nexion-uniapp\.claude\worktrees\aw-svg-text`
- 立场:**证伪**。只报能拿出复现命令 / 测量值的条目;A1 的每条都回源自己重测,不采信 commit message。
- 靶子:本树 dev server `http://localhost:5231`(已核 200)。时间盒 ~25 min,实际 ~35 min。
- 全部攻击脚本落在 `.claude/pkg-dev/skeptic2/`(未改任何 `src/` · `scripts/` · `uno.config.ts`)。

## 基线(先证「门此刻是绿的」,再证「绿得没道理」)

```
node scripts/svg-text-source-gate.mjs --selftest   → 48/48 格通过
node scripts/svg-text-source-gate.mjs             → 0 违规(249 .vue · svg 块 750 · SvgText 13 处/4 文件 · attributify=attributify-off)
node scripts/svg-text-render-probe.mjs --selftest  → 38/38 格通过
UNI_BASE_URL=http://localhost:5231 node scripts/svg-text-render-probe.mjs
  → PASS ×4 路由 16 个 svg text(network 4 / binary-how 5 / globe 1 / store detail 6)+ SKIP lucky-spin
```

---

## P0

### P0-1 `[count]` / `[rendered]` / `[invisible]` 全部按**页面**取样,期望却按**文件**算 —— 把被登记文件的标注**全删光**,门依旧全绿

`snapshotScript()` 取的是 `document.querySelectorAll("svg text")`(全页),`min` 取的是 `files[file].svgText`(该 .vue 模板里的静态 `<SvgText>` 个数)。两者之间**没有任何出处校验**:页面上任何一个别的组件贡献的 `svg text` 都能顶数。judgeSnapshot 的每条逐元素判据(`rendered` / `empty` / `invisible` / `inside-svg` / `offpage` / `clipped` / `font-size-hijacked`)同样只遍历 `snap.texts`,所以顶上来的外来文字会把所有判据一起「验绿」。

证据(`.claude/pkg-dev/skeptic2/attack-count.mjs`,真路由 + 真 dev server,只在页面 DOM 上做手脚,不动源码):

```
BASE  pages/globe/globe 原样
   svg text=1 [You]  min=1  hits=[] 全绿
ATTACK 删掉 globe.vue 的真标注 + 页面别处补一个外来 svg text
   svg text=1 [FOREIGN]  min=1  hits=[] 全绿
ATTACK pages/team/network 删掉 4 个真标注 + 补 4 个外来 svg text
   svg text=4 [F0 / F1 / F2 / F3]  min=4  hits=[] 全绿
```

也就是说:**P-121 本尊(某张示意图的标注全部不渲染了)在页面存在任何其它 svg 文字时,这道运行时门测不出来。** 这条门存在的唯一理由就是抓这个。

现状不是 live bug —— 4 条路由此刻的实测数恰好等于各自文件的静态数(4/5/1/6),没有外来 `svg text` 在顶数。但这是「今天恰好没人在这几页放别的 SVG 文字」,不是门守住了;任何一次新增(页面级空态插画、里程碑弹层、活动 banner 里带文字的 SVG)都会把这条判据变成永远满足。归 P0 是因为**它让门对目标缺陷失效,且失效时无声**。

一句话修法:测量时给每个 `svg text` 打出处标记 —— 改 `<SvgText>` 渲染函数加一个恒定属性(如 `h("text", { "data-svgtext": "1", ...attrs })`),probe 的 `min` 判据只数 `svg text[data-svgtext]`,并对每条登记路由额外断言「本文件贡献的条数 ≥ min」。

---

## P1

### P1-1 `foreignObject` 岛用一条非贪婪正则划定,既不数深度也不受 `<svg>` 跨度约束 —— 假岛能把真违规整段吞掉

`svg-text-predicate.mjs:56` 的 `/<foreignObject(?=[\s>\/])[\s\S]*?<\/foreignObject\s*>/gi` 只做「开标签字样 → 最近一个闭标签」的配对。三种写法都能造出把真违规罩进去的假岛,而 A1 P1-1 给 `<svg>` 跨度补的深度/自闭合/引号感知**没有同步补给岛**:

| 用例(`.claude/pkg-dev/skeptic2/attack-static.mjs`) | 该判 | 实得 |
|---|---|---|
| A1 `<svg><foreignObject …/><text>GHOST</text><foreignObject …>…</foreignObject></svg>`(**自闭合 fO** 开了个假岛,一路吞到后面那个真闭标签) | `svg-text` ×1 | **0** |
| A4 同上,吞的是 `<view>` | `svg-uni-tag` ×1 | **0** |
| G2 `<svg><foreignObject …><view><svg><text>DEEP</text></svg></view></foreignObject></svg>`(岛内嵌一张**真 svg**,里面的 `<text>` 一样编成 `uni-text` 不画) | `svg-text` ×1 | **0** |
| A5 `<foreignObject …><svg><text>GHOST</text></svg></foreignObject>`(岛写在 svg 之外也照样成立) | `svg-text` ×1 | **0** |

更糟的一半:这些文件**同时**从运行时门的判定面消失。`svgLabelFiles()` 用同一个 `analyzeTemplate`,`otherLabelCandidates` 也做 `!inIsland` 过滤,所以假岛里的候选既不算 `svgTextNodes` 也不算 `other` → 文件不进 `ROUTE_MAP` 检查,`[unregistered]` 不响。实测(`attack-plane.mjs`):

```
[4] 自闭合 foreignObject 造出的假岛吞掉 <text>
   spans=1 islands=[[21,142]] svgTextNodes=0 other=0 hits=[]  → svgLabelFiles 会登记吗: **不会(完全隐形)**
[5] foreignObject 内嵌真 svg 里的 <text>
   spans=1 islands=[[21,114]] svgTextNodes=0 other=0 hits=[]  → **不会(完全隐形)**
```

这正是 A1 P1-2 点名的结构风险兑现了:两道门共用一条谓词,谓词的洞就是**两道门同时**的洞。修谓词把 `<svg>` 跨度做严了,却把岛留在原始正则上。

一句话修法:岛也走 `tagEnd()` 逐标签扫描 —— 自闭合 `<foreignObject …/>` 不开岛、按深度配对、岛必须落在某条 `svg` 跨度内;并在岛内部**重新**跑一遍 `svgSpans`,岛里的嵌套 `<svg>` 恢复成判定面。

### P1-2 `import { default as X } from "@/components/svg-text"` —— 合法、能渲染,但文件对两道门**完全隐形**(A1 P1-3 只修了一半)

`svgTextLocalNames()` 的正则只认默认导入 `import X from "…"`。命名空间式的 `{ default as X }` 匹配不到 → `localNames` 为空 → `<X>` 连「SvgText 用法」都不算 → `svgTextNodes = 0`、`svgTextOutside = 0`、`otherLabelCandidates = 0`。

```
[1] import { default as SvgLabel } + <SvgLabel> in svg（合法可渲染）
   spans=1 localNames=[] svgTextNodes=0 outside=0 other=0 hits=[]
   → svgLabelFiles 会登记吗: **不会(完全隐形)**
```

后果与 A1 P1-3 同型:一张带标注的新示意图可以**不被任何一道门看见**——源码门不判它,运行时门不要求它登记路由,`[unregistered]` 不响,`[judged-plane]` 因为别的文件还在也不响。今天写不出这种代码不等于明天不会(重构成命名导出、桶文件转发都会走到这个形状)。

一句话修法:`svgTextLocalNames` 的正则并上 `import\s*\{[^}]*\bdefault\s+as\s+([A-Za-z_$][\w$]*)[^}]*\}\s*from`;同时把「import 了 svg-text 却一个 `<X>` 都没扫到」也判一条红,防止别名形态再演化一次又整族隐形。

### P1-3 `route: null` 是没有下限的静默摘门阀 —— 全员挂 `route:null` 也能跑出「全部真渲染」的绿

A1 P2-3 给 `min` 焊了下限(`min<=0` → `bad-min`),但同一族的 `route:null` 只要求配一句 `whyMin` 字符串,**不要求覆盖面还剩多少**。

```
node -e "judgeRegistry(仓内两个真文件, {两个都写成 route:null + whyMin:'走查覆盖'})"
→ []   (空数组 = 门自身不反对全员豁免)
```

`main()` 里 `cfg.route === null` 直接 `continue`,`routes` / `texts` 保持 0,`fail` 为 0,最后打印的是
`svg-text-render-probe: 0 路由 0 个 SVG 文字全部真渲染且可见` —— **一句 0 覆盖的绿话**,退出码 0,verify 记 ok。任何人(包括未来的自己,为了让红门过去)都能一行豁免掉整道运行时门,而且句子读起来像验过了。

一句话修法:`main()` 末尾断言 `routes >= 1 && texts >= 1`(0 覆盖 → 判红),并对 `route:null` 的条数设上限(比如「不探的文件不得超过登记总数的一半」),否则跟 `min:0` 是同一个坑换了个字段名。

### P1-4 `[attr-hijacked]` / `[font-size-hijacked]` 的输入过滤把**带单位/百分比的呈现属性**整类跳过 —— A1 P0-2 的同族变体从这里漏过去

`snapshotScript()` 第 123 行 `if (v == null || !/^\s*[0-9.]+(px)?\s*$/.test(v)) continue;`、`judgeSnapshot()` 第 146 行同款过滤。凡是写成 `50%` / `1.5em` / `1e1` / 负数的属性值一律**不比对**。

```
A8 opacity="25%" 被 CSS 劫持成 0.0025（A1 P0-2 的百分比变体）
    人判该红≈attr-hijacked | 门实得 [] 全绿
A7 font-size="1e1" 被 CSS 劫持成 72px
    人判该红≈font-size-hijacked | 门实得 ["inside-svg","clipped"]   ← 两条劫持判据都没响,是副作用判据顺手抓到的
```

`opacity="50%"` 是 SVG2 合法写法,`font-size="1.5em"` 是 SVG1.1 合法写法。运行时门是「摘掉 presetAttributify」这个决定的**唯一运行时兜底**(uno.config 注释与提案第 29 行都这么写),兜底对一整类合法属性值形态是瞎的。

现状是**潜伏不是 live**:全仓 grep 带单位/百分比的呈现属性 = 0(`stroke-width` / `opacity` / `fill-opacity` 的 4 处都是 `:` 绑定,运行时算出的是纯数字),所以今天没漏。定 P1 不定 P0。

一句话修法:过滤放宽到「能被 `parseFloat` 解出有限数」的任何值,百分比按 `parseFloat(v)/100` 归一后再比对(`opacity` 族),`em/rem/px` 交给浏览器算 —— 真比不了的形态(`inherit` / `var()`)才 `continue`,并把跳过的条数打出来,别静默。

---

## P2

### P2-1 `svg-text-outside-ok:` 逃生阀取的是**原始行文本**,不是注释;一句注释放行整行 + 下一行的所有 `<SvgText>`

`svg-text-source-gate.mjs:65-67` 用未剥注释的 `src` 按行取上下文,只 `match(/svg-text-outside-ok:\s*(\S[^\r\n]*)/)`。于是标记写在哪都算数:

| 用例 | 该判 | 实得 |
|---|---|---|
| E1 `<SvgText>svg-text-outside-ok: 我就写在文本里</SvgText>`(写在**元素文本**里) | 红 1 | **0** |
| E2 `<SvgText title="svg-text-outside-ok: 借口">x</SvgText>`(写在**属性字符串**里) | 红 1 | **0** |
| E4 一句注释 + 下一行**两个** `<SvgText>` | 红 1(只该放行一个) | **0** |

E1/E2 要有意为之;E4 是日常就会踩的(抽两个子图组件写在同一行,只写一条理由,两条都被豁免且只有一条会被打进 `EXEMPT` 复核清单)。

一句话修法:在**剥注释后的串**上做差集找注释位置,要求标记必须落在注释里;豁免按「标记 → 最近的下一个 `<SvgText>`」一对一配,别按行整行放行。

### P2-2 变异测试:31 个变异杀死 23、**存活 8** —— 8 条判据分支没有属于自己的红测

`.claude/pkg-dev/skeptic2/mutate.mjs`(把 probe 复制到 scratch、逐条弱化判据、跑 `--selftest` 看能不能被抓)。存活 = 把这条逻辑删掉/弱化,38 格红测**依旧 38/38 全绿**:

| 存活变异 | 含义 |
|---|---|
| `ATTRS` 去掉 `letter-spacing` | 字距被劫持无红测 |
| `ATTRS` 去掉 `font-weight` | 字重被劫持无红测 |
| `ATTRS` 去掉 `fill-opacity` | 填充透明度被劫持无红测(6 个属性里 3 个没有阳性格) |
| `clipBox` 只认 `hidden` 不认 `clip` | `overflow:clip` 分支无红测 |
| `chain` 只认 `hidden` 不认 `collapse` | `visibility:collapse` 分支无红测 |
| `judgeRegistry` 的 `min<=0` 判据永假 | 现有格子是 `{min:0}` 且没 whyMin,被**第二条**判据顺带判红了;`{min:0, whyMin:"…"}` 这一格不存在 |
| VueWarn 只认 `Failed to resolve component` | 另外 3 个 alternative(`custom element` / `Unknown custom element` / `Failed to resolve directive`)无红测 |
| `querySelectorAll("svg text")` → `("text")` | 选择器丢掉 svg 限定无红测 |

与 A1 P2-5 同型(「过得对但过得没道理」),这次是 8 条。一句话修法:每条存活变异补一格阳性红测(合成页面即可,不需要 server)。

### P2-3 `[invisible]` 的「已知边界」清单不完整 —— 四种「排版了但人眼看不见」不在声明的豁免里,却全绿

`svg-text-render-probe.mjs:26-27` 如实声明了三个已知不判:同色、被盖住、互相重叠。实测还有四种它不判、但也**没写进那份清单**(`.claude/pkg-dev/skeptic2/attack-visible.mjs`):

```
V1 fill=url(#g)，渐变两端 stop-opacity=0（人眼完全不可见） | 门实得 [] 全绿
V2 text 自身 clip-path 裁成 0×0                          | 门实得 [] 全绿
V3 mask 全黑（完全遮掉）                                  | 门实得 [] 全绿
V4 祖先 mix-blend-mode:multiply + 同色底                  | 门实得 [] 全绿
```

`alpha()` 对 `url(#…)` 返回 1(不是 `rgba()` 也不是 `transparent`/`none` → 落到 `: 1` 分支);`clip-path` / `mask` / `mix-blend-mode` 三个属性根本没进快照。V4 勉强算「同色」的延伸,V1/V2/V3 不算 —— 声明的边界比实际边界窄,读的人会以为「不在这三条里 = 门守住了」。

一句话修法:要么把这四条补进文件头的「已知边界」,要么补判据(`fill` 是 `url()` 时解引用 gradient 的 stop-opacity 之和 > 0;`clip-path`/`mask` 非 `none` 时直接判红或要求人工豁免)。**至少不能让声明比现实乐观。**

### P2-4 `<svg:svg>` 命名空间标签不开跨度 —— 里面的 `<text>` 逃出判定面

`svgSpans()` 的 `reTag = /<\/?[A-Za-z][\w:-]*/g` 把 `svg:svg` 整体当标签名,`name === "svg"` 不成立 → 不开跨度。

```
B1 <svg:svg> 命名空间标签里的 <text>  [svg-text] want=1 got=0
```

Vue/uni 里没人这么写,纯理论洞;但它和 A1 P1-1 是同一个「跨度识别」面,补一行 `name.split(":").pop() === "svg"` 就闭。

### P2-5 script 字符串里的假 import 能骗过 `[svgtext-import]`

`stripComments` 对 script 区域**故意保留字符串字面量**(文案哨兵要判字符串),`svgTextLocalNames` 直接在这份串上跑正则。于是:

```
F4 script 里 const doc = 'import SvgText from "@/components/svg-text";'
   + 模板 <svg><SvgText>x</SvgText></svg>（真的没 import）
   [svgtext-import] want=1 got=0   ← 假绿
```

刻意构造才踩得到,且运行时门的 `VUE-WARN` 会在该文件被登记探测时兜住。一句话修法:用 `strip-code.mjs` 那支(抹字符串)专门跑 import 扫描,别复用文案哨兵那支。

### P2-6 两个假红:`defineAsyncComponent` 动态 import 与 `.js` 后缀 import

```
F3 const SvgText = defineAsyncComponent(() => import("@/components/svg-text"))  [svgtext-import] want=0 got=1
F6 import SvgText from "@/components/svg-text.js"                              [svgtext-import] want=0 got=1
```

两种写法都能正常渲染却被判红。方向是安全的(假红不是假绿),但会在正常演进时把人逼去加豁免——而这道门**没有豁免阀**,只能改门。优先级低于上面各条,但记一笔:`[svgtext-import]` 目前只认一种 import 形态。

### P2-7 `[clipped]` 对「折叠区里的示意图」会假红

```
C6 overflow:hidden 容器 + 文字在容器下方（长列表/手风琴折叠区） | 门实得 ["clipped"]
```

判据本身没错(它确实被裁了),但一张放在默认收起的手风琴里的示意图会让整条路由红。`overflow:auto` 的滚动容器不误红(C2 全绿,因为 `clipBox` 只收 `hidden|clip`),下述其它场景也都不误红(见「试过但没打破」)。记为**未来假红风险**,建议给 `ROUTE_MAP` 留一个「探测前先展开/滚动」的钩子,而不是等它红了再放宽容差。

### P2-8 `verify.sh` 日志文件名里的 `$.log` 是笔误

`scripts/verify.sh:369`:`"${TMPDIR:-/tmp}/uni-svg-text-src-selftest.$.log"` —— bash 里 `$.` 是字面 `$`(`.` 不是合法变量名字符),显然想写 `$$`(PID)。同一函数两个日志文件名同病;运行时门那边则是写死的 `/tmp/uniapp-svg-text-render.log`(既没 `TMPDIR` 也没 PID)。并发跑 verify 会互相覆盖日志(不影响判决,只影响明细可读性)。

---

## A1 各条:关了没有

| A1 条目 | 状态 | 复核依据 |
|---|---|---|
| P0-1 kebab `<svg-text>` 未 import 全绿 | **关闭** | 红测 48 格含 kebab / 大写 `<SVGTEXT>` / 别名;我另测 I1(svg 外 + 未 import)也红 |
| P0-2 attributify `ignoreAttributes` 挡不住绑定式 | **关闭(残留见我 P1-4)** | `uno.config.ts` 已摘掉 preset;实测 served CSS `/@unocss/entry.css` 与 `/__uno.css` 属性选择器 **0 条**;源码门 uno 6 格含「注释说摘了但代码还开着 → 照红」 |
| P0-3 只判排版不判可见 | **部分关闭** | `[invisible]` 已加且杀掉 4 个变异(hidden / minOpacity / fillAlpha / fillOpacity 各自独立);但渐变 alpha0 / mask / clip-path / mix-blend 仍全绿且未列入声明边界 → 我 P2-3 |
| P1-1 svg 跨度不数深度 | **关闭(残留 `<svg:svg>`,我 P2-4)** | 我复测嵌套 svg、属性值里的 `</svg>`、属性值里的 `>`、大写 `<SVG>`、自闭合 —— 全部按预期 |
| P1-2 两门共用一条谓词 = 一层 | **结构上关闭,风险兑现** | `scripts/lib/svg-text-predicate.mjs` 确由两门 import;但正因为共用,谓词的岛/别名两个洞现在**同时**打穿两道门 → 我 P1-1 / P1-2 |
| P1-3 别名 import + 别名标签隐形 | **部分关闭** | 默认导入别名已认(红测有格);`import { default as X }` 仍完全隐形 → 我 P1-2 |
| P1-4 抽子组件被假红堵死 | **关闭(阀有缺陷,我 P2-1)** | `svg-text-outside-ok:` 阀生效且豁免会打进 `EXEMPT` 行 |
| P2-1 `verify.sh` 坏正则 | **关闭** | 3126 行现为 `grep -E "^FAIL\|^  \["`,与 probe 的 `  [tag] msg` 输出格式对得上 |
| P2-2 `[count]` 期望取静态数、v-for 少一半不红 | **部分关闭(更大的洞在我 P0-1)** | `product-render.vue` 已配 `min:6 + whyMin`;但期望是文件级、取样是页面级 |
| P2-3 `min:0` 静默摘门 | **关闭(同族 `route:null` 未关,我 P1-3;红测冗余,我 P2-2)** | `bad-min` 三条判据在;`min<=0` 那条变异存活 |
| P2-4 import 即跑 main + 默认靶子 5173 | **关闭** | 我三个攻击脚本都 `import` 了 probe,没有一次触发 `main()`;`main()` 起手打印靶子并做 uni-app 身份 preflight |
| P2-5 红测「过得没道理」 | **部分关闭** | 单轴 bbox 格已补;但新一轮变异又抓到 8 条无阳性格的分支 → 我 P2-2 |
| P2-6 `[console]` 只收 error | **关闭** | `isVueResolveWarn` 已接进 `page.on("console")` 的 warning 分支;红测有 1 格(另外 3 个 alternative 无格,计入我 P2-2) |
| P2-7 组件边界漏 ref 语义 | **关闭** | `src/components/svg-text.ts:21` 已写明 ref 拿到的是组件实例 |
| P2-8 判定面只扫 `src/**/*.vue` | **仍开(潜伏)** | `listVueFiles` 仍只收 `.vue`。我复扫:非 `.vue` 里含 `<svg` 的只有 `svg-text.ts` 本身,含 `<text` 的只有 `en.ts:368` **的一行注释** → 今天没有真实逃逸,但渲染函数组件 / `.tsx` 一旦出现就整个在门外 |
| P3-1 提案里的数字错 | **关闭** | 提案第 26 行已是「25 字符」 |
| P3-2 Done-when / 实施拆解全未勾 | **仍开** | `docs/changes/2026-08-17-svg-text-render.md:47-58`,5 条 Done-when + 4 步拆解**全是 `[ ]`**;状态行仍写「待 full verify 后 Shipped」 |

---

## 试过但没打破(供读者判断覆盖面)

**源码门**(`attack-static.mjs`,27 格,16 格按预期):

- `<svg>` 跨度:三层嵌套 svg 的最外层 `<text>`、属性值里的 `</svg>` 字符串、属性值里含 `>` 的绑定(`:view-box="a > b ? …"`)、自闭合 `<svg …/>` 后的裸 `<text>`(不误判)、大写 `<SVG>` —— 全部按预期。
- 误伤面:`<textarea>` 判 `svg-uni-tag` 而不是 `svg-text`(对);`<textPath>` 不误判;`<viewport-thing>` / `<image-card>` 这类前缀相同的自定义标签不误判。
- 注释与字符串:`<!-- <text>x</text> -->` 不判;注释里带 `-->` 花招后的 `<text>` 照判;script 字符串里自带完整 `<svg><text>` 不判;`:aria-label="'<svg>'"` 之后的裸 `<text>` 不误判。
- `<template v-if>` 包裹的 svg 里的 `<text>` 照判(`templateRegion` 用「抹掉 script/style」而不是配对 `<template>`,这一点是对的)。
- Options API `<script>`(非 setup)+ `components: { SvgText }` 不误判;相对路径 import 认;桶文件 import(`from "@/components"`)判红(方向安全)。
- `import * as ns` + `<component :is="ns.default">` 会被 `otherLabelCandidates` 抓成候选 → 仍要求登记路由(没漏)。

**运行时门**(`attack-visible.mjs`,25 格):

- `[attr-hijacked]` 无假红:`opacity="50%"` / `stroke-width="2px"` / `font-size="1.5em"` / `stroke-width="-1"` / `font-size="1e1"` / `letter-spacing="1"`(计算值 normal 按 0 算,与属性值一致时不红)全部全绿。
- `[clipped]` / `[offpage]` 无假红:3000px 长页首屏之外的文字、`overflow:auto` 已滚出可视区的文字、`position:sticky` 容器、`dir=rtl`、祖先 `display:contents` —— 全部全绿;真该红的 `left:-9999px`(offpage)与 `overflow:hidden` 裁切(clipped)照红。
- `[rendered]` 抓得住:`font-size="0.001"`(bbox 0×0)、祖先 `transform="scale(0)"`;`[invisible]` 抓得住自身 `opacity="0"`;svg `width=0` 由 `inside-svg`+`clipped` 兜住。
- 变异测试 31 个里 **23 个被 38 格红测杀死**(count / rendered 单轴 / invisible 四个 conjunct各自 / empty / uni-text-in-svg / attr-hijacked 容差与三个属性 / font-size 容差 / TOL / inside-svg / offpage / clipped / chain 走祖先 / alpha() 的 none 分支 / unregistered / whyMin 两条),红测本身不是摆设。

**attributify 摘除**(无回归证据):

- 实测 served CSS:`http://localhost:5231/@unocss/entry.css`(8813 B)与 `/__uno.css`(10165 B),`[属性~=` 形态的选择器 **各 0 条**。
- 模板里没有属性式工具类用法:无值属性(`<view flex>` 之类)0 处、`un-` 前缀属性 0 处(grep 到的 `un-` 全是英文单词 `un-converted` / `un-carded` 之类的注释)。
- 4 条真路由实跑 console error / Vue warn **0**。

**接线**:`svg_text_source_gate` 在 `verify.sh:384` **无条件调用**(static 档也跑);`svg_text_render_gate` 由 `scope_hit svg-text-runtime` 触发,`gates.manifest.json:234` 有对应 scope 且列了脚本 —— 不是「定义了没挂上」。

---

## 未覆盖(时间原因)

1. **三语实跑**:只跑了 `--lang en`。zh / vi 下 `[inside-svg]`(更长的词会不会画出 svg 盒)、`[count]` 都没验。
2. **浅色主题**:T1 报告提过 network.vue 改成 `color-mix(token)` 后「浅色主题下柠檬绿几乎不可见」,本轮没做浅色实景与对比度测量 —— 而这恰好落在 `[invisible]` 声明不判的「同色」边界里,门永远不会替它说话。
3. **App-vue / 真机**:提案第 17 行的 App 端结论(整张 svg 不出)本环境无法证实或证伪,我没有新增证据。
4. **`npm run verify` full**:没跑(21-26 min,超时间盒)。我只跑了两道 svg 门本身 + 各自 `--selftest`。
5. **P0-1 的当下暴露面**:只确认了 4 条已登记路由此刻的 `svg text` 计数等于文件静态数,没有全站扫「哪些页面已经存在别的 `svg text`」——也就是没量出这个洞今天离触发有多近。
6. `docs/PORT-PITFALLS.md` 的 P-121 追记 / P-123 / P-124 三段正文只做了标题级抽查,没有逐句核对与实现的一致性;`HANDOFF` 未看。
7. `lucky-spin-sheet.vue` 的 `route:null` 声明说「由 sheet 自己的走查覆盖」——我没有去核实那条走查是否真的存在。

---

## 附:复现入口

```
node .claude/pkg-dev/skeptic2/attack-static.mjs     # 源码门 27 格(11 格与预期不符)
node .claude/pkg-dev/skeptic2/attack-plane.mjs      # 判定面隐形性(哪些文件两道门都看不见)
node .claude/pkg-dev/skeptic2/attack-visible.mjs    # 运行时门 25 格(可见性 / 劫持 / 裁切假红)
node .claude/pkg-dev/skeptic2/attack-count.mjs      # P0-1:真路由上删光真标注仍全绿(需 5231)
node .claude/pkg-dev/skeptic2/mutate.mjs            # 变异测试 31 个(~6 min,需 playwright)
```

以上脚本只读 `scripts/`,产物全部写在 `.claude/pkg-dev/skeptic2/`;审计期间未改动任何 `src/` · `scripts/` · `uno.config.ts` 文件。
