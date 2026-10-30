# 原生通知：FCM / APNs 配置与验收

2026-10-30。需求与最新验收以管理端仓库 `docs/PRD/specs/FEAT-NATIVE-PUSH-BATCH1-20261029.md` 为准。本指南说明当前直连方案，不代表已批准生产启用。

## 身份与环境

- 保留 DCloud 国际应用 `UVELProduction`，DCloud AppID 为 `__UNI__G77FFD9D`；Android 使用 FCM，iOS 使用 APNs，不需要开通 UniPush/UniCloud，不使用旧 CID。
- TEST 与正式共用 Android 包名/iOS Bundle ID `ai.uvel.app`、Firebase 项目 `uvel-test-push` 和获准推送凭据。iOS TEST 使用 TestFlight 分发签名及 **Production APNs**，topic 为 `ai.uvel.app`；开发签名的 Sandbox 包不能冒用该环境。
- 业务 API、数据库、会话、消息队列和启停开关仍按环境独立。构建时明确注入 `VITE_NEXGRID_API_BASE_URL`；共用标识/凭据不提供跨后端令牌互斥，切换环境前需在线撤销旧绑定并退出登录。同包名不能并存，TEST 验收只面向已获准安装。

## 客户端与打包

1. 在隔离构建 stage 注入获准 AppID、包名、签名及版本；共享源码根 AppID 保持空值。保留 `src/manifest.json` 的基础 `Push: {}`、Android/iOS 两端 `pushRegisterMode: "manual"`，不增加 `sdkConfigs.push` 供应商配置。基础 Push 是 iOS 生命周期 Hook 的打包前置，不把直连方案改回 UniPush。
2. 从获准的私有构建配置取得 Firebase **公开客户端** `google-services.json` 路径，核对项目及精确包名，然后在 stage 运行：

   ```sh
   node src/uni_modules/uvel-native-push/configure-android.mjs <公开客户端配置路径> ai.uvel.app
   ```

   该脚本只生成四项公开 Firebase XML 资源，冷启动也需要这些资源；服务账号 JSON 私钥不得进入客户端。Android 保留 minSdk 23、targetSdk 33 或以上、通知权限、渠道 `uvel_notifications`，以及插件声明的 Firebase Messaging / Google Play services base 依赖。设备需有实际可用的 GMS 和网络，不能仅凭品牌判断。
3. 保留插件 `utssdk/app-ios/UTS.entitlements` 的 `aps-environment=production`；如需重新生成，仅在 stage 执行 `node src/uni_modules/uvel-native-push/configure-ios.mjs production`。使用匹配 `ai.uvel.app`、推送能力和 Production 环境的证书/profile；不修改描述文件冒充分发签名。
4. 用真实匹配的 App/UTS 编译器和原生 SDK 重建完整包或自定义基座，本轮验证基线为 **5.33**。不得伪改版本元数据或忽略 Runtime 版本检查。获准 HBuilder CLI 的形式为 `publish app --type appResource --project <stage>`、`pack --config <私有签名JSON路径>`；分平台配置，密码不放命令行。遇到云配额限制停止，不重试或换账号规避。
5. 核对实际生成的 Kotlin/Swift、持续回调 keepAlive、原生 SDK 类/Hook，以及最终包的包名、签名、最低系统、compiler/runtime 版本和 TEST API。iOS 还需核对签名 entitlement/profile；源码或 JS 构建成功不等于原生编译、签名包或手机验收成功。iOS 分发包通过获准 TestFlight 流程安装。

## 服务端配置

由环境配置 owner 从当前获准部署安全配置提供值及**服务进程实际可读路径；容器部署时使用容器内挂载路径**。当前 TEST 使用 systemd，不猜路径、不把私钥复制到仓库或 App。代码要求密钥路径为绝对普通文件，单文件不超过 64 KiB；服务账号文件和 APNs `.p8` 应只允许服务进程读取。`google-services.json` 不能替代 FCM 服务账号文件。

| 公开环境变量名 | 对应属性 / 取值来源 |
|---|---|
| `NATIVE_PUSH_ENABLED` | `native-push.enabled`，供应商发送总开关，默认 false |
| `NATIVE_PUSH_SCHEDULER_ENABLED` | `native-push.scheduler-enabled`，原生派发调度开关，默认 false |
| `NEXION_BUSINESS_NOTIFICATIONS_ENABLED` | `nexion.business-notifications.enabled`，业务事实投影开关，默认 false |
| `NATIVE_PUSH_FCM_PROJECT_ID` | `native-push.fcm.project-id`，本方案为 `uvel-test-push` |
| `NATIVE_PUSH_FCM_SERVICE_ACCOUNT_FILE` | `native-push.fcm.service-account-file`，安全挂载的服务账号 JSON 绝对路径 |
| `NATIVE_PUSH_APNS_TEAM_ID` / `NATIVE_PUSH_APNS_KEY_ID` | `native-push.apns.team-id` / `key-id`，由私有部署配置提供，不在本文记录值 |
| `NATIVE_PUSH_APNS_PRIVATE_KEY_FILE` | `native-push.apns.private-key-file`，安全挂载的 APNs 私钥绝对路径 |
| `NATIVE_PUSH_APNS_TOPIC` | `native-push.apns.topic`，`ai.uvel.app` |
| `NATIVE_PUSH_APNS_ENVIRONMENT` | `native-push.apns.environment`，`production` |

