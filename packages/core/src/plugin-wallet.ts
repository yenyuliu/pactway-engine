import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ActionReceipt, AgentPortCommitment } from "./types.js";

export const pluginWalletForbiddenRawFields = [
  "raw_delegation_tokens",
  "token_confirmation_secrets",
  "credentials",
  "card_data",
  "identity_documents",
  "chat_transcripts",
  "model_reasoning",
  "full_customer_profiles"
];

export const pluginWalletEncryptedFields = [
  "commitment",
  "receipt",
  "label",
  "receiptRefs",
  "lastVerifiedStatus",
  "lastVerifiedAt",
  "pendingAction",
  "destinationRefs",
  "deliveryAttempts"
] as const;

export type PluginWalletStatus = AgentPortCommitment["status"] | "unknown";

export interface PluginWalletPendingActionAttemptSummary {
  attemptedAt: string;
  type: "sent" | "failed" | "handoff" | "rejected";
  reason?: string;
  deliveryId?: string;
  destinationRef?: string;
  proofLevel?: string;
}

export interface PluginWalletPendingAction {
  action: "verify_ticket" | "send_ticket" | "transfer_ticket" | "recover_ticket";
  destinationRef?: string;
  requestedAt: string;
  expiresAt?: string;
  lastAttempt?: PluginWalletPendingActionAttemptSummary;
}

export interface PluginWalletTicketPayload {
  commitment: AgentPortCommitment;
  receipt?: ActionReceipt;
  label?: string;
  receiptRefs: AgentPortCommitment["receipts"];
  lastVerifiedStatus?: PluginWalletStatus;
  lastVerifiedAt?: string;
  pendingAction?: PluginWalletPendingAction;
  destinationRefs?: string[];
  deliveryAttempts?: PluginWalletDeliveryAttemptRecord[];
}

export interface PluginWalletTicketSummary {
  protocol: "agentport-plugin-wallet-ticket-summary";
  version: "0.1";
  walletId: string;
  walletTicketId: string;
  commitmentId: string;
  label?: string;
  lastVerifiedStatus?: PluginWalletStatus;
  lastVerifiedAt?: string;
  pendingAction?: PluginWalletPendingAction;
  deliveryAttemptCount: number;
  lastDeliveryAttempt?: PluginWalletDeliveryAttemptSummary;
  updatedAt: string;
}

export interface PluginWalletModelTicketSummary {
  protocol: "agentport-plugin-wallet-model-summary";
  version: "0.1";
  walletId: string;
  walletTicketId: string;
  commitmentId: string;
  label?: string;
  status?: PluginWalletStatus;
  statusSource: "agent_gateway" | "local_last_known";
  verifiedCurrent: boolean;
  reverifyRequired: boolean;
  lastVerifiedAt?: string;
  proofLevel?: string;
  pendingAction?: PluginWalletPendingAction;
  deliveryAttemptCount: number;
  lastDeliveryAttempt?: PluginWalletDeliveryAttemptSummary;
  updatedAt: string;
  reason?: string;
}

export interface PluginWalletPendingActionSummary {
  protocol: "agentport-plugin-wallet-pending-action-summary";
  version: "0.1";
  walletId: string;
  walletTicketId: string;
  commitmentId: string;
  label?: string;
  action: PluginWalletPendingAction["action"];
  destinationRef?: string;
  requestedAt: string;
  expiresAt?: string;
  expired: boolean;
  userReviewRequired: boolean;
  lastAttempt?: PluginWalletPendingActionAttemptSummary;
  lastVerifiedStatus?: PluginWalletStatus;
  lastVerifiedAt?: string;
  updatedAt: string;
}

export type PluginWalletDeliveryOutcome = "sent" | "failed" | "handoff" | "rejected";

export interface PluginWalletDeliveryAttemptSummary {
  protocol: "agentport-plugin-wallet-delivery-attempt-summary";
  version: "0.1";
  walletId: string;
  walletTicketId: string;
  commitmentId: string;
  deliveryAttemptId: string;
  action: PluginWalletPendingAction["action"];
  outcome: PluginWalletDeliveryOutcome;
  attemptedAt: string;
  destinationKind?: string;
  destinationRef?: string;
  deliveryId?: string;
  deliveredAt?: string;
  proofLevel?: string;
  reason?: string;
  backendMutation: false;
}

export interface PluginWalletDeliveryAttemptRecord {
  deliveryAttemptId: string;
  action: PluginWalletPendingAction["action"];
  outcome: PluginWalletDeliveryOutcome;
  attemptedAt: string;
  destinationKind?: string;
  destinationRef?: string;
  deliveryId?: string;
  deliveredAt?: string;
  proofLevel?: string;
  reason?: string;
  backendMutation: false;
}

export type PluginWalletAttentionReason =
  | "pending_action"
  | "pending_action_expired"
  | "delivery_failed"
  | "delivery_handoff"
  | "delivery_rejected"
  | "status_unknown"
  | "verification_stale"
  | "reverify_required";

export interface PluginWalletTicketReviewSummary {
  protocol: "agentport-plugin-wallet-ticket-review-summary";
  version: "0.1";
  walletId: string;
  walletTicketId: string;
  commitmentId: string;
  label?: string;
  businessId?: string;
  serviceId?: string;
  bindingId?: string;
  status?: PluginWalletStatus;
  lastVerifiedAt?: string;
  pendingAction?: PluginWalletPendingActionSummary;
  deliveryAttemptCount: number;
  lastDeliveryAttempt?: PluginWalletDeliveryAttemptSummary;
  needsAttention: boolean;
  attentionReasons: PluginWalletAttentionReason[];
  updatedAt: string;
}

export type PluginWalletGatewayStatusResult =
  | {
      type: "status";
      commitmentId: string;
      status: AgentPortCommitment["status"];
      proofLevel?: string;
      holderRef?: string;
      backend?: AgentPortCommitment["backend"];
      commitment?: AgentPortCommitment;
      receipt?: ActionReceipt;
    }
  | {
      type: "invalid" | "rejected" | "failed";
      reason: string;
      commitmentId?: string;
      status?: PluginWalletStatus;
      proofLevel?: string;
    };

export interface PluginWalletGatewayClient {
  getTicketStatus(input: {
    commitment: AgentPortCommitment;
    receipt?: ActionReceipt;
    holderRef?: string;
  }): Promise<PluginWalletGatewayStatusResult>;
}

export interface RehydratePluginWalletTicketInput {
  walletId: string;
  walletTicketId: string;
  gateway: PluginWalletGatewayClient;
  holderRef?: string;
}

export type RehydratePluginWalletTicketResult =
  | {
      type: "missing";
      walletId: string;
      walletTicketId: string;
      reason: "wallet_ticket_not_found";
    }
  | {
      type: "current";
      walletId: string;
      walletTicketId: string;
      commitmentId: string;
      status: AgentPortCommitment["status"];
      proofLevel?: string;
      summary: PluginWalletTicketSummary;
      modelSummary: PluginWalletModelTicketSummary;
    }
  | {
      type: "last_known";
      walletId: string;
      walletTicketId: string;
      commitmentId: string;
      reason: string;
      summary: PluginWalletTicketSummary;
      modelSummary: PluginWalletModelTicketSummary;
    };

export interface MarkPluginWalletPendingActionInput {
  walletId: string;
  walletTicketId: string;
  pendingAction: Omit<PluginWalletPendingAction, "requestedAt"> & { requestedAt?: string };
  userConsent?: boolean;
}

export type MarkPluginWalletPendingActionResult =
  | {
      type: "marked";
      walletId: string;
      walletTicketId: string;
      summary: PluginWalletTicketSummary;
      pendingAction: PluginWalletPendingActionSummary;
    }
  | {
      type: "missing";
      walletId: string;
      walletTicketId: string;
      reason: "wallet_ticket_not_found";
    }
  | {
      type: "rejected";
      walletId: string;
      walletTicketId: string;
      reason: "consent_required";
    };

export interface ClearPluginWalletPendingActionInput {
  walletId: string;
  walletTicketId: string;
}

export type ClearPluginWalletPendingActionResult =
  | {
      type: "cleared";
      walletId: string;
      walletTicketId: string;
      summary: PluginWalletTicketSummary;
    }
  | {
      type: "missing";
      walletId: string;
      walletTicketId: string;
      reason: "wallet_ticket_not_found";
    };

export interface ListPluginWalletPendingActionsInput {
  walletId: string;
  includeExpired?: boolean;
}

export interface PreparePluginWalletPendingActionReplayInput {
  walletId: string;
  walletTicketId: string;
  gateway: PluginWalletGatewayClient;
  holderRef?: string;
  userConsent?: boolean;
}

export type PreparePluginWalletPendingActionReplayResult =
  | {
      type: "ready";
      walletId: string;
      walletTicketId: string;
      commitmentId: string;
      pendingAction: PluginWalletPendingActionSummary;
      restore: Extract<RehydratePluginWalletTicketResult, { type: "current" }>;
      modelSummary: PluginWalletModelTicketSummary;
    }
  | {
      type: "reverify_required";
      walletId: string;
      walletTicketId: string;
      commitmentId: string;
      reason: string;
      pendingAction: PluginWalletPendingActionSummary;
      restore: Extract<RehydratePluginWalletTicketResult, { type: "last_known" }>;
      modelSummary: PluginWalletModelTicketSummary;
    }
  | {
      type: "missing";
      walletId: string;
      walletTicketId: string;
      reason: "wallet_ticket_not_found";
    }
  | {
      type: "rejected";
      walletId: string;
      walletTicketId: string;
      reason: "consent_required" | "pending_action_not_found" | "pending_action_expired";
      pendingAction?: PluginWalletPendingActionSummary;
    };

export interface RecordPluginWalletDeliveryAttemptInput {
  walletId: string;
  walletTicketId: string;
  attempt: {
    action: PluginWalletPendingAction["action"];
    outcome: PluginWalletDeliveryOutcome;
    attemptedAt?: string;
    destinationKind?: string;
    destinationRef?: string;
    deliveryId?: string;
    deliveredAt?: string;
    proofLevel?: string;
    reason?: string;
  };
  clearPendingAction?: boolean;
}

export type RecordPluginWalletDeliveryAttemptResult =
  | {
      type: "recorded";
      walletId: string;
      walletTicketId: string;
      summary: PluginWalletTicketSummary;
      deliveryAttempt: PluginWalletDeliveryAttemptSummary;
    }
  | {
      type: "missing";
      walletId: string;
      walletTicketId: string;
      reason: "wallet_ticket_not_found";
    };

export interface ListPluginWalletDeliveryAttemptsInput {
  walletId: string;
  walletTicketId: string;
}

export interface SearchPluginWalletTicketsInput {
  walletId: string;
  status?: PluginWalletStatus | PluginWalletStatus[];
  businessId?: string;
  serviceId?: string;
  hasPendingAction?: boolean;
  pendingAction?: PluginWalletPendingAction["action"];
  destinationKind?: string;
  needsAttention?: boolean;
  updatedAfter?: string;
  updatedBefore?: string;
  staleAfter?: string;
  includeExpiredPending?: boolean;
  sort?: "updated_asc" | "updated_desc";
}

export interface ListPluginWalletNeedsAttentionInput {
  walletId: string;
  staleAfter?: string;
  includeExpiredPending?: boolean;
}

export type PluginWalletHostRuntime = "browser" | "mobile" | "desktop" | "server_test" | "other";

export interface PluginWalletHostIntegrationPacket {
  protocol: "agentport-plugin-wallet-host-integration";
  version: "0.1";
  requiredHostState: [
    "walletId",
    "sessionId",
    "hostRuntime",
    "restoreCadence",
    "consentUiHooks",
    "recoveryWorker"
  ];
  restoreCadence: {
    required: "on_session_start";
    optional: ["periodic", "user_triggered"];
  };
  consentUiHooks: [
    "show_pending_action",
    "request_fresh_user_consent",
    "show_reverify_required",
    "show_expired_action_review"
  ];
  recoveryWorkerResponsibilities: [
    "unlock_wallet_key_provider",
    "run_session_restore",
    "surface_model_safe_summaries",
    "prepare_pending_action_after_consent",
    "never_store_raw_recovery_secret"
  ];
  hostOwned: [
    "wallet namespace",
    "session binding",
    "key unlock UX",
    "consent UI",
    "restore scheduling",
    "local export/import UX"
  ];
  agentPortOwned: [
    "gateway status verification",
    "commitment lifecycle authority",
    "backend outcome receipts"
  ];
  boundaries: {
    localWalletDurable: true;
    gatewayLifecycleAuthority: true;
    sessionIdGrantsAuthority: false;
    restoreDeliversPendingActions: false;
    currentStateRequiresGateway: true;
  };
  mcpTools: [
    "verify_ticket",
    "get_ticket_status",
    "get_allowed_ticket_actions",
    "send_ticket"
  ];
}

export interface RestorePluginWalletHostSessionInput {
  walletId: string;
  sessionId: string;
  hostRuntime?: PluginWalletHostRuntime;
  gateway: PluginWalletGatewayClient;
  holderRef?: string;
  includeExpiredPending?: boolean;
  pendingActionConsent?: Record<string, boolean>;
  page?: {
    limit?: number;
    cursor?: string;
    sort?: "updated_asc" | "updated_desc";
  };
}

export type PluginWalletHostPendingActionResolution =
  | {
      type: "ready";
      walletId: string;
      sessionId: string;
      walletTicketId: string;
      commitmentId: string;
      action: PluginWalletPendingAction["action"];
      pendingAction: PluginWalletPendingActionSummary;
      modelSummary: PluginWalletModelTicketSummary;
    }
  | {
      type: "reverify_required";
      walletId: string;
      sessionId: string;
      walletTicketId: string;
      commitmentId: string;
      action: PluginWalletPendingAction["action"];
      reason: string;
      pendingAction: PluginWalletPendingActionSummary;
      modelSummary: PluginWalletModelTicketSummary;
    }
  | {
      type: "rejected";
      walletId: string;
      sessionId: string;
      walletTicketId: string;
      action: PluginWalletPendingAction["action"];
      reason: "consent_required" | "pending_action_not_found" | "pending_action_expired" | "wallet_ticket_not_found";
      pendingAction?: PluginWalletPendingActionSummary;
    };

