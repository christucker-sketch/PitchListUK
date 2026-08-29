function shortSha(value, label) {
  const sha = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error(`Invalid ${label} SHA`);
  return sha.slice(0, 16);
}

export function dataBranchName(state, promotionManifest, mainSha) {
  const slug = String(state?.slug || '').trim();
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Invalid state slug');
  const promotionSha = shortSha(promotionManifest?.rows_sha256, 'promotion rows');
  const baseSha = shortSha(mainSha, 'main');
  return `data/cloud-${slug}-growth-${promotionSha}-base-${baseSha}`;
}
