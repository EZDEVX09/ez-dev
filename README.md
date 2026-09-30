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

**Payments (Stripe)**
- Pricing page reads live prices from Stripe; Upgrade → Stripe Checkout; "Manage billing" → Stripe Customer Portal (switch plan, cancel, update card, invoices)
- Signed webhooks (HMAC-verified, 5-minute tolerance, idempotent) keep each user's plan in sync; subscriptions are always re-read from Stripe so out-of-order events can't cause mistakes
- The checkout return page syncs immediately, so the new plan shows before the webhook lands
- Failed payments show a banner and send an email; deleting an account cancels its subscription

**Email (Resend)**
- Welcome + email confirmation on sign-up (24-hour single-use link), resend from the dashboard or account page
- Forgot password → 1-hour single-use reset link; the same answer is shown whether or not an account exists; resetting signs out every device
- Security notice when a password changes; plan activated / payment failed / subscription ended emails
- EZ DEFENDER monitoring alerts by email (confirmed addresses only, can be switched off in account settings)
- Without `RESEND_API_KEY`, emails are logged and skipped so everything else keeps working

**Security of the platform itself**
- PBKDF2-SHA256 password hashing, hashed session tokens, `__Host-` HttpOnly SameSite cookies
- Origin checks on every state-changing request (CSRF), rate limits on sign-up, sign-in and password changes
- Strict CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy on every page

## Plans

Limits live in `shared/config.js` (`PLANS`). Paid plans map to Stripe prices by lookup key (`ezdev_pro_monthly`, `ezdev_business_monthly`). To give someone a plan manually (e.g. a comp account):

```sql
UPDATE users SET plan = 'pro' WHERE email = 'customer@example.com';
```

## Deploying (GitHub → Cloudflare)

Every push to `main` runs the tests, then deploys all four Workers with `.github/workflows/deploy.yml`.

1. **Cloudflare API token**: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **"Edit Cloudflare Workers"**. Add the permission **Account → D1 → Edit**. If you use a custom domain, include that zone under Zone Resources.
2. **Account ID**: Cloudflare dashboard → Workers & Pages → Account details (right side).
3. **GitHub repo → Settings → Secrets and variables → Actions**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`
   - Variables: `EZ_DOMAIN` = your domain (e.g. `ezdev.com`). The domain must be added to the same Cloudflare account.
     No domain yet? Leave `EZ_DOMAIN` empty and the products deploy to `ez-dev.<you>.workers.dev`, `ez-app.<you>.workers.dev`, etc.
4. Push to `main` (or run the workflow from the Actions tab).

The workflow finds or creates the `ez-dev-db` D1 database, applies `migrations/`, deploys the four Workers, and uploads the secrets each Worker needs.

### Stripe (payments)

1. Create a Stripe account and copy your **secret key** (Developers → API keys). Start with the test key (`sk_test_…`) and switch to live when you're ready.
2. On your own computer, in this repo, run once (use your real prices):
   ```bash
   STRIPE_SECRET_KEY=sk_test_... EZ_URL=https://yourdomain.com PRO_PRICE=19 BUSINESS_PRICE=79 node scripts/stripe-setup.mjs
   ```
   It creates the products, monthly prices, the customer portal and the webhook, and prints what to add to GitHub.
3. Add to GitHub: secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; variable `STRIPE_PORTAL_CONFIG`.
4. Push (or re-run the workflow). Test with card `4242 4242 4242 4242`, any future date, any CVC.
5. Going live: re-run step 2 with your `sk_live_…` key and update the three GitHub values.

To change prices later, re-run the script with the new amounts. New customers get the new price; existing subscribers keep theirs.

### Email (Resend)

1. Create an account at resend.com, add your domain, and add the DNS records it shows (in Cloudflare DNS). Wait until the domain shows **Verified**.
2. Create an API key → GitHub secret `RESEND_API_KEY`.
3. Emails are sent from `no-reply@<EZ_DOMAIN>`. To use a different sender, set the GitHub variable `EZ_EMAIL_FROM`, e.g. `EZ DEV <hello@yourdomain.com>`.

### All GitHub settings

| Name | Type | Needed for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | deploying |
| `CLOUDFLARE_ACCOUNT_ID` | secret | deploying |
| `ANTHROPIC_API_KEY` | secret | EZ APP / EZ SITE generation |
| `STRIPE_SECRET_KEY` | secret | payments |
| `STRIPE_WEBHOOK_SECRET` | secret | payments |
| `RESEND_API_KEY` | secret | emails |
| `EZ_DOMAIN` | variable | your domain (or leave empty for workers.dev) |
| `STRIPE_PORTAL_CONFIG` | variable | billing portal (from the setup script) |
| `EZ_EMAIL_FROM` | variable | optional sender override |

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
scripts/stripe-setup.mjs       creates Stripe products, prices, portal and webhook
scripts/push-secrets.mjs       uploads Worker secrets during deploy
test/                          harness + end-to-end tests
```

## Next phases

- Annual billing and team seats
- Serve published user projects from a separate user-content domain (e.g. `ezusercontent.com`) so they can use `localStorage` and can't impersonate EZ pages, plus custom domains for EZ SITE customers
- Team accounts, EZ DEFENDER code review of EZ APP / EZ SITE projects, TLS certificate expiry checks via an external probe

Support: ezdevsupport@proton.me
