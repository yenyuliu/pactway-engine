# AgentPort Open Standard v0.2 External Review Checklist

Status: ready for external review as a cut-readiness package. This checklist is
for independent implementers or reviewers validating the public v0.2 protocol
cut. It is not a stable publication tag, AgentPort certification, AgentPort
Verified business status, real-business proof, or live-backend proof.

Machine-readable review packet:
`examples/implementer-kit/protocol-external-review.v0.2.json`.

Recorded review result:
`examples/implementer-kit/protocol-external-review-result.v0.2.json`.

## Review Inputs

Read these public files in order:

1. `docs/protocol-compact.md`
2. `docs/agentport-open-standard-v0.2-draft.md`
3. `examples/implementer-kit/protocol-cut.v0.2.json`
4. `examples/implementer-kit/protocol-governance.v0.2.json`
5. `examples/implementer-kit/protocol-publication.v0.2.json`
6. `docs/agentport-open-standard-v0.2-release-notes.md`
7. `docs/agentport-open-standard-v0.2-stable-cut-review.md`

Then pick the role being reviewed from `docs/implementer-kit/README.md`.

## Required Local Gates

Run these from a clean checkout:

```bash
npm run public-package-audit
npm run conformance
npm test
git diff --check
```

The package audit must pass with no `blocked_path_packed`,
`required_public_file_missing`, `protocol_cut_ref_not_packed`, or
`hosted_string_in_public_bundle` issues.

## Role Checks

At least one role-specific check must be reviewed for the implementation claim:

- Gateway:
  `node dist/cli/index.js gateway-protocol-check --input examples/gateway-protocol-proof-pack`
- Plugin wallet:
  `node dist/cli/index.js plugin-wallet-check --input examples/plugin-wallet-proof-pack`
- Action intent:
  `node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack`
- Business port:
  `node dist/cli/index.js business-port-check --input examples/business-port-proof-pack`
- Commitment registry:
  `node dist/cli/index.js registry-check --input examples/commitment-registry-proof-pack`
- Protocol traces:
  `node dist/cli/index.js protocol-trace-check --input examples/protocol-golden-trace-matrix.v0.1.json`
- A2A host binding:
  `node scripts/a2a-gateway-check.mjs --host-trace examples/a2a-host-trace.passing.v0.1.json --strict`

## Acceptance

An external review passes only if:

- every cut-manifest reference exists in the packed npm artifact;
- internal feedback, planning docs, hosted-only packages, and vendor artifacts
  are absent from the public package;
- virtual-store and A2A host-adoption evidence are described as compatibility
  evidence only;
- the selected role emits a passing compatibility report;
- tamper fixtures fail closed for consent, authority, receipt binding, lifecycle
  authority, adapter self-assertion, role overclaim, and business-port outcome
  upgrades;
- all public claims stay inside the allowed compatibility language.

The recorded result for this cut is a local maintainer public-package review,
not independent third-party certification. Its stable-tag decision is
`stable_tag_set`.

## Forbidden Conclusions

The reviewer must not conclude or state:

- AgentPort Certified;
- AgentPort Verified business;
- real-business proof;
- live-backend proof;
- A2A replacement;
- gateway authority for plugins;
- backend confirmation authority for business ports.
