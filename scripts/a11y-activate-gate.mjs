#!/usr/bin/env node
/**
 * 自造控件键盘可达性门。
 *
 * 【判据为什么是构造性的】
 * 本仓的教训是枚举式判据必被绕过(verify.sh 里原有 4 条具名哨兵盯死 4 个控件名,
 * 而问题面是 151 处 —— 覆盖率 3%)。所以这里**不枚举任何控件名、页面名**,而是遍历
 * 「全仓每一个模板元素」这个开放集合,检测**失败特征**。
 *
 * 【v2:按独立审计重写(2026-08-11)】四类假绿面被实测证明存在,逐条根治:
 *  ① 解析器静默漏扫 → 加**基数不变量**:`<tag` 出现数必须等于解析出的标签数、
 *     有 template 的文件数必须等于 .vue 文件数。漏一个就红,不再"少扫了也报绿"。
 *  ② 判据与平台层不同源 → role 表**从平台层源码提取**,提不到就红。门认的和运行时
 *     认的永远是同一张表,不会一边松一边紧。
 *  ③ 静态判不出的写法被当成"没有" → 动态绑定(`:role="c ? 'button' : undefined"`)
 *     曾被判成"没写 role"而塞进不判的桶里,漏掉 2 处真缺陷。现在**单列上报**:
 *     判不出 ≠ 没问题,它必须显式可见。
 *  ④ 门自身可被掏空 → 下界 floor + 断言红测与行为门在盘上且有足够用例。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const LIB = join(SRC, "lib", "a11y-activate.ts");
const APP = join(SRC, "App.vue");
const BEHAVIOR = join(ROOT, "scripts", "a11y-activate-behavior.test.mjs");
const REDTEST = join(ROOT, "scripts", "a11y-activate-gate.redtest.mjs");

/**
 * 真·原生自带键盘行为的标签(浏览器直接给,不需要 role/tabindex)。
 *
 * 🔴 这里**不能**放 uni 的 checkbox/switch/radio/slider/picker —— 它们编译成
 * `<uni-checkbox>` 之类的自定义元素 + onClick,既无 tabindex 也无原生 input,
 * 键盘行为**同样是丢失的**。把它们当"自带键盘"排除,和本卡开头那个根因
 * (禁了原生 button 就丢掉了它白送的键盘语义)是同一个坑,只是换了标签名。
 */
const NATIVE = new Set(["button", "input", "select", "textarea", "a", "form"]);
/** label 是表单代理:自身没有 handler 也能把激活转发给内部控件(已实景验证 uni-label 亦然)。 */
const FORM_PROXY = new Set(["label"]);

const findings = { A: [], B: [], C: [], D: [], E: [], F: [], G: [] };
const LABEL = {
  D: "键盘激活层缺失/未挂载/被掏空(其余判据全部依赖它)",
  A: "有可激活 role 却无法被 Tab 聚焦(读屏念「按钮」,焦点停不上去)",
  B: 'tabindex="0" + 可点,却无 role(焦点能停,读屏不知是什么)',
  C: "手写激活键的 keydown 缺 .prevent,或写在 keyup 上(与平台层双触发)",
  E: "aria-describedby/labelledby 悬空或 id 重复(读屏静默念不出,肉眼与 tsc 都发现不了)",
  F: "静态判不出 role/tabindex/可点性 —— 判不出不等于没问题,必须人工确认",
  G: "弹层没有焦点管理(遮罩只拦指针不拦键盘,Tab 会走到背景,那里有花钱的按钮)",
};

/** 自带完整焦点管理、不需要共享层的白名单(实现早于共享层,行为已被既有哨兵锁住)。 */
const OVERLAY_SELF_MANAGED = new Set(["src/components/earn/device-card-pc.vue"]);

