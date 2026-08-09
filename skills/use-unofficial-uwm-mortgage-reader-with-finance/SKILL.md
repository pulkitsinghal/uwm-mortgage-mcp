---
name: use-unofficial-uwm-mortgage-reader-with-finance
description: Combine the community-contributed Unofficial UWM Mortgage Reader's live read-only mortgage data with ChatGPT's built-in Finance integration. Use for mortgage reviews, cash-versus-principal decisions, payoff projections, or liquidity analysis that needs both sources.
---

# Use the Unofficial UWM Mortgage Reader with Finance

Start by telling the user this is independent community software: it is not made, sponsored, supported, endorsed, or operated by UWM and does not speak for UWM.

Use ChatGPT Finance and the mortgage reader as separate, labeled sources:

- Use the built-in Finance integration for linked cash, investments, cards, transactions, and other liabilities.
- Use the community reader for the current mortgage summary, recent payments, escrow, statement metadata, and local payoff projections.
- If Finance is unavailable on the current surface, say so and continue with the mortgage reader only. Never invent linked-account values.

## Connect the mortgage reader

1. Call `mortgage_connection_status` before any mortgage data tool.
2. Present the returned publisher disclosure before login choices.
3. If `setupRequired` is true, present both returned login choices. Recommend 1Password when available and keep manual login as an equal fallback.
4. Before `mortgage_start_login` with `route: onepassword`, obtain explicit UWM terms consent and separate consent for `rememberOnThisMac`. Default the latter to false.
5. Never request or accept a username, password, email, MFA code, cookie, token, or account identifier in chat or MCP input.
6. Tell the user to complete MFA only in the headed UWM browser. Retry connection status only after the user says the dashboard is ready.

## Analyze safely

- Fetch only the fields needed for the request.
- Label every figure as `Finance`, `mortgage reader`, `user-provided`, or `estimate`, and preserve source freshness.
- Reconcile duplicate mortgages only from non-sensitive attributes such as servicer, rate, balance range, and payment range. Do not expose or compare loan identifiers.
- Prefer `mortgage_calculate_extra_payment` for payoff scenarios; it calculates locally and never initiates a payment.
- Keep observed values distinct from projections and state all assumptions.
- Never initiate payments, transfers, ACH, autopay changes, payoff requests, statement downloads, or other financial-account mutations.
- Never write private account values to files, logs, issues, repositories, or reusable skill resources.
