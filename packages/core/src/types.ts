import type { JsonWebKey } from "node:crypto";

export type ActionCapability = "confirm" | "request" | "inform";

export interface AdapterCapabilities {
  readServices: boolean;
  readAvailability: boolean;
  confirmBooking: boolean;
  cancelBooking: boolean;
  rescheduleBooking: boolean;
}

export interface NormalizedService {
  id: string;
  name: string;
  description?: string;
  durationMin?: number;
  price?: {
    amount: number;
    currency: string;
  };
}

export type BusinessDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BusinessHours {
  day: BusinessDay;
  open?: string;
  close?: string;
  closed?: boolean;
}

export interface BusinessProfile {
  hours?: BusinessHours[];
  policies?: Array<{
    label: string;
    detail: string;
  }>;
  faq?: Array<{
    q: string;
    a: string;
  }>;
}

export interface VerificationAttestation {
  status: "verified" | "stale" | "unverified";
  verifiedBy?: string;
  verifiedAt?: string;
  method?: string;
}

export interface TaggedService extends NormalizedService {
  businessId: string;
  platform: string;
  bindingId: string;
  actionCapability: ActionCapability;
  verified: boolean;
  verification: VerificationAttestation | null;
  tag: {
    verified: boolean;
    tier: ActionCapability;
  };
}

export interface CredentialRef {
  vaultId: string;
  key: string;
}

export interface BackendBinding {
  platform: string;
  bindingId?: string;
  businessId?: string;
  locationId?: string;
  bookingUrl?: string;
  phone?: string;
  staticServices?: NormalizedService[];
  credentialRef?: CredentialRef;
  credentials?: Record<string, string | undefined>;
  metadata?: Record<string, unknown>;
}

export type BusinessPortAttestationStatus = "verified" | "stale" | "revoked" | "unverified";

export interface BusinessPortAttestation {
  ref: string;
  businessId: string;
  portId: string;
  status: BusinessPortAttestationStatus;
  bindingId?: string;
  platform?: string;
  endpoint?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  method?: string;
  expiresAt?: string;
}

export type BusinessPortTrustRootPublicKey = string | JsonWebKey;
export type BusinessPortTrustRootKeyStatus = "active" | "stale" | "revoked";

