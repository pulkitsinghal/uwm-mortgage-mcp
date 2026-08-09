#!/usr/bin/env node
import fs from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/inspect-capture.mjs private/uwm-capture/responses-....json');
  process.exit(2);
}

const data = JSON.parse(await fs.readFile(file, 'utf8'));
const relevantFieldPattern =
  /principal|balance|interest|rate|payment|escrow|due|maturity|statement|loan/i;

function collectCandidateKeys(value, prefix = '', depth = 0, keys = new Set()) {
  if (depth > 7 || value == null) return keys;
  if (Array.isArray(value)) {
    for (const [index, item] of value.slice(0, 3).entries()) {
      collectCandidateKeys(item, `${prefix}[${index}]`, depth + 1, keys);
    }
    return keys;
  }
  if (typeof value !== 'object') return keys;

  for (const [key, child] of Object.entries(value)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    if (relevantFieldPattern.test(key)) keys.add(childPath);
    collectCandidateKeys(child, childPath, depth + 1, keys);
  }
  return keys;
}

if (data.browserExtraction) {
  console.log(
    JSON.stringify(
      {
        strategy: data.strategy || 'browser-extraction',
        browserExtractionKeys: [...collectCandidateKeys(data.browserExtraction)].slice(0, 120),
        paymentCount: Array.isArray(data.browserExtraction.payments)
          ? data.browserExtraction.payments.length
          : 0,
        statementCount: Array.isArray(data.browserExtraction.statements)
          ? data.browserExtraction.statements.length
          : 0,
      },
      null,
      2,
    ),
  );
}

for (const [index, response] of (data.responses || []).entries()) {
  let candidateKeys = response.candidateKeys;
  if (!Array.isArray(candidateKeys)) {
    let parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      continue;
    }
    candidateKeys = [...collectCandidateKeys(parsed)];
  }
  if (candidateKeys.length === 0) continue;

  let pathname = response.pathname;
  let origin = response.origin;
  if ((!pathname || !origin) && response.url) {
    const legacyUrl = new URL(response.url);
    pathname = legacyUrl.pathname;
    origin = legacyUrl.origin;
  }

  console.log(
    JSON.stringify(
      {
        index,
        status: response.status,
        method: response.method,
        origin,
        pathname,
        queryKeys: response.queryKeys || [],
        candidateKeys: candidateKeys.slice(0, 80),
      },
      null,
      2,
    ),
  );
}
