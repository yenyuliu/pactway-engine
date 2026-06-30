# External Implementer Quickstart

This is the shortest path for another agent runner, gateway, or adapter author
to understand AgentPort without reading the full roadmap.

For the deeper role-by-role implementer kit plan, see
`docs/implementer-kit/README.md` and
`docs/open-protocol-implementer-kit-plan.md`.

## 1. Load The Small Contract

Read these in order:

1. `docs/protocol-compact.md`
2. `docs/agentport-open-standard-v0.2-draft.md`
3. `examples/implementer-kit/protocol-cut.v0.2.json`
4. `examples/implementer-kit/protocol-governance.v0.2.json`
5. `examples/implementer-kit/protocol-publication.v0.2.json`
6. `docs/agentport-open-standard-v0.2-release-notes.md`
7. `docs/agentport-open-standard-v0.2-stable-cut-review.md`
8. `docs/agentport-open-standard-v0.2-external-review-checklist.md`
9. `examples/implementer-kit/protocol-external-review.v0.2.json`
10. `examples/implementer-kit/protocol-external-review-result.v0.2.json`
11. `examples/implementer-kit/protocol-stable-publication.v0.2.json`
12. `artifacts/agentport-protocol-codes.v0.1.json`
13. `artifacts/agentport-conformance-profiles.v0.1.json`
14. `artifacts/agentport-action-model.v0.1.json`
15. `artifacts/agentport-plugin-wallet.v0.1.json` — if you are implementing a plugin

The v0.2 protocol behavior is technically frozen; the public package status is
`cut_readiness`, and the publication status is `stable_published`.
The stable-cut review records the package audit boundary, and the external
review packet records what a reviewer should inspect. The review result records
`stable_tag_set` for `agentport-protocol-v0.2`. These are still compatibility
evidence only, not certification, verified-business status, real-business proof,
or live-backend proof.

The compact rule is:

> Frontier models reason and explain. Plugins hold ticket state durably.
> Gateways verify and standardize. Registries own the lifecycle.
> No single party controls the truth.

## 2. Pick Your Role

Pick the one role you are implementing. For the role-specific spec and claim
boundary, use `docs/implementer-kit/README.md`.

| Role | What you implement | Start here |
|---|---|---|
| Frontier model / host | Session interface — load plugin on start, read ticket state from plugin, never fabricate state | `agentport://action-model`, `agentport://client-use-policy` |
| AgentPort Plugin | Ticket wallet + session bridge — store refs, restore across sessions, route to business port endpoints, preserve receipts, gate approvals | `artifacts/agentport-action-model.v0.1.json`, `schemas/agentport-compact-envelope.schema.json` |
| Business Port Endpoint | Business-facing receiver — accept standardized ticket/action requests, forward to gateway | `agentport://open-standard`, `schemas/agentport-discovery.schema.json` |
| Gateway | Verification + lifecycle authority — enforce gate order, derive capability honestly, sign receipts, write to registry | `docs/protocol-conformance-v0.1.md`, run `npm run conformance` |
| Adapter | Backend connector — normalize existing system of record, never self-assert trust or tier | `agentport://open-standard` §Capability Honesty |
| A2A host binding | Host-side task and approval bridge — compile intent, collect exact approval, carry authority, and accept only gateway receipts | `docs/implementer-kit/a2a-host-binding.md` |

The plugin is not the same as the client agent or the gateway. It is the
frontier-side durable memory layer. Implement it separately from the model
host and separately from the gateway.

## 3. Use Codes And References

Use stable codes from `artifacts/agentport-protocol-codes.v0.1.json`. Do not
ship prose as the machine contract.

Use compact state-changing envelopes shaped like:

```json
{
  "protocol": "agentport",
  "version": "0.1",
  "action": "book_service",
  "actionLayer": "commit",
  "result": { "type": "confirmed", "reason": null },
  "refs": {
    "businessId": "biz_123",
    "serviceId": "svc_456",
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

Validate compact examples with:

```text
schemas/agentport-compact-envelope.schema.json
```

## 4. Run The Local Reference

```bash
npm install
npm run public-package-audit
npm run conformance
npm run action-demo
```

`npm run public-package-audit` proves the public package contains every cut
manifest ref and excludes internal planning/hosted-only surfaces. `npm run
conformance` runs the focused conformance tests and emits a local report.
`npm run action-demo` runs the Local Profile issuer + gateway + virtual-store
happy path with bounded approval and a gateway receipt.

For the gateway role, run the copyable proof-pack example:

```bash
npm run build
node dist/cli/index.js gateway-protocol-check --input examples/gateway-protocol-proof-pack
```

The example proof-pack is intentionally a virtual-store fixture, not real
business proof. Copy the folder shape for your own gateway proof:

```text
examples/gateway-protocol-proof-pack/
  business-profile.json
  discovery.json
  approval.json
  gateway-execution.json
  receipt.json
  wallet-restore-review.json
  redaction-manifest.json
  phase3-proof-summary.json
  gateway-live-evidence.json
```

The checker validates the gateway protocol path:

- discovery routes to an MCP gateway;
- the compact business feed carries readiness facts;
- bounded approval is prepared before state change;
- missing consent fails closed;
- gateway execution reaches a terminal lifecycle state;
- receipt evidence binds the gateway result to the backend outcome;
- returned-session restore uses gateway-current state;
- redaction excludes private payloads;
- boundary flags do not overclaim real-business proof or system-of-record ownership.

For the plugin wallet role, run the copyable proof-pack example:

```bash
npm run build
node dist/cli/index.js plugin-wallet-check --input examples/plugin-wallet-proof-pack
```

Copy the folder shape for your own plugin wallet proof:

```text
examples/plugin-wallet-proof-pack/
  ticket-save.json
  returned-session-restore.json
  gateway-reverify.json
  pending-action-replay.json
  receipt-retention.json
  redaction-manifest.json
  wallet-proof-summary.json
