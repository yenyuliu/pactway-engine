# Roadmap: Open protocol implementer kit

This roadmap owns the open-protocol expansion lane. It now tracks protocol cut
readiness: AgentPort has a reference engine, role-specific specs, compatibility
commands, proof packs, schema-valid reports, and deterministic tamper fixtures.
The remaining work is packaging, claim hygiene, and extension/governance polish
so outside implementers can adopt the surfaces without private coordination.

Source plan: `docs/open-protocol-implementer-kit-plan.md`.
Round-1 critique: `docs/feedback/open-protocol-implementer-kit.md`.

## North star

An independent implementer can choose one AgentPort role, build against the
public contract, run a deterministic conformance command, and publish a
schema-valid report with exact claim language.

The protocol claim is compatibility, not certification. Passing conformance does
not make a gateway AgentPort Certified and does not make a business AgentPort
Verified.

## Current reality

What exists now:

- reference open engine and MCP gateway runtime;
- adapter contracts and reference manual/fixture/Square adapter paths;
- protocol docs for compact rules, open standard, conformance v0.1, and external
  quickstart;
- `docs/implementer-kit/` role router with one-page role specs and claim
  boundaries;
- machine-readable artifacts for action model, client use policy, protocol codes,
  plugin wallet, discovery, and conformance profiles;
- schemas for public role, trace, proof-pack, and report artifacts;
- role compatibility checks for frontier host, gateway, plugin wallet, action
  intent, business port, commitment registry, protocol trace matrix, A2A
  gateway, and A2A host adoption;
- deterministic passing and failing host traces, including A2A host proof-pack
  packaging;
- `npm run conformance` and `npm test` gates covering the local reference engine
  and protocol artifacts.

What is not done yet:

- no vendored tarball or copied protocol-cut directory yet; the current package
  surface is a manifest index at `examples/implementer-kit/protocol-cut.v0.2.json`;
- extension/governance rules are now packaged as a cut-readiness policy at
  `examples/implementer-kit/protocol-governance.v0.2.json`;
- publication status is now packaged at
  `examples/implementer-kit/protocol-publication.v0.2.json`; it marks the cut
  ready for external review, not stable publication;
- real-business verification and live backend proof remain intentionally outside
  this virtual-store/host-adoption cut.

## Role architecture

```text
frontier host
  -> plugin / ticket wallet
  -> business port endpoint
  -> gateway
  -> adapter
  -> existing business backend

gateway <-> commitment registry
```

Each role must have a separate implementation path and conformance profile. The
protocol fails if the model, plugin, endpoint, adapter, or registry can
self-assert truth that belongs to the gateway or lifecycle authority.

## Roadmap at a glance

```text
R0. Stabilize current gateway baseline              DONE
R1. Publish role-specific kit map                   DONE
R2. Add role-specific conformance profiles          DONE
R3. Add canonical traces and tamper matrix          DONE
R4. Add role CLI commands and schema-valid reports  DONE
R5. Package external adopter examples              MANIFEST PACKAGED
R6. Cut open protocol v0.2 draft                    CUT READINESS
R7. Governance, claims, and extension process       CUT READINESS POLICY
R8. Publication status and stable-cut boundary      REVIEW READY
R9. External review handoff                         REVIEW RECORDED
R10. Stable protocol tag                            TAGGED
```

## R0 - Stabilize current gateway baseline

Goal: keep the gateway protocol golden trace work as the reusable baseline for
the wider kit.

Current state: done for the virtual-store/reference path. The gateway protocol
proof pack, golden trace matrix, and v0.2 tamper harness are local, deterministic,
and non-certifying.

Build items:

- gateway protocol compliance report schema;
- canonical Virtual Store gateway compliance example;
- direct artifact checks for discovery, approval, consent, lifecycle, receipt,
  wallet restore, redaction, and system-of-record boundary;
- negative matrix where direct tampering fails;
- report flags that keep public certification and real-business proof false.

Exit gate:

- gateway trace validation fails non-zero on tampered artifacts;
- the report validates against schema;
- claim wording is "protocol compliance", not certification.

## R1 - Publish role-specific kit map

Goal: make the protocol implementable by role instead of by repo archaeology.

Current state: done for the current role set. The role router points
implementers to gateway, plugin wallet, business-port endpoint, adapter, and
commitment-registry responsibilities, with claim boundaries before command
execution.

Build items:

- `docs/implementer-kit/README.md`;
- one-page role specs for frontier host, plugin, business port endpoint,
  gateway, adapter, and commitment registry;
- required inputs, outputs, forbidden behavior, schemas, examples, commands, and
  allowed claims for each role;
