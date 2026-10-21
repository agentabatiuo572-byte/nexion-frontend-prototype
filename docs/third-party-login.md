# 三方登录接入

登录及注册页根据后端开放的平台显示 Google、Apple、Telegram。手机号用户在「账号安全 → 第三方账号」验证当前密码完成绑定，后续可直接使用第三方登录。未绑定身份不自动注册，也不按邮箱合并。二次验证码、CAPTCHA、封禁及会话规则沿用现有账号体系。

H5 使用浏览器弹窗接收授权回执；APP 使用系统浏览器和 `uvel://oauth` 回跳。manifest 的 URL scheme 修改需要重新打包安装，不能仅靠热更新完成。绑定时切换浏览器保留当前流程；页面离开或授权过期只结束界面等待，不代表已提交的操作被撤回。关联结果未知时先读回第三方账号列表。

手机号、OTP、注册与三方登录共用登录尝试记录，签发前冻结安装、执行能力和恢复证明。H5 明确发送 executionSupported=false，使用 cookie 模式；APP 使用真实安装及执行能力。签发请求通过 `X-NexGrid-Installation-Id`、`X-NexGrid-Execution-Supported`、`X-NexGrid-Login-Attempt-Id`、`X-NexGrid-Login-Recovery-Key` 请求头传递；恢复接口的相同上下文放在 JSON 请求体。

响应丢失时禁止另起登录，使用 `/auth/users/login/attempts/{id}/recover` 查询原结果；原路重验也使用原 attempt/proof。收到 MFA/CAPTCHA 后保留同一上下文，错码可重试，挑战可明确取消；尚未确认的签发结果不能通过关闭页面或取消按钮抹除。恢复后的 provider 重验仍调用 provider complete，不转入开发 exchange。明确未绑定的身份返回绑定提示，不自动注册。成功会话及刷新保留服务端 session group/chain/version；已结束的会话不能恢复成新会话。

Android 支持的安全存储保留加密恢复记录，H5 使用当前标签页 sessionStorage，不保存密码、OTP 或 CAPTCHA；不支持原生持久存储的平台仍为内存恢复，不能宣称跨进程恢复已具备。安装发生变化时拒绝发送旧恢复证明。账号关联保持当前已认证会话，不进入登录签发流程。

登录页卸载后收到的重验/恢复成功，只清除该次返回 revision 对应的会话；后来建立的会话不受影响。注册首次提交收到已确认无用户/会话写入的账号已存在、注册 IP 配额或推荐人冲突时结束该尝试，允许用户修正；未分类的 409 仍查询原结果。

H5 丢弃晚到会话时，以捕获的旧 access token 调用 `POST /auth/users/session/discard`，无请求体、不声明 refresh cookie 模式。后端只依据该 Bearer 撤销旧链，忽略浏览器可能携带的共享 cookie，响应不设置或清除 cookie；因此不会退出其他标签页后来登录的账号。此请求不需要 cookie 写锁。原生端仍用捕获的 refresh token 清理，用户主动退出继续使用正常 logout。

注册结果未知后，同一手机号和国家区号可继续查询原结果；改为其他号码或区号的表单不得自动恢复并完成原账号。此时保留原尝试及证明，使用“查询登录结果”进入登录恢复页。其他方式产生的未知登录也不能由注册表单接管。

后端安全配置和开发者应用创建步骤见正式后端 `docs/third-party-login.md`。没有平台凭据时登录页不显示相应按钮，安全页显示暂不可用。真实平台授权、绑定归属及 Android/iOS 回跳须以本轮 TEST 实景和正式安装单独验收，不能用页面夹具代替。

验证命令：

```powershell
npx vitest run src/api/auth-login-attempt.test.ts src/api/oauth-provider-api.test.ts src/pages/login/login-attempt-replay.test.ts src/auth/oauth-browser-return.test.ts
node --test scripts/probe-safety-contract.test.mjs scripts/verify-scope-lib.test.mjs
node scripts/oauth-provider.h5.e2e.mjs
npm run verify
```

本轮上述命令仅在 TEST 执行。页面脚本自起 TEST 隔离 Vite，操作真实组件及弹窗，使用明确的网络夹具覆盖三平台、未绑定拒绝、MFA 错码、丢响应后刷新恢复、授权回执、延迟轮询和安全页绑定。它不调用真实供应商、不变更业务账号，不作为真实平台授权证明。完整门禁及 APP/H5 同步仍按仓库规则执行；该专用页面脚本需在 full 之外明确运行。

TEST 容器资源受限时对完整验证设置 `PROBE_CONCURRENCY=1`：H5 运行时独立探针组逐个执行原有八个探针，全部收尾后汇报失败；不改变探针范围、判据或两道守卫的先后顺序。未设置时仍同时运行八个独立探针。
