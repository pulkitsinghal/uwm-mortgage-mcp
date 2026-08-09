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
        userAction:
          'Present both choices, then call mortgage_start_login only after the user selects one.',
      },
      {
        step: 'confirm-login-consent',
        userAction:
          'For 1Password, obtain explicit UWM terms consent and separate Remember on this Mac consent.',
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
        recommendedWhenAvailable: true,
        requires: [
          'macOS',
          '1Password CLI',
          '1Password desktop CLI integration',
          'UWM_OP_ACCOUNT when multiple 1Password accounts are configured',
        ],
        requiresExplicitTermsConsent: true,
        completesMfa: 'user',
        cachesCredentialIn: 'macOS Keychain only with separate opt-in',
        ...sharedLimits,
      },
      {
        id: 'manual',
        label: 'Log in yourself',
        recommendedWhenAvailable: false,
        requires: ['headed browser'],
        requiresExplicitTermsConsent: false,
        completesMfa: 'user',
        cachesCredentialIn: null,
        ...sharedLimits,
      },
    ],
  };
}
