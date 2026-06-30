import { createHash } from "node:crypto";
import { actionIntentResultDeliverySummary, authorityContextFromDelegationProof, createActionIntentHash, createAvailabilityExecutionTrace, createBookServiceExecutionTrace, createBusinessFeedExecutionTrace, createBusinessInfoExecutionTrace, createCancelServiceExecutionTrace, createRescheduleServiceExecutionTrace, deriveBindingId, evaluateReadiness, resolveActionCapability, resolveBindingCredentials, NullCredentialVault, type AgentPortCommitment, type ActionIntentLifecycleRecord, type ActionIntentLifecycleStore, type ActionIntentResultDeliverySummary, type ActionIntentResultSink, type ActionIntentResultDeliveryTrustProfile, type ActionReceiptGatewayTrustProfile, type ActionReceiptPayload, type ActionReceiptSigner, type ActionGatePolicy, type ActionLayer, type ActionRiskAssessment, type ActionRiskDecision, type ActionRiskFallback, type AdapterCapabilities, type AnalyticsSink, type AuditSink, type AuthProvider, type AuthorityAssurance, type AuthorityContext, type AuthorizationResult, type AvailabilityRequest, type AvailabilityResult, type BackendBinding, type BookingAdapter, type BookRequest, type BookResult, type BusinessPortAttestation, type BusinessPortAttestationProvider, type BusinessPortVerificationFailureReason, type CancelRequest, type CancelResult, type CommitmentEventType, type CredentialVault, type DelegatedAction, type DelegationAssurance, type DelegationProof, type DelegationReplayStore, type DelegationTokenConfirmation, type DelegationVerifier, type ExecutionGraphRecord, type ExecutionTraceSink, type IncomingRequest, type Lead, type LeadSink, type ReadinessProtocolInput, type ReadinessTier, type RescheduleRequest, type RescheduleResult, type Scope, type SignedActionReceiptGatewayTrustProfile, type TaggedService, type Tenant, type TenantStore, type TokenConfirmationMethod, type TruthStore, type UserAuthorityContext, type UserAuthorityProvider, type UserAuthorityTechnology, type UserAuthorityVerificationFailureReason } from "../../core/src/index.js";
import type { BusinessIdentityProvider, HostWalletIdentityProvider, TicketHolderIdentityProvider } from "./identity.js";
import type { TicketDeliverySink, TicketRegistry, TicketWalletRegistry } from "./ticket-tools.js";

export interface AgentPortRuntime {
  adapters: Map<string, BookingAdapter>;
  tenants: TenantStore;
  truth: TruthStore;
  auth: AuthProvider;
  audit: AuditSink;
  analytics: AnalyticsSink;
  leads: LeadSink;
  trace?: ExecutionTraceSink;
  credentials?: CredentialVault;
  intentLifecycles?: ActionIntentLifecycleStore;
  intentResults?: ActionIntentResultSink;
  deliveryTrust?: ActionIntentResultDeliveryTrustProfile;
  delegation?: {
    requireForStateChanging?: boolean;
    audience?: string;
    trustedIssuers?: string[];
    verifier?: DelegationVerifier;
    replay?: DelegationReplayStore;
    requireReplayProtection?: boolean;
    requireTokenConfirmation?: boolean;
    tokenConfirmationMethods?: TokenConfirmationMethod[];
    layers?: Partial<Record<ActionLayer, ActionGatePolicy>>;
    now?: () => Date;
  };
  receipts?: {
    signer?: ActionReceiptSigner;
    trustProfile?: ActionReceiptGatewayTrustProfile | SignedActionReceiptGatewayTrustProfile;
    now?: () => Date;
  };
  userAuthority?: {
    requireForStateChanging?: boolean;
    allowedTechnologies?: UserAuthorityTechnology[];
    layers?: Partial<Record<ActionLayer, {
      requireAuthority?: boolean;
      allowedTechnologies?: UserAuthorityTechnology[];
    }>>;
    provider?: UserAuthorityProvider;
  };
  businessPorts?: {
    requireForStateChanging?: boolean;
    layers?: Partial<Record<ActionLayer, {
      requireAttestation?: boolean;
      onVerificationFailure?: Exclude<ActionRiskDecision, "allow">;
      warningMessage?: string;
      allowedFallback?: ActionRiskFallback;
      familiarBusinessPort?: boolean;
    }>>;
    provider?: BusinessPortAttestationProvider;
  };
  ticketRegistry?: TicketRegistry;
  ticketWallet?: TicketWalletRegistry;
  ticketDelivery?: TicketDeliverySink;
  businessIdentity?: BusinessIdentityProvider;
  ticketHolderIdentity?: TicketHolderIdentityProvider;
  hostWalletIdentity?: HostWalletIdentityProvider;
  businessInbox?: {
    token?: string;
    defaultBusinessId?: string;
    headerName?: string;
  };
}

export interface FindServicesInput {
  service: string;
  lat?: number;
  lng?: number;
  text?: string;
  radiusKm?: number;
}

export interface GetBusinessInfoInput {
  businessId: string;
}

export type BusinessFeedIntent = "answer" | "book" | "manage" | "compare";

export interface GetBusinessFeedInput {
  businessId: string;
  mode?: "compact" | "full";
  intent?: BusinessFeedIntent;
  ifBusinessVersion?: string;
}

export interface GetReadinessReportInput {
  businessId: string;
  targetTier?: ReadinessTier;
  profileReviewed?: boolean;
  protocolInputs?: ReadinessProtocolInput[];
  allowLocalAuthorityForConfirm?: boolean;
}

export async function findServices(runtime: AgentPortRuntime, input: FindServicesInput, context?: IncomingRequest) {
  await ensureAuthorized(runtime, "find", context);
  const matches = await runtime.tenants.findNear({
    service: input.service,
    lat: input.lat,
    lng: input.lng,
    text: input.text,
    radiusKm: input.radiusKm ?? 25
  });

  await runtime.analytics.observe({
    type: "find_services",
    service: input.service,
    at: new Date().toISOString()
  });

  return {
    matches: await Promise.all(
      matches.map(async (match) => ({
        businessId: match.tenant.id,
        name: match.tenant.name,
        address: match.tenant.address,
        distanceKm: match.distanceKm,
        services: await servicesForTenant(runtime, match.tenant)
      }))
    )
  };
}

export async function getBusinessInfo(runtime: AgentPortRuntime, input: GetBusinessInfoInput, context?: IncomingRequest) {
  const startedAt = new Date();
  await ensureAuthorized(runtime, "find", context);
  const tenant = await runtime.tenants.resolveTenant(input.businessId);
  if (!tenant) {
    const result = {
      found: false,
      businessId: input.businessId,
      reason: "tenant_not_found"
    };
    await emitExecutionTrace(runtime, createBusinessInfoExecutionTrace(input, result, { startedAt }));
    return result;
  }

  await runtime.analytics.observe({
    type: "get_business_info",
    businessId: input.businessId,
    at: new Date().toISOString()
  });

  const result = {
    found: true,
    businessId: tenant.id,
    name: tenant.name,
    address: tenant.address,
    verification: tenant.verification ?? null,
    ...(tenant.profile ? { profile: tenant.profile } : {}),
    services: await servicesForTenant(runtime, tenant)
  };
  await emitExecutionTrace(runtime, createBusinessInfoExecutionTrace(input, result, { startedAt }));
  return result;
}

export async function getBusinessFeed(runtime: AgentPortRuntime, input: GetBusinessFeedInput, context?: IncomingRequest) {
  const startedAt = new Date();
  await ensureAuthorized(runtime, "find", context);
  const tenant = await runtime.tenants.resolveTenant(input.businessId);
  if (!tenant) {
    const result = {
      found: false,
      businessId: input.businessId,
      reason: "tenant_not_found"
    };
    await emitExecutionTrace(runtime, createBusinessFeedExecutionTrace(input, result, { startedAt }));
    return result;
  }

  const serviceRows = await serviceRowsForTenant(runtime, tenant);

  await runtime.analytics.observe({
    type: "get_business_feed",
    businessId: input.businessId,
    at: new Date().toISOString()
  });

  const result = createBusinessFeed(tenant, serviceRows, input.mode ?? "compact", input.intent, input.ifBusinessVersion);
  await emitExecutionTrace(runtime, createBusinessFeedExecutionTrace(input, result, { startedAt }));
  return result;
}

export async function getReadinessReport(runtime: AgentPortRuntime, input: GetReadinessReportInput, context?: IncomingRequest) {
  await ensureAuthorized(runtime, "find", context);
  const tenant = await runtime.tenants.resolveTenant(input.businessId);
  if (!tenant) {
    return {
      found: false,
      businessId: input.businessId,
      reason: "tenant_not_found"
    };
  }

  await runtime.analytics.observe({
    type: "get_readiness_report",
    businessId: input.businessId,
    at: new Date().toISOString()
  });

  return evaluateReadiness({
    tenant,
    adapters: runtime.adapters,
    targetTier: input.targetTier,
    profileReviewed: input.profileReviewed,
    protocolInputs: input.protocolInputs,
    allowLocalAuthorityForConfirm: input.allowLocalAuthorityForConfirm
  });
}

