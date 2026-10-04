# 手机算力激活失败恢复与奖励门禁

日期：2026-08-17
状态：Implemented，运行态首次用户链路与独立对抗终审均已通过

## 问题与决策

注册成功、校准完成、手机设备绑定、奖励资格是四件不同的事。旧流程把注册时生成的本地 phone 行当成已激活设备；检测或绑定失败只有「重试」，PC 浏览器又可能因服务端只读事务申请行锁而始终失败。最终决策是：注册允许完成，手机奖励必须等待服务端绑定完成；失败页同时提供「重试」和「暂不激活」，设备仓库承担后续恢复入口。

## 状态与不变量

```text
无记录 --校准成功--> CALIBRATED --绑定成功--> ACTIVE
   \--检测失败后暂缓--> DEFERRED(无能力数据、revision 0)
                              \--暂不激活--> DEFERRED
检测失败 / 绑定失败：状态不前移，保留原请求意图供重试
ACTIVE --重新校准开始或暂缓--> 对应手机设备停用，奖励资格立即失效
```

- `ACTIVE` 的必要条件：当前账号/环境的 `nx_onboarding_calibration` 为 ACTIVE，且 `user_device_id` 指向归属当前账号、未停用、非待激活的 MOBILE/PHONE `nx_user_device`；
- 任务完成结算中的回执、钱包余额、钱包流水和收益事件写入都再次复核上述条件，避免「领取后设备失活仍入账」；
- 检测重试复用同一组 `signals` 和校准幂等键；绑定/暂缓重试复用同一 revision 与动作幂等键；
- `DEFERRED` 不影响账号注册完成，但清除 App 已校准标记并停用已绑定手机；
- 检测在首次写入前失败时，`defer` 仍由服务端持久化 revision-0 `DEFERRED`；该记录没有 score/Tier/TOPS/收益率等能力字段，重新检测以 revision 0 进入正常 CAS；
- 服务端确认 `DEFERRED` 后，App 的账号目录、设备会话标记等非权威本地缓存写入失败不能反向改写结果或阻塞进入首页；如果服务端没有确认，则仍失败关闭；
- 校准、激活或暂缓请求返回时必须再次核对账号与运行环境；若等待期间切换了账号，旧账号响应不得写入新账号页面、建立 Sandbox RunID 或继续导航，并立即释放旧页面的忙碌态；
- App 的本地 phone 投影不能授予奖励资格，通用设备开关不能激活手机。

## 接口与存储

| 能力 | 接口 | 权威存储 |
|---|---|---|
| 校准 | `POST /api/onboarding/calibrate` | `nx_onboarding_calibration` |
| 回读 | `GET /api/onboarding/calibrate/result?deviceId=` | 同上，按账号/环境隔离 |
| 激活 | `POST /api/onboarding/calibrate/activate` | 校准 ACTIVE + `nx_user_device` 绑定 |
| 暂缓 | `POST /api/onboarding/calibrate/defer` | 校准 DEFERRED + 手机设备停用 |
| 任务奖励 | task assignment complete / receipt / wallet writes | 同时校验设备与 ACTIVE 校准绑定 |

迁移 `20260817_onboarding_phone_activation.sql` 增加 `user_device_id`、activation 状态与动作幂等字段，并为 `nx_user_device` 补齐 `source_environment/run_id`、索引和 CHECK 约束。生产和 Sandbox 物理按环境/RunID 隔离；Sandbox 只读展示服务端绑定设备，不生成任务或向生产钱包写真实奖励。

## 用户路径

1. 注册后进入「校准你的手机算力」；检测成功后选择激活。
2. 检测或绑定失败时看到「重试」「暂不激活」以及两条明确说明：设备仓库可重新激活；未激活不发相关奖励。
3. 选择暂缓后正常完成注册；设备仓库显示未激活手机卡和「重新校准并激活」。
4. 从设备仓库恢复后，只有服务端返回 ACTIVE 才显示为可接单设备。

## 验收与回退

- 自动门：App 合约/API/类型检查/H5 构建；后端校准、幂等/CAS、环境隔离、设备绑定、领取后失活奖励拦截测试；
- 用户门：H5 首次用户按可见入口完成失败→重试、失败→暂缓→设备仓库恢复路径，并覆盖刷新/重登；
- 运行门：迁移列与约束存在，8110/5173 由正确项目持有，H5 代理可访问真实后端；
- 回退时可隐藏新的恢复入口，但不得恢复本地自动激活或绕过奖励门禁。数据库新增列保持向后兼容，不做破坏性回滚。

## 验收结果

- 后端定向测试：88 项通过，覆盖校准/激活/暂缓 CAS 与幂等、首次检测失败的 revision-0 `DEFERRED`、遗留空关联停用、环境/RunID 隔离、设备投影和奖励写入门禁；
- App：`vue-tsc --noEmit`、H5 `acceptance-h5` 构建通过；校准/设备/任务 API 与 store 定向测试 24 项、失败恢复合约测试 6 项通过；补充的账号作用域与 Sandbox RunID 提交测试 11 项通过；
- 补充回归：严格隔离 Sandbox 不再消耗生产 K1 共享回环 IP 注册配额，生产配额保持不变；本轮后端注册/校准/激活 37 项、前端手机号/暂缓合约 8 项通过；
- H5 首次用户走查通过：首次检测失败可直接暂缓，服务端回读 `DEFERRED + calibrationAvailable=false`；设备仓库恢复后，检测重试复用同一校准幂等键；绑定失败可暂缓且服务端回读 `DEFERRED`；第二次绑定失败复用同一激活幂等键；刷新、重登后服务端回读及仓库均为 `ACTIVE`；目标设备/任务接口除首次结果不存在的预期 404 外均为 2xx，未再请求 Sandbox 任务领取接口；账号切换回归同时证明旧请求不能污染新账号或 Sandbox RunID；
- 运行态：`8110` 为 `D:\workspace\nexion-backend`，`5173` 为 `D:\workspace\NX1.0-UniApp`；H5 首页 200，直连与代理未授权探针均为 401；`nx_user_device` 环境列、索引、两项 CHECK 约束已在 MySQL 生效；
- 证据：`artifacts/phone-activation-e2e/summary.json`、失败/恢复/激活截图和 `trace.zip`；独立终审为后端 100/100、首次用户 99/100、运行态与文档 99/100，P0/P1 均为 0。
