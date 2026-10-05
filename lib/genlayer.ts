import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

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

export async function assessIncident(input: IncidentInput) {
  const client = createWriteClient(input.walletAddress);
  const contractAddress = address(input.contractAddress);
  const hash = await client.writeContract({
    address: contractAddress,
    functionName: "assess_incident",
    args: [input.serviceName, input.serviceUrl, input.windowStartUtc, input.windowEndUtc, input.sourceUrls],
    value: BigInt(0),
    leaderOnly: false,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const receiptId = idFromReceipt(receipt);
  const readback = await tryReadback(() => readIncidentReceipt(receiptId, contractAddress));
  return { hash, receipt, receiptId, record: readback.data, readbackWarning: readback.warning };
}

export async function readIncidentReceipt(
  receiptId: string,
  contractAddress: `0x${string}` = INCIDENT_QUORUM_CONTRACT_ADDRESS,
) {
  const client = createReadClient();
  return client.readContract({
    address: contractAddress,
    functionName: "get_receipt",
    args: [receiptId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
}

export async function readReceiptCount(
  contractAddress: `0x${string}` = INCIDENT_QUORUM_CONTRACT_ADDRESS,
) {
  const client = createReadClient();
  return client.readContract({
    address: contractAddress,
    functionName: "get_receipt_count",
    args: [],
    jsonSafeReturn: true,
    leaderOnly: true,
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
    jsonSafeReturn: true,
    leaderOnly: true,
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

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}

async function tryReadback<T>(read: () => Promise<T>): Promise<{ data: T | null; warning?: string }> {
  try {
    return { data: await read() };
  } catch (error) {
    return { data: null, warning: `The write was accepted, but immediate readback is still settling: ${compactError(error)}` };
  }
}
