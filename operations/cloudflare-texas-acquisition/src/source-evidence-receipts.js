export function receiptsForAddedSources(receipts = [], addedSources = []) {
  const receiptList = Array.isArray(receipts) ? receipts : [];
  const addedList = Array.isArray(addedSources) ? addedSources : [];
  const selected = [];

  for (const source of addedList) {
    const sourceId = String(source?.id || '').trim();
    if (!sourceId) throw new Error('Source PR contains a net-new source without an id');
    const matches = receiptList.filter(receipt => String(receipt?.source_id || '').trim() === sourceId);
    if (matches.length !== 1) {
      throw new Error(`Source PR requires exactly one deterministic evidence receipt for ${sourceId}; found ${matches.length}`);
    }
    selected.push(matches[0]);
  }

  return selected;
}

export function publicationEvidenceCounts(discovery = {}, publication = {}) {
  const sourceIds = Array.isArray(publication?.source_ids) ? publication.source_ids : [];
  const publishedEvidenceCount = Number(publication?.evidence_passed_count || 0);
  return {
    validated_source_count: Number(discovery?.sources?.length || 0),
    validated_evidence_count: Number(discovery?.receipts?.length || 0),
    generated_source_count: sourceIds.length,
    evidence_passed_count: publishedEvidenceCount
  };
}
