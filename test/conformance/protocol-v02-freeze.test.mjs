import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);

describe("AgentPort protocol v0.2 freeze", () => {
  it("documents role boundaries, canonical objects, proof routing, and claim limits", async () => {
    const protocol = await readFile("docs/agentport-protocol-v0.2.md", "utf8");
    const commitmentSchema = await readJson("schemas/agentport-commitment.v0.2.schema.json");
    const intentSchema = await readJson("schemas/agentport-action-intent.v0.2.schema.json");
    const receiptSchema = await readJson("schemas/agentport-delivery-receipt.v0.2.schema.json");
    const traceSchema = await readJson("schemas/agentport-protocol-trace.v0.2.schema.json");
    const reportSchema = await readJson("schemas/agentport-protocol-conformance-report.v0.2.schema.json");

    assert.match(protocol, /Status: technical freeze for implementer validation/);
    assert.match(protocol, /## Role Boundaries/);
    assert.match(protocol, /## Canonical Objects/);
    assert.match(protocol, /### Route Ticket Proof/);
    assert.match(protocol, /## Claim Boundary/);
    assert.match(protocol, /## Governance And Extensions/);
    assert.match(protocol, /examples\/implementer-kit\/protocol-governance\.v0\.2\.json/);
    assert.match(protocol, /docs\/agentport-protocol-governance-v0\.2\.md/);
    assert.match(protocol, /extensions` or `x-` fields/);
    assert.match(protocol, /every manifest command passes/);
    assert.match(protocol, /AgentPort Certified/);
    assert.match(protocol, /AgentPort Verified business/);
    assert.match(protocol, /node scripts\/protocol-v02-conformance\.mjs --input examples\/protocol-v0\.2 --expect-tamper-failures/);
    assert.match(protocol, /agentport conformance gateway --input examples\/protocol-v0\.2/);

    assert.equal(commitmentSchema.properties.protocol.const, "agentport-commitment");
    assert.equal(commitmentSchema.properties.version.const, "0.2");
    assert.equal(intentSchema.properties.protocol.const, "agentport-action-intent");
    assert.equal(intentSchema.properties.version.const, "0.2");
    assert.equal(receiptSchema.properties.protocol.const, "agentport-delivery-receipt");
    assert.equal(receiptSchema.properties.version.const, "0.2");
    assert.equal(traceSchema.properties.protocol.const, "agentport-protocol-trace");
    assert.equal(traceSchema.properties.version.const, "0.2");
    assert.equal(reportSchema.properties.protocol.const, "agentport-protocol-conformance-report");
    assert.equal(reportSchema.properties.version.const, "0.2");
    assert.ok(reportSchema.required.includes("roleProfiles"));
    assert.equal(reportSchema.properties.certification.properties.agentPortCertified.const, false);
    assert.equal(reportSchema.properties.certification.properties.agentPortVerifiedBusiness.const, false);
    assert.equal(reportSchema.properties.certification.properties.realBusinessProof.const, false);
  });

  it("passes golden traces and catches tamper traces by declared semantic checks", async () => {
    const { stdout } = await execFileAsync("node", [
      "scripts/protocol-v02-conformance.mjs",
      "--input",
      "examples/protocol-v0.2",
      "--expect-tamper-failures"
    ]);
    const report = JSON.parse(stdout);

    assert.equal(report.protocol, "agentport-protocol-conformance-report");
    assert.equal(report.version, "0.2");
    assert.equal(report.ok, true);
    assert.deepEqual(report.summary, {
      goldenPassed: 1,
      goldenFailed: 0,
      tamperPassedAsExpected: 8,
      tamperUnexpectedPass: 0
    });
    assert.deepEqual(report.certification, {
      agentPortCertified: false,
      agentPortVerifiedBusiness: false,
      realBusinessProof: false
    });
    assertRoleProfile(report, {
      profileId: "gateway-runtime-v0.2",
      allowedClaim: "Passes AgentPort Gateway conformance v0.2",
      tamperPassedAsExpected: 7
    });
    assertRoleProfile(report, {
      profileId: "plugin-wallet-v0.2",
      allowedClaim: "Passes AgentPort Plugin Wallet conformance v0.2",
      tamperPassedAsExpected: 5
    });
    assertRoleProfile(report, {
      profileId: "frontier-host-session-discipline-v0.2",
      allowedClaim: "Passes AgentPort Frontier Host conformance v0.2",
      tamperPassedAsExpected: 4
    });
    assertRoleProfile(report, {
      profileId: "adapter-capability-honesty-v0.2",
      allowedClaim: "Passes AgentPort Adapter Capability Honesty conformance v0.2",
      tamperPassedAsExpected: 2
    });
    assertRoleProfile(report, {
      profileId: "business-port-forwarding-v0.2",
      allowedClaim: "Passes AgentPort Business Port conformance v0.2",
      tamperPassedAsExpected: 4
    });
    assertRoleProfile(report, {
      profileId: "registry-lifecycle-v0.2",
      allowedClaim: "Passes AgentPort Commitment Registry conformance v0.2",
      tamperPassedAsExpected: 3
    });

    const byId = new Map(report.traces.map((trace) => [trace.traceId, trace]));
    assert.equal(byId.get("golden-ticket-proof-routing").ok, true);
    assert.deepEqual(byId.get("golden-ticket-proof-routing").failedCheckIds, []);
    assertTamperFailure(byId, "tamper-missing-consent", "consent_bound_to_summary");
    assertTamperFailure(byId, "tamper-backend-mutation", "proof_routing_no_backend_mutation");
    assertTamperFailure(byId, "tamper-plugin-lifecycle-authority", "registry_lifecycle_authority");
    assertTamperFailure(byId, "tamper-certification-overclaim", "forbidden_claims_false");
    assertTamperFailure(byId, "tamper-model-minted-authority", "authority_evidence_not_model_minted");
    assertTamperFailure(byId, "tamper-adapter-self-asserts-trust", "adapter_cannot_self_assert_trust");
    assertTamperFailure(byId, "tamper-business-port-upgrades-outcome", "business_port_preserves_gateway_outcome");
    assertTamperFailure(byId, "tamper-receipt-missing-authority-binding", "receipt_binds_authority_and_outcome");
  });

  it("fails closed when a tamper trace is run outside the expected-failure harness", async () => {
    await assert.rejects(
      execFileAsync("node", [
        "scripts/protocol-v02-conformance.mjs",
        "--input",
        "examples/protocol-v0.2/tamper-missing-consent.json"
      ]),
      (error) => {
        const report = JSON.parse(error.stdout);
        assert.equal(report.ok, false);
        assert.equal(report.summary.tamperUnexpectedPass, 1);
        assert.deepEqual(report.traces[0].failedCheckIds, ["consent_bound_to_summary"]);
        return true;
      }
    );
  });

  it("passes a single golden trace without tamper harness mode", async () => {
    const { stdout } = await execFileAsync("node", [
      "scripts/protocol-v02-conformance.mjs",
      "--input",
      "examples/protocol-v0.2/golden-ticket-proof-routing.json"
    ]);
    const report = JSON.parse(stdout);

    assert.equal(report.ok, true);
    assert.deepEqual(report.summary, {
      goldenPassed: 1,
      goldenFailed: 0,
      tamperPassedAsExpected: 0,
      tamperUnexpectedPass: 0
    });
  });

  it("can emit a single selected role profile", async () => {
    const { stdout } = await execFileAsync("node", [
      "scripts/protocol-v02-conformance.mjs",
      "--input",
      "examples/protocol-v0.2",
      "--expect-tamper-failures",
      "--profile",
      "frontierHost"
    ]);
    const report = JSON.parse(stdout);

    assert.equal(report.ok, true);
    assert.equal(report.roleProfiles.length, 1);
    assert.equal(report.roleProfiles[0].profileId, "frontier-host-session-discipline-v0.2");
    assert.equal(report.roleProfiles[0].allowedClaim, "Passes AgentPort Frontier Host conformance v0.2");
  });

  it("exposes role conformance through the packaged CLI", async () => {
    const { stdout } = await execFileAsync("node", [
      "dist/cli/index.js",
      "conformance",
      "frontier-host",
      "--input",
      "examples/protocol-v0.2"
    ]);
    const report = JSON.parse(stdout);

    assert.equal(report.ok, true);
    assert.equal(report.roleProfiles.length, 1);
    assert.equal(report.roleProfiles[0].profileId, "frontier-host-session-discipline-v0.2");
    assert.equal(report.roleProfiles[0].allowedClaim, "Passes AgentPort Frontier Host conformance v0.2");
    assert.deepEqual(report.certification, {
      agentPortCertified: false,
      agentPortVerifiedBusiness: false,
      realBusinessProof: false
    });
  });

  it("fails unknown role profile selection clearly", async () => {
    await assert.rejects(
      execFileAsync("node", [
        "scripts/protocol-v02-conformance.mjs",
        "--input",
        "examples/protocol-v0.2",
        "--profile",
        "unknown-role"
      ]),
      (error) => {
        assert.match(error.stderr, /Unknown profile: unknown-role/);
        assert.match(error.stderr, /gateway, pluginWallet, frontierHost, adapter, businessPort, registry/);
        return true;
      }
    );
  });
});

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function assertTamperFailure(byId, traceId, checkId) {
  const trace = byId.get(traceId);
  assert.equal(trace.kind, "tamper");
  assert.equal(trace.ok, false);
  assert.equal(trace.expectedFailureCheckId, checkId);
  assert.ok(trace.failedCheckIds.includes(checkId));
}

function assertRoleProfile(report, { profileId, allowedClaim, tamperPassedAsExpected }) {
  const profile = report.roleProfiles.find((item) => item.profileId === profileId);
  assert.equal(profile.ok, true);
  assert.equal(profile.allowedClaim, allowedClaim);
  assert.deepEqual(profile.failingTraceIds, []);
  assert.equal(profile.summary.goldenPassed, 1);
  assert.equal(profile.summary.goldenFailed, 0);
  assert.equal(profile.summary.tamperPassedAsExpected, tamperPassedAsExpected);
  assert.equal(profile.summary.tamperUnexpectedPass, 0);
}