export async function checkAvailability(runtime: AgentPortRuntime, input: AvailabilityRequest, context?: IncomingRequest) {
  const startedAt = new Date();
  await ensureAuthorized(runtime, "availability", context);
  try {
    if (runtime.credentials) {
      const resolved = await resolveBinding(runtime, input.businessId, input.serviceId, input.bindingId);
      if (!resolved) {
        const result = {
          supported: false,
          reason: "tenant_or_service_not_found"
        } satisfies AvailabilityResult;
        await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, result, { startedAt }));
        return result;
      }

      const result = await resolved.adapter.getAvailability(resolved.binding, input);
      const freshness = await runtime.truth.freshnessOf(input.businessId);
      if (result.supported && freshness) {
        const resultWithFreshness = { ...result, freshness };
        await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, resultWithFreshness, { startedAt }));
        return resultWithFreshness;
      }

      await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, result, { startedAt }));
      return result;
    }

    const result = await runtime.truth.getAvailability(input.businessId, input.serviceId, input.bindingId);
    if (!result) {
      const notFound = {
        supported: false,
        reason: "tenant_or_service_not_found"
      } satisfies AvailabilityResult;
      await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, notFound, { startedAt }));
      return notFound;
    }

    const freshness = await runtime.truth.freshnessOf(input.businessId);
    if (result.supported && freshness) {
      const resultWithFreshness = { ...result, freshness };
      await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, resultWithFreshness, { startedAt }));
      return resultWithFreshness;
    }

    await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, result, { startedAt }));
    return result;
  } catch {
    const result = {
      supported: false,
      reason: "backend_error"
    } satisfies AvailabilityResult;
    await emitExecutionTrace(runtime, createAvailabilityExecutionTrace(input, result, { startedAt }));
    return result;
  }
}

export async function bookService(runtime: AgentPortRuntime, input: BookRequest, context?: IncomingRequest): Promise<BookResult> {
  const startedAt = new Date();
  const auth = await ensureAuthorized(runtime, "book", context);

  const gate = await validateActionGate(runtime, auth, "book_service", "book", input);
  if (gate.reason) {
    await audit(runtime, input, "rejected", gate.reason, auth, gate.layer);
    return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
      type: "rejected",
      reason: gate.reason
    }));
  }

  const userAuthorityGate = await validateUserAuthorityGate(runtime, auth, "book_service", gate.layer, input);
  if (!userAuthorityGate.ok) {
    await audit(runtime, input, "rejected", userAuthorityGate.reason, auth, gate.layer);
    return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
      type: "rejected",
      reason: userAuthorityGate.reason
    }, { userAuthority: userAuthorityGate.authority }));
  }
  let receiptContext: ReceiptContext = { userAuthority: userAuthorityGate.authority };

  if (runtime.auth.requireConsent(input)) {
    await audit(runtime, input, "rejected", "consent_required", auth, gate.layer);
    return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
      type: "rejected",
      reason: "consent_required"
    }, receiptContext));
  }

  const intentExecution = await beginIntentExecution(runtime, "book_service", input, gate.layer);
  if (intentExecution.reason) {
    await audit(runtime, input, "rejected", intentExecution.reason, auth, gate.layer);
    return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
      type: "rejected",
      reason: intentExecution.reason
    }, receiptContext));
  }

  try {
    const resolved = await resolveBinding(runtime, input.businessId, input.serviceId, input.bindingId);
    if (!resolved) {
      await audit(runtime, input, "rejected", "tenant_or_service_not_found", auth, gate.layer);
      return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "tenant_or_service_not_found"
      }, receiptContext), intentExecution.record);
    }

    const businessPortGate = await validateBusinessPortGate(runtime, "book_service", gate.layer, resolved);
    if (!businessPortGate.ok) {
      if (businessPortGate.risk?.decision === "downgrade") {
        await audit(runtime, input, "handoff", businessPortGate.reason, auth, gate.layer);
        return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, downgradeToHandoff(resolved.binding, input.serviceId, businessPortGate.risk), {
          ...receiptContext,
          businessPortAttestation: businessPortGate.attestation,
          risk: businessPortGate.risk
        }), intentExecution.record);
      }

      await audit(runtime, input, "rejected", businessPortGate.reason, auth, gate.layer);
      return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, withRisk({
        type: "rejected",
        reason: businessPortGate.reason
      }, businessPortGate.risk), { ...receiptContext, businessPortAttestation: businessPortGate.attestation, risk: businessPortGate.risk }), intentExecution.record);
    }

    const caps = await resolved.adapter.capabilities(resolved.binding);
    receiptContext = { ...receiptContext, businessPortAttestation: businessPortGate.attestation, risk: businessPortGate.risk };
    const level = resolveActionCapability(caps);
    if (input.requestedType === "confirmed" && level !== "confirm") {
      await audit(runtime, input, "rejected", "capability_exceeded", auth, gate.layer);
      return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "capability_exceeded"
      }, receiptContext), intentExecution.record);
    }

    const bookingInput =
      level === "inform" && input.requestedType === "request"
        ? { ...input, requestedType: "handoff" as const }
        : input;
    const result = withRisk(await resolved.adapter.book(resolved.binding, bookingInput), businessPortGate.risk);
    if (input.requestedType === "request" && result.type === "confirmed") {
      await audit(runtime, input, "rejected", "requested_type_escalated", auth, gate.layer);
      return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "requested_type_escalated"
      }, receiptContext), intentExecution.record);
    }

    if (!caps.confirmBooking && result.type === "confirmed") {
      await audit(runtime, input, "rejected", "adapter_capability_violation", auth, gate.layer);
      return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "adapter_capability_violation"
      }, receiptContext), intentExecution.record);
    }

    if (level === "inform" && result.type === "request") {
      await audit(runtime, input, "rejected", "adapter_capability_violation", auth, gate.layer);
      return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "adapter_capability_violation"
      }, receiptContext), intentExecution.record);
    }

    if (result.type === "handoff" || result.type === "request") {
      try {
        await runtime.leads.deliver(leadFromRequest(bookingInput));
      } catch {
        await audit(runtime, input, "failed", "lead_delivery_error", auth, gate.layer);
        return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
          type: "failed",
          reason: "lead_delivery_error",
          serviceId: input.serviceId
        }, receiptContext), intentExecution.record);
      }
    }

    await audit(runtime, input, result.type, undefined, auth, gate.layer);
    return traceBookService(
      runtime,
      input,
      startedAt,
      withActionReceipt(runtime, "book_service", gate.layer, input, auth, result, receiptContext).then((receipted) =>
        withCommitment("book_service", input, resolved, caps, receipted)
      ),
      intentExecution.record
    );
  } catch {
    await audit(runtime, input, "failed", "adapter_error", auth, gate.layer);
    return traceBookService(runtime, input, startedAt, withActionReceipt(runtime, "book_service", gate.layer, input, auth, {
      type: "failed",
      reason: "adapter_error",
      serviceId: input.serviceId
    }, receiptContext), intentExecution.record);
  }
}

export async function cancelService(runtime: AgentPortRuntime, input: CancelRequest, context?: IncomingRequest): Promise<CancelResult> {
  const startedAt = new Date();
  const auth = await ensureAuthorized(runtime, "cancel", context);

  const gate = await validateActionGate(runtime, auth, "cancel_service", "cancel", input);
  if (gate.reason) {
    return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
      type: "rejected",
      reason: gate.reason
    }));
  }

  const userAuthorityGate = await validateUserAuthorityGate(runtime, auth, "cancel_service", gate.layer, input);
  if (!userAuthorityGate.ok) {
    return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
      type: "rejected",
      reason: userAuthorityGate.reason
    }, { userAuthority: userAuthorityGate.authority }));
  }
  let receiptContext: ReceiptContext = { userAuthority: userAuthorityGate.authority };

  if (runtime.auth.requireConsent(input)) {
    return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
      type: "rejected",
      reason: "consent_required"
    }, receiptContext));
  }

  const intentExecution = await beginIntentExecution(runtime, "cancel_service", input, gate.layer);
  if (intentExecution.reason) {
    return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
      type: "rejected",
      reason: intentExecution.reason
    }, receiptContext));
  }

  try {
    const resolved = await resolveBinding(runtime, input.businessId, input.serviceId, input.bindingId);
    if (!resolved) {
      return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "tenant_or_service_not_found"
      }, receiptContext), intentExecution.record);
    }

    const businessPortGate = await validateBusinessPortGate(runtime, "cancel_service", gate.layer, resolved);
    if (!businessPortGate.ok) {
      return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, withRisk({
        type: "rejected",
        reason: businessPortGate.reason
      }, businessPortGate.risk), { ...receiptContext, businessPortAttestation: businessPortGate.attestation, risk: businessPortGate.risk }), intentExecution.record);
    }

    const caps = await resolved.adapter.capabilities(resolved.binding);
    receiptContext = { ...receiptContext, businessPortAttestation: businessPortGate.attestation, risk: businessPortGate.risk };
    if (!caps.cancelBooking || !resolved.adapter.cancel) {
      return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, handoffForManage(resolved.binding, input.serviceId), receiptContext), intentExecution.record);
    }

    const result = withRisk(await resolved.adapter.cancel(resolved.binding, input), businessPortGate.risk);
    if (!caps.cancelBooking && result.type === "cancelled") {
      return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "adapter_capability_violation"
      }, receiptContext), intentExecution.record);
    }

    return traceCancelService(
      runtime,
      input,
      startedAt,
      withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, result, receiptContext).then((receipted) =>
        withCommitment("cancel_service", input, resolved, caps, receipted)
      ),
      intentExecution.record
    );
  } catch {
    return traceCancelService(runtime, input, startedAt, withActionReceipt(runtime, "cancel_service", gate.layer, input, auth, {
      type: "failed",
      reason: "adapter_error",
      serviceId: input.serviceId
    }, receiptContext), intentExecution.record);
  }
}

