// 代码剥注释器 —— 各机器门共用一份。
//
// 🔴 为什么必须共用:同一个坑在两道门里各咬了一次。naive 正则版会把注释里的
// 「斜杠+星号」当块注释开头,吞掉几十行真代码;只剥整行 // 又漏掉行尾注释 ——
// 于是「文件头注里写了 wq.claimTier1()」这种文档文字会被当成真调用参与判定
//(selfcheck-claim-idempotency 的顺序门第一次跑就栽在这上面,报了两个假阳性)。
// 判据只写一份,才不会「修了一道门、漏了另一道」。
/** 剥注释 —— **带状态的逐字符扫描**,不是正则。
 *
 *  🔴 为什么不能用正则(2026-08-04 对抗审计实测):
 *   ① 正则版不认上下文 —— `security.ts:8` 的注释里写了一个以「斜杠+星号」结尾的 API 通配路径,
 *      那两个字符被当成块注释开头,一路吃到 1838 字符外的真闭合符,**78 行剥成 38 行**,
 *      `interface Persisted` 与 `function hydrate` 整段消失。全树 325/397 个文件掉行。
 *      (本注释自己也踩过一次:原稿把那个通配路径原样写进来,当场把本块注释提前闭合。)
 *   ② 只剥「整行 //」漏掉**行尾 //** —— 实测双向都能骗:一个只有 import 的假文件加一行
 *      行尾注释「已迁到 postMoneyBill( 与 captureMoney( ,restoreTo: before」就能让接线门判绿;
 *      真走收口点的文件写一句 `// 已不再 bills.add( 了` 就能把棘轮门判红。
 *
 *  状态机认:单/双引号、模板串(含 `${}` 嵌套)、正则字面量、行注释、块注释、SFC `<!-- -->`。
 *  换行保留(行号不漂),被剥内容用空格填充。 */
export function strip(src, keepStrings = false) {
  const out = [];
  let i = 0;
  const n = src.length;
  // prev = 最近一个非空白的已输出字符,用来区分「除号」与「正则字面量开头」
  let prev = "";
  const push = (ch) => { out.push(ch); if (!/\s/.test(ch)) prev = ch; };
  const blank = (ch) => out.push(ch === "\n" || ch === "\r" ? ch : " ");
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    // SFC 注释
    if (c === "<" && src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end < 0 ? n : end + 3;
      for (; i < stop; i++) blank(src[i]);
      continue;
    }
    if (c === "/" && c2 === "/") {                       // 行注释(含行尾)
      while (i < n && src[i] !== "\n") blank(src[i++]);
      continue;
    }
    if (c === "/" && c2 === "*") {                       // 块注释
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      for (; i < stop; i++) blank(src[i]);
      continue;
    }
    // 🔴 字符串**内容也要抹掉**:调用不可能活在字符串字面量里,而文档串 / 错误文案里
    // 出现 `bills.add(` 是常事(实测负控「字符串里的方法名」原本被误判成违规)。
    // 引号本身保留,长度恒等、行号不漂。
    if (c === '"' || c === "'") {                        // 普通字符串
      const emit = keepStrings ? push : blank;
      push(c); i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") { emit(src[i++]); if (i < n) emit(src[i++]); continue; }
        if (src[i] === "\n") break;                      // 未闭合:止于行尾,不吞后文
        emit(src[i++]);
      }
      if (i < n && src[i] === c) push(src[i++]);
      continue;
    }
    if (c === "`") {                                     // 模板串:字面部分抹掉,`${}` 里是**真代码**要留
      push(c); i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === "\\") { blank(src[i++]); if (i < n) blank(src[i++]); continue; }
        if (depth === 0 && src[i] === "$" && src[i + 1] === "{") { depth++; push(src[i++]); push(src[i++]); continue; }
        if (depth > 0) {                                 // 插值内:原样保留
          if (src[i] === "{") depth++;
          else if (src[i] === "}") depth--;
          push(src[i++]);
          continue;
        }
        if (src[i] === "`") { push(src[i++]); break; }
        (keepStrings ? push : blank)(src[i++]);
      }
      continue;
    }
    // 正则字面量:`/` 前是运算符/开括号/关键字位 → 是正则,不是除号
    if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%~^".includes(prev))) {
      push(c); i++;
      let inClass = false;
      while (i < n && src[i] !== "\n") {
        if (src[i] === "\\") { push(src[i++]); if (i < n) push(src[i++]); continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) { push(src[i++]); break; }
        push(src[i++]);
      }
      continue;
    }
    push(c); i++;
  }
  return out.join("");
}
