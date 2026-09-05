#!/usr/bin/env node
// 硬编码**英文**用户文案哨兵 —— 判据是**构造性**的:渲染位上出现的每一个英文词都必须被显式
// 授权(技术标识 / 品牌 / 单位 / 注册名短语),没授权的一律拦。
//
// 为什么要这道门(2026-08-17):仓里全套 i18n 机器门整条轴都是**单面**的 ——
//   · i18n-hardcoded-cjk-sentinel —— 判「页面里不许出现**中文**」,英文字面量天然免检
//     (它最后一条红测 `["纯英文页面 0 命中", …, "<view>Loading…</view>", 0]` 把英文明文放行);
//   · i18n-key-mirror —— 只保证**已进词典**的 key 三语齐,压根没进词典的字符串无感;
//   · spec-sentinel-render-gate —— 只守 product-catalog 那一个哨兵值怎么渲染。
// 实证代价:`src/components/me/wallet-card.vue` 的槽位行长期写成
// `{{ onlineCount }} live · {{ emptySlots }} slots open`,中文 / 越南语界面直出英文,
// 456 格门一条都没响,是独立验收 agent 肉眼在越南语截图里发现的。本门补「英文有没有跑进界面」这条轴。
//
// 🔴 判据形状是**实测**定的,不是猜的。先用粗探针量了规模(249 个 .vue,渲染位上含拉丁字母的
// 文本 244 条),再逐条人工分类,结论推翻了「≥2 个小写英文词即拦」这个直觉起点:
//   · 真违规散布在**全部**词形带里 —— `YOU` / `DIRECT` / `EXTENDED` / `VERIFIED`(全大写)、
//     `Unavailable` / `Cooling`(首字母大写单词)、`Task lock` / `{{n}} min` / `{{n}}d ago`(1 个小写词)。
//     「≥2 个小写词」会漏掉其中大多数。
//   · 反过来,`<script>` 里的字符串字面量有 15579 条(≥2 小写词的 6317 条)—— 英文是代码本身的
//     语言,路由 / 存储键 / 事件名 / class 名全长这样。**候选远多于真命中,那条轴判不了**,
//     所以本门只判**渲染位**,script 里的 toast / Error 文案不在判定面内(见文件末尾 KNOWN GAPS)。
//
// 🔴 v2(同日,独立审计 3 个 P1 + 20 个 P2 之后):v1 的判定面用「属性名白名单 + 双引号 + 非绑定」
// 这种**表层形态**区分文案与非文案,于是同义别名整族逃逸 —— `:aria-label="`Remove ${p.name}`"`
// (仓内 2 处活的英文读屏文案)、单引号属性、以及任何没被列进白名单的组件 prop(`desc` 单项
// 32 个调用点)。判定面已**反转**:属性默认**进**判定面,靠「非文案属性名」豁免表挖掉,
// 每条带理由 + 0 命中即失效 —— 新增一个展示 prop 默认被判,而不是默认逃逸。
// (本仓元门 `selfcheck-gate-targets.mjs` 的全部教训就是「手写闭集 × 开放集合 = 必漏且静默全绿」。)
//
// 用法:
//   node scripts/i18n-hardcoded-en-copy-sentinel.mjs             扫全仓
//   node scripts/i18n-hardcoded-en-copy-sentinel.mjs --selftest   红测(判据自证有效)
import fs from "node:fs";
import path from "node:path";
import { stripComments, templateRegion, styleRegions } from "./lib/sfc-strip-comments.mjs";

// ── 授权短语 ─────────────────────────────────────────────────────────────────
// 🔴 短语级授权先于词级 —— 合规认证的注册名里含 `Type` / `Level` / `Node` 这类**普通英文名词**,
// 把它们按**词**授权,`<text>Node Type</text>` / `<text>Level II</text>` 这种真文案就整句放行了
// (独立审计实测)。所以整串授权,拆开的单词不放行。
const TECH_PHRASES = [
  { id: "cert-name", why: "合规认证与支付标准的注册名,证书上就是这么印的;拆词授权会让 Type / Level / Node 这类普通名词全局放行", phrases: ["SOC 2 Type II", "PCI DSS Level 1", "3DS 2.2"] },
  { id: "product-name", why: "产品全名(创世节点),`Genesis` / `Node` 单独作为词不授权", phrases: ["Genesis Node"] },
];

// ── 授权词 ───────────────────────────────────────────────────────────────────
// 纪律(照抄 i18n-hardcoded-cjk-sentinel 的豁免纪律):① 按**类别**授权并写明理由;
// ② 大小写不敏感(`GB`/`gb` 同权,免得授权的宽严取决于书写风格);
// ③ 🔴 **每个 token 0 命中即判据失效** —— 死授权不是「白留一条」,它是给未来的英文文案开的
//    静默后门:哪天有人把 `Level up now` 写进页面,`Level` 这条死授权正好帮它少挨一次判。
//    所以某个 token 在判定面上再也不出现时,门直接红,要求删掉它。
// ④ 🔴 授权是**词级**的,不是行级、也不是文件级 —— 一行里只要有一个词没授权,这行照判。
const TECH_TOKENS = [
  {
    id: "ticker-brand",
    why: "币种代码 / 品牌名 / 产品型号 / 支付服务商名:全球单一写法,翻译过去反而是错的",
    // 🔴 `CertiK` 曾在这里,被本门自己的「0 命中即失效」判据赶走 —— 那行原文是 `CertiK audited`,
    //    `audited` 是要翻译的动词,整句收进 t.ref.certikAudited 之后判定面上再没有这个词。
    tokens: ["NEX", "USDT", "NexGrid", "NexGridBox", "Cregis", "BEP", "GEN", "REF", "RunID", "Visa", "Mastercard"],
  },
  {
    id: "cert-acronym",
    why: "认证机构 / 法规的缩写(ISO 27001 · GDPR · MSB):都是不翻译的专有缩写,且不与任何普通英文词同形",
    tokens: ["ISO", "GDPR", "MSB"],
  },
  {
    id: "unit-abbrev",
    why: "行业通用的计量 / 技术缩写(显存 GB · 算力 TOPS · 年化 APY · VRAM · 毫秒 ms · 文字方向 RTL):各语言技术语境里都直接用原文",
    tokens: ["GB", "TOPS", "APY", "VRAM", "ms", "RTL"],
  },
  {
    id: "input-format-mask",
    why: "输入框的**格式掩码**(卡片有效期 MM/YY · 日期 YYYY-MM-DD · 安全码 CVV):示意的是输入的字符位数与顺序,不是可读文案;翻成本地词反而没法照着填",
    tokens: ["MM", "YY", "YYYY", "DD", "CVV"],
  },
];

const AUTHORIZED = new Map();
const DUP_TOKENS = [];
for (const group of TECH_TOKENS) {
  for (const tk of group.tokens) {
    const key = tk.toLowerCase();
    // 🔴 大小写不敏感的表里 `NexGrid` 与 `NEXGRID` 折叠成同一条 —— 于是「逐 token 判存活」
    //    实际是「逐 lowercase key 判存活」,重复那条既不可能独立死也不可能独立报(审计 F16)。
    if (AUTHORIZED.has(key)) DUP_TOKENS.push(tk);
    AUTHORIZED.set(key, group.id);
  }
}

