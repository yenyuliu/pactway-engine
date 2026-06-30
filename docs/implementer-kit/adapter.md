# Adapter Role

The adapter normalizes an existing business backend into AgentPort's capability
and execution shape. It cannot self-assert trust.

## Responsibilities

- List or map backend services when supported.
- Report backend capabilities honestly.
- Execute availability, booking, cancellation, reschedule, or handoff calls only
  when configured and supported.
- Return backend refs and error reasons without claiming AgentPort verification.
- Degrade capability when credentials, location mapping, or backend support is
  missing.

## Forbidden behavior

- Do not self-assert verification, readiness tier, binding ID, allowed actions,
  receipts, paid rank, or AgentPort certification.
- Do not return `confirmed` without a real confirm-capable backend result.
- Do not hide backend errors behind success.
- Do not embed credentials in tenant stores, public artifacts, or tool results.

## Required inputs and outputs

Inputs:

- adapter configuration;
- service mapping;
- capability flags;
- backend call args;
- credential reference where hosted configuration allows it.

Outputs:

- normalized service/capability data;
- backend result or structured failure;
- backend refs for receipt binding.

## Minimum proof

Current path:

```bash
agentport conformance adapter --input examples/protocol-v0.2
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile adapter
```

Also use the existing fixture/manual/Square adapter tests plus gateway checks
that ignore or reject self-asserted adapter trust.

In the v0.2 protocol report, check the `adapter-capability-honesty-v0.2` role
profile. Its allowed claim is `Passes AgentPort Adapter Capability Honesty
conformance v0.2`.

The adapter proof must include mutation cases for adapter-supplied `verified`,
`tag`, `bindingId`, allowed action, and receipt fields.

## Allowed claim

`Passes AgentPort Adapter Capability Honesty conformance v0.2` only when the
`adapter-capability-honesty-v0.2` profile reports `ok: true`.

Do not claim AgentPort verification, gateway compliance, or real-business proof
from adapter conformance alone.
