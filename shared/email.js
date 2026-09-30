// Transactional email for the EZ family, sent through Resend (https://resend.com).
// Without RESEND_API_KEY, emails are logged and skipped so development still works.

import { escapeHtml, now } from './http.js';
import { productUrl } from './config.js';

const RESEND_API = 'https://api.resend.com/emails';

function fromAddress(env) {
  return env.EMAIL_FROM || 'EZ DEV <onboarding@resend.dev>';
}

export async function sendEmail(env, { to, subject, html, text, template, userId = null }) {
  let status = 'sent';
  let providerId = null;
  if (!env.RESEND_API_KEY) {
    console.log(`[email skipped: no RESEND_API_KEY] ${template} → ${to}: ${subject}`);
    status = 'skipped';
  } else {
    try {
      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress(env), to: [to], subject, html, text,
          reply_to: env.SUPPORT_EMAIL || undefined,
          headers: { 'X-Entity-Ref-ID': `${template}-${now()}` },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { status = 'failed'; console.error('Resend error', res.status, JSON.stringify(body).slice(0, 300)); }
      providerId = body.id || null;
    } catch (e) {
      status = 'failed';
      console.error('Email send failed', e && e.message);
    }
  }
  await env.DB.prepare('INSERT INTO email_log (user_id, template, status, provider_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, template, status, providerId, now()).run().catch(() => {});
  return status === 'sent' || status === 'skipped';
}

// ---------- Layout ----------

function layout(env, { preheader, heading, paragraphs, button, footerNote }) {
  const ezdev = productUrl(env, 'ezdev');
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f2430">${t}</p>`).join('');
  const btn = button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:#2563eb">
         <a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(button.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5b6475">Or paste this link into your browser:<br><span style="word-break:break-all;color:#3a4352">${escapeHtml(button.url)}</span></p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f6fb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader || heading)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
<tr><td style="padding:0 0 20px">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td style="width:34px;height:34px;border-radius:9px;background:#2563eb;text-align:center;font-weight:700;font-size:14px;color:#ffffff">EZ</td>
    <td style="padding-left:10px;font-size:18px;font-weight:700;color:#07090d">EZ DEV</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:18px;padding:36px 32px">
  <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#07090d">${escapeHtml(heading)}</h1>
  ${p}${btn}
  ${footerNote ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5b6475">${footerNote}</p>` : ''}
</td></tr>
<tr><td style="padding:20px 8px;font-size:12px;line-height:1.5;color:#5b6475;text-align:center">
  EZ DEV · the parent company of EZ APP, EZ SITE and EZ DEFENDER<br>
  <a href="${ezdev}/account" style="color:#5b6475">Account settings</a> · <a href="${ezdev}/contact" style="color:#5b6475">Contact</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function textVersion({ heading, paragraphs, button }) {
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return [heading, '', ...paragraphs.map(strip), ...(button ? ['', `${button.label}: ${button.url}`] : []), '', '— EZ DEV'].join('\n');
}

function build(env, content) {
  return { html: layout(env, content), text: textVersion(content) };
}

const e = escapeHtml;

// ---------- Templates ----------

export const templates = {
  welcomeVerify(env, { name, url }) {
    return {
      subject: 'Welcome to EZ DEV — confirm your email',
      ...build(env, {
        preheader: 'Confirm your email to finish setting up your account.',
        heading: `Welcome, ${name.split(' ')[0]}!`,
        paragraphs: [
          'Your EZ DEV account works across <strong>EZ APP</strong>, <strong>EZ SITE</strong> and <strong>EZ DEFENDER</strong>.',
          'Please confirm this is your email address. The link works for 24 hours.',
        ],
        button: { label: 'Confirm my email', url },
        footerNote: "Didn't create an account? You can ignore this email.",
      }),
    };
  },

  verify(env, { url }) {
    return {
      subject: 'Confirm your email for EZ DEV',
      ...build(env, {
        heading: 'Confirm your email',
        paragraphs: ['Click below to confirm your email address. The link works for 24 hours.'],
        button: { label: 'Confirm my email', url },
        footerNote: "Didn't ask for this? You can ignore this email.",
      }),
    };
  },

  resetPassword(env, { url }) {
    return {
      subject: 'Reset your EZ DEV password',
      ...build(env, {
        preheader: 'Use this link within 1 hour to choose a new password.',
        heading: 'Reset your password',
        paragraphs: ['Someone (hopefully you) asked to reset the password for your EZ DEV account. The link works for 1 hour and can only be used once.'],
        button: { label: 'Choose a new password', url },
        footerNote: "Didn't ask for this? Your password hasn't changed and you can ignore this email.",
      }),
    };
  },

  passwordChanged(env) {
    return {
      subject: 'Your EZ DEV password was changed',
      ...build(env, {
        heading: 'Your password was changed',
        paragraphs: [
          'The password for your EZ DEV account was just changed, and every other device was signed out.',
          `If this wasn't you, reset your password right away and contact us at ${e(env.SUPPORT_EMAIL || 'support')}.`,
        ],
        button: { label: 'Reset password', url: `${productUrl(env, 'ezdev')}/forgot` },
      }),
    };
  },

  planActivated(env, { planName, renews }) {
    return {
      subject: `You're on EZ DEV ${planName}`,
      ...build(env, {
        heading: `Welcome to ${planName}!`,
        paragraphs: [
          `Your <strong>${e(planName)}</strong> plan is active across EZ APP, EZ SITE and EZ DEFENDER.`,
          renews ? `It renews on ${e(renews)}. Stripe emails your receipts, and you can change or cancel any time.` : 'You can change or cancel any time.',
        ],
        button: { label: 'Open your dashboard', url: `${productUrl(env, 'ezdev')}/dashboard` },
      }),
    };
  },

  paymentFailed(env) {
    return {
      subject: 'Action needed: your EZ DEV payment failed',
      ...build(env, {
        preheader: 'Update your payment method to keep your plan.',
        heading: 'We couldn’t take your payment',
        paragraphs: ['Your latest EZ DEV payment didn’t go through. Stripe will retry automatically, but please update your card so your plan isn’t interrupted.'],
        button: { label: 'Update payment method', url: `${productUrl(env, 'ezdev')}/account#billing` },
      }),
    };
  },

  planCanceled(env, { planName }) {
    return {
      subject: 'Your EZ DEV subscription has ended',
      ...build(env, {
        heading: 'Your subscription has ended',
        paragraphs: [
          `Your ${e(planName)} plan has ended and your account is now on the Free plan. Your projects and scans are still here.`,
          'You can upgrade again whenever you like.',
        ],
        button: { label: 'See plans', url: `${productUrl(env, 'ezdev')}/pricing` },
      }),
    };
  },

  defenderAlert(env, { domain, messages, url }) {
    return {
      subject: `EZ DEFENDER alert for ${domain}`,
      ...build(env, {
        preheader: messages[0],
        heading: `Security alert: ${domain}`,
        paragraphs: [
          'Today’s EZ DEFENDER check found changes on your site:',
          `<ul style="margin:0;padding-left:20px">${messages.map((m) => `<li style="margin-bottom:6px">${e(m)}</li>`).join('')}</ul>`,
        ],
        button: { label: 'See the full report', url },
        footerNote: `You get these because monitoring is on for ${e(domain)}. Turn alert emails off in <a href="${productUrl(env, 'ezdev')}/account" style="color:#5b6475">account settings</a>.`,
      }),
    };
  },
};

/** Convenience: render a template and send it. */
export async function sendTemplate(env, name, to, data = {}, userId = null) {
  const t = templates[name](env, data);
  return sendEmail(env, { to, subject: t.subject, html: t.html, text: t.text, template: name, userId });
}