export interface RestorePluginWalletHostSessionResult {
  protocol: "agentport-plugin-wallet-host-restore";
  version: "0.1";
  walletId: string;
  sessionId: string;
  hostRuntime: PluginWalletHostRuntime;
  restoredAt: string;
  ticketCount: number;
  currentCount: number;
  lastKnownCount: number;
  missingCount: number;
  pendingActionCount: number;
  requiredReverify: boolean;
  page: PluginWalletHostRestorePage;
  telemetry: PluginWalletHostRestoreTelemetry;
  tickets: PluginWalletModelTicketSummary[];
  pendingActions: PluginWalletPendingActionSummary[];
  pendingActionResolutions: PluginWalletHostPendingActionResolution[];
  boundary: {
    localWalletDurable: true;
    gatewayLifecycleAuthority: true;
    localStateSource: "local_last_known";
    currentStateSource: "agent_gateway";
    pendingActionsRequireFreshConsent: true;
    restoreDeliversPendingActions: false;
  };
}

export interface PluginWalletHostRestorePage {
  limit: number;
  cursor?: string;
  nextCursor?: string;
  hasMore: boolean;
  sort: "updated_asc" | "updated_desc";
  totalTicketCount: number;
  returnedTicketCount: number;
  offset: number;
}

export interface PluginWalletHostRestoreTelemetry {
  protocol: "agentport-plugin-wallet-host-restore-telemetry";
  version: "0.1";
  walletId: string;
  sessionId: string;
  generatedAt: string;
  totalTicketCount: number;
  returnedTicketCount: number;
  currentCount: number;
  lastKnownCount: number;
  missingCount: number;
  pendingActionCount: number;
  pendingReadyCount: number;
  pendingReverifyRequiredCount: number;
  pendingRejectedCount: number;
  expiredPendingCount: number;
  consentRequiredCount: number;
  failedRestoreCount: number;
  payloadFieldsIncluded: [];
}

export interface PluginWalletRestoreScheduleInput {
  hostRuntime: PluginWalletHostRuntime;
  now: string;
  trigger: "session_start" | "user_triggered" | "periodic" | "background";
  walletTicketCount: number;
  pendingActionCount?: number;
  staleTicketCount?: number;
  lastRestoredAt?: string;
  lowPowerMode?: boolean;
  network?: "online" | "offline" | "metered";
}

export interface PluginWalletRestoreScheduleRecommendation {
  protocol: "agentport-plugin-wallet-restore-schedule";
  version: "0.1";
  hostRuntime: PluginWalletHostRuntime;
  generatedAt: string;
  action: "restore_now" | "defer" | "user_triggered_only";
  reason:
    | "session_start"
    | "user_requested"
    | "pending_action_review"
    | "stale_ticket_review"
    | "offline"
    | "low_power_background"
    | "browser_background_throttled"
    | "empty_wallet"
    | "recently_restored";
  recommendedPageLimit: number;
  nextReviewAfter?: string;
  backgroundPollingRecommended: boolean;
  requiresUserPresence: boolean;
}

export interface PluginWalletPilotHostAdapterPacket {
  protocol: "agentport-plugin-wallet-host-adapter";
  version: "0.1";
  adapterId: string;
  hostRuntime: PluginWalletHostRuntime;
  ownedHooks: {
    keyProvider: string;
    walletStore: string;
    gatewayClient: string;
    consentUi: string;
    restoreScheduler: string;
    telemetrySink: string;
    exportImportUi: string;
  };
  restore: {
    defaultPageLimit: number;
    cadence: PluginWalletHostIntegrationPacket["restoreCadence"];
    supportedTriggers: PluginWalletRestoreScheduleInput["trigger"][];
  };
  consent: {
    pendingActionsRequireFreshConsent: true;
    replayPreparationOnly: true;
    deliveryOwnedByHostCommand: true;
  };
  forbiddenHostState: typeof pluginWalletForbiddenRawFields;
  boundaries: {
    keyCustodyHostOwned: true;
    sessionIdGrantsAuthority: false;
    restoreDeliversPendingActions: false;
    currentStateRequiresGateway: true;
    telemetryIsLifecycleTruth: false;
  };
}

export interface PluginWalletPilotEvidencePacket {
  protocol: "agentport-plugin-wallet-pilot-evidence";
  version: "0.1";
  evidenceId: string;
  generatedAt: string;
  adapter: {
    adapterId: string;
    hostRuntime: PluginWalletHostRuntime;
  };
  restorePage: PluginWalletHostRestorePage;
  schedule: PluginWalletRestoreScheduleRecommendation;
  telemetry: PluginWalletHostRestoreTelemetry;
  failureModes: Array<
    | "locked_wallet"
    | "gateway_unavailable"
    | "expired_pending_action"
    | "user_triggered_retry"
  >;
  payloadSafety: {
    excludesDecryptedLabels: true;
    excludesCommitments: true;
    excludesReceipts: true;
    excludesSignatures: true;
    excludesBackendConfirmations: true;
    excludesDestinationRefs: true;
    excludesRawKeyMaterial: true;
    excludesRecoverySecrets: true;
  };
  boundaries: {
    localWalletDurable: true;
    gatewayLifecycleAuthority: true;
    evidenceIsLifecycleTruth: false;
    pendingActionsDelivered: false;
  };
}

export type PluginWalletHostAdapterSmokeMode =
  | "success_restore"
  | "locked_wallet"
  | "gateway_failure"
  | "expired_pending_action"
  | "user_triggered_retry";

export interface PluginWalletHostAdapterSmokeResult {
  protocol: "agentport-plugin-wallet-host-adapter-smoke";
  version: "0.1";
  smokeId: string;
  generatedAt: string;
  mode: PluginWalletHostAdapterSmokeMode;
  adapter: {
    adapterId: string;
    hostRuntime: PluginWalletHostRuntime;
  };
  outcome: "passed" | "failed_closed" | "reverify_required" | "needs_review";
  reason:
    | "restore_succeeded"
    | "locked_wallet"
    | "wallet_unlock_failed"
    | "gateway_reverify_required"
    | "expired_pending_action_review"
    | "user_triggered_retry_consent_gated";
  hooks: {
    declared: PluginWalletPilotHostAdapterPacket["ownedHooks"];
    calls: {
      keyProvider: number;
      walletStore: number;
      gatewayClient: number;
      consentUi: number;
      restoreScheduler: number;
      telemetrySink: number;
    };
  };
  restorePage?: PluginWalletHostRestorePage;
  schedule?: PluginWalletRestoreScheduleRecommendation;
  telemetry?: PluginWalletHostRestoreTelemetry;
  pendingActionResolutions: {
    ready: number;
    reverifyRequired: number;
    rejected: number;
    expiredRejected: number;
  };
  deliveryAttempted: false;
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  boundaries: {
    keyCustodyHostOwned: true;
    gatewayLifecycleAuthority: true;
    smokeUsesPlatformApis: false;
    smokeDeliversPendingActions: false;
    telemetryIsLifecycleTruth: false;
  };
}

export interface RunPluginWalletHostAdapterSmokeInput {
  smokeId: string;
  mode: PluginWalletHostAdapterSmokeMode;
  adapter: PluginWalletPilotHostAdapterPacket;
  walletId: string;
  sessionId: string;
  store: PluginWalletStore;
  keyProvider: PluginWalletKeyProvider;
  gateway: PluginWalletGatewayClient;
  now: string;
  trigger: PluginWalletRestoreScheduleInput["trigger"];
  holderRef?: string;
  page?: RestorePluginWalletHostSessionInput["page"];
  includeExpiredPending?: boolean;
  consent?: {
    grantPendingActionConsent?: boolean | Record<string, boolean>;
  };
  telemetrySink?: (telemetry: PluginWalletHostRestoreTelemetry) => void | Promise<void>;
  network?: PluginWalletRestoreScheduleInput["network"];
  lowPowerMode?: boolean;
}

export interface PluginWalletReturnedSessionReviewItem {
  walletTicketId: string;
  businessId?: string;
  serviceId?: string;
  status?: PluginWalletStatus;
  statusSource: "agent_gateway" | "local_last_known";
  verifiedCurrent: boolean;
  reverifyRequired: boolean;
  pendingAction?: {
    action: PluginWalletPendingAction["action"];
    expired: boolean;
    userReviewRequired: boolean;
  };
  attentionReasons: PluginWalletAttentionReason[];
  deliveryAttemptCount: number;
  lastVerifiedAt?: string;
  updatedAt: string;
  reason?: string;
}

export interface PluginWalletReturnedSessionReviewSurface {
  protocol: "agentport-plugin-wallet-returned-session-review";
  version: "0.1";
  reviewId: string;
  generatedAt: string;
  walletId: string;
  sessionId: string;
  counts: {
    totalReturned: number;
    current: number;
    lastKnown: number;
    needsAttention: number;
    pendingConsent: number;
    expiredReview: number;
    reverifyRequired: number;
  };
  sections: {
    current: PluginWalletReturnedSessionReviewItem[];
    lastKnown: PluginWalletReturnedSessionReviewItem[];
    needsAttention: PluginWalletReturnedSessionReviewItem[];
    pendingConsent: PluginWalletReturnedSessionReviewItem[];
    expiredReview: PluginWalletReturnedSessionReviewItem[];
    reverifyRequired: PluginWalletReturnedSessionReviewItem[];
  };
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  boundaries: {
    gatewayCurrentOnly: true;
    localLastKnownRequiresReverify: true;
    reviewDeliversPendingActions: false;
    reviewIsLifecycleTruth: false;
  };
}

export interface CreatePluginWalletReturnedSessionReviewSurfaceInput {
  reviewId: string;
  generatedAt: string;
  restore: RestorePluginWalletHostSessionResult;
  reviews?: PluginWalletTicketReviewSummary[];
}

export type PluginWalletVirtualStoreReferenceScenario =
  | "success_restore"
  | "gateway_unavailable"
  | "pending_consent"
  | "expired_pending_action"
  | "locked_wallet"
  | "user_triggered_retry";

export interface PluginWalletVirtualStoreReferenceScenarioResult {
  scenario: PluginWalletVirtualStoreReferenceScenario;
  outcome: "passed" | "failed_closed" | "last_known_reverify_required" | "needs_review";
  gatewayStatusSource: "agent_gateway" | "local_last_known" | "not_called";
  reviewSection: keyof PluginWalletReturnedSessionReviewSurface["sections"] | "none";
  gatewayReverifyRequired: boolean;
  walletMutation: "allowed_after_gateway_reverify" | "blocked" | "unchanged";
  consentRule: "not_required" | "fresh_consent_required" | "expired_requires_review";
  deliveryAttempted: false;
}

export interface PluginWalletVirtualStoreReferenceHarnessResult {
  protocol: "agentport-plugin-wallet-virtual-store-reference-harness";
  version: "0.1";
  harnessId: string;
  generatedAt: string;
  store: {
    businessId: "agentport-virtual-store";
    serviceId: "product_demo";
    backendSource: "fixture";
    virtualStoreCanonicalReference: true;
    realMarketProof: false;
  };
  scenarioCount: number;
  scenarios: PluginWalletVirtualStoreReferenceScenarioResult[];
  requiredScenarios: PluginWalletVirtualStoreReferenceScenario[];
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  boundaries: {
    virtualStoreTreatedAsReferenceBusiness: true;
    gatewayLifecycleAuthority: true;
    currentRequiresGatewayReverify: true;
    localLastKnownRequiresReverify: true;
    referenceHarnessDeliversActions: false;
    referenceHarnessOwnsFullVirtualStoreEnvironment: false;
    paymentWallet: false;
    credentialVault: false;
  };
}

export interface CreatePluginWalletVirtualStoreReferenceHarnessInput {
  harnessId: string;
  generatedAt: string;
  scenarios: PluginWalletVirtualStoreReferenceScenarioResult[];
}

export type PluginWalletGoldenTraceScenario =
  | PluginWalletVirtualStoreReferenceScenario
  | "stale_last_known"
  | "duplicate_commitment"
  | "export_import"
  | "wrong_key_restore";

export interface PluginWalletGoldenTraceMatrixRow {
  scenario: PluginWalletGoldenTraceScenario;
  trigger:
    | "session_restore"
    | "gateway_status_failure"
    | "stale_local_status"
    | "pending_action_review"
    | "wallet_unlock"
    | "user_retry"
    | "save_ticket"
    | "wallet_migration";
  gatewayResult:
    | "verified_current"
    | "unavailable"
    | "not_called"
    | "reverify_required";
  walletMutation:
    | "update_last_verified_status"
    | "mark_reverify_required"
    | "mark_pending_consent"
    | "mark_expired_review"
    | "blocked"
    | "dedupe_existing_ticket"
    | "preserve_encrypted_payload"
    | "unchanged";
  mutationAllowed: boolean;
  mutationReason: string;
  reviewSection: keyof PluginWalletReturnedSessionReviewSurface["sections"] | "none";
  modelVisibility:
    | "current"
    | "last_known_reverify_required"
    | "pending_consent"
    | "expired_review"
    | "not_visible_until_unlock";
  consentRule: "not_required" | "fresh_consent_required" | "expired_requires_review";
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  deliveryAttempted: false;
}

export interface PluginWalletGoldenTraceMatrix {
  protocol: "agentport-plugin-wallet-golden-trace-matrix";
  version: "0.1";
  matrixId: string;
  generatedAt: string;
  sourceHarness: {
    protocol: "agentport-plugin-wallet-virtual-store-reference-harness";
    fixture: "examples/plugin-wallet-virtual-store-reference-harness.v0.1.json";
    canonicalBusinessId: "agentport-virtual-store";
    canonicalServiceId: "product_demo";
  };
  requiredScenarios: PluginWalletGoldenTraceScenario[];
  traceCount: number;
  traces: PluginWalletGoldenTraceMatrixRow[];
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  boundaries: {
    matrixIsLifecycleTruth: false;
    gatewayCurrentOnly: true;
    localLastKnownRequiresReverify: true;
    retryRequiresFreshConsent: true;
    lockedWalletCallsGateway: false;
    wrongKeyRestoreCallsGateway: false;
    matrixDeliversActions: false;
    paymentWallet: false;
    credentialVault: false;
  };
}

export interface CreatePluginWalletGoldenTraceMatrixInput {
  matrixId: string;
  generatedAt: string;
  traces: PluginWalletGoldenTraceMatrixRow[];
}

export type PluginWalletHostAdoptionKitComponentId =
  | "gateway_wallet_contract"
  | "host_integration_packet"
  | "host_adapter_packets"
  | "host_adapter_smoke_harness"
  | "pilot_host_runbook"
  | "returned_session_review_surface"
  | "virtual_store_reference_harness"
  | "golden_trace_matrix"
  | "conformance_evidence";

