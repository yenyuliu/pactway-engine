import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { ConsoleAuditSink, DevAuth, Ed25519BusinessPortAttestationSigner, InMemoryActionIntentLifecycleStore, InMemoryActionIntentResultSink, LocalJsonTenantStore, LocalTruthStore, NoopAnalytics, NoopLeadSink, StaticBusinessPortAttestationStore, TrustAnchoredBusinessPortAttestationProvider } from "../../dist/core/index.js";
import { FixtureAdapter, FIXTURE_SLOTS } from "../../dist/adapters/fixture/index.js";
import { ManualAdapter } from "../../dist/adapters/manual/index.js";
import { chatGptAppComponentUris, createAgentPortServer, createDemoTicketWalletRegistry, StaticAccountSessionHostWalletIdentityProvider, StaticHostWalletIdentityProvider } from "../../dist/server/index.js";
import {
  createPublicVerificationBundle,
  createPublicVerificationDescriptor,
  Ed25519PublicVerificationBundleSigner,
  verifyPublicVerificationBundle
} from "../../dist/verification/index.js";

const businessPortSigningKeys = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
const businessPortSigner = new Ed25519BusinessPortAttestationSigner(
  "agentport",
  "mcp-business-port-key",
  businessPortSigningKeys.privateKey
);
const publicVerificationSigningKeys = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
const publicVerificationSigner = new Ed25519PublicVerificationBundleSigner(
  "agentport",
  "mcp-public-verification-key",
  publicVerificationSigningKeys.privateKey
);
const publicVerificationEndpoint = "https://booking.proof-spa.example/book";
const publicVerificationBundle = publicVerificationSigner.sign(createPublicVerificationBundle({
  descriptor: createPublicVerificationDescriptor({
    endpoint: publicVerificationEndpoint,
    bundleUrl: "https://booking.proof-spa.example/.well-known/agentport/verification-bundle.json",
    jwksUrl: "https://booking.proof-spa.example/.well-known/agentport/jwks.json"
  }),
  endpointControlAttestation: {
    type: "agentport.endpoint_control_attestation.v0.1",
    version: "0.1",
    ref: "agentport-endpoint-control:test-runtime",
    status: "verified",
    subject: {
      kind: "endpoint",
      endpoint: publicVerificationEndpoint,
      endpointHost: "booking.proof-spa.example",
      verifiedDomain: "proof-spa.example"
    },
    verification: {
      verifiedBy: "agentport",
      method: "owner-domain-match",
      checkedAt: "2026-06-21T00:00:00.000Z",
      verifiedAt: "2026-06-21T00:00:00.000Z",
      expiresAt: "2026-06-28T00:00:00.000Z",
      reason: "verified_owner_domain"
    },
    claimBoundary: {
      endpointControlOnly: true,
      businessIdentity: false,
      actionCapability: false,
      userAuthority: false,
      backendOutcome: false,
      searchRanking: false
    }
  }
}), {
  signedAt: "2026-06-21T00:01:00.000Z"
});

let httpServer;
let endpoint;
let intentLifecycles;
let intentResults;

before(async () => {
  const adapters = [new ManualAdapter(), new FixtureAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));
  intentLifecycles = new InMemoryActionIntentLifecycleStore();
  intentResults = new InMemoryActionIntentResultSink();

  const agentPort = createAgentPortServer({
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DevAuth(),
    audit: new ConsoleAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    intentLifecycles,
    intentResults,
    ticketWallet: createDemoTicketWalletRegistry(),
    publicVerification: {
      bundle: publicVerificationBundle,
      jwks: {
        keys: [{
          ...publicVerificationSigner.publicJwk,
          kid: publicVerificationSigner.keyId,
          alg: "EdDSA",
          use: "sig"
        }]
      }
    }
  });

  httpServer = await agentPort.listen({ port: 0 });
  const address = httpServer.address();
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
});

after(async () => {
  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
});

