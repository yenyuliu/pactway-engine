# Business Port Endpoint Role

The business port endpoint is the business-facing receive and forward path for
standardized ticket, proof, and action requests. It is not the business system of
record.

## Responsibilities

- Accept standardized gateway or plugin requests.
- Preserve gateway request refs, outcome refs, actor separation, and receipt
  references.
- Forward to the configured gateway or existing business backend only when the
  endpoint is explicitly configured to bridge that backend.
- Return accepted, rejected, handoff, or forwarded outcomes without upgrading
  state.

## Forbidden behavior

- Do not become the booking, POS, ledger, CRM, or fulfillment system.
- Do not self-assert AgentPort verification, readiness tier, paid rank, allowed
  actions, or receipts.
- Do not turn proof routing into backend mutation.
- Do not overwrite gateway reason codes or backend outcome refs.

## Required inputs and outputs

Inputs:

- standardized proof or action request;
- gateway request refs;
- destination and actor metadata;
- backend bridge configuration if mutation is allowed.

Outputs:

- accepted, rejected, handoff, or forwarded result;
- preserved gateway outcome refs;
- delivery or forwarding receipt refs when available.

## Minimum proof

Current path:

```bash
agentport conformance business-port --input examples/protocol-v0.2
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile businessPort
node dist/cli/index.js business-port-check --input examples/business-port-proof-pack
```

In the v0.2 protocol report, check the `business-port-forwarding-v0.2` role
profile. Its allowed claim is `Passes AgentPort Business Port conformance v0.2`.

The proof must show that the endpoint preserves gateway truth and does not
become the backend ledger.

## Allowed claim

`Passes AgentPort Business Port conformance v0.2` only when the
`business-port-forwarding-v0.2` profile reports `ok: true`.

Do not claim backend confirmation, AgentPort verification, or system-of-record
ownership unless the existing business backend actually produced that outcome.