export interface SignedBusinessPortAttestation {
  type: "agentport.business_port_attestation.v0.1";
  attestation: BusinessPortAttestation;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export type BusinessPortAttestationRecord = BusinessPortAttestation | SignedBusinessPortAttestation;

export interface BusinessPortTrustRoot {
  trustedIssuers: string[];
  publicKeys: Record<string, BusinessPortTrustRootPublicKey>;
  keyStatuses?: Record<string, BusinessPortTrustRootKeyStatus>;
}

export type BusinessPortVerificationFailureReason =
  | "business_port_attestation_required"
  | "business_port_signature_required"
  | "business_port_signature_malformed"
  | "business_port_signature_invalid"
  | "business_port_signature_issuer_untrusted"
  | "business_port_signature_key_missing"
  | "business_port_signature_key_stale"
  | "business_port_signature_key_revoked"
  | "business_port_unverified"
  | "business_port_stale"
  | "business_port_revoked"
  | "business_port_expired"
  | "business_port_business_mismatch"
  | "business_port_binding_mismatch"
  | "business_port_platform_mismatch"
  | "business_port_endpoint_mismatch";

export type ActionRiskDecision = "allow" | "warn" | "step_up" | "downgrade" | "reject";
export type ActionRiskLevel = "low" | "medium" | "high" | "critical";
export type ActionRiskFallback = "request" | "handoff";

export interface ActionRiskAssessment {
  decision: ActionRiskDecision;
  level: ActionRiskLevel;
  reason: string;
  userMessage?: string;
  allowedFallback?: ActionRiskFallback;
  familiarBusinessPort?: boolean;
}

export interface BusinessPortVerificationRequest {
  tenant: Tenant;
  binding: BackendBinding;
  bindingId: string;
  actionLayer: ActionLayer;
  action: DelegatedAction;
}

export type BusinessPortVerificationResult =
  | {
      ok: true;
      attestation: BusinessPortAttestation;
    }
  | {
      ok: false;
      reason: BusinessPortVerificationFailureReason;
      attestation?: BusinessPortAttestation;
    };

export interface BusinessPortAttestationProvider {
  verify(request: BusinessPortVerificationRequest): Promise<BusinessPortVerificationResult>;
}

export interface Tenant {
  id: string;
  name: string;
  description?: string;
  lat?: number;
  lng?: number;
  address?: string;
  verification?: VerificationAttestation;
  profile?: BusinessProfile;
  bindings: BackendBinding[];
}

export interface TenantMatch {
  tenant: Tenant;
  services: NormalizedService[];
  distanceKm?: number;
}

export interface AvailabilityRequest {
  businessId: string;
  serviceId: string;
  bindingId?: string;
  from?: string;
  to?: string;
  partySize?: number;
}

export type AvailabilityResult =
  | {
      supported: true;
      serviceId: string;
      slots: AvailabilitySlot[];
      source?: string;
      freshness?: {
        source: string;
        ageMin: number;
      };
    }
  | {
      supported: false;
      reason: string;
      source?: string;
    };

export interface AvailabilitySlot {
  start: string;
  end: string;
  staffId?: string;
  staffName?: string;
  metadata?: Record<string, unknown>;
}

export interface BookRequest {
  intentId?: string;
  approvedActionIntentHash?: string;
  businessId: string;
  serviceId: string;
  bindingId?: string;
  slotStart?: string;
  customer: {
    name: string;
    email?: string;
    phone?: string;
  };
  notes?: string;
  requestedType?: "confirmed" | "request" | "handoff";
  userConsent?: boolean;
}

export interface CancelRequest {
  intentId?: string;
  approvedActionIntentHash?: string;
  businessId: string;
  serviceId: string;
  bindingId?: string;
  confirmationId: string;
  userConsent?: boolean;
}

export interface RescheduleRequest {
  intentId?: string;
  approvedActionIntentHash?: string;
  businessId: string;
  serviceId: string;
  bindingId?: string;
  confirmationId: string;
  newSlotStart: string;
  userConsent?: boolean;
}

export type CommitmentStatus = "active" | "cancelled" | "rescheduled" | "expired" | "released" | "failed";

export type CommitmentRight = "verify" | "cancel" | "reschedule" | "transfer";

export type CommitmentEventType =
  | "created"
  | "verified"
  | "cancel_requested"
  | "cancelled"
  | "reschedule_requested"
  | "rescheduled"
  | "transfer_requested"
  | "transferred"
  | "expired"
  | "recovered"
  | "failed";

export interface AgentPortCommitment {
  protocol: "agentport-commitment";
  version: "0.1";
  commitmentId: string;
  status: CommitmentStatus;
  subject: {
    holderRef: string;
    clientAgentId?: string;
  };
  business: {
    businessId: string;
    serviceId: string;
    bindingId?: string;
  };
  backend: {
    source: string;
    confirmationId: string;
    systemOfRecord: true;
  };
  authority: {
    assurance: AuthorityAssurance;
    evidenceRefs: string[];
    delegationId?: string;
    consentId: string;
  };
  rights: {
    allowedActions: CommitmentRight[];
    transferable: false;
    modificationRequiresConsent: true;
    cancellationRequiresConsent: true;
  };
  recoveryPolicy: {
    mode: "business_backend" | "agentport_handoff" | "unavailable";
    fallbackAction: "retry_backend" | "handoff" | "refuse";
    expiresAt?: string;
  };
  events: Array<{
    eventId: string;
    type: CommitmentEventType;
    at: string;
    actor: "client_user" | "client_agent" | "business_gateway" | "business_backend" | "agentport_operator";
    receiptId?: string;
    backendConfirmationId?: string;
    reason?: string;
  }>;
  receipts: Array<{
    receiptId: string;
    action: DelegatedAction;
    resultType: "confirmed" | "cancelled" | "rescheduled" | "rejected" | "failed";
    payloadHash: string;
    keyId: string;
    signature: string;
  }>;
}

export type BookResult =
  | {
      type: "confirmed";
      confirmationId: string;
      serviceId: string;
      start?: string;
      source?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
      commitment?: AgentPortCommitment;
    }
  | {
      type: "request";
      requestId: string;
      serviceId: string;
      source?: string;
      reason?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "handoff";
      bookingUrl?: string;
      phone?: string;
      serviceId?: string;
      reason: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "failed";
      reason: string;
      serviceId?: string;
      source?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "rejected";
      reason: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    };

export type CancelResult =
  | {
      type: "cancelled";
      confirmationId: string;
      serviceId?: string;
      source?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
      commitment?: AgentPortCommitment;
    }
  | {
      type: "handoff";
      bookingUrl?: string;
      phone?: string;
      serviceId?: string;
      reason: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "failed";
      reason: string;
      serviceId?: string;
      source?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "rejected";
      reason: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    };

export type RescheduleResult =
  | {
      type: "rescheduled";
      confirmationId: string;
      serviceId?: string;
      start: string;
      source?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
      commitment?: AgentPortCommitment;
    }
  | {
      type: "handoff";
      bookingUrl?: string;
      phone?: string;
      serviceId?: string;
      reason: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "failed";
      reason: string;
      serviceId?: string;
      source?: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    }
  | {
      type: "rejected";
      reason: string;
      risk?: ActionRiskAssessment;
      receipt?: ActionReceipt;
    };

export type Scope = "find" | "availability" | "book" | "cancel" | "admin";

export type DelegatedAction = "book_service" | "cancel_service" | "reschedule_service" | "send_ticket";

export type ActionLayer = "read" | "availability" | "lead" | "commit" | "manage" | "funds";

export type DelegationAssurance = "test" | "session" | "account" | "passkey" | "wallet";

export type TokenConfirmationMethod = "session" | "dpop" | "mtls" | "wallet";

export interface ActionIntent {
  action: DelegatedAction;
  businessId: string;
  serviceId?: string;
  bindingId?: string;
  requestedType?: "confirmed" | "request" | "handoff";
  slotStart?: string;
  confirmationId?: string;
  newSlotStart?: string;
  customerFields?: string[];
  consentText?: string[];
  expiresAt?: string;
}

export interface ActionIntentResultDeliveryTarget {
  channel: "inbox" | "webhook";
  target: string;
}

export type ActionIntentResultDeliveryStatus = "delivered" | "failed" | "acknowledged";

export interface ActionIntentResultDeliverySignature {
  issuer: string;
  alg: string;
  signature: string;
  keyId?: string;
}

export interface ActionIntentResultDeliverySummary {
  deliveryId?: string;
  channel: ActionIntentResultDeliveryTarget["channel"];
  target: string;
  status: ActionIntentResultDeliveryStatus;
  updatedAt: string;
  payloadHash?: string;
  attempts: number;
  reason?: string;
  acknowledgedAt?: string;
  nextAttemptAt?: string;
  signature?: ActionIntentResultDeliverySignature;
}

export type ActionIntentLifecycleStatus =
  | "needs_required_input"
  | "approval_ready"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed"
  | "expired";

export interface ActionIntentLifecycleRecord {
  intentId: string;
  agentSessionId: string;
  goal: string;
  status: ActionIntentLifecycleStatus;
  actionIntent: ActionIntent;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  requiredInputs: Array<{
    name: string;
    reason: string;
  }>;
  resolvedInputs: Record<string, string>;
  approval?: {
    status: "not_ready" | "ready" | "approved";
    cardHash?: string;
    actionIntentHash?: string;
  };
  resultDelivery?: ActionIntentResultDeliveryTarget;
  resultDeliveryState?: ActionIntentResultDeliverySummary;
  attempts: Array<{
    tool: DelegatedAction;
    at: string;
    resultType: string;
    reason?: string;
    receiptId?: string;
  }>;
  execution?: {
    resultType: string;
    reason?: string;
    receiptId?: string;
    confirmationId?: string;
  };
  businessRequest?: {
    requestId?: string;
    resultType: string;
    reason?: string;
    source?: string;
    requestedBy?: string;
    submittedAt: string;
    businessStatus?: "submitted" | "seen" | "accepted_for_review" | "needs_more_info" | "cannot_fulfill" | "fulfilled";
    businessStatusAt?: string;
    businessStatusBy?: string;
    businessStatusNote?: string;
    businessStatusEvents?: Array<{
      status: "submitted" | "seen" | "accepted_for_review" | "needs_more_info" | "cannot_fulfill" | "fulfilled";
      at: string;
      by?: string;
      note?: string;
    }>;
    backendMutation: boolean;
    agentPortSystemOfRecord: false;
    backendSystemOfRecord: boolean;
    customer: {
      name: string;
      email?: string;
      phone?: string;
    };
    notes?: string;
  };
  nextStep: "resolve_required_input" | "request_user_approval" | "execute_action" | "terminal";
}

export interface ActionIntentResultDeliveryRecord {
  cursor: number;
  deliveryId: string;
  idempotencyKey: string;
  intentId: string;
  agentSessionId: string;
  channel: ActionIntentResultDeliveryTarget["channel"];
  target: string;
  deliveredAt: string;
  updatedAt: string;
  status: ActionIntentResultDeliveryStatus;
  payloadHash: string;
  signature?: ActionIntentResultDeliverySignature;
  lifecycleStatus: Extract<ActionIntentLifecycleStatus, "succeeded" | "failed" | "expired">;
  actionIntent: ActionIntent;
  result: {
    resultType: string;
    reason?: string;
    receiptId?: string;
    confirmationId?: string;
  };
  attempts: Array<{
    at: string;
    status: Exclude<ActionIntentResultDeliveryStatus, "acknowledged">;
    reason?: string;
    statusCode?: number;
  }>;
  acknowledgedAt?: string;
  nextAttemptAt?: string;
}

export interface ActionIntentLifecycleEvent {
  cursor: number;
  intentId: string;
  agentSessionId: string;
  status: ActionIntentLifecycleStatus;
  nextStep: ActionIntentLifecycleRecord["nextStep"];
  at: string;
  resultType?: string;
  reason?: string;
  resultDeliveryId?: string;
  resultDeliveryStatus?: ActionIntentResultDeliveryStatus;
}

export interface DelegationTokenConfirmation {
  method: TokenConfirmationMethod;
  keyId?: string;
  jwkThumbprint?: string;
  certificateThumbprint?: string;
  sessionId?: string;
}

export type AuthorityAssurance = "none" | "signed" | "verified-mandate";

export type AuthorityEvidenceKind =
  | "ap2-mandate"
  | "ucp-http-signature"
  | "acp-checkout"
  | "agentport-local-delegation";

export interface AuthorityEvidenceReference {
  kind: AuthorityEvidenceKind;
  ref: string;
  issuer?: string;
}

export interface AuthorityContext {
  caller: {
    agentId: string;
    agentKeyThumbprint?: string;
  };
  user: {
    subjectRef?: string;
    consentRef?: string;
  };
  action: {
    layer: ActionLayer;
    businessId?: string;
    serviceId?: string;
    bounds?: ActionIntent;
  };
  assurance: AuthorityAssurance;
  validity: {
    expiresAt?: string;
    replayHandle?: string;
    audience?: string;
  };
  evidence: AuthorityEvidenceReference[];
}

export type AuthorityVerificationResult =
  | {
      ok: true;
      authority: AuthorityContext;
    }
  | {
      ok: false;
      reason:
        | "authority_untrusted_issuer"
        | "authority_verification_failed"
        | "authority_expired"
        | "authority_stale"
        | "authority_revoked"
        | "authority_replay_detected"
        | "authority_action_mismatch"
        | "authority_business_mismatch"
        | "authority_service_mismatch";
    };

export interface AuthorityEvidenceVerifier {
  profile: AuthorityEvidenceKind;
  normalize(evidence: unknown): Promise<AuthorityVerificationResult>;
}

export interface ActionReceiptPayload {
  action: DelegatedAction;
  actionLayer: ActionLayer;
  businessId: string;
  serviceId?: string;
  resultType: string;
  resultReason?: string;
  userAuthorityRef?: string;
  userAuthoritySubject?: string;
  userAuthorityConsentRef?: string;
  userAuthorityAssurance?: DelegationAssurance | AuthorityAssurance;
  userAuthorityTechnology?: UserAuthorityTechnology;
  delegationId?: string;
  consentId?: string;
  clientAgentId?: string;
  userSubject?: string;
  authorityAssurance?: AuthorityAssurance;
  authorityEvidence?: AuthorityEvidenceReference[];
  tokenConfirmationMethod?: TokenConfirmationMethod;
  businessPortRef?: string;
  businessPortId?: string;
  businessPortStatus?: BusinessPortAttestationStatus;
  businessPortVerifiedBy?: string;
  riskDecision?: ActionRiskDecision;
  riskLevel?: ActionRiskLevel;
  riskReason?: string;
  riskUserMessage?: string;
  riskAllowedFallback?: ActionRiskFallback;
  riskFamiliarBusinessPort?: boolean;
  backendConfirmationId?: string;
  backendSource?: string;
  issuedAt: string;
}

export interface ActionReceipt extends ActionReceiptPayload {
  receiptId: string;
  issuer: string;
  payloadHash?: string;
  signature?: string;
  keyId?: string;
}

export interface ActionGatePolicy {
  requireDelegation?: boolean;
  requireApprovedIntent?: boolean;
  minAssurance?: DelegationAssurance;
  requireReplayProtection?: boolean;
  requireTokenConfirmation?: boolean;
  tokenConfirmationMethods?: TokenConfirmationMethod[];
}

export interface DelegationProof {
  delegationId: string;
  issuer?: string;
  userSubject: string;
  agentId: string;
  consentId: string;
  scopes: Scope[];
  approvedActions?: DelegatedAction[];
  businessId?: string;
  serviceId?: string;
  audience?: string;
  challengeId?: string;
  nonce?: string;
  tokenConfirmation?: DelegationTokenConfirmation;
  expiresAt?: string;
  issuedAt?: string;
  assurance?: DelegationAssurance;
  actionIntent?: ActionIntent;
  actionIntentHash?: string;
}

export type DelegationVerificationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "delegation_untrusted_issuer"
        | "delegation_verification_failed"
        | "delegation_revoked"
        | "delegation_assurance_too_low"
        | "delegation_token_confirmation_invalid";
    };

