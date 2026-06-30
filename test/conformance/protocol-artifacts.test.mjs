import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);

describe("protocol conformance artifacts", () => {
  it("defines machine-readable v0.1 code and profile artifacts", async () => {
    const codes = await readJson("artifacts/agentport-protocol-codes.v0.1.json");
    const profiles = await readJson("artifacts/agentport-conformance-profiles.v0.1.json");

    assert.equal(codes.protocol, "agentport-protocol-codes");
    assert.equal(codes.version, "0.1");
    assert.deepEqual(codes.codeFamilies.verificationStatus, ["verified", "stale", "unverified"]);
    assert.deepEqual(codes.codeFamilies.authorityAssurance, ["none", "signed", "verified-mandate"]);
    assert.deepEqual(codes.codeFamilies.commitmentStatus, ["active", "cancelled", "rescheduled", "expired", "released", "failed"]);
    assert.ok(codes.codeFamilies.commitmentEventType.includes("rescheduled"));
    assert.ok(codes.codeFamilies.commitmentRight.includes("transfer"));
    assert.ok(codes.codeFamilies.authorityEvidenceKind.includes("agentport-local-delegation"));
    assert.ok(codes.codeFamilies.authorityEvidenceKind.includes("ap2-mandate"));
    assert.ok(codes.codeFamilies.reason.delegation.includes("delegation_action_intent_mismatch"));
    assert.deepEqual(codes.codeFamilies.presentation.step, [
      "draft",
      "ownership_challenge",
      "owner_proof_request",
      "verify_ownership",
      "preflight",
      "live_arc",
      "validate_evidence"
    ]);
    assert.ok(codes.codeFamilies.presentation.artifact.includes("ownerProofRequest"));
    assert.ok(codes.codeFamilies.presentation.evidenceIssue.includes("owner_proof_request_mismatch"));
    assert.ok(codes.codeFamilies.businessCopilot.state.includes("draft_required"));
    assert.ok(codes.codeFamilies.businessCopilot.retention.includes("refs_only"));
    assert.ok(codes.codeFamilies.businessCopilot.state.includes("published"));
    assert.ok(codes.codeFamilies.businessCopilot.validationIssue.includes("unexpected_field"));
    assert.ok(codes.wireShape.avoidByDefault.includes("raw_delegation_tokens"));

    assert.equal(profiles.protocol, "agentport-conformance-profiles");
    assert.deepEqual(profiles.profiles.map((profile) => profile.name), [
      "core-runtime",
      "capability-honesty",
      "authority-evidence-checkpoint",
      "token-confirmation",
      "action-receipt",
      "compact-payload-retention",
      "gateway-protocol",
      "plugin-wallet"
    ]);
    assert.ok(profiles.profiles.find((profile) => profile.name === "gateway-protocol").requires.includes("action-receipt"));
    assert.ok(profiles.profiles.find((profile) => profile.name === "plugin-wallet").requires.includes("get_ticket_status_called_before_presenting_state"));
  });

  it("defines compact envelope and conformance report schemas", async () => {
    const envelopeSchema = await readJson("schemas/agentport-compact-envelope.schema.json");
    const codes = await readJson("artifacts/agentport-protocol-codes.v0.1.json");
    const discoverySchema = await readJson("schemas/agentport-discovery.schema.json");
    const openStandardSchema = await readJson("schemas/agentport-open-standard.schema.json");
    const clientUsePolicySchema = await readJson("schemas/agentport-client-use-policy.schema.json");
    const commitmentSchema = await readJson("schemas/agentport-commitment.schema.json");
    const reportSchema = await readJson("schemas/agentport-conformance-report.schema.json");
    const gatewayProtocolReportSchema = await readJson("schemas/agentport-gateway-protocol-compliance-report.schema.json");
    const ownerProofRequestSchema = await readJson("schemas/agentport-owner-proof-request.schema.json");
    const runPacketSchema = await readJson("schemas/agentport-presentation-run-packet.schema.json");
    const runStatusSchema = await readJson("schemas/agentport-presentation-run-status.schema.json");
    const runBriefSchema = await readJson("schemas/agentport-presentation-run-brief.schema.json");
    const runReportSchema = await readJson("schemas/agentport-presentation-run-report.schema.json");
    const copilotPacketSchema = await readJson("schemas/agentport-business-copilot-readiness-packet.schema.json");
    const preflightSchema = await readJson("schemas/agentport-presentation-preflight.schema.json");
    const evidenceSchema = await readJson("schemas/agentport-presentation-evidence.schema.json");
    const frontierPacketSchema = await readJson("schemas/agentport-frontier-intent-pilot-packet.schema.json");
    const frontierWorkerEvidenceSchema = await readJson("schemas/agentport-frontier-host-worker-evidence.schema.json");
    const frontierPilotEvidenceSchema = await readJson("schemas/agentport-frontier-intent-pilot-evidence.schema.json");
    const frontierPilotValidationSchema = await readJson("schemas/agentport-frontier-intent-pilot-validation.schema.json");
    const frontierPilotRunSchema = await readJson("schemas/agentport-frontier-intent-pilot-run.schema.json");
    const actionIntentProofPackSchema = await readJson("schemas/agentport-action-intent-proof-pack.schema.json");
    const actionIntentReportSchema = await readJson("schemas/agentport-action-intent-compatibility-report.schema.json");
    const businessPortProofPackSchema = await readJson("schemas/agentport-business-port-proof-pack.schema.json");
    const businessPortReportSchema = await readJson("schemas/agentport-business-port-compatibility-report.schema.json");
    const registryProofPackSchema = await readJson("schemas/agentport-registry-proof-pack.schema.json");
    const registryReportSchema = await readJson("schemas/agentport-registry-compatibility-report.schema.json");
    const traceMatrixSchema = await readJson("schemas/agentport-protocol-trace-matrix.schema.json");
    const traceReportSchema = await readJson("schemas/agentport-protocol-trace-compatibility-report.schema.json");
    const a2aGatewayProfileSchema = await readJson("schemas/agentport-a2a-gateway-profile.schema.json");
    const a2aGatewayTraceSuiteSchema = await readJson("schemas/agentport-a2a-gateway-trace-suite.schema.json");
    const a2aGatewayReportSchema = await readJson("schemas/agentport-a2a-gateway-compatibility-report.schema.json");
    const agentGatewayIngressReportSchema = await readJson("schemas/agentport-agent-gateway-ingress-compatibility-report.schema.json");
    const agentTicketIngressInputSchema = await readJson("schemas/agentport-agent-ticket-ingress-input.schema.json");
    const a2aHostBindingSchema = await readJson("schemas/agentport-a2a-host-binding.schema.json");
    const a2aHostTraceSchema = await readJson("schemas/agentport-a2a-host-trace.schema.json");
    const a2aHostConnectorCaptureSchema = await readJson("schemas/agentport-a2a-host-connector-capture.schema.json");
    const a2aHostEventLogSchema = await readJson("schemas/agentport-a2a-host-event-log.schema.json");
    const a2aHostReportSchema = await readJson("schemas/agentport-a2a-host-adoption-report.schema.json");
    const a2aHostProofPackSchema = await readJson("schemas/agentport-a2a-host-proof-pack.schema.json");
    const exampleEnvelope = await readJson("examples/compact-envelope.confirmed.json");
    const discovery = await readJson("artifacts/agentport-discovery.v0.1.json");
    const openStandard = await readJson("artifacts/agentport-open-standard.v0.1.json");
    const clientUsePolicy = await readJson("artifacts/agentport-client-use-policy.v0.1.json");
    const commitmentFormat = await readJson("artifacts/agentport-commitment-format.v0.1.json");
    const exampleReport = await readJson("examples/conformance-report.v0.1.json");
    const exampleGatewayProtocolReport = await readJson("examples/gateway-protocol-compliance.virtual-store.v0.1.json");
    const exampleOwnerProofRequest = await readJson("examples/owner-proof-request.v0.1.json");
    const exampleRunPacket = await readJson("examples/presentation-run-packet.v0.1.json");
    const exampleRunStatus = await readJson("examples/presentation-run-status.v0.1.json");
    const exampleRunBrief = await readJson("examples/presentation-run-brief.v0.1.json");
    const exampleRunReport = await readJson("examples/presentation-run-report.v0.1.json");
    const exampleCopilotPacket = await readJson("examples/business-copilot-readiness-packet.v0.1.json");
    const examplePreflight = await readJson("examples/presentation-preflight.v0.1.json");
    const exampleEvidence = await readJson("examples/presentation-evidence.v0.1.json");
    const exampleFrontierPacket = await readJson("examples/frontier-intent-pilot-packet.v0.1.json");
    const exampleFrontierWorkerEvidence = await readJson("examples/frontier-host-worker-evidence.trust-failed.v0.1.json");
    const exampleFrontierPilotEvidence = await readJson("examples/frontier-intent-pilot-evidence.trust-failed.v0.1.json");
    const exampleFrontierPilotValidation = await readJson("examples/frontier-intent-pilot-validation.trust-failed.v0.1.json");
    const exampleFrontierPilotRun = await readJson("examples/frontier-intent-pilot-run.trust-retry.v0.1.json");
    const exampleActionIntentSummary = await readJson("examples/action-intent-proof-pack/action-intent-proof-summary.json");
    const exampleActionIntentNegativeCases = await readJson("examples/action-intent-negative-cases.v0.1.json");
    const exampleBusinessPortSummary = await readJson("examples/business-port-proof-pack/business-port-proof-summary.json");
    const exampleRegistrySummary = await readJson("examples/commitment-registry-proof-pack/registry-proof-summary.json");
    const exampleTraceMatrix = await readJson("examples/protocol-golden-trace-matrix.v0.1.json");
    const a2aGatewayProfile = await readJson("artifacts/agentport-a2a-gateway-profile.v0.1.json");
    const a2aGatewayTraceSuite = await readJson("examples/a2a-gateway-trace-suite.v0.1.json");
    const exampleA2aGatewayReport = await readJson("examples/a2a-gateway-compatibility-report.v0.1.json");
    const exampleAgentGatewayIngressReport = await readJson("examples/agent-gateway-ingress-compatibility-report.v0.1.json");
    const exampleAgentTicketIngressAccepted = await readJson("examples/agent-ticket-ingress.accepted.v0.1.json");
    const exampleAgentTicketIngressRejectedDestination = await readJson("examples/agent-ticket-ingress.rejected-destination.v0.1.json");
    const a2aHostBinding = await readJson("artifacts/agentport-a2a-host-binding.v0.1.json");
    const a2aHostPassingTrace = await readJson("examples/a2a-host-trace.passing.v0.1.json");
    const a2aHostDirectExecuteTrace = await readJson("examples/a2a-host-trace.direct-execute.v0.1.json");
    const a2aHostInventedApprovalTrace = await readJson("examples/a2a-host-trace.invented-approval.v0.1.json");
    const a2aHostMissingAuthorityTrace = await readJson("examples/a2a-host-trace.missing-authority.v0.1.json");
    const a2aHostForgedReceiptTrace = await readJson("examples/a2a-host-trace.forged-receipt.v0.1.json");
    const a2aHostAckAsVerificationTrace = await readJson("examples/a2a-host-trace.ack-as-verification.v0.1.json");
    const a2aHostConnectorCapture = await readJson("examples/chatgpt-app-connector-capture.send-ticket.v0.1.json");
    const a2aHostDirectConnectorCapture = await readJson("examples/chatgpt-app-connector-capture.direct-execute.v0.1.json");
    const a2aHostSendTicketEventLog = await readJson("examples/a2a-host-event-log.send-ticket.v0.1.json");
    const a2aHostRestoreTicketEventLog = await readJson("examples/a2a-host-event-log.restore-ticket-status.v0.1.json");
    const a2aHostFailedDirectExecuteEventLog = await readJson("examples/a2a-host-event-log.failed-direct-execute.v0.1.json");
    const a2aHostProofSummary = await readJson("examples/a2a-host-proof-pack/proof-summary.json");
    const a2aHostProofReport = await readJson("examples/a2a-host-proof-pack/adoption-report.json");
    const a2aHostProofRedactionManifest = await readJson("examples/a2a-host-proof-pack/redaction-manifest.json");
    const protocolCutManifestSchema = await readJson("schemas/agentport-protocol-cut-manifest.schema.json");
    const protocolCutManifest = await readJson("examples/implementer-kit/protocol-cut.v0.2.json");
    const protocolGovernanceSchema = await readJson("schemas/agentport-protocol-governance.schema.json");
    const protocolGovernance = await readJson("examples/implementer-kit/protocol-governance.v0.2.json");
    const protocolPublicationSchema = await readJson("schemas/agentport-protocol-publication.schema.json");
    const protocolPublication = await readJson("examples/implementer-kit/protocol-publication.v0.2.json");
    const protocolExternalReviewSchema = await readJson("schemas/agentport-protocol-external-review.schema.json");
    const protocolExternalReview = await readJson("examples/implementer-kit/protocol-external-review.v0.2.json");
    const protocolExternalReviewResultSchema = await readJson("schemas/agentport-protocol-external-review-result.schema.json");
    const protocolExternalReviewResult = await readJson("examples/implementer-kit/protocol-external-review-result.v0.2.json");
    const protocolStablePublicationSchema = await readJson("schemas/agentport-protocol-stable-publication.schema.json");
    const protocolStablePublication = await readJson("examples/implementer-kit/protocol-stable-publication.v0.2.json");
    const v02Draft = await readFile("docs/agentport-open-standard-v0.2-draft.md", "utf8");
    const v02ReleaseNotes = await readFile("docs/agentport-open-standard-v0.2-release-notes.md", "utf8");
    const v02StableCutReview = await readFile("docs/agentport-open-standard-v0.2-stable-cut-review.md", "utf8");
    const v02ExternalReviewChecklist = await readFile("docs/agentport-open-standard-v0.2-external-review-checklist.md", "utf8");

    assert.equal(envelopeSchema.properties.protocol.const, "agentport");
    assert.ok(envelopeSchema.properties.action.enum.includes("book_service"));
    assert.ok(envelopeSchema.properties.actionLayer.enum.includes("commit"));
    assert.ok(envelopeSchema.properties.result.properties.type.enum.includes("confirmed"));
    assert.deepEqual(envelopeSchema.$defs.reasonCode.enum, Object.values(codes.codeFamilies.reason).flat());
    assert.equal(envelopeSchema.properties.refs.properties.authorityAssurance.enum.includes("signed"), true);
    assert.equal(exampleEnvelope.protocol, "agentport");
    assert.equal(exampleEnvelope.result.type, "confirmed");
    assert.equal(exampleEnvelope.refs.businessId, "agentport-virtual-store");
    assert.equal(exampleEnvelope.refs.authorityEvidenceRef, "agentport-local-delegation:del_123");

    assert.equal(frontierPacketSchema.properties.type.const, "agentport.frontier_intent_pilot_packet.v0.1");
    assert.equal(frontierWorkerEvidenceSchema.properties.artifact.const, "agentport.frontier_host_worker_evidence.v0.1");
    assert.equal(frontierPilotEvidenceSchema.properties.type.const, "agentport.frontier_intent_pilot_evidence.v0.1");
    assert.equal(frontierPilotValidationSchema.properties.type.const, "agentport.frontier_intent_pilot_evidence_validation.v0.1");
    assert.equal(frontierPilotRunSchema.properties.type.const, "agentport.frontier_intent_pilot_run.v0.1");
    assert.ok(frontierPilotRunSchema.properties.mode.enum.includes("trust-retry"));
    assert.ok(frontierPilotValidationSchema.$defs.resolution.properties.kind.enum.includes("delivery_verification_failed"));
    assertHasRequiredTopLevel(exampleFrontierPacket, frontierPacketSchema);
    assertHasRequiredTopLevel(exampleFrontierWorkerEvidence, frontierWorkerEvidenceSchema);
    assertHasRequiredTopLevel(exampleFrontierPilotEvidence, frontierPilotEvidenceSchema);
    assertHasRequiredTopLevel(exampleFrontierPilotValidation, frontierPilotValidationSchema);
    assertHasRequiredTopLevel(exampleFrontierPilotRun, frontierPilotRunSchema);
    assert.equal(exampleFrontierPilotRun.trustRetry.failed.verification.reason, "delivery_issuer_untrusted");
    assert.equal(exampleFrontierPilotRun.trustRetry.failed.acknowledged, false);
    assert.equal(exampleFrontierPilotRun.trustRetry.retry.acknowledged, true);
    assert.equal(exampleFrontierPilotRun.trustRetry.sameDelivery, true);

    assert.equal(actionIntentProofPackSchema.properties.userGoal.$ref, "#/$defs/userGoal");
    assert.equal(actionIntentProofPackSchema.$defs.userGoal.properties.type.const, "agentport.action_intent_user_goal.v0.1");
    assert.equal(actionIntentProofPackSchema.$defs.compiledIntent.properties.actionIntent.properties.action.const, "book_service");
    assert.equal(actionIntentProofPackSchema.$defs.requiredInputs.properties.boundaries.properties.finalApprovalBlocked.const, true);
    assert.equal(actionIntentProofPackSchema.$defs.receiptRefs.properties.retention.properties.storesFullReceiptBody.const, false);
    assert.equal(actionIntentReportSchema.properties.type.const, "agentport.action_intent_compatibility_report.v0.1");
    assert.ok(actionIntentReportSchema.properties.profile.enum.includes("frontier"));
    assert.ok(actionIntentReportSchema.properties.profile.enum.includes("plugin-wallet"));
    assert.ok(actionIntentReportSchema.properties.profile.enum.includes("gateway"));
    assert.equal(actionIntentReportSchema.properties.certification.properties.gatewayCertification.const, false);
    assert.equal(actionIntentReportSchema.properties.roleProfile.properties.certification.const, false);
    assert.equal(exampleActionIntentSummary.type, "agentport.action_intent_proof_summary.v0.1");
    assert.equal(exampleActionIntentSummary.boundaries.actionIntentOnly, true);
    assert.equal(exampleActionIntentNegativeCases.type, "agentport.action_intent_negative_cases.v0.1");
    assert.ok(exampleActionIntentNegativeCases.cases.some((item) => item.id === "schema_missing_payload_safety"));
    assert.ok(exampleActionIntentNegativeCases.cases.some((item) => item.id === "approval_execute_arg_drift"));

    assert.equal(businessPortProofPackSchema.$defs.inboundRequest.properties.type.const, "agentport.business_port_inbound_request.v0.1");
    assert.equal(businessPortProofPackSchema.$defs.gatewayForward.properties.forward.properties.target.const, "agent_gateway");
    assert.equal(businessPortReportSchema.properties.type.const, "agentport.business_port_compatibility_report.v0.1");
    assert.equal(exampleBusinessPortSummary.boundaries.businessPortOnly, true);
    assert.equal(exampleBusinessPortSummary.boundaries.systemOfRecord, false);

    assert.equal(registryProofPackSchema.$defs.lifecycleWrite.properties.type.const, "agentport.registry_lifecycle_write.v0.1");
    assert.equal(registryProofPackSchema.$defs.eventHistory.properties.boundaries.properties.appendOnly.const, true);
    assert.equal(registryReportSchema.properties.type.const, "agentport.registry_compatibility_report.v0.1");
    assert.equal(exampleRegistrySummary.boundaries.registryOnly, true);
    assert.equal(exampleRegistrySummary.boundaries.executesBusinessActions, false);

    assert.equal(traceMatrixSchema.properties.type.const, "agentport.protocol_golden_trace_matrix.v0.1");
    assert.equal(traceReportSchema.properties.type.const, "agentport.protocol_trace_compatibility_report.v0.1");
    assert.ok(exampleTraceMatrix.allowed.some((row) => row.id === "approval_to_gateway_execution"));
    assert.ok(exampleTraceMatrix.forbidden.some((row) => row.id === "execute_without_consent"));
    assert.equal(exampleTraceMatrix.boundaries.certification, false);

    assert.equal(a2aGatewayProfileSchema.properties.protocol.const, "agentport-a2a-gateway-profile");
    assert.equal(a2aGatewayTraceSuiteSchema.properties.type.const, "agentport.a2a_gateway_trace_suite.v0.1");
    assert.equal(a2aGatewayReportSchema.properties.type.const, "agentport.a2a_gateway_compatibility_report.v0.1");
    assert.equal(agentGatewayIngressReportSchema.properties.type.const, "agentport.agent_gateway_ingress_compatibility_report.v0.1");
    assert.equal(agentTicketIngressInputSchema.properties.envelope.properties.audience.const, "agentport://small-business-digital-twin/agent-ticket-ingress");
    assert.equal(agentTicketIngressInputSchema.properties.ticket.properties.requestedAction.const, "send_ticket");
    assert.deepEqual(agentTicketIngressInputSchema.properties.destination.properties.kind.enum, ["business_inbox"]);
    assert.equal(a2aGatewayProfile.protocol, "agentport-a2a-gateway-profile");
    assert.equal(a2aGatewayProfile.boundary.doesNotReplaceA2A, true);
    assert.equal(a2aGatewayProfile.boundary.doesNotCertify, true);
    assert.ok(a2aGatewayProfile.resources.some((resource) => resource.uri === "agentport://action-model"));
    assert.deepEqual(a2aGatewayProfile.requiredSequence.slice(3, 7), [
      "compile_action_intent_before_state_change",
      "render_exact_user_approval",
      "carry_external_authority_evidence_when_required",
      "execute_with_intentId_approvedActionIntentHash_and_userConsent"
    ]);
    assert.ok(a2aGatewayProfile.taskMapping.some((mapping) => mapping.a2aTaskClass === "action.prepare" && mapping.agentPortPrimitive.includes("compile_action_intent")));
    assert.ok(a2aGatewayProfile.taskMapping.some((mapping) => mapping.a2aTaskClass === "proof.receipt" && mapping.agentPortPrimitive.includes("ActionReceipt")));
    assert.ok(a2aGatewayProfile.forbiddenShortcuts.some((shortcut) => shortcut.id === "a2a_direct_execute_without_compile"));
    assert.equal(a2aGatewayTraceSuite.type, "agentport.a2a_gateway_trace_suite.v0.1");
    assert.deepEqual(a2aGatewayTraceSuite.golden.steps.map((step) => step.agentPortPrimitive), [
      "get_business_feed",
      "compile_action_intent",
      "get_action_intent_lifecycle",
      "book_service",
      "ActionReceipt"
    ]);
    assert.ok(a2aGatewayTraceSuite.tamper.some((item) => item.id === "direct_execute_without_compile"));
    assert.ok(a2aGatewayTraceSuite.tamper.some((item) => item.id === "invented_approval"));
    assert.ok(a2aGatewayTraceSuite.tamper.some((item) => item.id === "forged_receipt"));
    assert.equal(a2aGatewayTraceSuite.boundaries.replacesA2A, false);
    assert.equal(exampleA2aGatewayReport.type, "agentport.a2a_gateway_compatibility_report.v0.1");
    assert.equal(exampleA2aGatewayReport.profile, "a2a-gateway");
    assert.equal(exampleA2aGatewayReport.certification.publicCertification, false);
    assert.equal(exampleA2aGatewayReport.certification.a2aCertification, false);
    assert.equal(exampleA2aGatewayReport.boundaries.agentGatewayAlreadyExists, true);
    assert.equal(exampleA2aGatewayReport.boundaries.replacesA2A, false);
    assert.ok(exampleA2aGatewayReport.areas.some((area) => area.id === "safe_sequence"));
    assert.ok(exampleA2aGatewayReport.checks.some((check) => check.id === "compile_before_state_change"));
    assertHasRequiredTopLevel(exampleA2aGatewayReport, a2aGatewayReportSchema);
    assert.equal(exampleAgentGatewayIngressReport.type, "agentport.agent_gateway_ingress_compatibility_report.v0.1");
    assert.equal(exampleAgentGatewayIngressReport.profile, "agent-gateway-ingress");
    assert.equal(exampleAgentGatewayIngressReport.certification.publicCertification, false);
    assert.equal(exampleAgentGatewayIngressReport.certification.realBusinessCertification, false);
    assert.equal(exampleAgentGatewayIngressReport.certification.verifiedBusiness, false);
    assert.equal(exampleAgentGatewayIngressReport.boundaries.gatewayChecksAuthorityEnvelope, true);
    assert.equal(exampleAgentGatewayIngressReport.boundaries.gatewayChecksReplayProtection, true);
    assert.equal(exampleAgentGatewayIngressReport.boundaries.gatewayChecksHolderProof, true);
    assert.equal(exampleAgentGatewayIngressReport.boundaries.gatewayChecksDestinationBinding, true);
    assert.equal(exampleAgentGatewayIngressReport.boundaries.backendMutation, false);
    assert.equal(exampleAgentGatewayIngressReport.boundaries.storesRawHolderProof, false);
    assert.ok(exampleAgentGatewayIngressReport.evidence.harness.includes("/demo/small-business-digital-twin/agent-ticket-ingress/harness"));
    assert.ok(exampleAgentGatewayIngressReport.evidence.schemas.includes("schemas/agentport-agent-ticket-ingress-input.schema.json"));
    assert.ok(exampleAgentGatewayIngressReport.evidence.examples.includes("examples/agent-ticket-ingress.accepted.v0.1.json"));
    assert.ok(exampleAgentGatewayIngressReport.areas.some((area) => area.id === "wallet_confirmation"));
    assert.ok(exampleAgentGatewayIngressReport.areas.some((area) => area.id === "destination_binding"));
    assert.ok(exampleAgentGatewayIngressReport.areas.some((area) => area.id === "compatibility_harness"));
    assert.ok(exampleAgentGatewayIngressReport.checks.some((check) => check.id === "authority_envelope_required"));
    assert.ok(exampleAgentGatewayIngressReport.checks.some((check) => check.id === "replay_protection_checked"));
    assert.ok(exampleAgentGatewayIngressReport.checks.some((check) => check.id === "holder_proof_required"));
    assert.ok(exampleAgentGatewayIngressReport.checks.some((check) => check.id === "wrong_destination_rejected"));
    assert.ok(exampleAgentGatewayIngressReport.checks.some((check) => check.id === "live_harness_page_submits_to_gateway"));
    assertHasRequiredTopLevel(exampleAgentGatewayIngressReport, agentGatewayIngressReportSchema);
    assertHasRequiredTopLevel(exampleAgentTicketIngressAccepted, agentTicketIngressInputSchema);
    assertHasRequiredTopLevel(exampleAgentTicketIngressRejectedDestination, agentTicketIngressInputSchema);
    assert.equal(exampleAgentTicketIngressAccepted.ticket.holderProof, "opaque-holder-proof-from-ticket-wallet");
    assert.equal(exampleAgentTicketIngressAccepted.destination.businessId, "river-table-bistro-twin");
    assert.equal(exampleAgentTicketIngressRejectedDestination.destination.businessId, "pixelprint-lab-twin");

    assert.equal(a2aHostBindingSchema.properties.protocol.const, "agentport-a2a-host-binding");
    assert.equal(a2aHostTraceSchema.properties.type.const, "agentport.a2a_host_trace.v0.1");
    assert.equal(a2aHostConnectorCaptureSchema.properties.type.const, "agentport.a2a_host_connector_capture.v0.1");
    assert.equal(a2aHostEventLogSchema.properties.type.const, "agentport.a2a_host_event_log.v0.1");
    assert.equal(a2aHostReportSchema.properties.type.const, "agentport.a2a_host_adoption_report.v0.1");
    assert.equal(a2aHostProofPackSchema.properties.type.const, "agentport.a2a_host_proof_pack.v0.1");
    assert.equal(a2aHostBinding.protocol, "agentport-a2a-host-binding");
    assert.equal(a2aHostBinding.boundary.hostOwnsIntent, true);
    assert.equal(a2aHostBinding.boundary.agentPortOwnsGatewayTruth, true);
    assert.ok(a2aHostBinding.taskClasses.some((task) => task.a2aTaskClass === "action.execute" && task.agentPortBinding.includes("book_service")));
    assert.ok(a2aHostBinding.requiredHostSequence.includes("compile_action_intent_before_state_change"));
    assert.ok(a2aHostBinding.forbiddenHostShortcuts.some((shortcut) => shortcut.id === "host_client_minted_receipt"));
    assert.equal(a2aHostPassingTrace.type, "agentport.a2a_host_trace.v0.1");
    assert.equal(a2aHostPassingTrace.expectedStatus, "passed");
    assert.ok(a2aHostPassingTrace.events.some((event) => event.phase === "compile_action_intent"));
    assert.ok(a2aHostPassingTrace.events.some((event) => event.phase === "receive_receipt"));
    assert.equal(a2aHostDirectExecuteTrace.expectedStatus, "failed");
    assert.ok(a2aHostDirectExecuteTrace.expectedFailureIds.includes("host_compile_before_execute"));
    assert.ok(a2aHostInventedApprovalTrace.expectedFailureIds.includes("host_exact_approval_before_consent"));
    assert.ok(a2aHostMissingAuthorityTrace.expectedFailureIds.includes("host_authority_when_required"));
    assert.ok(a2aHostForgedReceiptTrace.expectedFailureIds.includes("host_gateway_receipt_only"));
    assert.ok(a2aHostAckAsVerificationTrace.expectedFailureIds.includes("host_ack_is_not_receipt_verification"));
    assert.equal(a2aHostConnectorCapture.type, "agentport.a2a_host_connector_capture.v0.1");
    assert.equal(a2aHostConnectorCapture.surface, "chatgpt_app_connector");
    assert.ok(a2aHostConnectorCapture.toolCalls.some((call) => call.name === "send_ticket"));
    assert.equal(a2aHostDirectConnectorCapture.expectedStatus, "failed");
    assert.ok(a2aHostDirectConnectorCapture.expectedFailureIds.includes("host_compile_before_execute"));
    assert.equal(a2aHostSendTicketEventLog.type, "agentport.a2a_host_event_log.v0.1");
    assert.equal(a2aHostSendTicketEventLog.expectedStatus, "passed");
    assert.ok(a2aHostSendTicketEventLog.events.some((event) => event.tool === "send_ticket"));
    assert.equal(a2aHostRestoreTicketEventLog.expectedStatus, "passed");
    assert.ok(a2aHostRestoreTicketEventLog.events.some((event) => event.tool === "ActionReceipt"));
    assert.equal(a2aHostFailedDirectExecuteEventLog.expectedStatus, "failed");
    assert.ok(a2aHostFailedDirectExecuteEventLog.expectedFailureIds.includes("host_compile_before_execute"));
    assert.equal(a2aHostProofSummary.type, "agentport.a2a_host_proof_pack.v0.1");
    assert.equal(a2aHostProofSummary.ok, true);
    assert.equal(a2aHostProofSummary.certification.a2aCertification, false);
    assert.equal(a2aHostProofReport.type, "agentport.a2a_host_adoption_report.v0.1");
    assert.equal(a2aHostProofReport.ok, true);
    assert.equal(a2aHostProofRedactionManifest.type, "agentport.a2a_host_proof_pack_redaction_manifest.v0.1");
    assert.equal(a2aHostProofRedactionManifest.checks.containsRawAuthorityTokens, false);
    assertHasRequiredTopLevel(a2aHostProofSummary, a2aHostProofPackSchema);

    assert.match(v02Draft, /Status: cut readiness for implementer validation/);
    assert.match(v02Draft, /Protocol behavior is frozen/);
    assert.match(v02Draft, /Frontier host/);
    assert.match(v02Draft, /Plugin wallet/);
    assert.match(v02Draft, /Business port endpoint/);
    assert.match(v02Draft, /Commitment registry/);
    assert.match(v02Draft, /A2A host binding/);
    assert.match(v02Draft, /node dist\/cli\/index\.js action-intent-check --input examples\/action-intent-proof-pack/);
    assert.match(v02Draft, /node scripts\/a2a-gateway-check\.mjs --host-trace examples\/a2a-host-trace\.passing\.v0\.1\.json --strict/);
    assert.match(v02Draft, /AgentPort Certified/);
    assert.match(v02Draft, /A2A replacement/);
    assert.match(v02Draft, /virtual-store and host-adoption compatibility evidence/);
    assertHasRequiredTopLevel(protocolCutManifest, protocolCutManifestSchema);
    assert.equal(protocolCutManifest.type, "agentport.protocol_cut_manifest.v0.2");
    assert.equal(protocolCutManifest.status, "cut_readiness");
    assert.equal(protocolCutManifest.standardDraft, "docs/agentport-open-standard-v0.2-draft.md");
    assert.equal(protocolCutManifest.governancePolicy, "examples/implementer-kit/protocol-governance.v0.2.json");
    assert.equal(protocolCutManifest.publicationStatus, "examples/implementer-kit/protocol-publication.v0.2.json");
    assert.equal(protocolCutManifest.boundaries.agentPortCertified, false);
    assert.equal(protocolCutManifest.boundaries.agentPortVerifiedBusiness, false);
    assert.equal(protocolCutManifest.boundaries.realBusinessProof, false);
    assert.equal(protocolCutManifest.boundaries.liveBackendProof, false);
    assert.equal(protocolCutManifest.boundaries.a2aReplacement, false);
    assert.deepEqual(protocolCutManifest.releaseGates, [
      "npm run public-package-audit",
      "npm run conformance",
      "npm test",
      "git diff --check"
    ]);
    assert.ok(protocolCutManifest.claims.forbidden.includes("AgentPort Certified"));
    assert.ok(protocolCutManifest.claims.forbidden.includes("AgentPort Verified business"));
    assert.ok(protocolCutManifest.claims.forbidden.includes("real-business proof"));
    assert.ok(protocolCutManifest.claims.forbidden.includes("live-backend proof"));
    assert.ok(protocolCutManifest.claims.forbidden.includes("A2A replacement"));
    assert.ok(protocolCutManifest.roles.some((role) => role.id === "a2a_host_binding"));
    assert.ok(protocolCutManifest.artifacts.schemas.includes("schemas/agentport-protocol-cut-manifest.schema.json"));
    assert.ok(protocolCutManifest.artifacts.schemas.includes("schemas/agentport-protocol-governance.schema.json"));
    assert.ok(protocolCutManifest.artifacts.schemas.includes("schemas/agentport-protocol-publication.schema.json"));
    assert.ok(protocolCutManifest.artifacts.schemas.includes("schemas/agentport-protocol-external-review.schema.json"));
    assert.ok(protocolCutManifest.artifacts.schemas.includes("schemas/agentport-protocol-external-review-result.schema.json"));
    assert.ok(protocolCutManifest.artifacts.schemas.includes("schemas/agentport-protocol-stable-publication.schema.json"));
    assert.ok(protocolCutManifest.artifacts.docs.includes("docs/agentport-open-standard-v0.2-release-notes.md"));
    assert.ok(protocolCutManifest.artifacts.docs.includes("docs/agentport-open-standard-v0.2-stable-cut-review.md"));
    assert.ok(protocolCutManifest.artifacts.docs.includes("docs/agentport-open-standard-v0.2-external-review-checklist.md"));
    assert.ok(protocolCutManifest.artifacts.docs.includes("docs/agentport-protocol-governance-v0.2.md"));
    assert.equal(protocolCutManifest.artifacts.docs.some((ref) => ref.startsWith("docs/feedback/")), false);
    assert.ok(protocolCutManifest.artifacts.reports.includes("examples/gateway-protocol-compliance.virtual-store.v0.1.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/chatgpt-app-connector-capture.send-ticket.v0.1.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/chatgpt-app-connector-capture.direct-execute.v0.1.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/implementer-kit/protocol-governance.v0.2.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/implementer-kit/protocol-publication.v0.2.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/implementer-kit/protocol-external-review.v0.2.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/implementer-kit/protocol-external-review-result.v0.2.json"));
    assert.ok(protocolCutManifest.artifacts.examples.includes("examples/implementer-kit/protocol-stable-publication.v0.2.json"));
    assert.ok(protocolCutManifestSchema.properties.releaseGates.items.enum.includes("npm run public-package-audit"));
    assertHasRequiredTopLevel(protocolGovernance, protocolGovernanceSchema);
    assert.equal(protocolGovernance.type, "agentport.protocol_governance.v0.2");
    assert.equal(protocolGovernance.status, "cut_readiness");
    assert.deepEqual(protocolGovernance.extensionNamespaces.allowedFieldLocations, ["extensions", "x-*"]);
    assert.equal(protocolGovernance.extensionNamespaces.thirdPartyIdFormat, "reverse_dns_or_uri");
    assert.deepEqual(protocolGovernance.extensionNamespaces.reservedPrefixes, ["agentport.", "ap."]);
    assert.ok(protocolGovernance.extensionNamespaces.forbiddenOverrides.includes("verification.status"));
    assert.ok(protocolGovernance.extensionNamespaces.forbiddenOverrides.includes("receipt"));
    assert.ok(protocolGovernance.extensionNamespaces.forbiddenOverrides.includes("systemOfRecord"));
    assert.ok(protocolGovernance.versionPolicy.patchCompatible.includes("optional metadata with explicit defaults"));
    assert.ok(protocolGovernance.versionPolicy.minorRequired.includes("new required check"));
    assert.ok(protocolGovernance.versionPolicy.breaking.includes("treat compatibility as certification"));
    assert.equal(protocolGovernance.deprecationPolicy.removalRequires, "major_version");
    assert.equal(protocolGovernance.deprecationPolicy.mustNotWeakenFailClosed, true);
    assert.ok(protocolGovernance.claimPolicy.forbiddenClaims.includes("AgentPort Certified"));
    assert.ok(protocolGovernance.claimPolicy.forbiddenClaims.includes("AgentPort Verified business"));
    assert.ok(protocolGovernance.claimPolicy.forbiddenClaims.includes("live-backend proof"));
    assert.ok(protocolGovernance.claimPolicy.forbiddenClaims.includes("A2A replacement"));
    assert.equal(protocolGovernance.claimPolicy.officialMarksRequireSeparateProcess, true);
    assert.equal(protocolGovernance.securityPolicy.conformanceBypass, "not_allowed_for_safety_or_role_boundary_failures");
    assert.ok(protocolGovernance.securityPolicy.noBypassFor.includes("consent"));
    assert.ok(protocolGovernance.securityPolicy.noBypassFor.includes("receipt binding"));
    assert.ok(protocolGovernance.securityPolicy.noBypassFor.includes("system-of-record boundary"));
    assert.equal(protocolGovernance.securityPolicy.rawPrivateDataForbidden, true);
    assert.equal(protocolGovernance.contributionPolicy.mustBeCredentialFree, true);
    assert.equal(protocolGovernance.contributionPolicy.networkRequiredInCi, false);
    assert.deepEqual(protocolGovernance.stableCutRequirements, [
      "protocol_cut_manifest_refs_exist",
      "publication_status_refs_exist",
      "npm run public-package-audit",
      "all_manifest_commands_pass",
      "npm run conformance",
      "npm test",
      "git diff --check",
      "claim_boundaries_preserved"
    ]);
    assert.ok(protocolGovernanceSchema.properties.stableCutRequirements.items.enum.includes("npm run public-package-audit"));
    assertHasRequiredTopLevel(protocolPublication, protocolPublicationSchema);
    assert.equal(protocolPublicationSchema.properties.type.const, "agentport.protocol_publication.v0.2");
    assert.equal(protocolPublication.type, "agentport.protocol_publication.v0.2");
    assert.equal(protocolPublication.status, "stable_published");
    assert.equal(protocolPublication.technicalFreeze, true);
    assert.equal(protocolPublication.cutReadiness, true);
    assert.equal(protocolPublication.stablePublication, true);
    assert.equal(protocolPublication.packageRefs.standardDraft, "docs/agentport-open-standard-v0.2-draft.md");
    assert.equal(protocolPublication.packageRefs.technicalFreezeDoc, "docs/agentport-protocol-v0.2.md");
    assert.equal(protocolPublication.packageRefs.cutManifest, "examples/implementer-kit/protocol-cut.v0.2.json");
    assert.equal(protocolPublication.packageRefs.governancePolicy, "examples/implementer-kit/protocol-governance.v0.2.json");
    assert.equal(protocolPublication.packageRefs.releaseNotes, "docs/agentport-open-standard-v0.2-release-notes.md");
    assert.equal(protocolPublication.packageRefs.stableCutReview, "docs/agentport-open-standard-v0.2-stable-cut-review.md");
    assert.equal(protocolPublication.packageRefs.externalReview, "examples/implementer-kit/protocol-external-review.v0.2.json");
    assert.equal(protocolPublication.packageRefs.externalReviewResult, "examples/implementer-kit/protocol-external-review-result.v0.2.json");
    assert.equal(protocolPublication.packageRefs.stablePublication, "examples/implementer-kit/protocol-stable-publication.v0.2.json");
    assert.ok(protocolPublication.includedSurfaces.includes("agent_gateway"));
    assert.ok(protocolPublication.includedSurfaces.includes("plugin_wallet"));
    assert.ok(protocolPublication.includedSurfaces.includes("business_port_endpoint"));
    assert.ok(protocolPublication.includedSurfaces.includes("a2a_host_binding"));
    assert.deepEqual(protocolPublication.gates, {
      manifestCommands: "passed",
      publicPackageAudit: "passed",
      conformance: "passed",
      tests: "passed",
      diffCheck: "passed"
    });
    assert.equal(protocolPublication.certification.agentPortCertified, false);
    assert.equal(protocolPublication.certification.agentPortVerifiedBusiness, false);
    assert.equal(protocolPublication.certification.realBusinessProof, false);
    assert.equal(protocolPublication.certification.liveBackendProof, false);
    assert.equal(protocolPublication.certification.stablePublication, true);
    assert.equal(protocolPublication.stablePromotionBlockers.includes("external_publication_review_not_recorded"), false);
    assert.equal(protocolPublication.stablePromotionBlockers.includes("stable_publication_tag_not_set"), false);
    assert.deepEqual(protocolPublication.stablePromotionBlockers, []);
    assert.ok(protocolPublication.forbiddenClaims.includes("AgentPort Certified"));
    assert.ok(protocolPublication.forbiddenClaims.includes("AgentPort Verified business"));
    assert.ok(protocolPublication.forbiddenClaims.includes("real-business proof"));
    assert.ok(protocolPublication.forbiddenClaims.includes("live-backend proof"));
    assert.match(v02ReleaseNotes, /stable published as the v0\.2 protocol cut/);
    assert.match(v02ReleaseNotes, /agentport-protocol-v0\.2/);
    assert.match(v02ReleaseNotes, /AgentPort Certified/);
    assert.match(v02ReleaseNotes, /real-business proof/);
    assert.match(v02StableCutReview, /stable publication is recorded/);
    assert.match(v02StableCutReview, /stable_tag_set/);
    assert.match(v02StableCutReview, /internal feedback notes and planning docs/);
    assertHasRequiredTopLevel(protocolExternalReview, protocolExternalReviewSchema);
    assert.equal(protocolExternalReviewSchema.properties.type.const, "agentport.protocol_external_review.v0.2");
    assert.equal(protocolExternalReview.type, "agentport.protocol_external_review.v0.2");
    assert.equal(protocolExternalReview.status, "ready_for_external_review");
    assert.equal(protocolExternalReview.checklist, "docs/agentport-open-standard-v0.2-external-review-checklist.md");
    assert.ok(protocolExternalReview.reviewInputs.includes("examples/implementer-kit/protocol-cut.v0.2.json"));
    assert.deepEqual(protocolExternalReview.requiredGates, [
      "npm run public-package-audit",
      "npm run conformance",
      "npm test",
      "git diff --check"
    ]);
    assert.ok(protocolExternalReview.roleChecks.some((check) => check.role === "agent_gateway"));
    assert.ok(protocolExternalReview.roleChecks.some((check) => check.role === "a2a_host_binding"));
    assert.ok(protocolExternalReview.acceptance.includes("every_cut_manifest_ref_is_packed"));
    assert.ok(protocolExternalReview.acceptance.includes("claim_boundaries_preserved"));
    assert.ok(protocolExternalReview.forbiddenConclusions.includes("AgentPort Certified"));
    assert.ok(protocolExternalReview.forbiddenConclusions.includes("real-business proof"));
    assertHasRequiredTopLevel(protocolExternalReviewResult, protocolExternalReviewResultSchema);
    assert.equal(protocolExternalReviewResultSchema.properties.type.const, "agentport.protocol_external_review_result.v0.2");
    assert.equal(protocolExternalReviewResult.type, "agentport.protocol_external_review_result.v0.2");
    assert.equal(protocolExternalReviewResult.status, "passed");
    assert.equal(protocolExternalReviewResult.reviewedPackage, "examples/implementer-kit/protocol-cut.v0.2.json");
    assert.equal(protocolExternalReviewResult.reviewer.kind, "local_maintainer_public_package_review");
    assert.equal(protocolExternalReviewResult.reviewer.independentThirdParty, false);
    assert.equal(protocolExternalReviewResult.reviewer.certificationAuthority, false);
    assert.deepEqual(protocolExternalReviewResult.gateResults.map((gate) => gate.command), [
      "npm run public-package-audit",
      "npm run conformance",
      "npm test",
      "git diff --check"
    ]);
    assert.ok(protocolExternalReviewResult.acceptanceResults.some((item) => item.check === "every_cut_manifest_ref_is_packed"));
    assert.equal(protocolExternalReviewResult.claimBoundary.compatibilityOnly, true);
    assert.equal(protocolExternalReviewResult.claimBoundary.agentPortCertified, false);
    assert.equal(protocolExternalReviewResult.claimBoundary.realBusinessProof, false);
    assert.equal(protocolExternalReviewResult.stableTagDecision.decision, "stable_tag_set");
    assert.equal(protocolExternalReviewResult.stableTagDecision.stablePublication, true);
    assertHasRequiredTopLevel(protocolStablePublication, protocolStablePublicationSchema);
    assert.equal(protocolStablePublicationSchema.properties.type.const, "agentport.protocol_stable_publication.v0.2");
    assert.equal(protocolStablePublication.type, "agentport.protocol_stable_publication.v0.2");
    assert.equal(protocolStablePublication.status, "stable_published");
    assert.equal(protocolStablePublication.tagName, "agentport-protocol-v0.2");
    assert.equal(protocolStablePublication.cutManifest, "examples/implementer-kit/protocol-cut.v0.2.json");
    assert.equal(protocolStablePublication.publicationStatus, "examples/implementer-kit/protocol-publication.v0.2.json");
    assert.equal(protocolStablePublication.stablePublication, true);
    assert.equal(protocolStablePublication.claimBoundary.agentPortCertified, false);
    assert.equal(protocolStablePublication.claimBoundary.realBusinessProof, false);
    assert.match(v02ExternalReviewChecklist, /ready for external review/);
    assert.match(v02ExternalReviewChecklist, /npm run public-package-audit/);
    assert.match(v02ExternalReviewChecklist, /stable_tag_set/);
    assert.match(v02ExternalReviewChecklist, /Forbidden Conclusions/);
    await assertProtocolCutRefsExist(protocolCutManifest);
    assertProtocolCutCommandsCurrent(protocolCutManifest.commands);

    assert.equal(discoverySchema.properties.protocol.const, "agentport-discovery");
    assert.equal(discoverySchema.properties.resourceUri.const, "agentport://discovery");
    assert.equal(discoverySchema.properties.wellKnownPath.const, "/.well-known/agentport.json");
    assert.equal(discovery.protocol, "agentport-discovery");
    assert.equal(discovery.resourceUri, "agentport://discovery");
    assert.equal(discovery.wellKnownPath, "/.well-known/agentport.json");
    assert.equal(discovery.businessHintPolicy.descriptorIsVerification, false);
    assert.ok(discoverySchema.properties.resources.items.properties.uri.enum.includes("agentport://open-standard"));
    assert.ok(discoverySchema.properties.resources.items.properties.uri.enum.includes("agentport://commitment-format"));
    assert.ok(discovery.resources.some((resource) => resource.uri === "agentport://open-standard"));
    assert.ok(discoverySchema.properties.tools.items.enum.includes("get_business_feed"));
    assert.ok(discovery.tools.includes("get_business_feed"));
    assert.ok(discoverySchema.properties.tools.items.enum.includes("get_readiness_report"));
    assert.ok(discovery.tools.includes("get_readiness_report"));
    assert.ok(discovery.tools.includes("compile_action_intent"));
    assert.equal(discoverySchema.properties.agentPath.properties.preferredTool.const, "get_business_feed");
    assert.equal(discoverySchema.properties.agentPath.properties.preferredMode.const, "compact");
    assert.equal(discovery.agentPath.preferredTool, "get_business_feed");
    assert.equal(discovery.agentPath.preferredMode, "compact");
    assert.deepEqual(discovery.agentPath.normal, [
      "read_discovery_descriptor",
      "call_get_business_feed_compact",
      "call_get_readiness_report_for_owner_or_pilot_context",
      "compile_action_intent_before_state_change",
      "answer_or_call_action_tool_if_needed"
    ]);
    assert.ok(discovery.resources.some((resource) => resource.uri === "agentport://client-use-policy"));
    assert.ok(discovery.resources.some((resource) => resource.uri === "agentport://commitment-format"));
    assert.equal(discoverySchema.properties.trustDistribution.properties.descriptorIsTrust.const, false);
    assert.equal(discovery.trustDistribution.descriptorIsTrust, false);
    assert.equal(discovery.trustDistribution.productionTransport, "https-required");
    assert.deepEqual(discovery.trustDistribution.gatewayReceiptTrust.order, [
      "apply_gateway_trust_root_emergency_denylist",
      "verify_gateway_trust_root_bundle",
      "verify_signed_gateway_trust_profile",
      "verify_gateway_action_receipt"
    ]);
    assert.deepEqual(discovery.trustDistribution.issuerReadinessTrust.order, [
      "apply_issuer_readiness_root_emergency_denylist",
      "verify_issuer_readiness_trust_root_bundle",
      "verify_signed_issuer_readiness",
      "validate_issuer_readiness_report"
    ]);

    assert.equal(openStandardSchema.properties.protocol.const, "agentport-open-standard");
    assert.equal(openStandardSchema.properties.resourceUri.const, "agentport://open-standard");
    assert.equal(openStandard.protocol, "agentport-open-standard");
    assert.equal(openStandard.license, "Apache-2.0");
    assert.ok(openStandard.scope.includes.includes("public_read"));
    assert.ok(openStandard.scope.includes.includes("business_feed"));
    assert.ok(openStandard.scope.includes.includes("commitment_format"));
    assert.ok(openStandard.scope.excludes.includes("payment_network"));
    assert.ok(openStandard.resources.some((resource) => resource.uri === "agentport://commitment-format"));
    assert.deepEqual(openStandard.toolClasses.publicRead.tools, ["find_services", "get_business_info", "get_business_feed", "get_readiness_report"]);
    assert.deepEqual(openStandard.toolClasses.operationalRead.tools, ["compile_action_intent", "get_action_intent_lifecycle", "poll_action_intent_lifecycles", "list_action_intent_result_deliveries", "get_action_intent_result_delivery", "ack_action_intent_result_delivery", "check_availability"]);
    assert.deepEqual(openStandard.toolClasses.stateChanging.tools, ["book_service", "cancel_service", "reschedule_service"]);
    assert.equal(openStandard.toolClasses.publicRead.defaultAuth, "anonymous_or_public_find_scope");
    assert.equal(openStandardSchema.properties.efficientPath.properties.defaultBusinessFeedMode.const, "compact");
    assert.equal(openStandard.efficientPath.defaultBusinessFeedMode, "compact");
    assert.deepEqual(openStandard.efficientPath.normal, [
      "discover_gateway",
      "call_get_business_feed_compact",
      "answer_or_call_action_tool_if_needed"
    ]);
    assert.deepEqual(openStandardSchema.properties.efficientPath.properties.businessFeedIntents.items.enum, [
      "answer",
      "book",
      "manage",
      "compare"
    ]);
    assert.deepEqual(openStandard.efficientPath.businessFeedIntents, ["answer", "book", "manage", "compare"]);
    assert.ok(openStandard.efficientPath.businessFeedResponseFields.includes("nextActions"));
    assert.ok(openStandard.efficientPath.businessFeedResponseFields.includes("cannotDo"));
    assert.equal(openStandardSchema.properties.efficientPath.properties.businessFeedCacheMemory.properties.conditionalInput.const, "ifBusinessVersion");
    assert.equal(openStandard.efficientPath.businessFeedCacheMemory.conditionalInput, "ifBusinessVersion");
    assert.equal(openStandard.efficientPath.businessFeedCacheMemory.matchResult, "notModified");
    assert.deepEqual(openStandard.efficientPath.businessFeedCacheMemory.cacheScope, [
      "businessId",
      "mode",
      "intent",
      "businessVersion"
    ]);
    assert.ok(openStandard.efficientPath.businessFeedCacheMemory.neverStore.includes("raw_authority_tokens"));
    assert.ok(openStandard.efficientPath.businessFeedCacheMemory.neverStore.includes("broad_user_preferences"));
    assert.ok(openStandard.requiredSemantics.includes("capability_tier_is_derived_from_adapter_capabilities"));
    assert.ok(openStandard.requiredSemantics.includes("portable_commitments_require_backend_confirmation_refs_and_gateway_receipt_refs"));
    assert.ok(openStandard.requiredSemantics.includes("missing_consent_rejects_state_changing_actions"));
    assert.equal(openStandard.conformance.mustExposeResource, "agentport://open-standard");

    assert.equal(commitmentFormat.protocol, "agentport-commitment-format");
    assert.equal(commitmentFormat.resourceUri, "agentport://commitment-format");
    assert.equal(commitmentSchema.properties.protocol.const, "agentport-commitment");
    assert.equal(commitmentSchema.properties.backend.properties.systemOfRecord.const, true);
    assert.deepEqual(commitmentSchema.properties.status.enum, codes.codeFamilies.commitmentStatus);
    assert.deepEqual(commitmentSchema.$defs.event.properties.type.enum, codes.codeFamilies.commitmentEventType);
    assert.deepEqual(commitmentSchema.properties.rights.properties.allowedActions.items.enum, codes.codeFamilies.commitmentRight);
    assert.equal(commitmentFormat.example.protocol, "agentport-commitment");
    assert.equal(commitmentFormat.example.backend.systemOfRecord, true);

    assert.equal(clientUsePolicySchema.properties.protocol.const, "agentport-client-use-policy");
    assert.equal(clientUsePolicySchema.properties.resourceUri.const, "agentport://client-use-policy");
    assert.equal(clientUsePolicy.protocol, "agentport-client-use-policy");
    assert.equal(clientUsePolicy.decisionOrder[0].source, "agentport_verified_profile");
    assert.ok(clientUsePolicy.stateChangingActionPolicy.browsingCannotReplace.includes("ActionReceipt"));

    assert.equal(reportSchema.properties.protocol.const, "agentport");
    assert.ok(reportSchema.properties.profiles.items.properties.name.enum.includes("gateway-protocol"));
    assert.ok(Object.hasOwn(reportSchema.properties.profiles.items.properties, "evidence"));
    assert.equal(exampleReport.protocol, "agentport");
    assert.ok(exampleReport.profiles.some((profile) => profile.name === "compact-payload-retention"));

    assert.equal(gatewayProtocolReportSchema.properties.type.const, "agentport.gateway_protocol_compliance_report.v0.1");
    assert.equal(gatewayProtocolReportSchema.properties.profile.const, "gateway-protocol");
    assert.equal(gatewayProtocolReportSchema.properties.referenceTrace.const, "virtual-store-phase3");
    assert.equal(gatewayProtocolReportSchema.properties.certification.properties.publicCertification.const, false);
    assert.equal(gatewayProtocolReportSchema.properties.certification.properties.realBusinessCertification.const, false);
    assert.ok(gatewayProtocolReportSchema.properties.areas.items.properties.id.enum.includes("consent_gate_before_execution"));
    assert.ok(gatewayProtocolReportSchema.properties.areas.items.properties.id.enum.includes("action_receipt_backend_binding"));
    assert.equal(exampleGatewayProtocolReport.type, "agentport.gateway_protocol_compliance_report.v0.1");
    assert.equal(exampleGatewayProtocolReport.profile, "gateway-protocol");
    assert.equal(exampleGatewayProtocolReport.status, "passed");
    assert.equal(exampleGatewayProtocolReport.certification.publicCertification, false);
    assert.equal(exampleGatewayProtocolReport.certification.realBusinessCertification, false);
    assert.ok(exampleGatewayProtocolReport.areas.every((area) => area.directCheckIds.length > 0));
    assertHasRequiredTopLevel(exampleGatewayProtocolReport, gatewayProtocolReportSchema);

    assert.equal(ownerProofRequestSchema.properties.type.const, "agentport.owner_proof_request.v1");
    assert.equal(ownerProofRequestSchema.properties.safety.properties.notVerification.const, true);
    assert.equal(ownerProofRequestSchema.properties.safety.properties.verifiedBy.const, "agentport");
    assert.equal(exampleOwnerProofRequest.type, "agentport.owner_proof_request.v1");
    assert.equal(exampleOwnerProofRequest.ownerTask.code, "publish_dns_txt");
    assert.equal(exampleOwnerProofRequest.safety.notVerification, true);

    assert.equal(runPacketSchema.properties.type.const, "agentport.presentation_run_packet.v1");
    assert.deepEqual(runPacketSchema.properties.operator.properties.steps.items.properties.code.enum, codes.codeFamilies.presentation.step);
    assert.deepEqual(runPacketSchema.$defs.artifactKey.enum, codes.codeFamilies.presentation.artifact);
    assert.equal(exampleRunPacket.type, "agentport.presentation_run_packet.v1");
    assert.deepEqual(exampleRunPacket.operator.steps.map((step) => step.code), runPacketSchema.properties.operator.properties.steps.items.properties.code.enum);
    assert.equal(exampleRunPacket.operator.entrypoint, "agentport operator");

    assert.equal(runStatusSchema.properties.type.const, "agentport.presentation_run_status.v1");
    assert.deepEqual(runStatusSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step);
    assert.deepEqual(runStatusSchema.$defs.artifactKey.enum, codes.codeFamilies.presentation.artifact);
    assert.deepEqual(runStatusSchema.properties.issues.items.properties.code.enum, codes.codeFamilies.presentation.runIssue);
    assert.equal(runStatusSchema.$defs.stepGate.properties.code.const, codes.codeFamilies.presentation.gate[0]);
    assert.ok(runStatusSchema.properties.checks.required.includes("packetConsistent"));
    assert.ok(Object.hasOwn(runStatusSchema.properties.checks.properties, "evidenceMatchesPacket"));
    assert.ok(runStatusSchema.properties.issues.items.properties.code.enum.includes("evidence_packet_mismatch"));
    assert.equal(exampleRunStatus.type, "agentport.presentation_run_status.v1");
    assert.equal(exampleRunStatus.nextStep.code, "draft");
    assert.equal(exampleRunStatus.checks.packetLoaded, true);

    assert.equal(runBriefSchema.properties.type.const, "agentport.presentation_run_brief.v1");
    assert.deepEqual(runBriefSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step);
    assert.deepEqual(runBriefSchema.$defs.actionCode.enum, codes.codeFamilies.presentation.action);
    assert.equal(runBriefSchema.$defs.stepGate.properties.code.const, codes.codeFamilies.presentation.gate[0]);
    assert.ok(runBriefSchema.properties.checks.properties.evidenceMatchesPacket);
    assert.deepEqual(runBriefSchema.properties.issues.items.properties.code.enum, codes.codeFamilies.presentation.runIssue);
    assert.equal(exampleRunBrief.type, "agentport.presentation_run_brief.v1");
    assert.equal(exampleRunBrief.current.action, "operator_draft");
    assert.equal(exampleRunBrief.current.command.entrypoint, "agentport operator");

    assert.equal(runReportSchema.properties.type.const, "agentport.presentation_run_report.v1");
    assert.deepEqual(runReportSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step);
    assert.deepEqual(runReportSchema.$defs.actionCode.enum, codes.codeFamilies.presentation.action);
    assert.deepEqual(runReportSchema.$defs.runIssueCode.enum, codes.codeFamilies.presentation.runIssue);
    assert.deepEqual(runReportSchema.$defs.evidenceIssueCode.enum, codes.codeFamilies.presentation.evidenceIssue);
    assert.equal(runReportSchema.$defs.stepGate.properties.code.const, codes.codeFamilies.presentation.gate[0]);
    assert.equal(exampleRunReport.type, "agentport.presentation_run_report.v1");
    assert.equal(exampleRunReport.completed, true);
    assert.equal(exampleRunReport.evidence.matchesPacket, true);
    assert.equal(exampleRunReport.evidence.negativeAssist.outcome, "no_verified_info");

    assert.equal(copilotPacketSchema.properties.type.const, "agentport.business_copilot_readiness_packet.v0.1");
    assert.deepEqual(copilotPacketSchema.$defs.stateCode.enum, codes.codeFamilies.businessCopilot.state);
    assert.deepEqual(copilotPacketSchema.$defs.retentionCode.enum, codes.codeFamilies.businessCopilot.retention);
    assert.ok(codes.codeFamilies.businessCopilot.validationIssue.includes("invalid_artifact_ref"));
    assert.deepEqual(copilotPacketSchema.$defs.stepCode.enum, codes.codeFamilies.presentation.step);
    assert.deepEqual(copilotPacketSchema.$defs.artifactCode.enum, codes.codeFamilies.presentation.artifact);
    assert.deepEqual(copilotPacketSchema.$defs.actionCode.enum, codes.codeFamilies.presentation.action);
    assert.equal(exampleCopilotPacket.type, "agentport.business_copilot_readiness_packet.v0.1");
    assert.equal(exampleCopilotPacket.state.code, "draft_required");
    assert.equal(exampleCopilotPacket.retention.code, "refs_only");
    assert.equal(exampleCopilotPacket.requirements[0].code, "anthropic_api_key");

    assert.equal(preflightSchema.properties.type.const, "agentport.presentation_preflight.v1");
    assert.deepEqual(preflightSchema.properties.checks.required, [
      "goalPresent",
      "draftUnconfirmed",
      "reviewNonPublishable",
      "reviewedSubmissionReady",
      "ownershipConfirmed",
      "ownershipByAgentPort",
      "noRawCredentials",
      "businessIdsAligned",
      "proofArtifactsReadable"
    ]);
    assert.ok(preflightSchema.properties.issues.items.properties.code.enum.includes("artifact_read_failed"));
    assert.equal(examplePreflight.type, "agentport.presentation_preflight.v1");
    assert.equal(examplePreflight.ready, true);
    assert.deepEqual(Object.keys(examplePreflight.checks), preflightSchema.properties.checks.required);

    assert.equal(evidenceSchema.properties.type.const, "agentport.presentation_evidence.v1");
    assert.deepEqual(evidenceSchema.properties.boundaries.items.properties.code.enum, codes.codeFamilies.presentation.evidenceBoundary);
    const assistSchema = resolveLocalRef(evidenceSchema, evidenceSchema.properties.assist);
    assert.equal(assistSchema.properties.transport.enum.includes("mcp_http"), true);
    assert.equal(evidenceSchema.properties.negativeAssist.allOf[1].required.includes("goal"), true);
    assert.equal(exampleEvidence.type, "agentport.presentation_evidence.v1");
    assert.equal(exampleEvidence.negativeAssist.transport, "mcp_http");
    assert.equal(exampleEvidence.checks.negativeAssistCitedSources, true);
    assert.deepEqual(exampleEvidence.boundaries.map((boundary) => boundary.code), evidenceSchema.properties.boundaries.items.properties.code.enum);
  });

  it("emits a valid local conformance report", async () => {
    const { stdout } = await execFileAsync("node", ["scripts/conformance.mjs"], {
      cwd: process.cwd()
    });
    const report = JSON.parse(stdout);

    assert.equal(report.protocol, "agentport");
    assert.equal(report.version, "0.1");
    assert.equal(report.implementation.name, "@agentport/engine");
    assert.deepEqual(report.profiles.map((profile) => profile.name), [
      "core-runtime",
      "capability-honesty",
      "authority-evidence-checkpoint",
      "token-confirmation",
      "action-receipt",
      "compact-payload-retention",
      "gateway-protocol",
      "plugin-wallet"
    ]);
    assert.ok(report.profiles.every((profile) => profile.status === "passed"));
    assert.ok(report.profiles.every((profile) => profile.evidence.length > 0));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/action-intent-proof-pack.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/action-intent-compatibility-contract.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/agentport-open-standard-v0.2-draft.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/agentport-open-standard-v0.2-draft.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/implementer-kit/protocol-cut.v0.2.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/implementer-kit/protocol-governance.v0.2.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/implementer-kit/protocol-publication.v0.2.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/implementer-kit/protocol-external-review.v0.2.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/implementer-kit/protocol-external-review-result.v0.2.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/implementer-kit/protocol-stable-publication.v0.2.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-cut-manifest.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-governance.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-publication.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-external-review.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-external-review-result.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-stable-publication.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/agentport-open-standard-v0.2-external-review-checklist.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/agentport-open-standard-v0.2-release-notes.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/agentport-open-standard-v0.2-stable-cut-review.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-cut-manifest.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-governance-v0.2.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-publication-boundary.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-public-package-boundary.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-external-review-handoff.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-external-review-result.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/protocol-stable-publication-tag.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/agentport-protocol-governance-v0.2.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-action-intent-proof-pack.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-action-intent-compatibility-report.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/feedback/business-port-registry-compatibility-contract.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-business-port-proof-pack.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-registry-proof-pack.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-protocol-trace-matrix.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-gateway-profile.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-gateway-trace-suite.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-gateway-compatibility-report.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-host-binding.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-host-trace.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-host-connector-capture.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-host-event-log.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-host-adoption-report.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("schemas/agentport-a2a-host-proof-pack.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/action-intent-proof-pack/action-intent-proof-summary.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/action-intent-negative-cases.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/business-port-proof-pack/business-port-proof-summary.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/commitment-registry-proof-pack/registry-proof-summary.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/protocol-golden-trace-matrix.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("artifacts/agentport-a2a-gateway-profile.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("artifacts/agentport-a2a-host-binding.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-gateway-trace-suite.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-gateway-compatibility-report.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-trace.passing.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-trace.direct-execute.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-trace.invented-approval.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-trace.missing-authority.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-trace.forged-receipt.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-trace.ack-as-verification.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/chatgpt-app-connector-capture.send-ticket.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/chatgpt-app-connector-capture.direct-execute.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-event-log.send-ticket.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-event-log.restore-ticket-status.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-event-log.failed-direct-execute.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-proof-pack/host-trace.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-proof-pack/adoption-report.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-proof-pack/redaction-manifest.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("examples/a2a-host-proof-pack/proof-summary.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("scripts/a2a-gateway-check.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("scripts/a2a-host-event-log-export.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("scripts/a2a-host-proof-pack.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("test/conformance/a2a-gateway-check.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("test/conformance/a2a-host-event-log-export.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("test/conformance/a2a-host-proof-pack.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("docs/small-business-digital-twin-stage.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("scripts/run-small-business-twin.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "core-runtime").evidence.includes("artifacts/small-business-digital-twin/cedar-steam-coffee.trace.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "compact-payload-retention").evidence.includes("schemas/agentport-owner-proof-request.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "compact-payload-retention").evidence.includes("schemas/agentport-presentation-run-report.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("schemas/agentport-gateway-protocol-compliance-report.schema.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("examples/gateway-protocol-compliance.virtual-store.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/frontier-digital-twin-pilot.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/frontier-business-port-boundary.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/chatgpt-connector-capture-source-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/chatgpt-connector-capture-source.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/mcp-app-route-proof-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/mcp-app-route-proof.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/chatgpt-app-prepare-send-routing-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/chatgpt-app-prepare-send-routing.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/chatgpt-app-private-dogfood-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/chatgpt-app-private-dogfood.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/ticket-send-compile-binding-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/ticket-send-compile-binding.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/mcp-ticket-send-approval-tool-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/mcp-ticket-send-approval-tool.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("scripts/chatgpt-action-smoke.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("scripts/chatgpt-app-private-dogfood.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("test/server/chatgpt-action-smoke.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("test/server/chatgpt-app-private-dogfood.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("test/server/vercel-agent-ticket-ingress-redis.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/agent-ticket-ingress-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/agent-ticket-ingress.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("docs/feedback/agent-gateway-ingress-compatibility-report.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "gateway-protocol").evidence.includes("artifacts/vendor/chatgpt-actions-openapi.v0.1.json"));
    assert.ok(report.profiles.find((profile) => profile.name === "plugin-wallet").evidence.includes("test/core/plugin-wallet.test.mjs"));
    assert.ok(report.profiles.find((profile) => profile.name === "plugin-wallet").evidence.includes("docs/feedback/plugin-wallet-proof-pack.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "plugin-wallet").evidence.includes("docs/plugin-wallet-unified-inventory-plan.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "plugin-wallet").evidence.includes("docs/feedback/plugin-wallet-unified-inventory.md"));
    assert.ok(report.profiles.find((profile) => profile.name === "plugin-wallet").evidence.includes("examples/plugin-wallet-proof-pack/wallet-proof-summary.json"));
  });
});

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

function assertHasRequiredTopLevel(value, schema) {
  for (const key of schema.required ?? []) {
    assert.ok(Object.hasOwn(value, key), `missing required top-level field: ${key}`);
  }
}

async function assertProtocolCutRefsExist(manifest) {
  const refs = [
    manifest.standardDraft,
    manifest.governancePolicy,
    manifest.publicationStatus,
    ...manifest.roles.map((role) => role.doc),
    ...manifest.artifacts.docs,
    ...manifest.artifacts.schemas,
    ...manifest.artifacts.reports,
    ...manifest.artifacts.examples,
    ...manifest.artifacts.scripts
  ];
  const uniqueRefs = [...new Set(refs)];
  await Promise.all(uniqueRefs.map(async (ref) => {
    await access(ref);
  }));
}

function assertProtocolCutCommandsCurrent(commands) {
  const allowedPrefixes = [
    "npm run build",
    "node dist/cli/index.js gateway-protocol-check --input ",
    "node dist/cli/index.js plugin-wallet-check --input ",
    "node dist/cli/index.js action-intent-check --input ",
    "node dist/cli/index.js business-port-check --input ",
    "node dist/cli/index.js registry-check --input ",
    "node dist/cli/index.js protocol-trace-check --input ",
    "node scripts/a2a-gateway-check.mjs",
    "node scripts/a2a-host-proof-pack.mjs --input ",
    "node scripts/protocol-v02-conformance.mjs --input ",
    "node dist/cli/index.js conformance "
  ];
  const ids = new Set();
  for (const entry of commands) {
    assert.equal(ids.has(entry.id), false, `duplicate command id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(
      allowedPrefixes.some((prefix) => entry.command.startsWith(prefix)),
      `protocol cut command is not on the current command surface: ${entry.command}`
    );
  }
}
