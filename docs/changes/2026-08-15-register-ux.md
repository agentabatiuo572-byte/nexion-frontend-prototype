# 2026-08-15 · 注册/登录可用性 + 注册页 UX 加固（pkg/zm-register-ux）

状态：**Shipped**（已合入主线 47e8f06；PRD §4.1 已同步区号预置/位数校验/奖励护栏/指路文案）（主人 2026-08-15 拍板「B + 1-5」；诊断中补充发现第 0 条为「无法注册」真解，属主人「我无法注册和登录」诉求的直接实现，随包执行）

## 背景与已钉事实（全部实测/回源）

- 主人报障：5173 注册页「暂时无法发送验证码」+「0 美元新人奖励」。
- 环境侧（已修）：`dev:h5` 不带模式时 DEV 默认 sandbox（runtime-config.ts:42），需本地 8110 后端；8110 未启动。已在 `.env.local` 追加 `VITE_NEXGRID_API_MODE=mock`（原文件只有生图 key，无模式行；备份 `.trash/20260815-envlocal/`）；验收启动器 `scripts/start-acceptance-h5.ps1` 用进程环境覆盖 sandbox，不受影响。5173 已以 mock 重启。
- 🔴 但 mock 下发码依旧失败：8 月服务端权威化批次后，auth 全链 server-backed；`runtime.ts:52` mock 模式装 `createMockModeApiClient()`（runtime-client.ts:26-44），对**一切**调用抛 `REMOTE_API_DISABLED_IN_MOCK_MODE`。auth 在 mock 档**没有本地实现**（走查靠存储注入绕过登录 UI）。
- 「$0 奖励」双源：sandbox 断连时 compat 清零哨兵；mock 下 `cfg.config.rewards.welcomeGift.usdtAmount` 同样为 0（mock 配置没喂真值；实际注册礼 = $5 + 20 NEX，PRD §4.3.5）。
- 接缝：`src/api/runtime.ts:72` `export const authApi = createAuthApi(apiClient, sessionVault)` —— 单点装配。
- `AuthApi` 接口 11 方法（auth-api.ts:51-70）：login / sendLoginOtp / completeOtpLogin / sendPasswordResetOtp / completePasswordReset / completeTwoFactor / sendRegistrationOtp / register / restore / discardSessionIfCurrent / discardSessionForIdentity / logout。
- 账号数据自供给：account-cloud 等 store 以 accountKey 为键在本地自初始化（存储注入的走查账号即此机制）——mock auth 只需产出 UserSession + 会话持久，不必造账本。
- 调用点：register.vue:342 `sendRegistrationOtp`、:543 `registerAndLogin(authApi,…)`；login 页同族（实现时 grep `sendLoginOtp|completeOtpLogin` 全站接线）。

## What changes

0. **mock 档本地 auth（真解）**：新建 `src/api/mock-auth-api.ts` 实现完整 `AuthApi` 契约（挑战号本地生成；**任意 6 位验证码通过**——老演示约定，文案仍「输入 6 位验证码」不露 demo；密码登录对本地注册账号校验；session 走同一个 `SessionVault`，restore/logout/discard 语义对齐真实现）；`runtime.ts` 按 `mode==="mock"` 装配。符合「Mock 100% 真后台结构」不变量：接口/契约零改动，随时换回真后端。
1. **$0 奖励永不上屏**：register.vue 奖励句/挂饰 gate 在 `usdtAmount > 0`；并给 `mock/platform-config.ts` 的 `rewards.welcomeGift` 喂真值（$5/20NEX，单一真理源=mock 配置，不在页面写死）。
2. **发码失败指路**：失败提示补下一步——「可先用下方 Google / Apple / Telegram 直接登录,或稍后重试」三语新 key；登录页同改。
3. **DEV 工程横幅**：仅 DEV 构建 + sandbox 模式 + 请求网络级失败时，页顶横幅「Dev build · sandbox API (8110) unreachable — start backend or run mock」（英文工程话，生产剔除，同 "Dev build · mock data" 豁免惯例）。
4. **国家码默认随语言**：vi→+84、zh→+86、ja→+81、ko→+82、ru→+7、pt→+55、de→+49、fr→+33、ar→+966、es/en→+1；仅初始默认，用户改过不覆盖。
5. **按国别位数校验**：上述国别 min-max 位数表 + 通用 6-15 兜底；不合法禁用发送并就地提示（三语 key）。