export interface PluginWalletHostAdoptionKitComponent {
  componentId: PluginWalletHostAdoptionKitComponentId;
  artifact: string;
  helper?: string;
  owner: "agentport" | "host" | "shared";
  purpose: string;
  required: true;
}

export type PluginWalletHostAdoptionKitCheckId =
  | "restore_success"
  | "locked_wallet_fails_closed"
  | "gateway_unavailable_last_known"
  | "expired_pending_action_review"
  | "user_triggered_retry_fresh_consent"
  | "golden_trace_comparison"
  | "returned_review_payload_safe"
  | "conformance_evidence_present";

export interface PluginWalletHostAdoptionKitCheck {
  checkId: PluginWalletHostAdoptionKitCheckId;
  evidenceRef: string;
  expectation: string;
  blocksSupportClaim: true;
}

export interface PluginWalletHostAdoptionKit {
  protocol: "agentport-plugin-wallet-host-adoption-kit";
  version: "0.1";
  kitId: string;
  generatedAt: string;
  components: PluginWalletHostAdoptionKitComponent[];
  mustPassChecks: PluginWalletHostAdoptionKitCheck[];
  hostOwnedResponsibilities: [
    "key_unlock",
    "local_wallet_store",
    "consent_ui",
    "restore_worker",
    "telemetry_sink",
    "export_import_ux"
  ];
  agentPortOwnedBoundaries: [
    "gateway_current_truth",
    "wallet_contract",
    "reference_harness",
    "golden_trace_matrix",
    "payload_safety_rules",
    "conformance_evidence"
  ];
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  runtimeRequirements: {
    liveCredentialsRequired: false;
    networkRequired: false;
    wallClockSleepsRequired: false;
    platformApisRequired: false;
    fullVirtualStoreEnvironmentRequired: false;
    realBusinessRequired: false;
  };
  boundaries: {
    kitIsLifecycleTruth: false;
    gatewayCurrentOnly: true;
    retryRequiresFreshConsent: true;
    hostOwnsKeyCustody: true;
    agentPortOwnsGatewayTruth: true;
    adoptionKitDeliversActions: false;
    adoptionKitIsHostSdk: false;
    paymentWallet: false;
    credentialVault: false;
  };
}

export interface CreatePluginWalletHostAdoptionKitInput {
  kitId: string;
  generatedAt: string;
  components: PluginWalletHostAdoptionKitComponent[];
  mustPassChecks: PluginWalletHostAdoptionKitCheck[];
}

export type PluginWalletRealBusinessHandoffEvidenceId =
  | "owner_approved_business_profile"
  | "ownership_verification"
  | "real_backend_outcome"
  | "gateway_receipt"
  | "returned_session_restore"
  | "gateway_reverify"
  | "returned_session_review"
  | "redaction_manifest";

export interface PluginWalletRealBusinessHandoffEvidenceRequirement {
  evidenceId: PluginWalletRealBusinessHandoffEvidenceId;
  sourceOwner: "real_business_pilot" | "agentport_gateway" | "host";
  requirement: string;
  proofRefPolicy: "external_ref_only" | "redacted_summary_only";
  required: true;
  blocksRealPilotClaim: true;
}

export type PluginWalletRealBusinessHandoffRedactionRuleId =
  | "no_customer_pii"
  | "no_owner_contact_details"
  | "no_decrypted_wallet_labels"
  | "no_commitment_bodies"
  | "no_receipt_bodies"
  | "no_signatures"
  | "no_backend_confirmation_ids"
  | "no_destination_refs"
  | "no_credentials_or_tokens"
  | "no_real_business_private_fixture_data";

export interface PluginWalletRealBusinessHandoffRedactionRule {
  ruleId: PluginWalletRealBusinessHandoffRedactionRuleId;
  appliesTo: "deterministic_fixture" | "real_pilot_evidence" | "all_wallet_artifacts";
  requirement: string;
  replacement: "external_ref" | "redacted_summary" | "omit";
  required: true;
}

export interface PluginWalletRealBusinessHandoffBoundary {
  protocol: "agentport-plugin-wallet-real-business-handoff";
  version: "0.1";
  boundaryId: string;
  generatedAt: string;
  sourceKit: {
    protocol: "agentport-plugin-wallet-host-adoption-kit";
    fixture: "examples/plugin-wallet-host-adoption-kit.v0.1.json";
  };
  requiredEvidenceIds: PluginWalletRealBusinessHandoffEvidenceId[];
  requiredEvidence: PluginWalletRealBusinessHandoffEvidenceRequirement[];
  requiredRedactionRuleIds: PluginWalletRealBusinessHandoffRedactionRuleId[];
  redactionRules: PluginWalletRealBusinessHandoffRedactionRule[];
  deterministicFixturePolicy: {
    realBusinessEvidenceAllowedInCiFixtures: false;
    privateBusinessDataAllowedInCiFixtures: false;
    realBackendConfirmationAllowedInCiFixtures: false;
    realCustomerDataAllowedInCiFixtures: false;
    fixtureMayContainRequirementRefs: true;
  };
  payloadSafety: PluginWalletPilotEvidencePacket["payloadSafety"];
  boundaries: {
    handoffBoundaryIsRealPilotEvidence: false;
    realPilotRequiresOwnerApproval: true;
    realPilotRequiresOwnershipVerification: true;
    realPilotRequiresBackendOutcome: true;
    realPilotRequiresGatewayReceipt: true;
    realPilotRequiresReturnedSessionReview: true;
    deterministicFixturesAreRealMarketProof: false;
    supportingBranchOwnsRealBusinessOperations: false;
    paymentWallet: false;
    bookingLedger: false;
    credentialVault: false;
    systemOfRecord: false;
  };
}

export interface CreatePluginWalletRealBusinessHandoffBoundaryInput {
  boundaryId: string;
  generatedAt: string;
  requiredEvidence: PluginWalletRealBusinessHandoffEvidenceRequirement[];
  redactionRules: PluginWalletRealBusinessHandoffRedactionRule[];
}

export interface EncryptedPluginWalletTicket {
  protocol: "agentport-plugin-wallet-ticket";
  version: "0.1";
  walletId: string;
  walletTicketId: string;
  commitmentId: string;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
  encryption: {
    alg: "A256GCM";
    keyId: string;
    nonce: string;
    tag: string;
    ciphertext: string;
  };
  privacy: {
    encryptedFields: typeof pluginWalletEncryptedFields;
    forbiddenRawFields: typeof pluginWalletForbiddenRawFields;
  };
}

export interface PluginWalletStore {
  list(walletId: string): Promise<EncryptedPluginWalletTicket[]>;
  read(walletId: string, walletTicketId: string): Promise<EncryptedPluginWalletTicket | null>;
  write(record: EncryptedPluginWalletTicket): Promise<void>;
  delete(walletId: string, walletTicketId: string): Promise<void>;
}

export interface PluginWalletCipher {
  keyId: string;
  encrypt(plaintext: string, aad: string): Promise<{
    nonce: string;
    tag: string;
    ciphertext: string;
  }>;
  decrypt(envelope: { nonce: string; tag: string; ciphertext: string }, aad: string): Promise<string>;
}

export interface PluginWalletKeyMaterial {
  keyId: string;
  key: Buffer | string;
}

export interface PluginWalletKeyProvider {
  readonly kind: "passphrase" | "platform_injected";
  readonly keyId?: string;
  getKeyMaterial(): Promise<PluginWalletKeyMaterial>;
}

export interface ExportPluginWalletInput {
  walletId: string;
}

export interface PluginWalletExport {
  protocol: "agentport-plugin-wallet-export";
  version: "0.1";
  walletId: string;
  exportedAt: string;
  ticketCount: number;
  encryption: {
    alg: "A256GCM";
    keyIds: string[];
    encryptedFields: typeof pluginWalletEncryptedFields;
    forbiddenRawFields: typeof pluginWalletForbiddenRawFields;
  };
  recovery: {
    userControlled: true;
    agentPortCanRecover: false;
    notes: string[];
  };
  tickets: EncryptedPluginWalletTicket[];
}

export interface ImportPluginWalletInput {
  walletExport: PluginWalletExport;
  walletId?: string;
}

export type ImportPluginWalletResult =
  | {
      type: "imported";
      walletId: string;
      ticketCount: number;
    }
  | {
      type: "rejected";
      reason:
        | "wallet_export_protocol_unsupported"
        | "wallet_export_version_unsupported"
        | "wallet_id_mismatch"
        | "wallet_record_mismatch";
      walletId?: string;
      exportWalletId?: string;
    };

export interface AgentPortPluginWalletOptions {
  store: PluginWalletStore;
  cipher: PluginWalletCipher;
  previousCiphers?: PluginWalletCipher[];
  now?: () => Date;
}

export interface SavePluginWalletTicketInput {
  walletId: string;
  commitment: AgentPortCommitment;
  receipt?: ActionReceipt;
  label?: string;
  lastVerifiedStatus?: PluginWalletStatus;
  lastVerifiedAt?: string;
  pendingAction?: PluginWalletPendingAction;
  destinationRefs?: string[];
  deliveryAttempts?: PluginWalletDeliveryAttemptRecord[];
}

export class AgentPortPluginWallet {
  constructor(private readonly options: AgentPortPluginWalletOptions) {}

  async saveTicket(input: SavePluginWalletTicketInput): Promise<PluginWalletTicketSummary> {
    const walletTicketId = walletTicketIdFor(input.walletId, input.commitment.commitmentId);
    const existing = await this.options.store.read(input.walletId, walletTicketId);
    const now = this.now();
    const payload: PluginWalletTicketPayload = {
      commitment: input.commitment,
      receipt: input.receipt,
      label: input.label,
      receiptRefs: input.commitment.receipts,
      lastVerifiedStatus: input.lastVerifiedStatus ?? input.commitment.status,
      lastVerifiedAt: input.lastVerifiedAt ?? now,
      pendingAction: input.pendingAction,
      destinationRefs: input.destinationRefs,
      deliveryAttempts: input.deliveryAttempts
    };
    assertNoForbiddenRawWalletFields(payload);
    const plaintext = stableJson(payload);
    const payloadHash = sha256Hex(plaintext);
    const aad = walletAad(input.walletId, walletTicketId, input.commitment.commitmentId);
    const encrypted = await this.options.cipher.encrypt(plaintext, aad);
    const record: EncryptedPluginWalletTicket = {
      protocol: "agentport-plugin-wallet-ticket",
      version: "0.1",
      walletId: input.walletId,
      walletTicketId,
      commitmentId: input.commitment.commitmentId,
      payloadHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      encryption: {
        alg: "A256GCM",
        keyId: this.options.cipher.keyId,
        ...encrypted
      },
      privacy: {
        encryptedFields: pluginWalletEncryptedFields,
        forbiddenRawFields: pluginWalletForbiddenRawFields
      }
    };

    await this.options.store.write(record);
    return summaryFromPayload(record, payload);
  }

  async loadTicket(walletId: string, walletTicketId: string): Promise<{
    record: EncryptedPluginWalletTicket;
    payload: PluginWalletTicketPayload;
    summary: PluginWalletTicketSummary;
  } | null> {
    const record = await this.options.store.read(walletId, walletTicketId);
    if (!record) {
      return null;
    }

    const payload = await this.decryptRecord(record);
    return {
      record,
      payload,
      summary: summaryFromPayload(record, payload)
    };
  }

