#!/usr/bin/env node
/**
 * pending-checkout-runtime.mjs — 结算「待支付会话 + 浮动条」运行时门(mock 档,真页面真点击)。
 *
 * 守的不变量(pkg/ad checkout-cancel,2026-08-16;独立审计 R1 P0 族 = 场景 C):
 *   A 扫码页不自行推进:进入链上付款步后停 15s,仍在扫码页、余额不变、不建单(原 12s 定时器自动
 *     emit complete 把「取消」变成 12 秒按钮 —— 静态哨兵在 verify.sh,这里是运行时那一半)。
 *   B 离开保留 + 同一笔恢复:按返回后浮动条出现(金额一致)、一次性提示已给(leftNoticeShown=true);
 *     点浮动条回来 = 同一地址、倒计时不重置。
 *   C 至多一张活票:把余额压到不够 → 「我已完成支付」→ 支付时刻守卫回弹(余额不足)→ 发票必须作废
 *     (storage 0 张)→ 再 Pay now → 只有 1 张、且是新地址;绝不并存两张(两张 = 两个地址同时催付、
 *     落单后旧票成孤儿拉人二次付款)。
 *   D 到点即死:把 expiresAt 注入成 3s 后 → 重载 → 浮动条先在、到点后消失、storage 剪成 0。
 *   E 一票只结算一次:两个标签页共用同一张票,第二个结算后第一个再点「已完成」不再扣款 / 建单。
 *   F 抵扣上下文不被同栈的第二个结算页实例抹掉(审计 R5 P0):A 带旧机抵扣开票(票面 634.08)→ push 第二个
 *     结算页实例 → 返回 A → 付款 → 恰按票面成交、旧机下架、订单记 tradeInCredit;不出现「金额已变」拒单 + 销票。
 *   G 成交即兑现意图(审计 R8 P0):链上开票 X 后离开 → 全新结算页实例改用卡支付同一 SKU 成交 → 旧票 X 必须作废
 *     (storage 0 张、浮动条消失),否则浮动条继续催第二笔;订单恰 +1。
 *
 * 判据全部是构造性的(读页面文本 / storage / 订单数),不扫源码形状。
 * Usage: BASE_URL=http://127.0.0.1:<port> node scripts/pending-checkout-runtime.mjs
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { assertNoRuntimeErrors } from "./lib/probe-coverage.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const PRODUCT = "stellarbox-s1";
const CHECKOUT = `/#/pages/store/checkout?product=${PRODUCT}`;
const PENDING_KEY = "nexgrid-pending-checkout-accounts-v1";
const ORDERS_KEY = "nexgrid-orders-accounts-v1";
const CLOUD_KEY = "nexgrid-account-cloud-v1";
const NO_ADVANCE_WAIT_MS = 15_000;

function fail(msg) { throw new Error(`pending-checkout-runtime: ${msg}`); }

const browser = await chromium.launch();

async function openPage(initScript) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  // Pin English so aria-label lookups are stable; the app auto-detects zh on the home page otherwise.
  await page.addInitScript(() => {
    if (!localStorage.getItem("nexgrid-locale-v1")) {
      localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code: "en", userSet: true } }));
    }
  });
  if (initScript) await page.addInitScript(initScript.fn, initScript.arg);
  const errors = [];
  page.on("console", collectAppConsoleErrors(errors, BASE));
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

/** Close any trade-in / slot sheets the mock account raises on checkout entry. */
async function dismissSheets(page) {
  for (let i = 0; i < 3; i++) {
    const closed = await page.evaluate(() => {
      const x = document.querySelector(".tis-root .tis-close");
      if (!x) return false;
      x.click();
      return true;
    });
    if (!closed) break;
    await page.waitForTimeout(350);
  }
}

