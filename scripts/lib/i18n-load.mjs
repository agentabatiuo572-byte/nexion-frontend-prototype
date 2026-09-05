// i18n 真解析:把 messages/*.ts 编译后 import 进来读**对象**,而不是用正则抠字符串。
//
// 缘起(2026-08-01 哨兵自审):slacopy 原来用 `indexOf('    key: ')` + 行内正则取值,
// 一次踩齐五类坑 —— 折行写法取不到(同一批文件里两种写法并存)、单引号/模板串返回 null、
// 6 空格缩进的嵌套同名 key 被当顶层取走、key 搜索不封 namespace 尾导致取到后面别的
// namespace 的同名 key、以及 `indexOf` 未命中返回 -1 喂给 slice 切出空串后**判 PASS**。
//
// 真解析把这一族一次全消:结构由 JS 引擎负责,判据只管语义。
import { readFileSync } from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");

/** 读一个语种的完整 messages 对象。失败直接抛 —— 候选为空必须判失败,不许静默返回 {}。 */
export async function loadMessages(locale) {
  const file = path.join(root, `src/i18n/messages/${locale}.ts`);
  const src = readFileSync(file, "utf8");
  const { code } = transformSync(src, { loader: "ts", format: "esm" });
  const mod = await import("data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64"));
  const msgs = mod.default ?? mod[locale] ?? mod.messages;
  if (!msgs || typeof msgs !== "object") throw new Error(`[i18n-load] ${locale}: 解析不出 messages 对象`);
  return msgs;
}

/** 按点路径取值;取不到返回 undefined(调用方必须把 undefined 判成 FAIL,不是 PASS)。 */
export function at(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * 「这个文案里除占位符外还有没有数字」。
 *
 * 不用 `\b` 做边界 —— JS 的 \b 只认 ASCII,「30 天。」这种上下文里尾部边界不成立,
 * 中文那一面会完全不设防(实测:为 P0 建的门,对该 P0 的原始文案敞开)。
 * 判据换成语义本身:把 {xxx} 占位符挖掉之后,不许再剩任何数字。
 */
export function hasHardcodedNumber(text) {
  if (typeof text !== "string") return true; // 取不到值 = 判失败
  return /\d/.test(text.replace(/\{\w+\}/g, ""));
}
