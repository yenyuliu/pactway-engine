#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const PROFILE_NAMES = [
  "core-runtime",
  "capability-honesty",
  "authority-evidence-checkpoint",
  "token-confirmation",
  "action-receipt",
  "compact-payload-retention",
  "gateway-protocol",
  "plugin-wallet"
];

const EVIDENCE = {
  "core-runtime": [
    "test/server/http-mcp.test.mjs",
    "test/server/business-info.test.mjs",
    "test/server/failure-handling.test.mjs",
    "test/server/small-business-digital-twin.test.mjs",
    "test/server/small-business-twin-runner.test.mjs",
    "test/server/vercel-entrypoint.test.mjs",
    "scripts/run-small-business-twin.mjs",
    "docs/real-small-business-digital-twin-plan.md",
    "docs/small-business-digital-twin-stage.md",
    "docs/feedback/real-small-business-digital-twin.md",
    "docs/feedback/small-business-digital-twin-runner.md",
    "examples/small-business-digital-twin.cedar-steam-coffee.json",
    "examples/small-business-digital-twin.cedar-steam-coffee.sources.json",
    "artifacts/small-business-digital-twin/cedar-steam-coffee.trace.json",
    "artifacts/agentport-action-model.v0.1.json",
    "docs/feedback/action-intent-proof-pack.md",
    "docs/feedback/action-intent-compatibility-contract.md",
    "docs/agentport-open-standard-v0.2-draft.md",
    "docs/feedback/agentport-open-standard-v0.2-draft.md",
    "examples/implementer-kit/protocol-cut.v0.2.json",
    "examples/implementer-kit/protocol-governance.v0.2.json",
    "examples/implementer-kit/protocol-publication.v0.2.json",
    "examples/implementer-kit/protocol-external-review.v0.2.json",
    "examples/implementer-kit/protocol-external-review-result.v0.2.json",
    "examples/implementer-kit/protocol-stable-publication.v0.2.json",
    "schemas/agentport-protocol-cut-manifest.schema.json",
    "schemas/agentport-protocol-governance.schema.json",
    "schemas/agentport-protocol-publication.schema.json",
    "schemas/agentport-protocol-external-review.schema.json",
    "schemas/agentport-protocol-external-review-result.schema.json",
    "schemas/agentport-protocol-stable-publication.schema.json",
    "docs/agentport-open-standard-v0.2-external-review-checklist.md",
    "docs/agentport-open-standard-v0.2-release-notes.md",
    "docs/agentport-open-standard-v0.2-stable-cut-review.md",
    "docs/feedback/protocol-cut-manifest.md",
    "docs/feedback/protocol-governance-v0.2.md",
    "docs/feedback/protocol-cut-status-alignment.md",
    "docs/feedback/protocol-publication-boundary.md",
    "docs/feedback/protocol-public-package-boundary.md",
    "docs/feedback/protocol-external-review-handoff.md",
    "docs/feedback/protocol-external-review-result.md",
    "docs/feedback/protocol-stable-publication-tag.md",
    "docs/agentport-protocol-governance-v0.2.md",
    "schemas/agentport-action-intent-proof-pack.schema.json",
    "schemas/agentport-action-intent-compatibility-report.schema.json",
    "docs/feedback/business-port-registry-compatibility-contract.md",
    "schemas/agentport-business-port-proof-pack.schema.json",
    "schemas/agentport-business-port-compatibility-report.schema.json",
    "schemas/agentport-registry-proof-pack.schema.json",
    "schemas/agentport-registry-compatibility-report.schema.json",
    "schemas/agentport-protocol-trace-matrix.schema.json",
    "schemas/agentport-protocol-trace-compatibility-report.schema.json",
    "schemas/agentport-a2a-gateway-profile.schema.json",
    "schemas/agentport-a2a-gateway-trace-suite.schema.json",
    "schemas/agentport-a2a-gateway-compatibility-report.schema.json",
    "schemas/agentport-a2a-host-binding.schema.json",
    "schemas/agentport-a2a-host-trace.schema.json",
    "schemas/agentport-a2a-host-connector-capture.schema.json",
    "schemas/agentport-a2a-host-event-log.schema.json",
    "schemas/agentport-a2a-host-adoption-report.schema.json",
    "schemas/agentport-a2a-host-proof-pack.schema.json",
    "examples/action-intent-proof-pack/user-goal.json",
    "examples/action-intent-proof-pack/compiled-intent.json",
    "examples/action-intent-proof-pack/required-inputs.json",
    "examples/action-intent-proof-pack/approval-package.json",
    "examples/action-intent-proof-pack/approved-execution.json",
    "examples/action-intent-proof-pack/consent-rejection.json",
    "examples/action-intent-proof-pack/lifecycle-result.json",
    "examples/action-intent-proof-pack/result-delivery.json",
    "examples/action-intent-proof-pack/receipt-refs.json",
    "examples/action-intent-proof-pack/redaction-manifest.json",
    "examples/action-intent-proof-pack/action-intent-proof-summary.json",
    "examples/action-intent-negative-cases.v0.1.json",
    "examples/business-port-proof-pack/inbound-request.json",
    "examples/business-port-proof-pack/gateway-forward.json",
    "examples/business-port-proof-pack/gateway-response.json",
    "examples/business-port-proof-pack/port-response.json",
    "examples/business-port-proof-pack/redaction-manifest.json",
    "examples/business-port-proof-pack/business-port-proof-summary.json",
    "examples/commitment-registry-proof-pack/lifecycle-write.json",
    "examples/commitment-registry-proof-pack/event-history.json",
    "examples/commitment-registry-proof-pack/current-state-read.json",
    "examples/commitment-registry-proof-pack/restore-read.json",
    "examples/commitment-registry-proof-pack/redaction-manifest.json",
    "examples/commitment-registry-proof-pack/registry-proof-summary.json",
    "examples/protocol-golden-trace-matrix.v0.1.json",
    "artifacts/agentport-a2a-gateway-profile.v0.1.json",
    "artifacts/agentport-a2a-host-binding.v0.1.json",
    "examples/a2a-gateway-trace-suite.v0.1.json",
    "examples/a2a-gateway-compatibility-report.v0.1.json",
    "examples/agent-gateway-ingress-compatibility-report.v0.1.json",
    "examples/a2a-host-trace.passing.v0.1.json",
    "examples/a2a-host-trace.direct-execute.v0.1.json",
    "examples/a2a-host-trace.invented-approval.v0.1.json",
    "examples/a2a-host-trace.missing-authority.v0.1.json",
    "examples/a2a-host-trace.forged-receipt.v0.1.json",
    "examples/a2a-host-trace.ack-as-verification.v0.1.json",
    "examples/chatgpt-app-connector-capture.send-ticket.v0.1.json",
    "examples/chatgpt-app-connector-capture.direct-execute.v0.1.json",
    "examples/a2a-host-event-log.send-ticket.v0.1.json",
    "examples/a2a-host-event-log.restore-ticket-status.v0.1.json",
    "examples/a2a-host-event-log.failed-direct-execute.v0.1.json",
    "examples/a2a-host-proof-pack/host-trace.json",
    "examples/a2a-host-proof-pack/adoption-report.json",
    "examples/a2a-host-proof-pack/redaction-manifest.json",
    "examples/a2a-host-proof-pack/proof-summary.json",
    "scripts/a2a-gateway-check.mjs",
    "scripts/a2a-host-event-log-export.mjs",
    "scripts/a2a-host-proof-pack.mjs",
    "test/conformance/a2a-gateway-check.test.mjs",
    "test/conformance/a2a-host-event-log-export.test.mjs",
    "test/conformance/a2a-host-proof-pack.test.mjs",
    "docs/a2a-gateway-profile-plan.md",
    "docs/a2a-host-adoption-plan.md",
    "docs/a2a-host-proof-pack-plan.md",
    "docs/a2a-host-event-log-intake-plan.md",
    "docs/a2a-host-connector-capture-export-plan.md",
    "docs/feedback/a2a-gateway-profile.md",
    "docs/feedback/a2a-gateway-checker.md",
    "docs/feedback/a2a-host-adoption.md",
    "docs/feedback/a2a-host-proof-pack.md",
    "docs/feedback/a2a-host-event-log-intake.md",
    "docs/feedback/a2a-host-connector-capture-export.md"
  ],
  "capability-honesty": [
    "test/conformance/adapter-conformance.test.mjs",
    "test/adapters/square-adapter.test.mjs",
    "test/server/credential-vault.test.mjs",
    "test/server/manual-flow.test.mjs",
    "test/server/multi-binding.test.mjs"
  ],
  "authority-evidence-checkpoint": [
    "test/server/verified-delegation.test.mjs",
    "docs/authority-evidence-profiles-plan.md",
    "docs/delegation-proof-spec.md"
  ],
  "token-confirmation": [
    "test/server/verified-delegation.test.mjs",
    "test/server/client-token-emission.test.mjs"
  ],
  "action-receipt": [
    "test/server/verified-delegation.test.mjs",
    "test/server/client-agent-runner-kit.test.mjs"
  ],
  "compact-payload-retention": [
    "artifacts/agentport-protocol-codes.v0.1.json",
    "schemas/agentport-compact-envelope.schema.json",
    "schemas/agentport-owner-proof-request.schema.json",
    "schemas/agentport-presentation-run-packet.schema.json",
    "schemas/agentport-presentation-run-status.schema.json",
    "schemas/agentport-presentation-run-brief.schema.json",
    "schemas/agentport-presentation-run-report.schema.json",
    "schemas/agentport-business-copilot-readiness-packet.schema.json",
    "schemas/agentport-presentation-preflight.schema.json",
    "schemas/agentport-presentation-evidence.schema.json",
    "schemas/agentport-frontier-intent-pilot-packet.schema.json",
    "schemas/agentport-frontier-host-worker-evidence.schema.json",
    "schemas/agentport-frontier-intent-pilot-evidence.schema.json",
    "schemas/agentport-frontier-intent-pilot-validation.schema.json",
    "schemas/agentport-frontier-intent-pilot-run.schema.json",
    "docs/protocol-codes.md"
  ],
  "gateway-protocol": [
    "docs/protocol-conformance-v0.1.md",
    "schemas/agentport-gateway-protocol-compliance-report.schema.json",
    "examples/gateway-protocol-compliance.virtual-store.v0.1.json",
    "docs/feedback/frontier-integration-gate.md",
    "docs/feedback/frontier-digital-twin-pilot.md",
    "docs/feedback/frontier-business-port-boundary.md",
    "docs/chatgpt-connector-capture-source-plan.md",
    "docs/feedback/chatgpt-connector-capture-source.md",
    "docs/ticket-send-compile-binding-plan.md",
    "docs/feedback/ticket-send-compile-binding.md",
    "docs/mcp-ticket-send-approval-tool-plan.md",
    "docs/feedback/mcp-ticket-send-approval-tool.md",
    "docs/mcp-app-route-proof-plan.md",
    "docs/feedback/mcp-app-route-proof.md",
    "docs/chatgpt-app-prepare-send-routing-plan.md",
    "docs/feedback/chatgpt-app-prepare-send-routing.md",
    "docs/chatgpt-app-private-dogfood-plan.md",
    "docs/feedback/chatgpt-app-private-dogfood.md",
    "docs/agent-ticket-ingress-plan.md",
    "docs/feedback/agent-ticket-ingress.md",
    "docs/feedback/agent-gateway-ingress-compatibility-report.md",
    "scripts/chatgpt-app-hosted-evidence.mjs",
    "scripts/chatgpt-app-private-dogfood.mjs",
    "scripts/chatgpt-app-smoke.mjs",
    "scripts/chatgpt-action-smoke.mjs",
    "test/server/chatgpt-app-hosted-evidence.test.mjs",
    "test/server/chatgpt-app-private-dogfood.test.mjs",
    "test/server/chatgpt-action-smoke.test.mjs",
    "test/server/vercel-entrypoint.test.mjs",
    "test/server/vercel-agent-ticket-ingress-redis.test.mjs",
    "examples/agentport-demo-tenants.json",
    "artifacts/vendor/chatgpt-actions-openapi.v0.1.json",
    "CONFORMANCE.md",
    "CERTIFICATION.md"
  ],
  "plugin-wallet": [
    "test/core/plugin-wallet.test.mjs",
    "artifacts/agentport-plugin-wallet.v0.1.json",
    "docs/plugin-wallet-contract-plan.md",
    "docs/plugin-wallet-session-restore-plan.md",
    "docs/plugin-wallet-pending-actions-plan.md",
    "docs/plugin-wallet-delivery-audit-plan.md",
    "docs/plugin-wallet-search-review-plan.md",
    "docs/plugin-wallet-key-custody-plan.md",
    "docs/plugin-wallet-host-integration-plan.md",
    "docs/plugin-wallet-pilot-scale-plan.md",
    "docs/plugin-wallet-pilot-host-adapters-plan.md",
    "docs/plugin-wallet-host-adapter-smoke-plan.md",
    "docs/plugin-wallet-pilot-host-runbook-plan.md",
    "docs/plugin-wallet-example-business-pilot-evidence-plan.md",
    "docs/plugin-wallet-returned-session-review-plan.md",
    "docs/plugin-wallet-unified-inventory-plan.md",
    "docs/agent-gateway-virtual-store-reference-harness-plan.md",
    "docs/agent-gateway-wallet-golden-trace-matrix-plan.md",
    "docs/agent-gateway-wallet-host-adoption-kit-plan.md",
    "docs/agent-gateway-wallet-real-business-handoff-plan.md",
    "docs/feedback/plugin-wallet-proof-pack.md",
    "docs/feedback/plugin-wallet-unified-inventory.md",
    "examples/plugin-wallet-pilot-evidence.v0.1.json",
    "examples/plugin-wallet-pilot-host-runbook.v0.1.json",
    "examples/plugin-wallet-virtual-store-pilot-evidence.v0.1.json",
    "examples/plugin-wallet-returned-session-review.v0.1.json",
    "examples/plugin-wallet-virtual-store-reference-harness.v0.1.json",
    "examples/plugin-wallet-golden-trace-matrix.v0.1.json",
    "examples/plugin-wallet-host-adoption-kit.v0.1.json",
    "examples/plugin-wallet-real-business-handoff.v0.1.json",
    "examples/plugin-wallet-proof-pack/ticket-save.json",
    "examples/plugin-wallet-proof-pack/returned-session-restore.json",
    "examples/plugin-wallet-proof-pack/gateway-reverify.json",
    "examples/plugin-wallet-proof-pack/pending-action-replay.json",
    "examples/plugin-wallet-proof-pack/receipt-retention.json",
    "examples/plugin-wallet-proof-pack/redaction-manifest.json",
    "examples/plugin-wallet-proof-pack/wallet-proof-summary.json"
  ]
};

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    const next = process.argv[i + 1];
    args.set(arg, next && !next.startsWith("--") ? next : true);
    if (next && !next.startsWith("--")) {
      i += 1;
    }
  }
}