FCM 服务账号所属项目必须与客户端和目标项目一致；APNs 私钥、环境、topic 必须与签名包匹配。健康检查中的 `CONFIGURED` 只证明本地配置可解析，不证明网络、供应商受理或手机送达。

## 首次启用顺序

以下为运维执行步骤，不是默认开生产的指令；先保留开关与数据库回执，确认目标业务环境和获准安装。

1. 核对后端迁移 `20261029_business_notifications.sql`、`20261029_native_push_transport.sql`、`20261030_native_push_direct_providers.sql` 已按流程应用。业务基线与去重事实表必须存在；保留 `nx_business_notification_control` 初始基线，不在重启时重置。
2. **先开业务投影，原生 scheduler 保持关闭。** 让当前环境已满足条件的源事实分批投影为站内消息，排空首次积压并核对事实去重、历史范围与扫描锁错误。未排空或仍有锁冲突时，不进入外部发送阶段。
3. **排空后固定原生初始边界。** 记录当次站内消息 ID 高水位，核对 `nx_native_push_cursor.notification_id`。如迁移已提前建立初值，仅由运维在确认从未启用派发且无有效队列的首次切换事务中校准一次并留证；不得每次启动或扫描推进到新的 `MAX(id)`，不得为了补测回拨边界。
4. 配置与获准安装核对完成后，才按授权启用供应商发送及 native scheduler；先验证单个合法新业务事实，观察站内投影、安装代际、delivery、供应商结果和手机。异常时暂停调度/投影，保留证据，不盲目重放 `UNKNOWN` 或历史消息。

“排空”是一次观测，不保证历史源永远不会晚提交：仍满足业务基线和资格条件的源事实可能在后续扫描才形成新站内消息，随后按固定原生边界、最近 24 小时窗口、绑定/会话和偏好重新评估。不能把初始边界描述为按业务发生时间过滤全部历史，也不能用持续推进游标跳过晚提交。重复扫描由持久事实键和安装/通知唯一键去重。

## 验证与当前边界

先验证 App 会话下的安装 PUT/DELETE、provider/平台匹配、随机绑定证明、权限拒绝与恢复、Token/账号轮换及旧异步响应隔离；不要在日志、截图或报告保存完整 Token、证明或私钥。H5 不注册原生通知。

再分别验证 Android/iOS 前台、后台、进程退出的系统通知与点击；点击通过当前会话读取白名单内部目标，opened 请求还需核对持久化结果。供应商 `ACCEPTED` 不等于手机展示；HTTP 200 也不自动证明 `opened_at` 入库。完整业务验收必须覆盖五类真实事实→站内投影→native delivery→供应商→手机→打开回执，不能用手工夹具替代全链。

截至 2026-10-30 本次更新，双端偏好 UI/系统设置与安装登记已确认；Android UI 使用保留 3003 原生宿主的资源验收副本，不是完整 3004 云包。TEST 已部署后端 408 / `c2e3a0bb`，上述三开关实际为 true；首次排空后原生初始 cursor 由 43810 CAS 为 43889，业务 baseline 未改。获准 iPhone 已收到客服回复 43890 的后台系统通知，但 3004 点击仅打开 App，未进入客服模块，该次没有目标 GET/opened 请求，`opened_at` 仍为空。

点击缺陷 #689 已在 App `c05b12c5` 修复，92 项专项、类型检查及独立复核通过；3005 stage 的真实 5.33 iOS 资源编译通过，生成 Swift 与 3004 基线一致。这些不是已在手机更新的结论。3005 官方云包在 20:14:07 被当日配额拒绝，虽 CLI exit 0，但无成功 ticket/IPA，也未上传 Apple。App 当前没有 `runtime.install` / WGT 热更新执行通道，不能把本地预览 WGT 安装到已有 TestFlight 包；不得将 3005 称为可安装包。

客服导航和 opened 持久化需待新的完整包验证；尚未完成 iOS 三态或五类业务全链实机验收。后续状态以部署回执和 PRD 为准，没有生产启用或生产发布结论。
