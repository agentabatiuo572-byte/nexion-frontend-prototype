# R14 槽位关闭区域实景：临时只读响应代理

READY，两个代理正在监听，留供 A/B 审查；审查结束后按下方命令清理。生产源码、共享脚本、上游设备记录均未修改。未新增激活模型，未接触 5237/5240/5249/5251。

## 入口与归属

已从既有审查报告核实：**A 使用 5254，B 使用 5252**。此前 fixture 说明中 A/B 的编号仅为端口示例；本轮以下映射为准。

| 审查员 | 代理 → 自己上游 | 当前 PID | 面板 | 直接赚取页 |
| --- | --- | --- | --- | --- |
| A 视觉 | 5264 → 5254 | 30824 | http://127.0.0.1:5264/preview | http://127.0.0.1:5264/?nx_device=off#/pages/earn/earn |
| B 行为 | 5262 → 5252 | 30596 | http://127.0.0.1:5262/preview | http://127.0.0.1:5262/?nx_device=off#/pages/earn/earn |

启动前已确认 5262/5264 没有监听。上游现有进程分别为 5254/PID12200、5252/PID21028，本轮没有启停它们。未找到现有仓外可复用代理，因此采用一个约 60 行的 Node 内建 HTTP 代理供两个进程复用，无外部依赖。

## 审查操作

1. 打开自己的 `/preview`；页面下拉选择“赚取”。若已设置好语言/主题，也可直接使用上表赚取页 URL。
2. 面板“预览语言”选择 zh/en/vi；沿现有 `/preview-language` 读取式控制入口切换自己上游的演示语言，不变更设备生命周期记录。
3. 面板“切换明暗”使用代理 origin 独立的 localStorage，点击一次切换并重载；尺寸下拉选择 390×844 或 320×693。该存储与原 5252/5254 及用户服务隔离。
4. 点击赚取页“添加设备”。设备 41 是普通未激活库存，弹出 slot-action-sheet。仅检验打开、关闭按钮、取消/遮罩关闭及相应触区；每次关闭后可重复打开。
5. **绝不点击设备激活/购买。** 代理同时在 HTTP 层拒绝业务写入；只允许 GET/HEAD，以及返回固定模拟会话所必需的 `POST /auth/users/refresh`。其他 POST/PUT/PATCH/DELETE 返回 `405 QA_READ_ONLY`，不转发至上游。未添加任何成功激活响应。

只使用面板的页面、语言、主题和尺寸控件；数据场景切换/重置会被此只读代理拒绝，不能用于这一关闭区域检查。此代理不提供聊天 WS/写入测试能力，本轮也不验该范围。

## 响应改动及验证

仅 `GET /api/devices/earnings` 成功 JSON 中、严格匹配 `id=41 && instanceNo=REVIEW-S1` 的行使用响应副本：

```json
{"status":"INVENTORY","activatedAt":null,"deactivatedAt":null,"pendingDeactivate":false}
```

其余行（包括 42）、ID、版本、产品、收益、槽位数及其他读取响应均保留。只有响应副本改变，不回写上游 state；上游非 200 读取保持原错误，不伪造成功。

实跑 HTTP 检查（两端均通过）：

- 代理 fleet：200，41 为 INVENTORY；与上游完整 JSON 比较，只有上述预期字段改变。
- 前后直接读取上游 fleet 完全一致，41 仍 ACTIVE，42 未变。
- `/preview` 及 App 入口 HTML 与各自上游字节一致；当前入口 `index-CpjEudmG.js`，HTML SHA256 `400d5e0a7194c6aa1286b3b8b0c172aeeceb643d4303cc5e5dfa4d181a57dafe`。
- 对代理发送空体的激活路径请求验证本地拒绝，返回 405，没有进入上游；未执行激活业务。
- 模拟认证刷新正常，仍是现有固定 demo user 900001，无新账号/新 ID。
- Node 语法检查通过。尚未做 slot 浏览器操作，实景结论由 A/B 给出。

## 仓外文件与启动记录

根目录：`D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/r14-slot-readonly-proxy/`

- `server.mjs`：共用代理脚本。
- `instances.json`：精确 node 路径、参数、启动时间、PID、Hidden 方式。
- `verification.json`：两端 HTTP 比对结果及入口指纹。
- `5262.stdout.log` / `5262.stderr.log`、`5264.stdout.log` / `5264.stderr.log`：启动输出。
- `stop.ps1`：只匹配本任务 node 路径、脚本全路径和端口参数后停止记录的 PID，拒绝停止被复用成其他进程的 PID。

实际启动命令结构如下（**已经执行，不要再次启动**）：

```powershell
$qaProxyRoot = 'D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/r14-slot-readonly-proxy'
$qaProxyScript = Join-Path $qaProxyRoot 'server.mjs'
$qaNode = 'C:/Users/FL/.pi/agent/runtime/node/node.exe'
# 启动前 Get-NetTCPConnection 已确认 5262/5264 空闲。
# B：PID 30596
Start-Process -FilePath $qaNode -ArgumentList @($qaProxyScript,'5262','5252') -WorkingDirectory $qaProxyRoot -WindowStyle Hidden -RedirectStandardOutput "$qaProxyRoot/5262.stdout.log" -RedirectStandardError "$qaProxyRoot/5262.stderr.log" -PassThru
# A：PID 30824
Start-Process -FilePath $qaNode -ArgumentList @($qaProxyScript,'5264','5254') -WorkingDirectory $qaProxyRoot -WindowStyle Hidden -RedirectStandardOutput "$qaProxyRoot/5264.stdout.log" -RedirectStandardError "$qaProxyRoot/5264.stderr.log" -PassThru
```

## 审查后清理

当前不能立即停止，否则 A/B 入口失效。两人完成后仅执行本任务清理脚本；它不会停止 5252/5254，也不会删除任何源文件或状态：

```powershell
& 'D:/WORKS/PLAN/.wt/uvel-design-preview/r20-unified-review/r14-slot-readonly-proxy/stop.ps1'
Get-NetTCPConnection -State Listen -LocalPort 5262,5264 -ErrorAction SilentlyContinue
```

单人先完成时可加 `-Ports 5264`（A）或 `-Ports 5262`（B）；清理结果保存 `cleanup.json`。保留仓外脚本、日志和报告作为证据，不做递归删除。当前清理状态：**等待 A/B 实景完成**。
