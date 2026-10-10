import assert from "node:assert/strict";
import fs from "node:fs";

/** Runs only inside the existing isolated withdrawal browser harness. No live payment endpoint is contacted. */
export async function verifyBankWithdrawalPage(page, gotoProtected) {
  await page.evaluate(async () => {
    const rt = await import("/src/api/runtime.ts");
    const { ApiError } = await import("/src/api/errors.ts");
    const app = (await import("/src/store/app.ts")).useApp();
    const quote = { quoteNo: `BQ-${"a".repeat(32)}`, amountUsdt: 100, feeUsdt: 1, netUsdt: 99, rateVnd: 25000,
      amountVnd: 2475000, bankCode: "", bankName: "ACCOUNT_ROUTED", maskedAccount: "******6789", expiresAt: new Date(Date.now()+300000).toISOString() };
    const fixture = { status: "SENT", providerState: "PENDING", submits: 0, abandons: 0, quotes: 0, verifies: 0, enabled: true,
      bankRoutingVerified: false,
      intent: null, settlementEvidence: null, canWithdraw: true, quote,
      policy: {version:1,minAmountUsd:20,maxAmountUsd:5000,feeRatePct:1,feeMinUsd:1,feeMaxUsd:25},
      capacity: {maxWithdrawableUsdt:100,dailyRemainingCount:2,dailyLimitCount:2,dailyCountResetAt:"2026-10-01T00:00:00Z",withdrawalEnabled:true},
      key: `nexgrid.bank-withdraw.pending:${app.accountKey}` };
    window.__bankFixture = fixture;
    window.__bankRestore = rt.apiClient.request;
    const receipt = () => ({ state: "COMMITTED", withdrawalNo: "WD-BANKTEST123", providerState: fixture.providerState,
      withdrawal: { withdrawalNo: "WD-BANKTEST123", chain: "BANK-VND", status: fixture.status }, bank: quote, settlementEvidence: fixture.settlementEvidence });
    const beneficiary = () => ({ bankCode:"",bankName:"ACCOUNT_ROUTED",bankRoutingVerified:fixture.bankRoutingVerified,maskedAccount:"******6789",effectiveAt:"2026-09-01T00:00:00Z",nextChangeAt:"2026-09-08T00:00:00Z",
      canWithdraw:fixture.canWithdraw });
    rt.apiClient.request = async request => {
      if (request.path === "/api/app/profile/language") return {language:request.body.language};
      if (request.path.startsWith("/api/legal/terms/current?")) {
        const locale = new URL(request.path, location.origin).searchParams.get("locale");
        return { source:"server",sourceEnvironment:"PRODUCTION",runId:"",requestedLocale:locale,resolvedLocale:locale,
          requestedJurisdiction:"GLOBAL",resolvedJurisdiction:"GLOBAL",provenance:"exact",version:"v1",effectiveAt:"2026-09-01T00:00:00Z",
          title:"Fixture terms",summary:"Fixture terms",sections:[{key:"terms",title:"Terms",body:"Isolated runtime fixture",sortOrder:1}],
          acknowledged:true,acknowledgedAt:"2026-09-01T00:00:00Z" };
      }
      if (request.path === "/api/withdrawals/bank/config") {
        if (fixture.configUnavailable) throw new ApiError({kind:"network",message:"FIXTURE_CONFIG_UNAVAILABLE",retryable:true});
        return { enabled: fixture.enabled, bankSelection:"ACCOUNT_ROUTED", bankRoutingVerified:fixture.bankRoutingVerified, bankNameSource:"NONE", banks: [], beneficiary: fixture.unbound ? null : beneficiary(), unresolvedIntent: fixture.intent, policy:fixture.policy, capacity:fixture.capacity };
      }
      if (request.path === "/api/withdrawals/bank/beneficiary/verify") { fixture.verifies++; return { beneficiary:beneficiary() }; }
      if (request.path === "/api/withdrawals/bank/quotes") {
        if (request.body.amountUsdt === "5") throw new ApiError({kind:"business",message:"BANK_AMOUNT_OUT_OF_RANGE"});
        assertAmount(request.body.amountUsdt); fixture.quotes++;
        fixture.intent={state:"NOT_SUBMITTED",quoteNo:quote.quoteNo,withdrawalNo:null,intents:[{state:"NOT_SUBMITTED",quoteNo:quote.quoteNo,withdrawalNo:null,expiresAt:quote.expiresAt,providerState:null}]};
        return {...quote,bankRoutingVerified:fixture.bankRoutingVerified};
      }
      if (request.path === "/api/withdrawals/bank/orders") {
        fixture.submits++;
        if (request.idempotencyKey !== `bank-submit:${quote.quoteNo}` || uni.getStorageSync(fixture.key) !== quote.quoteNo) throw new Error("BANK_RECOVERY_REFERENCE_NOT_DURABLE");
        fixture.intent={state:"COMMITTED",quoteNo:quote.quoteNo,withdrawalNo:"WD-BANKTEST123",intents:[{state:"COMMITTED",quoteNo:quote.quoteNo,withdrawalNo:"WD-BANKTEST123",expiresAt:quote.expiresAt,providerState:"PENDING"}]};
        throw new ApiError({kind:"network",message:"FIXTURE_RESPONSE_LOST",retryable:true});
      }
      if (request.path === `/api/withdrawals/bank/quotes/${quote.quoteNo}/abandon`) { fixture.abandons++; fixture.intent=null; return {state:"ABANDONED"}; }
      if (request.path === `/api/withdrawals/bank/quotes/${quote.quoteNo}`) return fixture.intent?.state==="NOT_SUBMITTED" ? {state:"NOT_SUBMITTED",quote} : receipt();
      if (request.path === "/api/withdrawals/bank/orders/WD-BANKTEST123") return receipt();
      throw new ApiError({kind:"network",message:"NO_BACKEND_IN_GATE",retryable:true});
    };
    // Earlier financial cases deliberately had no legal endpoint. Give real navigation a parsed acknowledged snapshot.
    const locale = (await import("/src/store/locale.ts")).useLocaleStore().code;
    (await import("/src/lib/legal-terms-gate-runtime.ts")).recordLegalTermsAcknowledged(await rt.legalTermsApi.current(locale,"GLOBAL",true),locale);
    function assertAmount(amount) { if (amount !== "100") throw new Error("BANK_AMOUNT_INPUT_NOT_WIRED"); }
  });
  fs.mkdirSync(".verify-cache/bank-withdrawal",{recursive:true});
  try {
    // A closed channel without a prior request is availability, not an order to refresh.
    await page.evaluate(() => { window.__bankFixture.enabled=false; });
    await gotoProtected("/pages/me/wallet-withdraw-method");
    await page.waitForFunction(() => document.querySelector('[data-testid="withdraw-method-usdt"]')?.getAttribute("aria-disabled")==="false");
    assert.equal(await page.getByTestId("withdraw-method-bank").getAttribute("aria-disabled"),"true");
    await page.getByTestId("withdraw-method-bank").press("Enter");
    await page.getByTestId("withdraw-method-bank").click({force:true});
    assert.match(page.url(),/wallet-withdraw-method/);
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    await page.getByTestId("bank-account-status").waitFor();
    assert.equal(await page.getByTestId("bank-refresh").count(),0,"no order or read failure must not show an order-refresh action");
    assert.equal(await page.getByTestId("bank-continue").getAttribute("aria-disabled"),"true");
    await page.evaluate(() => { window.__bankFixture.configUnavailable=true; });
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    assert.match(await page.getByTestId("bank-refresh").innerText(),/^(Reload|重新加载|Tải lại)$/);
    await page.evaluate(() => { Object.assign(window.__bankFixture,{enabled:true,configUnavailable:false}); });
    await page.getByTestId("bank-refresh").click();
    await page.getByTestId("bank-refresh").waitFor({state:"hidden"});
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    assert.equal(await page.getByTestId("bank-continue").getAttribute("aria-disabled"),"true","account routing still needs an explicit server contract");
    assert.equal(await page.getByTestId("bank-max").count(),0);
    assert.match(await page.locator(".bank-withdraw").innerText(),/收款方式尚未确认|payout method has not been confirmed|Phương thức nhận tiền chưa được xác nhận/i);
    await page.evaluate(() => { window.__bankFixture.bankRoutingVerified=true; window.__bankFixture.quote.bankRoutingVerified=true; });
    assert.equal((await gotoProtected("/pages/me/wallet-withdraw-method")).landed,true);
    await page.waitForFunction(() => document.querySelector('[data-testid="withdraw-method-bank"]')?.getAttribute("aria-disabled")==="false");
    await page.screenshot({path:".verify-cache/bank-withdrawal/method.png",fullPage:true});
    await page.getByTestId("withdraw-method-bank").press("Enter");
    await page.waitForURL(url => url.hash.split("?")[0] === "#/pages/me/wallet-withdraw-bank");
    await page.getByTestId("bank-continue").press("Enter");
    assert.doesNotMatch(await page.locator(".bank-withdraw").innerText(), /ACCOUNT_ROUTED|BANKQR/);
    assert.equal(await page.getByRole("combobox").count(),0,"no prototype scenario selector in the app");
    await page.getByTestId("bank-max").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bank-amount"] input')?.value === "100");
    assert.match(await page.getByTestId("bank-single-limit").innerText(),/5[,.]000/);
    await page.locator('[data-testid="bank-amount"] input').fill("5");
    await page.locator('[data-testid="bank-quote"]').press("Enter");
    assert.equal(await page.getByTestId("bank-quote").getAttribute("aria-disabled"),"true");
    assert.equal(await page.evaluate(()=>window.__bankFixture.quotes),0,"out-of-range amounts never request a quote");
    assert.equal(await page.locator('[data-testid="bank-amount"] input').isEditable(),true,"a definitive amount rejection must preserve editable input");
    await page.locator('[data-testid="bank-amount"] input').fill("100");
    await page.locator('[data-testid="bank-quote"]').click();
    await page.locator('[data-testid="bank-submit"]').waitFor();
    assert.match(await page.locator(".bank-withdraw").innerText(),/2[,.]475[,.]000/);
    assert.equal(await page.getByTestId("bank-submit").getAttribute("aria-disabled"),"true");
    await page.getByTestId("bank-submit").press("Enter");
    assert.equal(await page.evaluate(()=>window.__bankFixture.submits),0,"confirmation is required");
    await page.getByTestId("bank-consent").press("Space");
    await page.locator('[data-testid="bank-submit"]').click();
    await page.waitForFunction(() => window.__bankFixture.submits === 1);
    // Uncertain submissions hide the form entirely; only readback / abandon remain available.
    await page.locator('[data-testid="bank-submit"]').waitFor({state:"hidden"});
    const pending = await page.evaluate(() => uni.getStorageSync(window.__bankFixture.key));
    assert.equal(pending,`BQ-${"a".repeat(32)}`);
    // A new device has no local quote reference; the server still restores the original order even while the channel is closed.
    await page.evaluate(() => { uni.removeStorageSync(window.__bankFixture.key); window.__bankFixture.enabled=false; });
    await gotoProtected("/pages/me/wallet-withdraw-method");
    assert.equal(await page.getByTestId("withdraw-method-usdt").getAttribute("aria-disabled"),"true");
    await page.getByTestId("withdraw-method-usdt").press("Enter");
    assert.match(page.url(),/wallet-withdraw-method/);
    await page.getByTestId("withdraw-method-bank").press("Enter");
    await page.locator('[data-testid="bank-order-status"]').waitFor();
    assert.equal(await page.getByTestId("bank-order-status").getAttribute("role"),"status");
    assert.equal(await page.getByTestId("bank-order-status").getAttribute("aria-live"),"polite");
    assert.match(await page.locator('[data-testid="bank-order-status"]').innerText(),/processing|处理中|đang/i);
    assert.equal(await page.locator('[data-testid="bank-new"]').count(),0);
    assert.equal(await page.evaluate(() => window.__bankFixture.submits),1);
    await page.evaluate(() => { window.__bankFixture.status="CONFIRMED";window.__bankFixture.providerState="PAID"; });
    await page.locator('[data-testid="bank-refresh"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bank-refresh"]')?.getAttribute("aria-disabled")==="false");
    assert.equal(await page.locator('[data-testid="bank-new"]').count(),0,"a status without settlement evidence must not release a new withdrawal");
    await page.evaluate(() => { window.__bankFixture.configUnavailable=true; window.__bankFixture.settlementEvidence={status:"paid",checkedAt:"invalid"}; });
    await page.locator('[data-testid="bank-refresh"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bank-refresh"]')?.getAttribute("aria-disabled")==="false");
    assert.equal(await page.locator('[data-testid="bank-order-status"]').count(),1,"known-order recovery must survive unavailable new-withdrawal config");
    assert.equal(await page.locator('[data-testid="bank-new"]').count(),0);
    await page.evaluate(() => { window.__bankFixture.configUnavailable=false; window.__bankFixture.settlementEvidence=null; });
    await page.evaluate(() => {
      Object.assign(window.__bankFixture,{enabled:true,intent:null,settlementEvidence:{status:"paid",evidenceRef:"payout-ledger",providerOrderId:"provider-order",providerStatus:3,checkedAt:new Date().toISOString(),amountUsdt:100}});
    });
    await page.locator('[data-testid="bank-refresh"]').click();
    await page.locator('[data-testid="bank-new"]').waitFor();
    await page.locator('[data-testid="bank-new"]').click();
    await page.getByTestId("bank-continue").click();
    await page.locator('[data-testid="bank-amount"] input').fill("100");
    await page.locator('[data-testid="bank-quote"]').click();
    await page.locator('[data-testid="bank-abandon"]').click();
    await page.locator('[data-testid="bank-amount"] input').waitFor();
    assert.equal(await page.evaluate(() => window.__bankFixture.abandons),1);
    assert.equal(await page.evaluate(() => window.__bankFixture.submits),1);
    // Real parsers consume varied PC limits; missing evidence does not become demo values.
    await page.evaluate(()=>{window.__bankFixture.policy={version:2,minAmountUsd:5,maxAmountUsd:80,feeRatePct:2,feeMinUsd:1,feeMaxUsd:12};});
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    await page.getByTestId("bank-continue").click();
    assert.match(await page.getByTestId("bank-single-limit").innerText(),/5[–-]80/);
    await page.getByTestId("bank-max").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bank-amount"] input')?.value === "80");
    await page.locator('[data-testid="bank-amount"] input').fill("80.000001");
    assert.equal(await page.getByTestId("bank-quote").getAttribute("aria-disabled"),"true");
    await page.evaluate(()=>{window.__bankFixture.capacity.dailyRemainingCount=0;window.__bankFixture.capacity.dailyCountResetAt=new Date(Date.now()+2500).toISOString();});
    await gotoProtected("/pages/me/wallet-withdraw-bank"); await page.getByTestId("bank-continue").click();
    assert.equal(await page.getByTestId("bank-max").getAttribute("aria-disabled"),"true");
    assert.match(await page.getByTestId("bank-single-limit").innerText(),/5[–-]80/);
    await page.evaluate(()=>{window.__bankFixture.capacity.dailyRemainingCount=2;window.__bankFixture.capacity.dailyCountResetAt="2026-10-01T00:00:00Z";});
    await page.waitForFunction(()=>document.querySelector('[data-testid="bank-max"]')?.getAttribute("aria-disabled")==="false");
    assert.match(await page.getByTestId("bank-single-limit").innerText(),/5[–-]80/);
    await page.evaluate(()=>{window.__bankFixture.policy=null;});
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    assert.equal(await page.getByTestId("bank-continue").getAttribute("aria-disabled"),"true");
    assert.equal(await page.getByTestId("bank-refresh").count(),1);
    await page.evaluate(()=>{window.__bankFixture.policy={version:3,minAmountUsd:20,maxAmountUsd:5000,feeRatePct:1,feeMinUsd:1,feeMaxUsd:25};window.__bankFixture.unbound=true;});
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    assert.equal(await page.getByTestId("bank-continue").count(),0);
    assert.equal(await page.getByTestId("bank-quote").count(),0);
    await page.evaluate(()=>{window.__bankFixture.unbound=false;const q=window.__bankFixture.quote;q.expiresAt=new Date(Date.now()-10000).toISOString();window.__bankFixture.intent={state:"NOT_SUBMITTED",quoteNo:q.quoteNo,withdrawalNo:null,intents:[{state:"NOT_SUBMITTED",quoteNo:q.quoteNo,withdrawalNo:null,expiresAt:q.expiresAt,providerState:null}]};});
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    assert.equal(await page.getByTestId("bank-submit").count(),0,"expired recovered quotes cannot submit");
    await page.getByTestId("bank-abandon").click();
    assert.equal(await page.evaluate(()=>window.__bankFixture.submits),1);
    // Server-denied accounts remain closed; bound accounts need no verification action in any locale/theme.
    for (const locale of ["en","vi","zh"]) for (const mode of ["light","dark"]) {
      await page.evaluate(async ({locale,mode}) => {
        (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
        (await import("/src/store/theme.ts")).useTheme().setMode(mode);
        Object.assign(window.__bankFixture,{canWithdraw:false});
      },{locale,mode});
      await gotoProtected("/pages/me/wallet-withdraw-bank");
      await page.getByTestId("bank-account-status").waitFor();
      assert.equal(await page.getByTestId("bank-continue").getAttribute("aria-disabled"),"true");
      assert.equal(await page.locator('[data-testid="bank-amount"] input').count(),0);
      assert.equal(await page.getByTestId("bank-verify").count(),0);
      await page.evaluate(()=>{window.__bankFixture.canWithdraw=true;});
      await gotoProtected("/pages/me/wallet-withdraw-bank");
      await page.getByTestId("bank-continue").click();
      assert.equal(await page.locator('[data-testid="bank-amount"] input').isEditable(),true);
      assert.equal(await page.evaluate(()=>document.scrollingElement.scrollWidth>document.scrollingElement.clientWidth+1),false);
      await page.screenshot({path:`.verify-cache/bank-withdrawal/${locale}-${mode}.png`,fullPage:true});
    }
    assert.equal(await page.evaluate(() => window.__bankFixture.verifies),0);
    await page.evaluate(() => { window.__bankFixture.enabled=false; });
    await gotoProtected("/pages/me/wallet-withdraw-bank");
    await page.waitForFunction(() => document.querySelector('[data-testid="bank-continue"]')?.getAttribute("aria-disabled") === "true");
    console.log("PASS bank withdrawal actual page: unavailable empty entry, contextual reload, method selection, cross-device closed-channel recovery without resubmit, evidence-only settlement, durable abandon, immediate bound-account use without verification in en/vi/zh and light/dark");
  } catch (error) {
    console.error("Bank runtime failure state", await page.evaluate(() => ({ url:location.href, text:document.body.innerText, fixture:window.__bankFixture, uncaught:window.__gateUncaught })));
    await page.screenshot({path:".verify-cache/bank-withdrawal-failure.png",fullPage:true});
    throw error;
  } finally {
    await page.evaluate(async () => {
      const rt = await import("/src/api/runtime.ts"); rt.apiClient.request=window.__bankRestore;
      uni.removeStorageSync(window.__bankFixture.key); delete window.__bankRestore; delete window.__bankFixture;
    });
  }
}
