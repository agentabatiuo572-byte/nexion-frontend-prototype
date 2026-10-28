# R13 设备 Online 文案与绿色圆点

状态：READY，定向源码/行为测试完成；未构建、未浏览器或真机验收。未提交、推送、同步 H5，未操作预览服务。

- APP：`D:/WORKS/PLAN/.wt/uvel-design-20261025-app`
- 基线：`e58039e57c9cc5192cc3fe5642b9ecac5564dce9`
- 本轮仅增量修改以下设备展示与现有测试，保留父线程字号、试用行按钮等既有 WIP。未修改 handlers、聊天状态或网络状态。

## 本轮修改文件

生产文件（均相对 APP 根目录）：

1. `src/components/earn/device-card-pc.vue`：PC/phone 卡片状态、详情管理标题及统计状态共用现有状态优先级；仅 Online 状态加 7px `--v5-success` 绿色圆点。暂停、重连、未接单、待停用、未绑定不加在线圆点。服务器设备以 `runtimeStatus` 显示在线/离线/未知，避免旧本地 `status=online` 覆盖服务器 `OFFLINE`。详情统计也尊重暂停等状态，不再单独将 `runtimeStatus=ONLINE` 显示为 Online。
2. `src/components/me/device-inventory-row.vue`：复用 `deviceOnlineState` 的三态结果，已激活且已确认在线才加圆点；未激活、激活待确认及运行状态待确认不加。已确认在线但待停用时仍保留原有 `Online · 待停用` 语义。
3. `src/components/trial-device-row.vue`：home/earn/inventory 三种形态在 `presentationReady && status=active` 时显示 Online 与圆点。grace 保留 Offline，读取失败保留未知；保留已确认刷新快照的原有展示规则。
4. `src/i18n/messages/zh.ts`：仅 `earn.online` 改为 `Online`。
5. `src/i18n/messages/vi.ts`：仅 `earn.online` 改为 `Online`。英文原值已是 `Online`，无需改动。

现有测试文件：

- `src/components/earn/device-card-scroll-longpress.behavior.test.ts`
- `src/components/me/device-inventory-row.behavior.test.ts`
- `src/components/trial-device-row.behavior.test.ts`
- `src/pages/earn/device-detail-capacity-explainer.behavior.test.ts`

## 消费者核对

`rg` 枚举的生产 `earn.online` 消费者只有以下四个组件；详情页间接复用收益卡。

| 消费者 | 状态来源与本轮处理 |
| --- | --- |
| `components/earn/device-card-pc.vue` | 本地 phone 沿原心跳判定；服务器设备沿 runtime；任务暂停/重连等优先。卡片、详情管理区及统计区一起覆盖。 |
| `components/home/device-row.vue` | 原有 `deviceOnlineState(device, Date.now(), runtimeConfirmed)` 与绿色/灰色 dot 保留；本轮未编辑该文件，文案随 `earn.online` 更新。 |
| `components/me/device-inventory-row.vue` | 原有激活状态、三态 runtime 与待停用后缀保留，补在线圆点。 |
| `components/trial-device-row.vue` | 沿 `useTrialPresentation` 的已确认 active/grace/未知展示规则，补在线圆点。 |
| `pages/earn/device-detail.vue` | 使用 `DeviceCardPC`，本轮未编辑页面源码。管理区和当前状态统计已由组件更新并以真实模板测试覆盖。 |

圆点使用组件内空内容 `::before`，不增加状态朗读文字、不增加独立交互、不改字号和点击区域。颜色沿已有主题 `--v5-success`，与首页圆点一致。

## 实跑验证

在 APP 根目录执行：

```text
node node_modules/vitest/vitest.mjs run src/components/me/device-inventory-row.behavior.test.ts src/components/trial-device-row.behavior.test.ts src/components/earn/device-card-scroll-longpress.behavior.test.ts src/pages/earn/device-detail-capacity-explainer.behavior.test.ts --reporter=dot --silent
```

最终结果：**4 文件，72 例通过，0 失败**。这是包含既有回归的总数，不是新增 72 例。新增 3 个语言参数化卡片用例，同时增强已有库存、试用、详情用例。

覆盖：中英越字面 `Online`；PC/phone 在线→离线→未知→恢复；旧本地 online 不覆盖服务器 OFFLINE；phone 重连/任务暂停/未接单/待停用不显示在线圆点；库存确认状态与未激活状态；试用 grace/读取失败；详情管理区和统计区一致。保留原有长按、导航、展开、动作等回归。

- 最终日志：`D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/device-online-r13-green.log`
- 首轮日志：`D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/device-online-r13-tests.log`。该轮 69 绿/3 红来自新增卡片用例误查仅详情页渲染的统计节点；已将断言分别放在卡片与现有详情页测试中，未为此更改生产行为。
- 本轮文件 `git diff --check` 通过。

## 验收边界

- 未构建、未运行浏览器/真机；圆点的最终像素、窄屏折行留主线程当前包验收，不能将上述行为测试当成视觉签核。
- 试用行的 Online 仍是原有“已确认 active 试用”展示语义；现有 trial presentation 没有独立设备心跳，不新增或伪造心跳数据。
- 未改变后台/runtime 合同、收益判定、任务状态、聊天/网络在线翻译、用户 state、服务和 H5 工作树。