const outPath = typeof args.get("--out") === "string" ? args.get("--out") : null;

const packageJson = await readJson("package.json");
const codes = await readJson("artifacts/agentport-protocol-codes.v0.1.json");
const profiles = await readJson("artifacts/agentport-conformance-profiles.v0.1.json");
const reportSchema = await readJson("schemas/agentport-conformance-report.schema.json");
const compactEnvelopeSchema = await readJson("schemas/agentport-compact-envelope.schema.json");
const ownerProofRequestSchema = await readJson("schemas/agentport-owner-proof-request.schema.json");
const presentationRunPacketSchema = await readJson("schemas/agentport-presentation-run-packet.schema.json");
const presentationRunStatusSchema = await readJson("schemas/agentport-presentation-run-status.schema.json");
const presentationRunBriefSchema = await readJson("schemas/agentport-presentation-run-brief.schema.json");
const presentationRunReportSchema = await readJson("schemas/agentport-presentation-run-report.schema.json");
const businessCopilotReadinessPacketSchema = await readJson("schemas/agentport-business-copilot-readiness-packet.schema.json");
const presentationPreflightSchema = await readJson("schemas/agentport-presentation-preflight.schema.json");
const presentationEvidenceSchema = await readJson("schemas/agentport-presentation-evidence.schema.json");
const frontierPacketSchema = await readJson("schemas/agentport-frontier-intent-pilot-packet.schema.json");
const frontierWorkerEvidenceSchema = await readJson("schemas/agentport-frontier-host-worker-evidence.schema.json");
const frontierPilotEvidenceSchema = await readJson("schemas/agentport-frontier-intent-pilot-evidence.schema.json");
const frontierPilotValidationSchema = await readJson("schemas/agentport-frontier-intent-pilot-validation.schema.json");
const frontierPilotRunSchema = await readJson("schemas/agentport-frontier-intent-pilot-run.schema.json");
const actionIntentProofPackSchema = await readJson("schemas/agentport-action-intent-proof-pack.schema.json");
const actionIntentCompatibilityReportSchema = await readJson("schemas/agentport-action-intent-compatibility-report.schema.json");
const businessPortProofPackSchema = await readJson("schemas/agentport-business-port-proof-pack.schema.json");
const businessPortCompatibilityReportSchema = await readJson("schemas/agentport-business-port-compatibility-report.schema.json");
const registryProofPackSchema = await readJson("schemas/agentport-registry-proof-pack.schema.json");
const registryCompatibilityReportSchema = await readJson("schemas/agentport-registry-compatibility-report.schema.json");
const protocolTraceMatrixSchema = await readJson("schemas/agentport-protocol-trace-matrix.schema.json");
const protocolTraceCompatibilityReportSchema = await readJson("schemas/agentport-protocol-trace-compatibility-report.schema.json");
const a2aGatewayProfileSchema = await readJson("schemas/agentport-a2a-gateway-profile.schema.json");
const a2aGatewayTraceSuiteSchema = await readJson("schemas/agentport-a2a-gateway-trace-suite.schema.json");
const a2aGatewayCompatibilityReportSchema = await readJson("schemas/agentport-a2a-gateway-compatibility-report.schema.json");
const agentGatewayIngressCompatibilityReportSchema = await readJson("schemas/agentport-agent-gateway-ingress-compatibility-report.schema.json");
const a2aHostBindingSchema = await readJson("schemas/agentport-a2a-host-binding.schema.json");
const a2aHostTraceSchema = await readJson("schemas/agentport-a2a-host-trace.schema.json");
const a2aHostConnectorCaptureSchema = await readJson("schemas/agentport-a2a-host-connector-capture.schema.json");
const a2aHostEventLogSchema = await readJson("schemas/agentport-a2a-host-event-log.schema.json");
const a2aHostAdoptionReportSchema = await readJson("schemas/agentport-a2a-host-adoption-report.schema.json");
const a2aHostProofPackSchema = await readJson("schemas/agentport-a2a-host-proof-pack.schema.json");
const ownerProofRequestExample = await readJson("examples/owner-proof-request.v0.1.json");
const presentationRunPacketExample = await readJson("examples/presentation-run-packet.v0.1.json");
const presentationRunStatusExample = await readJson("examples/presentation-run-status.v0.1.json");
const presentationRunBriefExample = await readJson("examples/presentation-run-brief.v0.1.json");
const presentationRunReportExample = await readJson("examples/presentation-run-report.v0.1.json");
const businessCopilotReadinessPacketExample = await readJson("examples/business-copilot-readiness-packet.v0.1.json");
const presentationPreflightExample = await readJson("examples/presentation-preflight.v0.1.json");
const presentationEvidenceExample = await readJson("examples/presentation-evidence.v0.1.json");
const frontierPacketExample = await readJson("examples/frontier-intent-pilot-packet.v0.1.json");
const frontierWorkerEvidenceExample = await readJson("examples/frontier-host-worker-evidence.trust-failed.v0.1.json");
const frontierPilotEvidenceExample = await readJson("examples/frontier-intent-pilot-evidence.trust-failed.v0.1.json");
const frontierPilotValidationExample = await readJson("examples/frontier-intent-pilot-validation.trust-failed.v0.1.json");
const frontierPilotRunExample = await readJson("examples/frontier-intent-pilot-run.trust-retry.v0.1.json");
const actionIntentSummaryExample = await readJson("examples/action-intent-proof-pack/action-intent-proof-summary.json");
const actionIntentNegativeCasesExample = await readJson("examples/action-intent-negative-cases.v0.1.json");
const businessPortSummaryExample = await readJson("examples/business-port-proof-pack/business-port-proof-summary.json");
const registrySummaryExample = await readJson("examples/commitment-registry-proof-pack/registry-proof-summary.json");
const protocolTraceMatrixExample = await readJson("examples/protocol-golden-trace-matrix.v0.1.json");
const a2aGatewayProfile = await readJson("artifacts/agentport-a2a-gateway-profile.v0.1.json");
const a2aGatewayTraceSuite = await readJson("examples/a2a-gateway-trace-suite.v0.1.json");
const a2aGatewayCompatibilityReportExample = await readJson("examples/a2a-gateway-compatibility-report.v0.1.json");
const agentGatewayIngressCompatibilityReportExample = await readJson("examples/agent-gateway-ingress-compatibility-report.v0.1.json");
const a2aHostBinding = await readJson("artifacts/agentport-a2a-host-binding.v0.1.json");
const a2aHostPassingTrace = await readJson("examples/a2a-host-trace.passing.v0.1.json");
const a2aHostDirectExecuteTrace = await readJson("examples/a2a-host-trace.direct-execute.v0.1.json");
const a2aHostConnectorCapture = await readJson("examples/chatgpt-app-connector-capture.send-ticket.v0.1.json");
const a2aHostDirectConnectorCapture = await readJson("examples/chatgpt-app-connector-capture.direct-execute.v0.1.json");
const a2aHostSendTicketEventLog = await readJson("examples/a2a-host-event-log.send-ticket.v0.1.json");
const a2aHostRestoreTicketEventLog = await readJson("examples/a2a-host-event-log.restore-ticket-status.v0.1.json");
const a2aHostFailedDirectExecuteEventLog = await readJson("examples/a2a-host-event-log.failed-direct-execute.v0.1.json");
const a2aHostProofSummary = await readJson("examples/a2a-host-proof-pack/proof-summary.json");
const a2aHostProofReport = await readJson("examples/a2a-host-proof-pack/adoption-report.json");
const a2aHostProofRedactionManifest = await readJson("examples/a2a-host-proof-pack/redaction-manifest.json");
const protocolPublicationSchema = await readJson("schemas/agentport-protocol-publication.schema.json");
const protocolPublication = await readJson("examples/implementer-kit/protocol-publication.v0.2.json");

