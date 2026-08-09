import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 10 * 1024 * 1024;

function requireSafeText(value, label) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

async function run(file, args, { timeout = 30_000 } = {}) {
  try {
    const { stdout } = await execFileAsync(file, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: MAX_OUTPUT,
      windowsHide: true,
    });
    return stdout.replace(/\n$/, '');
  } catch {
    throw new Error(`Secure credential helper ${file} was unavailable or denied.`);
  }
}

async function runWithSecretStdin(file, args, secret, { timeout = 30_000 } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Secure credential helper ${file} timed out.`));
    }, timeout);

    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error(`Secure credential helper ${file} was unavailable.`));
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Secure credential helper ${file} failed.`));
    });
    child.stdin.end(secret);
  });
}

export function itemMatchesHost(item, hostname) {
  return (item.urls || []).some(({ href }) => {
    try {
      return new URL(href).hostname.toLowerCase() === hostname.toLowerCase();
    } catch {
      return false;
    }
  });
}

export function findFieldReference(item, purpose) {
  const normalized = purpose.toUpperCase();
  const field = (item.fields || []).find((candidate) =>
    [candidate.purpose, candidate.id, candidate.label]
      .filter(Boolean)
      .some((value) => String(value).toUpperCase() === normalized),
  );
  if (!field?.reference) {
    throw new Error(`1Password Login item lacks a ${purpose.toLowerCase()} field reference.`);
  }
  return field.reference;
}

async function getItemMetadata(itemId, account) {
  return JSON.parse(
    await run(
      'op',
      [
        'item',
        'get',
        requireSafeText(itemId, '1Password item ID'),
        '--format',
        'json',
        '--account',
        account,
      ],
      { timeout: 120_000 },
    ),
  );
}

async function signInOnePassword(accountSelector) {
  let selector = accountSelector;
  if (!selector) {
    const accounts = JSON.parse(await run('op', ['account', 'list', '--format', 'json']));
    if (!Array.isArray(accounts) || accounts.length !== 1) {
      throw new Error('Set an explicit 1Password account when multiple accounts are configured.');
    }
    const account = accounts[0];
    selector = account.account_uuid || account.shorthand || account.url;
  }
  requireSafeText(selector, '1Password account selector');
  await run('op', ['signin', '--account', selector], { timeout: 120_000 });
  return selector;
}

function shortlistItems(summaries, hostname) {
  const directMatches = summaries.filter((item) => itemMatchesHost(item, hostname));
  if (directMatches.length > 0) return directMatches;

  const hostTokens = hostname
    .toLowerCase()
    .split('.')
    .filter((token) => token.length >= 3 && !['com', 'net', 'org'].includes(token));
  return summaries.filter((item) => {
    const title = String(item.title || '').toLowerCase();
    return hostTokens.some((token) => title.includes(token));
  });
}

export async function findOnePasswordLoginForHost(hostname, { itemId, account } = {}) {
  requireSafeText(hostname, 'hostname');
  const accountSelector = await signInOnePassword(account);
  let candidates;

  if (itemId) {
    candidates = [await getItemMetadata(itemId, accountSelector)];
  } else {
    const summaries = JSON.parse(
      await run(
        'op',
        [
          'item',
          'list',
          '--categories',
          'Login',
          '--format',
          'json',
          '--account',
          accountSelector,
        ],
        { timeout: 120_000 },
      ),
    );
    if (!Array.isArray(summaries) || summaries.length > 5_000) {
      throw new Error('1Password returned an unexpected Login item list.');
    }
    const shortlist = shortlistItems(summaries, hostname);
    candidates = [];
    for (const summary of shortlist) {
      candidates.push(await getItemMetadata(summary.id, accountSelector));
    }
  }

  const matches = candidates.filter((item) => itemMatchesHost(item, hostname));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one 1Password Login item for ${hostname}; found ${matches.length}.`);
  }

  const item = matches[0];
  const usernameReference = findFieldReference(item, 'USERNAME');
  const passwordReference = findFieldReference(item, 'PASSWORD');
  const username = await run('op', ['read', '--no-newline', usernameReference, '--account', accountSelector], {
    timeout: 120_000,
  });
  const password = await run('op', ['read', '--no-newline', passwordReference, '--account', accountSelector], {
    timeout: 120_000,
  });
  if (!username || !password) throw new Error('1Password Login item contains an empty login field.');
  return { username, password };
}

export async function readKeychainLogin(service) {
  if (process.platform !== 'darwin') return null;
  requireSafeText(service, 'Keychain service');
  try {
    const metadata = await run('security', ['find-generic-password', '-s', service]);
    const username = /"acct"<blob>="([^"]+)"/.exec(metadata)?.[1];
    if (!username) return null;
    const password = await run('security', [
      'find-generic-password',
      '-s',
      service,
      '-a',
      username,
      '-w',
    ]);
    return password ? { username, password } : null;
  } catch {
    return null;
  }
}

export async function storeKeychainLogin(service, { username, password }) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS Keychain is unavailable on this platform.');
  }
  requireSafeText(service, 'Keychain service');
  requireSafeText(username, 'Keychain account');
  requireSafeText(password, 'password');
  await runWithSecretStdin(
    'xcrun',
    ['swift', fileURLToPath(new URL('./keychain-store.swift', import.meta.url)), service, username],
    password,
    { timeout: 120_000 },
  );
}

export async function resolveBrowserLogin({
  hostname,
  itemId,
  account,
  keychainService,
  cacheInKeychain = false,
}) {
  if (keychainService) {
    const cached = await readKeychainLogin(keychainService);
    if (cached) return { ...cached, source: 'keychain' };
  }

  const credential = await findOnePasswordLoginForHost(hostname, { itemId, account });
  if (cacheInKeychain) {
    if (!keychainService) {
      throw new Error('A Keychain service is required when caching is enabled.');
    }
    await storeKeychainLogin(keychainService, credential);
  }
  return { ...credential, source: 'onepassword' };
}
