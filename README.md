# Pactway Engine

Open Apache-2.0 protocol engine for agent-ready service businesses.

Read `docs/SIMPLE_BLUEPRINT.md` first.

> Pactway gives frontier models durable action memory for service tickets,
> while a neutral gateway verifies and standardizes the commitment lifecycle.

Pactway is not a booking platform or a marketplace. It is the trust and
lifecycle layer underneath — an open protocol any gateway can implement to make
a service business safely actionable by AI agents, with ticket state that
survives session resets, model upgrades, and provider switches.

Rename boundary: Pactway is the product name. The current package, CLI, schema,
artifact, and MCP resource identifiers still use `agentport` as legacy
compatibility names. Do not rename those wire identifiers without a versioned
alias plan and tests.

Public source boundary: the public GitHub source repo should use the
product-facing name `pactway-engine`. The npm package remains
`@agentport/engine` until the versioned `pactway` package alias exists.

## Role Split

| Role | Responsibility |
|---|---|
| **Frontier Model** | Talks to the user, reasons, explains. Never holds ticket state directly. |
| **Pactway Plugin** | Action harness + ticket wallet + session bridge. Durable memory layer on the frontier side. Stores ticket refs, restores across sessions, routes to business port endpoints, preserves receipts, gates approvals. |
| **Business Port Endpoint** | Business-facing receiver. Accepts standardized ticket/action requests and forwards to the gateway. |
| **Agent Gateway** | Verification, standardization, lifecycle authority. Neutral — never the business's system of record. |
| **Commitment Registry** | Durable ticket state and full event history. Source of truth for lifecycle queries. No single party controls it. |

The plugin is the key differentiator. Without it, a frontier model has to
guess ticket state when the user returns. With it, the model reads ground truth
from the plugin — the registry is the authority, not the model's memory.

## What This Repo Contains

The open runtime, adapter SDK, reference adapters (manual, fixture, Square),
local provider defaults, conversion prototype, and conformance tests.

Hosted outside this open engine:
- verified truth stores and freshness pipelines
- credential vaulting and OAuth brokering
- durable audit retention
- business registry coverage and owner portal
- lead delivery infrastructure
- analytics and payment custody

## Market-Facing Claim

**Pactway Ready Gateway**: a derived readiness tier for long-tail service
businesses that says what agents can safely trust and do. The tier is computed
from verified facts and real adapter capabilities — never self-asserted.

The owner-facing product surface is the **Business Co-Pilot**: a guided workflow
that diagnoses readiness gaps, drafts/reviews the profile, verifies ownership,
and publishes the honest `Pactway Ready` tier.

Pactway does not compete with AP2, UCP, ACP, MCP, A2A, Google Search, Google
Maps, or payment networks. It stands on those rails and bridges messy existing
service operations into owner-approved, verified, agent-callable profiles.

## Reading Order

Start here:

- `docs/SIMPLE_BLUEPRINT.md` — role split, ticket wallet model, booking and session-restore flows, scope filter, deferral rules.
- `docs/agentport-open-standard-v0.1.md` — Apache-2.0 open gateway standard: role definitions, tool classes, capability honesty, ticket lifecycle, and the open/hosted boundary.
- `docs/pactway-rebrand-plan.md` — brand migration plan and compatibility boundary.
- `docs/external-implementer-quickstart.md` — shortest path for a plugin author, gateway implementer, or adapter author to get started.

For protocol/reference work:

- `docs/agentport-operating-blueprint.md` for the consolidated strategy.
- `docs/protocol-compact.md` for working-memory rules.
- `docs/protocol-conformance-v0.1.md` for pass/fail profile requirements.
- `docs/protocol-codes.md` for stable codes and compact payload discipline.
- `docs/external-implementer-quickstart.md` for third-party adoption.
- `docs/agentport-ready-plan.md` for the market-facing readiness strategy.
- `docs/business-copilot-plan.md` for the owner-facing readiness workflow.
- `docs/protocol-adoption-roadmap.md` for demo, distribution, and production trust-depth sequencing.
- `docs/frontier-host-integration-contract.md` for frontier-model host intent
  recovery, trust verification, retry, and acknowledgement responsibilities.
- `schemas/agentport-discovery.schema.json` for `/.well-known/agentport.json`
  discovery descriptors.
- `schemas/agentport-client-use-policy.schema.json` for client-agent source
  preference and browsing fallback.
- `schemas/agentport-conformance-report.schema.json` for report shape.
- `schemas/agentport-owner-proof-request.schema.json` for owner proof handoff.
- `schemas/agentport-presentation-run-packet.schema.json` for live-run setup packets.
- `schemas/agentport-presentation-run-status.schema.json` for read-only live-run status.
- `schemas/agentport-presentation-run-brief.schema.json` for compact operator handoff.
- `schemas/agentport-presentation-run-report.schema.json` for final proof indexing.
- `schemas/agentport-presentation-preflight.schema.json` for live-arc readiness checks.
- `schemas/agentport-presentation-evidence.schema.json` for live-arc evidence shape.

## Quick Start

```bash
npm install
npm run conformance
npm run demo
npm run action-demo
npm run product-check
npm run dev -- --tenants ./examples/sample-tenant.json
```

The dev server listens on `http://localhost:8723/mcp` using Streamable HTTP. The
sample tenant file includes manual handoff and deterministic fixture-confirm
paths so the demo can show the difference between a request-tier business and a
confirm-tier business.

Generate an owner-facing `Pactway Ready` readiness report for a tenant:

```bash
npm run build
node dist/cli/index.js readiness-report \
  --tenants ./examples/sample-tenant.json \
  --business-id verified-spa \
  --protocol ap2:configured:confirm_or_pay_authority
```

