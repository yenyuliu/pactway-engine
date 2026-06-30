import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DevAuth,
  InMemoryCredentialVault,
  LocalTruthStore,
  NoopAnalytics,
  NoopLeadSink
} from "../../dist/core/index.js";
import {
  bookService,
  checkAvailability,
  findServices
} from "../../dist/server/index.js";

const SECRET = "super-secret-square-token";
const REF = { vaultId: "tenant-backends", key: "verified-spa-square" };
const SERVICE = { id: "massage", name: "Massage" };

describe("credential vault seam", () => {
  it("resolves credential refs for discovery, availability, and booking without storing secrets in tenants/results", async () => {
    const tenant = tenantWithCredentialRef();
    const vault = new InMemoryCredentialVault([
      { ref: REF, credentials: { accessToken: SECRET } }
    ]);
    const audit = new MemoryAuditSink();
    const runtime = runtimeFor(tenant, vault, audit);
    runtime.truth = new LocalTruthStore(runtime.tenants, runtime.adapters);

    const discovery = await findServices(runtime, { service: "Massage" });
    assert.equal(discovery.matches[0].services[0].tag.tier, "confirm");

    const availability = await checkAvailability(runtime, {
      businessId: tenant.id,
      serviceId: SERVICE.id
    });
    assert.deepEqual(availability, {
      supported: true,
      serviceId: SERVICE.id,
      slots: [],
      source: "creds-dependent"
    });

    const booking = await bookService(runtime, {
      businessId: tenant.id,
      serviceId: SERVICE.id,
      customer: { name: "Ada" },
      requestedType: "confirmed",
      userConsent: true
    });
    assert.deepEqual(booking, {
      type: "confirmed",
      confirmationId: "backend-confirmation-001",
      serviceId: SERVICE.id,
      source: "creds-dependent"
    });

    assert.ok(JSON.stringify(tenant).includes("\"credentialRef\""));
    assertNoSecret(tenant);
    assertNoSecret(discovery);
    assertNoSecret(availability);
    assertNoSecret(booking);
    assertNoSecret(audit.events);
  });

  it("degrades honestly when a credential ref cannot be resolved", async () => {
    const tenant = tenantWithCredentialRef();
    const vault = new InMemoryCredentialVault();
    const runtime = runtimeFor(tenant, vault);

    const discovery = await findServices(runtime, { service: "Massage" });
    assert.equal(discovery.matches[0].services[0].tag.verified, true);
    assert.equal(discovery.matches[0].services[0].tag.tier, "request");

    const booking = await bookService(runtime, {
      businessId: tenant.id,
      serviceId: SERVICE.id,
      customer: { name: "Ada" },
      requestedType: "confirmed",
      userConsent: true
    });

    assert.deepEqual(booking, {
      type: "rejected",
      reason: "capability_exceeded"
    });
  });
});

function runtimeFor(tenant, credentials, audit = new MemoryAuditSink()) {
  const adapter = new CredsDependentAdapter();
  const adapters = new Map([[adapter.platform, adapter]]);
  const tenants = new SingleTenantStore(tenant);

  return {
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapters, credentials),
    auth: new DevAuth(),
    audit,
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    credentials,
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

function tenantWithCredentialRef() {
  return {
    id: "verified-spa",
    name: "Verified Spa",
    verification: {
      status: "verified",
      verifiedBy: "agentport",
      method: "operator_attested",
      verifiedAt: "2026-06-20T00:00:00.000Z"
    },
    bindings: [
      {
        platform: "creds-dependent",
        credentialRef: REF,
        staticServices: [SERVICE]
      }
    ]
  };
}

class CredsDependentAdapter {
  platform = "creds-dependent";

  async capabilities(binding) {
    const hasCredentials = Boolean(binding.credentials?.accessToken);
    return {
      readServices: true,
      readAvailability: true,
      confirmBooking: hasCredentials,
      cancelBooking: false,
      rescheduleBooking: false
    };
  }

  async listServices(binding) {
    return binding.staticServices ?? [SERVICE];
  }

  async getAvailability(_binding, req) {
    return {
      supported: true,
      serviceId: req.serviceId,
      slots: [],
      source: "creds-dependent"
    };
  }

  async book(binding, req) {
    if (!binding.credentials?.accessToken) {
      return {
        type: "handoff",
        serviceId: req.serviceId,
        reason: "no_integration"
      };
    }

    return {
      type: "confirmed",
      confirmationId: "backend-confirmation-001",
      serviceId: req.serviceId,
      source: "creds-dependent"
    };
  }
}

class SingleTenantStore {
  constructor(tenant) {
    this.tenant = tenant;
  }

  async resolveTenant(businessId) {
    return businessId === this.tenant.id ? this.tenant : null;
  }

  async findNear() {
    return [{ tenant: this.tenant, services: [SERVICE] }];
  }
}

class MemoryAuditSink {
  events = [];

  async record(event) {
    this.events.push(event);
  }
}

function assertNoSecret(value) {
  assert.equal(JSON.stringify(value).includes(SECRET), false);
}
