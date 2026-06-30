# AgentPort Open Standard v0.2 Cut Readiness

Status: cut readiness for implementer validation. Protocol behavior is frozen in
`docs/agentport-protocol-v0.2.md`; this public package remains a compatibility
cut, not certification or real-business proof.

AgentPort Open Standard v0.2 defines the minimum protocol contract for making a
service business discoverable, truthful, and safely actionable by agents while
keeping the business's existing backend as the system of record.

This cut is a compatibility standard, not a certification mark. Passing the
checks below does not make an implementation AgentPort Certified, does not make
a business AgentPort Verified, and does not prove a live real-business backend.

## Scope

AgentPort standardizes the gateway contract around real-world service actions:

```text
host/user goal
  -> action intent
  -> exact approval
  -> gateway policy and authority checks
  -> business backend or proof-routing path
  -> ActionReceipt and lifecycle state
  -> restoreable proof for later sessions
```

AgentPort does not standardize payments, checkout, rankings, ads, hosted owner
accounts, production issuer keys, OAuth brokering, credential vaulting, or A2A
itself. It fronts existing systems such as Square, Calendly, phone, email, forms,
or business-port endpoints. It never becomes the booking/POS/ledger source of
record.

## Roles

| Role | Owns | Must not own |
| --- | --- | --- |
| Frontier host | User conversation, task classification, business-port selection, approval UX | Ticket lifecycle truth, backend state, receipt proof, authority minting |
| Plugin wallet | Durable refs, session restore, pending action refs, receipt refs, approval handoff | Registry truth, gateway receipt signing, business backend state |
| Business port endpoint | Business-facing receive/forward path for standardized action or proof requests | Booking/POS ledger, backend confirmation authority, AgentPort verification truth |
| Agent gateway | Verification, standardization, gate order, allowed actions, proof routing, receipts, actor separation | Business system of record, payment network, model memory |
| Adapter | Existing-backend capability normalization and backend call bridge | Verification, tier, binding ID, receipt, or trust self-assertion |
| Commitment registry | Commitment lifecycle state, event history, idempotency, restore metadata | Business booking/POS ledger, frontier-session memory |
| A2A host binding | Mapping A2A service-task phases to AgentPort gateway primitives | A2A certification, A2A replacement, business verification |

## Required Objects

### Action Intent

A bounded request produced before state-changing execution. It binds user goal,
target business/service, requested action, required inputs, approval text,
expiry, and `approvedActionIntentHash`.

Evidence:

```bash
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack
```

### Exact Approval Package

The exact user-facing approval summary for the bounded action. `userConsent:
true` is valid only after this package is rendered and accepted. Short consent
phrases such as `yes` must bind to the shown summary.

Evidence:

```text
examples/action-intent-proof-pack/approval-package.json
examples/action-intent-proof-pack/approved-execution.json
```

### Authority Evidence Reference

An external authority reference accepted by the gateway policy. AgentPort v0.2
ingests authority evidence; it does not mint a new delegation-token standard.

Allowed evidence families include local delegation profiles and future hosted
profiles such as AP2/UCP/ACP evidence, normalized to gateway policy inputs.

### Gateway Execution Result

The gateway-derived result of a state-changing or proof-routing action. Gateway
execution must carry `intentId`, `approvedActionIntentHash`, `userConsent`, and
any required authority reference.

Evidence:

```text
examples/action-intent-proof-pack/approved-execution.json
examples/business-port-proof-pack/gateway-response.json
```

### ActionReceipt

Gateway-produced proof that binds upstream authority/approval evidence to the
gateway result and, when applicable, the backend outcome. Client, plugin,
business-port, model, or adapter-supplied receipt facts must be rejected or
replaced by gateway proof.

Evidence:

```text
examples/action-intent-proof-pack/receipt-refs.json
examples/protocol-v0.2/golden-ticket-proof-routing.json
```

### Commitment Lifecycle Event

