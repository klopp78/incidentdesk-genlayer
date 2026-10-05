# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Consensus incident receipts for public online services."""

from genlayer import *
import hashlib
import json
import typing


class IncidentQuorum(gl.Contract):
    """Append-only, evidence-bound service incident assessments."""

    receipt_count: u64
    latest_receipt_id: str
    receipt_ids: DynArray[str]
    receipts: TreeMap[str, str]

    def __init__(self):
        self.receipt_count = u64(0)
        self.latest_receipt_id = ""

    @gl.public.view
    def get_receipt_count(self) -> u64:
        return self.receipt_count

    @gl.public.view
    def get_latest_receipt_id(self) -> str:
        return self.latest_receipt_id

    @gl.public.view
    def get_receipt(self, receipt_id: str) -> str:
        return self.receipts.get(receipt_id, "")

    @gl.public.view
    def list_receipt_ids(self) -> str:
        return json.dumps([item for item in self.receipt_ids], separators=(",", ":"))

    @gl.public.write
    def assess_incident(
        self,
        service_name: str,
        service_url: str,
        window_start_utc: str,
        window_end_utc: str,
        source_urls: DynArray[str],
    ) -> str:
        service = _service_name(service_name)
        canonical_service_url = _https_url(service_url)
        start = _timestamp(window_start_utc)
        end = _timestamp(window_end_utc)
        if start >= end:
            raise Exception("invalid_incident_window")

        urls = _validate_sources([item for item in source_urls])
        manifest = _source_manifest(urls)
        if len({item["host"] for item in manifest}) < 2:
            raise Exception("at_least_two_independent_hosts_required")

        context_hash = _sha256_parts([
            "incidentquorum.v1",
            service,
            canonical_service_url,
            start,
            end,
            _canonical_json(manifest),
        ])

        def leader_fn():
            return _evaluate_incident(
                service,
                canonical_service_url,
                start,
                end,
                urls,
                manifest,
                context_hash,
            )

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                proposed = _parse_result(leader_result.calldata)
                independent = _parse_result(_evaluate_incident(
                    service,
                    canonical_service_url,
                    start,
                    end,
                    urls,
                    manifest,
                    context_hash,
                ))
            except Exception:
                return False
            return (
                proposed["decision"] == independent["decision"]
                and proposed["impact"] == independent["impact"]
                and proposed["service_match"] == independent["service_match"]
                and proposed["window_match"] == independent["window_match"]
                and proposed["incident_started_utc"] == independent["incident_started_utc"]
                and proposed["incident_resolved_utc"] == independent["incident_resolved_utc"]
                and proposed["evidence_source_count"] == independent["evidence_source_count"]
                and proposed["readable_source_count"] == independent["readable_source_count"]
                and proposed["source_snapshot_hashes"] == independent["source_snapshot_hashes"]
                and proposed["snapshot_bundle_hash"] == independent["snapshot_bundle_hash"]
                and proposed["incident_context_hash"] == independent["incident_context_hash"]
                and abs(proposed["confidence"] - independent["confidence"]) <= 10
            )

        result = _parse_result(gl.vm.run_nondet_unsafe(leader_fn, validator_fn))
        self.receipt_count = u64(int(self.receipt_count) + 1)
        sequence = int(self.receipt_count)
        receipt_id = "inq_" + _sha256_parts([context_hash, str(sequence)])[:20]
        record = {
            "schema_version": "incidentquorum.v1",
            "receipt_id": receipt_id,
            "sequence": sequence,
            "service_name": service,
            "service_url": canonical_service_url,
            "window_start_utc": start,
            "window_end_utc": end,
            "incident_context_hash": context_hash,
            "source_manifest": manifest,
            "source_snapshot_hashes": result["source_snapshot_hashes"],
            "snapshot_bundle_hash": result["snapshot_bundle_hash"],
            "submitted_by": str(gl.message.sender_address).lower(),
            "decision": result["decision"],
            "impact": result["impact"],
            "confidence": result["confidence"],
            "service_match": result["service_match"],
            "window_match": result["window_match"],
            "incident_started_utc": result["incident_started_utc"],
            "incident_resolved_utc": result["incident_resolved_utc"],
            "evidence_source_count": result["evidence_source_count"],
            "readable_source_count": result["readable_source_count"],
        }
        record_hash = _sha256(_canonical_json(record))
        record["accepted_write"] = {
            "receipt_id": receipt_id,
            "record_hash": record_hash,
            "snapshot_bundle_hash": result["snapshot_bundle_hash"],
        }
        self.receipts[receipt_id] = _canonical_json(record)
        self.receipt_ids.append(receipt_id)
        self.latest_receipt_id = receipt_id
        return receipt_id