The report returns `agentport.readiness_report.v0.1` with the derived tier,
protocol inputs, binding capabilities, gaps, and next best action. It is the
first Business Co-Pilot primitive: diagnose what the owner must review, verify,
connect, or configure before claiming a higher readiness tier.

Generate the product-facing Business Co-Pilot packet for the same tenant:

```bash
node dist/cli/index.js business-copilot \
  --tenants ./examples/sample-tenant.json \
  --business-id verified-spa
```

The packet returns `agentport.business_copilot_packet.v0.1`: what agents can do
today, what they cannot do yet, the primary owner action, and the underlying
readiness refs. It is designed for the future owner portal or concierge flow.

Render a local execution trace file:

```bash
node dist/cli/index.js trace-view \
  --input ./trace.json \
  --format text
```

`trace-view` accepts one `agentport.execution_graph_record.v0.1`, an array of
records, or `{ "records": [...] }`. Use `--format json` for the structured view
or `--format mermaid` for a flowchart.

## MCP Tools

- `assist`: delegates a natural-language goal through deterministic grounded
  orchestration over verified records and the honest tools below. It returns
  `answered`, `acted`, or `no_verified_info` with citations and true tool
  results; it refuses rather than guessing. Hosted code can inject the
  Claude-compatible planner adapter, but the adapter only chooses a constrained
  plan and the server still composes facts from verified tool results.
- `find_services`: finds tenants/services from the configured tenant store. Each
  returned service includes `bindingId`, `actionCapability`, `verification`, and
  `tag: { verified, tier }`.
- `get_business_info`: returns a business profile, verification attestation, and
  tagged services for a known `businessId`. Unknown businesses return a
  structured not-found result instead of a JSON-RPC error.
- `get_business_feed`: returns the agent-ready representative feed for a known
  `businessId`: grounded facts, path-level citations, per-service action
  affordances, top-level `nextActions`, explicit `cannotDo` limits, and
  deterministic `businessVersion` cache metadata. This is the preferred
  client-agent surface when deciding what Pactway can safely say or do before
  falling back to web browsing. It defaults to `mode: "compact"` for the normal
  agent path; use `mode: "full"` when an implementer or debugger needs the
  expanded profile and tagged service payload. Use optional `intent: "answer" |
  "book" | "manage" | "compare"` to retrieve only the decision context needed
  for that task. Use optional `ifBusinessVersion: "sha256:..."` for conditional
  reads; when the current business version matches, the gateway returns
  `notModified: true` with cache metadata instead of repeating the full feed.
- `compile_action_intent`: turns a natural-language goal into a saved,
  intent-bound approval lifecycle. The result includes an `approvalPackage`:
  resolve missing inputs first, render `approvalPackage.approvalCard` when
  ready, then after exact user approval call `approvalPackage.execute.tool` with
  `approvalPackage.execute.arguments` plus `customer` and `userConsent: true`.
  The package also carries lifecycle read/poll handles scoped by
  `agentSessionId`. Hosts that need the terminal result after the live session
  closes can pass `resultDelivery: { channel: "inbox" | "webhook", target }`
  during compile; the gateway saves that target on the lifecycle and calls the
  injected result sink only after a terminal outcome.
- `list_action_intent_result_deliveries`,
  `get_action_intent_result_delivery`, and
  `ack_action_intent_result_delivery`: read and acknowledge terminal intent
  result deliveries after a live agent session has closed. Delivery records are
  cursor-addressed and include status, idempotency key, payload hash, attempts,
  optional signature, and the terminal result metadata. Lifecycle reads also
  summarize the latest delivery state so a host can see `delivered`, `failed`,
  or `acknowledged` without separately listing the inbox.
- `npm run intent-demo` exercises the frontier-host recovery path locally: the
  runner signs result delivery, closes the live session, recovers the inbox
  record through MCP by `agentSessionId`, verifies the EdDSA delivery signature,
  acknowledges it, and observes lifecycle delivery state move to `acknowledged`.
  The reusable `AgentPortFrontierClient` exported from
  `@agentport/engine/core` owns the host-side session header, lifecycle cursor,
  delivery cursor, signature verification, and verify-before-ack behavior.
  When the gateway is configured with delivery trust metadata, the same client
  reads `agentport://intent-result-delivery-trust-profile` and derives its
  verification settings from that resource. `FileAgentPortFrontierClientStateStore`
  is available for local hosted-pilot cursor persistence.
- `npm run frontier-worker -- --endpoint=http://127.0.0.1:8723/mcp
  --agent-session-id=<session> --state=data/frontier-host-state.json --json`
  runs the reusable frontier-host worker as a separate process. It loads the
  gateway trust profile, resumes the session-scoped delivery cursor from disk,
  verifies recovered terminal results before acknowledgement, and leaves failed
  verification unadvanced so the host can retry after trust configuration is
  fixed. For hosted-pilot runs, pass `--owner-id=<worker-id>`,
  `--lease-ttl-ms=60000`, and
  `--evidence=data/frontier-host-worker-evidence.json`; the worker claims an
  expiring per-session recovery lease before touching the inbox and writes a
  compact evidence artifact without prompt, customer, or secret payloads.
- `npm run frontier-pilot -- init-packet ...`,
  `npm run frontier-pilot -- recover ...`, and
  `npm run frontier-pilot -- validate-evidence ...` wrap the worker in a
  repeatable pilot proof. The packet pins `endpoint`, `agentSessionId`,
  expected `intentId`, state path, worker lease owner, and expected result type.
  Recovery writes `agentport.frontier_intent_pilot_evidence.v0.1`; validation
  checks session match, intent match, verified delivery, acknowledgement, lease
  release, and expected result type. The validation report includes a compact
  `resolution` object so a model host can decide whether to report completion,
  retry after a lease, fix delivery trust, retry acknowledgement, ask for
  re-approval, or surface a backend failure.
