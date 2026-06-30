import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { AcpCheckoutAuthorityVerifier, Ap2MandateAuthorityVerifier, authorityContextFromDelegationProof, businessPortTrustRootBundleHash, businessPortTrustRootFromBundle, DevAuth, Ed25519BusinessPortAttestationSigner, loadBusinessPortTrustRootBundle, LocalJsonTenantStore, LocalTruthStore, LocalUserAuthorityProvider, NoopAnalytics, NoopLeadSink, StaticBusinessPortAttestationProvider, StaticBusinessPortAttestationStore, StaticUserAuthorityTrustStore, TrustAnchoredBusinessPortAttestationProvider, TrustAnchoredUserAuthorityProvider, UcpHttpSignatureAuthorityVerifier } from "../../dist/core/index.js";
import { FixtureAdapter, FIXTURE_SLOTS } from "../../dist/adapters/fixture/index.js";
import { ManualAdapter } from "../../dist/adapters/manual/index.js";
import { bookService, cancelService, rescheduleService } from "../../dist/server/index.js";

const businessPortSigningKeys = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
const businessPortSigner = new Ed25519BusinessPortAttestationSigner(
  "agentport",
  "business-port-runtime-key",
  businessPortSigningKeys.privateKey
);

function runtime({ auth = new DevAuth(), audit = new MemoryAuditSink(), businessPorts, delegation, receipts, leads = new NoopLeadSink(), userAuthority } = {}) {
  const adapters = [new ManualAdapter(), new FixtureAdapter()];
  const adapterMap = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
  const tenants = new LocalJsonTenantStore(resolve(process.cwd(), "examples/sample-tenant.json"));

  return {
    adapters: adapterMap,
    tenants,
    truth: new LocalTruthStore(tenants, adapterMap),
    auth,
    audit,
    analytics: new NoopAnalytics(),
    leads,
    userAuthority,
    businessPorts,
    delegation: withLocalProfileIntentRelaxation(delegation),
    receipts
  };
}

function withLocalProfileIntentRelaxation(delegation = {}) {
  return {
    ...delegation,
    layers: {
      ...delegation.layers,
      commit: {
        requireApprovedIntent: false,
        ...delegation.layers?.commit
      },
      manage: {
        requireApprovedIntent: false,
        ...delegation.layers?.manage
      },
      funds: {
        requireApprovedIntent: false,
        ...delegation.layers?.funds
      }
    }
  };
}

