import { test } from 'node:test';
import assert from 'node:assert/strict';
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
