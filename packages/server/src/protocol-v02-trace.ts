import type { AgentPortCommitment } from "../../core/src/index.js";
import type { ActorContext } from "./identity.js";
import type { TicketDestination, TicketDeliveryRecord, TicketEvidenceInput } from "./ticket-tools.js";

export interface TicketProofProtocolTraceInput {
  evidence: TicketEvidenceInput;
  allowedActions: string[];
  delivery: {
    deliveryId: string;
    deliveredAt?: string;
    destinationRef?: string;
  };
  destination: TicketDestination;
  consentStatement: string;
  requestedBy?: string;
  deliveryRecord?: TicketDeliveryRecord;
}

export function buildTicketProofProtocolTraceV02(input: TicketProofProtocolTraceInput) {
  const commitment = input.evidence.commitment;
  const deliveryId = input.delivery.deliveryId;
  const deliveryReceiptRef = `delivery-receipt:${deliveryId}`;
  const originalReceiptRefs = (commitment.receipts ?? []).map((receipt) => `gateway-receipt:${receipt.receiptId}`);
  const requestedActor = compactProtocolActor(input.deliveryRecord?.requestedActor, {
    actorKind: "plugin_host",
    principalId: input.requestedBy ?? "agentport-action-facade"
  });
  const customerActor = compactProtocolActor(input.deliveryRecord?.customerActor, {
    actorKind: "customer_holder",
    principalId: `customer_holder:${input.evidence.holderRef ?? commitment.subject.holderRef}`
  });
  const gatewayActor = compactProtocolActor(input.deliveryRecord?.gatewayActor, {
    actorKind: "gateway",
    principalId: "agentport-gateway"
  });
  const deliveredAt = input.delivery.deliveredAt ?? input.deliveryRecord?.deliveredAt ?? "2026-06-26T12:00:01.000Z";

  return {
    "$schema": "schemas/agentport-protocol-trace.v0.2.schema.json",
    protocol: "agentport-protocol-trace",
    version: "0.2",
    traceId: `runtime-chatgpt-action-${deliveryId}`,
    kind: "golden",
    scenario: "live action facade wallet-first ticket proof routing",
    roles: protocolRoles(),
    objects: {
      commitment: commitmentV02FromRuntime(commitment, {
        holderRef: input.evidence.holderRef ?? commitment.subject.holderRef,
        customerActorRef: customerActor.principalId,
        businessPortRef: businessPortRef(input.destination, commitment),
        deliveryReceiptRef,
        originalReceiptRefs,
        deliveredAt,
        allowedActions: input.allowedActions
      }),
      actionIntent: {
        "$schema": "schemas/agentport-action-intent.v0.2.schema.json",
        protocol: "agentport-action-intent",
        version: "0.2",
        intentId: `intent_${deliveryId}`,
        agentSessionId: "session_action_facade",
        action: "send_ticket",
        target: {
          businessId: commitment.business.businessId,
          serviceId: commitment.business.serviceId,
          commitmentId: commitment.commitmentId,
          destinationRef: input.destination.target
        },
        approval: {
          required: true,
          exactSummaryShown: true,
          approvalPhrase: approvalPhraseFromConsent(input.consentStatement),
          consentStatement: input.consentStatement,
          userConsentAttachedAfterApproval: true,
          approvalHash: `sha256:approval_${deliveryId}`
        },
        bounds: {
          expiresAt: "2026-06-26T12:05:01.000Z",
          singleUse: true,
          backendMutation: false
        },
        status: "executed"
      },
      deliveryReceipt: {
        "$schema": "schemas/agentport-delivery-receipt.v0.2.schema.json",
        protocol: "agentport-delivery-receipt",
        version: "0.2",
        deliveryId,
        commitmentId: commitment.commitmentId,
        destination: {
          kind: input.destination.kind,
          targetRef: input.destination.target,
          businessPortRef: businessPortRef(input.destination, commitment)
        },
        result: "sent",
        backendMutation: false,
        actors: {
          requestedActor,
          customerActor,
          gatewayActor
        },
        proofLevel: normalizeProtocolProofLevel(input.deliveryRecord?.proofLevel),
        issuedBy: "agentport-gateway",
        receiptRef: deliveryReceiptRef,
        authorityEvidenceRefs: commitment.authority.evidenceRefs,
        consentId: commitment.authority.consentId,
        outcomeRef: deliveryReceiptRef
      },
      auditEvents: [
        {
          eventId: `audit_${deliveryId}`,
          type: "ticket_delivery",
          actorRoles: [requestedActor.actorKind, customerActor.actorKind, gatewayActor.actorKind],
          backendMutation: false
        }
      ]
    },
    steps: [
      {
        id: "restore_wallet_first",
        from: "frontier_host",
        to: "plugin",
        action: "locate_wallet_tickets",
        objectRef: commitment.commitmentId
      },
      {
        id: "registry_status_read",
        from: "gateway",
        to: "commitment_registry",
        action: "get_ticket_status",
        objectRef: commitment.commitmentId
      },
      {
        id: "allowed_actions_gateway_derived",
        from: "gateway",
        to: "plugin",
        action: "get_allowed_ticket_actions",
        objectRef: commitment.commitmentId
      },
      {
        id: "summary_then_approval",
        from: "frontier_host",
        to: "customer_holder",
        action: "show_exact_summary_then_receive_approval",
        objectRef: `intent_${deliveryId}`
      },
      {
        id: "route_proof",
        from: "gateway",
        to: "business_port_endpoint",
        action: "send_ticket",
        objectRef: deliveryId
      },
      {
        id: "registry_event_append",
        from: "gateway",
        to: "commitment_registry",
        action: "append_proof_routed_event",
        objectRef: deliveryId
      }
    ],
    claims: {
      agentPortCompatible: true,
      agentPortCertified: false,
      agentPortVerifiedBusiness: false,
      realBusinessProof: false,
      virtualStoreOrFixtureBoundary: true,
      runtimeObserved: true
    }
  };
}

