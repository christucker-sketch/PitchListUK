-- D1 limits expression depth to 100. Balance identical conjunctions; retain
-- every original predicate, immutable ledger and ordinary selection guard.
DROP TRIGGER official_supersession_scope;
CREATE TRIGGER official_supersession_scope BEFORE INSERT ON official_source_supersessions WHEN NOT EXISTS (
 SELECT 1 FROM entities e
 JOIN producer_records r ON r.id=NEW.review_record_id
 JOIN entity_records rr ON rr.record_id=r.id AND rr.entity_id=e.id
 JOIN entity_records cr ON cr.record_id=json_extract(r.raw_json,'$.candidate_record_id') AND cr.entity_id=e.id
 JOIN producer_records candidate ON candidate.id=cr.record_id
 JOIN reconciliation_decisions decision ON decision.record_id=candidate.id
 JOIN source_documents doc ON doc.id=NEW.document_id
 JOIN field_selections old_selection ON old_selection.entity_id=e.id AND old_selection.field_name=NEW.field_name AND old_selection.fact_id=NEW.previous_fact_id
 JOIN source_facts old_fact ON old_fact.id=NEW.previous_fact_id
 JOIN source_facts next_fact ON next_fact.id=NEW.next_fact_id AND next_fact.record_id=r.id AND next_fact.field_name=NEW.field_name
 JOIN entity_facts membership ON membership.entity_id=e.id AND membership.fact_id=next_fact.id
 WHERE (
   e.id=NEW.entity_id
   AND e.environment='shadow'
   AND e.market='GB'
   AND e.shadow_only=1
   AND r.environment=e.environment
   AND r.market=e.market
   AND r.producer_type='enrichment'
 )
 AND (
   r.producer_name='operator-review:official-source'
   AND r.validation_status='accepted'
   AND r.id GLOB 'review_*'
   AND json_extract(r.raw_json,'$.review_status')='supersession_committed'
   AND json_extract(r.raw_json,'$.actor')='codex'
   AND json_extract(r.raw_json,'$.entity_id')=e.id
   AND json_extract(r.raw_json,'$.document_id')=doc.id
 )
 AND (
   json_extract(r.raw_json,'$.previous_revision')=e.revision
   AND json_extract(r.raw_json,'$.previous_field_ids.'||NEW.field_name)=old_fact.id
   AND json_extract(r.raw_json,'$.original_source_platform')='ukcraftfairs'
   AND json_extract(r.raw_json,'$.original_canonical_url') IN (
   SELECT json_extract(value_json,'$') FROM selected_facts WHERE entity_id=e.id AND field_name='canonical_url')
   AND (json_extract(r.raw_json,'$.original_canonical_url') LIKE 'https://www.ukcraftfairs.com/craft-events/%'
      OR json_extract(r.raw_json,'$.original_canonical_url') LIKE 'https://ukcraftfairs.com/craft-events/%')
   AND EXISTS(SELECT 1 FROM selected_facts WHERE entity_id=e.id AND field_name='source_platform' AND json_extract(value_json,'$')='ukcraftfairs')
   AND EXISTS(SELECT 1 FROM selected_facts WHERE entity_id=e.id AND field_name='organiser' AND lower(json_extract(value_json,'$'))='ukcraftfairs.com')
 )
 AND (
   NOT EXISTS(SELECT 1 FROM selected_facts WHERE entity_id=e.id AND field_name IN ('lifecycle_state','application_state') AND json_extract(value_json,'$') IN ('CLOSED','WITHDRAWN'))
   AND NOT EXISTS(SELECT 1 FROM source_verifications WHERE entity_id=e.id AND status='verified')
   AND candidate.producer_name='uk-official'
   AND candidate.environment='shadow'
   AND candidate.market='GB'
   AND decision.outcome='PROBABLE_MATCH'
   AND json_array_length(decision.candidates_json)=1
 )
 AND (
   json_extract(decision.candidates_json,'$[0]')=e.id
   AND json_extract(candidate.normalized_json,'$.source_platform')='creativecrafts'
   AND json_extract(candidate.normalized_json,'$.source_identifier')=json_extract(r.raw_json,'$.reviewed_source_identifier')
   AND json_extract(r.raw_json,'$.reviewed_source_platform')='creativecrafts'
   AND doc.source_url=json_extract(r.raw_json,'$.reviewed_canonical_url')
   AND json_extract(doc.document_json,'$.document_kind')='cca_official_bundle'
   AND json_extract(doc.document_json,'$.requested_url')=doc.source_url
 )
 AND (
   json_extract(doc.document_json,'$.source_identifier')=json_extract(r.raw_json,'$.reviewed_source_identifier')
   AND json_extract(r.raw_json,'$.verified_report.status')='verified'
   AND json_extract(r.raw_json,'$.verified_report.profile')='creativecrafts'
   AND json_extract(r.raw_json,'$.verified_report.facts.country')=e.market
   AND json_extract(r.raw_json,'$.verified_report.facts.application_state')='OPEN_NOW'
   AND json_extract(r.raw_json,'$.verified_report.facts.source_identifier')=json_extract(doc.document_json,'$.source_identifier')
   AND json_extract(r.raw_json,'$.verified_report.facts.canonical_url')=doc.source_url
 )
 AND (
   substr(json_extract(r.raw_json,'$.verified_report.facts.event_start'),1,4)=e.edition
   AND json_extract(r.raw_json,'$.verified_report.facts.event_start') IN (SELECT json_extract(value_json,'$') FROM selected_facts WHERE entity_id=e.id AND field_name='event_start')
   AND json_extract(r.raw_json,'$.verified_report.facts.event_end') IN (SELECT json_extract(value_json,'$') FROM selected_facts WHERE entity_id=e.id AND field_name='event_end')
   AND next_fact.authority=100
   AND next_fact.authority>=old_fact.authority
   AND next_fact.value_json=json_quote(json_extract(r.raw_json,'$.verified_report.facts.'||NEW.field_name))
   AND next_fact.value_json=json_quote(json_extract(r.raw_json,'$.reviewed_facts.'||NEW.field_name))
 )
 AND (
   NEW.field_name NOT IN ('lifecycle_state','country','market','edition','environment')
   AND r.received_at=NEW.reviewed_at
   AND julianday(r.received_at)>=julianday(doc.fetched_at)
   AND julianday(r.received_at)-julianday(doc.fetched_at)<=5.0/1440
 )
) BEGIN SELECT RAISE(ABORT,'official_supersession_verified_review_required'); END;