- `npm run frontier-pilot -- run-local --out-dir=data/frontier-pilot-run
  --mode=confirmed --json --strict` runs the full deterministic pilot arc in
  one command: local gateway, intent compile, availability resolution, approved
  execution, closed-session worker recovery, pilot evidence validation, and a
  compact run folder. Use `--mode=bad-trust` to produce a deterministic
  recovery issue with `resolution.nextAction=fix_delivery_trust_profile_then_retry`.
  Use `--mode=restart` to recover through a fresh frontier-worker subprocess
  from only the packet, intent-scoped `agentSessionId`, and file-backed worker
  state. That proves host-side recovery across agent session lifespan; the local
  pilot gateway itself still uses in-memory lifecycle/result stores. Use
  `--mode=trust-retry` for the stronger trust proof: first recovery runs with an
  untrusted issuer expectation and leaves the delivery unacknowledged with cursor
  unchanged, then corrected trust recovers and acknowledges the same delivery.
- `check_availability`: returns adapter-backed availability or a truthful
  unsupported result. Pass `bindingId` to target a specific binding.
- `book_service`: requires `userConsent: true`, accepts optional `bindingId`, and
  refuses confirmed bookings unless the addressed adapter honestly supports
  confirmation. Request-mode manual bindings can return an honest `request`
  result after the lead sink accepts delivery.
- `cancel_service`: requires `userConsent: true` and a real `confirmationId`.
  If the addressed adapter cannot cancel, Pactway returns a handoff instead of
  faking cancellation.
- `reschedule_service`: requires `userConsent: true`, a real `confirmationId`,
  and `newSlotStart`. If the addressed adapter cannot reschedule, Pactway
  returns a handoff instead of faking a backend action.

The server also exposes `resources/list` and `resources/read` for:

- `agentport://runtime`: registered adapters and tool names.
- `agentport://open-standard`: the open v0.1 gateway standard for public reads,
  verified representation, capability honesty, and consent-gated actions.
- `agentport://discovery`: the discovery descriptor also served at
  `/.well-known/agentport.json`.
- `agentport://client-use-policy`: source preference and browsing fallback rules
  for client agents.
- `agentport://action-model`: a machine-readable guide for general client agents,
  including safe call order, action layers, consent requirements, delegation
  expectations, and receipt rules.
- `agentport://protocol-codes`: the compact stable code registry for runtime,
  receipt, and presentation-run artifacts.

The HTTP server also serves `GET /.well-known/agentport.json`. A browsing agent
can use that descriptor to switch from a business website or hosted profile to
the Pactway MCP endpoint, then read `agentport://client-use-policy` before
deciding whether web browsing is still needed. The descriptor is not
verification; business hints only route lookup.

## General Agent Action Demo

Run the full local issuer + gateway path:

```bash
npm run action-demo
# or, after build/install:
agentport action-demo
```

This starts a reference issuer and an MCP business gateway, then simulates a
general agent that:

1. reads the live `agentport://action-model`;
2. reads the live `agentport://protocol-codes`;
3. reads `artifacts/agentport-issuer-flow.v0.1.json`;
4. builds an approval card with the exported runner-kit helpers;
5. creates an issuer delegation request for an exact booking action;
6. renders/checks the issuer approval page;
7. records an exact approval event;
8. receives Local Profile authority evidence as an issuer-signed `DelegationProof`;
9. attaches `userConsent` only after the approval event;
10. verifies the signed gateway trust profile through a fresh, hash-pinned local
   trust-root bundle;
11. sends `AgentPort-Delegation` plus `DPoP` to the gateway;
12. passes issuer-status verification and replay protection;
13. proves the missing-delegation negative path rejects before backend execution;
14. proves valid authority still rejects without explicit `userConsent`;
15. proves valid authority cannot be reused for an unapproved service;
16. proves a request-tier approval cannot silently become a confirmed booking;
17. proves a demo-only lying adapter cannot turn a non-confirm capability into a
    confirmed booking;
18. confirms a virtual-store booking with a gateway receipt.

The client agent never receives issuer signing authority.

## Intent Runner Demo

Run the compact product proof for saved intent execution:

```bash
npm run intent-demo
# JSON payload for client-runner integration tests:
node scripts/intent-runner.mjs --json
```

The runner compiles a booking goal with an inbox `resultDelivery` target,
resolves availability, produces an `agentport.intent_approval_package`,
simulates exact user approval, executes `book_service` with `intentId` and
`approvedActionIntentHash`, delivers the terminal result through the injected
result sink, then polls the intent lifecycle until the confirmed backend result
is recorded. Delivery records can be listed/read/acknowledged through the MCP
inbox tools; webhook dispatch is retryable through the provider sink. This is
the frontier-model integration contract: the model host can reason and render,
but Pactway binds the approved action to verified business facts, honest
adapter capability, gateway execution, result delivery, and receipt/lifecycle
memory.

To turn that run into a compact pilot proof, initialize a packet after an intent
has reached terminal delivery, run recovery, then validate the evidence:

