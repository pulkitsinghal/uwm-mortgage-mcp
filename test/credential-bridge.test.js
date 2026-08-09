import test from 'node:test';
import assert from 'node:assert/strict';

import { findFieldReference, itemMatchesHost } from '../scripts/credential-bridge.mjs';

const syntheticItem = {
  urls: [{ href: 'https://uwm.loanadministration.com/uwm/#/login' }],
  fields: [
    { purpose: 'USERNAME', reference: 'op://Synthetic/UWM/username' },
    { purpose: 'PASSWORD', reference: 'op://Synthetic/UWM/password' },
  ],
};

test('matches a 1Password item only to the exact login hostname', () => {
  assert.equal(itemMatchesHost(syntheticItem, 'uwm.loanadministration.com'), true);
  assert.equal(itemMatchesHost(syntheticItem, 'loanadministration.com'), false);
  assert.equal(itemMatchesHost(syntheticItem, 'evil.example'), false);
});

test('selects username and password references without exposing values', () => {
  assert.equal(findFieldReference(syntheticItem, 'USERNAME'), 'op://Synthetic/UWM/username');
  assert.equal(findFieldReference(syntheticItem, 'PASSWORD'), 'op://Synthetic/UWM/password');
});
