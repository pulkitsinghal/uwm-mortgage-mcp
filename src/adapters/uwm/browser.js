import { resolveBrowserLogin } from '../../../scripts/credential-bridge.mjs';
import { UWM_PORTAL_URL } from '../../login-options.js';
import {
  extractDashboard,
  extractMyLoan,
  extractStatements,
  selectBillingDocuments,
} from './extract.js';

const HOSTNAME = 'uwm.loanadministration.com';
const KEYCHAIN_SERVICE = 'uwm-mortgage-mcp:uwm.loanadministration.com';
export const UWM_ROUTES = Object.freeze({
  dashboard: 'https://uwm.loanadministration.com/uwm/#/dashboard',
  myLoan: 'https://uwm.loanadministration.com/uwm/#/my-loan',
  documents: 'https://uwm.loanadministration.com/uwm/#/document-center',
});

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class UwmBrowserTransport {
  constructor({ loginRoute = 'manual', acceptTerms = false, onePasswordItem, onePasswordAccount } = {}) {
    if (!['manual', 'onepassword'].includes(loginRoute)) {
      throw new Error('UWM live login route must be manual or onepassword.');
    }
    this.loginRoute = loginRoute;
    this.acceptTerms = acceptTerms;
    this.onePasswordItem = onePasswordItem;
    this.onePasswordAccount = onePasswordAccount;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.startError = null;
  }

  async start() {
    if (this.page || this.startError) return;
    try {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({ headless: false });
      this.context = await this.browser.newContext({ acceptDownloads: false });
      this.page = await this.context.newPage();
      await this.page.goto(UWM_PORTAL_URL, { waitUntil: 'domcontentloaded' });
      if (new URL(this.page.url()).hostname !== HOSTNAME) {
        throw new Error('Unexpected UWM login hostname.');
      }
      if (this.loginRoute === 'onepassword') await this.#submitOnePasswordLogin();
    } catch {
      this.startError = 'UWM live browser could not start securely.';
      await this.close();
    }
  }

  async #submitOnePasswordLogin() {
    if (!this.acceptTerms) {
      throw new Error('Explicit UWM terms acceptance is required for 1Password login.');
    }
    let credential = await resolveBrowserLogin({
      hostname: HOSTNAME,
      itemId: this.onePasswordItem,
      account: this.onePasswordAccount,
      keychainService: KEYCHAIN_SERVICE,
      cacheInKeychain: true,
    });
    const username = this.page.getByPlaceholder('Username', { exact: true });
    const password = this.page.locator('input[type="password"]:visible');
    const terms = this.page.locator('input[type="checkbox"][name="agree"]:visible');
    if ((await username.count()) !== 1 || (await password.count()) !== 1 || (await terms.count()) !== 1) {
      credential.username = '';
      credential.password = '';
      credential = null;
      throw new Error('Unexpected UWM login form.');
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
    await this.page.getByRole('button', { name: /^log in$/i }).click();
  }

  async isAuthenticated() {
    await this.start();
    if (!this.page || this.startError) return false;
    try {
      if (new URL(this.page.url()).hostname !== HOSTNAME) return false;
      if (/#\/login(?:$|[/?])/.test(this.page.url())) return false;
      if ((await this.page.locator('input[name="username"]:visible').count()) > 0) return false;
      return (
        (await this.page
          .getByRole('heading', { name: /^(DASHBOARD|MY LOAN|DOCUMENT CENTER)$/i })
          .count()) > 0
      );
    } catch {
      return false;
    }
  }

  async #navigate(url, heading) {
    if (!(await this.isAuthenticated())) {
      throw new Error('UWM authentication is missing or expired. Complete login and MFA locally.');
    }
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.getByRole('heading', { name: heading }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    if (!(await this.isAuthenticated())) {
      throw new Error('UWM authentication is missing or expired. Complete login and MFA locally.');
    }
  }

  async getSummary() {
    await this.#navigate(UWM_ROUTES.dashboard, /^DASHBOARD$/i);
    const dashboard = await extractDashboard(this.page);
    await this.#navigate(UWM_ROUTES.myLoan, /^MY LOAN$/i);
    const loan = await extractMyLoan(this.page, { months: 1 });
    return {
      servicer: 'UWM',
      principalBalance: dashboard.principalBalance,
      interestRate: loan.interestRate,
      rateType: null,
      monthlyPayment: dashboard.monthlyPayment,
      principalAndInterest: round2(dashboard.monthlyPayment - dashboard.escrowPayment),
      escrowPayment: dashboard.escrowPayment,
      escrowBalance: dashboard.escrowBalance,
      nextDueDate: dashboard.nextDueDate,
      maturityDate: loan.maturityDate,
      updatedAt: new Date().toISOString(),
    };
  }

  async getPaymentHistory({ months = 12 } = {}) {
    await this.#navigate(UWM_ROUTES.myLoan, /^MY LOAN$/i);
    return (await extractMyLoan(this.page, { months })).payments;
  }

  async getEscrow() {
    await this.#navigate(UWM_ROUTES.dashboard, /^DASHBOARD$/i);
    const dashboard = await extractDashboard(this.page);
    await this.#navigate(UWM_ROUTES.myLoan, /^MY LOAN$/i);
    const loan = await extractMyLoan(this.page, { months: 1 });
    return {
      ...loan.escrow,
      monthlyDeposit: dashboard.escrowPayment,
      updatedAt: new Date().toISOString(),
    };
  }

  async listStatements({ year } = {}) {
    await this.#navigate(UWM_ROUTES.documents, /^DOCUMENT CENTER$/i);
    await selectBillingDocuments(this.page);
    const statements = await extractStatements(this.page);
    return year ? statements.filter((statement) => statement.year === year) : statements;
  }

  async close() {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
