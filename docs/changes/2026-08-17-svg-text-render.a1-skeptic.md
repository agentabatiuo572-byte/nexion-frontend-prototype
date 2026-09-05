# A1 · 对抗证伪报告 —— SVG 内文字真渲染(P-121)包 `pkg/aw-svg-text` @ `2e27d99`

> 角色:skeptic(证伪方)。目标不是签字,是找洞。所有断言带命令 / 输出 / `file:line` / 实测数字。
> 未改动任何 `src/` · `scripts/` · `uno.config.ts` 字节(`git status --porcelain -- src scripts uno.config.ts` 为空);临时脚本全在 `.claude/pkg-dev/skeptic/`。
> 靶子:本树 dev server `http://localhost:5231`(mock)。

**结论一句话**:修法本身(`<SvgText>` = `h("text", attrs, slot)`)根因判对、实现干净、13 处属性零丢失;**但两道门共用同一条发现谓词 `/<SvgText/`,导致源码门的每一个洞同时也是运行时门的洞**——最短的一条:换成 kebab 写法 `<svg-text>` 且忘记 import,标签在页面上 0×0 不可见,两道门全绿、console 无 error。另外「attributify 在根上修」这句话被实测证伪:`ignoreAttributes` 只挡裸属性名,绑定式 `:opacity` 完全绕过,`pages/globe/globe` 上 669 个大陆点此刻就是 100 倍偏透明(既有缺陷,非本包引入,但本包新建的同族门对它全绿)。

---

## P0

### P0-1 kebab 写法 `<svg-text>` 未 import:标签 0×0 不可见,两道门全绿

**为什么这是真洞而不是理论洞**:Vue 对 `<script setup>` 里 `import SvgText` 的组件**同时接受** `<SvgText>` 与 `<svg-text>` 两种写法,kebab 是 Vue/uni 模板的惯用写法。`[svgtext-import]` 判据存在的全部理由就是「忘了 import 会退回不渲染」——而它只认 PascalCase。

**证据**(`.claude/pkg-dev/skeptic/kebab.mjs`,一次跑完三层):

```
[源码门] kebab 新页面 + 仓内已有合法文件 -> hits = 0 []
[源码门] 单看 kebab 文件 ->  {"hits":[],"svgSpans":1,"svgTextNodes":0,"file":"new.vue"}
[运行时门] 该文件的 <SvgText 静态计数 = 0 -> svgTextFiles() 不收录 -> ROUTE_MAP 不要求登记 -> unregistered 不红,该路由永不被探
[浏览器]  { "kebabExists": true, "kebabTagName": "svg-text",
   "kebabNS": "http://www.w3.org/2000/svg",
   "kebabBox": { "w": 0, "h": 0 },
   "svgTextSelectorCount": 1,   <- 只数到对照组那个真 <text>
   "uniTextInSvg": 0 }          <- [uni-text-in-svg] 判据也不响
[浏览器] console.warn: 1 [Vue warn]: Failed to resolve component: svg-text
[浏览器] console.error: 0
```

三道判据同时失效:

1. 源码门 `:73` 的 `/<SvgText(?=[\s/>])/g` **大小写敏感**,数不到 kebab,于是 `svgTextNodes = 0`,`[svgtext-import]`(`:79`)不触发、`[svgtext-outside]` 不触发。
2. 运行时探针 `:52` 的 `svgTextFiles()` 用**同一条正则**,该文件不进清单,`judgeRegistry`(`:60`)不报 `[unregistered]`,这条路由**永远不会被探**。
3. 即使这条路由碰巧被探,`min = files[file] = 0`,`[count]` 恒过;`[uni-text-in-svg]` 也是 0(它不是 uni-text,是 SVG 命名空间下的未知元素);Vue 只发 `console.warn`,而探针 `:157` 只收 `m.type() === "error"`。

**同族**:`<SVGTEXT>`、`<Svgtext>`、别名 import(`import Foo from "@/components/svg-text"` 配 `<Foo>`)同理全绿,见 P1-3。

**一行修法**:发现谓词改成大小写不敏感 + kebab 同义(`/<(SvgText|svg-text)(?=[\s/>])/gi`),源码门与探针两处必须同改(它们是同一条谓词的两份拷贝,建议抽到 `scripts/lib/` 一处)。

---

### P0-2 「attributify 在根上修」被证伪:`ignoreAttributes` 不管绑定式;`globe` 上 669 个点此刻 100 倍偏透明,新门全绿

**被证伪的原话** —— 提案「方案评估」末段与 `docs/PORT-PITFALLS.md` P-123「修法」段:

> **attributify 劫持**在根上修:`uno.config.ts` 给 `presetAttributify` 加 `ignoreAttributes`