Registry-owned state transition for a commitment. The registry owns lifecycle
state and event history, but not the business backend ledger.

Evidence:

```bash
node dist/cli/index.js registry-check --input examples/commitment-registry-proof-pack
```

### Business Port Forward

A standardized receive/forward request between a business-facing endpoint and
the gateway. The business port preserves gateway refs and outcomes; it must not
upgrade results or claim backend confirmation authority.

Evidence:

```bash
node dist/cli/index.js business-port-check --input examples/business-port-proof-pack
```

### A2A Host Adoption Report

A local compatibility report showing a frontier host or app connector routed an
A2A-style real-world service task through the AgentPort binding instead of
improvising state, approval, execution, or receipt proof.

Evidence:

```bash
node scripts/a2a-gateway-check.mjs --host-trace examples/a2a-host-trace.passing.v0.1.json --strict
```

### A2A Host Proof Pack

A portable package for host evidence:

```text
host-trace.json
adoption-report.json
redaction-manifest.json
proof-summary.json
```

Evidence:

```bash
node scripts/a2a-host-proof-pack.mjs --input examples/a2a-host-trace.passing.v0.1.json --out-dir /tmp/a2a-host-pack --strict
```

## Required Flow

The core v0.2 flow is:

```text
discover business/gateway
  -> read compact business feed or action model
  -> compile action intent
  -> collect missing inputs
  -> render exact approval package
  -> execute only with intent hash, consent, and required authority evidence
  -> receive gateway result and ActionReceipt
  -> write/read commitment lifecycle
  -> restore through plugin/gateway/registry on later sessions
```

Rules:

- Public read tools do not authorize action.
- State-changing execution requires exact approval and `userConsent: true`.
- Missing authority evidence fails closed when the gateway policy requires it.
- Allowed actions are gateway-derived, not model/plugin/adapter-derived.
- Plugin wallet memory is restore context, not lifecycle truth.
- Business-port delivery is proof routing unless explicitly configured to bridge
  an existing backend.
- Backend confirmation is true only when the existing backend confirms.
- Receipt proof is gateway-produced and bound to the result.

## A2A Host Binding

A2A remains the host/task transport. AgentPort v0.2 defines only how an A2A host
maps real-world service tasks to AgentPort primitives:

| A2A task class | AgentPort binding |
| --- | --- |
| `business.info` | `get_business_feed`, `get_business_info` |
| `action.prepare` | `compile_action_intent`, `get_action_intent_lifecycle` |
| `action.execute` | `book_service`, `cancel_service`, `reschedule_service`, `send_ticket` |
| `proof.receipt` | `ActionReceipt`, result delivery refs, commitment refs |

Forbidden shortcuts:

- direct execute without `compile_action_intent`;
- invented approval from task text or model reasoning;
- missing authority evidence for higher-assurance actions;
- client-minted receipt proof;
- treating delivery acknowledgement as receipt verification;
- treating A2A task state as business backend truth.

## Compatibility Commands

Reference validation commands:

```bash
npm run build
node dist/cli/index.js gateway-protocol-check --input examples/gateway-protocol-proof-pack
node dist/cli/index.js plugin-wallet-check --input examples/plugin-wallet-proof-pack
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack
node dist/cli/index.js business-port-check --input examples/business-port-proof-pack
node dist/cli/index.js registry-check --input examples/commitment-registry-proof-pack
node dist/cli/index.js protocol-trace-check --input examples/protocol-golden-trace-matrix.v0.1.json
node scripts/a2a-gateway-check.mjs
node scripts/a2a-gateway-check.mjs --host-trace examples/a2a-host-trace.passing.v0.1.json --strict
node scripts/a2a-host-proof-pack.mjs --input examples/a2a-host-trace.passing.v0.1.json --out-dir /tmp/a2a-host-pack --strict
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures
```

Repository gates:

```bash
npm run conformance
npm test
```

## Claim Rules

Allowed claims:

| Claim | Required evidence |
| --- | --- |
| Passes AgentPort Gateway conformance v0.2 | `scripts/protocol-v02-conformance.mjs` gateway profile passes |
| Passes AgentPort Plugin Wallet conformance v0.2 | v0.2 plugin profile and plugin wallet proof pack pass |
| Passes AgentPort Business Port conformance v0.2 | `business-port-check` passes |
| Passes AgentPort Commitment Registry conformance v0.2 | `registry-check` passes |
| Passes AgentPort Action Intent compatibility check | `action-intent-check` passes |
| Passes AgentPort A2A Gateway profile check | `scripts/a2a-gateway-check.mjs` passes |
| Passes AgentPort A2A Host Adoption compatibility check | `scripts/a2a-gateway-check.mjs --host-trace ... --strict` passes |

Forbidden claims unless a separate certification or business verification process
actually grants them:

- AgentPort Certified;
- AgentPort Gateway Certified;
- AgentPort Verified business;
- real-business proof;
- live A2A network proof;
- A2A certification;
- A2A replacement;
- backend confirmation authority for a business port;
- gateway authority for a plugin wallet;
- registry authority for a host or model;
- business backend ledger ownership by AgentPort.

## Versioning

The machine-readable governance policy for this draft is
`examples/implementer-kit/protocol-governance.v0.2.json`; the human-readable
policy is `docs/agentport-protocol-governance-v0.2.md`.

The machine-readable publication status is
`examples/implementer-kit/protocol-publication.v0.2.json`; the human-readable
release notes are `docs/agentport-open-standard-v0.2-release-notes.md`. That
status marks this package ready for external review, not stable publication.

Patch-compatible changes:

- add optional fields with explicit defaults;
- add new negative examples that fail existing rules;
- add new report metadata under existing validator/report-schema blocks;
- add new examples that do not change existing role obligations.

Minor-version changes:

- add a role profile;
- add a required check;
- add a required artifact to a proof pack;
- add a new action family or lifecycle event family;
- change allowed claim language.

Breaking changes:

- remove or rename required fields;
- weaken consent, authority, receipt, or registry requirements;
- allow a role to self-assert another role's truth;
- treat compatibility as certification;
- treat virtual-store or host-adoption evidence as real-business proof.

## Extension Rules

Extensions are valid only under the namespace and override rules in the v0.2
governance policy. In short: use an `extensions` object or `x-` metadata, use a
reverse-DNS or URI identifier for third-party extensions, and never override core
gateway, registry, receipt, consent, authority, or system-of-record fields.

Extensions may add:

- new adapter capability descriptors;
- new authority evidence profile references;
- new delivery destinations;
- new optional report metadata;
- new tamper fixtures;
- new hosted provider interfaces behind the open engine boundary.

Extensions must not:

- let adapters self-assert verification, tier, binding ID, or receipt facts;
- let business ports upgrade gateway outcomes;
- let plugins or hosts present cached memory as current lifecycle truth;
- let registries execute business backend actions;
- place raw authority tokens, credentials, payment data, or private payloads in
  portable traces by default;
- imply official marks, certification, verified-business status, or live backend
  proof.

## Public Boundary

Open standard:

- role boundaries;
- schema and artifact shapes;
- local compatibility commands;
- deterministic golden and tamper traces;
- allowed/forbidden claim language;
- extension boundaries.

Hosted or external:

- owner accounts and portal state;
- credential vaulting;
- production issuer keys;
- AP2/UCP/ACP live trust anchors;
- durable audit retention;
- real-business verification freshness;
- analytics and demand graph storage;
- payment custody;
- marketplace ranking.

## Cut Evidence

This draft is part of the protocol cut only when these local gates pass:

```bash
npm run conformance
npm test
git diff --check
```

The current cut remains virtual-store and host-adoption compatibility evidence.
Real-business pilots and live backend confirmations are later product gates, not
claims granted by this open standard draft.