export async function rescheduleService(runtime: AgentPortRuntime, input: RescheduleRequest, context?: IncomingRequest): Promise<RescheduleResult> {
  const startedAt = new Date();
  const auth = await ensureAuthorized(runtime, "cancel", context);

  const gate = await validateActionGate(runtime, auth, "reschedule_service", "cancel", input);
  if (gate.reason) {
    return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
      type: "rejected",
      reason: gate.reason
    }));
  }

  const userAuthorityGate = await validateUserAuthorityGate(runtime, auth, "reschedule_service", gate.layer, input);
  if (!userAuthorityGate.ok) {
    return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
      type: "rejected",
      reason: userAuthorityGate.reason
    }, { userAuthority: userAuthorityGate.authority }));
  }
  let receiptContext: ReceiptContext = { userAuthority: userAuthorityGate.authority };

  if (runtime.auth.requireConsent(input)) {
    return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
      type: "rejected",
      reason: "consent_required"
    }, receiptContext));
  }

  const intentExecution = await beginIntentExecution(runtime, "reschedule_service", input, gate.layer);
  if (intentExecution.reason) {
    return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
      type: "rejected",
      reason: intentExecution.reason
    }, receiptContext));
  }

  try {
    const resolved = await resolveBinding(runtime, input.businessId, input.serviceId, input.bindingId);
    if (!resolved) {
      return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "tenant_or_service_not_found"
      }, receiptContext), intentExecution.record);
    }

    const businessPortGate = await validateBusinessPortGate(runtime, "reschedule_service", gate.layer, resolved);
    if (!businessPortGate.ok) {
      return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, withRisk({
        type: "rejected",
        reason: businessPortGate.reason
      }, businessPortGate.risk), { ...receiptContext, businessPortAttestation: businessPortGate.attestation, risk: businessPortGate.risk }), intentExecution.record);
    }

    const caps = await resolved.adapter.capabilities(resolved.binding);
    receiptContext = { ...receiptContext, businessPortAttestation: businessPortGate.attestation, risk: businessPortGate.risk };
    if (!caps.rescheduleBooking || !resolved.adapter.reschedule) {
      return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, handoffForManage(resolved.binding, input.serviceId), receiptContext), intentExecution.record);
    }

    const result = withRisk(await resolved.adapter.reschedule(resolved.binding, input), businessPortGate.risk);
    if (!caps.rescheduleBooking && result.type === "rescheduled") {
      return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
        type: "rejected",
        reason: "adapter_capability_violation"
      }, receiptContext), intentExecution.record);
    }

    return traceRescheduleService(
      runtime,
      input,
      startedAt,
      withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, result, receiptContext).then((receipted) =>
        withCommitment("reschedule_service", input, resolved, caps, receipted)
      ),
      intentExecution.record
    );
  } catch {
    return traceRescheduleService(runtime, input, startedAt, withActionReceipt(runtime, "reschedule_service", gate.layer, input, auth, {
      type: "failed",
      reason: "adapter_error",
      serviceId: input.serviceId
    }, receiptContext), intentExecution.record);
  }
}

function leadFromRequest(req: BookRequest): Lead {
  return {
    businessId: req.businessId,
    serviceId: req.serviceId,
    customer: req.customer,
    intent: req.notes ?? req.requestedType ?? "book_service",
    requestedTime: req.slotStart,
    source: "book_service"
  };
}

function handoffForManage(binding: { bookingUrl?: string; phone?: string }, serviceId: string) {
  return {
    type: "handoff" as const,
    bookingUrl: binding.bookingUrl,
    phone: binding.phone,
    serviceId,
    reason: "unsupported_capability"
  };
}

function downgradeToHandoff(
  binding: { bookingUrl?: string; phone?: string },
  serviceId: string,
  risk: ActionRiskAssessment
): BookResult {
  return {
    type: "handoff",
    bookingUrl: binding.bookingUrl,
    phone: binding.phone,
    serviceId,
    reason: risk.reason,
    risk
  };
}

function withRisk<T extends StateChangingResult>(result: T, risk?: ActionRiskAssessment): T {
  return risk ? { ...result, risk } : result;
}

async function servicesForTenant(runtime: AgentPortRuntime, tenant: Tenant): Promise<TaggedService[]> {
  return (await serviceRowsForTenant(runtime, tenant)).map((row) => row.service);
}

interface TenantServiceRow {
  service: TaggedService;
  capabilities: AdapterCapabilities;
}

async function serviceRowsForTenant(runtime: AgentPortRuntime, tenant: Tenant): Promise<TenantServiceRow[]> {
  const verification = tenant.verification ?? null;
  const verified = tenant.verification?.status === "verified";
  const rows = await Promise.all(
    tenant.bindings.map(async (binding, index) => {
      const adapter = runtime.adapters.get(binding.platform);
      if (!adapter) {
        return [];
      }

      const resolvedBinding = await bindingWithCredentials(runtime, binding);
      const [caps, listed] = await Promise.all([
        adapter.capabilities(resolvedBinding),
        adapter.listServices(resolvedBinding)
      ]);

      const tier = resolveActionCapability(caps);
      return listed.map((service) => ({
        service: {
          ...service,
          businessId: tenant.id,
          platform: binding.platform,
          bindingId: deriveBindingId(binding, index),
          actionCapability: tier,
          verified,
          verification,
          tag: {
            verified,
            tier
          }
        },
        capabilities: caps
      }));
    })
  );

  return rows.flat();
}

function createBusinessFeed(
  tenant: Tenant,
  serviceRows: TenantServiceRow[],
  mode: "compact" | "full",
  intent?: BusinessFeedIntent,
  ifBusinessVersion?: string
) {
  const verification = tenant.verification ?? { status: "unverified" as const };
  const verified = verification.status === "verified";
  const representativeServices = serviceRows.map((row) => row.service);
  const businessVersion = hashBusinessFeedInputs(tenant, serviceRows);
  const cache = businessFeedCacheMetadata(tenant.id, businessVersion, mode, intent);
  if (ifBusinessVersion === businessVersion) {
    return {
      type: "agentport.business_feed.v0.1",
      schemaVersion: "agentport.business_feed.v0.1",
      version: "0.1",
      mode,
      ...(intent ? { intent } : {}),
      found: true,
      notModified: true,
      businessId: tenant.id,
      businessVersion,
      cache
    };
  }

  const representative = {
    name: tenant.name,
    description: tenant.description ?? null,
    address: tenant.address ?? null,
    verification,
    ...(mode === "full"
      ? {
          profile: tenant.profile ?? null,
          services: representativeServices
        }
      : {})
  };
  const actionServices = serviceRows.map((row) => {
    const actions = actionsForService(row.service, row.capabilities);
    return {
      serviceId: row.service.id,
      name: row.service.name,
      bindingId: row.service.bindingId,
      platform: row.service.platform,
      readinessTier: readinessTierFor(row.service, row.capabilities),
      tag: row.service.tag,
      actions: filterActionsForIntent(actions, intent)
    };
  });

  return {
    type: "agentport.business_feed.v0.1",
    schemaVersion: "agentport.business_feed.v0.1",
    version: "0.1",
    mode,
    ...(intent ? { intent } : {}),
    found: true,
    businessId: tenant.id,
    businessVersion,
    cache,
    representative,
    citations: citationsForTenant(tenant, representativeServices),
    actionFeed: {
      canRepresentAsVerified: verified,
      verificationStatus: verification.status,
      services: actionServices
    },
    nextActions: nextActionsForServices(actionServices),
    cannotDo: cannotDoForServices(verification.status, serviceRows, intent),
    representativeLimits: [
      "Do not describe this business as verified unless representative.verification.status is verified.",
      "Do not claim confirmed booking unless book_service returns type confirmed.",
      "Do not infer availability, cancellation, rescheduling, or payment support from a website page.",
      "Use stale and unverified statuses as limits, not as hidden trust."
    ],
    efficientPath: {
      normal: ["discover_agentport", "call_get_business_feed_compact", "call_action_tool_only_if_needed"],
      readBeforeAction: ["agentport://action-model"],
      implementerReferences: ["agentport://open-standard", "agentport://protocol-codes"]
    },
    agentInstructions: [
      "Use this feed before browsing for business facts and actions when a verified AgentPort match exists.",
      "Use intent to retrieve only the decision context needed for answer, book, manage, or compare tasks.",
      "For repeated reads, cache by cache.cacheKey and call get_business_feed with ifBusinessVersion to avoid rereading unchanged feeds.",
      "Cite the feed paths in citations when answering from AgentPort records.",
      "Use actionFeed.services.actions to choose tools and requestedType; do not invent unsupported actions.",
      "Browse only for external reviews, comparisons, public sentiment, or facts AgentPort does not claim."
    ]
  };
}

