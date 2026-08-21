const DEFAULT_ENDPOINT = 'https://api.smtp2go.com/v3/email/send';
const DEFAULT_TIMEOUT_MS = 8000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 15000;

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || ''));
}

function timeoutMs(env) {
  const configured = Number(env.SMTP2GO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(configured), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function endpoint(env) {
  const value = clean(env.SMTP2GO_API_URL || DEFAULT_ENDPOINT, 500);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error('HTTPS required');
    return parsed.toString();
  } catch {
    throw new EmailDeliveryError('email_invalid_configuration', 503, false);
  }
}

function sender(env) {
  const address = clean(env.PITCHLIST_EMAIL_FROM || '', 180).toLowerCase();
  const name = clean(env.PITCHLIST_EMAIL_FROM_NAME || 'PitchList UK', 120);
  if (!validEmail(address) || !name) {
    throw new EmailDeliveryError('email_invalid_configuration', 503, false);
  }
  return `${name} <${address}>`;
}

function logFailure(logger, error, kind) {
  const method = typeof logger?.error === 'function' ? logger.error.bind(logger) : null;
  if (!method) return;
  method('transactional_email_failure', {
    code: error.code || 'email_provider_failed',
    kind: clean(kind || 'transactional', 80),
    provider: 'smtp2go',
    retryable: Boolean(error.retryable),
    status: Number(error.status || 502)
  });
}

function providerFailure(response, payload) {
  const providerCode = clean(payload?.data?.error_code || payload?.error_code || '', 120);
  if (response.status === 429 || /rate.?limit/i.test(providerCode)) {
    return new EmailDeliveryError('email_rate_limited', 503, true);
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    return new EmailDeliveryError('email_provider_unavailable', 503, true);
  }
  return new EmailDeliveryError('email_provider_rejected', 502, false);
}

export class EmailDeliveryError extends Error {
  constructor(code, status = 502, retryable = false) {
    super(code);
    this.name = 'EmailDeliveryError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailShell(heading, intro, bodyHtml, footer) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f1e8;color:#172018;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #d9d2c4;border-radius:14px;padding:28px">
        <p style="margin:0 0 18px;color:#65705f;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">PitchList UK</p>
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 20px;line-height:1.6">${escapeHtml(intro)}</p>
        ${bodyHtml}
        <p style="margin:24px 0 0;color:#65705f;font-size:13px;line-height:1.5">${escapeHtml(footer)}</p>
      </div>
    </div>
  </body>
</html>`;
}

function actionButton(link, label) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f5a3f;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">${escapeHtml(label)}</a></p>
  <p style="margin:0;color:#65705f;font-size:13px;line-height:1.5;word-break:break-all">Or copy this address:<br>${escapeHtml(link)}</p>`;
}

export function accessLinkEmail(link) {
  return {
    kind: 'subscriber_access_link',
    subject: 'Your PitchList UK sign-in link',
    text: [
      'Use this secure link to sign in to your PitchList UK pitch finder:',
      '',
      link,
      '',
      'The link expires after 30 days. If you did not request it, you can ignore this email.'
    ].join('\n'),
    html: emailShell(
      'Your pitch finder sign-in link',
      'Use the button below to unlock your subscriber access.',
      actionButton(link, 'Open PitchList UK'),
      'This link expires after 30 days. If you did not request it, you can ignore this email.'
    )
  };
}

export function welcomeEmail(link) {
  return {
    kind: 'subscriber_welcome',
    subject: 'Welcome to PitchList UK — your pitch finder is ready',
    text: [
      'Welcome to PitchList UK.',
      '',
      'Your trial or subscription access is ready. Use this secure link to open the pitch finder:',
      '',
      link,
      '',
      'The link expires after 30 days. You can manage billing after signing in.'
    ].join('\n'),
    html: emailShell(
      'Your PitchList UK access is ready',
      'Your trial or subscription is active. Open the pitch finder to see source links and application routes.',
      actionButton(link, 'Open your pitch finder'),
      'This link expires after 30 days. You can manage billing after signing in.'
    )
  };
}

export function supportRequestEmail(subject, text) {
  const escaped = escapeHtml(text).replace(/\n/g, '<br>');
  return {
    kind: 'support_sample_request',
    subject: clean(subject, 180),
    text: String(text || '').slice(0, 12000),
    html: emailShell(
      'New PitchList UK support request',
      'A customer submitted the legacy/support request form.',
      `<div style="line-height:1.6">${escaped}</div>`,
      'Reply to the customer using the verified details in this request.'
    )
  };
}

export async function sendTransactionalEmail(env, message, options = {}) {
  const apiKey = clean(env.SMTP2GO_API_KEY || '', 200);
  if (!apiKey) throw new EmailDeliveryError('email_not_configured', 503, false);
  const to = clean(options.to, 180).toLowerCase();
  const replyTo = clean(options.replyTo || '', 180).toLowerCase();
  if (!validEmail(to) || (replyTo && !validEmail(replyTo))) {
    throw new EmailDeliveryError('email_invalid_address', 400, false);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || console;
  try {
    const payload = {
      sender: sender(env),
      to: [to],
      subject: clean(message?.subject, 180),
      text_body: String(message?.text || '').slice(0, 50000),
      html_body: String(message?.html || '').slice(0, 100000)
    };
    if (!payload.subject || (!payload.text_body && !payload.html_body)) {
      throw new EmailDeliveryError('email_invalid_message', 500, false);
    }
    if (replyTo) payload.custom_headers = [{ header: 'Reply-To', value: replyTo }];

    let response;
    try {
      response = await fetchImpl(endpoint(env), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-smtp2go-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        throw new EmailDeliveryError('email_provider_timeout', 503, true);
      }
      throw new EmailDeliveryError('email_provider_unavailable', 503, true);
    }

    const result = await response.json().catch(() => ({}));
    const succeeded = Number(result?.data?.succeeded || 0);
    const failed = Number(result?.data?.failed || 0);
    if (!response.ok || result?.data?.error_code || result?.error_code || succeeded < 1 || failed > 0) {
      throw providerFailure(response, result);
    }
    return {
      provider: 'smtp2go',
      accepted: succeeded,
      message_id: clean(result?.data?.email_id || '', 160)
    };
  } catch (error) {
    const safeError = error instanceof EmailDeliveryError
      ? error
      : new EmailDeliveryError('email_provider_failed', 502, false);
    logFailure(logger, safeError, message?.kind);
    throw safeError;
  } finally {
    clearTimeout(timer);
  }
}
