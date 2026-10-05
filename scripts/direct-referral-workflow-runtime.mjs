import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureServer, stopTree } from './lib/dev-server-pool.mjs';

const env = process.env;
const start = Date.now();
const index = process.argv.indexOf('--report');
assert(index >= 0 && process.argv[index + 1], '--report is required');
for (const key of ['WORKFLOW_TASK_ID', 'WORKFLOW_STEP_ID', 'WORKFLOW_CHECK_ID', 'WORKFLOW_RUN_ID', 'WORKFLOW_REPO', 'WORKFLOW_SNAPSHOT_HASH', 'NEXGRID_BACKEND_ROOT']) assert(env[key], `Missing ${key}`);
const root = process.cwd();
assert.equal(path.resolve(env.WORKFLOW_REPO).toLowerCase(), root.toLowerCase());
const prefix = env.WORKFLOW_TASK_ID.includes('-h5-') ? 'h5' : 'app';
const report = path.resolve(process.argv[index + 1]);
const dir = path.join(path.dirname(report), `${prefix}-evidence`, env.WORKFLOW_RUN_ID);
fs.mkdirSync(dir, { recursive: true });
const content = path.join(env.NEXGRID_BACKEND_ROOT, 'src/main/resources/policies/commissions-how-2026.10.05.json');
assert(fs.existsSync(content), 'Published content fixture must come from the actual backend checkout');
const server = await ensureServer({ root, log: console.log });
const log = path.join(dir, 'browser.log');
const fd = fs.openSync(log, 'wx');
try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/direct-referral-runtime.mjs', '--base', server.baseUrl, '--output', dir, '--content-fixture', content], { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] });
    const timeout = setTimeout(() => { stopTree(child); reject(new Error(`Browser acceptance timed out: ${log}`)); }, 480000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Browser acceptance failed (${code}): ${log}`)); });
  });
} finally { fs.closeSync(fd); server.stop(); }
const proofFile = path.join(dir, 'report.json');
assert(fs.statSync(proofFile).mtimeMs >= start, 'Browser evidence is stale');
const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
assert.equal(proof.capability, 'runtime');
assert.equal(proof.frontendOnly, true);
assert.equal(proof.passed, true);
assert.equal(proof.unchanged, true);
assert.equal(path.resolve(proof.root).toLowerCase(), root.toLowerCase());
assert.deepEqual(proof.errors, []);
assert(proof.steps.length === 25 && proof.steps.every(step => step.passed && step.evidence?.length), 'Incomplete browser scenarios');
const groups = {
  direct: ['pagination-filter-period-retry'],
  states: ['rules-and-record-failures-remain-independent', 'loading-and-account-invalidation-reject-late-reply', 'keyboard-activation-rules-retry-invite-pagination'],
  legacy: ['en', 'zh', 'vi'].map(locale => `existing-categories-and-team-entries-${locale}`),
  platforms: ['en', 'zh', 'vi'].flatMap(locale => ['dark', 'light'].flatMap(theme => [320, 390].map(width => `matrix-${locale}-${theme}-${width}`))).concat(['en', 'zh', 'vi'].flatMap(locale => [320, 390].map(width => `published-guides-${locale}-${width}`))),
};
const steps = Object.entries(groups).map(([id, names]) => ({ id: `${prefix}-${id}`, status: 'pass', innerSkipped: 0, evidence: [proofFile, log, 'Real frontend with explicit HTTP fixtures; no backend wallet persistence claim.', ...names.flatMap(name => { const step = proof.steps.find(item => item.id === name); assert(step, `Missing ${name}`); return step.evidence.map(item => fs.existsSync(path.join(dir, item)) ? path.join(dir, item) : item); })] }));
fs.writeFileSync(report, JSON.stringify({ taskId: env.WORKFLOW_TASK_ID, stepId: env.WORKFLOW_STEP_ID, checkId: env.WORKFLOW_CHECK_ID, runId: env.WORKFLOW_RUN_ID, repo: env.WORKFLOW_REPO, snapshotHash: env.WORKFLOW_SNAPSHOT_HASH, startedAt: new Date(start).toISOString(), at: new Date().toISOString(), verdict: 'pass', mode: 'full', treeMoved: false, capability: 'runtime', steps }, null, 2));
console.log(`Verified 25 current ${prefix} browser scenarios. ${report}`);