function businessFeedCacheMetadata(
  businessId: string,
  businessVersion: string,
  mode: "compact" | "full",
  intent?: BusinessFeedIntent
) {
  const cacheScope = {
    businessId,
    mode,
    intent: intent ?? "general",
    businessVersion
  };

  return {
    cacheable: true,
    cacheKey: `sha256:${createHash("sha256").update(stableJson(cacheScope)).digest("hex")}`,
    businessVersion,
    variesBy: ["businessId", "mode", "intent"],
    conditionalRead: {
      input: "ifBusinessVersion",
      matchResult: "notModified",
      rule: "Only reuse a cached feed when businessId, mode, intent, and businessVersion match the requested cache scope."
    },
    invalidatedBy: ["tenant_profile_change", "verification_change", "binding_capability_change"]
  };
}

function hashBusinessFeedInputs(tenant: Tenant, serviceRows: TenantServiceRow[]) {
  const hashInput = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      description: tenant.description ?? null,
      address: tenant.address ?? null,
      verification: tenant.verification ?? null,
      profile: tenant.profile ?? null
    },
    services: serviceRows.map((row) => ({
      service: row.service,
      capabilities: row.capabilities
    }))
  };

  return `sha256:${createHash("sha256").update(stableJson(hashInput)).digest("hex")}`;
}

function filterActionsForIntent(actions: ReturnType<typeof actionsForService>, intent?: BusinessFeedIntent) {
  const names = actionNamesForIntent(intent);
  if (!names) {
    return actions;
  }

  return actions.filter((action) => names.has(action.action));
}

function actionNamesForIntent(intent?: BusinessFeedIntent) {
  switch (intent) {
    case "answer":
    case "compare":
      return new Set(["answer"]);
    case "book":
      return new Set(["check_availability", "book_service"]);
    case "manage":
      return new Set(["cancel_service", "reschedule_service"]);
    default:
      return undefined;
  }
}

function nextActionsForServices(
  services: Array<{ serviceId: string; bindingId: string; actions: ReturnType<typeof actionsForService> }>
) {
  return services.flatMap((service) =>
    service.actions
      .filter((action) => action.status !== "blocked" && action.status !== "unsupported")
      .map((action) => {
        const nextAction: Record<string, unknown> = {
          action: action.action,
          serviceId: service.serviceId,
          bindingId: service.bindingId,
          status: action.status,
          requiresConsent: "consentRequired" in action ? action.consentRequired : false,
          requiresAuthority: ["book_service", "cancel_service", "reschedule_service"].includes(action.action),
          reason: action.reason
        };

        if ("tool" in action) {
          nextAction.tool = action.tool;
        } else {
          nextAction.tool = "get_business_feed";
        }

        if ("requiredArgs" in action) {
          nextAction.requiredArgs = action.requiredArgs;
        }

        if ("requestedType" in action) {
          nextAction.requestedType = action.requestedType;
        }

        if ("expectedResult" in action) {
          nextAction.expectedResult = action.expectedResult;
        }

        return nextAction;
      })
  );
}

function cannotDoForServices(
  verificationStatus: NonNullable<Tenant["verification"]>["status"] | "unverified",
  serviceRows: TenantServiceRow[],
  intent?: BusinessFeedIntent
) {
  const limits = new Map<string, Record<string, unknown>>();
  const addLimit = (limit: Record<string, unknown>) => {
    limits.set(`${limit.action}:${limit.serviceId ?? "business"}`, limit);
  };
  const include = (action: string) => {
    if (!intent) {
      return true;
    }

    if (intent === "answer" || intent === "compare") {
      return action === "verified_answer";
    }

    if (intent === "book") {
      return ["check_availability", "confirmed_booking", "agent_booking_request", "payment"].includes(action);
    }

    return ["cancel_service", "reschedule_service"].includes(action);
  };

  if (verificationStatus !== "verified" && include("verified_answer")) {
    addLimit({
      action: "verified_answer",
      scope: "business",
      reason: verificationStatus === "stale" ? "business_verification_stale" : "business_not_verified"
    });
  }

  if (include("payment")) {
    addLimit({
      action: "payment",
      scope: "business",
      reason: "payment_not_supported_by_agentport_v0"
    });
  }

  for (const row of serviceRows) {
    if (!row.capabilities.readAvailability && include("check_availability")) {
      addLimit({
        action: "check_availability",
        serviceId: row.service.id,
        bindingId: row.service.bindingId,
        reason: "adapter_does_not_support_availability"
      });
    }

    if (!row.capabilities.confirmBooking && include("confirmed_booking")) {
      addLimit({
        action: "confirmed_booking",
        serviceId: row.service.id,
        bindingId: row.service.bindingId,
        reason: "adapter_does_not_support_confirmed_booking"
      });
    }

    if (row.service.actionCapability !== "request" && !row.capabilities.confirmBooking && include("agent_booking_request")) {
      addLimit({
        action: "agent_booking_request",
        serviceId: row.service.id,
        bindingId: row.service.bindingId,
        reason: "adapter_returns_handoff_only"
      });
    }

    if (!row.capabilities.cancelBooking && include("cancel_service")) {
      addLimit({
        action: "cancel_service",
        serviceId: row.service.id,
        bindingId: row.service.bindingId,
        reason: "adapter_does_not_support_cancellation"
      });
    }

    if (!row.capabilities.rescheduleBooking && include("reschedule_service")) {
      addLimit({
        action: "reschedule_service",
        serviceId: row.service.id,
        bindingId: row.service.bindingId,
        reason: "adapter_does_not_support_rescheduling"
      });
    }
  }

  return [...limits.values()];
}

function citationsForTenant(tenant: Tenant, services: TaggedService[]) {
  const trust = tenant.verification?.status === "verified" ? "agentport_verified" : "agentport_unverified";
  const citations = [
    {
      path: "representative.name",
      source: "tenant_store",
      trust
    }
  ];

  if (tenant.description) {
    citations.push({ path: "representative.description", source: "tenant_store", trust });
  }

  if (tenant.address) {
    citations.push({ path: "representative.address", source: "tenant_store", trust });
  }

  if (tenant.profile) {
    citations.push({ path: "representative.profile", source: "tenant_store", trust });
  }

  for (const service of services) {
    citations.push({
      path: `representative.services.${service.id}`,
      source: "adapter_list_services",
      trust
    });
  }

  return citations;
}

function readinessTierFor(service: TaggedService, caps: AdapterCapabilities) {
  if (!service.verified) {
    return "listed";
  }

  if (caps.cancelBooking || caps.rescheduleBooking) {
    return "manage-ready";
  }

  if (caps.confirmBooking) {
    return "confirm-ready";
  }

  if (service.actionCapability === "request") {
    return "request-ready";
  }

  return "answer-ready";
}

function actionsForService(service: TaggedService, caps: AdapterCapabilities) {
  return [
    {
      action: "answer",
      status: service.verified ? "available" : "blocked",
      reason: service.verified ? "verified_business_record" : "business_not_verified",
      citationPath: `representative.services.${service.id}`
    },
    {
      action: "check_availability",
      status: caps.readAvailability ? "available" : "unsupported",
      tool: "check_availability",
      requiredArgs: ["businessId", "serviceId", "bindingId"],
      reason: caps.readAvailability ? "adapter_supports_availability" : "adapter_does_not_support_availability"
    },
    bookingActionForService(service, caps),
    {
      action: "cancel_service",
      status: caps.cancelBooking ? "available" : "handoff",
      tool: "cancel_service",
      requiredArgs: ["businessId", "serviceId", "bindingId", "confirmationId", "userConsent"],
      consentRequired: true,
      reason: caps.cancelBooking ? "adapter_supports_cancellation" : "tool_returns_handoff_when_unsupported"
    },
    {
      action: "reschedule_service",
      status: caps.rescheduleBooking ? "available" : "handoff",
      tool: "reschedule_service",
      requiredArgs: ["businessId", "serviceId", "bindingId", "confirmationId", "newSlotStart", "userConsent"],
      consentRequired: true,
      reason: caps.rescheduleBooking ? "adapter_supports_rescheduling" : "tool_returns_handoff_when_unsupported"
    }
  ];
}

function bookingActionForService(service: TaggedService, caps: AdapterCapabilities) {
  if (caps.confirmBooking) {
    return {
      action: "book_service",
      status: "available",
      tool: "book_service",
      requestedType: "confirmed",
      expectedResult: "confirmed",
      requiredArgs: ["businessId", "serviceId", "bindingId", "customer", "userConsent"],
      consentRequired: true,
      reason: "adapter_supports_confirmed_booking"
    };
  }

  if (service.actionCapability === "request") {
    return {
      action: "book_service",
      status: "available",
      tool: "book_service",
      requestedType: "request",
      expectedResult: "request_or_handoff",
      requiredArgs: ["businessId", "serviceId", "bindingId", "customer", "userConsent"],
      consentRequired: true,
      reason: "adapter_supports_request_or_handoff_only"
    };
  }

  return {
    action: "book_service",
    status: "handoff",
    tool: "book_service",
    requestedType: "handoff",
    expectedResult: "handoff",
    requiredArgs: ["businessId", "serviceId", "bindingId", "customer", "userConsent"],
    consentRequired: true,
    reason: "adapter_does_not_support_request_or_confirm"
  };
}