// ── 非文案属性 ───────────────────────────────────────────────────────────────
// 🔴 判定面反转的另一半:属性**默认进判定面**,这张表把确定不渲染文字的属性挖掉。
// 每组带理由 + 0 命中即失效(死豁免同样是静默后门)。新增的组件 prop 不在表里 → 默认被判。
// 🔴 两类豁免的**存活规则不同**,这是判据分类而不是偷懒(红测抓出来的):
//   · `langLevel: true` —— Vue / HTML **语言级**写法(指令语法、事件处理器)。「它的值不是文案」是
//     语言事实,可从规范推出,不需要本仓出现过才成立。把它们按「0 命中即失效」剪掉,只会让第一个
//     写 `v-on:click` 长写法的人吃一条纯误报 —— 那不是门在守东西,是门在添乱。
//   · 其余(组件 prop 名等)—— 是**对本仓的观察**,必须逐名判存活:投机性地预先塞一个名字进去,
//     等于给「某天有人用这个 prop 装文案」提前免检(独立验收实测当时 47/161 条是死的)。
const NON_COPY_ATTRS = [
  {
    id: "vue-directive",
    why: "Vue 指令与结构性属性:值是表达式 / 键 / 分支条件,不渲染成文字",
    langLevel: true,
    names: ["v-if", "v-else-if", "v-else", "v-show", "v-for", "v-on", "v-bind", "v-once", "v-pre", "v-cloak", "key", "ref", "slot", "is"],
    // `v-model:open` / `v-slot:foo` / `#foo` 带参数;`v-html` 的值是**构造 HTML 的表达式**
    // (仓内实测里面是 `<text style="color: var(--v5-ink-4)">…` 这种拼串),判它是纯误报 ——
    // v-html 里的真文案属于 script 表达式面,见文件末 KNOWN GAPS;`v-text` 是纯文本,照判。
    prefix: ["v-model", "v-slot", "#", "v-html"],
  },
  {
    id: "style-hook",
    why: "样式挂载点:class 名与内联 CSS / CSS 变量,值来自设计系统词汇表(`flex` / `truncate` / `var(--v5-ink-4)`),不是给人读的句子",
    names: ["class", "style", "font-family", "font-size", "font-weight", "letter-spacing", "text-anchor", "dominant-baseline",
      "placeholder-class", "placeholder-style", "input-style", "icon-bg", "tint", "accent", "previous-margin", "next-margin"],
  },
  {
    id: "svg-geometry",
    why: "SVG 几何 / 绘制 / SMIL 动画属性:坐标 · 路径 · 颜色 · 描边与动画枚举(`round` / `indefinite` / `SourceAlpha`),与语言无关",
    names: ["d", "points", "viewBox", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "transform", "opacity", "offset", "stop-color", "stop-opacity", "filter", "preserveAspectRatio",
      "attributeName", "repeatCount", "dur", "begin", "values", "keyTimes", "from", "to", "rotate", "path", "in", "stdDeviation", "focusable"],
  },
  {
    id: "element-mechanics",
    why: "元素机制类属性:类型 / 模式 / 资源地址 / 表单取值 / 画布 id / 无障碍**状态**(取值是 ARIA 规定的枚举,不是文案)",
    names: ["type", "mode", "name", "id", "src", "href", "value", "min", "maxlength", "rows", "role", "tabindex", "inputmode", "canvas-id",
      "aria-hidden", "aria-live", "aria-modal", "aria-expanded", "aria-selected", "aria-checked", "aria-disabled", "aria-describedby", "aria-atomic", "aria-haspopup", "aria-busy",
      "disabled", "checked", "scroll-into-view", "cursor-spacing", "confirm-type", "focus"],
  },
  {
    id: "data-hook",
    why: "`data-*` 是给探针 / 测试认位置的锚,不渲染;整族按前缀放行",
    prefix: ["data-"],
  },
  {
    id: "event-handler",
    why: "事件处理器:值是语句,里面的字面量是事件名 / 路由 / 键名(`emit('close')` 极常见),判它是纯误报 —— 属 script 表达式面,见文件末 KNOWN GAPS",
    langLevel: true,
    prefix: ["@", "v-on:"],
  },
  {
    id: "component-enum-prop",
    why: "本仓组件的**枚举型 / 路由型** prop(色调 · 变体 · 对齐 · 图标名 · 当前 tab · 目标路由):取值来自组件自身的联合类型或 pages.json 的路径,不是文案",
    // `to` 归到上面的 SMIL 动画组(那才是它在本仓的真实用途);这里不再重复列,
    // 否则逐名存活判定对它失效(跨组重复 = 永不判死)。
    names: ["tone", "kind", "icon", "color", "accent-bg", "accent-text", "size", "status", "back", "link", "active", "surface", "context"],
  },
];

const NON_COPY_NAMES = new Map();
const DUP_ATTR_NAMES = [];
for (const g of NON_COPY_ATTRS) {
  for (const n of g.names ?? []) {
    const k = n.toLowerCase();
    if (NON_COPY_NAMES.has(k)) DUP_ATTR_NAMES.push(n);
    NON_COPY_NAMES.set(k, g.id);
  }
}
const NON_COPY_PREFIX = NON_COPY_ATTRS.flatMap((g) => (g.prefix ?? []).map((p) => [p.toLowerCase(), g.id]));

// ── 两张表之间的判据强度必须守恒 ─────────────────────────────────────────────
// 🔴 独立验收(2026-08-17)点出:「死授权是静默后门」这条纪律逐 token 焊在 TECH_TOKENS 上,
//    却没焊在豁免表上 —— 而判定面反转之后,**真正决定宽严的是豁免表**。实测当时 161 个名字里
//    47 个全仓 0 命中(纯投机),那批正是「某天有人写 `state="Cooling down"` 时帮它免检」的形状。
//    47 个已全部剪掉,并在 run() 里补上逐名存活判定 —— 表 100% 活,这条判据才立得住。
// 🔴 顺带钉住一条不变量:一个属性名不许**同时**是文案属性与非文案属性。
//    (`name` 这个名字在 .vue 面是过渡动画名 / 图标名,在 json 面是应用名 = 文案 ——
//     两个判定面各判各的,不是矛盾;这条断言防的是**同一个面**里两张表打架。)
const VISIBLE_ATTRS_SET = new Set(["placeholder", "title", "label", "alt", "aria-label", "confirm-text", "cancel-text", "content", "v-text"]);
const ATTR_TABLE_CONFLICT = [...VISIBLE_ATTRS_SET].filter((n) => NON_COPY_NAMES.has(n));

/** 属性名 → 判定方式。返回 { skip } 或 { kind: "text" | "expr", exemptId? }。 */
export function attrMode(rawName) {
  const lower = rawName.toLowerCase();
  // 绑定写法剥前缀后按**同一张表**判 —— `:class` 与 `class` 必须同宽严,否则加个冒号就逃逸。
  const bare = lower.replace(/^(:|v-bind:)/, "");
  // 🔴 前缀要在**剥掉绑定前缀之后**也判一次:`:data-online` 的原名以 `:` 开头,只判原名的话
  //    `data-` 这条整族豁免对所有绑定写法失效(全量实测冒出 9 处 `:data-*` 误报)。
  for (const [p, id] of NON_COPY_PREFIX) if (lower.startsWith(p) || bare.startsWith(p)) return { skip: true, exemptId: id, matchedName: `prefix:${p}` };
  const id = NON_COPY_NAMES.get(bare);
  if (id) return { skip: true, exemptId: id, matchedName: bare };
  const bound = lower !== bare || lower === "v-text";
  return { skip: false, kind: bound ? "expr" : "text" };
}

// ── 显式豁免标记 ─────────────────────────────────────────────────────────────
// 默认收紧、例外留痕(照抄 spec-sentinel-render-gate 的 `spec-sentinel-ok`)。
// 🔴 必须写在**注释里**、必须带理由(冒号后非空),且理由要落在**同一条注释体内** ——
//    v1 只要求「冒号后同一行有非空字符」,于是 `<!-- i18n-en-ok: --><text>Dev build</text>`
//    里被判的那个 `<text>` 自己冒充了理由,而这恰恰是门自己推荐的同行写法(审计 F2)。
const EXEMPT_MARK = "i18n-en-ok";

