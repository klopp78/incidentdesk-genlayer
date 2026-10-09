"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Database, ExternalLink, Search } from "lucide-react";
import {
  INCIDENT_QUORUM_CONTRACT_ADDRESS,
  INCIDENT_QUORUM_EXPLORER,
  compactError,
  readIncidentReceipt,
  readLatestReceiptId,
  readReceiptCount,
} from "@/lib/genlayer";

export default function RecordsPage() {
  const [receiptId, setReceiptId] = useState("");
  const [record, setRecord] = useState("");
  const [count, setCount] = useState<string>("-");
  const [status, setStatus] = useState("Enter an inq_* ID or load the latest accepted receipt.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const queryId = new URLSearchParams(window.location.search).get("id");
    if (queryId) setReceiptId(queryId);
    readReceiptCount().then((value) => setCount(String(value))).catch(() => setCount("unavailable"));
  }, []);

  async function load(id: string) {
    if (!id.trim()) return;
    setBusy(true);
    setRecord("");
    setStatus("Reading the accepted record from GenLayer...");
    try {
      const result = await readIncidentReceipt(id.trim());
      setRecord(result);
      setReceiptId(id.trim());
      setStatus("Receipt read directly from the deployed contract.");
    } catch (error) {
      setStatus(compactError(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadLatest() {
    setBusy(true);
    setStatus("Locating the latest accepted receipt...");
    try {
      const latest = String(await readLatestReceiptId());
      if (!/^inq_[a-f0-9]{20}$/.test(latest)) throw new Error("The contract did not return a valid latest receipt ID.");
      setReceiptId(latest);
      await load(latest);
    } catch (error) {
      setStatus(compactError(error));
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark"><Activity size={19} /></span><span>IncidentDesk</span><small>GenLayer</small></a>
        <a className="icon-link" href="/"><ArrowLeft size={16} /> New assessment</a>
      </header>
      <section className="records-workspace">
        <div className="workspace-heading">
          <div><p className="eyebrow">INCIDENT OPERATIONS / RECEIPTS</p><h1>On-chain incident records</h1><p>Inspect accepted consensus output from IncidentQuorum. This view has no local simulation or fallback verdict.</p></div>
          <div className="count-block"><Database size={18} /><span><small>RECEIPT COUNT</small><strong>{count}</strong></span></div>
        </div>
        <section className="lookup-panel">
          <label className="field"><span>Receipt ID</span><div className="input-shell"><Search size={15} /><input value={receiptId} onChange={(event) => setReceiptId(event.target.value)} placeholder="inq_..." /></div></label>
          <div className="lookup-actions">
            <button className="primary-button" type="button" disabled={busy || !receiptId.trim()} onClick={() => load(receiptId)}><Search size={16} /> {busy ? "Reading..." : "Read receipt"}</button>
            <button className="secondary-button" type="button" disabled={busy} onClick={loadLatest}><Database size={16} /> Load latest</button>
            <a className="secondary-button" href={INCIDENT_QUORUM_EXPLORER} target="_blank" rel="noreferrer">Explorer <ExternalLink size={15} /></a>
          </div>
          <p className="lookup-status">{status}</p>
        </section>
        <section className="chain-output">
          <div className="output-heading"><span>ACCEPTED CONTRACT OUTPUT</span><code>{INCIDENT_QUORUM_CONTRACT_ADDRESS}</code></div>
          {record ? <pre>{record}</pre> : <div className="empty-output"><Database size={30} /><p>No record loaded.</p></div>}
        </section>
      </section>
    </main>
  );
}
