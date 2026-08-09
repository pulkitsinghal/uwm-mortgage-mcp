import { assertMortgageSummary, assertPayment } from '../../schema.js';
import { UwmBrowserTransport } from './browser.js';

export class UwmLiveAdapter {
  constructor(options = {}) {
    this.transport = options.transport || new UwmBrowserTransport(options);
  }

  async connectionStatus() {
    const authenticated = await this.transport.isAuthenticated();
    return {
      adapter: 'uwm-live-browser',
      authenticated,
      live: true,
      readOnly: true,
      extraction: 'observed-browser-ui',
      ...(authenticated ? {} : { error: 'UWM authentication is missing or expired.' }),
    };
  }

  async getSummary() {
    return assertMortgageSummary(await this.transport.getSummary());
  }

  async getPaymentHistory({ months = 12 } = {}) {
    return (await this.transport.getPaymentHistory({ months })).map(assertPayment);
  }

  async getEscrow() {
    return this.transport.getEscrow();
  }

  async listStatements({ year } = {}) {
    return this.transport.listStatements({ year });
  }

  async close() {
    await this.transport.close?.();
  }
}
