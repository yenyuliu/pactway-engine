import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { DevAuth, LocalTruthStore, NoopAnalytics, NoopLeadSink } from "../../dist/core/index.js";
import { FixtureAdapter } from "../../dist/adapters/fixture/index.js";
import { ManualAdapter } from "../../dist/adapters/manual/index.js";
import { createAgentPortServer, getBusinessFeed, getBusinessInfo, getReadinessReport } from "../../dist/server/index.js";

const profile = {
  hours: [
    { day: "mon", open: "09:00", close: "17:00" },
    { day: "sun", closed: true }
  ],
  policies: [{ label: "Cancellation", detail: "24 hours notice required" }],
  faq: [{ q: "Do you take walk-ins?", a: "No, appointments only." }]
};

const verifiedTenant = {
  id: "verified-profile-spa",
  name: "Verified Profile Spa",
  address: "10 Harbor Way",
  verification: {
    status: "verified",
    verifiedBy: "operator@example.com",
    verifiedAt: "2026-06-18T12:00:00.000Z",
    method: "manual-site-admin"
  },
  profile,
  bindings: [{
    platform: "fixture",
    staticServices: [{ id: "massage", name: "Massage" }]
  }]
};

const noProfileTenant = {
  id: "no-profile-salon",
  name: "No Profile Salon",
  bindings: [{
    platform: "manual",
    staticServices: [{ id: "haircut", name: "Haircut" }]
  }]
};

let httpServer;
let endpoint;

const tenants = tenantStore([verifiedTenant, noProfileTenant]);
const adapters = [new FixtureAdapter(), new ManualAdapter()];
const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));

before(async () => {
  const agentPort = createAgentPortServer({
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DevAuth(),
    audit: { async record() {} },
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink()
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

describe("business info", () => {
  it("returns verified profile data and per-service tags", async () => {
    const result = await getBusinessInfo(runtime(), { businessId: "verified-profile-spa" });

    assert.equal(result.found, true);
    assert.equal(result.businessId, "verified-profile-spa");
    assert.deepEqual(result.verification, verifiedTenant.verification);
    assert.deepEqual(result.profile, profile);
    assert.deepEqual(result.services[0].tag, { verified: true, tier: "confirm" });
    assert.equal(result.services[0].actionCapability, "confirm");
  });

  it("returns cleanly when a tenant has no profile", async () => {
    const result = await getBusinessInfo(runtime(), { businessId: "no-profile-salon" });

    assert.equal(result.found, true);
    assert.equal("profile" in result, false);
    assert.deepEqual(result.services[0].tag, { verified: false, tier: "inform" });
  });

  it("returns a structured not-found result", async () => {
    const result = await getBusinessInfo(runtime(), { businessId: "missing-business" });

    assert.deepEqual(result, {
      found: false,
      businessId: "missing-business",
      reason: "tenant_not_found"
    });
  });

  it("exposes get_business_info over MCP without JSON-RPC errors", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_info",
      arguments: { businessId: "verified-profile-spa" }
    });

    assert.equal(response.error, undefined);
    assert.equal(response.result.structuredContent.found, true);
    assert.deepEqual(response.result.structuredContent.profile, profile);
    assert.deepEqual(response.result.structuredContent.services[0].tag, { verified: true, tier: "confirm" });
  });

  it("returns MCP structuredContent for unknown businesses", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_info",
      arguments: { businessId: "missing-business" }
    });

    assert.equal(response.error, undefined);
    assert.deepEqual(response.result.structuredContent, {
      found: false,
      businessId: "missing-business",
      reason: "tenant_not_found"
    });
  });
});

