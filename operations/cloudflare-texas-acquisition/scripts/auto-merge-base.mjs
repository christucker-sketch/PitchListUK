export function branchBasePrefix(branch) {
  const match = String(branch || '').match(/-base-([a-f0-9]{16})$/i);
  return match ? match[1].toLowerCase() : '';
}

export function validateSnapshotEquivalentMainDrift({
  currentMainSha,
  prBaseSha,
  branchBaseSha,
  branchBaseIsAncestor,
  snapshotBlobAtBranchBase,
  snapshotBlobAtCurrentMain
}) {
  const current = String(currentMainSha || '').toLowerCase();
  const prBase = String(prBaseSha || '').toLowerCase();
  const branchBase = String(branchBaseSha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(current) || !/^[a-f0-9]{40}$/.test(prBase) || !/^[a-f0-9]{40}$/.test(branchBase)) {
    throw new Error('Auto-merge base provenance is malformed');
  }
  if (prBase !== current) throw new Error('Auto-merge PR base is not the exact current main SHA');
  if (branchBase === current) return { branchBaseSha: branchBase, reconciledMainDrift: false };
  if (branchBaseIsAncestor !== true) throw new Error('Auto-merge original base is not an ancestor of current main');
  const beforeBlob = String(snapshotBlobAtBranchBase || '').toLowerCase();
  const currentBlob = String(snapshotBlobAtCurrentMain || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(beforeBlob) || !/^[a-f0-9]{40}$/.test(currentBlob)) {
    throw new Error('Auto-merge snapshot blob provenance is malformed');
  }
  if (beforeBlob !== currentBlob) throw new Error('US production snapshot changed while data PR awaited review');
  return { branchBaseSha: branchBase, reconciledMainDrift: true };
}
