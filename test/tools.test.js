import test from 'node:test';
import assert from 'node:assert/strict';
import { MockMortgageAdapter } from '../src/adapters/mock.js';
import { callTool, toolDefinitions } from '../src/tools.js';

test('server exposes guided login plus only mortgage-read and local calculation tools', () => {
  const names = toolDefinitions().map((tool) => tool.name);
  assert.deepEqual(names, [
    'mortgage_connection_status',
    'mortgage_start_login',
    'mortgage_get_summary',
    'mortgage_get_payment_history',
    'mortgage_get_escrow',
    'mortgage_list_statements',
    'mortgage_calculate_extra_payment',
  ]);
  const forbidden = [
    'make_payment',
    'submit_payment',
    'send_payment',
    'enroll_autopay',
    'create_ach',
    'transfer_funds',
    'request_payoff',
  ];
  assert.ok(!names.some((name) => forbidden.some((verb) => name.includes(verb))));
});

test('summary validates', async () => {
  const summary = await callTool(new MockMortgageAdapter(), 'mortgage_get_summary', {});
  assert.equal(summary.servicer, 'UWM');
  assert.equal(typeof summary.principalBalance, 'number');
});

test('tool safety annotations distinguish local login setup from mortgage reads', () => {
  for (const tool of toolDefinitions()) {
    assert.equal(tool.annotations?.destructiveHint, false, tool.name);
    if (tool.name === 'mortgage_start_login') {
      assert.equal(tool.annotations?.readOnlyHint, false, tool.name);
      assert.equal(tool.annotations?.idempotentHint, false, tool.name);
    } else {
      assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    }
  }
});

test('connection status presents 1Password, manual login, and private MFA guidance', async () => {
  const adapter = new MockMortgageAdapter();
  const status = await callTool(adapter, 'mortgage_connection_status', {});
  assert.equal(status.login.publisherDisclosure.communityContributed, true);
  assert.equal(status.login.publisherDisclosure.officialUwmProduct, false);
  assert.equal(status.login.publisherDisclosure.affiliatedWithUwm, false);
  assert.equal(status.login.publisherDisclosure.speaksForUwm, false);
  assert.match(status.login.publisherDisclosure.text, /Unofficial community software/);
  assert.equal(status.login.portalUrl, 'https://uwm.loanadministration.com/uwm/#/login');
  assert.deepEqual(status.login.routes.map((route) => route.id), ['onepassword', 'manual']);
  assert.equal(status.login.routes[0].recommendedWhenAvailable, true);
  for (const route of status.login.routes) {
    assert.equal(route.automatesMfa, false);
    assert.equal(route.mutatesMortgageAccount, false);
    assert.equal('command' in route, false);
  }
  assert.equal(status.login.routes[0].requiresExplicitTermsConsent, true);
  const mfa = status.login.setupGuide.find((step) => step.step === 'complete-uwm-mfa');
  assert.equal(mfa.automated, false);
  assert.ok(mfa.neverShareWithMcp.includes('one-time code'));

  const started = await callTool(adapter, 'mortgage_start_login', {
    route: 'onepassword',
    acceptUwmTerms: true,
    rememberOnThisMac: false,
  });
  assert.equal(started.loginRoute, 'onepassword');
  assert.equal(started.rememberOnThisMac, false);
});
