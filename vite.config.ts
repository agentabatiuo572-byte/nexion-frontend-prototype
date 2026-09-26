import { defineConfig } from "vite";
import uniPlugin from "@dcloudio/vite-plugin-uni";
import UnoCSS from "unocss/vite";

// @dcloudio/vite-plugin-uni ships as CJS. With "type":"module" in package.json
// (required so the ESM-only unocss/vite plugin can be imported), Vite loads
// this config as ESM, where the callable is exposed on `.default`. Normalize
// so uni() works regardless of interop mode.
const uni = (uniPlugin as unknown as { default?: typeof uniPlugin }).default ?? uniPlugin;

// 本配置文件所在树的根(主 checkout 或某个 worktree),正斜杠形式 —— chokidar 的
// ignore 走 normalize-path,两侧都归一成正斜杠,与 vite 自己拉黑 cacheDir 同款写法。
// __dirname 由 vite 打包 config 时注入(__vite_injected_original_dirname),ESM 下也有。
// ponytail: 没给路径做 glob 转义 —— 仓库路径一旦含 `( ) [ ] !` 等元字符这条会静默失配
// (P-096 的 OOM 会回来)。真要搬到那种路径,照 vite 拉黑 cacheDir 的做法先 escapePath。
const selfDir = __dirname.replace(/\\/g, "/");

export default defineConfig(() => {
  return {
    plugins: [uni(), UnoCSS()],
    // 只被懒编译页面引用的依赖必须在这里显式预打包:uni 的按需编译让启动扫描
    // 抓不到它们,首个访客触发运行时依赖重打包 → 在途模块请求 500 + 整页 reload,
    // uni 异步页面组件等满 60s 直接弹「连接服务器超时」。入口链上的依赖
    // (vue/pinia/vue-i18n)启动即扫到,无需列出。
    optimizeDeps: {
      include: ["qrcode-generator"], // 仅 proof.vue / share-poster-sheet.vue 引用
    },
    server: {
    // 🔴 双栈监听(2026-08-05 结构性反思第 1 步)。此前默认只绑 [::1]:
    //   curl localhost=200 而 127.0.0.1=拒连 → verify 前段 curl 探活全绿、
    //   后段硬写 127.0.0.1 的 6 个 Playwright 齿轮 ERR_CONNECTION_REFUSED,
    //   **「没跑起来」被读成「跑过且绿」**,两轮 agent 还对根因得出互相矛盾的结论。
    //   host:true → Node 监听 `::` 双栈,127.0.0.1 / [::1] / localhost / 局域网都通。
    //   修在服务端一处,不追着改 N 个脚本里写死的地址(那是散弹枪,新脚本必复发)。
    host: true,
    port: 5175,
      strictPort: true, // 高保真固定 5174；端口占用时直接失败，不静默漂移
      // 🔴 .claude/worktrees 与 admin 仓互挂 junction(跨仓门取材面),构成双向环:
      //   uniapp/.claude/worktrees/nexion-ops-console → admin-ops/.claude/worktrees/Nexion-uniapp → 回本仓。
      //   chokidar 跟随 junction 在环里无限递归,监视路径每圈翻倍,4GB 堆 ~2.5h 吃穿
      //   (FATAL: heap out of memory,exit 134;2026-08-15/16 主 5173 连崩,GC 日志实锤)。
      //   dist/ 是构建产物:verify 链的 build:h5 每次落盘都触发整页 reload,打断正在浏览的人。
      //   .trash/ 是删除暂存,监视它只有噪声。三者都不是源码,监视器一律拉黑。
      // 🔴 .claude 必须锚在**本配置文件所在树**的绝对路径,不能写 `**/.claude/**`:
      //   worktree 整棵树就住在 <主 checkout>/.claude/worktrees/<name>/ 里,通配版会把
      //   worktree 的**全部源码**一起拉黑 → dev server 永不跟进改动,且完全静默
      //   (改完 curl 回来还是旧转译产物,杀了重起才更新)。实付:一次「拆掉退款守卫、
      //   印钞路径必须变红」的红测跑出全绿,换新 server 立刻变红。详见 P-100。
      //   门:scripts/vite-watch-anchor-gate.mjs(verify [0] 静态门,改回通配即红)。
      //   锚定后:主 checkout 照旧拉黑自己的 .claude(junction 环仍进不去),
      //   worktree 只拉黑自己的 .claude,源码恢复可见。
      watch: {
        ignored: [`${selfDir}/.claude/**`, "**/dist/**", "**/.trash/**"],
      },
    },
  };
});
