import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("remote earnings display never fabricates a tick", () => {
  const ticker = read("src/composables/use-ticker.ts");
  const card = read("src/components/home/tech-money-card.vue");
  assert.doesNotMatch(ticker, /Math\.random\s*\(/);
  assert.match(card, /remoteApiEnabled/);
  assert.match(card, /homeTruth\?\.earnings\.today\.usdt/);
  assert.match(card, /remoteToday/);
});

test("remote NEX wallet does not render synthetic mining history", () => {
  const page = read("src/pages/me/wallet-nex.vue");
  // Prototype fixtures may retain synthetic rows, but remote must return the
  // server ledger projection before the fixture branch is reached.
  assert.match(page, /if \(remoteApiEnabled\) return nexLedger/);
  assert.match(page, /mine-\$\{i\}/);
  assert.match(page, /remoteApiEnabled/);
  assert.match(page, /nexLedger/);
  assert.doesNotMatch(page, /value:\s*"0 NEX"/);
});

test("remote trust and storefront surfaces do not expose static endorsements", () => {
  const retiredTrustFixture = path.join(root, "src/components/trust/nex-anchor-section.vue");
  const trust = read("src/pages/trust/trust.vue");
  const homeTrust = read("src/components/home/trust-chip-wall.vue");
  const referral = read("src/pages/ref/code.vue");
  const detail = read("src/pages/store/detail.vue");
  assert.equal(fs.existsSync(retiredTrustFixture), false);
  assert.match(trust, /usePublishedTrust/);
  assert.match(homeTrust, /trustSnapshotUnavailable/);
  assert.doesNotMatch(homeTrust, /summary\.chips|summary\.reserveProof|trust-chip-/);
  assert.doesNotMatch(homeTrust, /MOCK_CHIPS/);
  assert.doesNotMatch(homeTrust, /summary\?\.hero/);
  assert.doesNotMatch(homeTrust, /trustSnapshotTvl/);
  assert.doesNotMatch(referral.split("</template>")[0], /PARTNER_LOGOS|SOC 2 Type II|ISO 27001|certikAudited/);
  assert.match(detail, /v-if="!remoteApiEnabled"/);
  assert.match(referral, /remotePreview/);
  assert.match(referral, /remoteApiEnabled && !remotePreview/);
});

test("remote network and commission surfaces use server timing without random or fixed 30d copy", () => {
  const network = read("src/pages/team/network.vue");
  const commissions = read("src/pages/team/commissions.vue");
  assert.doesNotMatch(network, /Math\.random\s*\(/);
  assert.doesNotMatch(commissions, /Unlocks in 30d/);
  assert.match(commissions, /unlockAt/);
});

test("remote onboarding and trial surfaces fail closed on local business constants", () => {
  const quest = read("src/components/home/day-one-quest-card.vue");
  const trial = read("src/components/trial-hero-banner.vue");
  assert.match(quest, /quest\.remoteStatus/);
  assert.match(quest, /rewardText/);
  assert.doesNotMatch(quest, /18 \* 3600_000/);
  assert.match(trial, /const visible = computed\(\(\) => trial\.status === "none"/);
  assert.match(trial, /trialCfg\.config\.seatsLeftToday > 0/);
  assert.doesNotMatch(trial, /const trialsLeft = 47/);
});

test("remote proof and team finance pages expose unavailable instead of zero defaults", () => {
  const proof = read("src/pages/me/proof.vue");
  const commissions = read("src/pages/team/commissions.vue");
  const binary = read("src/pages/team/binary.vue");
  const unilevel = read("src/pages/team/unilevel.vue");
  assert.match(proof, /remoteError/);
  assert.match(proof, /remoteApiEnabled && remoteError/);
  assert.match(proof, /remoteApiEnabled && !vRank\.remoteReady \? null/);
  assert.match(proof, /=== null \? "—"/);
  assert.match(commissions, /commission\.eventsStatus/);
  assert.match(binary, /commission\.binaryStatus/);
  assert.match(unilevel, /remoteState === 'ready'/);
});

test("remote static partner wall and telemetry/mining/rank defaults are gated", () => {
  const developer = read("src/pages/developer/developer.vue");
  const globe = read("src/pages/globe/globe.vue");
  const wallet = read("src/pages/me/wallet-nex.vue");
  const network = read("src/pages/team/network.vue");
  const team = read("src/pages/team/team.vue");
  assert.match(developer, /v-if="!remoteApiEnabled"/);
  assert.match(globe, /activeNodesText.*—/s);
  assert.match(globe, /activeJobsText.*—/s);
  assert.match(wallet, /todayNEX.*number \| null/);
  assert.match(network, /myRankText/);
  assert.match(team, /const extendedCountText[\s\S]*if \(remoteApiEnabled/);
});

test("server runtimes never hydrate or mutate the legacy local receipt store", () => {
  const page = read("src/pages/me/receipts.vue");
  const store = read("src/store/receipts.ts");
  const deposits = read("src/store/deposits.ts");
  assert.match(page, /const remoteReceiptsMode = remoteApiEnabled/);
  assert.doesNotMatch(page, /remoteApiEnabled\s*&&\s*!developmentFundsEnabled/);
  assert.match(store, /remoteApiEnabled \? \[\] : hydrate\(boundKey\)/);
  assert.match(store, /if \(remoteApiEnabled\) return false/);
  assert.match(page, /depositsStore\.refreshRemoteVietQrDeposits\(\)/);
  assert.match(deposits, /paymentApi\.listVietQrReceipts\(50, 0\)/);
  assert.match(deposits, /succeedVietQrReceiptPageRead\([\s\S]*receiptPage\.items/);
});

test("VietQR limits, availability and fees stay server-configured in sandbox and production", () => {
  const pane = read("src/components/me/deposit-bank-pane.vue");
  const fx = read("src/store/fx.ts");
  assert.match(pane, /remoteApiEnabled \? fx\.minDepositUsdt : MIN_DEPOSIT_USDT/);
  assert.match(pane, /remoteApiEnabled \? fx\.maxDepositUsdt : BANK_MAX_DEPOSIT_USDT/);
  assert.match(pane, /remoteApiEnabled \? fx\.vietQrEnabled : dep\.bankRailAvailable/);
  assert.match(pane, /usdt < minDeposit\.value \|\| usdt > maxDeposit\.value/);
  assert.match(fx, /paymentApi\.config\(\)/);
  assert.match(fx, /paymentApi\.fxQuote\(\)/);
});
