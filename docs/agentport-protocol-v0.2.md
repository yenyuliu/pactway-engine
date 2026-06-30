# AgentPort Protocol v0.2 Freeze

Status: technical freeze for implementer validation.

This document freezes the minimum protocol surface needed for independent
frontier hosts, plugins, business port endpoints, gateways, adapters, and
commitment registries to interoperate without private coordination.

It is not the product pitch. The product remains AgentPort Ready Gateway for
service businesses. This protocol exists to keep that product honest when agents
create, restore, verify, and route real-world commitments.

The long-term platform thesis is the authority control plane in
`docs/long-term-moat-control-plane.md`. Protocol v0.2 is the portability layer
for that thesis: model memory can help restore context, but it must not become
authority, lifecycle truth, business readiness truth, or backend outcome truth.
Those claims must be independently verifiable through gateway, registry,
authority-evidence, backend, receipt, and conformance artifacts.

## Role Boundaries

| Role | Owns | Must not own |
| --- | --- | --- |
| Frontier Host | User conversation, explanation, tool selection, approval UX | Current ticket truth, business backend state, authority minting |
| AgentPort Plugin | Durable ticket refs, restored session context, pending action refs, receipt refs, approval handoff | Lifecycle source of truth, business backend state, gateway receipt signing |
| Business Port Endpoint | Business-facing receive/forward path for standardized action and proof-routing requests | Booking/POS ledger, AgentPort verification truth, paid ranking |
| Agent Gateway | Verification, standardization, policy gates, allowed actions, proof routing, receipts, actor separation | Business system of record, payment network, model memory |
| Adapter | Backend capability normalization and backend call bridge | Verification, tier, binding, receipt, or trust self-assertion |
| Commitment Registry | AgentPort commitment lifecycle state, event history, idempotency, recovery metadata | Business booking/POS ledger or frontier-session memory |
| Business Backend | Existing operational source of record: Square, Calendly, phone/email/form, POS, booking ledger | AgentPort protocol compatibility claims |

## Canonical Objects

### Commitment

`Commitment` is the portable representation of an AI-created or AI-managed
real-world obligation. It binds holder, business, backend confirmation,
authority refs, allowed actions, recovery policy, event history, and receipt
refs.

Schema: `schemas/agentport-commitment.v0.2.schema.json`.

### Action Intent

`ActionIntent` is the bounded request produced before execution. It captures the
user goal, target business/service, requested action, required inputs, consent
requirements, expiry, and approved action hash.

Schema: `schemas/agentport-action-intent.v0.2.schema.json`.

### Consent Evidence

`ConsentEvidence` records the exact approval event that permits a bounded
action. For short approvals such as `Yes`, the evidence must bind the phrase to
the shown summary: ticket, destination, action, and backend mutation scope.

Consent evidence is not authority minting. It is an execution gate input.

### Delivery Receipt

`DeliveryReceipt` records proof routing or business-port delivery. It binds the
commitment, destination, requested/customer/gateway actors, proof level,
backend-mutation flag, and result.

Schema: `schemas/agentport-delivery-receipt.v0.2.schema.json`.

### Audit Event

`AuditEvent` is append-only evidence of who did what, when, and under which
policy gate. Audit events are not user-facing proof by themselves; receipts and
registry reads are the protocol proof surfaces.

### Allowed Action

`AllowedAction` is gateway-derived. A model, plugin, business port endpoint, or
adapter cannot self-assert that an action is allowed.

### Lifecycle State

`LifecycleState` is registry-derived current or terminal status. Plugin wallet
state can cache refs and last-known summaries only; it must reverify before
presenting current status.

## Required Flows

### Wallet-First Ticket Restore

```text
Frontier Host -> AgentPort Plugin: load ticket context
AgentPort Plugin -> Agent Gateway: locate wallet tickets
Agent Gateway -> Commitment Registry: read lifecycle
Commitment Registry -> Agent Gateway: current state + events
Agent Gateway -> AgentPort Plugin: standardized ticket summary
AgentPort Plugin -> Frontier Host: model-safe current or last-known status
```

Rules:

- The frontier host must not ask for raw commitment JSON before trying wallet
  restore.
- Plugin records are refs and encrypted local context, not lifecycle authority.
- Current status requires gateway or registry verification.

### Verify Ticket

```text
Plugin -> Gateway: commitment evidence
Gateway -> Registry: lifecycle read
Gateway -> Plugin: verified / reverify_required / rejected
```

Rules:

- Ticket code alone is not authority.
- Holder mismatch fails closed.
- Stale or unavailable registry state must not be presented as current.

### Get Allowed Actions

```text
Plugin -> Gateway: commitment evidence
Gateway -> Registry: current lifecycle
Gateway -> Adapter metadata: capability bounds
Gateway -> Plugin: allowed actions + backendMutation flags
```

Rules:

- Allowed actions are derived by the gateway.
- `send_ticket` routes proof only and must report `backendMutation: false`.
- Backend-mutating actions require separate action intent and consent gates.