  async listTickets(walletId: string): Promise<PluginWalletTicketSummary[]> {
    const records = await this.options.store.list(walletId);
    const summaries = await Promise.all(records.map(async (record) => {
      const payload = await this.decryptRecord(record);
      return summaryFromPayload(record, payload);
    }));

    return summaries.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async exportWallet(input: ExportPluginWalletInput): Promise<PluginWalletExport> {
    const records = await this.options.store.list(input.walletId);
    const keyIds = [...new Set(records.map((record) => record.encryption.keyId))].sort();
    return {
      protocol: "agentport-plugin-wallet-export",
      version: "0.1",
      walletId: input.walletId,
      exportedAt: this.now(),
      ticketCount: records.length,
      encryption: {
        alg: "A256GCM",
        keyIds,
        encryptedFields: pluginWalletEncryptedFields,
        forbiddenRawFields: pluginWalletForbiddenRawFields
      },
      recovery: {
        userControlled: true,
        agentPortCanRecover: false,
        notes: [
          "Export contains encrypted wallet records only; it does not include raw key material.",
          "AgentPort cannot recover records without the user's platform key, passkey unwrap path, or recovery key.",
          "Import preserves the original wallet id because record AAD is wallet-bound."
        ]
      },
      tickets: records.map((record) => structuredClone(record))
    };
  }

  async importWallet(input: ImportPluginWalletInput): Promise<ImportPluginWalletResult> {
    const walletExport = input.walletExport;
    if (walletExport.protocol !== "agentport-plugin-wallet-export") {
      return {
        type: "rejected",
        reason: "wallet_export_protocol_unsupported"
      };
    }

    if (walletExport.version !== "0.1") {
      return {
        type: "rejected",
        reason: "wallet_export_version_unsupported",
        exportWalletId: walletExport.walletId
      };
    }

    const targetWalletId = input.walletId ?? walletExport.walletId;
    if (targetWalletId !== walletExport.walletId) {
      return {
        type: "rejected",
        reason: "wallet_id_mismatch",
        walletId: targetWalletId,
        exportWalletId: walletExport.walletId
      };
    }

    for (const record of walletExport.tickets) {
      if (record.walletId !== walletExport.walletId || record.protocol !== "agentport-plugin-wallet-ticket" || record.version !== "0.1") {
        return {
          type: "rejected",
          reason: "wallet_record_mismatch",
          walletId: record.walletId,
          exportWalletId: walletExport.walletId
        };
      }
    }

    for (const record of walletExport.tickets) {
      await this.options.store.write(structuredClone(record));
    }

    return {
      type: "imported",
      walletId: walletExport.walletId,
      ticketCount: walletExport.tickets.length
    };
  }

  async findByCommitment(walletId: string, commitmentId: string) {
    return this.loadTicket(walletId, walletTicketIdFor(walletId, commitmentId));
  }

  async markPendingAction(input: MarkPluginWalletPendingActionInput): Promise<MarkPluginWalletPendingActionResult> {
    if (input.userConsent !== true) {
      return {
        type: "rejected",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "consent_required"
      };
    }

    const loaded = await this.loadTicket(input.walletId, input.walletTicketId);
    if (!loaded) {
      return {
        type: "missing",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "wallet_ticket_not_found"
      };
    }

    const now = this.now();
    const pendingAction: PluginWalletPendingAction = {
      ...input.pendingAction,
      requestedAt: input.pendingAction.requestedAt ?? now
    };
    const summary = await this.saveTicket({
      walletId: input.walletId,
      commitment: loaded.payload.commitment,
      receipt: loaded.payload.receipt,
      label: loaded.payload.label,
      lastVerifiedStatus: loaded.payload.lastVerifiedStatus,
      lastVerifiedAt: loaded.payload.lastVerifiedAt,
      pendingAction,
      destinationRefs: loaded.payload.destinationRefs,
      deliveryAttempts: loaded.payload.deliveryAttempts
    });

    return {
      type: "marked",
      walletId: input.walletId,
      walletTicketId: input.walletTicketId,
      summary,
      pendingAction: pendingActionSummaryFromSummary(summary, now)
    };
  }

  async clearPendingAction(input: ClearPluginWalletPendingActionInput): Promise<ClearPluginWalletPendingActionResult> {
    const loaded = await this.loadTicket(input.walletId, input.walletTicketId);
    if (!loaded) {
      return {
        type: "missing",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "wallet_ticket_not_found"
      };
    }

    const summary = await this.saveTicket({
      walletId: input.walletId,
      commitment: loaded.payload.commitment,
      receipt: loaded.payload.receipt,
      label: loaded.payload.label,
      lastVerifiedStatus: loaded.payload.lastVerifiedStatus,
      lastVerifiedAt: loaded.payload.lastVerifiedAt,
      pendingAction: undefined,
      destinationRefs: loaded.payload.destinationRefs,
      deliveryAttempts: loaded.payload.deliveryAttempts
    });

    return {
      type: "cleared",
      walletId: input.walletId,
      walletTicketId: input.walletTicketId,
      summary
    };
  }

  async listPendingActions(input: ListPluginWalletPendingActionsInput): Promise<PluginWalletPendingActionSummary[]> {
    const now = this.now();
    const summaries = await this.listTickets(input.walletId);
    return summaries
      .filter((summary) => summary.pendingAction)
      .map((summary) => pendingActionSummaryFromSummary(summary, now))
      .filter((summary) => input.includeExpired !== false || !summary.expired);
  }

  async preparePendingActionReplay(
    input: PreparePluginWalletPendingActionReplayInput
  ): Promise<PreparePluginWalletPendingActionReplayResult> {
    if (input.userConsent !== true) {
      return {
        type: "rejected",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "consent_required"
      };
    }

    const checkedAt = this.now();
    const loaded = await this.loadTicket(input.walletId, input.walletTicketId);
    if (!loaded) {
      return {
        type: "missing",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "wallet_ticket_not_found"
      };
    }

    if (!loaded.summary.pendingAction) {
      return {
        type: "rejected",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "pending_action_not_found"
      };
    }

    const pendingAction = pendingActionSummaryFromSummary(loaded.summary, checkedAt);
    if (pendingAction.expired) {
      return {
        type: "rejected",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "pending_action_expired",
        pendingAction
      };
    }

    const restore = await this.rehydrateTicket({
      walletId: input.walletId,
      walletTicketId: input.walletTicketId,
      gateway: input.gateway,
      holderRef: input.holderRef
    });
    if (restore.type === "missing") {
      return restore;
    }

    if (restore.type !== "current") {
      return {
        type: "reverify_required",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        commitmentId: restore.commitmentId,
        reason: restore.reason,
        pendingAction,
        restore,
        modelSummary: restore.modelSummary
      };
    }

    return {
      type: "ready",
      walletId: input.walletId,
      walletTicketId: input.walletTicketId,
      commitmentId: restore.commitmentId,
      pendingAction: pendingActionSummaryFromSummary(restore.summary, checkedAt),
      restore,
      modelSummary: restore.modelSummary
    };
  }

  async recordDeliveryAttempt(
    input: RecordPluginWalletDeliveryAttemptInput
  ): Promise<RecordPluginWalletDeliveryAttemptResult> {
    const loaded = await this.loadTicket(input.walletId, input.walletTicketId);
    if (!loaded) {
      return {
        type: "missing",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "wallet_ticket_not_found"
      };
    }

    const attemptedAt = input.attempt.attemptedAt ?? this.now();
    const existingAttempts = loaded.payload.deliveryAttempts ?? [];
    const deliveryAttempt: PluginWalletDeliveryAttemptRecord = {
      deliveryAttemptId: deliveryAttemptIdFor(
        input.walletId,
        input.walletTicketId,
        loaded.payload.commitment.commitmentId,
        attemptedAt,
        existingAttempts.length
      ),
      action: input.attempt.action,
      outcome: input.attempt.outcome,
      attemptedAt,
      destinationKind: input.attempt.destinationKind,
      destinationRef: input.attempt.destinationRef,
      deliveryId: input.attempt.deliveryId,
      deliveredAt: input.attempt.deliveredAt,
      proofLevel: input.attempt.proofLevel,
      reason: input.attempt.reason,
      backendMutation: false
    };

    const summary = await this.saveTicket({
      walletId: input.walletId,
      commitment: loaded.payload.commitment,
      receipt: loaded.payload.receipt,
      label: loaded.payload.label,
      lastVerifiedStatus: loaded.payload.lastVerifiedStatus,
      lastVerifiedAt: loaded.payload.lastVerifiedAt,
      pendingAction: input.clearPendingAction ? undefined : loaded.payload.pendingAction,
      destinationRefs: loaded.payload.destinationRefs,
      deliveryAttempts: [...existingAttempts, deliveryAttempt]
    });

    return {
      type: "recorded",
      walletId: input.walletId,
      walletTicketId: input.walletTicketId,
      summary,
      deliveryAttempt: deliveryAttemptSummaryFromRecord(summary, deliveryAttempt)
    };
  }

  async listDeliveryAttempts(
    input: ListPluginWalletDeliveryAttemptsInput
  ): Promise<PluginWalletDeliveryAttemptSummary[]> {
    const loaded = await this.loadTicket(input.walletId, input.walletTicketId);
    if (!loaded) {
      return [];
    }

    return (loaded.payload.deliveryAttempts ?? [])
      .map((attempt) => deliveryAttemptSummaryFromRecord(loaded.summary, attempt))
      .sort((left, right) => left.attemptedAt.localeCompare(right.attemptedAt));
  }

  async searchTickets(input: SearchPluginWalletTicketsInput): Promise<PluginWalletTicketReviewSummary[]> {
    const checkedAt = this.now();
    const records = await this.options.store.list(input.walletId);
    const entries = await Promise.all(records.map(async (record) => {
      const payload = await this.decryptRecord(record);
      return {
        payload,
        review: reviewSummaryFromPayload(record, payload, checkedAt, input.staleAfter)
      };
    }));

    return entries
      .filter(({ payload, review }) => matchesReviewSearch(input, payload, review))
      .map(({ review }) => review)
      .sort((left, right) => sortReviewSummaries(left, right, input.sort ?? "updated_desc"));
  }

  async listNeedsAttention(input: ListPluginWalletNeedsAttentionInput): Promise<PluginWalletTicketReviewSummary[]> {
    return this.searchTickets({
      walletId: input.walletId,
      needsAttention: true,
      staleAfter: input.staleAfter,
      includeExpiredPending: input.includeExpiredPending,
      sort: "updated_desc"
    });
  }

  async restoreHostSession(
    input: RestorePluginWalletHostSessionInput
  ): Promise<RestorePluginWalletHostSessionResult> {
    const restoredAt = this.now();
    const pageLimit = normalizeRestorePageLimit(input.page?.limit);
    const pageSort = input.page?.sort ?? "updated_desc";
    const pageOffset = decodeRestorePageCursor(input.page?.cursor);
    const records = (await this.options.store.list(input.walletId))
      .sort((left, right) => sortWalletRecords(left, right, pageSort));
    const pageRecords = records.slice(pageOffset, pageOffset + pageLimit);
    const pageSummaries = await Promise.all(pageRecords.map(async (record) => {
      const payload = await this.decryptRecord(record);
      return summaryFromPayload(record, payload);
    }));
    const nextOffset = pageOffset + pageRecords.length;
    const page: PluginWalletHostRestorePage = {
      limit: pageLimit,
      cursor: input.page?.cursor,
      nextCursor: nextOffset < records.length ? encodeRestorePageCursor(nextOffset) : undefined,
      hasMore: nextOffset < records.length,
      sort: pageSort,
      totalTicketCount: records.length,
      returnedTicketCount: pageRecords.length,
      offset: pageOffset
    };
    const restored = await Promise.all(pageSummaries.map((summary) => this.rehydrateTicket({
      walletId: input.walletId,
      walletTicketId: summary.walletTicketId,
      gateway: input.gateway,
      holderRef: input.holderRef
    })));
    const tickets = restored
      .filter((result): result is Exclude<RehydratePluginWalletTicketResult, { type: "missing" }> => result.type !== "missing")
      .map((result) => result.modelSummary);
    const pendingActionTicketIds = new Set(pageSummaries
      .filter((summary) => summary.pendingAction)
      .map((summary) => summary.walletTicketId));
    const pendingActions = pageSummaries
      .filter((summary) => pendingActionTicketIds.has(summary.walletTicketId))
      .map((summary) => pendingActionSummaryFromSummary(summary, restoredAt))
      .filter((summary) => input.includeExpiredPending !== false || !summary.expired);
    const pendingActionResolutions = await Promise.all(pendingActions.map(async (pendingAction) => {
      const prepared = await this.preparePendingActionReplay({
        walletId: input.walletId,
        walletTicketId: pendingAction.walletTicketId,
        gateway: input.gateway,
        holderRef: input.holderRef,
        userConsent: input.pendingActionConsent?.[pendingAction.walletTicketId] === true
      });
      return hostPendingActionResolutionFromReplay(input.sessionId, pendingAction, prepared);
    }));
    const lastKnownCount = restored.filter((result) => result.type === "last_known").length;
    const currentCount = restored.filter((result) => result.type === "current").length;
    const missingCount = restored.filter((result) => result.type === "missing").length;
    const telemetry = hostRestoreTelemetryFromCounts({
      walletId: input.walletId,
      sessionId: input.sessionId,
      generatedAt: restoredAt,
      totalTicketCount: records.length,
      returnedTicketCount: pageRecords.length,
      currentCount,
      lastKnownCount,
      missingCount,
      pendingActions,
      pendingActionResolutions
    });

    return {
      protocol: "agentport-plugin-wallet-host-restore",
      version: "0.1",
      walletId: input.walletId,
      sessionId: input.sessionId,
      hostRuntime: input.hostRuntime ?? "other",
      restoredAt,
      ticketCount: records.length,
      currentCount,
      lastKnownCount,
      missingCount,
      pendingActionCount: pendingActions.length,
      requiredReverify: lastKnownCount > 0 || pendingActionResolutions.some((result) => result.type === "reverify_required"),
      page,
      telemetry,
      tickets,
      pendingActions,
      pendingActionResolutions,
      boundary: {
        localWalletDurable: true,
        gatewayLifecycleAuthority: true,
        localStateSource: "local_last_known",
        currentStateSource: "agent_gateway",
        pendingActionsRequireFreshConsent: true,
        restoreDeliversPendingActions: false
      }
    };
  }

  async rehydrateTicket(input: RehydratePluginWalletTicketInput): Promise<RehydratePluginWalletTicketResult> {
    const loaded = await this.loadTicket(input.walletId, input.walletTicketId);
    if (!loaded) {
      return {
        type: "missing",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        reason: "wallet_ticket_not_found"
      };
    }

    let gatewayStatus: PluginWalletGatewayStatusResult;
    try {
      gatewayStatus = await input.gateway.getTicketStatus({
        commitment: loaded.payload.commitment,
        receipt: loaded.payload.receipt,
        holderRef: input.holderRef
      });
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "gateway_status_error";
      return {
        type: "last_known",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        commitmentId: loaded.payload.commitment.commitmentId,
        reason,
        summary: loaded.summary,
        modelSummary: modelSummaryFromSummary(loaded.summary, {
          statusSource: "local_last_known",
          verifiedCurrent: false,
          reverifyRequired: true,
          reason
        })
      };
    }

    if (gatewayStatus.type !== "status") {
      const reason = gatewayStatus.reason || "gateway_status_not_verified";
      return {
        type: "last_known",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        commitmentId: loaded.payload.commitment.commitmentId,
        reason,
        summary: loaded.summary,
        modelSummary: modelSummaryFromSummary(loaded.summary, {
          statusSource: "local_last_known",
          verifiedCurrent: false,
          reverifyRequired: true,
          reason
        })
      };
    }

    if (gatewayStatus.commitmentId !== loaded.payload.commitment.commitmentId) {
      const reason = "gateway_commitment_mismatch";
      return {
        type: "last_known",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        commitmentId: loaded.payload.commitment.commitmentId,
        reason,
        summary: loaded.summary,
        modelSummary: modelSummaryFromSummary(loaded.summary, {
          statusSource: "local_last_known",
          verifiedCurrent: false,
          reverifyRequired: true,
          reason
        })
      };
    }

    if (gatewayStatus.commitment?.commitmentId && gatewayStatus.commitment.commitmentId !== loaded.payload.commitment.commitmentId) {
      const reason = "gateway_commitment_mismatch";
      return {
        type: "last_known",
        walletId: input.walletId,
        walletTicketId: input.walletTicketId,
        commitmentId: loaded.payload.commitment.commitmentId,
        reason,
        summary: loaded.summary,
        modelSummary: modelSummaryFromSummary(loaded.summary, {
          statusSource: "local_last_known",
          verifiedCurrent: false,
          reverifyRequired: true,
          reason
        })
      };
    }

    const verifiedAt = this.now();
    const updatedCommitment = gatewayStatus.commitment ?? {
      ...loaded.payload.commitment,
      status: gatewayStatus.status
    };
    const summary = await this.saveTicket({
      walletId: input.walletId,
      commitment: updatedCommitment,
      receipt: gatewayStatus.receipt ?? loaded.payload.receipt,
      label: loaded.payload.label,
      lastVerifiedStatus: gatewayStatus.status,
      lastVerifiedAt: verifiedAt,
      pendingAction: loaded.payload.pendingAction,
      destinationRefs: loaded.payload.destinationRefs,
      deliveryAttempts: loaded.payload.deliveryAttempts
    });

    return {
      type: "current",
      walletId: input.walletId,
      walletTicketId: input.walletTicketId,
      commitmentId: gatewayStatus.commitmentId,
      status: gatewayStatus.status,
      proofLevel: gatewayStatus.proofLevel,
      summary,
      modelSummary: modelSummaryFromSummary(summary, {
        statusSource: "agent_gateway",
        verifiedCurrent: true,
        reverifyRequired: false,
        proofLevel: gatewayStatus.proofLevel
      })
    };
  }

  private async decryptRecord(record: EncryptedPluginWalletTicket): Promise<PluginWalletTicketPayload> {
    if (record.encryption.alg !== "A256GCM") {
      throw new Error("plugin_wallet_encryption_alg_unsupported");
    }

    const aad = walletAad(record.walletId, record.walletTicketId, record.commitmentId);
    const ciphers = [this.options.cipher, ...(this.options.previousCiphers ?? [])]
      .filter((cipher) => cipher.keyId === record.encryption.keyId);
    if (ciphers.length === 0) {
      throw new Error("plugin_wallet_key_mismatch");
    }

    let lastError: unknown;
    for (const cipher of ciphers) {
      try {
        const plaintext = await cipher.decrypt(record.encryption, aad);
        const payloadHash = sha256Hex(plaintext);
        if (!constantTimeEqual(payloadHash, record.payloadHash)) {
          throw new Error("plugin_wallet_payload_hash_mismatch");
        }

        const payload = JSON.parse(plaintext) as PluginWalletTicketPayload;
        assertNoForbiddenRawWalletFields(payload);
        return payload;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("plugin_wallet_decrypt_failed");
  }

  private now() {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

export class InMemoryPluginWalletStore implements PluginWalletStore {
  private readonly records = new Map<string, EncryptedPluginWalletTicket>();

  async list(walletId: string): Promise<EncryptedPluginWalletTicket[]> {
    return [...this.records.values()]
      .filter((record) => record.walletId === walletId)
      .map((record) => structuredClone(record));
  }

  async read(walletId: string, walletTicketId: string): Promise<EncryptedPluginWalletTicket | null> {
    const record = this.records.get(storeKey(walletId, walletTicketId));
    return record ? structuredClone(record) : null;
  }

  async write(record: EncryptedPluginWalletTicket): Promise<void> {
    this.records.set(storeKey(record.walletId, record.walletTicketId), structuredClone(record));
  }

  async delete(walletId: string, walletTicketId: string): Promise<void> {
    this.records.delete(storeKey(walletId, walletTicketId));
  }
}

export class FilePluginWalletStore implements PluginWalletStore {
  constructor(private readonly rootDir: string) {}

  async list(walletId: string): Promise<EncryptedPluginWalletTicket[]> {
    const dir = this.walletDir(walletId);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }

      throw error;
    }

    const records = await Promise.all(entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => JSON.parse(await readFile(join(dir, entry), "utf8")) as EncryptedPluginWalletTicket));
    return records.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async read(walletId: string, walletTicketId: string): Promise<EncryptedPluginWalletTicket | null> {
    try {
      return JSON.parse(await readFile(this.recordPath(walletId, walletTicketId), "utf8")) as EncryptedPluginWalletTicket;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async write(record: EncryptedPluginWalletTicket): Promise<void> {
    await mkdir(this.walletDir(record.walletId), { recursive: true });
    await writeFile(this.recordPath(record.walletId, record.walletTicketId), `${JSON.stringify(record, null, 2)}\n`);
  }

  async delete(walletId: string, walletTicketId: string): Promise<void> {
    await rm(this.recordPath(walletId, walletTicketId), { force: true });
  }

  private walletDir(walletId: string) {
    return join(this.rootDir, sha256Hex(walletId).slice(0, 24));
  }

  private recordPath(walletId: string, walletTicketId: string) {
    return join(this.walletDir(walletId), `${safeWalletTicketId(walletTicketId)}.json`);
  }
}

export class AesGcmPluginWalletCipher implements PluginWalletCipher {
  readonly key: Buffer;

  constructor(
    readonly keyId: string,
    key: Buffer | string,
    private readonly options: { nonce?: () => Buffer } = {}
  ) {
    this.key = Buffer.isBuffer(key) ? key : Buffer.from(key, "base64url");
    if (this.key.length !== 32) {
      throw new Error("plugin_wallet_key_must_be_32_bytes");
    }
  }

  async encrypt(plaintext: string, aad: string) {
    const nonce = this.options.nonce?.() ?? randomBytes(12);
    if (nonce.length !== 12) {
      throw new Error("plugin_wallet_nonce_must_be_12_bytes");
    }

    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      nonce: nonce.toString("base64url"),
      tag: tag.toString("base64url"),
      ciphertext: ciphertext.toString("base64url")
    };
  }

  async decrypt(envelope: { nonce: string; tag: string; ciphertext: string }, aad: string) {
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.nonce, "base64url"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }
}

export class WalletScopedPluginWalletCipher implements PluginWalletCipher {
  readonly rootKey: Buffer;
  readonly keyId: string;

  constructor(
    rootKeyId: string,
    rootKey: Buffer | string,
    private readonly options: { nonce?: () => Buffer } = {}
  ) {
    this.rootKey = Buffer.isBuffer(rootKey) ? rootKey : Buffer.from(rootKey, "base64url");
    if (this.rootKey.length !== 32) {
      throw new Error("plugin_wallet_root_key_must_be_32_bytes");
    }

    this.keyId = `${rootKeyId}:wallet-scoped`;
  }

  async encrypt(plaintext: string, aad: string) {
    return this.cipherForAad(aad).encrypt(plaintext, aad);
  }

  async decrypt(envelope: { nonce: string; tag: string; ciphertext: string }, aad: string) {
    return this.cipherForAad(aad).decrypt(envelope, aad);
  }

  private cipherForAad(aad: string) {
    const walletId = walletIdFromAad(aad);
    const walletKey = Buffer.from(hkdfSync(
      "sha256",
      this.rootKey,
      Buffer.from("agentport-plugin-wallet-v0.1"),
      Buffer.from(`wallet:${walletId}:root:${this.keyId}`),
      32
    ));

    return new AesGcmPluginWalletCipher(this.keyId, walletKey, this.options);
  }
}

export class InjectedPluginWalletKeyProvider implements PluginWalletKeyProvider {
  readonly kind = "platform_injected" as const;
  readonly keyId: string;

  constructor(private readonly material: PluginWalletKeyMaterial) {
    this.keyId = material.keyId;
  }

  async getKeyMaterial(): Promise<PluginWalletKeyMaterial> {
    return {
      keyId: this.material.keyId,
      key: Buffer.isBuffer(this.material.key) ? Buffer.from(this.material.key) : this.material.key
    };
  }
}

export class PassphrasePluginWalletKeyProvider implements PluginWalletKeyProvider {
  readonly kind = "passphrase" as const;
  readonly keyId: string;

  constructor(private readonly input: {
    passphrase: string;
    salt: string;
    keyId?: string;
  }) {
    this.keyId = input.keyId ?? `wallet-key-${sha256Hex(input.salt).slice(0, 12)}`;
  }

  async getKeyMaterial(): Promise<PluginWalletKeyMaterial> {
    return {
      keyId: this.keyId,
      key: scryptSync(this.input.passphrase, this.input.salt, 32)
    };
  }
}

export async function pluginWalletCipherFromKeyProvider(
  provider: PluginWalletKeyProvider,
  options: { nonce?: () => Buffer } = {}
) {
  const material = await provider.getKeyMaterial();
  return new AesGcmPluginWalletCipher(material.keyId, material.key, options);
}

export function createPluginWalletHostIntegrationPacket(): PluginWalletHostIntegrationPacket {
  return {
    protocol: "agentport-plugin-wallet-host-integration",
    version: "0.1",
    requiredHostState: [
      "walletId",
      "sessionId",
      "hostRuntime",
      "restoreCadence",
      "consentUiHooks",
      "recoveryWorker"
    ],
    restoreCadence: {
      required: "on_session_start",
      optional: ["periodic", "user_triggered"]
    },
    consentUiHooks: [
      "show_pending_action",
      "request_fresh_user_consent",
      "show_reverify_required",
      "show_expired_action_review"
    ],
    recoveryWorkerResponsibilities: [
      "unlock_wallet_key_provider",
      "run_session_restore",
      "surface_model_safe_summaries",
      "prepare_pending_action_after_consent",
      "never_store_raw_recovery_secret"
    ],
    hostOwned: [
      "wallet namespace",
      "session binding",
      "key unlock UX",
      "consent UI",
      "restore scheduling",
      "local export/import UX"
    ],
    agentPortOwned: [
      "gateway status verification",
      "commitment lifecycle authority",
      "backend outcome receipts"
    ],
    boundaries: {
      localWalletDurable: true,
      gatewayLifecycleAuthority: true,
      sessionIdGrantsAuthority: false,
      restoreDeliversPendingActions: false,
      currentStateRequiresGateway: true
    },
    mcpTools: [
      "verify_ticket",
      "get_ticket_status",
      "get_allowed_ticket_actions",
      "send_ticket"
    ]
  };
}

export function recommendPluginWalletRestoreSchedule(
  input: PluginWalletRestoreScheduleInput
): PluginWalletRestoreScheduleRecommendation {
  const recommendedPageLimit = recommendedRestorePageLimit(input.hostRuntime);
  const base = {
    protocol: "agentport-plugin-wallet-restore-schedule" as const,
    version: "0.1" as const,
    hostRuntime: input.hostRuntime,
    generatedAt: input.now,
    recommendedPageLimit
  };

  if (input.walletTicketCount === 0) {
    return {
      ...base,
      action: "defer",
      reason: "empty_wallet",
      backgroundPollingRecommended: false,
      requiresUserPresence: false
    };
  }

  if (input.network === "offline") {
    return {
      ...base,
      action: "defer",
      reason: "offline",
      nextReviewAfter: addMinutesIso(input.now, 15),
      backgroundPollingRecommended: false,
      requiresUserPresence: false
    };
  }

  if (input.trigger === "user_triggered") {
    return {
      ...base,
      action: "restore_now",
      reason: "user_requested",
      backgroundPollingRecommended: false,
      requiresUserPresence: true
    };
  }

  if ((input.pendingActionCount ?? 0) > 0) {
    return {
      ...base,
      action: "restore_now",
      reason: "pending_action_review",
      backgroundPollingRecommended: input.hostRuntime === "desktop",
      requiresUserPresence: true
    };
  }

  if ((input.staleTicketCount ?? 0) > 0) {
    return {
      ...base,
      action: "restore_now",
      reason: "stale_ticket_review",
      backgroundPollingRecommended: input.hostRuntime === "desktop",
      requiresUserPresence: false
    };
  }

  if (input.trigger === "session_start") {
    return {
      ...base,
      action: "restore_now",
      reason: "session_start",
      backgroundPollingRecommended: input.hostRuntime === "desktop",
      requiresUserPresence: false
    };
  }

  if (input.lowPowerMode && (input.trigger === "background" || input.trigger === "periodic")) {
    return {
      ...base,
      action: "defer",
      reason: "low_power_background",
      nextReviewAfter: addMinutesIso(input.now, 60),
      backgroundPollingRecommended: false,
      requiresUserPresence: false
    };
  }

  if (input.hostRuntime === "browser" && input.trigger === "background") {
    return {
      ...base,
      action: "user_triggered_only",
      reason: "browser_background_throttled",
      backgroundPollingRecommended: false,
      requiresUserPresence: true
    };
  }

  return {
    ...base,
    action: "defer",
    reason: "recently_restored",
    nextReviewAfter: addMinutesIso(input.now, input.hostRuntime === "desktop" ? 30 : 120),
    backgroundPollingRecommended: input.hostRuntime === "desktop",
    requiresUserPresence: false
  };
}

export function createPluginWalletPilotHostAdapterPacket(input: {
  adapterId: string;
  hostRuntime: PluginWalletHostRuntime;
  hooks?: Partial<PluginWalletPilotHostAdapterPacket["ownedHooks"]>;
  supportedTriggers?: PluginWalletRestoreScheduleInput["trigger"][];
}): PluginWalletPilotHostAdapterPacket {
  return {
    protocol: "agentport-plugin-wallet-host-adapter",
    version: "0.1",
    adapterId: input.adapterId,
    hostRuntime: input.hostRuntime,
    ownedHooks: {
      keyProvider: input.hooks?.keyProvider ?? `${input.adapterId}.keyProvider`,
      walletStore: input.hooks?.walletStore ?? `${input.adapterId}.walletStore`,
      gatewayClient: input.hooks?.gatewayClient ?? `${input.adapterId}.gatewayClient`,
      consentUi: input.hooks?.consentUi ?? `${input.adapterId}.consentUi`,
      restoreScheduler: input.hooks?.restoreScheduler ?? `${input.adapterId}.restoreScheduler`,
      telemetrySink: input.hooks?.telemetrySink ?? `${input.adapterId}.telemetrySink`,
      exportImportUi: input.hooks?.exportImportUi ?? `${input.adapterId}.exportImportUi`
    },
    restore: {
      defaultPageLimit: recommendedRestorePageLimit(input.hostRuntime),
      cadence: {
        required: "on_session_start",
        optional: ["periodic", "user_triggered"]
      },
      supportedTriggers: input.supportedTriggers ?? supportedRestoreTriggersForRuntime(input.hostRuntime)
    },
    consent: {
      pendingActionsRequireFreshConsent: true,
      replayPreparationOnly: true,
      deliveryOwnedByHostCommand: true
    },
    forbiddenHostState: pluginWalletForbiddenRawFields,
    boundaries: {
      keyCustodyHostOwned: true,
      sessionIdGrantsAuthority: false,
      restoreDeliversPendingActions: false,
      currentStateRequiresGateway: true,
      telemetryIsLifecycleTruth: false
    }
  };
}

export function createPluginWalletPilotEvidencePacket(input: {
  evidenceId: string;
  generatedAt: string;
  adapter: Pick<PluginWalletPilotHostAdapterPacket, "adapterId" | "hostRuntime">;
  restore: RestorePluginWalletHostSessionResult;
  schedule: PluginWalletRestoreScheduleRecommendation;
  failureModes: PluginWalletPilotEvidencePacket["failureModes"];
}): PluginWalletPilotEvidencePacket {
  return {
    protocol: "agentport-plugin-wallet-pilot-evidence",
    version: "0.1",
    evidenceId: input.evidenceId,
    generatedAt: input.generatedAt,
    adapter: {
      adapterId: input.adapter.adapterId,
      hostRuntime: input.adapter.hostRuntime
    },
    restorePage: input.restore.page,
    schedule: input.schedule,
    telemetry: input.restore.telemetry,
    failureModes: [...input.failureModes],
    payloadSafety: {
      excludesDecryptedLabels: true,
      excludesCommitments: true,
      excludesReceipts: true,
      excludesSignatures: true,
      excludesBackendConfirmations: true,
      excludesDestinationRefs: true,
      excludesRawKeyMaterial: true,
      excludesRecoverySecrets: true
    },
    boundaries: {
      localWalletDurable: true,
      gatewayLifecycleAuthority: true,
      evidenceIsLifecycleTruth: false,
      pendingActionsDelivered: false
    }
  };
}

export async function runPluginWalletHostAdapterSmoke(
  input: RunPluginWalletHostAdapterSmokeInput
): Promise<PluginWalletHostAdapterSmokeResult> {
  const calls = {
    keyProvider: 0,
    walletStore: 0,
    gatewayClient: 0,
    consentUi: 0,
    restoreScheduler: 0,
    telemetrySink: 0
  };
  const base = {
    protocol: "agentport-plugin-wallet-host-adapter-smoke" as const,
    version: "0.1" as const,
    smokeId: input.smokeId,
    generatedAt: input.now,
    mode: input.mode,
    adapter: {
      adapterId: input.adapter.adapterId,
      hostRuntime: input.adapter.hostRuntime
    },
    hooks: {
      declared: input.adapter.ownedHooks,
      calls
    },
    pendingActionResolutions: {
      ready: 0,
      reverifyRequired: 0,
      rejected: 0,
      expiredRejected: 0
    },
    deliveryAttempted: false as const,
    payloadSafety: pluginWalletPayloadSafety(),
    boundaries: pluginWalletSmokeBoundaries()
  };

  let cipher: PluginWalletCipher;
  try {
    calls.keyProvider += 1;
    cipher = await pluginWalletCipherFromKeyProvider(input.keyProvider);
  } catch {
    return {
      ...base,
      outcome: "failed_closed",
      reason: "locked_wallet"
    };
  }

  const store = countPluginWalletStoreCalls(input.store, calls);
  const wallet = new AgentPortPluginWallet({
    store,
    cipher,
    now: () => new Date(input.now)
  });

  let pendingActionConsent: Record<string, boolean> = {};
  try {
    const pendingActions = await wallet.listPendingActions({
      walletId: input.walletId,
      includeExpired: true
    });
    pendingActionConsent = Object.fromEntries(pendingActions.map((pendingAction) => {
      calls.consentUi += 1;
      const consent = input.consent?.grantPendingActionConsent;
      if (typeof consent === "boolean") {
        return [pendingAction.walletTicketId, consent];
      }
      return [pendingAction.walletTicketId, consent?.[pendingAction.walletTicketId] === true];
    }));
  } catch {
    return {
      ...base,
      outcome: "failed_closed",
      reason: "wallet_unlock_failed"
    };
  }

  const gateway: PluginWalletGatewayClient = {
    async getTicketStatus(statusInput) {
      calls.gatewayClient += 1;
      return input.gateway.getTicketStatus(statusInput);
    }
  };

  let restore: RestorePluginWalletHostSessionResult;
  try {
    restore = await wallet.restoreHostSession({
      walletId: input.walletId,
      sessionId: input.sessionId,
      hostRuntime: input.adapter.hostRuntime,
      gateway,
      holderRef: input.holderRef,
      page: input.page ?? {
        limit: input.adapter.restore.defaultPageLimit,
        sort: "updated_desc"
      },
      pendingActionConsent,
      includeExpiredPending: input.includeExpiredPending
    });
  } catch {
    return {
      ...base,
      outcome: "failed_closed",
      reason: "wallet_unlock_failed"
    };
  }

  calls.restoreScheduler += 1;
  const schedule = recommendPluginWalletRestoreSchedule({
    hostRuntime: input.adapter.hostRuntime,
    now: input.now,
    trigger: input.trigger,
    walletTicketCount: restore.page.totalTicketCount,
    pendingActionCount: restore.telemetry.pendingActionCount,
    staleTicketCount: restore.telemetry.lastKnownCount,
    network: input.network,
    lowPowerMode: input.lowPowerMode
  });

  if (input.telemetrySink) {
    calls.telemetrySink += 1;
    await input.telemetrySink(restore.telemetry);
  }

  const pendingActionResolutions = countPluginWalletHostPendingActionResolutions(restore);
  const classified = classifyPluginWalletHostAdapterSmoke(input.mode, restore, pendingActionResolutions);

  return {
    ...base,
    ...classified,
    restorePage: restore.page,
    schedule,
    telemetry: restore.telemetry,
    pendingActionResolutions
  };
}

export function createPluginWalletReturnedSessionReviewSurface(
  input: CreatePluginWalletReturnedSessionReviewSurfaceInput
): PluginWalletReturnedSessionReviewSurface {
  const reviewByTicketId = new Map((input.reviews ?? []).map((review) => [review.walletTicketId, review]));
  const resolutionByTicketId = new Map(input.restore.pendingActionResolutions.map((resolution) => [
    resolution.walletTicketId,
    resolution
  ]));
  const items = input.restore.tickets.map((ticket) => {
    const review = reviewByTicketId.get(ticket.walletTicketId);
    const resolution = resolutionByTicketId.get(ticket.walletTicketId);
    const pendingAction = review?.pendingAction
      ? {
          action: review.pendingAction.action,
          expired: review.pendingAction.expired,
          userReviewRequired: review.pendingAction.userReviewRequired
        }
      : ticket.pendingAction
        ? {
            action: ticket.pendingAction.action,
            expired: false,
            userReviewRequired: false
          }
        : undefined;
    const attentionReasons = new Set<PluginWalletAttentionReason>(review?.attentionReasons ?? []);
    if (ticket.reverifyRequired) {
      attentionReasons.add("reverify_required");
    }

    return {
      walletTicketId: ticket.walletTicketId,
      businessId: review?.businessId,
      serviceId: review?.serviceId,
      status: ticket.status,
      statusSource: ticket.statusSource,
      verifiedCurrent: ticket.verifiedCurrent,
      reverifyRequired: ticket.reverifyRequired,
      pendingAction,
      attentionReasons: [...attentionReasons],
      deliveryAttemptCount: ticket.deliveryAttemptCount,
      lastVerifiedAt: ticket.lastVerifiedAt,
      updatedAt: ticket.updatedAt,
      reason: ticket.reason ?? (resolution?.type === "reverify_required" ? resolution.reason : undefined)
    } satisfies PluginWalletReturnedSessionReviewItem;
  });
  const pendingConsentIds = new Set(input.restore.pendingActionResolutions
    .filter((resolution) => resolution.type === "rejected" && resolution.reason === "consent_required")
    .map((resolution) => resolution.walletTicketId));
  const current = items.filter((item) => item.verifiedCurrent);
  const lastKnown = items.filter((item) => item.statusSource === "local_last_known");
  const needsAttention = items.filter((item) => item.attentionReasons.length > 0);
  const expiredReview = items.filter((item) => item.pendingAction?.expired || item.attentionReasons.includes("pending_action_expired"));
  const pendingConsent = items.filter((item) => pendingConsentIds.has(item.walletTicketId) && !expiredReview.some((expired) => expired.walletTicketId === item.walletTicketId));
  const reverifyRequired = items.filter((item) => item.reverifyRequired || item.attentionReasons.includes("reverify_required"));

  return {
    protocol: "agentport-plugin-wallet-returned-session-review",
    version: "0.1",
    reviewId: input.reviewId,
    generatedAt: input.generatedAt,
    walletId: input.restore.walletId,
    sessionId: input.restore.sessionId,
    counts: {
      totalReturned: items.length,
      current: current.length,
      lastKnown: lastKnown.length,
      needsAttention: needsAttention.length,
      pendingConsent: pendingConsent.length,
      expiredReview: expiredReview.length,
      reverifyRequired: reverifyRequired.length
    },
    sections: {
      current,
      lastKnown,
      needsAttention,
      pendingConsent,
      expiredReview,
      reverifyRequired
    },
    payloadSafety: pluginWalletPayloadSafety(),
    boundaries: {
      gatewayCurrentOnly: true,
      localLastKnownRequiresReverify: true,
      reviewDeliversPendingActions: false,
      reviewIsLifecycleTruth: false
    }
  };
}

export function createPluginWalletVirtualStoreReferenceHarnessResult(
  input: CreatePluginWalletVirtualStoreReferenceHarnessInput
): PluginWalletVirtualStoreReferenceHarnessResult {
  const requiredScenarios: PluginWalletVirtualStoreReferenceScenario[] = [
    "success_restore",
    "gateway_unavailable",
    "pending_consent",
    "expired_pending_action",
    "locked_wallet",
    "user_triggered_retry"
  ];
  const seen = new Set(input.scenarios.map((scenario) => scenario.scenario));
  const missing = requiredScenarios.filter((scenario) => !seen.has(scenario));
  if (missing.length > 0) {
    throw new Error(`plugin_wallet_virtual_store_reference_missing_scenarios:${missing.join(",")}`);
  }

  return {
    protocol: "agentport-plugin-wallet-virtual-store-reference-harness",
    version: "0.1",
    harnessId: input.harnessId,
    generatedAt: input.generatedAt,
    store: {
      businessId: "agentport-virtual-store",
      serviceId: "product_demo",
      backendSource: "fixture",
      virtualStoreCanonicalReference: true,
      realMarketProof: false
    },
    scenarioCount: input.scenarios.length,
    scenarios: input.scenarios.map((scenario) => ({
      scenario: scenario.scenario,
      outcome: scenario.outcome,
      gatewayStatusSource: scenario.gatewayStatusSource,
      reviewSection: scenario.reviewSection,
      gatewayReverifyRequired: scenario.gatewayReverifyRequired,
      walletMutation: scenario.walletMutation,
      consentRule: scenario.consentRule,
      deliveryAttempted: false
    })),
    requiredScenarios,
    payloadSafety: pluginWalletPayloadSafety(),
    boundaries: {
      virtualStoreTreatedAsReferenceBusiness: true,
      gatewayLifecycleAuthority: true,
      currentRequiresGatewayReverify: true,
      localLastKnownRequiresReverify: true,
      referenceHarnessDeliversActions: false,
      referenceHarnessOwnsFullVirtualStoreEnvironment: false,
      paymentWallet: false,
      credentialVault: false
    }
  };
}

export function createPluginWalletGoldenTraceMatrix(
  input: CreatePluginWalletGoldenTraceMatrixInput
): PluginWalletGoldenTraceMatrix {
  const requiredScenarios: PluginWalletGoldenTraceScenario[] = [
    "success_restore",
    "gateway_unavailable",
    "stale_last_known",
    "pending_consent",
    "expired_pending_action",
    "locked_wallet",
    "user_triggered_retry",
    "duplicate_commitment",
    "export_import",
    "wrong_key_restore"
  ];
  const seen = new Set(input.traces.map((trace) => trace.scenario));
  const missing = requiredScenarios.filter((scenario) => !seen.has(scenario));
  if (missing.length > 0) {
    throw new Error(`plugin_wallet_golden_trace_missing_scenarios:${missing.join(",")}`);
  }
  for (const trace of input.traces) {
    if (trace.reviewSection === "current" && trace.gatewayResult !== "verified_current") {
      throw new Error(`plugin_wallet_golden_trace_current_requires_gateway:${trace.scenario}`);
    }
    if (trace.modelVisibility === "current" && trace.gatewayResult !== "verified_current") {
      throw new Error(`plugin_wallet_golden_trace_current_visibility_requires_gateway:${trace.scenario}`);
    }
    if (trace.gatewayResult !== "verified_current" && trace.reviewSection === "current") {
      throw new Error(`plugin_wallet_golden_trace_unverified_current:${trace.scenario}`);
    }
    if (trace.scenario === "user_triggered_retry" && trace.consentRule !== "fresh_consent_required") {
      throw new Error("plugin_wallet_golden_trace_retry_requires_fresh_consent");
    }
    if ((trace.scenario === "locked_wallet" || trace.scenario === "wrong_key_restore") && trace.gatewayResult !== "not_called") {
      throw new Error(`plugin_wallet_golden_trace_locked_state_must_not_call_gateway:${trace.scenario}`);
    }
    if (trace.deliveryAttempted !== false) {
      throw new Error(`plugin_wallet_golden_trace_delivery_forbidden:${trace.scenario}`);
    }
  }

  return {
    protocol: "agentport-plugin-wallet-golden-trace-matrix",
    version: "0.1",
    matrixId: input.matrixId,
    generatedAt: input.generatedAt,
    sourceHarness: {
      protocol: "agentport-plugin-wallet-virtual-store-reference-harness",
      fixture: "examples/plugin-wallet-virtual-store-reference-harness.v0.1.json",
      canonicalBusinessId: "agentport-virtual-store",
      canonicalServiceId: "product_demo"
    },
    requiredScenarios,
    traceCount: input.traces.length,
    traces: input.traces.map((trace) => ({
      scenario: trace.scenario,
      trigger: trace.trigger,
      gatewayResult: trace.gatewayResult,
      walletMutation: trace.walletMutation,
      mutationAllowed: trace.mutationAllowed,
      mutationReason: trace.mutationReason,
      reviewSection: trace.reviewSection,
      modelVisibility: trace.modelVisibility,
      consentRule: trace.consentRule,
      payloadSafety: pluginWalletPayloadSafety(),
      deliveryAttempted: false
    })),
    payloadSafety: pluginWalletPayloadSafety(),
    boundaries: {
      matrixIsLifecycleTruth: false,
      gatewayCurrentOnly: true,
      localLastKnownRequiresReverify: true,
      retryRequiresFreshConsent: true,
      lockedWalletCallsGateway: false,
      wrongKeyRestoreCallsGateway: false,
      matrixDeliversActions: false,
      paymentWallet: false,
      credentialVault: false
    }
  };
}

export function createPluginWalletHostAdoptionKit(
  input: CreatePluginWalletHostAdoptionKitInput
): PluginWalletHostAdoptionKit {
  const requiredComponents: PluginWalletHostAdoptionKitComponentId[] = [
    "gateway_wallet_contract",
    "host_integration_packet",
    "host_adapter_packets",
    "host_adapter_smoke_harness",
    "pilot_host_runbook",
    "returned_session_review_surface",
    "virtual_store_reference_harness",
    "golden_trace_matrix",
    "conformance_evidence"
  ];
  const requiredChecks: PluginWalletHostAdoptionKitCheckId[] = [
    "restore_success",
    "locked_wallet_fails_closed",
    "gateway_unavailable_last_known",
    "expired_pending_action_review",
    "user_triggered_retry_fresh_consent",
    "golden_trace_comparison",
    "returned_review_payload_safe",
    "conformance_evidence_present"
  ];
  const componentIds = new Set(input.components.map((component) => component.componentId));
  const missingComponents = requiredComponents.filter((component) => !componentIds.has(component));
  if (missingComponents.length > 0) {
    throw new Error(`plugin_wallet_host_adoption_missing_components:${missingComponents.join(",")}`);
  }
  const checkIds = new Set(input.mustPassChecks.map((check) => check.checkId));
  const missingChecks = requiredChecks.filter((check) => !checkIds.has(check));
  if (missingChecks.length > 0) {
    throw new Error(`plugin_wallet_host_adoption_missing_checks:${missingChecks.join(",")}`);
  }
  for (const component of input.components) {
    if (component.required !== true) {
      throw new Error(`plugin_wallet_host_adoption_component_must_be_required:${component.componentId}`);
    }
    if (component.componentId === "golden_trace_matrix" && !component.artifact.endsWith("plugin-wallet-golden-trace-matrix.v0.1.json")) {
      throw new Error("plugin_wallet_host_adoption_missing_golden_trace_matrix");
    }
    if (component.componentId === "virtual_store_reference_harness" && !component.artifact.endsWith("plugin-wallet-virtual-store-reference-harness.v0.1.json")) {
      throw new Error("plugin_wallet_host_adoption_missing_virtual_store_reference_harness");
    }
  }
  for (const check of input.mustPassChecks) {
    if (check.blocksSupportClaim !== true) {
      throw new Error(`plugin_wallet_host_adoption_check_must_block_claim:${check.checkId}`);
    }
    if (check.checkId === "user_triggered_retry_fresh_consent" && !check.expectation.includes("fresh consent")) {
      throw new Error("plugin_wallet_host_adoption_retry_check_must_require_fresh_consent");
    }
    if (check.checkId === "gateway_unavailable_last_known" && !check.expectation.includes("last-known")) {
      throw new Error("plugin_wallet_host_adoption_gateway_failure_must_be_last_known");
    }
  }

  return {
    protocol: "agentport-plugin-wallet-host-adoption-kit",
    version: "0.1",
    kitId: input.kitId,
    generatedAt: input.generatedAt,
    components: input.components.map((component) => ({
      componentId: component.componentId,
      artifact: component.artifact,
      ...(component.helper ? { helper: component.helper } : {}),
      owner: component.owner,
      purpose: component.purpose,
      required: true
    })),
    mustPassChecks: input.mustPassChecks.map((check) => ({
      checkId: check.checkId,
      evidenceRef: check.evidenceRef,
      expectation: check.expectation,
      blocksSupportClaim: true
    })),
    hostOwnedResponsibilities: [
      "key_unlock",
      "local_wallet_store",
      "consent_ui",
      "restore_worker",
      "telemetry_sink",
      "export_import_ux"
    ],
    agentPortOwnedBoundaries: [
      "gateway_current_truth",
      "wallet_contract",
      "reference_harness",
      "golden_trace_matrix",
      "payload_safety_rules",
      "conformance_evidence"
    ],
    payloadSafety: pluginWalletPayloadSafety(),
    runtimeRequirements: {
      liveCredentialsRequired: false,
      networkRequired: false,
      wallClockSleepsRequired: false,
      platformApisRequired: false,
      fullVirtualStoreEnvironmentRequired: false,
      realBusinessRequired: false
    },
    boundaries: {
      kitIsLifecycleTruth: false,
      gatewayCurrentOnly: true,
      retryRequiresFreshConsent: true,
      hostOwnsKeyCustody: true,
      agentPortOwnsGatewayTruth: true,
      adoptionKitDeliversActions: false,
      adoptionKitIsHostSdk: false,
      paymentWallet: false,
      credentialVault: false
    }
  };
}

export function createPluginWalletRealBusinessHandoffBoundary(
  input: CreatePluginWalletRealBusinessHandoffBoundaryInput
): PluginWalletRealBusinessHandoffBoundary {
  const requiredEvidenceIds: PluginWalletRealBusinessHandoffEvidenceId[] = [
    "owner_approved_business_profile",
    "ownership_verification",
    "real_backend_outcome",
    "gateway_receipt",
    "returned_session_restore",
    "gateway_reverify",
    "returned_session_review",
    "redaction_manifest"
  ];
  const requiredRedactionRuleIds: PluginWalletRealBusinessHandoffRedactionRuleId[] = [
    "no_customer_pii",
    "no_owner_contact_details",
    "no_decrypted_wallet_labels",
    "no_commitment_bodies",
    "no_receipt_bodies",
    "no_signatures",
    "no_backend_confirmation_ids",
    "no_destination_refs",
    "no_credentials_or_tokens",
    "no_real_business_private_fixture_data"
  ];
  const evidenceIds = new Set(input.requiredEvidence.map((evidence) => evidence.evidenceId));
  const missingEvidence = requiredEvidenceIds.filter((evidence) => !evidenceIds.has(evidence));
  if (missingEvidence.length > 0) {
    throw new Error(`plugin_wallet_real_business_handoff_missing_evidence:${missingEvidence.join(",")}`);
  }
  const redactionRuleIds = new Set(input.redactionRules.map((rule) => rule.ruleId));
  const missingRules = requiredRedactionRuleIds.filter((rule) => !redactionRuleIds.has(rule));
  if (missingRules.length > 0) {
    throw new Error(`plugin_wallet_real_business_handoff_missing_redaction_rules:${missingRules.join(",")}`);
  }
  for (const evidence of input.requiredEvidence) {
    if (evidence.required !== true || evidence.blocksRealPilotClaim !== true) {
      throw new Error(`plugin_wallet_real_business_handoff_evidence_must_block_claim:${evidence.evidenceId}`);
    }
    if (evidence.evidenceId === "real_backend_outcome" && evidence.proofRefPolicy !== "external_ref_only") {
      throw new Error("plugin_wallet_real_business_handoff_backend_outcome_requires_external_ref");
    }
    if (evidence.evidenceId === "gateway_receipt" && evidence.sourceOwner !== "agentport_gateway") {
      throw new Error("plugin_wallet_real_business_handoff_gateway_receipt_source");
    }
  }
  for (const rule of input.redactionRules) {
    if (rule.required !== true) {
      throw new Error(`plugin_wallet_real_business_handoff_redaction_rule_required:${rule.ruleId}`);
    }
    if (rule.ruleId === "no_real_business_private_fixture_data" && rule.appliesTo !== "deterministic_fixture") {
      throw new Error("plugin_wallet_real_business_handoff_fixture_redaction_scope");
    }
  }

  return {
    protocol: "agentport-plugin-wallet-real-business-handoff",
    version: "0.1",
    boundaryId: input.boundaryId,
    generatedAt: input.generatedAt,
    sourceKit: {
      protocol: "agentport-plugin-wallet-host-adoption-kit",
      fixture: "examples/plugin-wallet-host-adoption-kit.v0.1.json"
    },
    requiredEvidenceIds,
    requiredEvidence: input.requiredEvidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      sourceOwner: evidence.sourceOwner,
      requirement: evidence.requirement,
      proofRefPolicy: evidence.proofRefPolicy,
      required: true,
      blocksRealPilotClaim: true
    })),
    requiredRedactionRuleIds,
    redactionRules: input.redactionRules.map((rule) => ({
      ruleId: rule.ruleId,
      appliesTo: rule.appliesTo,
      requirement: rule.requirement,
      replacement: rule.replacement,
      required: true
    })),
    deterministicFixturePolicy: {
      realBusinessEvidenceAllowedInCiFixtures: false,
      privateBusinessDataAllowedInCiFixtures: false,
      realBackendConfirmationAllowedInCiFixtures: false,
      realCustomerDataAllowedInCiFixtures: false,
      fixtureMayContainRequirementRefs: true
    },
    payloadSafety: pluginWalletPayloadSafety(),
    boundaries: {
      handoffBoundaryIsRealPilotEvidence: false,
      realPilotRequiresOwnerApproval: true,
      realPilotRequiresOwnershipVerification: true,
      realPilotRequiresBackendOutcome: true,
      realPilotRequiresGatewayReceipt: true,
      realPilotRequiresReturnedSessionReview: true,
      deterministicFixturesAreRealMarketProof: false,
      supportingBranchOwnsRealBusinessOperations: false,
      paymentWallet: false,
      bookingLedger: false,
      credentialVault: false,
      systemOfRecord: false
    }
  };
}

export function pluginWalletKeyFromPassphrase(input: {
  passphrase: string;
  salt: string;
  keyId?: string;
  nonce?: () => Buffer;
}) {
  const key = scryptSync(input.passphrase, input.salt, 32);
  return new AesGcmPluginWalletCipher(input.keyId ?? `wallet-key-${sha256Hex(input.salt).slice(0, 12)}`, key, {
    nonce: input.nonce
  });
}

export function pluginWalletScopedKeyFromPassphrase(input: {
  passphrase: string;
  salt: string;
  keyId?: string;
  nonce?: () => Buffer;
}) {
  const rootKey = scryptSync(input.passphrase, input.salt, 32);
  return new WalletScopedPluginWalletCipher(input.keyId ?? `wallet-root-${sha256Hex(input.salt).slice(0, 12)}`, rootKey, {
    nonce: input.nonce
  });
}

export function walletTicketIdFor(walletId: string, commitmentId: string) {
  return `wallet_ticket_${sha256Hex(stableJson({ walletId, commitmentId })).slice(0, 24)}`;
}

function pluginWalletPayloadSafety(): PluginWalletPilotEvidencePacket["payloadSafety"] {
  return {
    excludesDecryptedLabels: true,
    excludesCommitments: true,
    excludesReceipts: true,
    excludesSignatures: true,
    excludesBackendConfirmations: true,
    excludesDestinationRefs: true,
    excludesRawKeyMaterial: true,
    excludesRecoverySecrets: true
  };
}

function pluginWalletSmokeBoundaries(): PluginWalletHostAdapterSmokeResult["boundaries"] {
  return {
    keyCustodyHostOwned: true,
    gatewayLifecycleAuthority: true,
    smokeUsesPlatformApis: false,
    smokeDeliversPendingActions: false,
    telemetryIsLifecycleTruth: false
  };
}

function countPluginWalletHostPendingActionResolutions(
  restore: RestorePluginWalletHostSessionResult
): PluginWalletHostAdapterSmokeResult["pendingActionResolutions"] {
  return {
    ready: restore.pendingActionResolutions.filter((resolution) => resolution.type === "ready").length,
    reverifyRequired: restore.pendingActionResolutions.filter((resolution) => resolution.type === "reverify_required").length,
    rejected: restore.pendingActionResolutions.filter((resolution) => resolution.type === "rejected").length,
    expiredRejected: restore.pendingActionResolutions.filter((resolution) => (
      resolution.type === "rejected" && resolution.reason === "pending_action_expired"
    )).length
  };
}

function classifyPluginWalletHostAdapterSmoke(
  mode: PluginWalletHostAdapterSmokeMode,
  restore: RestorePluginWalletHostSessionResult,
  pendingActionResolutions: PluginWalletHostAdapterSmokeResult["pendingActionResolutions"]
): Pick<PluginWalletHostAdapterSmokeResult, "outcome" | "reason"> {
  if (pendingActionResolutions.expiredRejected > 0) {
    return {
      outcome: "needs_review",
      reason: "expired_pending_action_review"
    };
  }

  if (mode === "user_triggered_retry" && pendingActionResolutions.ready > 0) {
    return {
      outcome: "passed",
      reason: "user_triggered_retry_consent_gated"
    };
  }

  if (restore.requiredReverify || restore.lastKnownCount > 0 || pendingActionResolutions.reverifyRequired > 0) {
    return {
      outcome: "reverify_required",
      reason: "gateway_reverify_required"
    };
  }

  return {
    outcome: "passed",
    reason: "restore_succeeded"
  };
}

function countPluginWalletStoreCalls(
  store: PluginWalletStore,
  calls: PluginWalletHostAdapterSmokeResult["hooks"]["calls"]
): PluginWalletStore {
  return {
    async list(walletId) {
      calls.walletStore += 1;
      return store.list(walletId);
    },
    async read(walletId, walletTicketId) {
      calls.walletStore += 1;
      return store.read(walletId, walletTicketId);
    },
    async write(record) {
      calls.walletStore += 1;
      await store.write(record);
    },
    async delete(walletId, walletTicketId) {
      calls.walletStore += 1;
      await store.delete(walletId, walletTicketId);
    }
  };
}

function deliveryAttemptIdFor(
  walletId: string,
  walletTicketId: string,
  commitmentId: string,
  attemptedAt: string,
  index: number
) {
  return `wallet_delivery_${sha256Hex(stableJson({
    walletId,
    walletTicketId,
    commitmentId,
    attemptedAt,
    index
  })).slice(0, 24)}`;
}

function summaryFromPayload(
  record: EncryptedPluginWalletTicket,
  payload: PluginWalletTicketPayload
): PluginWalletTicketSummary {
  return {
    protocol: "agentport-plugin-wallet-ticket-summary",
    version: "0.1",
    walletId: record.walletId,
    walletTicketId: record.walletTicketId,
    commitmentId: record.commitmentId,
    label: payload.label,
    lastVerifiedStatus: payload.lastVerifiedStatus,
    lastVerifiedAt: payload.lastVerifiedAt,
    pendingAction: payload.pendingAction,
    deliveryAttemptCount: payload.deliveryAttempts?.length ?? 0,
    lastDeliveryAttempt: payload.deliveryAttempts?.length
      ? deliveryAttemptSummaryFromRecord(record, payload.deliveryAttempts[payload.deliveryAttempts.length - 1])
      : undefined,
    updatedAt: record.updatedAt
  };
}

function deliveryAttemptSummaryFromRecord(
  summary: Pick<PluginWalletTicketSummary, "walletId" | "walletTicketId" | "commitmentId"> | EncryptedPluginWalletTicket,
  attempt: PluginWalletDeliveryAttemptRecord
): PluginWalletDeliveryAttemptSummary {
  return {
    protocol: "agentport-plugin-wallet-delivery-attempt-summary",
    version: "0.1",
    walletId: summary.walletId,
    walletTicketId: summary.walletTicketId,
    commitmentId: summary.commitmentId,
    deliveryAttemptId: attempt.deliveryAttemptId,
    action: attempt.action,
    outcome: attempt.outcome,
    attemptedAt: attempt.attemptedAt,
    destinationKind: attempt.destinationKind,
    destinationRef: attempt.destinationRef,
    deliveryId: attempt.deliveryId,
    deliveredAt: attempt.deliveredAt,
    proofLevel: attempt.proofLevel,
    reason: attempt.reason,
    backendMutation: false
  };
}

function hostPendingActionResolutionFromReplay(
  sessionId: string,
  pendingAction: PluginWalletPendingActionSummary,
  replay: PreparePluginWalletPendingActionReplayResult
): PluginWalletHostPendingActionResolution {
  if (replay.type === "ready") {
    return {
      type: "ready",
      walletId: replay.walletId,
      sessionId,
      walletTicketId: replay.walletTicketId,
      commitmentId: replay.commitmentId,
      action: pendingAction.action,
      pendingAction,
      modelSummary: replay.modelSummary
    };
  }

  if (replay.type === "reverify_required") {
    return {
      type: "reverify_required",
      walletId: replay.walletId,
      sessionId,
      walletTicketId: replay.walletTicketId,
      commitmentId: replay.commitmentId,
      action: pendingAction.action,
      reason: replay.reason,
      pendingAction,
      modelSummary: replay.modelSummary
    };
  }

  if (replay.type === "missing") {
    return {
      type: "rejected",
      walletId: replay.walletId,
      sessionId,
      walletTicketId: replay.walletTicketId,
      action: pendingAction.action,
      reason: replay.reason
    };
  }

  return {
    type: "rejected",
    walletId: replay.walletId,
    sessionId,
    walletTicketId: replay.walletTicketId,
    action: pendingAction.action,
    reason: replay.reason,
    pendingAction: replay.pendingAction ?? pendingAction
  };
}

function hostRestoreTelemetryFromCounts(input: {
  walletId: string;
  sessionId: string;
  generatedAt: string;
  totalTicketCount: number;
  returnedTicketCount: number;
  currentCount: number;
  lastKnownCount: number;
  missingCount: number;
  pendingActions: PluginWalletPendingActionSummary[];
  pendingActionResolutions: PluginWalletHostPendingActionResolution[];
}): PluginWalletHostRestoreTelemetry {
  return {
    protocol: "agentport-plugin-wallet-host-restore-telemetry",
    version: "0.1",
    walletId: input.walletId,
    sessionId: input.sessionId,
    generatedAt: input.generatedAt,
    totalTicketCount: input.totalTicketCount,
    returnedTicketCount: input.returnedTicketCount,
    currentCount: input.currentCount,
    lastKnownCount: input.lastKnownCount,
    missingCount: input.missingCount,
    pendingActionCount: input.pendingActions.length,
    pendingReadyCount: input.pendingActionResolutions.filter((resolution) => resolution.type === "ready").length,
    pendingReverifyRequiredCount: input.pendingActionResolutions.filter((resolution) => resolution.type === "reverify_required").length,
    pendingRejectedCount: input.pendingActionResolutions.filter((resolution) => resolution.type === "rejected").length,
    expiredPendingCount: input.pendingActions.filter((pendingAction) => pendingAction.expired).length,
    consentRequiredCount: input.pendingActionResolutions.filter((resolution) => resolution.type === "rejected" && resolution.reason === "consent_required").length,
    failedRestoreCount: input.lastKnownCount + input.missingCount,
    payloadFieldsIncluded: []
  };
}

function reviewSummaryFromPayload(
  record: EncryptedPluginWalletTicket,
  payload: PluginWalletTicketPayload,
  checkedAt: string,
  staleAfter?: string
): PluginWalletTicketReviewSummary {
  const ticketSummary = summaryFromPayload(record, payload);
  const pendingAction = ticketSummary.pendingAction
    ? pendingActionSummaryFromSummary(ticketSummary, checkedAt)
    : undefined;
  const attentionReasons = attentionReasonsFor(ticketSummary, pendingAction, staleAfter);

  return {
    protocol: "agentport-plugin-wallet-ticket-review-summary",
    version: "0.1",
    walletId: record.walletId,
    walletTicketId: record.walletTicketId,
    commitmentId: record.commitmentId,
    label: payload.label,
    businessId: payload.commitment.business?.businessId,
    serviceId: payload.commitment.business?.serviceId,
    bindingId: payload.commitment.business?.bindingId,
    status: payload.lastVerifiedStatus,
    lastVerifiedAt: payload.lastVerifiedAt,
    pendingAction,
    deliveryAttemptCount: ticketSummary.deliveryAttemptCount,
    lastDeliveryAttempt: ticketSummary.lastDeliveryAttempt,
    needsAttention: attentionReasons.length > 0,
    attentionReasons,
    updatedAt: record.updatedAt
  };
}

function attentionReasonsFor(
  summary: PluginWalletTicketSummary,
  pendingAction: PluginWalletPendingActionSummary | undefined,
  staleAfter?: string
): PluginWalletAttentionReason[] {
  const reasons = new Set<PluginWalletAttentionReason>();
  if (pendingAction?.expired) {
    reasons.add("pending_action_expired");
  } else if (pendingAction) {
    reasons.add("pending_action");
  }

  if (summary.lastVerifiedStatus === "unknown" || !summary.lastVerifiedStatus) {
    reasons.add("status_unknown");
  }

  if (staleAfter && isBefore(summary.lastVerifiedAt, staleAfter)) {
    reasons.add("verification_stale");
  }

  if (summary.lastDeliveryAttempt?.outcome === "failed") {
    reasons.add("delivery_failed");
  }
  if (summary.lastDeliveryAttempt?.outcome === "handoff") {
    reasons.add("delivery_handoff");
  }
  if (summary.lastDeliveryAttempt?.outcome === "rejected") {
    reasons.add("delivery_rejected");
  }

  if (summary.lastDeliveryAttempt?.reason === "gateway_unavailable" || summary.lastDeliveryAttempt?.reason === "gateway_commitment_mismatch") {
    reasons.add("reverify_required");
  }

  return [...reasons];
}

function matchesReviewSearch(
  input: SearchPluginWalletTicketsInput,
  payload: PluginWalletTicketPayload,
  review: PluginWalletTicketReviewSummary
) {
  const statuses = Array.isArray(input.status) ? input.status : input.status ? [input.status] : undefined;
  if (statuses && !statuses.includes(review.status ?? "unknown")) {
    return false;
  }

  if (input.businessId && review.businessId !== input.businessId) {
    return false;
  }

  if (input.serviceId && review.serviceId !== input.serviceId) {
    return false;
  }

  if (input.hasPendingAction !== undefined && Boolean(review.pendingAction) !== input.hasPendingAction) {
    return false;
  }

  if (input.pendingAction && review.pendingAction?.action !== input.pendingAction) {
    return false;
  }

  if (input.destinationKind && !(payload.deliveryAttempts ?? []).some((attempt) => attempt.destinationKind === input.destinationKind)) {
    return false;
  }

  if (input.needsAttention !== undefined && review.needsAttention !== input.needsAttention) {
    return false;
  }

  if (input.updatedAfter && isBeforeOrEqual(review.updatedAt, input.updatedAfter)) {
    return false;
  }

  if (input.updatedBefore && isAfterOrEqual(review.updatedAt, input.updatedBefore)) {
    return false;
  }

  if (input.includeExpiredPending === false && review.pendingAction?.expired) {
    return false;
  }

  return true;
}

function sortReviewSummaries(
  left: PluginWalletTicketReviewSummary,
  right: PluginWalletTicketReviewSummary,
  sort: NonNullable<SearchPluginWalletTicketsInput["sort"]>
) {
  const updated = left.updatedAt.localeCompare(right.updatedAt);
  if (updated !== 0) {
    return sort === "updated_asc" ? updated : -updated;
  }

  return left.walletTicketId.localeCompare(right.walletTicketId);
}

function sortWalletRecords(
  left: EncryptedPluginWalletTicket,
  right: EncryptedPluginWalletTicket,
  sort: "updated_asc" | "updated_desc"
) {
  const updated = left.updatedAt.localeCompare(right.updatedAt);
  if (updated !== 0) {
    return sort === "updated_asc" ? updated : -updated;
  }

  return left.walletTicketId.localeCompare(right.walletTicketId);
}

function normalizeRestorePageLimit(limit: number | undefined) {
  if (limit === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("plugin_wallet_restore_page_limit_invalid");
  }

  return limit;
}

function encodeRestorePageCursor(offset: number) {
  return Buffer.from(stableJson({
    type: "agentport_plugin_wallet_restore_cursor",
    offset
  })).toString("base64url");
}

function decodeRestorePageCursor(cursor: string | undefined) {
  if (!cursor) {
    return 0;
  }

  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      type?: string;
      offset?: number;
    };
    if (value.type !== "agentport_plugin_wallet_restore_cursor" || !Number.isInteger(value.offset) || value.offset < 0) {
      throw new Error("invalid_cursor");
    }
    return value.offset;
  } catch {
    throw new Error("plugin_wallet_restore_cursor_invalid");
  }
}

