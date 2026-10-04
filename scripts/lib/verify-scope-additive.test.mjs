#!/usr/bin/env node
/* 全局清单「只增不删」豁免红测(node --test;npm run test:verify-harness)。
 * 临时仓证明:纯加行 → 豁免;改一行 / 删一行 / 重排 → 不豁免;新文件 → 豁免;不在 globalsAdditiveOk 的全局文件 → 永不豁免。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { isAdditiveOnly, additiveExempt } from "./verify-scope.mjs";

const repo = mkdtempSync(join(tmpdir(), "additive-")).replace(/\\/g, "/");
const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
git("init", "-q", "-b", "main"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
mkdirSync(`${repo}/src/i18n/messages`, { recursive: true });
const EN = "src/i18n/messages/en.ts", VI = "src/i18n/messages/vi.ts", CSS = "src/styles/x.css";
mkdirSync(`${repo}/src/styles`, { recursive: true });
writeFileSync(`${repo}/${EN}`, "export default {\n  a: 'A',\n  b: 'B',\n};\n");
writeFileSync(`${repo}/${VI}`, "export default {\n  a: 'A',\n  b: 'B',\n};\n");
writeFileSync(`${repo}/${CSS}`, ".x{color:red}\n");
git("add", "."); git("commit", "-q", "-m", "base");
const base = git("rev-parse", "HEAD");
process.on("exit", () => { try { rmSync(repo, { recursive: true, force: true }); } catch {} });
const manifest = { globals: ["src/i18n/**", "src/styles/**"], globalsAdditiveOk: ["src/i18n/messages/*.ts"] };

test("i18n 只加一个 key(未提交)→ 只增不删 → 豁免", () => {
  writeFileSync(`${repo}/${EN}`, "export default {\n  a: 'A',\n  b: 'B',\n  c: 'C',\n};\n");
  assert.equal(isAdditiveOnly(EN, base, repo), true);
  assert.deepEqual(additiveExempt([EN], manifest, base, (f, b) => isAdditiveOnly(f, b, repo)), []);
});
test("i18n 改一个 key 的值 → 有 '-' 行 → 不豁免,照升", () => {
  writeFileSync(`${repo}/${VI}`, "export default {\n  a: 'AA',\n  b: 'B',\n};\n");
  assert.equal(isAdditiveOnly(VI, base, repo), false);
  assert.deepEqual(additiveExempt([VI], manifest, base, (f, b) => isAdditiveOnly(f, b, repo)), [VI]);
});
test("i18n 删一个 key → 不豁免", () => {
  writeFileSync(`${repo}/${VI}`, "export default {\n  a: 'A',\n};\n");
  assert.equal(isAdditiveOnly(VI, base, repo), false);
});
test("加 key 后提交,再对比 base → 仍是只增不删(判据看 base..工作树,不看提交与否)", () => {
  writeFileSync(`${repo}/${VI}`, "export default {\n  a: 'A',\n  b: 'B',\n  z: 'Z',\n};\n");
  git("add", VI); git("commit", "-q", "-m", "add z");
  assert.equal(isAdditiveOnly(VI, base, repo), true);
});
test("新增的 i18n 文件(base 里没有)→ 豁免;新增后又删掉 → 不豁免", () => {
  const NEW = "src/i18n/messages/th.ts";
  writeFileSync(`${repo}/${NEW}`, "export default {};\n");
  assert.equal(isAdditiveOnly(NEW, base, repo), true);
  rmSync(`${repo}/${NEW}`);
  assert.equal(isAdditiveOnly(NEW, base, repo), false);
});
test("不在 globalsAdditiveOk 的全局文件(styles)即使只加行也不豁免", () => {
  writeFileSync(`${repo}/${CSS}`, ".x{color:red}\n.y{color:blue}\n");
  assert.equal(isAdditiveOnly(CSS, base, repo), true);
  assert.deepEqual(additiveExempt([CSS, EN], manifest, base, (f, b) => isAdditiveOnly(f, b, repo)), [CSS]);
});
test("没有 base / 没有 globalsAdditiveOk → 不豁免任何东西(保守)", () => {
  assert.equal(isAdditiveOnly(EN, null, repo), false);
  assert.deepEqual(additiveExempt([EN], { globals: ["src/i18n/**"] }, base, () => true), [EN]);
  assert.deepEqual(additiveExempt([EN], manifest, null, () => true), [EN]);
});
