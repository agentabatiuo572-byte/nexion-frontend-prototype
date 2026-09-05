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
  const trust = read("src/components/trust/nex-anchor-section.vue");
  const homeTrust = read("src/components/home/trust-chip-wall.vue");
  const referral = read("src/pages/ref/code.vue");
  const detail = read("src/pages/store/detail.vue");
  assert.match(trust, /v-if="!remoteApiEnabled"/);
  assert.match(homeTrust, /v-if="!remoteApiEnabled"/);
  assert.match(referral, /v-if="!remoteApiEnabled"/);
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
  assert.match(trial, /v-if="!remoteApiEnabled"/);
  assert.doesNotMatch(trial, /const trialsLeft = 47/);
});

test("remote proof and team finance pages expose unavailable instead of zero defaults", () => {
  const proof = read("src/pages/me/proof.vue");
  const commissions = read("src/pages/team/commissions.vue");
  const binary = read("src/pages/team/binary.vue");
  const unilevel = read("src/pages/team/unilevel.vue");
  assert.match(proof, /remoteError/);
  assert.match(proof, /remoteApiEnabled && remoteError/);
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
