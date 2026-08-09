#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveBrowserLogin } from './credential-bridge.mjs';
import { UWM_ROUTES } from '../src/adapters/uwm/browser.js';
import {
  extractDashboard,
  extractMyLoan,
  extractStatements,
  selectBillingDocuments,
} from '../src/adapters/uwm/extract.js';

const LOGIN_URL = 'https://uwm.loanadministration.com/uwm/#/login';
const LOGIN_HOSTNAME = 'uwm.loanadministration.com';
const KEYCHAIN_SERVICE = 'uwm-mortgage-mcp:uwm.loanadministration.com';
const args = new Set(process.argv.slice(2));
const useOnePassword = args.has('--onepassword');
const acceptTerms = args.has('--accept-terms');
const itemArgumentIndex = process.argv.indexOf('--op-item');
const onePasswordItem = itemArgumentIndex >= 0 ? process.argv[itemArgumentIndex + 1] : undefined;
const accountArgumentIndex = process.argv.indexOf('--op-account');
const onePasswordAccount =
  accountArgumentIndex >= 0 ? process.argv[accountArgumentIndex + 1] : undefined;

if (args.has('--help')) {
  console.error(
    'Usage: npm run capture:uwm [-- --onepassword --accept-terms [--op-account ACCOUNT] [--op-item ITEM_ID]]',
  );
  console.error('Without --onepassword, login remains entirely manual.');
  process.exit(0);
}

if (useOnePassword && !acceptTerms) {
  console.error('The 1Password route requires explicit --accept-terms consent for this login.');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright is required only for live discovery. Install locally with: npm install && npx playwright install chromium',
  );
  process.exit(2);
}

const outputDirectory = path.resolve(process.env.UWM_CAPTURE_DIR || 'private/uwm-capture');
const relevantFieldPattern =
  /principal|balance|interest|rate|payment|escrow|due|maturity|statement|loan/i;
const sensitiveFieldPattern =
  /authorization|bearer|cookie|credential|csrf|jwt|loan.?number|loan.?id|mfa|passcode|password|session|ssn|token/i;

function waitForEnter() {
  process.stdin.resume();
  return new Promise((resolve) => process.stdin.once('data', resolve));
}

function collectCandidateKeys(value, prefix = '', depth = 0, keys = new Set()) {
  if (depth > 7 || value == null) return keys;
  if (Array.isArray(value)) {
    for (const [index, item] of value.slice(0, 3).entries()) {
      collectCandidateKeys(item, `${prefix}[${index}]`, depth + 1, keys);
    }
    return keys;
  }
  if (typeof value !== 'object') return keys;

  for (const [key, child] of Object.entries(value)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    if (relevantFieldPattern.test(key)) keys.add(childPath);
    collectCandidateKeys(child, childPath, depth + 1, keys);
  }
  return keys;
}

function redactSensitiveFields(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (value == null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveFieldPattern.test(key) ? '[REDACTED]' : redactSensitiveFields(child),
    ]),
  );
}

function sanitizePathname(pathname) {
  const sensitiveSegment = /^(?:\d{6,}|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{24,})$/i;
  return pathname
    .split('/')
    .map((segment) => (sensitiveSegment.test(segment) ? ':redacted' : segment))
    .join('/');
}

await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
await fs.chmod(outputDirectory, 0o700);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ acceptDownloads: false });
const page = await context.newPage();
const records = [];

await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

if (new URL(page.url()).hostname !== LOGIN_HOSTNAME) {
  throw new Error('Login refused: UWM did not remain on the expected HTTPS hostname.');
}

if (useOnePassword) {
  console.error('Requesting the exact UWM Login item through 1Password desktop integration.');
  console.error('Approve the biometric prompt locally; no credential output will be shown.');
  let credential;
  try {
    credential = await resolveBrowserLogin({
      hostname: LOGIN_HOSTNAME,
      itemId: onePasswordItem,
      account: onePasswordAccount,
      keychainService: KEYCHAIN_SERVICE,
      cacheInKeychain: true,
    });
  } catch {
    await context.close();
    await browser.close();
    console.error('1Password login was unavailable or denied. No form data was submitted.');
    console.error('Use the manual capture route or verify 1Password desktop CLI integration.');
    process.exit(2);
  }

  const username = page.getByPlaceholder('Username', { exact: true });
  const password = page.locator('input[type="password"]:visible');
  const terms = page.locator('input[type="checkbox"][name="agree"]:visible');

  if ((await username.count()) !== 1 || (await password.count()) !== 1 || (await terms.count()) !== 1) {
    credential.username = '';
    credential.password = '';
    credential = null;
    await context.close();
    await browser.close();
    throw new Error('Login refused: the expected UWM login form was not found exactly once.');
  }

  try {
    await username.fill(credential.username);
    await password.fill(credential.password);
    await terms.check();
  } finally {
    credential.username = '';
    credential.password = '';
    credential = null;
  }
  await page.getByRole('button', { name: /^log in$/i }).click();
  console.error('UWM credentials were submitted without being logged or written to disk.');
  console.error('If UWM offers email OTP, request it and retrieve the code privately.');
  console.error('Enter the one-time code only in the UWM browser, never in this terminal or chat.');
  console.error('MFA is never retrieved or automated.');
} else {
  console.error('Manual route selected. Complete UWM login and MFA only in the opened browser.');
  console.error('Do not enter credentials in this terminal or chat.');
}

