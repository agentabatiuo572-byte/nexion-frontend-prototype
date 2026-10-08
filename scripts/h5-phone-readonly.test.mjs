import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { initPreContext, preHtml, preJs } = require("@dcloudio/uni-cli-shared");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function compile(file, platform) {
  initPreContext(platform);
  const source = read(file);
  return file.endsWith(".vue") ? preJs(preHtml(source, file), file) : preJs(source, file);
}
function functions(source, names) {
  const script = source.includes("<script") ? source.split('<script setup lang="ts">')[1].split("</script>")[0] : source;
  const ast = ts.createSourceFile("actual.ts", script, ts.ScriptTarget.Latest, true);
  return names.map((name) => {
    const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(fn, `actual source function ${name} must exist`);
    return fn.getText(ast).replace(/^export\s+/, "");
  }).join("\n");
}
function execute(source, sandbox) {
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  } }).outputText, sandbox);
}
const names = ["handleTradein", "handleActivate", "handleDeactivate", "onSheetWait", "onSheetForce", "runRemoteDeferredCommand", "runRemoteDeviceCommand"];
const typesAst = ts.createSourceFile("types.ts", read("src/store/types.ts"), ts.ScriptTarget.Latest, true);
const kindType = typesAst.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === "DeviceKind");
assert.ok(kindType && ts.isUnionTypeNode(kindType.type), "actual DeviceKind union must exist");
const deviceKinds = kindType.type.types.map((node) => {
  assert.ok(ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal), "DeviceKind must remain explicit string literals");
  return node.literal.text;
});
assert.ok(deviceKinds.length >= 8 && deviceKinds.includes("phone"), "complete authoritative device kinds must be parsed");
const purchasedKinds = deviceKinds.filter((kind) => kind !== "phone");
function inventory(platform, kind, remote = true) {
  const d = { id: kind === "phone" ? "701" : "703", kind, rowVersion: 1, activatedAt: 1, currentTask: null, pendingDeactivate: false };
  const writes = [], effects = [];
  const sandbox = {
    exports: {}, plus: { os: { name: "Android" } }, remoteApiEnabled: remote,
    sheetDevice: { value: d }, slotsFull: { value: false }, trialReserved: { value: 0 },
    deferredCommandInFlight: { value: new Set() },
    deferredCommandBusy: () => false, deferredCommandSlot: () => "slot",
    requiresActivationConfirmation: () => false, occupiesDeviceSlot: () => kind !== "phone",
    goPhoneActivation: () => effects.push("native-binding"), isDeviceTaskBlocked: () => false,
    tradeinSheet: { showRetire: () => effects.push("tradein"), showRetireBlock: () => effects.push("tradein-block") },
    uiConfirm: async () => { effects.push("confirm"); return true; }, fmt: () => "", deviceName: () => "",
    t: { value: { myDevices: {}, deactivateSheet: {}, errors: {} } },
    toast: { info: () => {}, success: () => {}, warn: () => {}, error: () => {} },
    captureAccountScope: () => ({}), isCurrentAccountScope: () => true,
    acquireDeviceCommandKey: () => { effects.push("command-key"); return "key"; }, finishDeviceCommand: () => {},
    isSettledRejection: () => false,
    app: {
      accountKey: "user:900001", devices: [d], slotCap: 6, refreshRemoteFleet: async () => true,
      activateDevice: () => { effects.push("mock-activate"); return true; },
      deactivateDevice: () => { effects.push("mock-deactivate"); return true; },
      scheduleDeactivation: () => effects.push("mock-schedule"),
    },
    deviceE3Api: {
      activate: async (id) => { writes.push(`POST /api/device/${id}/activate`); d.activatedAt = 1; },
      deactivate: async (id) => { writes.push(`POST /api/device/${id}/deactivate`); d.activatedAt = null; },
      deactivateAfterTask: async (id) => { writes.push(`POST /api/device/${id}/deactivate-after-task`); d.activatedAt = null; return { status: "DEACTIVATED" }; },
    },
  };
  const guard = functions(compile("src/lib/device-control-platform.ts", platform), ["canControlDevice"]);
  const handlers = functions(compile("src/pages/me/devices.vue", platform), names);
  execute(`${guard}\n${handlers}\nexports.handlers = {${names.join(",")}};`, sandbox);
  return { d, writes, effects, sandbox, handlers: sandbox.exports.handlers };
}

