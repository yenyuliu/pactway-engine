# AgentPort Open Standard v0.1

AgentPort Open Standard v0.1 defines the minimal gateway contract for making a
service business discoverable, truthful, and safely actionable by client agents.

The standard is licensed under Apache-2.0 with the AgentPort open engine.

## Scope

AgentPort standardizes the gateway behavior between client agents and service
businesses. It does not standardize payments, checkout, user delegation tokens,
rankings, ads, or hosted registry operations.

## Roles

Five roles interact across the AgentPort protocol:

| Role | Responsibility |
|---|---|
| `frontier_model` | Talks to the user, reasons, explains. Never holds ticket state directly. Reads ground truth from the plugin on every session. |
| `plugin` | Action harness + ticket wallet + session bridge on the frontier side. Stores ticket refs durably, restores them across sessions, routes actions to business port endpoints, preserves receipts, and prevents the model from fabricating ticket state. |
| `business_port_endpoint` | Business-facing receiving endpoint. Accepts standardized ticket and action requests from the plugin and forwards them to the gateway for verification. |
| `gateway` | AgentPort-compatible MCP server. Verification, standardization, and lifecycle authority. Derives capability honestly from the adapter. Never the business's system of record. |
| `adapter` | Backend connector that fronts the business's existing system of record. Cannot self-assert trust, verification, readiness, or tier. |
| `commitment_registry` | Durable ticket state and full event history. Source of truth for lifecycle queries. Owned by the neutral protocol layer, not by any single frontier model or business. |
| `owner` | Reviews facts and proves business ownership. Initiates the verification process that unlocks higher action tiers. |

The `plugin` and `commitment_registry` are the components that distinguish
AgentPort from a stateless API call. The plugin gives frontier models durable
action memory across sessions. The registry owns the lifecycle so no single
party controls the truth.

## Required Resources

- `/.well-known/agentport.json` routes agents to the gateway.
- `agentport://open-standard` exposes this standard in machine-readable form.
- `agentport://client-use-policy` tells agents when AgentPort should be used
  before browsing.
- `agentport://action-model` describes consent, authority, and receipt rules for
  actions.
- `agentport://plugin-wallet` describes the frontier-side plugin wallet contract:
  local ticket storage, session restore, approval gating, encryption requirements,
  and forbidden fields. Reference artifact: `artifacts/agentport-plugin-wallet.v0.1.json`.
- `agentport://runtime` lists the live tools and adapters.

## Tool Classes

### Public Read

The gateway SHOULD allow anonymous or unauthenticated callers to use public read
tools when abuse controls permit:

- `find_services`
- `get_business_info`
- `get_business_feed`

These tools do not grant permission to act. They expose facts, verification
status, citations, capability tiers, and limits so agents can represent the
business accurately.

### Operational Read

`check_availability` MAY be public, API-keyed, rate-limited, or policy-gated.
It is not state-changing, but it can be abuse-sensitive.

### State-Changing Action

The gateway MUST require explicit user consent for:

- `book_service`
- `cancel_service`
- `reschedule_service`
- future order, quote, payment, and management actions

Production gateways SHOULD also require accepted authority evidence for
state-changing actions according to their policy.

## Capability Honesty

Gateways MUST derive exposed action tiers from backend adapter capabilities.

Adapters cannot self-assert verification, readiness, or trust. A gateway MUST
not return a confirmed booking unless the addressed adapter honestly supports
confirmation and the backend outcome actually confirmed.

Honest degradation is:

```text
confirm -> request -> inform -> handoff
```

## Verification

`verified` means ownership was proven and recorded by the gateway's verification
authority. It is never self-asserted by the adapter or business payload.

`stale` and `unverified` must remain visible limits. Agents must not describe
stale or unverified records as verified.

## Business Feed

`get_business_feed` is the preferred representation surface for client agents.
It defaults to `mode: "compact"` so agents can avoid extra reference reads and
payload weight. `mode: "full"` is for implementers, debugging, and richer
inspection.

Agents MAY pass `intent` to reduce retrieval to the current decision:

- `answer`: owner-approved facts and answer affordance.
- `book`: availability and booking affordances.
- `manage`: cancellation and rescheduling affordances.
- `compare`: compact trust, tier, and citation context.

`intent` is not authorization. State-changing tools still require explicit
consent and configured authority policy.

Agents MAY pass `ifBusinessVersion` when they already hold a feed for the same
`businessId`, `mode`, and `intent`. If the gateway computes the same current
business version, it SHOULD return `notModified: true` with `businessVersion`
and `cache` metadata instead of repeating the full feed.

Feed cache memory is limited to versioned business truth and capability refs.
Gateways and clients MUST NOT use it to store raw authority tokens, secrets,
payment credentials, model reasoning, transcripts, or broad cross-business user
preferences.

Compact mode should include:

- representative facts;
- verification status;
- path-level citations;
- per-service action affordances;
- top-level `nextActions`;
- explicit `cannotDo` limits;
- deterministic `businessVersion` cache metadata;
- representative limits;
- agent instructions.

The feed is what makes AgentPort more useful than browsing when truth and
fulfillment matter.

## Efficient Runtime Path

Normal client-agent path:

```text
discover -> get_business_feed(mode=compact) -> answer or request exact approval
-> action tool only if needed
```

When the agent already knows the user intent, it should prefer:

```text
discover -> get_business_feed(mode=compact, intent=answer|book|manage|compare)
-> use nextActions or cannotDo -> action tool only if needed
```

Implementer path:

```text
read open standard -> read schemas -> run conformance tests
```

Static resources such as `agentport://open-standard`,
`agentport://client-use-policy`, `agentport://action-model`, and
`agentport://protocol-codes` are cacheable references. Agents should not fetch
all of them on every ordinary business question.

## Ticket Lifecycle (Plugin Perspective)

The plugin is responsible for the full ticket lifecycle across sessions:

```text
Plugin responsibilities
├── Store ticket references on creation
├── Restore ticket context when session reconnects
├── Track pending and in-flight actions
├── Poll for lifecycle changes
├── Rehydrate proof when the user returns
├── Route ticket actions to business port endpoints
├── Preserve receipts durably
├── Require explicit user approval before state-changing actions
└── Prevent the frontier model from fabricating ticket state
```

Initial booking flow:

```text
User -> Frontier Model -> Plugin -> Business Port Endpoint
                                 -> Gateway -> Commitment Registry
                                 <- verified state + receipt
     <- Plugin persists ticket ref
     <- Model reports honest outcome
```

Session restore flow (user returns later):

```text
User -> Frontier Model -> Plugin
     Plugin loads stored commitment ref
     Plugin calls get_ticket_status(commitmentRef) on Gateway
     Gateway reads Registry -> returns standardized state
     Plugin gives Model ground truth
     Model reports current state — no hallucination
```

## Action Flow

```text
discover -> public read -> choose action -> consent -> authority policy ->
resolve business/service/binding -> check capability -> call adapter ->
return result/receipt -> plugin persists receipt -> audit
```

## Refusal Rules

Gateways MUST refuse or hand off instead of guessing when:

- no verified match exists for a verified-answer request;
- the requested action exceeds adapter capability;
- consent is missing for a state-changing action;
- authority evidence is required but invalid or absent;
- the backend fails or cannot prove completion.

## Open/Hosted Boundary

Open standard:

- schemas;
- resource shapes;
- tool names and classes;
- capability and verification semantics;
- conformance expectations.

Implementation-specific or hosted:

- business registry coverage;
- owner portal;
- credential vault;
- OAuth brokering;
- verification jobs;
- analytics;
- lead delivery infrastructure;
- trust root distribution;
- commercial routing.