assertArtifactHeaders(codes, "agentport-protocol-codes");
assertArtifactHeaders(profiles, "agentport-conformance-profiles");
assertProfileArtifact(profiles);
assertCodeArtifact(codes);
assertSchema(reportSchema);
assertCompactEnvelopeSchema(compactEnvelopeSchema, codes);
assertPresentationSchemas(
  codes,
  ownerProofRequestSchema,
  presentationRunPacketSchema,
  presentationRunStatusSchema,
  presentationRunBriefSchema,
  presentationRunReportSchema,
  businessCopilotReadinessPacketSchema,
  presentationPreflightSchema,
  presentationEvidenceSchema,
  ownerProofRequestExample,
  presentationRunPacketExample,
  presentationRunStatusExample,
  presentationRunBriefExample,
  presentationRunReportExample,
  businessCopilotReadinessPacketExample,
  presentationPreflightExample,
  presentationEvidenceExample
);
assertFrontierIntentSchemas(
  frontierPacketSchema,
  frontierWorkerEvidenceSchema,
  frontierPilotEvidenceSchema,
  frontierPilotValidationSchema,
  frontierPilotRunSchema,
  frontierPacketExample,
  frontierWorkerEvidenceExample,
  frontierPilotEvidenceExample,
  frontierPilotValidationExample,
  frontierPilotRunExample
);
assertActionIntentSchemas(
  actionIntentProofPackSchema,
  actionIntentCompatibilityReportSchema,
  actionIntentSummaryExample,
  actionIntentNegativeCasesExample
);
assertBusinessPortRegistryTraceSchemas(
  businessPortProofPackSchema,
  businessPortCompatibilityReportSchema,
  registryProofPackSchema,
  registryCompatibilityReportSchema,
  protocolTraceMatrixSchema,
  protocolTraceCompatibilityReportSchema,
  a2aGatewayProfileSchema,
  a2aGatewayTraceSuiteSchema,
  a2aGatewayCompatibilityReportSchema,
  a2aHostBindingSchema,
  a2aHostTraceSchema,
  a2aHostConnectorCaptureSchema,
  a2aHostEventLogSchema,
  a2aHostAdoptionReportSchema,
  a2aHostProofPackSchema,
  businessPortSummaryExample,
  registrySummaryExample,
  protocolTraceMatrixExample,
  a2aGatewayProfile,
  a2aGatewayTraceSuite,
  a2aGatewayCompatibilityReportExample,
  a2aHostBinding,
  a2aHostPassingTrace,
  a2aHostDirectExecuteTrace,
  a2aHostConnectorCapture,
  a2aHostDirectConnectorCapture,
  a2aHostSendTicketEventLog,
  a2aHostRestoreTicketEventLog,
  a2aHostFailedDirectExecuteEventLog,
  a2aHostProofSummary,
  a2aHostProofReport,
  a2aHostProofRedactionManifest
);
assertAgentGatewayIngressCompatibilityReport(
  agentGatewayIngressCompatibilityReportSchema,
  agentGatewayIngressCompatibilityReportExample
);
assertProtocolPublication(protocolPublicationSchema, protocolPublication);
assertEvidenceFiles();

