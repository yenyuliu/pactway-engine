# AgentPort Protocol Compact

Use this when an agent needs the protocol in working memory. The longer
blueprint and code registry are reference material.

## Core Rule

Client agents request. Users approve. Gateways execute against the business's
existing backend and sign the outcome.

AgentPort never owns the business system of record and never lets an agent
fabricate business truth, user authority, capability, consent, or confirmation.

## Four Contracts

| Contract | Job |
|---|---|
| Runtime | Agents call tools and read the action model |
| Authority Evidence Checkpoint | Proves bounded user-approved agent authority |
| Action Receipt | Signs the gateway-produced outcome |
| Verification and Marks | Separates verified businesses, compatible implementations, and certified gateways |

## Gate Order

State-changing actions pass gates in this order:

1. Auth scope.
2. Action layer.
3. Authority evidence normalization (`AuthorityContext`).
4. Token confirmation when the authority profile requires sender binding.
5. Replay, audience, and expiry.
6. Explicit consent.
7. Capability honesty.
8. Adapter execution or honest fallback.
9. Gateway receipt.
10. Audit trace.

Gate failure means `rejected`. Backend or delivery failure means `failed`.
Weak capability means `handoff` or `request`, never fake success.

## Compact Codes

Use codes and references, not prose or copied records. In portable compact
envelopes, `result.reason` is limited to the shared common-code registry.

```json
{
  "action": "book_service",
  "actionLayer": "commit",
  "result": { "type": "confirmed", "reason": null },
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
    "signature": "..."
  }
}
```

Core code families:

- `verification.status`: `verified`, `stale`, `unverified`
- `tag.tier`: `inform`, `handoff`, `request`, `confirm`
- `actionLayer`: `read`, `availability`, `lead`, `commit`, `manage`, `funds`
- `result.type`: `answered`, `available`, `unsupported`, `request`,
  `handoff`, `confirmed`, `cancelled`, `rescheduled`, `rejected`, `failed`,
  `no_verified_info`
- `result.reason`: common reason code from `docs/protocol-codes.md`, or `null`
- presentation-run artifacts: operator step, artifact, action, gate, run issue,
  evidence issue, and evidence boundary codes from the same registry
- Business Co-Pilot packets: state, retention, requirement, artifact, and
  readiness-gap codes from the same registry

## Non-Negotiables

- `verified` is true only when `verification.status === "verified"`.
- Capability tier is derived from bindings and adapter capabilities.
- Adapters cannot self-assert `verified`, `tag`, `bindingId`, or receipts.
- `AuthorityContext` carries authority result and evidence refs; the local
  `DelegationProof` path is only one profile.
- `userConsent: true` is immediate per-action approval, not proof by itself.
- No `confirmed` result without a confirm-capable backend.
- Receipts attest normalized gateway outcomes; they do not invent backend
  confirmations.
- Store IDs, hashes, and minimal facts. Do not retain raw proof tokens,
  token-confirmation tokens, chat transcripts, agent reasoning traces, raw
  adapter payloads, or broad cross-business user memory by default.
- `retention.code: "refs_only"` means a packet carries compact refs and status,
  not copied artifact bodies, transcripts, credentials, proof tokens, or model
  reasoning.

## Reference Docs

- Full blueprint: `docs/protocol-blueprint.md`
- Code registry: `docs/protocol-codes.md`
- Conformance checklist: `docs/protocol-conformance-v0.1.md`
- External implementer quickstart: `docs/external-implementer-quickstart.md`
- Adoption roadmap: `docs/protocol-adoption-roadmap.md`
- Authority evidence profiles: `docs/authority-evidence-profiles-plan.md`
- Local delegation profile details: `docs/delegation-proof-spec.md`
