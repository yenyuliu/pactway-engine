import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DevAuth, LocalTruthStore, NoopAnalytics, NoopLeadSink } from "../../dist/core/index.js";
import { bookService, cancelService, checkAvailability, createAgentPortServer, rescheduleService } from "../../dist/server/index.js";

const CONFIRM_CAPS = {
  readServices: true,
  readAvailability: true,
  confirmBooking: true,
  cancelBooking: false,
  rescheduleBooking: false
};

const REQUEST_CAPS = {
  ...CONFIRM_CAPS,
  confirmBooking: false
};

const SERVICE = { id: "cut", name: "Cut" };
const TENANT = {
  id: "salon",
  name: "Salon",
  bindings: [{ platform: "throwing" }]
};

describe("structured backend failure handling", () => {
  it("rejects default commit execution without an approved intent before adapter calls", async () => {
    let bookCalls = 0;
    const adapter = stubAdapter({
      async book(_binding, req) {
        bookCalls += 1;
        return {
          type: "confirmed",
          confirmationId: "should-not-run",
          serviceId: req.serviceId
        };
      }
    });

    const result = await bookService(runtime({ adapter, allowLegacyStateChange: false }), bookInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "intent_required"
    });
    assert.equal(bookCalls, 0);
  });

  it("rejects default manage execution without an approved intent before adapter calls", async () => {
    let cancelCalls = 0;
    let rescheduleCalls = 0;
    const adapter = stubAdapter({
      caps: {
        ...CONFIRM_CAPS,
        cancelBooking: true,
        rescheduleBooking: true
      },
      async cancel(_binding, req) {
        cancelCalls += 1;
        return {
          type: "cancelled",
          confirmationId: req.confirmationId,
          serviceId: req.serviceId
        };
      },
      async reschedule(_binding, req) {
        rescheduleCalls += 1;
        return {
          type: "rescheduled",
          confirmationId: req.confirmationId,
          serviceId: req.serviceId,
          start: req.newSlotStart
        };
      }
    });
    const defaultRuntime = runtime({ adapter, allowLegacyStateChange: false });

    const cancelled = await cancelService(defaultRuntime, {
      businessId: "salon",
      serviceId: "cut",
      confirmationId: "confirm-001",
      userConsent: true
    });
    const rescheduled = await rescheduleService(defaultRuntime, {
      businessId: "salon",
      serviceId: "cut",
      confirmationId: "confirm-001",
      newSlotStart: "2026-07-01T15:00:00.000Z",
      userConsent: true
    });

    assert.deepEqual(cancelled, {
      type: "rejected",
      reason: "intent_required"
    });
    assert.deepEqual(rescheduled, {
      type: "rejected",
      reason: "intent_required"
    });
    assert.equal(cancelCalls, 0);
    assert.equal(rescheduleCalls, 0);
  });

  it("returns failed and audits when adapter booking throws", async () => {
    const audit = captureAudit();
    const adapter = stubAdapter({
      async book() {
        throw new Error("booking backend unavailable");
      }
    });

    const result = await bookService(runtime({ adapter, audit }), bookInput());

    assert.deepEqual(result, {
      type: "failed",
      reason: "adapter_error",
      serviceId: "cut"
    });
    assert.equal(audit.events.length, 1);
    assert.equal(audit.events[0].resultType, "failed");
    assert.deepEqual(audit.events[0].metadata, {
      actionLayer: "commit",
      reason: "adapter_error"
    });
  });

  it("returns failed when binding resolution listServices throws", async () => {
    const adapter = stubAdapter({
      async listServices() {
        throw new Error("service catalog unavailable");
      }
    });

    const result = await bookService(runtime({ adapter }), bookInput());

    assert.equal(result.type, "failed");
    assert.equal(result.reason, "adapter_error");
    assert.equal(result.serviceId, "cut");
  });

  it("returns backend_error when availability lookup throws", async () => {
    const result = await checkAvailability(runtime({
      truth: {
        async getAvailability() {
          throw new Error("availability backend unavailable");
        },
        async freshnessOf() {
          return null;
        }
      }
    }), {
      businessId: "salon",
      serviceId: "cut"
    });

    assert.deepEqual(result, {
      supported: false,
      reason: "backend_error"
    });
  });

  it("does not require service listing before static-service availability", async () => {
    const tenant = {
      ...TENANT,
      bindings: [{
        platform: "throwing",
        staticServices: [SERVICE]
      }]
    };
    const adapter = stubAdapter({
      async listServices() {
        throw new Error("service catalog unavailable");
      }
    });
    const adapterMap = new Map([[adapter.platform, adapter]]);
    const tenants = tenantStore(tenant);

    const result = await checkAvailability({
      ...runtime({ adapter }),
      tenants,
      truth: new LocalTruthStore(tenants, adapterMap)
    }, {
      businessId: "salon",
      serviceId: "cut"
    });

    assert.deepEqual(result, {
      supported: true,
      serviceId: "cut",
      slots: [],
      source: "throwing"
    });
  });

  it("keeps adapter capability violations rejected instead of failed", async () => {
    const adapter = stubAdapter({
      caps: REQUEST_CAPS,
      async book(_binding, req) {
        return {
          type: "confirmed",
          confirmationId: "bad-confirmation",
          serviceId: req.serviceId
        };
      }
    });

    const result = await bookService(runtime({ adapter }), bookInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "adapter_capability_violation"
    });
  });

  it("returns failed structuredContent over MCP tools/call without a top-level error", async () => {
    const adapter = stubAdapter({
      async book() {
        throw new Error("booking backend unavailable");
      }
    });
    const agentPort = createAgentPortServer({
      adapters: [adapter],
      tenants: tenantStore(TENANT),
      truth: nullTruth(),
      auth: new DevAuth(),
      audit: captureAudit(),
      analytics: new NoopAnalytics(),
      leads: new NoopLeadSink(),
      delegation: {
        layers: {
          commit: { requireApprovedIntent: false }
        }
      }
    });
    const httpServer = await agentPort.listen({ port: 0 });

    try {
      const address = httpServer.address();
      const endpoint = `http://127.0.0.1:${address.port}/mcp`;
      const response = await rpc(endpoint, "tools/call", {
        name: "book_service",
        arguments: bookInput()
      });

      assert.equal(response.error, undefined);
      assert.deepEqual(response.result.structuredContent, {
        type: "failed",
        reason: "adapter_error",
        serviceId: "cut"
      });
    } finally {
      await closeServer(httpServer);
    }
  });
});