describe("business feed", () => {
  it("returns representative facts, citations, and confirm-capable actions", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "verified-profile-spa" });

    assert.equal(result.type, "agentport.business_feed.v0.1");
    assert.equal(result.mode, "compact");
    assert.equal("intent" in result, false);
    assert.equal(result.found, true);
    assert.equal(result.schemaVersion, "agentport.business_feed.v0.1");
    assert.match(result.businessVersion, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.cache.businessVersion, result.businessVersion);
    assert.match(result.cache.cacheKey, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.cache.conditionalRead.input, "ifBusinessVersion");
    assert.equal(result.representative.name, "Verified Profile Spa");
    assert.equal("profile" in result.representative, false);
    assert.equal("services" in result.representative, false);
    assert.equal(result.actionFeed.canRepresentAsVerified, true);
    assert.ok(result.nextActions.some((action) => action.action === "book_service" && action.requestedType === "confirmed"));
    assert.ok(result.cannotDo.some((limit) => limit.action === "payment"));
    assert.deepEqual(result.efficientPath.normal, ["discover_agentport", "call_get_business_feed_compact", "call_action_tool_only_if_needed"]);
    assert.ok(result.citations.some((citation) => citation.path === "representative.name"));

    const service = result.actionFeed.services.find((entry) => entry.serviceId === "massage");
    assert.equal(service.readinessTier, "manage-ready");
    const bookAction = service.actions.find((action) => action.action === "book_service");
    assert.equal(bookAction.status, "available");
    assert.equal(bookAction.requestedType, "confirmed");
    assert.equal(bookAction.expectedResult, "confirmed");
    const cancelAction = service.actions.find((action) => action.action === "cancel_service");
    assert.equal(cancelAction.status, "available");
  });

  it("marks unverified manual businesses as limited and non-confirming", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "no-profile-salon" });

    assert.equal(result.found, true);
    assert.equal(result.representative.verification.status, "unverified");
    assert.equal(result.actionFeed.canRepresentAsVerified, false);

    const service = result.actionFeed.services.find((entry) => entry.serviceId === "haircut");
    assert.equal(service.readinessTier, "listed");
    assert.ok(result.cannotDo.some((limit) => limit.action === "verified_answer" && limit.reason === "business_not_verified"));
    assert.ok(result.cannotDo.some((limit) => limit.action === "confirmed_booking" && limit.serviceId === "haircut"));
    const answerAction = service.actions.find((action) => action.action === "answer");
    assert.equal(answerAction.status, "blocked");
    assert.equal(answerAction.reason, "business_not_verified");
    const bookAction = service.actions.find((action) => action.action === "book_service");
    assert.equal(bookAction.status, "handoff");
    assert.equal(bookAction.requestedType, "handoff");
    assert.notEqual(bookAction.expectedResult, "confirmed");
  });

  it("returns full representative details only when requested", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "verified-profile-spa", mode: "full" });

    assert.equal(result.mode, "full");
    assert.deepEqual(result.representative.profile, profile);
    assert.equal(result.representative.services[0].id, "massage");
    assert.equal(result.actionFeed.services[0].serviceId, "massage");
  });

  it("scopes a feed to answer intent", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "verified-profile-spa", intent: "answer" });

    assert.equal(result.intent, "answer");
    const service = result.actionFeed.services.find((entry) => entry.serviceId === "massage");
    assert.deepEqual(service.actions.map((action) => action.action), ["answer"]);
    assert.deepEqual(result.nextActions.map((action) => action.action), ["answer"]);
    assert.equal(result.cannotDo.some((limit) => limit.action === "payment"), false);
  });

  it("scopes a feed to booking intent with action limits", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "no-profile-salon", intent: "book" });

    assert.equal(result.intent, "book");
    const service = result.actionFeed.services.find((entry) => entry.serviceId === "haircut");
    assert.deepEqual(service.actions.map((action) => action.action), ["check_availability", "book_service"]);
    assert.ok(result.nextActions.some((action) => action.action === "book_service" && action.status === "handoff"));
    assert.ok(result.cannotDo.some((limit) => limit.action === "confirmed_booking" && limit.serviceId === "haircut"));
    assert.ok(result.cannotDo.some((limit) => limit.action === "payment"));
    assert.equal(result.cannotDo.some((limit) => limit.action === "cancel_service"), false);
  });

  it("scopes a feed to manage intent", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "no-profile-salon", intent: "manage" });

    assert.equal(result.intent, "manage");
    const service = result.actionFeed.services.find((entry) => entry.serviceId === "haircut");
    assert.deepEqual(service.actions.map((action) => action.action), ["cancel_service", "reschedule_service"]);
    assert.ok(result.nextActions.every((action) => action.requiresConsent === true));
    assert.ok(result.cannotDo.some((limit) => limit.action === "cancel_service"));
    assert.ok(result.cannotDo.some((limit) => limit.action === "reschedule_service"));
  });

  it("scopes a feed to compare intent without action probes", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "no-profile-salon", intent: "compare" });

    assert.equal(result.intent, "compare");
    const service = result.actionFeed.services.find((entry) => entry.serviceId === "haircut");
    assert.deepEqual(service.actions.map((action) => action.action), ["answer"]);
    assert.deepEqual(result.nextActions, []);
    assert.deepEqual(result.cannotDo.map((limit) => limit.action), ["verified_answer"]);
  });

  it("returns notModified when ifBusinessVersion matches the current feed", async () => {
    const first = await getBusinessFeed(runtime(), { businessId: "verified-profile-spa", intent: "book" });
    const cached = await getBusinessFeed(runtime(), {
      businessId: "verified-profile-spa",
      intent: "book",
      ifBusinessVersion: first.businessVersion
    });

    assert.equal(cached.found, true);
    assert.equal(cached.notModified, true);
    assert.equal(cached.businessVersion, first.businessVersion);
    assert.equal(cached.cache.cacheKey, first.cache.cacheKey);
    assert.equal("representative" in cached, false);
    assert.equal("actionFeed" in cached, false);
  });

  it("returns a full feed when ifBusinessVersion does not match", async () => {
    const result = await getBusinessFeed(runtime(), {
      businessId: "verified-profile-spa",
      intent: "book",
      ifBusinessVersion: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    });

    assert.equal(result.found, true);
    assert.equal("notModified" in result, false);
    assert.equal(result.representative.name, "Verified Profile Spa");
    assert.ok(result.actionFeed.services.length > 0);
  });

  it("returns a structured feed not-found result", async () => {
    const result = await getBusinessFeed(runtime(), { businessId: "missing-business" });

    assert.deepEqual(result, {
      found: false,
      businessId: "missing-business",
      reason: "tenant_not_found"
    });
  });

  it("exposes get_business_feed over MCP without JSON-RPC errors", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "verified-profile-spa" }
    });

    assert.equal(response.error, undefined);
    assert.equal(response.result.structuredContent.type, "agentport.business_feed.v0.1");
    assert.equal(response.result.structuredContent.mode, "compact");
    assert.equal(response.result.structuredContent.actionFeed.canRepresentAsVerified, true);
  });

  it("exposes intent scoped get_business_feed over MCP", async () => {
    const response = await rpc("tools/call", {
      name: "get_business_feed",
      arguments: { businessId: "verified-profile-spa", intent: "book" }
    });

    assert.equal(response.error, undefined);
    assert.equal(response.result.structuredContent.intent, "book");
    assert.deepEqual(
      response.result.structuredContent.actionFeed.services[0].actions.map((action) => action.action),
      ["check_availability", "book_service"]
    );
  });
});