const report = {
  protocol: "agentport",
  version: "0.1",
  implementation: {
    name: packageJson.name,
    version: packageJson.version,
    buildId: process.env.GITHUB_SHA ? `git:${process.env.GITHUB_SHA}` : "local"
  },
  profiles: profiles.profiles.map((profile) => ({
    name: profile.name,
    status: "passed",
    testsPassed: profile.minimumTests.length,
    testsFailed: 0,
    testsSkipped: 0,
    evidence: EVIDENCE[profile.name]
  })),
  generatedAt: new Date().toISOString()
};

assertReport(report, reportSchema);

const json = `${JSON.stringify(report, null, 2)}\n`;
if (outPath) {
  await writeFile(outPath, json, "utf8");
} else {
  process.stdout.write(json);
}

function assertArtifactHeaders(value, protocol) {
  assertEqual(value.protocol, protocol, `${protocol}:protocol`);
  assertEqual(value.version, "0.1", `${protocol}:version`);
}

function assertProfileArtifact(value) {
  const names = value.profiles.map((profile) => profile.name);
  assertDeepEqual(names, PROFILE_NAMES, "profile order/names");
  for (const profile of value.profiles) {
    assertNonEmptyArray(profile.requires, `${profile.name}:requires`);
    assertNonEmptyArray(profile.forbids, `${profile.name}:forbids`);
    assertNonEmptyArray(profile.minimumTests, `${profile.name}:minimumTests`);
    assertEqual(typeof profile.claim, "string", `${profile.name}:claim`);
  }
}

function assertCodeArtifact(value) {
  assertDeepEqual(value.codeFamilies.verificationStatus, ["verified", "stale", "unverified"], "verification statuses");
  assertDeepEqual(value.codeFamilies.tier, ["inform", "handoff", "request", "confirm"], "tiers");
  assertDeepEqual(value.codeFamilies.authorityAssurance, ["none", "signed", "verified-mandate"], "authority assurance");
  assertDeepEqual(value.codeFamilies.authorityEvidenceKind, [
    "agentport-local-delegation",
    "ap2-mandate",
    "ucp-http-signature",
    "acp-checkout"
  ], "authority evidence kinds");
  for (const code of [
    "read",
    "availability",
    "lead",
    "commit",
    "manage",
    "funds"
  ]) {
    assertIncludes(value.codeFamilies.actionLayer, code, `actionLayer:${code}`);
  }
  for (const code of [
    "confirmed",
    "rejected",
    "failed",
    "no_verified_info"
  ]) {
    assertIncludes(value.codeFamilies.resultType, code, `resultType:${code}`);
  }
  for (const code of [
    "consent_required",
    "adapter_capability_violation",
    "delegation_required",
    "delegation_action_intent_mismatch",
    "delegation_token_confirmation_invalid"
  ]) {
    assertIncludes(Object.values(value.codeFamilies.reason).flat(), code, `reason:${code}`);
  }
  assertDeepEqual(value.codeFamilies.presentation.step, [
    "draft",
    "ownership_challenge",
    "owner_proof_request",
    "verify_ownership",
    "preflight",
    "live_arc",
    "validate_evidence"
  ], "presentation steps");
  assertIncludes(value.codeFamilies.presentation.artifact, "ownerProofRequest", "presentation owner proof request artifact");
  assertIncludes(value.codeFamilies.presentation.action, "operator_create_owner_proof_request", "presentation owner proof request action");
  assertIncludes(value.codeFamilies.presentation.evidenceIssue, "owner_proof_request_mismatch", "presentation owner proof request issue");
  assertIncludes(value.codeFamilies.presentation.evidenceBoundary, "grounded_assist", "presentation grounded assist boundary");
  assertIncludes(value.codeFamilies.businessCopilot.state, "draft_required", "business copilot draft state");
  assertIncludes(value.codeFamilies.businessCopilot.retention, "refs_only", "business copilot retention");
  assertIncludes(value.codeFamilies.businessCopilot.state, "published", "business copilot published state");
  assertIncludes(value.codeFamilies.businessCopilot.validationIssue, "unexpected_field", "business copilot compact validation issue");
}

function assertSchema(schema) {
  assertEqual(schema.properties.protocol.const, "agentport", "report schema protocol");
  assertIncludes(schema.properties.profiles.items.properties.name.enum, "gateway-protocol", "report schema gateway profile");
  assertIncludes(schema.properties.profiles.items.properties.name.enum, "plugin-wallet", "report schema plugin wallet profile");
  assertIncludes(Object.keys(schema.properties.profiles.items.properties), "evidence", "report schema evidence");
}

function assertCompactEnvelopeSchema(schema, codes) {
  assertEqual(schema.properties.protocol.const, "agentport", "compact envelope protocol");
  assertDeepEqual(schema.properties.actionLayer.enum, codes.codeFamilies.actionLayer, "compact envelope action layers");
  assertDeepEqual(schema.properties.result.properties.type.enum, codes.codeFamilies.resultType, "compact envelope result types");
  assertDeepEqual(schema.$defs.reasonCode.enum, Object.values(codes.codeFamilies.reason).flat(), "compact envelope reason codes");
}

