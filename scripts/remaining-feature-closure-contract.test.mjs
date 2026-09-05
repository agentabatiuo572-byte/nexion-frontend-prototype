import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("bundle editor uses the real remote order lifecycle with stable command recovery", async () => {
  const [page, api] = await Promise.all([
    read("src/pages/store/bundle.vue"),
    read("src/api/bundle-order-api.ts"),
  ]);
  assert.match(page, /if \(remoteApiEnabled\)[\s\S]{0,900}bundleOrderApi\.create/);
  assert.match(page, /acquireBundleKey\(list, accountKey\)/);
  assert.match(page, /if \(!isAmbiguousOutcome\(error\)\) retireBundleKey/);
  assert.match(page, /checkoutUnavailable = computed\(\(\) => submitting\.value \|\| products\.value\.length < 2\)/);
  assert.match(api, /\/api\/orders\/bundle/);
  assert.match(api, /idSource !== "server"/);
});

test("compute enrollment preserves the account-scoped command and rejects late account replies", async () => {
  const page = await read("src/pages/compute-share/download.vue");
  assert.match(page, /storageScope\(accountKey: string\)/);
  assert.match(page, /expectedGeneration !== accountGeneration/);
  assert.match(page, /readPending\(accountKey\) \?\? undefined/);
  assert.match(page, /fundsSandboxEnabled[\s\S]{0,120}sandboxHold/);
});

test("remote team projection never turns errors into zero or local royalty money", async () => {
  const [store, page] = await Promise.all([read("src/store/network.ts"), read("src/pages/team/unilevel.vue")]);
  assert.doesNotMatch(store, /catch \{[\s\S]{0,260}totalMembers\.value = 0/);
  assert.match(page, /remoteTotalUSDT\.toFixed\(2\)/);
  assert.match(page, /v-if="!remoteApiEnabled"/);
  assert.match(page, /projectionErrorTitle/);
});

test("global search always offers the real Nova route and carries the query", async () => {
  const [search, chat] = await Promise.all([
    read("src/pages/search/search.vue"),
    read("src/pages/support/chat.vue"),
  ]);
  assert.match(search, /group: "help"/);
  assert.match(search, /type=ai&prompt=/);
  assert.match(search, /refreshProductCatalog/);
  assert.match(search, /refreshCanonicalNetwork/);
  assert.match(chat, /initialPrompt/);
  assert.match(chat, /key: "search-query"/);
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
  assert.match(leaderboard, /accountKey !== app\.accountKey/);
  assert.match(leaderboard, /remoteState !== 'ready'/);
  assert.match(leaderboard, /remoteState\.value = "error"/);
  assert.doesNotMatch(leaderboard, /myRank:\s*remoteSnapshot\.value\?\.myRank \?\? 0/);
  assert.match(pool, /teamInsightsApi\.leadershipPool/);
  assert.match(pool, /accountKey !== app\.accountKey/);
  assert.match(pool, /remoteState !== 'ready'/);
  assert.match(pool, /remoteState\.value = "error"/);
  assert.match(commission, /teamInsightsApi\.commissions/);
  assert.match(commission, /bindingEpoch \+= 1/);
  assert.match(commission, /if \(!isCurrentScope\(scope\)\) return/);
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
  assert.match(page, /remoteSnapshot\?\.events/);
  assert.match(page, /remoteState === 'error'/);
  assert.match(page, /accountKey !== app\.accountKey/);
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
  assert.match(page, /refreshServerLedger/);
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
  assert.match(globe, /watch\(\(\) => String\(app\.accountKey\)/);
  assert.match(globe, /networkProjection\.value = null/);
  assert.match(globe, /void loadRegions\(\)/);
  assert.match(search, /productCatalogState/);
  assert.match(search, /productCatalogState\.status === "ready"/);
  assert.match(search, /@keydown\.enter\.prevent="openNova\(''\)"/);
  assert.match(search, /@keydown\.space\.prevent="openNova\(''\)"/);
});
