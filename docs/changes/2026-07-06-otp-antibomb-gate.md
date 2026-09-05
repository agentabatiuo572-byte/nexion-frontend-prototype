# Change 提案:OTP 发送闸门(滑块人机验证)+ 验证码生命周期 mock 化

> 状态:**Shipped**(2026-07-06 签字 → 实现 → 审计 P0=P1=0 → PRD 已同步 §4.6.2/§16.2.1/§9.11d.2/§13.3/§14.3)
> 规格:`PRD/specs/FEAT-AUTH01-otp-antibomb-gate.md`(三位一体,spec-lint --strict PASS)
> 原型:`PRD/prototypes/otp-captcha-slider.html`

## Why

主人问「短信接口有没有防轰炸闸门」→ 调查结论:PRD §4.6.2/§16.2.1 已定义闸门(60s 冷却 + 24h ≥3 次触发 CAPTCHA + TTL/输错/一码一),但实现只落地 60s 倒计时;滑块/图形验证零组件;OTP send/verify 在 mock 层无接口形态(纯 setTimeout),违「mock 100% 真后台结构」铁律,且 §9.11d.2 已把 client-only 校验列为批量开号脆弱点。主人拍板:规格+实现全补。

## What changes

- 新 `src/store/auth-otp.ts`:otpSend/captchaVerify/otpVerify 三接口 mock store(24h 滑动窗计数、60s 冷却 API 层双保险、captcha ticket、TTL 300s、attemptsLeft 5、一码一覆盖;Stripe 测试码 000000/999999)。
- 新 `src/components/captcha-slider.vue`:拼图对位滑块弹层(4 态,touch+mouse)。
- 改 `login.vue`/`register.vue`:goSendCode/resend/verifyCode 接 store(登录 OTP/注册/重置三场景)。
- 加 `PlatformConfig.otpGate` 参数组(5 个可配值)+ i18n `authOtp` namespace(en/zh 镜像)+ `__nexionAuthDev` dev 钩子。

**Out of scope**:密码登录锁定计数器(§4.6.2 锁定表,locked 分支仅预留接口形态);后台 K 域配置面板;真短信网关;提现/绑手机等未来场景(组件与 store 可复用,接入时另立任务)。

## Impact

- 页面:login / register(交互流不变,闸门态新增弹层)。
- store:新 auth-otp;config-types + mock/platform-config 加 otpGate 组。
- i18n:新 authOtp namespace(~12 key ×2)。
- PRD 同步点:§4.6.2 / §16.2.1(阈值参数化标注)、§9.11d.2(脆弱点条目状态更新)、§13 关键参数集(otpGate)。
- 不变量风险:i18n 镜像(哨兵护)/ 无硬编码 hex(哨兵护)/ mock backend-replaceable(接口 union 形态)/ walkthrough 断言(改前 grep)。

## Done-when(P6 逐条回测)

1. 同一手机号 24h 窗内第 3 次 send(登录/注册/重置任一场景)必弹滑块;完成滑块 → 自动发送 + 倒计时重启;点 X 取消 → 不发送、SendLog 不增。
2. `__nexionAuthDev.seedSendLog(phone, 2)` 后第 1 次点发送即弹滑块(演示可达,免等 2 分钟)。
3. OTP 输 `000000` 连续 5 次 → 第 5 次返 attempts_exceeded,inline「验证码已失效」,OTP 格清空;重新 send 后新码可验(输任意其它 6 位过)。
4. 输 `999999` → 过期文案引导重发;60s 冷却内绕 UI 调 otpSend → 返 rate_limited 不生成新码。
5. en/zh 切换全部新文案镜像,`verify.sh` i18n 哨兵 0 diff;新文案无「mock/ticket/captcha」等工程词。
6. vue-tsc 0 错 + verify.sh 全绿 + 改动路由 console 0 error;现有 walkthrough 断言不破坏。
