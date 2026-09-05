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

test("local AI contract keeps provider truth and sensitive-data warning visible", () => {
  const api = read("src/api/nova-ai-api.ts");
  const en = read("src/i18n/messages/en.ts");
  const zh = read("src/i18n/messages/zh.ts");
  const vi = read("src/i18n/messages/vi.ts");
  assert.match(api, /OLLAMA_LOCAL/);
  assert.match(api, /LOCAL_MACHINE/);
  assert.match(en, /password[\s\S]{0,120}OTP[\s\S]{0,120}private key/i);
  for (const messages of [en, zh, vi]) {
    assert.match(messages, /localSafetyNotice/);
    assert.match(messages, /localUnavailable/);
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
    /isAi\.value \? novaProviderHold\.value : conv\.value\?\.sessionStatus === "closed"/,
  );
});

test("remote tab routes keep a persistent Nova launcher without mock push timers", () => {
  const chassis = read("src/components/app-chassis.vue");
  const bubble = read("src/components/nova/nova-bubble.vue");

  // 守的是「浮标在 tab 路由上无条件常驻」——挂载条件必须**恰好**是 isTabRoute,
  // 不许被任何模式/状态判断关掉。属性本身放行:纯视觉 prop(如 :dimmed 控制滚动时
  // 淡出)不改变「在不在」。原判据写成自闭合精确形状,把「没有别的属性」和「没有别的
  // 挂载条件」混成一条,加个视觉 prop 就误红。放宽形状 + 下面两条把绕路堵死:
  //   · v-if 里加与条件 → 引号内多出内容,第一条正则直接失配;
  //   · 改用 v-show / v-else 藏起来 → 第二条抓;
  //   · 用 !remoteApiEnabled 关掉远端档 → 第三条抓(原有)。
  assert.match(chassis, /<NovaBubble v-if="isTabRoute"[^>]*\/>/);
  assert.doesNotMatch(chassis, /<NovaBubble[^>]*v-(show|else)/);
  assert.doesNotMatch(chassis, /NovaBubble[^>]+!remoteApiEnabled/);
  assert.match(bubble, /const visible = computed\(\(\) => remoteApiEnabled \|\| totalUnread\.value > 0\)/);
  assert.match(bubble, /v-if="showUnreadBadge"/);
  assert.match(bubble, /const showUnreadBadge = computed\(\(\) => totalUnread\.value > 0\)/);
  assert.match(bubble, /remoteApiEnabled \? nova\.unread : nova\.unread \+ conversations\.totalUnread/);
  assert.match(
    bubble,
    /navTo\(remoteApiEnabled \? "\/pages\/support\/chat\?type=ai" : "\/pages\/support\/messages"\)/,
  );
  assert.match(bubble, /if \(remoteApiEnabled\) \{[\s\S]{0,120}notifications\.refreshRemote\(\);[\s\S]{0,80}return;/);
});