async function resolveBinding(runtime: AgentPortRuntime, businessId: string, serviceId: string, bindingId?: string) {
  const tenant = await runtime.tenants.resolveTenant(businessId);
  if (!tenant) {
    return null;
  }

  const requestedBindingId = bindingId?.trim();
  for (const [index, binding] of tenant.bindings.entries()) {
    if (requestedBindingId && deriveBindingId(binding, index) !== requestedBindingId) {
      continue;
    }

    const adapter = runtime.adapters.get(binding.platform);
    if (!adapter) {
      continue;
    }

    const resolvedBinding = await bindingWithCredentials(runtime, binding);
    const hasStaticService = resolvedBinding.staticServices?.some((service) => service.id === serviceId) ?? false;
    const services = hasStaticService ? [] : await adapter.listServices(resolvedBinding);
    if (hasStaticService || services.some((service) => service.id === serviceId)) {
      return { tenant, binding: resolvedBinding, bindingId: deriveBindingId(binding, index), adapter };
    }
  }

  return null;
}

interface CommitmentBindingContext {
  tenant: Tenant;
  binding: BackendBinding;
  bindingId: string;
  adapter: BookingAdapter;
}

type CommitmentEligibleResult =
  | Extract<BookResult, { type: "confirmed" }>
  | Extract<CancelResult, { type: "cancelled" }>
  | Extract<RescheduleResult, { type: "rescheduled" }>;

function withCommitment<T extends StateChangingResult>(
  action: DelegatedAction,
  req: BookRequest | CancelRequest | RescheduleRequest,
  resolved: CommitmentBindingContext,
  caps: AdapterCapabilities,
  result: T
): T {
  if (!isCommitmentEligibleResult(result)) {
    return result;
  }

  const commitment = commitmentFromResult(action, req, resolved, caps, result);
  if (!commitment) {
    return result;
  }

  return {
    ...result,
    commitment
  };
}

function isCommitmentEligibleResult(result: StateChangingResult): result is CommitmentEligibleResult {
  return result.type === "confirmed" || result.type === "cancelled" || result.type === "rescheduled";
}

function commitmentFromResult(
  action: DelegatedAction,
  req: BookRequest | CancelRequest | RescheduleRequest,
  resolved: CommitmentBindingContext,
  caps: AdapterCapabilities,
  result: CommitmentEligibleResult
): AgentPortCommitment | null {
  const receipt = result.receipt;
  if (!receipt?.receiptId || !receipt.payloadHash || !receipt.keyId || !receipt.signature) {
    return null;
  }

  if (!receipt.userSubject || !receipt.consentId || !receipt.authorityAssurance || !receipt.authorityEvidence?.length) {
    return null;
  }

  const source = result.source ?? resolved.binding.platform;
  const serviceId = result.serviceId ?? req.serviceId;
  const commitmentId = commitmentIdFor({
    businessId: req.businessId,
    serviceId,
    bindingId: resolved.bindingId,
    source,
    confirmationId: result.confirmationId
  });
  const eventType = commitmentEventTypeFor(action, result.type);
  const receiptRef = {
    receiptId: receipt.receiptId,
    action,
    resultType: result.type,
    payloadHash: receipt.payloadHash,
    keyId: receipt.keyId,
    signature: receipt.signature
  };

  return {
    protocol: "agentport-commitment",
    version: "0.1",
    commitmentId,
    status: commitmentStatusFor(result.type),
    subject: {
      holderRef: receipt.userSubject,
      ...(receipt.clientAgentId ? { clientAgentId: receipt.clientAgentId } : {})
    },
    business: {
      businessId: req.businessId,
      serviceId,
      bindingId: resolved.bindingId
    },
    backend: {
      source,
      confirmationId: result.confirmationId,
      systemOfRecord: true
    },
    authority: {
      assurance: receipt.authorityAssurance,
      evidenceRefs: receipt.authorityEvidence.map(authorityEvidenceRef),
      ...(receipt.delegationId ? { delegationId: receipt.delegationId } : {}),
      consentId: receipt.consentId
    },
    rights: commitmentRightsFor(caps, result.type),
    recoveryPolicy: commitmentRecoveryPolicyFor(resolved.binding, result.type),
    events: [
      {
        eventId: `event_${receipt.payloadHash.slice(0, 24)}`,
        type: eventType,
        at: receipt.issuedAt,
        actor: "business_gateway",
        receiptId: receipt.receiptId,
        backendConfirmationId: result.confirmationId
      }
    ],
    receipts: [receiptRef]
  };
}

function commitmentStatusFor(resultType: CommitmentEligibleResult["type"]): AgentPortCommitment["status"] {
  switch (resultType) {
    case "confirmed":
      return "active";
    case "cancelled":
      return "cancelled";
    case "rescheduled":
      return "rescheduled";
  }
}

function commitmentEventTypeFor(action: DelegatedAction, resultType: CommitmentEligibleResult["type"]): CommitmentEventType {
  if (action === "cancel_service" || resultType === "cancelled") {
    return "cancelled";
  }

  if (action === "reschedule_service" || resultType === "rescheduled") {
    return "rescheduled";
  }

  return "created";
}

function commitmentRightsFor(caps: AdapterCapabilities, resultType: CommitmentEligibleResult["type"]): AgentPortCommitment["rights"] {
  const allowedActions: AgentPortCommitment["rights"]["allowedActions"] = ["verify"];
  if (resultType !== "cancelled") {
    if (caps.cancelBooking) {
      allowedActions.push("cancel");
    }

    if (caps.rescheduleBooking) {
      allowedActions.push("reschedule");
    }
  }

  return {
    allowedActions,
    transferable: false,
    modificationRequiresConsent: true,
    cancellationRequiresConsent: true
  };
}

function commitmentRecoveryPolicyFor(
  binding: BackendBinding,
  resultType: CommitmentEligibleResult["type"]
): AgentPortCommitment["recoveryPolicy"] {
  if (resultType === "cancelled") {
    return {
      mode: "business_backend",
      fallbackAction: "refuse"
    };
  }

  if (binding.bookingUrl || binding.phone) {
    return {
      mode: "agentport_handoff",
      fallbackAction: "handoff"
    };
  }

  return {
    mode: "business_backend",
    fallbackAction: "retry_backend"
  };
}

function commitmentIdFor(input: {
  businessId: string;
  serviceId: string;
  bindingId: string;
  source: string;
  confirmationId: string;
}) {
  return `commitment_${sha256Hex(stableJson(input)).slice(0, 24)}`;
}

function authorityEvidenceRef(evidence: NonNullable<ActionReceiptPayload["authorityEvidence"]>[number]) {
  return [evidence.kind, evidence.issuer, evidence.ref].filter(Boolean).join(":");
}

function bindingWithCredentials(runtime: AgentPortRuntime, binding: Tenant["bindings"][number]) {
  return resolveBindingCredentials(binding, runtime.credentials ?? new NullCredentialVault());
}

async function ensureAuthorized(runtime: AgentPortRuntime, scope: Scope, context?: IncomingRequest): Promise<AuthorizationResult> {
  const auth = await runtime.auth.authorize(context ?? {
    headers: {},
    method: "MCP"
  });
  if (!auth?.scopes.includes(scope)) {
    throw new Error(`unauthorized:${scope}`);
  }

  return auth;
}

interface ActionGateResult {
  layer: ActionLayer;
  reason?: string;
}

type BusinessPortGateResult =
  | {
      ok: true;
      attestation?: BusinessPortAttestation;
      risk?: ActionRiskAssessment;
    }
  | {
      ok: false;
      reason: BusinessPortVerificationFailureReason;
      attestation?: BusinessPortAttestation;
      risk?: ActionRiskAssessment;
    };

interface ReceiptContext {
  userAuthority?: UserAuthorityContext;
  businessPortAttestation?: BusinessPortAttestation;
  risk?: ActionRiskAssessment;
}