export interface AuthorizationResult {
  scopes: Scope[];
  delegation?: DelegationProof;
  authority?: AuthorityContext;
}

export type UserAuthorityVerificationFailureReason =
  | "user_authority_required"
  | "user_authority_invalid"
  | "user_authority_untrusted"
  | "user_authority_stale"
  | "user_authority_revoked"
  | "user_authority_technology_not_allowed"
  | "user_authority_action_mismatch"
  | "user_authority_business_mismatch"
  | "user_authority_service_mismatch"
  | "user_authority_audience_mismatch"
  | "user_authority_expired"
  | "user_authority_nonce_required"
  | "user_authority_action_hash_mismatch";

export interface UserAuthorityContext {
  ref: string;
  subjectRef?: string;
  consentRef?: string;
  agentId?: string;
  assurance?: DelegationAssurance | AuthorityAssurance;
  technology?: UserAuthorityTechnology;
  audience?: string;
  expiresAt?: string;
  nonce?: string;
  actionIntentHash?: string;
}

export type UserAuthorityTechnology =
  | "agentport-local"
  | "passkey"
  | "oidc-session"
  | "wallet"
  | "ap2-mandate"
  | "ucp-http-signature"
  | "acp-checkout";

export type UserAuthorityTrustStatus = "active" | "stale" | "revoked";

