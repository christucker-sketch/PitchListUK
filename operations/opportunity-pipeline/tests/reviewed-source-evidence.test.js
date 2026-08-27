'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  HASH_DOMAIN,
  reviewedSourceEvidence,
  assertHashDomainMatch
} = require('../lib/reviewed-source-evidence');

const anchor = /Christmas Market Stallholder Application Form Event:/i;

function page(fact, nonce) {
  return `<!doctype html><html data-nonce="${nonce}"><body>
    <nav>Donate Membership and renewals Raffles</nav>
    <main>
      <h1>Christmas Market Stallholder Application Form</h1>
      <p>Christmas Market Stallholder Application Form Event: OUTSIDE CHRISTMAS MARKET</p>
      <p>Dates: 26 November, 27 November, 28 November 29 November</p>
      <p>Pitches are subject to availability. I wish to apply.</p>
    </main>
    <aside>Did you know? ${fact} A member of A member of</aside>
    <footer>Hawk Conservancy Trust</footer>
  </body></html>`;
}

test('rotating non-material content cannot change reviewed material evidence', () => {
  const first = reviewedSourceEvidence(page('White-tailed Eagle fact.', 'one'), { anchor });
  const second = reviewedSourceEvidence(page('Steller’s Sea-Eagle fact.', 'two'), { anchor });

  assert.notEqual(first.raw_page.sha256, second.raw_page.sha256);
  assert.notEqual(first.normalised_page.sha256, second.normalised_page.sha256);
  assert.equal(first.stable_normalised_page.sha256, second.stable_normalised_page.sha256);
  assert.equal(first.material.sha256, second.material.sha256);
  assert.equal(assertHashDomainMatch(first.material, second.material), true);
});

test('the guard rejects raw, cleaned-page and material hash-domain mismatches', () => {
  const evidence = reviewedSourceEvidence(page('White-tailed Eagle fact.', 'one'), { anchor });
  assert.equal(evidence.raw_page.hash_domain, HASH_DOMAIN.RAW_PAGE);
  assert.equal(evidence.normalised_page.hash_domain, HASH_DOMAIN.NORMALISED_PAGE);
  assert.equal(evidence.material.hash_domain, HASH_DOMAIN.NORMALISED_MATERIAL);
  assert.throws(() => assertHashDomainMatch(evidence.material, evidence.raw_page), /evidence_hash_domain_mismatch/);
  assert.throws(() => assertHashDomainMatch(evidence.material, evidence.normalised_page), /evidence_hash_domain_mismatch/);
});

test('a genuine material evidence change still fails closed', () => {
  const reviewed = reviewedSourceEvidence(page('White-tailed Eagle fact.', 'one'), { anchor });
  const changed = reviewedSourceEvidence(page('White-tailed Eagle fact.', 'one').replace('26 November', '25 November'), { anchor });
  assert.throws(() => assertHashDomainMatch(reviewed.material, changed.material), /material_evidence_changed/);
});
