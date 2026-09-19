export function scoreCandidate({ evidence = [], sourceUrl, applicationUrl } = {}) {
  let score = 0;
  const reasons = [];

  const counts = new Map();
  for (const item of evidence) {
    const type = String(item?.type || '');
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  if (counts.get('application_phrase')) {
    score += 25;
    reasons.push('explicit_application_intent:+25');
  }

  if (counts.get('application_link')) {
    score += 20;
    reasons.push('application_link:+20');
  }

  if (counts.get('current_or_future_year')) {
    score += 10;
    reasons.push('current_or_future_year:+10');
  }

  if (counts.get('geography_match')) {
    score += 10;
    reasons.push('geography_match:+10');
  }

  if (sameRegistrableHost(sourceUrl, applicationUrl)) {
    score += 15;
    reasons.push('same_host_application:+15');
  }

  if (counts.get('negative_phrase')) {
    score -= 50;
    reasons.push('negative_page_signal:-50');
  }

  return Object.freeze({ score, reasons: Object.freeze(reasons) });
}

function sameRegistrableHost(left, right) {
  if (!left || !right) return false;
  try {
    const a = new URL(left).hostname.replace(/^www\./i, '').toLowerCase();
    const b = new URL(right).hostname.replace(/^www\./i, '').toLowerCase();
    return a === b;
  } catch {
    return false;
  }
}