// Real pointer clicks (Playwright actionability: visible, stable, receives events) — a synthetic
// el.click() would still "work" through a backdrop, off-screen or under another layer.
async function tapButton(page, label) {
  const btn = page.locator(`uni-page[data-page="pages/store/checkout"] [role="button"][aria-label="${label}"]`).last();
  if ((await btn.count()) === 0) fail(`button "${label}" not found on the checkout page`);
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(600);
}

async function tapBar(page) {
  const bar = page.locator(".pcb-pill");
  if ((await bar.count()) === 0) fail("floating bar not present");
  // Mock celebrations (milestone overlay) and toasts may legitimately sit on top for a moment;
  // dismiss the celebration, then require a REAL click to land within 15s (a backdrop that stays = red).
  // 包 az 起关闭监听挂在 .ms-backdrop(不在 .ms-overlay 根):合成 click 不做命中测试,点根节点到不了子节点,
  // 所以这里直接点 backdrop(tester-G P1-2);找不到 backdrop 时退回根节点(旧结构)。
  await page.evaluate(() => { const o = document.querySelector(".ms-overlay .ms-backdrop") || document.querySelector(".ms-overlay"); if (o) o.click(); });
  await page.waitForTimeout(300);
  await bar.click({ timeout: 15000 });
}

async function readState(page) {
  return page.evaluate(({ PENDING_KEY, ORDERS_KEY }) => {
    const parse = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null")?.data ?? null; } catch { return null; } };
    const pending = parse(PENDING_KEY) ?? {};
    const orders = parse(ORDERS_KEY) ?? {};
    const sessions = Object.values(pending).flatMap((row) => row?.sessions ?? []);
    const orderCount = Object.values(orders).reduce((n, row) => n + (row?.orders?.length ?? 0), 0);
    const pages = [...document.querySelectorAll('uni-page[data-page="pages/store/checkout"]')];
    const scope = pages[pages.length - 1];
    const text = (scope?.innerText || "").replace(/\s+/g, " ");
    return {
      hash: location.hash,
      sessions: sessions.map((s) => ({ id: s.id, address: s.address, amountUsdt: s.amountUsdt, expiresAt: s.expiresAt, leftNoticeShown: s.leftNoticeShown, tradeIn: s.quote?.tradeIn ?? null })),
      lastOrder: (() => { const o = Object.values(orders).flatMap((row) => row?.orders ?? [])[0]; return o ? { total: o.total, tradeInCredit: o.tradeInCredit ?? 0, tradeInDeviceId: o.tradeInDeviceId ?? null } : null; })(),
      pageStack: typeof getCurrentPages === "function" ? getCurrentPages().length : null,
      orderCount,
      onPayStep: /completed the payment/.test(text),
      address: text.match(/T[0-9A-F]{33}|0x[0-9a-f]{40}/)?.[0] ?? null,
      countdown: text.match(/\b\d\d:\d\d\b/)?.[0] ?? null,
      pill: document.querySelector(".pcb-outer")?.textContent?.replace(/\s+/g, " ") ?? null,
      toast: [...document.querySelectorAll(".nx-toast")].map((t) => t.textContent).join(" | "),
      dialog: !!document.querySelector(".nx-mask--confirm"),
      reviewOrder: /Review order/.test(text),
    };
  }, { PENDING_KEY, ORDERS_KEY });
}

