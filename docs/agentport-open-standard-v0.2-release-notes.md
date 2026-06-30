# AgentPort Open Standard v0.2 Release Notes

Status: stable published as the v0.2 protocol cut. This is not AgentPort
certification, AgentPort Verified business status, real-business proof, or
live-backend proof.

Machine-readable status:
`examples/implementer-kit/protocol-publication.v0.2.json`.

Stable-cut review note:
`docs/agentport-open-standard-v0.2-stable-cut-review.md`.

External review checklist:
`docs/agentport-open-standard-v0.2-external-review-checklist.md`.

External review result:
`examples/implementer-kit/protocol-external-review-result.v0.2.json`.

Stable publication artifact:
`examples/implementer-kit/protocol-stable-publication.v0.2.json`.

## Included surfaces

- Role specs for frontier host, plugin wallet, business port endpoint, agent
  gateway, adapter, commitment registry, and A2A host binding.
- Action-intent, plugin-wallet, business-port, registry, gateway, protocol-trace,
  A2A gateway, and A2A host-adoption compatibility checks.
- Golden virtual-store traces and tamper fixtures for approval, consent,
  authority, receipt binding, lifecycle restore, role overclaim, adapter
  self-assertion, and business-port outcome upgrades.
- Schema-backed cut manifest and governance policy:
  `examples/implementer-kit/protocol-cut.v0.2.json` and
  `examples/implementer-kit/protocol-governance.v0.2.json`.

## Validation gate

The cut-readiness package is valid only when these local gates pass from this
checkout:

```bash
npm run public-package-audit
npm run conformance
npm test
git diff --check
```

The cut manifest also lists the role-level copyable commands for implementers.

## Claim boundary

Allowed claims are role-specific compatibility claims, for example "Passes
AgentPort Gateway conformance v0.2" or "Passes AgentPort A2A Host Adoption
compatibility check."

Forbidden claims remain:

- AgentPort Certified;
- AgentPort Verified business;
- real-business proof;
- live-backend proof;
- A2A replacement;
- gateway authority for plugins;
- backend confirmation authority for business ports.

## Stable publication blockers

The external review result is recorded as a local maintainer public-package
review. It clears the "review not recorded" blocker, but it is not independent
third-party certification.

The stable publication tag is `agentport-protocol-v0.2`. Any public tag or
release package must include this publication status artifact alongside the cut
manifest, governance policy, external-review packet, review result, and stable
publication artifact.

Certification, verified-business status, real-business proof, and live-backend
proof remain separate processes and remain false for this protocol publication.
