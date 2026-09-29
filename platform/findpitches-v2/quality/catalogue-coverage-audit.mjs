import { enabledGeographies } from '../geography/catalog.mjs';

// Read-only aggregate diagnostic. A source-backed projection is NOT necessarily customer-ready:
// the protected API also enforces candidate status, revision, deadline, freshness, and URL rules.
export async function getCatalogueCoverageAudit(db) {
  if (!db?.prepare) throw new Error('findpitches_catalogue_audit_db_missing');
  const [stateRows, rejectionRows, recoveryRows] = await Promise.all([
    db.prepare(`SELECT c.region_code,
        COUNT(*) AS candidates,
        SUM(CASE WHEN c.status='validated' THEN 1 ELSE 0 END) AS validated,
        SUM(CASE WHEN c.status='rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN c.status='validated' AND e.candidate_id IS NOT NULL
                   THEN 1 ELSE 0 END) AS validated_with_current_enrichment,
        SUM(CASE WHEN c.status='validated' AND e.candidate_id IS NULL
                   THEN 1 ELSE 0 END) AS validated_without_current_enrichment,
        SUM(CASE WHEN c.status='validated' AND o.id IS NOT NULL
                   THEN 1 ELSE 0 END) AS projected_validated,
        SUM(CASE WHEN c.status='validated' AND o.id IS NOT NULL
                   AND o.last_checked >= c.last_checked
                   AND NULLIF(TRIM(o.location),'') IS NOT NULL
                   AND NULLIF(TRIM(o.location_evidence_url),'') IS NOT NULL
                   THEN 1 ELSE 0 END) AS current_source_backed_projection
       FROM candidates c
       LEFT JOIN candidate_enrichment e
         ON e.candidate_id=c.id AND e.source_last_checked >= c.last_checked
       LEFT JOIN customer_opportunities o ON o.id=c.id
       WHERE c.market='US'
       GROUP BY c.region_code
       ORDER BY c.region_code`).all(),
    db.prepare(`SELECT market, status, COALESCE(NULLIF(TRIM(rejection_reason),''),'unspecified') AS reason,
         COUNT(*) AS records
       FROM candidates
       WHERE status IN ('rejected','held')
       GROUP BY market, status, COALESCE(NULLIF(TRIM(rejection_reason),''),'unspecified')
       ORDER BY records DESC, market, status, reason`).all(),
    db.prepare(`SELECT c.market, COUNT(*) AS validated,
         SUM(CASE WHEN e.candidate_id IS NOT NULL THEN 1 ELSE 0 END) AS with_current_enrichment,
         SUM(CASE WHEN e.candidate_id IS NULL THEN 1 ELSE 0 END) AS missing_current_enrichment,
         SUM(CASE WHEN o.id IS NOT NULL AND o.last_checked >= c.last_checked
                    AND NULLIF(TRIM(o.location),'') IS NOT NULL
                    AND NULLIF(TRIM(o.location_evidence_url),'') IS NOT NULL
                  THEN 1 ELSE 0 END) AS current_source_backed_projection
       FROM candidates c
       LEFT JOIN candidate_enrichment e
         ON e.candidate_id=c.id AND e.source_last_checked >= c.last_checked
       LEFT JOIN customer_opportunities o ON o.id=c.id
       WHERE c.status='validated'
       GROUP BY c.market ORDER BY c.market`).all()
  ]);
  const found = new Map((stateRows?.results || []).map(r => [String(r.region_code || '').toUpperCase(), r]));
  const numeric = (value) => Number(value || 0);
  const us_states = enabledGeographies('US').map(({code,name}) => {
    const r = found.get(code) || {};
    return {
      code, name, candidates:numeric(r.candidates), validated:numeric(r.validated),
      rejected:numeric(r.rejected),
      validated_with_current_enrichment:numeric(r.validated_with_current_enrichment),
      validated_without_current_enrichment:numeric(r.validated_without_current_enrichment),
      projected_validated:numeric(r.projected_validated),
      current_source_backed_projection:numeric(r.current_source_backed_projection)
    };
  });
  const known = new Set(us_states.map(s => s.code));
  const unknown_region = (stateRows?.results || []).filter(r => !known.has(String(r.region_code || '').toUpperCase()))
    .map(r => ({region_code:r.region_code, candidates:numeric(r.candidates)}));
  return {
    definitions:{
      current_source_backed_projection:'Validated candidate; projection is not older than candidate and has nonblank location and evidence URL. This is NOT the protected customer API visibility count.',
      state_geography:'Candidate discovery region (region_code), not independently verified event venue/state.',
      with_current_enrichment:'Enrichment source_last_checked is at least the latest candidate last_checked.'
    },
    us_states, unknown_region,
    rejection_reasons:(rejectionRows?.results || []).map(r=>({...r,records:numeric(r.records)})),
    validated_recovery_by_market:(recoveryRows?.results || []).map(r=>({
      market:r.market, validated:numeric(r.validated),
      with_current_enrichment:numeric(r.with_current_enrichment),
      missing_current_enrichment:numeric(r.missing_current_enrichment),
      current_source_backed_projection:numeric(r.current_source_backed_projection)
    }))
  };
}
