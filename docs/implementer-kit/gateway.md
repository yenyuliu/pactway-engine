# Gateway Role

The gateway owns verification, standardization, policy gates, allowed actions,
proof routing, and receipts. It fronts existing business systems and never
becomes their system of record.

## Responsibilities

- Ingest external authority evidence and normalize it into gateway checks.
- Enforce exact consent before state-changing execution.
- Derive allowed actions from authority, readiness, capability, and lifecycle
  state.
- Strip or reject adapter, model, plugin, or business endpoint self-asserted
  trust fields.
- Route to the existing backend, lead channel, business port endpoint, or honest
  fallback.
- Produce receipts that bind upstream authority/consent evidence to downstream
  outcome.

## Forbidden behavior

- Do not mint production user, payment, or wallet authority.
- Do not become the business booking/POS/ledger system.
- Do not report `confirmed`, `cancelled`, `rescheduled`, or `paid` unless the
  backend or rail really supports it.
- Do not let conformance reports imply AgentPort certification or real-business
  verification.

## Required inputs and outputs

Inputs:

- discovery and business-feed artifacts;
- authority/consent evidence;
- readiness and capability data;
- backend or lead-channel result;
- redaction manifest.

Outputs:

- allowed actions;
- terminal outcome or honest fallback;
- action or delivery receipt;
- gateway compliance report.

## Minimum proof

Current path:

```bash
agentport conformance gateway --input examples/protocol-v0.2
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures
node dist/cli/index.js gateway-protocol-check --input examples/gateway-protocol-proof-pack
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile gateway
```

In the v0.2 protocol report, check the `gateway-runtime-v0.2` role profile. Its
allowed claim is `Passes AgentPort Gateway conformance v0.2`.

## Allowed claim

`Passes AgentPort Gateway Protocol conformance` for the existing gateway proof
pack. `Passes AgentPort Gateway conformance v0.2` only when the
`gateway-runtime-v0.2` profile reports `ok: true`.

Do not claim AgentPort Certified, AgentPort Verified business, payment authority,
or real-business proof from the open protocol check alone.
