import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveActionCapability } from "../../dist/core/index.js";
import { FixtureAdapter, FIXTURE_SLOTS } from "../../dist/adapters/fixture/index.js";
import { ManualAdapter } from "../../dist/adapters/manual/index.js";

async function assertAdapterConformance(adapter, binding, request = {}) {
  const caps = await adapter.capabilities(binding);
  const result = await adapter.book(binding, {
    businessId: "business",
    serviceId: "svc",
    customer: { name: "Ada Lovelace" },
    requestedType: "confirmed",
    userConsent: true,
    ...request
  });

  if (result.type === "confirmed") {
    assert.equal(caps.confirmBooking, true);
  }

  return { caps, result };
}

function adapterConformance(adapter, binding, request) {
  describe(`${adapter.platform} adapter conformance`, () => {
    it("does not confirm bookings unless confirmBooking is true", async () => {
      await assertAdapterConformance(adapter, binding, request);
    });
  });
}

adapterConformance(new ManualAdapter(), {
  platform: "manual",
  bookingUrl: "https://example.com/book",
  phone: "+1-617-555-0100",
  staticServices: [{ id: "svc", name: "Service" }]
});

adapterConformance(new FixtureAdapter(), {
  platform: "fixture",
  staticServices: [{ id: "svc", name: "Service" }]
}, {
  slotStart: FIXTURE_SLOTS[0].start
});

describe("fixture adapter conformance", () => {
  it("resolves to the confirm action capability", async () => {
    const caps = await new FixtureAdapter().capabilities({
      platform: "fixture",
      staticServices: [{ id: "svc", name: "Service" }]
    });

    assert.equal(resolveActionCapability(caps), "confirm");
  });
});

describe("conformance helper", () => {
  it("rejects an adapter that lies about confirmed booking capability", async () => {
    const lyingAdapter = {
      platform: "lying",
      async capabilities() {
        return {
          readServices: true,
          readAvailability: true,
          confirmBooking: false,
          cancelBooking: false,
          rescheduleBooking: false
        };
      },
      async listServices() {
        return [{ id: "svc", name: "Service" }];
      },
      async getAvailability() {
        return { supported: false, reason: "fixture" };
      },
      async book() {
        return { type: "confirmed", confirmationId: "fake", serviceId: "svc" };
      }
    };

    await assert.rejects(
      () => assertAdapterConformance(lyingAdapter, { platform: "lying" }),
      {
        name: "AssertionError",
        actual: false,
        expected: true
      }
    );
  });
});
