# Plugin Role

The plugin owns frontier-side durable action memory: ticket refs, session
restore, pending actions, receipt refs, and approval handoff. It is not the
lifecycle source of truth.

## Responsibilities

- Store durable ticket and commitment references.
- Restore ticket context across sessions.
- Reverify current state through the gateway or registry before presenting it as
  current.
- Preserve receipt references without storing private receipt bodies.
- Gate replayed pending actions behind fresh consent.
- Route standardized requests to business port endpoints or gateway paths.

## Forbidden behavior

- Do not claim registry, gateway, lifecycle, certification, or real-business
  authority.
- Do not mint production user authority.
- Do not treat local wallet state as current lifecycle truth.
- Do not store raw secrets, customer PII, backend credentials, or private
  authority payloads in model-visible summaries.

## Required inputs and outputs

Inputs:

- ticket-save proof;
- returned-session restore proof;
- gateway reverify proof;
- pending-action replay proof;
- receipt-retention proof;
- redaction manifest.

Outputs:

- model-safe current or last-known status;
- receipt refs;
- fresh-consent requirement for replay;
- plugin-wallet compliance report.

## Minimum proof

Current path:

```bash
agentport conformance plugin --input examples/protocol-v0.2
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures
node dist/cli/index.js plugin-wallet-check --input examples/plugin-wallet-proof-pack
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile plugin-wallet
```

In the v0.2 protocol report, check the `plugin-wallet-v0.2` role profile. Its
allowed claim is `Passes AgentPort Plugin Wallet conformance v0.2`.

## Allowed claim

`Passes AgentPort Plugin Wallet protocol check` for the existing plugin wallet
proof pack. `Passes AgentPort Plugin Wallet conformance v0.2` only when the
`plugin-wallet-v0.2` profile reports `ok: true`.

Do not claim gateway compliance, registry compliance, AgentPort certification,
or real-business proof.
