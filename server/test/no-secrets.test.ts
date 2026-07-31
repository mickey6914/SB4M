import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// .env.example is committed, so it must never hold a real value. This test
// exists because a live token was once pasted here instead of into .env —
// the two filenames look alike, and the cost of the mistake is a leaked
// credential. Fail the build rather than let it happen quietly.

test('.env.example contains no filled-in values', () => {
  const text = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const filled = text
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => /^[A-Z0-9_]+=.+$/.test(line));

  assert.deepEqual(
    filled.map(({ n, line }) => `line ${n}: ${line.split('=')[0]} has a value`),
    [],
    'every KEY= in .env.example must be left empty — put real values in server/.env, which is git-ignored'
  );
});

// .gitignore protects .env only when the file is added by git. GitHub's web
// editor bypasses it entirely — a key committed through the browser lands in
// a public repo with nothing to stop it, which is exactly how it happened on
// 2026-07-31. This asserts the file is not tracked, by any route.
test('no .env file is tracked by git', () => {
  const tracked = execFileSync('git', ['ls-files', '--', '*.env', '**/.env'], {
    cwd: new URL('../..', import.meta.url).pathname,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  assert.deepEqual(
    tracked,
    [],
    'a .env file is committed — it holds live credentials and this repo is public. Remove it with `git rm --cached`, then rotate every key it contained.'
  );
});
