"""Versioned export contract: `findpitches-discovery-export-v1`.

The JSON Schema below is the canonical definition (written to
integration_export/schema/findpitches-discovery-export-v1.schema.json). A small built-in validator
implements the subset of JSON Schema used here so validation never depends on a third-party package;
tests additionally check the schema with `jsonschema` when it is installed.
"""
from __future__ import annotations

import re

SCHEMA_VERSION = "findpitches-discovery-export-v1"

STATES = ["OPEN_NOW", "ROLLING", "ENQUIRY_AVAILABLE", "UPCOMING_NOT_OPEN", "CLOSED_CURRENT_CYCLE", "HISTORICAL",
          "UNKNOWN", "NOT_RELEVANT"]
USABLE_STATES = ["OPEN_NOW", "ROLLING", "ENQUIRY_AVAILABLE"]
LIFECYCLE_EVENTS = ["NEW", "UPDATED", "STATE_CHANGED", "CLOSED", "REOPENED", "WATCH", "UNCHANGED", "WITHDRAWN"]
CHANNELS = ["current", "watch", "held", "retired"]
SOURCES = ["eventeny", "localstalls", "cluemart", "ukcraftfairs", "marketspread", "entrythingy", "organiser_site",
           "council", "directory", "wikidata_seed", "search", "osm", "other"]
STRATEGIES = ["platform_enumeration", "platform_id_window", "directory_follow", "entity_seed_crawl",
              "council_seed_crawl", "search_api", "map_data", "other"]
SOURCE_TYPES = ["platform_listing", "organiser_site", "form", "aggregator", "council_site", "other"]
COUNTRY_CODES = ["GB", "US", "CA", "AU", "NZ", "IE"]
CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"]
REVISIT_BASIS = ["SOURCE_PROVIDED", "INTERNAL"]

S = {"type": "string"}
SN = {"type": ["string", "null"]}
DATE = {"type": ["string", "null"], "pattern": r"^\d{4}-\d{2}-\d{2}$"}
TS = {"type": ["string", "null"], "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"}
URL = {"type": "string", "pattern": r"^https?://\S+$"}
URLN = {"type": ["string", "null"], "pattern": r"^https?://\S+$"}