```bash
npm run frontier-pilot -- init-packet \
  --packet=data/frontier-intent-pilot-packet.json \
  --endpoint=http://127.0.0.1:8723/mcp \
  --agent-session-id=<session> \
  --intent-id=<intent> \
  --business-id=<business> \
  --state=data/frontier-host-state.json \
  --worker-evidence=data/frontier-host-worker-evidence.json \
  --owner-id=<worker-id> \
  --result-type=confirmed \
  --json

npm run frontier-pilot -- recover \
  --packet=data/frontier-intent-pilot-packet.json \
  --evidence=data/frontier-intent-pilot-evidence.json \
  --json --strict

npm run frontier-pilot -- validate-evidence \
  --evidence=data/frontier-intent-pilot-evidence.json \
  --json --strict
```

Pilot validation returns `resolution.kind` and `resolution.nextAction`. Common
kinds are `completed`, `worker_blocked`, `delivery_missing`,
`delivery_verification_failed`, `delivery_acknowledgement_failed`,
`intent_expired`, `gateway_rejected`, and `gateway_failed`.

For one-command local proof:

```bash
npm run frontier-pilot -- run-local \
  --out-dir=data/frontier-pilot-run \
  --mode=confirmed \
  --agent-session-id=<session> \
  --owner-id=<worker-id> \
  --json --strict
```

Use `--mode=restart` for the host-restart proof. The run summary records
`restart.recoveryRuntime: "subprocess"`, `liveClientReusedForRecovery: false`,
and the worker state cursor movement before/after recovery.

Gateway restart is a separate claim: it is covered by the durable-provider test
path using `FileActionIntentLifecycleStore` and `FileActionIntentResultSink`,
not by the default in-memory local pilot.

For the full local claim bundle, run:

```bash
npm run frontier-claim-check -- --out-dir=data/frontier-claim-check --json
```

The claim-check manifest hashes the closed-session, host-restart, trust-retry,
and durable gateway-restart artifacts. The durable gateway-restart claim uses
`scripts/frontier-external-host-simulator.mjs`, a separate process that imports
only the published core frontier client API. The manifest also reserves a
real-business pilot claim and marks it `blocked_external_input` until supplied
with real owner-reviewed/ownership evidence via `--real-business-evidence`.

Use `--mode=trust-retry` for the trust-recovery proof. The run summary records
`trustRetry.failed.verification.reason: "delivery_issuer_untrusted"`,
`trustRetry.failed.acknowledged: false`, cursor `0 -> 0`, then
`trustRetry.retry.acknowledged: true`, cursor `0 -> 1`, and `sameDelivery: true`.

The portable frontier-host artifact contracts live in:

- `schemas/agentport-frontier-intent-pilot-packet.schema.json`
- `schemas/agentport-frontier-host-worker-evidence.schema.json`
- `schemas/agentport-frontier-intent-pilot-evidence.schema.json`
- `schemas/agentport-frontier-intent-pilot-validation.schema.json`
- `schemas/agentport-frontier-intent-pilot-run.schema.json`

Trust-retry examples live under `examples/frontier-*.v0.1.json`.

The run folder contains `frontier-intent-pilot-run.json`,
`frontier-intent-pilot-packet.json`, `frontier-host-worker-evidence.json`,
`frontier-intent-pilot-evidence.json`, `frontier-intent-pilot-validation.json`,
and `frontier-intent-lifecycle.json`.

Reference hardening providers are included for local/product validation:

- issuer signing seam for KMS/HSM-backed production signers
- HTTP signer adapter for hosted KMS/HSM proxy integration
- HTTP signer returned-signature verification against configured public JWKS
- collision-resistant default issuer IDs with deterministic `idFactory` injection
- issuer approval-authorizer seam for session/passkey-bound hosted approval
- header-backed local approval reference for session, CSRF, and passkey evidence
- verifier-backed passkey approval seam with a signature-bound local reference
- consume-once passkey challenge store for replay-resistant local approval
- file-backed passkey challenge store with TTL-aware replay/expiry reasons
- monotonic passkey credential counter stores for cloned/stale assertion checks
- issuer-web audit events for pre-core approval/admin authorization failures
- admin authorization hook for revoke and other issuer operations
- issuer-web security headers for approval, metadata, JWKS, status, and revoke
  responses, with hosted override/disable hooks
- issuer-web JSON body limit for request, approval, and revoke endpoints, with
  hosted override/disable hooks
- issuer-web JSON content-type enforcement before request body parsing, with
  hosted disable hook
- issuer-web Origin policy for browser-originated request, approval, and revoke
  POSTs, with same-origin default plus hosted allow-list/disable hooks
- issuer-web malformed-Origin rejection while preserving no-Origin server/mobile
  callers
- issuer-web origin allow-list validation at server creation, with exact
  normalized origin matching
- issuer-web transport-policy audit events for origin, JSON media-type, and body
  limit denials without logging request bodies or secrets
- issuer-web invalid JSON audit and stable `invalid_json` response without parser
  detail leakage
- passkey assurance labels carried from issuer approval into Local Profile
  `DelegationProof`
- issuer token-protection policy for allowed confirmation methods, replay
  handles, TTL, and approval-derived assurance
- issuer request lifecycle checks for valid future expiry, expired status, and
  no-sign approval rejection after expiry
- consume-once issuer approval storage so a pending request crosses into signing
  only once
- durable approval ordering that stores revocable consent before signing and
  revokes it on signing failure
- duplicate-safe issuer stores that reject conflicting request, consent, and
  delegation IDs without overwriting existing records
- composable issuer protection policies with local velocity limiting
- issuer audit events with a file-backed local sink
- tamper-evident hash-chain audit sink and verifier
- issuer key-ring rotation with active signing key
- file-backed issuer request/consent/revocation state
- file-backed replay protection
- HTTP issuer metadata/JWKS discovery
- HTTP issuer-status revocation verifier