### Route Ticket Proof

```text
Frontier Host -> User: exact ticket + destination + backend mutation scope
User -> Frontier Host: approval
Frontier Host -> Plugin: approval event
Plugin -> Gateway: send_ticket + consent evidence
Gateway -> Business Port Endpoint: route proof
Gateway -> Registry/Audit: delivery event
Gateway -> Plugin: delivery receipt
Plugin -> Frontier Host: compact receipt
```

Rules:

- Missing or weak consent fails closed.
- For short approval, consent evidence must include the user phrase and the
  shown send summary.
- Proof routing must not mutate the business backend.
- Delivery receipt must preserve requested, customer, and gateway actor roles
  when those identities are available.

### Business Port Delivery

```text
Gateway -> Business Port Endpoint: standardized proof/action request
Business Port Endpoint -> Gateway: accepted / rejected / handoff
Business Port Endpoint -> Business Backend: only if endpoint is explicitly
  configured to bridge an existing backend
```

Rules:

- Business port is a receive/forward endpoint, not AgentPort's system of record.
- Business backend remains the operational ledger.
- Business port must preserve gateway outcome refs and must not upgrade outcome
  state.

### Closed-Session Recovery

```text
User returns
Frontier Host -> Plugin: restore session
Plugin -> Gateway: reverify refs
Gateway -> Registry: read lifecycle/event history
Gateway -> Plugin: current or last-known/reverify-required
Plugin -> Frontier Host: model-safe summary
```

Rules:

- The model cannot infer current state from prior chat.
- Pending actions require fresh consent if replayed.
- Expired approvals cannot be reused.

## Canonical Trace Contract

Trace schema: `schemas/agentport-protocol-trace.v0.2.schema.json`.

Canonical traces live under `examples/protocol-v0.2/`.

Required validation checks:

- `role_boundaries_declared`
- `canonical_objects_present`
- `wallet_restore_before_status`
- `allowed_actions_gateway_derived`
- `consent_bound_to_summary`
- `proof_routing_no_backend_mutation`
- `authority_evidence_not_model_minted`
- `adapter_cannot_self_assert_trust`
- `business_port_preserves_gateway_outcome`
- `receipt_binds_authority_and_outcome`
- `actor_roles_separated`
- `registry_lifecycle_authority`
- `business_backend_system_of_record`
- `forbidden_claims_false`

Tamper fixtures must fail a named check directly. Validators must not trust a
summary `ok` flag.

## Claim Boundary

| Claim | Allowed when | Forbidden implication |
| --- | --- | --- |
| AgentPort-compatible v0.2 | The implementation passes at least one role profile and publishes the report | AgentPort Certified or verified business |
| Passes Gateway profile v0.2 | Gateway trace and tamper matrix pass | Real-business proof |
| Passes Plugin profile v0.2 | Plugin restore, consent, and receipt-ref checks pass | Registry authority or issuer authority |
| Passes Business Port profile v0.2 | Endpoint preserves gateway request/outcome refs and system-of-record boundary | Booking/POS ownership |
| Passes Registry profile v0.2 | Registry lifecycle and event-history checks pass | Business backend ledger ownership |
| AgentPort Certified | Separate certification process | Automatic from open conformance |
| AgentPort Verified business | Ownership verification process | Automatic from protocol compatibility |

## Governance And Extensions

Governance policy:

- machine-readable: `examples/implementer-kit/protocol-governance.v0.2.json`;
- human-readable: `docs/agentport-protocol-governance-v0.2.md`.

Publication status:

- machine-readable: `examples/implementer-kit/protocol-publication.v0.2.json`;
- human-readable: `docs/agentport-open-standard-v0.2-release-notes.md`.

Extensions must be namespaced under `extensions` or `x-` fields and must not
override verification, readiness, binding, result, allowed-action, receipt,
authority, lifecycle, consent, or system-of-record fields. Official marks,
verified-business status, real-business proof, and live-backend proof require a
separate process outside open compatibility conformance.

The draft label can be removed only when the protocol cut manifest refs exist,
the publication status refs exist, every manifest command passes,
`npm run conformance` passes, `npm test` passes, `git diff --check` passes, and
claim boundaries remain preserved.

## Validation

Run:

```bash
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures
agentport conformance gateway --input examples/protocol-v0.2
agentport conformance plugin --input examples/protocol-v0.2
agentport conformance adapter --input examples/protocol-v0.2
agentport conformance business-port --input examples/protocol-v0.2
agentport conformance registry --input examples/protocol-v0.2
```

The command must emit a schema-compatible report where:

- all golden traces pass;
- all tamper traces fail for their declared check IDs;
- gateway, plugin-wallet, adapter, business-port, and registry role profiles
  report their exact allowed claim;
- `certification.agentPortCertified` is `false`;
- `certification.agentPortVerifiedBusiness` is `false`;
- `certification.realBusinessProof` is `false`.
