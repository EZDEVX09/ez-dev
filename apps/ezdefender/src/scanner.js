// EZ DEFENDER scanner: passive checks for any public URL, plus exposure checks
// ("deep" scan) that only run against sites the user has verified they own.

const UA = 'EZ-DEFENDER-Scanner/1.0 (+security scanner; contact site owner)';
const TIMEOUT_MS = 10000;
const MAX_BODY = 1_500_000;
const DOH = 'https://cloudflare-dns.com/dns-query';

export class ScanError extends Error {}

// ---------- Target validation (SSRF protection) ----------

function ipv4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function ipv6Private(ip) {
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('::ffff:');
}

export function normalizeTarget(input, { allowPrivate = false } = {}) {
  let raw = String(input || '').trim();
  if (!raw) throw new ScanError('Enter a website address to scan.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try { url = new URL(raw); } catch { throw new ScanError('That doesn’t look like a valid web address.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ScanError('Only http and https addresses can be scanned.');
  if (url.username || url.password) throw new ScanError('Remove the username and password from the address.');
  if (url.port && !['80', '443'].includes(url.port) && !allowPrivate) throw new ScanError('Only standard web ports (80 and 443) can be scanned.');
  const host = url.hostname.toLowerCase();
  if (!allowPrivate) {
    if (host.startsWith('[')) throw new ScanError('Scan a domain name rather than an IP address.');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && ipv4Private(host)) throw new ScanError('Private and internal addresses can’t be scanned.');
    if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) {
      throw new ScanError('Private and internal addresses can’t be scanned.');
    }
  }
  url.hash = '';
  return url;
}

// ---------- DNS over HTTPS ----------