```

The checker validates the plugin wallet boundary:

- durable ticket refs are saved without private wallet payloads;
- returned-session restore does not present current state from local memory;
- gateway reverify happens before current state is shown;
- pending-action replay requires fresh consent;
- receipt refs are preserved without storing receipt bodies or signatures;
- redaction excludes raw tokens, customer PII, backend credentials, and private payloads;
- the wallet does not claim gateway, registry, lifecycle, certification, or real-business authority.

For action and intent compatibility across hosts, plugins, and gateways, run:

```bash
npm run build
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile frontier
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile plugin-wallet
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile gateway
```

Copy the folder shape for your own action intent proof:

```text
examples/action-intent-proof-pack/
  user-goal.json
  compiled-intent.json
  required-inputs.json
  approval-package.json
  approved-execution.json
  consent-rejection.json
  lifecycle-result.json
  result-delivery.json
  receipt-refs.json
  redaction-manifest.json
  action-intent-proof-summary.json
```

The checker validates the shared action lifecycle:

- `schemas/agentport-action-intent-proof-pack.schema.json` defines the input
  artifact shapes.
- `schemas/agentport-action-intent-compatibility-report.schema.json` defines the
  report shape.
- user goals compile without carrying consent or raw authority;
- missing required input blocks final approval;
- approval cards bind the exact executable action;
- consent appears only after exact user approval;
- execution args carry `intentId` and `approvedActionIntentHash`;
- argument drift and missing consent fail closed;
- lifecycle and result delivery are restorable after a session closes;
- receipt refs are retained without private payloads;
- compatibility does not imply gateway, plugin-wallet, registry, certification, or real-business proof.

Known-bad examples are cataloged in
`examples/action-intent-negative-cases.v0.1.json` for schema failures, early
consent, missing-input bypass, argument drift, missing restore, receipt body
retention, and false role-authority claims.

For frontier-host, business-port, registry, and golden-trace compatibility, run:

```bash
node dist/cli/index.js conformance frontier-host --input examples/protocol-v0.2
node dist/cli/index.js business-port-check --input examples/business-port-proof-pack
node dist/cli/index.js registry-check --input examples/commitment-registry-proof-pack
node dist/cli/index.js protocol-trace-check --input examples/protocol-golden-trace-matrix.v0.1.json
```

These checks prove the remaining top-down role boundaries:

- a frontier host restores plugin/gateway state before presenting ticket status,
  carries exact consent only after approval, and does not claim registry,
  gateway, or backend authority;
- a business port endpoint accepts a standardized request, forwards it to the
  gateway, preserves gateway refs, and does not claim backend, receipt, or
  lifecycle authority;
- a commitment registry stores lifecycle events, returns current state from the
  latest event, restores by commitment ref, and does not execute business
  actions;
- the golden trace matrix lists allowed and forbidden transitions for approval,
  execution, restore, consent rejection, argument drift, role overclaim, and
  registry/backend separation.

Their schemas live at:

```text
schemas/agentport-business-port-proof-pack.schema.json
schemas/agentport-business-port-compatibility-report.schema.json
schemas/agentport-registry-proof-pack.schema.json
schemas/agentport-registry-compatibility-report.schema.json
schemas/agentport-protocol-trace-matrix.schema.json
schemas/agentport-protocol-trace-compatibility-report.schema.json
```

For A2A host adoption, run:

```bash
node scripts/a2a-gateway-check.mjs
node scripts/a2a-gateway-check.mjs --host-trace examples/a2a-host-trace.passing.v0.1.json --strict
node scripts/a2a-host-proof-pack.mjs --input examples/a2a-host-trace.passing.v0.1.json --out-dir /tmp/a2a-host-pack --strict
```

The first command validates the AgentPort A2A gateway profile and trace suite.
The second validates a frontier-host/app-connector trace against the AgentPort
A2A host binding. The third packages host evidence into:

```text
host-trace.json
adoption-report.json
redaction-manifest.json
proof-summary.json
```

These artifacts prove host-adoption compatibility only. They do not prove live
A2A network execution, AgentPort Ready certification, or real-business
verification. The host binding and proof-pack schemas live at:

```text
schemas/agentport-a2a-host-binding.schema.json
schemas/agentport-a2a-host-trace.schema.json
schemas/agentport-a2a-host-adoption-report.schema.json
schemas/agentport-a2a-host-proof-pack.schema.json
```

For the demo, distribution, and production trust-depth sequence, see:

```text
docs/protocol-adoption-roadmap.md
```

## 5. Make Only Truthful Claims

Passing conformance permits factual claims such as:

```text
Passes AgentPort Gateway Protocol conformance v0.1.
Passes AgentPort Frontier Host conformance v0.2.
Passes AgentPort Plugin Wallet protocol check.
Passes AgentPort Action Intent compatibility check.
Passes AgentPort A2A Host Adoption compatibility check.
```

It does not permit:

```text
AgentPort Certified
AgentPort Gateway Certified
AgentPort Verified
```

Those require the certification and business-verification processes in
`CERTIFICATION.md`.

## 6. Do Not Build These Into The Open Engine

- credential vaulting
- production issuer keys
- live AP2/UCP/ACP trust anchors
- durable replay stores
- business verification freshness pipelines
- owner accounts
- analytics storage
- payment custody
- biased routing

Keep those hosted or provider-backed. The open engine defines the contract and
deterministic conformance surface.
