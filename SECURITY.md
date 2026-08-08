# Security

This project is intentionally read-only. It must not expose tools that initiate ACH, card, wire, autopay enrollment, payoff requests, or any other movement of money.

Never commit credentials, cookies, HAR files, loan numbers, SSNs, statement PDFs, or authenticated portal responses. Use local ignored files and OS keychain/secret storage for any future live adapter.

The UWM adapter may only use endpoints observed and validated during the account owner's authenticated session. Do not bypass MFA, CAPTCHA, rate limits, or access controls.
