import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  createAgentPortActionModel,
  createAgentPortClientUsePolicy,
  createAgentPortCommitmentFormat,
  createAgentPortDiscoveryDescriptor,
  createAgentPortOpenStandard,
  createAgentPortPluginWalletContract,
  createAgentPortVendorPluginManifest,
  createAgentPortProtocolCodes,
  createChatGptAppInstallPackage,
  createChatGptAppsMcpProfile,
  createChatGptActionsOpenApi,
  createClaudeMcpProfile,
  createGeminiFunctionDeclarations
} from "../../dist/server/index.js";

describe("mobile agent action artifacts", () => {
  it("keeps the static action artifact aligned with the server action model", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-action-model.v0.1.json", "utf8"));
    const { $schema: _schema, ...artifactModel } = artifact;

    assert.deepEqual(artifactModel, createAgentPortActionModel());
  });

  it("keeps the static client use policy aligned with the server policy", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-client-use-policy.v0.1.json", "utf8"));
    const { $schema: _schema, ...policy } = artifact;

    assert.deepEqual(policy, createAgentPortClientUsePolicy());
  });

  it("keeps the static discovery descriptor aligned with the server descriptor", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-discovery.v0.1.json", "utf8"));
    const { $schema: _schema, ...descriptor } = artifact;

    assert.deepEqual(descriptor, createAgentPortDiscoveryDescriptor());
  });

  it("keeps the static open standard aligned with the server open standard", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-open-standard.v0.1.json", "utf8"));
    const { $schema: _schema, ...openStandard } = artifact;

    assert.deepEqual(openStandard, createAgentPortOpenStandard());
  });

  it("keeps the static commitment format aligned with the server commitment format", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-commitment-format.v0.1.json", "utf8"));

    assert.deepEqual(artifact, createAgentPortCommitmentFormat());
  });

  it("defines the well-known discovery handoff for browsing agents", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-discovery.v0.1.json", "utf8"));
    const schema = JSON.parse(await readFile("schemas/agentport-discovery.schema.json", "utf8"));

    assert.equal(schema.properties.protocol.const, "agentport-discovery");
    assert.equal(schema.properties.resourceUri.const, "agentport://discovery");
    assert.equal(schema.properties.wellKnownPath.const, "/.well-known/agentport.json");
    assert.equal(artifact.wellKnownPath, "/.well-known/agentport.json");
    assert.equal(artifact.gateway.transport, "streamable-http");
    assert.equal(artifact.gateway.mcpEndpoint, "https://gateway.example.com/mcp");
    assert.ok(artifact.tools.includes("locate_agentport_wallet"));
    assert.ok(artifact.resources.some((resource) => resource.uri === "agentport://client-use-policy"));
    assert.ok(artifact.resources.some((resource) => resource.uri === "agentport://commitment-format"));
    assert.equal(artifact.sourcePreference.policyResource, "agentport://client-use-policy");
    assert.equal(artifact.stateChangingActions.actionModelResource, "agentport://action-model");
    assert.equal(artifact.businessHintPolicy.descriptorIsVerification, false);
    assert.equal(artifact.trustDistribution.descriptorIsTrust, false);
    assert.deepEqual(artifact.trustDistribution.gatewayReceiptTrust.order, [
      "apply_gateway_trust_root_emergency_denylist",
      "verify_gateway_trust_root_bundle",
      "verify_signed_gateway_trust_profile",
      "verify_gateway_action_receipt"
    ]);
    assert.deepEqual(artifact.trustDistribution.issuerReadinessTrust.order, [
      "apply_issuer_readiness_root_emergency_denylist",
      "verify_issuer_readiness_trust_root_bundle",
      "verify_signed_issuer_readiness",
      "validate_issuer_readiness_report"
    ]);
    assert.equal(
      artifact.trustDistribution.gatewayReceiptTrust.artifacts.signedTrustProfile.mcpResource,
      "agentport://gateway-trust-profile"
    );
    assert.equal(
      artifact.trustDistribution.issuerReadinessTrust.artifacts.signedTrustRootBundle.issuerMetadataField,
      "readinessTrustRootSigned"
    );
    assert.ok(artifact.businessHintPolicy.rule.includes("route lookup only"));
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("not as verification")));
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("Treat trustDistribution")));
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("read agentport://client-use-policy")));
  });

  it("defines when client agents prefer AgentPort over browsing", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-client-use-policy.v0.1.json", "utf8"));
    const schema = JSON.parse(await readFile("schemas/agentport-client-use-policy.schema.json", "utf8"));

    assert.equal(schema.properties.protocol.const, "agentport-client-use-policy");
    assert.equal(schema.properties.resourceUri.const, "agentport://client-use-policy");
    assert.deepEqual(artifact.decisionOrder.map((entry) => entry.source), [
      "agentport_verified_profile",
      "agentport_action_result_or_receipt",
      "business_owned_web",
      "external_search_or_directory"
    ]);
    assert.ok(artifact.preferAgentPortWhen.some((rule) => rule.includes("verified AgentPort match")));
    assert.ok(artifact.browseAllowedWhen.some((rule) => rule.includes("no matching business")));
    assert.ok(artifact.stateChangingActionPolicy.requiredResources.includes("agentport://action-model"));
    assert.ok(artifact.stateChangingActionPolicy.requiredResources.includes("agentport://commitment-format"));
    assert.ok(artifact.stateChangingActionPolicy.browsingCannotReplace.includes("ActionReceipt"));
    assert.equal(artifact.relatedResources.commitmentFormat, "agentport://commitment-format");
    assert.equal(artifact.conflictPolicy.materialConflictAction, "surface_conflict_and_avoid_silent_override");
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("call AgentPort before browsing")));
  });

  it("defines the mobile approval and action contract needed by general agents", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-action-model.v0.1.json", "utf8"));
    const schema = JSON.parse(await readFile("schemas/agentport-action-model.schema.json", "utf8"));

    assert.equal(schema.properties.protocol.const, "agentport-action-model");
    assert.ok(schema.properties.delegation.required.includes("issuerEndpoints"));
    assert.ok(artifact.targetAgents.includes("claude"));
    assert.ok(artifact.targetAgents.includes("chatgpt"));
    assert.ok(artifact.targetAgents.includes("gemini"));
    assert.ok(artifact.approvalCard.requiredDisplayFields.includes("business_name"));
    assert.ok(artifact.approvalCard.requiredDisplayFields.includes("customer_fields_to_share"));
    assert.ok(artifact.safeCallSequence.includes("render_user_approval_card_for_state_change"));
    assert.ok(artifact.safeCallSequence.includes("verify_gateway_receipt_when_present"));
    assert.equal(artifact.receipt.trustProfileResource, "agentport://gateway-trust-profile");
    assert.equal(artifact.delegation.normalizedAuthority.type, "AuthorityContext");
    assert.ok(artifact.delegation.normalizedAuthority.evidenceKinds.includes("agentport-local-delegation"));
    assert.ok(artifact.delegation.normalizedAuthority.evidenceKinds.includes("ap2-mandate"));
    assert.ok(artifact.receipt.authorityBinding.includes("authority evidence refs"));

    const stateChanging = artifact.actions.filter((action) => action.stateChanging);
    assert.ok(stateChanging.length > 0);
    assert.ok(stateChanging.every((action) => action.consentRequired === true));
    assert.ok(stateChanging.every((action) => action.approvalCardRequired === true));
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("Do not set userConsent true")));
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("Do not mint authority evidence")));
  });

  it("defines the portable commitment schema for ticket and reservation assets", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-commitment-format.v0.1.json", "utf8"));
    const schema = JSON.parse(await readFile("schemas/agentport-commitment.schema.json", "utf8"));

    assert.equal(artifact.protocol, "agentport-commitment-format");
    assert.equal(artifact.resourceUri, "agentport://commitment-format");
    assert.equal(schema.properties.protocol.const, "agentport-commitment");
    assert.equal(schema.properties.version.const, "0.1");
    assert.ok(schema.required.includes("commitmentId"));
    assert.ok(schema.required.includes("backend"));
    assert.ok(schema.required.includes("rights"));
    assert.ok(schema.required.includes("events"));
    assert.ok(schema.required.includes("receipts"));
    assert.deepEqual(schema.properties.backend.properties.systemOfRecord, { const: true });
    assert.ok(schema.properties.status.enum.includes("active"));
    assert.ok(schema.properties.status.enum.includes("cancelled"));
    assert.ok(schema.properties.status.enum.includes("rescheduled"));
    assert.ok(schema.properties.rights.properties.allowedActions.items.enum.includes("transfer"));
    assert.ok(schema.$defs.receiptRef.required.includes("payloadHash"));
    assert.ok(schema.$defs.receiptRef.required.includes("signature"));
    assert.ok(artifact.retentionBoundary.neverKeep.includes("credentials"));
    assert.ok(artifact.retentionBoundary.neverKeep.includes("card data"));
    assert.equal(artifact.example.protocol, "agentport-commitment");
    assert.equal(artifact.example.backend.systemOfRecord, true);
    assert.equal(artifact.example.rights.modificationRequiresConsent, true);
  });

  it("keeps the static plugin wallet contract aligned with the server contract", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));

    assert.deepEqual(artifact, createAgentPortPluginWalletContract());
    assert.equal(artifact.protocol, "agentport-plugin-wallet");
    assert.equal(artifact.resourceUri, "agentport://plugin-wallet");
    assert.equal(artifact.localWalletRecord.encryption.referenceAlgorithm, "A256GCM");
    assert.ok(artifact.localWalletRecord.forbiddenRawFields.includes("raw_delegation_tokens"));
    assert.ok(artifact.invariants.some((rule) => rule.includes("last-known ticket context")));
    assert.ok(artifact.invariants.some((rule) => rule.includes("Wrong-key decryption must fail closed")));
  });

  it("defines the plugin wallet pilot host runbook without overclaiming wallet authority", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const runbook = JSON.parse(await readFile("examples/plugin-wallet-pilot-host-runbook.v0.1.json", "utf8"));

    assert.equal(runbook.protocol, artifact.pilotHostRunbook.protocol);
    assert.deepEqual(runbook.protocolChain, artifact.pilotHostRunbook.protocolChain);
    assert.deepEqual(runbook.hostRuntimes, artifact.pilotHostRunbook.hostRuntimes);
    assert.deepEqual(runbook.requiredSmokeModes, artifact.pilotHostRunbook.requiredSmokeModes);
    assert.deepEqual(
      runbook.requiredEvidence.map((entry) => entry.name),
      artifact.pilotHostRunbook.requiredEvidence
    );
    assert.ok(runbook.hostOwnedResponsibilities.includes("key unlock UX"));
    assert.ok(runbook.agentPortOwnedBoundaries.includes("gateway status verification"));
    assert.ok(runbook.payloadSafety.excludesDecryptedLabels);
    assert.ok(runbook.payloadSafety.excludesCommitments);
    assert.ok(runbook.payloadSafety.excludesDestinationRefs);
    assert.ok(runbook.payloadSafety.excludesRawKeyMaterial);
    assert.ok(runbook.forbiddenClaims.includes("payment_wallet"));
    assert.ok(runbook.forbiddenClaims.includes("booking_ledger"));
    assert.ok(runbook.forbiddenClaims.includes("credential_vault"));
    assert.ok(runbook.forbiddenClaims.includes("lifecycle_authority"));
    assert.ok(runbook.forbiddenClaims.includes("agentport_key_recovery"));
    assert.ok(runbook.forbiddenClaims.includes("automatic_pending_action_replay"));
    assert.ok(runbook.forbiddenClaims.includes("platform_api_implemented_by_open_engine"));

    const serialized = JSON.stringify(runbook);
    assert.equal(serialized.includes("fixture-massage-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
  });

  it("defines virtual-store wallet evidence as a real store-path proof with fixture boundaries", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const evidence = JSON.parse(await readFile("examples/plugin-wallet-virtual-store-pilot-evidence.v0.1.json", "utf8"));

    assert.equal(evidence.protocol, artifact.virtualStorePilotEvidence.protocol);
    assert.equal(evidence.store.businessId, "agentport-virtual-store");
    assert.equal(evidence.store.treatedAsStore, true);
    assert.equal(evidence.store.usesRealStorePath, true);
    assert.equal(evidence.store.walletLoopTest, artifact.virtualStorePilotEvidence.store.walletLoopTest);
    assert.equal(evidence.evidenceKind, "virtual_pilot_store");
    assert.equal(evidence.realMarketProof, false);
    assert.equal(evidence.boundaries.virtualStoreTreatedAsRealStore, true);
    assert.equal(evidence.boundaries.sameGatewayPathAsRealStore, true);
    assert.equal(evidence.boundaries.fixtureBackendBoundary, true);
    assert.equal(evidence.boundaries.realBusinessPilotEvidence, false);
    assert.equal(evidence.boundaries.gatewayLifecycleAuthority, true);
    assert.equal(evidence.boundaries.walletIsSystemOfRecord, false);
    assert.equal(evidence.walletEvidence.returnedReviewProtocol, artifact.returnedSessionReview.protocol);
    assert.ok(evidence.statusPath.some((step) => step.step === "gateway_reverified_current" && step.currentLifecycleTruth === true));
    assert.ok(evidence.statusPath.some((step) => step.step === "gateway_failure_last_known_reverify_required" && step.currentLifecycleTruth === false));
    assert.equal(evidence.payloadSafety.excludesReceipts, true);
    assert.equal(evidence.payloadSafety.excludesBackendConfirmations, true);
    assert.equal(evidence.payloadSafety.excludesDestinationRefs, true);

    const serialized = JSON.stringify(evidence);
    assert.equal(serialized.includes("fixture-product_demo-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
  });

  it("defines the returned-session wallet review surface without lifecycle overclaim", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const review = JSON.parse(await readFile("examples/plugin-wallet-returned-session-review.v0.1.json", "utf8"));

    assert.equal(review.protocol, artifact.returnedSessionReview.protocol);
    assert.deepEqual(Object.keys(review.sections), artifact.returnedSessionReview.sections);
    assert.deepEqual(Object.keys(review.counts), artifact.returnedSessionReview.requiredCounts);
    assert.equal(review.counts.current, review.sections.current.length);
    assert.equal(review.counts.lastKnown, review.sections.lastKnown.length);
    assert.equal(review.counts.pendingConsent, review.sections.pendingConsent.length);
    assert.equal(review.counts.expiredReview, review.sections.expiredReview.length);
    assert.equal(review.counts.reverifyRequired, review.sections.reverifyRequired.length);
    assert.equal(review.sections.current.every((item) => item.verifiedCurrent === true), true);
    assert.equal(review.sections.lastKnown.every((item) => item.statusSource === "local_last_known" && item.reverifyRequired === true), true);
    assert.equal(review.boundaries.gatewayCurrentOnly, true);
    assert.equal(review.boundaries.localLastKnownRequiresReverify, true);
    assert.equal(review.boundaries.reviewDeliversPendingActions, false);
    assert.equal(review.boundaries.reviewIsLifecycleTruth, false);
    assert.equal(review.payloadSafety.excludesDecryptedLabels, true);
    assert.equal(review.payloadSafety.excludesCommitments, true);
    assert.equal(review.payloadSafety.excludesDestinationRefs, true);

    const serialized = JSON.stringify(review);
    assert.equal(serialized.includes("fixture-product_demo-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
    assert.equal(serialized.includes("Private"), false);
  });

  it("defines the Virtual Store gateway reference harness for wallet implementers", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const reference = JSON.parse(await readFile("examples/plugin-wallet-virtual-store-reference-harness.v0.1.json", "utf8"));

    assert.equal(reference.protocol, artifact.virtualStoreReferenceHarness.protocol);
    assert.deepEqual(reference.requiredScenarios, artifact.virtualStoreReferenceHarness.requiredScenarios);
    assert.equal(reference.store.businessId, artifact.virtualStoreReferenceHarness.canonicalReferenceBusiness.businessId);
    assert.equal(reference.store.serviceId, artifact.virtualStoreReferenceHarness.canonicalReferenceBusiness.serviceId);
    assert.equal(reference.store.backendSource, artifact.virtualStoreReferenceHarness.canonicalReferenceBusiness.backendSource);
    assert.equal(reference.store.realMarketProof, artifact.virtualStoreReferenceHarness.canonicalReferenceBusiness.realMarketProof);
    assert.equal(reference.store.virtualStoreCanonicalReference, true);
    assert.equal(reference.scenarioCount, reference.scenarios.length);
    assert.equal(reference.scenarios.every((scenario) => scenario.deliveryAttempted === false), true);
    assert.deepEqual(reference.boundaries, artifact.virtualStoreReferenceHarness.boundaries);
    assert.equal(reference.boundaries.gatewayLifecycleAuthority, true);
    assert.equal(reference.boundaries.referenceHarnessDeliversActions, false);
    assert.equal(reference.boundaries.referenceHarnessOwnsFullVirtualStoreEnvironment, false);
    assert.equal(reference.boundaries.paymentWallet, false);
    assert.equal(reference.boundaries.credentialVault, false);

    const lockedWallet = reference.scenarios.find((scenario) => scenario.scenario === "locked_wallet");
    const gatewayUnavailable = reference.scenarios.find((scenario) => scenario.scenario === "gateway_unavailable");
    const retry = reference.scenarios.find((scenario) => scenario.scenario === "user_triggered_retry");
    assert.equal(lockedWallet.gatewayStatusSource, "not_called");
    assert.equal(lockedWallet.walletMutation, "blocked");
    assert.equal(gatewayUnavailable.reviewSection, "reverifyRequired");
    assert.equal(gatewayUnavailable.gatewayReverifyRequired, true);
    assert.equal(retry.consentRule, "fresh_consent_required");

    const serialized = JSON.stringify(reference);
    assert.equal(serialized.includes("fixture-product_demo-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
    assert.equal(serialized.includes("Private"), false);
    assert.equal(serialized.includes("commitment_virtual_store_"), false);
  });

  it("defines the Gateway wallet golden trace matrix for protocol implementers", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const matrix = JSON.parse(await readFile("examples/plugin-wallet-golden-trace-matrix.v0.1.json", "utf8"));

    assert.equal(matrix.protocol, artifact.goldenTraceMatrix.protocol);
    assert.equal(matrix.sourceHarness.fixture, artifact.goldenTraceMatrix.sourceHarness);
    assert.deepEqual(matrix.requiredScenarios, artifact.goldenTraceMatrix.requiredScenarios);
    assert.deepEqual(Object.keys(matrix.traces[0]), artifact.goldenTraceMatrix.traceFields);
    assert.deepEqual(matrix.boundaries, artifact.goldenTraceMatrix.boundaries);
    assert.equal(matrix.traceCount, matrix.traces.length);
    assert.equal(matrix.traces.every((trace) => trace.deliveryAttempted === false), true);
    assert.equal(matrix.traces.filter((trace) => trace.modelVisibility === "current").every((trace) => trace.gatewayResult === "verified_current"), true);
    assert.equal(matrix.traces.filter((trace) => trace.reviewSection === "current").every((trace) => trace.gatewayResult === "verified_current"), true);

    const retry = matrix.traces.find((trace) => trace.scenario === "user_triggered_retry");
    const locked = matrix.traces.find((trace) => trace.scenario === "locked_wallet");
    const wrongKey = matrix.traces.find((trace) => trace.scenario === "wrong_key_restore");
    assert.equal(retry.consentRule, "fresh_consent_required");
    assert.equal(locked.gatewayResult, "not_called");
    assert.equal(wrongKey.gatewayResult, "not_called");
    assert.equal(matrix.boundaries.matrixIsLifecycleTruth, false);
    assert.equal(matrix.boundaries.gatewayCurrentOnly, true);
    assert.equal(matrix.boundaries.retryRequiresFreshConsent, true);
    assert.equal(matrix.boundaries.matrixDeliversActions, false);

    const serialized = JSON.stringify(matrix);
    assert.equal(serialized.includes("fixture-product_demo-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
    assert.equal(serialized.includes("Private"), false);
    assert.equal(serialized.includes("commitment_d"), false);
    assert.equal(serialized.includes("receipt_123"), false);
  });

  it("defines the Gateway wallet host adoption kit for implementers", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const kit = JSON.parse(await readFile("examples/plugin-wallet-host-adoption-kit.v0.1.json", "utf8"));

    assert.equal(kit.protocol, artifact.hostAdoptionKit.protocol);
    assert.deepEqual(kit.components.map((component) => component.componentId), artifact.hostAdoptionKit.requiredComponents);
    assert.deepEqual(kit.mustPassChecks.map((check) => check.checkId), artifact.hostAdoptionKit.requiredMustPassChecks);
    assert.deepEqual(Object.keys(kit.components[0]), artifact.hostAdoptionKit.componentFields);
    assert.deepEqual(Object.keys(kit.mustPassChecks[0]), artifact.hostAdoptionKit.checkFields);
    assert.equal(kit.components.every((component) => component.required === true), true);
    assert.equal(kit.mustPassChecks.every((check) => check.blocksSupportClaim === true), true);
    assert.equal(kit.components.some((component) => component.componentId === "gateway_wallet_contract"), true);
    assert.equal(kit.components.some((component) => component.componentId === "host_adapter_smoke_harness"), true);
    assert.equal(kit.components.some((component) => component.componentId === "virtual_store_reference_harness"), true);
    assert.equal(kit.components.some((component) => component.componentId === "golden_trace_matrix"), true);
    assert.equal(kit.components.some((component) => component.componentId === "returned_session_review_surface"), true);
    assert.equal(kit.components.some((component) => component.componentId === "conformance_evidence"), true);
    assert.equal(kit.mustPassChecks.some((check) => check.checkId === "restore_success"), true);
    assert.equal(kit.mustPassChecks.some((check) => check.checkId === "locked_wallet_fails_closed"), true);
    assert.equal(kit.mustPassChecks.some((check) => check.checkId === "gateway_unavailable_last_known"), true);
    assert.equal(kit.mustPassChecks.some((check) => check.checkId === "user_triggered_retry_fresh_consent"), true);
    assert.equal(kit.mustPassChecks.some((check) => check.checkId === "conformance_evidence_present"), true);
    assert.deepEqual(kit.boundaries, artifact.hostAdoptionKit.boundaries);
    assert.deepEqual(kit.hostOwnedResponsibilities, artifact.hostAdoptionKit.hostOwnedResponsibilities);
    assert.deepEqual(kit.agentPortOwnedBoundaries, artifact.hostAdoptionKit.agentPortOwnedBoundaries);
    assert.deepEqual(kit.runtimeRequirements, artifact.hostAdoptionKit.runtimeRequirements);
    assert.equal(kit.boundaries.kitIsLifecycleTruth, false);
    assert.equal(kit.boundaries.gatewayCurrentOnly, true);
    assert.equal(kit.boundaries.retryRequiresFreshConsent, true);
    assert.equal(kit.boundaries.hostOwnsKeyCustody, true);
    assert.equal(kit.boundaries.agentPortOwnsGatewayTruth, true);
    assert.equal(kit.boundaries.adoptionKitDeliversActions, false);
    assert.equal(kit.boundaries.adoptionKitIsHostSdk, false);
    assert.equal(kit.boundaries.paymentWallet, false);
    assert.equal(kit.boundaries.credentialVault, false);
    assert.equal(kit.runtimeRequirements.liveCredentialsRequired, false);
    assert.equal(kit.runtimeRequirements.networkRequired, false);
    assert.equal(kit.runtimeRequirements.wallClockSleepsRequired, false);
    assert.equal(kit.runtimeRequirements.platformApisRequired, false);
    assert.equal(kit.runtimeRequirements.fullVirtualStoreEnvironmentRequired, false);
    assert.equal(kit.runtimeRequirements.realBusinessRequired, false);

    const serialized = JSON.stringify(kit);
    assert.equal(serialized.includes("fixture-product_demo-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
    assert.equal(serialized.includes("Private"), false);
    assert.equal(serialized.includes("commitment_"), false);
    assert.equal(serialized.includes("receipt_"), false);
  });

  it("defines the Gateway wallet real-business handoff boundary without real pilot overclaim", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-plugin-wallet.v0.1.json", "utf8"));
    const handoff = JSON.parse(await readFile("examples/plugin-wallet-real-business-handoff.v0.1.json", "utf8"));

    assert.equal(handoff.protocol, artifact.realBusinessHandoff.protocol);
    assert.equal(handoff.sourceKit.fixture, artifact.realBusinessHandoff.sourceKit);
    assert.deepEqual(handoff.requiredEvidenceIds, artifact.realBusinessHandoff.requiredEvidenceIds);
    assert.deepEqual(handoff.requiredRedactionRuleIds, artifact.realBusinessHandoff.requiredRedactionRuleIds);
    assert.deepEqual(Object.keys(handoff.requiredEvidence[0]), artifact.realBusinessHandoff.evidenceFields);
    assert.deepEqual(Object.keys(handoff.redactionRules[0]), artifact.realBusinessHandoff.redactionRuleFields);
    assert.deepEqual(handoff.deterministicFixturePolicy, artifact.realBusinessHandoff.deterministicFixturePolicy);
    assert.deepEqual(handoff.boundaries, artifact.realBusinessHandoff.boundaries);
    assert.equal(handoff.requiredEvidence.every((evidence) => evidence.required === true), true);
    assert.equal(handoff.requiredEvidence.every((evidence) => evidence.blocksRealPilotClaim === true), true);
    assert.equal(handoff.redactionRules.every((rule) => rule.required === true), true);
    assert.equal(handoff.requiredEvidence.find((evidence) => evidence.evidenceId === "real_backend_outcome").proofRefPolicy, "external_ref_only");
    assert.equal(handoff.requiredEvidence.find((evidence) => evidence.evidenceId === "gateway_receipt").sourceOwner, "agentport_gateway");
    assert.equal(handoff.redactionRules.some((rule) => rule.ruleId === "no_real_business_private_fixture_data" && rule.appliesTo === "deterministic_fixture"), true);
    assert.equal(handoff.deterministicFixturePolicy.realBusinessEvidenceAllowedInCiFixtures, false);
    assert.equal(handoff.deterministicFixturePolicy.privateBusinessDataAllowedInCiFixtures, false);
    assert.equal(handoff.deterministicFixturePolicy.realBackendConfirmationAllowedInCiFixtures, false);
    assert.equal(handoff.boundaries.handoffBoundaryIsRealPilotEvidence, false);
    assert.equal(handoff.boundaries.supportingBranchOwnsRealBusinessOperations, false);
    assert.equal(handoff.boundaries.paymentWallet, false);
    assert.equal(handoff.boundaries.bookingLedger, false);
    assert.equal(handoff.boundaries.credentialVault, false);
    assert.equal(handoff.boundaries.systemOfRecord, false);

    const serialized = JSON.stringify(handoff);
    assert.equal(serialized.includes("fixture-product_demo-0001"), false);
    assert.equal(serialized.includes("sig_fixture"), false);
    assert.equal(serialized.includes("agentport://business-inbox"), false);
    assert.equal(serialized.includes("Private"), false);
    assert.equal(serialized.includes("commitment_virtual_store_current"), false);
    assert.equal(serialized.includes("receipt_virtual_store_123"), false);
    assert.equal(serialized.includes("customer@example"), false);
    assert.equal(serialized.includes("backend_confirmation_private01"), false);
  });

  it("keeps the static protocol code artifact aligned with the server code registry", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-protocol-codes.v0.1.json", "utf8"));
    const { $schema: _schema, ...artifactCodes } = artifact;

    assert.deepEqual(artifactCodes, createAgentPortProtocolCodes());
  });

  it("defines the gateway trust profile schema for receipt verification keys", async () => {
    const schema = JSON.parse(await readFile("schemas/agentport-gateway-trust-profile.schema.json", "utf8"));

    assert.equal(schema.$defs.profile.properties.protocol.const, "agentport-gateway-trust-profile");
    assert.equal(schema.$defs.profile.properties.version.const, "0.1");
    assert.equal(schema.$defs.profile.properties.receipt.properties.algorithm.const, "EdDSA");
    assert.ok(schema.$defs.receiptPublicKey.required.includes("jwk"));
    assert.deepEqual(schema.$defs.receiptPublicKey.properties.status.enum, ["active", "retired", "revoked"]);
    assert.equal(schema.$defs.receiptPublicKey.properties.expiresAt.format, "date-time");
    assert.equal(schema.$defs.signedEnvelope.properties.protocol.const, "agentport-gateway-trust-profile-envelope");
    assert.equal(schema.$defs.signedEnvelope.properties.signature.properties.alg.const, "EdDSA");
  });

  it("defines the gateway trust-root bundle schema for signed profile authorities", async () => {
    const schema = JSON.parse(await readFile("schemas/agentport-gateway-trust-root-bundle.schema.json", "utf8"));

    assert.equal(schema.$defs.bundle.properties.protocol.const, "agentport-gateway-trust-root-bundle");
    assert.equal(schema.$defs.bundle.properties.version.const, "0.1");
    assert.equal(schema.$defs.bundle.properties.bundleId.type, "string");
    assert.equal(schema.$defs.bundle.properties.sequence.minimum, 0);
    assert.equal(schema.$defs.bundle.properties.issuedAt.format, "date-time");
    assert.equal(schema.$defs.bundle.properties.notBefore.format, "date-time");
    assert.equal(schema.$defs.bundle.properties.expiresAt.format, "date-time");
    assert.ok(schema.$defs.bundle.required.includes("authorities"));
    assert.equal(schema.$defs.bundle.properties.authorities.minItems, 1);
    assert.equal(schema.$defs.signedEnvelope.properties.protocol.const, "agentport-gateway-trust-root-bundle-envelope");
    assert.equal(schema.$defs.signedEnvelope.properties.signature.properties.alg.const, "EdDSA");
    assert.equal(schema.$defs.signedEnvelope.properties.signature.properties.signedAt.format, "date-time");
    assert.ok(schema.$defs.profileAuthority.required.includes("issuer"));
    assert.ok(schema.$defs.profileAuthority.required.includes("publicKeys"));
    assert.equal(schema.$defs.profileAuthorityPublicKey.properties.alg.const, "EdDSA");
    assert.equal(schema.$defs.profileAuthorityPublicKey.properties.use.const, "sig");
    assert.deepEqual(schema.$defs.profileAuthorityPublicKey.properties.status.enum, ["active", "retired", "revoked"]);
    assert.equal(schema.$defs.profileAuthorityPublicKey.properties.notBefore.format, "date-time");
    assert.equal(schema.$defs.profileAuthorityPublicKey.properties.expiresAt.format, "date-time");
  });

  it("defines the business-port trust-root bundle schema for runtime attestation authorities", async () => {
    const schema = JSON.parse(await readFile("schemas/agentport-business-port-trust-root-bundle.schema.json", "utf8"));
    const artifact = JSON.parse(await readFile("artifacts/agentport-business-port-trust-root-bundle.v0.1.json", "utf8"));

    assert.equal(schema.properties.protocol.const, "agentport-business-port-trust-root-bundle");
    assert.equal(schema.properties.version.const, "0.1");
    assert.equal(schema.properties.bundleId.type, "string");
    assert.equal(schema.properties.sequence.minimum, 0);
    assert.equal(schema.properties.issuedAt.format, "date-time");
    assert.equal(schema.properties.notBefore.format, "date-time");
    assert.equal(schema.properties.expiresAt.format, "date-time");
    assert.ok(schema.required.includes("authorities"));
    assert.equal(schema.properties.authorities.minItems, 1);
    const authority = schema.properties.authorities.items;
    const publicKey = authority.properties.publicKeys.items;
    assert.ok(authority.required.includes("issuer"));
    assert.ok(authority.required.includes("publicKeys"));
    assert.equal(publicKey.properties.alg.const, "EdDSA");
    assert.equal(publicKey.properties.use.const, "sig");
    assert.deepEqual(publicKey.properties.status.enum, ["active", "stale", "revoked"]);
    assert.equal(artifact.protocol, "agentport-business-port-trust-root-bundle");
    assert.equal(artifact.authorities[0].issuer, "agentport");
  });

  it("defines the gateway trust-root emergency deny-list schema for signed incident feeds", async () => {
    const schema = JSON.parse(await readFile("schemas/agentport-gateway-trust-root-emergency-denylist.schema.json", "utf8"));

    assert.equal(schema.$defs.denyList.properties.protocol.const, "agentport-gateway-trust-root-emergency-denylist");
    assert.equal(schema.$defs.denyList.properties.version.const, "0.1");
    assert.equal(schema.$defs.denyList.properties.sequence.minimum, 0);
    assert.equal(schema.$defs.denyList.properties.issuedAt.format, "date-time");
    assert.equal(schema.$defs.denyList.properties.notBefore.format, "date-time");
    assert.equal(schema.$defs.denyList.properties.expiresAt.format, "date-time");
    assert.equal(schema.$defs.denyList.properties.blockedBundleHashes.items.pattern, "^[a-f0-9]{64}$");
    assert.equal(schema.$defs.denyList.properties.approval.properties.changeHash.pattern, "^[a-f0-9]{64}$");
    assert.ok(schema.$defs.denyList.properties.approval.required.includes("approvalIds"));
    assert.ok(schema.$defs.denyList.properties.approval.required.includes("approvedBy"));
    assert.equal(schema.$defs.signedEnvelope.properties.protocol.const, "agentport-gateway-trust-root-emergency-denylist-envelope");
    assert.equal(schema.$defs.signedEnvelope.properties.signature.properties.alg.const, "EdDSA");
    assert.equal(schema.$defs.signedEnvelope.properties.signature.properties.signedAt.format, "date-time");
  });

  it("defines the issuer flow artifact general agents use to request approval", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-issuer-flow.v0.1.json", "utf8"));
    const schema = JSON.parse(await readFile("schemas/agentport-issuer-flow.schema.json", "utf8"));

    assert.equal(schema.properties.protocol.const, "agentport-issuer-flow");
    assert.equal(artifact.issuerDiscovery.metadata, "/.well-known/agentport-issuer.json");
    assert.equal(artifact.issuerDiscovery.readiness, "/readiness");
    assert.ok(schema.properties.issuerDiscovery.required.includes("readiness"));
    assert.equal(artifact.delegationRequest.endpoint, "/delegation/request");
    assert.ok(artifact.delegationRequest.requiredFields.includes("actionIntent"));
    assert.ok(artifact.delegationRequest.requiredFields.includes("tokenConfirmation"));
    assert.ok(artifact.delegationRequest.forbiddenClientFields.includes("userSubject"));
    assert.ok(artifact.delegationRequest.forbiddenClientFields.includes("privateKeyPem"));
    assert.equal(schema.properties.passkeyLifecycle.properties.registration.properties.method.const, "POST");
    assert.equal(artifact.passkeyLifecycle.registration.challengeEndpoint, "/passkey/registration/challenge");
    assert.equal(artifact.passkeyLifecycle.registration.completeEndpoint, "/passkey/registration/complete");
    assert.equal(artifact.passkeyLifecycle.registration.controlledBy, "issuer_user_session");
    assert.ok(artifact.passkeyLifecycle.registration.clientAgentForbiddenFields.includes("privateKeyPem"));
    assert.ok(artifact.passkeyLifecycle.registration.clientAgentForbiddenFields.includes("csrfToken"));
    assert.equal(artifact.passkeyLifecycle.credentialManagement.listEndpoint, "/passkey/credentials");
    assert.equal(artifact.passkeyLifecycle.credentialManagement.revokeEndpoint, "/passkey/credentials/{credentialId}/revoke");
    assert.ok(artifact.passkeyLifecycle.credentialManagement.listResponseRules.some((rule) => rule.includes("publicKeyPem")));
    assert.ok(artifact.passkeyLifecycle.credentialManagement.revokeRules.some((rule) => rule.includes("explicit user intent")));
    assert.ok(artifact.passkeyLifecycle.clientAgentRules.some((rule) => rule.includes("must not synthesize")));
    assert.ok(artifact.passkeyLifecycle.clientAgentRules.some((rule) => rule.includes("must never receive")));
    assert.ok(artifact.tokenUse.headers.includes("AgentPort-Delegation"));
    assert.ok(artifact.tokenUse.headers.includes("DPoP"));
    assert.ok(artifact.clientAgentRules.some((rule) => rule.includes("do not mint")));
  });

  it("keeps vendor adapter artifacts aligned with their generators", async () => {
    const manifest = JSON.parse(await readFile("artifacts/vendor/agentport-vendor-plugin-manifest.v0.1.json", "utf8"));
    const claude = JSON.parse(await readFile("artifacts/vendor/claude-mcp-profile.v0.1.json", "utf8"));
    const chatgpt = JSON.parse(await readFile("artifacts/vendor/chatgpt-actions-openapi.v0.1.json", "utf8"));
    const chatgptApp = JSON.parse(await readFile("artifacts/vendor/chatgpt-apps-mcp-profile.v0.1.json", "utf8"));
    const chatgptAppInstall = JSON.parse(await readFile("artifacts/vendor/chatgpt-app-install-package.v0.1.json", "utf8"));
    const gemini = JSON.parse(await readFile("artifacts/vendor/gemini-function-declarations.v0.1.json", "utf8"));

    assert.deepEqual(manifest, createAgentPortVendorPluginManifest());
    assert.deepEqual(claude, createClaudeMcpProfile());
    assert.deepEqual(chatgpt, createChatGptActionsOpenApi());
    assert.deepEqual(chatgptApp, createChatGptAppsMcpProfile());
    assert.deepEqual(chatgptAppInstall, createChatGptAppInstallPackage());
    assert.deepEqual(gemini, createGeminiFunctionDeclarations());
  });

  it("defines vendor-specific action surfaces without weakening consent", async () => {
    const manifest = JSON.parse(await readFile("artifacts/vendor/agentport-vendor-plugin-manifest.v0.1.json", "utf8"));
    const claude = JSON.parse(await readFile("artifacts/vendor/claude-mcp-profile.v0.1.json", "utf8"));
    const chatgpt = JSON.parse(await readFile("artifacts/vendor/chatgpt-actions-openapi.v0.1.json", "utf8"));
    const chatgptApp = JSON.parse(await readFile("artifacts/vendor/chatgpt-apps-mcp-profile.v0.1.json", "utf8"));
    const chatgptAppInstall = JSON.parse(await readFile("artifacts/vendor/chatgpt-app-install-package.v0.1.json", "utf8"));
    const gemini = JSON.parse(await readFile("artifacts/vendor/gemini-function-declarations.v0.1.json", "utf8"));

    assert.equal(manifest.protocol, "agentport-vendor-plugin-manifest");
    assert.deepEqual(manifest.plugins.map((plugin) => `${plugin.vendor}:${plugin.profile}`), ["claude:mcp", "chatgpt:actions-openapi", "chatgpt:apps-sdk-mcp", "gemini:function-declarations"]);
    assert.ok(manifest.gatewayContract.resources.includes("agentport://discovery"));
    assert.ok(manifest.gatewayContract.resources.includes("agentport://client-use-policy"));
    assert.ok(manifest.gatewayContract.resources.includes("agentport://action-model"));
    assert.ok(manifest.gatewayContract.resources.includes("agentport://commitment-format"));
    assert.ok(manifest.gatewayContract.resources.includes("agentport://plugin-wallet"));
    assert.ok(manifest.gatewayContract.resources.includes("agentport://protocol-codes"));
    assert.ok(manifest.gatewayContract.resources.includes("agentport://gateway-trust-profile"));
    assert.ok(manifest.gatewayContract.stateChangingTools.includes("book_service"));
    assert.deepEqual(manifest.gatewayContract.ticketTools, ["locate_agentport_wallet", "locate_wallet_tickets", "resolve_ticket", "verify_ticket", "get_ticket_status", "get_allowed_ticket_actions", "prepare_ticket_send", "send_ticket"]);
    assert.ok(manifest.gatewayContract.planningTools.includes("compile_action_intent"));
    assert.equal(manifest.requiredPreExecutionChecks.failClosed, true);
    assert.ok(manifest.requiredPreExecutionChecks.appliesTo.includes("book_service"));
    assert.ok(manifest.requiredPreExecutionChecks.appliesTo.includes("send_ticket"));
    assert.deepEqual(
      manifest.requiredPreExecutionChecks.checks.map((check) => check.id),
      ["exact_user_approval", "representative_authority", "real_user_presence", "anti_abuse_screening"]
    );
    assert.ok(manifest.requiredPreExecutionChecks.checks.every((check) => check.required === true));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("Frontier ticket plugin tools")));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("plugin wallet contract")));
    assert.equal(manifest.pluginWallet.resourceUri, "agentport://plugin-wallet");
    assert.ok(manifest.pluginWallet.rule.includes("encrypted"));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("exact user approval")));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("representative authority")));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("real-user presence")));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("ransom/extortion")));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("must not mint authority evidence")));
    assert.ok(manifest.readinessChecks.some((check) => check.includes("ActionReceipt fields must be preserved")));
    assert.ok(manifest.openEngineBoundary.some((rule) => rule.includes("does not call business booking backends")));
    assert.ok(manifest.openEngineBoundary.some((rule) => rule.includes("no tenant credentials")));

    assert.equal(claude.profile, "mcp");
    assert.equal(claude.server.discovery, "/.well-known/agentport.json");
    assert.ok(claude.server.tools.includes("verify_ticket"));
    assert.ok(claude.server.tools.includes("send_ticket"));
    assert.ok(claude.server.resources.includes("agentport://discovery"));
    assert.ok(claude.server.resources.includes("agentport://open-standard"));
    assert.ok(claude.server.resources.includes("agentport://client-use-policy"));
    assert.ok(claude.server.resources.includes("agentport://action-model"));
    assert.ok(claude.server.resources.includes("agentport://commitment-format"));
    assert.ok(claude.server.resources.includes("agentport://plugin-wallet"));
    assert.ok(claude.server.resources.includes("agentport://protocol-codes"));
    assert.ok(claude.server.resources.includes("agentport://gateway-trust-profile"));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("agentport://discovery")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("agentport://open-standard")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("client-use-policy")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("call AgentPort before browsing")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("agentport://protocol-codes")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("agentport://commitment-format")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("agentport://plugin-wallet")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("verify the representing agent and user")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("real-user presence")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("ransom/extortion")));
    assert.ok(claude.instructions.some((instruction) => instruction.includes("Never set userConsent true")));

    assert.equal(chatgpt.openapi, "3.1.0");
    assert.deepEqual(Object.keys(chatgpt.paths), [
      "/actions/get-business-info",
      "/actions/get-readiness-report",
      "/actions/prepare-service-request",
      "/actions/submit-service-request",
      "/actions/prepare-ticket-send",
      "/actions/get-action-intent-lifecycle",
      "/actions/list-action-intent-result-deliveries",
      "/actions/get-action-intent-result-delivery",
      "/actions/locate-agentport-wallet",
      "/actions/locate-wallet-tickets",
      "/actions/verify-ticket",
      "/actions/resolve-ticket",
      "/actions/get-ticket-status",
      "/actions/get-allowed-ticket-actions",
      "/actions/send-ticket",
      "/actions/submit-agent-ticket-ingress"
    ]);
    assert.deepEqual(
      Object.values(chatgpt.paths).map((path) => path.post.operationId),
      [
        "getBusinessInfo",
        "getReadinessReport",
        "prepareServiceRequest",
        "submitServiceRequest",
        "prepareTicketSend",
        "getActionIntentLifecycle",
        "listActionIntentResultDeliveries",
        "getActionIntentResultDelivery",
        "locateAgentPortWallet",
        "locateWalletTickets",
        "verifyTicket",
        "resolveTicket",
        "getTicketStatus",
        "getAllowedTicketActions",
        "sendTicket",
        "submitAgentTicketIngress"
      ]
    );
    for (const path of Object.values(chatgpt.paths)) {
      assert.ok(path.post.description.length <= 300, `${path.post.operationId} description exceeds ChatGPT builder limit`);
    }
    assert.ok(chatgpt.paths["/actions/locate-agentport-wallet"].post.description.includes("AgentPort wallet context"));
    assert.ok(chatgpt.paths["/actions/locate-wallet-tickets"].post.description.includes("before asking for a ticket code"));
    assert.equal(chatgpt.paths["/actions/find-services"], undefined);
    assert.ok(chatgpt.paths["/actions/get-business-info"].post.description.includes("already selected"));
    assert.ok(chatgpt.paths["/actions/get-readiness-report"].post.description.includes("not search or recommendation"));
    assert.ok(chatgpt.paths["/actions/prepare-service-request"].post.description.includes("frontier-selected business port"));
    assert.ok(chatgpt.paths["/actions/submit-service-request"].post.description.includes("exact user approval"));
    assert.ok(chatgpt.paths["/actions/prepare-ticket-send"].post.description.includes("approval-ready intent"));
    assert.ok(chatgpt.paths["/actions/get-action-intent-lifecycle"].post.description.includes("conversation memory"));
    assert.ok(chatgpt.paths["/actions/resolve-ticket"].post.description.includes("AP-DEMO-1234"));
    assert.ok(chatgpt.paths["/actions/resolve-ticket"].post.description.includes("proof_required"));
    assert.ok(chatgpt.paths["/actions/resolve-ticket"].post.description.includes("Ticket code alone is not authority"));
    assert.ok(chatgpt.paths["/actions/send-ticket"].post.description.includes("never mutates"));
    assert.ok(chatgpt.paths["/actions/submit-agent-ticket-ingress"].post.description.includes("not search"));
    assert.ok(chatgpt.paths["/actions/submit-agent-ticket-ingress"].post.description.includes("does not mint authority"));
    assert.deepEqual(chatgpt.components.schemas.ResolveTicketInput.required, ["ticketRef"]);
    assert.ok(chatgpt.components.schemas.ResolveTicketInput.properties.holderRef.description.includes("Holder verification"));
    assert.ok(chatgpt.components.schemas.LocateAgentPortWalletInput.properties.includeRequests);
    assert.ok(chatgpt.components.schemas.LocateAgentPortWalletInput.properties.intentId);
    assert.ok(chatgpt.components.schemas.LocateWalletTicketsInput.properties.includeEvidence.description.includes("Do not set true"));
    assert.ok(chatgpt.components.schemas.LocateWalletTicketsInput.properties.walletTicketId);
    assert.ok(chatgpt.components.schemas.SendTicketInput.required.includes("consentStatement"));
    assert.ok(chatgpt.components.schemas.SendTicketInput.properties.consentStatement.description.includes("Bind the user's approval"));
    assert.ok(chatgpt.components.schemas.SendTicketInput.properties.consentStatement.description.includes("User approved: Yes"));
    assert.ok(chatgpt.components.schemas.SendTicketInput.properties.consentStatement.description.includes("Backend changed: no"));
    assert.ok(chatgpt.components.schemas.SendTicketInput.properties.includeProtocolTrace.description.includes("v0.2 protocol trace"));
    assert.deepEqual(chatgpt.components.schemas.AgentTicketIngressInput.required, ["agentSession", "envelope", "ticket", "destination"]);
    assert.equal(chatgpt.components.schemas.AgentTicketIngressEnvelope.properties.audience.const, "agentport://small-business-digital-twin/agent-ticket-ingress");
    assert.equal(chatgpt.components.schemas.AgentTicketIngressTicket.properties.requestedAction.const, "send_ticket");
    assert.deepEqual(chatgpt.components.schemas.PrepareTicketSendInput.required, ["commitment", "destination"]);
    assert.deepEqual(chatgpt.components.schemas.PrepareServiceRequestInput.required, ["goal", "businessId", "serviceId"]);
    assert.equal(chatgpt.components.schemas.FindServicesInput, undefined);
    assert.ok(chatgpt.components.schemas.PrepareServiceRequestInput.properties.requestedType.description.includes("request-only"));
    assert.ok(chatgpt.components.schemas.SubmitServiceRequestInput.required.includes("consentStatement"));
    assert.ok(chatgpt.components.schemas.SubmitServiceRequestInput.properties.consentStatement.description.includes("Not confirmed"));
    assert.ok(chatgpt.components.schemas.ServiceActionResult.properties.boundaries);
    assert.ok(chatgpt.components.schemas.TicketActionResult.properties.backendMutation);
    assert.ok(chatgpt.components.schemas.TicketActionResult.properties.protocolTrace.description.includes("includeProtocolTrace"));
    assert.ok(chatgpt.components.schemas.TicketActionResult.properties.tickets.items.properties.userTicketCard);
    assert.equal(chatgpt["x-agentport"].discoveryWellKnownPath, "/.well-known/agentport.json");
    assert.equal(chatgpt["x-agentport"].discoveryResource, "agentport://discovery");
    assert.equal(chatgpt["x-agentport"].openStandardResource, "agentport://open-standard");
    assert.equal(chatgpt["x-agentport"].clientUsePolicyResource, "agentport://client-use-policy");
    assert.equal(chatgpt["x-agentport"].commitmentFormatResource, "agentport://commitment-format");
    assert.equal(chatgpt["x-agentport"].pluginWalletResource, "agentport://plugin-wallet");
    assert.equal(chatgpt["x-agentport"].protocolCodesResource, "agentport://protocol-codes");
    assert.equal(chatgpt["x-agentport"].gatewayTrustProfileResource, "agentport://gateway-trust-profile");
    assert.equal(chatgpt["x-agentport"].agentTicketIngressAudience, "agentport://small-business-digital-twin/agent-ticket-ingress");
    assert.deepEqual(chatgpt["x-agentport"].frontierTicketTools, ["locate_agentport_wallet", "locate_wallet_tickets", "resolve_ticket", "verify_ticket", "get_ticket_status", "get_allowed_ticket_actions", "prepare_ticket_send", "send_ticket"]);
    assert.equal(chatgpt["x-agentport"].frontierBusinessPortBoundary.agentPortIsSearchEngine, false);
    assert.equal(chatgpt["x-agentport"].frontierBusinessPortBoundary.frontierHostSelectsBusinessPort, true);
    assert.equal(chatgpt["x-agentport"].serviceRequestActionFacade.includes("findServices"), false);
    assert.ok(chatgpt["x-agentport"].serviceRequestActionFacade.includes("locateAgentPortWallet"));
    assert.ok(chatgpt["x-agentport"].serviceRequestActionFacade.includes("prepareServiceRequest"));
    assert.ok(chatgpt["x-agentport"].serviceRequestActionFacade.includes("submitServiceRequest"));
    assert.ok(chatgpt["x-agentport"].discoveryRules.some((rule) => rule.includes("routing descriptor")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("user's exact ticket phrase as userClaim")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("frontier host must understand the intent")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("select the business port")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("requestOnly")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("Do not set includeEvidence")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("proof_required")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("encrypt local wallet records")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("represents this user")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("real-user proof")));
    assert.ok(chatgpt["x-agentport"].clientAgentRules.some((rule) => rule.includes("ransom/extortion")));
    assert.ok(chatgpt["x-agentport"].openStandardRules.some((rule) => rule.includes("missing_consent")));
    assert.ok(chatgpt["x-agentport"].sourcePreferenceRules.some((rule) => rule.includes("call AgentPort before browsing")));
    assert.ok(chatgpt["x-agentport"].approvalRequiredTools.includes("book_service"));

    assert.equal(chatgptApp.vendor, "chatgpt");
    assert.equal(chatgptApp.profile, "apps-sdk-mcp");
    assert.equal(chatgptApp.transport, "streamable-http");
    assert.ok(chatgptApp.server.resources.includes("agentport://action-model"));
    assert.ok(chatgptApp.server.tools.includes("compile_action_intent"));
    assert.ok(chatgptApp.server.tools.includes("book_service"));
    assert.ok(chatgptApp.server.tools.includes("locate_agentport_wallet"));
    assert.ok(chatgptApp.server.tools.includes("locate_wallet_tickets"));
    assert.ok(chatgptApp.app.componentResources.some((component) => component.uri === "ui://agentport/approval-card.html"));
    assert.ok(chatgptApp.app.componentResources.some((component) => component.uri === "ui://agentport/status-card.html"));
    assert.ok(chatgptApp.app.triggerIntents.includes("create a service ticket"));
    assert.ok(chatgptApp.app.triggerIntents.includes("resume a previous booking"));
    assert.ok(chatgptApp.app.routingRules.some((rule) => rule.includes("Use Pactway when the user asks to book")));
    assert.ok(chatgptApp.app.negativeTriggers.some((rule) => rule.includes("generic issue tracking") && rule.includes("software bug tickets")));
    assert.ok(chatgptApp.app.componentResources.every((component) => component.mimeType === "text/html;profile=mcp-app"));
    assert.ok(chatgptApp.app.componentResources.every((component) => component._meta.ui.prefersBorder === true));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "compile_action_intent" && tool._meta["openai/outputTemplate"] === "ui://agentport/approval-card.html"));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "compile_action_intent" && tool._meta.ui.resourceUri === "ui://agentport/approval-card.html"));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "compile_action_intent" && tool.description.includes("create, book, request, send")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "compile_action_intent" && tool.triggerPhrases.includes("create a ticket")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "locate_agentport_wallet" && tool.triggerPhrases.includes("pending business response")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "locate_wallet_tickets" && tool.triggerPhrases.includes("what happened to my ticket")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "book_service" && tool.annotations.readOnlyHint === false));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "cancel_service" && tool.annotations.destructiveHint === true));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "get_ticket_status" && tool.annotations.readOnlyHint === true));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "prepare_ticket_send" && tool._meta["openai/outputTemplate"] === "ui://agentport/approval-card.html"));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "prepare_ticket_send" && tool._meta["openai/widgetAccessible"] === true));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "prepare_ticket_send" && tool.triggerPhrases.includes("send reservation proof")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "send_ticket" && tool.description.includes("Execution-only") && tool.description.includes("prepare_ticket_send")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "send_ticket" && !tool.triggerPhrases.includes("send reservation proof")));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "book_service" && tool._meta["openai/outputTemplate"] === "ui://agentport/receipt-card.html"));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "locate_agentport_wallet" && tool._meta["openai/outputTemplate"] === "ui://agentport/resume-card.html"));
    assert.ok(chatgptApp.toolDescriptors.some((tool) => tool.name === "locate_wallet_tickets" && tool._meta["openai/outputTemplate"] === "ui://agentport/resume-card.html"));
    assert.ok(chatgptApp.toolDescriptors.every((tool) => Array.isArray(tool._meta.securitySchemes)));
    assert.ok(chatgptApp.requiredPreExecutionChecks.appliesTo.includes("send_ticket"));
    assert.equal(chatgptApp.requiredPreExecutionChecks.failClosed, true);
    assert.deepEqual(chatgptApp.requiredPreExecutionChecks.checks, ["exact_user_approval", "representative_authority", "real_user_presence", "anti_abuse_screening"]);
    assert.ok(chatgptApp.modelRules.some((rule) => rule.includes("Never set userConsent true")));
    assert.ok(chatgptApp.modelRules.some((rule) => rule.includes("status, approval, receipt, handoff, and resume")));
    assert.ok(chatgptApp.legacyCompatibility.rule.includes("compatibility path"));

    assert.equal(chatgptAppInstall.profile, "apps-sdk-mcp-install");
    assert.equal(chatgptAppInstall.connector.mcpEndpoint, "https://gateway.example.com/mcp");
    assert.equal(chatgptAppInstall.connector.discoveryUrl, "https://gateway.example.com/.well-known/agentport.json");
    assert.deepEqual(chatgptAppInstall.mcpProfile, chatgptApp);
    assert.ok(chatgptAppInstall.app.triggerIntents.includes("book a service"));
    assert.ok(chatgptAppInstall.app.starterPrompts.some((prompt) => prompt.includes("Book a massage")));
    assert.ok(chatgptAppInstall.triggerIntents.includes("create a service ticket"));
    assert.ok(chatgptAppInstall.routingRules.some((rule) => rule.includes("user's exact ticket phrase as userClaim")));
    assert.ok(chatgptAppInstall.routingRules.some((rule) => rule.includes("prepare_ticket_send before asking for approval")));
    assert.ok(chatgptAppInstall.routingRules.some((rule) => rule.includes("send_ticket only after prepare_ticket_send")));
    assert.ok(chatgptAppInstall.componentResources.every((component) => component.mimeType === "text/html;profile=mcp-app"));
    assert.ok(chatgptAppInstall.toolUiBindings.some((binding) => binding.name === "compile_action_intent" && binding.resourceUri === "ui://agentport/approval-card.html"));
    assert.ok(chatgptAppInstall.toolUiBindings.some((binding) => binding.name === "book_service" && binding.readOnlyHint === false));
    assert.ok(chatgptAppInstall.toolUiBindings.some((binding) => binding.name === "locate_agentport_wallet" && binding.readOnlyHint === true && binding.triggerPhrases.includes("check my Pactway wallet")));
    assert.ok(chatgptAppInstall.toolUiBindings.some((binding) => binding.name === "locate_wallet_tickets" && binding.readOnlyHint === true && binding.triggerPhrases.includes("existing ticket status")));
    assert.equal(chatgptAppInstall.requiredReviewChecks.failClosed, true);
    assert.ok(chatgptAppInstall.requiredReviewChecks.checks.includes("component_csp_matches_deployment_origin"));
    assert.ok(chatgptAppInstall.deploymentRequirements.some((requirement) => requirement.includes("HTTPS origin")));
    assert.ok(chatgptAppInstall.smoke.deployed.some((command) => command.includes("npm run chatgpt-app-package")));
    assert.ok(chatgptAppInstall.boundary.some((rule) => rule.includes("not a Custom GPT Action")));

    assert.equal(gemini.profile, "function-declarations");
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_discovery"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_open_standard"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_client_use_policy"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_protocol_codes"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_action_model"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_commitment_format"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "read_agentport_plugin_wallet"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "locate_agentport_wallet"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "locate_wallet_tickets"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "verify_ticket"));
    assert.ok(gemini.functionDeclarations.some((fn) => fn.name === "send_ticket"));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("discovery descriptor")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("existing-ticket, pending-request, wallet")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("plugin wallet contract")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("open standard")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("client use policy")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("verify the representing agent and user")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("user-presence evidence")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("ransom/extortion")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("must not pass userConsent true")));
    assert.ok(gemini.hostRules.some((rule) => rule.includes("gateway trust profile")));
  });
});
