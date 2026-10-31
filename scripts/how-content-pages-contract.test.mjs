import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cases = {
  "src/pages/genesis/how-it-works.vue": "genesis-how",
  "src/pages/me/wallet-exchange-how.vue": "wallet-exchange-how",
  "src/pages/me/wallet-repurchase-how.vue": "wallet-repurchase-how",
  "src/pages/team/binary-how.vue": "team-binary-how",
  "src/pages/team/unilevel-how.vue": "team-unilevel-how",
};

test("five general How-it-works pages use the shared published-content renderer", () => {
  for (const [file, key] of Object.entries(cases)) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /HowPublishedContent/);
    assert.match(source, new RegExp(`content-key=\\"${key}\\"`));
    if (key === "team-binary-how" || key === "team-unilevel-how") {
      assert.match(source, /const howMode = howContentMode\(remoteApiEnabled\);/);
      assert.match(source, /v-if="howMode === 'published'"/);
      assert.match(source, /v-if="howMode === 'local'"/);
    } else if (key === "wallet-exchange-how") {
      assert.match(source, /v-if="remoteApiEnabled && exchangeAvailable === true"/);
      assert.match(source, /exchangeApi\.fetchCaps\(\)/);
    } else {
      assert.match(source, /v-if="remoteApiEnabled"/);
    }
    assert.doesNotMatch(source, /apiRuntimeConfig\.mode/);
  }
});

test("the commission guide reads its published document with the canonical commission facts", () => {
  const source = fs.readFileSync(path.join(root, "src/pages/team/commissions-how.vue"), "utf8");
  assert.doesNotMatch(source, /HowPublishedContent|publishedContentUnavailable/);
  assert.match(source, /howContentApi\.published\("team-commissions-how", language\)/);
  assert.match(source, /directReferralApi\.policy\(\), commissionGuideApi\.read\(\), vRankApi\.ladder\(\)/);
  assert.match(source, /createCommissionsHowResource/);
  // Since 78c1cb3d a retained snapshot stays visible while it reloads; errors and incomplete content still block.
  assert.match(source, /v-if="\(state\.loading && !state\.snapshot\) \|\| state\.error \|\| content\.incomplete"/);
  assert.match(source, /<template v-if="!state\.error && !content\.incomplete">/);
  // A language change re-reads the document through the shared resource inputs.
  assert.match(source, /const resourceInputs = \(\) => \[[^\]]*locale\.code[^\]]*\] as const;/);
  assert.match(source, /watch\(resourceInputs, reload\);/);
  assert.doesNotMatch(source, /apiRuntimeConfig\.mode/);
});

test("binary and unilevel retain the published-content error boundary in remote runtime", () => {
  // The unilevel guide is titled "团队奖励说明" since 8236439c.
  const teamPages = {
    "src/pages/team/binary-how.vue": "t\\.headerTitles\\.teamBinary \\+ t\\.headerTitles\\.howItWorksSuffix",
    "src/pages/team/unilevel-how.vue": "t\\.unilevelHowItWorks\\.navTitle",
  };

  for (const [file, titleExpression] of Object.entries(teamPages)) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /const howMode = howContentMode\(remoteApiEnabled\);/);
    assert.match(source, /v-if="howMode === 'published'"/);
    assert.match(source, /v-if="howMode === 'local'"/);
    assert.doesNotMatch(source, /publishedContentUnavailable|@unavailable=/);
    assert.match(source, new RegExp(`:title="${titleExpression}"`));
  }

  const consumer = fs.readFileSync(path.join(root, "src/components/how/how-published-content.vue"), "utf8");
  assert.match(consumer, /v-if="error"[^>]*role="alert"/);
  assert.match(consumer, /defineEmits<\{ unavailable: \[\] \}>\(\)/);
  assert.match(consumer, /emit\("unavailable"\)/);
});
