import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const courses = await readFile(new URL("./courses.vue", import.meta.url), "utf8");
const course = await readFile(new URL("./course.vue", import.meta.url), "utf8");

test("learning list and course pages guard async state with account/run/generation/mount scope", () => {
  for (const [name, source] of [["courses", courses], ["course", course]]) {
    assert.match(source, /createLearningPageFenceReader/);
    assert.match(source, /captureRuntimeRevision/);
    assert.match(source, /onUnmounted/);
    assert.match(source, /generation \+= 1/);
    assert.match(source, /watch\(\(\) => String\(app\.accountKey\)/);
    assert.match(source, /if \(current\(scope\)\)/, `${name} should guard state writes`);
  }
  assert.match(course, /const scope = fence\(\);[\s\S]*learningApi\.start/);
  assert.match(course, /recoverAuthoritative\(scope, submittedCourse\)/);
  assert.match(course, /watch\(\(\) => app\.accountBindingEpoch, refreshForScopeChange\)/);
  assert.match(course, /watch\(\(\) => language\.value, refreshForScopeChange\)/);
  assert.match(course, /\(\) => courseId\.value/);
  assert.match(course, /!startConfirmed\.value/);
});

test("course page restores canonical result details and committed quiz receipts", () => {
  assert.match(course, /learningResultDetails\(course\.value, result\.value\)/);
  assert.match(course, /currentPendingLearningAttempt\(identity\)/);
  assert.match(course, /learningApi\.quizReceipt\(expectedCourse\.id, expectedCourse\.version, pending\.key\)/);
  assert.match(course, /matchingCourseResult\(expectedCourse, submitted\)/);
  assert.match(course, /pendingLearningAttempt\(identity, submittedAnswers\)/);
  assert.match(course, /t\.value\.learning\.resultScore/);
  assert.match(course, /t\.value\.learning\.resultAttempts/);
  assert.match(course, /t\.value\.learning\.rewardNotGranted/);
  assert.doesNotMatch(course, /没有任何接口能取回/);
});
