import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

import {
  extractDashboard,
  extractMyLoan,
  extractStatements,
  selectBillingDocuments,
} from '../src/adapters/uwm/extract.js';

const fixture = (name) =>
  fs.readFile(new URL(`./fixtures/uwm/${name}`, import.meta.url), 'utf8');

test('extracts normalized summary, payment, and escrow fields from synthetic observed markup', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(await fixture('dashboard.html'));
    const dashboard = await extractDashboard(page);
    assert.deepEqual(dashboard, {
      principalBalance: 424242.42,
      monthlyPayment: 3333.33,
      nextDueDate: '2030-12-01',
      escrowBalance: 7654.32,
      escrowPayment: 654.32,
    });

    await page.setContent(await fixture('my-loan.html'));
    const loan = await extractMyLoan(page, { months: 12 });
    assert.equal(loan.interestRate, 5.125);
    assert.equal(loan.maturityDate, '2054-06-01');
    assert.deepEqual(loan.payments, [
      { date: '2030-11-01', total: 3333.33 },
      { date: '2030-10-01', total: 3433.33 },
    ]);
    assert.deepEqual(loan.escrow, {
      balance: 7654.32,
      asOfDate: '2030-11-15',
      upcomingPayouts: [
        { type: 'tax', date: '2030-12', amount: 2345.67 },
        { type: 'insurance', date: '2031-06-15', amount: 1234.56 },
      ],
    });
  } finally {
    await browser.close();
  }
});

test('returns statement metadata without portal filenames, identifiers, or downloads', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(await fixture('document-center.html'));
    await selectBillingDocuments(page);
    const statements = await extractStatements(page);
    assert.deepEqual(statements, [
      {
        year: 2030,
        month: 11,
        date: '2030-11-02',
        title: 'Mortgage Statement',
        downloadUrl: null,
      },
      {
        year: 2030,
        month: 10,
        date: '2030-10-02',
        title: 'Mortgage Statement',
        downloadUrl: null,
      },
    ]);
    assert.equal(JSON.stringify(statements).includes('FAKE-LOAN'), false);
  } finally {
    await browser.close();
  }
});

test('selects Billing from a custom document category control', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        aria-controls="document-options"
        aria-expanded="false"
        aria-label="Documents"
        role="combobox"
        tabindex="0"
      >Choose category</div>
      <div id="document-options" role="listbox" hidden>
        <div role="option">Billing</div>
      </div>
      <table hidden>
        <tr><th>Type</th><th>Date</th></tr>
        <tr><td>MORTGAGE STATEMENT</td><td>11/02/2030</td></tr>
      </table>
      <script>
        const selector = document.querySelector('[role="combobox"]');
        const options = document.querySelector('[role="listbox"]');
        const table = document.querySelector('table');
        selector.addEventListener('click', () => {
          selector.setAttribute('aria-expanded', 'true');
          options.hidden = false;
        });
        options.addEventListener('click', () => {
          options.hidden = true;
          table.hidden = false;
        });
      </script>
    `);

    await selectBillingDocuments(page);
    assert.equal(await page.getByRole('row').filter({ hasText: /MORTGAGE STATEMENT/i }).count(), 1);
  } finally {
    await browser.close();
  }
});