async function goToPayStep(page) {
  await page.goto(directAppUrl(BASE, CHECKOUT), { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await dismissSheets(page);
  await tapButton(page, "Continue");
  await tapButton(page, "Pay now");
  await page.waitForTimeout(400);
  const st = await readState(page);
  if (!st.onPayStep || !st.address || st.sessions.length !== 1) fail(`could not reach the pay step: ${JSON.stringify(st)}`);
  return st;
}

/** Same as goToPayStep, but accept the trade-in the entry sheet offers (mock seed: Cloud Share → S1). */
async function goToPayStepWithTradeIn(page) {
  await page.goto(directAppUrl(BASE, CHECKOUT), { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  const sheet = page.locator(".tis-root .tis-opt");
  if ((await sheet.count()) === 0) fail("F: trade-in choice sheet did not appear on checkout entry (mock seed changed?)");
  await sheet.first().click({ timeout: 5000 });
  await page.waitForTimeout(800);
  await page.locator(".tis-root .tis-cta").first().click({ timeout: 5000 });
  await page.waitForTimeout(800);
  await tapButton(page, "Continue");
  await tapButton(page, "Pay now");
  await page.waitForTimeout(400);
  const st = await readState(page);
  if (!st.onPayStep || !st.address || st.sessions.length !== 1) fail(`F: could not reach the pay step with a trade-in: ${JSON.stringify(st)}`);
  return st;
}

/** Card leg: pick the card method (4th option), confirm, bind a card if the account has none, enter CVV, pay. */
async function payByCard(page) {
  await page.goto(directAppUrl(BASE, CHECKOUT), { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await dismissSheets(page);
  // payment method list = uni-view rows with "rounded-xl border"; mock methods: trc20 / bep20 / erc20 / card
  const pickCardAndContinue = async () => {
    const picked = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('uni-page[data-page="pages/store/checkout"]')];
      const scope = pages[pages.length - 1] ?? document;
      const rows = [...scope.querySelectorAll("uni-view")].filter((e) => /rounded-xl border/.test(e.className));
      const card = rows.find((e) => /card/i.test(e.textContent || ""));
      if (!card) return false;
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    });
    if (!picked) fail("G: card payment method row not found on the select-payment step");
    await page.waitForTimeout(600);
    await tapButton(page, "Continue");
    await tapButton(page, "Continue to payment"); // card leg CTA label (chain leg says "Pay now")
    await page.waitForTimeout(800);
  };
  await pickCardAndContinue();
  const addCard = page.locator('uni-page[data-page="pages/store/checkout"] [role="button"][aria-label="Add a card"]');
  if ((await addCard.count()) > 0) {
    await addCard.first().click({ timeout: 5000 });
    await page.waitForTimeout(1800);
    const ins = page.locator("input");
    await ins.nth(0).fill("4111111111111111");
    await ins.nth(1).fill("12/29");
    await ins.nth(2).fill("123");
    await ins.nth(3).fill("ALEX TURNER");
    await page.waitForTimeout(400);
    await page.locator('[role="button"][aria-label="Complete binding"]').click({ timeout: 8000 });
    await page.waitForTimeout(2500);
    await dismissSheets(page); // the fresh instance re-fires the trade-in intercept sheet
    // binding returns to a fresh checkout instance (card preselected); walk back to the card step if it landed on selection
    const cont = page.locator('uni-page[data-page="pages/store/checkout"] [role="button"][aria-label="Continue"]');
    if ((await cont.count()) > 0) await pickCardAndContinue(); // fresh instance defaults to the chain method again
  }
  const cvv = page.locator('uni-page[data-page="pages/store/checkout"] input').last();
  await cvv.fill("123");
  await page.waitForTimeout(800);
  const payBtn = page.locator('uni-page[data-page="pages/store/checkout"] [role="button"]').filter({ hasText: /^Pay \$/ }).last();
  if ((await payBtn.count()) === 0) fail("G: card Pay button not found after CVV");
  await payBtn.click({ timeout: 5000 });
  await page.waitForTimeout(5000); // awaiting → confirmed → order
}

async function goBack(page) {
  await page.locator(".nx-navheader .nx-nav-side").first().click({ timeout: 5000 });
  await page.waitForTimeout(1200);
}

const report = {};
try {
  // ── A + B: no auto-advance · leave keeps the invoice · resume is the same invoice ──
  {
    const { ctx, page, errors } = await openPage(null);
    const t0 = await goToPayStep(page);
    await page.waitForTimeout(NO_ADVANCE_WAIT_MS);
    const t1 = await readState(page);
    if (!t1.onPayStep) fail(`A: pay step advanced on its own within ${NO_ADVANCE_WAIT_MS}ms (hash=${t1.hash})`);
    if (t1.orderCount !== t0.orderCount) fail(`A: an order was created without user action (${t0.orderCount} → ${t1.orderCount})`);
    if (t1.address !== t0.address) fail(`A: address changed while waiting (${t0.address} → ${t1.address})`);
    // B: back → bar + one-shot notice; resume → same address, countdown continuous
    await goBack(page);
    const left = await readState(page);
    if (!left.pill || !left.pill.includes(String(t0.sessions[0].amountUsdt).replace(/\B(?=(\d{3})+(?!\d))/g, ","))) fail(`B: floating bar missing/wrong after leaving: ${left.pill}`);
    if (left.sessions.length !== 1 || left.sessions[0].leftNoticeShown !== true) fail(`B: invoice not kept / notice not marked: ${JSON.stringify(left.sessions)}`);
    const pillCountdown = left.pill.match(/\b\d\d:\d\d\b/)?.[0] ?? null;
    await tapBar(page);
    await page.waitForTimeout(2000);
    const back = await readState(page);
    if (!back.hash.includes("resume=")) fail(`B: bar tap did not open the resume route (${back.hash})`);
    if (back.address !== t0.address) fail(`B: resumed invoice shows a different address (${t0.address} → ${back.address})`);
    if (back.pill !== null) fail("B: bar still visible on the page that shows the invoice");
    if (pillCountdown && back.countdown && back.countdown > pillCountdown) fail(`B: countdown reset (${pillCountdown} → ${back.countdown})`);
    report.AB = { address: t0.address, waitedMs: NO_ADVANCE_WAIT_MS, pill: left.pill, resumedCountdown: back.countdown, errors };
    assertNoRuntimeErrors(errors, "pending-checkout A/B");
    await ctx.close();
  }

  // ── C: settlement guard bounce voids the invoice; next Pay now opens ONE fresh invoice ──
  {
    const { ctx, page, errors } = await openPage({
      fn: (CLOUD_KEY) => {
        // squeeze the mock balance below any device price so the pay-time guard bounces
        const raw = localStorage.getItem(CLOUD_KEY);
        if (!raw) return;
        try {
          const wrapped = JSON.parse(raw);
          for (const row of Object.values(wrapped.data ?? {})) {
            if (row?.user) { row.user.usdtBalance = 1; if (row.user.earningBuckets) row.user.earningBuckets.withdrawableUsdt = 1; }
          }
          localStorage.setItem(CLOUD_KEY, JSON.stringify(wrapped));
        } catch { /* leave storage as is */ }
      },
      arg: CLOUD_KEY,
    });
    // First visit seeds storage; reload so the init script can squeeze the seeded balance.
    await page.goto(directAppUrl(BASE, "/#/pages/store/store"), { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const first = await goToPayStep(page);
    await tapButton(page, "I've completed the payment →");
    await page.waitForTimeout(4000); // awaiting (2.4s) → confirmed → balance guard bounce
    const bounced = await readState(page);
    if (bounced.orderCount !== first.orderCount) fail(`C: order created despite insufficient balance (${first.orderCount} → ${bounced.orderCount})`);
    if (bounced.onPayStep) fail("C: still on the pay step after the settlement guard bounce (balance squeeze did not take?)");
    if (bounced.sessions.length !== 0) fail(`C: bounced invoice not voided (sessions=${bounced.sessions.length}) — a second Pay now would mint a duplicate`);
    if (bounced.pill !== null) fail(`C: bar shows a voided invoice: ${bounced.pill}`);
    await tapButton(page, "Continue");
    await tapButton(page, "Pay now");
    await page.waitForTimeout(500);
    const second = await readState(page);
    if (second.dialog) fail("C: collision dialog raised although the previous invoice was voided");
    if (second.sessions.length !== 1) fail(`C: expected exactly one live invoice after re-opening, got ${second.sessions.length}`);
    if (second.address === first.address) fail("C: re-opened invoice reused the voided address");
    report.C = { firstAddress: first.address, secondAddress: second.address, sessionsAfter: second.sessions.length, errors };
    assertNoRuntimeErrors(errors, "pending-checkout C");
    await ctx.close();
  }

  // ── D: deadline passes → bar disappears, storage pruned ──
  {
    const { ctx, page, errors } = await openPage(null);
    const t0 = await goToPayStep(page);
    await goBack(page);
    await page.evaluate((PENDING_KEY) => {
      const wrapped = JSON.parse(localStorage.getItem(PENDING_KEY));
      for (const row of Object.values(wrapped.data)) for (const s of row.sessions ?? []) s.expiresAt = Date.now() + 8000; // 8s: reload + settle must fit; the bar must still be there when we look
      localStorage.setItem(PENDING_KEY, JSON.stringify(wrapped));
    }, PENDING_KEY);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const before = await readState(page);
    if (!before.pill) fail("D: bar missing right after reload with a still-live invoice");
    await page.waitForTimeout(9000);
    const after = await readState(page);
    if (after.pill !== null) fail(`D: bar still shows an expired invoice: ${after.pill}`);
    if (after.sessions.length !== 0) fail(`D: expired invoice not pruned from storage (${after.sessions.length})`);
    report.D = { address: t0.address, pillBefore: before.pill, errors };
    assertNoRuntimeErrors(errors, "pending-checkout D");
    await ctx.close();
  }

  // ── E: one invoice, two tabs — settled once, never twice ──
  {
    const { ctx, page, errors } = await openPage(null);
    const t0 = await goToPayStep(page); // tab 1 holds invoice X on the pay step
    const page2 = await ctx.newPage(); // tab 2: same profile → same localStorage
    page2.on("console", collectAppConsoleErrors(errors, BASE));
    page2.on("pageerror", (e) => errors.push(String(e)));
    await page2.goto(directAppUrl(BASE, "/#/pages/store/store"), { waitUntil: "networkidle", timeout: 30000 });
    await page2.waitForTimeout(1500);
    const seen = await readState(page2);
    if (!seen.pill) fail(`E: tab 2 does not see tab 1's invoice on the bar: ${JSON.stringify(seen)}`);
    await tapBar(page2);
    await page2.waitForTimeout(2000);
    const resumed = await readState(page2);
    if (resumed.address !== t0.address) fail(`E: tab 2 resumed a different invoice (${t0.address} → ${resumed.address})`);
    await tapButton(page2, "I've completed the payment →");
    await page2.waitForTimeout(4500); // awaiting → confirmed → order
    const settled = await readState(page2);
    if (settled.orderCount !== t0.orderCount + 1) fail(`E: tab 2 did not settle the invoice (orders ${t0.orderCount} → ${settled.orderCount})`);
    if (settled.sessions.length !== 0) fail(`E: invoice still on the books after settlement (${settled.sessions.length})`);
    // tab 1 still shows the pay step with its stale copy — pressing complete must NOT pay again
    await page.bringToFront();
    await page.waitForTimeout(800);
    const stale = await readState(page);
    // The stale settle attempt IS the probe — if tab 1 is not on the pay step the scenario proved nothing.
    if (!stale.onPayStep) fail(`E: tab 1 left the pay step before the stale settle attempt (hash=${stale.hash})`);
    await tapButton(page, "I've completed the payment →");
    await page.waitForTimeout(4500);
    const after = await readState(page);
    if (after.orderCount !== t0.orderCount + 1) fail(`E: the same invoice was settled twice (orders ${t0.orderCount} → ${after.orderCount})`);
    if (after.sessions.length !== 0) fail(`E: a second invoice appeared after the stale settle attempt (${after.sessions.length})`);
    report.E = { address: t0.address, ordersBefore: t0.orderCount, ordersAfter: after.orderCount, tab1BounceHash: after.hash, errors };
    assertNoRuntimeErrors(errors, "pending-checkout E");
    await ctx.close();
  }

  // ── F: a second checkout instance on the stack must not wipe the first one's trade-in context ──
  {
    const { ctx, page, errors } = await openPage(null);
    const t0 = await goToPayStepWithTradeIn(page);
    if (!t0.sessions[0].tradeIn) fail(`F: invoice did not record the trade-in: ${JSON.stringify(t0.sessions)}`);
    // push a second checkout instance (same route — exactly what the floating bar / add-card return do), then come back
    await page.evaluate(() => uni.navigateTo({ url: "/pages/store/checkout?product=stellarbox-s1" }));
    await page.waitForTimeout(1500);
    await dismissSheets(page);
    const stacked = await readState(page);
    if (stacked.pageStack !== 2) fail(`F: second checkout instance was not pushed (stack=${stacked.pageStack})`);
    await goBack(page);
    const back = await readState(page);
    if (!back.onPayStep || back.sessions.length !== 1 || back.address !== t0.address) fail(`F: first instance lost its invoice after the second one unloaded: ${JSON.stringify(back)}`);
    await tapButton(page, "I've completed the payment →");
    await page.waitForTimeout(4500);
    const paid = await readState(page);
    if (paid.orderCount !== t0.orderCount + 1) fail(`F: trade-in invoice did not settle after a sibling instance unloaded (orders ${t0.orderCount} → ${paid.orderCount}; toast=${paid.toast})`);
    if (paid.sessions.length !== 0) fail(`F: invoice still on the books after settlement (${paid.sessions.length})`);
    if (!paid.lastOrder || Math.abs(paid.lastOrder.total - t0.sessions[0].amountUsdt) > 0.000001) fail(`F: settled amount ≠ invoice face (${JSON.stringify(paid.lastOrder)} vs ${t0.sessions[0].amountUsdt})`);
    if (paid.lastOrder.tradeInDeviceId !== t0.sessions[0].tradeIn.deviceId) fail(`F: order lost the trade-in device (${JSON.stringify(paid.lastOrder)})`);
    report.F = { address: t0.address, face: t0.sessions[0].amountUsdt, order: paid.lastOrder, errors };
    assertNoRuntimeErrors(errors, "pending-checkout F");
    await ctx.close();
  }

  // ── G: a completed card purchase of the same SKU voids the chain invoice left behind ──
  {
    const { ctx, page, errors } = await openPage(null);
    const t0 = await goToPayStep(page);           // chain invoice X for the SKU
    await goBack(page);
    const left = await readState(page);
    if (left.sessions.length !== 1 || !left.pill) fail(`G: invoice not kept / bar missing after leaving: ${JSON.stringify(left)}`);
    await payByCard(page);                        // fresh checkout instance, same SKU, card leg
    const paid = await readState(page);
    if (paid.orderCount !== t0.orderCount + 1) fail(`G: card purchase did not settle (orders ${t0.orderCount} → ${paid.orderCount}; toast=${paid.toast})`);
    if (paid.sessions.length !== 0) fail(`G: chain invoice survived a completed card purchase of the same SKU — the bar would nag for a second payment (${JSON.stringify(paid.sessions)})`);
    await page.goto(directAppUrl(BASE, "/#/pages/store/store"), { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
    const after = await readState(page);
    if (after.pill) fail(`G: floating bar still shows after the intent was fulfilled: ${after.pill}`);
    report.G = { invoice: t0.address, ordersBefore: t0.orderCount, ordersAfter: paid.orderCount, errors };
    assertNoRuntimeErrors(errors, "pending-checkout G");
    await ctx.close();
  }

  console.log(JSON.stringify(report, null, 2));
  console.log("PENDING-CHECKOUT-RUNTIME: PASS (A no-auto-advance 15s · B leave/resume same invoice · C bounce voids + single live · D expiry prune · E two tabs settle once · F sibling instance keeps trade-in · G card purchase voids the chain invoice)");
} finally {
  await browser.close();
}
