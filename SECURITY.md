# Security

This project is intentionally read-only. It must not expose tools that initiate ACH, card, wire, autopay enrollment, payoff requests, or any other movement of money.

Never commit credentials, cookies, HAR files, loan numbers, SSNs, statement PDFs, or authenticated portal responses. Use local ignored files and OS keychain/secret storage for any future live adapter.

The UWM adapter may only use endpoints observed and validated during the account owner's authenticated session. Do not bypass MFA, CAPTCHA, rate limits, or access controls.

Live validation found no stable same-origin JSON transport for the required views, so the adapter uses narrow browser extraction on only the observed dashboard, My Loan, and Document Center/Billing routes. It never opens or downloads statements, expands payment controls, visits payoff flows, or exposes loan identifiers, portal filenames, contact details, cookies, storage state, or session values through MCP responses or logs.

The 1Password route requires explicit per-run terms consent, exact-host Login-item matching, and local biometric approval. UWM email OTP/MFA remains user-completed in the browser. The manual login route must remain available.

Run `npm run privacy:scan` before staging and `npm run privacy:scan -- --staged` before committing. The scan reports only filenames and rule names, never matching content.
