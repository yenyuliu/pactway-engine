import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  DevAuth,
  LocalTruthStore,
  NoopAnalytics,
  NoopLeadSink
} from "../../dist/core/index.js";
import { bookService, checkAvailability } from "../../dist/server/index.js";
import {
  SquareAdapter,
  SquareApiError,
  SquareRestGateway,
  squareConnectionStatus,
  squareIdempotencyKey
} from "../../dist/adapters/square/index.js";

const BINDING = {
  platform: "square",
  locationId: "loc_123",
  credentials: {
    accessToken: "vaulted-token"
  }
};

describe("square adapter", () => {
  it("maps catalog, availability, and booking responses through a gateway seam", async () => {
    const gateway = new FakeSquareGateway();
    const adapter = new SquareAdapter(gateway);

    const caps = await adapter.capabilities(BINDING);
    assert.equal(caps.confirmBooking, true);

    const services = await adapter.listServices(BINDING);
    assert.deepEqual(services, [{
      id: "var_massage",
      name: "Massage",
      description: "Therapeutic bodywork",
      durationMin: 60,
      price: {
        amount: 12500,
        currency: "USD"
      }
    }]);

    const availability = await adapter.getAvailability(BINDING, {
      businessId: "spa",
      serviceId: "var_massage"
    });
    assert.deepEqual(availability, {
      supported: true,
      serviceId: "var_massage",
      slots: [{
        start: "2026-07-01T15:00:00.000Z",
        end: "2026-07-01T16:00:00.000Z",
        staffId: "tm_123",
        metadata: { locationId: "loc_123" }
      }],
      source: "square"
    });

    const booking = await adapter.book(BINDING, {
      businessId: "spa",
      serviceId: "var_massage",
      customer: { name: "Ada Lovelace" },
      slotStart: "2026-07-01T15:00:00.000Z",
      userConsent: true
    });
    assert.deepEqual(booking, {
      type: "confirmed",
      confirmationId: "sq_booking_123",
      serviceId: "var_massage",
      start: "2026-07-01T15:00:00.000Z",
      source: "square"
    });
  });

  it("degrades when token or location preconditions are absent", async () => {
    const adapter = new SquareAdapter(new FakeSquareGateway());

    assert.equal((await adapter.capabilities({ platform: "square" })).confirmBooking, false);
    const tokenOnlyCaps = await adapter.capabilities({
      platform: "square",
      credentials: { accessToken: "token" }
    });
    assert.equal(tokenOnlyCaps.readServices, true);
    assert.equal(tokenOnlyCaps.readAvailability, false);
    assert.equal(tokenOnlyCaps.confirmBooking, false);

    assert.deepEqual(squareConnectionStatus({ platform: "square" }), {
      ok: false,
      code: "missing_token",
      reason: "missing_square_credentials_or_location"
    });
    assert.deepEqual(squareConnectionStatus({
      platform: "square",
      credentials: { accessToken: "token" }
    }), {
      ok: false,
      code: "missing_location",
      reason: "missing_square_credentials_or_location"
    });
    assert.deepEqual(squareConnectionStatus(BINDING), {
      ok: true,
      code: "ready"
    });

    const availability = await adapter.getAvailability({
      platform: "square",
      credentials: { accessToken: "token" }
    }, {
      businessId: "spa",
      serviceId: "var_massage"
    });
    assert.deepEqual(availability, {
      supported: false,
      reason: "missing_square_credentials_or_location",
      source: "square"
    });

    const booking = await adapter.book({
      platform: "square",
      credentials: { accessToken: "token" }
    }, {
      businessId: "spa",
      serviceId: "var_massage",
      customer: { name: "Ada" },
      requestedType: "confirmed",
      userConsent: true
    });
    assert.deepEqual(booking, {
      type: "rejected",
      reason: "missing_square_credentials_location_or_slot"
    });
  });

  it("does not warehouse Square data between calls", async () => {
    const gateway = new FakeSquareGateway();
    const adapter = new SquareAdapter(gateway);

    await adapter.listServices(BINDING);
    await adapter.listServices(BINDING);
    await adapter.getAvailability(BINDING, { businessId: "spa", serviceId: "var_massage" });
    await adapter.getAvailability(BINDING, { businessId: "spa", serviceId: "var_massage" });

    assert.deepEqual(gateway.calls, {
      listCatalogServices: 2,
      searchAvailability: 2,
      createBooking: 0
    });
  });

  it("lets the engine convert Square gateway failures to structured outcomes", async () => {
    const adapter = new SquareAdapter(new ThrowingSquareGateway());
    const runtime = runtimeFor(adapter);

    const availability = await checkAvailability(runtime, {
      businessId: "spa",
      serviceId: "var_massage"
    });
    assert.deepEqual(availability, {
      supported: false,
      reason: "backend_error"
    });

    const booking = await bookService(runtime, {
      businessId: "spa",
      serviceId: "var_massage",
      customer: { name: "Ada" },
      slotStart: "2026-07-01T15:00:00.000Z",
      userConsent: true
    });
    assert.deepEqual(booking, {
      type: "failed",
      reason: "adapter_error",
      serviceId: "var_massage"
    });
  });

  it("uses deterministic idempotency keys and no Square SDK dependency", async () => {
    assert.equal(squareIdempotencyKey({
      businessId: "Spa",
      serviceId: "Var Massage",
      slotStart: "2026-07-01T15:00:00.000Z",
      customer: { name: "Ada Lovelace" }
    }), "agentport_spa_var_massage_2026-07-01t15_00_00_000z_ada_lovelace");

    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    assert.equal(pkg.dependencies?.square, undefined);
    assert.equal(pkg.devDependencies?.square, undefined);
  });

  it("classifies Square API errors from the raw fetch gateway", async () => {
    const requests = [];
    const gateway = new SquareRestGateway({
      apiBase: "https://square.test/v2",
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: false,
          status: 401,
          async text() {
            return JSON.stringify({
              errors: [{
                category: "AUTHENTICATION_ERROR",
                code: "UNAUTHORIZED",
                detail: "Bad token"
              }]
            });
          },
          async json() {
            throw new Error("json should not be read on failed responses");
          }
        };
      }
    });

    await assert.rejects(
      () => gateway.listCatalogServices(BINDING),
      (error) => {
        assert.equal(error instanceof SquareApiError, true);
        assert.equal(error.status, 401);
        assert.equal(error.primaryCategory, "AUTHENTICATION_ERROR");
        assert.equal(error.primaryCode, "UNAUTHORIZED");
        assert.equal(error.errors[0].detail, "Bad token");
        return true;
      }
    );

    assert.equal(requests[0].url, "https://square.test/v2/catalog/list?types=ITEM");
    assert.equal(requests[0].init.headers.Authorization, "Bearer vaulted-token");
    assert.equal(requests[0].init.headers["Square-Version"], "2026-06-14");
  });
});