Production deployments should replace file stores and generated dev keys with
managed storage, KMS/HSM signing, real login/passkeys, CSRF/session protection,
and operational audit/retention policy.

For the product-level action path, run:

```bash
npm run product-check
```

This runs the local issuer + gateway demo and the focused action-model, issuer,
runner-kit, issuer-hardening, and virtual-store validation tests. The
virtual-store check uses the reference issuer flow instead of an injected fake
delegation: it builds the runner-kit approval card, creates an issuer request,
renders the approval page, approves the exact action, sends an issuer-signed
delegation token with DPoP to the gateway, verifies issuer status, consumes
replay protection, confirms the fixture-backed booking, and preserves the
gateway receipt.

## Truth Tags

Pactway reports a per-service capability tag:

```json
{ "verified": true, "tier": "confirm" }
```

`verified` is derived only from `Tenant.verification.status === "verified"`.
`Tenant.verification` is a `VerificationAttestation` with
`status: "verified" | "stale" | "unverified"` plus optional provenance such as
`verifiedBy`, `verifiedAt`, and `method`. Stale and unverified attestations do
not unlock the verified signal.

`tier` is derived at serve time from the bound adapter's capabilities:

- `confirm`: adapter can actually confirm a booking.
- `request`: adapter can read services or availability but cannot confirm.
- `inform`: adapter cannot support an action beyond information.

Adapters cannot self-assert `verified`, `tag`, or `bindingId`; the server derives
those values from tenant data, adapter capabilities, and binding position.

## Booking Integrity

The integrity rule is unchanged: an adapter without `confirmBooking: true` must
never produce a `confirmed` booking result. The server rejects capability
violations, and the conformance suite asserts the same rule for adapters.
The same honesty rule applies to manage verbs: an adapter without
`cancelBooking` or `rescheduleBooking` cannot produce `cancelled` or
`rescheduled` outcomes.

For non-confirm outcomes, `book_service` can deliver a structured lead through a
`LeadSink`. The open engine provides local/dev sinks such as `NoopLeadSink`,
`ConsoleLeadSink`, and `FileLeadSink`; production email, SMS, webhook, and owner
routing implementations are hosted-provider concerns.

## Authority Evidence Checkpoint

For state-changing actions, Pactway can enforce an Authority Evidence
Checkpoint: proof that the caller is an agent acting for a user and that the
user approved the bounded action. This is analogous to CAPTCHA as a gate, but it
does not classify humans or reveal full legal identity. It validates
authorization, consent, scope, expiry, and audit references.

The open engine normalizes accepted evidence into `AuthorityContext`. The
existing `DelegationProof` path remains the legacy AgentPort Local Profile for
dev/test/demo compatibility; external AP2/UCP/ACP-style authority evidence stays
behind verifier/provider seams. The engine does not issue production identity
credentials, manage wallets, broker OAuth, run KYC, or store raw identity
documents.

When `delegation.requireForStateChanging` is enabled, `book_service`,
`cancel_service`, and `reschedule_service` reject before adapter execution unless
authority evidence is valid for the requested action, scope, business/service
bounds, and expiry. Local-profile rejection reasons are stable and
machine-readable:

- `delegation_required`
- `delegation_invalid`
- `delegation_scope_missing`
- `delegation_action_not_approved`
- `delegation_business_mismatch`
- `delegation_service_mismatch`
- `delegation_action_intent_mismatch`
- `delegation_audience_mismatch`
- `delegation_untrusted_issuer`
- `delegation_expired`
- `delegation_replay_protection_required`
- `delegation_replay_detected`
- `delegation_verification_failed`
- `delegation_revoked`
- `delegation_assurance_too_low`
- `delegation_token_confirmation_required`
- `delegation_token_confirmation_method_unsupported`
- `delegation_token_confirmation_invalid`
- `requested_type_escalated`

See `docs/authority-evidence-profiles-plan.md` for the blueprint,
`docs/verified-delegation-plan.md` for the current local-profile enforcement
slice, and `docs/delegation-proof-spec.md` for the Local Profile proof shape.

The gate is layered:

- `lead`: explicit request/handoff booking intents.
- `commit`: default or confirmed booking intents.
- `manage`: cancellation and reschedule actions.

A lower-risk `lead` intent cannot silently become a confirmed booking; the server
rejects that as `requested_type_escalated`.

Layer policy can also require token confirmation. For example, a `lead` layer may
accept session-bound local-profile evidence while `commit` and `manage` require
DPoP, mTLS, or wallet-bound confirmation. The open engine validates normalized
confirmation metadata; cryptographic verification stays behind verifier seams.

When configured with an `ActionReceiptSigner`, the business gateway returns its
own `ActionReceipt` after a state-changing decision or outcome. Adapter-supplied
receipt fields are stripped, so the client agent cannot forge the business-side
confirmation. The runner kit can verify the receipt payload hash, expected
business/action bindings, and an EdDSA gateway signature against an injected
gateway trust profile. When configured, the MCP runtime exposes
`agentport://gateway-trust-profile` so runners can discover the local gateway
receipt verification keys through the same resource channel as the action model.
Receipts carry compact authority evidence refs and assurance when available;
they do not copy raw authority tokens.

## Adapters

- `manual`: handoff-only long-tail reference adapter. It can opt into request
  mode per binding with `metadata.requestMode: true`; default manual bindings
  remain handoff-only.
- `fixture`: deterministic confirm-tier adapter for tests and demos, with no
  credentials required.
- `square`: Square Bookings skeleton that only confirms when real credentials
  and location configuration are present.

## Repository Packages

- `packages/core`: domain types, adapter contract, provider interfaces, local
  providers, binding IDs, and capability resolution.
