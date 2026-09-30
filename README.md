# EZ DEV

EZ DEV is the parent company platform for three products, each deployed as its own Cloudflare Worker:

| Product | What it does | Address (with your domain) |
|---|---|---|
| **EZ DEV** | Company site, accounts, single sign-on, dashboard, pricing | `https://yourdomain.com` |
| **EZ APP** | AI app builder: describe an app, Claude builds it, refine by chat | `https://app.yourdomain.com` |
| **EZ SITE** | AI website builder: multi-page sites, copy + design, one-click publish | `https://site.yourdomain.com` |
| **EZ DEFENDER** | Security toolbox: scans, grades, fix guides, ownership verification, daily monitoring | `https://defender.yourdomain.com` |

All four share one D1 database and one EZ DEV account.

## What's built

**EZ DEV**
- Landing page, pricing, contact, privacy/terms (draft text), security page, `security.txt`
- Sign up / sign in, account settings (name, password, delete account)
- Single sign-on: EZ DEV hands a one-time code to each subsidiary, so one login works everywhere and signing out anywhere signs out everywhere
- Dashboard with product tiles and plan usage (AI builds, scans, monitored sites)

**EZ APP & EZ SITE** (shared builder engine in `shared/builder.js`)
- Describe a project → Claude writes the complete files through a forced `write_files` tool call, streamed back with live progress
- Chat to change it; every change is a new version; restore any version
- Live preview (desktop / mobile), code viewer, ZIP download
- Publish to `/p/<name>/`, unpublish any time; "check it with EZ DEFENDER" link after publishing
- Generated code always runs in a sandboxed, opaque origin (CSP `sandbox`), so it can never read EZ cookies or call EZ APIs as the user

**EZ DEFENDER**
- 25+ checks: HTTPS & redirect, HSTS, CSP (incl. unsafe-inline), clickjacking, nosniff, referrer & permissions policies, server version leaks, cookie flags, CORS misconfiguration, mixed content, insecure forms, outdated jQuery/Bootstrap/AngularJS, missing SRI, CMS version leaks, directory listing, security.txt, SPF, DMARC, CAA, DNSSEC
- A–F grade, plain-English fix guide for every finding, JSON export
- Ownership verification (DNS TXT or `/.well-known` file) unlocks **deep checks** for exposed `.git`, `.env`, AWS credentials, config backups, database dumps, server-status/phpinfo
- Daily monitoring of verified sites (cron every 10 min, one site per run) with in-app alerts when the grade drops or new issues appear
- SSRF protection: blocks private/internal IPs, non-standard ports, and domains that resolve to private addresses

**Security of the platform itself**
- PBKDF2-SHA256 password hashing, hashed session tokens, `__Host-` HttpOnly SameSite cookies
- Origin checks on every state-changing request (CSRF), rate limits on sign-up, sign-in and password changes
- Strict CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy on every page

## Plans

Limits live in `shared/config.js` (`PLANS`). Online payments are the next phase; until then, switch someone's plan in D1:

```sql
UPDATE users SET plan = 'pro' WHERE email = 'customer@example.com';
```

Set displayed prices with the `PRICE_PRO` / `PRICE_BUSINESS` Worker variables (they show `[YOUR PRICE]` until set).

## Deploying (GitHub → Cloudflare)

Every push to `main` runs the tests, then deploys all four Workers with `.github/workflows/deploy.yml`.

1. **Cloudflare API token**: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **"Edit Cloudflare Workers"**. Add the permission **Account → D1 → Edit**. If you use a custom domain, include that zone under Zone Resources.
2. **Account ID**: Cloudflare dashboard → Workers & Pages → Account details (right side).
3. **GitHub repo → Settings → Secrets and variables → Actions**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`
   - Variables: `EZ_DOMAIN` = your domain (e.g. `ezdev.com`). The domain must be added to the same Cloudflare account.
     No domain yet? Leave `EZ_DOMAIN` empty and the products deploy to `ez-dev.<you>.workers.dev`, `ez-app.<you>.workers.dev`, etc.
4. Push to `main` (or run the workflow from the Actions tab).

The workflow finds or creates the `ez-dev-db` D1 database, applies `migrations/`, deploys the four Workers, and sets the Claude key.

## Local development

Needs Node 22.5+. No npm install required: the Workers have zero dependencies.

```bash
npm test                         # full end-to-end test suite (SQLite-backed D1 shim)
EZ_DEMO_AI=1 npm run dev         # all four products on localhost:8787-8790 with fake AI output
ANTHROPIC_API_KEY=sk-... npm run dev   # real Claude generation locally
```

You can also use Wrangler locally: `npm run configure:local`, then `npx wrangler dev -c apps/ezdev/wrangler.json` (and the others in separate terminals).

## Layout

```
apps/ezdev/src/index.js        EZ DEV worker
apps/ezapp/src/index.js        EZ APP worker (system prompt + landing)
apps/ezsite/src/index.js       EZ SITE worker (system prompt + landing)
apps/ezdefender/src/           EZ DEFENDER worker + scanner.js
shared/                        auth, http/router, UI shell, builder engine, Claude client, zip writer
shared/public/                 CSS, client JS, favicons (served as Workers static assets)
migrations/                    D1 schema
scripts/configure.mjs          generates apps/*/wrangler.json for prod or local
scripts/dev-server.mjs         runs everything locally without Cloudflare
test/                          harness + end-to-end tests
```

## Next phases

- Stripe checkout and billing portal (plans are already enforced)
- Password reset and alert emails (Cloudflare Email Service or Resend)
- Serve published user projects from a separate user-content domain (e.g. `ezusercontent.com`) so they can use `localStorage` and can't impersonate EZ pages, plus custom domains for EZ SITE customers
- Team accounts, EZ DEFENDER code review of EZ APP / EZ SITE projects, TLS certificate expiry checks via an external probe

Support: ezdevsupport@proton.me
