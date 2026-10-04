import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("remote H8 share surfaces use only the current server projection", () => {
  const share = read("src/lib/share.ts");
  const card = read("src/components/team/invite-earn-card.vue");

  assert.match(share, /useReferralReward/);
  assert.match(share, /remoteApiEnabled[\s\S]*useReferralReward\(\)\.snapshot\?\.referralCode/);
  assert.match(share, /export async function recordShareEvent[\s\S]*if \(remoteApiEnabled\)[\s\S]*sourceEnvironment = "PRODUCTION"[\s\S]*runId = ""[\s\S]*return runShareEventFlight/);
  assert.match(share, /return runShareEventFlight[\s\S]*uni\.setStorageSync/);
  assert.match(card, /rewards\.snapshot\?\.referralCode/);
  assert.doesNotMatch(card, /canonical === app\.user\.referralCode/);
});

test("remote H8 team metrics keep server-backed team entries visible", () => {
  const team = read("src/pages/team/team.vue");

  assert.match(team, /useReferralReward/);
  assert.match(team, /referralRewards\.snapshot\?\.invitedCount/);
  assert.doesNotMatch(team, /v-if="!remoteApiEnabled"[\s\S]*nx-team-leadership-pool-link/);
  assert.match(team, /<TeamLedgerCard[\s\S]*:total-u-s-d-t-lifetime/);
  assert.match(team, /function openReferralNetwork\(\) \{[\s\S]*go\("\/pages\/team\/unilevel"\)/);
  assert.match(team, /network\.refreshCanonicalNetwork\(\)/);
  assert.doesNotMatch(team, /nx-team-leaderboard-link[\s\S]*v-if="!remoteApiEnabled"/);
  assert.doesNotMatch(team, /<!-- Team tools -->[\s\S]*v-if="!remoteApiEnabled"/);
  assert.match(team, /go\('\/pages\/team\/quota'\)[\s\S]*go\('\/pages\/team\/agent'\)[\s\S]*go\('\/pages\/team\/network'\)[\s\S]*go\('\/pages\/team\/tree'\)/);
});

test("H8 drops malformed or stale-account projections instead of retaining another account's data", () => {
  const store = read("src/store/referral-reward.ts");
  const accountScope = read("src/lib/account-scope.ts");

  assert.match(store, /createRemoteAccountEpoch\(\)/);
  assert.match(store, /accountScope\.snapshot\(\)[\s\S]*captureRuntimeRevision\(\)/);
  assert.match(store, /accountScope\.isCurrent\(request\)[\s\S]*isCurrentRuntimeRevision\(runScope\)/);
  assert.match(store, /accountScope\.bind\(accountKey\);[\s\S]*refreshGeneration \+= 1;[\s\S]*snapshot\.value = null/);
  assert.match(store, /snapshot\.value = null;[\s\S]*error\.value = cause/);
  assert.match(accountScope, /useReferralReward\(\)\.bindAccount\(accountKey\)/);
});

test("H8 invitation summary keeps authoritative server data across refresh and relogin", () => {
  const card = read("src/components/team/invite-earn-card.vue");
  const api = read("src/api/referral-reward-api.ts");
  const en = read("src/i18n/messages/en.ts");
  const zh = read("src/i18n/messages/zh.ts");
  const vi = read("src/i18n/messages/vi.ts");

  assert.doesNotMatch(card, /data-testid="h8-sandbox-banner"/);
  assert.doesNotMatch(card, /RunID \{\{ sandboxRunId \}\}/);
  assert.doesNotMatch(card, />Server-set reward per settled invitation</);
  assert.doesNotMatch(card, /`\$\{rewards\.snapshot\.settledCount\} settled/);
  assert.doesNotMatch(card, />Share &amp; earn/);
  assert.doesNotMatch(card, /"settled to wallet"/);
  for (const messages of [en, zh, vi]) {
    assert.match(messages, /serverRewardPerSettlement:/);
    assert.match(messages, /settlementStatus:/);
    assert.match(messages, /settledToWallet:/);
  }
  assert.match(api, /mode === "prod" \|\| mode === "dev"[\s\S]*sourceEnvironment === "PRODUCTION"[\s\S]*runId === null/);
  assert.match(api, /const PRODUCTION_FACTS = \["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"\]/);
});

test("remote registration submits the captured referral code to the server", () => {
  const register = read("src/pages/register/register.vue");
  const recovery = read("src/auth/registration-auto-login.ts");

  assert.match(register, /registerAndLogin\(authApi,[\s\S]*sponsorCode:\s*currentSponsorCode\(\)/);
  assert.match(recovery, /authApi\.register\(request\)/);
});
