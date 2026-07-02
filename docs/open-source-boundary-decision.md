# Open-source boundary decision

Status: working decision for publishing the open protocol.

This decision is grounded in the current repo shape, especially
`docs/ROADMAP.md`, `docs/SIMPLE_BLUEPRINT.md`, `GOVERNANCE.md`, `package.json`,
`packages/core`, `packages/server`, `packages/conversion`, `packages/verification`,
`scripts`, `schemas`, `artifacts`, and `examples`.

## Decision

Publish AgentPort as an open protocol and reference engine, not as the full
hosted business.

Open-source should make independent implementers able to build and validate a
compatible role without private coordination. Private/proprietary code should
own the monetizable hosted product: verified business network coverage, owner
workflow, production trust operations, credential and identity brokering,
analytics, distribution, and certification operations.

The public promise remains:

```text
profile/setup -> discovery -> exact approval -> gateway execution or routing -> receipt/trace
```

The open protocol proves this loop can be implemented honestly. The private
business turns the loop into a verified network and paid operating product.

## Open-source

These should stay open under the Apache-2.0 engine.

| Area | Current code/docs | Why open |
| --- | --- | --- |
| Core domain types | `packages/core/src/types.ts` | Defines the shared language: tenants, bindings, services, verification attestation, commitments, receipts, consent-gated requests. |
| Adapter SDK and capability honesty | `packages/core/src/contracts.ts`, `packages/core/src/capabilities.ts`, `packages/adapters/*` | Third parties need to implement adapters without overstating confirm/request/inform support. |
| Provider interfaces | `packages/core/src/providers.ts` interfaces such as `TenantStore`, `TruthStore`, `AuthProvider`, `AuditSink`, `AnalyticsSink`, `LeadSink`, `CredentialVault` | These are the seam that keeps hosted behavior out of the open engine. |
| MCP runtime and handlers | `packages/server/src/mcp.ts`, `packages/server/src/handlers.ts` | This is the reference gateway behavior and the main conformance target. |
| Discovery and public resources | `packages/server/src/discovery.ts`, `packages/server/src/open-standard.ts`, `packages/server/src/protocol-codes.ts`, public `agentport://...` resources | Implementers need stable descriptor, code, and resource shapes. |
| Action intent and approval helpers | `packages/server/src/intent.ts`, `packages/core/src/action-runner-kit.ts` | Safe client-host adoption needs reusable exact-approval and preflight behavior. |
| Plugin wallet contract and reference helpers | `packages/core/src/plugin-wallet.ts`, `packages/server/src/plugin-wallet-contract.ts`, `artifacts/agentport-plugin-wallet.v0.1.json` | The wallet is part of the interoperability story. Keep the contract and deterministic local helper open; keep production key custody private. |
| Compact receipts, traces, and conformance | `packages/core/src/execution-trace.ts`, `packages/server/src/protocol-v02-trace.ts`, `schemas`, `examples/protocol-v0.2`, `scripts/protocol-v02-conformance.mjs`, `scripts/conformance.mjs` | Compatibility must be independently testable. |
| Implementer docs | `docs/agentport-open-standard-v0.1.md`, `docs/agentport-protocol-v0.2.md`, `docs/implementer-kit/*`, `CONFORMANCE.md`, `GOVERNANCE.md` | The public protocol needs role boundaries and exact allowed claims. |
| Deterministic demos and fixtures | `examples/sample-tenant.json`, fixture/manual adapters, tamper fixtures | Open adopters need runnable examples with no credentials, network, or real business data. |

Open-source claim language should be limited to:

- `AgentPort-compatible`
- `Passes <role> conformance`
- `Reference implementation`

It must not imply:

- `AgentPort Certified`
- `AgentPort Verified business`
- real-business proof
- marketplace ranking
- production identity or payment authority

## Private or proprietary

These should stay private, or be published only as redacted fixtures/contracts,
because they are the commercial moat or production trust depth.

| Area | Current repo signal | Keep private because |
| --- | --- | --- |
| Business registry coverage and verified truth graph | Provider seams in `TenantStore`/`TruthStore`; roadmap hosted scope | Network coverage, freshness, drift detection, and verified records are core business assets. |
| Business Co-Pilot product and owner portal | `packages/conversion/src/operator-flow.ts`, `presence-audit.ts`, `copilot.ts`, many presentation/live-run schemas | The public can see the protocol shape, but the hosted owner workflow, diagnostics, conversion UX, and pilot operations are monetizable. |
| Real draft-from-URL pipeline and model prompts | `packages/conversion/src/draft.ts`, `anthropic.ts`, operator commands | Keep minimal interfaces and deterministic sample drafter open; keep production extraction prompts, scoring, enrichment, and site evidence operations private. |
| Ownership verification operations | `packages/verification/src/index.ts`, verification plans | Publish proof method contracts and safe reference verifiers; keep production verification vendors, operator review tooling, fraud controls, and reverification jobs private. |
| Credential vaulting and OAuth brokering | `CredentialVault` interface, credential tests, Square skeleton | The interface is open; actual vault, OAuth brokering, token refresh, account mapping, and backend credential operations are private. |
| Production issuer/passkey service | `packages/server/src/issuer-web.ts`, issuer/passkey plans/tests | A small reference issuer can be open, but production login, KMS/HSM, revocation registry, replay stores, account recovery, and audit retention are hosted trust depth. |
| Production registry | Commitment schemas and proof packs exist; no full hosted datastore should be public | Lifecycle schemas and conformance are open; the durable registry implementation, storage model, fraud controls, and operational dashboards are private. |
| Demand graph and analytics | `AnalyticsSink` seam, roadmap demand graph | Aggregated unmet demand, conversion analytics, marketplace insights, and owner dashboards are proprietary business value. |
| Lead delivery infrastructure | `LeadSink` seam, request-tier handlers | Public contract can show lead/request outcome; production inbox, retries, deliverability, routing, and owner CRM integrations are private. |
| Hosted frontier/vendor distribution | `artifacts/vendor/*`, `scripts/chatgpt-*`, `scripts/hosted-gateway.mjs` | Keep generic integration contracts open; keep deployed connector packages, tunnels, tenant-specific evidence, and distribution ops private or generated outside the open package. |
| Certification operations and marks | `CERTIFICATION.md`, `TRADEMARK.md`, `GOVERNANCE.md` | Criteria can be public, but certification review, revocation operations, customer status, and mark licensing are business assets. |
| Payments and commercial routing | Governance and standard explicitly exclude this | Do not open-source payment custody or ranking economics; also do not put them in the open engine. |