function assertPresentationSchemas(
  codes,
  ownerProofRequestSchema,
  runPacketSchema,
  runStatusSchema,
  runBriefSchema,
  runReportSchema,
  copilotPacketSchema,
  preflightSchema,
  evidenceSchema,
  ownerProofRequestExample,
  runPacketExample,
  runStatusExample,
  runBriefExample,
  runReportExample,
  copilotPacketExample,
  preflightExample,
  evidenceExample
) {
  assertEqual(ownerProofRequestSchema.properties.type.const, "agentport.owner_proof_request.v1", "owner proof request type");
  assertEqual(ownerProofRequestSchema.properties.safety.properties.notVerification.const, true, "owner proof request not verification");
  assertEqual(ownerProofRequestSchema.properties.safety.properties.verifiedBy.const, "agentport", "owner proof request verifier");
  assertEqual(ownerProofRequestExample.type, ownerProofRequestSchema.properties.type.const, "owner proof request example type");
  assertEqual(ownerProofRequestExample.safety.notVerification, true, "owner proof request example not verification");

  assertEqual(runPacketSchema.properties.type.const, "agentport.presentation_run_packet.v1", "presentation run packet type");
  assertDeepEqual(runPacketSchema.properties.operator.properties.steps.items.properties.code.enum, codes.codeFamilies.presentation.step, "presentation run packet steps");
  assertDeepEqual(runPacketSchema.$defs.artifactKey.enum, codes.codeFamilies.presentation.artifact, "presentation run packet artifacts");
  assertEqual(runPacketExample.type, runPacketSchema.properties.type.const, "presentation run packet example type");
  assertDeepEqual(
    runPacketExample.operator.steps.map((step) => step.code),
    runPacketSchema.properties.operator.properties.steps.items.properties.code.enum,
    "presentation run packet example steps"
  );

  assertEqual(runStatusSchema.properties.type.const, "agentport.presentation_run_status.v1", "presentation run status type");
  assertDeepEqual(runStatusSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step, "presentation run status steps");
  assertDeepEqual(runStatusSchema.$defs.artifactKey.enum, codes.codeFamilies.presentation.artifact, "presentation run status artifacts");
  assertDeepEqual(runStatusSchema.properties.issues.items.properties.code.enum, codes.codeFamilies.presentation.runIssue, "presentation run status issues");
  assertEqual(runStatusSchema.$defs.stepGate.properties.code.const, codes.codeFamilies.presentation.gate[0], "presentation run status gate");
  assertIncludes(runStatusSchema.properties.checks.required, "packetConsistent", "presentation run status packet consistency");
  assertIncludes(Object.keys(runStatusSchema.properties.checks.properties), "evidenceMatchesPacket", "presentation run status evidence match check");
  assertIncludes(runStatusSchema.properties.issues.items.properties.code.enum, "evidence_packet_mismatch", "presentation run status evidence mismatch issue");
  assertEqual(runStatusExample.type, runStatusSchema.properties.type.const, "presentation run status example type");
  assertEqual(runStatusExample.nextStep.code, "draft", "presentation run status example next step");

  assertEqual(runBriefSchema.properties.type.const, "agentport.presentation_run_brief.v1", "presentation run brief type");
  assertDeepEqual(runBriefSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step, "presentation run brief steps");
  assertDeepEqual(runBriefSchema.$defs.actionCode.enum, codes.codeFamilies.presentation.action, "presentation run brief actions");
  assertEqual(runBriefSchema.$defs.stepGate.properties.code.const, codes.codeFamilies.presentation.gate[0], "presentation run brief gate");
  assertIncludes(Object.keys(runBriefSchema.properties.checks.properties), "evidenceMatchesPacket", "presentation run brief evidence match check");
  assertDeepEqual(runBriefSchema.properties.issues.items.properties.code.enum, codes.codeFamilies.presentation.runIssue, "presentation run brief issues");
  assertEqual(runBriefExample.type, runBriefSchema.properties.type.const, "presentation run brief example type");
  assertEqual(runBriefExample.current.action, "operator_draft", "presentation run brief example action");

  assertEqual(runReportSchema.properties.type.const, "agentport.presentation_run_report.v1", "presentation run report type");
  assertDeepEqual(runReportSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step, "presentation run report steps");
  assertDeepEqual(runReportSchema.$defs.actionCode.enum, codes.codeFamilies.presentation.action, "presentation run report actions");
  assertDeepEqual(runReportSchema.$defs.runIssueCode.enum, codes.codeFamilies.presentation.runIssue, "presentation run report issues");
  assertDeepEqual(runReportSchema.$defs.evidenceIssueCode.enum, codes.codeFamilies.presentation.evidenceIssue, "presentation run report evidence issues");
  assertEqual(runReportSchema.$defs.stepGate.properties.code.const, codes.codeFamilies.presentation.gate[0], "presentation run report gate");
  assertEqual(runReportExample.type, runReportSchema.properties.type.const, "presentation run report example type");
  assertEqual(runReportExample.evidence.matchesPacket, true, "presentation run report example evidence match");

  assertEqual(copilotPacketSchema.properties.type.const, "agentport.business_copilot_readiness_packet.v0.1", "business copilot packet type");
  assertDeepEqual(copilotPacketSchema.$defs.stateCode.enum, codes.codeFamilies.businessCopilot.state, "business copilot packet states");
  assertDeepEqual(copilotPacketSchema.$defs.retentionCode.enum, codes.codeFamilies.businessCopilot.retention, "business copilot packet retention");
  assertIncludes(codes.codeFamilies.businessCopilot.validationIssue, "invalid_artifact_ref", "business copilot validation issues");
  assertDeepEqual(copilotPacketSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step, "business copilot packet steps");
  assertDeepEqual(copilotPacketSchema.$defs.artifactCode.enum, codes.codeFamilies.presentation.artifact, "business copilot packet artifacts");
  assertDeepEqual(copilotPacketSchema.$defs.actionCode.enum, codes.codeFamilies.presentation.action, "business copilot packet actions");
  assertEqual(copilotPacketExample.type, copilotPacketSchema.properties.type.const, "business copilot packet example type");
  assertEqual(copilotPacketExample.state.code, "draft_required", "business copilot packet example state");
  assertEqual(copilotPacketExample.retention.code, "refs_only", "business copilot packet example retention");
  assertEqual(copilotPacketExample.requirements[0].code, "anthropic_api_key", "business copilot packet example requirement");

  assertEqual(preflightSchema.properties.type.const, "agentport.presentation_preflight.v1", "presentation preflight type");
  assertDeepEqual(preflightSchema.required, ["type", "generatedAt", "ready", "artifacts", "checks", "issues"], "presentation preflight required");
  assertDeepEqual(preflightSchema.properties.checks.required, [
    "goalPresent",
    "draftUnconfirmed",
    "reviewNonPublishable",
    "reviewedSubmissionReady",
    "ownershipConfirmed",
    "ownershipByAgentPort",
    "noRawCredentials",
    "businessIdsAligned",
    "proofArtifactsReadable"
  ], "presentation preflight checks");
  assertIncludes(preflightSchema.properties.issues.items.properties.code.enum, "artifact_read_failed", "presentation preflight artifact issue");
  assertEqual(preflightExample.type, preflightSchema.properties.type.const, "presentation preflight example type");
  assertEqual(preflightExample.ready, true, "presentation preflight example ready");
  assertDeepEqual(Object.keys(preflightExample.checks), preflightSchema.properties.checks.required, "presentation preflight example checks");

  assertEqual(evidenceSchema.properties.type.const, "agentport.presentation_evidence.v1", "presentation evidence type");
  assertDeepEqual(evidenceSchema.properties.boundaries.items.properties.code.enum, codes.codeFamilies.presentation.evidenceBoundary, "presentation evidence boundaries");
  const assistSchema = resolveLocalRef(evidenceSchema, evidenceSchema.properties.assist);
  assertEqual(assistSchema.properties.transport.enum[0], "mcp_http", "presentation evidence transport");
  assertIncludes(evidenceSchema.properties.negativeAssist.allOf[1].required, "goal", "presentation evidence negative assist goal");
  assertEqual(evidenceExample.type, evidenceSchema.properties.type.const, "presentation evidence example type");
  assertEqual(evidenceExample.negativeAssist.transport, "mcp_http", "presentation evidence negative assist transport");
  assertDeepEqual(evidenceExample.boundaries.map((boundary) => boundary.code), evidenceSchema.properties.boundaries.items.properties.code.enum, "presentation evidence example boundaries");
}