function recommendedRestorePageLimit(hostRuntime: PluginWalletHostRuntime) {
  if (hostRuntime === "mobile" || hostRuntime === "browser") {
    return 10;
  }
  if (hostRuntime === "desktop") {
    return 25;
  }
  return 20;
}

function supportedRestoreTriggersForRuntime(
  hostRuntime: PluginWalletHostRuntime
): PluginWalletRestoreScheduleInput["trigger"][] {
  if (hostRuntime === "browser") {
    return ["session_start", "user_triggered"];
  }
  if (hostRuntime === "mobile") {
    return ["session_start", "user_triggered", "background"];
  }
  return ["session_start", "user_triggered", "periodic", "background"];
}

function addMinutesIso(value: string, minutes: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("plugin_wallet_schedule_now_invalid");
  }
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function pendingActionSummaryFromSummary(
  summary: PluginWalletTicketSummary,
  checkedAt: string
): PluginWalletPendingActionSummary {
  if (!summary.pendingAction) {
    throw new Error("plugin_wallet_pending_action_missing");
  }

  const expired = isExpired(summary.pendingAction.expiresAt, checkedAt);
  return {
    protocol: "agentport-plugin-wallet-pending-action-summary",
    version: "0.1",
    walletId: summary.walletId,
    walletTicketId: summary.walletTicketId,
    commitmentId: summary.commitmentId,
    label: summary.label,
    action: summary.pendingAction.action,
    destinationRef: summary.pendingAction.destinationRef,
    requestedAt: summary.pendingAction.requestedAt,
    expiresAt: summary.pendingAction.expiresAt,
    expired,
    userReviewRequired: expired,
    lastAttempt: summary.pendingAction.lastAttempt,
    lastVerifiedStatus: summary.lastVerifiedStatus,
    lastVerifiedAt: summary.lastVerifiedAt,
    updatedAt: summary.updatedAt
  };
}