- `packages/server`: Streamable HTTP MCP runtime, tool handlers, and reference
  issuer web/API server. The public npm export uses the narrower
  `packages/server/src/public.ts` entrypoint, which excludes hosted issuer and
  vendor-deployment helpers.
- `packages/conversion`: hosted-side prototype onboarding pipeline. It can draft an
  owner-review `ClientSubmission` from a fetched page through injectable
  `PageFetcher`/`ProfileDrafter` seams, then converts a confirmed business
  submission plus ownership attestation into a tenant JSON store. It is not
  exported by the public npm package.
- `packages/verification`: hosted-side prototype for ownership challenges,
  injectable DNS TXT / well-known HTTP proof checks, proof-to-attestation
  conversion, egress-guarded well-known proof fetching, clock-injected
  freshness/staleness passes, and auditable re-verification job runs. It is not
  exported by the public npm package.
- `packages/adapters/manual`: handoff-only reference adapter.
- `packages/adapters/fixture`: deterministic confirm-capable adapter for tests
  and demos.
- `packages/adapters/square`: Square Bookings reference adapter skeleton.
- `packages/cli`: internal repo CLI. The public npm binary is intentionally
  limited to `agentport conformance <role>` protocol compatibility checks.

## Public NPM Surface

The public `@agentport/engine` package exports:

- `@agentport/engine` and `@agentport/engine/core`
- `@agentport/engine/server`
- `@agentport/engine/adapters/manual`
- `@agentport/engine/adapters/fixture`
- `@agentport/engine/adapters/square`

It does not export the hosted conversion operator, verification prototype,
deployed vendor artifacts, owner-workflow commands, or issuer-dev tooling.
Open conformance means compatibility only; it does not grant Pactway
Certified, Pactway Verified business, or real-business proof claims.

Before publishing the public package, run:

```bash
npm run release:public-check
```

That gate runs conformance, audits the packed file list, installs the generated
tarball in a temporary external project, imports public exports, rejects private
exports, and runs the installed `agentport conformance gateway` CLI.

The public/private PR and publishing workflow is documented in
`docs/public-private-pr-publishing.md`.

## Try It

Run the showroom:

```bash
npm run demo
```

Start the MCP dev server:

```bash
npm run dev -- --tenants ./examples/sample-tenant.json
```

Use a published onboarding store instead:

```bash
node dist/conversion/onboard.js \
  --submission submission.json \
  --ownership ownership.json \
  --store data/published-tenants.json

npm run dev -- --tenants ./data/published-tenants.json
```

Run the hosted/repo operator demo path from a real business URL:

```bash
ANTHROPIC_API_KEY=... agentport operator draft \
  --url https://business.example \
  --draft data/operator-draft.json \
  --audit data/ai-presence-audit.json \
  --review data/operator-review.json \
  --submission data/operator-submission.json
```

Open `data/ai-presence-audit.json` first. It shows what AI would say about the
business, what is missing or risky, what agents can and cannot do yet, and the
smallest owner actions needed for Pactway Ready. Then review
`data/operator-review.json`, edit/confirm
`data/operator-submission.json`, then issue and verify ownership before publish:

```bash
agentport operator ownership-challenge \
  --domain business.example \
  --method dns-txt \
  --challenge data/ownership-challenge.json

# Publish the printed DNS TXT record, then verify it:
agentport operator verify-ownership \
  --challenge data/ownership-challenge.json \
  --ownership ownership.json \
  --verification-result data/ownership-verification.json

agentport operator preflight \
  --draft data/operator-draft.json \
  --review data/operator-review.json \
  --submission data/operator-submission.json \
  --ownership ownership.json \
  --ownership-challenge data/ownership-challenge.json \
  --owner-proof-request data/owner-proof-request.json \
  --ownership-verification data/ownership-verification.json \
  --goal "is Example Business open Sunday?"

agentport operator publish \
  --submission data/operator-submission.json \
  --ownership ownership.json \
  --store data/published-tenants.json

agentport operator readiness \
  --store data/published-tenants.json \
  --business-id example-business

agentport operator smoke-assist \
  --store data/published-tenants.json \
  --goal "is Example Business open Sunday?"
```

For a presentation run, initialize a compact run packet first. It pins the
business URL, artifact paths, ownership proof method, and ordered operator step
args without copying artifact bodies or customer details:

```bash
agentport operator init-run \
  --url https://business.example \
  --business-id example-business \
  --goal "is Example Business open Sunday?" \
  --negative-goal "book an unsupported service at Example Business" \
  --out-dir data/live-runs/example-business

agentport operator run-status \
  --packet data/live-runs/example-business/presentation-run-packet.json \
  --strict

agentport operator run-brief \
  --packet data/live-runs/example-business/presentation-run-packet.json

agentport operator run-report \
  --packet data/live-runs/example-business/presentation-run-packet.json \
  --report data/live-runs/example-business/presentation-run-report.json

agentport operator run-next \
  --packet data/live-runs/example-business/presentation-run-packet.json
```

