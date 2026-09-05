// esbuild 里 `@/…` 别名的解析器 —— 各 selfcheck 脚本共用一份。
//
// 🔴 为什么必须共用:同一个坑咬过三次。原先每个脚本各抄一份
// `[base, `${base}.ts`, path.join(base, "index.ts")].find(existsSync)`,
// 而 `@/i18n` **既是目录也有 index.ts** —— 目录排在前面就先命中目录,
// esbuild 去读目录 → `Cannot read file "src/i18n": Incorrect function`。
// 平时不炸只是因为那个脚本的 import 图还没走到 @/i18n;哪天某个 store 多引一层就当场炸。
// 判据只写这一份,才不会「修了两个、漏了三个」。
//
// 两条规矩:
//   ① **文件优先于目录**:`x.ts` → `x/index.ts` → `x`(目录兜底给 esbuild 自己判)。
//   ② 候选必须 `isFile()` —— 只 `existsSync` 会把目录当成命中。
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/** 造一个 esbuild plugin.setup 里用的 `@/` 解析回调。
 *  @param srcDir 工程的 src 绝对路径
 *  @param who    出错时报哪个脚本(便于定位) */
export function atAliasResolver(srcDir, who) {
  return (a) => {
    const base = path.join(srcDir, a.path.slice(2));
    const hit = [`${base}.ts`, path.join(base, "index.ts"), base]
      .find((p) => existsSync(p) && statSync(p).isFile());
    if (!hit) throw new Error(`${who}: 解析不到 ${a.path}`);
    return { path: hit };
  };
}

/** 直接挂到 build({ plugins: [...] }) 上的成品 plugin。 */
export function atAliasPlugin(srcDir, who) {
  return {
    name: "at-alias",
    setup(b) {
      b.onResolve({ filter: /^@\// }, atAliasResolver(srcDir, who));
    },
  };
}
