import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { stopTree } from "./lib/dev-server-pool.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures = path.join(root, ".verify-cache", "legacy-runner-tests");
fs.mkdirSync(fixtures, { recursive: true });

const serverSource = `
import http from 'node:http';
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
const mode = args[args.indexOf('--mode') + 1];
let drained = false;
const write = (stream, text) => new Promise(resolve => stream.write(text, resolve));
async function flood() {
  for (let i = 0; i < 128; i++) {
    await write(process.stdout, 'O'.repeat(8192));
    await write(process.stderr, 'E'.repeat(8192));
  }
  await write(process.stdout, 'SERVER_STDOUT_TAIL\\n');
  await write(process.stderr, 'SERVER_STDERR_TAIL\\n');
  drained = true;
}
http.createServer((req, res) => {
  if (req.url === '/src/api/runtime-config.ts') {
    res.end(JSON.stringify({ VITE_ROOT_DIR: process.cwd(), MODE: mode }));
  } else if (req.url === '/trigger') {
    res.end('started'); void flood();
  } else if (req.url === '/drained') {
    res.end(String(drained));
  } else if (req.url === '/version') {
    res.end(process.version);
  } else if (req.url === '/crash') {
    res.end('exit23'); setTimeout(() => process.exit(23), 20);
  } else res.end('fixture');
}).listen(port, '127.0.0.1');
`;

const probeSource = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
const urls = [process.env.BASE_URL, process.env.REMOTE_BASE_URL];
console.log('PROBE_RUNTIME=' + process.version);
for (const url of urls) {
  assert.equal(await (await fetch(url + '/version')).text(), process.version, 'Child server must use the same Node runtime');
  await fetch(url + '/trigger');
  const end = Date.now() + 5000;
  let drained = false;
  while (Date.now() < end) {
    drained = await (await fetch(url + '/drained')).text() === 'true';
    if (drained) break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(drained, true, 'Owned server output must drain while verifier is running');
}
console.log('BOTH_SERVERS_DRAINED');
const code = Number(process.env.VERIFIER_EXIT || 0);
if (code) {
  await fetch(urls[0] + '/crash');
  await new Promise(resolve => setTimeout(resolve, 700));
}
fs.writeFileSync('.verify-exit.code', code + '\\npass=400 fail=' + (code ? 1 : 0) + ' skip=0 mode=full scoped_skip=0\\n');
process.exitCode = code;
`;

function prepareFixture() {
  const fixture = fs.mkdtempSync(path.join(fixtures, "run-"));
  fs.mkdirSync(path.join(fixture, "scripts/lib"), { recursive: true });
  for (const file of ["run-legacy-suite.mjs", "lib/dev-server-pool.mjs", "lib/find-bash.mjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(fixture, "scripts", file));
  }
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ type: "module", scripts: { "dev:h5": "node fake-server.mjs" } }));
  fs.writeFileSync(path.join(fixture, "fake-server.mjs"), serverSource);
  fs.writeFileSync(path.join(fixture, "scripts/probe.mjs"), probeSource);
  fs.writeFileSync(path.join(fixture, "scripts/verify.sh"), '#!/usr/bin/env bash\nnode scripts/probe.mjs\nexit $?\n');
  return fixture;
}

const isListening = port => new Promise(resolve => {
  const socket = net.connect({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});

for (const exit of [0, 17]) test(`legacy runner drains owned output and preserves exit ${exit}`, { timeout: 25000 }, async t => {
  const fixture = prepareFixture();
  let child;
  t.after(async () => {
    stopTree(child);
    if (child && child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once("close", resolve));
    const base = fs.realpathSync(fixtures), generated = fs.realpathSync(fixture);
    const relative = path.relative(base, generated);
    assert(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep), "Only this fixture child may be removed");
    assert.equal(fs.lstatSync(fixture).isSymbolicLink(), false, "Generated fixture must not be a link");
    fs.rmSync(generated, { recursive: true });
  });
  child = spawn(process.execPath, ["scripts/run-legacy-suite.mjs"], {
    cwd: fixture,
    env: { ...process.env, VERIFIER_EXIT: String(exit), LEGACY_SUITE_REUSE_DEV_URL: "", LEGACY_SUITE_REUSE_PROD_URL: "", VERIFY_MODE: "full" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, exit, output);
  assert.match(output, /BOTH_SERVERS_DRAINED/);
  assert(output.includes('PROBE_RUNTIME=' + process.version), 'Verifier must use the same Node runtime');
  assert.match(output, /本次实跑 40[01] 格/);
  if (exit) {
    assert.match(output, /owned development server exited .*pid=\d+ code=23 signal=none/);
    assert.match(output, /SERVER_STDOUT_TAIL/);
    assert.match(output, /SERVER_STDERR_TAIL/);
  }
  const ports = [...output.matchAll(/起 (?:development|production) server http:\/\/127\.0\.0\.1:(\d+)/g)].map(match => Number(match[1]));
  assert.equal(ports.length, 2);
  for (const port of ports) assert.equal(await isListening(port), false, `Owned port ${port} must close`);
});
