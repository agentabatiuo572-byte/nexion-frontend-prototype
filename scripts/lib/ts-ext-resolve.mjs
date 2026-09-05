// 契约测试(scripts/*.test.mjs)直接 import 仓内 `../src/**/*.ts` 跑真实现;Node 原生 ESM
// **不做扩展名补全**,而 src 内部的相对导入按本仓风格都是无扩展名的(`./order-api`),
// 于是只要被 import 的那个 .ts 里新增一条**运行时**相对导入,整个测试文件就加载失败
// (实测 4c32a50 给 trial-api.ts 加了 `import { … } from "./order-api"`,h2 那 8 条断言当场全灭,
//  报的还是 ERR_MODULE_NOT_FOUND,很容易被读成「模块没了」而不是「跑法不支持」)。
//
// 这里只在**解析已经失败之后**兜底试 .ts/.tsx/index.ts;一个候选都不存在就把原始错误原样抛出 ——
// 真缺模块照红,不许被兜底吞掉(红测:scripts/ts-ext-resolve.redtest.mjs)。
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || !context.parentURL?.startsWith("file:")) throw error;
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = base + suffix;
        if (fs.existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
      throw error;
    }
  },
});