/**
 * 判「line 或 line-1 上有没有一条带理由的豁免标记」。
 *
 * 🔴「在不在注释里」用**剥离器留下的空白痕迹**判,不自己配注释语法:`stripComments` 把注释
 *    整段换成等长空白,所以「`src[i]` 非空白而 `clean[i]` 是空白」等价于「i 落在注释里」。
 *    自己配 `<!-- … -->` 的做法在**多行注释的续行**上会失效(那一行看不到 `<!--` 开头),
 *    而仓里 5 处豁免恰恰都写在多行注释的最后一行 —— 全量实测当场翻红,自配语法这条路不通。
 * 🔴 理由的取值范围**限定在注释内**:从冒号往后只收仍落在注释里的字符,再剥掉 `-->` / `*​/`。
 *    这样 `<!-- i18n-en-ok: --><text>Dev build</text>` 里被判的那个 `<text>` 冒充不了理由
 *    (v1 就是这么被骗的),而多行注释里的正常理由照常认。
 */
function exemptAt(src, clean, lineStarts, line) {
  const from = lineStarts[Math.max(0, line - 2)] ?? 0;
  const to = (lineStarts[line] ?? src.length);
  const inComment = (i) => i < src.length && /\S/.test(src[i]) && !/\S/.test(clean[i] ?? " ");
  let idx = src.indexOf(EXEMPT_MARK, from);
  while (idx >= 0 && idx < to) {
    if (inComment(idx)) {
      let k = idx + EXEMPT_MARK.length;
      while (k < to && /[^\S\r\n]/.test(src[k])) k += 1;
      if (src[k] === ":" || src[k] === "：") {
        // 从冒号往后逐字收,遇到「既不是空白、又已经不在注释里」的字符就停 ——
        // 那意味着注释在此结束,后面的东西不是理由(空白本身在 clean 里也是空白,单独放过)。
        let reason = "";
        for (let j = k + 1; j < to && src[j] !== "\n"; j += 1) {
          const ws = /[^\S\r\n]/.test(src[j]);
          if (!ws && !inComment(j)) break;
          reason += src[j];
        }
        if (reason.replace(/-->|\*\//g, " ").trim().length >= 2) return true;
      }
    }
    idx = src.indexOf(EXEMPT_MARK, idx + 1);
  }
  return false;
}

/** 每行起始下标,供 exemptAt 按行切窗口。 */
const lineOffsets = (src) => {
  const out = [0];
  for (let i = 0; i < src.length; i += 1) if (src[i] === "\n") out.push(i + 1);
  return out;
};

// ── 词提取 ───────────────────────────────────────────────────────────────────
// 🔴 单个拉丁字母**不算词**:`A` / `B` / `L` / `R` / `V3` / `P1` / `Q.` 是图示节点与档位编号,
//    不携带语言(实测 145 条「0 小写词」样本里约 20 条是这种)。判它只会逼人把示意图也塞进词典。
// 🔴 邮箱与 URL 整段剥掉:`compliance@nexgrid.ai` 是**地址**,拆成 compliance / nexgrid / ai
//    三个词去授权是荒谬的 —— 那等于把 `compliance` 这个普通英文词全局放行。
// 🔴 HTML 实体整段剥掉:`&nbsp;` / `&middot;` 会被拆出 `nbsp` / `middot`,那是标记不是文案(审计 F7)。
// 🔴 `\u` 转义先解码、全角英文归一到半角:CJK 门为同一轴专门加了 decodeEscapes + 红测,
//    英文这面同样不能只拦「照直写」的人(审计 F17)。
const EMAIL_OR_URL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b|\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,10});/g;
const decodeEscapes = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
const foldFullwidth = (s) => s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 长的先剥,免得短短语把长短语切断。
const PHRASE_RE = new RegExp(
  TECH_PHRASES.flatMap((g) => g.phrases).sort((a, b) => b.length - a.length).map(escapeRe).join("|"),
  "gi",
);

/** 「这段里有没有拉丁字母」—— 🔴 必须先归一再判:直接 `/[A-Za-z]/` 会把全角英文当成「没字母」
 *  提前 continue 掉,于是全角绕过在**进判据之前**就逃了(红测抓到)。 */
export function hasLatin(text) {
  return /[A-Za-z]/.test(foldFullwidth(decodeEscapes(String(text))));
}

export function words(text) {
  const plain = foldFullwidth(decodeEscapes(String(text)))
    .replace(HTML_ENTITY, " ")
    .replace(EMAIL_OR_URL, " ");
  return (plain.match(/[A-Za-z]{2,}/g) ?? []);
}

/** 命中的授权短语(用于短语存活性判定)。 */
function phraseHits(text) {
  return (foldFullwidth(decodeEscapes(String(text))).match(PHRASE_RE) ?? []).map((s) => s.toLowerCase());
}

/** 剥掉授权短语后剩下的未授权词。 */
function unauthorized(text) {
  const stripped = foldFullwidth(decodeEscapes(String(text))).replace(PHRASE_RE, " ");
  return words(stripped).filter((w) => !AUTHORIZED.has(w.toLowerCase()));
}

// ── 模板分词 ─────────────────────────────────────────────────────────────────
/**
 * 把模板切成「标签」与「文本节点」。
 * 🔴 不用 `>([^<>]*)<`:文本里出现 `>` 时,匹配从后一个 `>` 重新起算,`>` **之前**的英文整段消失
 *    (`<text>Task lock > 3</text>` 一条都不报,审计 F6)。改成带引号状态的逐字扫描,
 *    属性值里的 `>` / `<` 也不会把标签切错。
 */
export function tokenizeTemplate(tpl) {
  const texts = [];
  const tags = [];
  let i = 0;
  const n = tpl.length;
  while (i < n) {
    if (tpl[i] === "<") {
      let j = i + 1;
      let q = null;
      while (j < n) {
        const c = tpl[j];
        if (q) { if (c === q) q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === ">") break;
        j += 1;
      }
      tags.push({ start: i, raw: tpl.slice(i, Math.min(j + 1, n)) });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < n && tpl[j] !== "<") j += 1;
    if (j > i) texts.push({ start: i, text: tpl.slice(i, j) });
    i = j;
  }
  return { texts, tags };
}

/**
 * 抽标签里的属性:名 + 值 + **名与值各自**在原串中的偏移。
 * 单引号 / 双引号 / 无引号三种写法同宽严(审计 F5)。
 * 🔴 `valueAt` 是给「绑定属性里逐条字面量各报自己的行号」用的:只有属性起点的话,
 *    一个跨行的绑定表达式里所有字面量都记在同一行,一条豁免标记就能罩住全部
 *    —— 与插值那边已修掉的 F10/F11 是同一族,自查时发现 A 规则上还留着。
 */
