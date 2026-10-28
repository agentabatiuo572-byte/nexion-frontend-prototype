# App 最新 UI 与 UVT 候选整合

来源：干净 detached `9d06e56b` 合并 fetch 后 `origin/test=e4fd6db3`，保留远端 3 提交、174 文件。仅本 App 工作树写入，不推送、不操作 H5、服务器、浏览器或真机。

| 用例 | 操作与预期 | 核验 |
| --- | --- | --- |
| MERGE-01 | 保留最新 UI 布局、滚动、筛选和隐私遮罩；商品/昵称直接显示源值 | 冲突逐项核对、真实组件行为测试 |
| MERGE-02 | UVT 实际资产/兑换方向维持新值；旧协议字段名与历史待处理命令身份保留 | 资产/兑换 API 与恢复测试、合并新增源码差异 |
| MERGE-03 | all/either 仅正最低条件参与，全零无最低条件，售罄仍阻断 | purchase-gate-zero 测试 |
| MERGE-04 | UID/手机号独立、换账号清空、迟到头像请求不污染新账号 | profile identity/API/lifecycle 测试 |
| MERGE-05 | 团队暖目录刷新、失败恢复、隐私、筛选和新积分榜不破坏数据事实 | 团队相关行为测试 |
| MERGE-06 | 合并后类型与 APP 目标可编译 | type-check；全新 `artifacts/native-post-ui` 输出 |

冲突四处：market-board 保留 compact 英文单位及源设备名；live-social-proof 保留新滚动/可见性与源名称；upgrade-spotlight 保留 title class 与源名称；commissions 保留新筛选/隐私且资产参数为 UVT。social-proof 旧品牌归一断言改为直接显示源名称，仍核原商品 key、计数和快照未变。

本轮验证只证明本地源码与合成边界。全库已知失败基线不在修复范围；未执行真实 App/真机验收。H5 同期与最终推送由主任务负责。

结果：38 个定向文件共 911 项通过（首组 22 文件 634 项；补充组 16 文件 277 项，首次 3 项失败后只复跑其 2 文件 22 项）。补充失败均在测试适配：空行情板的新常驻未知提示与旧隐藏断言冲突，以及真实组件新增的 USD/英文词条/隐私/团队说明依赖未注入；已同步夹具和真实预期，未删业务断言或跳过用例。

Vue 类型检查通过；APP 目标 `uni build -p app` 编译通过，输出 `artifacts/native-post-ui/app`，未覆盖既有构建证据。日志位于同目录的 targeted-tests.log、integration-tests.log、fixture-recheck.log、typecheck.log、build.log，不纳入提交。

核对合并后的新增生产源码，没有新增旧 NEX 资产请求、旧兑换方向或名称替换。仍保留 amountNEX/monthNEX 等既有协议字段与历史命令恢复兼容，含义不等同于资产枚举。`brand-copy` 入口保持原值返回。最新 UI 提交的三份 PRD 增量原样保留，并在 UVT 规范记录整合边界。

## 销量弹幕失败恢复补充

独审复现：成功读取 liveActivity 后一次轮询失败清空快照，后续轮询以 liveActivity 存在为条件，因此永久停止恢复。修复时复用已有临时读错误分类；明确 network/HTTP 5xx/429 的暖失败保留当前有效快照，认证/权限/协议错误仍清空。无快照或已有 liveActivity 时可见时钟可重读，同作用域请求进行中不重叠；账号/商品切换仍先清空并拒绝迟到响应。没有新增可见提示或本地事实。

恢复计划：真实组件 setup 执行成功→临时失败→可见恢复；初始失败→离屏不读→可见恢复；认证/权限/协议失败清空；同作用域八个 tick 合并；账号/商品迟到响应隔离；三语源名/滚动/API 边界回归。类型检查与全新 APP 输出 `artifacts/native-post-ui-recovery/app`，不重跑无关 38 套。浏览器/真机仍未验收。

恢复结果：live-social-proof-brand.behavior 24 项（含新增 9 项失败恢复边界）、contract 2 项、storefront-activity-api 6 项，共 32 项通过；最终类型检查退出 0；新 APP 目标编译退出 0。日志保存在 `artifacts/native-post-ui-recovery`，未提交构建产物；独立复验由主任务安排。