describe("verified delegation", () => {
  it("normalizes local delegation proof into authority context without raw token material", () => {
    const authority = authorityContextFromDelegationProof(validDelegation());

    assert.equal(authority.caller.agentId, "agent_789");
    assert.equal(authority.caller.agentKeyThumbprint, "jkt_123");
    assert.equal(authority.user.subjectRef, "user_456");
    assert.equal(authority.user.consentRef, "consent_abc");
    assert.equal(authority.action.layer, "commit");
    assert.equal(authority.action.businessId, "verified-spa");
    assert.equal(authority.action.serviceId, "massage");
    assert.equal(authority.assurance, "signed");
    assert.equal(authority.validity.replayHandle, "challenge_123");
    assert.deepEqual(authority.evidence, [{
      kind: "agentport-local-delegation",
      ref: "del_123",
      issuer: "issuer_test"
    }]);
  });

  it("normalizes AP2 mandate evidence through an injected verifier", async () => {
    const verifier = new Ap2MandateAuthorityVerifier({
      trustedIssuers: ["ap2_issuer"],
      audience: "agentport:test",
      now: () => new Date("2026-06-19T00:00:00.000Z"),
      async verify(evidence) {
        assert.equal(evidence.mandateRef, "ap2_mandate_123");
        return { ok: true };
      }
    });

    const result = await verifier.normalize(validAp2Mandate());

    assert.equal(result.ok, true);
    assert.equal(result.authority.assurance, "verified-mandate");
    assert.equal(result.authority.caller.agentId, "agent_ap2");
    assert.equal(result.authority.user.subjectRef, "user_ap2");
    assert.equal(result.authority.user.consentRef, "consent_ap2");
    assert.equal(result.authority.action.layer, "commit");
    assert.equal(result.authority.action.businessId, "verified-spa");
    assert.equal(result.authority.action.serviceId, "massage");
    assert.equal(result.authority.validity.replayHandle, "nonce_ap2");
    assert.deepEqual(result.authority.evidence, [{
      kind: "ap2-mandate",
      ref: "ap2_mandate_123",
      issuer: "ap2_issuer"
    }]);
  });

  it("exposes UCP and ACP authority profiles as rejecting verifier seams", async () => {
    const ucp = new UcpHttpSignatureAuthorityVerifier();
    const acp = new AcpCheckoutAuthorityVerifier();

    assert.equal(ucp.profile, "ucp-http-signature");
    assert.equal(acp.profile, "acp-checkout");
    assert.deepEqual(await ucp.normalize({}), {
      ok: false,
      reason: "authority_verification_failed"
    });
    assert.deepEqual(await acp.normalize({}), {
      ok: false,
      reason: "authority_verification_failed"
    });
  });

  it("normalizes deterministic authority evidence profile fixtures", async () => {
    const fixtures = await loadAuthorityEvidenceProfileFixtures();
    const verifier = ap2FixtureVerifier(fixtures);

    const accepted = authorityProfileFixture(fixtures, "ap2.accepted.confirm");
    const acceptedResult = await verifier.normalize(accepted.evidence);
    assert.equal(acceptedResult.ok, true);
    assert.equal(acceptedResult.authority.assurance, accepted.expected.assurance);
    assert.equal(acceptedResult.authority.action.layer, "commit");
    assert.deepEqual(acceptedResult.authority.evidence, [{
      kind: "ap2-mandate",
      ref: accepted.evidence.mandateRef,
      issuer: accepted.evidence.issuer
    }]);

    const requestBound = authorityProfileFixture(fixtures, "ap2.downgraded.request-bound");
    const requestBoundResult = await verifier.normalize(requestBound.evidence);
    assert.equal(requestBoundResult.ok, true);
    assert.equal(requestBoundResult.authority.assurance, requestBound.expected.assurance);
    assert.equal(requestBoundResult.authority.action.layer, "lead");
    assert.equal(requestBoundResult.authority.action.bounds.requestedType, "request");

    for (const id of ["ap2.stale", "ap2.revoked", "ap2.wrong-audience"]) {
      const fixture = authorityProfileFixture(fixtures, id);
      const result = await verifier.normalize(fixture.evidence);
      assert.deepEqual(result, {
        ok: false,
        reason: fixture.expected.reason
      });
    }

    const ucp = new UcpHttpSignatureAuthorityVerifier();
    const acp = new AcpCheckoutAuthorityVerifier();
    for (const [verifier, id] of [
      [ucp, "ucp.stub.rejected"],
      [acp, "acp.stub.rejected"]
    ]) {
      const fixture = authorityProfileFixture(fixtures, id);
      assert.deepEqual(await verifier.normalize(fixture.evidence), {
        ok: false,
        reason: fixture.expected.reason
      });
    }
  });

  it("rejects state-changing actions when delegation is required but absent", async () => {
    const result = await bookService(runtime({
      delegation: { requireForStateChanging: true }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_required"
    });
  });

  it("allows booking when the auth layer supplies a matching delegation proof", async () => {
    const audit = new MemoryAuditSink();
    const result = await bookService(runtime({
      audit,
      auth: authWithDelegation(validDelegation()),
      delegation: {
        requireForStateChanging: true,
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "confirmed");
    assert.equal(audit.events.at(-1).metadata.delegation.delegationId, "del_123");
    assert.equal(audit.events.at(-1).metadata.delegation.issuer, "issuer_test");
    assert.equal(audit.events.at(-1).metadata.delegation.userSubject, "user_456");
    assert.equal(audit.events.at(-1).metadata.delegation.agentId, "agent_789");
    assert.equal(audit.events.at(-1).metadata.delegation.consentId, "consent_abc");
    assert.equal(audit.events.at(-1).metadata.delegation.audience, "agentport:test");
    assert.equal(audit.events.at(-1).metadata.delegation.challengeId, "challenge_123");
    assert.equal(audit.events.at(-1).metadata.delegation.tokenConfirmation.method, "dpop");
    assert.equal(audit.events.at(-1).metadata.delegation.tokenConfirmation.jwkThumbprint, "jkt_123");
    assert.equal(audit.events.at(-1).metadata.actionLayer, "commit");
  });

  it("rejects risky actions when user authority is required but missing", async () => {
    const result = await bookService(runtime({
      userAuthority: {
        requireForStateChanging: true,
        provider: new LocalUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "user_authority_required"
    });
  });

  it("rejects user authority for the wrong audience", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        audience: "other-runtime"
      }),
      userAuthority: {
        requireForStateChanging: true,
        provider: new LocalUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "user_authority_audience_mismatch"
    });
  });

  it("rejects valid user authority when the gateway requires a different technology", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      userAuthority: {
        requireForStateChanging: true,
        allowedTechnologies: ["ap2-mandate"],
        provider: new LocalUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "user_authority_technology_not_allowed"
    });
  });

  it("allows passkey-backed user authority under a passkey-only gateway policy", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        assurance: "passkey"
      }),
      userAuthority: {
        requireForStateChanging: true,
        allowedTechnologies: ["passkey"],
        provider: new LocalUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z"),
          requireNonce: true
        })
      },
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt.userAuthorityTechnology, "passkey");
    assert.equal(result.receipt.userAuthorityAssurance, "passkey");
  });

  it("lets a layer-specific technology policy override the global user authority policy", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon",
        serviceId: "haircut",
        assurance: "session",
        tokenConfirmation: {
          method: "session",
          sessionId: "session_layer_override"
        }
      }),
      userAuthority: {
        requireForStateChanging: true,
        allowedTechnologies: ["passkey"],
        layers: {
          lead: {
            requireAuthority: true,
            allowedTechnologies: ["oidc-session"]
          }
        },
        provider: new LocalUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z"),
          requireNonce: true
        })
      }
    }), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada" },
      userConsent: true,
      requestedType: "request"
    });

    assert.equal(result.type, "handoff");
  });

  it("rejects user authority when the hosted trust root has no active record", async () => {
    for (const [trustStore, reason] of [
      [new StaticUserAuthorityTrustStore(), "user_authority_untrusted"],
      [new StaticUserAuthorityTrustStore([validUserAuthorityTrustRecord({ status: "revoked" })]), "user_authority_revoked"],
      [new StaticUserAuthorityTrustStore([validUserAuthorityTrustRecord({ status: "stale" })]), "user_authority_stale"]
    ]) {
      const result = await bookService(runtime({
        auth: authWithDelegation(validDelegation()),
        userAuthority: {
          requireForStateChanging: true,
          provider: new TrustAnchoredUserAuthorityProvider({
            audience: "agentport:test",
            now: () => new Date("2026-06-19T00:00:00.000Z"),
            trustStore
          })
        }
      }), {
        businessId: "verified-spa",
        serviceId: "massage",
        customer: { name: "Ada" },
        userConsent: true,
        slotStart: FIXTURE_SLOTS[0].start
      });

      assert.deepEqual(result, {
        type: "rejected",
        reason
      });
    }
  });

  it("rejects risky actions when the business-port trust root has no attestation", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore()
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "business_port_attestation_required"
    });
  });

  it("rejects risky actions when business-port attestation is required but missing", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: { requireForStateChanging: true }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "business_port_attestation_required"
    });
  });

  it("rejects unsigned business-port attestations when a runtime trust root is configured", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([validBusinessPortAttestation()]),
          trustRoot: businessPortTrustRoot(),
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "business_port_signature_required"
    });
  });

  it("warns but allows a low-risk lead when policy permits unsigned familiar business-port evidence", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon",
        serviceId: "haircut"
      }),
      businessPorts: {
        requireForStateChanging: true,
        layers: {
          lead: {
            requireAttestation: true,
            onVerificationFailure: "warn",
            warningMessage: "You have used this business before, but this endpoint is not fully verified.",
            allowedFallback: "handoff",
            familiarBusinessPort: true
          }
        },
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([validBusinessPortAttestation({
            businessId: "sample-salon",
            bindingId: "manual#0",
            platform: "manual",
            portId: "sample-salon-manual-port",
            ref: "agentport-business-port:sample-salon:manual#0"
          })]),
          trustRoot: businessPortTrustRoot(),
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      },
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada" },
      userConsent: true,
      requestedType: "request"
    });

    assert.equal(result.type, "handoff");
    assert.equal(result.risk.decision, "warn");
    assert.equal(result.risk.reason, "business_port_signature_required");
    assert.equal(result.risk.familiarBusinessPort, true);
    assert.equal(result.receipt.riskDecision, "warn");
    assert.equal(result.receipt.riskReason, "business_port_signature_required");
    assert.equal(result.receipt.riskUserMessage, "You have used this business before, but this endpoint is not fully verified.");
    assert.equal(result.receipt.riskAllowedFallback, "handoff");
    assert.equal(result.receipt.riskFamiliarBusinessPort, true);
    assert.equal(result.receipt.businessPortRef, "agentport-business-port:sample-salon:manual#0");
  });

  it("asks for step-up instead of executing a commit action when policy requires stronger business-port proof", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        layers: {
          commit: {
            requireAttestation: true,
            onVerificationFailure: "step_up",
            warningMessage: "Confirming this booking needs a signed business-port attestation."
          }
        },
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([validBusinessPortAttestation()]),
          trustRoot: businessPortTrustRoot(),
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "rejected");
    assert.equal(result.reason, "business_port_signature_required");
    assert.equal(result.risk.decision, "step_up");
    assert.equal(result.risk.level, "high");
    assert.equal(result.risk.userMessage, "Confirming this booking needs a signed business-port attestation.");
  });

  it("downgrades a risky booking to handoff when policy allows only lower-risk fallback", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        layers: {
          commit: {
            requireAttestation: true,
            onVerificationFailure: "downgrade",
            allowedFallback: "handoff"
          }
        }
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "handoff");
    assert.equal(result.reason, "business_port_attestation_required");
    assert.equal(result.risk.decision, "downgrade");
    assert.equal(result.risk.allowedFallback, "handoff");
  });

  it("blocks phishing-style business-port mismatches even when a lead policy would otherwise warn", async () => {
    const mismatchAttestation = validBusinessPortAttestation({
      businessId: "sample-salon",
      bindingId: "manual#0",
      platform: "manual"
    });
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon",
        serviceId: "haircut"
      }),
      businessPorts: {
        requireForStateChanging: true,
        layers: {
          lead: {
            requireAttestation: true,
            onVerificationFailure: "warn",
            warningMessage: "This would normally be a warning."
          }
        },
        provider: {
          async verify() {
            return {
              ok: false,
              reason: "business_port_binding_mismatch",
              attestation: mismatchAttestation
            };
          }
        }
      }
    }), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada" },
      userConsent: true,
      requestedType: "request"
    });

    assert.equal(result.type, "rejected");
    assert.equal(result.reason, "business_port_binding_mismatch");
    assert.equal(result.risk.decision, "reject");
    assert.equal(result.risk.level, "critical");
  });

  it("rejects tampered signed business-port attestations before adapter execution", async () => {
    const signed = signedBusinessPortAttestation();
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([{
            ...signed,
            attestation: {
              ...signed.attestation,
              endpoint: "https://phishing.example/book"
            }
          }]),
          trustRoot: businessPortTrustRoot(),
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "business_port_signature_invalid"
    });
  });

  it("rejects signed business-port attestations from revoked or stale trust-root keys", async () => {
    for (const [status, reason] of [
      ["revoked", "business_port_signature_key_revoked"],
      ["stale", "business_port_signature_key_stale"]
    ]) {
      const result = await bookService(runtime({
        auth: authWithDelegation(validDelegation()),
        businessPorts: {
          requireForStateChanging: true,
          provider: new TrustAnchoredBusinessPortAttestationProvider({
            store: new StaticBusinessPortAttestationStore([signedBusinessPortAttestation()]),
            trustRoot: businessPortTrustRoot({ keyStatus: status }),
            now: () => new Date("2026-06-19T00:00:00.000Z")
          })
        }
      }), {
        businessId: "verified-spa",
        serviceId: "massage",
        customer: { name: "Ada" },
        userConsent: true,
        slotStart: FIXTURE_SLOTS[0].start
      });

      assert.deepEqual(result, {
        type: "rejected",
        reason
      });
    }
  });

  it("rejects signed business-port attestations from untrusted issuers or missing trust-root keys", async () => {
    for (const [trustRoot, reason] of [
      [businessPortTrustRoot({ trustedIssuers: ["other-issuer"] }), "business_port_signature_issuer_untrusted"],
      [businessPortTrustRoot({ publicKeys: {} }), "business_port_signature_key_missing"]
    ]) {
      const result = await bookService(runtime({
        auth: authWithDelegation(validDelegation()),
        businessPorts: {
          requireForStateChanging: true,
          provider: new TrustAnchoredBusinessPortAttestationProvider({
            store: new StaticBusinessPortAttestationStore([signedBusinessPortAttestation()]),
            trustRoot,
            now: () => new Date("2026-06-19T00:00:00.000Z")
          })
        }
      }), {
        businessId: "verified-spa",
        serviceId: "massage",
        customer: { name: "Ada" },
        userConsent: true,
        slotStart: FIXTURE_SLOTS[0].start
      });

      assert.deepEqual(result, {
        type: "rejected",
        reason
      });
    }
  });

  it("accepts signed business-port attestations from the runtime trust root", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([signedBusinessPortAttestation()]),
          trustRoot: businessPortTrustRoot(),
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      },
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt.businessPortRef, "agentport-business-port:verified-spa:fixture#0");
    assert.equal(result.receipt.businessPortStatus, "verified");
    assert.equal(result.receipt.businessPortVerifiedBy, "agentport");
  });

  it("derives runtime business-port trust from a pinned trust-root bundle", async () => {
    const bundle = businessPortTrustRootBundle();
    const trustRoot = businessPortTrustRootFromBundle(bundle, {
      trustedIssuers: ["agentport"],
      now: () => new Date("2026-06-20T00:00:00.000Z"),
      requireFreshBundle: true,
      expectedBundleHash: businessPortTrustRootBundleHash(bundle),
      minimumBundleSequence: 1
    });
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([signedBusinessPortAttestation()]),
          trustRoot,
          now: () => new Date("2026-06-20T00:00:00.000Z")
        })
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "confirmed");
  });

  it("rejects invalid business-port trust-root bundles before runtime trust is created", () => {
    const bundle = businessPortTrustRootBundle();
    const bundleHash = businessPortTrustRootBundleHash(bundle);

    assert.throws(() => {
      businessPortTrustRootFromBundle(businessPortTrustRootBundle({ keyStatus: "revoked" }), {
        trustedIssuers: ["agentport"],
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_key_revoked/);

    assert.throws(() => {
      businessPortTrustRootFromBundle(businessPortTrustRootBundle({ keyStatus: "stale" }), {
        trustedIssuers: ["agentport"],
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_key_stale/);

    assert.throws(() => {
      businessPortTrustRootFromBundle({ ...bundle, authorities: [{ issuer: "agentport", publicKeys: [] }] }, {
        trustedIssuers: ["agentport"],
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_key_missing/);

    assert.throws(() => {
      businessPortTrustRootFromBundle(businessPortTrustRootBundle({ issuer: "agentport:other" }), {
        trustedIssuers: ["agentport"],
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_issuer_untrusted/);

    assert.throws(() => {
      businessPortTrustRootFromBundle(businessPortTrustRootBundle({ keyId: "business-port-substituted-key" }), {
        trustedIssuers: ["agentport"],
        expectedBundleHash: bundleHash,
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_hash_mismatch/);

    assert.throws(() => {
      businessPortTrustRootFromBundle({ ...bundle, expiresAt: "2026-06-19T00:00:00.000Z" }, {
        trustedIssuers: ["agentport"],
        requireFreshBundle: true,
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_expired/);

    const rollbackBundle = { ...bundle, sequence: 0 };
    assert.throws(() => {
      businessPortTrustRootFromBundle(rollbackBundle, {
        trustedIssuers: ["agentport"],
        trustedBundleHashes: [businessPortTrustRootBundleHash(rollbackBundle)],
        minimumBundleSequence: 1,
        now: () => new Date("2026-06-20T00:00:00.000Z")
      });
    }, /business_port_trust_root_bundle_sequence_rollback/);
  });

  it("loads a business-port trust-root bundle from a file", async () => {
    const dir = await mkdtemp(`${tmpdir()}/agentport-business-port-root-`);
    try {
      const path = `${dir}/business-port-trust-root.json`;
      const bundle = businessPortTrustRootBundle();
      await writeFile(path, JSON.stringify(bundle, null, 2), "utf8");
      const trustRoot = await loadBusinessPortTrustRootBundle(path, {
        trustedIssuers: ["agentport"],
        expectedBundleHash: businessPortTrustRootBundleHash(bundle),
        now: () => new Date("2026-06-20T00:00:00.000Z"),
        requireFreshBundle: true
      });

      assert.deepEqual(trustRoot.trustedIssuers, ["agentport"]);
      assert.equal(typeof trustRoot.publicKeys["business-port-runtime-key"], "object");
      assert.equal(trustRoot.keyStatuses["business-port-runtime-key"], "active");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the checked-in business-port trust-root artifact parseable", async () => {
    const artifact = JSON.parse(await readFile("artifacts/agentport-business-port-trust-root-bundle.v0.1.json", "utf8"));
    const trustRoot = businessPortTrustRootFromBundle(artifact, {
      trustedIssuers: ["agentport"],
      now: () => new Date("2026-06-20T00:00:00.000Z"),
      requireFreshBundle: true,
      expectedBundleHash: businessPortTrustRootBundleHash(artifact)
    });

    assert.deepEqual(trustRoot.trustedIssuers, ["agentport"]);
    assert.equal(trustRoot.keyStatuses["business-port-runtime-key-demo"], "active");
  });

  it("rejects phishing-port mismatches before adapter execution", async () => {
    const phishingAttestation = validBusinessPortAttestation({ bindingId: "manual#0" });
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      businessPorts: {
        requireForStateChanging: true,
        provider: {
          async verify() {
            return {
              ok: false,
              reason: "business_port_binding_mismatch",
              attestation: phishingAttestation
            };
          }
        }
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "business_port_binding_mismatch"
    });
  });

  it("rejects stale and revoked business-port attestations before adapter execution", async () => {
    for (const [status, reason] of [
      ["stale", "business_port_stale"],
      ["revoked", "business_port_revoked"]
    ]) {
      const result = await bookService(runtime({
        auth: authWithDelegation(validDelegation()),
        businessPorts: {
          requireForStateChanging: true,
          provider: new StaticBusinessPortAttestationProvider([validBusinessPortAttestation({ status })])
        }
      }), {
        businessId: "verified-spa",
        serviceId: "massage",
        customer: { name: "Ada" },
        userConsent: true,
        slotStart: FIXTURE_SLOTS[0].start
      });

      assert.deepEqual(result, {
        type: "rejected",
        reason
      });
    }
  });

  it("binds verified business-port attestation into gateway receipts", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      userAuthority: {
        requireForStateChanging: true,
        provider: new TrustAnchoredUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z"),
          requireNonce: true,
          trustStore: new StaticUserAuthorityTrustStore([validUserAuthorityTrustRecord()])
        })
      },
      businessPorts: {
        requireForStateChanging: true,
        provider: new TrustAnchoredBusinessPortAttestationProvider({
          store: new StaticBusinessPortAttestationStore([validBusinessPortAttestation()]),
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      },
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt.userAuthorityRef, "agentport-local-delegation:del_123");
    assert.equal(result.receipt.userAuthoritySubject, "user_456");
    assert.equal(result.receipt.userAuthorityConsentRef, "consent_abc");
    assert.equal(result.receipt.userAuthorityAssurance, "test");
    assert.equal(result.receipt.userAuthorityTechnology, "agentport-local");
    assert.equal(result.receipt.businessPortRef, "agentport-business-port:verified-spa:fixture#0");
    assert.equal(result.receipt.businessPortId, "verified-spa-fixture-port");
    assert.equal(result.receipt.businessPortStatus, "verified");
    assert.equal(result.receipt.businessPortVerifiedBy, "agentport");
    assert.equal(result.receipt.authorityEvidence[0].ref, "del_123");
    assert.equal(result.commitment.business.businessId, "verified-spa");
  });

  it("rejects a delegation proof that does not approve the requested action", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        approvedActions: ["cancel_service"]
      })
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_action_not_approved"
    });
  });

  it("rejects an expired delegation before adapter execution", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        expiresAt: "2026-06-18T00:00:00.000Z"
      }),
      delegation: {
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_expired"
    });
  });

  it("enforces business and service bounds from the delegation proof", async () => {
    const wrongBusiness = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon"
      })
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });
    const wrongService = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        serviceId: "haircut"
      })
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      customer: { name: "Ada" },
      userConsent: true,
      slotStart: FIXTURE_SLOTS[0].start
    });

    assert.equal(wrongBusiness.reason, "delegation_business_mismatch");
    assert.equal(wrongService.reason, "delegation_service_mismatch");
  });

  it("applies delegation requirements to manage actions", async () => {
    const result = await cancelService(runtime({
      delegation: { requireForStateChanging: true }
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      confirmationId: "fixture-massage-0001",
      userConsent: true
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_required"
    });
  });

  it("rejects a delegation proof for the wrong audience", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        audience: "other-runtime"
      }),
      delegation: {
        audience: "agentport:test"
      }
    }), {
      ...bookingInput(),
      requestedType: "confirmed"
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_audience_mismatch"
    });
  });

  it("rejects a delegation proof from an untrusted issuer", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        issuer: "issuer_unknown"
      }),
      delegation: {
        trustedIssuers: ["issuer_test"]
      }
    }), {
      ...bookingInput(),
      requestedType: "confirmed"
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_untrusted_issuer"
    });
  });

  it("requires replay protection when production policy asks for it", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        challengeId: undefined,
        nonce: undefined
      }),
      delegation: {
        requireReplayProtection: true
      }
    }), {
      ...bookingInput(),
      requestedType: "confirmed"
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_replay_protection_required"
    });
  });

  it("rejects reuse of the same delegation challenge when replay checking is configured", async () => {
    const replay = new MemoryReplayStore();
    const proof = validDelegation();
    const testRuntime = runtime({
      auth: authWithDelegation(proof),
      delegation: {
        replay,
        requireReplayProtection: true
      }
    });

    const first = await bookService(testRuntime, bookingInput());
    const second = await bookService(testRuntime, bookingInput());

    assert.equal(first.type, "confirmed");
    assert.deepEqual(second, {
      type: "rejected",
      reason: "delegation_replay_detected"
    });
  });

  it("lets an injected verifier reject revoked or invalid proofs", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      delegation: {
        verifier: {
          async verify() {
            return {
              ok: false,
              reason: "delegation_revoked"
            };
          }
        }
      }
    }), {
      ...bookingInput(),
      requestedType: "confirmed"
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_revoked"
    });
  });

  it("allows lower-assurance lead requests while requiring stronger assurance for commit bookings", async () => {
    const lead = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon",
        serviceId: "haircut",
        assurance: "session"
      }),
      delegation: {
        layers: {
          lead: {
            requireDelegation: true,
            minAssurance: "session"
          },
          commit: {
            requireDelegation: true,
            minAssurance: "account"
          }
        }
      }
    }), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada" },
      userConsent: true,
      requestedType: "request"
    });

    const commit = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        assurance: "session"
      }),
      delegation: {
        layers: {
          commit: {
            requireDelegation: true,
            minAssurance: "account"
          }
        }
      }
    }), bookingInput());

    assert.equal(lead.type, "handoff");
    assert.deepEqual(commit, {
      type: "rejected",
      reason: "delegation_assurance_too_low"
    });
  });

  it("treats omitted booking requestedType as commit-level", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        assurance: "session"
      }),
      delegation: {
        layers: {
          lead: {
            requireDelegation: true,
            minAssurance: "session"
          },
          commit: {
            requireDelegation: true,
            minAssurance: "account"
          }
        }
      }
    }), bookingInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_assurance_too_low"
    });
  });

  it("does not let a lead-layer request escalate into a confirmed booking", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        assurance: "session"
      }),
      delegation: {
        layers: {
          lead: {
            requireDelegation: true,
            minAssurance: "session"
          }
        }
      }
    }), {
      ...bookingInput(),
      requestedType: "request"
    });

    assert.deepEqual(result, {
      type: "rejected",
      reason: "requested_type_escalated"
    });
  });

  it("applies manage layer policy to cancel and reschedule", async () => {
    const testRuntime = runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        scopes: ["cancel"],
        approvedActions: ["cancel_service", "reschedule_service"],
        assurance: "session"
      }),
      delegation: {
        layers: {
          manage: {
            requireDelegation: true,
            minAssurance: "account"
          }
        }
      }
    });

    const cancel = await cancelService(testRuntime, {
      businessId: "verified-spa",
      serviceId: "massage",
      confirmationId: "fixture-massage-0001",
      userConsent: true
    });
    const reschedule = await rescheduleService(testRuntime, {
      businessId: "verified-spa",
      serviceId: "massage",
      confirmationId: "fixture-massage-0001",
      newSlotStart: FIXTURE_SLOTS[1].start,
      userConsent: true
    });

    assert.deepEqual(cancel, {
      type: "rejected",
      reason: "delegation_assurance_too_low"
    });
    assert.deepEqual(reschedule, {
      type: "rejected",
      reason: "delegation_assurance_too_low"
    });
  });

  it("rejects missing token confirmation when a layer requires it", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        tokenConfirmation: undefined
      }),
      delegation: {
        layers: {
          commit: {
            requireDelegation: true,
            requireTokenConfirmation: true
          }
        }
      }
    }), bookingInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_token_confirmation_required"
    });
  });

  it("rejects unsupported token confirmation methods for a layer", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        tokenConfirmation: {
          method: "session",
          sessionId: "session_123"
        }
      }),
      delegation: {
        layers: {
          commit: {
            requireDelegation: true,
            requireTokenConfirmation: true,
            tokenConfirmationMethods: ["dpop", "mtls"]
          }
        }
      }
    }), bookingInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_token_confirmation_method_unsupported"
    });
  });

  it("rejects malformed token confirmation details", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        tokenConfirmation: {
          method: "dpop",
          keyId: "key_without_thumbprint"
        }
      }),
      delegation: {
        layers: {
          commit: {
            requireDelegation: true,
            requireTokenConfirmation: true,
            tokenConfirmationMethods: ["dpop"]
          }
        }
      }
    }), bookingInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_token_confirmation_invalid"
    });
  });

  it("lets lead and commit layers require different token confirmation methods", async () => {
    const lead = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon",
        serviceId: "haircut",
        assurance: "session",
        tokenConfirmation: {
          method: "session",
          sessionId: "session_123"
        }
      }),
      delegation: {
        layers: {
          lead: {
            requireDelegation: true,
            minAssurance: "session",
            requireTokenConfirmation: true,
            tokenConfirmationMethods: ["session"]
          },
          commit: {
            requireDelegation: true,
            minAssurance: "account",
            requireTokenConfirmation: true,
            tokenConfirmationMethods: ["dpop", "mtls", "wallet"]
          }
        }
      }
    }), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada" },
      userConsent: true,
      requestedType: "request"
    });

    const commit = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        assurance: "account",
        tokenConfirmation: {
          method: "session",
          sessionId: "session_123"
        }
      }),
      delegation: {
        layers: {
          commit: {
            requireDelegation: true,
            minAssurance: "account",
            requireTokenConfirmation: true,
            tokenConfirmationMethods: ["dpop", "mtls", "wallet"]
          }
        }
      }
    }), bookingInput());

    assert.equal(lead.type, "handoff");
    assert.deepEqual(commit, {
      type: "rejected",
      reason: "delegation_token_confirmation_method_unsupported"
    });
  });

  it("returns a business-gateway receipt for confirmed booking outcomes", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation()),
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), bookingInput());

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt.issuer, "agentport:test-gateway");
    assert.equal(result.receipt.action, "book_service");
    assert.equal(result.receipt.actionLayer, "commit");
    assert.equal(result.receipt.businessId, "verified-spa");
    assert.equal(result.receipt.serviceId, "massage");
    assert.equal(result.receipt.resultType, "confirmed");
    assert.equal(result.receipt.delegationId, "del_123");
    assert.equal(result.receipt.consentId, "consent_abc");
    assert.equal(result.receipt.clientAgentId, "agent_789");
    assert.equal(result.receipt.userSubject, "user_456");
    assert.equal(result.receipt.authorityAssurance, "signed");
    assert.deepEqual(result.receipt.authorityEvidence, [{
      kind: "agentport-local-delegation",
      ref: "del_123",
      issuer: "issuer_test"
    }]);
    assert.equal(result.receipt.tokenConfirmationMethod, "dpop");
    assert.equal(result.receipt.backendConfirmationId, result.confirmationId);
    assert.equal(result.receipt.backendSource, "fixture");
    assert.equal(result.receipt.issuedAt, "2026-06-19T00:00:00.000Z");
    assert.match(result.receipt.payloadHash, /^[a-f0-9]{64}$/);
    assert.equal(result.receipt.receiptId, `receipt_${result.receipt.payloadHash.slice(0, 24)}`);
    assert.equal(result.receipt.signature, `sig:${result.receipt.payloadHash}`);
    assert.equal(result.commitment.protocol, "agentport-commitment");
    assert.equal(result.commitment.version, "0.1");
    assert.equal(result.commitment.status, "active");
    assert.match(result.commitment.commitmentId, /^commitment_[a-f0-9]{24}$/);
    assert.equal(result.commitment.subject.holderRef, "user_456");
    assert.equal(result.commitment.subject.clientAgentId, "agent_789");
    assert.deepEqual(result.commitment.business, {
      businessId: "verified-spa",
      serviceId: "massage",
      bindingId: "fixture#0"
    });
    assert.deepEqual(result.commitment.backend, {
      source: "fixture",
      confirmationId: result.confirmationId,
      systemOfRecord: true
    });
    assert.deepEqual(result.commitment.authority, {
      assurance: "signed",
      evidenceRefs: ["agentport-local-delegation:issuer_test:del_123"],
      delegationId: "del_123",
      consentId: "consent_abc"
    });
    assert.deepEqual(result.commitment.rights, {
      allowedActions: ["verify", "cancel", "reschedule"],
      transferable: false,
      modificationRequiresConsent: true,
      cancellationRequiresConsent: true
    });
    assert.deepEqual(result.commitment.events, [{
      eventId: `event_${result.receipt.payloadHash.slice(0, 24)}`,
      type: "created",
      at: "2026-06-19T00:00:00.000Z",
      actor: "business_gateway",
      receiptId: result.receipt.receiptId,
      backendConfirmationId: result.confirmationId
    }]);
    assert.deepEqual(result.commitment.receipts, [{
      receiptId: result.receipt.receiptId,
      action: "book_service",
      resultType: "confirmed",
      payloadHash: result.receipt.payloadHash,
      keyId: "gateway-key-1",
      signature: result.receipt.signature
    }]);
  });

  it("binds signed manage outcomes to the same backend commitment identity", async () => {
    const receipts = {
      signer: new MemoryReceiptSigner("agentport:test-gateway"),
      now: () => new Date("2026-06-19T00:00:00.000Z")
    };
    const cancelDelegation = {
      ...validDelegation(),
      scopes: ["cancel"],
      approvedActions: ["cancel_service"],
      actionIntent: {
        action: "cancel_service",
        businessId: "verified-spa",
        serviceId: "massage",
        confirmationId: "fixture-massage-0001"
      }
    };
    const rescheduleDelegation = {
      ...validDelegation(),
      scopes: ["cancel"],
      approvedActions: ["reschedule_service"],
      actionIntent: {
        action: "reschedule_service",
        businessId: "verified-spa",
        serviceId: "massage",
        confirmationId: "fixture-massage-0001",
        newSlotStart: FIXTURE_SLOTS[1].start
      }
    };

    const cancelled = await cancelService(runtime({
      auth: authWithDelegation(cancelDelegation),
      receipts
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      confirmationId: "fixture-massage-0001",
      userConsent: true
    });
    const rescheduled = await rescheduleService(runtime({
      auth: authWithDelegation(rescheduleDelegation),
      receipts
    }), {
      businessId: "verified-spa",
      serviceId: "massage",
      confirmationId: "fixture-massage-0001",
      newSlotStart: FIXTURE_SLOTS[1].start,
      userConsent: true
    });

    assert.equal(cancelled.type, "cancelled");
    assert.equal(rescheduled.type, "rescheduled");
    assert.equal(cancelled.commitment.commitmentId, rescheduled.commitment.commitmentId);
    assert.equal(cancelled.commitment.status, "cancelled");
    assert.equal(cancelled.commitment.events[0].type, "cancelled");
    assert.deepEqual(cancelled.commitment.rights.allowedActions, ["verify"]);
    assert.equal(cancelled.commitment.receipts[0].action, "cancel_service");
    assert.equal(rescheduled.commitment.status, "rescheduled");
    assert.equal(rescheduled.commitment.events[0].type, "rescheduled");
    assert.deepEqual(rescheduled.commitment.rights.allowedActions, ["verify", "cancel", "reschedule"]);
    assert.equal(rescheduled.commitment.receipts[0].action, "reschedule_service");
    assert.equal(rescheduled.commitment.backend.confirmationId, "fixture-massage-0001");
  });

  it("does not attach a portable commitment without signed receipt proof", async () => {
    const result = await bookService(runtime({
      auth: authWithDelegation(validDelegation())
    }), bookingInput());

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt, undefined);
    assert.equal(result.commitment, undefined);
  });

  it("allows verified-mandate authority evidence through the gateway gate and receipt", async () => {
    const verifier = new Ap2MandateAuthorityVerifier({
      trustedIssuers: ["ap2_issuer"],
      audience: "agentport:test",
      now: () => new Date("2026-06-19T00:00:00.000Z"),
      async verify() {
        return { ok: true };
      }
    });
    const normalized = await verifier.normalize(validAp2Mandate());
    assert.equal(normalized.ok, true);

    const result = await bookService(runtime({
      auth: authWithAuthority(normalized.authority),
      delegation: {
        requireForStateChanging: true,
        audience: "agentport:test",
        trustedIssuers: ["ap2_issuer"],
        layers: {
          commit: {
            requireDelegation: true,
            minAssurance: "wallet"
          }
        },
        now: () => new Date("2026-06-19T00:00:00.000Z")
      },
      userAuthority: {
        requireForStateChanging: true,
        allowedTechnologies: ["ap2-mandate"],
        provider: new LocalUserAuthorityProvider({
          audience: "agentport:test",
          now: () => new Date("2026-06-19T00:00:00.000Z")
        })
      },
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), ap2BookingInput());

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt.authorityAssurance, "verified-mandate");
    assert.deepEqual(result.receipt.authorityEvidence, [{
      kind: "ap2-mandate",
      ref: "ap2_mandate_123",
      issuer: "ap2_issuer"
    }]);
    assert.equal(result.receipt.clientAgentId, "agent_ap2");
    assert.equal(result.receipt.userSubject, "user_ap2");
    assert.equal(result.receipt.consentId, "consent_ap2");
    assert.equal(result.receipt.userAuthorityTechnology, "ap2-mandate");
  });

  it("does not let authority-only evidence bypass explicit token-confirmation policy", async () => {
    const verifier = new Ap2MandateAuthorityVerifier({
      async verify() {
        return { ok: true };
      }
    });
    const normalized = await verifier.normalize(validAp2Mandate());
    assert.equal(normalized.ok, true);

    const result = await bookService(runtime({
      auth: authWithAuthority(normalized.authority),
      delegation: {
        layers: {
          commit: {
            requireDelegation: true,
            requireTokenConfirmation: true
          }
        }
      }
    }), ap2BookingInput());

    assert.deepEqual(result, {
      type: "rejected",
      reason: "delegation_token_confirmation_required"
    });
  });

  it("enforces fixture-backed AP2 policy for confirmed, request-bound, and mismatched actions", async () => {
    const fixtures = await loadAuthorityEvidenceProfileFixtures();
    const verifier = ap2FixtureVerifier(fixtures);

    const confirmedFixture = authorityProfileFixture(fixtures, "ap2.accepted.confirm");
    const confirmedAuthority = await normalizeAuthorityFixture(verifier, confirmedFixture);
    const confirmed = await bookService(ap2AuthorityRuntime(fixtures, confirmedAuthority), confirmedFixture.request);
    assert.equal(confirmed.type, confirmedFixture.expected.gateway);
    assert.equal(confirmed.receipt.actionLayer, "commit");
    assert.equal(confirmed.receipt.authorityAssurance, "verified-mandate");
    assert.deepEqual(confirmed.receipt.authorityEvidence, [{
      kind: "ap2-mandate",
      ref: confirmedFixture.evidence.mandateRef,
      issuer: confirmedFixture.evidence.issuer
    }]);
    assert.equal(confirmed.receipt.backendConfirmationId, "fixture-massage-0001");

    const requestBoundFixture = authorityProfileFixture(fixtures, "ap2.downgraded.request-bound");
    const requestBoundAuthority = await normalizeAuthorityFixture(verifier, requestBoundFixture);
    const requestBound = await bookService(ap2AuthorityRuntime(fixtures, requestBoundAuthority), requestBoundFixture.request);
    assert.equal(requestBound.type, requestBoundFixture.expected.gateway);
    assert.equal(requestBound.receipt.actionLayer, "lead");
    assert.notEqual(requestBound.type, "confirmed");
    assert.deepEqual(requestBound.receipt.authorityEvidence, [{
      kind: "ap2-mandate",
      ref: requestBoundFixture.evidence.mandateRef,
      issuer: requestBoundFixture.evidence.issuer
    }]);

    const mismatch = await bookService(ap2AuthorityRuntime(fixtures, confirmedAuthority), requestBoundFixture.request);
    assert.equal(mismatch.type, "rejected");
    assert.equal(mismatch.reason, "delegation_action_intent_mismatch");
    assert.equal(mismatch.receipt.resultReason, "delegation_action_intent_mismatch");
  });

  it("strips adapter-supplied receipts and replaces them with gateway receipts", async () => {
    const result = await bookService(runtimeWithForgingAdapter({
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), bookingInput());

    assert.equal(result.type, "confirmed");
    assert.equal(result.receipt.issuer, "agentport:test-gateway");
    assert.notEqual(result.receipt.issuer, "forged-client-agent");
    assert.equal(result.receipt.receiptId.startsWith("receipt_"), true);
    assert.equal(result.receipt.backendConfirmationId, "forged-confirmation");
  });

  it("binds failed and rejected receipts to result reasons", async () => {
    const failed = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        businessId: "sample-salon",
        serviceId: "haircut"
      }),
      leads: throwingLeads(),
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), {
      businessId: "sample-salon",
      serviceId: "haircut",
      customer: { name: "Ada" },
      userConsent: true,
      requestedType: "request"
    });
    const rejected = await bookService(runtime({
      auth: authWithDelegation({
        ...validDelegation(),
        approvedActions: ["cancel_service"]
      }),
      receipts: {
        signer: new MemoryReceiptSigner("agentport:test-gateway"),
        now: () => new Date("2026-06-19T00:00:00.000Z")
      }
    }), bookingInput());

    assert.equal(failed.type, "failed");
    assert.equal(failed.receipt.resultReason, "lead_delivery_error");
    assert.equal(failed.receipt.resultType, "failed");
    assert.equal(rejected.type, "rejected");
    assert.equal(rejected.receipt.resultReason, "delegation_action_not_approved");
    assert.equal(rejected.receipt.resultType, "rejected");
  });
});