describe("MCP HTTP boundary", () => {
  it("initializes and lists tools", async () => {
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" }
    });
    assert.equal(initialized.result.protocolVersion, "2025-06-18");
    assert.match(initialized.result.instructions, /ChatGPT App connector/);
    assert.match(initialized.result.instructions, /locate_agentport_wallet/);
    assert.match(initialized.result.instructions, /prepare_ticket_send/);
    assert.match(initialized.result.instructions, /software bug tickets/);

    const tools = await rpc("tools/list");
    assert.deepEqual(
      tools.result.tools.map((tool) => tool.name),
      ["assist", "find_services", "get_business_info", "get_business_feed", "get_readiness_report", "compile_action_intent", "get_action_intent_lifecycle", "poll_action_intent_lifecycles", "list_action_intent_result_deliveries", "get_action_intent_result_delivery", "ack_action_intent_result_delivery", "check_availability", "book_service", "cancel_service", "reschedule_service", "locate_agentport_wallet", "locate_wallet_tickets", "resolve_ticket", "verify_ticket", "get_ticket_status", "get_allowed_ticket_actions", "prepare_ticket_send", "send_ticket"]
    );
    const businessInfo = tools.result.tools.find((tool) => tool.name === "get_business_info");
    const businessFeed = tools.result.tools.find((tool) => tool.name === "get_business_feed");
    const readinessReport = tools.result.tools.find((tool) => tool.name === "get_readiness_report");
    assert.equal(businessInfo.inputSchema.properties.mode, undefined);
    assert.deepEqual(businessFeed.inputSchema.properties.mode.enum, ["compact", "full"]);
    assert.deepEqual(businessFeed.inputSchema.properties.intent.enum, ["answer", "book", "manage", "compare"]);
    assert.equal(businessFeed.inputSchema.properties.ifBusinessVersion.pattern, "^sha256:[a-f0-9]{64}$");
    assert.deepEqual(readinessReport.inputSchema.properties.targetTier.enum, ["listed", "answer-ready", "request-ready", "confirm-ready", "manage-ready", "pay-ready"]);
    assert.deepEqual(readinessReport.inputSchema.properties.protocolInputs.items.properties.kind.enum, ["mcp", "a2a", "ucp", "acp", "ap2", "rfc9421", "agentport-local"]);
    assert.deepEqual(readinessReport.inputSchema.properties.protocolInputs.items.properties.status.enum, ["configured", "missing", "unsupported"]);
    assert.ok(tools.result.tools.some((tool) => tool.name === "compile_action_intent"));
    assert.ok(tools.result.tools.some((tool) => tool.name === "poll_action_intent_lifecycles"));
	    const compileIntent = tools.result.tools.find((tool) => tool.name === "compile_action_intent");
	    assert.match(compileIntent.description, /create, book, request, send, cancel, reschedule, or manage/);
	    assert.deepEqual(compileIntent.inputSchema.properties.resultDelivery.properties.channel.enum, ["inbox", "webhook"]);
	    assert.equal(compileIntent._meta.ui.resourceUri, chatGptAppComponentUris.approval);
	    assert.equal(compileIntent._meta["openai/outputTemplate"], chatGptAppComponentUris.approval);
	    assert.equal(compileIntent._meta["openai/widgetAccessible"], true);
    const cancelService = tools.result.tools.find((tool) => tool.name === "cancel_service");
    const rescheduleService = tools.result.tools.find((tool) => tool.name === "reschedule_service");
    const bookService = tools.result.tools.find((tool) => tool.name === "book_service");
    const locateAgentPortWallet = tools.result.tools.find((tool) => tool.name === "locate_agentport_wallet");
    const locateWalletTickets = tools.result.tools.find((tool) => tool.name === "locate_wallet_tickets");
    const getTicketStatus = tools.result.tools.find((tool) => tool.name === "get_ticket_status");
	    const prepareTicketSend = tools.result.tools.find((tool) => tool.name === "prepare_ticket_send");
	    const sendTicket = tools.result.tools.find((tool) => tool.name === "send_ticket");
	    assert.equal(compileIntent.annotations.readOnlyHint, false);
	    assert.equal(compileIntent.annotations.destructiveHint, false);
	    assert.equal(bookService.annotations.readOnlyHint, false);
	    assert.equal(cancelService.annotations.destructiveHint, true);
	    assert.equal(locateAgentPortWallet.annotations.readOnlyHint, true);
	    assert.equal(locateWalletTickets.annotations.readOnlyHint, true);
	    assert.match(locateAgentPortWallet.description, /ticket and request summaries/);
	    assert.equal(locateAgentPortWallet.inputSchema.properties.includeRequests.type, "boolean");
	    assert.match(locateWalletTickets.description, /existing, previous, returned-session/);
	    assert.match(prepareTicketSend.description, /intentId and approvedActionIntentHash/);
	    assert.match(sendTicket.description, /prepare_ticket_send/);
	    assert.equal(bookService._meta.ui.resourceUri, chatGptAppComponentUris.receipt);
    assert.equal(cancelService._meta.ui.resourceUri, chatGptAppComponentUris.receipt);
    assert.equal(rescheduleService._meta.ui.resourceUri, chatGptAppComponentUris.receipt);
    assert.equal(locateWalletTickets._meta.ui.resourceUri, chatGptAppComponentUris.resume);
    assert.equal(getTicketStatus._meta.ui.resourceUri, chatGptAppComponentUris.status);
    assert.equal(prepareTicketSend._meta.ui.resourceUri, chatGptAppComponentUris.approval);
    assert.equal(prepareTicketSend._meta["openai/outputTemplate"], chatGptAppComponentUris.approval);
    assert.equal(prepareTicketSend._meta["openai/widgetAccessible"], true);
    assert.equal(sendTicket._meta.ui.resourceUri, chatGptAppComponentUris.receipt);
    assert.equal(cancelService.inputSchema.properties.intentId.type, "string");
    assert.equal(cancelService.inputSchema.properties.approvedActionIntentHash.type, "string");
    assert.equal(rescheduleService.inputSchema.properties.intentId.type, "string");
    assert.equal(rescheduleService.inputSchema.properties.approvedActionIntentHash.type, "string");
  });

  it("returns invalid params instead of an internal error for bad tool input", async () => {
    const response = await rpc("tools/call", {
      name: "find_services",
      arguments: {}
    });

    assert.equal(response.error.code, -32602);
    assert.equal(response.error.message, "service must be a non-empty string");
  });

  it("logs private dogfood MCP diagnostics without tool arguments", async () => {
    const previousDiagnostics = process.env.AGENTPORT_MCP_DIAGNOSTICS;
    const previousInfo = console.info;
    const lines = [];
    process.env.AGENTPORT_MCP_DIAGNOSTICS = "1";
    console.info = (line) => {
      lines.push(String(line));
    };

    try {
      const response = await rpc("tools/call", {
        name: "locate_agentport_wallet",
        arguments: {
          userClaim: "my private salon ticket AP-SECRET-9999",
          includeTickets: true
        }
      });
      assert.equal(response.error, undefined);
    } finally {
      console.info = previousInfo;
      if (previousDiagnostics === undefined) {
        delete process.env.AGENTPORT_MCP_DIAGNOSTICS;
      } else {
        process.env.AGENTPORT_MCP_DIAGNOSTICS = previousDiagnostics;
      }
    }

    const diagnostic = lines.map((line) => JSON.parse(line)).find((line) => line.type === "agentport_mcp_request");
    assert.equal(diagnostic.method, "tools/call");
    assert.equal(diagnostic.toolName, "locate_agentport_wallet");
    assert.equal(diagnostic.idType, "number");
    assert.equal("arguments" in diagnostic, false);
    assert.equal("params" in diagnostic, false);
    assert.equal(lines.join("\n").includes("AP-SECRET-9999"), false);
    assert.equal(lines.join("\n").includes("my private salon ticket"), false);
  });

  it("rejects invalid business feed modes as invalid params", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "sample-salon", mode: "verbose" }
    });

    assert.equal(response.error.code, -32602);
    assert.equal(response.error.message, "mode must be compact or full");
  });

  it("rejects invalid business feed intents as invalid params", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "sample-salon", intent: "pay" }
    });

    assert.equal(response.error.code, -32602);
    assert.equal(response.error.message, "intent must be answer, book, manage, or compare");
  });

  it("rejects invalid business feed cache versions as invalid params", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "sample-salon", ifBusinessVersion: "latest" }
    });

    assert.equal(response.error.code, -32602);
    assert.equal(response.error.message, "ifBusinessVersion must be a sha256 business version");
  });

  it("rejects invalid readiness report target tiers as invalid params", async () => {
    const response = await rpc("tools/call", {
      name: "get_readiness_report",
      arguments: { businessId: "sample-salon", targetTier: "premium-ready" }
    });

    assert.equal(response.error.code, -32602);
    assert.equal(response.error.message, "targetTier must be a readiness tier");
  });

  it("rejects invalid readiness protocol input states as invalid params", async () => {
    const response = await rpc("tools/call", {
      name: "get_readiness_report",
      arguments: {
        businessId: "sample-salon",
        protocolInputs: [{ kind: "ap2", status: "trusted" }]
      }
    });

    assert.equal(response.error.code, -32602);
    assert.equal(response.error.message, "protocolInputs[0].status must be configured, missing, or unsupported");
  });

  it("returns notModified for a matching business feed cache version over MCP", async () => {
    const first = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "sample-salon", intent: "book" }
    });
    const businessVersion = first.result.structuredContent.businessVersion;

    const second = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "sample-salon", intent: "book", ifBusinessVersion: businessVersion }
    });

    assert.equal(second.error, undefined);
    assert.equal(second.result.structuredContent.notModified, true);
    assert.equal(second.result.structuredContent.businessVersion, businessVersion);
    assert.equal("actionFeed" in second.result.structuredContent, false);
  });

  it("reads the runtime resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://runtime"));

    const resource = await rpc("resources/read", { uri: "agentport://runtime" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.deepEqual(payload.adapters, ["manual", "fixture"]);
    assert.deepEqual(payload.tools, ["assist", "find_services", "get_business_info", "get_business_feed", "get_readiness_report", "compile_action_intent", "get_action_intent_lifecycle", "poll_action_intent_lifecycles", "list_action_intent_result_deliveries", "get_action_intent_result_delivery", "ack_action_intent_result_delivery", "check_availability", "book_service", "cancel_service", "reschedule_service", "locate_agentport_wallet", "locate_wallet_tickets", "resolve_ticket", "verify_ticket", "get_ticket_status", "get_allowed_ticket_actions", "prepare_ticket_send", "send_ticket"]);
  });

  it("serves ChatGPT App component resources over MCP", async () => {
    const listed = await rpc("resources/list");
    for (const uri of Object.values(chatGptAppComponentUris)) {
      const listedResource = listed.result.resources.find((resource) => resource.uri === uri);
	      assert.equal(listedResource.mimeType, "text/html;profile=mcp-app");
      assert.ok(listedResource.title.startsWith("Pactway"));

      const resource = await rpc("resources/read", { uri });
      const content = resource.result.contents[0];
      assert.equal(content.uri, uri);
	      assert.equal(content.mimeType, "text/html;profile=mcp-app");
	      assert.match(content.text, /window\.openai/);
	      assert.match(content.text, /Pactway/);
	      assert.equal(content._meta.ui.prefersBorder, true);
	      assert.deepEqual(content._meta.ui.csp.connect_domains, [new URL(endpoint).origin]);
	      assert.deepEqual(content._meta["openai/widgetCSP"].connect_domains, [new URL(endpoint).origin]);
	      assert.equal(content._meta["openai/widgetPrefersBorder"], true);
      assert.ok(content._meta["openai/widgetDescription"].includes("Shows"));
    }
  });

  it("reads the general agent action model resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://action-model"));

    const resource = await rpc("resources/read", { uri: "agentport://action-model" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-action-model");
    assert.ok(payload.targetAgents.includes("claude"));
    assert.ok(payload.targetAgents.includes("chatgpt"));
    assert.ok(payload.targetAgents.includes("gemini"));
    assert.equal(payload.parties.length, 3);
    assert.ok(payload.safeCallSequence.includes("request_user_approval_for_exact_action"));
    assert.ok(payload.approvalCard.requiredDisplayFields.includes("business_name"));
    assert.ok(payload.clientAgentRules.some((rule) => rule.includes("Do not mint")));

    const commit = payload.actions.find((action) => action.tool === "book_service" && action.layer === "commit");
    assert.equal(commit.consentRequired, true);
    assert.equal(commit.stateChanging, true);
  });

  it("reads the commitment format resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://commitment-format"));

    const resource = await rpc("resources/read", { uri: "agentport://commitment-format" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-commitment-format");
    assert.equal(payload.resourceUri, "agentport://commitment-format");
    assert.equal(payload.boundary.systemOfRecord, "business_backend");
    assert.ok(payload.statusValues.includes("active"));
    assert.ok(payload.statusValues.includes("cancelled"));
    assert.ok(payload.rights.ownerActions.includes("reschedule"));
    assert.ok(payload.portableProof.requiredForExternalProof.includes("signature"));
    assert.ok(payload.retentionBoundary.neverKeep.includes("credentials"));
  });

  it("reads the plugin wallet contract resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://plugin-wallet"));

    const resource = await rpc("resources/read", { uri: "agentport://plugin-wallet" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-plugin-wallet");
    assert.equal(payload.resourceUri, "agentport://plugin-wallet");
    assert.equal(payload.localWalletRecord.encryption.referenceAlgorithm, "A256GCM");
    assert.ok(payload.localWalletRecord.encryptedPayload.includes("commitment"));
    assert.ok(payload.localWalletRecord.forbiddenRawFields.includes("chat_transcripts"));
    assert.ok(payload.relatedTools.includes("verify_ticket"));
    assert.ok(payload.relatedTools.includes("send_ticket"));
    assert.ok(payload.invariants.some((rule) => rule.includes("re-verify")));
  });

  it("reads the open standard resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://open-standard"));

    const resource = await rpc("resources/read", { uri: "agentport://open-standard" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-open-standard");
    assert.equal(payload.license, "Apache-2.0");
    assert.deepEqual(payload.toolClasses.publicRead.tools, ["find_services", "get_business_info", "get_business_feed", "get_readiness_report"]);
    assert.deepEqual(payload.toolClasses.stateChanging.tools, ["book_service", "cancel_service", "reschedule_service"]);
    assert.equal(payload.conformance.mustExposeResource, "agentport://open-standard");
    assert.ok(payload.resources.some((resource) => resource.uri === "agentport://commitment-format"));
    assert.ok(payload.requiredSemantics.includes("portable_commitments_require_backend_confirmation_refs_and_gateway_receipt_refs"));
    assert.ok(payload.requiredSemantics.includes("missing_consent_rejects_state_changing_actions"));
  });

  it("reads the client use policy resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://client-use-policy"));

    const resource = await rpc("resources/read", { uri: "agentport://client-use-policy" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-client-use-policy");
    assert.equal(payload.resourceUri, "agentport://client-use-policy");
    assert.equal(payload.decisionOrder[0].source, "agentport_verified_profile");
    assert.ok(payload.clientAgentRules.some((rule) => rule.includes("call AgentPort before browsing")));
    assert.ok(payload.browseAllowedWhen.some((rule) => rule.includes("external reviews")));
  });

  it("reads the discovery descriptor resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://discovery"));

    const resource = await rpc("resources/read", { uri: "agentport://discovery" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-discovery");
    assert.equal(payload.resourceUri, "agentport://discovery");
    assert.equal(payload.wellKnownPath, "/.well-known/agentport.json");
    assert.equal(payload.gateway.mcpPath, "/mcp");
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://open-standard"));
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://client-use-policy"));
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://commitment-format"));
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://plugin-wallet"));
    assert.ok(payload.tools.includes("get_business_feed"));
    assert.ok(payload.tools.includes("get_readiness_report"));
    assert.ok(payload.tools.includes("compile_action_intent"));
    assert.ok(payload.tools.includes("get_action_intent_lifecycle"));
    assert.ok(payload.tools.includes("poll_action_intent_lifecycles"));
    assert.ok(payload.tools.includes("verify_ticket"));
    assert.ok(payload.tools.includes("prepare_ticket_send"));
    assert.ok(payload.tools.includes("send_ticket"));
    assert.equal(payload.agentPath.preferredTool, "get_business_feed");
    assert.equal(payload.agentPath.preferredMode, "compact");
    assert.deepEqual(payload.agentPath.normal, ["read_discovery_descriptor", "call_get_business_feed_compact", "call_get_readiness_report_for_owner_or_pilot_context", "compile_action_intent_before_state_change", "answer_or_call_action_tool_if_needed"]);
    assert.equal(payload.businessHintPolicy.descriptorIsVerification, false);
    assert.equal(payload.trustDistribution.descriptorIsTrust, false);
    assert.equal(payload.trustDistribution.gatewayReceiptTrust.order[0], "apply_gateway_trust_root_emergency_denylist");
    assert.equal(
      payload.trustDistribution.issuerReadinessTrust.order[0],
      "apply_issuer_readiness_root_emergency_denylist"
    );
    assert.ok(payload.clientAgentRules.some((rule) => rule.includes("not as verification")));
    assert.ok(payload.clientAgentRules.some((rule) => rule.includes("agentport://commitment-format")));
    assert.ok(payload.clientAgentRules.some((rule) => rule.includes("agentport://plugin-wallet")));
  });

  it("serves the well-known discovery descriptor over HTTP", async () => {
    const wellKnownEndpoint = endpoint.replace("/mcp", "/.well-known/agentport.json");
    const response = await fetch(wellKnownEndpoint);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.protocol, "agentport-discovery");
    assert.equal(payload.wellKnownPath, "/.well-known/agentport.json");
    assert.equal(payload.gateway.mcpEndpoint, endpoint);
    assert.equal(payload.sourcePreference.policyResource, "agentport://client-use-policy");
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://open-standard"));
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://commitment-format"));
    assert.ok(payload.resources.some((entry) => entry.uri === "agentport://plugin-wallet"));
    assert.ok(payload.tools.includes("get_business_feed"));
    assert.ok(payload.tools.includes("get_readiness_report"));
    assert.ok(payload.tools.includes("compile_action_intent"));
    assert.ok(payload.tools.includes("get_action_intent_lifecycle"));
    assert.ok(payload.tools.includes("poll_action_intent_lifecycles"));
    assert.ok(payload.tools.includes("verify_ticket"));
    assert.ok(payload.tools.includes("prepare_ticket_send"));
    assert.ok(payload.tools.includes("send_ticket"));
    assert.equal(payload.agentPath.preferredMode, "compact");
    assert.equal(payload.businessHintPolicy.descriptorIsVerification, false);
    assert.equal(payload.trustDistribution.descriptorIsTrust, false);
    assert.ok(payload.trustDistribution.gatewayReceiptTrust.artifacts.emergencyDenyList.hostedEndpoint.startsWith("http://"));
  });

  it("serves a fetchable public verification bundle and JWKS from well-known routes", async () => {
    const discoveryResponse = await fetch(endpoint.replace("/mcp", "/.well-known/agentport.json"));
    assert.equal(discoveryResponse.status, 200);
    const discovery = await discoveryResponse.json();
    assert.equal(discovery.publicVerification.descriptorIsVerification, false);
    assert.equal(discovery.publicVerification.bundleProtocol, "agentport.public_verification_bundle.envelope.v0.1");
    assert.ok(discovery.publicVerification.bundleUrl.endsWith("/.well-known/agentport/verification-bundle.json"));
    assert.ok(discovery.publicVerification.jwksUrl.endsWith("/.well-known/agentport/jwks.json"));

    const [bundleResponse, jwksResponse] = await Promise.all([
      fetch(discovery.publicVerification.bundleUrl),
      fetch(discovery.publicVerification.jwksUrl)
    ]);
    assert.equal(bundleResponse.status, 200);
    assert.equal(jwksResponse.status, 200);
    const [bundle, jwks] = await Promise.all([bundleResponse.json(), jwksResponse.json()]);
    assert.equal(bundle.type, "agentport.public_verification_bundle.envelope.v0.1");
    assert.equal(jwks.keys[0].kid, "mcp-public-verification-key");
    assert.equal(jwks.keys[0].d, undefined);

    const report = verifyPublicVerificationBundle(bundle, {
      requireSignature: true,
      trustedIssuers: ["agentport"],
      publicKeys: Object.fromEntries(jwks.keys.map((key) => [key.kid, key])),
      now: () => new Date("2026-06-21T00:02:00.000Z")
    });
    assert.equal(report.ok, true);
    assert.equal(report.endpoint, publicVerificationEndpoint);
    assert.equal(report.endpointControlled, true);
    assert.equal(report.businessPortVerified, false);
    assert.deepEqual(report.capability, {
      tier: "none",
      canRequest: false,
      canConfirm: false
    });
    assert.equal(report.claimBoundary.backendOutcome, false);
    assert.equal(report.claimBoundary.searchRanking, false);
  });

  it("reads the compact protocol code registry resource", async () => {
    const listed = await rpc("resources/list");
    assert.ok(listed.result.resources.some((resource) => resource.uri === "agentport://protocol-codes"));

    const resource = await rpc("resources/read", { uri: "agentport://protocol-codes" });
    const payload = JSON.parse(resource.result.contents[0].text);
    assert.equal(payload.protocol, "agentport-protocol-codes");
    assert.deepEqual(payload.codeFamilies.verificationStatus, ["verified", "stale", "unverified"]);
    assert.ok(payload.codeFamilies.reason.delegation.includes("delegation_required"));
    assert.ok(payload.codeFamilies.presentation.artifact.includes("ownerProofRequest"));
    assert.ok(payload.wireShape.avoidByDefault.includes("full_chat_transcripts"));
  });

  it("returns the manual handoff over tools/call", async () => {
    const response = await rpc("tools/call", {
      name: "book_service",
      arguments: {
        businessId: "sample-salon",
        serviceId: "haircut",
        customer: { name: "Ada Lovelace" },
        requestedType: "request",
        userConsent: true
      }
    });

    assert.deepEqual(response.result.structuredContent, {
      type: "handoff",
      serviceId: "haircut",
      bookingUrl: "https://example.com/sample-salon/book",
      phone: "+1-617-555-0100",
      reason: "no_integration"
    });
  });

  it("rejects default state-changing tools without an approved intent over tools/call", async () => {
    const response = await rpc("tools/call", {
      name: "book_service",
      arguments: {
        businessId: "verified-spa",
        serviceId: "massage",
        customer: { name: "Ada Lovelace" },
        slotStart: FIXTURE_SLOTS[0].start,
        userConsent: true
      }
    });

    assert.equal(response.error, undefined);
    assert.deepEqual(response.result.structuredContent, {
      type: "rejected",
      reason: "intent_required"
    });
  });

  it("prepares existing-ticket delivery before MCP send_ticket execution", async () => {
    const evidence = {
      commitment: sampleTicketCommitment(),
      holderRef: "user_ticket_456"
    };
    const destination = {
      kind: "venue_verifier",
      target: "agentport://venue-verifier/mcp-smoke",
      label: "MCP smoke verifier"
    };

    const directSend = await rpc("tools/call", {
      name: "send_ticket",
      arguments: {
        ...evidence,
        destination,
        userConsent: true
      }
    });

    assert.equal(directSend.error, undefined);
    assert.equal(directSend.result.structuredContent.type, "rejected");
    assert.equal(directSend.result.structuredContent.reason, "intent_required");

    const prepared = await rpc("tools/call", {
      name: "prepare_ticket_send",
      arguments: {
        ...evidence,
        destination,
        agentSessionId: "mcp-ticket-send-session"
      }
    });

    assert.equal(prepared.error, undefined);
    assert.equal(prepared.result.structuredContent.type, "ticket_send_approval_package");
    assert.equal(prepared.result.structuredContent.actionIntent.action, "send_ticket");
    assert.equal(prepared.result.structuredContent.approval.backendMutation, false);
    assert.equal(typeof prepared.result.structuredContent.intentId, "string");
    assert.equal(typeof prepared.result.structuredContent.approval.approvedActionIntentHash, "string");
    assert.deepEqual(prepared.result.structuredContent.execute.arguments, {
      intentId: prepared.result.structuredContent.intentId,
      approvedActionIntentHash: prepared.result.structuredContent.approval.approvedActionIntentHash,
      destination
    });

    const lifecycle = await rpc("tools/call", {
      name: "get_action_intent_lifecycle",
      arguments: {
        intentId: prepared.result.structuredContent.intentId
      }
    });
    assert.equal(lifecycle.result.structuredContent.found, true);
    assert.equal(lifecycle.result.structuredContent.lifecycle.status, "approval_ready");
    assert.equal(lifecycle.result.structuredContent.lifecycle.actionIntent.action, "send_ticket");
  });

  it("lets a frontier-style client compile intent, inspect availability, and execute through MCP", async () => {
    const compiled = await rpc("tools/call", {
      name: "compile_action_intent",
      arguments: {
        goal: "book a massage at Verified Day Spa",
        agentSessionId: "frontier-session-1",
        lifespanMs: 60_000,
        resultDelivery: {
          channel: "inbox",
          target: "agentport://inbox/frontier-session-1"
        }
      }
    });

    assert.equal(compiled.error, undefined);
    assert.equal(compiled.result.structuredContent.outcome, "compiled");
    assert.deepEqual(compiled.result.structuredContent.actionIntent, {
      action: "book_service",
      businessId: "verified-spa",
      serviceId: "massage",
      bindingId: "fixture#0",
      requestedType: "confirmed",
      customerFields: ["name", "email", "phone"],
      consentText: ["book a massage at Verified Day Spa"],
      expiresAt: compiled.result.structuredContent.expiresAt
    });
    assert.equal(compiled.result.structuredContent.approval.status, "needs_required_input");
    assert.equal(compiled.result.structuredContent.lifecycle.agentSessionId, "frontier-session-1");
    assert.equal(compiled.result.structuredContent.lifecycle.status, "needs_required_input");
    assert.equal(compiled.result.structuredContent.lifecycle.nextStep, "resolve_required_input");
    assert.deepEqual(compiled.result.structuredContent.next.resolve[0], {
      purpose: "resolve_required_action_input",
      input: "slotStart",
      tool: "check_availability",
      resultPath: "slots[].start",
      arguments: {
        businessId: "verified-spa",
        serviceId: "massage",
        bindingId: "fixture#0"
      }
    });
    assert.equal(compiled.result.structuredContent.approval.approvalCard, undefined);
    assert.equal(compiled.result.structuredContent.approvalPackage.status, "needs_required_input");
    assert.equal(compiled.result.structuredContent.approvalPackage.execute, undefined);
    assert.deepEqual(compiled.result.structuredContent.approvalPackage.resultDelivery, {
      channel: "inbox",
      target: "agentport://inbox/frontier-session-1"
    });
    assert.deepEqual(compiled.result.structuredContent.approvalPackage.resolve, compiled.result.structuredContent.next.resolve);
    assert.equal(compiled.result.structuredContent.approvalPackage.lifecycle.poll.arguments.agentSessionId, "frontier-session-1");

    const intent = compiled.result.structuredContent.actionIntent;
    const availability = await rpc("tools/call", {
      name: "check_availability",
      arguments: {
        businessId: intent.businessId,
        serviceId: intent.serviceId
      }
    });

    assert.equal(availability.error, undefined);
    assert.equal(availability.result.structuredContent.supported, true);

    const slotBound = await rpc("tools/call", {
      name: "compile_action_intent",
      arguments: {
        goal: "book a massage at Verified Day Spa",
        intentId: compiled.result.structuredContent.lifecycle.intentId,
        agentSessionId: "frontier-session-1",
        slotStart: availability.result.structuredContent.slots[0].start,
        agentName: "Frontier Test Host",
        lifespanMs: 60_000,
        resultDelivery: {
          channel: "inbox",
          target: "agentport://inbox/frontier-session-1"
        }
      }
    });

    assert.equal(slotBound.error, undefined);
    assert.equal(slotBound.result.structuredContent.approval.status, "ready");
    assert.equal(slotBound.result.structuredContent.lifecycle.intentId, compiled.result.structuredContent.lifecycle.intentId);
    assert.equal(slotBound.result.structuredContent.lifecycle.agentSessionId, "frontier-session-1");
    assert.equal(slotBound.result.structuredContent.lifecycle.status, "approval_ready");
    assert.deepEqual(slotBound.result.structuredContent.lifecycle.resolvedInputs, {
      slotStart: FIXTURE_SLOTS[0].start
    });
    assert.equal(slotBound.result.structuredContent.approvalPackage.status, "ready");
    assert.equal(slotBound.result.structuredContent.approvalPackage.intentId, compiled.result.structuredContent.lifecycle.intentId);
    assert.equal(slotBound.result.structuredContent.approvalPackage.approvedActionIntentHash, slotBound.result.structuredContent.approval.approvalCard.actionIntentHash);
    assert.deepEqual(slotBound.result.structuredContent.approvalPackage.execute.arguments, {
      businessId: "verified-spa",
      serviceId: "massage",
      bindingId: "fixture#0",
      requestedType: "confirmed",
      slotStart: FIXTURE_SLOTS[0].start,
      intentId: compiled.result.structuredContent.lifecycle.intentId,
      approvedActionIntentHash: slotBound.result.structuredContent.approval.approvalCard.actionIntentHash
    });
    assert.equal(slotBound.result.structuredContent.approval.approvalCard.fields.agent_name, "Frontier Test Host");
    assert.equal(slotBound.result.structuredContent.approval.approvalCard.fields.requested_time_or_slot, FIXTURE_SLOTS[0].start);

    const resumed = await rpc("tools/call", {
      name: "get_action_intent_lifecycle",
      arguments: {
        intentId: compiled.result.structuredContent.lifecycle.intentId
      }
    });

    assert.equal(resumed.error, undefined);
    assert.equal(resumed.result.structuredContent.found, true);
    assert.equal(resumed.result.structuredContent.lifecycle.status, "approval_ready");
    assert.deepEqual(resumed.result.structuredContent.lifecycle.resolvedInputs, {
      slotStart: FIXTURE_SLOTS[0].start
    });

    const polled = await rpc("tools/call", {
      name: "poll_action_intent_lifecycles",
      arguments: {
        agentSessionId: "frontier-session-1",
        after: 0
      }
    });

    assert.equal(polled.error, undefined);
    assert.deepEqual(polled.result.structuredContent.events.map((event) => event.status), ["needs_required_input", "approval_ready"]);
    assert.equal(polled.result.structuredContent.cursor, polled.result.structuredContent.events[1].cursor);

    const incremental = await rpc("tools/call", {
      name: "poll_action_intent_lifecycles",
      arguments: {
        agentSessionId: "frontier-session-1",
        after: polled.result.structuredContent.events[0].cursor
      }
    });

    assert.equal(incremental.error, undefined);
    assert.deepEqual(incremental.result.structuredContent.events.map((event) => event.status), ["approval_ready"]);

    const booking = await rpc("tools/call", {
      name: "book_service",
      arguments: {
        ...slotBound.result.structuredContent.approvalPackage.execute.arguments,
        customer: { name: "Ada Lovelace" },
        userConsent: true
      }
    });

    assert.equal(booking.error, undefined);
    assert.deepEqual(availability.result.structuredContent.slots, FIXTURE_SLOTS);
    assert.equal(booking.result.structuredContent.type, "confirmed");
    assert.equal(booking.result.structuredContent.confirmationId, "fixture-massage-0001");

    const terminal = await rpc("tools/call", {
      name: "get_action_intent_lifecycle",
      arguments: {
        intentId: slotBound.result.structuredContent.lifecycle.intentId
      }
    });

    assert.equal(terminal.result.structuredContent.lifecycle.status, "succeeded");
    assert.equal(terminal.result.structuredContent.lifecycle.execution.resultType, "confirmed");
    assert.equal(terminal.result.structuredContent.lifecycle.execution.confirmationId, "fixture-massage-0001");
    assert.equal(terminal.result.structuredContent.lifecycle.resultDeliveryState.status, "delivered");
    assert.equal(terminal.result.structuredContent.lifecycle.resultDeliveryState.payloadHash.length, 64);

    const deliveries = await rpc("tools/call", {
      name: "list_action_intent_result_deliveries",
      arguments: {
        agentSessionId: "frontier-session-1",
        after: 0
      }
    });

    assert.equal(deliveries.error, undefined);
    assert.equal(deliveries.result.structuredContent.deliveries.length, 1);
    assert.equal(deliveries.result.structuredContent.deliveries[0].status, "delivered");
    assert.equal(deliveries.result.structuredContent.deliveries[0].result.resultType, "confirmed");
    assert.equal(deliveries.result.structuredContent.deliveries[0].result.confirmationId, "fixture-massage-0001");
    assert.equal(deliveries.result.structuredContent.deliveries[0].payloadHash.length, 64);

    const deliveryId = deliveries.result.structuredContent.deliveries[0].deliveryId;
    const delivery = await rpc("tools/call", {
      name: "get_action_intent_result_delivery",
      arguments: { deliveryId }
    }, { "x-agentport-agent-session-id": "frontier-session-1" });

    assert.equal(delivery.error, undefined);
    assert.equal(delivery.result.structuredContent.found, true);
    assert.equal(delivery.result.structuredContent.delivery.deliveryId, deliveryId);

    const mismatchDelivery = await rpc("tools/call", {
      name: "get_action_intent_result_delivery",
      arguments: { deliveryId }
    }, { "x-agentport-agent-session-id": "other-session" });

    assert.equal(mismatchDelivery.result.structuredContent.found, false);
    assert.equal(mismatchDelivery.result.structuredContent.reason, "agent_session_mismatch");

    const acknowledged = await rpc("tools/call", {
      name: "ack_action_intent_result_delivery",
      arguments: { deliveryId }
    }, { "x-agentport-agent-session-id": "frontier-session-1" });

    assert.equal(acknowledged.error, undefined);
    assert.equal(acknowledged.result.structuredContent.acknowledged, true);
    assert.equal(acknowledged.result.structuredContent.delivery.status, "acknowledged");

    const acknowledgedLifecycle = await rpc("tools/call", {
      name: "get_action_intent_lifecycle",
      arguments: {
        intentId: slotBound.result.structuredContent.lifecycle.intentId
      }
    });

    assert.equal(acknowledgedLifecycle.result.structuredContent.lifecycle.resultDeliveryState.status, "acknowledged");
    assert.equal(acknowledgedLifecycle.result.structuredContent.lifecycle.resultDeliveryState.deliveryId, deliveryId);
  });

  it("scopes lifecycle reads and polls by agent session header", async () => {
    const compiled = await rpc("tools/call", {
      name: "compile_action_intent",
      arguments: {
        goal: "book a massage at Verified Day Spa",
        agentSessionId: "scoped-session",
        lifespanMs: 60_000
      }
    }, { "x-agentport-agent-session-id": "scoped-session" });

    const mismatchRead = await rpc("tools/call", {
      name: "get_action_intent_lifecycle",
      arguments: {
        intentId: compiled.result.structuredContent.lifecycle.intentId
      }
    }, { "x-agentport-agent-session-id": "other-session" });

    assert.equal(mismatchRead.error, undefined);
    assert.equal(mismatchRead.result.structuredContent.found, false);
    assert.equal(mismatchRead.result.structuredContent.reason, "agent_session_mismatch");

    const mismatchPoll = await rpc("tools/call", {
      name: "poll_action_intent_lifecycles",
      arguments: {
        agentSessionId: "scoped-session",
        after: 0
      }
    }, { "x-agentport-agent-session-id": "other-session" });

    assert.equal(mismatchPoll.error.code, -32602);
    assert.equal(mismatchPoll.error.message, "agentSessionId does not match caller session");

    const scopedPoll = await rpc("tools/call", {
      name: "poll_action_intent_lifecycles",
      arguments: {
        after: 0,
        waitMs: 1
      }
    }, { "x-agentport-agent-session-id": "scoped-session" });

    assert.deepEqual(scopedPoll.result.structuredContent.events.map((event) => event.agentSessionId), ["scoped-session"]);
  });

  it("returns a unified AgentPort wallet with ticket and request summaries", async () => {
    await intentLifecycles.save({
      intentId: "wallet-request-1",
      agentSessionId: "wallet-session",
      goal: "request a haircut at Sample Salon",
      status: "succeeded",
      actionIntent: {
        action: "book_service",
        businessId: "sample-salon",
        serviceId: "haircut",
        bindingId: "manual#0",
        requestedType: "request",
        customerFields: ["name"],
        consentText: ["request a haircut at Sample Salon"],
        expiresAt: "2026-06-27T12:10:00.000Z"
      },
      createdAt: "2026-06-27T12:00:00.000Z",
      updatedAt: "2026-06-27T12:02:00.000Z",
      expiresAt: "2026-06-27T12:10:00.000Z",
      requiredInputs: [],
      resolvedInputs: {},
      attempts: [],
      execution: {
        resultType: "request"
      },
      businessRequest: {
        requestId: "req_wallet_1",
        resultType: "request",
        source: "book_service",
        requestedBy: "http-mcp-test",
        submittedAt: "2026-06-27T12:01:00.000Z",
        businessStatus: "accepted_for_review",
        businessStatusAt: "2026-06-27T12:02:00.000Z",
        businessStatusBy: "front-desk",
        businessStatusNote: "We will confirm shortly.",
        businessStatusEvents: [
          {
            status: "submitted",
            at: "2026-06-27T12:01:00.000Z",
            by: "agentport-gateway",
            note: "Request delivered to business inbox."
          },
          {
            status: "accepted_for_review",
            at: "2026-06-27T12:02:00.000Z",
            by: "front-desk",
            note: "We will confirm shortly."
          }
        ],
        backendMutation: false,
        agentPortSystemOfRecord: false,
        backendSystemOfRecord: false,
        customer: {
          name: "Ada Lovelace"
        }
      },
      nextStep: "terminal"
    });

    const wallet = await rpc("tools/call", {
      name: "locate_agentport_wallet",
      arguments: {
        agentSessionId: "wallet-session",
        userClaim: "What happened to my salon ticket?",
        limit: 5
      }
    }, { "x-agentport-agent-session-id": "wallet-session" });

    assert.equal(wallet.error, undefined);
    const result = wallet.result.structuredContent;
    assert.equal(result.type, "agentport_wallet");
    assert.equal(result.counts.requests, 1);
    assert.ok(result.counts.tickets >= 1);
    assert.equal(result.boundaries.localWalletIsLifecycleAuthority, false);
    assert.equal(result.boundaries.gatewayIsLifecycleAuthority, true);
    assert.equal(result.boundaries.ticketEvidenceHiddenByDefault, true);

    const request = result.requests.find((item) => item.intentId === "wallet-request-1");
    assert.equal(request.requestId, "req_wallet_1");
    assert.equal(request.businessStatus, "accepted_for_review");
    assert.equal(request.businessStatusLabel, "Accepted for review");
    assert.deepEqual(request.businessStatusEvents.map((event) => event.status), ["submitted", "accepted_for_review"]);
    assert.equal(request.backendMutation, false);
    assert.equal(request.agentPortSystemOfRecord, false);
    assert.equal("approval" in request, false);
    assert.equal("approvedActionIntentHash" in request, false);

    const ticket = result.tickets.find((item) => item.businessName === "Verified Day Spa");
    assert.notEqual(ticket, undefined);
    assert.equal(ticket.itemType, "ticket");
    assert.equal(ticket.backendMutation, false);
    assert.equal(ticket.agentPortSystemOfRecord, false);
    assert.equal("evidence" in ticket, false);
    assert.equal(ticket.businessName, "Verified Day Spa");
    assert.equal(ticket.businessLocation, "456 Wellness Ave, Newton, MA");
    assert.equal(ticket.serviceName, "Swedish Massage");
    assert.equal(ticket.scheduledFor, "2026-06-28T14:30:00.000-04:00");
    assert.equal(ticket.scheduledForSource, "ticket_record");
    assert.equal(ticket.ticketIdentity.summaryLine, "AP-DEMO-1234: Swedish Massage at Verified Day Spa is active");
    assert.equal(ticket.ticketIdentity.claimSafety.requiresExactIdentityMatch, true);
    assert.match(ticket.ticketIdentity.claimSafety.ifUserClaimDiffers, /do_not_relabel_ticket/);
    assert.equal(ticket.claimMatch.status, "mismatch");
    assert.deepEqual(ticket.claimMatch.conflictingTerms, ["salon"]);
    assert.equal(ticket.claimMatch.safeNextAction, "ask_clarifying_question_before_routing_or_sending_proof");
    assert.match(ticket.claimMatch.clarificationLine, /Swedish Massage at Verified Day Spa/);

    const locatedTickets = await rpc("tools/call", {
      name: "locate_wallet_tickets",
      arguments: {
        userClaim: "Check AP-DEMO-1234"
      }
    });
    const locatedTicket = locatedTickets.result.structuredContent.tickets[0];
    assert.equal(locatedTicket.claimMatch.status, "exact_match");
    assert.deepEqual(locatedTicket.claimMatch.matchedFields, ["reference"]);
    assert.equal(locatedTicket.userTicketCard.storeLine, "Store: Verified Day Spa (456 Wellness Ave, Newton, MA)");
    assert.equal(locatedTicket.userTicketCard.serviceLine, "Service: Swedish Massage");
    assert.equal(locatedTicket.userTicketCard.timeLine, "Time: 2026-06-28T14:30:00.000-04:00");
    assert.equal(locatedTicket.userTicketCard.referenceLine, "Reference: AP-DEMO-1234; confirmation fixture-massage-smoke-0001");
    assert.equal(locatedTicket.ticketIdentity.references.confirmationId, "fixture-massage-smoke-0001");

    const limitedWallet = await rpc("tools/call", {
      name: "locate_agentport_wallet",
      arguments: {
        agentSessionId: "wallet-session",
        limit: 1
      }
    }, { "x-agentport-agent-session-id": "wallet-session" });

    assert.equal(limitedWallet.error, undefined);
    assert.equal(limitedWallet.result.structuredContent.items.length, 1);
    assert.ok(limitedWallet.result.structuredContent.tickets.length <= 1);
    assert.ok(limitedWallet.result.structuredContent.requests.length <= 1);
  });

  it("returns a manual manage handoff over tools/call", async () => {
    const response = await rpc("tools/call", {
      name: "cancel_service",
      arguments: {
        businessId: "sample-salon",
        serviceId: "haircut",
        confirmationId: "manual-ref-001",
        userConsent: true
      }
    });

    assert.deepEqual(response.result.structuredContent, {
      type: "rejected",
      reason: "intent_required"
    });
  });

  it("binds wallet lookup to trusted host wallet identity when configured", async () => {
    const walletServer = await listenHostWalletServer(["wallet:chatgpt-demo"]);
    const walletEndpoint = endpointForServer(walletServer);

    try {
      const authorized = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-wallet-token": "wallet-token"
      });

      assert.equal(authorized.error, undefined);
      assert.equal(authorized.result.structuredContent.walletRef, "wallet:chatgpt-demo");
      assert.equal(authorized.result.structuredContent.boundaries.hostWalletAuthority, "host_wallet_identity");
      assert.equal(authorized.result.structuredContent.counts.tickets, 1);

      const mismatchedWallet = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_wallet_tickets",
        arguments: {
          walletRef: "wallet:other-user",
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-wallet-token": "wallet-token"
      });

      assert.equal(mismatchedWallet.error.code, -32602);
      assert.equal(mismatchedWallet.error.message, "host_wallet_scope_denied");

      const missingAuthority = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {}
      });

      assert.equal(missingAuthority.error.code, -32602);
      assert.equal(missingAuthority.error.message, "host_wallet_token_required");
    } finally {
      await closeServer(walletServer);
    }
  });

  it("does not fall back to the demo wallet for another authorized wallet namespace", async () => {
    const walletServer = await listenHostWalletServer(["wallet:alice"]);
    const walletEndpoint = endpointForServer(walletServer);

    try {
      const response = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-wallet-token": "wallet-token"
      });

      assert.equal(response.error, undefined);
      assert.equal(response.result.structuredContent.walletRef, "wallet:alice");
      assert.equal(response.result.structuredContent.counts.tickets, 0);
      assert.deepEqual(response.result.structuredContent.tickets, []);
    } finally {
      await closeServer(walletServer);
    }
  });

  it("binds wallet lookup to a human account session across different agent sessions", async () => {
    const walletServer = await listenAccountSessionWalletServer();
    const walletEndpoint = endpointForServer(walletServer);

    try {
      const aliceFromChatGpt = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-account-session-proof": "alice-account-session-proof",
        "x-agentport-agent-session-id": "chatgpt-agent-session"
      });

      assert.equal(aliceFromChatGpt.error, undefined);
      assert.equal(aliceFromChatGpt.result.structuredContent.walletRef, "wallet:chatgpt-demo");
      assert.equal(aliceFromChatGpt.result.structuredContent.boundaries.hostWalletAuthority, "host_wallet_identity");
      assert.equal(aliceFromChatGpt.result.structuredContent.boundaries.hostWalletAccountBound, true);
      assert.equal(aliceFromChatGpt.result.structuredContent.counts.tickets, 1);

      const aliceFromClaude = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-account-session-proof": "alice-account-session-proof",
        "x-agentport-agent-session-id": "claude-agent-session"
      });

      assert.equal(aliceFromClaude.error, undefined);
      assert.equal(aliceFromClaude.result.structuredContent.walletRef, "wallet:chatgpt-demo");
      assert.equal(aliceFromClaude.result.structuredContent.boundaries.hostWalletAccountBound, true);
      assert.equal(aliceFromClaude.result.structuredContent.counts.tickets, 1);

      const bobWallet = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-account-session-proof": "bob-account-session-proof",
        "x-agentport-agent-session-id": "chatgpt-agent-session"
      });

      assert.equal(bobWallet.error, undefined);
      assert.equal(bobWallet.result.structuredContent.walletRef, "wallet:bob-account");
      assert.equal(bobWallet.result.structuredContent.boundaries.hostWalletAccountBound, true);
      assert.equal(bobWallet.result.structuredContent.counts.tickets, 0);

      const bobReadsAlice = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_wallet_tickets",
        arguments: {
          walletRef: "wallet:chatgpt-demo",
          userClaim: "Check my massage ticket"
        }
      }, {
        "x-agentport-account-session-proof": "bob-account-session-proof"
      });

      assert.equal(bobReadsAlice.error.code, -32602);
      assert.equal(bobReadsAlice.error.message, "host_wallet_scope_denied");

      const missingAccountSession = await rpcAt(walletEndpoint, "tools/call", {
        name: "locate_agentport_wallet",
        arguments: {}
      });

      assert.equal(missingAccountSession.error.code, -32602);
      assert.equal(missingAccountSession.error.message, "account_session_required");
    } finally {
      await closeServer(walletServer);
    }
  });

  it("returns a signed commitment in MCP structuredContent when receipt proof is configured", async () => {
    const adapters = [new FixtureAdapter()];
    const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
    const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));
    const signedAgentPort = createAgentPortServer({
      adapters,
      tenants,
      truth: new LocalTruthStore(tenants, adapterMap),
      auth: new DelegationAuth(),
      audit: new ConsoleAuditSink(),
      analytics: new NoopAnalytics(),
      leads: new NoopLeadSink(),
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      },
      delegation: {
        layers: {
          commit: { requireApprovedIntent: false }
        }
      }
    });
    const signedServer = await signedAgentPort.listen({ port: 0 });
    const address = signedServer.address();
    const signedEndpoint = `http://127.0.0.1:${address.port}/mcp`;

    try {
      const response = await rpcAt(signedEndpoint, "tools/call", {
        name: "book_service",
        arguments: {
          businessId: "verified-spa",
          serviceId: "massage",
          customer: { name: "Ada Lovelace" },
          userConsent: true,
          slotStart: FIXTURE_SLOTS[0].start
        }
      });

      const result = response.result.structuredContent;
      assert.equal(result.type, "confirmed");
      assert.equal(result.receipt.resultType, "confirmed");
      assert.equal(result.commitment.protocol, "agentport-commitment");
      assert.equal(result.commitment.status, "active");
      assert.equal(result.commitment.backend.systemOfRecord, true);
      assert.equal(result.commitment.backend.confirmationId, result.confirmationId);
      assert.equal(result.commitment.receipts[0].receiptId, result.receipt.receiptId);
      assert.equal(result.commitment.receipts[0].payloadHash, result.receipt.payloadHash);
      assert.equal(result.commitment.receipts[0].signature, result.receipt.signature);
    } finally {
      await new Promise((resolveClose, rejectClose) => {
        signedServer.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  });

  it("enforces a configured business-port trust root over MCP tools/call", async () => {
    const unsignedServer = await listenTrustRootServer([validBusinessPortAttestation()]);
    const unsignedEndpoint = endpointForServer(unsignedServer);

    try {
      const rejected = await rpcAt(unsignedEndpoint, "tools/call", {
        name: "book_service",
        arguments: {
          businessId: "verified-spa",
          serviceId: "massage",
          customer: { name: "Ada Lovelace" },
          userConsent: true,
          slotStart: FIXTURE_SLOTS[0].start
        }
      });

      const result = rejected.result.structuredContent;
      assert.equal(result.type, "rejected");
      assert.equal(result.reason, "business_port_signature_required");
      assert.equal(result.receipt.resultType, "rejected");
      assert.equal(result.receipt.resultReason, "business_port_signature_required");
      assert.equal(result.receipt.businessPortRef, "agentport-business-port:verified-spa:fixture#0");
    } finally {
      await closeServer(unsignedServer);
    }

    const signedServer = await listenTrustRootServer([signedBusinessPortAttestation()]);
    const signedEndpoint = endpointForServer(signedServer);

    try {
      const confirmed = await rpcAt(signedEndpoint, "tools/call", {
        name: "book_service",
        arguments: {
          businessId: "verified-spa",
          serviceId: "massage",
          customer: { name: "Ada Lovelace" },
          userConsent: true,
          slotStart: FIXTURE_SLOTS[0].start
        }
      });

      const result = confirmed.result.structuredContent;
      assert.equal(result.type, "confirmed");
      assert.equal(result.receipt.businessPortRef, "agentport-business-port:verified-spa:fixture#0");
      assert.equal(result.receipt.businessPortStatus, "verified");
      assert.equal(result.receipt.businessPortVerifiedBy, "agentport");
    } finally {
      await closeServer(signedServer);
    }
  });
});

