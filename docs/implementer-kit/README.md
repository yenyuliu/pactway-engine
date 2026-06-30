# AgentPort Implementer Kit

This directory is the role router for independent AgentPort implementers.

Use it when you want to implement one protocol role and make a precise
compatibility claim without private coordination. Passing a role check does not
mean AgentPort Certified, AgentPort Verified, or real-business proof.

## Protocol cut

The v0.2 cut-readiness package index is
`examples/implementer-kit/protocol-cut.v0.2.json`. It lists the public docs,
schemas, reports, examples, scripts, commands, release gates, and forbidden
claims that make up the current protocol cut-readiness package.

Load it after `docs/agentport-open-standard-v0.2-draft.md` when you need the
copyable artifact set instead of roadmap context.

The governance policy is `examples/implementer-kit/protocol-governance.v0.2.json`
with human-readable rules in `docs/agentport-protocol-governance-v0.2.md`.

The publication status is
`examples/implementer-kit/protocol-publication.v0.2.json`, with release notes in
`docs/agentport-open-standard-v0.2-release-notes.md` and package-boundary review
in `docs/agentport-open-standard-v0.2-stable-cut-review.md`. The external review
handoff is `examples/implementer-kit/protocol-external-review.v0.2.json` with
the checklist in
`docs/agentport-open-standard-v0.2-external-review-checklist.md`. The review
result is
`examples/implementer-kit/protocol-external-review-result.v0.2.json`; it records
the current stable-tag decision as `stable_tag_set`. The stable publication
artifact is `examples/implementer-kit/protocol-stable-publication.v0.2.json`.
These record that v0.2 is stable-published as a protocol cut, while
certification, verified-business status, real-business proof, and live-backend
proof remain false.

## Pick one role

| Role | Start here | Current proof path |
| --- | --- | --- |
| Frontier host | `frontier-host.md` | Action-intent profile plus v0.2 frontier-host role profile |
| Plugin | `plugin.md` | v0.2 `plugin-wallet-v0.2` profile; `agentport plugin-wallet-check`; `agentport action-intent-check --profile plugin-wallet` |
| Business port endpoint | `business-port-endpoint.md` | Role spec now; role CLI profile is planned |
| Gateway | `gateway.md` | v0.2 `gateway-runtime-v0.2` profile; `agentport gateway-protocol-check`; `agentport action-intent-check --profile gateway` |
| Adapter | `adapter.md` | v0.2 `adapter-capability-honesty-v0.2` profile; dedicated role CLI profile is planned |
| Commitment registry | `commitment-registry.md` | v0.2 `registry-lifecycle-v0.2` profile; dedicated role CLI profile is planned |
| A2A host binding | `a2a-host-binding.md` | A2A host trace, connector captures, event logs, and proof-pack redaction |

## Universal rules

- Model memory is not lifecycle truth.
- Plugin wallet state is not lifecycle authority.
- Business endpoints and adapters cannot self-assert verification, tier,
  binding, allowed actions, or receipts.
- The gateway derives allowed actions from authority, consent, readiness, and
  backend capability.
- The business backend remains the system of record.
- Receipts must bind upstream authority/consent evidence to downstream backend,
  lead-channel, or honest-fallback outcome.
- Protocol compatibility does not imply AgentPort certification or business
  verification.

## Claim boundary

| Claim | Allowed when | Forbidden implication |
| --- | --- | --- |
| AgentPort-compatible role implementation | The implementation passes the relevant role profile or proof-pack check | AgentPort Certified or AgentPort Verified |
| Passes Gateway protocol check | Gateway proof-pack validates and report keeps certification false | Real-business proof |
| Passes Plugin Wallet protocol check | Wallet proof-pack validates restore, consent, receipt refs, and redaction | Registry authority or gateway authority |
| Passes Action Intent compatibility check | Action-intent proof-pack validates bounded approval and restore behavior for the selected profile | Backend execution proof |
| Reference implementation compatible | Local fixture follows this repo's deterministic profile | Required production architecture |
| AgentPort Certified | Separate certification process | Automatic from open conformance |
| AgentPort Verified business | Ownership verification process | Automatic from protocol compatibility |

## Current commands

Build first:

```bash
npm run build
```

Gateway:

```bash
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures
node dist/cli/index.js gateway-protocol-check --input examples/gateway-protocol-proof-pack
```

Plugin wallet:

```bash
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures
node dist/cli/index.js plugin-wallet-check --input examples/plugin-wallet-proof-pack
```

Action intent:

```bash
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile frontier
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile plugin-wallet
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack --profile gateway
```

The role command family is:

```bash
agentport conformance gateway --input examples/protocol-v0.2
agentport conformance plugin --input examples/protocol-v0.2
agentport conformance adapter --input examples/protocol-v0.2
agentport conformance business-port --input examples/protocol-v0.2
agentport conformance registry --input examples/protocol-v0.2
```

For raw script/debug runs, use `--profile` on the v0.2 conformance runner:

```bash
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile gateway
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile frontierHost
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile pluginWallet
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile adapter
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile businessPort
node scripts/protocol-v02-conformance.mjs --input examples/protocol-v0.2 --expect-tamper-failures --profile registry
```

Frontier host conformance now has a v0.2 role profile; current host work also
uses `agentport action-intent-check --profile frontier` for approval-package
behavior.
