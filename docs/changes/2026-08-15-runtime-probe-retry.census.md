# Runtime 探针族 census(T1 产出 · T4 tester 证伪后 v2)

- 基线:UniApp `00069e6`(SPEC-7 落地后)的 `scripts/verify.sh`;v2 于独立 tester 证伪(P1=1/P2=10)后修订。
- 判据(v2 修正,P2-6):脚本源码真含 `playwright|chromium|page.goto|process.env.BASE_URL`,**或 spawn 已知 runtime 探针**(verify-h5-runtime 只经子探针起浏览器,纯文本判据选不出它——初版自称「构造性不手写」在它身上不成立,v2 如实改口:判据两臂,第二臂是人工核实的委托关系)。

## 包装族(14 脚本 / 16 调用点)

14 个真跑调用点(每脚本一个;初版表里 spec6/dom-qa 的「第二调用点」实为静态哨兵行与 bad 消息行的假锚,P2-7 已清)+ 2 个 **launch 型 selftest** 调用点(v2 新增,P2-5):

| 类 | 成员 |
|---|---|
| 真跑 ×14 | auth-system-chrome · spec6-entry-surface · r7-device-detail · spec7-risk-gate · auth-register-existing(per-locale 循环,1 点 ≈ en/zh 2 次执行)· spec4-app-sync · spec4-session-guard · theme-constant · zero-border · dom-qa(--sweep core)· tap-feedback · empty-state · withdraw-bill · verify-h5-runtime |
| launch 型 selftest ×2 | dom-qa --selftest · tap-feedback --selftest(**顶层先起真 chromium 再跑 fixture**,launch-under-load 抖动面真实存在,tester 实锤后入族) |

调用形态:`if probe_retry <日志路径> [env BASE_URL=...] "$NODE_BIN" scripts/<x>.mjs [args]; then` —— 重定向收进函数,首败整份存档 `<日志>.attempt1` 后截断重写,主日志只含权威第二次(根治 6 个 `ok "$(cat log)"` 点的首败文本污染,P2-2)。

## 明确不包(判据+理由)

- `theme-constant-gate --selftest` / `zero-border-gate --selftest` — 纯函数先退,不起浏览器(tester 抽查实锤),保持确定性锐度
- `endpoint-citation-sentinel` — 假阳性:命中 SKIP_DIR 的 `.playwright-mcp` 字符串(P-012 同款)
- `selfcheck-remote-refresh-resilience` — 假阳性:命中 `VITE_NEXGRID_API_BASE_URL` 变量名子串,注入式模拟无浏览器
- `selfcheck-config-compat` — 无浏览器;模式相关但给定模式下确定性
- 跨仓文件检查(SPEC-7 域锚 / wd02 契约锚 / 采样证据 audit)— 确定性文件读
- 其余静态/逻辑哨兵 — 确定性门,重试掩盖不该存在的非确定性
- ⚠ **已知残余(P2-8,记录在案不处置)**:package.json `test:h5-runtime` 是 verify-h5-runtime 的第二入口(`npm run verify` 链在 legacy-suite 前独立跑一遍),该入口无包装——走全链的人在前一站仍可能吃裸抖;bash 函数进不了 npm script,处置需 node 层包装,暂记账
- ⚠ **计数门构造性上限**:③ 是固定数恒等式,守得住存量解包、守不住「新增 runtime 探针没包」(新增未包点 count 仍=16 恒绿);增员时人工把 expected_sites 与本表同步

## selftest(与实现同提交)与红测台账

- ③ 接线判据(v2 加固):`^\s*if probe_retry .*"$NODE_BIN" scripts/` 锚定行首(注释诱饵免疫,tester M5 打穿后修)+ `$PROJECT_DIR` 绝对路径(cwd≠仓根假红,P2-4)+ 弃 `|| echo 0`(grep -c 零命中产 `0\n0`,P2-10);期望数 **16**
- 演习隔离(P1-1):selftest 期间换草稿登记簿,真登记簿零污染(实测 0 字节);登记簿开跑截断防 PID 复用残留,条目带日期
- 红测 v3(仓形副本,真文件零污染,变异均先证落地):基线绿 16/16 · 仅诱饵注释→仍绿 · 诱饵+解包→红 15≠16 · 废重跑臂→红② · 恒真臂/删标记/删留痕(初版 E4/M3/M4)→红①②;文件缺失→红 0≠16(fail-closed)
