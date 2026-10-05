import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const howPage = source("../src/pages/team/leadership-pool-how.vue");
assert.match(howPage, /subscribeRuntimeRevision/);
assert.match(howPage, /captureRuntimeRevision/);
assert.match(howPage, /isCurrentRuntimeRevision/);
assert.match(howPage, /unsubscribeRemotePoolRun/);
assert.match(howPage, /remotePool\.value = null/);
assert.match(howPage, /void loadRemotePool\(\)/);
assert.match(howPage, /import \{ remoteApiEnabled, teamInsightsApi \} from "@\/api\/runtime"/);
assert.match(howPage, /remoteApiEnabled \? "loading" : "ready"/);
assert.match(howPage, /if \(!remoteApiEnabled\) return;/);
assert.match(howPage, /rank: facts\.value\.unlockRank/);
assert.match(howPage, /new Date\(facts\.value\.nextPayoutAt\)/);
assert.doesNotMatch(howPage, /voteRows|V_VOTES|leadershipHowRows|leadershipHowRanks|injectRatePct/);
for (const locale of ["zh", "en", "vi"]) {
  const messages = source(`../src/i18n/messages/${locale}.ts`);
  const rules = messages.match(/poolHowItWorks: \{[\s\S]*?currentRules: "([^"]+)"/)?.[1] ?? "";
  assert.ok(rules.includes("{rank}"), `${locale} pool eligibility`);
  assert.doesNotMatch(rules, /\{rate\}|票权|votes|phiếu/i, `${locale} pool explanation keeps formulas private`);
}

const homeCard = source("../src/components/home/leadership-pool-card.vue");
assert.match(homeCard, /teamInsightsApi\.leadershipPool\(\)/);
assert.match(homeCard, /remoteApiEnabled/);
assert.match(homeCard, /subscribeRuntimeRevision/);
assert.match(homeCard, /captureAccountScope/);
assert.match(homeCard, /captureRuntimeRevision/);
assert.match(homeCard, /isCurrentRuntimeRevision/);

console.log("leadership pool consumers: PASS");