## Publication hardening applied

This pass applies the first public-package boundary:

- `package.json` no longer exports `./conversion`, `./conversion/onboard`,
  `./conversion/operator`, or `./verification`.
- `package.json.files` is now an explicit public whitelist instead of broad
  `packages`, `docs`, `examples`, `schemas`, and `artifacts` folders.
- `packages/server/src/public.ts` is the public server entrypoint for npm. It
  excludes hosted issuer-web, vendor artifact generation, and ChatGPT app helper
  exports from `@agentport/engine/server`.
- `packages/cli/src/public.ts` is the public npm binary. It is limited to
  `agentport conformance <role>` checks, so the hosted operator workflow is not
  bundled into the public package binary.
- `npm pack --dry-run --json` is the release check for accidental package leaks.
- `scripts/public-package-audit.mjs` wraps the package dry-run and scans public
  bundles for hosted/operator strings.
- `scripts/public-install-smoke.mjs` packs the real tarball, installs it in a
  temporary project, imports public exports, verifies private exports stay
  unavailable, and runs the installed public conformance CLI.
- `docs/public-private-pr-publishing.md` defines public-only, private-only, and
  paired PR flow.

## Residual boundary risks

1. The open repository still contains hosted prototype code under
   `packages/conversion`, `packages/verification`, internal CLI commands, and
   many plan docs. That is acceptable for a private development repo, but a
   public repository split should either move those files or clearly label them
   as hosted prototypes.

2. `packages/core/src/index.ts` still exports signing and trust-root publication helper
   implementations with PEM private-key paths. That is acceptable for local
   fixtures, but public docs must mark them reference-only and not production
   key custody.

3. The internal `dist/cli/index.js` and `dist/server/index.js` still exist after
   build for repo tests and internal scripts. They are deliberately not in the
   public npm `files` whitelist.

4. The README still describes hosted/repo workflows because this checkout is not
   yet a clean public-only repository. The public npm surface is now documented
   separately.

## Recommended publication shape

Use two distributions.

### 1. Public open repo/package

Public GitHub repository: `yenyuliu/pactway-engine`.

Npm package: `@agentport/engine`, kept as the legacy compatibility package until
a versioned `pactway` package alias exists.

Include:

- `packages/core`
- `packages/server` reference runtime, excluding hosted-only entrypoints where practical
- `packages/adapters/manual`
- `packages/adapters/fixture`
- `packages/adapters/square` skeleton
- public `schemas`
- public `artifacts` needed for protocol, discovery, action model, plugin wallet,
  conformance, commitment, and client use policy
- `examples/protocol-v0.2`, sample tenants, adapter fixtures, conformance reports
- `docs/agentport-open-standard-v0.1.md`
- `docs/agentport-protocol-v0.2.md`
- `docs/implementer-kit/*`
- `GOVERNANCE.md`, `CONFORMANCE.md`, `CERTIFICATION.md`, `TRADEMARK.md`
- deterministic conformance and demo scripts

Do not include by default:

- `packages/conversion/src/operator-flow.ts`
- real owner/presentation/live-run operator artifacts
- deployed vendor artifacts under `artifacts/vendor/*.deployed.json`
- hosted gateway launch scripts
- real business evidence, tenant data, or external connector configuration

### 2. Private hosted repo/package

Name: internal, for example `pactway-hosted` or `pactway-cloud`.

Own:

- Business Co-Pilot application
- owner portal and inbox
- real draft-from-URL extraction and enrichment
- verification operations and reverification jobs
- credential vault and OAuth brokering
- production issuer/passkey/account recovery
- production registry and audit retention
- demand graph and analytics
- lead delivery infrastructure
- hosted vendor connector packaging and deployment
- certification workflow and customer status

## Concrete next steps

1. Keep `npm pack --dry-run --json` in the release checklist and fail the release
   if it includes `packages/conversion`, `packages/verification`,
   `dist/conversion`, `dist/verification`, `artifacts/vendor`, presentation
   examples, or broad internal plan docs.

2. Keep provider interfaces open, but ensure every production implementation is
   injected from hosted code.

3. Add public docs that say: open conformance is compatibility, not AgentPort
   certification or verified-business status.

4. Split the repository itself when ready: move Business Co-Pilot, production
   verification, hosted issuer/passkey, demand graph, and vendor deployment code
   into a private hosted package/repo.

5. Run `npm run conformance` after each packaging change, then inspect `npm pack
   --dry-run` before any public release.

## Bottom line

Open the protocol, reference gateway, adapter SDK, plugin wallet contract,
schemas, conformance, and deterministic fixtures.

Keep private the network, owner workflow, verification operations, credential
and identity depth, registry operations, analytics, lead delivery, connector
distribution, and certification business.

That gives outside implementers enough to trust and adopt AgentPort while
preserving the profit engine around verified business readiness and hosted
execution.
