const MONTHS = new Map(
  [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ].map((month, index) => [month, index + 1]),
);

function requiredMatch(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) throw new Error(`UWM browser extraction could not find ${label}.`);
  return match;
}

function money(value) {
  const parsed = Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(parsed)) throw new Error('UWM browser extraction found invalid money.');
  return parsed;
}

function number(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('UWM browser extraction found an invalid number.');
  return parsed;
}

function isoDateFromLongDate(value) {
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(value.trim());
  if (!match) throw new Error('UWM browser extraction found an invalid date.');
  const month = MONTHS.get(match[1].slice(0, 3).toLowerCase());
  if (!month) throw new Error('UWM browser extraction found an invalid month.');
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function isoDateFromNumeric(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new Error('UWM browser extraction found an invalid numeric date.');
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function isoMonthOrDate(value) {
  const parts = value.trim().split('/');
  if (parts.length === 2) return `${parts[1]}-${parts[0].padStart(2, '0')}`;
  return isoDateFromNumeric(value);
}

function isoDateFromMonthYear(value) {
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(value.trim());
  if (!match) throw new Error('UWM browser extraction found an invalid month and year.');
  const month = MONTHS.get(match[1].slice(0, 3).toLowerCase());
  if (!month) throw new Error('UWM browser extraction found an invalid month.');
  return `${match[2]}-${String(month).padStart(2, '0')}-01`;
}

export async function extractDashboard(page) {
  const text = await page.locator('body').innerText();
  return {
    principalBalance: money(
      requiredMatch(text, /Your Loan balance is\s*\$([\d,]+(?:\.\d{2})?)/i, 'loan balance')[1],
    ),
    monthlyPayment: money(
      requiredMatch(
        text,
        /Monthly Payment Amount:\s*\$([\d,]+(?:\.\d{2})?)/i,
        'monthly payment',
      )[1],
    ),
    nextDueDate: isoDateFromLongDate(
      requiredMatch(
        text,
        /Actual Due Date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i,
        'next due date',
      )[1],
    ),
    escrowBalance: money(
      requiredMatch(text, /\$([\d,]+(?:\.\d{2})?)\s*Escrow Balance/i, 'escrow balance')[1],
    ),
    escrowPayment: money(
      requiredMatch(
        text,
        /\$([\d,]+(?:\.\d{2})?)\s*Monthly Escrow Payment/i,
        'monthly escrow payment',
      )[1],
    ),
  };
}

export async function extractMyLoan(page, { months = 12 } = {}) {
  const text = await page.locator('body').innerText();
  const paymentLabels = await page
    .getByRole('button', { name: /^Payment Applied:/i })
    .allInnerTexts();
  const payments = paymentLabels
    .map((label) => {
      const match = /^Payment Applied:\s*(.+?)\s+\$([\d,]+(?:\.\d{2})?)$/i.exec(
        label.replace(/\s+/g, ' ').trim(),
      );
      if (!match) return null;
      return { date: isoDateFromLongDate(match[1]), total: money(match[2]) };
    })
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(months, 120)));

  const escrowSection = requiredMatch(
    text,
    /Current Escrow Balance[\s\S]{0,300}?As of\s+(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]{0,200}?\$([\d,]+(?:\.\d{2})?)/i,
    'current escrow section',
  );
  const upcomingPayouts = [];
  const payoutPattern = /\b(Tax|Insurance)\s+(\d{1,2}\/(?:\d{1,2}\/)?\d{4})\s+\$([\d,]+(?:\.\d{2})?)/gi;
  for (const match of text.matchAll(payoutPattern)) {
    upcomingPayouts.push({
      type: match[1].toLowerCase(),
      date: isoMonthOrDate(match[2]),
      amount: money(match[3]),
    });
  }

  return {
    interestRate: number(
      requiredMatch(text, /([\d.]+)%\s*Rate\s*\|/i, 'interest rate')[1],
    ),
    maturityDate: isoDateFromMonthYear(
      requiredMatch(text, /Your Loan Ends\s*([A-Za-z]+\s+\d{4})/i, 'maturity date')[1],
    ),
    payments,
    escrow: {
      balance: money(escrowSection[2]),
      asOfDate: isoDateFromNumeric(escrowSection[1]),
      upcomingPayouts,
    },
  };
}

export async function selectBillingDocuments(page) {
  const candidates = [
    page.getByRole('listbox', { name: /Documents/i }),
    page.getByRole('combobox', { name: /Documents/i }),
    page.getByLabel(/Documents/i),
  ];
  let documents = null;
  for (const candidate of candidates) {
    if ((await candidate.count()) === 1) {
      documents = candidate;
      break;
    }
  }
  if (!documents) {
    throw new Error('UWM browser extraction could not find the document category selector.');
  }
  await documents.selectOption({ label: 'Billing' });
  await page.getByRole('row').filter({ hasText: /MORTGAGE STATEMENT/i }).first().waitFor({
    state: 'visible',
    timeout: 30_000,
  });
}

export async function extractStatements(page) {
  const rows = await page.getByRole('row').allInnerTexts();
  return rows
    .map((row) => {
      const match = /MORTGAGE STATEMENT[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(row);
      if (!match) return null;
      const date = isoDateFromNumeric(match[1]);
      const [year, month] = date.split('-').map(Number);
      return { year, month, date, title: 'Mortgage Statement', downloadUrl: null };
    })
    .filter(Boolean);
}
