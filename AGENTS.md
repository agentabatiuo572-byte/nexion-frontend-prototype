# Nexion H5 项目规则

本仓 `H5` 是网页交付线。共享源码来源为正式 APP `nexion-frontend-uniapp` 的 `test`，不是旧原型 `Nexion-uniapp/main`。当前依赖、环境和门链以 `package-lock.json`、`.env.development` / `.env.production`、`.githooks/config.json` 为准；历史 `CLAUDE.md` 中的 mock 开发、旧版本和旧分支声明不能覆盖这些当前契约。功能契约在本仓 `PRD/`，同步操作见 [app-h5-sync.md](docs/app-h5-sync.md)。

## 双端边界

- H5 注册后提示下载 APP；继续浏览返回 H5 首页。连接/算力校准入口在 H5 打开下载引导，校准与手机绑定在 APP 完成。
- H5 只查看 APP/服务端手机状态，不发手机心跳、不执行手机任务、不产生原生安装证明或手机执行授权。浏览器身份和查询参数不能获得原生权限。
- 下载提示、网页下载模式和网页专属退出只进入 H5 编译；APP 界面与原生注册/校准流程不得出现这些网页专属内容。
- 普通硬件购买、账户、消息和资金业务按共享服务端契约运行，不保留旧 mock 作为正式业务入口。

## 持续同步

- APP 共享 UI/业务改动必须同轮同步 H5。用 `scripts/app-h5-sync.mjs plan/apply` 从明确 commit 或暂存候选树读取内容，保留本仓规则；APP 提交后用 `repin` 固定来源。
- `npm run sync:h5:check` 核真实源快照、源当前工作树/暂存区和网页全部受控文件。完整 verify 首尾核对；缺源、缺文件、孤儿文件或内容漂移必须红，离线核对不能替代完整门。
- `docs/app-h5-source.json` 保存来源与逐文件哈希。网页固定覆盖仅为开发端口 `5175`、门禁主线 `H5`。来源路径变化时按同步文档使用 `APP_H5_SYNC_SOURCE`。
- 保留不相关 WIP；覆盖与删除先移入 `.trash/<timestamp>`。不复制密钥、私密环境文件、依赖或构建产物；不强推、不绕过门禁。

## 验证与推送

- 本任务改动暂存后运行 `npm run verify`；pre-commit 核当前 HEAD 与候选暂存树，必须完整通过且运行期间树未变。
- 提交后的干净工作树再次运行 `npm run verify`；pre-push 对 `H5` 强制核被推提交。静态、范围验证和编译成功不能代替完整验证。
- UI/状态改动做来源可识别的真实浏览器操作、立即读回和刷新，覆盖当前全路由、zh/en/vi、亮暗主题、窄屏及双币相关状态。每个改动页面独立检查人工操作友好，复杂任务走 `nexion-audit`，完成前走 `done-review` 六维矩阵和防自欺六问。
- 两端通过对应检查后自动 commit + push 既有 upstream；推送前 fetch 比较并保留远端新增提交。不夹带不相关改动，不以本地提交冒充远端同步。
- Git 身份统一 `fakerli998877-ship-it` / `325914866+fakerli998877-ship-it@users.noreply.github.com`。实际后端/原生设备未跑的部分必须说明，前端 transport fixture 不代表真实手机或资金联调。
