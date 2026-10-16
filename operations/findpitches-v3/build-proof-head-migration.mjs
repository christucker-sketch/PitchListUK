// Reproducible additive migration; --check is used by the parity test.
import fs from 'node:fs';
import {compactProofSql} from '../../platform/findpitches-v3/commercial-proof.mjs';
export function proofHeadMigration(){
 const proof=compactProofSql('v'),fresh=compactProofSql('NEW');
 return `-- Bounded disposable read model, NOT source evidence or a READY cache.
-- One row per entity. Rebuild from retained immutable source_verifications.
-- All live revision/hold/clock/expiry checks remain on catalogue reads.
CREATE TABLE customer_proof_heads (
 entity_id TEXT PRIMARY KEY REFERENCES entities(id),
 verification_sequence INTEGER NOT NULL UNIQUE REFERENCES source_verifications(sequence),
 proof_json TEXT NOT NULL CHECK(json_valid(proof_json))
);
CREATE TRIGGER customer_proof_head_insert_guard BEFORE INSERT ON customer_proof_heads
WHEN NOT EXISTS(SELECT 1 FROM source_verifications v WHERE v.entity_id=NEW.entity_id
 AND v.sequence=NEW.verification_sequence
 AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id)
 AND NEW.proof_json=${proof})
BEGIN SELECT RAISE(ABORT,'source_bound_proof_head_required'); END;
CREATE TRIGGER customer_proof_head_update_guard BEFORE UPDATE ON customer_proof_heads
WHEN NEW.entity_id<>OLD.entity_id OR NOT EXISTS(SELECT 1 FROM source_verifications v WHERE v.entity_id=NEW.entity_id
 AND v.sequence=NEW.verification_sequence
 AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=NEW.entity_id)
 AND NEW.proof_json=${proof})
BEGIN SELECT RAISE(ABORT,'source_bound_proof_head_required'); END;
CREATE TRIGGER verification_refresh_customer_proof AFTER INSERT ON source_verifications BEGIN
 INSERT INTO customer_proof_heads(entity_id,verification_sequence,proof_json)
 VALUES(NEW.entity_id,NEW.sequence,${fresh})
 ON CONFLICT(entity_id) DO UPDATE SET verification_sequence=excluded.verification_sequence,proof_json=excluded.proof_json
 WHERE excluded.verification_sequence>customer_proof_heads.verification_sequence;
END;
INSERT INTO customer_proof_heads(entity_id,verification_sequence,proof_json)
 SELECT v.entity_id,v.sequence,${proof} FROM source_verifications v
 WHERE v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=v.entity_id);
`;
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const file=new URL('./migrations/0026_customer_proof_heads.sql',import.meta.url),expected=proofHeadMigration();
 if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==expected)throw Error('proof_head_migration_drift');}
 else fs.writeFileSync(file,expected);
}