function modelSummaryFromSummary(
  summary: PluginWalletTicketSummary,
  options: {
    statusSource: PluginWalletModelTicketSummary["statusSource"];
    verifiedCurrent: boolean;
    reverifyRequired: boolean;
    proofLevel?: string;
    reason?: string;
  }
): PluginWalletModelTicketSummary {
  return {
    protocol: "agentport-plugin-wallet-model-summary",
    version: "0.1",
    walletId: summary.walletId,
    walletTicketId: summary.walletTicketId,
    commitmentId: summary.commitmentId,
    label: summary.label,
    status: summary.lastVerifiedStatus,
    statusSource: options.statusSource,
    verifiedCurrent: options.verifiedCurrent,
    reverifyRequired: options.reverifyRequired,
    lastVerifiedAt: summary.lastVerifiedAt,
    proofLevel: options.proofLevel,
    pendingAction: summary.pendingAction,
    deliveryAttemptCount: summary.deliveryAttemptCount,
    lastDeliveryAttempt: summary.lastDeliveryAttempt,
    updatedAt: summary.updatedAt,
    reason: options.reason
  };
}

function isExpired(expiresAt: string | undefined, checkedAt: string) {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  const checkedAtMs = Date.parse(checkedAt);
  if (Number.isNaN(expiresAtMs) || Number.isNaN(checkedAtMs)) {
    return false;
  }

  return expiresAtMs <= checkedAtMs;
}

