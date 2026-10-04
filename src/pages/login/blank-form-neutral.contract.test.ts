// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 简报 #211 / #213:空白表单首次进入即显示校验错误。
 *
 * 实测(公网 test,Chrome 真页面 + 可访问树):登录页与注册页在**未输入、未聚焦**时,
 * `document.body.innerText` 里就含「Please enter a valid phone number (6+ digits).」。
 *
 * 根因不是样式写错,而是「不该存在的内容被裁起来」:
 *   · 那段文案挂在 `!canPrimary` / `!ctaEnabled` 上,而空表单天然不满足条件,所以从首帧起就在 DOM 里;
 *   · 它带 .lg-sr-only / .rg-sr-only,但 uni-app 会把内容包进内部 <span>;实测外层
 *     `uni-text` 确实被裁成 1×1(样式生效),**内部 span 的布局盒却是 329×20**,
 *     且被 innerText 计入 —— `clip: rect(0,0,0,0)` 只裁定位元素自身,裁不住这个子盒;
 *   · 实测 `clip-path: inset(50%)` 同样无效,只有 `display:none` 能让它从 innerText 消失。
 * 所以按验收要求直接**不渲染**,而不是继续靠样式藏。
 *
 * 验收要求:首次展示保持中性;提交或与字段交互后才展示校验;输入合法号码后错误消失。
 */

const login = readFileSync(new URL("./login.vue", import.meta.url), "utf8");
const register = readFileSync(new URL("../register/register.vue", import.meta.url), "utf8");

describe("blank auth forms stay neutral on first paint", () => {
  it("登录页的 CTA 禁用原因只在交互或提交尝试后才渲染", () => {
    expect(login).toMatch(/const phoneTouched = ref\(false\)/);
    expect(login).toMatch(/const submitAttempted = ref\(false\)/);
    // 渲染条件必须带上交互门,而不是只看 !canPrimary。
    expect(login).toMatch(/v-if="!canPrimary && !loading && \(phoneTouched \|\| submitAttempted\)"/);
    // aria-describedby 必须与渲染条件一致,否则指向不存在的元素。
    expect(login).toMatch(/:aria-describedby="!canPrimary && !loading && \(phoneTouched \|\| submitAttempted\) \? 'lg-cta-reason' : undefined"/);
    // 输入与失焦都要标记交互。
    expect(login).toMatch(/@input="onPhone" @blur="phoneTouched = true"/);
    expect(login).toMatch(/function onPhone\(e: Event\) \{\s*invalidateOtpFlow\(\);\s*phoneTouched\.value = true;/);
    expect(login).toMatch(/function onPrimary\(\) \{\s*submitAttempted\.value = true;/);
  });

  it("注册页同样只在交互或提交尝试后才渲染 CTA 禁用原因", () => {
    expect(register).toMatch(/const phoneTouched = ref\(false\)/);
    expect(register).toMatch(/const submitAttempted = ref\(false\)/);
    expect(register).toMatch(/v-if="!ctaEnabled && !busy && \(phoneTouched \|\| submitAttempted\)"/);
    expect(register).toMatch(/:aria-describedby="!ctaEnabled && !busy && \(phoneTouched \|\| submitAttempted\) \? 'rg-cta-reason' : undefined"/);
    expect(register).toMatch(/@input="onPhone" @blur="phoneTouched = true"/);
    expect(register).toMatch(/function onPhone\(e: Event\) \{\s*invalidateOtpFlow\(\);\s*phoneTouched\.value = true;/);
    expect(register).toMatch(/function onCta\(\) \{\s*submitAttempted\.value = true;/);
  });

  it("空值时手机号提示仍是示例格式,不是错误", () => {
    // 空值走 phoneExampleHint 分支,只有填了非法值才切到 phoneInvalidHint。
    expect(login).toMatch(/phone\.value && !phoneOk\.value\s*\? fmt\(t\.value\.countryCodes\.phoneInvalidHint/);
    // aria-invalid 也要求非空,避免空表单被标成非法。
    expect(login).toMatch(/:aria-invalid="!!phone && !phoneOk"/);
    expect(register).toMatch(/:aria-invalid="!!phone && !phoneOk"/);
  });
});
