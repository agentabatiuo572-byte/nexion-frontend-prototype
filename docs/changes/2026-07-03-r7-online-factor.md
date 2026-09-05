# R7: 手机算力在线因子改设备真在线驱动

**状态**：Restored and verified（2026-07-15；type-check、runtime、全量 verify 全绿）  
**规格**：`PRD/Nexion_产品功能架构设计文档_v3.7.md` §6.11（在线收益矩阵）与 §12.2（设备心跳契约）

## Why

旧实现用编译期 `carrier`（从 App 还是 H5 查看）决定在线加成，设备即使没有真在线也可能拿高档系数。R7 改为只读设备级心跳；同一设备从任何端查看都得到同一档位。

## Contract

1. `Device.onlineHeartbeatAt` 是 mock 的设备在线信号；生产由 `POST /api/device/:id/heartbeat`（PRD 当前候选端点）形成服务端在线结论后下推。
2. 心跳在 3 分钟窗口内且不来自未来时，设备进入在线档；无心跳、陈旧心跳或时钟回拨异常均进入基础托管档。
3. App 载体只模拟常驻 agent 写心跳，H5 不写；`hashpower` 和收益结算都不得把载体当系数输入。
4. 结算必须先用旧心跳给本次墙钟差定价，再刷新新心跳供下一拍使用。被杀 App 数小时后重开时，离线时段只能按基础托管档结算。
5. 只有结算前已有新鲜心跳的推进差额才累计在线证明；陈旧重开拍不累计。
6. 多端合并 `onlineHeartbeatAt` 时取最新合法时间，包括首次从空值并发写入的场景；未来时间戳不参与胜出，合法当前心跳可覆盖异常值。

## Implementation surface

- `src/lib/hashpower.ts`：单一在线判定与在线/基础托管双档计算。
- `src/store/app.ts`：旧心跳结算 → 新心跳刷新；在线证明与同一旧心跳对齐。
- `src/store/types.ts`、`src/store/account-cloud.ts`：字段契约与 freshest-wins 合并。
- `src/components/earn/device-card-pc.vue`：展示和收益共用设备在线结论。
- `scripts/r7-device-detail-runtime.mjs`、`scripts/verify.sh`：边界、陈旧重开、首次并发合并和防载体回退门。

## Out of scope

- `carrier` 仍保留为设备登记元数据和 mock 心跳来源，不再驱动系数。
- `onlineBonus` 的基础托管系数与连续在线参数结构不变。
- 生产心跳上报、服务端超时和服务端收益聚合不在本次 mock 恢复范围；候选契约见 PRD §6.11 / §9.11c.1 / §12.2。

## Acceptance

- null / 新鲜 / 恰好超时 / 未来心跳判定正确。
- 新鲜心跳固定时，App/H5 查看不会改变收益档位。
- 陈旧心跳长间隔重开按基础档结算，结算后新心跳仅从下一拍生效。
- 暂停、未激活、退役、重校准或会话失效的手机不刷新并清理旧心跳；非手机收益不受心跳影响。
- 所有用户可见在线标识和数量共用同一在线结论，不出现“在线 + 基础托管”自相矛盾。
- `npm run type-check`、`bash scripts/verify.sh` 和浏览器实景均通过。
