# UWM Mortgage MCP

A read-only Model Context Protocol (MCP) server for mortgage tracking with an authenticated UWM browser adapter.

> **Private alpha:** live validation found no stable same-origin JSON response for the required views. The adapter therefore uses narrowly scoped browser extraction on only the authenticated views observed during owner validation. It does not invent or call undocumented borrower endpoints.

## Safety properties

- Read-only by design.
- No `make_payment`, ACH, transfer, autopay enrollment, or payoff-request tool.
- No passwords, SSNs, loan numbers, cookies, HAR files, or statements belong in git.
- Mortgage calculations run locally and never initiate financial activity.

## Tools

- `mortgage_connection_status`
- `mortgage_start_login`
- `mortgage_get_summary`
- `mortgage_get_payment_history`
- `mortgage_get_escrow`
- `mortgage_list_statements`
- `mortgage_calculate_extra_payment`

## Run the mock server

```bash
UWM_MCP_MODE=mock node src/server.js
```

MCP stdio messages are newline-delimited JSON-RPC. The server supports modern `2026-07-28` discovery/per-request metadata and legacy initialize-based clients for compatibility.

## Run from a validated snapshot

Copy `config/snapshot.example.json` to a private location, replace it with data captured from your own UWM session, then:

```bash
UWM_MCP_MODE=snapshot \
UWM_MCP_SNAPSHOT=/absolute/private/path/uwm.snapshot.json \
node src/server.js
```

## Run the live UWM adapter

The live adapter keeps one ephemeral headed browser open for the MCP process lifetime. It does not save a browser profile, cookies, or storage state.

For the guided MCP/plugin flow, start live mode without preselecting a route:

```bash
UWM_MCP_MODE=live npm start
```

Call `mortgage_connection_status`. While setup is incomplete it is side-effect-free: it returns the
1Password and manual choices without opening a browser, querying 1Password, or reading/writing
Keychain. Present both choices to the user, then call `mortgage_start_login` with the selected route.

For `onepassword`, `acceptUwmTerms: true` is required immediately before login. Keychain persistence
requires a separate `rememberOnThisMac: true` opt-in and defaults to false. The login action never
accepts a username, password, or MFA value.

The commands below are advanced direct-start fallbacks for local testing. Running one explicitly
preselects that route.

1Password-assisted route on macOS, after the user explicitly agrees to UWM's terms for that login:

```bash
UWM_MCP_ACCEPT_TERMS=1 npm run start:live:1password
```

If more than one 1Password account is configured, set `UWM_OP_ACCOUNT` to the intended account shorthand or ID. `UWM_OP_ITEM` may likewise pin a Login item; the exact UWM hostname is still verified before any field is read.

Manual route:

```bash
npm run start:live:manual
```

The 1Password route requests desktop biometric approval and fills only the primary login form. The guided route uses macOS Keychain only after the separate remember-on-this-Mac opt-in. The manual route leaves the form to the user. Both routes leave UWM email OTP/MFA entirely to the user; enter one-time codes only in the UWM browser and never in MCP or chat. Call connection status again after the dashboard appears.

The observed browser adapter supports:

- summary: principal balance, interest rate, monthly payment, derived principal-and-interest payment, escrow payment/balance, next due date, and maturity date;
- payment history: the date and total for initially rendered recent payment rows;
- escrow: current balance, as-of date, monthly deposit, and initially rendered upcoming tax/insurance payouts;
- statements: Billing statement date, year, month, and a generic title, with no filename, loan identifier, or download URL;
- local extra-payment/payoff projections using normalized summary fields.

It does not support payment allocation breakdowns, expanding older activity, statement downloads/content, contact information, loan identifiers, autopay changes, payoff requests, or any other account mutation.

## Test

```bash
npm test
npm run selftest
npm run check
npm run privacy:scan
```

## Live UWM validation

The account owner authenticated normally to UWM and validated the actual servicing transport. The allowed same-origin JSON capture produced zero relevant records, so the implementation uses the required browser-extraction fallback. Do not bypass MFA or CAPTCHA. Persist secrets outside the repo.

The live test acceptance criteria are:

1. principal balance matches the portal,
2. interest rate matches,
3. monthly payment and next due date match,
4. escrow balance matches when applicable,
5. at least two recent payment dates and totals match the rendered portal history,
6. logout/expired session fails closed,
7. no tool can cause a payment or account mutation.

## Publication gate

`package.json` intentionally contains `"private": true`. Remove that only after live verification, privacy review, trademark wording review, and any marketplace signing requirements are independently validated.

This project is not affiliated with or endorsed by UWM.

## Private live-discovery helper

For the account-owner test, run this **on the user's own machine**. The connection-status response exposes the same two login routes to every MCP client:

- `onepassword`: 1Password CLI requests desktop biometric approval, caches the login in macOS Keychain for later local runs, fills only the UWM username/password form, and leaves MFA to the user. Each run requires explicit acceptance of UWM's terms.
- `manual`: the user fills the UWM login form and MFA without credential automation.

After the primary login, UWM may offer an email one-time passcode. Request the email in the UWM browser, retrieve the code privately, and enter it only in that browser. Never paste the code, email contents, or email address into MCP, chat, or a terminal. Wait for the authenticated mortgage dashboard before confirming that setup is ready.

1Password route:

```bash
npm run capture:uwm:1password -- --accept-terms
```

Manual route:

```bash
npm install
npx playwright install chromium
npm run capture:uwm
```

Both routes open the exact UWM servicing URL. The browser context is ephemeral: no browser profile, cookies, or storage state are saved. After the authenticated dashboard appears, confirm readiness once in the terminal. The helper then automatically visits the observed dashboard, My Loan, and Document Center/Billing views and never opens a statement file. The capture is written under ignored `private/` storage with mode 0600 and includes normalized browser-extraction data when same-origin JSON is unavailable. It does not persist passwords, cookies, or browser storage, but the private capture contains mortgage data and must never be committed.

Then inspect candidate response fields without printing full response bodies:

```bash
npm run inspect:capture -- private/uwm-capture/responses-....json
```

The inspector prints only candidate key paths and record counts, never captured values. This keeps private data out of logs and makes UWM portal changes detectable.
