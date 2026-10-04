#!/usr/bin/env node
/**
 * 输入控件可访问名门。
 *
 * 【为什么需要 —— 一个真实漏过的缺陷】
 * zentao #224:登录 / 注册 / 重设密码的手机号与密码输入框**没有可访问名**。
 * 它们只写了 `:placeholder`,而 placeholder 不是名字:读屏不把它当标签念,
 * 用户一开始输入它就消失,浏览器/AT 组合对它的暴露也不一致。于是读屏用户听到的
 * 只是「文本框」「密码框」,六个验证码格子更是六个无名控件。
 *
 * 为什么既有门没拦住:`a11y-activate-gate.mjs` 管的是「能不能被键盘激活」,
 * `radio-group-keyboard-gate.mjs` 管的是「互斥组的 roving/方向键」,都不看名字。
 *
 * 【判据是构造性的,不枚举页面/控件名】
 * 遍历全仓模板(先剥注释 —— 首版实测:注释里举例的 `<input>` 会被算成真控件),
 * 对每个 `<input>`/`<textarea>` 要求二者之一:
 *   N1 自带 `aria-label` / `aria-labelledby`
 *   N2 或由平台层 `lib/a11y-field-label.ts` 兜底(该层把宿主上的名字镜像到内部真控件)
 * 并额外守一条**安装判据**:App.vue 必须真的调用 `installFieldNaming()`。
 * uni 的 `<input>` 编译成 `<uni-input>` + 内部真 textbox,写在源标签上的 aria-*
 * 落在宿主上、下不去;这一层没挂 = 全仓输入框整片无名,而门与文件都还在,
 * 只看「文件存在」是看不出来的。本仓已有先例:`installKeyboardActivation()` 被一次
 * 并发合并冲掉过。
 *
 * 与另两道 a11y 门同样坚持**基数不变量**:扫到的控件数不得低于下界。
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const APP = join(SRC, "App.vue");
const LAYER = join(SRC, "lib", "a11y-field-label.ts");

/** 控件数下界:低于它就说明解析器漏扫。2026-09 实测 52 个。 */
const FIELD_FLOOR = 40;
/** role=button 数下界(同理由:低于它就说明解析器漏扫)。2026-09 实测 525 个。 */
const BUTTON_FLOOR = 400;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".vue")) out.push(p);
  }
  return out;
}

/** 找配对的 </tag>(只数同名开闭标签,模板内足够且不误跨组件)。 */
function matchClose(src, openEnd, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}\\s*>`, "g");
  re.lastIndex = openEnd;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    if (m[0].startsWith("</")) { if (--depth === 0) return m.index; }
    else depth++;
  }
  return src.length;
}

/** 注释里的示例代码不是控件:剥掉 HTML 注释、块注释与整行 // 注释(保留行数)。 */
function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/[^\n]*/gm, (m) => " ".repeat(m.length));
}

const findings = [];
let fields = 0;
let buttons = 0;
const files = walk(SRC);

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = stripComments(raw);
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  for (const m of src.matchAll(/<(input|textarea)\b[^>]*?\/?>/gs)) {
    fields++;
    const tag = m[0];
    if (/\baria-label(ledby)?\s*=/.test(tag)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    const flat = tag.replace(/\s+/g, " ").slice(0, 120);
    findings.push({ file: rel, line, tag: flat });
  }

  // N3:纯图标的 role="button" 也要有名字。正文里没有可见文字时,读屏只会念「按钮」——
  // 充值地址旁的「复制」按钮就是这样(zentao #88)。
  // 🔴 必须按**配对闭合**取正文:非贪婪正则会在第一个内层 </view> 处截断,把带文字的
  //    按钮误判成纯图标(首版实测:525 个按钮里误报 8 个,深度感知后只剩 1 个真缺陷)。
  for (const m of src.matchAll(/<view\b[^>]*\brole="button"[^>]*>/g)) {
    buttons++;
    const openEnd = src.indexOf(">", m.index);
    const body = src.slice(openEnd, matchClose(src, openEnd, "view"));
    if (/\baria-label(ledby)?\s*=/.test(m[0])) continue;
    if (/<text\b[^>]*>\s*[^<\s{]/.test(body) || /\{\{/.test(body)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    findings.push({ file: rel, line, tag: "role=\"button\" 纯图标按钮缺少可访问名(正文无可见文字)" });
  }
}

// 平台层必须存在且被挂上:文件在、没人调用 = 功能是死的。
if (!existsSync(LAYER)) {
  findings.push({ file: "src/lib/a11y-field-label.ts", line: 0, tag: "可访问名补齐层被删除" });
} else {
  const app = stripComments(readFileSync(APP, "utf8"));
  if (!/installFieldNaming\s*\(\s*\)/.test(app)) {
    findings.push({
      file: "src/App.vue", line: 0,
      tag: "installFieldNaming() 未被调用 —— uni 的 <input> 会把 aria-* 留在宿主上,内部真控件拿不到名字,全仓输入框整片无名",
    });
  }
}

if (buttons < BUTTON_FLOOR) {
  console.error(`✖ 只解析出 ${buttons} 个 role="button",低于下界 ${BUTTON_FLOOR} —— 解析器疑似漏扫,判据不可信`);
  process.exit(2);
}
if (fields < FIELD_FLOOR) {
  console.error(`✖ 只解析出 ${fields} 个输入控件,低于下界 ${FIELD_FLOOR} —— 解析器疑似漏扫,判据不可信`);
  process.exit(2);
}
if (files.length === 0) {
  console.error("✖ 一个 .vue 文件都没扫到 —— src/ 路径或遍历逻辑失效");
  process.exit(2);
}

if (findings.length > 0) {
  console.error(`✖ 输入控件缺少可访问名 ${findings.length} 处(共扫 ${fields} 个控件 / ${files.length} 文件):`);
  for (const f of findings) console.error(`   ${f.file}:${f.line} — ${f.tag}`);
  console.error('\n修法:补 :aria-label="<用户看得见的那个名字>"(优先复用同处的可见标签文案),不要只留 placeholder。');
  process.exit(1);
}

console.log(`✓ 可访问名:${fields} 个输入控件 + ${buttons} 个 role="button"(纯图标者已核)/ ${files.length} 文件,名字齐备且补齐层已挂载`);