async function validateActionGate(
  runtime: AgentPortRuntime,
  auth: AuthorizationResult,
  action: DelegatedAction,
  requiredScope: Scope,
  req: BookRequest | CancelRequest | RescheduleRequest
): Promise<ActionGateResult> {
  const layer = actionLayerFor(action, req);
  const layerPolicy = runtime.delegation?.layers?.[layer];
  const requireDelegation = layerPolicy?.requireDelegation ?? runtime.delegation?.requireForStateChanging ?? false;
  const requireReplayProtection = layerPolicy?.requireReplayProtection ?? runtime.delegation?.requireReplayProtection ?? false;
  const requireTokenConfirmation =
    layerPolicy?.requireTokenConfirmation ?? runtime.delegation?.requireTokenConfirmation ?? false;
  const tokenConfirmationMethods =
    layerPolicy?.tokenConfirmationMethods ?? runtime.delegation?.tokenConfirmationMethods;
  const proof = auth.delegation;
  const authority = auth.authority ?? (proof ? authorityContextFromDelegationProof(proof) : undefined);
  if (!proof && !authority) {
    return {
      layer,
      ...(requireDelegation ? { reason: "delegation_required" } : {})
    };
  }

  if (!proof && authority) {
    return validateAuthorityContextGate(
      runtime,
      authority,
      action,
      req,
      layer,
      layerPolicy,
      requireReplayProtection,
      requireTokenConfirmation
    );
  }

  if (!hasRequiredDelegationFields(proof)) {
    return { layer, reason: "delegation_invalid" };
  }

  if (!proof.scopes.includes(requiredScope)) {
    return { layer, reason: "delegation_scope_missing" };
  }

  if (proof.approvedActions && !proof.approvedActions.includes(action)) {
    return { layer, reason: "delegation_action_not_approved" };
  }

  if (proof.businessId && proof.businessId !== req.businessId) {
    return { layer, reason: "delegation_business_mismatch" };
  }

  if (proof.serviceId && proof.serviceId !== req.serviceId) {
    return { layer, reason: "delegation_service_mismatch" };
  }

  if (proof.actionIntent && !actionIntentMatchesRequest(proof.actionIntent, action, req)) {
    return { layer, reason: "delegation_action_intent_mismatch" };
  }

  if (proof.actionIntent && actionIntentExpired(proof.actionIntent, runtime.delegation?.now?.() ?? new Date())) {
    return { layer, reason: "delegation_expired" };
  }

  if (layerPolicy?.minAssurance && !meetsAssurance(proof.assurance, layerPolicy.minAssurance)) {
    return { layer, reason: "delegation_assurance_too_low" };
  }

  const tokenConfirmationFailure = validateTokenConfirmation(
    proof.tokenConfirmation,
    requireTokenConfirmation,
    tokenConfirmationMethods
  );
  if (tokenConfirmationFailure) {
    return { layer, reason: tokenConfirmationFailure };
  }

  if (runtime.delegation?.audience && proof.audience !== runtime.delegation.audience) {
    return { layer, reason: "delegation_audience_mismatch" };
  }

  if (runtime.delegation?.trustedIssuers?.length) {
    if (!proof.issuer || !runtime.delegation.trustedIssuers.includes(proof.issuer)) {
      return { layer, reason: "delegation_untrusted_issuer" };
    }
  }

  if (proof.expiresAt) {
    const expiresAt = Date.parse(proof.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return { layer, reason: "delegation_invalid" };
    }

    const now = runtime.delegation?.now?.() ?? new Date();
    if (expiresAt <= now.getTime()) {
      return { layer, reason: "delegation_expired" };
    }
  }

  if (runtime.delegation?.verifier) {
    const verified = await runtime.delegation.verifier.verify(proof);
    if (!verified.ok) {
      return { layer, reason: verified.reason };
    }
  }

  if (requireReplayProtection && !hasReplayHandle(proof)) {
    return { layer, reason: "delegation_replay_protection_required" };
  }

  if (runtime.delegation?.replay && hasReplayHandle(proof)) {
    const accepted = await runtime.delegation.replay.consume(proof);
    if (!accepted) {
      return { layer, reason: "delegation_replay_detected" };
    }
  }

  return { layer };
}

async function validateBusinessPortGate(
  runtime: AgentPortRuntime,
  action: DelegatedAction,
  layer: ActionLayer,
  resolved: CommitmentBindingContext
): Promise<BusinessPortGateResult> {
  const layerPolicy = runtime.businessPorts?.layers?.[layer];
  const requireAttestation =
    layerPolicy?.requireAttestation
      ?? runtime.businessPorts?.requireForStateChanging
      ?? false;

  if (!requireAttestation) {
    return { ok: true };
  }

  if (!runtime.businessPorts?.provider) {
    return businessPortFailureDecision(layer, "business_port_attestation_required", layerPolicy);
  }

  const verification = await runtime.businessPorts.provider.verify({
    tenant: resolved.tenant,
    binding: resolved.binding,
    bindingId: resolved.bindingId,
    action,
    actionLayer: layer
  });

  if (!verification.ok) {
    return businessPortFailureDecision(layer, verification.reason, layerPolicy, verification.attestation);
  }

  return verification;
}

function businessPortFailureDecision(
  layer: ActionLayer,
  reason: BusinessPortVerificationFailureReason,
  policy?: {
    onVerificationFailure?: Exclude<ActionRiskDecision, "allow">;
    warningMessage?: string;
    allowedFallback?: ActionRiskFallback;
    familiarBusinessPort?: boolean;
  },
  attestation?: BusinessPortAttestation
): BusinessPortGateResult {
  const decision = hardBusinessPortFailure(reason) ? "reject" : policy?.onVerificationFailure ?? "reject";
  const risk = policy?.onVerificationFailure
    ? businessPortRiskAssessment(layer, reason, decision, policy)
    : undefined;

  if (decision === "warn") {
    return { ok: true, attestation, risk };
  }

  return { ok: false, reason, attestation, risk };
}

function hardBusinessPortFailure(reason: BusinessPortVerificationFailureReason): boolean {
  return new Set<BusinessPortVerificationFailureReason>([
    "business_port_signature_malformed",
    "business_port_signature_invalid",
    "business_port_signature_key_revoked",
    "business_port_revoked",
    "business_port_business_mismatch",
    "business_port_binding_mismatch",
    "business_port_platform_mismatch",
    "business_port_endpoint_mismatch"
  ]).has(reason);
}

function businessPortRiskAssessment(
  layer: ActionLayer,
  reason: BusinessPortVerificationFailureReason,
  decision: ActionRiskDecision,
  policy?: {
    warningMessage?: string;
    allowedFallback?: ActionRiskFallback;
    familiarBusinessPort?: boolean;
  }
): ActionRiskAssessment {
  return {
    decision,
    level: riskLevelForBusinessPortFailure(layer, reason),
    reason,
    userMessage: policy?.warningMessage ?? defaultBusinessPortRiskMessage(decision, reason),
    allowedFallback: policy?.allowedFallback,
    familiarBusinessPort: policy?.familiarBusinessPort
  };
}

function riskLevelForBusinessPortFailure(
  layer: ActionLayer,
  reason: BusinessPortVerificationFailureReason
): ActionRiskAssessment["level"] {
  if (hardBusinessPortFailure(reason) || layer === "funds") {
    return "critical";
  }

  if (layer === "manage" || layer === "commit") {
    return "high";
  }

  if (reason === "business_port_signature_required" || reason === "business_port_attestation_required") {
    return layer === "lead" ? "medium" : "high";
  }

  return "medium";
}

function defaultBusinessPortRiskMessage(
  decision: ActionRiskDecision,
  reason: BusinessPortVerificationFailureReason
): string {
  if (decision === "warn") {
    return "This business endpoint is not fully verified for this action. Continue only if the details look right.";
  }

  if (decision === "step_up") {
    return "This action needs stronger verification before the gateway can continue.";
  }

  if (decision === "downgrade") {
    return "This action cannot use the requested trust level, so the gateway must use a lower-risk fallback.";
  }

  if (reason.includes("mismatch") || reason === "business_port_signature_invalid") {
    return "This endpoint does not match the verified business port and was blocked.";
  }

  return "This business endpoint could not be verified for the requested action.";
}

type UserAuthorityGateResult =
  | {
      ok: true;
      authority?: UserAuthorityContext;
    }
  | {
      ok: false;
      reason: UserAuthorityVerificationFailureReason;
      authority?: UserAuthorityContext;
    };

async function validateUserAuthorityGate(
  runtime: AgentPortRuntime,
  auth: AuthorizationResult,
  action: DelegatedAction,
  layer: ActionLayer,
  request: BookRequest | CancelRequest | RescheduleRequest
): Promise<UserAuthorityGateResult> {
  const requireAuthority =
    runtime.userAuthority?.layers?.[layer]?.requireAuthority
      ?? runtime.userAuthority?.requireForStateChanging
      ?? false;

  if (!requireAuthority) {
    return { ok: true };
  }

  if (!runtime.userAuthority?.provider) {
    return { ok: false, reason: "user_authority_required" };
  }

  const verification = await runtime.userAuthority.provider.verify({
    authorization: auth,
    action,
    actionLayer: layer,
    request
  });

  if (!verification.ok) {
    return verification;
  }

  const allowedTechnologies =
    runtime.userAuthority.layers?.[layer]?.allowedTechnologies
      ?? runtime.userAuthority.allowedTechnologies;
  if (allowedTechnologies?.length && (!verification.authority.technology || !allowedTechnologies.includes(verification.authority.technology))) {
    return {
      ok: false,
      reason: "user_authority_technology_not_allowed",
      authority: verification.authority
    };
  }

  return verification;
}

