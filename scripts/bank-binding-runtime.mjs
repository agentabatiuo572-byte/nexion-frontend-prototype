import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/** Isolated browser transport fixture; no real SMS, binding, bank, or payment request is sent. */
export async function verifyBankBindingPage(page, gotoProtected) {
  await page.evaluate(async () => {
    const rt = await import("/src/api/runtime.ts");
    const { ApiError } = await import("/src/api/errors.ts");
    const fixture = { beneficiary: null, binds: [], otps: 0, loseResponse: false, loadFails: false, supported: true, routingVerified: true };
    window.__bindingFixture = fixture; window.__bindingRestore = rt.apiClient.request;
    rt.apiClient.request = async request => {
      if (request.path === "/api/withdrawals/bank/config") {
        if (fixture.loadFails) throw new ApiError({kind:"network",message:"FIXTURE_OFFLINE"});
        return {enabled:false,banks:[],bankCodeRequired:!fixture.supported,bindingOtpRequired:fixture.supported ? !!fixture.beneficiary : true,payType:"BANKQR",
          bankSelection:"ACCOUNT_ROUTED",bankRoutingVerified:fixture.routingVerified,beneficiary:fixture.beneficiary};
      }
      if (request.path === "/api/withdrawals/bank/beneficiary/otp") {
        fixture.otps++; if (!fixture.beneficiary) throw new Error("FIRST_BINDING_MUST_NOT_SEND_SMS");
        return {challengeNo:"PAYOUT-BANK-"+"a".repeat(32),expiresInSeconds:300,retryAfterSeconds:60};
      }
      if (request.path === "/api/withdrawals/bank/beneficiary") {
        const replay=fixture.binds.some(call=>call.key===request.idempotencyKey);
        if (fixture.beneficiary && !replay && (request.body.challengeNo!=="PAYOUT-BANK-"+"a".repeat(32) || request.body.code!=="123456")) throw new ApiError({kind:"business",code:422,message:"BANK_CHANGE_OTP_INVALID"});
        fixture.binds.push({body:request.body,key:request.idempotencyKey});
        if ((!fixture.beneficiary && Object.keys(request.body).sort().join(",")!=="account,accountRoutingConfirmed,bankCode,holder") || request.body.account!=="00123456789" || request.body.bankCode!=="" || request.body.accountRoutingConfirmed!==true) throw new Error("BANK_BINDING_FIELD_MAPPING_INVALID");
        fixture.beneficiary = {bankCode:"",bankName:"ACCOUNT_ROUTED",maskedAccount:"****6789",
          bankRoutingVerified:true,canWithdraw:true,effectiveAt:new Date().toISOString(),nextChangeAt:new Date(Date.now()+604800000).toISOString()};
        if(fixture.loseResponse) { fixture.loseResponse=false; throw new ApiError({kind:"network",message:"FIXTURE_LOST_RESPONSE"}); }
        return {beneficiary:fixture.beneficiary};
      }
      throw new ApiError({kind:"network",message:"NO_BACKEND_IN_GATE"});
    };
  });
  const artifact = path.resolve(".verify-cache/bank-binding"); fs.mkdirSync(artifact,{recursive:true});
  // Reproduce native runtime ordering: App hide, page hide, App show, page show.
  const visitSmsApp = async () => {
    await page.evaluate(async () => {
      const app = getApp().$vm.$, current = getCurrentPages().at(-1).$vm.$;
      if (!app.onHide?.length || !current.onHide?.length) throw new Error("LIFECYCLE_HOOKS_MISSING");
      for (const hook of app.onHide) hook();
      for (const hook of current.onHide) hook();
      await new Promise(resolve => setTimeout(resolve, 50));
      for (const hook of app.onShow || []) hook({});
      for (const hook of current.onShow || []) hook();
    });
  };
  try {
    assert.equal((await gotoProtected("/pages/me/wallet-cards")).landed,true);
    await page.waitForURL(url=>url.hash.split("?")[0]==="#/pages/me/wallet-cards-new");
    await page.getByTestId("bank-account-binding").waitFor();
    await page.evaluate(async () => { const theme=(await import("/src/store/theme.ts")).useTheme(); theme.setMode("dark"); });
    const account=page.locator('[data-testid="bank-account"] input'), holder=page.locator('[data-testid="bank-holder"] input');
    const submit=page.getByTestId("bank-bind-continue");
    assert.equal(await page.locator('[data-testid="bank-expiry"], [data-testid="bank-cvv"]').count(),0);
    assert.equal(await submit.getAttribute("aria-disabled"),"true");
    assert.equal(await page.locator('[data-testid="card-simulation-badge"], [data-testid="bank-select"], [data-testid="bank-otp"]').count(),0);
    await account.fill("00123456789"); await holder.fill("NGUYEN VAN A");
    await page.waitForFunction(()=>document.querySelector('[data-testid="bank-bind-continue"]')?.getAttribute("aria-disabled")==="false");
    await page.screenshot({path:path.join(artifact,"bank-form.png"),fullPage:true});
    await page.evaluate(()=>{window.__bindingFixture.loseResponse=true;});
    await submit.press("Enter");
    const confirm=page.getByTestId("bank-bind-confirm"), edit=page.getByTestId("bank-bind-edit");
    await confirm.waitFor();
    assert.equal(await page.getByTestId("bank-review-account").innerText(),"00123456789");
    assert.equal(await page.getByTestId("bank-review-holder").innerText(),"NGUYEN VAN A");
    await page.screenshot({path:path.join(artifact,"bank-review.png"),fullPage:true});
    assert.equal(await page.evaluate(()=>window.__bindingFixture.binds.length),0);
    await edit.press("Enter");
    assert.equal(await page.evaluate(()=>window.__bindingFixture.binds.length),0);
    await submit.press("Enter"); await confirm.press("Enter");
    await page.waitForFunction(()=>window.__bindingFixture.binds.length===1);
    await page.locator(".error-note").waitFor();
    assert.equal(await account.isEditable(),false);
    assert.equal(await page.getByRole("dialog").count(),0);
    await submit.press("Enter");
    await page.getByTestId("bank-bind-saved").waitFor();
    assert.doesNotMatch(await page.getByTestId("bank-account-binding").innerText(), /ACCOUNT_ROUTED|BANKQR/);
    assert.equal(await page.getByTestId("bank-binding-verify").count(),0);
    assert.doesNotMatch(await page.getByTestId("bank-account-binding").innerText(), /24 (hours|小时|giờ)/);
    assert.match(await page.getByTestId("bank-binding-status").innerText(), /Receiving account saved|收款账户已绑定|Đã liên kết tài khoản nhận tiền/i);
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='bank-bind-done');
    const calls=await page.evaluate(()=>window.__bindingFixture.binds);
    assert.equal(calls.length,2); assert.deepEqual(calls[0],calls[1]);
    assert.equal(await account.count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes("00123456789") || JSON.stringify(localStorage).includes("NGUYEN VAN A")),false);
    assert.equal(await page.evaluate(()=>window.__bindingFixture.otps),0);
    // Existing bindings can change immediately, even with a legacy nextChangeAt in the future, after SMS.
    await gotoProtected("/pages/me/wallet"); await gotoProtected("/pages/me/wallet-cards-new");
    await page.locator(".bound-summary").waitFor(); assert.equal(await account.isEditable(),true);
    assert.match(await page.locator(".bound-summary").innerText(), /20\d\d-\d\d-\d\d \d\d:\d\d:\d\d UTC\+7/);
    assert.doesNotMatch(await page.getByTestId("bank-account-binding").innerText(), /7 (days|天|ngày)/);
    await account.fill("00123456789"); await holder.fill("NGUYEN VAN A");
    const otp=page.locator('[data-testid="bank-otp"] input'), send=page.getByTestId("bank-send-otp");
    assert.equal(await submit.getAttribute("aria-disabled"),"true");
    await send.press("Enter"); await page.getByTestId("bank-otp-status").waitFor();
    assert.equal(await send.getAttribute("aria-disabled"),"true");
    await visitSmsApp();
    assert.equal(await account.inputValue(),"00123456789");
    assert.equal(await holder.inputValue(),"NGUYEN VAN A");
    await page.getByTestId("bank-otp-status").waitFor();
    await otp.fill("123456");
    await page.waitForFunction(()=>document.querySelector('[data-testid="bank-bind-continue"]')?.getAttribute("aria-disabled")==="false");
    await page.screenshot({path:path.join(artifact,"bank-change-sms.png"),fullPage:true});
    await page.evaluate(()=>{window.__bindingFixture.loseResponse=true;});
    await submit.press("Enter");
    assert.equal(await page.evaluate(()=>window.__bindingFixture.binds.length),2);
    await confirm.press("Enter"); await page.locator(".error-note").waitFor();
    await visitSmsApp();
    assert.equal(await account.isEditable(),false);
    await submit.press("Enter"); await page.getByTestId("bank-bind-saved").waitFor();
    assert.equal(await page.evaluate(()=>window.__bindingFixture.binds.length),4);
    const replacementCalls=await page.evaluate(()=>window.__bindingFixture.binds.slice(2));
    assert.deepEqual(replacementCalls[0],replacementCalls[1]);
    assert.equal(await page.evaluate(()=>window.__bindingFixture.binds[2].body.code),"123456");
    // An unverified bank route cannot accept recipient details or create a binding.
    await gotoProtected("/pages/me/wallet"); await page.evaluate(()=>{window.__bindingFixture.beneficiary=null;window.__bindingFixture.routingVerified=false;});
    await gotoProtected("/pages/me/wallet-cards-new"); await page.locator(".error-note").waitFor();
    assert.match(await page.locator(".error-note").innerText(),/payout method has not been confirmed|收款方式尚未确认|Phương thức nhận tiền chưa được xác nhận/i);
    assert.equal(await account.isEditable(),false); assert.equal(await holder.isEditable(),false);
    assert.equal(await submit.getAttribute("aria-disabled"),"true");
    await gotoProtected("/pages/me/wallet"); await page.evaluate(()=>{window.__bindingFixture.routingVerified=true;window.__bindingFixture.loadFails=true;});
    await gotoProtected("/pages/me/wallet-cards-new"); await page.locator(".error-note").waitFor();
    assert.equal(await account.isEditable(),false); assert.equal(await holder.isEditable(),false);
    assert.equal(await submit.getAttribute("aria-disabled"),"true");
    await gotoProtected("/pages/me/wallet"); await gotoProtected("/pages/me/wallet-cards-new");
    assert.equal(await account.inputValue(),""); assert.equal(await holder.inputValue(),"");
    assert.equal(await page.evaluate(()=>window.__bindingFixture.otps),1);
    await page.setViewportSize({width:320,height:740});
    assert.equal(await page.evaluate(()=>document.scrollingElement.scrollWidth>document.scrollingElement.clientWidth+1),false);
    console.log("PASS bank binding actual page: no bank selector, first binding without SMS and immediate replacement with SMS, no expiry/CVV collection, same-request recovery, confirmed readback, no 7-day interval, old-server/offline safety and draft cleanup");
  } finally {
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async()=>{const rt=await import("/src/api/runtime.ts");rt.apiClient.request=window.__bindingRestore;delete window.__bindingRestore;delete window.__bindingFixture;});
  }
}