- update `docs/external-implementer-quickstart.md` to route by role.

Exit gate:

- a new implementer can pick a role and know the minimum proof without reading
  the full roadmap;
- claim boundaries are visible before any conformance command is run.

## R2 - Add role-specific conformance profiles

Goal: make each role's promise machine-checkable.

Current state: done for the current protocol cut. The v0.2 conformance report
contains role profiles for gateway runtime, plugin wallet, adapter capability
honesty, business-port forwarding, and registry lifecycle. Action intent,
business-port, registry, protocol-trace, A2A gateway, and A2A host adoption
reports add schema-valid compatibility checks around those profiles.

Profiles:

- `frontier-host-session-discipline`;
- `plugin-wallet`;
- `business-port-forwarding`;
- `gateway-runtime`;
- `gateway-authority-checkpoint`;
- `gateway-action-receipt`;
- `adapter-capability-honesty`;
- `registry-lifecycle`;
- `compact-retention-redaction`.

Exit gate:

- each profile has a stable profile ID, required checks, forbidden checks,
  negative mutation cases, report status, and exact claim string;
- profiles distinguish compatible implementation from certification and
  business verification.

## R3 - Add canonical traces and tamper matrix

Goal: make correct behavior and failure behavior portable.

Current state: done for the virtual-store/reference cut. Golden traces and
tamper fixtures cover approval before execution, missing consent, missing
authority, argument drift, adapter self-assertion, business-port outcome
upgrades, forged receipts, registry lifecycle authority, and A2A host shortcuts.

Trace families:

- public read and compact business feed;
- request or handoff;
- confirmed backend action;
- missing consent rejection;
- missing authority rejection;
- capability exceeded rejection;
- plugin returned-session restore;
- registry terminal lifecycle read;
- adapter self-assertion stripped or rejected;
- receipt/backend mismatch rejected;
- private payload redaction failure.

Exit gate:

- every positive trace has at least one tamper fixture;
- validation checks direct artifacts, not only summary flags;
- fixtures are deterministic and credential-free.

## R4 - Add role CLI commands and reports

Goal: give implementers a runnable compatibility harness.

Current state: done through the current command surface. The implementation uses
copyable role-specific commands rather than a nested `agentport conformance`
namespace:

```bash
node dist/cli/index.js gateway-protocol-check --input examples/gateway-protocol-proof-pack
node dist/cli/index.js plugin-wallet-check --input examples/plugin-wallet-proof-pack
node dist/cli/index.js action-intent-check --input examples/action-intent-proof-pack
node dist/cli/index.js business-port-check --input examples/business-port-proof-pack
node dist/cli/index.js registry-check --input examples/commitment-registry-proof-pack
node dist/cli/index.js protocol-trace-check --input examples/protocol-golden-trace-matrix.v0.1.json
node scripts/a2a-gateway-check.mjs
node scripts/a2a-gateway-check.mjs --host-trace examples/a2a-host-trace.passing.v0.1.json --strict
node scripts/a2a-host-proof-pack.mjs --input examples/a2a-host-trace.passing.v0.1.json --out-dir /tmp/a2a-host-pack --strict
```

Exit gate:

- each command emits a schema-valid report;
- failed required checks exit non-zero;
- `npm run conformance` still runs the reference engine profile set without
  network, credentials, wall-clock dependence, or randomness.

## R5 - Package external adopter examples

Goal: make adoption possible outside this checkout.

Current state: manifest packaged. Copyable examples exist across `examples/` for
the current protocol roles and A2A host proof pack. The current cut surface is
the schema-backed manifest at `examples/implementer-kit/protocol-cut.v0.2.json`,
which references the public docs, schemas, reports, examples, scripts, commands,
release gates, and claim boundaries without duplicating every artifact body.

Build items:

- `examples/implementer-kit/protocol-cut.v0.2.json`;
- `schemas/agentport-protocol-cut-manifest.schema.json`;
- versioned role examples where a copied fixture is more useful than a reference;
- minimal fixture server where useful;
- adapter template and mutation tests;
- plugin wallet trace examples;
- lifecycle registry examples;
- role-specific quickstart snippets;
- package file coverage for docs, schemas, artifacts, and examples.

Exit gate:

- one command validates all included example traces;
- examples avoid private hosted assumptions;
- the package contains enough public artifacts for a third party to start.

## R6 - Cut open protocol v0.2 draft

Goal: consolidate the kit into the next open protocol draft.

