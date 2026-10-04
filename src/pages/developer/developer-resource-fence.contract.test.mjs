import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./developer.vue", import.meta.url), "utf8");
const fenceSource = await readFile(new URL("./developer-resource-fence.ts", import.meta.url), "utf8");
const docsFenceSource = await readFile(new URL("./developer-docs-fence.ts", import.meta.url), "utf8");
const journalSource = await readFile(new URL("./developer-rotation-journal.ts", import.meta.url), "utf8");

test("developer resource operations all capture and validate the account fence", () => {
  assert.match(fenceSource, /captureRuntimeRevision/);
  assert.match(fenceSource, /isCurrentRuntimeRevision/);
  assert.match(fenceSource, /captureAccountScope/);
  assert.match(fenceSource, /isCurrentAccountScope/);
  assert.match(source, /let resourceGeneration = 0/);
  assert.match(source, /resetResourceScope\(\);/);
  assert.match(source, /if \(!resourceFenceCurrent\(fence\)\) return;/);

  for (const functionName of ["createApiKey", "revokeApiKey", "createWebhook", "deleteWebhook", "rotateWebhook", "setWebhookEnabled", "loadWebhookDeliveries"]) {
    const start = source.indexOf(`async function ${functionName}`);
    assert.notEqual(start, -1, `${functionName} should exist`);
    const body = source.slice(start, source.indexOf("\n}", start) + 2);
    assert.match(body, /const fence = resourceFence\(\);/, `${functionName} should capture a fence`);
    assert.match(body, /resourceFenceCurrent\(fence\)/, `${functionName} should reject stale responses`);
  }

  const loadStart = source.indexOf("async function loadResources");
  const loadBody = source.slice(loadStart, source.indexOf("async function loadDocs", loadStart));
  assert.match(loadBody, /fence = resourceFence\(\)/);
  assert.match(loadBody, /resourceFenceCurrent\(fence\)/);
});