export function tagAttrs(raw, tagStart) {
  const out = [];
  const re = /([@:A-Za-z_#][-\w:.@#[\]]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">'=`]+))/g;
  for (const m of raw.matchAll(re)) {
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    const valueAt = tagStart + m.index + m[0].lastIndexOf(value);
    out.push({ name: m[1], value, at: tagStart + m.index, valueAt });
  }
  return out;
}

/**
 * 花括号配对抽 `{{ }}`。
 * 🔴 未闭合时只放弃**这一处**(continue),不能 break 整个循环:v1 一 break,后文所有插值不再
 *    被识别,表达式里的标识符全被当成文本 = 假阳性风暴(审计 F8)。字符串字面量内的括号不计数。
 */
export function interpolations(text) {
  const out = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] !== "{" || text[i + 1] !== "{") continue;
    let depth = 0;
    let q = null;
    let j = i;
    for (; j < text.length; j += 1) {
      const c = text[j];
      if (q) { if (c === "\\") j += 1; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{") depth += 1;
      else if (c === "}") { depth -= 1; if (depth === 0) break; }
    }
    if (depth !== 0) continue;
    out.push({ expr: text.slice(i + 2, j - 1), start: i, end: j + 1 });
    i = j;
  }
  return out;
}

/** 抽字符串字面量(单 / 双 / 反引号)。反引号只取字面段,`${}` 里是真代码。 */
export function literals(code) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of code.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    const text = m[3] === undefined ? raw : raw.replace(/\$\{[^}]*\}/g, " ");
    out.push({ text, idx: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * 表达式里的字符串字面量,哪些是**比较位**(跟枚举值对字节,永远不渲染)。
 * 不枚举「哪里是展示位」——那条路不收敛(同族踩坑见 spec-sentinel-render-gate Rule C 的注释),
 * 反过来只挖掉比较位。
 */
export function isComparisonOperand(expr, lit) {
  const before = expr.slice(0, lit.idx).replace(/\s+$/, "");
  if (/(===|!==|==|!=)$/.test(before)) return true;                                       // x === 'ready'
  if (/\b(includes|startsWith|endsWith|indexOf|has|get)\s*\($/.test(before)) return true;  // set.has('x')
  const after = expr.slice(lit.end).replace(/^\s*/, "");
  if (/^[)\]]*\s*(===|!==|==|!=)/.test(after)) return true;                                // 'ready' === x
  // 🔴 `…]` 只在**取键**时算比较位。数组字面量的最后一项后面也是 `]`,而数组元素是要渲染的
  //    (`{{ ['USDT','Cooling down'][i] }}` v1 判 0 条,审计 F9)。判据:往前找到配对的 `[`,
  //    它前面紧跟标识符 / `)` / `]` 才是索引访问;紧跟运算符或行首就是数组字面量。
  if (/^\]/.test(after)) {
    let depth = 0;
    let k = lit.idx;
    for (; k >= 0; k -= 1) {
      if (expr[k] === "]") depth += 1;
      else if (expr[k] === "[") { if (depth === 0) break; depth -= 1; }
    }
    const lead = k > 0 ? expr.slice(0, k).replace(/\s+$/, "") : "";
    if (/[\w$)\]]$/.test(lead)) return true;
  }
  return false;
}

/** 行号:按字符下标回推。报出来的位置必须能直接点开。 */
const lineAt = (src, idx) => src.slice(0, idx).split(/\r?\n/).length;

// ── 扫一个 .vue ──────────────────────────────────────────────────────────────
export function scanVue(file, src) {
  const hits = [];
  const tokenHits = [];
  const lineStarts = lineOffsets(src);
  const clean = stripComments(src, true);
  const tpl = templateRegion(clean);
  const attrExemptHits = [];

  const record = (rule, idx, text, detail) => {
    const line = lineAt(tpl, idx);
    for (const w of words(text)) if (AUTHORIZED.has(w.toLowerCase())) tokenHits.push(w.toLowerCase());
    for (const p of phraseHits(text)) tokenHits.push(`phrase:${p}`);
    const bad = unauthorized(text);
    if (!bad.length || exemptAt(src, clean, lineStarts, line)) return;
    const shown = String(detail ?? text).replace(/‹›+/g, "{{…}}").replace(/\s+/g, " ").trim();
    hits.push({ file, line, rule, words: [...new Set(bad)], text: shown.slice(0, 120) });
  };

  const { texts, tags } = tokenizeTemplate(tpl);

  // ── T / I:文本节点里的字面文本 与 插值里的展示位字面量
  for (const node of texts) {
    if (!/\S/.test(node.text)) continue;
    const interps = interpolations(node.text);
    // I:插值里的展示位字面量。行号用**字面量自己的**位置,不用插值起点 ——
    //   否则一条豁免标记能罩住一个跨 20 行插值里的每一条字面量,而贴在字面量旁的标记反而无效(审计 F10/F11)。
    for (const it of interps) {
      for (const lit of literals(it.expr)) {
        if (!hasLatin(lit.text)) continue;
        if (isComparisonOperand(it.expr, lit)) continue;
        record("I", node.start + it.start + 2 + lit.idx, lit.text, lit.text);
      }
    }
    // T:挖掉插值后剩下的字面文本。**逐行**判,行号才对得上,豁免也才是行级的。
    let holed = node.text;
    for (const it of interps) holed = holed.slice(0, it.start) + "‹".padEnd(it.end - it.start, "›") + holed.slice(it.end);
    let cursor = node.start;
    for (const [k, lineText] of holed.split("\n").entries()) {
      const bare = lineText.replace(/[‹›]+/g, " ");
      if (hasLatin(bare)) record("T", cursor, bare, lineText);
      cursor += lineText.length + 1;
      void k;
    }
  }

  // ── A:属性。默认判,靠 NON_COPY_ATTRS 挖掉。
  for (const tag of tags) {
    for (const attr of tagAttrs(tag.raw, tag.start)) {
      const mode = attrMode(attr.name);
      // 记到「组」也记到「名」:逐名存活才拦得住投机性豁免(逐组只要组里一个名字活着就永不判死)
      if (mode.skip) { attrExemptHits.push(mode.exemptId); if (mode.matchedName) attrExemptHits.push(`name:${mode.matchedName}`); continue; }
      if (!hasLatin(attr.value)) continue;
      if (mode.kind === "text") {
        // 行号取**值**的位置,不取属性名的位置 —— 属性名与值跨行时(`title=\n  "…"`),
        // 用名字的位置会让上一行的豁免标记罩住它。与下面绑定分支、以及插值那边归一。
        record("A", attr.valueAt, attr.value, `${attr.name}="${attr.value}"`);
      } else {
        for (const lit of literals(attr.value)) {
          if (!hasLatin(lit.text)) continue;
          if (isComparisonOperand(attr.value, lit)) continue;
          // 行号取**字面量自己的**位置(不是属性起点)——理由见 tagAttrs 的 valueAt 注释。
          record("A", attr.valueAt + lit.idx, lit.text, `${attr.name}=… ${JSON.stringify(lit.text)}`);
        }
      }
    }
  }

  // ── S:<style> 里会渲染成文字的 `content: "…"`(CJK 门判这一面,英文这面不能不判,审计 F18)
  for (const [a, b] of styleRegions(clean)) {
    const region = clean.slice(a, b);
    for (const m of region.matchAll(/content\s*:\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const text = m[1] ?? m[2] ?? "";
      if (!hasLatin(text)) continue;
      const line = lineAt(clean, a + m.index);
      for (const w of words(text)) if (AUTHORIZED.has(w.toLowerCase())) tokenHits.push(w.toLowerCase());
      const bad = unauthorized(text);
      if (bad.length && !exemptAt(src, clean, lineStarts, line)) hits.push({ file, line, rule: "S", words: [...new Set(bad)], text: `content:${JSON.stringify(text)}` });
    }
  }

  return { hits, tokenHits, attrExemptHits };
}

// ── 扫 json 面 ───────────────────────────────────────────────────────────────
const PAGES_JSON = "src/pages.json";
const MANIFEST_JSON = "src/manifest.json";
// pages.json / manifest.json 上会渲染给用户的字段。原生导航栏标题、tabBar 文字、
// 分包条件名、以及 manifest 的应用名与描述(应用商店与系统里显示)。
const JSON_TEXT_FIELDS = ["navigationBarTitleText", "text", "name", "description"];

export function scanJsonFace(file, src) {
  const hits = [];
  const tokenHits = [];
  const clean = stripComments(src, false);
  let faceCount = 0;
  for (const field of JSON_TEXT_FIELDS) {
    for (const m of clean.matchAll(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, "g"))) {
      const text = m[1];
      if (!text.trim() || !hasLatin(text)) continue;
      faceCount += 1;
      for (const w of words(text)) if (AUTHORIZED.has(w.toLowerCase())) tokenHits.push(w.toLowerCase());
      for (const p of phraseHits(text)) tokenHits.push(`phrase:${p}`);
      const bad = unauthorized(text);
      if (bad.length) hits.push({ file, line: lineAt(clean, m.index), rule: "P", words: [...new Set(bad)], text: `${field}="${text}"` });
    }
  }
  return { hits, tokenHits, faceCount };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith(".vue")) out.push(p);
  }
  return out;
}

