import { normalizeCandidate, canonicalUrl } from './candidate.mjs';
import { extractEvidence, hasPositiveApplicationEvidence, hasStrongNegativeEvidence } from './evidence.mjs';
import { scoreCandidate } from './scoring.mjs';

export function createDefaultCandidateEvaluator({
  fetchProvider,
  publishThreshold = 60,
  holdThreshold = 40,
  now = () => new Date()
} = {}) {
  if (typeof fetchProvider?.fetch !== 'function') throw new Error('findpitches_v2_candidate_fetch_provider_missing');

  return async function evaluateCandidate({ market, region_code, location, result }) {
    const sourceUrl = canonicalUrl(result?.url);
    if (!sourceUrl) throw new Error('findpitches_v2_candidate_search_url_missing');

    const page = await fetchProvider.fetch(sourceUrl);
    const finalUrl = canonicalUrl(page.final_url || sourceUrl) || sourceUrl;
    const extracted = extractEvidence({
      body: page.body,
      sourceUrl: finalUrl,
      location,
      now: now()
    });

    const score = scoreCandidate({
      evidence: extracted.evidence,
      sourceUrl: finalUrl,
      applicationUrl: extracted.application_url
    });

    const negative = hasStrongNegativeEvidence(extracted.evidence);
    const positive = hasPositiveApplicationEvidence(extracted.evidence);

    let status = 'rejected';
    let rejectionReason = null;
    let publishable = false;

    if (negative) {
      rejectionReason = 'negative_page_signal';
    } else if (!positive) {
      rejectionReason = 'explicit_application_intent_missing';
    } else if (score.score >= publishThreshold) {
      status = 'validated';
      publishable = true;
    } else if (score.score >= holdThreshold) {
      status = 'held';
    } else {
      rejectionReason = 'score_below_threshold';
    }

    const candidate = normalizeCandidate({
      candidate_id: await stableCandidateId(market.code, finalUrl),
      market: market.code,
      source_url: finalUrl,
      canonical_url: finalUrl,
      application_url: extracted.application_url,
      event_name: extracted.title || result?.title || null,
      organiser: null,
      geography: {
        country_code: market.code,
        region_code,
        region: location
      },
      categories: [],
      evidence: [
        ...extracted.evidence,
        { type: 'score_reason', value: score.reasons.join(';'), confidence: 1 }
      ],
      score: score.score,
      status,
      rejection_reason: rejectionReason
    });

    return Object.freeze({ ...candidate, publishable });
  };
}

async function stableCandidateId(market, canonical) {
  const bytes = new TextEncoder().encode(`${market}|\n${canonical}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `fpv2_${hex.slice(0, 24)}`;
}
