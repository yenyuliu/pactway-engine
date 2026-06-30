import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  compactTokenKeyPairFromPem,
  DelegationTokenAuth,
  LocalDelegationIssuer,
  emitDelegationToken,
  emitDpopProof,
  LocalJsonTenantStore,
  LocalTruthStore,
  NoopAnalytics,
  NoopLeadSink,
  SilentAuditSink
} from "../../dist/core/index.js";
import { FixtureAdapter, FIXTURE_SLOTS } from "../../dist/adapters/fixture/index.js";
import { createAgentPortServer } from "../../dist/server/index.js";

let httpServer;
let endpoint;
let nextId = 1;
let issuerId = 1;
let tokenIssueId = 1;
const issuerKey = keyPair("issuer-key-1");
const agentKey = keyPair("agent-key-1");
const stolenAgentKey = keyPair("stolen-agent-key-1");
const issuer = new LocalDelegationIssuer({
  issuer: "issuer_mobile",
  signingKey: issuerKey,
  jwksUri: "https://issuer.example.test/jwks.json",
  now: () => new Date("2026-06-20T00:00:00.000Z"),
  idFactory: (prefix) => `${prefix}_${issuerId++}`
});

before(async () => {
  const adapters = [new FixtureAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/virtual-store-tenant.json"));

  const agentPort = createAgentPortServer({
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth: new DelegationTokenAuth({
      trustedIssuers: ["issuer_mobile"],
      delegationPublicKeys: {
        [issuer.jwks().keys[0].kid]: issuer.jwks().keys[0]
      },
      now: () => new Date("2026-06-20T00:00:00.000Z"),
      dpopMaxAgeSeconds: 300
    }),
    audit: new SilentAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    delegation: {
      requireForStateChanging: true,
      audience: "agentport:mobile-test",
      trustedIssuers: ["issuer_mobile"],
      requireReplayProtection: true,
      requireTokenConfirmation: true,
      tokenConfirmationMethods: ["dpop"],
      layers: {
        commit: { requireApprovedIntent: false }
      },
      now: () => new Date("2026-06-20T00:00:00.000Z")
    }
  });

  httpServer = await agentPort.listen({ port: 0 });
  const address = httpServer.address();
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
});

after(async () => {
  if (!httpServer) {
    return;
  }

  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
});

describe("client token emission", () => {
  it("books when the client emits a signed delegation token and matching DPoP proof", async () => {
    const headers = await emittedHeaders();
    const result = await book(headers, bookingArguments());

    assert.equal(result.type, "confirmed");
    assert.equal(result.confirmationId, "fixture-product_demo-0001");
  });

  it("rejects a signed delegation token without proof-of-possession", async () => {
    const { dpop: _dpop, ...headers } = await emittedHeaders();
    const result = await book(headers, bookingArguments());

    assert.equal(result.type, "rejected");
    assert.equal(result.reason, "delegation_required");
  });

  it("rejects an expired DPoP proof before action execution", async () => {
    const headers = await emittedHeaders({ dpopIat: 1781913200 });
    const result = await book(headers, bookingArguments());

    assert.equal(result.type, "rejected");
    assert.equal(result.reason, "delegation_required");
  });

  it("rejects a stolen delegation token signed with the wrong DPoP key", async () => {
    const token = await issuedToken();
    const dpop = emitDpopProof({
      method: "MCP",
      url: "/mcp",
      delegationToken: token,
      jti: "dpop-stolen-001",
      iat: 1781913600,
      keyId: stolenAgentKey.keyId,
      privateKeyPem: stolenAgentKey.privateKeyPem,
      jwkThumbprint: stolenAgentKey.jwkThumbprint
    });

    const result = await book({
      "agentport-delegation": token,
      dpop
    }, bookingArguments());

    assert.equal(result.type, "rejected");
    assert.equal(result.reason, "delegation_required");
  });

  it("rejects a tampered delegation token before action execution", async () => {
    const headers = await emittedHeaders();
    headers["agentport-delegation"] = tamperPayload(headers["agentport-delegation"]);
    const response = await rpc("tools/call", {
      name: "book_service",
      arguments: bookingArguments()
    }, headers);

    assert.equal(response.result, undefined);
    assert.match(response.error.message, /^unauthorized:book/);
  });

  it("rejects when the signed action intent does not match the requested slot", async () => {
    const headers = await emittedHeaders({
      actionIntent: {
        ...actionIntent(),
        slotStart: FIXTURE_SLOTS[1].start
      }
    });
    const result = await book(headers, bookingArguments());

    assert.equal(result.type, "rejected");
    assert.equal(result.reason, "delegation_action_intent_mismatch");
  });

  it("rejects a token self-signed by the client agent", async () => {
    const token = emitDelegationToken(delegationPayload(), {
      issuer: "issuer_mobile",
      keyId: agentKey.keyId,
      privateKeyPem: agentKey.privateKeyPem
    });
    const dpop = emitDpopProof({
      method: "MCP",
      url: "/mcp",
      delegationToken: token,
      jti: "dpop-self-signed-001",
      iat: 1781913600,
      keyId: agentKey.keyId,
      privateKeyPem: agentKey.privateKeyPem,
      jwkThumbprint: agentKey.jwkThumbprint
    });

    const response = await rpc("tools/call", {
      name: "book_service",
      arguments: bookingArguments()
    }, {
      "agentport-delegation": token,
      dpop
    });

    assert.equal(response.result, undefined);
    assert.match(response.error.message, /^unauthorized:book/);
  });

  it("keeps issuer signing material out of pending requests and JWKS", async () => {
    const pending = await issuer.createRequest(issueRequest());
    const jwks = issuer.jwks();

    assert.equal(pending.userSubject, undefined);
    assert.equal(pending.privateKeyPem, undefined);
    assert.equal(jwks.keys[0].d, undefined);
    assert.equal(issuer.privateKeyPem, undefined);
  });

  it("records issuer consent status and revocation without exposing signing authority", async () => {
    const pending = await issuer.createRequest(issueRequest({ challengeId: "challenge_status_001" }));
    const issued = await issuer.approveRequest({
      requestId: pending.requestId,
      userSubject: "user_mobile_001",
      consentId: "consent_status_001",
      approvedAt: "2026-06-20T00:00:00.000Z"
    });

    const issuedStatus = await issuer.status(issued.delegation.delegationId);
    assert.equal(issuedStatus.status, "issued");
    assert.equal(issuedStatus.consent.actionIntentHash, issued.delegation.actionIntentHash);

    assert.equal(await issuer.revoke(issued.delegation.delegationId, "2026-06-20T00:01:00.000Z"), true);
    const revokedStatus = await issuer.status(issued.consent.consentId);
    assert.equal(revokedStatus.status, "revoked");
    assert.equal(revokedStatus.consent.revokedAt, "2026-06-20T00:01:00.000Z");
  });
});

async function book(headers, args) {
  const response = await rpc("tools/call", {
    name: "book_service",
    arguments: args
  }, headers);

  assert.equal(response.error, undefined);
  return response.result.structuredContent;
}

async function rpc(method, params, headers = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
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

async function emittedHeaders(overrides = {}) {
  const issueId = overrides.issueId ?? tokenIssueId++;
  const token = await issuedToken({ ...overrides, issueId });
  const dpop = emitDpopProof({
    method: "MCP",
    url: "/mcp",
    delegationToken: token,
    jti: overrides.jti ?? `dpop-${issueId}`,
    iat: overrides.dpopIat ?? 1781913600,
    keyId: agentKey.keyId,
    privateKeyPem: agentKey.privateKeyPem,
    jwkThumbprint: agentKey.jwkThumbprint
  });

  return {
    "agentport-delegation": token,
    dpop
  };
}

async function issuedToken(overrides = {}) {
  const issueId = overrides.issueId ?? tokenIssueId++;
  const pending = await issuer.createRequest(issueRequest(overrides));
  const result = await issuer.approveRequest({
    requestId: pending.requestId,
    userSubject: "user_mobile_001",
    consentId: overrides.consentId ?? `consent_mobile_${issueId}`,
    approvedAt: "2026-06-20T00:00:00.000Z"
  });

  return result.delegationToken;
}

function issueRequest(overrides = {}) {
  const issueId = overrides.issueId ?? tokenIssueId;
  return {
    agentId: "agent_mobile_chat",
    scopes: ["book"],
    approvedActions: ["book_service"],
    audience: "agentport:mobile-test",
    challengeId: overrides.challengeId ?? `challenge_mobile_${issueId}`,
    tokenConfirmation: {
      method: "dpop",
      keyId: agentKey.keyId,
      jwkThumbprint: agentKey.jwkThumbprint
    },
    expiresAt: "2026-07-20T00:00:00.000Z",
    assurance: "account",
    actionIntent: overrides.actionIntent ?? actionIntent()
  };
}

function delegationPayload(overrides = {}) {
  return {
    delegationId: overrides.delegationId ?? "del_self_signed_001",
    issuer: "issuer_mobile",
    userSubject: "user_mobile_001",
    agentId: "agent_mobile_chat",
    consentId: "consent_mobile_001",
    scopes: ["book"],
    approvedActions: ["book_service"],
    businessId: "agentport-virtual-store",
    serviceId: "product_demo",
    audience: "agentport:mobile-test",
    challengeId: "challenge_mobile_001",
    tokenConfirmation: {
      method: "dpop",
      keyId: agentKey.keyId,
      jwkThumbprint: agentKey.jwkThumbprint
    },
    expiresAt: "2026-07-20T00:00:00.000Z",
    issuedAt: "2026-06-20T00:00:00.000Z",
    assurance: "account",
    actionIntent: overrides.actionIntent ?? actionIntent()
  };
}

function actionIntent() {
  return {
    action: "book_service",
    businessId: "agentport-virtual-store",
    serviceId: "product_demo",
    requestedType: "confirmed",
    slotStart: FIXTURE_SLOTS[0].start,
    customerFields: ["name"],
    consentText: [
      "I understand this agent represents me for this action.",
      "I approve this exact action with this business.",
      "I approve sharing only the required customer details."
    ],
    expiresAt: "2026-07-20T00:00:00.000Z"
  };
}

function bookingArguments() {
  return {
    businessId: "agentport-virtual-store",
    serviceId: "product_demo",
    requestedType: "confirmed",
    customer: { name: "Ada Lovelace" },
    slotStart: FIXTURE_SLOTS[0].start,
    userConsent: true
  };
}

function keyPair(keyId) {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return compactTokenKeyPairFromPem(keyId, privateKeyPem);
}

function tamperPayload(token) {
  const [header, payload, signature] = token.split(".");
  const decoded = JSON.parse(base64UrlDecode(payload).toString("utf8"));
  decoded.businessId = "tampered-business";
  return `${header}.${base64UrlEncode(JSON.stringify(decoded))}.${signature}`;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
