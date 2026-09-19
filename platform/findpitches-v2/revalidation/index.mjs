export function createRevalidator({
  fetchProvider,
  now = () => new Date()
} = {}) {
  if (typeof fetchProvider?.fetch !== 'function') throw new Error('findpitches_v2_revalidator_fetch_provider_missing');

  return Object.freeze({
    async revalidate(candidate) {
      const checkedAt = now().toISOString();

      try {
        const page = await fetchProvider.fetch(candidate.canonical_url || candidate.source_url);
        const body = String(page?.body || '').toLowerCase();

        const closed = /(applications? closed|vendor applications? closed|trader applications? closed|no longer accepting applications)/i.test(body);
        const cancelled = /(event cancelled|event canceled|cancelled event|canceled event)/i.test(body);

        let status = 'current';
        let reason = null;

        if (cancelled) {
          status = 'archive_candidate';
          reason = 'event_cancelled';
        } else if (closed) {
          status = 'archive_candidate';
          reason = 'applications_closed';
        }

        return Object.freeze({
          candidate_id: candidate.candidate_id || candidate.id,
          market: candidate.market,
          status,
          reason,
          checked_at: checkedAt,
          final_url: page?.final_url || candidate.canonical_url || candidate.source_url,
          action: status === 'archive_candidate' ? 'review_archive' : 'none',
          automatic_delete: false
        });
      } catch (error) {
        return Object.freeze({
          candidate_id: candidate.candidate_id || candidate.id,
          market: candidate.market,
          status: 'recheck_required',
          reason: String(error?.message || error),
          checked_at: checkedAt,
          final_url: candidate.canonical_url || candidate.source_url,
          action: 'retry',
          automatic_delete: false
        });
      }
    }
  });
}