function run() {
  const files = walk("src");
  const violations = [];
  const tokenCount = new Map();
  const attrExemptCount = new Map();
  const bump = (map, list) => { for (const w of list) map.set(w, (map.get(w) ?? 0) + 1); };
  let filesWithWords = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const { hits, tokenHits, attrExemptHits } = scanVue(file, src);
    if (tokenHits.length || hits.length) filesWithWords += 1;
    bump(tokenCount, tokenHits);
    bump(attrExemptCount, attrExemptHits);
    violations.push(...hits);
  }

  let jsonFace = 0;
  for (const jf of [PAGES_JSON, MANIFEST_JSON]) {
    if (!fs.existsSync(jf)) { console.error(`i18n-en FAIL:${jf} 不在 —— 该面无人判定,不是「没有违规」`); return 1; }
    const res = scanJsonFace(jf, fs.readFileSync(jf, "utf8"));
    bump(tokenCount, res.tokenHits);
    jsonFace += res.faceCount;
    violations.push(...res.hits);
  }

  // ── 假绿防线:「0 违规」既可能是真干净,也可能是门根本没跑起来,两者在输出里长得一模一样。
  if (!files.length) { console.error("i18n-en FAIL:src 下没扫到任何 .vue —— 判据失效,不是「没有违规」"); return 1; }
  if (!filesWithWords) { console.error("i18n-en FAIL:全仓渲染位上一个英文词都没提取到 —— 提取器坏了(判据失效)"); return 1; }
  if (!jsonFace) { console.error(`i18n-en FAIL:${PAGES_JSON} / ${MANIFEST_JSON} 里 ${JSON_TEXT_FIELDS.join(" / ")} 一处都没解析到 —— json 面判据恒真(空集天然假绿)`); return 1; }
  if (DUP_TOKENS.length) {
    console.error(`i18n-en FAIL:TECH_TOKENS 里有大小写重复条目(${DUP_TOKENS.join(" · ")})—— 表是大小写不敏感的,重复条目既不可能独立死也不可能独立报,「逐 token 判存活」被它悄悄削弱`);
    return 1;
  }
  if (DUP_ATTR_NAMES.length) {
    console.error(`i18n-en FAIL:NON_COPY_ATTRS 里有跨组重复的属性名(${DUP_ATTR_NAMES.join(" · ")})—— 同上,重复条目会让逐名存活判定失效`);
    return 1;
  }
  if (ATTR_TABLE_CONFLICT.length) {
    console.error(`i18n-en FAIL:${ATTR_TABLE_CONFLICT.join(" · ")} 同时被列为「用户可见文案属性」与「非文案属性」—— 两张表打架时后者赢,等于把文案属性静默免检`);
    return 1;
  }

  // ── 死授权 = 静默后门。逐 token / 逐短语 / 逐属性豁免组判存活。
  const dead = [];
  for (const g of TECH_TOKENS) for (const tk of g.tokens) if (!tokenCount.get(tk.toLowerCase())) dead.push(`${tk}(${g.id})`);
  for (const g of TECH_PHRASES) for (const p of g.phrases) if (!tokenCount.get(`phrase:${p.toLowerCase()}`)) dead.push(`"${p}"(${g.id})`);
  for (const g of NON_COPY_ATTRS) {
    if (!attrExemptCount.get(g.id)) dead.push(`属性豁免组 ${g.id}`);
    // 🔴 逐**名**判存活,不只逐组 —— 判定面反转后真正决定宽严的是这张表,而逐组判定下
    //    「组里一个名字活着」就能让同组其余投机性条目永不判死(独立验收实测 47/161 是死的)。
    //    `langLevel` 组豁免于此:它们是语言事实不是本仓观察,理由见 NON_COPY_ATTRS 的头注。
    if (g.langLevel) continue;
    for (const n of g.names ?? []) if (!attrExemptCount.get(`name:${n.toLowerCase()}`)) dead.push(`属性豁免 ${n}(${g.id})`);
    for (const p of g.prefix ?? []) if (!attrExemptCount.get(`name:prefix:${p.toLowerCase()}`)) dead.push(`属性豁免前缀 ${p}(${g.id})`);
  }
  if (dead.length) {
    console.error(
      `i18n-en FAIL:${dead.length} 条授权 / 豁免在判定面上 0 命中 —— 死授权是给未来英文文案开的静默后门,请删除:\n  ` + dead.join(" · "),
    );
    return 1;
  }

  if (violations.length) {
    const byWord = new Map();
    for (const v of violations) for (const w of v.words) byWord.set(w, (byWord.get(w) ?? 0) + 1);
    console.error(
      `i18n-en FAIL:${violations.length} 处硬编码英文用户文案(扫 ${files.length} 个 .vue 的渲染位 + ${PAGES_JSON} + ${MANIFEST_JSON})。\n` +
      "撞到本门有**三条**出路,按「这个词是给谁看的」选:\n" +
      "  ① 真·用户文案 → src/i18n/messages/{en,zh,vi}.ts 三语同序,页面用 useT() / fmt() 读;\n" +
      "  ② 技术标识 / 品牌 / 单位(全球单一写法,翻译反而错)→ 加进 TECH_TOKENS 对应类别,写明理由;\n" +
      "     🔴 授权的是**词**不是行 —— 别为了放行一整句去授权 `the` / `open` 这种普通词;\n" +
      "     注册名里含普通名词(Type / Level / Node)的,加进 TECH_PHRASES 整串授权,不要拆词;\n" +
      "  ③ 属性名不渲染文字(几何 / 枚举 / 锚点)→ 加进 NON_COPY_ATTRS 对应组,写明理由;\n" +
      `  ④ 工程话(Dev build / SANDBOX / mock 徽标)与「实物就长这样」的丝印 → 本行或上一行的**注释里**写 \`${EXEMPT_MARK}: 理由\`。\n` +
      "     裸标记不算(理由必须与标记在同一条注释体内,且 ≥2 个字符)。\n" +
      `涉及的未授权词(按处数):${[...byWord.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}×${n}`).join(" · ")}\n` +
      "违规明细:\n" +
      violations.map((v) => `  [${v.rule}] ${v.file}:${v.line}  «${v.words.join(", ")}»  ${v.text}`).join("\n"),
    );
    return 1;
  }

  const note = TECH_TOKENS.map((g) => `${g.id}×${g.tokens.reduce((n, tk) => n + (tokenCount.get(tk.toLowerCase()) ?? 0), 0)}`).join(" · ");
  console.log(
    `i18n-en PASS:${files.length} 个 .vue 的渲染位(文本节点 / 属性默认判 / 插值展示位 / style content)+ ${PAGES_JSON} + ${MANIFEST_JSON} ` +
    `零未授权英文词 · 授权词 ${note} · 授权短语 ${TECH_PHRASES.flatMap((g) => g.phrases).length} 条 · 属性豁免组 ${NON_COPY_ATTRS.length} 组全部存活`,
  );
  return 0;
}

// ── 红测 ────────────────────────────────────────────────────────────────────
// 纪律:每条判据**单独隔离**验证,阳性样本只违反一条。合并成一个大样本时,任何一条判据失效
// 都会被其它条掩盖,门看起来照样绿(仓内踩过)。变异轴(按 memory 的滚动清单逐轴打):
// 删除 / 取反 / 同义别名 / 改名 / 间接引用 / 挪位 / 装饰性保留 / 扫描面塌空 / 子串包含 / 缺失。
function selftest() {
  const P = "src/pages/x/a.vue";
  const cases = [
    // ── T:文本节点 ─────────────────────────────────────────────────────────
    ["🔴 实证原案:钱包卡槽位行(插值 + 英文文案)", P, "<template><text>{{ n }} live · {{ m }} slots open</text></template>", 1],
    ["🔴 整句英文文案", P, "<template><text>No completed task earnings yet.</text></template>", 1],
    ["🔴 只有 1 个小写词也拦(「≥2 小写词」判据会漏,实测占真违规大头)", P, "<template><text>Task lock</text></template>", 1],
    ["🔴 全大写文案照拦(YOU / DIRECT / EXTENDED 实测都是真文案)", P, "<template><text>EXTENDED</text></template>", 1],
    ["🔴 首字母大写单词照拦(Unavailable / Cooling 实测)", P, "<template><text>Unavailable</text></template>", 1],
    ["🔴 内联 SVG 的 <text> 同样是渲染位", P, '<template><svg><text x="1" y="2">CLOUD SHARE</text></svg></template>', 1],
    ["🔴 时间单位缩写不算技术词(中/越要显示「分钟」)", P, "<template><text>{{ n }} min</text></template>", 1],
    ["🔴 文本里含 > 时,> 之前的英文照抓(旧判据整段吞掉)", P, "<template><text>Task lock > 3</text></template>", 1],
    ["🔴 跨行文本节点逐行判(两行各一条)", P, "<template><text>\nTask lock\nCooling down\n</text></template>", 2],
    ["合法:纯插值不含字面文案", P, "<template><text>{{ t.wallet.slots }}</text></template>", 0],
    ["合法:授权 ticker", P, "<template><text>{{ n }} USDT</text></template>", 0],
    ["合法:授权单位缩写", P, "<template><text>{{ n }}GB VRAM</text></template>", 0],
    ["合法:授权短语整串(PCI DSS Level 1 · 3DS 2.2)", P, "<template><text>PCI DSS Level 1 · 3DS 2.2</text></template>", 0],
    ["🔴 短语拆开的普通名词不放行(Type / Level / Node 单独出现照判)", P, "<template><text>Node Type</text><text>Level II</text></template>", 2],
    ["合法:单字母图示标签不算词(A/B/L/R)", P, "<template><text>L 3</text><text>R 4</text></template>", 0],
    ["合法:档位编号不算词", P, "<template><text>V3</text><text>P1</text></template>", 0],
    ["合法:纯符号与单位记号", P, "<template><text>+$12/d · 24h · ×2</text></template>", 0],
    ["合法:邮箱整段剥掉(不拆成 compliance/nexgrid/ai 三个词去授权)", P, "<template><text>compliance@nexgrid.ai</text></template>", 0],
    ["合法:URL 整段剥掉", P, "<template><text>https://nexgrid.ai/terms</text></template>", 0],
    ["合法:HTML 实体不当英文词(&nbsp; / &middot;)", P, "<template><text>{{ n }}&nbsp;USDT&middot;{{ m }}</text></template>", 0],
    ["🔴 未授权词与授权词同行:授权的是词不是行", P, "<template><text>Earns +{{ n }} USDT/d</text></template>", 1],
    ["🔴 \\u 转义绕过被解码后照抓", P, '<template><text>{{ "\\u0043\\u006f\\u006f\\u006c\\u0069\\u006e\\u0067" }}</text></template>', 1],
    ["🔴 全角英文归一后照抓", P, "<template><text>Ｃｏｏｌｉｎｇ</text></template>", 1],
    // ── 注释面(共享剥离器的回归靶)────────────────────────────────────────
    ["HTML 注释里的英文放行", P, "<template><!-- No task activity available. --><view /></template>", 0],
    ["script 行注释里的英文放行", P, "<template><view /></template>\n<script>// No task activity available\nconst a = 1;</script>", 0],
    ["script 块注释里的英文放行", P, "<template><view /></template>\n<script>/* task lock\nremaining */</script>", 0],
    ["style 注释里的英文放行", P, "<template><view /></template>\n<style>/* task lock pill */\n.a{color:red}</style>", 0],
    ["🔴 script 区的字符串字面量**不在**判定面(15579 条候选,判不了)", P, '<template><view /></template>\n<script>const msg = "No task activity available";</script>', 0],
    ["🔴 模板里的 // 不是注释(其后英文照抓)", P, "<template><text>a // Task lock</text></template>", 1],
    // 🔴 这一格必须用 `<script>`,不能用 `<style>`:只有 script 区域会把 `//` 当行注释,
    //    所以只有 script 那一面对「开标签锚行首」这条修法有牙。原先写的是 `<style>` —— 撤掉
    //    共享剥离器里全部 5 处行首锚,84 + 30 格红测**照样全绿**(独立验收变异实测),那是装饰性靶。
    ["🔴 注释里提到 <script> 不该让区域判定跑偏(其后模板的 // 仍非注释)", P, "<template><!-- 见 <script> 说明 --><text>a // Task lock</text></template>", 1],
    ["🔴 注释里提到 <style> 同样不该让区域判定跑偏", P, '<template><!-- 见 <style> 说明 --><text>Task lock</text></template>', 1],
    // ── A:属性(默认判,靠 NON_COPY_ATTRS 挖掉)────────────────────────────
    ["🔴 静态 placeholder 是用户可见文案", P, '<template><input placeholder="Enter amount" /></template>', 1],
    ["🔴 静态 title / label 同样判", P, '<template><EmptyState title="No orders yet" /></template>', 1],
    ["🔴 静态 aria-label 也是给人读的(读屏)", P, '<template><view aria-label="Close dialog" /></template>', 1],
    ["🔴 单引号属性同宽严(宽严不许取决于引号风格)", P, "<template><input placeholder='Enter amount' /></template>", 1],
    ["🔴 无引号属性值同样判", P, "<template><input placeholder=Cooling /></template>", 1],
    ["🔴 未列入白名单的组件 prop 默认被判(desc / subtitle / hint …)", P, '<template><EmptyState desc="No orders yet" /></template>', 1],
    ["🔴 绑定属性里的字符串字面量照判(实证:bundle.vue 的 :aria-label)", P, "<template><view :aria-label=\"`Remove ${p.name}`\" /></template>", 1],
    ["🔴 v-bind 长写法同样判", P, "<template><EmptyState v-bind:title=\"'No orders yet'\" /></template>", 1],
    ["🔴 绑定属性里三元两支都是文案 → 两条", P, "<template><view :aria-label=\"ok ? 'Close dialog' : 'Open dialog'\" /></template>", 2],
    ["🔴 v-text 是展示位", P, "<template><text v-text=\"'No orders yet'\" /></template>", 1],
    ["合法:绑定属性读词典(不含字面量)", P, '<template><EmptyState :title="t.empty.listTitle" /></template>', 0],
    ["合法:data-* 前缀整族放行", P, '<template><view data-title="task lock until" /></template>', 0],
    ["合法:几何 / 样式属性不判(font-family / text-anchor / stroke-linecap)", P, '<template><svg><text text-anchor="middle" stroke-linecap="round" font-family="ui-monospace, monospace">V3</text></svg></template>', 0],
    ["合法:class / style 里的设计系统词汇不判", P, '<template><view class="flex items-center truncate" style="color: red" /></template>', 0],
    ["合法:事件处理器里的事件名不判(emit(\"close\") 极常见)", P, "<template><view @click=\"emit('close')\" /></template>", 0],
    ["合法:v-if 条件里的枚举不判", P, "<template><view v-if=\"status === 'ready'\" /></template>", 0],
    ["合法:授权的格式掩码", P, '<template><input placeholder="MM/YY" /></template>', 0],
    ["合法:ARIA 状态属性取值是规范枚举", P, '<template><view aria-live="polite" aria-hidden="true" role="status" /></template>', 0],
    ["🔴 :class 与 class 同宽严(加个冒号不逃逸 → 都不判)", P, "<template><view :class=\"ok ? 'nx-on' : 'nx-off'\" /></template>", 0],
    // ── I:插值里的展示位字面量 ────────────────────────────────────────────
    ["🔴 三元分支里的英文文案", P, '<template><text>{{ legacy ? "Wallet Verification (legacy)" : "Proof of Compute" }}</text></template>', 2],
    ["🔴 单引号写法同样判(宽严不许取决于引号风格)", P, "<template><text>{{ x ? 'Unlimited extended' : 'Extended royalty' }}</text></template>", 2],
    ["🔴 模板串的字面段也是展示位", P, "<template><text>{{ `uptime ${up}` }}</text></template>", 1],
    ["🔴 数组字面量的**最后一项**不是取键,照判", P, "<template><text>{{ ['USDT', 'Cooling down'][i] }}</text></template>", 1],
    ["合法:比较位的枚举值不渲染(=== 右边)", P, '<template><text>{{ kind === "volume" ? a : b }}</text></template>', 0],
    ["合法:比较位在左边同样放行(挪位不逃逸)", P, '<template><text>{{ "volume" === kind ? a : b }}</text></template>', 0],
    ["合法:includes / has 的查找参数是枚举不是文案", P, "<template><text>{{ set.has('processing') ? a : b }}</text></template>", 0],
    ["合法:取键写法(dict[`${k}_label`])是键名不是文案", P, "<template><text>{{ w[`${p.key}_label`] }}</text></template>", 0],
    ["合法:插值里的授权 ticker", P, "<template><text>{{ `+${n} NEX` }}</text></template>", 0],
    ["合法:插值里只有单位记号", P, "<template><text>{{ `$${p}` }}</text></template>", 0],
    ["合法:插值里的授权单位", P, "<template><text>{{ `${ms}ms` }}</text></template>", 0],
    ["🔴 表达式含对象字面量时不许漏成「文本节点」(非贪婪匹配曾在此假阳)", P, "<template><text>{{ fmt(t.earn.hashTier, { n: cap }) }}</text></template>", 0],
    ["🔴 一行两个插值各自判", P, "<template><text>{{ a ? 'Cooling' : b }} · {{ c ? 'Matured' : d }}</text></template>", 2],
    ["🔴 字面量里含 } 不该让后文插值全失效(旧判据 break 后假阳性风暴)", P, "<template><text>{{ a ? '{' : 'Cooling' }} {{ t.wallet.slots }}</text></template>", 1],
    // ── S:style content ──────────────────────────────────────────────────
    ["🔴 style 的 content 会渲染成文字", P, '<template><view /></template>\n<style>.a::after{content:"Task lock"}</style>', 1],
    ["合法:空 content 与符号 content", P, '<template><view /></template>\n<style>.a::after{content:""}\n.b::after{content:"·"}</style>', 0],
    // ── 豁免标记 ──────────────────────────────────────────────────────────
    ["豁免:本行注释 + 理由", P, '<template><text>Dev build · mock data</text><!-- i18n-en-ok: 工程话徽标 --></template>', 0],
    ["豁免:紧邻上一行注释(模板里同行塞注释难看)", P, "<template>\n<!-- i18n-en-ok: 工程话徽标 -->\n<text>Dev build · mock data</text>\n</template>", 0],
    ["🔴 裸标记不算豁免(必须带冒号 + 理由)", P, "<template>\n<!-- i18n-en-ok -->\n<text>Dev build · mock data</text>\n</template>", 1],
    ["🔴 冒号后为空同样不算", P, "<template>\n<!-- i18n-en-ok: -->\n<text>Dev build · mock data</text>\n</template>", 1],
    ["🔴 理由不许由**注释外**的后文冒充(同行写法下旧判据恒放行)", P, "<template><!-- i18n-en-ok: --><text>Dev build · mock data</text></template>", 1],
    ["🔴 标记必须在注释里(写进渲染文本不算)", P, "<template><text>Dev build i18n-en-ok: 借道</text></template>", 1],
    ["🔴 标记写在别的属性字符串里不算", P, '<template><view data-x="i18n-en-ok: 借道" /><text>Dev build · mock data</text></template>', 1],
    ["🔴 标记在更早的行不生效(防一条标记罩一整段)", P, "<template>\n<!-- i18n-en-ok: 工程话 -->\n<view />\n<text>Dev build · mock data</text>\n</template>", 1],
    ["🔴 改名:标记写错(i18n-en-okay)不生效", P, "<template>\n<!-- i18n-en-okay: 工程话 -->\n<text>Dev build · mock data</text>\n</template>", 1],
    ["🔴 一条标记不许罩住跨行文本节点的其它行", P, "<template>\n<!-- i18n-en-ok: 工程话 -->\n<text>Dev build\nCooling down\n</text>\n</template>", 1],
    // 🔴 v1 用插值**起点**算行号,于是一条标记能罩住一个跨 20 行插值里的每一条字面量。
    //    这格钉住:标记只豁免与它相邻那行上的字面量,同一个插值里下面几行照判。
    ["🔴 跨行插值:标记只豁免与它相邻那行的字面量", P, "<template>\n<!-- i18n-en-ok: 工程话 -->\n<text>{{ a ? 'Dev build'\n: 'Cooling down' }}</text>\n</template>", 1],
    // 同族第二处:绑定**属性**里的跨行表达式。自查发现 A 规则原来用属性起点算行号,
    // 一条标记能罩住整段;判据与插值那边归一后,下面几行照判。
    ["🔴 跨行绑定属性:标记只豁免与它相邻那行的字面量", P, "<template>\n<!-- i18n-en-ok: 工程话 -->\n<view :aria-label=\"a ? 'Dev build'\n: 'Cooling down'\" />\n</template>", 1],
    // 同族第三处(done-review 维度④ 扫出来的):**静态**属性的名与值跨行时,
    // 行号原来取属性名的位置,于是上一行的标记会罩住实际落在下一行的值。
    ["🔴 静态属性名与值跨行:行号按值算,上一行的标记不该罩住它", P, "<template>\n<!-- i18n-en-ok: 工程话 -->\n<view title=\n\"Cooling down\" />\n</template>", 1],
  ];

  let failed = 0;
  for (const [name, file, src, want] of cases) {
    const got = scanVue(file, src).hits.length;
    if (got !== want) { failed += 1; console.error(`  ✗ ${name} —— 期望 ${want} 条违规,实得 ${got}`); }
  }

  // ── json 面单独隔离验证 ────────────────────────────────────────────────
  // 🔴 这条判据在**当前仓**的期望集很小(pages.json 只有 globalStyle 的品牌名)。
  //    「不许出现 X」在期望集本就近空时天然假绿(memory:gate-assertion-inversion-loses-teeth),
  //    所以阳性样本必须由红测自带,而不是靠仓里恰好有一条。
  const jsonCases = [
    ["🔴 pages.json 的原生标题是用户可见文案面", '{"pages":[{"path":"x","style":{"navigationBarTitleText":"Tutorials Hub"}}]}', 1],
    ["🔴 tabBar 文字同样是用户可见面", '{"tabBar":{"list":[{"pagePath":"x","text":"Earn now"}]}}', 1],
    ["🔴 manifest 的应用描述同样是用户可见面", '{"description":"Rent idle GPU power"}', 1],
    ["合法:标题是授权品牌名", '{"globalStyle":{"navigationBarTitleText":"NexGrid"}}', 0],
    ["合法:块注释里的英文标题不算", '{/* "navigationBarTitleText": "Tutorials Hub" */"pages":[]}', 0],
    ["合法:空值不计入判定面", '{"description":""}', 0],
  ];
  for (const [name, src, want] of jsonCases) {
    const got = scanJsonFace(PAGES_JSON, src).hits.length;
    if (got !== want) { failed += 1; console.error(`  ✗ ${name} —— 期望 ${want} 条违规,实得 ${got}`); }
  }
  if (scanJsonFace(PAGES_JSON, '{"pages":[]}').faceCount !== 0) {
    failed += 1; console.error("  ✗ 无标题字段时 faceCount 应为 0(run() 据此判红)");
  }
  if (scanJsonFace(PAGES_JSON, '{"globalStyle":{"navigationBarTitleText":"NexGrid"}}').faceCount !== 1) {
    failed += 1; console.error("  ✗ 有标题字段时 faceCount 应计数(否则空集判据恒真)");
  }

  // ── 词提取器自证 ────────────────────────────────────────────────────────
  const w = (s) => words(s).join(",");
  if (w("L 3 · R 4") !== "") { failed += 1; console.error(`  ✗ 单字母不该算词(实得 ${w("L 3 · R 4")})`); }
  if (w("Task lock") !== "Task,lock") { failed += 1; console.error("  ✗ 双词该各算一个"); }
  if (w("compliance@nexgrid.ai") !== "") { failed += 1; console.error("  ✗ 邮箱该整段剥掉"); }
  if (w("&nbsp;&middot;&#160;") !== "") { failed += 1; console.error(`  ✗ HTML 实体该整段剥掉(实得 ${w("&nbsp;&middot;")})`); }
  if (w("re-stake at maturity") !== "re,stake,at,maturity") { failed += 1; console.error("  ✗ 连字符词该拆开各判"); }

  // ── 授权表 / 判决路径自证 ───────────────────────────────────────────────
  // 🔴 v1 的「假绿防线」只护**抽取**路径:tokenHits 绕过 unauthorized()/exemptAt() 独立累计,
  //    所以判据整体取反(unauthorized 恒空 / exemptAt 恒真)时,存活台账照样满格、门照样 PASS(审计 F13)。
  //    下面几条把判决函数本身钉住。
  if (AUTHORIZED.size < 20) { failed += 1; console.error(`  ✗ 授权词表异常小(${AUTHORIZED.size})—— 判据来源可疑`); }
  if (DUP_TOKENS.length) { failed += 1; console.error(`  ✗ TECH_TOKENS 有大小写重复条目:${DUP_TOKENS.join(", ")}`); }
  if (!AUTHORIZED.has("usdt") || !AUTHORIZED.has("nex")) { failed += 1; console.error("  ✗ 核心 ticker 未授权 —— 全仓会被淹在误报里"); }
  if (unauthorized("USDT NEX").length !== 0) { failed += 1; console.error("  ✗ 授权词不该被判违规"); }
  if (unauthorized("slots open").length !== 2) { failed += 1; console.error("  ✗ unauthorized() 恒空 = 判据整体失效"); }
  if (unauthorized("Typing").length !== 1) { failed += 1; console.error("  ✗ 授权词作子串不该逃逸(Type ⊄ Typing)"); }
  if (unauthorized("Nexus").length !== 1) { failed += 1; console.error("  ✗ NEX 作子串不该让 Nexus 逃逸"); }
  if (unauthorized("Level up now").length !== 3) { failed += 1; console.error("  ✗ 短语里的普通名词不该被词级放行(Level up now 应 3 条)"); }
  const exAt = (text, line) => exemptAt(text, stripComments(text, true), lineOffsets(text), line);
  if (exAt("<text>Dev build</text>", 1) !== false) { failed += 1; console.error("  ✗ exemptAt() 恒真 = 所有命中都被豁免"); }
  if (exAt("<!-- i18n-en-ok: 工程话 -->\n<text>Dev build</text>", 2) !== true) { failed += 1; console.error("  ✗ 合法豁免标记应生效"); }
  // 🔴 多行注释的**续行**上的标记必须认(仓内 5 处豁免都是这个形态;自配注释语法的版本在这里全瞎)
  if (exAt("<!-- 这一段是工程话\n     i18n-en-ok: 仅 DEV 构建渲染 -->\n<text>Dev build</text>", 3) !== true) {
    failed += 1; console.error("  ✗ 多行注释续行上的豁免标记应生效");
  }
  // 属性判定自证:反转后「未列入 = 被判」这条方向不能悄悄反过来。
  if (attrMode("desc").skip) { failed += 1; console.error("  ✗ 未列入 NON_COPY_ATTRS 的属性应被判(反转方向丢了)"); }
  if (!attrMode("class").skip || !attrMode(":class").skip) { failed += 1; console.error("  ✗ class / :class 应同为非文案"); }
  if (attrMode(":aria-label").kind !== "expr" || attrMode("aria-label").kind !== "text") {
    failed += 1; console.error("  ✗ 绑定 / 静态 aria-label 的判定方式错");
  }
  if (!attrMode("@click").skip || !attrMode("v-on:click").skip) { failed += 1; console.error("  ✗ 事件处理器应跳过"); }
  if (!attrMode("data-x").skip) { failed += 1; console.error("  ✗ data-* 应整族放行"); }
  // 分词器自证:文本节点抽取必须覆盖属性里带 > / < 的情形。
  const tk = tokenizeTemplate('<view :style="a > b ? x : y">Cooling</view>');
  if (!tk.texts.some((t) => t.text.includes("Cooling"))) { failed += 1; console.error("  ✗ 属性值里的 > 让文本节点抽取跑偏"); }
  if (tagAttrs('<i a="1" b=\'2\' c=3 />', 0).length !== 3) { failed += 1; console.error("  ✗ 三种引号写法都该抽到属性"); }
  if (interpolations("{{ a ? '{' : 'x' }} {{ b }}").length !== 2) { failed += 1; console.error("  ✗ 字面量里的花括号不该打断插值配对"); }

  if (failed) { console.error(`i18n-en selftest FAIL:${failed} 条判据不成立`); return 1; }
  console.log(
    `i18n-en selftest PASS:${cases.length + jsonCases.length} 条判据逐条隔离验证 + 提取器 / 授权表 / 判决函数 / 分词器自证 ` +
    "(阳性必中 / 注释与几何属性与比较位必放行 / 豁免改名与挪位与借道不逃逸 / 子串与短语拆词不逃逸)",
  );
  return 0;
}