function protocolRoles() {
  return {
    frontierHost: {
      role: "frontier_host",
      responsibility: "talks to user and requests plugin actions",
      holdsCurrentTicketTruth: false
    },
    plugin: {
      role: "plugin",
      responsibility: "stores durable refs, restores session, preserves receipt refs",
      lifecycleAuthority: false,
      mintsAuthority: false
    },
    businessPortEndpoint: {
      role: "business_port_endpoint",
      responsibility: "receives standardized delivery request and preserves gateway outcome refs",
      systemOfRecord: false
    },
    gateway: {
      role: "gateway",
      responsibility: "verifies, standardizes, derives allowed actions, routes proof, issues receipt",
      derivesAllowedActions: true
    },
    adapter: {
      role: "adapter",
      responsibility: "normalizes backend capability only",
      selfAssertsVerification: false
    },
    commitmentRegistry: {
      role: "commitment_registry",
      responsibility: "owns AgentPort lifecycle state and event history",
      lifecycleAuthority: true
    },
    businessBackend: {
      role: "business_backend",
      responsibility: "existing operational booking ledger",
      systemOfRecord: true
    }
  };
}

function commitmentV02FromRuntime(
  commitment: AgentPortCommitment,
  input: {
    holderRef: string;
    customerActorRef: string;
    businessPortRef: string;
    deliveryReceiptRef: string;
    originalReceiptRefs: string[];
    deliveredAt: string;
    allowedActions: string[];
  }
) {
  return {
    "$schema": "schemas/agentport-commitment.v0.2.schema.json",
    protocol: "agentport-commitment",
    version: "0.2",
    commitmentId: commitment.commitmentId,
    status: commitment.status,
    holder: {
      holderRef: input.holderRef,
      customerActorRef: input.customerActorRef
    },
    business: {
      businessId: commitment.business.businessId,
      serviceId: commitment.business.serviceId,
      bindingId: commitment.business.bindingId,
      businessPortRef: input.businessPortRef
    },
    backend: {
      source: commitment.backend.source,
      confirmationRef: commitment.backend.confirmationId,
      systemOfRecord: true,
      agentPortOwnsBackendLedger: false
    },
    authority: {
      assurance: commitment.authority.assurance,
      evidenceRefs: commitment.authority.evidenceRefs,
      consentId: commitment.authority.consentId,
      mintedByAgentPort: false,
      mintedByModel: false,
      modelSelfIssued: false
    },
    allowedActions: input.allowedActions.map((action) => ({
      action,
      derivedByGateway: true,
      requiresConsent: action === "send_ticket",
      backendMutation: false
    })),
    recoveryPolicy: {
      mode: "registry_reverify",
      fallbackAction: "reverify"
    },
    registry: {
      registryRef: `agentport://registry/${commitment.commitmentId}`,
      lifecycleAuthority: true,
      frontierHostIsAuthority: false,
      pluginWalletIsAuthority: false
    },
    events: [
      {
        eventId: `${commitment.events?.[0]?.eventId ?? "event_runtime_created"}_v02`,
        type: "created",
        at: commitment.events?.[0]?.at ?? "2026-06-26T12:00:00.000Z",
        actorRole: "business_backend",
        receiptRef: input.originalReceiptRefs[0] ?? "gateway-receipt:unknown"
      },
      {
        eventId: `event_${input.deliveryReceiptRef.replace("delivery-receipt:", "")}`,
        type: "proof_routed",
        at: input.deliveredAt,
        actorRole: "gateway",
        receiptRef: input.deliveryReceiptRef
      }
    ],
    receiptRefs: [...input.originalReceiptRefs, input.deliveryReceiptRef]
  };
}

function compactProtocolActor(actor: ActorContext | undefined, fallback: { actorKind: string; principalId: string }) {
  return {
    actorKind: actor?.actorKind ?? fallback.actorKind,
    principalId: actor?.principalId ?? fallback.principalId
  };
}

function approvalPhraseFromConsent(consentStatement: string) {
  return /\byes\b/i.test(consentStatement) ? "Yes" : "approved";
}

function businessPortRef(destination: TicketDestination, commitment: AgentPortCommitment) {
  if (destination.kind === "business_inbox" && destination.target.includes(commitment.business.businessId)) {
    return `agentport://business-port/${commitment.business.businessId}/front-desk`;
  }
  return destination.target;
}

function normalizeProtocolProofLevel(proofLevel: string | undefined) {
  if (proofLevel === "cryptographic") {
    return "signed_receipt";
  }
  if (proofLevel === "receipt_matched") {
    return "receipt_hash";
  }
  return "receipt_ref";
}
