#!/usr/bin/env node
'use strict';
// Break the page on purpose, one way at a time, and check that the test notices.
//
//   canvas-spy-mutate [--env K=V[,K=V]]... [--timeout 60] -- node my.test.js page.html
//
// The test lists its mutations in loadPage({ mutations: [[find, replace], ...] }).
// This runner sets CANVAS_SPY_MUTANT=1, 2, ... until the test says there are no more.
// Each --env adds one more environment to run every mutant in (e.g. REDUCE=1 for a
// reduced-motion pass); a mutant counts as caught if any environment fails on it.
//
// For each caught mutant it also prints the first failing check it finds in the test's
// output (a line starting with ✗, ✖, "not ok" or FAIL) and how many more failed, so you can see *which* check
// caught it: a check that never shows up there may not be doing anything.
//
// Exit 0 only if the test passes unmutated in every environment, every mutant is
// caught, and no mutation's anchor went missing.

const { spawnSync } = require('child_process');
const { EXIT_NO_SUCH_MUTANT, EXIT_BAD_ANCHOR } = require('./canvas-spy/page');

function parseArgs(argv) {
  const envs = [{}];
  let timeout = 60, max = 200, i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { i++; break; }
    if (a === '--env') { const set = {}; for (const kv of argv[++i].split(',')) { const [k, ...v] = kv.split('='); set[k] = v.join('='); } envs.push(set); }
    else if (a === '--timeout') timeout = +argv[++i];
    else if (a === '--max') max = +argv[++i];
    else if (a === '-h' || a === '--help') return null;
    else break;
  }
  const cmd = argv.slice(i);
  return cmd.length ? { envs, timeout, max, cmd } : null;
}

const FAILED_LINE = /^\s*(✗|✖|not ok\b|FAIL\b)/;
/** The first line of a test's output that looks like a failed check, trimmed. */
function firstFailure(out) {
  const lines = out.split('\n').filter(l => FAILED_LINE.test(l));
  if (!lines.length) return null;
  const t = lines[0].trim();
  return (t.length > 110 ? t.slice(0, 107) + '...' : t) + (lines.length > 1 ? `  (+${lines.length - 1} more)` : '');
}

const label = e => Object.keys(e).length ? Object.entries(e).map(([k, v]) => `${k}=${v}`).join(',') : 'default';

function run(cmd, env, mutant, timeout) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    env: { ...process.env, ...env, ...(mutant ? { CANVAS_SPY_MUTANT: String(mutant) } : {}) },
    encoding: 'utf8', timeout: timeout * 1000,
  });
  if (r.error && r.error.code === 'ETIMEDOUT') return { code: 'timeout', out: '' };
  if (r.error) throw r.error;
  return { code: r.status ?? `signal ${r.signal}`, out: (r.stdout || '') + (r.stderr || '') };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error('usage: canvas-spy-mutate [--env K=V[,K=V]]... [--timeout s] -- <command that runs one test>');
    process.exit(2);
  }
  const { envs, timeout, max, cmd } = args;

  for (const e of envs) {
    const r = run(cmd, e, 0, timeout);
    if (r.code !== 0) {
      console.log(`✗ unmutated run fails (${label(e)}), exit ${r.code}. Fix the test first:\n${r.out.trim().split('\n').slice(-15).join('\n')}`);
      process.exit(1);
    }
  }
  console.log(`✓ unmutated: passes in ${envs.map(label).join(' / ')}`);

  let caught = 0, survived = 0, broken = 0, n = 0;
  for (let k = 1; k <= max; k++) {
    const results = envs.map(e => ({ e, r: run(cmd, e, k, timeout) }));
    if (results.every(x => x.r.code === EXIT_NO_SUCH_MUTANT)) break;
    n++;
    const bad = results.find(x => x.r.code === EXIT_BAD_ANCHOR);
    if (bad) { broken++; console.log(`! mutant ${k}: anchor missing or ambiguous — this mutation never ran\n    ${bad.r.out.trim().split('\n').pop()}`); continue; }
    const by = results.filter(x => x.r.code !== 0).map(x => label(x.e) + (x.r.code === 'timeout' ? ' (timeout)' : ''));
    if (by.length) {
      caught++; console.log(`✓ mutant ${k}: caught by ${by.join(', ')}`);
      const first = results.find(x => x.r.code !== 0 && x.r.code !== 'timeout');
      const why = first && firstFailure(first.r.out);
      console.log(why ? `    ↳ ${why}` : `    ↳ (no failed-check line in the output; it failed some other way, exit ${first ? first.r.code : 'timeout'})`);
    }
    else { survived++; console.log(`✗ mutant ${k}: SURVIVED — the test passes with this bug in the page`); }
  }
  if (n === 0) { console.log('no mutations defined (loadPage({ mutations: [...] }))'); process.exit(1); }
  console.log(`\n${n} mutants: ${caught} caught, ${survived} survived, ${broken} never ran`);
  process.exit(survived || broken ? 1 : 0);
}

main();