export interface UserAuthorityTrustRecord extends UserAuthorityContext {
  status: UserAuthorityTrustStatus;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface UserAuthorityTrustStore {
  resolve(ref: string): Promise<UserAuthorityTrustRecord | null>;
}

export interface UserAuthorityVerificationRequest {
  authorization: AuthorizationResult;
  action: DelegatedAction;
  actionLayer: ActionLayer;
  request: BookRequest | CancelRequest | RescheduleRequest;
}

export type UserAuthorityVerificationResult =
  | {
      ok: true;
      authority: UserAuthorityContext;
    }
  | {
      ok: false;
      reason: UserAuthorityVerificationFailureReason;
      authority?: UserAuthorityContext;
    };

export interface UserAuthorityProvider {
  verify(request: UserAuthorityVerificationRequest): Promise<UserAuthorityVerificationResult>;
}

export interface BusinessPortAttestationStore {
  resolve(request: BusinessPortVerificationRequest): Promise<BusinessPortAttestationRecord | null>;
}

export interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url?: string;
}

export interface AuditEvent {
  type: string;
  businessId?: string;
  serviceId?: string;
  resultType?: string;
  metadata?: Record<string, unknown>;
  at: string;
}

export interface Lead {
  businessId: string;
  serviceId?: string;
  customer: {
    name: string;
    email?: string;
    phone?: string;
  };
  intent: string;
  requestedTime?: string;
  source: string;
}

export interface QueryEvent {
  type: string;
  businessId?: string;
  service?: string;
  at: string;
}