**机制**(回源 `D:\WORKS\PLAN\Nexion-uniapp\node_modules\@unocss\preset-attributify\dist\index.mjs`):

```
124: const strippedPrefixes = ["v-bind:", ":"];
143:   if (ignoreAttributes.includes(name)) return [];       <- 先查豁免表
145-148: for (const prefix of strippedPrefixes) if (name.startsWith(prefix)) { name = name.slice(prefix.length); ... }   <- 后剥前缀
```

查表在剥前缀**之前**,所以 `:opacity` / `v-bind:font-size` 永远匹配不到豁免表,而生成的选择器却是剥完前缀的 `[opacity~="0.25"]`。豁免表是「只挡裸写法」的一半修法。

**A/B 实测**(`.claude/pkg-dev/skeptic/uno-ab.mjs`,同一份源码分别喂父提交与 HEAD 的 uno 配置,仓内 UnoCSS 66.7.0):

```
--- BASE (6 attr rules) ---
   [fill-opacity~="0.6"]{--un-fill-opacity:0.006;}
   [fill-opacity~="0.65"]{--un-fill-opacity:0.0065;}
   [fill-opacity~="0.95"]{--un-fill-opacity:0.0095;}
   [font-size~="22"]{font-size:5.5rem;}                <- P-123 本尊
   [opacity~="0.25"]{opacity:0.0025;}
   [opacity~="0.5"]{opacity:0.005;}
--- HEAD (4 attr rules) ---
   [fill-opacity~="0.6"]{--un-fill-opacity:0.006;}     <- 绑定式,活着
   [fill-opacity~="0.95"]{--un-fill-opacity:0.0095;}   <- 绑定式,活着
   [opacity~="0.25"]{opacity:0.0025;}                  <- 绑定式,活着
   [opacity~="0.5"]{opacity:0.005;}                    <- 绑定式,活着
```

裸写法两条(`font-size="22"` / `fill-opacity="0.65"`)确实被修掉了;绑定式四条原样存活。

**活体后果**(`.claude/pkg-dev/skeptic/shot.mjs`,本树 5231,`pages/globe/globe`):

```
{ "total": 689, "byOp": { "1": 20, "0.0025": 367, "0.005": 302 } }
```

来源 `src/pages/globe/globe.vue:76` 的 `:opacity="d.bright ? 0.5 : 0.25"`(值里有空格,提取器切出 `0.5` 与 `0.25` 两个 token)。**669 个大陆点的计算 opacity 是 0.25% / 0.5%,不是 25% / 50%,差 100 倍**;截图里整块大陆点阵完全不可见,只剩 6 个区域光点,而页面文案写着 Brighter green = denser cluster。同族还有 `src/pages/team/network.vue:85` 的 `:fill-opacity`(只写 CSS 变量、当前无消费者)。

**归责要说清楚**:`opacity` 在 UnoCSS 默认豁免表与本次新表里**都在**,A/B 证明这条规则前后逐字相同 —— **这是既有缺陷,不是本包引入的**。P0 的落点是另外两件:

1. 提案与 P-123 把它写成「在根上修」,而实际只修了一半,且**没有一处文字说明绑定式不受保护**;
2. 本包新建的 `[attributify-exempt]`(静态,只查表里有没有那两个字符串)与 `[font-size-hijacked]`(运行时,只量 `svg text` 的 `font-size`)**对整个同族全绿** —— 谁哪天写下 `:font-size="n"`,两道新门一条都不会响。

**修法**(推荐 ①):① `presetAttributify({ prefixedOnly: true })` 或整体摘掉 presetAttributify(提案自己已列为可选项,实测全仓无属性式工具类活体使用,见「未打破的部分」第 4 节),一次根除,不再维护 denylist;② 若保留,`[attributify-exempt]` 改成扫源码里所有 `:<呈现属性>=` / `v-bind:<呈现属性>=` 绑定并判红,同时 `[font-size-hijacked]` 扩到 `opacity` / `fill-opacity` / `letter-spacing` / `font-weight`,并扩到非 text 的 SVG 元素。

---

### P0-3 运行时门只判「排版出来了」,不判「看得见」——一个字符就能让已登记路由上的标签隐形而门全绿

`judgeSnapshot`(探针 `:97-118`)的判据集合里**没有任何颜色 / 可见性 / 遮挡 / 视口判据**。合成页面逐条实测(`.claude/pkg-dev/skeptic/probe-holes.mjs`,直接调被审的 `snapshotScript` 与 `judgeSnapshot`):

