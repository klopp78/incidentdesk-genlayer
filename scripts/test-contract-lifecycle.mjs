import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("contracts/incident_quorum.py", "utf8");

assert.match(source, /self\.receipts/);
assert.match(source, /self\.receipt_ids/);
assert.match(source, /receipt_id\s*=\s*"inq_"/);
assert.match(source, /if decision == "confirmed"/);
assert.match(source, /evidence_count < 2/);
assert.match(source, /readable_source_count/);
assert.match(source, /source_snapshot_hashes/);
assert.match(source, /snapshot_bundle_hash/);
assert.match(source, /self\.receipt_ids\.append/);

console.log("IncidentQuorum lifecycle checks passed.");
