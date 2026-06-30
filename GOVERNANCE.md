# Governance

Pactway Engine is the open Apache-2.0 engine. It defines the adapter SDK, capability-honesty contract, MCP tool runtime, local development providers, reference adapters, and conformance suite.

## Open engine scope

Accepted contributions belong here when they:

- Implement or test the `BookingAdapter` SDK.
- Improve the MCP runtime and open tool handlers.
- Improve local-only development providers.
- Strengthen the public result model and capability-honesty guarantees.
- Strengthen Delegation Checkpoint validation, conformance tests, and examples
  without turning the engine into a production identity issuer.
- Add fixture-backed reference adapters without live credentials in CI.

## Hosted provider scope

The following capabilities are intentionally out of scope for this repo:

- Multi-tenant network coverage and discovery graph.
- Verified truth graph, freshness/drift pipelines, and production availability caches.
- Production identity, OAuth brokering, credential vaulting, payments, and audit retention.
- Production delegation issuance, revocation registries, KYC, passkey enrollment,
  wallet binding, and account recovery.
- Demand analytics and proprietary marketplace data.

Those capabilities must be implemented behind provider interfaces such as `TenantStore`, `TruthStore`, `AuthProvider`, `AuditSink`, and `AnalyticsSink`. A PR that adds them directly to the open engine will be redirected to the hosted provider layer.

## License posture

The engine is Apache-2.0. Contributions require a CLA so the open/hosted boundary remains clean and future distribution rights are explicit.

## Marks and certification

The Apache-2.0 license governs code rights. Pactway names, compatibility
claims, certification marks, and verified-business marks are governed separately.

- `TRADEMARK.md` defines allowed nominative use and reserved marks.
- `CONFORMANCE.md` defines public technical profiles.
- `CERTIFICATION.md` defines stronger official marks and revocation rules.

Certification and business verification must remain earned by public criteria and
evidence. Payment cannot buy conformance, verified status, or biased placement.
