// SFC 区域感知注释剥离器 —— i18n 硬编码文案哨兵(中文面 / 英文面)共用一份。
//
// 🔴 为什么不能用 `scripts/lib/strip-code.mjs` 的 strip():那一支是给**脚本代码**判调用面用的,
// 它把 `//` 一律当行注释、还会把字符串内容整块抹掉。文案哨兵要判的恰恰是字符串与模板文本,
// 而模板里的 `//` 是普通文本(URL / `24/7` / 分数),当成注释会把后面的文案一起吃掉 = 假绿。
// 所以本支先切出 <script> / <style> 区域再分别按各自的注释语法处理,**字符串字面量原样保留**。
//
// 🔴 为什么单独成文件而不是留在中文哨兵里:两道门都要这份逻辑。留在一处让另一处复制,
// 就是「修了一道门、漏了另一道」的标准形态(strip-code.mjs 的文件头注记了同一个坑)。
// 本模块的回归靶 = `i18n-hardcoded-cjk-sentinel.mjs --selftest` 里那批注释判据(HTML 注释 /
// script 行注释 / 块注释 / style 注释 / 含 `//` 的字符串 / 模板里的 `//`),改坏了那批立刻红。

// 按区域用不同的注释语法,不能一把梭。先切出 <script> / <style> 区域。
//
// 🔴 开标签**锚行首**(`^<script` / `^<style`),不是任意位置的 `<script` ——
// 独立审计(2026-08-17)实测:注释里提到 `<style>` 二字就会被当成区域开始,配不到闭标签时
// 区域一路延到文件尾,于是其后模板里的 `//` 按 script 行注释语义把整行吃掉 = 假绿。
// 仓内 `src/components/captcha-slider.vue:293` 的注释里就有这么一个 `<style>`。
// 锚行首是安全的:SFC 顶层块按约定就在第 0 列(实测 248/248 个 .vue 全部如此),
// 而注释里提到标签名时前面必有缩进或文字。
function regions(src, isVue) {
  if (!isVue) return { script: [[0, src.length]], style: [] };
  const collect = (tag) => {
    const out = [];
    const re = new RegExp(`^<${tag}[^>]*>`, "gim");
    let open;
    while ((open = re.exec(src))) {
      const from = open.index + open[0].length;
      const close = src.toLowerCase().indexOf(`</${tag}>`, from);
      out.push([from, close < 0 ? src.length : close]);
    }
    return out;
  };
  return { script: collect("script"), style: collect("style") };
}

const inside = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);

/** 把注释替换成等长空白(行号与列都不漂移),字符串字面量原样保留 —— 文案哨兵要判的就是字符串。 */
export function stripComments(src, isVue) {
  const { script, style } = regions(src, isVue);
  let out = "";
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    const inScript = inside(script, i);
    const inStyle = inside(style, i);
    if (inScript && (c === '"' || c === "'" || c === "`")) {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === quote) { j += 1; break; }
        j += 1;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (inScript && c === "/" && c2 === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j += 1;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if ((inScript || inStyle) && c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      const j = end < 0 ? n : end + 2;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (!inScript && !inStyle && c === "<" && src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const j = end < 0 ? n : end + 3;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * 去掉 .vue 的 <script> / <style> 顶层块(等长空白填充),剩下的就是模板区。
 * 用「抹掉另外两种块」而不是「配对解析 <template>」:模板里有嵌套 `<template v-if>`,
 * 配对解析会在第一个 `</template>` 就收尾,把后半个模板判成非模板 = 那半边全免检。
 */
export function templateRegion(src) {
  let out = src;
  for (const tag of ["script", "style"]) {
    // 开标签同样锚行首(理由见 regions() 的注释),长度等长填充 —— 行号与字符下标都不漂移,
    // 调用方可以拿本函数的返回串直接算原文件里的行号。
    out = out.replace(new RegExp(`^<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gim"), (m) => m.replace(/[^\n]/g, " "));
  }
  return out;
}

/** 取 <style> 区间(不含标签本身),配合 `content: "…"` 这类会渲染的样式值判定。 */
export function styleRegions(src) {
  const out = [];
  const re = /^<style[^>]*>/gim;
  let open;
  while ((open = re.exec(src))) {
    const from = open.index + open[0].length;
    const close = src.toLowerCase().indexOf("</style>", from);
    out.push([from, close < 0 ? src.length : close]);
  }
  return out;
}
