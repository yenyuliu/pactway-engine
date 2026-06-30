# AgentPort Open Standard v0.2 Stable-Cut Review

Status: package audit passed and stable publication is recorded for the v0.2
protocol cut. This is still not AgentPort certification, AgentPort Verified
business status, real-business proof, or live-backend proof.

## Included

- v0.2 technical freeze: `docs/agentport-protocol-v0.2.md`
- v0.2 open standard draft:
  `docs/agentport-open-standard-v0.2-draft.md`
- v0.2 cut manifest:
  `examples/implementer-kit/protocol-cut.v0.2.json`
- v0.2 governance policy:
  `examples/implementer-kit/protocol-governance.v0.2.json`
- v0.2 publication status:
  `examples/implementer-kit/protocol-publication.v0.2.json`
- v0.2 external review packet:
  `examples/implementer-kit/protocol-external-review.v0.2.json`
- v0.2 external review result:
  `examples/implementer-kit/protocol-external-review-result.v0.2.json`
- v0.2 stable publication artifact:
  `examples/implementer-kit/protocol-stable-publication.v0.2.json`
- v0.2 external review checklist:
  `docs/agentport-open-standard-v0.2-external-review-checklist.md`
- role specs under `docs/implementer-kit/`
- role proof packs, golden traces, tamper fixtures, compatibility reports,
  schemas, and check scripts referenced by the cut manifest.

## Excluded

- AgentPort certification or official mark grant;
- AgentPort Verified business status;
- real-business proof;
- live-backend proof;
- hosted credential vault, owner accounts, payments, analytics, or freshness
  pipelines;
- internal feedback notes and planning docs.

## Required gates

Run these before promoting beyond cut readiness:

```bash
npm run public-package-audit
npm run conformance
npm test
git diff --check
```

The package audit must verify that every public artifact referenced by
`examples/implementer-kit/protocol-cut.v0.2.json` is present in the packed npm
artifact. The external review result records the current decision as
`stable_tag_set` for `agentport-protocol-v0.2`.

## Claim boundary

Allowed claims remain role-specific compatibility claims, such as "Passes
AgentPort Gateway conformance v0.2."

Forbidden claims remain AgentPort Certified, AgentPort Verified business,
real-business proof, live-backend proof, A2A replacement, gateway authority for
plugins, and backend confirmation authority for business ports.
