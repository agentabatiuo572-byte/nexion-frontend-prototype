# 手机算力平台限制只读核对

结论：**是，当前已提交的正式代码也是这条限制。手机算力采集、校准、激活及运行上报目前只开放给 Android 原生 App；网页预览/H5 和 iOS 没有这条手机执行能力。不是本轮 Online 文案/圆点新增的限制，也不能扩大解释为整个 App 只支持 Android。**

## 版本事实

- APP 工作树：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`。
- HEAD：`e58039e57c9cc5192cc3fe5642b9ecac5564dce9`。
- 开始核对时缓存 `origin/test` 为 `3b4d6dab09b4ae1a1bf0f204efbfdbafdb28f4a3`；`git ls-remote` 发现远端已前进，因此仅执行 `git fetch origin test` 补读远端引用，未 checkout/merge/rebase。
- 核对后的远端 `origin/test`：`6ede221d855a7d704b9e5e530a35ec2b1c0d90bd`。
- `devices.vue`、平台判断、引导函数、设备采集文件没有本地未提交变更。中文翻译文件本地 WIP 只有此前授权的 `earn.online: "Online"`；手机引导字段未变。
- HEAD 与最新 `origin/test` 的 `devices.vue` 差异仅是库存读取失败重试区的样式类；平台 guard、校准引导路径相同。`phone-activation-guidance.ts`、`native-phone-runtime.ts`、`device-signals.ts`、`native-phone-gpu.ts` 相同。两版本中文手机引导字段也相同。

## 文件与行号（相对 APP 根目录，当前工作树）

| 文件位置 | 已核事实 |
| --- | --- |
| `src/i18n/messages/zh.ts:1964`、`:1965` | 原文即“手机算力仅支持 Android”“请登录 Android App，完成校准和激活。”HEAD 与 origin/test 均已有。 |
| `src/pages/me/devices.vue:162`、`:168`、`:169` | 设备仓库在 `phoneNeedsActivation` 时显示 `phoneActivationGuidance.title/body`。 |
| `src/pages/me/devices.vue:271` | 需要引导的条件：存在激活待确认手机，或没有已激活手机，或远端绑定失效，或当前账号/安装未校准。不是所有设备都被判不支持。 |
| `src/pages/me/devices.vue:233`、`:234` | `nativePhoneAvailable = hasNativeAndroidPhoneRuntime()`，再调用引导解析函数。 |
| `src/pages/me/devices.vue:172`、`:455` | 只有原生 Android 才展示校准按钮；`goPhoneActivation()` 内也有 guard，其他平台不会跳转校准入口。 |
| `src/lib/phone-activation-guidance.ts:8` | H5 编译分支直接使用 App-only 标题/正文；非 H5 才按 `nativeAvailable` 返回激活说明或“手机校准暂不可用”。所以 iOS 原生端不应被描述为一定显示与 H5 完全相同的标题。 |
| `src/lib/native-phone-runtime.ts:9` | 只有 APP-PLUS 且 `plus.os?.name === "Android"` 返回 true；其他构建/平台返回 false。不是通过浏览器机型或 viewport 判断。 |
| `src/lib/device-signals.ts:5`、`:9`–`:29` | 非 Android 原生先返回未知信号；Android 通过 `plus.android` 读取 `android.os.Build`、ActivityManager 内存、Java CPU 核数。没有对应 iOS 手机校准采集分支。 |
| `src/lib/native-phone-runtime.ts:17`、`:60`、`:67` | BatteryManager 原生读取只实现 Android；运行信息必须取得真实电池及有效网络观察，缺失返回 null，不伪造心跳。iOS 不会进入 Android 电池采集。 |
| `src/lib/native-phone-gpu.ts:4` | WebView WebGL GPU 观察只是信号采集辅助手段，不能因此认定 iOS 已获得校准/激活/运行能力。 |
| `src/pages/onboarding/connect.vue:257`、`:378` | 校准及激活动作本身继续检查 `nativePhoneAvailable`，不只是设备仓库隐藏按钮。 |
| `src/pages/onboarding/estimator.vue:194` | 校准加载入口也先检查 `nativePhoneAvailable`。 |
| `src/store/app.ts:811`、`:815`–`:823` | 手机运行同步调用原生信号采集；没有信号时跳过上报。源码明确 H5/iOS 无此桥，维持只读刷新。 |

## 历史产品依据

- `docs/phone-calibration-requirements.md:19`：明确 Android 原生采集；H5/iOS 先守卫，不采集、校准、激活或上报手机运行状态。
- `docs/phone-calibration-handoff.md:3`、`:5`：实施目标是正式 Android APP/test，明确 H5/iOS 不开启手机任务；模拟桥接或浏览器验证不能称真机验收。
- `PRD/NexGrid_产品功能架构设计文档_v3.7.md:1243`–`:1253`（§6.11）：2026-10-03 取消的是 AndroidKeyStore/挑战/证书等旧证明方案，**保留 Android 原生采集及 H5/iOS 不执行手机任务的边界**；旧 attestation 方案标记 superseded，不能误读为平台限制已取消。
- 同 PRD 中的 iOS 外壳、iOS 风布局描述属于 UI 规范，不是 iOS 手机算力能力实现依据。仓库存在通用 iOS 工具桥也不能据此推断手机算力已实现。

## 可直接向用户解释

“是，正式代码目前也是这个规则。5237 以网页预览运行时没有 Android 原生采集能力，所以显示登录 Android App 校准激活的提示。当前手机算力链路只实现了 Android，iOS 和网页还没有这项能力；这不代表整个 App 的其他功能只支持 Android。此次统一 Online 文案没有改变平台限制。”

## 未覆盖与操作范围

本次只读核对源码、提交及历史契约，未连接 5237 查看当前实际构建、未真机验证 Android/iOS、未证明任何已部署包版本。对 5237 的原因解释来自其网页预览运行方式与正式 H5 分支的对应关系。没有修改生产文件、文案、平台限制、模块或 Online 已完成改动；仅写此仓外报告。未构建、提交、推送或同步 H5。

## 后续授权文案收窄记录（2026-10-27）

以上只读结果及旧文案保留为核对历史。用户后续授权仅收窄三语 `phoneActivationAppOnlyTitle/Body`，当前本地 WIP 的这六个字段已更新如下；不代表已提交或部署：

| 文件 | Title | Body |
| --- | --- | --- |
| `src/i18n/messages/zh.ts:1964` | 手机本机算力 | 请在 Android App 完成校准、激活和运行。 |
| `src/i18n/messages/en.ts:1983` | On-device phone compute | Calibrate, activate and run phone compute in the Android App. |
| `src/i18n/messages/vi.ts:1966` | Tính toán ngay trên điện thoại | Hiệu chuẩn, kích hoạt và chạy tác vụ tính toán trên điện thoại trong ứng dụng Android. |

本次只编辑上述三份语言文件的两个指定 key，保留此前 `earn.online` 及其他既有 WIP；没有修改平台 guard、能力实现、其他引导字段或测试源码。

实跑命令：`node node_modules/vitest/vitest.mjs run src/lib/phone-activation-guidance.test.ts --reporter=dot --silent`。**1 文件、9 例通过**，覆盖三语在真实 UniApp 预处理下的 H5、Android 原生和不支持的 iOS 原生分支。日志：`D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/platform-guidance-copy-tests.log`。

未构建、未操作服务、未提交/推送、未同步 H5；文案实景待主线程后续构建验收。平台限制与先前源码核对结论保持不变。
