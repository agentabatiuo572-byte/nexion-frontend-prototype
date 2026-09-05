#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const FILE = "src/App.vue";
const source = fs.readFileSync(FILE, "utf8");
const BUSINESS_MODULE_FILES = [
  "src/store/app.ts",
  "src/store/free-trial.ts",
  "src/store/orders.ts",
  "src/store/milestones.ts",
  "src/store/bills.ts",
  "src/lib/money-receipt.ts",
  "src/services/janus-c2.ts",
  "src/services/janus-runtime.ts",
];
const businessModuleSources = Object.fromEntries(
  BUSINESS_MODULE_FILES.map((file) => [file, fs.readFileSync(file, "utf8")]),
);
const depositsSource = fs.readFileSync("src/store/deposits.ts", "utf8");
const genesisSource = fs.readFileSync("src/store/genesis.ts", "utf8");
const configSource = fs.readFileSync("src/store/config.ts", "utf8");

function assertNoRawTimeoutsInBusinessModules(sources) {
  for (const [file, text] of Object.entries(sources)) {
    assert.equal((text.match(/\bsetTimeout\(/g) || []).length, 0,
      `${file} may not create a raw/recursive timeout; use App business-timeout registry`);
  }
}

function functionBody(text, name) {
  const start = text.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = text.indexOf("{", start);
  assert.notEqual(open, -1, `missing body for ${name}`);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  assert.fail(`unterminated body for ${name}`);
}

function evaluate(text) {
  const checkRoute = functionBody(text, "checkQuestRoute");
  const ensureRunning = functionBody(text, "ensureBusinessLoopsRunning");
  const stopLoops = functionBody(text, "stopBusinessLoops");
  const onShowStart = text.indexOf("onShow(() => {");
  const onShowEnd = text.indexOf("\nonHide(() => {", onShowStart);
  assert.ok(onShowStart >= 0 && onShowEnd > onShowStart, "missing onShow hook");
  const onShow = text.slice(onShowStart, onShowEnd);

  const sessionCheck = checkRoute.indexOf("checkSession()");
  const recovery = checkRoute.indexOf("ensureBusinessLoopsRunning()");
  const routeShortCircuit = checkRoute.indexOf("route === lastQuestRoute");
  assert.ok(sessionCheck >= 0 && recovery > sessionCheck, "route recovery must run after session validation");
  assert.ok(routeShortCircuit >= 0 && recovery < routeShortCircuit, "route recovery must run before same-route short circuit");

  assert.match(ensureRunning, /ensureBusinessLoopsAllowed\(\)/, "recovery must fail closed through auth/session gating");
  assert.match(ensureRunning, /if \(businessLoopsRunning\) return true;/, "recovery must be idempotent");
  for (const start of [
    "startTick",
    "startArrivalPoll",
    "startTrialPoll",
    "startOrderPoll",
    "startMilestonePoll",
  ]) {
    assert.match(ensureRunning, new RegExp(`\\b${start}\\(\\)`), `${start} missing from central recovery`);
    assert.equal((text.match(new RegExp(`\\b${start}\\(\\);`, "g")) || []).length, 1,
      `${start} must have exactly one call site`);
  }
  assert.match(ensureRunning, /useApp\(\)\.settle\(\)/, "recovery must settle the foreground gap immediately");
  assert.match(ensureRunning, /advanceArrivalAndSettleBill\(\)/, "recovery must reconcile arrivals immediately");

  assert.match(stopLoops, /businessLoopsRunning\s*=\s*false/, "central stop must clear liveness state");
  const localStops = {
    stopTick: "tickTimer",
    stopArrivalPoll: "arrivalTimer",
    stopTrialPoll: "trialTimer",
    stopOrderPoll: "orderTimer",
    stopMilestonePoll: "milestoneTimer",
  };
  const localStarts = {
    startTick: "tickTimer",
    startArrivalPoll: "arrivalTimer",
    startTrialPoll: "trialTimer",
    startOrderPoll: "orderTimer",
    startMilestonePoll: "milestoneTimer",
    startQuestWatch: "questTimer",
  };
  assert.equal((text.match(/\bsetInterval\(/g) || []).length, Object.keys(localStarts).length,
    "App.vue may only create the five registered business timers plus the guard timer");
  for (const [start, timer] of Object.entries(localStarts)) {
    const body = functionBody(text, start);
    assert.equal((body.match(/\bsetInterval\(/g) || []).length, 1,
      `${start} must create exactly one registered interval`);
    assert.match(body, new RegExp(`${timer}\\s*=\\s*setInterval\\(`),
      `${start} must store its interval in ${timer}`);
  }
  const timeoutScheduler = functionBody(text, "scheduleBusinessTimeout");
  const timeoutStop = functionBody(text, "stopBusinessTimeouts");
  const accountBootstrap = functionBody(text, "scheduleAccountSessionBootstrap");
  assert.equal((text.match(/\bsetTimeout\(/g) || []).length, 2,
    "App.vue may only use setTimeout in the registered business scheduler and account bootstrap retry");
  assert.equal((timeoutScheduler.match(/\bsetTimeout\(/g) || []).length, 1,
    "business timeout scheduler must create exactly one timeout");
  assert.equal((accountBootstrap.match(/\bsetTimeout\(/g) || []).length, 1,
    "account bootstrap retry must remain the only non-business timeout");
  assert.match(timeoutScheduler, /businessTimeouts\.add\(handle\)/,
    "business timeout scheduler must register every timeout handle");
  assert.match(timeoutScheduler, /businessTimeouts\.delete\(handle\)/,
    "business timeout scheduler must unregister a fired handle");
  assert.match(timeoutScheduler, /businessLoopsRunning[\s\S]*ensureBusinessLoopsAllowed\(\)/,
    "delayed business callbacks must re-check lifecycle and auth/session before execution");
  assert.match(timeoutStop, /clearTimeout\(handle\)/,
    "business timeout stop must cancel every registered handle");
  assert.match(timeoutStop, /businessTimeouts\.clear\(\)/,
    "business timeout stop must empty the registry");
  assert.match(stopLoops, /\bstopBusinessTimeouts\(\)/,
    "central stop must cancel registered delayed business tasks");
  assert.match(stopLoops, /useDeposits\(\)\.pauseMockEngine\(\)/,
    "central stop must pause the deposit mock engine");
  assert.match(ensureRunning, /useDeposits\(\)\.resumeMockEngine\(\)/,
    "central start must resume the deposit mock engine after auth/session gating");
  for (const [stop, timer] of Object.entries(localStops)) {
    assert.match(stopLoops, new RegExp(`\\b${stop}\\(\\)`), `${stop} missing from central stop`);
    const body = functionBody(text, stop);
    assert.match(body, new RegExp(`clearInterval\\(${timer}\\)`), `${stop} must clear ${timer}`);
    assert.match(body, new RegExp(`${timer}\\s*=\\s*undefined`), `${stop} must clear its liveness handle`);
  }
  const probe = functionBody(text, "installBusinessLoopProbe");
  for (const timer of Object.values(localStops)) {
    assert.match(probe, new RegExp(`${timer}\\s*!==\\s*undefined`), `runtime probe must identify ${timer}`);
  }
  assert.match(probe, /pendingTimeouts:\s*businessTimeouts\.size/,
    "runtime probe must expose pending registered business timeouts");
  assert.match(probe, /configSyncFailed:\s*config\.syncFailed/,
    "runtime probe must expose the config fail-closed state");
  assert.match(probe, /earningsToday:\s*app\.earnings\.today/,
    "runtime probe must expose raw aggregate earnings progress");
  assert.match(probe, /latestSettledAt:/,
    "runtime probe must expose the latest device settlement anchor");
  assert.match(probe, /scheduleBusinessTimeout\(/,
    "runtime probe must exercise the production business-timeout registry");
  assert.match(onShow, /startQuestWatch\(\)[\s\S]*ensureBusinessLoopsRunning\(\)/,
    "onShow must arm the guard before starting gated business loops");
  assert.match(onShow, /void refreshEarningsReleaseStatus\(\)\.catch\(/,
    "foreground earnings refresh must consume expected transport failures instead of leaking pageerror");
}

function evaluateConfig(text) {
  const load = functionBody(text, "load");
  assert.match(text, /import\s*\{\s*platformConfigApi\s*,\s*remoteApiEnabled\s*\}\s*from\s*["']@\/api\/runtime["']/,
    "config store must use the selected API runtime mode");
  assert.match(load, /if\s*\(!remoteApiEnabled\)/,
    "local-mock config loading must not call the remote platform endpoint");
  assert.match(load, /syncFailed\.value\s*=\s*false[\s\S]*return;/,
    "local-mock config loading must make the in-memory seed eligible for settlement and return");
  const branch = load.match(/if\s*\(!remoteApiEnabled\)\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.doesNotMatch(branch, /platformConfigApi\.platformConfig\(/,
    "local-mock branch must not fetch the Vite HTML fallback as platform config");
}

function evaluateDeposits(text) {
  const pause = functionBody(text, "pauseMockEngine");
  const resume = functionBody(text, "resumeMockEngine");
  const confirmations = functionBody(text, "scheduleConfirmations");
  const confirmationStep = functionBody(text, "step");
  const expiry = functionBody(text, "scheduleIntentExpiry");

  assert.equal((text.match(/\bsetTimeout\(/g) || []).length, 2,
    "deposit mock engine may only create its two registered timeout families");
  assert.match(pause, /mockEngineRunning\s*=\s*false/,
    "deposit pause must close the engine gate before clearing callbacks");
  assert.match(pause, /timers\.forEach\([\s\S]*clearTimeout/,
    "deposit pause must cancel every registered timeout");
  assert.match(pause, /timers\.clear\(\)/,
    "deposit pause must empty the timeout registry");
  assert.match(resume, /if \(mockEngineRunning\) return;/,
    "deposit resume must be idempotent");
  assert.match(resume, /mockEngineRunning\s*=\s*true/,
    "deposit resume must open the engine gate");
  assert.match(resume, /syncBankIntents\(\)[\s\S]*syncChainDeposits\(\)/,
    "deposit resume must rebuild both timeout families from durable state");
  assert.match(confirmations, /^\s*if \(!mockEngineRunning\) return;/,
    "deposit confirmation scheduling must be disabled while paused");
  assert.match(confirmations, /timers\.set\(depositId,\s*setTimeout\(step, ms\)\)/,
    "deposit confirmation timeout must be registered");
  assert.match(confirmationStep, /timers\.delete\(depositId\);\s*if \(!mockEngineRunning\) return;/,
    "deposit confirmation callback must re-check the lifecycle gate before state writes");
  assert.match(expiry, /^\s*if \(!mockEngineRunning\) return;/,
    "deposit expiry scheduling must be disabled while paused");
  assert.match(expiry, /timers\.set\([\s\S]*setTimeout\([\s\S]*if \(!mockEngineRunning\) return;/,
    "deposit expiry timeout must be registered and re-check the lifecycle gate");
}

evaluate(source);
assertNoRawTimeoutsInBusinessModules(businessModuleSources);
evaluateDeposits(depositsSource);
evaluateConfig(configSource);
assert.match(functionBody(genesisSource, "syncRemote"), /^\s*if \(!remoteApiEnabled\) return true;/,
  "account bootstrap must not leak a rejected Genesis remote sync in local-mock mode");

const mutations = [
  {
    label: "remove route-driven recovery",
    apply: (text) => text.replace(/\n\s*if \(!ensureBusinessLoopsRunning\(\)\) return;/, ""),
  },
  {
    label: "make recovery restart every loop on every guard tick",
    apply: (text) => text.replace(/\n\s*if \(businessLoopsRunning\) return true;/, ""),
  },
  {
    label: "omit the arrival and refund reconciliation loop",
    apply: (text) => text.replace(/\n\s*startArrivalPoll\(\);/, ""),
  },
  {
    label: "leave one 4s loop alive on the static review page",
    apply: (text) => text.replace(/function stopTrialPoll\(\) \{[\s\S]*?\n\}/, "function stopTrialPoll() {}"),
  },
  {
    label: "create an unregistered orphan 4s timer",
    apply: (text) => text.replace(
      /trialTimer = setInterval\((?:pollTrial|\(\) => \{ void pollTrial\(\); \}), TRIAL_TICK_MS\);/,
      "$&\n  setInterval(() => { void pollTrial(); }, TRIAL_TICK_MS);",
    ),
  },
  {
    label: "leave registered delayed business callbacks alive after stop",
    apply: (text) => text.replace(/\n\s*stopBusinessTimeouts\(\);/, ""),
  },
  {
    label: "create an unregistered delayed business callback",
    apply: (text) => text.replace(
      /trialTimer = setInterval\((?:pollTrial|\(\) => \{ void pollTrial\(\); \}), TRIAL_TICK_MS\);/,
      "$&\n  setTimeout(() => { void pollTrial(); }, TRIAL_TICK_MS);",
    ),
  },
  {
    label: "reduce the runtime liveness witness to timer state only",
    apply: (text) => text.replace(/\n\s*configSyncFailed:[\s\S]*?latestSettledAt:[^\n]+,/, ""),
  },
];

for (const mutation of mutations) {
  const changed = mutation.apply(source);
  assert.notEqual(changed, source, `stale mutation: ${mutation.label}`);
  assert.throws(() => evaluate(changed), undefined, `mutation escaped: ${mutation.label}`);
}

const moduleTimeoutMutation = {
  ...businessModuleSources,
  "src/store/free-trial.ts": `setTimeout(() => {}, 4000);\n${businessModuleSources["src/store/free-trial.ts"]}`,
};
assert.throws(
  () => assertNoRawTimeoutsInBusinessModules(moduleTimeoutMutation),
  undefined,
  "mutation escaped: create a recursive timeout inside a transitive business module",
);

const depositMutations = [
  {
    label: "leave the deposit mock engine running after central stop",
    app: source.replace(/\n\s*useDeposits\(\)\.pauseMockEngine\(\);/, ""),
    deposits: depositsSource,
  },
  {
    label: "allow deposit confirmation callback to write after pause",
    app: source,
    deposits: depositsSource.replace(
      /timers\.delete\(depositId\);\r?\n\s*if \(!mockEngineRunning\) return;/,
      "timers.delete(depositId);",
    ),
  },
  {
    label: "create an unregistered deposit business timeout",
    app: source,
    deposits: depositsSource.replace(
      /timers\.set\(depositId, setTimeout\(step, ms\)\);/,
      "timers.set(depositId, setTimeout(step, ms));\n      setTimeout(step, ms);",
    ),
  },
];
for (const mutation of depositMutations) {
  assert.throws(
    () => {
      evaluate(mutation.app);
      evaluateDeposits(mutation.deposits);
    },
    undefined,
    `mutation escaped: ${mutation.label}`,
  );
}

const configMutation = configSource.replace("if (!remoteApiEnabled)", "if (remoteApiEnabled)");
assert.notEqual(configMutation, configSource, "stale mutation: invert local-mock runtime guard");
assert.throws(
  () => evaluateConfig(configMutation),
  undefined,
  "mutation escaped: local-mock platform config fetched the remote endpoint",
);

console.log(`business-loop-liveness: PASS (contract 1 + mutation red checks ${mutations.length + 2 + depositMutations.length})`);
