import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const howPage = source("../src/pages/team/leadership-pool-how.vue");
// Help is static copy. The live page still owns refresh and account isolation.
assert.match(howPage, /publicCopy\.earningsHelp/);
assert.doesNotMatch(howPage, /V_VOTES|globalVDistribution|totalVotes|teamInsightsApi/);
const poolPage = source("../src/pages/team/leadership-pool.vue");
assert.match(poolPage, /teamInsightsApi\.leadershipPool\(\)/);
assert.match(poolPage, /subscribeCurrentCommerceSandboxRun/);
assert.match(poolPage, /unsubscribePoolRun\(\)/);
assert.match(poolPage, /remotePool\.value = null/);
assert.match(poolPage, /void loadRemotePool\(\)/);
assert.match(poolPage, /if \(!remoteApiEnabled\) return;/);
assert.match(poolPage, /captureAccountScope/);
assert.match(poolPage, /isCurrentAccountScope/);
assert.match(poolPage, /isCurrentCommerceSandboxScope/);
assert.match(poolPage, /remoteState\.value = "error"/);
assert.doesNotMatch(poolPage.split("<script")[0], /rankWeights|concentrationHint|peopleVotesEa/);

const homeCard = source("../src/components/home/leadership-pool-card.vue");
assert.match(homeCard, /teamInsightsApi\.leadershipPool\(\)/);
assert.match(homeCard, /remoteApiEnabled/);
assert.match(homeCard, /subscribeCurrentCommerceSandboxRun/);
assert.match(homeCard, /captureAccountScope/);
assert.match(homeCard, /captureCommerceSandboxRun/);

console.log("leadership pool consumers: PASS");
