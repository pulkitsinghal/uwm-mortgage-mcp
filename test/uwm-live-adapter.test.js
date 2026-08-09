import test from 'node:test';
import assert from 'node:assert/strict';

import { UwmLiveAdapter } from '../src/adapters/uwm/live.js';

test('live adapter stays neutral until a login route is selected', async () => {
  let transportCreations = 0;
  const adapter = new UwmLiveAdapter({
    transportFactory: () => {
      transportCreations += 1;
      throw new Error('transport must not start during neutral status');
    },
  });
  const status = await adapter.connectionStatus();
  assert.equal(status.setupRequired, true);
  assert.equal(status.authenticated, false);
  assert.equal(status.loginRoute, null);
  assert.equal(transportCreations, 0);
  await assert.rejects(() => adapter.getSummary(), /setup is required/i);
});

test('guided login requires terms for 1Password and keeps Keychain opt-in separate', async () => {
  const createdOptions = [];
  let closeCalls = 0;
  const adapter = new UwmLiveAdapter({
    transport: {
      isAuthenticated: async () => true,
      close: async () => {
        closeCalls += 1;
      },
    },
    transportFactory: (options) => {
      createdOptions.push(options);
      return {
        isAuthenticated: async () => false,
        close: async () => {},
      };
    },
  });

  await assert.rejects(
    () => adapter.startLogin({ route: 'onepassword', acceptUwmTerms: false }),
    /terms acceptance/i,
  );
  assert.equal(createdOptions.length, 0);
  assert.equal(closeCalls, 0);

  const status = await adapter.startLogin({
    route: 'onepassword',
    acceptUwmTerms: true,
    rememberOnThisMac: false,
  });
  assert.equal(status.setupRequired, false);
  assert.equal(status.loginRoute, 'onepassword');
  assert.equal(status.rememberOnThisMac, false);
  assert.equal(createdOptions.length, 1);
  assert.equal(closeCalls, 1);
  assert.equal(createdOptions[0].acceptTerms, true);
  assert.equal(createdOptions[0].rememberOnThisMac, false);
});

test('manual login never requires terms or Keychain persistence', async () => {
  let createdOptions;
  const adapter = new UwmLiveAdapter({
    transportFactory: (options) => {
      createdOptions = options;
      return {
        isAuthenticated: async () => false,
        close: async () => {},
      };
    },
  });
  const status = await adapter.startLogin({ route: 'manual' });
  assert.equal(status.loginRoute, 'manual');
  assert.equal(status.rememberOnThisMac, false);
  assert.equal(createdOptions.acceptTerms, false);
  assert.equal(createdOptions.rememberOnThisMac, false);
  await assert.rejects(
    () => adapter.startLogin({ route: 'manual', rememberOnThisMac: true }),
    /never reads or writes/i,
  );
});

test('live adapter fails closed when its browser session is not authenticated', async () => {
  const adapter = new UwmLiveAdapter({
    transport: {
      isAuthenticated: async () => false,
      getSummary: async () => {
        throw new Error('UWM authentication is missing or expired.');
      },
    },
  });
  const status = await adapter.connectionStatus();
  assert.equal(status.authenticated, false);
  assert.match(status.error, /missing or expired/i);
  await assert.rejects(() => adapter.getSummary(), /missing or expired/i);
});

test('live adapter validates normalized values and exposes no transport details', async () => {
  const summary = {
    servicer: 'UWM',
    principalBalance: 424242.42,
    interestRate: 5.125,
    monthlyPayment: 3333.33,
    principalAndInterest: 2679.01,
    escrowPayment: 654.32,
    escrowBalance: 7654.32,
    nextDueDate: '2030-12-01',
    maturityDate: '2054-06-01',
    updatedAt: '2030-11-15T12:00:00.000Z',
  };
  const adapter = new UwmLiveAdapter({
    transport: {
      isAuthenticated: async () => true,
      getSummary: async () => structuredClone(summary),
      getPaymentHistory: async () => [{ date: '2030-11-01', total: 3333.33 }],
      getEscrow: async () => ({ balance: 7654.32, monthlyDeposit: 654.32 }),
      listStatements: async () => [
        { year: 2030, month: 11, date: '2030-11-02', title: 'Mortgage Statement', downloadUrl: null },
      ],
    },
  });
  assert.deepEqual(await adapter.getSummary(), summary);
  assert.deepEqual(await adapter.getPaymentHistory({ months: 12 }), [
    { date: '2030-11-01', total: 3333.33 },
  ]);
  const serialized = JSON.stringify({
    summary: await adapter.getSummary(),
    escrow: await adapter.getEscrow(),
    statements: await adapter.listStatements({ year: 2030 }),
  });
  assert.equal(/cookie|token|authorization|loan.?number/i.test(serialized), false);
});