function validateAuthorityContextGate(
  runtime: AgentPortRuntime,
  authority: AuthorityContext,
  action: DelegatedAction,
  req: BookRequest | CancelRequest | RescheduleRequest,
  layer: ActionLayer,
  layerPolicy: ActionGatePolicy | undefined,
  requireReplayProtection: boolean,
  requireTokenConfirmation: boolean
): ActionGateResult {
  if (authority.action.layer !== layer) {
    return { layer, reason: "delegation_action_intent_mismatch" };
  }

  if (authority.action.bounds) {
    if (!actionIntentMatchesRequest(authority.action.bounds, action, req)) {
      return { layer, reason: "delegation_action_intent_mismatch" };
    }

    if (actionIntentExpired(authority.action.bounds, runtime.delegation?.now?.() ?? new Date())) {
      return { layer, reason: "delegation_expired" };
    }
  }

  if (authority.action.businessId && authority.action.businessId !== req.businessId) {
    return { layer, reason: "delegation_business_mismatch" };
  }

  if (authority.action.serviceId && authority.action.serviceId !== req.serviceId) {
    return { layer, reason: "delegation_service_mismatch" };
  }

  if (layerPolicy?.minAssurance && !authorityMeetsDelegationAssurance(authority.assurance, layerPolicy.minAssurance)) {
    return { layer, reason: "delegation_assurance_too_low" };
  }

  if (requireTokenConfirmation) {
    return { layer, reason: "delegation_token_confirmation_required" };
  }

  if (runtime.delegation?.audience && authority.validity.audience !== runtime.delegation.audience) {
    return { layer, reason: "delegation_audience_mismatch" };
  }

  if (runtime.delegation?.trustedIssuers?.length) {
    const trusted = authority.evidence.some((evidence) => {
      return evidence.issuer && runtime.delegation?.trustedIssuers?.includes(evidence.issuer);
    });
    if (!trusted) {
      return { layer, reason: "delegation_untrusted_issuer" };
    }
  }

  if (authority.validity.expiresAt) {
    const expiresAt = Date.parse(authority.validity.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      return { layer, reason: "delegation_invalid" };
    }

    const now = runtime.delegation?.now?.() ?? new Date();
    if (expiresAt <= now.getTime()) {
      return { layer, reason: "delegation_expired" };
    }
  }

  if (requireReplayProtection && !authority.validity.replayHandle) {
    return { layer, reason: "delegation_replay_protection_required" };
  }

  return { layer };
}

function actionLayerFor(
  action: DelegatedAction,
  req: BookRequest | CancelRequest | RescheduleRequest
): ActionLayer {
  if (action === "book_service") {
    const book = req as BookRequest;
    return book.requestedType === "request" || book.requestedType === "handoff" ? "lead" : "commit";
  }

  return "manage";
}

function actionIntentMatchesRequest(
  intent: NonNullable<DelegationProof["actionIntent"]>,
  action: DelegatedAction,
  req: BookRequest | CancelRequest | RescheduleRequest
): boolean {
  if (intent.action !== action || intent.businessId !== req.businessId) {
    return false;
  }

  if (intent.serviceId && intent.serviceId !== req.serviceId) {
    return false;
  }

  if (intent.bindingId && intent.bindingId !== req.bindingId) {
    return false;
  }

  if (action === "book_service") {
    const book = req as BookRequest;
    return optionalIntentFieldMatches(intent.requestedType, book.requestedType)
      && optionalIntentFieldMatches(intent.slotStart, book.slotStart);
  }

  if (action === "cancel_service") {
    const cancel = req as CancelRequest;
    return optionalIntentFieldMatches(intent.confirmationId, cancel.confirmationId);
  }

  const reschedule = req as RescheduleRequest;
  return optionalIntentFieldMatches(intent.confirmationId, reschedule.confirmationId)
    && optionalIntentFieldMatches(intent.newSlotStart, reschedule.newSlotStart);
}

function optionalIntentFieldMatches<T>(intentValue: T | undefined, requestValue: T | undefined): boolean {
  return intentValue === undefined || intentValue === requestValue;
}

