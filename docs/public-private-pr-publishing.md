# Public/private PR and publishing workflow

Status: required workflow for changing AgentPort open protocol code and hosted
business code in parallel.

AgentPort has two lanes:

- **Open engine / protocol**: public compatibility contracts, schemas,
  conformance, reference gateway/runtime, adapter SDK, deterministic fixtures.
- **Hosted business**: Business Co-Pilot, owner portal, verification operations,
  production registry, credential/OAuth brokering, analytics, lead delivery,
  vendor deployment, certification operations.

Public PRs define what outside implementers can build and verify. Private PRs
turn those seams into the paid hosted product.

## PR Types

### Public-only PR

Use this when changing:

- protocol docs or schemas;
- conformance profiles, traces, or tamper fixtures;
- `packages/core` domain contracts and helper APIs;
- public `packages/server/src/public.ts` runtime exports;
- reference adapters;
- public examples and implementer docs;
- public package manifest, files whitelist, or release audit.

Required checks:

```bash
npm test
npm run release:public-check
```

Allowed claims:

- `AgentPort-compatible`
- `Passes <role> conformance`
- `Reference implementation`

Forbidden claims:

- `AgentPort Certified`
- `AgentPort Verified business`
- real-business proof
- production identity/payment authority
- marketplace ranking or paid placement

### Private-only PR

Use this when changing:

- owner portal or Business Co-Pilot product UX;
- production verification operations;
- credential vault or OAuth brokering;
- production issuer/passkey/account recovery;
- production registry and audit retention;
- demand graph and analytics;
- lead delivery infrastructure;
- hosted vendor connector deployment;
- certification workflow and customer status.

Rules:

- Consume `@agentport/engine` as a dependency.
- Do not silently fork public protocol behavior.
- Do not change public schemas or conformance only inside the private repo.
- Keep production credentials, tenant data, deployed connector artifacts, and
  customer evidence out of public PRs.

### Paired Public/private PR

Use this when a hosted feature needs a new shared seam.

Order:

1. Public PR adds or changes the contract, schema, fixture, or conformance rule.
2. Public PR passes `release:public-check`.
3. Public PR merges and publishes a versioned package.
4. Private PR upgrades `@agentport/engine`.
5. Private PR implements the hosted provider behind the public seam.

Examples:

- Public adds `CredentialVault` contract behavior; private implements real vault
  and OAuth refresh.
- Public adds registry lifecycle schema; private implements production durable
  registry.
- Public adds verification proof method contract; private implements fraud
  checks and operator review.

## Branch and PR Naming

Public examples:

- `codex/public-package-boundary`
- `codex/protocol-v02-conformance`
- `codex/public-credential-vault-contract`

Private examples:

- `codex/private-credential-vault-provider`
- `codex/copilot-owner-flow`
- `codex/hosted-verification-ops`

Paired PRs should reference each other in their descriptions:

```text
Public contract PR: <link>
Private provider PR: <link>
Published engine version required: @agentport/engine@x.y.z
```

## Public Package Release Gate

Before publishing `@agentport/engine`:

```bash
npm ci
npm test
npm run release:public-check
```

The audit fails if the npm package includes:

- `packages/conversion`;
- `packages/verification`;
- `dist/conversion`;
- `dist/verification`;
- internal full CLI or server bundles;
- deployed vendor artifacts;
- feedback docs or broad `*-plan.md` files;
- presentation or Business Co-Pilot hosted schemas/examples.

It also scans public bundles for hosted/operator strings such as
`operator-flow`, `ANTHROPIC_API_KEY`, `presentation_evidence`, `issuer-web`, and
`vendor-artifacts`.

The external-install smoke then runs `npm pack`, installs the tarball into a
temporary project, imports the public package exports, confirms private
conversion/verification exports are unavailable, and runs the installed
`agentport conformance gateway` CLI against the installed protocol examples.

## Publishing Sequence

1. Open and review the public PR.
2. Confirm public CI passes.
3. Confirm `npm run release:public-check` reports clean public package and
   external-install smoke results.
4. Generate and validate the public source export when publishing GitHub source:

```bash
npm run public-source-export -- --out /tmp/agentport-public-source --validate
```

5. Merge public PR.
6. Publish only from the public release branch or public package workspace.
7. Tag the release.
8. Push the validated public source export to the public GitHub repository or
   export branch.
9. Upgrade the private hosted repo dependency.
10. Run private hosted CI and deployment checks.

Do not publish from a dirty private working tree.

Do not publish directly after a private-only PR.

Do not publish a package whose dry-run audit includes hosted paths or deployed
vendor evidence.

Do not make the mixed development repository public directly. Use
`scripts/public-source-export.mjs` to produce a validated source tree from the
public allowlist.

## GitHub Actions

`.github/workflows/public-package-boundary.yml` runs:

- `npm ci`;
- `npm test`;
- `npm run release:public-check`.

This workflow proves release readiness but does not publish. Actual npm
publication should remain a separate maintainer-controlled action until the
public/private repo split is complete.

## Remaining Repo Split

This checkout still contains hosted prototypes. The package boundary is now
mechanically guarded, but a clean public-source release should eventually move
these to a private repo/package:

- `packages/conversion`;
- `packages/verification`;
- hosted operator commands;
- production issuer/passkey tooling;
- demand graph and analytics;
- vendor deployment artifacts;
- certification operations.
