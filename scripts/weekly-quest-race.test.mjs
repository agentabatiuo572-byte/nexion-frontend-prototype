#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync("src/store/weekly-quest.ts", "utf8")
  .replace(/^import[\s\S]*?;\r?\n/gm, "")
  .replace("export const useWeeklyQuest", "const useWeeklyQuest");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function snapshot(code) {
  return { quests: [{ questCode: code, layer: "WEEKLY_T1", status: "IN_PROGRESS" }], questBonusMultiplier: 1 };
}

function createStore(replies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const ref = (value) => ({ value });
  const computed = (read) => ({ get value() { return read(); } });
  const watch = () => undefined;
  const defineStore = (_name, setup) => setup;
  const useLocaleStore = () => ({ code: "zh" });
  const questApi = {
    state: (locale) => {
      assert.equal(locale, "zh");
      const reply = replies.shift();
      assert.ok(reply, "unexpected quest state request");
      return reply.promise;
    },
    claim: async () => { throw new Error("claim not used"); },
  };
  const useWeeklyQuest = new Function(
    "ref", "computed", "watch", "defineStore", "questApi", "remoteApiEnabled", "useLocaleStore",
    `${compiled}\nreturn useWeeklyQuest;`,
  )(ref, computed, watch, defineStore, questApi, true, useLocaleStore);
  return useWeeklyQuest();
}

test("A slow response cannot overwrite a faster B account refresh", async () => {
  const a = deferred();
  const b = deferred();
  const store = createStore([a, b]);

  store.bindAccount("A");
  store.bindAccount("B");
  b.resolve(snapshot("B"));
  await Promise.resolve();
  a.resolve(snapshot("A"));
  await Promise.resolve();

  assert.equal(store.snapshot.value.quests[0].questCode, "B");
});

test("A fast response is cleared when binding B and B remains authoritative", async () => {
  const a = deferred();
  const b = deferred();
  const store = createStore([a, b]);

  store.bindAccount("A");
  a.resolve(snapshot("A"));
  await Promise.resolve();
  assert.equal(store.snapshot.value.quests[0].questCode, "A");

  store.bindAccount("B");
  assert.equal(store.snapshot.value, null);
  b.resolve(snapshot("B"));
  await Promise.resolve();
  assert.equal(store.snapshot.value.quests[0].questCode, "B");
});

test("older refresh in the same account cannot overwrite a newer response", async () => {
  const older = deferred();
  const newer = deferred();
  const store = createStore([older, newer]);

  const first = store.refresh();
  const second = store.refresh();
  newer.resolve(snapshot("NEW"));
  await second;
  older.resolve(snapshot("OLD"));
  await first;

  assert.equal(store.snapshot.value.quests[0].questCode, "NEW");
});