## Out of scope
- 不动 sandbox/remote 档 auth 行为；不动服务端契约与 D2/风控；社交按钮真实接入（Passkey/Google/…）维持现状（若为死控件另立任务卡）。

## Done-when
1. mock 档：register 页真流程走通——发码→任意 6 位→设密→注册成功落 session；刷新后仍登录态；logout 后 login 页 OTP/密码两路都能重新登入。
2. 注册页副标题在 mock 显示「$5 新人奖励…」（非 0）；把 mock 配置的 welcomeGift 改 0 → 金额句隐藏（gate 生效）。
3. sandbox 模式 + 8110 关闭 + DEV：发码失败时出现工程横幅；production build（或 mock 档）无此横幅代码路径可达。
4. 语言切 vi → 国家码默认 +84（zh→+86）；已手选国家后切语言不被覆盖。
5. +86 输 9 位 → 发送禁用 + 位数提示；输 11 位合法 → 可发送。+84 对应 9-10 位。
6. 门：vue-tsc 0 · verify 全量（残留基线 1 红除外）· anxiety-gate 0（新文案合规）· 三语镜像 · value-ladder · a11y 基线不涨 · orphan 探针（register 路由在扫描面）。
7. 独立 tester 黑盒过 Done-when 1-5。

## 实施拆解
- [x] T0 mock-auth-api + runtime 装配（`src/api/mock-auth-api.ts` 全 11 方法契约对齐 + vault 乐观并发/丢弃语义镜像；`runtime.ts` mode==="mock" 分支装配；tsc 0；5399 实测发码通过并弹出既定滑块验证。⚠️ 滑块抗合成事件——E2E 由 tester 用 playwright 受信鼠标输入完成；login 页接线核留 T6 一并）
  - 补充事实：5173 的「$0 奖励」= 浏览器**持久化的中毒配置快照**（sandbox 时期 compat 清零写入 uni storage；5399 新存储即显示 $5）。T1 因此聚焦「金额 ≤0 不渲染」的消费方护栏，mock 配置本身已带真值无需喂。
- [x] T1 奖励 gate（金额句/邀请卡礼物行 gate `giftUsdt > 0`，else `subtitleNoBonus` 三语；mock 配置本身已带 $5 无需喂——中毒态才是靶）
- [x] T2 失败指路文案（改共用 key `authOtp.errorOtpSendUnavailable` 三语为指路型，register/login 同吃）
- [x] T3 DEV sandbox 横幅（仅 DEV 构建 + sandbox 档发码失败时亮，生产剔除；warning soft 底零 border）
- [x] T4 国家码默认随语言（LOCALE_DIAL 9 语映射，仅初始默认）
- [x] T5 位数校验（DIAL_LEN 10 国别 + 6-15 兜底；hint 就地提示；CTA 既有 phoneOk 闸自动禁用。实测：+86 3 位/10 位提示在、11 位消失）
- [x] T6 门全量 + 实景 + 独立 tester（首轮 5 pass/1 fail + 5 发现 → 修复 F1 步进链回归/F2 mock 密码登录死路/F3 错误码契约 USER_INVALID_CREDENTIALS/F4 区号表补 +84 三语 → 回归复测 R1-R4 全 PASS,含真拖滑块注册→密码登录闭环、错误密码文案精准;console 0）

**独立验收遗留台账（P2,非阻断）**：① N1 同一手机号「注册/OTP 登录」绑目录身份(@demo 账号、走 onboarding)而「密码登录」绑派生身份(user:<id>、直进首页)——mock 档两套账号作用域不互通,收口方向=密码登录成功后按手机号回查目录优先绑定目录身份；② F5 mock authApi 的 OTP/注册方法在 mock 档暂无调用方(register/login 走 legacy 本地链,mock-auth 当前实际可达面=密码登录/改密/restore)——属防御性契约实现,待 legacy 链退役时全面接管；③ F6 发码 60s 冷却按手机号跨场景共享(演示脚本需知)。

**根因终判记录**（诊断三易其稿，最终版）：5173 症状 =「sandbox 默认模式裸奔期写入浏览器的中毒持久状态」（配置清零快照 → $0；发码闸失败态 → 无法发送），清站点存储 + `.env.local` 定死 mock 后 5173 实测复通（$5 + 滑块正常弹出）。register 的 OTP 在 mock 下走 legacy 本地链（`remoteApiEnabled` 分支）,mock-auth-api 主要价值在 login/OTP 登录/改密等无本地分支的 auth 面。
