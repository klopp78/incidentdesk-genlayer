import assert from "node:assert/strict";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";

const address = process.env.INCIDENT_QUORUM_CONTRACT_ADDRESS
  ?? "0xEEBC4594F0c7D6aa64D84Bac8C729B96219938a2";
const client = createClient({ chain: studionet });
const readOptions = { transactionHashVariant: TransactionHashVariant.LATEST_FINAL };

const receiptId = String(await client.readContract({
  address,
  functionName: "get_latest_receipt_id",
  args: [],
  ...readOptions,
}));
assert.match(receiptId, /^inq_[a-f0-9]{20}$/);

const rawRecord = String(await client.readContract({
  address,
  functionName: "get_receipt",
  args: [receiptId],
  ...readOptions,
}));
const record = JSON.parse(rawRecord);

assert.equal(record.receipt_id, receiptId);
assert.equal(record.schema_version, "incidentquorum.v1");
assert.equal(record.accepted_write.receipt_id, receiptId);
assert.match(record.accepted_write.record_hash, /^[a-f0-9]{64}$/);
assert.ok(Number(record.sequence) >= 1);

console.log(JSON.stringify({
  contract: address,
  receiptId,
  sequence: record.sequence,
  decision: record.decision,
  recordHash: record.accepted_write.record_hash,
  verifiedFrom: TransactionHashVariant.LATEST_FINAL,
}, null, 2));
