import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("bundle editor uses the real remote order lifecycle with stable command recovery", async () => {
  const [page, api] = await Promise.all([
    read("src/pages/store/bundle.vue"),
    read("src/api/bundle-order-api.ts"),
  ]);
  const checkoutStart = page.indexOf("async function onCheckout()");
  const checkoutEnd = page.indexOf("const cardStyle", checkoutStart);
  assert.ok(checkoutStart >= 0 && checkoutEnd > checkoutStart, "bundle checkout source slice must exist");
  const checkout = page.slice(checkoutStart, checkoutEnd);
  const remoteBranch = checkout.indexOf("if (remoteApiEnabled)");
  const createOrder = checkout.indexOf("bundleOrderApi.create");
  const payOrder = checkout.indexOf("orderApi.pay", createOrder);
  const activatedReadback = checkout.indexOf('settled.status !== "activated"', payOrder);
  assert.ok(remoteBranch >= 0 && createOrder > remoteBranch, "remote branch must create the canonical bundle order");
  assert.ok(payOrder > createOrder && activatedReadback > payOrder,
    "bundle order must be paid and read back as activated before success");
  assert.match(page, /acquireBundleCommand\(list, accountKey, quotedTotal\)/);
  assert.match(page, /bundleOrderApi\.create\(\s*command\.productNos, latestPolicy\.policyVersion, command\.expectedAmountUsdt, command\.key\)/);
  assert.match(page, /if \(!canonicalOrderCommitted && !idempotencyPayloadMismatch\s*&& \(policyStale \|\| quoteStale \|\| !isAmbiguousOutcome\(error\)\)\)/);
  assert.match(page, /const checkoutUnavailable = computed\(\(\) => submitting\.value \|\| walletRefreshing\.value \|\| products\.value\.length < 2[\s\S]*entry\.status !== "ready" \|\| !entry\.eligible/);
  assert.match(api, /\/api\/orders\/bundle/);
  assert.match(api, /idSource !== "server"/);
});

test("compute enrollment preserves the account-scoped command and rejects late account replies", async () => {
  const page = await read("src/pages/compute-share/download.vue");
  assert.match(page, /enrollmentJournal\.read\(expectedAccount\)/);
  assert.match(page, /function isCurrent\([\s\S]*expectedGeneration === accountGeneration/);
  assert.match(page, /runComputeShareEnrollmentFlow\([\s\S]*journal: enrollmentJournal/);
  assert.match(page, /if \(!isCurrent\(expectedAccount, expectedGeneration, expectedLifecycle\)\) return/);
});

test("remote team projection never turns errors into zero or local royalty money", async () => {
  const [store, page] = await Promise.all([read("src/store/network.ts"), read("src/pages/team/unilevel.vue")]);
  assert.doesNotMatch(store, /catch \{[\s\S]{0,260}totalMembers\.value = 0/);
  assert.match(page, /remoteTotalUSDT\.toFixed\(2\)/);
  assert.match(page, /v-if="!remoteApiEnabled"/);
  assert.match(page, /projectionErrorTitle/);
});

test("global search offers Help Center and old AI links return to the inbox", async () => {
  const [search, chat] = await Promise.all([
    read("src/pages/search/search.vue"),
    read("src/pages/support/chat.vue"),
  ]);
  assert.match(search, /group: "help"/);
  assert.match(search, /href: "\/pages\/me\/help"/);
  assert.doesNotMatch(search, /type=ai/);
  assert.match(search, /refreshProductCatalog/);
  assert.match(search, /refreshCanonicalNetwork/);
  assert.match(chat, /if \(!NOVA_SUPPORT_VISIBLE\) \{/);
  assert.match(chat, /navReplace\("\/pages\/support\/messages"\)/);
});

test("remote device activation and deactivation use server CAS and verify the fleet before success", async () => {
  const [api, page, types] = await Promise.all([
    read("src/api/device-e3-api.ts"),
    read("src/pages/me/devices.vue"),
    read("src/store/types.ts"),
  ]);
  assert.match(types, /rowVersion\?:\s*number/);
  assert.match(api, /activate\(deviceId:\s*number,\s*expectedVersion:\s*number/);
  assert.match(api, /deactivate\(deviceId:\s*number,\s*expectedVersion:\s*number/);
  assert.match(api, /path:\s*`\/api\/device\/\$\{deviceId\}\/deactivate`/);
  assert.match(api, /body:\s*\{\s*expectedVersion/);
  assert.match(page, /runRemoteDeviceCommand[\s\S]*deviceE3Api\.activate/);
  assert.match(page, /runRemoteDeviceCommand[\s\S]*deviceE3Api\.deactivate/);
  assert.match(page, /await app\.refreshRemoteFleet\(\)/);
  assert.match(page, /DEVICE_ACTIVATION_NOT_CONFIRMED|DEVICE_DEACTIVATION_NOT_CONFIRMED/);
  assert.match(page, /if \(ok && remoteApiEnabled\) await runRemoteDeviceCommand[\s\S]{0,80}else if \(ok\)/);
});

test("remote trial conversion and deferred device deactivation are server commands with readback", async () => {
  const [trialApi, trialStore, checkout, deviceApi, devices] = await Promise.all([
    read("src/api/trial-api.ts"), read("src/store/free-trial.ts"),
    read("src/pages/store/checkout.vue"), read("src/api/device-e3-api.ts"),
    read("src/pages/me/devices.vue"),
  ]);
  assert.match(trialApi, /path: "\/api\/trial\/convert"/);
  assert.match(trialApi, /sourceEnvironment !== "PRODUCTION"|sourceEnvironment: "PRODUCTION"/);
  assert.match(trialStore, /trialApi\.convert/);
  assert.match(trialStore, /refreshRemote\(true\)/);
  assert.match(checkout, /await freeTrial\.convert/);
  assert.match(deviceApi, /deactivateAfterTask|deactivate-after-task/);
  assert.match(devices, /runRemoteDeferredCommand/);
  assert.match(devices, /deviceE3Api\.deactivateAfterTask/);
  assert.match(devices, /deferredCommandInFlight/);
  assert.match(devices, /captureAccountScope|createRemoteAccountEpoch/);
  assert.match(devices, /isCurrentAccountScope/);
  assert.match(devices, /accountKey !== app\.accountKey/);
  assert.match(devices, /finishDeviceCommand\(accountKey, "deactivate-after-task"/);
  assert.match(devices, /await app\.refreshRemoteFleet\(\)/);
  assert.match(devices, /toast\.success/);
});

test("remote deferred deactivation survives fleet refresh and relogin", async () => {
  const [deviceApi, app, devices] = await Promise.all([
    read("src/api/device-e3-api.ts"), read("src/store/app.ts"), read("src/pages/me/devices.vue"),
  ]);
  assert.match(deviceApi, /pendingDeactivate/);
  assert.match(app, /pendingDeactivate:\s*device\.pendingDeactivate/);
  assert.match(devices, /(?:device|d)\.pendingDeactivate/);
  assert.match(devices, /pendingDeactivate/);
  assert.match(devices, /action-disabled=.*pendingDeactivate/);
});

test("remote ambassador applications are self-scoped server commands instead of success toasts", async () => {
  const [api, page, runtime] = await Promise.all([
    read("src/api/ambassador-application-api.ts"),
    read("src/pages/team/agent.vue"),
    read("src/api/runtime.ts"),
  ]);
  assert.match(api, /\/api\/app\/team\/ambassador-applications/);
  assert.match(api, /idempotencyKey/);
  assert.match(api, /latest\(\)/);
  assert.match(runtime, /createAmbassadorApplicationApi/);
  assert.match(page, /ambassadorApplicationApi\.submit/);
  assert.match(page, /ambassadorApplicationApi\.latest/);
  assert.match(page, /remoteApiEnabled/);
  assert.match(page, /accountKey|identity/);
});

test("remote leaderboard, leadership pool, and commission pages use self-scoped server projections", async () => {
  const [api, runtime, leaderboard, pool, commission] = await Promise.all([
    read("src/api/team-insights-api.ts"), read("src/api/runtime.ts"),
    read("src/pages/team/leaderboard.vue"), read("src/pages/team/leadership-pool.vue"),
    read("src/store/commission.ts"),
  ]);
  assert.match(api, /\/api\/app\/team\/insights/);
  assert.match(api, /sourceEnvironment/);
  assert.match(runtime, /createTeamInsightsApi/);
  assert.match(leaderboard, /teamInsightsApi\.leaderboard/);
  assert.match(leaderboard, /remoteApiEnabled/);
  assert.match(leaderboard, /const runScope = captureRuntimeRevision\(\)/);
  assert.match(leaderboard, /accountKey === app\.accountKey[\s\S]*isCurrentAccountScope\(accountScope\)[\s\S]*isCurrentRuntimeRevision\(runScope\)/);
  assert.match(leaderboard, /remoteState !== 'ready'/);
  assert.match(leaderboard, /remoteState\.value = "error"/);
  assert.doesNotMatch(leaderboard, /myRank:\s*remoteSnapshot\.value\?\.myRank \?\? 0/);
  assert.match(pool, /teamInsightsApi\.leadershipPool/);
  assert.match(pool, /const runScope = captureRuntimeRevision\(\)/);
  assert.match(pool, /accountKey === app\.accountKey[\s\S]*isCurrentAccountScope\(accountScope\)[\s\S]*isCurrentRuntimeRevision\(runScope\)/);
  assert.match(pool, /remoteState !== 'ready'/);
  assert.match(pool, /remoteState\.value = leadershipPoolFailureState\(cause\)/);
  const poolFailure = await read("src/lib/leadership-pool-state.ts");
  assert.match(poolFailure, /cause instanceof ApiError/);
  assert.match(poolFailure, /cause\.message === "F4_LEADERSHIP_POOL_HOLD"/);
  assert.match(poolFailure, /\? "hold" : "error"/);
  assert.match(commission, /teamInsightsApi\.commissions/);
  assert.match(commission, /bindingEpoch \+= 1/);
  for (const generation of ["binaryRefreshGeneration", "eventsRefreshGeneration"]) {
    assert.match(commission, new RegExp(`if \\(generation !== ${generation} \\|\\| !isCurrentScope\\(scope\\)\\) return`));
    assert.match(commission, new RegExp(`generation === ${generation} && isCurrentScope\\(scope\\)`));
  }
});

test("remote unilevel page renders only the server cycle/source/layer/split projection", async () => {
  const [api, page] = await Promise.all([
    read("src/api/team-insights-api.ts"), read("src/pages/team/unilevel.vue"),
  ]);
  assert.match(api, /TeamUnilevelSnapshot/);
  assert.match(api, /const root="\/api\/app\/team\/insights"[\s\S]*root}\/unilevel/);
  assert.match(api, /cycle/);
  assert.match(api, /amountUSDT/);
  assert.match(page, /teamInsightsApi\.unilevel/);
  assert.match(page, /const remoteFilteredEvents = computed\(\(\) => \(remoteSnapshot\.value\?\.events \?\? \[\]\)\.filter/);
  assert.match(page, /filter\.value === "all" \|\| \(filter\.value === "direct" \? event\.layer === 1 : event\.layer > 1\)/);
  assert.match(page, /v-for="\(event, i\) in remoteFilteredEvents"/);
  assert.match(page, /v-if="remoteFilteredEvents\.length === 0"/);
  assert.match(page, /remoteState\.value === "error"/);
  assert.match(page, /v-if="remoteApiEnabled && unilevelLoadError"/);
  assert.match(page, /const unilevelLoadError = computed\(\(\) => network\.remoteStatus === "error"[\s\S]*remoteState\.value === "error" \|\| commission\.configStatus === "error"/);
  assert.match(page, /const runScope = captureRuntimeRevision\(\)/);
  assert.match(page, /accountKey === app\.accountKey[\s\S]*isCurrentAccountScope\(accountScope\)[\s\S]*isCurrentRuntimeRevision\(runScope\)/);
  assert.doesNotMatch(page, /remoteApiEnabled[\s\S]{0,220}Math\.log10/);
});

test("proof cards render a decodable QR and only confirm PNG after a real canvas export", async () => {
  const page = await read("src/pages/me/proof.vue");
  assert.match(page, /qrcode-generator/);
  assert.match(page, /createCanvasContext\("proofPosterCanvas"/);
  assert.match(page, /canvasToTempFilePath/);
  assert.match(page, /saveImageToPhotosAlbum|downloadProofOnH5/);
  assert.doesNotMatch(page, /visual cue only/);
  assert.doesNotMatch(page, /function downloadPng\(\) \{\s*toast\.success/);
});

test("production wallet bills come from the authenticated server ledger", async () => {
  const [api, store, page, runtime] = await Promise.all([
    read("src/api/wallet-bills-api.ts"),
    read("src/store/bills.ts"),
    read("src/pages/me/wallet-bills.vue"),
    read("src/api/runtime.ts"),
  ]);
  assert.match(api, /\/api\/app\/wallet\/bills/);
  assert.match(api, /sourceEnvironment !== "PRODUCTION"/);
  assert.match(runtime, /createWalletBillsApi/);
  assert.match(store, /walletBillsApi\.list/);
  assert.match(store, /refreshServerLedger/);
  assert.doesNotMatch(store, /FUNDS_BILLS_PROVIDER_NOT_CONFIGURED/);
  assert.match(page, /getLedger/);
  assert.match(page, /activePager\.value\.refresh/);
  assert.doesNotMatch(page, /refreshServerLedger/);
});

test("remote Genesis holder renders server holdings and emission ledger without fabricated ranks or token ids", async () => {
  const [api, store, holder] = await Promise.all([
    read("src/api/genesis-api.ts"),
    read("src/store/genesis.ts"),
    read("src/pages/genesis/holder.vue"),
  ]);
  assert.match(api, /interface GenesisEmission/);
  assert.match(api, /emissions:\s*row\.emissions\.map/);
  assert.match(store, /remoteHoldings/);
  assert.match(store, /remoteEmissions/);
  assert.match(holder, /remoteApiEnabled \? genesis\.remoteHoldings/);
  assert.match(holder, /genesis\.remoteEmissions/);
  assert.doesNotMatch(holder, /0x7a…f2|crypto_lion|22,540/);
  assert.doesNotMatch(holder, /4192 - i \* 137/);
});

test("remote globe and search refresh when account or canonical catalog changes", async () => {
  const [globe, search] = await Promise.all([
    read("src/pages/globe/globe.vue"),
    read("src/pages/search/search.vue"),
  ]);
  assert.match(globe, /watch\(\(\) => \[String\(app\.accountKey\), app\.accountBindingEpoch\]/);
  assert.match(globe, /networkProjection\.value = null/);
  assert.match(globe, /void loadRegions\(\)/);
  assert.match(search, /productCatalogState/);
  assert.match(search, /productCatalogState\.status === "ready"/);
  assert.match(search, /@keydown\.enter\.prevent="openHelp"/);
  assert.match(search, /@keydown\.space\.prevent="openHelp"/);
});
