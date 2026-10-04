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
assert.match(howPage, /useLeadershipPool, V_VOTES/);
assert.match(howPage, /remoteApiEnabled \? "loading" : "ready"/);
assert.match(howPage, /if \(!remoteApiEnabled\) return;/);
assert.match(howPage, /pool\.totalVotes\(\)/);
// The local fallback was moved behind the shared row derivation; assert the
// data inputs and derivation rather than its former inline loop variable.
assert.match(howPage, /localDistribution\[vRank\] \?\? 0/);
assert.match(howPage, /localVotes\[vRank\] \?\? 0/);
assert.match(howPage, /leadershipHowRows\(snapshot, ranks, remoteApiEnabled \? configuredVotes\.value/);
for (const [locale, configured, participants] of [
  ["zh", "当前配置的等级票权", "实际参与"],
  ["en", "configured vote weights", "actual participants"],
  ["vi", "trọng số phiếu theo hạng", "người thực sự tham gia"],
]) {
  const messages = source(`../src/i18n/messages/${locale}.ts`);
  const intro = messages.match(/poolHowItWorks: \{[\s\S]*?s2Intro: "([^"]+)"/)?.[1] ?? "";
  assert.ok(intro.includes(configured) && intro.includes(participants), `${locale} pool vote explanation`);
}

const homeCard = source("../src/components/home/leadership-pool-card.vue");
assert.match(homeCard, /teamInsightsApi\.leadershipPool\(\)/);
assert.match(homeCard, /remoteApiEnabled/);
assert.match(homeCard, /subscribeRuntimeRevision/);
assert.match(homeCard, /captureAccountScope/);
assert.match(homeCard, /captureRuntimeRevision/);
assert.match(homeCard, /isCurrentRuntimeRevision/);

console.log("leadership pool consumers: PASS");