async function listenHostWalletServer(walletIds) {
  const adapters = [new FixtureAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));
  const agentPort = createAgentPortServer({
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DevAuth(),
    audit: new ConsoleAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    ticketWallet: createDemoTicketWalletRegistry(),
    hostWalletIdentity: new StaticHostWalletIdentityProvider({
      token: "wallet-token",
      principalId: "plugin_host:test-wallet",
      walletIds
    })
  });

  return agentPort.listen({ port: 0 });
}

async function listenAccountSessionWalletServer() {
  const adapters = [new FixtureAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));
  const agentPort = createAgentPortServer({
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DevAuth(),
    audit: new ConsoleAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    ticketWallet: createDemoTicketWalletRegistry(),
    hostWalletIdentity: new StaticAccountSessionHostWalletIdentityProvider({
      accounts: [
        {
          accountId: "alice-account",
          sessionProof: "alice-account-session-proof",
          walletIds: ["wallet:chatgpt-demo"]
        },
        {
          accountId: "bob-account",
          sessionProof: "bob-account-session-proof"
        }
      ]
    })
  });

  return agentPort.listen({ port: 0 });
}

async function listenTrustRootServer(attestations) {
  const adapters = [new FixtureAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));
  const agentPort = createAgentPortServer({
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DelegationAuth(),
    audit: new ConsoleAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    delegation: {
      layers: {
        commit: { requireApprovedIntent: false }
      }
    },
    businessPorts: {
      requireForStateChanging: true,
      provider: new TrustAnchoredBusinessPortAttestationProvider({
        store: new StaticBusinessPortAttestationStore(attestations),
        trustRoot: businessPortTrustRoot(),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      })
    },
    receipts: {
      signer: new MemoryReceiptSigner("agentport:test-gateway"),
      now: () => new Date("2026-06-19T00:00:00.000Z")
    }
  });

  return agentPort.listen({ port: 0 });
}

