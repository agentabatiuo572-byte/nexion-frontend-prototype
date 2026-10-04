import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { waitForUniAppPage } from "./lib/probe-readiness.mjs";

function withBrowserGlobals(snapshot, fn) {
  const saved = new Map();
  for (const key of ["window", "document", "uni", "getCurrentPages", "location"]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  globalThis.window = {
    __NX_UNIAPP_RUNTIME_IDENTITY__: snapshot.identity,
  };
  globalThis.document = {
    querySelector: () => snapshot.vueMounted ? { hasAttribute: (name) => name === "data-v-app" } : null,
    body: { innerText: snapshot.text ?? "" },
  };
  globalThis.uni = snapshot.uniRuntime ? { reLaunch() {} } : undefined;
  globalThis.getCurrentPages = () => snapshot.route ? [{ route: snapshot.route }] : [];
  globalThis.location = { hash: snapshot.hash ?? "" };
  try { return fn(); } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function controlledPage(snapshots) {
  const calls = [];
  return {
    calls,
    async waitForFunction(predicate, args, options) {
      calls.push({ args, options });
      for (const snapshot of snapshots) {
        const ready = withBrowserGlobals(snapshot, () => predicate(args));
        if (ready) return;
      }
      throw new Error("timeout: simulated page never became ready");
    },
    async evaluate(fn) {
      return withBrowserGlobals(snapshots.at(-1), () => fn());
    },
  };
}

const moduleIdentity = {
  marker: "NEXGRID_UNIAPP_RUNTIME_20260809_V1",
  sourceUrl: "http://127.0.0.1:7315/src/main.ts",
};

test("waits through a blank cold frame until the direct UniApp page has a route and rendered text", async () => {
  const page = controlledPage([
    { identity: moduleIdentity, vueMounted: true, uniRuntime: true, route: "", text: "" },
    { identity: moduleIdentity, vueMounted: true, uniRuntime: true, route: "pages/me/profile", text: "Formal Probe" },
  ]);

  await waitForUniAppPage(page, "pages/me/profile", { timeout: 4321 });
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].args.route, "pages/me/profile");
  assert.equal(page.calls[0].options.timeout, 4321);
});

test("does not accept a stale initial page stack after the address-bar route has advanced", async () => {
  const page = controlledPage([
    { identity: moduleIdentity, vueMounted: true, uniRuntime: true, route: "pages/me/me", text: "My" },
    { identity: moduleIdentity, vueMounted: true, uniRuntime: true, route: "pages/earn/earn", text: "Earn" },
  ]);

  await waitForUniAppPage(page, "pages/earn/earn");
  assert.equal(page.calls.length, 1);
});

test("uses the page-stack pathname for a final guard destination with query parameters", async () => {
  const page = controlledPage([
    { identity: moduleIdentity, vueMounted: true, uniRuntime: true, route: "pages/me/security", text: "Security" },
  ]);

  await waitForUniAppPage(page, "pages/me/security?from=retired-flow");
  assert.equal(page.calls[0].args.route, "pages/me/security");
});

test("fails closed when the cold frame never establishes the expected route", async () => {
  const page = controlledPage([
    { identity: moduleIdentity, vueMounted: true, uniRuntime: true, route: "", text: "" },
  ]);

  await assert.rejects(
    () => waitForUniAppPage(page, "pages/me/profile", { timeout: 75 }),
    /simulated page never became ready/,
  );
});



test("profile and same-document guard probes use the semantic readiness gate without swallowing a final route timeout", () => {
  const profile = fs.readFileSync(new URL("./profile-identity-check.mjs", import.meta.url), "utf8");
  const guard = fs.readFileSync(new URL("./auth-guard-verify.mjs", import.meta.url), "utf8");
  assert.match(profile, /waitForUniAppPage\(page, "pages\/me\/profile"\)/);
  assert.doesNotMatch(profile, /waitForTimeout\(1200\)/);
  assert.match(guard, /waitForUniAppPage\(page, startRoute\.replace/);
  assert.equal((guard.match(/waitForUniAppPage\(page,/g) || []).length, 3, "guard must await cold entry, static transition, and final mounted routes");
  assert.doesNotMatch(guard, /\)\.catch\(\(\) => \{\}\);/);
});

test("same-document guard fixture enters a static review start only after visible server-session restoration", () => {
  const guard = fs.readFileSync(new URL("./auth-guard-verify.mjs", import.meta.url), "utf8");
  const start = guard.indexOf("async function sameDocumentRoute");
  const end = guard.indexOf("\ntry {", start);
  const sameDocument = guard.slice(start, end);
  const fixtureStart = guard.slice(guard.indexOf("async function installServerSessionBoundary"), start);

  assert.match(fixtureStart, /await page\.addInitScript\([\s\S]*?authenticated \? authed : unauth/);
  assert.equal((sameDocument.match(/await page\.goto\(/g) || []).length, 1, "the initial route must be the only document navigation");
  assert.match(sameDocument, /const initialDocumentRoute = staticStart \? "\/pages\/me\/me" : startRoute/);
  assert.match(sameDocument, /page\.goto\(`\$\{BASE\}\/\?nx_device=off#\$\{initialDocumentRoute\}`/);
  assert.match(sameDocument, /document\.body\?\.innerText \|\| ""\)\.includes\("Guard Witness"\)/);
  assert.match(sameDocument, /page\.evaluate\(\(hash\) => \{ window\.location\.hash = hash; \}, startRoute\)/);
  assert.match(sameDocument, /waitForUniAppPage\(page, startRoute\.replace/);
  assert.doesNotMatch(sameDocument, /pages\/index\/index/);
  assert.doesNotMatch(sameDocument, /localStorage\.setItem\("nexgrid-auth-v1"/);
});

test("direct guard fixture also starts its requested route in one document without mistaking an eventual redirect for readiness", () => {
  const guard = fs.readFileSync(new URL("./auth-guard-verify.mjs", import.meta.url), "utf8");
  const start = guard.indexOf("async function routeAfter");
  const end = guard.indexOf("\nasync function sameDocumentRoute", start);
  const directRoute = guard.slice(start, end);

  assert.equal((directRoute.match(/await page\.goto\(/g) || []).length, 1, "the direct route fixture must not first boot home");
  assert.match(directRoute, /page\.goto\(`\$\{BASE\}\/\?nx_device=off#\$\{target\}`/);
  assert.doesNotMatch(directRoute, /pages\/index\/index/);
  assert.doesNotMatch(directRoute, /localStorage\.setItem\("nexgrid-auth-v1"/);
  assert.match(directRoute, /await wait\(1800\)/, "routeAfter must keep sampling the guard outcome rather than wait for its raw protected target");
});