async function dns(fetchImpl, name, type) {
  try {
    const res = await fetchImpl(`${DOH}?name=${encodeURIComponent(name)}&type=${type}&do=1`, {
      headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const txtOf = (ans) => (ans?.Answer || []).filter((a) => a.type === 16).map((a) => String(a.data).replace(/^"|"$/g, '').replace(/"\s*"/g, ''));

async function assertPublicHost(fetchImpl, host, allowPrivate) {
  if (allowPrivate || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const [a, aaaa] = await Promise.all([dns(fetchImpl, host, 'A'), dns(fetchImpl, host, 'AAAA')]);
  const ips = [...(a?.Answer || []).filter((r) => r.type === 1), ...(aaaa?.Answer || []).filter((r) => r.type === 28)].map((r) => r.data);
  if (a && aaaa && ips.length === 0) throw new ScanError(`We couldn’t find ${host}. Check the address is spelled correctly.`);
  for (const ip of ips) {
    if (ip.includes(':') ? ipv6Private(ip) : ipv4Private(ip)) throw new ScanError('That domain points to a private network address and can’t be scanned.');
  }
  return a;
}

// ---------- HTTP helpers ----------

async function readLimited(res, limit = MAX_BODY) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= limit) { await reader.cancel().catch(() => {}); break; }
  }
  const buf = new Uint8Array(Math.min(size, limit));
  let p = 0;
  for (const c of chunks) { const take = Math.min(c.length, buf.length - p); buf.set(c.subarray(0, take), p); p += take; if (p >= buf.length) break; }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

async function get(fetchImpl, url, init = {}) {
  return fetchImpl(url, {
    redirect: 'manual',
    ...init,
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', ...(init.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function fetchFollow(fetchImpl, start, opts) {
  let url = start;
  const chain = [];
  for (let i = 0; i < 6; i++) {
    const res = await get(fetchImpl, url.toString());
    chain.push({ url: url.toString(), status: res.status });
    if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) {
      await res.body?.cancel().catch(() => {});
      const next = normalizeTarget(new URL(res.headers.get('Location'), url).toString(), opts);
      await assertPublicHost(fetchImpl, next.hostname, opts.allowPrivate);
      url = next;
      continue;
    }
    return { res, url, chain };
  }
  throw new ScanError('The site redirects too many times.');
}

// ---------- Fix guides ----------

export const GUIDES = {
  https: 'Serve your site over HTTPS. If you use Cloudflare, turn on SSL/TLS "Full (strict)" and "Always Use HTTPS". Otherwise get a free certificate from Let’s Encrypt (most hosts have a one-click option).',
  redirect: 'Redirect every http:// request to https:// with a permanent (301) redirect. Cloudflare: SSL/TLS → Edge Certificates → Always Use HTTPS. Nginx: `return 301 https://$host$request_uri;` in the port-80 server block.',
  hsts: 'Add the header `Strict-Transport-Security: max-age=31536000; includeSubDomains`. It tells browsers to only ever use HTTPS for your site. Cloudflare: SSL/TLS → Edge Certificates → HSTS. Nginx: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`',
  csp: 'Add a Content-Security-Policy header that lists where scripts and styles may load from. Start with `Content-Security-Policy: default-src \'self\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'self\'` and add the external domains your site needs. Test with `Content-Security-Policy-Report-Only` first.',
  csp_unsafe: 'Your CSP allows \'unsafe-inline\' or \'unsafe-eval\' scripts, which removes most of its protection against cross-site scripting. Move inline scripts into files, or use nonces or hashes instead.',
  nosniff: 'Add `X-Content-Type-Options: nosniff` so browsers don’t guess file types (which attackers can abuse).',
  framing: 'Stop other sites from embedding yours in a frame (clickjacking). Add `Content-Security-Policy: frame-ancestors \'self\'` or the older `X-Frame-Options: SAMEORIGIN`.',
  referrer: 'Add `Referrer-Policy: strict-origin-when-cross-origin` so full page URLs (which can contain private data) aren’t leaked to other sites.',
  permissions: 'Add a Permissions-Policy header to switch off browser features you don’t use, e.g. `Permissions-Policy: camera=(), microphone=(), geolocation=()`.',
  server_leak: 'Your server announces its software and version. Hide it so attackers can’t look up known bugs for that version. Nginx: `server_tokens off;` Apache: `ServerTokens Prod`. PHP: `expose_php = Off`. Express: `app.disable(\'x-powered-by\')`.',
  cookies: 'Mark cookies `Secure` (HTTPS only), `HttpOnly` (hidden from JavaScript) and `SameSite=Lax` (blocks cross-site request forgery). Set these where your app creates the cookie.',
  cors: 'Your site tells browsers that any other website may read its responses while the visitor is logged in. Only return `Access-Control-Allow-Origin` for specific trusted origins, never reflect the request’s Origin together with `Access-Control-Allow-Credentials: true`.',
  mixed: 'Some resources load over plain http:// on an https page. Change those URLs to https:// (or make them relative) so they can’t be tampered with.',
  form_http: 'A form submits to an http:// address, so whatever people type is sent unencrypted. Change the form action to https://.',
  libs: 'An outdated JavaScript library with known security bugs is loaded. Update it to the latest version.',
  sri: 'Scripts from other domains load without Subresource Integrity. Add `integrity` and `crossorigin` attributes so a compromised CDN can’t inject code.',
  generator: 'Your pages reveal the exact CMS version in a generator tag. Remove it and keep the CMS updated.',
  dirlist: 'Directory listing is switched on, so anyone can browse your files. Nginx: `autoindex off;` Apache: `Options -Indexes`.',
  securitytxt: 'Publish a security.txt file at /.well-known/security.txt so researchers know how to report problems to you. See securitytxt.org.',
  spf: 'Add an SPF record so only your mail servers can send email as your domain. Example TXT record on your domain: `v=spf1 include:_spf.your-mail-provider.com -all`. If the domain never sends email: `v=spf1 -all`.',
  dmarc: 'Add a DMARC record to stop others sending email that pretends to be from you. Start with a TXT record at `_dmarc.yourdomain` of `v=DMARC1; p=quarantine; rua=mailto:you@yourdomain`.',
  dmarc_none: 'Your DMARC policy is `p=none`, which only monitors. Once your legitimate mail passes, move to `p=quarantine` then `p=reject`.',
  caa: 'Add CAA DNS records to say which certificate authorities may issue certificates for your domain, e.g. `0 issue "letsencrypt.org"`.',
  dnssec: 'Turn on DNSSEC to protect your domain from DNS spoofing. Cloudflare: DNS → Settings → Enable DNSSEC, then add the DS record at your registrar.',
  exposed_git: 'Your .git folder is public, which can leak your entire source code and any passwords in it. Block access to /.git on your server immediately and rotate any secrets that were committed.',
  exposed_env: 'Your .env file is public and probably contains passwords or API keys. Block it at the server, remove it from the web root, and rotate every secret in it now.',
  exposed_backup: 'A backup or database dump is downloadable. Delete it from the web root and rotate any credentials it contains.',
  exposed_config: 'A configuration backup is public. Delete it from the web root and rotate the credentials in it.',
  exposed_info: 'A diagnostics page (server status or phpinfo) is public and reveals internal details. Remove it or restrict it to your own IP.',
  exposed_ds: 'A .DS_Store file lists your folder contents. Delete it and block dot-files at the server.',
};

// ---------- Scan ----------

const EXPOSURE_CHECKS = [
  { path: '/.git/HEAD', title: 'Git repository exposed', severity: 'high', guide: 'exposed_git', test: (b) => /^ref: refs\//.test(b) },
  { path: '/.env', title: '.env secrets file exposed', severity: 'high', guide: 'exposed_env', test: (b) => !/<html|<!doctype/i.test(b) && /^[A-Z][A-Z0-9_]*=.+/m.test(b) },
  { path: '/.aws/credentials', title: 'AWS credentials exposed', severity: 'high', guide: 'exposed_env', test: (b) => /aws_access_key_id/i.test(b) },
  { path: '/wp-config.php.bak', title: 'WordPress config backup exposed', severity: 'high', guide: 'exposed_config', test: (b) => /DB_PASSWORD|<\?php/.test(b) },
  { path: '/config.php.bak', title: 'Config backup exposed', severity: 'high', guide: 'exposed_config', test: (b) => /<\?php|password/i.test(b) && !/<html/i.test(b) },
  { path: '/backup.sql', title: 'Database dump exposed', severity: 'high', guide: 'exposed_backup', test: (b) => /CREATE TABLE|INSERT INTO/i.test(b) && !/<html/i.test(b) },
  { path: '/dump.sql', title: 'Database dump exposed', severity: 'high', guide: 'exposed_backup', test: (b) => /CREATE TABLE|INSERT INTO/i.test(b) && !/<html/i.test(b) },
  { path: '/backup.zip', title: 'Backup archive exposed', severity: 'high', guide: 'exposed_backup', test: (b) => b.startsWith('PK\u0003\u0004') },
  { path: '/server-status', title: 'Apache server-status page exposed', severity: 'medium', guide: 'exposed_info', test: (b) => /Apache Server Status/i.test(b) },
  { path: '/phpinfo.php', title: 'phpinfo() page exposed', severity: 'medium', guide: 'exposed_info', test: (b) => /phpinfo\(\)|<title>PHP \d/i.test(b) },
  { path: '/.DS_Store', title: '.DS_Store file exposed', severity: 'low', guide: 'exposed_ds', test: (b) => b.includes('Bud1') },
];

function cmpVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

const WEIGHTS = { fail: { high: 20, medium: 10, low: 4 }, warn: { high: 8, medium: 5, low: 2 } };

export function gradeFor(score) {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/**
 * Runs a scan. Returns { url, finalUrl, score, grade, checks: [...], chain, deep, scannedAt }.
 * opts: { deep, allowPrivate, fetchImpl }
 */
export async function scan(input, { deep = false, allowPrivate = false, fetchImpl = fetch } = {}) {
  const opts = { allowPrivate };
  const start = normalizeTarget(input, opts);
  const dnsA = await assertPublicHost(fetchImpl, start.hostname, allowPrivate);
  const checks = [];
  const add = (c) => checks.push(c);

  let main;
  try {
    main = await fetchFollow(fetchImpl, start, opts);
  } catch (e) {
    if (e instanceof ScanError) throw e;
    throw new ScanError(`We couldn’t connect to ${start.hostname}. The site may be down, blocking scanners, or have a certificate problem.`);
  }
  const { res, url: finalUrl, chain } = main;
  const hdr = (n) => res.headers.get(n);
  const ctype = hdr('Content-Type') || '';
  const body = ctype.includes('html') || ctype === '' ? await readLimited(res) : (await res.body?.cancel().catch(() => {}), '');
  const isHttps = finalUrl.protocol === 'https:';
  const host = finalUrl.hostname;
  const base = `${finalUrl.protocol}//${finalUrl.host}`;

  // --- Transport ---
  add(isHttps
    ? { id: 'https', category: 'Encryption', title: 'Served over HTTPS', status: 'pass', severity: 'high', detail: 'Connections to this site are encrypted with a valid certificate.' }
    : { id: 'https', category: 'Encryption', title: 'Not served over HTTPS', status: 'fail', severity: 'high', detail: 'The page loads over plain HTTP, so anything visitors send can be read or changed in transit.', guide: 'https' });

  try {
    const r = await get(fetchImpl, `http://${host}/`);
    await r.body?.cancel().catch(() => {});
    const loc = r.headers.get('Location') || '';
    if (r.status >= 300 && r.status < 400 && loc.startsWith('https://')) {
      add({ id: 'redirect', category: 'Encryption', title: 'HTTP redirects to HTTPS', status: 'pass', severity: 'medium', detail: `http:// requests get a ${r.status} redirect to https://.` });
    } else {
      add({ id: 'redirect', category: 'Encryption', title: 'HTTP does not redirect to HTTPS', status: isHttps ? 'fail' : 'warn', severity: 'medium', detail: `http://${host}/ answered ${r.status} instead of redirecting to https://.`, guide: 'redirect' });
    }
  } catch {
    add({ id: 'redirect', category: 'Encryption', title: 'HTTP port not reachable', status: 'info', severity: 'info', detail: 'Plain HTTP did not answer. That is fine if the site is HTTPS-only.' });
  }

  // --- Security headers ---
  const hsts = hdr('Strict-Transport-Security');
  if (!isHttps) { /* HSTS only applies to HTTPS */ } else if (!hsts) {
    add({ id: 'hsts', category: 'Headers', title: 'HSTS missing', status: 'fail', severity: 'medium', detail: 'Browsers are not told to always use HTTPS, so a first visit can be downgraded.', guide: 'hsts' });
  } else {
    const age = Number((/max-age=(\d+)/i.exec(hsts) || [])[1] || 0);
    add(age >= 15552000
      ? { id: 'hsts', category: 'Headers', title: 'HSTS enabled', status: 'pass', severity: 'medium', detail: hsts }
      : { id: 'hsts', category: 'Headers', title: 'HSTS max-age is short', status: 'warn', severity: 'low', detail: `max-age is ${age} seconds; use at least 6 months (15552000).`, guide: 'hsts' });
  }

  const csp = hdr('Content-Security-Policy');
  if (!csp) {
    add({ id: 'csp', category: 'Headers', title: 'Content Security Policy missing', status: 'fail', severity: 'medium', detail: 'Without a CSP, an injected script can run freely on your pages.', guide: 'csp' });
  } else {
    const scriptSrc = (/(?:^|;)\s*script-src\s+([^;]+)/i.exec(csp) || /(?:^|;)\s*default-src\s+([^;]+)/i.exec(csp) || [])[1] || '';
    if (/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc)) {
      add({ id: 'csp', category: 'Headers', title: 'CSP allows unsafe scripts', status: 'warn', severity: 'medium', detail: `script-src ${scriptSrc.trim()}`, guide: 'csp_unsafe' });
    } else {
      add({ id: 'csp', category: 'Headers', title: 'Content Security Policy set', status: 'pass', severity: 'medium', detail: csp.length > 160 ? `${csp.slice(0, 160)}…` : csp });
    }
  }

  add(String(hdr('X-Content-Type-Options') || '').toLowerCase() === 'nosniff'
    ? { id: 'nosniff', category: 'Headers', title: 'MIME sniffing blocked', status: 'pass', severity: 'low', detail: 'X-Content-Type-Options: nosniff' }
    : { id: 'nosniff', category: 'Headers', title: 'X-Content-Type-Options missing', status: 'fail', severity: 'low', detail: 'Browsers may guess content types, which can turn uploads into scripts.', guide: 'nosniff' });

  const xfo = hdr('X-Frame-Options');
  const fa = csp && /frame-ancestors/i.test(csp);
  add(xfo || fa
    ? { id: 'framing', category: 'Headers', title: 'Clickjacking protection', status: 'pass', severity: 'medium', detail: fa ? 'CSP frame-ancestors is set.' : `X-Frame-Options: ${xfo}` }
    : { id: 'framing', category: 'Headers', title: 'Clickjacking protection missing', status: 'fail', severity: 'medium', detail: 'Any site can load yours in a hidden frame and trick visitors into clicking.', guide: 'framing' });

  add(hdr('Referrer-Policy')
    ? { id: 'referrer', category: 'Headers', title: 'Referrer-Policy set', status: 'pass', severity: 'low', detail: `Referrer-Policy: ${hdr('Referrer-Policy')}` }
    : { id: 'referrer', category: 'Headers', title: 'Referrer-Policy missing', status: 'warn', severity: 'low', detail: 'Full URLs may leak to other sites when visitors click links.', guide: 'referrer' });

  add(hdr('Permissions-Policy')
    ? { id: 'permissions', category: 'Headers', title: 'Permissions-Policy set', status: 'pass', severity: 'low', detail: 'Browser features are restricted.' }
    : { id: 'permissions', category: 'Headers', title: 'Permissions-Policy missing', status: 'warn', severity: 'low', detail: 'Camera, microphone and other features are not explicitly disabled.', guide: 'permissions' });

  const leaks = [];
  const server = hdr('Server');
  if (server && /\d/.test(server)) leaks.push(`Server: ${server}`);
  for (const n of ['X-Powered-By', 'X-AspNet-Version', 'X-AspNetMvc-Version', 'X-Generator']) if (hdr(n)) leaks.push(`${n}: ${hdr(n)}`);
  add(leaks.length
    ? { id: 'server_leak', category: 'Headers', title: 'Server software version exposed', status: 'warn', severity: 'low', detail: leaks.join(' · '), guide: 'server_leak' }
    : { id: 'server_leak', category: 'Headers', title: 'No software versions exposed', status: 'pass', severity: 'low', detail: 'Headers don’t reveal server versions.' });

  // --- Cookies ---
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setCookies.length) {
    const bad = [];
    for (const c of setCookies) {
      const name = c.split('=')[0].trim();
      const lc = c.toLowerCase();
      const missing = [];
      if (isHttps && !/;\s*secure/.test(lc)) missing.push('Secure');
      if (!/;\s*httponly/.test(lc)) missing.push('HttpOnly');
      if (!/;\s*samesite=/.test(lc)) missing.push('SameSite');
      if (missing.length) bad.push(`${name} (missing ${missing.join(', ')})`);
    }
    add(bad.length
      ? { id: 'cookies', category: 'Cookies', title: 'Cookies missing security flags', status: 'warn', severity: 'medium', detail: bad.join('; '), guide: 'cookies' }
      : { id: 'cookies', category: 'Cookies', title: 'Cookies are locked down', status: 'pass', severity: 'medium', detail: `${setCookies.length} cookie(s) use Secure, HttpOnly and SameSite.` });
  }

  // --- CORS ---
  try {
    const probe = 'https://cors-probe.ezdefender.invalid';
    const r = await get(fetchImpl, finalUrl.toString(), { headers: { Origin: probe } });
    await r.body?.cancel().catch(() => {});
    const acao = r.headers.get('Access-Control-Allow-Origin');
    const acac = (r.headers.get('Access-Control-Allow-Credentials') || '').toLowerCase() === 'true';
    if (acao === probe && acac) {
      add({ id: 'cors', category: 'Headers', title: 'CORS trusts any website with credentials', status: 'fail', severity: 'high', detail: 'The site reflected an untrusted Origin and allowed credentials.', guide: 'cors' });
    } else if (acao === probe || (acao === '*' && acac)) {
      add({ id: 'cors', category: 'Headers', title: 'CORS reflects any origin', status: 'warn', severity: 'medium', detail: `Access-Control-Allow-Origin: ${acao}`, guide: 'cors' });
    } else {
      add({ id: 'cors', category: 'Headers', title: 'CORS is not overly permissive', status: 'pass', severity: 'medium', detail: acao ? `Access-Control-Allow-Origin: ${acao}` : 'No cross-origin access granted.' });
    }
  } catch { /* ignore */ }

  // --- Page content ---
  if (body) {
    if (isHttps) {
      const mixed = [...body.matchAll(/<(script|img|iframe|link|audio|video|source|embed)\b[^>]*?\s(?:src|href)\s*=\s*["']http:\/\/([^"'\s>]+)/gi)].map((m) => `http://${m[2]}`);
      add(mixed.length
        ? { id: 'mixed', category: 'Content', title: 'Mixed content', status: 'warn', severity: 'medium', detail: `${mixed.length} resource(s) load over http://, e.g. ${mixed.slice(0, 2).join(', ')}`, guide: 'mixed' }
        : { id: 'mixed', category: 'Content', title: 'No mixed content', status: 'pass', severity: 'medium', detail: 'All page resources load securely.' });
    }
    const httpForms = [...body.matchAll(/<form\b[^>]*action\s*=\s*["']http:\/\/[^"']+/gi)];
    if (httpForms.length) add({ id: 'form_http', category: 'Content', title: 'Form submits over HTTP', status: 'fail', severity: 'high', detail: `${httpForms.length} form(s) send data unencrypted.`, guide: 'form_http' });

    const libs = [];
    for (const m of body.matchAll(/jquery[.-]?(\d+\.\d+\.\d+)(?:\.min)?\.js/gi)) if (cmpVersion(m[1], '3.5.0') < 0) libs.push(`jQuery ${m[1]}`);
    for (const m of body.matchAll(/bootstrap(?:@|[.-])(\d+\.\d+\.\d+)/gi)) if (cmpVersion(m[1], '3.4.1') < 0 || (m[1].startsWith('4.') && cmpVersion(m[1], '4.3.1') < 0)) libs.push(`Bootstrap ${m[1]}`);
    for (const m of body.matchAll(/angular(?:js)?[@/.-]?(1\.\d+\.\d+)/gi)) libs.push(`AngularJS ${m[1]} (end of life)`);
    const uniq = [...new Set(libs)];
    add(uniq.length
      ? { id: 'libs', category: 'Content', title: 'Outdated JavaScript libraries', status: 'warn', severity: 'medium', detail: uniq.join(', '), guide: 'libs' }
      : { id: 'libs', category: 'Content', title: 'No known-vulnerable libraries detected', status: 'pass', severity: 'medium', detail: 'We looked for outdated jQuery, Bootstrap and AngularJS.' });

    const ext = [...body.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https?:)?\/\/([^/"']+)[^>]*>/gi)]
      .filter((m) => m[2].toLowerCase() !== host && !/\bintegrity\s*=/.test(m[0]));
    if (ext.length) add({ id: 'sri', category: 'Content', title: 'Third-party scripts without integrity checks', status: 'warn', severity: 'low', detail: `${ext.length} script(s) from ${[...new Set(ext.map((m) => m[2]))].slice(0, 3).join(', ')}`, guide: 'sri' });

    const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*\d[^"']*)["']/i.exec(body);
    if (gen) add({ id: 'generator', category: 'Content', title: 'CMS version revealed', status: 'warn', severity: 'low', detail: gen[1], guide: 'generator' });

    if (/<title>\s*Index of \//i.test(body)) add({ id: 'dirlist', category: 'Content', title: 'Directory listing enabled', status: 'fail', severity: 'medium', detail: 'The page is an automatic file listing.', guide: 'dirlist' });
  }

  // --- security.txt ---
  try {
    const r = await get(fetchImpl, `${base}/.well-known/security.txt`);
    const t = r.status === 200 ? await readLimited(r, 32000) : (await r.body?.cancel().catch(() => {}), '');
    add(/^contact:/im.test(t)
      ? { id: 'securitytxt', category: 'Disclosure', title: 'security.txt published', status: 'pass', severity: 'info', detail: 'Researchers know how to reach you.' }
      : { id: 'securitytxt', category: 'Disclosure', title: 'No security.txt', status: 'info', severity: 'info', detail: 'There is no /.well-known/security.txt contact file.', guide: 'securitytxt' });
  } catch { /* ignore */ }

  // --- DNS & email ---
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const apex = host.replace(/^www\./, '');
    const [txt, dmarc, caa, mx] = await Promise.all([dns(fetchImpl, apex, 'TXT'), dns(fetchImpl, `_dmarc.${apex}`, 'TXT'), dns(fetchImpl, apex, 'CAA'), dns(fetchImpl, apex, 'MX')]);
    if (txt) {
      const hasMx = (mx?.Answer || []).some((a) => a.type === 15);
      const spf = txtOf(txt).find((t) => t.toLowerCase().startsWith('v=spf1'));
      add(spf
        ? { id: 'spf', category: 'Email & DNS', title: 'SPF record found', status: spf.includes('+all') ? 'warn' : 'pass', severity: 'medium', detail: spf, guide: spf.includes('+all') ? 'spf' : undefined }
        : { id: 'spf', category: 'Email & DNS', title: 'No SPF record', status: hasMx ? 'fail' : 'warn', severity: hasMx ? 'medium' : 'low', detail: 'Anyone can send email that claims to be from this domain.', guide: 'spf' });
    }
    if (dmarc) {
      const rec = txtOf(dmarc).find((t) => t.toLowerCase().startsWith('v=dmarc1'));
      if (!rec) add({ id: 'dmarc', category: 'Email & DNS', title: 'No DMARC policy', status: 'fail', severity: 'medium', detail: 'Receivers aren’t told to reject email spoofing your domain.', guide: 'dmarc' });
      else if (/p=none/i.test(rec)) add({ id: 'dmarc', category: 'Email & DNS', title: 'DMARC is monitor-only', status: 'warn', severity: 'low', detail: rec, guide: 'dmarc_none' });
      else add({ id: 'dmarc', category: 'Email & DNS', title: 'DMARC enforced', status: 'pass', severity: 'medium', detail: rec });
    }
    if (caa) {
      const has = (caa.Answer || []).some((a) => a.type === 257);
      add(has
        ? { id: 'caa', category: 'Email & DNS', title: 'CAA records set', status: 'pass', severity: 'low', detail: 'Certificate issuance is restricted.' }
        : { id: 'caa', category: 'Email & DNS', title: 'No CAA records', status: 'info', severity: 'low', detail: 'Any certificate authority may issue certificates for this domain.', guide: 'caa' });
    }
    if (dnsA) {
      add(dnsA.AD
        ? { id: 'dnssec', category: 'Email & DNS', title: 'DNSSEC enabled', status: 'pass', severity: 'low', detail: 'DNS answers are signed.' }
        : { id: 'dnssec', category: 'Email & DNS', title: 'DNSSEC not enabled', status: 'info', severity: 'low', detail: 'DNS answers for this domain are not signed.', guide: 'dnssec' });
    }
  }

  // --- Exposure (verified owners only) ---
  if (deep) {
    const results = await Promise.all(EXPOSURE_CHECKS.map(async (c) => {
      try {
        const r = await get(fetchImpl, `${base}${c.path}`);
        if (r.status !== 200) { await r.body?.cancel().catch(() => {}); return null; }
        const b = await readLimited(r, 65536);
        return c.test(b) ? c : null;
      } catch { return null; }
    }));
    const found = results.filter(Boolean);
    for (const c of found) add({ id: `exposed:${c.path}`, category: 'Exposed files', title: c.title, status: 'fail', severity: c.severity, detail: `${base}${c.path} is publicly downloadable.`, guide: c.guide });
    if (!found.length) add({ id: 'exposed', category: 'Exposed files', title: 'No sensitive files exposed', status: 'pass', severity: 'high', detail: `Checked ${EXPOSURE_CHECKS.length} common leak locations (.git, .env, backups, config files, diagnostics).` });
  }

  let score = 100;
  for (const c of checks) score -= (WEIGHTS[c.status] || {})[c.severity] || 0;
  score = Math.max(0, score);
  return { url: start.toString(), finalUrl: finalUrl.toString(), score, grade: gradeFor(score), checks, chain, deep, scannedAt: Date.now() };
}

// ---------- Ownership verification ----------

export async function checkVerification(domain, token, { fetchImpl = fetch, allowPrivate = false } = {}) {
  const expected = `ezdefender-verify=${token}`;
  const txt = await dns(fetchImpl, `_ezdefender.${domain}`, 'TXT');
  if (txtOf(txt).some((t) => t.trim() === expected)) return { ok: true, method: 'dns' };
  try {
    normalizeTarget(`https://${domain}`, { allowPrivate });
    const scheme = allowPrivate && /^(localhost|127\.)/.test(domain) ? 'http' : 'https';
    const r = await get(fetchImpl, `${scheme}://${domain}/.well-known/ezdefender-verify.txt`);
    const b = r.status === 200 ? await readLimited(r, 4096) : '';
    if (b.trim() === expected) return { ok: true, method: 'file' };
  } catch { /* fall through */ }
  return { ok: false };
}

export function normalizeDomain(input, { allowPrivate = false } = {}) {
  const url = normalizeTarget(String(input || '').includes('://') ? input : `https://${input}`, { allowPrivate });
  return url.host.toLowerCase();
}