def _evaluate_incident(
    service: str,
    service_url: str,
    start: str,
    end: str,
    urls: typing.Sequence[str],
    manifest: typing.Sequence[dict],
    context_hash: str,
) -> str:
    snapshots = []
    snapshot_hashes = []
    readable_count = 0
    for index, url in enumerate(urls):
        try:
            rendered = gl.nondet.web.render(url, mode="text")[:9000]
            readable = len(rendered.strip()) >= 40
        except Exception:
            rendered = "SOURCE_UNAVAILABLE"
            readable = False
        if readable:
            readable_count += 1
        snapshot_hash = _sha256(rendered)
        snapshot_hashes.append(snapshot_hash)
        snapshots.append({
            "source_index": index + 1,
            "host": manifest[index]["host"],
            "readable": readable,
            "snapshot_hash": snapshot_hash,
            "text": rendered,
        })

    bundle_hash = _sha256_parts([context_hash, _canonical_json(snapshot_hashes)])
    if readable_count < 2:
        return _canonical_json(_result_payload(
            "insufficient_evidence", "unknown", 100, False, False,
            "", "", 0, readable_count, snapshot_hashes, bundle_hash, context_hash,
        ))

    prompt = f"""
You adjudicate public service incidents for an on-chain SLA primitive. Determine whether the
named service experienced a user-impacting incident overlapping the exact UTC window. Treat
maintenance announcements, incidents for another product, and reports outside the window as
non-matches. Confirmed requires at least two readable sources that directly support the incident,
including one source that identifies the service and timing. No_incident requires credible evidence
that the service remained operational in the window. Use disputed for contradictory reports,
unclear timing, weak identity matching, or evidence that cannot justify either conclusion.

Service: {service}
Canonical service URL: {service_url}
Window start UTC: {start}
Window end UTC: {end}
Source manifest: {_canonical_json(manifest)}
Rendered evidence: {_canonical_json(snapshots)}

Return only minified JSON with exactly these fields: decision
(confirmed|no_incident|disputed), impact (critical|major|partial|minor|none|unknown), confidence
(0-100), service_match (boolean), window_match (boolean), incident_started_utc (empty or the
best ISO-8601 UTC time), incident_resolved_utc (empty or the best ISO-8601 UTC time), and
evidence_source_count (integer number of readable sources directly supporting the decision).
Do not include prose or additional fields.
"""
    model_result = json.loads(gl.nondet.exec_prompt(prompt))
    parsed = _parse_model_fields(model_result)
    parsed.update({
        "readable_source_count": readable_count,
        "source_snapshot_hashes": snapshot_hashes,
        "snapshot_bundle_hash": bundle_hash,
        "incident_context_hash": context_hash,
    })
    return _canonical_json(parsed)


def _result_payload(
    decision: str,
    impact: str,
    confidence: int,
    service_match: bool,
    window_match: bool,
    started: str,
    resolved: str,
    evidence_count: int,
    readable_count: int,
    hashes: typing.Sequence[str],
    bundle_hash: str,
    context_hash: str,
) -> dict:
    return {
        "decision": decision,
        "impact": impact,
        "confidence": confidence,
        "service_match": service_match,
        "window_match": window_match,
        "incident_started_utc": started,
        "incident_resolved_utc": resolved,
        "evidence_source_count": evidence_count,
        "readable_source_count": readable_count,
        "source_snapshot_hashes": hashes,
        "snapshot_bundle_hash": bundle_hash,
        "incident_context_hash": context_hash,
    }


