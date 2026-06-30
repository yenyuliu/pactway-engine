# Pactway Certification

Certification protects the public meaning of Pactway trust claims. The open
protocol may be implemented freely; official marks are earned.

This document is project policy, not legal advice.

## Certification levels

### Protocol Compatible

Meaning:

- The implementation passes a named public conformance profile.
- The claim is about technical protocol behavior only.
- The claim does not imply business verification, production security review, or
  official endorsement.

Allowed language:

```text
Passes the Pactway Core conformance profile.
```

Restricted language unless approved:

```text
Pactway Certified
Pactway Verified
Official Pactway Gateway
```

### Gateway Certified

Meaning:

- The gateway passes required conformance profiles.
- The gateway correctly validates delegated authority, token confirmation,
  replay/expiry/audience rules, and gateway-signed receipts for its claimed
  profiles.
- The gateway does not let client agents mint business confirmations.
- The gateway has reviewed key-management, logging, incident, and revocation
  procedures appropriate for its deployment class.

This is the appropriate mark for agent platforms, business gateways, SDK-backed
service providers, and enterprise deployments.

### Business Verified

Meaning:

- The business identity or ownership has been verified through an approved
  method.
- The attestation records `verifiedBy`, `method`, and verification timing.
- The status can become stale or be revoked.
- Verification does not imply paid placement, ranking advantage, or backend
  guarantee beyond the stated attestation.

This is the appropriate mark for business profiles and service catalogs.

## What certification is not

Certification is not:

- A guarantee that a business will perform the service.
- A warranty that a backend system will remain available.
- A ranking or advertising product.
- Permission to bypass user consent.
- Permission to store raw identity documents, payment credentials, or
  cross-business PII in the open engine.
- A replacement for legal, compliance, privacy, or security review.

## Process

1. Select the target profile in `CONFORMANCE.md`.
2. Run the public conformance suite and publish the report.
3. Submit implementation metadata:
   - software name and version
   - operator name
   - deployment class
   - supported profiles
   - signing key discovery URL, when applicable
   - incident and revocation contact
4. Complete any profile-specific operational review.
5. Receive written approval before using reserved certification marks.

## Renewal and drift

Certification can expire or become stale. A material change may require
re-certification, including:

- changing signer/verifier code
- changing key custody or rotation procedures
- changing replay-store behavior
- changing business verification methods
- changing backend-confirmation semantics
- failing current conformance tests

## Revocation

Certification may be revoked for:

- failing conformance
- misleading certification claims
- allowing agents to forge confirmations
- bypassing consent or proof-of-possession requirements
- material security incidents without reasonable remediation
- using certification to imply paid placement or endorsement

## Business model boundary

Pactway may charge for hosted gateways, verification operations, certification
review, audit retention, enterprise support, or managed key/replay
infrastructure.

Payment must not buy verified status without proof, certification without
conformance, or biased routing placement.
