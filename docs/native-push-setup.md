# 第一批 Android / iOS 系统推送配置

2026-10-29。本轮交付客户端代码及配置步骤。UniPush 尚未开通，不代表厂商接受、通知栏送达或双平台实机验收完成。站内消息继续独立可用。

## 开通与打包

1. 在 DCloud 开发者中心为真实应用开通 UniPush 2.0，绑定该应用的 uniCloud 服务空间；使用应用真实 DCloud AppID。仓库 `src/manifest.json` 的 AppID 当前为空，必须通过获准的本地打包配置填写，不生成示例 AppID冒充可用。
2. HBuilderX 的安卓/iOS模块配置保留 Push；UniPush 2.0 勾选离线推送。源码已设 `app-plus.modules.Push`、`distribute.sdkConfigs.push.unipush={version:"2",offline:true}`。只更新 JS 资源不会给既有调试基座补上原生 SDK，需重新制作含 Push 的自定义基座或正式安装包。
3. Android 对应厂商后台配置真实包名、应用签名与推送参数；海外设备按实际需求配置 FCM，国内厂商分别配置。Android 13+ 保留 POST_NOTIFICATIONS 声明，客户端在登录后首次注册申请一次，返回前台读取系统真实开关。拒绝权限不清空站内消息。
4. iOS 使用带 Push Notifications 能力的真实 Bundle ID、匹配 provisioning profile 与 APNs 密钥/证书，并在 DCloud 后台配置相同应用及正确开发/生产环境。源码使用 `pushRegisterMode:"manual"`；登录后的 `uni.getPushClientId` 触发首次授权，再从 `uni.getAppAuthorizeSetting().notificationAuthorized` 读取实际状态。CID 成功不等于允许通知。
5. 按后端仓库 `docs/native-push-setup.md` 配置 uniCloud HTTP 桥接与服务端凭据。密钥仅放云端/获准的安全配置，禁止放前端源码、报告或公共配置。原生 JS 编译通过不代表签名打包或供应商已配置。

构建链若重写 manifest，应保留上述 Push、UniPush2离线、iOS手动授权及 Android 通知权限字段。本仓库构建使用源 manifest；本轮 `uni build -p app-plus` 的输出 manifest 保留这些字段。工作区外的历史发布脚本不属于此结论，正式打包前再次核对实际使用脚本及最终制品。

## 会话与点击

安装 ID 使用现有登录安装标识 `getDeviceId()`，且必须与服务端 APP 会话的 installationId 一致。绑定证明由三个系统密码学随机 UUID 的 SHA256 生成，先读回确认写入应用私有存储，再发送 `X-Push-Binding-Token`；保留至换账号/退出后以支持同安装安全重绑，不写日志。CID 轮换在回前台重新获取；旧 CID 缓存只用于在授权被关闭且 SDK 不再返回 CID 时向后端上报权限。

退出及登录切换先使用旧会话解绑；后续 SDK 回调、目标读取和导航按账号及会话链隔离。断网不能伪造解绑成功，服务端发送端还必须核验原 APP 会话仍有效。被删除/复制的安装数据或 CID 与其他安装冲突时，不绕过绑定证明校验，按后端流程人工重置。

推送载荷只读取 notificationId。点击通过当前会话请求 `/api/me/push-notifications/{id}`；服务端检查归属后返回当前可用的只读页面。客户端白名单限制为试用状态、设备详情、账单、安全、客服聊天与站内消息；客服使用实际页面参数 `cid`。客户端不接受推送中的 URL、不执行支付或设备操作。冷启动在恢复登录及业务页面就绪后才处理点击；其他账号旧通知拒绝后丢弃。opened 回执独立于供应商接受，不等同手机送达。

## 待配置后的实机步骤

- Android 与 iOS 分别安装真实含 Push 模块的新包，复用获准 TEST 账号；核验服务端安装绑定与真实 CID，不在证据中保存完整证明或令牌。
- 每个平台分别测前台、后台、结束进程三种状态；记录通知栏内容、点击目标、opened 回执。桥接发送使用 `force_notification:true`；如平台 SDK 展示行为不同，以实机证据调整，不以 receive 事件代替通知栏验收。
- 拒绝通知后站内消息仍可查看；在偏好设置进入系统通知设置，修改后返回应用，应读回真实权限并更新安装绑定。
- 冷启动点击后恢复原会话；退出再点击、同安装换账号、读取中换账号、旧CID回调、403、断网恢复分别验证不会打开其他账号页面。中文、英文、越南语核验通知与权限设置文案。

## 官方依据

- [UniPush 2.0 开通、原生离线与客户端](https://uniapp.dcloud.net.cn/unipush-v2.html)
- [getPushClientId、onPushMessage 与通知API](https://uniapp.dcloud.net.cn/api/plugins/push.html)
- [iOS pushRegisterMode 手动申请](https://uniapp.dcloud.io/tutorial/app-push-unipush.html)
- [应用授权状态；notificationAuthorized 的 iOS 支持范围](https://uniapp.dcloud.net.cn/api/system/getappauthorizesetting.html)
- [Android 13 通知权限](https://developer.android.com/develop/ui/views/notifications/notification-permission)