console.error('Wait for the authenticated mortgage dashboard, then tell Codex only that you are ready.');
await waitForEnter();

const authenticatedPageUrl = new URL(page.url());
if (
  authenticatedPageUrl.protocol !== 'https:' ||
  authenticatedPageUrl.hostname !== LOGIN_HOSTNAME ||
  /#\/login(?:$|[/?])/.test(authenticatedPageUrl.href) ||
  (await page.locator('input[name="username"]:visible').count()) > 0
) {
  throw new Error('Capture refused: UWM authentication is missing or expired.');
}
const captureOrigin = authenticatedPageUrl.origin;

page.on('response', async (response) => {
  try {
    const request = response.request();
    if (!['xhr', 'fetch'].includes(request.resourceType())) return;

    const responseUrl = new URL(response.url());
    if (responseUrl.origin !== captureOrigin) return;

    const contentType = response.headers()['content-type'] || '';
    if (!contentType.toLowerCase().includes('json')) return;

    const text = await response.text();
    if (text.length > 5_000_000) return;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const candidateKeys = [...collectCandidateKeys(parsed)];
    if (candidateKeys.length === 0) return;

    records.push({
      capturedAt: new Date().toISOString(),
      method: request.method(),
      origin: responseUrl.origin,
      pathname: sanitizePathname(responseUrl.pathname),
      queryKeys: [...responseUrl.searchParams.keys()].sort(),
      status: response.status(),
      contentType,
      candidateKeys: candidateKeys.slice(0, 120),
      body: JSON.stringify(redactSensitiveFields(parsed)),
    });
    console.error(`Captured relevant JSON response #${records.length} (HTTP ${response.status()}).`);
  } catch {
    // A response that cannot be safely parsed is intentionally skipped.
  }
});

console.error('Capture is active only for the current authenticated origin.');
console.error('Automatically validating dashboard, payment history, escrow, and statement metadata.');
console.error('Statement files will not be opened or downloaded.');

async function navigate(url, heading) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: heading }).waitFor({ state: 'visible', timeout: 30_000 });
  if (/#\/login(?:$|[/?])/.test(page.url())) {
    throw new Error('Capture refused: UWM authentication expired during extraction.');
  }
}

await navigate(UWM_ROUTES.dashboard, /^DASHBOARD$/i);
const dashboard = await extractDashboard(page);
await navigate(UWM_ROUTES.myLoan, /^MY LOAN$/i);
const loan = await extractMyLoan(page, { months: 120 });
await navigate(UWM_ROUTES.documents, /^DOCUMENT CENTER$/i);
await selectBillingDocuments(page);
const statements = await extractStatements(page);
const browserExtraction = {
  summary: {
    servicer: 'UWM',
    principalBalance: dashboard.principalBalance,
    interestRate: loan.interestRate,
    monthlyPayment: dashboard.monthlyPayment,
    principalAndInterest:
      Math.round((dashboard.monthlyPayment - dashboard.escrowPayment + Number.EPSILON) * 100) /
      100,
    escrowPayment: dashboard.escrowPayment,
    escrowBalance: dashboard.escrowBalance,
    nextDueDate: dashboard.nextDueDate,
    maturityDate: loan.maturityDate,
    updatedAt: new Date().toISOString(),
  },
  payments: loan.payments,
  escrow: {
    ...loan.escrow,
    monthlyDeposit: dashboard.escrowPayment,
    updatedAt: new Date().toISOString(),
  },
  statements,
};

const captureFile = path.join(outputDirectory, `responses-${Date.now()}.json`);
await fs.writeFile(
  captureFile,
  JSON.stringify(
    {
      schemaVersion: 3,
      capturedAt: new Date().toISOString(),
      origin: captureOrigin,
      strategy: records.length > 0 ? 'same-origin-json-and-browser-extraction' : 'browser-extraction',
      responses: records,
      browserExtraction,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.error(
  `Saved ${records.length} redacted same-origin JSON responses and normalized browser extraction to ${captureFile}`,
);
process.stdin.pause();
await context.close();
await browser.close();
