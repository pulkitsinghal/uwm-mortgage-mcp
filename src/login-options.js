export const UWM_PORTAL_URL = 'https://uwm.loanadministration.com/uwm/#/login';

const sharedLimits = Object.freeze({
  credentialsInLogs: false,
  persistsBrowserProfile: false,
  automatesMfa: false,
  bypassesCaptcha: false,
  mutatesMortgageAccount: false,
});

export function loginOptions() {
  return {
    portalUrl: UWM_PORTAL_URL,
    setupGuide: [
      {
        step: 'choose-login-route',
        userAction: 'Choose 1Password biometric approval or manual login.',
      },
      {
        step: 'submit-primary-login',
        userAction:
          'Use the selected route for username and password. Never paste either value into MCP or chat.',
      },
      {
        step: 'complete-uwm-mfa',
        userAction:
          'If UWM offers email OTP, request the email, retrieve the one-time code privately, and enter it only in the UWM browser.',
        neverShareWithMcp: ['one-time code', 'email contents', 'email address'],
        automated: false,
      },
      {
        step: 'confirm-dashboard',
        userAction:
          'Wait for the authenticated mortgage dashboard, then confirm readiness without sharing account data.',
      },
    ],
    routes: [
      {
        id: 'onepassword',
        label: '1Password with biometric approval',
        command: 'UWM_MCP_ACCEPT_TERMS=1 npm run start:live:1password',
        validationCommand: 'npm run capture:uwm:1password -- --accept-terms',
        requires: [
          'macOS',
          '1Password CLI',
          '1Password desktop CLI integration',
          'UWM_OP_ACCOUNT when multiple 1Password accounts are configured',
        ],
        requiresExplicitTermsConsent: true,
        completesMfa: 'user',
        cachesCredentialIn: 'macOS Keychain',
        ...sharedLimits,
      },
      {
        id: 'manual',
        label: 'Log in yourself',
        command: 'npm run start:live:manual',
        validationCommand: 'npm run capture:uwm',
        requires: ['headed browser'],
        requiresExplicitTermsConsent: false,
        completesMfa: 'user',
        cachesCredentialIn: null,
        ...sharedLimits,
      },
    ],
  };
}
