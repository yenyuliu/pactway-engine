# Contributing

Community adapters are welcome when they preserve the capability-honesty contract.

An adapter PR is accepted when it:

1. Implements `BookingAdapter` and does not require changes to `packages/core` or `packages/server`.
2. Returns honest `capabilities()` values.
3. Never returns `type: "confirmed"` unless `confirmBooking` is true and a real write path exists.
4. Includes fixture-based tests; CI must not require live credentials.
5. Documents required credentials, OAuth scopes, and any plan-tier gates.
6. Adds no proprietary network, verification, tenant-data, credential-vault, audit-retention, or analytics implementation.

Auth and delegation contributions are welcome when they preserve bounded proof
semantics:

1. The engine may validate a `DelegationProof`; it must not become a production
   identity issuer.
2. State-changing approvals must stay scoped by action, engine scope,
   business/service bounds when present, consent ID, and expiry.
3. Rejection reasons must remain stable and machine-readable.
4. Tests must cover negative cases such as missing proof, expired proof,
   wrong action, wrong business, and wrong service.
5. Do not store raw identity documents, bearer tokens, payment credentials, or
   cross-business PII in engine state or audit metadata.

Run the checks before opening a PR:

```bash
npm test
```
