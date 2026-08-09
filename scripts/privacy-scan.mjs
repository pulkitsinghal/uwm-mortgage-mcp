#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const stagedOnly = process.argv.includes('--staged');
const historyOnly = process.argv.includes('--history');
if (stagedOnly && historyOnly) {
  throw new Error('Choose either --staged or --history.');
}

async function historyFiles() {
  const { stdout } = await run('git', ['rev-list', '--objects', '--all'], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const objects = new Map();
  for (const line of stdout.split('\n').filter(Boolean)) {
    const separator = line.indexOf(' ');
    if (separator === -1) continue;
    const object = line.slice(0, separator);
    const path = line.slice(separator + 1);
    const paths = objects.get(object) || [];
    paths.push(path);
    objects.set(object, paths);
  }

  const files = [];
  for (const [object, paths] of objects) {
    const type = await run('git', ['cat-file', '-t', object]);
    if (type.stdout.trim() !== 'blob') continue;
    const content = await run('git', ['cat-file', '-p', object], {
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
    });
    files.push({ object, paths, content: content.stdout });
  }
  return files;
}

const gitArgs = stagedOnly
  ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
  : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
const files = historyOnly
  ? await historyFiles()
  : (
      await run('git', gitArgs, {
        encoding: 'buffer',
      })
    ).stdout
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((path) => ({ path }));

const forbiddenPaths = files.flatMap((file) => {
  const paths = file.paths || [file.path];
  return paths.filter(
    (path) =>
      /^private\//i.test(path) ||
      /(?:browser|chrome)[-_ ]?profile/i.test(path) ||
      /storage[-_ ]?state/i.test(path) ||
      /\.(?:har|pdf|png|jpe?g)$/i.test(path),
  );
});

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
    content = historyOnly ? file.content.toString('utf8') : await fs.readFile(file.path, 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;
  for (const [name, pattern] of rules) {
    if (pattern.test(content)) findings.push({ path: file.path, rule: name });
  }
  const emails = content.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
  if (emails.some((email) => !/\.(?:test|example|invalid)$/i.test(email))) {
    findings.push({ path: file.path, rule: 'non-synthetic email address' });
  }
  const statementNames = content.match(/MORTGAGE STATEMENT_[^\s<"]+\.pdf/gi) || [];
  if (statementNames.some((name) => !/FAKE[-_]LOAN/i.test(name))) {
    findings.push({ path: file.path, rule: 'non-synthetic statement filename' });
  }
}

if (forbiddenPaths.length || findings.length) {
  if (historyOnly) {
    const ruleCounts = new Map();
    for (const rule of [
      ...forbiddenPaths.map(() => 'forbidden private-data path'),
      ...findings.map((finding) => finding.rule),
    ]) {
      ruleCounts.set(rule, (ruleCounts.get(rule) || 0) + 1);
    }
    console.error(
      JSON.stringify(
        {
          ok: false,
          scope: 'all-git-history',
          findings: [...ruleCounts].map(([rule, occurrences]) => ({ rule, occurrences })),
          note: 'Historical paths and matching content are intentionally suppressed.',
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
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
  JSON.stringify({
    ok: true,
    scope: historyOnly ? 'all-git-history' : stagedOnly ? 'staged' : 'tracked-and-untracked',
    files: files.length,
  }),
);
