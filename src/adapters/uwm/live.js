import { assertMortgageSummary, assertPayment } from '../../schema.js';
import { UwmBrowserTransport } from './browser.js';

export class UwmLiveAdapter {
  constructor(options = {}) {
    this.onePasswordItem = options.onePasswordItem;
    this.onePasswordAccount = options.onePasswordAccount;
    this.transportFactory = options.transportFactory || ((transportOptions) => new UwmBrowserTransport(transportOptions));
    this.transport = options.transport || null;
    this.loginRoute = options.transport ? 'injected' : null;
    this.rememberOnThisMac = false;
    if (!this.transport && options.loginRoute) {
      this.#configureTransport({
        route: options.loginRoute,
        acceptUwmTerms: options.acceptTerms === true,
        rememberOnThisMac: options.rememberOnThisMac === true,
      });
    }
  }

  async connectionStatus() {
    if (!this.transport) {
      return {
        adapter: 'uwm-live-browser',
        authenticated: false,
        live: true,
        readOnly: true,
        extraction: 'observed-browser-ui',
        setupRequired: true,
        loginRoute: null,
        error: 'Choose a UWM login route before requesting mortgage data.',
      };
    }
    const authenticated = await this.transport.isAuthenticated();
    const connectionDetails = this.transport.connectionDetails?.() || {};
    return {
      adapter: 'uwm-live-browser',
      authenticated,
      live: true,
      readOnly: true,
      extraction: 'observed-browser-ui',
      setupRequired: false,
      loginRoute: this.loginRoute,
      rememberOnThisMac: this.rememberOnThisMac,
      ...connectionDetails,
      ...(authenticated ? {} : { error: 'UWM authentication is missing or expired.' }),
    };
  }

  #validateLoginSelection({ route, acceptUwmTerms = false, rememberOnThisMac = false }) {
    if (!['manual', 'onepassword'].includes(route)) {
      throw new Error('UWM login route must be onepassword or manual.');
    }
    if (route === 'onepassword' && acceptUwmTerms !== true) {
      throw new Error('Explicit UWM terms acceptance is required before 1Password login.');
    }
    if (typeof rememberOnThisMac !== 'boolean') {
      throw new Error('Remember-on-this-Mac consent must be true or false.');
    }
    if (route === 'manual' && rememberOnThisMac) {
      throw new Error('Manual login never reads or writes a cached Keychain login.');
    }
  }

  #configureTransport({ route, acceptUwmTerms = false, rememberOnThisMac = false }) {
    this.#validateLoginSelection({ route, acceptUwmTerms, rememberOnThisMac });
    this.transport = this.transportFactory({
      loginRoute: route,
      acceptTerms: acceptUwmTerms,
      rememberOnThisMac,
      onePasswordItem: this.onePasswordItem,
      onePasswordAccount: this.onePasswordAccount,
    });
    this.loginRoute = route;
    this.rememberOnThisMac = rememberOnThisMac;
  }

  async startLogin({ route, acceptUwmTerms = false, rememberOnThisMac = false } = {}) {
    this.#validateLoginSelection({ route, acceptUwmTerms, rememberOnThisMac });
    await this.transport?.close?.();
    this.transport = null;
    this.loginRoute = null;
    this.rememberOnThisMac = false;
    this.#configureTransport({ route, acceptUwmTerms, rememberOnThisMac });
    return this.connectionStatus();
  }

  #requireTransport() {
    if (!this.transport) {
      throw new Error('UWM authentication setup is required. Choose a login route first.');
    }
    return this.transport;
  }

  async getSummary() {
    return assertMortgageSummary(await this.#requireTransport().getSummary());
  }

  async getPaymentHistory({ months = 12 } = {}) {
    return (await this.#requireTransport().getPaymentHistory({ months })).map(assertPayment);
  }

  async getEscrow() {
    return this.#requireTransport().getEscrow();
  }

  async listStatements({ year } = {}) {
    return this.#requireTransport().listStatements({ year });
  }

  async close() {
    await this.transport.close?.();
  }
}