RECORD_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://findpitches.example/schemas/findpitches-discovery-export-v1.schema.json",
    "title": SCHEMA_VERSION,
    "description": "One opportunity per JSON line. See integration_export/README.md for field semantics.",
    "type": "object",
    "required": ["schema_version", "opportunity_id", "channel", "lifecycle_event", "application_state",
                 "country_code", "event_name", "source_url", "discovery_source", "discovery_strategy",
                 "first_seen", "last_checked", "evidence", "provenance", "fingerprint", "identity", "confidence",
                 "export_readiness"],
    "additionalProperties": False,
    "properties": {
        "schema_version": {"type": "string", "enum": [SCHEMA_VERSION]},
        "opportunity_id": {"type": "string", "pattern": r"^fdx1_[0-9a-f]{20}$"},
        "channel": {"type": "string", "enum": CHANNELS},
        "lifecycle_event": {"type": "string", "enum": LIFECYCLE_EVENTS},
        "lifecycle_changes": {"type": "array", "items": S},
        "previous_application_state": {"type": ["string", "null"], "enum": STATES + [None]},
        "carried_forward": {"type": "boolean"},
        "export_readiness": {"type": "string", "enum": ["READY", "WATCH", "NOT_READY", "RETIRED"]},
        "readiness_issues": {"type": "array", "items": S},
        "country": SN,
        "country_code": {"type": ["string", "null"], "enum": COUNTRY_CODES + [None]},
        "region": SN,
        "region_code": {"type": ["string", "null"], "pattern": r"^[A-Z]{2}-[A-Z0-9]{1,3}$"},
        "locality": SN,
        "location": SN,
        "venue": SN,
        "geography_basis": {"type": "array", "items": S},
        "event_name": {"type": "string", "minLength": 2},
        "organiser": SN,
        "opportunity_type": SN,
        "event_types": {"type": "array", "items": S},
        "vendor_categories": {"type": "array", "items": S},
        "application_state": {"type": "string", "enum": STATES},
        "application_state_evidence": SN,
        "open_strength": {"type": ["string", "null"], "enum": ["explicit", "implicit", None]},
        "recurring": {"type": ["boolean", "null"]},
        "recurrence_evidence": SN,
        "event_start": DATE,
        "event_end": DATE,
        "event_date_basis": SN,
        "application_deadline": DATE,
        "applications_open_on": DATE,
        "source_url": URL,
        "application_url": URLN,
        "application_routes": {"type": "array", "items": {
            "type": "object", "required": ["route_id", "url", "route_type"], "additionalProperties": False,
            "properties": {"route_id": {"type": "string", "pattern": r"^rt_[0-9a-f]{16}$"}, "url": URL,
                           "route_type": S, "platform": SN, "category": SN, "label": SN}}},
        "discovery_source": {"type": "string", "enum": SOURCES},
        "discovery_source_detail": SN,
        "discovery_strategy": {"type": "string", "enum": STRATEGIES},
        "source_type": {"type": "string", "enum": SOURCE_TYPES},
        "platform": SN,
        "first_seen": TS,
        "last_seen": TS,
        "last_checked": TS,
        "evidence": {"type": "object", "additionalProperties": False, "required": ["relevance"],
                     "properties": {"relevance": {"type": "array", "items": S},
                                    "state": SN, "dates": {"type": "array", "items": S}}},
        "confidence": {"type": "object", "additionalProperties": False, "required": ["level"],
                       "properties": {"level": {"type": "string", "enum": CONFIDENCE_LEVELS},
                                      "classifier_score": {"type": ["number", "null"]},
                                      "lane_audited_precision": {"type": ["number", "null"]},
                                      "basis": SN}},
        "provenance": {"type": "object", "additionalProperties": False, "required": ["engine", "sources"],
                       "properties": {
                           "engine": S, "engine_version": SN, "classifier_version": SN,
                           "sources": {"type": "array", "items": {
                               "type": "object", "additionalProperties": False, "required": ["url"],
                               "properties": {"url": URL, "role": SN, "discovery_source": SN, "fetched_at": TS,
                                              "http_status": {"type": ["integer", "null"]},
                                              "content_sha256": SN, "classifier_version": SN}}},
                           "raw_evidence_refs": {"type": "array", "items": S}}},
        "fingerprint": {"type": "object", "additionalProperties": False, "required": ["content", "material"],
                        "properties": {"content": S, "material": S}},
        "identity": {"type": "object", "additionalProperties": False, "required": ["algorithm", "natural_key"],
                     "properties": {"algorithm": S, "natural_key": S, "resolved_by": SN,
                                    "anchors": {"type": "array", "items": S}}},
        "watch": {"type": ["object", "null"], "additionalProperties": False,
                  "properties": {"reason": SN, "priority": SN, "missing_evidence": {"type": "array", "items": S},
                                 "revisit_url": URLN, "suggested_revisit_date": DATE,
                                 "revisit_date_basis": {"type": ["string", "null"], "enum": REVISIT_BASIS + [None]},
                                 "revisit_basis_detail": SN}},
    },
}


def _type_ok(v, t) -> bool:
    ts = t if isinstance(t, list) else [t]
    for x in ts:
        if x == "null" and v is None:
            return True
        if x == "string" and isinstance(v, str):
            return True
        if x == "integer" and isinstance(v, int) and not isinstance(v, bool):
            return True
        if x == "number" and isinstance(v, (int, float)) and not isinstance(v, bool):
            return True
        if x == "boolean" and isinstance(v, bool):
            return True
        if x == "object" and isinstance(v, dict):
            return True
        if x == "array" and isinstance(v, list):
            return True
    return False


def validate(obj, schema=RECORD_SCHEMA, path="$") -> list[str]:
    """Return a list of violations (empty = valid). Supports type, enum, pattern, minLength, required,
    properties, additionalProperties=false and items: the subset this contract uses."""
    errs: list[str] = []
    t = schema.get("type")
    if t and not _type_ok(obj, t):
        return [f"{path}: expected {t}, got {type(obj).__name__}"]
    if "enum" in schema and obj not in schema["enum"]:
        errs.append(f"{path}: {obj!r} not in enum")
    if isinstance(obj, str):
        if "pattern" in schema and not re.search(schema["pattern"], obj):
            errs.append(f"{path}: {obj!r} does not match {schema['pattern']}")
        if "minLength" in schema and len(obj) < schema["minLength"]:
            errs.append(f"{path}: shorter than {schema['minLength']}")
    if isinstance(obj, dict):
        for k in schema.get("required", []):
            if k not in obj:
                errs.append(f"{path}: missing required '{k}'")
        props = schema.get("properties", {})
        for k, v in obj.items():
            if k in props:
                errs.extend(validate(v, props[k], f"{path}.{k}"))
            elif schema.get("additionalProperties") is False:
                errs.append(f"{path}: unexpected property '{k}'")
    if isinstance(obj, list) and "items" in schema:
        for i, v in enumerate(obj):
            errs.extend(validate(v, schema["items"], f"{path}[{i}]"))
    return errs