The packet is a setup artifact, not readiness or completion evidence. Its schema
and example live at `schemas/agentport-presentation-run-packet.schema.json` and
`examples/presentation-run-packet.v0.1.json`. The status result is also
read-only; it reports artifact presence, validator summaries, and the next
operator argv without executing the step. It also checks that packet argv still
matches the packet's declared URL, goal, proof method, and artifact paths; an
inconsistent packet gets no runnable `nextStep`. Its schema and example live at
`schemas/agentport-presentation-run-status.schema.json` and
`examples/presentation-run-status.v0.1.json`. Use `--strict` in scripts to exit
non-zero for unsafe status while still printing the JSON report. `run-next`
executes exactly one strict-safe `nextStep` argv from that status, then stops.
After `ownership-challenge`, the packet's next local step is
`owner-proof-request`; `run-next` can generate that owner instruction artifact
without crossing the external verification boundary.
`run-brief` derives a compact handoff from the same status: current action code,
exact argv, optional gate metadata, artifact paths, checks, and issue codes. Its
schema and example live at `schemas/agentport-presentation-run-brief.schema.json`
and `examples/presentation-run-brief.v0.1.json`.
After `ownership-challenge` has written the challenge artifact,
`owner-proof-request` creates an owner-safe DNS/HTTP proof instruction artifact
from the packet's review and challenge paths, either directly or through
`run-next`. It is not verification and is not publishable truth;
`verify-ownership` remains the only command that can produce a confirmed
ownership attestation. Its schema and example live at
`schemas/agentport-owner-proof-request.schema.json` and
`examples/owner-proof-request.v0.1.json`.
`run-report` is the final compact proof index. It summarizes the current action,
artifact paths, status checks, issue codes, evidence validation state, published
tenant id, and assist outcomes without copying artifact bodies. Pass `--report`
to write the same JSON to disk. Its schema and example live at
`schemas/agentport-presentation-run-report.schema.json` and
`examples/presentation-run-report.v0.1.json`.
When `run-status` reports `nextStep.gate.code: "external_boundary"`, pass the
reported `nextStep.gate.allowStep` value to `run-next` only when the external
review/proof moment is ready. The current gated boundaries are ownership proof
verification and live publish/MCP execution.

After the packet's draft, ownership, and preflight steps are complete, produce a
compact evidence manifest:

```bash
agentport operator live-arc \
  --draft data/operator-draft.json \
  --review data/operator-review.json \
  --submission data/operator-submission.json \
  --ownership ownership.json \
  --ownership-challenge data/ownership-challenge.json \
  --owner-proof-request data/owner-proof-request.json \
  --ownership-verification data/ownership-verification.json \
  --store data/published-tenants.json \
  --goal "is Example Business open Sunday?" \
  --negative-goal "book an unsupported service at Example Business" \
  --evidence data/presentation-evidence.json

agentport operator validate-evidence \
  --evidence data/presentation-evidence.json
```

The preflight output is a read-only readiness check, not proof of a completed
run. Its schema and example live at
`schemas/agentport-presentation-preflight.schema.json` and
`examples/presentation-preflight.v0.1.json`.
For packeted runs, completion also requires the evidence manifest to match the
packet's declared artifact paths and optional `negativeGoal`; `run-status`
reports this as `checks.evidenceMatchesPacket`.
The manifest labels the AI draft, owner-review task, ownership attestation,
optional ownership challenge, owner-proof-request, and proof-result links,
published tenant, backend boundary, and MCP-backed grounded assist result. When
`--negative-goal` is
provided, it also records a second MCP-backed assist result for an
unsupported/negative check. It binds each linked artifact with a compact SHA-256
digest rather than copying the artifact body. It is evidence of the run, not a
certification or dashboard record. Its schema and example live at
`schemas/agentport-presentation-evidence.schema.json` and
`examples/presentation-evidence.v0.1.json`.
The `live-arc` command runs the same evidence validation before reporting
success. The standalone `validate-evidence` command checks that the manifest is
shaped for the presentation run and keeps the review, ownership,
published-tenant, boundary, and MCP citation flags honest. It also verifies that
linked draft, review, submission, ownership, store, and optional ownership-proof
artifacts are present, readable, and still match their recorded SHA-256 digests.
It validates evidence shape and packet completeness, not business truth. It
prints a machine-readable validation report and exits non-zero when `ready` is
false.
The `ownership-challenge` command only issues the required proof record; verified
publication still requires `verify-ownership` to pass and write a confirmed
`ownership.json`.
The `preflight` command is read-only setup validation, including optional
ownership challenge and verification-result links when supplied; it does not
publish a tenant, call MCP, or prove that a live arc ran.

The dev CLI writes captured leads to `data/leads.jsonl` through `FileLeadSink`.

## Checks

```bash
npm test
npm audit --omit=dev
```

The test suite covers adapter conformance, draft-from-URL conversion seams,
grounded assist orchestration, manual handoff, fixture confirmation,
verification/tag derivation, binding addressability, business info, lead
capture, verified delegation, manage flows, and the HTTP MCP boundary.

## License and Marks

The code is licensed under Apache-2.0. That license is meant to make the engine,
SDK surface, protocol schemas, examples, and conformance tests easy to adopt in
open and commercial implementations.

External protocol compatibility is separate from the Pactway code license.
Pactway currently treats MCP, A2A, AP2, UCP, ACP, passkey, and OIDC as upstream
rails/evidence profiles where useful; it does not depend on a vendor-specific
payment-network trusted-agent program. See
`docs/protocol-license-boundary-plan.md`.

Pactway marks are separate from the code license. See:

- `TRADEMARK.md` for allowed use of names and reserved trust marks.
- `CONFORMANCE.md` for public technical profiles.
- `CERTIFICATION.md` for official certification and verified-business claims.
- `docs/protocol-conformance-v0.1.md` for the current protocol checklist.
- `docs/external-implementer-quickstart.md` for a short third-party adoption path.
- `docs/protocol-adoption-roadmap.md` for the adoption and production trust-depth path.

Short version: anyone can implement the protocol; official marks such as
`Pactway Certified`, `Pactway Gateway Certified`, and `Pactway Verified`
are earned by published criteria and approval.

## Mobile and General Agent Artifacts

General agents should not infer Pactway safety rules from prose. The portable
action artifact lives at:

```text
artifacts/agentport-action-model.v0.1.json
artifacts/agentport-discovery.v0.1.json
artifacts/agentport-issuer-flow.v0.1.json
artifacts/agentport-protocol-codes.v0.1.json
```

It is intended for Claude, ChatGPT, Gemini, and custom mobile/hosted agent
runners. It describes discovery, safe call sequence, approval-card fields,
action layers, consent requirements, delegation expectations, issuer request
fields, forbidden client-controlled fields, and receipt rules. The discovery
descriptor is served at `/.well-known/agentport.json` and exposed live over MCP
as `agentport://discovery`. The action model is also exposed live over MCP as
`agentport://action-model`.
Stable result, reason, presentation, and artifact codes are exposed live over
MCP as `agentport://protocol-codes`.

See `docs/mobile-agent-action-artifacts.md`.

The package also exports runner helpers from `@agentport/engine/core`:

- `AgentPortFrontierClient`
- `FileAgentPortFrontierClientStateStore`
- `buildAgentPortApprovalCard`
- `recordAgentPortApproval`
- `attachUserConsentAfterApproval`
- `buildIssuerDelegationRequest`
- `assertNoForbiddenIssuerFields`
- `validateActionReceipt`
- `assertValidActionReceipt`
- `Ed25519ActionReceiptSigner`
- `Ed25519GatewayTrustProfileSigner`
- `Ed25519GatewayTrustRootBundleSigner`
- `Ed25519GatewayTrustRootEmergencyDenyListSigner`
- `gatewayTrustRootEmergencyDenyListChangeHash`
- `recordGatewayTrustRootEmergencyDenyListApproval`
- `attachGatewayTrustRootEmergencyDenyListApproval`
- `actionReceiptSignatureExpectationsFromTrustProfile`
- `verifySignedActionReceiptGatewayTrustProfile`
- `verifySignedGatewayTrustRootBundle`
- `verifySignedGatewayTrustRootEmergencyDenyList`
- `gatewayTrustRootEmergencyDenyListToVerificationOptions`
- `gatewayTrustRootEmergencyDenyListEnvelopeHash`
- `publishSignedGatewayTrustRootEmergencyDenyList`
- `FileGatewayTrustRootEmergencyDenyListPublicationStore`
- `gatewayTrustRootBundleHash`
- `gatewayTrustProfileVerificationOptionsFromTrustRootBundle`

These helpers do not authenticate users, sign tokens, or act as an issuer. They
help a mobile/hosted runner enforce the client-side safety rules before it calls
the issuer and gateway, then validate the local receipt payload hash and expected
receipt bindings after the gateway responds. When supplied with trusted gateway
keys or an `agentport://gateway-trust-profile` resource, they also verify the
receipt signature and local key lifecycle metadata (`active`, `retired`,
`revoked`, `notBefore`, `expiresAt`). The local runner kit can verify signed
gateway trust-profile envelopes against pinned profile-authority keys before
trusting receipt keys, and can first verify a signed emergency deny-list feed
against pinned incident-authority keys before verifying signed trust-root bundle
envelopes against pinned update-authority keys with local update-key lifecycle
checks and emergency deny-list controls before deriving those verifier options from an
`agentport-gateway-trust-root-bundle` with local profile-authority key lifecycle
checks, raw-bundle deny-list controls, and optional bundle-level freshness
(`issuedAt`, `notBefore`, `expiresAt`, `sequence`).
`gatewayTrustRootBundleHash` lets runners pin the canonical raw-bundle digest
before accepting root keys, and
`minimumBundleSequence` prevents rollback to older still-pinned bundles during
rotation. Hosted trust registries, authoritative key/root publication, rotation
publication, incident-feed distribution, cache invalidation, revocation
propagation, monitoring, and compromise response still belong to the gateway
trust profile / hosted layer.
For publication workflows, the runner kit also exposes deterministic emergency
deny-list change hashes and compact approval metadata helpers. Those bind
operator approvals to the exact feed content before signing. A file-backed
reference publication store verifies a signed emergency deny-list before making
it current, rejects sequence rollback or sequenced-to-unsequenced downgrade, and
appends compact audit records with hashes/ids rather than raw signatures. The
publication helper also supports an `expectedCurrentEnvelopeHash` compare value
so hosted storage can reject stale operator workflows before overwriting current
state; the local file store models this check, while production must enforce it
with transactional conditional writes. The reference store can also write
publication records in hash-chain audit mode and verify the local chain to detect
mutation. It can create compact audit checkpoints (`entries` + `lastHash`) so a
hosted system can detect tail deletion when comparing a local log to an anchored
checkpoint. Checkpoints can be wrapped in an EdDSA signed envelope so verifiers
can require trusted checkpoint-authority keys before using them as anchors.
Hosted IAM, ticketing, quorum policy, KMS/HSM signing, immutable retention,
external anchoring, cache invalidation, monitoring, and audit retention remain
outside the open engine.

Thin vendor wrappers live in:

- `artifacts/vendor/claude-mcp-profile.v0.1.json`
- `artifacts/vendor/chatgpt-actions-openapi.v0.1.json`
- `artifacts/vendor/gemini-function-declarations.v0.1.json`

See `docs/vendor-agent-adapters.md`.

## Virtual Store Validation

`examples/virtual-store-tenant.json` is a fixture-backed verified store used to
validate mobile/general-agent action flows. It proves the portable action model
can drive discovery, availability, issuer-mediated exact user approval,
issuer-signed delegation, DPoP-bound gateway calls, replay rejection, booking,
and gateway-receipt handling without live credentials or proprietary hosted
state.
