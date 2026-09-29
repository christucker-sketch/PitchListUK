import { normalizeEnrichment } from './enrichment.mjs';
import { projectCustomerOpportunity } from './project.mjs';
import { buildCustomerSearchDocument } from './search-document.mjs';
import { upsertCustomerOpportunity } from './store.mjs';

export async function promoteCustomerOpportunity(db, candidate = {}, enrichmentInput = {}) {
  const enrichment = normalizeEnrichment(enrichmentInput);
  const projected = projectCustomerOpportunity(candidate, enrichment);

  if (!projected.readiness.ready) {
    return Object.freeze({
      promoted: false,
      reason: 'not_customer_ready',
      candidate_id: candidate.id ?? candidate.candidate_id ?? null,
      readiness: projected.readiness,
      opportunity: projected.opportunity,
      provenance: projected.provenance
    });
  }

  const searchDocument = buildCustomerSearchDocument(projected.opportunity);
  const locationEvidenceUrl = projected.provenance.location?.evidence?.[0]?.source || null;
  await upsertCustomerOpportunity(db, projected.opportunity, searchDocument, { locationEvidenceUrl });

  return Object.freeze({
    promoted: true,
    candidate_id: projected.opportunity.id,
    readiness: projected.readiness,
    opportunity: projected.opportunity,
    provenance: projected.provenance
  });
}
