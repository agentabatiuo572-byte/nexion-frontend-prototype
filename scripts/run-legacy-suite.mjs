#!/usr/bin/env node
// 老哨兵套件的自启壳 —— node 直跑(也是 npm run verify 的一环):
//   node scripts/run-legacy-suite.mjs
//
// 为什么要这层壳(z1 收口,2026-08-10):
//   `scripts/verify.sh` 里的运行时探针要一台本树 development server。
//   以前靠「你自己先起一个 5173」这个口头约定,于是两种翻车都真发生过:
//     ① 忘了起 → 探针整片 SKIP/红,或(更糟)打到别人的 checkout 上验错了对象;
//     ② 起了但构建环境不对 → 被测分支与验收目标不一致,门静默失效。
//   这层壳照 verify-h5-runtime.mjs 的家法:自己挑空闲端口、以 development 起**本工作树**的
//   server、把 BASE_URL 交给 sh、跑完连进程树一起收掉。套件从此对外部环境零依赖,
//   接进官方门链才不会互相踩(多个 worktree 会话并发时尤其重要 —— 各起各的端口)。
//
// 包 ar(2026-08-17):起服走 lib/dev-server-pool.mjs;runner 已起的一对 server 可经
//   LEGACY_SUITE_REUSE_DEV_URL / LEGACY_SUITE_REUSE_PROD_URL 传进来 —— **先核身份(本树 + 构建环境)再复用**,
//   核不过照旧自己起。VERIFY_MODE(full|scoped|static)原样透传给 verify.sh;static 档不该走本壳
//   (不需要 server,runner 直接裸跑 verify.sh)。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureServer } from "./lib/dev-server-pool.mjs";
import { findBash } from "./lib/find-bash.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));


const log = (m) => console.log(`legacy-suite:${m}`);
const [server, productionServer] = await Promise.all([
  ensureServer({ root, environment: "development", reuseUrl: process.env.LEGACY_SUITE_REUSE_DEV_URL || null, log }),
  ensureServer({ root, environment: "production", reuseUrl: process.env.LEGACY_SUITE_REUSE_PROD_URL || null, log }),
]);
const baseUrl = server.baseUrl;
const remoteBaseUrl = productionServer.baseUrl;

let code = 1;
try {
  log(`development server ${baseUrl}(${server.reused ? "复用" : "隔离自起"})· production 资金边界 server ${remoteBaseUrl}(${productionServer.reused ? "复用" : "隔离自起"}),开始跑 scripts/verify.sh(VERIFY_MODE=${process.env.VERIFY_MODE || "full"})`);
  const bash = findBash();
  if (!bash) throw new Error("BASH_RUNTIME_NOT_FOUND:请安装 Git Bash 或设置 BASH_EXE");
  const res = spawnSync(bash, ["scripts/verify.sh"], {
    cwd: root,
    env: { ...process.env, BASE_URL: baseUrl, REMOTE_BASE_URL: remoteBaseUrl },
    stdio: "inherit",
    shell: false,
  });
  if (res.error) throw res.error;
  code = res.status ?? 1;
  // 🔴 中止 ≠ 判红(2026-08-12 加,同型第二次之后)。
  // 套件半路暴毙时退出码同样非零,而红门数会**变少** —— 两次都差点被读成好消息:
  //   ① 跨仓测试 ENOENT 崩在第 2 步 → 红门 27 → 0;② unbound variable 崩在第 263 行 → 27 → 2。
  // 靠人眼比 PASS 条数才看出来,那不是门。这里读哨兵第二行的基数,低于下限一律判「中止」。
  // 下限取 400:写下时满跑 435 pass + 27 fail = 462,留出正常增删门的余量;
  // 真要大批删门,连同这个数一起改 —— 改它是显式动作,崩掉不是。
  //
  // 🔴 462 这个数**只能当下限的由来看,不能当基线比**(2026-08-13 我自己踩了才补这句):
  // verify.sh 里有十几段是循环驱动的(逐源文件 / 逐路由 / 逐 i18n namespace 逐条 emit),
  // 所以总格数**随被测树的内容浮动** —— 隔几个提交再跑,少个二十格是正常的数据漂移,
  // 不是「门掉了」。我当时就是拿 441 去减 462,推出一句「有 21 格门没跑」的错结论,
  // 回源 diff 才发现同期 verify.sh 其实**净增 4 道门、一道没少**。
  // 要判「门有没有掉」,查的是 `git diff <旧> HEAD -- scripts/verify.sh` 里消失的 ok/bad 调用,
  // 以及各门自报的样本量有没有塌(那才是构造性判据);这里这个总数只负责区分「跑完 vs 中止」。
  //
  // 包 ar:scoped 档下 ran = pass+fail 会因 SCOPED-SKIP 而正常低于 400 —— 下限对 scoped/static 档
  // 换成「ran + scoped_skip ≥ 400」(跳过的格也是「到过」的格,只是没跑;半路暴毙时它们不会被点名)。
  const FLOOR = 400;
  let tally = null;
  try {
    const line = fs.readFileSync(path.join(root, ".verify-exit.code"), "utf8").split(/\r?\n/)[1] ?? "";
    const m = line.match(/pass=(\d+) fail=(\d+) skip=(\d+)/);
    const ss = line.match(/scoped_skip=(\d+)/);
    if (m) tally = { pass: +m[1], fail: +m[2], skip: +m[3], scopedSkip: ss ? +ss[1] : 0, mode: (line.match(/mode=(\w+)/) || [])[1] || "full" };
  } catch { /* 哨兵读不到,按下面的 null 分支处理 */ }
  if (!tally) {
    console.error("legacy-suite:FAIL —— 读不到退出码哨兵的基数行,无法区分「跑完判红」与「半路中止」");
    code = code || 1;
  } else {
    const ran = tally.pass + tally.fail;
    log(`本次实跑 ${ran} 格(pass ${tally.pass} / fail ${tally.fail} / skip ${tally.skip}${tally.scopedSkip ? ` / scoped-skip ${tally.scopedSkip}` : ""} · mode=${tally.mode})`);
    if (ran + tally.scopedSkip < FLOOR) {
      console.error(
        `legacy-suite:FAIL —— 只到过 ${ran + tally.scopedSkip} 格,低于下限 ${FLOOR} ⇒ **套件中途中止,不是判红**。` +
        "红门数变少在这种情况下是假象;先看日志最后一行的报错(unbound variable / 语法错 / 某步崩溃),别拿本次红门数做对比。",
      );
      code = code || 1;
    }
  }
} finally {
  server.stop();
  productionServer.stop();
}
process.exit(code);
