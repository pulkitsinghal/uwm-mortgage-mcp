import test from 'node:test';
import assert from 'node:assert/strict';

import { UwmLiveAdapter } from '../src/adapters/uwm/live.js';

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
