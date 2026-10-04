import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("human floating shortcut opens the unified full-screen Service section", async () => {
  const bubble = await source("src/components/nova/nova-bubble.vue");
  assert.match(bubble, /messageCenter\.show\("service"\)/);
  assert.doesNotMatch(bubble, /navTo\("\/pages\/support\/messages"\)/);
  assert.doesNotMatch(bubble, /navTo\("\/pages\/support\/chat"\)/);
  assert.match(bubble, /conversations\.byType\("advisor"\)/);
  assert.match(bubble, /conversations\.byType\("support"\)/);
  assert.doesNotMatch(bubble, /remoteApiEnabled \? nova\.unread/);
});

test("ambassador form consumes the server policy instead of fixed client limits", async () => {
  const page = await source("src/pages/team/agent.vue");
  assert.match(page, /ambassadorApplicationApi\.policy\(\)/);
  assert.match(page, /minBudgetUsdt/);
  assert.match(page, /maxBudgetUsdt/);
  assert.doesNotMatch(page, /range:\s*"\$1,000 — \$10,000"/);
});

test("bundle order detail uses the canonical subtotal and all-item projection", async () => {
  const api = await source("src/api/order-api.ts");
  const store = await source("src/store/orders.ts");
  const detail = await source("src/pages/store/order-detail.vue");
  assert.match(api, /subtotalUsdt/);
  assert.match(store, /subtotal:\s*row\.subtotalUsdt/);
  assert.match(detail, /order\.subtotal/);
  assert.doesNotMatch(detail, /order\.unitPrice \* order\.quantity/);
});

test("Ticket Create reads its own PC-published knowledge surface", async () => {
  const page = await source("src/pages/me/support-tickets.vue");
  const api = await source("src/api/support-api.ts");
  assert.match(page, /faqPage\([^)]*"Ticket Create"/);
  assert.match(api, /surface/);
});

test("compute share enrollment is ready only with an HTTPS installer URL", async () => {
  const page = await source("src/pages/compute-share/download.vue");
  assert.match(page, /isComputeShareReady/);
  assert.ok(page.includes("https://"));
});

test("binary UI renders a server block reason instead of a positive estimate", async () => {
  const page = await source("src/pages/team/binary.vue");
  assert.match(page, /blockedReason/);
  assert.match(page, /estimatedAmountUsdt/);
  assert.match(page, /showGrowthRecoveryCta/);
  assert.doesNotMatch(page, /\{\{ blockedDetailText \}\} \{\{ t\.binary\.blockedAction \}\}/);
});

test("commission UI preserves frozen, reversed, and rejected server states", async () => {
  const api = await source("src/api/team-insights-api.ts");
  const store = await source("src/store/commission.ts");
  const page = await source("src/pages/team/commissions.vue");
  for (const value of ["frozen", "reversed", "rejected"]) {
    assert.match(api, new RegExp(`\\"${value}\\"`));
    assert.match(store, new RegExp(`\\"${value}\\"`));
    assert.match(page, new RegExp(`'${value}'`));
  }
  assert.match(page, /commissionAmountLabel\(e\)/);
  assert.doesNotMatch(page, />\+\$\{\{ e\.amountUSDT\.toFixed\(2\) \}\}<\/text>/);
});
