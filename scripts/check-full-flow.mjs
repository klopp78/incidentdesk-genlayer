import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const client = readFileSync("lib/genlayer.ts", "utf8");
const app = readFileSync("app/page.tsx", "utf8");
const records = readFileSync("app/records/page.tsx", "utf8");

assert.match(client, /functionName:\s*"assess_incident"/);
assert.match(client, /leaderOnly:\s*false/);
assert.match(client, /TransactionStatus\.FINALIZED/);
assert.match(client, /ExecutionResult\.FINISHED_WITH_RETURN/);
assert.match(client, /TransactionHashVariant\.LATEST_FINAL/);
assert.match(client, /pollIncidentReceipt/);
assert.match(client, /readbackAttempts/);
assert.match(client, /Receipt readback mismatch/);
assert.doesNotMatch(client, /jsonSafeReturn/);
assert.match(client, /functionName:\s*"get_receipt"/);
assert.match(client, /inq_\[a-f0-9\]/);
assert.match(app, /assessIncident/);
assert.match(app, /Connect wallet/);
assert.match(app, /Evidence sources/);
assert.match(app, /GENVM SUCCEEDED/);
assert.match(app, /READING RECEIPT/);
assert.match(app, /FAILED/);
assert.match(records, /readIncidentReceipt/);
assert.match(records, /no local simulation or fallback verdict/i);
assert.doesNotMatch(`${app}\n${records}`, /mock keyword|local verdict/i);

console.log("IncidentDesk full-flow source checks passed.");