test("dangerous developer-resource actions confirm before their request and keep delivery history scoped", () => {
  assert.match(source, /import \{ confirm, toast, useUI \} from "@\/store\/ui"/);
  for (const functionName of ["revokeApiKey", "deleteWebhook", "rotateWebhook"]) {
    const start = source.indexOf(`async function ${functionName}`);
    const body = source.slice(start, source.indexOf("\nasync function", start + 1));
    assert.match(body, /runConfirmedDeveloperMutation/);
    assert.match(body, /\(\) => askDeveloperConfirmation\(/);
  }
  assert.match(source, /developerResourcesApi\.listWebhookDeliveries\(item\.id\)/);
  assert.match(source, /developerResourcesApi\.setWebhookEnabled\(item\.id, enabled/);
  assert.match(source, /\(\) => resourceFenceCurrent\(fence\)/);
  assert.match(source, /newKeySecret\.value = null/);
  assert.match(source, /newWebhookSecret\.value = null/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage).*?(?:newKeySecret|newWebhookSecret)/);
});

test("hiding the page invalidates developer-resource confirmations before they can mutate", () => {
  assert.match(source, /function askDeveloperConfirmation[\s\S]*?owner = `developer-resources:\$\{resourceGeneration\}:\$\{\+\+confirmationSequence\}`/);
  assert.match(source, /function clearDeveloperConfirms[\s\S]*?clearConfirmsBy\(owner\)/);
  for (const hook of ["onHide(() => {", "onUnmounted(() => {", "watch(() => String(app.accountKey), () => {"]) {
    const start = source.indexOf(hook);
    assert.notEqual(start, -1, `${hook} should exist as a lifecycle callback`);
    const body = source.slice(start, source.indexOf("\n});", start) + 4);
    assert.match(body, /clearDeveloperConfirms\(\)/, `${hook} should cancel its confirmations`);
  }
});

test("resumed docs cannot overwrite the current locale, account, run, or page generation", () => {
  for (const name of ["captureRuntimeRevision", "isCurrentRuntimeRevision", "captureAccountScope", "isCurrentAccountScope"]) {
    assert.match(docsFenceSource, new RegExp(name));
  }
  const docsStart = source.indexOf("async function loadDocs");
  const docsBody = source.slice(docsStart, source.indexOf("function retryLoadResources", docsStart));
  assert.match(docsBody, /const fence = docsFenceReader\.capture\(\)/);
  assert.match(docsBody, /docsApi\.published\(fence\.localeCode\)/);
  assert.match(docsBody, /docsFenceCurrent\(fence\)/);
  assert.match(source, /watch\(\(\) => locale\.code, \(\) => \{ resetDocsScope\(\); void loadDocs\(\); \}\)/);
});

test("failed non-idempotent mutations reconcile only from authoritative lists and rotation never retries", () => {
  const revokeStart = source.indexOf("async function revokeApiKey");
  const revokeBody = source.slice(revokeStart, source.indexOf("async function loadWebhookDeliveries", revokeStart));
  assert.match(revokeBody, /reconcileResourceFailure\(fence, \(\) => developerResourcesApi\.listKeys\(\), \(items\) => isApiKeyRevoked\(items, id\)\)/);
  assert.match(revokeBody, /if \(keys\) apiKeys\.value = keys\.items/);
  assert.ok(revokeBody.indexOf("apiKeys.value = keys.items") < revokeBody.indexOf("if (keys?.confirmed)"));
  const enableStart = source.indexOf("async function setWebhookEnabled");
  const enableBody = source.slice(enableStart, source.indexOf("async function createWebhook", enableStart));
  assert.match(enableBody, /isWebhookEnabled\(items, item\.id, enabled\)/);
  assert.ok(enableBody.indexOf("webhooks.value = hooks.items") < enableBody.indexOf("if (hooks?.confirmed)"));
  const deleteStart = source.indexOf("async function deleteWebhook");
  const deleteBody = source.slice(deleteStart, source.indexOf("async function rotateWebhook", deleteStart));
  assert.match(deleteBody, /isWebhookDeleted\(items, id\)/);
  assert.ok(deleteBody.indexOf("webhooks.value = hooks.items") < deleteBody.indexOf("if (hooks?.confirmed)"));
  assert.match(source, /resourceActionUnknown/);

  const rotateStart = source.indexOf("async function rotateWebhook");
  const rotateBody = source.slice(rotateStart, source.indexOf("function deliveryFailureLabel", rotateStart));
  assert.match(rotateBody, /rotationJournal\.markPending\(journalScope, item\.id\)/);
  assert.match(rotateBody, /rotationJournal\.markUnknown\(journalScope, item\.id\)/);
  assert.match(rotateBody, /rotateWebhookSecret\(item\.id, `developer-resource:\$\{requireCryptoUuid\(\)\}`\)/);
  assert.doesNotMatch(rotateBody, /resourceKey\(intent\)/);
  assert.equal((rotateBody.match(/rotateWebhookSecret/g) ?? []).length, 1);
  const pendingIndex = rotateBody.indexOf("rotationJournal.markPending(journalScope, item.id)");
  const requestIndex = rotateBody.indexOf("developerResourcesApi.rotateWebhookSecret");
  assert.ok(pendingIndex !== -1 && pendingIndex < requestIndex, "journal persistence must precede the rotation request");
  assert.match(rotateBody, /!rotationJournal\.markPending\(journalScope, item\.id\)/);
  assert.match(rotateBody, /rotationStorageUnavailable/);

  const record = journalSource.match(/interface RotationJournalRecord \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(record, /webhookId: number/);
  assert.match(record, /state: DeveloperRotationRecoveryState/);
  assert.doesNotMatch(record, /secret|idempotency/i);
  assert.match(journalSource, /uni\.getStorageSync/);
  assert.match(journalSource, /uni\.setStorageSync/);
  assert.match(journalSource, /writeAndReadBack/);
});