function endpointForServer(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}/mcp`;
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

function validBusinessPortAttestation(overrides = {}) {
  return {
    ref: "agentport-business-port:verified-spa:fixture#0",
    businessId: "verified-spa",
    portId: "verified-spa-fixture-port",
    status: "verified",
    bindingId: "fixture#0",
    platform: "fixture",
    verifiedBy: "agentport",
    verifiedAt: "2026-06-19T00:00:00.000Z",
    method: "fixture-test",
    ...overrides
  };
}

function signedBusinessPortAttestation(overrides = {}) {
  return businessPortSigner.sign(validBusinessPortAttestation(overrides), {
    signedAt: "2026-06-19T00:00:00.000Z"
  });
}

function businessPortTrustRoot() {
  return {
    trustedIssuers: ["agentport"],
    publicKeys: {
      "mcp-business-port-key": businessPortSigningKeys.publicKey
    },
    keyStatuses: {
      "mcp-business-port-key": "active"
    }
  };
}

function sampleTicketCommitment() {
  return {
    protocol: "agentport-commitment",
    version: "0.1",
    commitmentId: "commitment_mcp_ticket_send_1234567890",
    status: "active",
    subject: {
      holderRef: "user_ticket_456",
      clientAgentId: "mcp_boundary_test"
    },
    business: {
      businessId: "verified-spa",
      serviceId: "massage",
      bindingId: "fixture#0"
    },
    backend: {
      source: "fixture",
      confirmationId: "fixture-mcp-ticket-send-0001",
      systemOfRecord: true
    },
    authority: {
      assurance: "signed",
      evidenceRefs: ["agentport-local-delegation:issuer_test:del_mcp_ticket"],
      delegationId: "del_mcp_ticket",
      consentId: "consent_mcp_ticket"
    },
    rights: {
      allowedActions: ["verify", "send_ticket"],
      transferable: false,
      modificationRequiresConsent: true,
      cancellationRequiresConsent: true
    },
    recoveryPolicy: {
      mode: "agentport_handoff",
      fallbackAction: "handoff"
    },
    events: [{
      eventId: "event_mcp_ticket",
      type: "created",
      at: "2026-06-26T12:00:00.000Z",
      actor: "business_gateway",
      receiptId: "receipt_mcp_ticket",
      backendConfirmationId: "fixture-mcp-ticket-send-0001"
    }],
    receipts: [{
      receiptId: "receipt_mcp_ticket",
      action: "book_service",
      resultType: "confirmed",
      payloadHash: "c".repeat(64),
      keyId: "gateway-key-mcp",
      signature: "sig_mcp_ticket"
    }]
  };
}

let nextId = 1;

async function rpc(method, params, headers = {}) {
  return rpcAt(endpoint, method, params, headers);
}

async function rpcAt(targetEndpoint, method, params, headers = {}) {
  const response = await fetch(targetEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      ...(params === undefined ? {} : { params })
    })
  });

  assert.equal(response.status, 200);
  return response.json();
}

class DelegationAuth {
  async authorize() {
    return {
      scopes: ["find", "availability", "book", "cancel"],
      delegation: {
        delegationId: "del_mcp_123",
        issuer: "issuer_test",
        userSubject: "user_mcp_456",
        agentId: "agent_mcp_789",
        consentId: "consent_mcp_abc",
        scopes: ["book"],
        approvedActions: ["book_service"],
        businessId: "verified-spa",
        serviceId: "massage",
        audience: "agentport:test",
        challengeId: "challenge_mcp_123",
        tokenConfirmation: {
          method: "dpop",
          keyId: "key_mcp_123",
          jwkThumbprint: "jkt_mcp_123"
        },
        expiresAt: "2026-07-20T00:00:00.000Z",
        issuedAt: "2026-06-19T00:00:00.000Z",
        assurance: "test"
      }
    };
  }

  requireConsent(req) {
    return req.userConsent !== true;
  }
}

class MemoryReceiptSigner {
  constructor(issuer) {
    this.issuer = issuer;
  }

  async sign(input) {
    return {
      issuer: this.issuer,
      signature: `sig:${input.payloadHash}`,
      keyId: "gateway-key-1"
    };
  }
}
