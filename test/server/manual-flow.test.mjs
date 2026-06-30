import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { ConsoleAuditSink, DevAuth, LocalJsonTenantStore, LocalTruthStore, NoopAnalytics, NoopLeadSink } from "../../dist/core/index.js";
import { ManualAdapter } from "../../dist/adapters/manual/index.js";
import { bookService, checkAvailability, findServices } from "../../dist/server/index.js";

const REQUEST_CAPS = {
  readServices: true,
  readAvailability: false,
  confirmBooking: false,
  cancelBooking: false,
  rescheduleBooking: false
};

const CONFIRM_CAPS = {
  ...REQUEST_CAPS,
  confirmBooking: true
};

function runtime() {
  const adapters = [new ManualAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));

  return {
    adapters: adapterMap,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DevAuth(),
    audit: new ConsoleAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    delegation: localProfileIntentRelaxation()
  };
}

function findRuntime(tenant, adapters) {
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));

  return {
    adapters: adapterMap,
    tenants: {
      async resolveTenant(businessId) {
        return tenant.id === businessId ? tenant : null;
      },
      async findNear() {
        return [{
          tenant,
          services: tenant.bindings.flatMap((binding) => binding.staticServices ?? [])
        }];
      }
    },
    truth: {
      async getAvailability() {
        return null;
      },
      async freshnessOf() {
        return null;
      }
    },
    auth: new DevAuth(),
    audit: new ConsoleAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    delegation: localProfileIntentRelaxation()
  };
}

function localProfileIntentRelaxation() {
  return {
    layers: {
      commit: { requireApprovedIntent: false },
      manage: { requireApprovedIntent: false },
      funds: { requireApprovedIntent: false }
    }
  };
}

function stubAdapter(platform, caps, services) {
  return {
    platform,
    async capabilities() {
      return caps;
    },
    async listServices() {
      return services;
    },
    async getAvailability() {
      return { supported: false, reason: "stub" };
    },
    async book() {
      return { type: "rejected", reason: "stub" };
    }
  };
}

