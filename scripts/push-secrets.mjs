#!/usr/bin/env node
// Uploads Worker secrets from environment variables (used by the deploy workflow).
// Only secrets that are set get uploaded; each Worker gets just the ones it needs.

import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NEEDS = {
  ezdev: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY'],
  ezapp: ['ANTHROPIC_API_KEY'],
  ezsite: ['ANTHROPIC_API_KEY'],
  ezdefender: ['RESEND_API_KEY'],
};

for (const [app, names] of Object.entries(NEEDS)) {
  const secrets = Object.fromEntries(names.filter((n) => process.env[n]).map((n) => [n, process.env[n]]));
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) console.log(`::warning::${app}: ${missing.join(', ')} not set — related features stay off until you add ${missing.length > 1 ? 'them' : 'it'}.`);
  if (!Object.keys(secrets).length) continue;
  const file = join(tmpdir(), `ez-secrets-${app}.json`);
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  try {
    execFileSync('npx', ['wrangler', 'secret', 'bulk', file, '-c', `apps/${app}/wrangler.json`], { stdio: ['ignore', 'inherit', 'inherit'] });
  } finally {
    unlinkSync(file);
  }
}
