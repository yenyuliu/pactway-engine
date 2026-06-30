# AgentPort Protocol Conformance v0.1

This checklist turns `docs/protocol-compact.md` into testable implementation
claims. It is intentionally narrower than the full product roadmap.

Passing a profile means the implementation satisfies that technical behavior. It
does not make a gateway officially certified and does not make any business
`AgentPort Verified`.

## Report Shape

Validate conformance reports with:

```text
schemas/agentport-conformance-report.schema.json
```

The machine-readable profile artifact is:

```text
artifacts/agentport-conformance-profiles.v0.1.json
```

A report should include:

```json
{
  "protocol": "agentport",
  "version": "0.1",
  "implementation": {
    "name": "example-gateway",
    "version": "1.2.3",
    "buildId": "git:abc123"
  },
  "profiles": [
    {
      "name": "core-runtime",
      "status": "passed",
      "testsPassed": 12,
      "testsFailed": 0,
      "testsSkipped": 0
    }
  ],
  "generatedAt": "2026-06-20T00:00:00.000Z"
}
```

Allowed profile status codes:

- `passed`
- `failed`
- `skipped`
- `not_applicable`

## Profile: Core Runtime

Claim:

```text
Passes AgentPort Core Runtime conformance v0.1.
```

Required:

- Exposes a callable runtime surface for:
  - `find_services`
  - `get_business_info`
  - `check_availability`
  - `book_service`
- Exposes or publishes an action model equivalent to
  `agentport://action-model`.
- Exposes or publishes the compact code registry equivalent to
  `agentport://protocol-codes`.
- Returns structured tool results rather than opaque internal errors for known
  invalid input or unsupported capability.
- Preserves `businessId`, `serviceId`, and `bindingId` addressability where
  applicable.
- Uses stable code values from `docs/protocol-codes.md` for result and reason
  fields.

Forbidden:

- Fabricating verified facts when no verified record exists.
- Requiring live credentials, network access, wall-clock dependence, or hosted
  proprietary data to pass the profile.
- Hiding known policy rejections as internal runtime errors.

Minimum tests:

- `find_services` returns tagged verified services from a deterministic tenant.
- `get_business_info` returns structured not-found for an unknown business.
- `check_availability` returns unsupported, not an exception, when the adapter
  cannot check availability.
- Invalid tool input maps to invalid params or a structured rejection, not an
  unrelated internal failure.

## Profile: Capability Honesty

Claim:

```text
Passes AgentPort Capability Honesty conformance v0.1.
```

Required:

- Derives `tag.verified` only from `verification.status === "verified"`.
- Derives `tag.tier` from addressed binding and adapter capabilities.
- Treats verification and capability as separate signals.
- Degrades capability when backend credentials or configuration are missing.
- Blocks confirmed booking results from adapters without `confirmBooking: true`.
- Blocks `cancelled` and `rescheduled` outcomes from adapters without the
  corresponding manage capability.

Forbidden:

- Adapter-supplied `verified`, `tag`, `tier`, or `bindingId` overriding gateway
  derivation.
- Connected backend credentials upgrading an unverified business to verified.
- Returning `confirmed` from handoff-only or request-only bindings.

Minimum tests:

- Verified/manual service returns `tag.verified: true` with a non-confirm tier.
- Verified/confirm-capable service returns `tag.tier: "confirm"`.
- Unverified/connected service does not become verified.
- Capability violation returns `rejected` with
  `adapter_capability_violation` or `capability_exceeded`.

## Profile: Authority Evidence Checkpoint

Claim:

```text
Passes AgentPort Authority Evidence Checkpoint conformance v0.1.
```

Required:

- Normalizes accepted authority evidence into `AuthorityContext` before the
  gateway trust layer consumes it.
- Supports the AgentPort Local Profile, where the existing `DelegationProof`
  path is normalized into authority context for dev/test/demo compatibility.
- Applies authority policy before adapter execution for configured
  state-changing layers.
- Validates required local-profile proof fields, scope, exact action, business
  bound, service bound, audience, issuer, expiry, assurance, and
  revocation/verifier result when configured.
- Keeps authority evidence separate from `userConsent`.
- Exposes external AP2/UCP/ACP authority profiles as explicit verifier seams;
  profiles without a real verifier reject instead of parsing arbitrary JSON.
- Treats default confirm-capable `book_service` as `commit`.
- Prevents `lead` or request/handoff authority from escalating into a confirmed
  outcome.
- Returns stable authority/delegation reason codes from `docs/protocol-codes.md`.

Forbidden:

- Accepting authority evidence from tool arguments supplied by the client agent
  instead of a configured auth/provider layer.
