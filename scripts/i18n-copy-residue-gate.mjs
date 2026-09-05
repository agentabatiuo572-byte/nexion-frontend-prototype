#!/usr/bin/env node
// i18n 文案残留哨兵 —— node scripts/i18n-copy-residue-gate.mjs
//
// 现场(2026-08-13):verify.sh 里这道门原本是 `grep -rE '\*\*[^*]+\*\*|`/[a-z]' src/i18n/messages`,
// **对整个文件做子串匹配,不剥注释**。于是在 i18n 文件里写一句带 `**强调**` 的中文注释就会判红,
// 而它要守的是「**用户看得到的文案**里不许有 markdown 残留」—— 注释用户看不到。
// 本仓已记过这一族:子串哨兵必须先剥注释再匹配(feedback_cards_audit_round_lessons)。
//
// 🔴 判据构造性:**只在字符串字面量的值里找**,不在注释、不在键名里找。
//   候选集为 0(一个文案都没抠到)= 判据失效 = 判红,不静默放行。
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "src/i18n/messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

// markdown 残留的两种形态:**强调** 与 反引号包起来的 /path
const RESIDUE = [
  { name: "**强调**", re: /\*\*[^*\n]+\*\*/ },
  { name: "`/path`", re: /`\/[a-z]/ },
];

let scanned = 0;
const hits = [];
for (const f of files) {
  const src = readFileSync(path.join(dir, f), "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    // 剥掉行注释:从第一个不在引号里的 `//` 起截断
    let inStr = false, quote = "", cut = line.length;
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (inStr) {
        if (c === "\\") { k++; continue; }
        if (c === quote) inStr = false;
      } else if (c === '"' || c === "'" || c === "`") {
        inStr = true; quote = c;
      } else if (c === "/" && line[k + 1] === "/") {
        cut = k; break;
      }
    }
    const code = line.slice(0, cut);
    // 只取**值**:`key: "..."` 或 `key:` 换行后的续行字符串
    const values = [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    for (const v of values) {
      scanned++;
      for (const r of RESIDUE) {
        if (r.re.test(v)) hits.push(`${f}:${i + 1}  ${r.name}  ${v.slice(0, 80)}`);
      }
    }
  });
}

const FLOOR = 3000; // 三语各 4677 键,取值远超此数;抠不到这么多说明解析坏了
if (scanned < FLOOR) {
  console.log(`FAIL  只抠到 ${scanned} 条文案值(下限 ${FLOOR})—— 判据失效,判红`);
  process.exit(1);
}
if (hits.length) {
  console.log(`FAIL  ${hits.length} 处 markdown 残留在**用户可见文案**里(注释已剥,不计):`);
  for (const h of hits.slice(0, 10)) console.log(`        ${h}`);
  process.exit(1);
}
console.log(`i18n-copy-residue PASS —— 扫 ${files.length} 个文件 / ${scanned} 条文案值,0 处残留(注释已剥)`);
