# AgentPort Protocol Codes

For agent working memory, load `docs/protocol-compact.md` first. This document
is the longer code registry.

This document defines compact code families for AgentPort protocol payloads.
Payloads should prefer stable codes, references, and hashes over repeated prose
or copied records.

The machine-readable code artifact is:

```text
artifacts/agentport-protocol-codes.v0.1.json
```

Human-facing text belongs in documentation, client UI, logs, or optional
diagnostic fields. The machine contract should stay concise.

Presentation-run artifacts also use this registry for operator step, artifact,
action, gate, run issue, evidence issue, and evidence boundary codes. The
standalone JSON schemas keep explicit enums, and conformance checks those enums
against the registry so agents can rely on stable codes instead of long prose.
Business Co-Pilot packets use the same rule for state, retention, requirement,
artifact, and readiness-gap codes.

## Wire Shape Rule

Use this order of preference:

1. Stable code.
2. Stable reference ID.
3. Canonical hash.
4. Minimal scalar fact needed for the current action.
5. Optional diagnostic text for local/dev only.

Avoid embedding:

- full business records when `businessId` and `serviceId` are enough
- raw `DelegationProof` tokens in receipts or audit rows
- raw DPoP/session/wallet tokens
- full chat transcripts or agent reasoning traces
- customer profiles beyond fields needed for the current action
- adapter-native payloads unless explicitly requested by a provider boundary

## Core Codes

### `verification.status`

| Code | Meaning |
|---|---|
| `verified` | Ownership/freshness policy currently supports the verified signal |
| `stale` | Previously verified or known record is no longer fresh enough |
| `unverified` | Verification has not been earned |

### `tag.tier`

| Code | Meaning |
|---|---|
| `inform` | Verified information only |
| `handoff` | Direct the user to the business channel |
| `request` | Capture and deliver a request or lead |
| `confirm` | Addressed backend can actually confirm the action |

### `actionLayer`

| Code | Meaning |
|---|---|
| `read` | Read verified records, no state change |
| `availability` | Check availability, no commitment |
| `lead` | Request or handoff path, lower-risk state change |
| `commit` | Confirming a booking or equivalent backend commitment |
| `manage` | Cancel, reschedule, or change an existing confirmed action |
| `funds` | Future payment or money movement layer |

### `authorityAssurance`

| Code | Meaning |
|---|---|
| `none` | No usable authority evidence was accepted |
| `signed` | Sender/user authority is signed or locally verified, enough for request-tier policy |
| `verified-mandate` | Strong mandate-style authority may satisfy confirm/funds policy when capability also allows it |

### `authorityEvidenceKind`

| Code | Meaning |
|---|---|
| `agentport-local-delegation` | AgentPort Local Profile evidence, backed by local `DelegationProof` compatibility |
| `ap2-mandate` | AP2-style mandate evidence, verified by an injected profile implementation |
| `ucp-http-signature` | UCP/RFC 9421-style HTTP message signature evidence |
| `acp-checkout` | ACP checkout/payment authority evidence handled by a provider profile |

### `commitmentStatus`

Portable ticket/reservation objects use `agentport://commitment-format` and
`schemas/agentport-commitment.schema.json`.

| Code | Meaning |
|---|---|
| `active` | Backend-backed commitment is currently usable |
| `cancelled` | Backend or gateway reports cancellation |
| `rescheduled` | Backend or gateway reports a new slot/time |
| `expired` | Commitment is no longer usable after its validity window |
| `released` | Holder rights were released or transferred according to policy |
| `failed` | Commitment creation or lifecycle update failed |

### `commitmentRight`

| Code | Meaning |
|---|---|
| `verify` | Verify the ticket/reservation with the business gateway |
| `cancel` | Attempt cancellation through the supported backend path |
| `reschedule` | Attempt reschedule through the supported backend path |
| `transfer` | Transfer holder rights only when backend and policy support it |

### `result.type`

| Code | Meaning |
|---|---|
| `answered` | Grounded answer returned from verified records |
| `available` | Availability is supported and returned |
| `unsupported` | Availability/action is honestly unsupported |
| `request` | Request captured and accepted for delivery |
| `handoff` | User must continue through the business channel |
| `confirmed` | Backend confirmed the action |
| `cancelled` | Backend cancelled the action |
| `rescheduled` | Backend rescheduled the action |
| `rejected` | Policy rejected before backend success |
| `failed` | Backend, delivery, or infrastructure execution failed |
| `no_verified_info` | No verified record supports the requested answer/action |

Use the existing tool-specific result shape where already defined. New protocol
profiles should converge on `result: { type, reason? }` for compact envelopes.

