import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

test('capture inspector reports shapes and counts without printing synthetic mortgage values', async () => {
  const script = fileURLToPath(new URL('../scripts/inspect-capture.mjs', import.meta.url));
  const capture = fileURLToPath(new URL('./fixtures/uwm/capture-v3.json', import.meta.url));
  const { stdout } = await run(process.execPath, [script, capture], { encoding: 'utf8' });
  assert.match(stdout, /browser-extraction/);
  assert.match(stdout, /principalBalance/);
  assert.match(stdout, /"paymentCount": 1/);
  assert.match(stdout, /"statementCount": 1/);
  assert.equal(stdout.includes('424242.42'), false);
  assert.equal(stdout.includes('3333.33'), false);
});
