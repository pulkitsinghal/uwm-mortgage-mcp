# UWM Mortgage MCP

A read-only Model Context Protocol (MCP) server for mortgage tracking, designed to support United Wholesale Mortgage (UWM) servicing data after an account owner validates the portal integration.

> **Private alpha:** live UWM access is deliberately not hard-coded yet. UWM publicly documents its servicing portal, but not a public borrower API. The live adapter must be verified against an authenticated user session before release.

## Safety properties

- Read-only by design.
- No `make_payment`, ACH, transfer, autopay enrollment, or payoff-request tool.
- No passwords, SSNs, loan numbers, cookies, HAR files, or statements belong in git.
- Mortgage calculations run locally and never initiate financial activity.

## Tools

- `mortgage_connection_status`
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

## Test

```bash
npm test
npm run selftest
```

## Live UWM adapter gate

Before a public release, the account owner must authenticate normally to UWM and verify the actual servicing data transport. The implementation should prefer stable authenticated JSON endpoints if the portal uses them; otherwise use narrowly scoped browser extraction. Do not bypass MFA or CAPTCHA. Persist secrets outside the repo.

The live test acceptance criteria are:

1. principal balance matches the portal,
2. interest rate matches,
3. monthly payment and next due date match,
4. escrow balance matches when applicable,
5. at least two recent payments reconcile principal/interest/escrow,
6. logout/expired session fails closed,
7. no tool can cause a payment or account mutation.

## Publication gate

`package.json` intentionally contains `"private": true`. Remove that only after live verification, privacy review, trademark wording review, and any marketplace signing requirements are independently validated.

This project is not affiliated with or endorsed by UWM.

## Private live-discovery helper

For the account-owner test, run this **on the user's own machine** so login/MFA happens directly in the UWM browser session:

```bash
npm install
npx playwright install chromium
npm run capture:uwm
```

Navigate through the UWM summary, payment history, escrow, and statements pages, then press Enter in the terminal. The capture is written under ignored `private/` storage with mode 0600. It does not intentionally persist passwords or cookies into the capture file, although authenticated JSON response bodies can contain sensitive mortgage data and must never be committed.

Then inspect candidate response fields without printing full response bodies:

```bash
npm run inspect:capture -- private/uwm-capture/responses-....json
```

Use the verified response shapes to implement a minimal live adapter. This keeps guessed private endpoints out of the project and makes UWM portal changes detectable.