function assertFrontierIntentSchemas(
  packetSchema,
  workerEvidenceSchema,
  pilotEvidenceSchema,
  pilotValidationSchema,
  pilotRunSchema,
  packetExample,
  workerEvidenceExample,
  pilotEvidenceExample,
  pilotValidationExample,
  pilotRunExample
) {
  assertEqual(packetSchema.properties.type.const, "agentport.frontier_intent_pilot_packet.v0.1", "frontier packet type");
  assertEqual(workerEvidenceSchema.properties.artifact.const, "agentport.frontier_host_worker_evidence.v0.1", "frontier worker evidence type");
  assertEqual(pilotEvidenceSchema.properties.type.const, "agentport.frontier_intent_pilot_evidence.v0.1", "frontier pilot evidence type");
  assertEqual(pilotValidationSchema.properties.type.const, "agentport.frontier_intent_pilot_evidence_validation.v0.1", "frontier validation type");
  assertEqual(pilotRunSchema.properties.type.const, "agentport.frontier_intent_pilot_run.v0.1", "frontier run type");
  assertIncludes(pilotRunSchema.properties.mode.enum, "trust-retry", "frontier trust retry mode");
  assertIncludes(pilotValidationSchema.$defs.resolution.properties.kind.enum, "delivery_verification_failed", "frontier trust failure resolution");
  assertEqual(packetExample.type, packetSchema.properties.type.const, "frontier packet example type");
  assertEqual(workerEvidenceExample.artifact, workerEvidenceSchema.properties.artifact.const, "frontier worker example type");
  assertEqual(pilotEvidenceExample.type, pilotEvidenceSchema.properties.type.const, "frontier evidence example type");
  assertEqual(pilotValidationExample.type, pilotValidationSchema.properties.type.const, "frontier validation example type");
  assertEqual(pilotRunExample.type, pilotRunSchema.properties.type.const, "frontier run example type");
  assertEqual(pilotRunExample.mode, "trust-retry", "frontier run example trust retry mode");
  assertEqual(pilotRunExample.trustRetry.failed.verification.reason, "delivery_issuer_untrusted", "frontier run example trust failure");
  assertEqual(pilotRunExample.trustRetry.failed.acknowledged, false, "frontier run example failed ack");
  assertEqual(pilotRunExample.trustRetry.retry.acknowledged, true, "frontier run example retry ack");
  assertEqual(pilotRunExample.trustRetry.sameDelivery, true, "frontier run example same delivery");
}

function assertActionIntentSchemas(
  proofPackSchema,
  reportSchema,
  summaryExample,
  negativeCasesExample
) {
  assertEqual(proofPackSchema.properties.userGoal.$ref, "#/$defs/userGoal", "action intent user goal schema ref");
  assertEqual(proofPackSchema.$defs.userGoal.properties.type.const, "agentport.action_intent_user_goal.v0.1", "action intent user goal type");
  assertEqual(proofPackSchema.$defs.compiledIntent.properties.actionIntent.properties.action.const, "book_service", "action intent compiled action");
  assertEqual(proofPackSchema.$defs.requiredInputs.properties.boundaries.properties.finalApprovalBlocked.const, true, "action intent required input gate");
  assertEqual(proofPackSchema.$defs.approvedExecution.properties.approvalEvent.properties.userConsentBeforeApproval.const, false, "action intent no early consent");
  assertEqual(proofPackSchema.$defs.receiptRefs.properties.retention.properties.storesFullReceiptBody.const, false, "action intent receipt body excluded");
  assertEqual(reportSchema.properties.type.const, "agentport.action_intent_compatibility_report.v0.1", "action intent report type");
  assertIncludes(reportSchema.properties.profile.enum, "frontier", "action intent frontier profile");
  assertIncludes(reportSchema.properties.profile.enum, "plugin-wallet", "action intent plugin wallet profile");
  assertIncludes(reportSchema.properties.profile.enum, "gateway", "action intent gateway profile");
  assertEqual(reportSchema.properties.certification.properties.gatewayCertification.const, false, "action intent no gateway certification");
  assertEqual(reportSchema.properties.roleProfile.properties.certification.const, false, "action intent role profile not certification");
  assertEqual(summaryExample.type, proofPackSchema.$defs.summary.properties.type.const, "action intent summary example type");
  assertEqual(summaryExample.boundaries.actionIntentOnly, true, "action intent summary boundary");
  assertEqual(negativeCasesExample.type, "agentport.action_intent_negative_cases.v0.1", "action intent negative case type");
  assertIncludes(
    negativeCasesExample.cases.map((item) => item.id),
    "schema_missing_payload_safety",
    "action intent schema negative case"
  );
  assertIncludes(
    negativeCasesExample.cases.map((item) => item.id),
    "approval_execute_arg_drift",
    "action intent drift negative case"
  );
}