function runtime({ adapter = stubAdapter(), audit = captureAudit(), truth = nullTruth(), allowLegacyStateChange = true } = {}) {
  const base = {
    adapters: new Map([[adapter.platform, adapter]]),
    tenants: tenantStore(TENANT),
    truth,
    auth: new DevAuth(),
    audit,
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink()
  };

  if (!allowLegacyStateChange) {
    return base;
  }

  return {
    ...base,
    delegation: {
      layers: {
        commit: { requireApprovedIntent: false },
        manage: { requireApprovedIntent: false },
        funds: { requireApprovedIntent: false }
      }
    }
  };
}

function bookInput() {
  return {
    businessId: "salon",
    serviceId: "cut",
    customer: { name: "Ada" },
    userConsent: true
  };
}

function stubAdapter(overrides = {}) {
  return {
    platform: "throwing",
    async capabilities() {
      return overrides.caps ?? CONFIRM_CAPS;
    },
    async listServices() {
      return [SERVICE];
    },
    async getAvailability(_binding, req) {
      return {
        supported: true,
        serviceId: req.serviceId,
        slots: [],
        source: "throwing"
      };
    },
    async book(_binding, req) {
      return {
        type: "confirmed",
        confirmationId: "ok-confirmation",
        serviceId: req.serviceId
      };
    },
    ...overrides
  };
}

function tenantStore(tenant) {
  return {
    async resolveTenant(businessId) {
      return tenant.id === businessId ? tenant : null;
    },
    async findNear() {
      return [{
        tenant,
        services: tenant.bindings.flatMap((binding) => binding.staticServices ?? [])
      }];
    }
  };
}

function nullTruth() {
  return {
    async getAvailability() {
      return null;
    },
    async freshnessOf() {
      return null;
    }
  };
}

function captureAudit() {
  const events = [];
  return {
    events,
    async record(event) {
      events.push(event);
    }
  };
}

async function rpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params === undefined ? {} : { params })
    })
  });

  assert.equal(response.status, 200);
  return response.json();
}

async function closeServer(httpServer) {
  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}