function isBefore(left: string | undefined, right: string) {
  if (!left) {
    return true;
  }

  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return !Number.isNaN(leftMs) && !Number.isNaN(rightMs) && leftMs < rightMs;
}

function isBeforeOrEqual(left: string, right: string) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return !Number.isNaN(leftMs) && !Number.isNaN(rightMs) && leftMs <= rightMs;
}

function isAfterOrEqual(left: string, right: string) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return !Number.isNaN(leftMs) && !Number.isNaN(rightMs) && leftMs >= rightMs;
}

function walletAad(walletId: string, walletTicketId: string, commitmentId: string) {
  return `agentport-plugin-wallet-v0.1:${walletId}:${walletTicketId}:${commitmentId}`;
}

function walletIdFromAad(aad: string) {
  const prefix = "agentport-plugin-wallet-v0.1:";
  const ticketMarker = ":wallet_ticket_";
  if (!aad.startsWith(prefix)) {
    throw new Error("plugin_wallet_aad_invalid");
  }

  const ticketIndex = aad.indexOf(ticketMarker, prefix.length);
  if (ticketIndex < 0) {
    throw new Error("plugin_wallet_aad_invalid");
  }

  return aad.slice(prefix.length, ticketIndex);
}

function assertNoForbiddenRawWalletFields(value: unknown): void {
  const forbidden = new Set(pluginWalletForbiddenRawFields.map(normalizeFieldName));
  const seen = new WeakSet<object>();
  const visit = (entry: unknown, path: string): void => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    if (seen.has(entry)) {
      return;
    }
    seen.add(entry);

    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(entry)) {
      if (forbidden.has(normalizeFieldName(key))) {
        throw new Error(`plugin_wallet_forbidden_raw_field:${path}.${key}`);
      }
      visit(child, `${path}.${key}`);
    }
  };

  visit(value, "payload");
}

function normalizeFieldName(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function safeWalletTicketId(walletTicketId: string) {
  if (!/^wallet_ticket_[a-f0-9]{24}$/.test(walletTicketId)) {
    throw new Error("plugin_wallet_ticket_id_invalid");
  }

  return walletTicketId;
}

function storeKey(walletId: string, walletTicketId: string) {
  return `${walletId}:${walletTicketId}`;
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

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
