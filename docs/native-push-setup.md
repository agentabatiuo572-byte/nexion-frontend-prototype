# Android FCM / iOS APNs 系统推送配置

2026-10-30。用户选定保留 DCloud 国际区 `UVELProduction（__UNI__G77FFD9D）`；Android 直接使用 Firebase Messaging，iOS 直接使用 Apple APNs。国际区应用不要求开通 UniPush 或绑定云桥接。站内消息保持独立可用。

## 应用身份与环境

| 环境 | Android applicationId | iOS Bundle ID |
|---|---|---|
| TEST | `ai.uvel.app.test` | `ai.uvel.app.test` |
| 正式 | `ai.uvel.app` | `ai.uvel.app` |

DCloud AppID 与包名/Bundle ID 是不同标识。共享 `src/manifest.json` 的根 AppID 保持为空；实际打包候选按获准的 TEST 身份注入 DCloud AppID、包名、Bundle ID 与签名，检查最终制品。TEST 的 Firebase Android 客户端、Apple identifier、证书/profile 与后端通道应相互匹配；这份步骤不授权生产分发、生产密钥或真实业务发送。

## Android 原生配置

1. 在获准 Firebase 项目为 `ai.uvel.app.test` 添加 Android 应用，下载对应的 `google-services.json`。对照项目号、项目 ID 与精确包名；服务端 FCM HTTP v1 的目标项目必须一致。
2. 使用插件脚本把**公开客户端配置**写入 Android 原生资源：

   ```powershell
   node src/uni_modules/uvel-native-push/configure-android.mjs <安全配置路径/google-services.json> ai.uvel.app.test
   ```

   脚本只接受精确匹配的单个 Firebase Android 客户端，生成 `utssdk/app-android/res/values/uvel-firebase.xml`。Firebase provider 在冷启动/后台时也需要这些资源，不能只在 JS 登录后传入配置。仓库初始空值会保持不可用，不生成示例 Token。配置文件不包含 Firebase 服务账号私钥；服务账号只供后端使用。
3. 用 HBuilderX 5.32 配套 UTS 编译器重新制作包含 `src/uni_modules/uvel-native-push` 的自定义基座/原生包。源码保留 `Barcode`、Android `POST_NOTIFICATIONS` 与 `uvel` scheme，删除旧 Push 模块和对应 SDK 配置。只替换 JS 不能添加原生 Firebase SDK。
4. 设备必须具有可用的 Google Play services，不能仅由品牌/型号或安装了 `com.google.android.gms` 判断可用。先记录插件的实际 GMS 检查、系统版本、包名、签名及 SDK Token 获取结果。Android 13+ 登录后首次请求通知权限；拒绝时撤销安装绑定并停用 SDK，站内消息仍可读取。通知渠道 ID 为 `uvel_notifications`。

## iOS 原生配置

1. 在获准 Apple Developer 团队为 `ai.uvel.app.test` 开启 Push Notifications，使用匹配该 Bundle ID 的签名/profile。后端 APNs topic 必须是该包的实际 Bundle ID；不能填 DCloud AppID。
2. 明确 profile 的 `aps-environment` 后生成插件 entitlement：

   ```powershell
   node src/uni_modules/uvel-native-push/configure-ios.mjs development
   ```

   `development` 对应 APNs sandbox，`production` 对应 APNs production；TEST 包名也可能使用 production profile，以最终签名 entitlement 为准。该脚本选择环境，不创建证书、profile 或私钥。检查签名后的 `.app` 内 entitlement、profile、Bundle ID 与后端 APNs host/topic，不能仅凭源文件确认启用。
3. 新包必须包含 UTS iOS lifecycle hook、原生 `NativePushBridge.swift`、通知中心 delegate 与 `UTS.entitlements`。初始化只读取状态；首次系统授权使用插件 `requestNativePushPermission`，随后从真实系统状态读回。系统回调提供 原生 APNs device token（按偶数长度十六进制传递，最多 4096 字符，不固定系统 Token 长度），不使用旧 CID。
4. APNs `.p8` 私钥、Team ID、Key ID 及环境由后端安全配置管理；私钥不进入客户端、报告、截图或长期记忆。

## 账号、绑定与点击

安装 ID 复用 `getDeviceId()`，必须与当前 APP 会话的 installationId 一致。绑定证明沿用系统随机 UUID 的 SHA256，先持久化并读回，再通过 `X-Push-Binding-Token` 发送。注册接口保持 `PUT /api/me/push-installations/{id}`，`clientId` 现为 SDK 原生 Token，并强制发送 `provider: FCM | APNS`；Android 只允许 FCM，iOS 只允许 APNs。Token 或 provider 改变时重绑，服务端更新投递 epoch，旧 CID 不迁为 Token。

登出、换账号及权限关闭会停止原生 SDK 并撤销当前安装绑定；断网不能伪造撤销成功，后端发送端继续核验原会话与 epoch。权限重新开启后回前台重新读取与注册。旧异步 Token、旧账号目标响应及被登录覆盖的刷新结果均不得继续绑定/导航。SDK 未打入、配置缺失、GMS 不可用或 Token 获取失败显示未开启并保留站内消息，不把系统授权当作已完成推送注册。

载荷只读取 `notificationId`，不读取推送 URL。前台消息刷新站内状态；通知点击（含冷启动和 Android newintent）使用当前会话请求 `/api/me/push-notifications/{id}`，后端核验归属后返回客户端白名单页面。冷启动先恢复登录与业务页面；只读入口包括试用、设备详情、账单、安全、客服 `cid` 及站内消息。JWT 过期复用共享刷新/CAS；退出或换账号会丢弃旧点击。opened 回执失败在下次前台重试，不重复导航。

## 验收分层

客户端单元、类型及 H5/App JS 构建只证明相应源码边界。`uni build -p app` 不等于 Kotlin/Swift 原生编译；原生编译也不等于签名打包、供应商接受或设备通知栏送达。完整结果应分别记录这些层级。

获准 TEST 设备分别执行 Android/iOS 的前台、后台及进程退出三种状态；检查通用锁屏文案、点击目标和 opened 回执，不在证据中保存完整 Token/证明。再测拒绝/系统设置恢复、无 SDK/无配置、Token 轮换、登出、同安装换账号、读取/刷新中换账号、403 和断网恢复。三语言沿用现有系统通知面板。真实发送只面向核实配置后的获准 TEST 设备。

## 官方依据

- [Firebase Android 客户端与 Google Play services 条件](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [Apple APNs 注册与 Token](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)
- [Android 通知权限](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
- [uni-app 原生 newintent 事件](https://uniapp.dcloud.net.cn/tutorial/use-html5plus.html)