process.exit(process.argv.includes("--selftest") ? selftest() : run());

// ── KNOWN GAPS(明写,不留给下一个人重新发现)────────────────────────────────
// 1. `<script>` 里的字符串字面量(toast / Error / 拼接文案)不在判定面 —— 实测 15579 条候选、
//    ≥2 小写词的 6317 条,英文是代码本身的语言,判据无从区分「文案」与「路由 / 键名 / class」。
//    那条轴要守只能靠**出口收口**(所有 toast / throw 走同一个必须收 i18n key 的入口),
//    不是靠字面量扫描。模板里的**事件处理器**(`@click="toast('…')"`)属同一面,同样不判。
// 2. `.ts` 里构造的展示串(`src/lib/*.ts` 的 formatter)同上。
// 3. 三语**译文质量**不在判定面:把英文原样塞进 vi / zh 词典就能让本门变绿,而界面照旧是英文。
//    实测存量:vi 值与 en 逐字相同且含英文词 123 条、zh 值不含汉字但含英文词 87 条。
//    这条要守得靠一道**词典层**判据(vi/zh 值 == en 值且含英文词即拦,按词条 key 授权 ticker/品牌),
//    与本门的 TECH_TOKENS 是同一套纪律,但判定面在词典而不在页面 —— 独立一道门,尚未落地。