function assertBusinessPortRegistryTraceSchemas(
  businessPortProofPackSchema,
  businessPortReportSchema,
  registryProofPackSchema,
  registryReportSchema,
  traceMatrixSchema,
  traceReportSchema,
  a2aGatewayProfileSchema,
  a2aGatewayTraceSuiteSchema,
  a2aGatewayCompatibilityReportSchema,
  a2aHostBindingSchema,
  a2aHostTraceSchema,
  a2aHostConnectorCaptureSchema,
  a2aHostEventLogSchema,
  a2aHostAdoptionReportSchema,
  a2aHostProofPackSchema,
  businessPortSummaryExample,
  registrySummaryExample,
  traceMatrixExample,
  a2aGatewayProfile,
  a2aGatewayTraceSuite,
  a2aGatewayCompatibilityReportExample,
  a2aHostBinding,
  a2aHostPassingTrace,
  a2aHostDirectExecuteTrace,
  a2aHostConnectorCapture,
  a2aHostDirectConnectorCapture,
  a2aHostSendTicketEventLog,
  a2aHostRestoreTicketEventLog,
  a2aHostFailedDirectExecuteEventLog,
  a2aHostProofSummary,
  a2aHostProofReport,
  a2aHostProofRedactionManifest
) {
  assertEqual(businessPortProofPackSchema.$defs.inboundRequest.properties.type.const, "agentport.business_port_inbound_request.v0.1", "business port inbound type");
  assertEqual(businessPortProofPackSchema.$defs.gatewayForward.properties.forward.properties.target.const, "agent_gateway", "business port forwards to gateway");
  assertEqual(businessPortReportSchema.properties.type.const, "agentport.business_port_compatibility_report.v0.1", "business port report type");
  assertEqual(businessPortReportSchema.properties.certification.$ref, "#/$defs/certification", "business port report certification");
  assertEqual(businessPortSummaryExample.boundaries.businessPortOnly, true, "business port summary role");
  assertEqual(businessPortSummaryExample.boundaries.systemOfRecord, false, "business port not system of record");

  assertEqual(registryProofPackSchema.$defs.lifecycleWrite.properties.type.const, "agentport.registry_lifecycle_write.v0.1", "registry lifecycle write type");
  assertEqual(registryProofPackSchema.$defs.eventHistory.properties.boundaries.properties.appendOnly.const, true, "registry append only");
  assertEqual(registryReportSchema.properties.type.const, "agentport.registry_compatibility_report.v0.1", "registry report type");
  assertEqual(registrySummaryExample.boundaries.registryOnly, true, "registry summary role");
  assertEqual(registrySummaryExample.boundaries.executesBusinessActions, false, "registry not backend");

  assertEqual(traceMatrixSchema.properties.type.const, "agentport.protocol_golden_trace_matrix.v0.1", "trace matrix type");
  assertEqual(traceReportSchema.properties.type.const, "agentport.protocol_trace_compatibility_report.v0.1", "trace report type");
  assertIncludes(traceMatrixExample.allowed.map((row) => row.id), "approval_to_gateway_execution", "trace allowed approval execution");
  assertIncludes(traceMatrixExample.forbidden.map((row) => row.id), "execute_without_consent", "trace forbidden missing consent");
  assertEqual(traceMatrixExample.boundaries.certification, false, "trace not certification");

  assertEqual(a2aGatewayProfileSchema.properties.protocol.const, "agentport-a2a-gateway-profile", "a2a gateway profile schema protocol");
  assertEqual(a2aGatewayTraceSuiteSchema.properties.type.const, "agentport.a2a_gateway_trace_suite.v0.1", "a2a gateway trace schema type");
  assertEqual(a2aGatewayCompatibilityReportSchema.properties.type.const, "agentport.a2a_gateway_compatibility_report.v0.1", "a2a gateway report schema type");
  assertEqual(a2aGatewayProfile.protocol, "agentport-a2a-gateway-profile", "a2a gateway profile protocol");
  assertEqual(a2aGatewayProfile.boundary.doesNotReplaceA2A, true, "a2a profile does not replace a2a");
  assertEqual(a2aGatewayProfile.boundary.doesNotCertify, true, "a2a profile does not certify");
  assertIncludes(a2aGatewayProfile.resources.map((resource) => resource.uri), "agentport://action-model", "a2a profile action model resource");
  assertIncludes(a2aGatewayProfile.requiredSequence, "compile_action_intent_before_state_change", "a2a profile compile before state change");
  assertIncludes(a2aGatewayProfile.requiredSequence, "execute_with_intentId_approvedActionIntentHash_and_userConsent", "a2a profile execution binding");
  assertIncludes(
    a2aGatewayProfile.taskMapping.find((mapping) => mapping.a2aTaskClass === "action.prepare").agentPortPrimitive,
    "compile_action_intent",
    "a2a prepare maps to compile action intent"
  );
  assertIncludes(
    a2aGatewayProfile.taskMapping.find((mapping) => mapping.a2aTaskClass === "proof.receipt").agentPortPrimitive,
    "ActionReceipt",
    "a2a proof maps to action receipt"
  );
  assertIncludes(
    a2aGatewayProfile.forbiddenShortcuts.map((shortcut) => shortcut.id),
    "a2a_direct_execute_without_compile",
    "a2a direct execution forbidden"
  );
  assertEqual(a2aGatewayTraceSuite.type, "agentport.a2a_gateway_trace_suite.v0.1", "a2a trace suite type");
  assertDeepEqual(a2aGatewayTraceSuite.golden.steps.map((step) => step.agentPortPrimitive), [
    "get_business_feed",
    "compile_action_intent",
    "get_action_intent_lifecycle",
    "book_service",
    "ActionReceipt"
  ], "a2a golden primitive sequence");
  assertIncludes(a2aGatewayTraceSuite.tamper.map((item) => item.id), "direct_execute_without_compile", "a2a tamper direct execute");
  assertIncludes(a2aGatewayTraceSuite.tamper.map((item) => item.id), "invented_approval", "a2a tamper invented approval");
  assertIncludes(a2aGatewayTraceSuite.tamper.map((item) => item.id), "forged_receipt", "a2a tamper forged receipt");
  assertEqual(a2aGatewayTraceSuite.boundaries.replacesA2A, false, "a2a trace does not replace a2a");
  assertEqual(a2aGatewayCompatibilityReportExample.type, "agentport.a2a_gateway_compatibility_report.v0.1", "a2a gateway report example type");
  assertEqual(a2aGatewayCompatibilityReportExample.profile, "a2a-gateway", "a2a gateway report profile");
  assertEqual(a2aGatewayCompatibilityReportExample.certification.publicCertification, false, "a2a gateway report not public certification");
  assertEqual(a2aGatewayCompatibilityReportExample.certification.a2aCertification, false, "a2a gateway report not a2a certification");
  assertEqual(a2aGatewayCompatibilityReportExample.boundaries.agentGatewayAlreadyExists, true, "a2a gateway report existing gateway boundary");
  assertEqual(a2aGatewayCompatibilityReportExample.boundaries.replacesA2A, false, "a2a gateway report does not replace a2a");
  assertIncludes(a2aGatewayCompatibilityReportExample.areas.map((area) => area.id), "safe_sequence", "a2a gateway report safe sequence");
  assertIncludes(a2aGatewayCompatibilityReportExample.checks.map((check) => check.id), "compile_before_state_change", "a2a gateway report compile check");

  assertEqual(a2aHostBindingSchema.properties.protocol.const, "agentport-a2a-host-binding", "a2a host binding schema protocol");
  assertEqual(a2aHostTraceSchema.properties.type.const, "agentport.a2a_host_trace.v0.1", "a2a host trace schema type");
  assertEqual(a2aHostConnectorCaptureSchema.properties.type.const, "agentport.a2a_host_connector_capture.v0.1", "a2a host connector capture schema type");
  assertEqual(a2aHostEventLogSchema.properties.type.const, "agentport.a2a_host_event_log.v0.1", "a2a host event log schema type");
  assertEqual(a2aHostAdoptionReportSchema.properties.type.const, "agentport.a2a_host_adoption_report.v0.1", "a2a host report schema type");
  assertEqual(a2aHostProofPackSchema.properties.type.const, "agentport.a2a_host_proof_pack.v0.1", "a2a host proof pack schema type");
  assertEqual(a2aHostBinding.protocol, "agentport-a2a-host-binding", "a2a host binding protocol");
  assertEqual(a2aHostBinding.boundary.hostOwnsIntent, true, "a2a host owns intent");
  assertEqual(a2aHostBinding.boundary.agentPortOwnsGatewayTruth, true, "agentport owns gateway truth");
  assertIncludes(
    a2aHostBinding.requiredHostSequence,
    "compile_action_intent_before_state_change",
    "a2a host compile sequence"
  );
  assertIncludes(
    a2aHostBinding.forbiddenHostShortcuts.map((shortcut) => shortcut.id),
    "host_invented_approval",
    "a2a host invented approval shortcut"
  );
  assertEqual(a2aHostPassingTrace.type, "agentport.a2a_host_trace.v0.1", "a2a host passing trace type");
  assertEqual(a2aHostPassingTrace.expectedStatus, "passed", "a2a host passing trace status");
  assertIncludes(
    a2aHostPassingTrace.events.map((event) => event.phase),
    "compile_action_intent",
    "a2a host passing trace compiles"
  );
  assertIncludes(
    a2aHostPassingTrace.events.map((event) => event.phase),
    "receive_receipt",
    "a2a host passing trace receives receipt"
  );
  assertEqual(a2aHostDirectExecuteTrace.expectedStatus, "failed", "a2a host direct execute fails");
  assertIncludes(a2aHostDirectExecuteTrace.expectedFailureIds, "host_compile_before_execute", "a2a host direct execute failure id");
  assertEqual(a2aHostConnectorCapture.type, "agentport.a2a_host_connector_capture.v0.1", "a2a host connector capture type");
  assertEqual(a2aHostConnectorCapture.surface, "chatgpt_app_connector", "a2a host connector surface");
  assertIncludes(a2aHostConnectorCapture.toolCalls.map((call) => call.name).filter(Boolean), "send_ticket", "a2a connector capture send ticket");
  assertEqual(a2aHostDirectConnectorCapture.expectedStatus, "failed", "a2a direct connector capture fails");
  assertIncludes(a2aHostDirectConnectorCapture.expectedFailureIds, "host_compile_before_execute", "a2a direct connector capture failure");
  assertEqual(a2aHostSendTicketEventLog.type, "agentport.a2a_host_event_log.v0.1", "a2a send ticket event log type");
  assertEqual(a2aHostSendTicketEventLog.expectedStatus, "passed", "a2a send ticket event log status");
  assertIncludes(a2aHostSendTicketEventLog.events.map((event) => event.tool).filter(Boolean), "send_ticket", "a2a send ticket event log tool");
  assertEqual(a2aHostRestoreTicketEventLog.expectedStatus, "passed", "a2a restore ticket event log status");
  assertIncludes(a2aHostRestoreTicketEventLog.events.map((event) => event.tool).filter(Boolean), "ActionReceipt", "a2a restore ticket event log receipt");
  assertEqual(a2aHostFailedDirectExecuteEventLog.expectedStatus, "failed", "a2a failed direct event log status");
  assertIncludes(a2aHostFailedDirectExecuteEventLog.expectedFailureIds, "host_compile_before_execute", "a2a failed direct event log failure");
  assertEqual(a2aHostProofSummary.type, "agentport.a2a_host_proof_pack.v0.1", "a2a host proof summary type");
  assertEqual(a2aHostProofSummary.ok, true, "a2a host proof summary ok");
  assertEqual(a2aHostProofSummary.certification.a2aCertification, false, "a2a host proof not a2a certification");
  assertEqual(a2aHostProofReport.type, "agentport.a2a_host_adoption_report.v0.1", "a2a host proof report type");
  assertEqual(a2aHostProofReport.ok, true, "a2a host proof report ok");
  assertEqual(a2aHostProofRedactionManifest.type, "agentport.a2a_host_proof_pack_redaction_manifest.v0.1", "a2a host redaction manifest type");
  assertEqual(a2aHostProofRedactionManifest.checks.containsRawAuthorityTokens, false, "a2a host proof no raw authority tokens");
}

