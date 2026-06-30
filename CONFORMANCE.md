# Pactway Conformance

Conformance turns the open protocol into testable behavior. It lets third-party
agents, gateways, and businesses integrate without asking for permission while
keeping official trust marks meaningful.

Start with the compact protocol, then use the v0.1 checklist for pass/fail
claims:

- `docs/protocol-compact.md`
- `docs/protocol-conformance-v0.1.md`
- `docs/protocol-codes.md`
- `docs/external-implementer-quickstart.md`
- `schemas/agentport-conformance-report.schema.json`

Run the local conformance command:

```bash
npm run conformance
```

## Principles

- Tests are public and reproducible.
- Claims name the exact profile and version passed.
- Passing conformance does not equal certification unless the certification
  process says so.
- Conformance must not require live credentials, network access, wall-clock
  dependence, or proprietary hosted data.
- Negative tests matter as much as happy paths.

## Profiles

The current v0.1 protocol checklist lives in
`docs/protocol-conformance-v0.1.md`. The sections below summarize the public
profile families and allowed claim language.

### Core

Required behavior:

- Derive `verified` from tenant verification status, not adapter payloads.
- Derive action tier from real adapter capabilities.
- Preserve binding addressability with `bindingId`.
- Return structured failure results instead of opaque internal errors.
- Never confirm when `confirmBooking` is false.
- Never cancel or reschedule when the adapter lacks the corresponding capability.

Allowed claim:

```text
Passes Pactway Core conformance.
```

### Delegation

Required behavior:

- Reject missing delegation when layer policy requires it.
- Enforce scope, exact action, business bounds, service bounds, audience, issuer,
  expiry, assurance, and consent.
- Keep rejection reasons stable and machine-readable.
- Treat default `book_service` as `commit`, not `lead`.
- Prevent lower-risk request/handoff intents from escalating to confirmed
  outcomes.

Allowed claim:

```text
Passes Pactway Delegation conformance.
```

### Token Confirmation

Required behavior:

- Support profile-declared methods such as `session`, `dpop`, `mtls`, or
  `wallet`.
- Reject unsupported methods.
- Reject malformed method-specific confirmation details.
- Bind stricter methods to stricter action layers when configured.

Future public crypto profiles should add real DPoP, mTLS, and wallet verifier
test vectors.

### Receipt

Required behavior:

- Strip adapter-supplied receipts.
- Build receipt facts inside the gateway.
- Compute `payloadHash` from the canonical payload.
- Let the signer return only issuer/signature/key metadata.
- Bind confirmed/cancelled/rescheduled outcomes to backend confirmation IDs when
  present.
- Bind failed/rejected/request/handoff outcomes to reason/source when present.

Allowed claim:

```text
Passes Pactway Receipt conformance.
```

### Gateway Certified Candidate

Required behavior:

- Pass Core, Delegation, Token Confirmation, Receipt, and compact
  payload/retention profiles.
- Publish key discovery and rotation metadata when signatures are externally
  verifiable.
- Document replay-store TTL and consume-once semantics.
- Document supported action layers and token-confirmation methods.
- Provide an incident and revocation contact.

This profile makes an implementation eligible for certification review; it does
not automatically grant certification marks.

## Reporting

A conformance report should include:

- implementation name
- implementation version
- commit or build ID
- profile name and version
- test-suite version
- date run
- passed/failed/skipped counts
- any deviations or unsupported optional features

## Claim language

Allowed factual claim:

```text
This implementation passes Pactway Receipt conformance v0.1.
```

Not allowed without certification approval:

```text
Pactway Certified
Pactway Verified
Official Pactway Gateway
```

See `TRADEMARK.md` and `CERTIFICATION.md`.