describe("manual v0 flow", () => {
  it("finds the sample salon with absent verification default on all services", async () => {
    const result = await findServices(runtime(), { service: "haircut" });
    const match = result.matches.find((entry) => entry.businessId === "sample-salon");

    assert.ok(match);
    assert.deepEqual(match.services.map((service) => service.id), ["haircut", "color"]);
    for (const service of match.services) {
      assert.equal(service.verified, false);
      assert.equal(service.verification, null);
      assert.deepEqual(service.tag, { verified: false, tier: "inform" });
      assert.equal(service.actionCapability, "inform");
    }
  });

  it("emits verified confirm tags from tenant verification and binding capabilities", async () => {
    const tenant = {
      id: "verified-salon",
      name: "Verified Salon",
      verification: { status: "verified" },
      bindings: [{ platform: "confirm-stub" }]
    };
    const adapter = stubAdapter("confirm-stub", CONFIRM_CAPS, [{ id: "cut", name: "Cut" }]);

    const result = await findServices(findRuntime(tenant, [adapter]), { service: "cut" });
    const service = result.matches[0]?.services[0];

    assert.equal(service?.verified, true);
    assert.deepEqual(service?.verification, { status: "verified" });
    assert.deepEqual(service?.tag, { verified: true, tier: "confirm" });
    assert.equal(service?.actionCapability, "confirm");
  });

  it("overrides adapter verified true when tenant status is unverified", async () => {
    const tenant = {
      id: "unverified-salon",
      name: "Unverified Salon",
      verification: { status: "unverified" },
      bindings: [{ platform: "confirm-stub" }]
    };
    const adapter = stubAdapter("confirm-stub", CONFIRM_CAPS, [{
      id: "cut",
      name: "Cut",
      verified: true,
      tag: { verified: true, tier: "confirm" }
    }]);

    const result = await findServices(findRuntime(tenant, [adapter]), { service: "cut" });
    const service = result.matches[0]?.services[0];

    assert.equal(service?.verified, false);
    assert.deepEqual(service?.verification, { status: "unverified" });
    assert.deepEqual(service?.tag, { verified: false, tier: "confirm" });
    assert.equal(service?.actionCapability, "confirm");
  });

  it("does not unlock discovery for stale tenant verification", async () => {
    const tenant = {
      id: "stale-salon",
      name: "Stale Salon",
      verification: {
        status: "stale",
        verifiedBy: "agentport",
        verifiedAt: "2026-01-01T00:00:00.000Z"
      },
      bindings: [{ platform: "confirm-stub" }]
    };
    const adapter = stubAdapter("confirm-stub", CONFIRM_CAPS, [{ id: "cut", name: "Cut" }]);

    const result = await findServices(findRuntime(tenant, [adapter]), { service: "cut" });
    const service = result.matches[0]?.services[0];

    assert.equal(service?.verified, false);
    assert.deepEqual(service?.tag, { verified: false, tier: "confirm" });
    assert.equal(service?.verification.status, "stale");
  });

  it("prevents tier-leak from a non-confirm adapter payload", async () => {
    const tenant = {
      id: "request-salon",
      name: "Request Salon",
      bindings: [{ platform: "request-stub" }]
    };
    const adapter = stubAdapter("request-stub", REQUEST_CAPS, [{
      id: "cut",
      name: "Cut",
      tag: { verified: true, tier: "confirm" }
    }]);

    const result = await findServices(findRuntime(tenant, [adapter]), { service: "cut" });
    const service = result.matches[0]?.services[0];

    assert.equal(service?.tag.tier, "request");
    assert.equal(service?.actionCapability, "request");
  });

  it("overrides adapter verified false when tenant status is verified", async () => {
    const tenant = {
      id: "verified-salon",
      name: "Verified Salon",
      verification: { status: "verified" },
      bindings: [{ platform: "request-stub" }]
    };
    const adapter = stubAdapter("request-stub", REQUEST_CAPS, [{
      id: "cut",
      name: "Cut",
      verified: false,
      tag: { verified: false, tier: "inform" }
    }]);

    const result = await findServices(findRuntime(tenant, [adapter]), { service: "cut" });
    const service = result.matches[0]?.services[0];

    assert.equal(service?.verified, true);
    assert.equal(service?.tag.verified, true);
    assert.deepEqual(service?.tag, { verified: true, tier: "request" });
  });

  it("overrides adapter verification when tenant has no attestation", async () => {
    const tenant = {
      id: "no-attestation-salon",
      name: "No Attestation Salon",
      bindings: [{ platform: "confirm-stub" }]
    };
    const adapter = stubAdapter("confirm-stub", CONFIRM_CAPS, [{
      id: "cut",
      name: "Cut",
      verification: { status: "verified", verifiedBy: "evil" }
    }]);

    const result = await findServices(findRuntime(tenant, [adapter]), { service: "cut" });
    const service = result.matches[0]?.services[0];

    assert.equal(service?.verified, false);
    assert.equal(service?.verification, null);
  });

  it("emits duplicate service ids across bindings with independent tiers", async () => {
    const tenant = {
      id: "multi-binding-salon",
      name: "Multi Binding Salon",
      bindings: [
        { platform: "confirm-stub" },
        { platform: "request-stub" }
      ]
    };
    const service = { id: "cut", name: "Cut" };
    const result = await findServices(findRuntime(tenant, [
      stubAdapter("confirm-stub", CONFIRM_CAPS, [service]),
      stubAdapter("request-stub", REQUEST_CAPS, [service])
    ]), { service: "cut" });
    const tiers = result.matches[0]?.services
      .filter((entry) => entry.id === "cut")
      .map((entry) => entry.tag.tier)
      .sort();

    assert.equal(result.matches[0]?.services.filter((entry) => entry.id === "cut").length, 2);
    assert.deepEqual(tiers, ["confirm", "request"]);
  });

  it("returns truthful unsupported availability", async () => {
    const result = await checkAvailability(runtime(), {
      businessId: "sample-salon",
      serviceId: "haircut"
    });

    assert.deepEqual(result, {
      supported: false,
      reason: "backend_no_availability_api",
      source: "manual"
    });
  });

  it("requires consent before booking", async () => {
    const result = await bookService(runtime(), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada Lovelace" }
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "consent_required"
    });
  });

  it("refuses confirmed booking requests above adapter capability", async () => {
    const result = await bookService(runtime(), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada Lovelace" },
      requestedType: "confirmed",
      userConsent: true
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "capability_exceeded"
    });
  });

  it("returns an honest handoff with consent", async () => {
    const result = await bookService(runtime(), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada Lovelace" },
      userConsent: true
    });

    assert.deepEqual(result, {
      type: "handoff",
      serviceId: "haircut",
      bookingUrl: "https://example.com/sample-salon/book",
      phone: "+1-617-555-0100",
      reason: "no_integration"
    });
  });
});