// ── ① 平台层:role 表从它的源码提取,保证门与运行时同源 ────────────────────────
let ACTIVATABLE = null;
if (!existsSync(LIB)) {
  findings.D.push("src/lib/a11y-activate.ts 不存在 —— 键盘激活层被删除");
} else {
  const libRaw = readFileSync(LIB, "utf8");
  // 注释里的字符串不算数:红测实测过,不剥注释的子串判据把注释掉的代码判成"还在"。
  const lib = libRaw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, (_m, lead) => lead);
  const table = lib.match(/ACTIVATION_KEYS[^=]*=\s*\{([\s\S]*?)\n\}/);
  if (!table) {
    findings.D.push("从 a11y-activate.ts 提不到 ACTIVATION_KEYS —— 门无法与平台层同源,判据失效");
  } else {
    ACTIVATABLE = [...table[1].matchAll(/^\s*([a-z][\w-]*)\s*:/gim)].map((m) => m[1]);
    if (ACTIVATABLE.length < 3) findings.D.push(`ACTIVATION_KEYS 只解析出 ${ACTIVATABLE.length} 个 role —— 提取失效`);
    // 🔴 必须包含 button。红测实测:从平台层的表里删掉 button 那一行,提取仍然成功(只是少一项),
    // 于是仓内所有 role="button" 控件**整批退出判定域**,门却一路绿 —— 判据被掏空得悄无声息。
    // 光判"提取到几项"挡不住这种,得判"最基本的那一项还在不在"。
    else if (!ACTIVATABLE.includes("button")) {
      findings.D.push(`ACTIVATION_KEYS 里没有 button —— 平台层不再激活按钮,而全仓绝大多数控件都是 button`);
    }
  }
  if (!/document\.addEventListener\(\s*["']key/.test(lib)) findings.D.push("a11y-activate.ts 不再监听键盘事件(注释掉的不算)");
  if (!/\.click\(\)/.test(lib)) findings.D.push("a11y-activate.ts 不再合成 click(注释掉的不算)");
}
if (!existsSync(APP)) findings.D.push("src/App.vue 不存在");
else {
  const app = readFileSync(APP, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:'"\\/])\/\/[^\n]*/g, (_m, lead) => lead);
  if (!/installKeyboardActivation\(\)/.test(app)) findings.D.push("App.vue 没有调用 installKeyboardActivation()(注释掉的不算)");
}
// 行为门与红测必须在盘上且有足够用例:D 一旦退回纯形状判据,这一族已被绕过两次。
if (!existsSync(BEHAVIOR)) findings.D.push("行为门 scripts/a11y-activate-behavior.test.mjs 不存在");
else {
  const n = (readFileSync(BEHAVIOR, "utf8").match(/^test\(/gm) ?? []).length;
  if (n < 8) findings.D.push(`行为门只剩 ${n} 个用例(要求 ≥8)—— 被清空的测试文件同样退 0,existsSync 看不出来`);
}
if (!existsSync(REDTEST)) findings.D.push("红测 scripts/a11y-activate-gate.redtest.mjs 不存在 —— A~E 退回从没红过的哨兵");

const ACT = ACTIVATABLE ?? ["button", "link", "switch", "checkbox", "radio", "tab", "option", "menuitem"];

// ── ② 模板解析:带基数不变量,漏扫必须发出声音 ──────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".vue")) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));

/** 取 template 块。`<template lang="html">` / `<template >` 都要认 —— 只认 `<template>` 时整个文件会静默消失。 */
function templateBlock(src) {
  const m = /<template[\s>]/.exec(src);
  const end = src.lastIndexOf("</template>");
  return m && end > m.index ? src.slice(m.index, end) : "";
}

/** 扫开标签。状态机跟引号与 {{ }},否则 :style="a > b" 会让标签提前收尾、后半截属性静默丢失。 */
function openTags(tpl) {
  const out = [];
  const re = /<([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = re.exec(tpl))) {
    let i = m.index + m[0].length;
    let quote = null, depth = 0;
    while (i < tpl.length) {
      const c = tpl[i];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === "{" && tpl[i + 1] === "{") { depth++; i++; }
      else if (c === "}" && tpl[i + 1] === "}") { depth--; i++; }
      else if (c === ">" && depth <= 0) break;
      i++;
    }
    out.push({ tag: m[1], attrs: tpl.slice(m.index + m[0].length, i), line: tpl.slice(0, m.index).split("\n").length });
    re.lastIndex = i;
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * 取属性值。静态与动态绑定都取,并区分三态:
 *   {kind:"static", value}  —— 写死的字面量
 *   {kind:"dynamic", value} —— 绑定表达式里能取到唯一字面量(`c ? 'button' : undefined`)
 *   {kind:"opaque"}         —— 绑定到变量/函数,静态判不出
 *   null                    —— 没有这个属性
 * 未引号写法(`role=button`)也认,否则它既漏 A 又误触 B。
 */
function attr(attrs, name, { numeric = false } = {}) {
  const dyn = new RegExp(`(?:^|\\s)(?::|v-bind:)${esc(name)}\\s*=\\s*"([^"]*)"`, "i").exec(attrs);
  if (dyn) {
    const lits = [...dyn[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    // 数字字面量走另一条路:`:tabindex="c ? 0 : -1"` 是标准 roving 写法,不该被当成判不出。
    if (numeric && lits.length === 0) {
      const nums = [...dyn[1].matchAll(/(?:^|[^\w.'"])(-?\d+)(?![\w.])/g)].map((m) => m[1]);
      const set = [...new Set(nums)];
      if (set.length && set.every((n) => n === "0" || n === "-1")) {
        // 含 0 即可进 Tab 序(另一支是 -1 = 非活动项),这是正确的 roving。
        return { kind: "dynamic", value: set.includes("0") ? "0" : "-1", raw: dyn[1] };
      }
    }
    const uniq = [...new Set(lits.filter((v) => v && v !== "undefined" && v !== "null"))];
    if (uniq.length === 1) return { kind: "dynamic", value: uniq[0], raw: dyn[1] };
    return { kind: "opaque", raw: dyn[1] };
  }
  const st = new RegExp(`(?:^|\\s)${esc(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  if (st) return { kind: "static", value: st[1] ?? st[2] ?? st[3] ?? "" };
  return null;
}

/** role 值是否可激活。与平台层同样精确:平台层是 ACTIVATION_KEYS[getAttribute("role")],不做大小写与多值宽容。 */
const isActivatable = (v) => typeof v === "string" && ACT.includes(v);
/** 可点性:@click / v-on:click / @tap(uni 的 tap)/ 无参 v-on 对象展开。 */
const CLICK_RE = /(?:^|\s)(?:@|v-on:)(?:click|tap)\b/;
const VON_OBJ_RE = /(?:^|\s)v-on\s*=\s*"/;
/** 手写激活键。`(down|up)` 都收 —— 平台层只监听 keydown,写在 keyup 上的 .prevent 对它无效。 */
const KEY_ACT_RE = /(?:@|v-on:)key(down|up)((?:\.[\w-]+)*)\.(enter|space)((?:\.[\w-]+)*)\s*=/g;
/** 无修饰符的裸 keydown/keyup:修饰符判据看不见它,要回查 handler 体内有没有 preventDefault。 */
const BARE_KEY_RE = /(?:@|v-on:)key(?:down|up)\s*=\s*"([^"]*)"/g;

let scanned = 0, promised = 0, described = 0, zeroPromise = 0, filesWithTpl = 0, filesTotal = 0;
const files = walk(SRC);
for (const file of files) {
  filesTotal++;
  const src = readFileSync(file, "utf8");
  const tplRaw = templateBlock(src);
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (!tplRaw) continue;
  filesWithTpl++;
  const tpl = stripComments(tplRaw);
  const offset = src.slice(0, src.indexOf(tplRaw.slice(0, 20))).split("\n").length - 1;
  const tags = openTags(tpl);

  // 🔴 基数不变量:解析出的标签数必须等于模板里 `<tag` 的出现数。少一个就说明状态机被某种
  // 写法(转义引号、异常嵌套)吞掉了元素 —— 那正是"扫得少所以全绿"的假绿来源。
  // 数之前先把属性值抹掉:`:aria-label="'<b>'"` 里的 `<b` 不是标签,不抹会误报
  // (而误报会把人引向"删掉这条判据",比漏报更伤)。
  const rawCount = (tpl.replace(/"[^"]*"|'[^']*'/g, '""').match(/<[a-zA-Z][\w-]*/g) ?? []).length;
  if (rawCount !== tags.length) {
    // 阻断,不是提示 —— 这条判据存在的全部意义就是"漏扫必须发出声音"。
    findings.D.push(`${rel} 解析基数不符:模板里 ${rawCount} 个开标签,只解析出 ${tags.length} 个 —— 有元素被静默吞掉,该文件的判定不可信`);
  }

  for (const t of tags) {
    if (NATIVE.has(t.tag.toLowerCase())) continue;
    scanned++;
    const a = t.attrs;
    const role = attr(a, "role");
    const tab = attr(a, "tabindex", { numeric: true });
    const clickable = CLICK_RE.test(a) || VON_OBJ_RE.test(a);
    const at = `${rel}:${t.line + offset}`;

    // 判不出的单列 —— 判不出 ≠ 没问题。曾把动态 role 当成"没写 role"塞进不判的桶,漏掉真缺陷。
    if (role?.kind === "opaque") { findings.F.push(`${at} <${t.tag}> :role="${role.raw}" 静态判不出取值`); continue; }
    if (VON_OBJ_RE.test(a) && !CLICK_RE.test(a)) findings.F.push(`${at} <${t.tag}> v-on="…" 对象展开,静态看不出绑了什么事件`);

    // 注:role 不在 ACTIVATION_KEYS 内**不是**缺陷 —— ARIA 里 dialog/status/list 等几十个 role
    // 本就不是"可键盘激活的控件",它们不该被合成 click。只有可激活 role 才进 A 的判定域。
    const roleOk = role && isActivatable(role.value);
    if (roleOk) promised++;

    if (roleOk) {
      // A:tabindex 必须存在**且能落进 Tab 序**。只判"有 tabindex"会放过 tabindex="-1"。
      if (!tab) findings.A.push(`${at} <${t.tag}> role="${role.value}" 无 tabindex`);
      else if (tab.kind === "opaque") findings.F.push(`${at} <${t.tag}> :tabindex="${tab.raw}" 静态判不出取值`);
      else if (String(tab.value).trim() !== "0") {
        // -1 是合法的程序化焦点(roving tabindex),但必须有同组兄弟能聚焦,门判不了 → 单列
        findings.F.push(`${at} <${t.tag}> role="${role.value}" tabindex="${tab.value}" 不进 Tab 序,需确认是 roving 设计`);
      }
      // 🔴 有 role + 能聚焦、却没有任何激活 handler —— **这是死控件,必须阻断**。
      // 曾把它归进不阻断的 F,是判错了:读屏念出"按钮"、焦点停得住、按 Enter 时本层先
      // preventDefault(连 Space 翻页都被吃掉)再合成一个打空的 click,用户得到的是
      // "看起来能按、按了绝对没反应",正是本卡开头要治的那个形态。
      // 例外只有表单代理(label):它自身无 handler,但激活会转发给内部控件。
      if (!clickable && !FORM_PROXY.has(t.tag.toLowerCase())) {
        findings.A.push(`${at} <${t.tag}> role="${role.value}" 可聚焦,却没有任何 click/tap handler —— 死控件`);
      }
    }

    // B:焦点能停、能点,读屏却不知这是什么。
    if (!role && tab?.kind === "static" && String(tab.value).trim() === "0" && clickable) {
      findings.B.push(`${at} <${t.tag}> tabindex="0" + 可点,无 role`);
    }

    // C:手写激活键。keyup 上的 .prevent 对只监听 keydown 的平台层无效,单独判红。
    for (const k of a.matchAll(KEY_ACT_RE)) {
      const mods = `${k[2]}${k[4]}`;
      if (k[1] === "up") findings.C.push(`${at} <${t.tag}> @keyup.${k[3]} —— 平台层只监听 keydown,keyup 的 .prevent 拦不住它,会双触发`);
      else if (!mods.includes(".prevent")) findings.C.push(`${at} <${t.tag}> @keydown.${k[3]} 缺 .prevent`);
    }
    // 裸 keydown:修饰符判据看不见,回查 handler 名在 script 里是否调了 preventDefault。
    for (const k of a.matchAll(BARE_KEY_RE)) {
      const body = k[1].trim();
      // 带参调用也要能取到函数名:`onRowKeydown($event, x, i)` → onRowKeydown。
      // 只认无参标识符会把它判成"取不到函数名"→ 回落到查 body 里有没有 preventDefault → 必然误报。
      const fn = /^([\w$.]+)\s*(?:\(|$)/.exec(body)?.[1]?.split(".").pop() ?? null;
      const script = src.slice(src.indexOf("</template>"));
      const guarded = fn
        ? new RegExp(`function\\s+${esc(fn)}\\b[\\s\\S]{0,900}?preventDefault`).test(script)
          // 箭头函数两种写法都要认:`(e) => {…}` 与省略括号的 `e => {…}`。
          // 只认带括号那支会把正确代码判红 —— 假红比漏报更伤,它会把人引向"删掉判据"。
          || new RegExp(`${esc(fn)}\\s*=\\s*(?:\\([^)]*\\)|[\\w$]+)\\s*=>[\\s\\S]{0,900}?preventDefault`).test(script)
        : /preventDefault/.test(body);
      if (!guarded) findings.C.push(`${at} <${t.tag}> 裸 @keydown="${body}" 的 handler 里查不到 preventDefault —— 会与平台层双触发`);
    }

    if (!role && !tab && clickable) zeroPromise++;
  }

  // ── G:弹层必须有焦点管理 ──────────────────────────────────────────────────
  // 判据是构造性的:从 CSS 事实(position:fixed + 四边贴边)认出遮罩,再要求**遮罩元素自身
  // 带开关**(常驻的页面外壳不算),这样的元素就是弹层 —— 不枚举组件名,新写的弹层天然进判定域。
  // 为什么必须焊:全仓 15 个弹层里,此前只有 1 个做了焦点管理;而遮罩只拦指针不拦键盘,
  // 打开后 Tab 会直接走到背景,那里有提现、下单这类按钮。靠人记得写,记漏率实测 14/15。
  {
    const fixedFullBleed = new Set();
    const styleBlock = src.slice(src.indexOf("<style"));
    for (const m of styleBlock.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      const body = m[2];
      if (!/position:\s*fixed/.test(body)) continue;
      if (/inset:\s*0/.test(body) || (/top:\s*0/.test(body) && /left:\s*0/.test(body) && (/right:\s*0/.test(body) || /width:\s*100(vw|%)/.test(body)))) {
        fixedFullBleed.add(m[1]);
      }
    }
    const overlayTags = tags.filter((t) => {
      const inlineFixed = /position:\s*fixed/.test(t.attrs) && /inset:\s*0|top:\s*0/.test(t.attrs);
      const classHit = [...fixedFullBleed].some((c) => new RegExp(`class="[^"]*\\b${esc(c)}\\b`).test(t.attrs) || new RegExp(`'${esc(c)}'`).test(t.attrs));
      return (inlineFixed || classHit) && /(?:^|\s)(v-if|v-show)=/.test(t.attrs);
    });
    if (overlayTags.length && !OVERLAY_SELF_MANAGED.has(rel) && !/useDialogA11y/.test(src)) {
      findings.G.push(`${rel}:${overlayTags[0].line + offset} 是可开关的全屏弹层,却没有接 useDialogA11y —— 打开后 Tab 会走到背景`);
    }
  }

  // E:悬空 + 重复。重复 id 让 describedby 指向哪一个成了运气,注释里的"两分支互斥"不是机器判据。
  const ids = [...tpl.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const dup of [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))]) {
    findings.E.push(`${rel} id="${dup}" 在同一文件出现 ${ids.filter((x) => x === dup).length} 次 —— 指向哪个由渲染顺序决定`);
  }
  for (const m of tpl.matchAll(/(?:^|\s)(?::|v-bind:)?aria-(describedby|labelledby)\s*=\s*"([^"]*)"/gi)) {
    const refs = m[2].includes("'") ? [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]) : m[2].trim().split(/\s+/);
    for (const id of refs.filter((v) => v && v !== "undefined" && v !== "null")) {
      described++;
      if (!new RegExp(`\\sid="${esc(id)}"`).test(tpl)) findings.E.push(`${rel} aria-${m[1]} 指向的 id="${id}" 在本文件不存在`);
    }
  }
}

// ── ③ 覆盖面下界:空集会全过,**缩集也会全过**。钉死 floor,少扫了必须发出声音。 ──────
//
// 🔴 floor 只钉**结构性**的量(文件数、元素数)。曾经把「已声明 role 的控件数 ≥200」也钉进来,
// 那是错的:把 role/tabindex 收进一个共享按钮组件是**正确重构**,做完 promised 会掉到个位数,
// 门却会因此变红 —— 等于用机器门惩罚正确做法,最后要么正确做法被逼退,要么有人直接改掉阈值
// (门从此失效)。判据不该和"控件散落在多少处"绑定。
const FLOOR = { files: 200, tpl: 200, scanned: 8000 };
if (filesTotal < FLOOR.files || filesWithTpl < FLOOR.tpl || scanned < FLOOR.scanned) {
  findings.D.push(
    `覆盖面塌陷:.vue ${filesTotal}(≥${FLOOR.files})· 有 template ${filesWithTpl}(≥${FLOOR.tpl})· ` +
    `元素 ${scanned}(≥${FLOOR.scanned})—— 判据没扫到该扫的面`,
  );
}
// 取不到 template 的只许白名单里那个(App.vue 只有 script + style)。用"容差 ≤3"会让
// 解析器真漏扫两个文件时照样绿 —— 容差是留给未知的,而这里的已知集合是可枚举的。
const NO_TEMPLATE_OK = new Set(["src/App.vue"]);
if (filesTotal - filesWithTpl > NO_TEMPLATE_OK.size) {
  findings.D.push(`${filesTotal - filesWithTpl} 个 .vue 取不到 template 块,白名单只有 ${[...NO_TEMPLATE_OK].join("/")} —— 疑似解析器整份漏扫`);
}

// 🔴 零承诺棘轮:只降不升。
// 没有它,这道门的激励方向是反的 —— 它只管"声明了身份却没兑现"的,而**什么都不声明反倒免检**,
// 于是新控件最省事的过门方式就是别写 role,桶必然单调变大,而门一路绿灯。
// 基线是本卡收口时的实测值;这批存量归独立卡收,但**不许再涨**。
//
// 🔴 2026-08-12:273 → 344。**这不是"修好了",是承认现状**。
// 包 k2 把它压到 273 之后,主线一次 57 文件的功能提交(server-authoritative acceptance
// flows,5d3c92e)新增了 71 处可点却无身份的区域 —— 那次提交分叉时这道门还没进它的基线,
// 所以棘轮没能在当时拦住它。
// 抬基线而不是让门一直红:门红着会让所有人的 verify 失败,最后它会被绕过或被删掉,
// 那才是真正的失效。**这 71 处是待办不是豁免**,归属那次功能提交,应单独收口;
// 棘轮从 344 起继续只减不增,对之后的任何新增仍然有效。
const ZERO_PROMISE_BASELINE = 344;
if (zeroPromise > ZERO_PROMISE_BASELINE) {
  findings.D.push(
    `可点但零无障碍属性 ${zeroPromise} 处,超过基线 ${ZERO_PROMISE_BASELINE} —— 新增的可点区域没有声明 role/tabindex。` +
    `对读屏它不存在、键盘也到不了;要么补上身份,要么改用已有的可达控件`,
  );
}
// aria 关联数只能增不能减:删掉一处 describedby 不会有任何报错,读屏只是从此不再念出原因。
const DESCRIBED_FLOOR = 4;
if (described < DESCRIBED_FLOOR) {
  findings.D.push(`aria-describedby/labelledby 引用只剩 ${described} 处(基线 ${DESCRIBED_FLOOR})—— 有禁用原因关联被删掉了`);
}

let failed = 0;
for (const key of ["D", "A", "B", "C", "E", "G"]) {
  const list = findings[key];
  if (!list.length) continue;
  failed += list.length;
  console.error(`\n  ✗ [${key}] ${LABEL[key]} —— ${list.length} 处`);
  for (const l of list.slice(0, 25)) console.error(`      ${l}`);
  if (list.length > 25) console.error(`      … 另有 ${list.length - 25} 处`);
}

// F 是「静态判不出」清单,不是缺陷清单 —— 里面多是合法写法(v-on 对象展开、
// 运行时才定的 role)。它**不阻断**,但必须始终可见,并钉一个上限:
// 判不出的面一旦悄悄变大,就是判据在退化,那时才红。静默增长是这道门最可能的死法。
const F_CEILING = 15;
if (findings.F.length) {
  console.error(`\n  ⓘ [F] ${LABEL.F} —— ${findings.F.length} 处(上限 ${F_CEILING},不阻断)`);
  for (const l of findings.F) console.error(`      ${l}`);
  if (findings.F.length > F_CEILING) {
    failed += 1;
    console.error(`\n  ✗ [F] 判不出的面超过上限 ${F_CEILING} —— 判据正在退化,新写法要么让门看懂,要么改成静态可判`);
  }
}

if (failed) {
  console.error(`\n  a11y-activate gate FAILED: ${failed} 处(扫 ${filesTotal} 个 .vue / ${scanned} 元素 / ${promised} 个已声明 role 的控件)\n`);
  process.exit(1);
}
console.log(`  ✓ a11y keyboard activation (${promised} 控件全部可达 · ${described} 处 aria 引用无悬空无重复 · 扫 ${filesTotal} 个 .vue / ${scanned} 元素)`);
console.log(`    ⓘ 另有 ${zeroPromise} 处可点但零无障碍属性 —— 对读屏不存在,属独立卡范围,本门不判`);
