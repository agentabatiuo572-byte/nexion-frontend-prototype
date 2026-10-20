# 三方登录接入

登录及注册页根据后端开放的平台显示 Google、Apple、Telegram。手机号用户在「账号安全 → 第三方账号」验证当前密码完成绑定，后续可直接使用第三方登录。未绑定身份不自动注册，也不按邮箱合并。二次验证码、CAPTCHA、封禁及会话规则沿用现有账号体系。

H5 使用浏览器弹窗接收授权回执；APP 使用系统浏览器和 `uvel://oauth` 回跳。manifest 的 URL scheme 修改需要重新打包安装，不能仅靠热更新完成。绑定时切换浏览器保留当前流程，切账号/页面销毁/10 分钟过期会取消；刷新或杀进程后重新发起。

后端安全配置和开发者应用创建步骤见正式后端 `docs/third-party-login.md`。没有平台凭据时登录页不显示相应按钮，安全页显示暂不可用。当前开发者应用尚未创建，因此真实平台授权与 Android/iOS 真机回跳待配置后验收。

验证命令：

```powershell
npx vitest run src/api/oauth-provider-api.test.ts src/auth/oauth-browser-return.test.ts
node scripts/oauth-provider.h5.e2e.mjs
npm run verify
```

页面脚本自起隔离 Vite，操作真实组件及弹窗，使用明确的网络夹具覆盖三平台、未绑定拒绝、MFA、授权回执、延迟轮询和安全页绑定。它不调用真实供应商、不变更业务账号，不作为真实平台授权证明。完整门禁及 APP/H5 同步仍按仓库规则执行。
