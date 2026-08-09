#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const stagedOnly = process.argv.includes('--staged');
const gitArgs = stagedOnly
  ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
  : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
const { stdout } = await run('git', gitArgs, { encoding: 'buffer' });
const files = stdout
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const forbiddenPaths = files.filter(
  (file) =>
    /^private\//i.test(file) ||
    /(?:browser|chrome)[-_ ]?profile/i.test(file) ||
    /storage[-_ ]?state/i.test(file) ||
    /\.(?:har|pdf|png|jpe?g)$/i.test(file),
);

const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['bearer token', /\bbearer\s+[A-Za-z0-9._~+\/-]{16,}/i],
  ['authorization value', /\bauthorization\s*[:=]\s*["'][^"']{16,}["']/i],
  ['cookie value', /\bcookie\s*[:=]\s*["'][^"']{16,}["']/i],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/],
  ['long account-like number', /\b\d{8,20}\b/],
  [
    'physical street address',
    /\b\d{1,6}\s+(?:[A-Za-z]+\s+){1,5}(?:street|st|road|rd|avenue|ave|way|lane|ln|drive|dr|boulevard|blvd)\b/i,
  ],
];

const findings = [];
for (const file of files) {
  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;
  for (const [name, pattern] of rules) {
    if (pattern.test(content)) findings.push({ file, rule: name });
  }
  const emails = content.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
  if (emails.some((email) => !/\.(?:test|example|invalid)$/i.test(email))) {
    findings.push({ file, rule: 'non-synthetic email address' });
  }
  const statementNames = content.match(/MORTGAGE STATEMENT_[^\s<"]+\.pdf/gi) || [];
  if (statementNames.some((name) => !/FAKE[-_]LOAN/i.test(name))) {
    findings.push({ file, rule: 'non-synthetic statement filename' });
  }
}

if (forbiddenPaths.length || findings.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        forbiddenPaths,
        findings,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({ ok: true, scope: stagedOnly ? 'staged' : 'tracked-and-untracked', files: files.length }),
);