def _parse_model_fields(raw: dict) -> dict:
    decision = str(raw.get("decision", "")).lower()
    impact = str(raw.get("impact", "")).lower()
    if decision not in ("confirmed", "no_incident", "disputed", "insufficient_evidence"):
        raise Exception("invalid_decision")
    if impact not in ("critical", "major", "partial", "minor", "none", "unknown"):
        raise Exception("invalid_impact")
    confidence = int(raw.get("confidence", -1))
    if confidence < 0 or confidence > 100:
        raise Exception("invalid_confidence")
    if not isinstance(raw.get("service_match"), bool) or not isinstance(raw.get("window_match"), bool):
        raise Exception("invalid_match_flags")
    started = _optional_timestamp(raw.get("incident_started_utc", ""))
    resolved = _optional_timestamp(raw.get("incident_resolved_utc", ""))
    evidence_count = int(raw.get("evidence_source_count", -1))
    if evidence_count < 0 or evidence_count > 5:
        raise Exception("invalid_evidence_source_count")
    if decision == "confirmed":
        if not raw["service_match"] or not raw["window_match"] or evidence_count < 2:
            raise Exception("confirmed_requires_direct_quorum")
    if decision == "no_incident" and impact not in ("none", "unknown"):
        raise Exception("invalid_no_incident_impact")
    return {
        "decision": decision,
        "impact": impact,
        "confidence": confidence,
        "service_match": raw["service_match"],
        "window_match": raw["window_match"],
        "incident_started_utc": started,
        "incident_resolved_utc": resolved,
        "evidence_source_count": evidence_count,
    }


def _parse_result(raw: str) -> dict:
    result = json.loads(raw)
    parsed = _parse_model_fields(result)
    hashes = result.get("source_snapshot_hashes", [])
    if not isinstance(hashes, list) or len(hashes) < 2 or len(hashes) > 5:
        raise Exception("invalid_snapshot_hashes")
    if any(not _is_digest(str(item)) for item in hashes):
        raise Exception("invalid_snapshot_hash")
    readable_count = int(result.get("readable_source_count", -1))
    if readable_count < 0 or readable_count > len(hashes):
        raise Exception("invalid_readable_source_count")
    if parsed["evidence_source_count"] > readable_count:
        raise Exception("evidence_count_exceeds_readable_sources")
    bundle_hash = str(result.get("snapshot_bundle_hash", ""))
    context_hash = str(result.get("incident_context_hash", ""))
    if not _is_digest(bundle_hash) or not _is_digest(context_hash):
        raise Exception("invalid_commitment")
    parsed.update({
        "readable_source_count": readable_count,
        "source_snapshot_hashes": [str(item) for item in hashes],
        "snapshot_bundle_hash": bundle_hash,
        "incident_context_hash": context_hash,
    })
    return parsed


def _validate_sources(raw_urls: typing.Sequence[str]) -> typing.Sequence[str]:
    if len(raw_urls) < 2 or len(raw_urls) > 5:
        raise Exception("use_two_to_five_sources")
    urls = []
    seen = set()
    for raw in raw_urls:
        url = _https_url(raw)
        key = url.rstrip("/").lower()
        if key in seen:
            raise Exception("duplicate_source_url")
        seen.add(key)
        urls.append(url)
    return urls


def _source_manifest(urls: typing.Sequence[str]) -> typing.Sequence[dict]:
    return [{
        "source_index": index + 1,
        "url": url,
        "host": _host(url),
        "url_hash": _sha256(url),
    } for index, url in enumerate(urls)]


def _host(url: str) -> str:
    host = url.split("//", 1)[1].split("/", 1)[0].split(":", 1)[0].lower()
    if "." not in host or len(host) > 253:
        raise Exception("invalid_source_host")
    return host


def _service_name(raw: str) -> str:
    value = str(raw).strip()
    if len(value) < 2 or len(value) > 160 or any(char in value for char in "\n\r\t"):
        raise Exception("invalid_service_name")
    return value


def _https_url(raw: str) -> str:
    value = str(raw).strip()
    if not value.startswith("https://") or len(value) > 600:
        raise Exception("invalid_https_url")
    _host(value)
    return value


def _timestamp(raw: str) -> str:
    value = str(raw).strip()
    if len(value) < 20 or len(value) > 35 or "T" not in value or not value.endswith("Z"):
        raise Exception("use_iso_8601_utc")
    if any(char in value for char in "\n\r\t"):
        raise Exception("invalid_timestamp")
    return value


def _optional_timestamp(raw) -> str:
    value = str(raw).strip()
    return "" if value == "" else _timestamp(value)


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _canonical_parts(parts: typing.Sequence[str]) -> str:
    return "".join(str(len(str(part))) + ":" + str(part) for part in parts)


def _sha256_parts(parts: typing.Sequence[str]) -> str:
    return _sha256(_canonical_parts(parts))


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _is_digest(value: str) -> bool:
    return len(value) == 64 and all(char in "0123456789abcdef" for char in value)

