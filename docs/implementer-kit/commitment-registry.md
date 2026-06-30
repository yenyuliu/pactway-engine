# Commitment Registry Role

The commitment registry owns durable lifecycle state and event history for
AgentPort commitments where the registry role is used. It is not the business
booking/POS ledger and it is not model memory.

## Responsibilities

- Store commitment lifecycle records and event history.
- Enforce idempotency, recovery metadata, and terminal-state rules.
- Return current or terminal lifecycle state to the gateway.
- Preserve receipt refs and audit refs needed for recovery.
- Keep lifecycle reads independent of frontier chat history.

## Forbidden behavior

- Do not claim business backend ledger ownership.
- Do not mint user/payment authority.
- Do not derive owner-approved facts, readiness tiers, or AgentPort verification.
- Do not expose private payloads to the frontier model.
- Do not let local plugin wallet summaries override registry lifecycle state.

## Required inputs and outputs

Inputs:

- commitment creation/update event;
- actor refs;
- receipt refs;
- idempotency key;
- terminal-state transition request.

Outputs:

- current lifecycle state;
- terminal event history;
- recovery metadata;
- registry compliance report when the profile exists.

## Minimum proof

Current path:

```bash
agentport conformance registry --input examples/protocol-v0.2
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile registry
node dist/cli/index.js registry-check --input examples/commitment-registry-proof-pack
```

In the v0.2 protocol report, check the `registry-lifecycle-v0.2` role profile.
Its allowed claim is `Passes AgentPort Commitment Registry conformance v0.2`.

The proof must show durable lifecycle truth, terminal-state handling,
idempotency, recovery reads, and no dependency on frontier-model memory.

## Allowed claim

`Passes AgentPort Commitment Registry conformance v0.2` only when the
`registry-lifecycle-v0.2` profile reports `ok: true`.

Do not claim business backend ownership, AgentPort verification, gateway
compliance, or real-business proof.
