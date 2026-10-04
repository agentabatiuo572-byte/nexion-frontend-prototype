import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("remote Nova uses the authenticated local-AI backend instead of HOLD or mock templates", () => {
  const chat = read("src/pages/support/chat.vue");
  const messages = read("src/pages/support/messages.vue");
  const runtime = read("src/api/runtime.ts");

  assert.match(chat, /novaAiApi\.chat/);
  assert.match(chat, /novaAiApi\.status/);
  assert.match(chat, /nova\.bindRemoteAccount\(app\.accountKey\)/);
  assert.doesNotMatch(chat, /if \(remoteApiEnabled\)[\s\S]{0,180}NOVA_PROVIDER_HOLD/);
  assert.match(messages, /key: "ai"/);
  assert.doesNotMatch(messages, /if \(!remoteApiEnabled\) available\.push\(\{ key: "ai"/);
  assert.match(runtime, /export const novaAiApi = createNovaAiApi\(apiClient\)/);
});

test("Nova customer contract hides runtime implementation details and keeps the sensitive-data warning visible", () => {
  const api = read("src/api/nova-ai-api.ts");
  const en = read("src/i18n/messages/en.ts");
  const zh = read("src/i18n/messages/zh.ts");
  const vi = read("src/i18n/messages/vi.ts");
  assert.doesNotMatch(api, /OLLAMA_LOCAL|LOCAL_MACHINE|provider|model|privacy|sourceEnvironment|serverCanonical/);
  for (const messages of [en, zh, vi]) {
    assert.doesNotMatch(messages, /localRole:\s*"[^"]*(?:Gemma|Ollama|local model|本地模型|mô hình cục bộ)[^"]*"/i);
  }
  assert.match(en, /password[\s\S]{0,120}OTP[\s\S]{0,120}private key/i);
  for (const messages of [en, zh, vi]) {
    assert.match(messages, /localSafetyNotice/);
    assert.match(messages, /localUnavailable/);
  }
});

test("Nova outage copy does not name an implementation provider when any service hop can fail", () => {
  for (const file of ["en", "zh", "vi"]) {
    const messages = read(`src/i18n/messages/${file}.ts`);
    assert.doesNotMatch(messages, /localUnavailable:\s*"[^"]*Ollama[^"]*"/i);
  }
});

test("human support routes never inherit Nova connection or HOLD state", () => {
  const chat = read("src/pages/support/chat.vue");

  assert.match(chat, /const novaProviderHold = ref\(false\)/);
  assert.match(chat, /const novaStatusLoading = ref\(false\)/);
  assert.match(chat, /isAi\.value && novaStatusLoading\.value/);
  assert.match(chat, /isAi\.value && novaProviderHold\.value/);
  assert.match(
    chat,
    /isAi\.value \? novaProviderHold\.value : !!conv\.value && !isReplyAllowed\.value/,
  );
});

test("floating human support stays available while Nova remains hidden", () => {
  const chassis = read("src/components/app-chassis.vue");
  const bubble = read("src/components/nova/nova-bubble.vue");
  const visibility = read("src/lib/nova-visibility.ts");
  assert.match(visibility, /NOVA_SUPPORT_VISIBLE = false/);
  assert.match(chassis, /<NovaBubble v-if="isTabRoute"[^>]*\/>/);
  assert.doesNotMatch(chassis, /<NovaBubble[^>]*v-(show|else)/);
  assert.doesNotMatch(chassis, /NovaBubble[^>]+!remoteApiEnabled/);
  assert.match(bubble, /const visible = computed\(\(\) => !NOVA_SUPPORT_VISIBLE \|\| remoteApiEnabled \|\| totalUnread\.value > 0\)/);
  assert.match(bubble, /<NovaAvatar :size="36" :pulse="showUnreadBadge && !dimmed"[^>]*\/>/);
  assert.doesNotMatch(bubble, /<svg v-else[^>]*aria-hidden="true"/);
  assert.match(bubble, /const totalUnread = computed\(\(\) => humanUnread\.value\)/);
  assert.match(bubble, /if \(!NOVA_SUPPORT_VISIBLE\) return;/);
  assert.match(bubble, /v-if="showUnreadBadge"/);
  assert.match(bubble, /const showUnreadBadge = computed\(\(\) => totalUnread\.value > 0\)/);
  assert.match(bubble, /conversations\.byType\("advisor"\)/);
  assert.match(bubble, /conversations\.byType\("support"\)/);
  assert.doesNotMatch(bubble, /remoteApiEnabled \? nova\.unread/);
  assert.match(
    bubble,
    /function open\(\) \{\s*messageCenter\.show\("service"\);\s*\}/,
  );
  assert.match(bubble, /if \(remoteApiEnabled\) \{[\s\S]{0,120}notifications\.refreshRemote\(\);[\s\S]{0,80}return;/);
});
