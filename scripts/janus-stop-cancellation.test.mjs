#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync("src/services/janus-c2.ts", "utf8");
const apiClientSource = fs.readFileSync("src/api/api-client.ts", "utf8");
const janusApiSource = fs.readFileSync("src/api/janus-api.ts", "utf8");

function extractFunctionFrom(text, name) {
  const marker = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`);
  const match = marker.exec(text);
  assert.ok(match, `missing function ${name}`);
  const start = match.index;
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1).replace(/^export\s+/, "");
  }
  assert.fail(`unterminated function ${name}`);
}
const extractFunction = (name) => extractFunctionFrom(source, name);

const moduleSource = `
const REPORT_KEY = "nexgrid-janus-pending-report-v2";
const ACK_KEY = "nexgrid-janus-pending-ack-v2";
const DEVICE_APP_VERSION = "NX1.0-UniApp";
const STATUS_SET = new Set(["NEW", "OBSERVING", "RECOMMENDED", "HIT", "ACTIVATED", "ENV_FILTERED", "MANUAL_HOLD", "MANUAL_FORCED", "BLOCKED", "STALE", "RESET", "ERROR"]);
${extractFunction("scoped")}
${extractFunction("errorMessage")}
${extractFunction("throwIfJanusSyncCancelled")}
${extractFunction("isJanusSyncCancelled")}
${extractFunction("createJanusCoordinator")}
`;
const compiled = ts.transpileModule(moduleSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const { createJanusCoordinator } = new Function(`${compiled}\nreturn { createJanusCoordinator };`)();

const transportModule = `
class ApiError extends Error {
  constructor(value) { super(value.message); this.kind = value.kind; this.retryable = value.retryable; }
}
${extractFunctionFrom(apiClientSource, "createUniHttpTransport")}
`;
const compiledTransport = ts.transpileModule(transportModule, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const { createUniHttpTransport } = new Function(`${compiledTransport}\nreturn { createUniHttpTransport };`)();

assert.doesNotMatch(source, /(?:start|stop|sync)JanusC2|runJanusC2|defaultCoordinator/,
  "the formal App must not own a Janus execution lifecycle");
assert.match(janusApiSource, /report: async \(report, signal\)[\s\S]*?signal,/,
  "Janus API must forward cancellation into the HTTP client");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function storageHarness() {
  const values = new Map();
  const deletes = [];
  return {
    values,
    deletes,
    api: {
      get: (key) => values.get(key),
      set: (key, value) => values.set(key, value),
      delete: (key) => { deletes.push(key); values.delete(key); },
    },
  };
}

function report() {
  return {
    reportId: "report-1",
    deviceId: "device-1",
    reportedAt: 1,
    firstSeenAt: 1,
    installAt: 1,
    channel: "official",
    ua: "test",
    platform: "unknown",
    model: "test",
    osName: "test",
    browser: "test",
    maturity: { appOpenCount: 1, sessionCount: 1, foregroundDurationSeconds: 1, repeatStreakDays: 1, benchmarkViewed: false, optimizeDone: false, marketViewed: false, walletViewed: false },
    environment: { isHeadless: false, automationSignalCount: 0, fpBlocklistHit: false, screenAnomaly: false, timezoneMismatch: false, languageMismatch: false },
    latestSession: { sessionId: "session-1", startedAt: 1, lastSeenAt: 1, foregroundDurationSeconds: 1 },
  };
}

async function expectCancelled(promise) {
  await assert.rejects(promise, (error) => error instanceof Error && error.message === "JANUS_SYNC_CANCELLED");
}

// The transport must abort the actual uni request rather than only ignoring a
// late response in the coordinator.
{
  const controller = new AbortController();
  let abortCalls = 0;
  const previousUni = globalThis.uni;
  globalThis.uni = {
    request: () => ({ abort: () => { abortCalls++; } }),
  };
  try {
    const pending = createUniHttpTransport().request({
      url: "https://example.test/janus",
      method: "POST",
      headers: {},
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(pending, (error) => error instanceof Error && error.message === "REQUEST_ABORTED");
    assert.equal(abortCalls, 1);
  } finally {
    if (previousUni === undefined) delete globalThis.uni;
    else globalThis.uni = previousUni;
  }
}

// Stop while the report request is in flight: no pending lookup, runtime apply,
// ACK, or deletion of the stable report may occur after cancellation.
{
  const store = storageHarness();
  const reportEntered = deferred();
  const reportReply = deferred();
  let pendingCalls = 0;
  let applyCalls = 0;
  let ackCalls = 0;
  const coordinator = createJanusCoordinator({
    storage: store.api,
    buildReport: report,
    now: () => 1,
    applyRuntime: async () => { applyCalls++; return { status: "RESET", revision: 1, appliedAt: 1 }; },
    api: {
      report: async () => { reportEntered.resolve(); return reportReply.promise; },
      pending: async () => { pendingCalls++; return { hasCommand: false }; },
      ack: async () => { ackCalls++; return { sid: "1", revision: 1, state: "ACKED" }; },
      progress: async () => {},
    },
  });
  const controller = new AbortController();
  const running = coordinator.sync(controller.signal);
  await reportEntered.promise;
  controller.abort();
  reportReply.resolve({ sid: "1", status: "OBSERVING", version: 1 });
  await expectCancelled(running);
  assert.equal(pendingCalls, 0);
  assert.equal(applyCalls, 0);
  assert.equal(ackCalls, 0);
  assert.equal(store.deletes.length, 0, "cancelled report must remain stable for a future retry");
}

// Stop while runtime application is in flight: the signal must reach the
// adapter, and cancellation must not be converted into a failure ACK.
{
  const store = storageHarness();
  const applyEntered = deferred();
  const applyReply = deferred();
  let applied = 0;
  let ackCalls = 0;
  const coordinator = createJanusCoordinator({
    storage: store.api,
    buildReport: report,
    now: () => 1,
    applyRuntime: async (_runtime, signal) => {
      applyEntered.resolve();
      await applyReply.promise;
      if (signal?.aborted) throw new Error("JANUS_SYNC_CANCELLED");
      applied++;
      return { status: "RESET", revision: 2, appliedAt: 1, handoffReceipt: "reset:2" };
    },
    api: {
      report: async () => ({ sid: "1", status: "OBSERVING", version: 1 }),
      pending: async () => ({ hasCommand: true, sid: "1", revision: 2, desiredStatus: "RESET" }),
      ack: async () => { ackCalls++; return { sid: "1", revision: 2, state: "ACKED" }; },
      progress: async () => {},
    },
  });
  const controller = new AbortController();
  const running = coordinator.sync(controller.signal);
  await applyEntered.promise;
  controller.abort();
  applyReply.resolve();
  await expectCancelled(running);
  assert.equal(applied, 0);
  assert.equal(ackCalls, 0, "cancellation must not emit success or failure ACK");
}

console.log("janus-stop-cancellation: PASS (transport abort + delayed report + delayed runtime apply)");
