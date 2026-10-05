import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("contracts/incident_quorum.py", "utf8");
const runtime = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6";

assert.ok(source.split(/\r?\n/, 1)[0].includes(runtime), "missing pinned GenLayer runtime");
assert.match(source, /class\s+IncidentQuorum\s*\(\s*gl\.Contract\s*\)/);
for (const method of ["assess_incident", "get_receipt", "get_receipt_count", "get_latest_receipt_id", "list_receipt_ids"]) {
  assert.match(source, new RegExp(`def\\s+${method}\\s*\\(`), `missing method ${method}`);
}
assert.match(source, /gl\.vm\.run_nondet_unsafe/);
assert.match(source, /gl\.nondet\.web\.render/);
assert.match(source, /hashlib\.sha256/);
assert.match(source, /_canonical_parts/);
assert.match(source, /proposed\["source_snapshot_hashes"\]\s*==\s*independent\["source_snapshot_hashes"\]/);
assert.match(source, /proposed\["snapshot_bundle_hash"\]\s*==\s*independent\["snapshot_bundle_hash"\]/);
assert.match(source, /incident_context_hash/);
assert.match(source, /record_hash/);
assert.doesNotMatch(source, /custom_hash|hash32/);

console.log("IncidentQuorum contract checks passed.");