describe("readiness report", () => {
  it("returns a derived gateway readiness report for a published business", async () => {
    const result = await getReadinessReport(runtime(), {
      businessId: "verified-profile-spa",
      protocolInputs: [
        { kind: "mcp", status: "configured", purpose: "agent_tool_transport" },
        { kind: "ap2", status: "configured", purpose: "confirm_or_pay_authority" }
      ]
    });

    assert.equal(result.type, "agentport.readiness_report.v0.1");
    assert.equal(result.businessId, "verified-profile-spa");
    assert.equal(result.currentTier, "manage-ready");
    assert.equal(result.targetTier, "pay-ready");
    assert.equal(result.nextBestAction, "configure_payment_rail");
    assert.equal(result.bindings[0].actionCapability, "confirm");
    assert.equal(result.gaps[0].code, "payment_rail_missing");
  });

  it("keeps unverified businesses below answer-ready in the readiness report", async () => {
    const result = await getReadinessReport(runtime(), { businessId: "no-profile-salon" });

    assert.equal(result.type, "agentport.readiness_report.v0.1");
    assert.equal(result.currentTier, "listed");
    assert.equal(result.verifiedStatus, "unverified");
    assert.equal(result.nextBestAction, "verify_business");
    assert.equal(result.gaps[0].code, "verification_required");
  });

  it("returns a structured readiness not-found result", async () => {
    const result = await getReadinessReport(runtime(), { businessId: "missing-business" });

    assert.deepEqual(result, {
      found: false,
      businessId: "missing-business",
      reason: "tenant_not_found"
    });
  });

  it("exposes get_readiness_report over MCP without JSON-RPC errors", async () => {
    const response = await rpc("tools/call", {
      name: "get_readiness_report",
      arguments: {
        businessId: "verified-profile-spa",
        protocolInputs: [
          { kind: "mcp", status: "configured", purpose: "agent_tool_transport" },
          { kind: "ap2", status: "configured", purpose: "confirm_or_pay_authority" }
        ]
      }
    });

    assert.equal(response.error, undefined);
    assert.equal(response.result.structuredContent.type, "agentport.readiness_report.v0.1");
    assert.equal(response.result.structuredContent.currentTier, "manage-ready");
    assert.equal(response.result.structuredContent.nextBestAction, "configure_payment_rail");
  });
});

function runtime() {
  return {
    adapters: adapterMap,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DevAuth(),
    audit: { async record() {} },
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink()
  };
}

function tenantStore(allTenants) {
  return {
    async resolveTenant(businessId) {
      return allTenants.find((tenant) => tenant.id === businessId) ?? null;
    },
    async findNear() {
      return allTenants.map((tenant) => ({
        tenant,
        services: tenant.bindings.flatMap((binding) => binding.staticServices ?? [])
      }));
    }
  };
}

let nextId = 1;

async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
