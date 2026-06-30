# AgentPort Protocol Governance v0.2

Status: cut readiness policy for the v0.2 protocol cut.

This policy governs extension, versioning, deprecation, claims, and contribution
rules for the open AgentPort v0.2 compatibility surface. It does not create an
AgentPort certification program, a verified-business program, a hosted registry,
or a live trust-root service inside the open engine.

## Extension Namespace Rules

Extensions are allowed only when they preserve role boundaries and do not change
the meaning of required v0.2 fields.

Allowed extension locations:

- an `extensions` object on an artifact or report;
- fields prefixed with `x-` when a schema allows open metadata;
- a reverse-DNS or URI extension identifier inside `extensions`;
- new tamper fixtures, examples, and optional report metadata.

Reserved identifiers:

- `agentport.*` and `ap.*` are reserved for AgentPort-controlled protocol
  extensions;
- third-party extensions should use reverse-DNS names such as
  `com.example.agentport.foo` or an HTTPS URI the implementer controls.

Extensions must not override or reinterpret:

- verification status, verified flags, tags, or readiness tier;
- `bindingId`, business ID, service ID, or backend confirmation refs;
- result type, allowed actions, receipt facts, authority assurance, or lifecycle
  status;
- consent, exact approval, redaction, or system-of-record boundaries.

## Versioning Policy

Patch-compatible changes:

- add optional metadata with explicit defaults;
- add new examples or tamper fixtures that do not change required behavior;
- clarify text without changing role obligations;
- add optional report fields under namespaced extension locations.

Minor-version changes:

- add a role profile;
- add a required check;
- add a required artifact to a proof pack;
- add an action family, lifecycle event family, or report section;
- change allowed claim wording.

Breaking changes:

- remove or rename required fields;
- weaken consent, authority, receipt, registry, redaction, or role-boundary
  requirements;
- allow one role to self-assert another role's truth;
- treat compatibility as certification;
- treat virtual-store, fixture, or host-adoption evidence as real-business or
  live-backend proof.

## Deprecation Policy

Deprecation must be explicit and non-destructive inside a minor line:

- mark the field, command, profile, or example as deprecated in the relevant
  manifest or spec;
- name the replacement and migration path;
- keep validators accepting the deprecated shape until the next major version
  unless the deprecation fixes a security or privacy issue;
- never use deprecation to weaken fail-closed behavior.

## Claim And Mark Policy

Compatibility claims are allowed only for the role or proof pack that passed its
declared check.

Forbidden without a separate process:

- AgentPort Certified;
- AgentPort Gateway Certified;
- AgentPort Verified business;
- real-business proof;
- live-backend proof;
- A2A certification;
- A2A replacement;
- backend confirmation authority for a business port;
- gateway authority for a plugin wallet;
- registry authority for a host or model.

Official marks are earned and revocable outside this open compatibility cut.
Open conformance reports may support review, but they do not grant official
marks by themselves.

## Security And Bypass Policy

There is no conformance bypass for failures in:

- role boundaries;
- exact user approval or consent;
- required authority evidence;
- receipt binding;
- lifecycle or registry authority;
- adapter trust self-assertion;
- redaction of raw authority tokens, credentials, payment data, private payloads,
  transcripts, or model reasoning;
- business system-of-record boundaries.

Security-sensitive changes must add or update a tamper fixture when practical.
If a compatibility rule must be tightened for security or privacy, the cut may
add a stricter required check in a minor version and document the migration.

## Contribution Policy

Community adapters, role fixtures, reports, and examples may be accepted when
they are deterministic, credential-free, and explicit about boundaries.

Contributions must not:

- include production credentials or raw private tokens;
- require network access in CI;
- claim certification, verified-business status, real-business proof, or
  live-backend proof;
- add hosted-only behavior directly to the open engine;
- collapse frontier host, plugin wallet, business port, gateway, adapter, or
  registry responsibilities.

## Stable-Cut Promotion Gates

The v0.2 draft label can be removed only when:

- the protocol cut manifest references exist;
- every command in the manifest passes after `npm run build`;
- `npm run conformance` passes;
- `npm test` passes;
- `git diff --check` passes;
- the public draft, manifest, and governance policy keep certification,
  verified-business, real-business, and live-backend claims separate.
