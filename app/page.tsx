"use client";

import { useMemo, useState } from "react";
import { Activity, Clock3, ExternalLink, Link2, Plus, Search, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { INCIDENT_QUORUM_CONTRACT_ADDRESS, INCIDENT_QUORUM_EXPLORER, assessIncident, compactError } from "@/lib/genlayer";

declare global {
  interface Window {
    ethereum?: { request: (request: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

const initialSources = [
  "https://www.githubstatus.com/",
  "https://downdetector.com/status/github/",
  "https://isdown.app/status/github",
];

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [serviceName, setServiceName] = useState("GitHub");
  const [serviceUrl, setServiceUrl] = useState("https://github.com/");
  const [windowStartUtc, setWindowStartUtc] = useState("2026-10-01T00:00:00Z");
  const [windowEndUtc, setWindowEndUtc] = useState("2026-10-01T06:00:00Z");
  const [sources, setSources] = useState(initialSources);
  const [status, setStatus] = useState("Ready for an incident assessment.");
  const [receiptId, setReceiptId] = useState("");
  const [record, setRecord] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(serviceName.trim() && serviceUrl.trim() && sources.filter(Boolean).length >= 2 && !busy),
    [serviceName, serviceUrl, sources, busy],
  );

  async function connectWallet() {
    try {
      if (!window.ethereum) throw new Error("No browser wallet detected.");
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      setWallet(accounts[0] ?? "");
      setStatus(accounts[0] ? "Wallet connected." : "No wallet account returned.");
    } catch (error) {
      setStatus(compactError(error));
    }
  }

  function updateSource(index: number, value: string) {
    setSources((current) => current.map((source, itemIndex) => (itemIndex === index ? value : source)));
  }

  function addSource() {
    if (sources.length < 5) setSources((current) => [...current, ""]);
  }

  function removeSource(index: number) {
    if (sources.length > 2) setSources((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submitAssessment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setReceiptId("");
    setRecord("");
    setStatus("Waiting for wallet approval and validator consensus...");
    try {
      if (!window.ethereum) throw new Error("No browser wallet detected.");
      let activeWallet = wallet;
      if (!activeWallet) {
        const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
        activeWallet = accounts[0] ?? "";
        if (!activeWallet) throw new Error("Connect a wallet before submitting.");
        setWallet(activeWallet);
      }
      const result = await assessIncident({
        walletAddress: activeWallet as `0x${string}`,
        serviceName,
        serviceUrl,
        windowStartUtc,
        windowEndUtc,
        sourceUrls: sources.map((source) => source.trim()).filter(Boolean),
      });
      setReceiptId(result.receiptId);
      setRecord(typeof result.record === "string" ? result.record : JSON.stringify(result.record, null, 2));
      setStatus("Accepted by GenLayer consensus and read back from the contract.");
    } catch (error) {
      setStatus(compactError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="IncidentDesk home">
          <span className="brand-mark"><Activity size={19} /></span>
          <span>IncidentDesk</span>
          <small>GenLayer</small>
        </a>
        <nav className="top-actions" aria-label="Primary navigation">
          <a className="icon-link" href="/records"><Search size={16} /> Receipts</a>
          <a className="icon-button" href={INCIDENT_QUORUM_EXPLORER} target="_blank" rel="noreferrer" title="Open contract explorer"><ExternalLink size={17} /></a>
          <button className="wallet-button" type="button" onClick={connectWallet}><Wallet size={16} /> {wallet ? compactAddress(wallet) : "Connect wallet"}</button>
        </nav>
      </header>

      <section className="workspace">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">INCIDENT OPERATIONS / NEW ASSESSMENT</p>
            <h1>Verify a public service incident</h1>
            <p>Submit independent sources for consensus review and receive a durable on-chain incident receipt.</p>
          </div>
          <div className="network-status"><span /> STUDIONET</div>
        </div>

        <div className="dashboard-grid">
          <form className="form-panel" onSubmit={submitAssessment}>
            <div className="section-heading"><span className="step">01</span><div><h2>Incident scope</h2><p>Define the service and exact observation window.</p></div></div>
            <div className="two-column">
              <Field label="Service name" value={serviceName} onChange={setServiceName} placeholder="GitHub" />
              <Field label="Canonical service URL" value={serviceUrl} onChange={setServiceUrl} placeholder="https://..." icon={<Link2 size={15} />} />
              <Field label="Window start (UTC)" value={windowStartUtc} onChange={setWindowStartUtc} placeholder="YYYY-MM-DDTHH:mm:ssZ" icon={<Clock3 size={15} />} />
              <Field label="Window end (UTC)" value={windowEndUtc} onChange={setWindowEndUtc} placeholder="YYYY-MM-DDTHH:mm:ssZ" icon={<Clock3 size={15} />} />
            </div>

            <div className="section-rule" />
            <div className="section-heading"><span className="step">02</span><div><h2>Evidence sources</h2><p>Add 2 to 5 independent public URLs that validators can inspect.</p></div></div>
            <div className="source-list">
              {sources.map((source, index) => (
                <div className="source-row" key={`${index}-${sources.length}`}>
                  <span className="source-number">{String(index + 1).padStart(2, "0")}</span>
                  <input aria-label={`Evidence source ${index + 1}`} value={source} onChange={(event) => updateSource(index, event.target.value)} placeholder="https://status.example.com/" />
                  <button type="button" className="icon-button danger" title="Remove source" disabled={sources.length <= 2} onClick={() => removeSource(index)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button className="add-source" type="button" disabled={sources.length >= 5} onClick={addSource}><Plus size={16} /> Add source</button>

            <div className="submit-row">
              <p><ShieldCheck size={16} /> Calls the deployed contract with full validator consensus.</p>
              <button className="primary-button" type="submit" disabled={!canSubmit}><Activity size={17} /> {busy ? "Assessing..." : "Run assessment"}</button>
            </div>
          </form>

          <aside className="receipt-panel">
            <div className="receipt-title"><span>LIVE RECEIPT</span><Activity size={18} /></div>
            <div className={`status-block ${receiptId ? "accepted" : ""}`}>
              <span className="status-dot" />
              <div><small>STATUS</small><strong>{receiptId ? "ACCEPTED" : busy ? "IN CONSENSUS" : "READY"}</strong></div>
            </div>
            <dl className="receipt-meta">
              <div><dt>Network</dt><dd>GenLayer Studionet</dd></div>
              <div><dt>Contract</dt><dd title={INCIDENT_QUORUM_CONTRACT_ADDRESS}>{compactAddress(INCIDENT_QUORUM_CONTRACT_ADDRESS)}</dd></div>
              <div><dt>Sources</dt><dd>{sources.filter(Boolean).length}</dd></div>
              <div><dt>Receipt ID</dt><dd>{receiptId || "Pending"}</dd></div>
            </dl>
            <div className="console-message">{status}</div>
            {record ? <pre className="record-preview">{record}</pre> : (
              <div className="empty-state"><ShieldCheck size={27} /><p>Accepted evidence, decision fields, and source commitments will appear here after readback.</p></div>
            )}
            {receiptId ? <a className="inspect-link" href={`/records?id=${encodeURIComponent(receiptId)}`}><Search size={15} /> Inspect full receipt</a> : null}
          </aside>
        </div>
      </section>

      <footer className="footer-bar">
        <span>IncidentQuorum contract</span>
        <code>{INCIDENT_QUORUM_CONTRACT_ADDRESS}</code>
        <a href="https://github.com/klopp78/incidentdesk-genlayer" target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a>
      </footer>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, icon }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; icon?: React.ReactNode }) {
  return <label className="field"><span>{label}</span><div className="input-shell">{icon}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required /></div></label>;
}

function compactAddress(value: string) {
  return value.length > 13 ? `${value.slice(0, 7)}...${value.slice(-5)}` : value;
}