async function loadAuthorityEvidenceProfileFixtures() {
  const payload = JSON.parse(await readFile(
    resolve(process.cwd(), "examples/authority-evidence-profiles.v0.1.json"),
    "utf8"
  ));
  return {
    payload,
    byId: new Map(payload.fixtures.map((fixture) => [fixture.id, fixture]))
  };
}

function authorityProfileFixture(fixtures, id) {
  const fixture = fixtures.byId.get(id);
  assert.ok(fixture, `missing authority evidence profile fixture: ${id}`);
  return fixture;
}

function ap2FixtureVerifier(fixtures) {
  return new Ap2MandateAuthorityVerifier({
    trustedIssuers: fixtures.payload.trustedIssuers,
    audience: fixtures.payload.audience,
    now: () => new Date(fixtures.payload.clock),
    async verify(evidence) {
      return evidence.mandateRef.startsWith("ap2_profile_")
        ? { ok: true }
        : { ok: false, reason: "authority_verification_failed" };
    }
  });
}

async function normalizeAuthorityFixture(verifier, fixture) {
  const normalized = await verifier.normalize(fixture.evidence);
  assert.equal(normalized.ok, true);
  return normalized.authority;
}

function ap2AuthorityRuntime(fixtures, authority) {
  return runtime({
    auth: authWithAuthority(authority),
    delegation: {
      requireForStateChanging: true,
      audience: fixtures.payload.audience,
      trustedIssuers: fixtures.payload.trustedIssuers,
      layers: {
        lead: {
          requireDelegation: true,
          minAssurance: "session"
        },
        commit: {
          requireDelegation: true,
          minAssurance: "wallet"
        }
      },
      now: () => new Date(fixtures.payload.clock)
    },
    userAuthority: {
      requireForStateChanging: true,
      allowedTechnologies: ["ap2-mandate"],
      provider: new LocalUserAuthorityProvider({
        audience: fixtures.payload.audience,
        now: () => new Date(fixtures.payload.clock)
      })
    },
    receipts: {
      signer: new MemoryReceiptSigner("agentport:test-gateway"),
      now: () => new Date(fixtures.payload.clock)
    }
  });
}

