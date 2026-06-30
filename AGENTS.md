# AgentPort Agent Guide

AgentPort is the **neutral, truthful intake layer** between AI agents and the
real-world long tail: it makes businesses discoverable and actionable by agents,
with a verified-certification guarantee. It **fronts** the businesses' existing
backends — it is **never the system of record**. The canonical vision,
invariants, and build sequence live in **`docs/ROADMAP.md`**; read it first.

## Project Shape

Keep the open engine small and honest:

- `packages/core`: domain types, provider interfaces, adapter contract,
  capability resolution, binding IDs, verification attestation, local providers.
- `packages/server`: Streamable HTTP MCP runtime plus the `find_services`,
  `check_availability`, `book_service`, and `get_business_info` handlers.
- `packages/adapters/manual`: handoff-only reference adapter.
- `packages/adapters/fixture`: deterministic confirm-capable adapter for tests
  and demos, no credentials required.
- `packages/adapters/square`: Square Bookings skeleton that only confirms when
  real credentials and location configuration exist.
- `packages/conversion`: prototype hosted-side onboarding — turns a client
  submission + ownership into a verified, engine-servable tenant, then publishes.
- `scripts/demo.mjs`: local showroom for the confirm-vs-handoff story.
- `docs/`: `ROADMAP.md` (source of truth), per-slice plans (`*-plan.md`), and
  `docs/feedback/` (the pre-build critiques — see How We Work).
- `bridge/`, `scripts/codex-bridge.mjs`: **legacy** — an earlier two-agent
  workflow. Not the current interaction path; do not build for it or run it.

## Non-Negotiable Rules (the invariants — full list in `docs/ROADMAP.md`)

- **Capability honesty.** An adapter without `confirmBooking: true` must never
  produce a `confirmed` result. Honest degradation: `confirm → request → inform → handoff`.
- **Verified is earned, neutral, and can go stale.** A service is verified only
  when `verification.status === "verified"`. The status comes from proven
  ownership, never self-assertion; the certifying authority is AgentPort
  (`verifiedBy: "agentport"`), with `method` recording how it was checked; and an
  attestation can become `stale`. The engine *reports* attestation status — it
  does not compute freshness (that is hosted-side, clock-injected).
- **Never own the system of record (anti-Square).** Front the business's existing
  backend (Square/Calendly/phone); never become the bookings/POS/ledger. Backend
  credentials are referenced/vaulted, never embedded in the published tenant store
  or any tool result.
- **Adapters can't self-assert trust.** The server derives `tag`, `verified`, and
  `bindingId` from tenant data, capabilities, and binding position — adapter
  payloads cannot override them.
- **Consent.** `book_service` requires explicit `userConsent: true`; missing
  consent is a `rejected` policy outcome, not a backend failure.
- **Intake stays truthful.** Discovery/routing is merit-based — no biased
  pay-for-placement.
- **Grounded, never fabricate.** Any agent/assist surface composes facts from
  verified records; no verified match → refuse (`no_verified_info`), never guess.
- **Don't weaken conformance tests** to make a behavior pass.
- **Keep hosted concerns out of the open engine.** Network coverage, verified
  truth graphs, freshness pipelines, OAuth brokering, credential vaulting, durable
  audit retention, payments, analytics, and proprietary data belong behind
  provider interfaces or outside this repo.

## MCP Runtime Facts

- Dev server: `npm run dev -- --tenants ./examples/sample-tenant.json`.
- Default endpoint: `http://localhost:8723/mcp`. Transport: Streamable HTTP.
  Health check: `GET /healthz`.
- Tools: `find_services`, `check_availability`, `book_service`, `get_business_info`.
- Runtime resource `agentport://runtime` via `resources/list`/`resources/read`.
- Tool results include both text JSON and `structuredContent`.
- Invalid tool input → JSON-RPC invalid params, not opaque internal errors.
- Backend throws during availability → `{ supported: false, reason: "backend_error" }`.
- Backend throws during booking → `{ type: "failed", reason: "adapter_error", serviceId }`,
  audited as failed. (Lead-delivery failure → `reason: "lead_delivery_error"`.)

## How We Work

The build is **plan-driven**, not message-driven.

- The source of truth is `docs/ROADMAP.md`; each slice has a `docs/<slice>-plan.md`.
- **Before writing code for a plan, write a no-code critique** to
  `docs/feedback/<slice>.md`: ambiguities, contradictions, uncheckable acceptance,
  risks, and any invariant the plan can't satisfy. Surface these; then implement.
- **Never treat a final message as acceptance.** Completion is re-derived from
  `npm test`, the plan's stated acceptance, and the invariants above.
- Keep changes narrow and package-local. Items sharing a file — especially
  `packages/core/src/types.ts` and `packages/server/src/handlers.ts` — must
  serialize or run in separate worktrees.

## Commands

```bash
npm install
npm run build
npm test
npm run demo
npm run dev -- --tenants ./examples/sample-tenant.json
npm audit --omit=dev
```

`CONTRIBUTING.md` mentions `npm run typecheck`, but this checkout does not define
that script. Prefer `npm test`.

## Implementation Style

- Front the backend; never become it. Prefer provider interfaces (`TenantStore`,
  `TruthStore`, `AuthProvider`, `AuditSink`, `AnalyticsSink`, `LeadSink`,
  `CredentialVault`) over adding hosted behavior directly.
- Add fixture-backed, deterministic tests; CI must not require live credentials,
  network, wall-clock, or randomness — inject fakes/clocks.
- For HTTP/MCP boundary work, include a real Streamable HTTP smoke test on an
  ephemeral port when practical.
- If touching public behavior, update or add focused tests under `test/`.
