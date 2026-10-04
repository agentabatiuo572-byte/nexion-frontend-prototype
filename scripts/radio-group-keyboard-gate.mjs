#!/usr/bin/env node
/**
 * 互斥单选组键盘契约门。
 *
 * 【为什么需要这道门 —— 一个真实漏过的半截修复】
 * zentao #94 上一轮把 5 处 `role="button" + aria-pressed` 改成了 `role="radio"`,
 * 语义对了,但**键盘契约只做了一半**:每个成员仍是 `tabindex="0"`,组内没有方向键。
 * 浏览器/读屏看到的是一个「所有成员都能 Tab 到、方向键无效」的假单选组 ——
 * 与真实互斥交互不符,验收当场按 ArrowRight 就复现失败。
 *
 * 为什么既有门没拦住:`a11y-activate-gate.mjs` 管的是「能不能被键盘激活」,
 * 而 roving tabindex 与方向键是**组级**契约,它不覆盖。缺的判据就在这里补。
 *
 * 【判据是构造性的,不枚举页面/控件名】
 * 遍历全仓模板,取每一个 `role="radiogroup" | role="tablist"` 元素及其配对闭合标签,
 * 检查其**成员**(role=radio / role=tab):
 *   R1 成员缺 roving tabindex(写成字面量 `tabindex="0"`,或根本没写) → 全组都能 Tab 进入,不是 roving
 *   R2 组内没有任何方向键处理(keydown.left/right/up/down) → 键盘用户无法在组内移动
 * 与 a11y-activate-gate 同样坚持**基数不变量**:解析出的组数不得低于下界,否则报红 ——
 * 「少扫了也报绿」是本仓吃过亏的老坑。
 *
 * 【已知的合理豁免】
 * 只有一个成员的组无需 roving tabindex(没有可移动的目标),但**仍需**方向键?不需要 ——
 * 单成员组方向键无意义,故仅豁免 R1,不豁免 R2 的前提是组成员数 > 1。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** 组数下界:低于它就说明解析器漏扫(而不是仓里真没有组)。2026-09 实测 29 个。 */
const GROUP_FLOOR = 24;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".vue")) out.push(p);
  }
  return out;
}

/** 从标签起始位置取到该标签的 ">"，尊重引号内的 > 。 */
function tagEnd(src, i) {
  let quote = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ">") return j;
  }
  return -1;
}

/** 找配对的 </tag>（只数同名开闭标签，模板内足够且不误跨组件）。 */
function matchClose(src, openEnd, tag = "view") {
  const re = new RegExp(`<${tag}\\b|</${tag}\\s*>`, "g");
  re.lastIndex = openEnd;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    if (m[0].startsWith("</")) { if (--depth === 0) return m.index; }
    else depth++;
  }
  return src.length;
}

const violations = [];
let groups = 0;
const files = walk(SRC);
const sharedSegments = readFileSync(join(SRC, "components", "glass-segments.vue"), "utf8");
// The visual refresh moves these groups into one shared control. Count each
// rendered instance and keep its keyboard contract in the same gate.
const sharedKeyboardReady = /:tabindex="[^\"]*option\.value === modelValue/.test(sharedSegments)
  && /@keydown="onKeydown\(\$event, option\)"/.test(sharedSegments)
  && /"ArrowLeft", "ArrowRight"/.test(sharedSegments)
  && /"ArrowUp", "ArrowDown"/.test(sharedSegments)
  && /event\.preventDefault\(\)/.test(sharedSegments)
  && /choose\(target(?:, "arrow")?\)/.test(sharedSegments)
  && /\.focus\(\)/.test(sharedSegments);

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  for (const control of src.matchAll(/<GlassSegments\b[^>]*>/g)) {
    if (/variant="navigation"/.test(control[0])) continue;
    groups++;
    if (!sharedKeyboardReady) violations.push({ file: rel,
      line: src.slice(0, control.index).split("\n").length, rule: "R3",
      detail: "共享选择器缺少 roving tabindex、方向键选择或焦点跟随",
    });
  }
  const re = /<view\b[^>]*\brole="(radiogroup|tablist)"/g;
  let m;
  while ((m = re.exec(src))) {
    groups++;
    const isTablist = m[1] === "tablist";
    const memberRole = isTablist ? "tab" : "radio";
    const openEnd = tagEnd(src, m.index);
    const close = matchClose(src, openEnd);
    const header = src.slice(m.index, openEnd);
    const body = src.slice(openEnd, close);
    const line = src.slice(0, m.index).split("\n").length;

    const members = [...body.matchAll(new RegExp(`<view\\b[^>]*\\brole="${memberRole}"`, "g"))]
      .map((r) => body.slice(r.index, tagEnd(body, r.index)));

    // 组级方向键(写在组容器上)或成员级方向键(写在每个成员上)都算数 ——
    // 本仓两种写法都有(earn.vue 写在成员上,marketplace 的 tab 写在成员上)。
    const groupArrows = /keydown\.(left|right|up|down)\b/.test(header);
    const memberArrows = members.filter((t) => /keydown\.(left|right|up|down)\b/.test(t)).length;

    // R2:组内完全没有方向键。
    if (members.length > 1 && !groupArrows && memberArrows === 0) {
      violations.push({
        file: rel, line, rule: "R2",
        detail: `${members.length} 个 ${memberRole} 成员,组与成员都没有方向键处理 —— 键盘用户无法在组内移动`,
      });
    }

    // R1:成员缺 roving tabindex。判据看「有没有把 tabindex 绑定到选中态」,
    // 而不是看有没有出现字面量 0 —— 绑定写法可以是 :tabindex="… ? 0 : -1"。
    if (members.length > 1) {
      const notRoving = members.filter((t) => !/:tabindex=/.test(t));
      if (notRoving.length > 0) {
        violations.push({
          file: rel, line, rule: "R1",
          detail: `${notRoving.length}/${members.length} 个 ${memberRole} 成员的 tabindex 没有绑定到选中态` +
            (notRoving.some((t) => /tabindex="0"/.test(t)) ? "(其中含字面量 tabindex=\"0\")" : "") +
            " —— 全组都能 Tab 进入,不是 roving tabindex",
        });
      }
    }
  }
}

// 基数不变量:漏扫必须报红,不能「少扫了也报绿」。
if (groups < GROUP_FLOOR) {
  console.error(`✖ 只解析出 ${groups} 个互斥组,低于下界 ${GROUP_FLOOR} —— 解析器疑似漏扫,判据不可信`);
  process.exit(2);
}
if (files.length === 0) {
  console.error("✖ 一个 .vue 文件都没扫到 —— src/ 路径或遍历逻辑失效");
  process.exit(2);
}

if (violations.length > 0) {
  console.error(`✖ 互斥单选组键盘契约违规 ${violations.length} 处(共解析 ${groups} 组 / ${files.length} 文件):`);
  for (const v of violations) console.error(`   [${v.rule}] ${v.file}:${v.line} — ${v.detail}`);
  console.error("\n修法:成员 tabindex 绑定选中态(:tabindex=\"sel === x ? 0 : -1\"),并补左右方向键移一格+选上+焦点跟随。");
  process.exit(1);
}

console.log(`✓ 互斥单选组键盘契约:${groups} 组 / ${files.length} 文件,roving tabindex 与方向键齐备`);
