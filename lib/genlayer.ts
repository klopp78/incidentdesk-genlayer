import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionHashVariant, TransactionStatus } from "genlayer-js/types";

export const INCIDENT_QUORUM_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_INCIDENT_QUORUM_CONTRACT_ADDRESS ??
    "0xEEBC4594F0c7D6aa64D84Bac8C729B96219938a2") as `0x${string}`;

export const INCIDENT_QUORUM_EXPLORER =
  `https://explorer-studio.genlayer.com/address/${INCIDENT_QUORUM_CONTRACT_ADDRESS}`;

export type WalletAddress = `0x${string}`;

export type IncidentInput = {
  walletAddress: WalletAddress;
  serviceName: string;
  serviceUrl: string;
  windowStartUtc: string;
  windowEndUtc: string;
  sourceUrls: string[];
  contractAddress?: `0x${string}`;
};

export type AssessmentPhase =
  | "wallet"
  | "submitted"
  | "consensus"
  | "finalized"
  | "readback";

export type AssessmentProgress = {
  phase: AssessmentPhase;
  message: string;
  hash?: string;
  attempt?: number;
  maxAttempts?: number;
};

export type AssessmentOptions = {
  onProgress?: (progress: AssessmentProgress) => void;
  readbackAttempts?: number;
  readbackIntervalMs?: number;
};

function createReadClient(walletAddress?: WalletAddress) {
  return createClient({ chain: studionet, account: walletAddress });
}

function createWriteClient(walletAddress: WalletAddress) {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!provider) throw new Error("No browser wallet detected.");
  return createClient({ chain: studionet, account: walletAddress, provider });
}

function address(override?: `0x${string}`) {
  return override ?? INCIDENT_QUORUM_CONTRACT_ADDRESS;
}

export async function assessIncident(input: IncidentInput, options: AssessmentOptions = {}) {
  const client = createWriteClient(input.walletAddress);
  const contractAddress = address(input.contractAddress);
  options.onProgress?.({ phase: "wallet", message: "Confirm the transaction in your wallet." });
  const hash = await client.writeContract({
    address: contractAddress,
    functionName: "assess_incident",
    args: [input.serviceName, input.serviceUrl, input.windowStartUtc, input.windowEndUtc, input.sourceUrls],
    value: BigInt(0),
    leaderOnly: false,
  });
  options.onProgress?.({
    phase: "submitted",
    hash,
    message: "Transaction submitted. Waiting for validator consensus.",
  });
  options.onProgress?.({
    phase: "consensus",
    hash,
    message: "Validators are assessing the incident evidence.",
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    fullTransaction: false,
  });
  assertSuccessfulExecution(receipt);
  options.onProgress?.({
    phase: "finalized",
    hash,
    message: "Transaction finalized and GenVM execution succeeded.",
  });
  const receiptId = idFromReceipt(receipt);
  const record = await pollIncidentReceipt(receiptId, contractAddress, {
    attempts: options.readbackAttempts,
    intervalMs: options.readbackIntervalMs,
    onAttempt: (attempt, maxAttempts) => options.onProgress?.({
      phase: "readback",
      hash,
      attempt,
      maxAttempts,
      message: `Reading on-chain receipt ${attempt}/${maxAttempts}.`,
    }),
  });
  return { hash, receipt, receiptId, record };
}

export async function readIncidentReceipt(
  receiptId: string,
  contractAddress: `0x${string}` = INCIDENT_QUORUM_CONTRACT_ADDRESS,
) {
  const client = createReadClient();
  const result = await client.readContract({
    address: contractAddress,
    functionName: "get_receipt",
    args: [receiptId],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  return normalizeIncidentRecord(result, receiptId);
}

export async function pollIncidentReceipt(
  receiptId: string,
  contractAddress: `0x${string}` = INCIDENT_QUORUM_CONTRACT_ADDRESS,
  options: {
    attempts?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, maxAttempts: number) => void;
  } = {},
) {
  const attempts = Math.max(1, options.attempts ?? 20);
  const intervalMs = Math.max(250, options.intervalMs ?? 2_500);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    options.onAttempt?.(attempt, attempts);
    try {
      return await readIncidentReceipt(receiptId, contractAddress);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(intervalMs);
    }
  }

  throw new Error(
    `Transaction finalized, but receipt ${receiptId} was not readable after ${attempts} attempts: ${compactError(lastError)}`,
  );
}

export async function readReceiptCount(
  contractAddress: `0x${string}` = INCIDENT_QUORUM_CONTRACT_ADDRESS,
) {
  const client = createReadClient();
  return client.readContract({
    address: contractAddress,
    functionName: "get_receipt_count",
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
}

export async function readLatestReceiptId(
  contractAddress: `0x${string}` = INCIDENT_QUORUM_CONTRACT_ADDRESS,
) {
  const client = createReadClient();
  return client.readContract({
    address: contractAddress,
    functionName: "get_latest_receipt_id",
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
}

export function compactError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["shortMessage", "message", "reason", "details", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {}
  return "Unknown GenLayer transaction error.";
}

function idFromReceipt(receipt: unknown): string {
  const id = collectStrings(receipt)
    .map((value) => value.match(/inq_[a-f0-9]{20}/)?.[0])
    .find((value): value is string => Boolean(value));
  if (!id) throw new Error("Accepted incident transaction did not return its inq_* receipt ID.");
  return id;
}

function assertSuccessfulExecution(receipt: unknown) {
  const transaction = receipt as { txExecutionResultName?: ExecutionResult };
  if (transaction.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN) return;
  if (transaction.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error("Transaction finalized, but GenVM execution failed. No incident receipt was written.");
  }
  throw new Error(
    `Transaction finalized without a successful GenVM execution result (${transaction.txExecutionResultName ?? "NOT_VOTED"}).`,
  );
}

function normalizeIncidentRecord(value: unknown, expectedReceiptId: string): string {
  const text = typeof value === "string" ? value.trim() : JSON.stringify(value);
  if (!text || text === '""' || text === "null" || text === "undefined") {
    throw new Error(`Receipt ${expectedReceiptId} is not available on-chain yet.`);
  }

  let record: unknown;
  try {
    record = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error(`Receipt ${expectedReceiptId} returned malformed contract data.`);
  }
  if (!record || typeof record !== "object") {
    throw new Error(`Receipt ${expectedReceiptId} returned an invalid record.`);
  }
  const actualReceiptId = (record as Record<string, unknown>).receipt_id;
  if (actualReceiptId !== expectedReceiptId) {
    throw new Error(`Receipt readback mismatch: expected ${expectedReceiptId}, received ${String(actualReceiptId)}.`);
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
