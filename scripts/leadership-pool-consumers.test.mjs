import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const howPage = source("../src/pages/team/leadership-pool-how.vue");
assert.match(howPage, /subscribeCurrentCommerceSandboxRun/);
assert.match(howPage, /unsubscribeRemotePoolRun/);
assert.match(howPage, /remotePool\.value = null/);
assert.match(howPage, /void loadRemotePool\(\)/);
assert.match(howPage, /import \{ remoteApiEnabled, teamInsightsApi \} from "@\/api\/runtime"/);
assert.match(howPage, /useLeadershipPool, V_VOTES/);
assert.match(howPage, /remoteApiEnabled \? "loading" : "ready"/);
assert.match(howPage, /if \(!remoteApiEnabled\) return;/);
assert.match(howPage, /pool\.totalVotes\(\)/);
assert.match(howPage, /pool\.globalVDistribution\[v\]/);
assert.match(howPage, /votes: V_VOTES\[v\]/);

const homeCard = source("../src/components/home/leadership-pool-card.vue");
assert.match(homeCard, /teamInsightsApi\.leadershipPool\(\)/);
assert.match(homeCard, /remoteApiEnabled/);
assert.match(homeCard, /subscribeCurrentCommerceSandboxRun/);
assert.match(homeCard, /captureAccountScope/);
assert.match(homeCard, /captureCommerceSandboxRun/);

console.log("leadership pool consumers: PASS");