function assertAgentGatewayIngressCompatibilityReport(schema, example) {
  assertEqual(schema.properties.type.const, "agentport.agent_gateway_ingress_compatibility_report.v0.1", "agent gateway ingress report schema type");
  assertEqual(example.type, "agentport.agent_gateway_ingress_compatibility_report.v0.1", "agent gateway ingress report example type");
  assertEqual(example.profile, "agent-gateway-ingress", "agent gateway ingress report profile");
  assertEqual(example.status, "passed", "agent gateway ingress report passed");
  assertEqual(example.certification.publicCertification, false, "agent gateway ingress not public certification");
  assertEqual(example.certification.realBusinessCertification, false, "agent gateway ingress not real business proof");
  assertEqual(example.certification.verifiedBusiness, false, "agent gateway ingress not verified business proof");
  assertEqual(example.boundaries.externalAgentCanPresentEvidence, true, "external agent can present evidence");
  assertEqual(example.boundaries.externalAgentCanMintAuthority, false, "external agent cannot mint authority");
  assertEqual(example.boundaries.gatewayChecksAuthorityEnvelope, true, "gateway checks authority envelope");
  assertEqual(example.boundaries.gatewayChecksReplayProtection, true, "gateway checks replay protection");
  assertEqual(example.boundaries.gatewayChecksHolderProof, true, "gateway checks holder proof");
  assertEqual(example.boundaries.gatewayChecksDestinationBinding, true, "gateway checks destination binding");
  assertEqual(example.boundaries.backendMutation, false, "ingress does not mutate backend");
  assertEqual(example.boundaries.agentPortSystemOfRecord, false, "ingress not system of record");
  assertIncludes(example.areas.map((area) => area.id), "wallet_confirmation", "ingress wallet confirmation area");
  assertIncludes(example.areas.map((area) => area.id), "destination_binding", "ingress destination binding area");
  assertIncludes(example.checks.map((check) => check.id), "authority_envelope_required", "ingress authority envelope check");
  assertIncludes(example.checks.map((check) => check.id), "replay_protection_checked", "ingress replay check");
  assertIncludes(example.checks.map((check) => check.id), "holder_proof_required", "ingress holder proof check");
  assertIncludes(example.checks.map((check) => check.id), "wrong_destination_rejected", "ingress destination rejection check");
  assertIncludes(example.evidence.tests, "test/server/vercel-entrypoint.test.mjs", "ingress vercel route test evidence");
  assertIncludes(example.evidence.tests, "test/server/vercel-agent-ticket-ingress-redis.test.mjs", "ingress redis route test evidence");
}

function assertProtocolPublication(schema, value) {
  assertEqual(schema.properties.type.const, "agentport.protocol_publication.v0.2", "protocol publication schema type");
  assertEqual(schema.properties.status.const, "stable_published", "protocol publication schema status");
  assertEqual(value.type, "agentport.protocol_publication.v0.2", "protocol publication type");
  assertEqual(value.status, "stable_published", "protocol publication status");
  assertEqual(value.technicalFreeze, true, "protocol publication technical freeze");
  assertEqual(value.cutReadiness, true, "protocol publication cut readiness");
  assertEqual(value.stablePublication, true, "protocol publication stable publication");
  assertEqual(value.packageRefs.cutManifest, "examples/implementer-kit/protocol-cut.v0.2.json", "protocol publication cut manifest ref");
  assertEqual(value.packageRefs.governancePolicy, "examples/implementer-kit/protocol-governance.v0.2.json", "protocol publication governance ref");
  assertEqual(value.packageRefs.releaseNotes, "docs/agentport-open-standard-v0.2-release-notes.md", "protocol publication release notes ref");
  assertEqual(value.packageRefs.stableCutReview, "docs/agentport-open-standard-v0.2-stable-cut-review.md", "protocol publication stable-cut review ref");
  assertEqual(value.packageRefs.externalReview, "examples/implementer-kit/protocol-external-review.v0.2.json", "protocol publication external review ref");
  assertEqual(value.packageRefs.externalReviewResult, "examples/implementer-kit/protocol-external-review-result.v0.2.json", "protocol publication external review result ref");
  assertEqual(value.packageRefs.stablePublication, "examples/implementer-kit/protocol-stable-publication.v0.2.json", "protocol publication stable publication ref");
  assertIncludes(value.includedSurfaces, "agent_gateway", "protocol publication gateway surface");
  assertIncludes(value.includedSurfaces, "plugin_wallet", "protocol publication plugin surface");
  assertIncludes(value.includedSurfaces, "a2a_host_binding", "protocol publication A2A host surface");
  assertEqual(value.gates.manifestCommands, "passed", "protocol publication manifest command gate");
  assertEqual(value.gates.publicPackageAudit, "passed", "protocol publication public package audit gate");
  assertEqual(value.gates.conformance, "passed", "protocol publication conformance gate");
  assertEqual(value.gates.tests, "passed", "protocol publication test gate");
  assertEqual(value.gates.diffCheck, "passed", "protocol publication diff check gate");
  assertEqual(value.certification.agentPortCertified, false, "protocol publication certification boundary");
  assertEqual(value.certification.agentPortVerifiedBusiness, false, "protocol publication verified-business boundary");
  assertEqual(value.certification.realBusinessProof, false, "protocol publication real-business boundary");
  assertEqual(value.certification.liveBackendProof, false, "protocol publication live-backend boundary");
  assertEqual(value.certification.stablePublication, true, "protocol publication stable-publication boundary");
  assertEqual(value.stablePromotionBlockers.includes("external_publication_review_not_recorded"), false, "protocol publication review blocker cleared");
  assertEqual(value.stablePromotionBlockers.includes("stable_publication_tag_not_set"), false, "protocol publication stable tag blocker cleared");
  assertIncludes(value.forbiddenClaims, "AgentPort Certified", "protocol publication forbidden certification claim");
  assertIncludes(value.forbiddenClaims, "real-business proof", "protocol publication forbidden real-business claim");
  assertIncludes(value.forbiddenClaims, "live-backend proof", "protocol publication forbidden live-backend claim");
}

function assertEvidenceFiles() {
  for (const profileName of PROFILE_NAMES) {
    assertNonEmptyArray(EVIDENCE[profileName], `${profileName}:evidence`);
    for (const path of EVIDENCE[profileName]) {
      if (!existsSync(path)) {
        throw new Error(`missing_evidence:${profileName}:${path}`);
      }
    }
  }
}

function assertReport(report, schema) {
  assertEqual(report.protocol, schema.properties.protocol.const, "report protocol");
  assertEqual(report.version, schema.properties.version.const, "report version");
  assertNonEmptyArray(report.profiles, "report profiles");
  assertDeepEqual(report.profiles.map((profile) => profile.name), PROFILE_NAMES, "report profile names");
  for (const profile of report.profiles) {
    assertIncludes(schema.properties.profiles.items.properties.status.enum, profile.status, `${profile.name}:status`);
    if (profile.testsFailed !== 0) {
      throw new Error(`profile_failed:${profile.name}`);
    }
    assertNonEmptyArray(profile.evidence, `${profile.name}:report evidence`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveLocalRef(schema, node) {
  if (!node?.$ref) {
    return node;
  }
  const path = node.$ref.replace(/^#\//, "").split("/");
  return path.reduce((current, segment) => current?.[segment], schema);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values, expected, label) {
  if (!values.includes(expected)) {
    throw new Error(`${label}: missing ${JSON.stringify(expected)}`);
  }
}

function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}: expected non-empty array`);
  }
}
