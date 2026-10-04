# APP 与 H5 同步

H5 保留注册后下载 APP 的引导，手机状态只读 APP/服务端结果。校准、绑定、手机心跳与手机任务仅在 APP 执行。H5 手机激活、停用、任务结束后停用和强制停用在页面入口与命令层统一拒绝，已购设备的管理保留。下载提示、网页下载模式与网页专属退出必须使用 H5 编译条件，APP 界面和原生注册/校准流程不得出现网页专属内容；原生能力暂不可用时显示对应的 APP 提示。普通购买和账户业务按共享规则运行。

正式来源为 `nexion-frontend-uniapp` 的 `origin/test`；网页目标为 `nexion-frontend-prototype` 的 `H5`。两个目录中的文件不能靠整仓复制。`scripts/app-h5-sync.mjs` 从明确的 Git commit 或暂存树读取受控内容，保留 H5 自身的 `AGENTS.md`。共享内容修改后，同轮同步 H5、验证两端并推送；独立的原生安装、签名、真机心跳仍按平台分别验收。

同步范围包括 `src/`、`scripts/`、`checks/`、`PRD/`、`docs/`、`.githooks/` 和构建所需根文件。网页只允许两项固定覆盖：Vite 开发端口 `5175`、Git 门禁主线 `H5`。`docs/app-h5-source.json` 是 H5 的来源记录，不从 APP 覆盖；文件记录含 Git blob 与 SHA256，新增、删除、缺失和漂移都检查。`.git`、`.claude`、`.codex`、私密环境文件、密钥、依赖和构建产物不会进入范围。声明为公开开发/生产的环境文件也拒绝非空 secret/password/private-key 等设置。

以下示例先暂存本任务范围，再以 `git write-tree` 得到候选树。候选树与工作树必须一致，源端和 H5 的 full verify 都会核对实际共享内容；工具从 Git 对象读取，不把未暂存 WIP 混入网页。

```powershell
$appRoot = 'D:/WORKS/PLAN/nexion-frontend-uniapp'
$h5Root = 'D:/WORKS/PLAN/Nexion-H5'
$candidateTree = git -C $appRoot write-tree
node "$appRoot/scripts/app-h5-sync.mjs" plan --source $appRoot --target $h5Root --ref $candidateTree --out 'D:/WORKS/PLAN/.wt/app-h5-plan.json'
node "$appRoot/scripts/app-h5-sync.mjs" apply --plan 'D:/WORKS/PLAN/.wt/app-h5-plan.json'
node "$appRoot/scripts/app-h5-sync.mjs" check --source $appRoot --target $h5Root
```

`plan` 展示写入和删除；`apply` 拒绝脏目标、目标 HEAD 变化、改写过的计划、符号链接/junction 和越界路径。覆盖文件、删除文件及旧来源记录均先移到目标的 `.trash/app-h5-sync-*`。目标干净是应用前提，不能因有无关 WIP 而强制覆盖。源码 pin 只接受完整 40 位 commit/tree SHA，不接受漂移分支名。

APP 候选 full 验证后正常提交，使用新 commit 重新固定 H5 来源。`repin` 只允许已同步内容完全不变，不要求 H5 无待提交改动；若受控文件漂移则失败，不能把元数据更新当作同步。

```powershell
$sourceCommit = git -C $appRoot rev-parse HEAD
node "$appRoot/scripts/app-h5-sync.mjs" repin --source $appRoot --target $h5Root --ref $sourceCommit
```

随后暂存 H5 本任务内容，完成 H5 候选 full 验证和提交，最终两端干净工作树分别跑 `npm run verify`，再按既有门禁推送指定分支。脚本的候选树来源并不表示该树已提交或已推送。双端提交不能是 Git 原子操作；任何一侧失败须保留证据并报告尚未推送范围。

`npm run sync:h5:check` 是默认强检查：来源快照、源当前工作树和暂存区、目标全量文件内容都必须匹配。`npm run verify` 在起始步骤和结束前复查，避免另一端中途变化后仍出绿记录。APP 自动向父目录寻找 `Nexion-H5`；目标也是隔离 worktree 时，设置 `APP_H5_SYNC_TARGET` 为该目标绝对路径。H5 使用来源记录的源路径，源 checkout 移动后可设置 `APP_H5_SYNC_SOURCE`。显式 `--source/--target` 可核验指定 checkout；APP full 始终以当前 APP 树为源。

独立 CI/checkout 没有源仓时不会默默跳过：checkout 来源记录的 commit 后传 `--source`，默认 check 会重建真实源快照并验证全部 blob。`check --latest` 还校验公开 `test` 最新 commit 与网页 pin，仍要求真实源 checkout；只有远端 SHA 相同不能证明记录中的文件是真源码，缺源对象或无法联网就失败。`--offline` 是显式的缓存来源核对，只证明本地 H5 与记录一致，不证明真实来源或最新状态；full verify 不使用该开关。

full runtime 的隔离 Vite 和 Playwright 测试使用可控 transport/session fixture，不要求活的 Java 服务；这证明前端契约和网页行为，不能证明真实资金、原生安装或后台心跳。真实业务验收另启动 Java 的 dev profile，按当前服务规则核对 API。全站、三语言、亮暗主题、窄屏和刷新交互验收由本轮 runtime 报告记录。
