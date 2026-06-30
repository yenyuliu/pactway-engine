# A2A Host Binding Role

Use this role when an A2A-style host wants to interoperate with AgentPort
without becoming the AgentPort gateway, registry, or certification authority.

## Responsibility

- Keep host-owned task and intent UX outside the AgentPort gateway.
- Compile action intent before any state-changing action.
- Present exact user approval before consent is carried into execution.
- Carry external authority evidence when the action requires it.
- Accept only AgentPort gateway receipts as gateway execution proof.
- Treat acknowledgements, local memory, and model summaries as non-authoritative
  for lifecycle state.

## Required Evidence

- Passing host trace:
  `examples/a2a-host-trace.passing.v0.1.json`
- Tamper traces:
  `examples/a2a-host-trace.direct-execute.v0.1.json`,
  `examples/a2a-host-trace.invented-approval.v0.1.json`,
  `examples/a2a-host-trace.missing-authority.v0.1.json`,
  `examples/a2a-host-trace.forged-receipt.v0.1.json`, and
  `examples/a2a-host-trace.ack-as-verification.v0.1.json`
- Connector captures:
  `examples/chatgpt-app-connector-capture.send-ticket.v0.1.json` and
  `examples/chatgpt-app-connector-capture.direct-execute.v0.1.json`
- Event logs:
  `examples/a2a-host-event-log.send-ticket.v0.1.json`,
  `examples/a2a-host-event-log.restore-ticket-status.v0.1.json`, and
  `examples/a2a-host-event-log.failed-direct-execute.v0.1.json`
- Proof-pack summary:
  `examples/a2a-host-proof-pack/proof-summary.json`

## Check

```bash
node scripts/a2a-gateway-check.mjs --host-trace examples/a2a-host-trace.passing.v0.1.json --strict
node scripts/a2a-host-proof-pack.mjs --input examples/a2a-host-trace.passing.v0.1.json --out-dir /tmp/a2a-host-pack --strict
```

## Claim Boundary

Allowed claim: "Passes AgentPort A2A Host Adoption compatibility check."

Forbidden claims: AgentPort Certified, AgentPort Verified business,
real-business proof, live-backend proof, A2A certification, A2A replacement,
gateway authority, registry authority, or backend confirmation authority.