| 构造(用户看不见) | 门判决 | 实测 |
|---|---|---|
| `visibility:hidden` | **GRN** | `vis=hidden`,bbox 仍 >0 |
| `opacity:0` | **GRN** | `op=0` |
| `fill` 等于背景色(#111 on #111) | **GRN** | `fill=rgb(17,17,17)` |
| `fill="transparent"` | **GRN** | `fill=rgba(0,0,0,0)` |
| `fill-opacity="0"` | **GRN** | — |
| 祖先 `overflow:hidden` 把整个 svg 裁掉 | **GRN** | `onScreen=false` |
| 整个 svg 在视口外(`top:-9999px`) | **GRN** | `onScreen=false` |
| svg 被不透明层完全盖住 | **GRN** | — |
| 两个 text 完全重叠互相糊掉 | **GRN** | — |
| svg 自己的 `clip-path` 把文字裁没 | **GRN** | — |
| `font-weight` 被 CSS 劫持 600 变 100 | **GRN** | `fw=100`(门不检查) |
| `letter-spacing` 被劫持 1.5 变 6px | **GRN** | `ls=6px`(门不检查) |
| `transform` 把文字移出 svg 盒 | RED `[inside]` | 抓到 |
| 字号劫持但写在 `style` 而非属性 | RED `[inside]` | 靠溢出偶然抓到,`[font-size-hijacked]` 本身没响(属性不存在) |

15 格里 **10 格全绿**。这不是理论:在 `src/pages/team/network.vue` 任意一处 `<SvgText>` 上加 `fill-opacity="0"` 或一个 `visibility:hidden` 的 class,就是「已登记路由 + 标签不可见 + 两道门全绿」。

**`[inside]` 判据名与文档口径不符**:它比对的是**所属 `<svg>` 自己的 bbox**(`:106-108`),不是浏览器视口。提案 / P-121 追记 / 探针文件头三处都写成「位于 svg 视口内」或「视口内」,读起来像视口判据。上表第 6、7 行就是这个差:标签规规矩矩待在自己的 svg 里,而 svg 整个被裁到屏幕外,门全绿。

**修法**:`snapshotScript` 增采 `getComputedStyle` 的 `visibility` / `opacity` / `fill` / `fill-opacity` 与 `elementFromPoint` 命中判定;`judgeSnapshot` 加 `[invisible]` 与 `[offscreen]` 两条判据;`[inside]` 改名或文档改口径。

---

## P1

### P1-1 源码门的 `<svg>` 跨度用 indexOf 顺序配对,不数深度 —— 嵌套 svg 与属性里的 `</svg>` 都能把 `<text>` 藏出判定面

源码门 `:47-55`:`tpl.indexOf("<svg", i)` 配 `tpl.indexOf("</svg>", a)`,外层跨度在**内层** `</svg>` 处就收尾。

实测(`.claude/pkg-dev/skeptic/bypass.mjs`,直接喂 `judgeVue`):

```
GRN  spans=1 nodes=0 tags=[—]  A 嵌套 svg:内层 </svg> 之后、外层之内的 <text>
     源码:<svg><svg x="10" y="10" width="50"><circle /></svg><text x="1" y="2">GHOST</text></svg>
GRN  spans=1 nodes=0 tags=[—]  K 三层嵌套 svg,最外层 text
GRN  spans=1 nodes=0 tags=[—]  L svg 与 text 之间隔一个属性值里的 </svg> 字符串
RED  spans=0 nodes=0 tags=[svg-unclosed]  I 自闭合 <svg /> 后面跟合法的裸 <text>    <- 假红
```

- 嵌套 `<svg>` 是**合法且常用**的 SVG(嵌套视口)。今天仓内 0 处,所以是**潜在**不是活体;门自己的 27 格红测里也没有这两格。
- `svg-unclosed` 分支(`:52`)命中后 `break`,**中止整个文件的跨度收集**;好在同时判红,fails closed,但自闭合 `<svg ... />` 是合法写法(例如配 v-html 用),会假红。

**修法**:跨度改成带深度计数的扫描(遇 `<svg` 加一、`</svg>` 减一、自闭合不计),并补两格红测(嵌套 svg 的外层 `<text>` 必红;自闭合 svg 必不红)。

### P1-2 两道门共用一条发现谓词,源码门的每个洞同时是运行时门的洞(它们不是两层,是一层)

源码门(`:73`)与探针(`:52`)各写了一份 `/<SvgText(?=[\s/>])/g`。运行时门的路由清单由这条谓词**推导**而来(`svgTextFiles()` 到 `judgeRegistry` 到 `ROUTE_MAP`)。因此:

> 任何绕过源码门发现的写法(kebab / 别名 / `<component :is>` / 嵌套 svg 里的裸 `<text>` / v-html),都会让**该文件不进 `svgTextFiles()`**,于是它承载的路由**永远不会被探针访问**。运行时门不是「兜底」,是「同一个盲区的第二份拷贝」。

源码门文件头写着:

> `<component :is="text">` 也不判(H5 实测能出真 text,但依赖 uni 不注册全局 text 组件,**运行时门兜底**)

这句「运行时门兜底」只在该文件**同时还含有 `<SvgText`** 时成立。一个全部用 `<component :is>` 画标注的新页面,两道门都看不见它。P0-1 就是这条结构问题的最短实例。

**修法**:探针的路由发现改成不依赖 `<SvgText`,例如「模板里有 `<svg` 且 svg 内有任何文字节点候选的文件都必须登记」,或干脆按 `pages.json` 全路由扫 `svg text` 加 `svg uni-text`(全站遍历而非名单制)。

### P1-3 别名 import 加别名标签完全隐形

```
GRN  spans=1 nodes=0 tags=[—]  E 别名 import + 别名标签 <SvgLabel>
     script: import SvgLabel from "@/components/svg-text";
     template: <svg><SvgLabel x="1">GHOST</SvgLabel></svg>
```

运行时它渲染**正常**(同一个组件),所以不会立刻出可见缺陷;真正的损失是该文件不进 `svgTextFiles()`,该路由不被登记、不被探,这张图上的任何后续回归(字号劫持 / 隐形 / 数量掉)都没有门。

**修法**:`[svgtext-import]` 反过来判 —— 扫「import 自 `components/svg-text` 的**本地名**」,再用该名字去模板里数节点;并把这条也用于探针的文件发现。

### P1-4 把 `<SvgText>` 抽进子组件是合法且能工作的写法,却被 `[svgtext-outside]` 判红(假红,堵死正常演进)

实测(`.claude/pkg-dev/skeptic/nested-comp.mjs`,真 Vue 3 挂载):

```
[子组件里的 SvgText] {"found":true,"ns":"http://www.w3.org/2000/svg","isSVGText":true,"w":45.90625,"h":16,"txt":"NESTED"} warns: 0
```

子组件模板顶层写 `<SvgText>`、父级把它放进 `<svg>`,命名空间照常继承下去,渲染出真 `SVGTextElement`。但 `judgeVue` 会因为它不在本文件的 `<svg>` 跨度内而报 `[svgtext-outside]`。门没有任何逃生阀(无 ignore 注释机制),等于禁止把带标注的子图抽成组件。

同类假红:`<text>` 写在 `<foreignObject>` 里(那里 `<uni-text>` 反而是**合法**的 HTML 内容),实测 `RED [svg-text]`。

**修法**:`[svgtext-outside]` 降级为 warning,或加一行注释逃生阀并在门里识别;`<foreignObject>` 区间从 `[svg-text]` 判定面里剔除。

---

## P2

### P2-1 `scripts/verify.sh:3126` 是坏正则:运行时门真红时,操作者拿不到任何明细(本次提交引入)

那一行把 `^FAIL` 和 `^  [` 两个分支写进同一个 `grep -E` 模式,`[` 未转义即未闭合字符类。实测:

```
$ grep -E "^FAIL|^  [" t.log
grep: Invalid regular expression
EXIT=2
```

`bad` 已先调用,门本身还是红的,只影响诊断输出。同一提交里源码门那一半(`scripts/verify.sh:381`)用的是正确的 `grep -E "^FAIL"`。**修法**:把 `[` 转义成 `\[`。

### P2-2 `[count]` 期望取自同文件的静态 `<SvgText` 数,v-for 出来的标签少了大半也不红

`src/components/store/product-render.vue` 静态 `<SvgText` = **3**,而实景是 **6**(2 丝印加 4 个 v-for 芯片):

```
PASS pages/store/detail?id=cloud-share  svg text 6(>=3) ... CLOUD SHARE / DISTRIBUTED · NO HARDWARE / GPU / CPU / RAM / SSD
```

`cloudNodes` 从 4 掉到 1,实景 3 个仍然满足 min 3,**绿**,而 3/4 个芯片标签已经没了。提案 Done-when 白纸黑字写「`pages/store/detail?id=cloud-share` 6 个(2 丝印 + 4 芯片)」,门实际只钉住 3。**修法**:v-for 承载的节点在 `ROUTE_MAP` 里显式写 `min: 6` 并注明来源。

### P2-3 `min` 覆盖没有机器约束,`min: 0` 可以静默摘掉整条路由的 `[count]`

探针 `:104` 判 `snap.texts.length < min`,`:171` 取 `cfg.min ?? files[file]`。文件头写「min 只在静态计数不适用时覆盖,**必带理由**」,但没有任何判据检查理由存在、也不禁止 `min: 0`。**修法**:`min` 为 0 直接判红,或要求同对象里有 `whyMin` 字段。

### P2-4 探针 import 即执行 main(),且默认靶子是 5173、无树身份 preflight —— 我自己就踩了一次

探针末尾的 `if (argv.includes("--selftest")) selftest(); else main();` 是顶层语句。我 import 它导出的判定函数时它自动跑了 `main()`,`BASE` 取默认 `http://localhost:5173`(`:29`)= 主 checkout 的 server(基线分支,没这个修复),于是打印出:

```
FAIL pages/team/network(src/pages/team/network.vue)
  [count] svg text 只有 0 个,期望 >= 4
  [uni-text-in-svg] 页面里有 4 个 <svg> 内的 <uni-text>(P-121 原形:0x0 不渲染)
... binary-how 5 · globe 1 · store/detail 6
svg-text-render-probe: 8 条不通过(lang=en)
```

两面看:**这意外给出了一次针对真·未修树的端到端红测**(见「未打破的部分」第 2 节),同时暴露了 `CLAUDE.md` 里已经写明的那个坑 —— BASE_URL 默认 5173,而 5173 上多半是主 checkout 的 server,运行时门会安静地验另一棵树。verify.sh 内部有树身份 preflight,但**独立跑这个探针没有任何树身份检查**,而门失败时给出的提示命令正是让人独立跑它。

**修法**:导出的判定函数与 `main()` 分文件,或用 `import.meta.url === process.argv[1]` 守卫;`main()` 起手核一次 `VITE_ROOT_DIR`(与其它探针同口径)。

### P2-5 红测有两格「过得对但过得没道理」—— mutation 测试暴露

我把两个门各自逐判据变异,看红测抓不抓得住(`.claude/pkg-dev/skeptic/mutate.mjs` 与 `mutate-src.mjs`):

**运行时门 18 格:12 个变异体 11 个被抓,1 个存活**

```
SURVIVED | M7 rendered 用 || 代替 &&   exit=0  18/18 格通过
CAUGHT   | M1 杀 count / M2 杀 uni-text-in-svg / M3 杀 empty / M4 杀 rendered /
           M5 杀 inside / M6 杀 font-size-hijacked / M8 inside 容差放到 1e9 /
           M9 font-size 容差放到 1e9 / M10 杀 unregistered / M11 empty 只判 null / M12 count 恒真
```

即没有一格能区分「宽高都要大于 0」和「宽高有一个大于 0 就行」。

**源码门 27 格:12 个变异体 10 个被抓(2 个 patch 字符串没配上),1 个存活**

```
SURVIVED | M10 判定面改成全文(去掉 templateRegion)   exit=0  27/27 格通过
```

红测里那格「合法:script 里拼 v-html 字符串的 `<text>` 不在判定面(lucky-spin 先例)」**是靠位置偶然过的**,不是靠 `templateRegion()`:那个字符串排在模板 `</svg>` 之后,本来就不在任何跨度里。我构造了能区分的用例(`.claude/pkg-dev/skeptic/tplregion.mjs` 与 `tplregion3.mjs`,script 字符串里同时含 svg 与 text):

```
现行(带 templateRegion):        []
M10(去 templateRegion)同一文件: ["svg-text"]
```

**修法**:红测补这两格(单轴为 0 的 bbox;script 字符串里自带 svg 的 text)。

### P2-6 `[console]` 只收 error,而本门守的失败模式发的是 warn

探针 `:157` 只收 `m.type() === "error"`。Vue 未解析组件的告警是 `console.warn`(P0-1 实测 warn 1 条、error 0 条)。`[svgtext-import]` 判据存在的理由就是「没 import 时 Vue 只警告一句然后按元素名建标签」,那句警告在运行时门里是隐形的。**修法**:额外收集 warning 类型里匹配 Vue warn 且提到 resolve component / custom element 的条目并判红。

### P2-7 组件的「边界(如实)」清单漏了 ref 语义变更

`src/components/svg-text.ts:9` 写「属性、绑定、事件、v-if / v-for、插值子节点**全部原样透传**」,`:18-22` 有专门的「边界(如实)」段,但两处都没写:`ref` 拿到的是**组件实例**而不是 DOM 元素(原生 `<text ref>` 给 Element),要拿元素得走 `$el`。13 处现在都没用 ref,属潜在。**修法**:「边界」段补一行。

### P2-8 判定面只扫 `src/**/*.vue`

源码门 `:124` 的 `walk(SRC)` 且只收 `.vue`。仓内 `.vue` 全在 `src/`(唯一例外 `./.trash/20260818-lab/dev/svg-lab.vue`,已在回收站),无 `.nvue` / `.uvue`,所以今天无活体损失;但判定面塌缩判据只看「有没有 svg 块 / 有没有 SvgText」,不看「扫了几个目录」,目录结构一变不会有人知道。

---

## P3(文档与收尾)

### P3-1 提案里一个支撑选型的数字是错的

提案方案评估表 E 行:「不换行(**13 处文案最长 9 字符**,不需要)」。实际最长是 `src/components/store/product-render.vue:65` 的 `DISTRIBUTED · NO HARDWARE` = **25 字符**,其次 `CLOUD SHARE` = 11。结论(不需要换行)仍成立,三语实景 `[inside]` 全绿,但这个用来否掉方案 A 的数字本身不对。

### P3-2 状态写「Shipped 待收尾」,而 Done-when 5 格加实施拆解 4 步全是未勾

包括本轮我实测确实已达成的几条(三语 16 个文字全渲染、type-check 0 错、两门红测 27/18 全过)。

### P3-3 `docs/PORT-PITFALLS.md` P-123 的两处口径

- 「修法:在根上修」,见 P0-2,只修了裸写法一半。
- 「`fill-opacity="0.65"` 被扫成 `--un-fill-opacity: 0.0065`(目前无消费者,同族隐患)」,裸写法这条已修掉;绑定式 `src/pages/team/network.vue:85` 的 `:fill-opacity` 仍在生成同款规则,文档没提。

### P3-4 合并冲突面

`git merge-tree --write-tree origin/UniApp HEAD` 报 `docs/PORT-PITFALLS.md`、`docs/前端产品更新日志.md`、`scripts/gates.manifest.json` 三处冲突。前两个是文档;**`gates.manifest.json` 里的 `svg-text-runtime` 条目正是 `scope_hit svg-text-runtime` 判定运行时门跑不跑的依据**,冲突解错等于静默摘门,合并时要专门核这一项。

---

## P-124(App-vue)独立复核结论

派了一个独立 agent 回源读 `@dcloudio/uni-app-plus/dist/uni-app-view.umd.js` 与 `@dcloudio/uni-shared`(均 3.0.0-4080420251103001)。**核心机制与结论成立,置信 HIGH(约 92%),两处措辞要修**:

- **成立且被低估**:命名空间不是在视图层才丢的,更早。服务层的 Vue 被 DCloud 打了补丁,`hostCreateElement(vnode.type, container)` **删掉了 namespace 参数**(`node_modules/@dcloudio/uni-app-vue/dist/vue.runtime.esm.dev.js:4938-4940`;对照 H5 侧 `@dcloudio/uni-h5-vue/dist/vue.runtime.esm.js:6845-6849` 保留了 namespace),且 DOM 同步协议 `CreateAction`(`uni-shared.d.ts:116-123`)根本没有命名空间字段。视图层 `Zy` 的 `document.createElement(t)` 只是最后一环。整份 `uni-app-view.umd.js` 里两处 `createElementNS` 都属于它自带的 runtime-dom,不可从同步协议到达;内置标签表 `Xy` 的 44 个 key 无任何 SVG 标签。
- **略有夸大**:「一张都不出」对矢量几何成立(伪造的 path / circle 实测 0 宽),但 `<text>` 子节点会落到 `Xy.TEXT` 变成 `uni-text`(`uni-app-plus/dist/style.css` 未给它 `display:none`),会以**无定位的行内文字**漏出来。同一结论,失败长相不同。
- **`nodeName.toUpperCase()`(`uni-shared.es.js:1377-1381`)不是病因**,只是 `Xy` 查表用大写;DOM 规范里 createElement 在 HTML 文档下永远用 HTML 命名空间,与大小写无关。P-124 原文措辞是准确的(写的是「不带命名空间」),不必改;别在转述时把两件事并成一条。
- **本仓当前是潜在不是活体**:`package.json` 只有 h5 / mp-* / quickapp-webview,**没有任何 `dev:app` / `build:app`**;`src/manifest.json` 的 app-plus 块是 uni 预设默认值(name / appid 皆空)。但仓里确实带着 App 契约(`src/lib/carrier.ts:16` 的 `#ifdef APP-PLUS`、`scripts/verify.sh:1822-1841` 的 App 条件编译门),第一次跑 `uni build -p app` 就转活体。提案「推荐先真机跑一次」是对的。

---

## 我试过但没打破的部分(供读者判断覆盖面)

**1. 修法本身的正确性,没找到问题。**

- `<SvgText>` 渲染出的是真 `SVGTextElement`(namespaceURI 为 SVG),命名空间经组件边界正确继承(我自己用 `vue.global.js` 挂载验证过直接使用与包在子组件里两种情形)。
- 根因判定正确且可回源:`uni-shared.es.js:205-209` 的 `isH5NativeTag(tag)` = 非 head 且(isHTMLTag 或 isSVGTag)且非内置组件。`text` 虽是 SVG 标签,但同时是 uni 内置组件,所以被判为非原生,编成 `<uni-text>`。这正是 P-121 的机制。
- 13 处属性 diff 逐字符比对干净:零新增、零丢失、零重排、零指令 / 事件 / class / style / a11y 变动;唯二的值变更是 `product-render.vue:63`(700 变 600)与 `:72`(800 变 600),提案 What changes 与 Impact 两段都写明了是刻意的视觉收敛。
- 属性透传实测(挂在本仓真用的 `@dcloudio/uni-h5-vue` runtime 上):静态属性 / 动态绑定(会更新)/ class(走 patchClass 的 isSVG 分支 setAttribute,没踩 SVGAnimatedString 只读坑)/ style / `@click` 转 onClick / v-if / v-for 加 key(patchFlag 1032,不是 STABLE slot)/ 绑定 undefined 与 null(走 removeAttribute)全部正确,0 dev 告警。唯一差异是 ref(见 P2-7)。

**2. 两道门对「原形缺陷」确实是红的,而且是对真树验的。**

- 意外把探针指到 5173(主 checkout,基线分支、没这个修复)时,它准确报出 `[uni-text-in-svg]` 4 / 5 / 1 / 6 加 `[count] 0`,4 条路由全红。这是一次针对**真·未修树**的端到端红测,不是合成用例。
- 路由写错或页面被删是 fail-closed:`pages/team/network-RENAMED` 与 `detail?id=NOT-CLOUD-SHARE` 实测 svg text 为 0,`[count]` 红。

**3. 两个红测本身质量高。**

- 源码门 27/27、运行时门 18/18,真仓扫描 0 违规(249 个 .vue、750 个 svg 块、13 处 SvgText / 4 文件)。
- Mutation 测试 24 个变异体里 21 个被抓、2 个 patch 未命中、**仅 2 个存活**(已列为 P2-5)。每个判据都有一格独占的红测在盯,不是凑数。
- 我另外构造的 14 个源码门绕过尝试里有 9 个被正确判红或正确放行:裸 text / 大写 Text / g 里嵌套 / 跨行开标签 / 一个 svg 里两处 / 第二个 svg 块 / 自闭合 text / 注释里的 text(正确放行)/ textPath 不误伤 / v-html 字符串(正确放行)/ 桶文件 import(正确判红)。

**4. attributify 改动的爆炸半径,「对现有可见 UI 影响为 0」这半句属实。**

- 全仓 `font-size=` 属性 **14 处 = 13 处 SvgText 加 1 处注释**(`src/components/svg-text.ts:14`),HTML 元素零使用,`:font-size` 与 `v-bind:font-size` 全仓 0 处。移除那条规则不可能影响任何 HTML 元素。
- 抄进去的默认四项 placeholder / fill / opacity / stroke-opacity 与 UnoCSS 66.7.0 的 defaultIgnoreAttributes 逐字一致,没有漏抄。
- P-123 说「letter-spacing / font-weight / text-anchor / dominant-baseline / stroke-width 要么没规则、要么值相同,无害」。我用仓内 UnoCSS 单独喂过这批属性(`.claude/pkg-dev/skeptic/uno-more.mjs`),只有 `stroke-width="1.6"` 生成规则,且是恒等映射;letter-spacing / font-weight / x / y / width / height / r / rx / font-family / dur / values 一条不生成。**这条口径准确。**
- 7 条路由的实景 CSS 里另有 size / active / accent / duration / px / aria-* 等属性选择器规则,但逐元素扫过去**没有一个活体元素带这些属性**(只有 aria-selected 与 aria-expanded 出现在 DOM 上,计算值正常)。提案「全仓未发现属性式工具类用法」与实景一致。
- 逐元素「属性值 vs 计算值」全量比对里,除 P0-2 的 `:opacity` 外,其余 38 个差异全是我的度量口径噪声(text 的 x/y 与 radialGradient 的 cx/cy/r 不是几何 CSS 属性、SMIL 动画中的 r、百分比 width 解析成 px),不是劫持。

**5. 门链接线,没找到问题。**

- probe_retry 接线点实数 **21**,等于 `scripts/verify.sh:154` 的 `expected_sites=21`。
- `scope_hit()`(`:204-212`)在 full 档直接返回 0,运行时门在全量档必跑;源码门(`:384`)不带 scope_hit,三档都跑。
- `node scripts/lib/verify-scope.mjs lint` PASS(gates 21 · steps 18 · h5Probes 10 · globals 27,接线一致、glob 均命中)。
- `svg-text-runtime` 的 inputs 含 `uno.config.ts`,改 uno 会正确拉起这道门。

**6. 其它门没被这次改名带坏。**

- `node scripts/i18n-hardcoded-en-copy-sentinel.mjs` PASS(exit 0);`node scripts/i18n-hardcoded-cjk-sentinel.mjs` PASS(exit 0);`npm run type-check`(vue-tsc)0 错。
- i18n 判定面没有因为标签改名而塌:直接喂两个哨兵的扫描函数,`<svg><SvgText>CLOUD SHARE</SvgText></svg>` 与旧的 `<text>` 形状同分(英文面命中 1、中文面命中 1)。
- 三语实景:`--lang zh` 与 `--lang vi` 运行时门同样全绿(你 / 直推 / 扩展,BAN / TRUC TIEP / MO RONG)。
- 编译面无残留:`src/**` 模板里 svg 内的 text 为 0、嵌套 svg 为 0、自闭合 svg 为 0、SvgText 在 svg 外为 0。`src/components/lucky-spin-sheet.vue:69` 的 v-html 转盘是文档点名保留的先例(innerHTML 走浏览器解析,运行时是真 SVG text)。

---

## 建议的处置顺序(不代表验收意见,主人拍板)

1. **P0-1**(kebab):发现谓词一行改加抽到 lib 共用,两门同改,补红测。成本约 30 分钟,不改产品代码。
2. **P0-3**(可见性判据):snapshotScript 加采 4 个计算值、judgeSnapshot 加 2 条判据;把「视口内」的说法统一。成本约 1 小时。
3. **P0-2**(attributify):先把「在根上修」这句话改准(提案加 P-123),再评估 prefixedOnly 或摘掉 presetAttributify;globe 那 669 个点是包外既有 P0,建议单独立包或当场随手修(它只需要把 `:opacity` 改成 `:style`,或给 uno 加 prefixedOnly)。
4. **P1-1 / P1-2 / P1-3 / P1-4**:门的结构性加固,可以一起做。
5. **P2-1** 那个坏正则是一字符修复,建议随下一次改 verify.sh 顺手带上。
6. P3 全是文档,收尾时一并。

---

## 未覆盖(时间原因)

以下角度我没跑完,**不代表这些面干净**,只代表本轮没证据:

1. **`npm run verify` full 档没跑**(21-26 min)。我只单跑了两道新门、i18n 英文面/中文面哨兵、`verify-scope lint`、`type-check`。全链里其余四百多格与本包的相互作用未验。
2. **小程序端完全没验**。`package.json` 有 11 个 `mp-*` 构建脚本,而 `h("text", …)` 在小程序编译器下走的是另一条路(不是 H5 的 `createElementNS`)。`<SvgText>` 在 mp-weixin 等端是渲染成什么、会不会报编译错,一次都没试过。这是比 P-124(App,本仓没有构建脚本)**更可能真出货**的一端。
3. **`font-weight` 700/800 → 600 的视觉回归没做前后对比**。改动是刻意且已记录的,但「之前不可见故无人管」意味着没有基线截图可比;丝印字重变细后在 Cloud Share 渲染图上够不够清晰,只有主人肉眼能判。
4. **双主题只验了 dark**。三语(en/zh/vi)过了运行时门,但 light 主题下这 13 处的字色(尤其 `--v5-on-brand` 与 `rgba(198,255,58,…)` 字面色)没抽验。
5. **「uni 内置组件名 vs SVG 元素名」的同族碰撞只查了 `text`**。P-121 追记自己点名了 `<image>`(称仓内 0 处),我没有独立复核这个数字,也没有系统枚举其它重名(`<a>` / `<title>` / `<style>` / `<script>` / `<switch>` / `<progress>` / `<canvas>` / `<video>` 里哪些同时是 SVG 元素又是 uni 内置组件)。750 个 svg 块里有没有第二种静默失效,未知。
6. **`verify:scoped` 档下的门选择没实测**。我只确认了 `scope_hit` 在 full 档恒真;改动集只碰 `src/pages/**` 时 `svg-text-runtime` 会不会真被选中,没跑 `verify-scope plan` 验过。
7. **源码门的两个变异体没跑成**(M2 大小写不敏感、M12 prefixedOnly 分支),patch 字符串没配上。两者各自都有专属红测格在盯,所以我判断风险低,但没有 mutation 证据。
8. **`.trash/20260818-lab/dev/svg-lab.vue`** 是本包工作期间产生的实验文件,我只确认它在回收站、不在判定面内,没读它的内容,不知道里面有没有值得回收的结论。
