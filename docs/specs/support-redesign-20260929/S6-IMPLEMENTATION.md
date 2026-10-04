# S6 客户端实施与验收计划

基线：正式 `nexion-frontend-uniapp/test` 的 `44b5ef0ddf4914fb6e5cb1140a997cd67ae36c7c`，本树 detached。业务输入为冻结 S1 契约、S4 实际 Java 路由与 S2 手机终稿。风险为高：权限、私有图片、幂等和双端状态。

## 范围与依赖

1. **接口与状态**：对照真实 App JSON 扩展 `support-api`、领域模型和现有会话 store。验收：文字及图片读回；待分配与唯一当前顾问按服务端字段显示；转绑事件清旧详情且重取。依赖 S3/S4 当前接口快照。
2. **图片与失败恢复**：复用现有 UniApp 上传传输，增加私有授权读取；上传 READY 与消息提交分开。验收：合法 PNG/JPEG，失效、过期、撤权、未知发送结果和同键重试均有出口，无公开图片 URL。依赖步骤 1。
3. **界面与三语**：现有 `/pages/support/messages`、`/pages/support/chat`、线程组件对照手机终稿三种独立状态；保留工单/FAQ 和既有 Nova 门。验收：空、加载、错误、权限、窄屏、键盘与中英越。依赖步骤 1、2。
4. **集成**：API/store 行为测试、`npm run type-check`、本树 full `npm run verify`、H5 真实服务浏览器读写刷新、独立人工操作与安全审查、功能 PRD 同步、最终 commit 后 full verify。APP 实机无设备时记为未验证。依赖全部步骤。

仅修改本树本期客服链及必要上传/私有读取传输、功能 PRD、三语与测试。原树、后台、数据库配置、网站、native 包、其它阶段文件不在范围；不提前推送 `test`。后端会话 `ownerAgentName` 已由 ACTIVE 归属查询，但没有会话时及顾问停用/离线仍需独立本人归属投影；缺失字段交协调会话，不猜端点。
