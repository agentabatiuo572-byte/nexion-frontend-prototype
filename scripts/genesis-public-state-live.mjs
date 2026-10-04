#!/usr/bin/env node
import assert from "node:assert/strict";

const backendBaseUrl = process.env.NX_GENESIS_BACKEND_URL?.trim();
if (!backendBaseUrl) throw new Error("NX_GENESIS_BACKEND_URL is required for the live Genesis check");
const base = new URL(backendBaseUrl);
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
  throw new Error("NX_GENESIS_BACKEND_URL must be an HTTP(S) base URL without credentials");
}

// Use the same server-authority and schema parser as the App. PRODUCTION is a
// business sourceEnvironment value and does not identify the deployment tier.
const { parseGenesisPublicState } = await import("../src/api/genesis-api.ts");
const requestUrl = new URL("/api/genesis/state", base);
const response = await fetch(requestUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
assert.equal(response.status, 200, "GENESIS_STATE_HTTP_NOT_200");
const responseUrl = new URL(response.url);
assert.equal(responseUrl.origin, requestUrl.origin, "GENESIS_STATE_CROSS_ORIGIN_RESPONSE");
const payload = await response.json();
assert.equal(payload?.code, 0, "GENESIS_STATE_API_FAILED");
const state = parseGenesisPublicState(payload.data);
assert.ok(payload.data.sources?.includes("nx_genesis_holding"), "GENESIS_HOLDING_SOURCE_MISSING");
assert.ok(payload.data.sources?.includes("nx_genesis_order"), "GENESIS_ORDER_SOURCE_MISSING");

if (state.marketOpenState === "closed") {
  assert.equal(state.marketEnabled, false, "CLOSED_MARKET_ENABLED");
  assert.equal(state.tradeAvailable, false, "CLOSED_MARKET_TRADE_AVAILABLE");
}
if (state.sale.showCountdown) assert.equal(state.sale.presaleEnabled, true, "COUNTDOWN_WITHOUT_PRESALE");
console.log(`Genesis public state PASS: request=${requestUrl.origin}${requestUrl.pathname}, response=${responseUrl.origin}${responseUrl.pathname}, market=${state.marketOpenState}, price=${state.series.priceUsdt}, tiers=${state.tiers.length}, businessSource=${state.sourceEnvironment}`);
