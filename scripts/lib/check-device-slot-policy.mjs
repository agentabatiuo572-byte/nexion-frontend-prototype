import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { transformSync } from "esbuild";

const read = (name) => readFileSync(new URL(`../../src/${name}`, import.meta.url), "utf8");
const module = { exports: {} };
new Function("module", "exports", transformSync(read("lib/device-slot-policy.ts"), { loader: "ts", format: "cjs" }).code)(module, module.exports);
const declaration = read("store/types.ts").match(/export type DeviceKind\s*=([\s\S]*?);/);
const kinds = [...(declaration?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assert.ok(kinds.length >= 8, "device slot matrix lost its authoritative kind set");
for (const kind of kinds) {
  for (const activatedAt of [null, 123]) for (const pendingDeactivate of [undefined, false, true]) {
    const device = { kind, activatedAt, pendingDeactivate };
    assert.equal(module.exports.isActiveSlotDevice(device), kind !== "cloud-share" && activatedAt !== null && !pendingDeactivate, JSON.stringify(device));
  }
}
console.log(`device slot policy: ${kinds.length * 6} behavioral cases passed`);