## Common Reason Codes

Common reasons are stable machine codes. They are not prose.
The compact envelope schema restricts `result.reason` to the common registry
below. Provider-specific detail should be carried by a provider boundary or a
profile-specific extension, not by turning portable `reason` into free-form text.

### Lookup and grounding

| Code | Meaning |
|---|---|
| `tenant_not_found` | Business ID does not resolve |
| `tenant_or_service_not_found` | Business, service, or addressed binding does not resolve |
| `no_verified_info` | No verified source supports the requested fact or action |
| `ambiguous_verified_match` | Multiple verified matches exist and the agent must disambiguate |

### Consent and escalation

| Code | Meaning |
|---|---|
| `consent_required` | Explicit per-action consent was missing |
| `requested_type_escalated` | Lower-risk request attempted to become a higher-risk outcome |

### Capability and adapter integrity

| Code | Meaning |
|---|---|
| `capability_exceeded` | Requested outcome exceeds the addressed capability tier |
| `adapter_capability_violation` | Adapter returned an outcome it is not allowed to produce |
| `unsupported_capability` | Adapter or binding does not support the requested action |
| `backend_no_availability_api` | Backend path cannot check availability |
| `no_integration` | No backend integration is configured for this action |

### Backend and delivery

| Code | Meaning |
|---|---|
| `backend_error` | Availability backend threw or failed |
| `adapter_error` | State-changing adapter execution threw or failed |
| `lead_delivery_error` | Request/lead result could not be delivered |
| `slot_unavailable` | Requested slot is unavailable |
| `confirmation_not_found` | Existing backend confirmation ID was not found |
| `owner_request` | Request was accepted for owner follow-up |

### Delegation

| Code | Meaning |
|---|---|
| `delegation_required` | Runtime policy requires delegated authority |
| `delegation_invalid` | Proof is malformed or missing required fields |
| `delegation_scope_missing` | Proof lacks the required engine scope |
| `delegation_action_not_approved` | Proof does not approve this tool/action |
| `delegation_business_mismatch` | Proof is bound to a different business |
| `delegation_service_mismatch` | Proof is bound to a different service |
| `delegation_action_intent_mismatch` | Proof action intent hash does not match the requested action |
| `delegation_audience_mismatch` | Proof audience does not match this runtime/gateway |
| `delegation_untrusted_issuer` | Issuer is not trusted by runtime policy |
| `delegation_expired` | Proof is expired |
| `delegation_replay_protection_required` | Runtime requires a nonce/challenge but proof lacks one |
| `delegation_replay_detected` | Nonce/challenge was already consumed |
| `delegation_verification_failed` | Configured verifier rejected the proof |
| `delegation_revoked` | Proof or consent was revoked |
| `delegation_assurance_too_low` | Proof assurance is below layer policy |
| `delegation_token_confirmation_required` | Layer policy requires sender constraint |
| `delegation_token_confirmation_method_unsupported` | Sender-constraint method is not allowed |
| `delegation_token_confirmation_invalid` | Sender-constraint proof failed validation |

### Provider-specific reasons

Provider-specific reasons should not become common codes unless they generalize
across adapters. Prefer a clear prefix inside provider-specific artifacts or
tool-specific result shapes, for example:

```text
square_missing_confirmation_id
missing_square_credentials_or_location
```

The common handling rule remains the same: agents report the code exactly and do
not upgrade the outcome.

## Business Co-Pilot Codes

### `businessCopilot.state`

| Code | Meaning |
|---|---|
| `draft_required` | The run is waiting for the real draft-from-URL step |
| `owner_proof_required` | The run is waiting for ownership challenge/proof/verification work |
| `preflight_pending` | The run is ready to validate artifacts before side effects |
| `live_arc_pending` | The run is ready for publish, MCP assist, and evidence creation |
| `evidence_validation_pending` | Evidence exists or is expected but has not completed validation |
| `published` | Evidence is complete and validates for the run packet |
| `blocked` | The run has no safe next operator step |

### `businessCopilot.retention`

| Code | Meaning |
|---|---|
| `refs_only` | Packet carries compact references and status only; do not embed artifact bodies, transcripts, credentials, proof tokens, raw evidence, or model reasoning |

### `businessCopilot.validationIssue`

