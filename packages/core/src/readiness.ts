import { deriveBindingId } from "./bindings.js";
import { resolveActionCapability } from "./capabilities.js";
import type { BookingAdapter } from "./contracts.js";
import type { AdapterCapabilities, BackendBinding, Tenant, VerificationAttestation } from "./types.js";

export type ReadinessTier =
  | "listed"
  | "answer-ready"
  | "request-ready"
  | "confirm-ready"
  | "manage-ready"
  | "pay-ready";

export type ReadinessProtocolInputKind =
  | "mcp"
  | "a2a"
  | "ucp"
  | "acp"
  | "ap2"
  | "rfc9421"
  | "agentport-local";

export type ReadinessProtocolInputStatus = "configured" | "missing" | "unsupported";

export interface ReadinessProtocolInput {
  kind: ReadinessProtocolInputKind;
  status: ReadinessProtocolInputStatus;
  purpose?: string;
  ref?: string;
}

export type ReadinessGapCode =
  | "profile_review_required"
  | "verification_required"
  | "verification_stale"
  | "lead_channel_missing"
  | "backend_not_connected"
  | "backend_capability_missing"
  | "service_mapping_missing"
  | "authority_rail_missing"
  | "payment_rail_missing"
  | "protocol_profile_missing"
  | "protocol_signature_missing"
  | "protocol_webhook_missing";

export type ReadinessNextBestAction =
  | "review_profile"
  | "verify_business"
  | "configure_request_channel"
  | "connect_backend"
  | "configure_authority_rail"
  | "configure_payment_rail"
  | "ready";

export interface ReadinessGap {
  code: ReadinessGapCode;
  blocksTier: ReadinessTier;
  ownerAction: string;
  hostedAction?: string;
  bindingId?: string;
  serviceId?: string;
}

export interface ReadinessBindingReport {
  bindingId: string;
  platform: string;
  actionCapability: "inform" | "request" | "confirm";
  capabilities: AdapterCapabilities | null;
  services: Array<{ id: string; name: string }>;
  gaps: ReadinessGap[];
}

export interface ReadinessReport {
  type: "agentport.readiness_report.v0.1";
  businessId: string;
  businessName: string;
  currentTier: ReadinessTier;
  targetTier: ReadinessTier;
  verifiedStatus: VerificationAttestation["status"];
  protocolInputs: ReadinessProtocolInput[];
  bindings: ReadinessBindingReport[];
  gaps: ReadinessGap[];
  nextBestAction: ReadinessNextBestAction;
}

export interface EvaluateReadinessOptions {
  tenant: Tenant;
  adapters: Map<string, BookingAdapter>;
  targetTier?: ReadinessTier;
  profileReviewed?: boolean;
  protocolInputs?: ReadinessProtocolInput[];
  allowLocalAuthorityForConfirm?: boolean;
}

const tierRank: Record<ReadinessTier, number> = {
  "listed": 0,
  "answer-ready": 1,
  "request-ready": 2,
  "confirm-ready": 3,
  "manage-ready": 4,
  "pay-ready": 5
};