Current state: cut readiness. `docs/agentport-open-standard-v0.2-draft.md`,
`docs/agentport-protocol-governance-v0.2.md`, `docs/agentport-protocol-v0.2.md`,
`schemas/agentport-protocol-conformance-report.v0.2.schema.json`, and
`scripts/protocol-v02-conformance.mjs` define and validate the role/tamper
semantics. `examples/implementer-kit/protocol-cut.v0.2.json` and
`examples/implementer-kit/protocol-governance.v0.2.json` package the current
cut and governance policy. `examples/implementer-kit/protocol-publication.v0.2.json`
records the current publication status as ready for external review, while
stable publication remains false.

## R9 - External review handoff

Goal: let a third-party reviewer validate the public cut without reading
internal feedback notes or planning docs.

Current state: review recorded. The handoff is
`docs/agentport-open-standard-v0.2-external-review-checklist.md` plus
`examples/implementer-kit/protocol-external-review.v0.2.json`. The checklist
names the public inputs, required gates, role checks, acceptance rules, and
forbidden conclusions. The recorded result is
`examples/implementer-kit/protocol-external-review-result.v0.2.json`; it is a
local maintainer public-package review, not independent third-party
certification. The packet and result are included in the public cut manifest and
are covered by `npm run public-package-audit`.

Exit gate:

- package audit passes with every cut-manifest ref packed;
- external review packet and checklist are included in the package;
- no internal feedback or plan docs are public cut refs;
- stable publication remains false until a stable tag or release is actually
  created.

## R10 - Stable protocol tag

Goal: create the actual stable protocol publication marker once the release
owner chooses to tag this cut.

Current state: tagged. The review result records `stable_tag_set`, and the
stable publication artifact is
`examples/implementer-kit/protocol-stable-publication.v0.2.json`.
Certification, verified-business status, real-business proof, and live-backend
proof remain outside this protocol tag.

Exit gate:

- stable tag/release artifact exists and points at the reviewed cut;
- publication status flips `stablePublication` only after the tag exists;
- forbidden claims remain false.

Build items:

- `docs/agentport-open-standard-v0.2-draft.md`;
- v0.2 code registry deltas;
- role profile artifact;
- report schema updates;
- extension namespace rules;
- backward-compatibility notes for v0.1 implementers;
- deprecation and compatibility policy.

Exit gate:

- v0.2 draft can be read independently of internal roadmap docs;
- v0.1 examples still validate or have documented migration rules;
- extension points are explicit and do not permit role boundary collapse.

## R7 - Governance, claims, and extension process

Goal: keep an open ecosystem honest as more implementers appear.

Current state: cut-readiness policy packaged. The compatibility, extension, versioning,
deprecation, claim, security, and contribution rules now exist as human-readable
policy in `docs/agentport-protocol-governance-v0.2.md` and machine-readable
policy in `examples/implementer-kit/protocol-governance.v0.2.json`.

Build items:

- compatibility claim policy;
- certification and mark boundary;
- extension namespace rules;
- versioning and deprecation policy;
- security and conformance bypass policy;
- contribution rules for community adapters and role fixtures.

Exit gate:

- implementers know what they may claim;
- official marks remain earned and revocable;
- conformance cannot be confused with business verification.

## R8 - Publication status and stable-cut boundary

Goal: make the publication boundary machine-readable before the protocol is
tagged or copied outside the checkout.

Current state: review ready. The package has a schema-backed publication status
artifact and release notes that say v0.2 is cut-ready and ready for external
review, not stable publication.

Build items:

- `examples/implementer-kit/protocol-publication.v0.2.json`;
- `schemas/agentport-protocol-publication.schema.json`;
- `docs/agentport-open-standard-v0.2-release-notes.md`;
- conformance evidence references for publication status and release notes;
- manifest reference from `protocol-cut.v0.2.json`.

Exit gate:

- the publication artifact keeps `technicalFreeze` and `cutReadiness` true;
- stable publication, certification, verified-business status, real-business
  proof, and live-backend proof remain false;
- the cut manifest references the publication artifact;
- local conformance and test gates pass.

## Validation order

Run build-producing commands serially in this repo.

Default validation:

```bash
git diff --check
npm test
npm run conformance
```

When CLI/product surfaces are touched:

```bash
npm run product-check
```

## Hard boundaries

- No production issuer keys in the open engine.
- No hosted identity, OAuth, credential vault, or payment custody in the kit.
- No business verification freshness pipeline in role conformance.
- No biased routing or marketplace ranking.
- No raw proof tokens, credentials, transcripts, or model reasoning in portable
  traces by default.
- No role may self-assert gateway truth, lifecycle truth, business verification,
  capability tier, binding ID, or receipt facts.