class FakeSquareGateway {
  calls = {
    listCatalogServices: 0,
    searchAvailability: 0,
    createBooking: 0
  };

  async listCatalogServices() {
    this.calls.listCatalogServices += 1;
    return {
      objects: [{
        id: "item_massage",
        item_data: {
          name: "Massage",
          description: "Therapeutic bodywork",
          variations: [{
            id: "var_massage",
            item_variation_data: {
              service_duration: 3_600_000,
              price_money: {
                amount: 12500,
                currency: "USD"
              }
            }
          }]
        }
      }]
    };
  }

  async searchAvailability() {
    this.calls.searchAvailability += 1;
    return {
      availabilities: [{
        start_at: "2026-07-01T15:00:00.000Z",
        location_id: "loc_123",
        appointment_segments: [{
          duration_minutes: 60,
          team_member_id: "tm_123"
        }]
      }]
    };
  }

  async createBooking() {
    this.calls.createBooking += 1;
    return {
      booking: {
        id: "sq_booking_123",
        start_at: "2026-07-01T15:00:00.000Z"
      }
    };
  }
}

class ThrowingSquareGateway {
  async listCatalogServices() {
    return [{ id: "var_massage", name: "Massage" }];
  }

  async searchAvailability() {
    throw new Error("square unavailable");
  }

  async createBooking() {
    throw new Error("square unavailable");
  }
}

function runtimeFor(adapter) {
  const adapters = new Map([[adapter.platform, adapter]]);
  const tenants = new SingleTenantStore();
  return {
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapters),
    auth: new DevAuth(),
    audit: { async record() {} },
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

class SingleTenantStore {
  async resolveTenant(businessId) {
    if (businessId !== "spa") {
      return null;
    }

    return {
      id: "spa",
      name: "Spa",
      verification: { status: "verified" },
      bindings: [{
        ...BINDING,
        staticServices: [{ id: "var_massage", name: "Massage" }]
      }]
    };
  }

  async findNear() {
    return [];
  }
}