export async function evaluateReadiness(options: EvaluateReadinessOptions): Promise<ReadinessReport> {
  const profileReviewed = options.profileReviewed ?? true;
  const verification = options.tenant.verification?.status ?? "unverified";
  const protocolInputs = normalizeProtocolInputs(options.protocolInputs);
  const bindingReports = await evaluateBindings(options.tenant, options.adapters);
  const gaps: ReadinessGap[] = [];

  if (!profileReviewed) {
    gaps.push({
      code: "profile_review_required",
      blocksTier: "answer-ready",
      ownerAction: "Review and approve the drafted business profile."
    });
  }

  if (verification === "unverified") {
    gaps.push({
      code: "verification_required",
      blocksTier: "answer-ready",
      ownerAction: "Complete ownership verification before claiming answer readiness."
    });
  } else if (verification === "stale") {
    gaps.push({
      code: "verification_stale",
      blocksTier: "answer-ready",
      ownerAction: "Re-verify ownership before claiming answer readiness."
    });
  }

  for (const binding of bindingReports) {
    gaps.push(...binding.gaps);
  }

  const answerReady = profileReviewed && verification === "verified";
  const requestReady = answerReady && bindingReports.some((binding) =>
    hasMappedServices(binding) && (binding.actionCapability === "request" || binding.actionCapability === "confirm")
  );
  const confirmBackendReady = requestReady && bindingReports.some((binding) =>
    hasMappedServices(binding) && binding.capabilities?.confirmBooking === true
  );
  const authorityReady = hasConfirmAuthority(protocolInputs, options.allowLocalAuthorityForConfirm === true);
  const confirmReady = confirmBackendReady && authorityReady;
  const manageReady = confirmReady && bindingReports.some((binding) =>
    hasMappedServices(binding) && binding.capabilities?.cancelBooking === true && binding.capabilities.rescheduleBooking === true
  );
  const payReady = manageReady && hasPaymentRail(protocolInputs);

  if (answerReady && !requestReady) {
    gaps.push({
      code: "lead_channel_missing",
      blocksTier: "request-ready",
      ownerAction: "Configure a request-capable channel or binding for structured agent requests.",
      hostedAction: "Add a request-mode manual binding or lead destination."
    });
  }

  if (requestReady && !confirmBackendReady) {
    gaps.push({
      code: "backend_not_connected",
      blocksTier: "confirm-ready",
      ownerAction: "Connect Square, Calendly, or another confirm-capable backend.",
      hostedAction: "Create a credential-vault reference and test adapter capabilities."
    });
  }

  if (confirmBackendReady && !authorityReady) {
    gaps.push({
      code: "authority_rail_missing",
      blocksTier: "confirm-ready",
      ownerAction: "Configure AP2, UCP, ACP, or another accepted authority/commerce rail for confirmed actions.",
      hostedAction: "Verify protocol profile, key binding, mandate, or checkout authority before enabling confirm-ready."
    });
  }

  if (confirmReady && !manageReady) {
    gaps.push({
      code: "backend_capability_missing",
      blocksTier: "manage-ready",
      ownerAction: "Connect a backend that supports cancel and reschedule actions.",
      hostedAction: "Test cancel/reschedule adapter capabilities before enabling manage-ready."
    });
  }

  if (manageReady && !payReady) {
    gaps.push({
      code: "payment_rail_missing",
      blocksTier: "pay-ready",
      ownerAction: "Configure AP2/UCP/ACP-compatible payment or checkout rails.",
      hostedAction: "Verify processor/payment authority and payment lifecycle handling before enabling pay-ready."
    });
  }

  const currentTier = highestTier({ answerReady, requestReady, confirmReady, manageReady, payReady });
  const targetTier = options.targetTier ?? defaultTargetTier(currentTier);

  return {
    type: "agentport.readiness_report.v0.1",
    businessId: options.tenant.id,
    businessName: options.tenant.name,
    currentTier,
    targetTier,
    verifiedStatus: verification,
    protocolInputs,
    bindings: bindingReports,
    gaps: gaps.filter((gap) => tierRank[gap.blocksTier] > tierRank[currentTier] || gap.code === "profile_review_required"),
    nextBestAction: nextBestAction(gaps, currentTier)
  };
}

async function evaluateBindings(tenant: Tenant, adapters: Map<string, BookingAdapter>): Promise<ReadinessBindingReport[]> {
  const reports: ReadinessBindingReport[] = [];

  for (const [index, binding] of tenant.bindings.entries()) {
    const bindingId = deriveBindingId(binding, index);
    const adapter = adapters.get(binding.platform);
    if (!adapter) {
      reports.push({
        bindingId,
        platform: binding.platform,
        actionCapability: "inform",
        capabilities: null,
        services: serviceSummaries(binding),
        gaps: [{
          code: "backend_not_connected",
          blocksTier: "request-ready",
          ownerAction: `Register an adapter for ${binding.platform} or choose a supported request channel.`,
          hostedAction: "Install or configure the backend adapter before using this binding.",
          bindingId
        }]
      });
      continue;
    }

    const capabilities = await adapter.capabilities(binding);
    const actionCapability = resolveActionCapability(capabilities);
    const services = await servicesForBinding(adapter, binding);
    const gaps: ReadinessGap[] = [];

    if ((actionCapability === "request" || actionCapability === "confirm") && services.length === 0) {
      gaps.push({
        code: "service_mapping_missing",
        blocksTier: actionCapability === "confirm" ? "confirm-ready" : "request-ready",
        ownerAction: "Map at least one owner-approved service to this binding.",
        hostedAction: "Sync or configure service mapping before exposing this binding to agents.",
        bindingId
      });
    }

    reports.push({
      bindingId,
      platform: binding.platform,
      actionCapability,
      capabilities,
      services,
      gaps
    });
  }

  return reports;
}

