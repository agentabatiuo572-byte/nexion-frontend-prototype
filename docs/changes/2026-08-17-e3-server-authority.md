# E3 生命周期服务端权威收口

日期：2026-08-17
范围：`D:\workspace\NX1.0-UniApp`

## 结论

- `App store/app.ts` 将 `capacityPct`、`capacityAgeMonths`、`capacitySubsidized`、`capacitySubsidyDays` 和 `serverNow` 原样绑定到远程设备行，并标记 `capacitySource: "server"`。
- 远程生命周期摘要只读取服务端产能与年龄，忽略浏览器时钟和本地曲线；远程字段缺失/null 时 fail-closed，不显示旧账号或本地推导值。
- E3 设备卡的补贴 badge 在远程模式读取服务端布尔值/天数；显式 mock 仍保留本地倒计时模拟。
- 生命周期 banner 会过滤不可用的远程投影；刷新或账号切换产生旧快照时不会回退为本地摘要。
- 远程结算遇到缺失权威投影不做本地生命周期结算。

## TDD 证据

红灯（实现前）：

```text
npx vitest run src/store/device-lifecycle-server-authority.test.ts --reporter=dot
3 failed, 1 passed
```

绿灯：

```text
npx vitest run src/store/device-lifecycle-server-authority.test.ts src/api/device-e3-api.test.ts --reporter=dot
2 files passed, 8 tests passed
```

覆盖：客户端时钟严重偏差、远程字段 null/缺失、显式 mock 保持本地模拟、刷新后新账号投影替换旧账号投影。

## P1 复审修复（2026-08-17）

- `App.vue` 的远程 fleet 启动统一经过 `refreshAuthenticatedRemoteFleet`：sandbox 先等待当前账号 catalog 成功并取得 RunID，失败时保持 fail-closed，下一次 `onShow`/登录重入可重试。
- `complete-sign-in.ts` 增加不依赖 `App.onShow` 的 `refreshRemoteFleetAfterCatalog`；`app.bindAccount` 在 sandbox 不再对已清空的 RunID 发首个 fleet 请求，避免登录完成后永久失败。
- `app.ts` 将 fleet、assignment、Home 和 earnings 先并行读完，再在账号 epoch 与 commerce RunID 都仍有效时一次性提交；同账号 RunID 失效也清空整批投影，避免旧 fleet 残留。
- `device-e3-api.ts` 对 `capacityPct` 强制 `0 <= value <= 100`，超界、负数、NaN/Infinity 统一协议失败。

复审红灯：

```text
npx vitest run src/api/device-e3-api.test.ts --reporter=dot
1 failed, 5 passed（100.0001 未被上界拒绝）
```

复审绿灯：

```text
npx vitest run src/auth/e3-fleet-bootstrap.contract.test.ts src/api/device-e3-api.test.ts \
  src/store/device-lifecycle-server-authority.test.ts src/store/app-task-assignment-scope.test.ts --reporter=dot
4 files passed, 18 tests passed

node --test scripts/e20-device-e3-api-behavior.test.mjs
22 passed, 0 failed

npx vitest run（仓库内 23 个 `*-scope.test.ts` 文件） --reporter=dot
23 files passed, 73 tests passed
```

新增验收契约：`src/auth/e3-fleet-bootstrap.contract.test.ts`；新增行为边界测试位于 `src/api/device-e3-api.test.ts`。

## 现有基线门禁

`npm.cmd run type-check` 仍被工作树既有 `src/api/share-event-api.ts:55` 的 `string | null` 类型错误阻断；本次 E3/bootstrap 文件未出现在错误清单中。

全量 `npx vitest run` 为 117 files passed、3 files failed（5 tests）；失败集中在 `notification-preferences-api.test.ts`、`team-insights-api.test.ts` 和 `preferences-remote-generation.contract.test.ts`，均未涉及本次 E3/bootstrap 文件。针对性 E3/E20/scope 门禁保持全绿。

未执行 reset、checkout、clean、commit 或 push。
