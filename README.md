# IncidentDesk for GenLayer

IncidentDesk is an operational interface for the accepted IncidentQuorum
Intelligent Contract. Teams can submit a service, an exact UTC incident window,
and 2-5 independent public sources for GenLayer consensus assessment.

The application does not calculate a local verdict. It waits for an accepted
GenLayer transaction, extracts the returned `inq_*` receipt ID, and reads the
stored record back from the deployed contract.

## Product flow

1. Connect a browser wallet on GenLayer Studionet.
2. Define the service and incident observation window.
3. Add independent status, monitoring, or public evidence URLs.
4. Submit `assess_incident` with full validator consensus.
5. Inspect the accepted receipt, source commitments, and decision fields.

## Evidence

- Contract: `contracts/incident_quorum.py`
- Deployment: `0xEEBC4594F0c7D6aa64D84Bac8C729B96219938a2`
- Explorer: https://explorer-studio.genlayer.com/address/0xEEBC4594F0c7D6aa64D84Bac8C729B96219938a2
- Accepted contract repository: https://github.com/klopp78/incidentquorum-genlayer

## Integrity properties

- validators independently render and compare every evidence source
- source snapshot SHA-256 commitments are validator-checked
- a canonical incident context and evidence bundle are bound to each receipt
- a confirmed incident requires at least two readable supporting sources
- receipts are append-only and addressable by their returned `inq_*` ID

## Run locally

```bash
npm install
npm test
npm run dev
```

The default contract can be overridden with
`NEXT_PUBLIC_INCIDENT_QUORUM_CONTRACT_ADDRESS`.