| Code | Meaning |
|---|---|
| `packet_read_failed` | The saved co-pilot packet could not be read |
| `wrong_type` | The artifact is not a Business Co-Pilot readiness packet |
| `invalid_timestamp` | A timestamp is missing or not canonical ISO |
| `missing_field` | A required compact field is absent |
| `unexpected_field` | The packet carries fields outside the compact contract |
| `invalid_code` | A state, action, requirement, issue, or tier code is not recognized |
| `invalid_artifact_ref` | An artifact ref is malformed or expanded |
| `invalid_requirement` | A requirement entry is malformed or expanded |
| `invalid_check` | A check field is absent or not boolean |

### `pilotEvidenceManifest.status`

| Code | Meaning |
|---|---|
| `blocked_copilot_evidence` | The Business Co-Pilot evidence pack is missing, invalid, or incomplete |
| `blocked_real_business_review` | The Co-Pilot evidence is ready, but the W16 real-business status gate is missing or blocked |
| `ready_for_real_pilot_review` | The Co-Pilot pack is complete and the real-business status gate is ready for operator review |

### `pilotEvidenceManifest.issue`

| Code | Meaning |
|---|---|
| `copilot_evidence_pack_invalid` | The referenced Business Co-Pilot evidence pack failed compact validation |
| `copilot_evidence_pack_incomplete` | The referenced Business Co-Pilot evidence pack is valid but still blocked |
| `presentation_evidence_ref_missing` | The Co-Pilot pack does not reference ready presentation evidence |
| `real_business_status_missing` | The manifest does not have a readable real-business evidence status artifact |
| `real_business_status_invalid` | The real-business evidence status artifact is not the expected compact status shape |
| `real_business_review_blocked` | The real-business status artifact is valid but not ready for real-pilot review |

## Compact Envelope

Use compact envelopes for new cross-tool protocol artifacts. Existing MCP tool
results may keep their current shape, but new profiles should avoid repeated
records.

```json
{
  "protocol": "agentport",
  "version": "0.1",
  "action": "book_service",
  "actionLayer": "commit",
  "result": {
    "type": "confirmed",
    "reason": null
  },
  "refs": {
    "businessId": "biz_123",
    "serviceId": "svc_456",
    "bindingId": "square#0",
    "authorityEvidenceRef": "agentport-local-delegation:del_789",
    "authorityAssurance": "signed",
    "delegationId": "del_789",
    "consentId": "consent_abc",
    "backendConfirmationId": "sq_xyz"
  },
  "receipt": {
    "receiptId": "rcpt_123",
    "payloadHash": "sha256:...",
    "keyId": "gateway-key-1",
    "signature": "..."
  }
}
```

Rules:

- Put IDs in `refs`.
- Put terminal state in `result`.
- Put signed proof of outcome in `receipt`.
- Put full records behind separate read tools, not inside every state-changing
  response.
- Keep diagnostic text out of the portable envelope unless a profile explicitly
  allows `debug`.

## Receipt Payload Compactness

The receipt payload should contain enough to bind the outcome, not enough to
reconstruct every surrounding object.

Keep:

- action
- action layer
- business/service IDs
- result type and reason
- delegation, consent, user, and agent references
- authority evidence refs and authority assurance
- token-confirmation method
- backend confirmation ID or backend source when relevant
- issued timestamp
- payload hash

Do not keep:

- raw delegation token
- raw token-confirmation token
- full customer object
- full tenant or service object
- raw adapter response body
- chat transcript

## Retention Boundary

AgentPort should not become agent memory. Default storage should be bounded to
records needed for trust, audit, delivery, and owner-visible analytics.

| Data | Default treatment |
|---|---|
| Published business record | Keep current version and necessary provenance |
| Verification attestation | Keep current status and provenance; hosted freshness may retain history |
| Authority evidence | Do not store raw token by default; keep evidence kind, reference ID, issuer, expiry, assurance, and verification outcome |
| Delegation proof token | Local Profile compatibility only; do not store raw token by default; keep `delegationId`, issuer, expiry, and verification outcome |
| Token confirmation | Do not store raw token; keep method and public reference/thumbprint when needed |
| Consent | Keep `consentId`, approved action summary/hash, timestamp, and bounded refs |
| Action receipt payload | Keep canonical payload or payload hash plus signature metadata |
| Lead/request details | Keep only fields needed for delivery, owner follow-up, and audit |
| Customer PII | Minimize, redact from logs, and avoid cross-business memory |
| Chat transcript | Do not retain by default |
| Agent reasoning trace | Do not retain by default |
| Adapter raw response | Do not retain by default; normalize and keep references |
| Analytics | Aggregate by business/action/tier/result; avoid raw cross-business user memory |

Hosted products may add retention policies, but they must preserve the same
boundary: AgentPort stores proof and outcome references, not an open-ended memory
of users.