function bookingInput() {
  return {
    businessId: "verified-spa",
    serviceId: "massage",
    customer: { name: "Ada" },
    userConsent: true,
    slotStart: FIXTURE_SLOTS[0].start
  };
}

function ap2BookingInput() {
  return {
    ...bookingInput(),
    requestedType: "confirmed"
  };
}

function validDelegation() {
  return {
    delegationId: "del_123",
    issuer: "issuer_test",
    userSubject: "user_456",
    agentId: "agent_789",
    consentId: "consent_abc",
    scopes: ["book"],
    approvedActions: ["book_service"],
    businessId: "verified-spa",
    serviceId: "massage",
    audience: "agentport:test",
    challengeId: "challenge_123",
    tokenConfirmation: {
      method: "dpop",
      keyId: "key_123",
      jwkThumbprint: "jkt_123"
    },
    expiresAt: "2026-07-20T00:00:00.000Z",
    issuedAt: "2026-06-19T00:00:00.000Z",
    assurance: "test"
  };
}

function validUserAuthorityTrustRecord(overrides = {}) {
  return {
    ref: "agentport-local-delegation:del_123",
    subjectRef: "user_456",
    consentRef: "consent_abc",
    agentId: "agent_789",
    assurance: "test",
    audience: "agentport:test",
    expiresAt: "2026-07-20T00:00:00.000Z",
    nonce: "challenge_123",
    status: "active",
    verifiedBy: "agentport-hosted-authority",
    verifiedAt: "2026-06-19T00:00:00.000Z",
    ...overrides
  };
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

function businessPortTrustRoot({
  keyStatus = "active",
  trustedIssuers = ["agentport"],
  publicKeys = {
    "business-port-runtime-key": businessPortSigningKeys.publicKey
  }
} = {}) {
  return {
    trustedIssuers,
    publicKeys,
    keyStatuses: {
      "business-port-runtime-key": keyStatus
    }
  };
}

function businessPortTrustRootBundle({
  issuer = "agentport",
  keyId = "business-port-runtime-key",
  keyStatus = "active",
  alg = "EdDSA",
  use = "sig"
} = {}) {
  return {
    protocol: "agentport-business-port-trust-root-bundle",
    version: "0.1",
    bundleId: "agentport-business-port-runtime-test-root",
    sequence: 1,
    issuedBy: "agentport",
    issuedAt: "2026-06-20T00:00:00.000Z",
    notBefore: "2026-06-20T00:00:00.000Z",
    expiresAt: "2026-07-20T00:00:00.000Z",
    authorities: [{
      issuer,
      publicKeys: [{
        keyId,
        alg,
        use,
        status: keyStatus,
        notBefore: "2026-06-20T00:00:00.000Z",
        expiresAt: "2026-07-20T00:00:00.000Z",
        publicKey: businessPortSigner.publicJwk
      }]
    }]
  };
}

function validAp2Mandate() {
  return {
    mandateRef: "ap2_mandate_123",
    mandateType: "checkout",
    issuer: "ap2_issuer",
    agentId: "agent_ap2",
    userSubjectRef: "user_ap2",
    consentRef: "consent_ap2",
    actionIntent: {
      action: "book_service",
      businessId: "verified-spa",
      serviceId: "massage",
      requestedType: "confirmed",
      slotStart: FIXTURE_SLOTS[0].start,
      expiresAt: "2026-07-20T00:00:00.000Z"
    },
    audience: "agentport:test",
    expiresAt: "2026-07-20T00:00:00.000Z",
    nonce: "nonce_ap2"
  };
}

function authWithDelegation(delegation) {
  return {
    async authorize() {
      return { scopes: ["find", "availability", "book", "cancel"], delegation };
    },
    requireConsent(req) {
      return req.userConsent !== true;
    }
  };
}

function authWithAuthority(authority) {
  return {
    async authorize() {
      return { scopes: ["find", "availability", "book", "cancel"], authority };
    },
    requireConsent(req) {
      return req.userConsent !== true;
    }
  };
}

class MemoryAuditSink {
  events = [];

  async record(event) {
    this.events.push(event);
  }
}

class MemoryReplayStore {
  seen = new Set();

  async consume(proof) {
    const handle = proof.challengeId ?? proof.nonce;
    if (this.seen.has(handle)) {
      return false;
    }

    this.seen.add(handle);
    return true;
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

function throwingLeads() {
  return {
    async deliver() {
      throw new Error("lead sink down");
    }
  };
}

function runtimeWithForgingAdapter({ receipts } = {}) {
  const adapter = {
    platform: "forged",
    async capabilities() {
      return {
        readServices: true,
        readAvailability: true,
        confirmBooking: true,
        cancelBooking: false,
        rescheduleBooking: false
      };
    },
    async listServices(binding) {
      return binding.staticServices ?? [];
    },
    async getAvailability(_binding, req) {
      return {
        supported: true,
        serviceId: req.serviceId,
        slots: FIXTURE_SLOTS,
        source: "forged"
      };
    },
    async book(_binding, req) {
      return {
        type: "confirmed",
        confirmationId: "forged-confirmation",
        serviceId: req.serviceId,
        start: req.slotStart,
        source: "forged",
        receipt: {
          receiptId: "forged_receipt",
          issuer: "forged-client-agent"
        }
      };
    }
  };
  const tenant = {
    id: "verified-spa",
    name: "Verified Day Spa",
    bindings: [{
      platform: "forged",
      staticServices: [{ id: "massage", name: "Swedish Massage" }]
    }]
  };
  const tenants = {
    async resolveTenant() {
      return tenant;
    },
    async findNear() {
      return [{ tenant, services: tenant.bindings[0].staticServices }];
    }
  };
  const adapters = new Map([[adapter.platform, adapter]]);

  return {
    adapters,
    tenants,
    truth: new LocalTruthStore(tenants, adapters),
    auth: authWithDelegation(validDelegation()),
    audit: new MemoryAuditSink(),
    analytics: new NoopAnalytics(),
    leads: new NoopLeadSink(),
    delegation: withLocalProfileIntentRelaxation(),
    receipts
  };
}