- Storing raw authority tokens in tool arguments or portable results.
- Treating authority evidence as per-action consent.
- Executing an adapter after an authority gate failure.

Minimum tests:

- Local profile evidence normalizes to `AuthorityContext` with evidence refs,
  not raw tokens.
- Missing proof returns `rejected/delegation_required` when policy requires it.
- Wrong action returns `rejected/delegation_action_not_approved`.
- Wrong business returns `rejected/delegation_business_mismatch`.
- Wrong service returns `rejected/delegation_service_mismatch`.
- Expired proof returns `rejected/delegation_expired`.
- External UCP/ACP profile stubs reject without a real verifier.
- Lead-approved request cannot become confirmed and returns
  `rejected/requested_type_escalated`.

## Profile: Token Confirmation

Claim:

```text
Passes AgentPort Token Confirmation conformance v0.1.
```

Required:

- Supports configured token-confirmation method names:
  - `session`
  - `dpop`
  - `mtls`
  - `wallet`
- Enforces per-layer `requireTokenConfirmation` policy.
- Rejects missing token confirmation when the layer requires it.
- Rejects unsupported methods.
- Rejects malformed method-specific details.
- Records only method and public references/thumbprints in receipt/audit fields.

Forbidden:

- Treating sender-constraint metadata as user consent.
- Storing raw DPoP/session/wallet/mTLS proof tokens by default.
- Letting a bearer delegation proof satisfy a layer that requires sender
  constraint.

Minimum tests:

- Missing method returns `rejected/delegation_token_confirmation_required`.
- Unsupported method returns
  `rejected/delegation_token_confirmation_method_unsupported`.
- Malformed method details return
  `rejected/delegation_token_confirmation_invalid`.
- A stricter `commit` layer can reject a method accepted by a lower-risk `lead`
  layer.

## Profile: Action Receipt

Claim:

```text
Passes AgentPort Action Receipt conformance v0.1.
```

Required:

- Builds receipt facts inside the gateway after policy checks and backend
  execution or honest fallback.
- Strips adapter-supplied receipt fields.
- Computes canonical `payloadHash` from gateway-derived receipt payload.
- Lets the signer return only signature metadata such as issuer, key ID, and
  signature.
- Binds confirmed/cancelled/rescheduled outcomes to backend confirmation ID when
  present.
- Binds failed/rejected/request/handoff outcomes to reason/source fields when
  present.
- Preserves compact authority evidence refs, authority assurance,
  `delegationId`, `consentId`, client-agent reference, user reference, action
  layer, result type, and token-confirmation method when available.

Forbidden:

- Client-agent supplied `ActionReceipt` data being trusted.
- Adapter receipt facts overriding gateway receipt facts.
- Signer mutating action, business, service, result, reason, backend source, or
  delegation/consent references.

Minimum tests:

- Confirmed booking includes receipt with `resultType: "confirmed"` and backend
  confirmation binding.
- Rejected policy outcome includes receipt with rejection reason binding when a
  signer is configured.
- Adapter-supplied fake receipt is stripped and replaced.
- Recomputed canonical payload hash matches returned `payloadHash`.

## Profile: Compact Payload and Retention

Claim:

```text
Passes AgentPort Compact Payload conformance v0.1.
```

Required:

- Uses stable codes for result, reason, verification status, capability tier,
  and action layer.
- Uses references for business, service, binding, delegation, consent, backend
  confirmation, user, and client-agent identity.
- Uses hashes for action intent and receipt payload integrity.
- Keeps full records behind read tools or provider-owned storage instead of
  copying them into every state-changing response.
- Minimizes customer fields to those needed for the current action.

Forbidden by default:

- Raw delegation proof tokens in receipts or audit rows.
- Raw token-confirmation tokens in receipts or audit rows.
- Raw chat transcripts as protocol memory.
- Agent reasoning traces as protocol memory.
- Raw adapter response bodies as portable protocol output.
- Cross-business user memory built from action traffic.

Minimum tests:

- State-changing result contains codes and references sufficient to identify the
  action without embedding the full tenant record.
- Receipt/audit fixture does not contain raw delegation or token-confirmation
  token values.
- Customer payload fixture contains only fields required by the action.
- Raw adapter response fixture is normalized or omitted.

## v0.1 Required Bundle

A gateway may claim:

```text
Passes AgentPort Gateway Protocol conformance v0.1.
```

only when it passes:

- Core Runtime
- Capability Honesty
- Authority Evidence Checkpoint
- Token Confirmation
- Action Receipt
- Compact Payload and Retention

This is still a technical conformance claim. It is not `AgentPort Gateway
Certified` without the certification process in `CERTIFICATION.md`.

The corresponding report profile name is `gateway-protocol`.
