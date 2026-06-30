import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { FixtureAdapter, FIXTURE_SLOTS } from "../../dist/adapters/fixture/index.js";
import { ManualAdapter } from "../../dist/adapters/manual/index.js";
import { DevAuth, LocalTruthStore, NoopAnalytics, NoopLeadSink } from "../../dist/core/index.js";
import { bookService, checkAvailability, createAgentPortServer, findServices } from "../../dist/server/index.js";

const dualTenant = {
  id: "dual",
  name: "Dual Binding Salon",
  bindings: [
    {
      platform: "fixture",
      staticServices: [{ id: "cut", name: "Cut" }]
    },
    {
      platform: "manual",
      bookingUrl: "https://x/book",
      phone: "+1-000",
      staticServices: [{ id: "cut", name: "Cut" }]
    }
  ]
};

describe("multi-binding addressability", () => {
  it("emits one bindingId per binding with independent tiers", async () => {
    const result = await findServices(runtime([dualTenant]), { service: "cut" });
    const services = result.matches[0].services.filter((service) => service.id === "cut");

    assert.equal(services.length, 2);
    assert.deepEqual(
      services.map(({ bindingId, tag }) => ({ bindingId, tier: tag.tier })),
      [
        { bindingId: "fixture#0", tier: "confirm" },
        { bindingId: "manual#1", tier: "inform" }
      ]
    );
  });

  it("routes availability to the addressed binding", async () => {
    assert.deepEqual(await checkAvailability(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      bindingId: "fixture#0"
    }), {
      supported: true,
      serviceId: "cut",
      slots: FIXTURE_SLOTS,
      source: "fixture"
    });

    assert.deepEqual(await checkAvailability(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      bindingId: "manual#1"
    }), {
      supported: false,
      reason: "backend_no_availability_api",
      source: "manual"
    });

    assert.deepEqual(await checkAvailability(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      bindingId: "missing#9"
    }), {
      supported: false,
      reason: "tenant_or_service_not_found"
    });
  });

  it("routes booking to the addressed binding", async () => {
    assert.deepEqual(await bookService(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      bindingId: "fixture#0",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    }), {
      type: "confirmed",
      confirmationId: "fixture-cut-0001",
      serviceId: "cut",
      start: FIXTURE_SLOTS[0].start,
      source: "fixture"
    });

    assert.deepEqual(await bookService(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      bindingId: "manual#1",
      customer: { name: "Ada" },
      userConsent: true
    }), {
      type: "handoff",
      serviceId: "cut",
      bookingUrl: "https://x/book",
      phone: "+1-000",
      reason: "no_integration"
    });

    assert.deepEqual(await bookService(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      bindingId: "missing#9",
      customer: { name: "Ada" },
      userConsent: true
    }), {
      type: "rejected",
      reason: "tenant_or_service_not_found"
    });
  });

  it("keeps first-match behavior when bindingId is absent", async () => {
    const availability = await checkAvailability(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut"
    });
    const booking = await bookService(runtime([dualTenant]), {
      businessId: "dual",
      serviceId: "cut",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(availability.supported, true);
    assert.equal(booking.type, "confirmed");
  });

  it("uses explicit configured binding ids for discovery and availability", async () => {
    const tenant = {
      id: "explicit",
      name: "Explicit Binding Salon",
      bindings: [{
        platform: "fixture",
        bindingId: "primary",
        staticServices: [{ id: "cut", name: "Cut" }]
      }]
    };
    const found = await findServices(runtime([tenant]), { service: "cut" });
    const availability = await checkAvailability(runtime([tenant]), {
      businessId: "explicit",
      serviceId: "cut",
      bindingId: "primary"
    });

    assert.equal(found.matches[0].services[0].bindingId, "primary");
    assert.equal(availability.supported, true);
  });

  it("does not let adapter payload spoof bindingId", async () => {
    const tenant = {
      id: "spoof",
      name: "Spoof Salon",
      bindings: [{
        platform: "spoof",
        staticServices: [{ id: "cut", name: "Cut" }]
      }]
    };
    const adapter = stubAdapter("spoof", [{
      id: "cut",
      name: "Cut",
      bindingId: "evil"
    }]);
    const result = await findServices(runtime([tenant], [adapter]), { service: "cut" });

    assert.equal(result.matches[0].services[0].bindingId, "spoof#0");
  });
});

let httpServer;

after(async () => {
  if (!httpServer) {
    return;
  }

  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
});

describe("multi-binding MCP boundary", () => {
  it("exposes bindingId in schemas and parses addressed availability calls", async () => {
    const adapters = [new FixtureAdapter(), new ManualAdapter()];
    const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
    const tenants = tenantStore([dualTenant]);
    const agentPort = createAgentPortServer({
      adapters,
      tenants,
      truth: new LocalTruthStore(tenants, adapterMap),
      auth: new DevAuth(),
      audit: noopAudit(),
      analytics: new NoopAnalytics(),
      leads: new NoopLeadSink()
    });

    httpServer = await agentPort.listen({ port: 0 });
    const address = httpServer.address();
    const endpoint = `http://127.0.0.1:${address.port}/mcp`;

    const tools = await rpc(endpoint, "tools/list");
    const bookTool = tools.result.tools.find((tool) => tool.name === "book_service");
    assert.ok(bookTool.inputSchema.properties.bindingId);

    const availability = await rpc(endpoint, "tools/call", {
      name: "check_availability",
      arguments: {
        businessId: "dual",
        serviceId: "cut",
        bindingId: "manual#1"
      }
    });

    assert.equal(availability.result.structuredContent.supported, false);
  });
});

function runtime(tenants, adapters = [new FixtureAdapter(), new ManualAdapter()]) {
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const store = tenantStore(tenants);

  return {
    adapters: adapterMap,
    tenants: store,
    truth: new LocalTruthStore(store, adapterMap),
    auth: new DevAuth(),
    audit: noopAudit(),
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

function tenantStore(tenants) {
  return {
    async resolveTenant(businessId) {
      return tenants.find((tenant) => tenant.id === businessId) ?? null;
    },
    async findNear() {
      return tenants.map((tenant) => ({
        tenant,
        services: tenant.bindings.flatMap((binding) => binding.staticServices ?? [])
      }));
    }
  };
}

function noopAudit() {
  return {
    async record() {
      return undefined;
    }
  };
}

function stubAdapter(platform, services) {
  return {
    platform,
    async capabilities() {
      return {
        readServices: true,
        readAvailability: true,
        confirmBooking: true,
        cancelBooking: false,
        rescheduleBooking: false
      };
    },
    async listServices() {
      return services;
    },
    async getAvailability(_binding, req) {
      return {
        supported: true,
        serviceId: req.serviceId,
        slots: FIXTURE_SLOTS,
        source: platform
      };
    },
    async book(_binding, req) {
      return {
        type: "confirmed",
        confirmationId: `${platform}-${req.serviceId}-0001`,
        serviceId: req.serviceId,
        source: platform
      };
    }
  };
}

let nextId = 1;

async function rpc(endpoint, method, params) {
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