function actionIntentExpired(intent: NonNullable<DelegationProof["actionIntent"]>, now: Date): boolean {
  if (!intent.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(intent.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

const assuranceRank: Record<DelegationAssurance, number> = {
  test: 0,
  session: 1,
  account: 2,
  passkey: 3,
  wallet: 4
};

function meetsAssurance(actual: DelegationAssurance | undefined, required: DelegationAssurance): boolean {
  if (!actual) {
    return false;
  }

  return assuranceRank[actual] >= assuranceRank[required];
}

const authorityAssuranceRank: Record<AuthorityAssurance, number> = {
  none: 0,
  signed: 2,
  "verified-mandate": 4
};

function authorityMeetsDelegationAssurance(actual: AuthorityAssurance, required: DelegationAssurance): boolean {
  return authorityAssuranceRank[actual] >= assuranceRank[required];
}

function validateTokenConfirmation(
  confirmation: DelegationTokenConfirmation | undefined,
  required: boolean,
  allowedMethods: TokenConfirmationMethod[] | undefined
): string | null {
  if (!confirmation) {
    return required ? "delegation_token_confirmation_required" : null;
  }

  if (allowedMethods?.length && !allowedMethods.includes(confirmation.method)) {
    return "delegation_token_confirmation_method_unsupported";
  }

  if (!hasValidTokenConfirmationDetails(confirmation)) {
    return "delegation_token_confirmation_invalid";
  }

  return null;
}

function hasValidTokenConfirmationDetails(confirmation: DelegationTokenConfirmation): boolean {
  switch (confirmation.method) {
    case "session":
      return hasNonEmptyString(confirmation.sessionId);
    case "dpop":
      return hasNonEmptyString(confirmation.jwkThumbprint);
    case "mtls":
      return hasNonEmptyString(confirmation.certificateThumbprint);
    case "wallet":
      return hasNonEmptyString(confirmation.keyId) || hasNonEmptyString(confirmation.jwkThumbprint);
  }
}

function hasRequiredDelegationFields(proof: DelegationProof): boolean {
  return [proof.delegationId, proof.userSubject, proof.agentId, proof.consentId].every(
    hasNonEmptyString
  );
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasReplayHandle(proof: DelegationProof): boolean {
  return typeof proof.challengeId === "string" && proof.challengeId.trim().length > 0
    || typeof proof.nonce === "string" && proof.nonce.trim().length > 0;
}

interface IntentExecutionStart {
  record?: ActionIntentLifecycleRecord;
  reason?: string;
}

async function beginIntentExecution(
  runtime: AgentPortRuntime,
  action: DelegatedAction,
  req: BookRequest | CancelRequest | RescheduleRequest,
  layer: ActionLayer
): Promise<IntentExecutionStart> {
  if (requiresApprovedIntent(runtime, layer) && !req.intentId) {
    return { reason: "intent_required" };
  }

  if (!req.intentId) {
    return {};
  }

  if (!runtime.intentLifecycles) {
    return { reason: "intent_lifecycle_store_unavailable" };
  }

  const record = await runtime.intentLifecycles.resolve(req.intentId);
  if (!record) {
    return { reason: "intent_lifecycle_not_found" };
  }

  const now = new Date();
  if (actionIntentExpired(record.actionIntent, now) || Date.parse(record.expiresAt) <= now.getTime()) {
    await saveIntentTerminal(runtime, record, action, {
      status: "expired",
      resultType: "rejected",
      reason: "intent_expired",
      at: now
    });
    return { reason: "intent_expired" };
  }

  if (record.status !== "approval_ready" || record.approval?.status !== "ready") {
    return { reason: "intent_lifecycle_not_executable" };
  }

  if (!req.approvedActionIntentHash) {
    return { reason: "intent_action_hash_required" };
  }

  const expectedHash = record.approval.actionIntentHash ?? createActionIntentHash(record.actionIntent);
  if (req.approvedActionIntentHash !== expectedHash || req.approvedActionIntentHash !== createActionIntentHash(record.actionIntent)) {
    return { reason: "intent_action_hash_mismatch" };
  }

  if (!actionIntentMatchesRequest(record.actionIntent, action, req)) {
    return { reason: "intent_action_mismatch" };
  }

  const approved = {
    ...record,
    status: "approved" as const,
    updatedAt: now.toISOString(),
    approval: {
      ...(record.approval ?? {}),
      status: "approved" as const
    },
    nextStep: "execute_action" as const
  };
  await runtime.intentLifecycles.save(approved);

  const executing = {
    ...approved,
    status: "executing" as const,
    updatedAt: new Date().toISOString()
  };
  await runtime.intentLifecycles.save(executing);
  return { record: executing };
}

function requiresApprovedIntent(runtime: AgentPortRuntime, layer: ActionLayer): boolean {
  const configured = runtime.delegation?.layers?.[layer]?.requireApprovedIntent;
  if (configured !== undefined) {
    return configured;
  }

  return layer === "commit" || layer === "manage" || layer === "funds";
}

async function completeIntentExecution(
  runtime: AgentPortRuntime,
  record: ActionIntentLifecycleRecord | undefined,
  action: DelegatedAction,
  result: StateChangingResult
): Promise<void> {
  if (!record || !runtime.intentLifecycles) {
    return;
  }

  await saveIntentTerminal(runtime, record, action, {
    status: result.type === "failed" || result.type === "rejected" ? "failed" : "succeeded",
    resultType: result.type,
    reason: reasonFromResult(result),
    receiptId: result.receipt?.receiptId,
    confirmationId: confirmationIdFromResult(result),
    at: new Date()
  });
}

async function saveIntentTerminal(
  runtime: AgentPortRuntime,
  record: ActionIntentLifecycleRecord,
  action: DelegatedAction,
  terminal: {
    status: "succeeded" | "failed" | "expired";
    resultType: string;
    reason?: string;
    receiptId?: string;
    confirmationId?: string;
    at: Date;
  }
): Promise<void> {
  if (!runtime.intentLifecycles) {
    return;
  }

  let terminalRecord: ActionIntentLifecycleRecord = {
    ...record,
    status: terminal.status,
    updatedAt: terminal.at.toISOString(),
    attempts: [
      ...record.attempts,
      {
        tool: action,
        at: terminal.at.toISOString(),
        resultType: terminal.resultType,
        reason: terminal.reason,
        receiptId: terminal.receiptId
      }
    ],
    execution: {
      resultType: terminal.resultType,
      reason: terminal.reason,
      receiptId: terminal.receiptId,
      confirmationId: terminal.confirmationId
    },
    nextStep: "terminal"
  };
  const resultDeliveryState = await deliverIntentResult(runtime, terminalRecord);
  if (resultDeliveryState) {
    terminalRecord = {
      ...terminalRecord,
      resultDeliveryState
    };
  }
  await runtime.intentLifecycles.save(terminalRecord);
}

type StateChangingResult = BookResult | CancelResult | RescheduleResult;

async function deliverIntentResult(runtime: AgentPortRuntime, record: ActionIntentLifecycleRecord): Promise<ActionIntentResultDeliverySummary | undefined> {
  if (!record.resultDelivery) {
    return undefined;
  }

  if (!runtime.intentResults) {
    return {
      channel: record.resultDelivery.channel,
      target: record.resultDelivery.target,
      status: "failed",
      updatedAt: new Date().toISOString(),
      attempts: 1,
      reason: "intent_result_sink_unavailable"
    };
  }

  try {
    const delivery = await runtime.intentResults.deliver(record);
    return delivery ? actionIntentResultDeliverySummary(delivery) : undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    await runtime.audit.record({
      type: "intent_result_delivery",
      businessId: record.actionIntent.businessId,
      serviceId: record.actionIntent.serviceId,
      resultType: "failed",
      metadata: {
        intentId: record.intentId,
        agentSessionId: record.agentSessionId,
        channel: record.resultDelivery.channel,
        reason
      },
      at: new Date().toISOString()
    });
    return {
      channel: record.resultDelivery.channel,
      target: record.resultDelivery.target,
      status: "failed",
      updatedAt: new Date().toISOString(),
      attempts: 1,
      reason
    };
  }
}

async function traceBookService(
  runtime: AgentPortRuntime,
  input: BookRequest,
  startedAt: Date,
  resultPromise: Promise<BookResult>,
  intentRecord?: ActionIntentLifecycleRecord
): Promise<BookResult> {
  const result = await resultPromise;
  await completeIntentExecution(runtime, intentRecord, "book_service", result);
  await emitExecutionTrace(runtime, createBookServiceExecutionTrace(input, result, { startedAt }));
  return result;
}

async function traceCancelService(
  runtime: AgentPortRuntime,
  input: CancelRequest,
  startedAt: Date,
  resultPromise: Promise<CancelResult>,
  intentRecord?: ActionIntentLifecycleRecord
): Promise<CancelResult> {
  const result = await resultPromise;
  await completeIntentExecution(runtime, intentRecord, "cancel_service", result);
  await emitExecutionTrace(runtime, createCancelServiceExecutionTrace(input, result, { startedAt }));
  return result;
}

async function traceRescheduleService(
  runtime: AgentPortRuntime,
  input: RescheduleRequest,
  startedAt: Date,
  resultPromise: Promise<RescheduleResult>,
  intentRecord?: ActionIntentLifecycleRecord
): Promise<RescheduleResult> {
  const result = await resultPromise;
  await completeIntentExecution(runtime, intentRecord, "reschedule_service", result);
  await emitExecutionTrace(runtime, createRescheduleServiceExecutionTrace(input, result, { startedAt }));
  return result;
}

async function emitExecutionTrace(runtime: AgentPortRuntime, trace: ExecutionGraphRecord): Promise<void> {
  if (!runtime.trace) {
    return;
  }

  try {
    await runtime.trace.record(trace);
  } catch {
    // Trace storage is observational and must never change gateway behavior.
  }
}

async function withActionReceipt<T extends StateChangingResult>(
  runtime: AgentPortRuntime,
  action: DelegatedAction,
  layer: ActionLayer,
  req: BookRequest | CancelRequest | RescheduleRequest,
  auth: AuthorizationResult,
  result: T,
  context: ReceiptContext = {}
): Promise<T> {
  const sanitized = stripAdapterReceipt(result);
  const risk = context.risk ?? riskFromResult(sanitized);
  const riskBoundResult = risk ? { ...sanitized, risk } : sanitized;
  if (!runtime.receipts?.signer) {
    return riskBoundResult as T;
  }

  const payload = actionReceiptPayload(runtime, action, layer, req, auth, riskBoundResult, { ...context, risk });
  const payloadHash = sha256Hex(stableJson(payload));
  const receiptId = `receipt_${payloadHash.slice(0, 24)}`;
  const signature = await runtime.receipts.signer.sign({
    receiptId,
    payload,
    payloadHash
  });

  const receipt = {
    ...payload,
    receiptId,
    issuer: signature.issuer,
    payloadHash,
    signature: signature.signature,
    keyId: signature.keyId
  };

  return {
    ...riskBoundResult,
    receipt
  };
}

function actionReceiptPayload(
  runtime: AgentPortRuntime,
  action: DelegatedAction,
  layer: ActionLayer,
  req: BookRequest | CancelRequest | RescheduleRequest,
  auth: AuthorizationResult,
  result: StateChangingResult,
  context: ReceiptContext = {}
): ActionReceiptPayload {
  const authority = auth.authority ?? (auth.delegation ? authorityContextFromDelegationProof(auth.delegation) : undefined);
  const userAuthority = context.userAuthority;
  const businessPort = context.businessPortAttestation;
  const risk = context.risk ?? riskFromResult(result);
  return {
    action,
    actionLayer: layer,
    businessId: req.businessId,
    serviceId: req.serviceId,
    resultType: result.type,
    resultReason: reasonFromResult(result),
    userAuthorityRef: userAuthority?.ref,
    userAuthoritySubject: userAuthority?.subjectRef,
    userAuthorityConsentRef: userAuthority?.consentRef,
    userAuthorityAssurance: userAuthority?.assurance,
    userAuthorityTechnology: userAuthority?.technology,
    delegationId: auth.delegation?.delegationId,
    consentId: auth.delegation?.consentId ?? authority?.user.consentRef,
    clientAgentId: auth.delegation?.agentId ?? authority?.caller.agentId,
    userSubject: auth.delegation?.userSubject ?? authority?.user.subjectRef,
    authorityAssurance: authority?.assurance,
    authorityEvidence: authority?.evidence,
    tokenConfirmationMethod: auth.delegation?.tokenConfirmation?.method,
    businessPortRef: businessPort?.ref,
    businessPortId: businessPort?.portId,
    businessPortStatus: businessPort?.status,
    businessPortVerifiedBy: businessPort?.verifiedBy,
    riskDecision: risk?.decision,
    riskLevel: risk?.level,
    riskReason: risk?.reason,
    riskUserMessage: risk?.userMessage,
    riskAllowedFallback: risk?.allowedFallback,
    riskFamiliarBusinessPort: risk?.familiarBusinessPort,
    backendConfirmationId: confirmationIdFromResult(result),
    backendSource: sourceFromResult(result),
    issuedAt: (runtime.receipts?.now?.() ?? new Date()).toISOString()
  };
}

function stripAdapterReceipt<T extends StateChangingResult>(result: T): T {
  const { receipt: _receipt, ...rest } = result as T & { receipt?: unknown };
  return rest as T;
}

function riskFromResult(result: StateChangingResult): ActionRiskAssessment | undefined {
  return "risk" in result ? result.risk : undefined;
}

function confirmationIdFromResult(result: StateChangingResult): string | undefined {
  return "confirmationId" in result ? result.confirmationId : undefined;
}

function reasonFromResult(result: StateChangingResult): string | undefined {
  return "reason" in result ? result.reason : undefined;
}

function sourceFromResult(result: StateChangingResult): string | undefined {
  return "source" in result ? result.source : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function audit(
  runtime: AgentPortRuntime,
  req: BookRequest,
  resultType: string,
  reason?: string,
  auth?: AuthorizationResult,
  layer?: ActionLayer
) {
  const metadata = {
    ...(layer ? { actionLayer: layer } : {}),
    ...(reason ? { reason } : {}),
    ...delegationAuditMetadata(auth?.delegation)
  };

  await runtime.audit.record({
    type: "book_service",
    businessId: req.businessId,
    serviceId: req.serviceId,
    resultType,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    at: new Date().toISOString()
  });
}

function delegationAuditMetadata(delegation: DelegationProof | undefined): Record<string, unknown> {
  if (!delegation) {
    return {};
  }

  return {
    delegation: {
      delegationId: delegation.delegationId,
      issuer: delegation.issuer,
      userSubject: delegation.userSubject,
      agentId: delegation.agentId,
      consentId: delegation.consentId,
      audience: delegation.audience,
      challengeId: delegation.challengeId,
      assurance: delegation.assurance,
      tokenConfirmation: delegation.tokenConfirmation ? {
        method: delegation.tokenConfirmation.method,
        keyId: delegation.tokenConfirmation.keyId,
        jwkThumbprint: delegation.tokenConfirmation.jwkThumbprint,
        certificateThumbprint: delegation.tokenConfirmation.certificateThumbprint,
        sessionId: delegation.tokenConfirmation.sessionId
      } : undefined
    }
  };
}
