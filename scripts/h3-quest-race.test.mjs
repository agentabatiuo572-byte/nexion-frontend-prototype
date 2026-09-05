#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const rawSource = fs.readFileSync("src/store/quest.ts", "utf8");

// 🔴 本 harness 靠「剥掉 import + 用 new Function 手工注入同名参数」跑真 store,那份注入名单是**手维护的**:
// quest.ts 只要新增一个运行时导入,三条断言就会在 createStore 里炸成裸 ReferenceError —— 一条都没跑到,
// 而报错长得像实现坏了(实测 6d93739 加了 `ref`,三条静默全灭)。名单是开放集合,不能靠人记。
// 判据改成构造性的:把剥掉的具名导入与注入名单求差,有差就 exit 2 指名报出来,而不是等运行时炸。
const INJECTED_NAMES = [
  "reactive", "ref", "defineStore", "questApi", "remoteApiEnabled",
  "normalizeAccountKey", "readAccountRow", "writeAccountRow",
];
const importedNames = new Set();
for (const line of rawSource.match(/^import .*;\r?\n/gm) ?? []) {
  if (/^import\s+type\s/.test(line)) continue; // 类型导入编译期擦除,无需注入
  const named = line.match(/\{([^}]*)\}/)?.[1];
  if (named) {
    for (const spec of named.split(",")) {
      const name = spec.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (name) importedNames.add(name);
    }
  }
  const defaultImport = line.match(/^import\s+([A-Za-z_$][\w$]*)[\s,]/)?.[1];
  if (defaultImport) importedNames.add(defaultImport);
}
const unstubbed = [...importedNames].filter((name) => !INJECTED_NAMES.includes(name));
if (unstubbed.length) {
  console.error(`FAIL h3-quest-race harness:quest.ts 的导入没有对应注入 stub —— ${unstubbed.join(", ")}`);
  console.error("  → 补进 INJECTED_NAMES 与 createStore 的 INJECT(两处同源,会被 assert 校验);");
  console.error("    不补的话这三条竞态断言会在运行时炸成 ReferenceError,看着像实现坏了,其实是 harness 漏了。");
  process.exit(2);
}
if (!importedNames.size) {
  console.error("FAIL h3-quest-race harness:一个导入都没扫到 —— 剥离正则与 quest.ts 对不上了,判据失效");
  process.exit(2);
}

const source = rawSource
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/export type QuestTaskId[\s\S]*?;\r?\n\r?\nexport interface QuestTaskDef/, "interface QuestTaskDef")
  .replace(/export interface QuestCompleteResult/, "interface QuestCompleteResult")
  .replace(/export const QUEST_TASKS/, "const QUEST_TASKS")
  .replace(/export const QUEST_FINAL_BONUS_NEX/, "const QUEST_FINAL_BONUS_NEX")
  .replace("export const useQuest", "const useQuest");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function snapshot(code) {
  return { quests: [{ questCode: code, status: "CLAIMED" }] };
}

function createStore(replies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const questApi = {
    state: () => {
      const reply = replies.shift();
      assert.ok(reply, "unexpected quest state request");
      return reply.promise;
    },
    claim: async () => { throw new Error("claim not used"); },
  };
  // 注入表与上面的 INJECTED_NAMES **同源**:两者漂移的话,守卫守的是一份、真跑的是另一份。
  const INJECT = {
    reactive: (value) => value,
    ref: (value) => ({ value }),
    defineStore: (_name, setup) => setup,
    questApi,
    remoteApiEnabled: true,
    normalizeAccountKey: (key) => key,
    readAccountRow: () => null,
    writeAccountRow: () => undefined,
  };
  assert.deepEqual(Object.keys(INJECT), INJECTED_NAMES, "INJECT 与 INJECTED_NAMES 漂移");
  const useQuest = new Function(
    ...Object.keys(INJECT),
    `${compiled}\nreturn useQuest;`,
  )(...Object.values(INJECT));
  return useQuest();
}

test("A slow state response cannot repopulate B completedMap", async () => {
  const a = deferred();
  const b = deferred();
  const store = createStore([a, b]);

  store.bindAccount("A");
  store.bindAccount("B");
  b.resolve(snapshot("B"));
  await Promise.resolve();
  a.resolve(snapshot("A"));
  await Promise.resolve();

  assert.deepEqual(Object.keys(store.completedMap), ["B"]);
});

test("A fast state is cleared on B bind and B slow response becomes authoritative", async () => {
  const a = deferred();
  const b = deferred();
  const store = createStore([a, b]);

  store.bindAccount("A");
  a.resolve(snapshot("A"));
  await Promise.resolve();
  assert.deepEqual(Object.keys(store.completedMap), ["A"]);

  store.bindAccount("B");
  assert.deepEqual(Object.keys(store.completedMap), []);
  b.resolve(snapshot("B"));
  await Promise.resolve();
  assert.deepEqual(Object.keys(store.completedMap), ["B"]);
});

test("older same-account refresh cannot overwrite a newer response", async () => {
  const older = deferred();
  const newer = deferred();
  const store = createStore([older, newer]);

  const first = store.refreshRemote();
  const second = store.refreshRemote();
  newer.resolve(snapshot("NEW"));
  await second;
  older.resolve(snapshot("OLD"));
  await first;

  assert.deepEqual(Object.keys(store.completedMap), ["NEW"]);
});