function hasMappedServices(binding: ReadinessBindingReport): boolean {
  return binding.services.length > 0;
}

async function servicesForBinding(adapter: BookingAdapter, binding: BackendBinding): Promise<Array<{ id: string; name: string }>> {
  const staticServices = serviceSummaries(binding);
  if (staticServices.length > 0) {
    return staticServices;
  }

  const listed = await adapter.listServices(binding);
  return listed.map((service) => ({ id: service.id, name: service.name }));
}

function serviceSummaries(binding: BackendBinding): Array<{ id: string; name: string }> {
  return (binding.staticServices ?? []).map((service) => ({ id: service.id, name: service.name }));
}

function normalizeProtocolInputs(inputs: ReadinessProtocolInput[] = []): ReadinessProtocolInput[] {
  if (inputs.length > 0) {
    return inputs.map((input) => ({ ...input }));
  }

  return [{
    kind: "mcp",
    status: "configured",
    purpose: "agent_tool_transport"
  }];
}

function hasConfirmAuthority(inputs: ReadinessProtocolInput[], allowLocalAuthority: boolean): boolean {
  return inputs.some((input) =>
    input.status === "configured" &&
    (input.kind === "ap2" || input.kind === "ucp" || input.kind === "acp" || (allowLocalAuthority && input.kind === "agentport-local"))
  );
}

function hasPaymentRail(inputs: ReadinessProtocolInput[]): boolean {
  const kinds = new Set(inputs.filter((input) => input.status === "configured").map((input) => input.kind));
  return kinds.has("ap2") && (kinds.has("ucp") || kinds.has("acp"));
}

function highestTier(state: {
  answerReady: boolean;
  requestReady: boolean;
  confirmReady: boolean;
  manageReady: boolean;
  payReady: boolean;
}): ReadinessTier {
  if (state.payReady) {
    return "pay-ready";
  }
  if (state.manageReady) {
    return "manage-ready";
  }
  if (state.confirmReady) {
    return "confirm-ready";
  }
  if (state.requestReady) {
    return "request-ready";
  }
  if (state.answerReady) {
    return "answer-ready";
  }
  return "listed";
}

function defaultTargetTier(currentTier: ReadinessTier): ReadinessTier {
  if (currentTier === "listed") {
    return "answer-ready";
  }
  if (currentTier === "answer-ready") {
    return "request-ready";
  }
  if (currentTier === "request-ready") {
    return "confirm-ready";
  }
  if (currentTier === "confirm-ready") {
    return "manage-ready";
  }
  return "pay-ready";
}

function nextBestAction(gaps: ReadinessGap[], currentTier: ReadinessTier): ReadinessNextBestAction {
  const blocking = gaps.find((gap) => tierRank[gap.blocksTier] > tierRank[currentTier] || gap.code === "profile_review_required");
  if (!blocking) {
    return "ready";
  }

  switch (blocking.code) {
    case "profile_review_required":
      return "review_profile";
    case "verification_required":
    case "verification_stale":
      return "verify_business";
    case "lead_channel_missing":
      return "configure_request_channel";
    case "backend_not_connected":
    case "backend_capability_missing":
    case "service_mapping_missing":
      return "connect_backend";
    case "authority_rail_missing":
    case "protocol_profile_missing":
    case "protocol_signature_missing":
    case "protocol_webhook_missing":
      return "configure_authority_rail";
    case "payment_rail_missing":
      return "configure_payment_rail";
  }
}