for (const remote of [true, false]) {
  for (const name of names) test(`H5 phone ${name} stays read-only (${remote ? "server" : "local"}) even with injected Android bridge`, async () => {
    const state = inventory("h5", "phone", remote);
    const result = await state.handlers[name](state.d, "deactivate");
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.effects, []);
    assert.equal(state.d.activatedAt, 1);
    if (name.startsWith("runRemote")) assert.equal(result, false);
  });
}
test("H5 direct phone activation command is also denied", async () => {
  const state = inventory("h5", "phone");
  assert.equal(await state.handlers.runRemoteDeviceCommand(state.d, "activate"), false);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.effects, []);
});
for (const platform of ["h5", "app-plus"]) {
  for (const kind of purchasedKinds) {
    for (const operation of ["activate", "deactivate"]) test(`${platform} purchased ${kind} ${operation} keeps real command execution`, async () => {
      const state = inventory(platform, kind);
      state.d.activatedAt = operation === "activate" ? null : 1;
      assert.equal(await state.handlers.runRemoteDeviceCommand(state.d, operation), true);
      assert.deepEqual(state.writes, [`POST /api/device/703/${operation}`]);
    });
    test(`${platform} purchased ${kind} deferred stop keeps real command execution`, async () => {
      const state = inventory(platform, kind);
      assert.equal(await state.handlers.runRemoteDeferredCommand(state.d), true);
      assert.deepEqual(state.writes, ["POST /api/device/703/deactivate-after-task"]);
    });
  }
}
test("native APP phone immediate/deferred/forced stop remains available", async () => {
  for (const name of ["handleDeactivate", "runRemoteDeferredCommand", "onSheetForce"]) {
    const state = inventory("app-plus", "phone");
    await state.handlers[name](state.d);
    assert.deepEqual(state.writes, [`POST /api/device/701/${name === "runRemoteDeferredCommand" ? "deactivate-after-task" : "deactivate"}`]);
  }
});
test("phone action is absent from all H5 inventory groups and the hidden row cannot emit", () => {
  const page = compile("src/pages/me/devices.vue", "h5");
  const rows = [...page.matchAll(/<DeviceInventoryRow\b[\s\S]*?\/>/g)];
  assert.equal(rows.length, 3);
  for (const [row] of rows) assert.match(row, /:show-action="canControlDevice\(d\)"/);
  const row = compile("src/components/me/device-inventory-row.vue", "h5");
  assert.match(row, /<view v-if="showAction"[^>]*role="button"/);
  for (const showAction of [false, true]) {
    const events = [];
    const sandbox = { exports: {}, props: { showAction }, actionDisabled: { value: false }, emit: (name) => events.push(name) };
    execute(`${functions(row, ["onAction"])}\nexports.onAction=onAction;`, sandbox);
    sandbox.exports.onAction();
    assert.deepEqual(events, showAction ? ["toggle"] : []);
  }
});
test("native login deep-link and cookie error cannot render browser-only recovery copy", () => {
  for (const platform of ["h5", "app-plus"]) {
    const compiled = compile("src/pages/login/login.vue", platform);
    if (platform === "h5") assert.match(compiled, /browserUnsupportedNotice|secureBrowserUnsupported/);
    else assert.doesNotMatch(compiled, /browserUnsupportedNotice|secure-browser-unsupported|secureBrowserUnsupported/);
    const script = compiled.split('<script setup lang="ts">')[1].split("</script>")[0];
    const ast = ts.createSourceFile("login.ts", script, ts.ScriptTarget.Latest, true);
    const load = ast.statements.find((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "onLoad");
    assert.ok(load, "actual login onLoad must exist");
    const ApiError = class extends Error {};
    const sandbox = {
      URLSearchParams, takeNavigationQuery: () => "",
      exports: {}, onLoad: (handler) => { sandbox.load = handler; },
      returnParam: { value: null }, refOnLogin: { value: null }, serverSessionReloadNotice: { value: false },
      browserUnsupportedNotice: { value: false }, normalizeRefCode: () => null,
      ApiError, geoText: () => "", resolveRemoteLoginErrorKind: () => "unknown",
      t: { value: { session: { secureBrowserUnsupported: "browser-only" }, authOtp: { errorServiceUnavailable: "service-unavailable" } } },
    };
    execute(`${load.getText(ast)}\n${functions(compiled, ["remoteLoginError"])}\nexports.error=remoteLoginError;`, sandbox);
    sandbox.load({ notice: "secure-browser-unsupported" });
    assert.equal(sandbox.browserUnsupportedNotice.value, platform === "h5");
    assert.equal(sandbox.exports.error(new ApiError("COOKIE_LOCK_UNAVAILABLE")), platform === "h5" ? "browser-only" : "service-unavailable");
  }
});
