# 2026-09-02 · Tier 1 B+C:主线 git 门 + 已知红清单 + 只增不删豁免(状态:Shipped)

> 来源:2026-09-02 工作流总体检(报告 artifact「PLAN 工作流体检」),主人拍板 A-F 全按推荐执行;Tier 0 事实修正已合(本包前两笔提交),本文件记 Tier 1 的 B 与 C。

## 为什么

- PLAN 侧两道 PreToolUse 守卫靠解析 shell 命令**文本**猜 git 意图:裸 `git commit -m x`(Bash cwd 已在仓内)整条不响;`git fetch origin && git merge x` 链式写法直接绕过合并守卫。两条 2026-09-02 本机复现。
- verify 是二元制:任一步红 = 整链红 = 合并守卫不放行,逼着开逃生阀 —— 两个月会话记录里逃生阀写了 250+ 次;老红把新红埋在噪音里(WF-17 预言的死法)。
- 加 i18n key 命中 `src/i18n/**` 全局清单恒升 full,scoped 档对最常见的任务形态几乎不生效。

## 做了什么

### B · 主线两道 git 门(`.githooks/`,同一套脚本也装进 admin-ops)
- `pre-commit` → `guard-mainline-commit.mjs`:主线上只放 S 级直提(暂存 ≤5 文件 · 无 `docs/changes/` · 无未推提交);M/L 走 `pkg/<字母>-<短名>`。读**真实暂存清单**,不猜文本。
- `pre-push` → `verify-before-push.mjs`:推主线前被推提交必须有 full 绿(`.verify-cache/last-run.json`:mode=full · verdict=pass · 树匹配 · 干净树 · 未漂移)。推 `pkg/*` / `codex/*` 不拦。
- `config.json` 仓级参数(mainline / sMaxFiles);`prepare` 脚本在 `npm install` 时自动 `core.hooksPath=.githooks`;`.gitattributes` 钉 `.githooks/*` LF。
- 逃生阀一律环境变量 + 留痕:`ALLOW_MAIN_COMMIT` → `.verify-cache/commit-valve.log`,`ALLOW_UNVERIFIED_PUSH` → `.verify-cache/push-valve.log`;`--no-verify` 不留痕,禁用。
- 红测 22 条(`npm run test:githooks`,verify:steps 第 2 步),含真 `git commit` / `git push --dry-run` 端到端被拦与放行。

### C · 已知红清单(`scripts/known-red.json` + `scripts/lib/known-red.mjs`)
- 每条必带 `why`(≥8 字)+ `since` + `until`(≤ since+90 天);未到期:链步骤记 `KNOWN-RED`、老套件格记 `KNOWN-RED`,不进 fail / verdict;到期未清自动回红。
- 清单自带 lint(格式 / 日期 / 90 天上限 / 重复),挂在 verify.sh 静态段「已知红清单门」;清单坏 = 整链红,不许静默当 0 条。
- 产物:`last-run.json` 带 `knownRed[]`;`.verify-chain.code` / `.verify-exit.code` 第 2 行带 `known_red=`;pre-push 的 ✓ 行点名已知红条数。
- 首批登记 2 步(到期 2026-10-01):`test:contract-registry`(genesis-5174 契约测试直连 127.0.0.1:8110,链未起该服务)、`test:real-backend-integration`(me-button-parity 读缺席的 `../NX1.0-Prototype`)。修法写在 why 里,待主人排期。
- 顺手:修 `verify-chain.mjs --pool` 收尾 `pool.mock/remote` 空指针(实际字段是 development/production)。

### C · 只增不删豁免(`gates.manifest.json` → `globalsAdditiveOk`)
- 命中 globals 但相对主线**只增不删**(`git diff --unified=0` 无 `-` 行,含未提交)的文件不升档;首批 = `src/i18n/messages/*.ts`。改 / 删 / 重排 key 仍升 full;声明了 i18n 为输入的门照跑。
- 红测(`npm run test:verify-harness`,共 21 条):清单 lint / 到期回红 / 前缀匹配 / 链接线 / bash 侧接线 / 只增不删六种形态。

## 证据
- 基线 full(tree b826261c + Tier 0,`.wt/bf-full`):20 步 18 绿 2 红,legacy 464/0/0,8.2 min —— 09-01 记录的 46 红 / 49 min 已过期。
- 静态档(本包树):438 pass / 0 fail,「已知红清单门」PASS,`.verify-exit.code` 第 2 行 `known_red=0`。
- 本包 full(Tier 1 tip):见 close 时的 `.verify-cache/last-run.json`(预期 verdict=pass,KNOWN-RED 2)。

## 未做 / 后续
- 两条已知红的产品侧修法(SKIP 缺件 / 自起 8110 / 摘原型线采样)由主人排期,到期 2026-10-01 自动回红。
- nexgrid-website 尚无 last-run.json 契约,pre-push full 门未覆盖(Tier 1 后续项)。
- PLAN 侧 `guard-package-branch.mjs` / `verify-fresh-before-merge.mjs` 在两仓主线都带上 `.githooks` 后退役(harness 仓另有提交)。
