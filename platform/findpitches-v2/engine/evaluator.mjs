import { normalizeCandidate, canonicalUrl } from './candidate.mjs';
import { extractEvidence, hasPositiveApplicationEvidence, hasStrongNegativeEvidence } from './evidence.mjs';
import { scoreCandidate } from './scoring.mjs';
import { resolveEvidenceRegion } from '../classifier/region-evidence.mjs';

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

    if (socialSourceUrl(sourceUrl)) {
      const candidate=normalizeCandidate({
        candidate_id:await stableCandidateId(market.code,sourceUrl),
        market:market.code,
        source_url:sourceUrl,
        canonical_url:sourceUrl,
        application_url:null,
        event_name:result?.title||null,
        organiser:null,
        geography:{country_code:market.code,region_code,region:location},
        categories:[],
        evidence:[{type:'negative_phrase',value:'social_source_page',confidence:1},{type:'score_reason',value:'social_source_page',confidence:1}],
        score:-100,status:'rejected',rejection_reason:'negative_page_signal'
      });
      return Object.freeze({...candidate,publishable:false});
    }

    const page = await fetchProvider.fetch(sourceUrl);
    const finalUrl = canonicalUrl(page.final_url || sourceUrl) || sourceUrl;
    const extracted = extractEvidence({
      body: page.body,
      sourceUrl: finalUrl,
      location,
      market: market.code,
      now: now()
    });
    const geographyResolution=extracted.evidence.some(item=>item?.type==='market_conflict')?null:resolveEvidenceRegion({
      market:market.code,
      expectedRegionCode:region_code,
      body:page.body,
      title:extracted.title||result?.title||null
    });
    const regionCorrection=geographyResolution?.region_changed?geographyResolution:null;
    const localityHint=geographyResolution?.locality_hint||null;
    const effectiveRegionCode=geographyResolution?.region_code||region_code;
    const effectiveLocation=geographyResolution?.region||location;
    const geographyEvidence=[];
    if(regionCorrection){
      geographyEvidence.push({type:'region_correction',value:regionCorrection.region,from_region_code:regionCorrection.from_region_code,to_region_code:regionCorrection.region_code,locality_hint:localityHint,kind:regionCorrection.kind,confidence:regionCorrection.confidence});
      geographyEvidence.push({type:'geography_match',value:regionCorrection.region,confidence:regionCorrection.confidence});
    }else if(localityHint){
      geographyEvidence.push({type:'locality_hint',value:localityHint,region_code:effectiveRegionCode,kind:geographyResolution.kind,confidence:geographyResolution.confidence});
    }
    const evidence=[...extracted.evidence,...geographyEvidence];

    const score = scoreCandidate({
      evidence,
      sourceUrl: finalUrl,
      applicationUrl: extracted.application_url
    });

    const negative = hasStrongNegativeEvidence(evidence);
    const marketConflict = evidence.some(item => item?.type === 'market_conflict');
    const positive = hasPositiveApplicationEvidence(evidence);

    let status = 'rejected';
    let rejectionReason = null;
    let publishable = false;

    if (negative) {
      rejectionReason = marketConflict ? 'market_conflict' : 'negative_page_signal';
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

    const appliedRegionCorrection=(status==='validated'||status==='held')?regionCorrection:null;

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
        region_code: appliedRegionCorrection?.region_code||effectiveRegionCode,
        region: appliedRegionCorrection?.region||effectiveLocation,
        locality:(status==='validated'||status==='held')?localityHint:null
      },
      categories: [],
      evidence: [
        ...evidence,
        { type: 'score_reason', value: score.reasons.join(';'), confidence: 1 }
      ],
      score: score.score,
      status,
      rejection_reason: rejectionReason
    });

    return Object.freeze({ ...candidate, publishable });
  };
}

function socialSourceUrl(value) {
  try {
    const host=new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'');
    return ['instagram.com','facebook.com','x.com','twitter.com','tiktok.com','linkedin.com','threads.net'].includes(host);
  } catch {
    return false;
  }
}

async function stableCandidateId(market, canonical) {
  const bytes = new TextEncoder().encode(`${market}|\n${canonical}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `fpv2_${hex.slice(0, 24)}`;
}
