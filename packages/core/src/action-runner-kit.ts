import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type JsonWebKey
} from "node:crypto";
import { createActionIntentHash, type PublicKeyMaterial } from "./delegation-token.js";
import type { ActionIntentResultDeliverySigner, ActionReceiptSigner } from "./providers.js";
import type {
  ActionIntent,
  ActionIntentResultDeliveryRecord,
  ActionReceipt,
  ActionReceiptPayload,
  AuthorityContext,
  BookRequest,
  CancelRequest,
  DelegatedAction,
  DelegationAssurance,
  DelegationTokenConfirmation,
  RescheduleRequest,
  Scope
} from "./types.js";

export interface AgentPortActionModelLike {
  approvalCard: {
    requiredDisplayFields: string[];
    consentTemplate: string[];
  };
}

export interface AgentPortIssuerFlowLike {
  delegationRequest: {
    requiredFields?: string[];
    forbiddenClientFields?: string[];
  };
}

export interface DiscoveryTrustDistributionValidationOptions {
  allowLocalHttp?: boolean;
}

export interface DiscoveryTrustDistributionPlan {
  protocol: "agentport-discovery-trust-distribution-plan";
  descriptorIsTrust: false;
  productionTransport: "https-required";
  gatewayReceiptTrust: {
    domain: "gateway_receipt_trust";
    order: [
      "apply_gateway_trust_root_emergency_denylist",
      "verify_gateway_trust_root_bundle",
      "verify_signed_gateway_trust_profile",
      "verify_gateway_action_receipt"
    ];
    emergencyDenyListEndpoint?: string;
    trustRootBundleEndpoint?: string;
    signedTrustProfileResource: "agentport://gateway-trust-profile";
    receiptSource: "tool_result";
  };
  issuerReadinessTrust: {
    domain: "issuer_readiness_trust";
    issuerMetadataPath: "/.well-known/agentport-issuer.json";
    order: [
      "apply_issuer_readiness_root_emergency_denylist",
      "verify_issuer_readiness_trust_root_bundle",
      "verify_signed_issuer_readiness",
      "validate_issuer_readiness_report"
    ];
    emergencyDenyListEndpoint?: string;
    signedTrustRootBundleMetadataField: "readinessTrustRootSigned";
    signedReadinessMetadataField: "readinessSigned";
    readinessReportMetadataField: "readiness";
  };
}

export type DiscoveryTrustDistributionValidationFailureReason =
  | "discovery_missing"
  | "discovery_protocol_unsupported"
  | "discovery_version_unsupported"
  | "discovery_resource_uri_unsupported"
  | "discovery_trust_distribution_missing"
  | "discovery_trust_distribution_is_trust"
  | "discovery_trust_distribution_transport_unsupported"
  | "discovery_gateway_trust_domain_mismatch"
  | "discovery_gateway_trust_order_mismatch"
  | "discovery_gateway_trust_artifact_missing"
  | "discovery_gateway_trust_protocol_mismatch"
  | "discovery_gateway_trust_endpoint_insecure"
  | "discovery_gateway_trust_resource_mismatch"
  | "discovery_gateway_receipt_source_mismatch"
  | "discovery_issuer_readiness_domain_mismatch"
  | "discovery_issuer_readiness_metadata_path_mismatch"
  | "discovery_issuer_readiness_order_mismatch"
  | "discovery_issuer_readiness_artifact_missing"
  | "discovery_issuer_readiness_protocol_mismatch"
  | "discovery_issuer_readiness_endpoint_insecure"
  | "discovery_issuer_readiness_metadata_field_mismatch";

export type DiscoveryTrustDistributionValidationResult =
  | {
      ok: true;
      plan: DiscoveryTrustDistributionPlan;
    }
  | {
      ok: false;
      reason: DiscoveryTrustDistributionValidationFailureReason;
      field?: string;
    };

export interface ApprovalCardInput {
  agentName: string;
  actionIntent: ActionIntent;
  businessName: string;
  serviceName?: string;
  requestedTimeOrSlot?: string;
  customerFieldsToShare: string[];
  resultTypeRequested?: "confirmed" | "request" | "handoff" | "cancelled" | "rescheduled";
  delegationExpiryWhenAvailable?: string;
}

export interface AgentPortApprovalCard {
  intent: ActionIntent;
  actionIntentHash: string;
  fields: Record<string, string | string[]>;
  consentText: string[];
  cardHash: string;
}

export interface AgentPortApprovalEvent {
  approvalId: string;
  approved: true;
  approvedAt: string;
  cardHash: string;
  actionIntentHash: string;
}

export interface ApprovalEventInput {
  approvalId: string;
  approved: boolean;
  approvedAt: string;
}

export interface IssuerDelegationRequestInput {
  agentId: string;
  audience: string;
  actionIntent: ActionIntent;
  scopes: Scope[];
  approvedActions?: DelegatedAction[];
  tokenConfirmation: DelegationTokenConfirmation;
  expiresAt: string;
  challengeId?: string;
  nonce?: string;
  assurance?: DelegationAssurance;
  approvalCard: AgentPortApprovalCard;
}

export type StateChangingToolArguments = BookRequest | CancelRequest | RescheduleRequest;

export type PluginPreExecutionCheckId =
  | "exact_user_approval"
  | "representative_authority"
  | "real_user_presence"
  | "anti_abuse_screening";

export interface AgentPortVendorPluginManifestLike {
  requiredPreExecutionChecks?: {
    appliesTo?: string[];
    failClosed?: boolean;
    checks?: Array<{
      id?: string;
      required?: boolean;
    }>;
  };
}

export type PluginActionRiskSignal =
  | "phishing"
  | "malware"
  | "coercion"
  | "ransom_extortion"
  | "suspicious_origin"
  | "session_anomaly"
  | string;

export interface PluginActionPreflightInput {
  manifest: AgentPortVendorPluginManifestLike;
  tool: DelegatedAction;
  approvalCard: AgentPortApprovalCard;
  approval: AgentPortApprovalEvent;
  toolArguments?: StateChangingToolArguments;
  agentSession?: {
    agentId?: string;
    sessionId?: string;
    userSubjectRef?: string;
    authenticated?: boolean;
  };
  authority?: AuthorityContext;
  userPresence?: {
    verified?: boolean;
    source?: "issuer" | "host_app";
    sessionBound?: boolean;
    trustedApprovalOrigin?: boolean;
    phishingResistant?: boolean;
    origin?: string;
  };
  risk?: {
    policyApplied?: boolean;
    signals?: PluginActionRiskSignal[];
    stepUpRequired?: boolean;
    stepUpSatisfied?: boolean;
  };
  expectedAudience?: string;
  allowedApprovalOrigins?: string[];
  requireReplayHandle?: boolean;
  requirePhishingResistant?: boolean;
  now?: () => Date;
}

export type PluginActionPreflightFailureReason =
  | "plugin_preflight_manifest_missing"
  | "plugin_preflight_not_fail_closed"
  | "plugin_preflight_tool_not_covered"
  | "plugin_preflight_check_missing"
  | "plugin_preflight_approval_mismatch"
  | "plugin_preflight_tool_argument_mismatch"
  | "plugin_preflight_agent_session_missing"
  | "plugin_preflight_agent_session_unauthenticated"
  | "plugin_preflight_authority_missing"
  | "plugin_preflight_authority_agent_mismatch"
  | "plugin_preflight_authority_user_mismatch"
  | "plugin_preflight_authority_bounds_missing"
  | "plugin_preflight_authority_bounds_mismatch"
  | "plugin_preflight_authority_expired"
  | "plugin_preflight_authority_audience_mismatch"
  | "plugin_preflight_authority_replay_missing"
  | "plugin_preflight_authority_evidence_missing"
  | "plugin_preflight_user_presence_missing"
  | "plugin_preflight_user_presence_unverified"
  | "plugin_preflight_approval_origin_untrusted"
  | "plugin_preflight_phishing_resistance_missing"
  | "plugin_preflight_risk_policy_missing"
  | "plugin_preflight_risk_signal_unresolved";

export type PluginActionPreflightValidationResult =
  | {
      ok: true;
      approvedActionIntentHash: string;
      agentId: string;
      authorityEvidenceRefs: string[];
    }
  | {
      ok: false;
      reason: PluginActionPreflightFailureReason;
      field?: string;
      check?: PluginPreExecutionCheckId;
      signal?: PluginActionRiskSignal;
    };

export interface ActionReceiptValidationExpectations {
  issuer?: string;
  action?: DelegatedAction;
  businessId?: string;
  serviceId?: string;
  resultType?: string;
  backendConfirmationId?: string;
  signature?: ActionReceiptSignatureExpectations;
}

export interface ActionReceiptSignatureExpectations {
  requireSignature?: boolean;
  trustedIssuers?: string[];
  publicKeys?: Record<string, PublicKeyMaterial>;
  keyStatuses?: Record<string, ActionReceiptTrustKeyStatus>;
  now?: () => Date;
}

export interface ActionReceiptTrustKeyStatus {
  status?: "active" | "retired" | "revoked";
  notBefore?: string;
  expiresAt?: string;
}

export interface ActionReceiptGatewayTrustProfile {
  protocol: "agentport-gateway-trust-profile";
  version: "0.1";
  gatewayIssuer: string;
  receipt: {
    requireSignature: boolean;
    algorithm: "EdDSA";
    publicKeys: Array<{
      kid: string;
      alg: "EdDSA";
      use: "sig";
      jwk: JsonWebKey;
      status?: "active" | "retired" | "revoked";
      notBefore?: string;
      expiresAt?: string;
    }>;
  };
}

export interface SignedActionReceiptGatewayTrustProfile {
  protocol: "agentport-gateway-trust-profile-envelope";
  version: "0.1";
  profile: ActionReceiptGatewayTrustProfile;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export interface AgentPortGatewayTrustRootBundle {
  protocol: "agentport-gateway-trust-root-bundle";
  version: "0.1";
  bundleId?: string;
  sequence?: number;
  issuedAt?: string;
  notBefore?: string;
  expiresAt?: string;
  authorities: Array<{
    issuer: string;
    publicKeys: Array<{
      kid: string;
      alg: "EdDSA";
      use: "sig";
      jwk: JsonWebKey;
      status?: "active" | "retired" | "revoked";
      notBefore?: string;
      expiresAt?: string;
    }>;
  }>;
}

export interface SignedAgentPortGatewayTrustRootBundle {
  protocol: "agentport-gateway-trust-root-bundle-envelope";
  version: "0.1";
  bundle: AgentPortGatewayTrustRootBundle;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export interface AgentPortGatewayTrustRootEmergencyDenyList {
  protocol: "agentport-gateway-trust-root-emergency-denylist";
  version: "0.1";
  listId?: string;
  sequence?: number;
  issuedAt?: string;
  notBefore?: string;
  expiresAt?: string;
  blockedIssuers?: string[];
  blockedKeyIds?: string[];
  blockedBundleHashes?: string[];
  approval?: {
    changeHash: string;
    approvalIds: string[];
    approvedBy: string[];
    reason?: string;
  };
}

export interface GatewayTrustRootEmergencyDenyListApproval {
  approvalId: string;
  operatorId: string;
  approved: true;
  approvedAt: string;
  changeHash: string;
  reason?: string;
}

export interface SignedAgentPortGatewayTrustRootEmergencyDenyList {
  protocol: "agentport-gateway-trust-root-emergency-denylist-envelope";
  version: "0.1";
  denyList: AgentPortGatewayTrustRootEmergencyDenyList;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export interface SignedIssuerProductionReadinessReport {
  protocol: "agentport-issuer-production-readiness-envelope";
  version: "0.1";
  report: IssuerProductionReadinessReportLike;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    expiresAt?: string;
    signature: string;
  };
}

export interface AgentPortIssuerReadinessTrustRootBundle {
  protocol: "agentport-issuer-readiness-trust-root-bundle";
  version: "0.1";
  bundleId?: string;
  sequence?: number;
  issuedAt?: string;
  notBefore?: string;
  expiresAt?: string;
  authorities: Array<{
    issuer: string;
    publicKeys: Array<{
      kid: string;
      alg: "EdDSA";
      use: "sig";
      jwk: JsonWebKey;
      status?: "active" | "retired" | "revoked";
      notBefore?: string;
      expiresAt?: string;
    }>;
  }>;
}

export interface AgentPortIssuerReadinessTrustRootPublication {
  protocol: "agentport-issuer-readiness-trust-root-publication";
  version: "0.1";
  bundleHash: string;
  bundle: AgentPortIssuerReadinessTrustRootBundle;
}

export interface SignedAgentPortIssuerReadinessTrustRootBundle {
  protocol: "agentport-issuer-readiness-trust-root-bundle-envelope";
  version: "0.1";
  bundle: AgentPortIssuerReadinessTrustRootBundle;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export interface AgentPortIssuerReadinessTrustRootEmergencyDenyList {
  protocol: "agentport-issuer-readiness-trust-root-emergency-denylist";
  version: "0.1";
  listId?: string;
  sequence?: number;
  issuedAt?: string;
  notBefore?: string;
  expiresAt?: string;
  blockedIssuers?: string[];
  blockedKeyIds?: string[];
  blockedBundleHashes?: string[];
  approval?: {
    changeHash: string;
    approvalIds: string[];
    approvedBy: string[];
    reason?: string;
  };
}

export interface IssuerReadinessTrustRootEmergencyDenyListApproval {
  approvalId: string;
  operatorId: string;
  approved: true;
  approvedAt: string;
  changeHash: string;
  reason?: string;
}

export interface SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList {
  protocol: "agentport-issuer-readiness-trust-root-emergency-denylist-envelope";
  version: "0.1";
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export interface GatewayTrustRootEmergencyDenyListPublicationRecord {
  type: "agentport.gateway_trust_root_emergency_denylist_publication";
  publishedAt: string;
  envelopeHash: string;
  previousEnvelopeHash?: string;
  listId?: string;
  sequence?: number;
  signerIssuer: string;
  signerKeyId: string;
  approvalChangeHash?: string;
  approvalIds?: string[];
  approvedBy?: string[];
}

export interface GatewayTrustRootEmergencyDenyListPublicationResult {
  denyList: AgentPortGatewayTrustRootEmergencyDenyList;
  record: GatewayTrustRootEmergencyDenyListPublicationRecord;
}

export interface GatewayTrustRootEmergencyDenyListPublicationOptions {
  now?: () => Date;
  currentSequence?: number;
  currentEnvelopeHash?: string;
  expectedCurrentEnvelopeHash?: string | null;
  requireSequence?: boolean;
  requireApproval?: boolean;
  minApprovals?: number;
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationRecord {
  type: "agentport.issuer_readiness_trust_root_emergency_denylist_publication";
  publishedAt: string;
  envelopeHash: string;
  previousEnvelopeHash?: string;
  listId?: string;
  sequence?: number;
  signerIssuer: string;
  signerKeyId: string;
  approvalChangeHash?: string;
  approvalIds?: string[];
  approvedBy?: string[];
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationResult {
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList;
  record: IssuerReadinessTrustRootEmergencyDenyListPublicationRecord;
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationOptions {
  now?: () => Date;
  currentSequence?: number;
  currentEnvelopeHash?: string;
  expectedCurrentEnvelopeHash?: string | null;
  requireSequence?: boolean;
  requireApproval?: boolean;
  minApprovals?: number;
}

export type IssuerProductionReadinessControl =
  | "approval_authorization"
  | "passkey_approval_challenge"
  | "passkey_registration"
  | "passkey_credential_management"
  | "revocation_authorization"
  | "rate_limit"
  | "audit_sink"
  | "security_headers"
  | "json_content_type"
  | "request_body_limit"
  | "origin_policy"
  | "token_confirmation_policy"
  | "replay_handle_required"
  | "bounded_token_ttl"
  | "minimum_approval_assurance"
  | "passkey_assertion_verification"
  | "signer_key_custody"
  | "durable_issuer_store"
  | "durable_replay_store"
  | "audit_retention"
  | "monitoring";

export interface IssuerProductionReadinessReportLike {
  profile: string;
  issuer: string;
  ready: boolean;
  controls: Partial<Record<IssuerProductionReadinessControl, boolean>>;
  gaps?: Array<{
    code?: string;
    control?: string;
  }>;
}

export interface IssuerProductionReadinessValidationOptions {
  expectedIssuer?: string;
  requiredControls?: IssuerProductionReadinessControl[];
}

export interface IssuerProductionReadinessEnvelopeVerificationOptions
  extends IssuerProductionReadinessValidationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
  keyStatuses?: Record<string, ActionReceiptTrustKeyStatus>;
  now?: () => Date;
  requireFreshReadiness?: boolean;
}

export interface IssuerReadinessTrustRootBundleOptions {
  trustedIssuers: string[];
  now?: () => Date;
  requireFreshBundle?: boolean;
  expectedBundleHash?: string;
  trustedBundleHashes?: string[];
  blockedBundleHashes?: string[];
  minimumBundleSequence?: number;
}

export interface IssuerReadinessTrustRootBundleEnvelopeVerificationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
  keyStatuses?: Record<string, ActionReceiptTrustKeyStatus>;
  blockedIssuers?: string[];
  blockedKeyIds?: string[];
  blockedBundleHashes?: string[];
  now?: () => Date;
}

export interface IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
  keyStatuses?: Record<string, ActionReceiptTrustKeyStatus>;
  now?: () => Date;
  requireFreshDenyList?: boolean;
  minimumDenyListSequence?: number;
}

export type IssuerProductionReadinessValidationFailureReason =
  | "issuer_readiness_missing"
  | "issuer_readiness_profile_unsupported"
  | "issuer_readiness_issuer_missing"
  | "issuer_readiness_issuer_mismatch"
  | "issuer_readiness_not_ready"
  | "issuer_readiness_gap_present"
  | "issuer_readiness_control_missing";

export type IssuerProductionReadinessValidationResult =
  | {
      ok: true;
      issuer: string;
      profile: "agentport-issuer-production-readiness-v0.1";
    }
  | {
      ok: false;
      reason: IssuerProductionReadinessValidationFailureReason;
      control?: IssuerProductionReadinessControl;
      gapCode?: string;
    };

export interface GatewayTrustProfileVerificationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
}

export interface GatewayTrustRootBundleEnvelopeVerificationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
  keyStatuses?: Record<string, ActionReceiptTrustKeyStatus>;
  blockedIssuers?: string[];
  blockedKeyIds?: string[];
  blockedBundleHashes?: string[];
  now?: () => Date;
}

export interface GatewayTrustRootBundleOptions {
  trustedIssuers: string[];
  now?: () => Date;
  requireFreshBundle?: boolean;
  expectedBundleHash?: string;
  trustedBundleHashes?: string[];
  blockedBundleHashes?: string[];
  minimumBundleSequence?: number;
}

export interface GatewayTrustRootEmergencyDenyListEnvelopeVerificationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
  keyStatuses?: Record<string, ActionReceiptTrustKeyStatus>;
  now?: () => Date;
  requireFreshDenyList?: boolean;
  minimumDenyListSequence?: number;
}

export type ActionReceiptValidationFailureReason =
  | "receipt_missing"
  | "receipt_payload_hash_missing"
  | "receipt_payload_hash_mismatch"
  | "receipt_id_mismatch"
  | "receipt_issuer_mismatch"
  | "receipt_action_mismatch"
  | "receipt_business_mismatch"
  | "receipt_service_mismatch"
  | "receipt_result_type_mismatch"
  | "receipt_backend_confirmation_mismatch"
  | "receipt_issuer_untrusted"
  | "receipt_signature_missing"
  | "receipt_key_id_missing"
  | "receipt_public_key_missing"
  | "receipt_key_revoked"
  | "receipt_key_retired"
  | "receipt_key_not_active"
  | "receipt_key_expired"
  | "receipt_signature_malformed"
  | "receipt_signature_invalid";

export type ActionReceiptValidationResult =
  | {
      ok: true;
      payloadHash: string;
      receiptId: string;
    }
  | {
      ok: false;
      reason: ActionReceiptValidationFailureReason;
    };

export interface ActionIntentResultDeliverySignatureExpectations {
  trustedIssuers?: string[];
  publicKeys?: Record<string, PublicKeyMaterial>;
  requireSignature?: boolean;
}

export const actionIntentResultDeliveryTrustProfileResourceUri = "agentport://intent-result-delivery-trust-profile";

export interface ActionIntentResultDeliveryTrustProfile {
  protocol: "agentport-action-intent-result-delivery-trust-profile";
  version: "0.1";
  gatewayIssuer: string;
  delivery: {
    requireSignature: boolean;
    algorithm: "EdDSA";
    publicKeys: Array<{
      kid: string;
      alg: "EdDSA";
      use: "sig";
      jwk: JsonWebKey;
    }>;
  };
}

export type ActionIntentResultDeliveryValidationFailureReason =
  | "delivery_missing"
  | "delivery_payload_hash_missing"
  | "delivery_id_missing"
  | "delivery_idempotency_key_missing"
  | "delivery_signature_missing"
  | "delivery_issuer_untrusted"
  | "delivery_signature_alg_unsupported"
  | "delivery_key_id_missing"
  | "delivery_public_key_missing"
  | "delivery_signature_malformed"
  | "delivery_signature_invalid";

export type ActionIntentResultDeliveryValidationResult =
  | {
      ok: true;
      deliveryId: string;
      payloadHash: string;
      idempotencyKey: string;
    }
  | {
      ok: false;
      reason: ActionIntentResultDeliveryValidationFailureReason;
    };

export class Ed25519ActionReceiptSigner implements ActionReceiptSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  async sign(input: { receiptId: string; payload: ActionReceiptPayload; payloadHash: string }): Promise<{
    issuer: string;
    signature: string;
    keyId: string;
  }> {
    const signature = cryptoSign(
      null,
      Buffer.from(actionReceiptSigningInput(input.receiptId, input.payloadHash)),
      createPrivateKey(this.privateKeyPem)
    );
    return {
      issuer: this.issuer,
      signature: base64UrlEncode(signature),
      keyId: this.keyId
    };
  }
}

export class Ed25519ActionIntentResultDeliverySigner implements ActionIntentResultDeliverySigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  async sign(input: {
    deliveryId: string;
    idempotencyKey: string;
    payloadHash: string;
    intentId: string;
    agentSessionId: string;
  }): Promise<{
    issuer: string;
    alg: "EdDSA";
    signature: string;
    keyId: string;
  }> {
    const signature = cryptoSign(
      null,
      Buffer.from(actionIntentResultDeliverySigningInput(input)),
      createPrivateKey(this.privateKeyPem)
    );
    return {
      issuer: this.issuer,
      alg: "EdDSA",
      signature: base64UrlEncode(signature),
      keyId: this.keyId
    };
  }
}

export class Ed25519GatewayTrustProfileSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(profile: ActionReceiptGatewayTrustProfile, input: { signedAt?: string } = {}): SignedActionReceiptGatewayTrustProfile {
    const signedAt = input.signedAt;
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(signedAt ? { signedAt } : {})
    };
    const signingInput = gatewayTrustProfileSigningInput(profile, signatureMetadata);
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-gateway-trust-profile-envelope",
      version: "0.1",
      profile,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export class Ed25519GatewayTrustRootBundleSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(bundle: AgentPortGatewayTrustRootBundle, input: { signedAt?: string } = {}): SignedAgentPortGatewayTrustRootBundle {
    const signedAt = input.signedAt;
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(signedAt ? { signedAt } : {})
    };
    const signingInput = gatewayTrustRootBundleSigningInput(bundle, signatureMetadata);
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-gateway-trust-root-bundle-envelope",
      version: "0.1",
      bundle,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export class Ed25519GatewayTrustRootEmergencyDenyListSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(
    denyList: AgentPortGatewayTrustRootEmergencyDenyList,
    input: { signedAt?: string } = {}
  ): SignedAgentPortGatewayTrustRootEmergencyDenyList {
    const signedAt = input.signedAt;
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(signedAt ? { signedAt } : {})
    };
    const signingInput = gatewayTrustRootEmergencyDenyListSigningInput(denyList, signatureMetadata);
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-gateway-trust-root-emergency-denylist-envelope",
      version: "0.1",
      denyList,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export class Ed25519IssuerProductionReadinessSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(
    report: IssuerProductionReadinessReportLike,
    input: { signedAt?: string; expiresAt?: string } = {}
  ): SignedIssuerProductionReadinessReport {
    const signedAt = input.signedAt;
    const expiresAt = input.expiresAt;
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(signedAt ? { signedAt } : {}),
      ...(expiresAt ? { expiresAt } : {})
    };
    const signingInput = issuerProductionReadinessSigningInput(report, signatureMetadata);
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-issuer-production-readiness-envelope",
      version: "0.1",
      report,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export class Ed25519IssuerReadinessTrustRootBundleSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(
    bundle: AgentPortIssuerReadinessTrustRootBundle,
    input: { signedAt?: string } = {}
  ): SignedAgentPortIssuerReadinessTrustRootBundle {
    const signedAt = input.signedAt;
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(signedAt ? { signedAt } : {})
    };
    const signingInput = issuerReadinessTrustRootBundleSigningInput(bundle, signatureMetadata);
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-issuer-readiness-trust-root-bundle-envelope",
      version: "0.1",
      bundle,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export class Ed25519IssuerReadinessTrustRootEmergencyDenyListSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(
    denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList,
    input: { signedAt?: string } = {}
  ): SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList {
    const signedAt = input.signedAt;
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(signedAt ? { signedAt } : {})
    };
    const signingInput = issuerReadinessTrustRootEmergencyDenyListSigningInput(denyList, signatureMetadata);
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-issuer-readiness-trust-root-emergency-denylist-envelope",
      version: "0.1",
      denyList,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export function verifySignedActionReceiptGatewayTrustProfile(
  envelope: SignedActionReceiptGatewayTrustProfile,
  options: GatewayTrustProfileVerificationOptions
): ActionReceiptGatewayTrustProfile {
  if (envelope.protocol !== "agentport-gateway-trust-profile-envelope" || envelope.version !== "0.1") {
    throw new Error("receipt_trust_profile_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("receipt_trust_profile_envelope_alg_unsupported");
  }

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("receipt_trust_profile_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("receipt_trust_profile_envelope_public_key_missing");
  }

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("receipt_trust_profile_envelope_signature_malformed");
  }

  const signingInput = gatewayTrustProfileSigningInput(envelope.profile, {
    issuer: envelope.signature.issuer,
    keyId: envelope.signature.keyId,
    alg: envelope.signature.alg,
    ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {})
  });
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("receipt_trust_profile_envelope_signature_invalid");
  }

  return envelope.profile;
}

export function verifySignedGatewayTrustRootBundle(
  envelope: SignedAgentPortGatewayTrustRootBundle,
  options: GatewayTrustRootBundleEnvelopeVerificationOptions
): AgentPortGatewayTrustRootBundle {
  if (envelope.protocol !== "agentport-gateway-trust-root-bundle-envelope" || envelope.version !== "0.1") {
    throw new Error("receipt_trust_root_bundle_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("receipt_trust_root_bundle_envelope_alg_unsupported");
  }

  validateTrustRootBundleEnvelopeDenyList(envelope, options);

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("receipt_trust_root_bundle_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("receipt_trust_root_bundle_envelope_public_key_missing");
  }

  const keyStatusFailure = validateTrustRootBundleEnvelopeKeyStatus(
    options.keyStatuses?.[envelope.signature.keyId],
    options.now
  );
  if (keyStatusFailure) {
    throw new Error(keyStatusFailure);
  }

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("receipt_trust_root_bundle_envelope_signature_malformed");
  }

  const signingInput = gatewayTrustRootBundleSigningInput(envelope.bundle, {
    issuer: envelope.signature.issuer,
    keyId: envelope.signature.keyId,
    alg: envelope.signature.alg,
    ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {})
  });
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("receipt_trust_root_bundle_envelope_signature_invalid");
  }

  return envelope.bundle;
}

export function verifySignedGatewayTrustRootEmergencyDenyList(
  envelope: SignedAgentPortGatewayTrustRootEmergencyDenyList,
  options: GatewayTrustRootEmergencyDenyListEnvelopeVerificationOptions
): AgentPortGatewayTrustRootEmergencyDenyList {
  if (
    envelope.protocol !== "agentport-gateway-trust-root-emergency-denylist-envelope" ||
    envelope.version !== "0.1"
  ) {
    throw new Error("receipt_trust_root_emergency_denylist_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("receipt_trust_root_emergency_denylist_envelope_alg_unsupported");
  }

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("receipt_trust_root_emergency_denylist_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("receipt_trust_root_emergency_denylist_envelope_public_key_missing");
  }

  const keyStatusFailure = validateEmergencyDenyListEnvelopeKeyStatus(
    options.keyStatuses?.[envelope.signature.keyId],
    options.now
  );
  if (keyStatusFailure) {
    throw new Error(keyStatusFailure);
  }

  validateEmergencyDenyListFreshness(envelope.denyList, options);

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("receipt_trust_root_emergency_denylist_envelope_signature_malformed");
  }

  const signingInput = gatewayTrustRootEmergencyDenyListSigningInput(envelope.denyList, {
    issuer: envelope.signature.issuer,
    keyId: envelope.signature.keyId,
    alg: envelope.signature.alg,
    ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {})
  });
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("receipt_trust_root_emergency_denylist_envelope_signature_invalid");
  }

  return envelope.denyList;
}

export function verifySignedIssuerProductionReadiness(
  envelope: SignedIssuerProductionReadinessReport,
  options: IssuerProductionReadinessEnvelopeVerificationOptions
): IssuerProductionReadinessReportLike {
  if (envelope.protocol !== "agentport-issuer-production-readiness-envelope" || envelope.version !== "0.1") {
    throw new Error("issuer_readiness_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("issuer_readiness_envelope_alg_unsupported");
  }

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("issuer_readiness_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("issuer_readiness_envelope_public_key_missing");
  }

  const keyStatusFailure = validateIssuerReadinessEnvelopeKeyStatus(
    options.keyStatuses?.[envelope.signature.keyId],
    options.now
  );
  if (keyStatusFailure) {
    throw new Error(keyStatusFailure);
  }

  validateIssuerReadinessEnvelopeFreshness(envelope, options);

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("issuer_readiness_envelope_signature_malformed");
  }

  const signingInput = issuerProductionReadinessSigningInput(envelope.report, {
    issuer: envelope.signature.issuer,
    keyId: envelope.signature.keyId,
    alg: envelope.signature.alg,
    ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {}),
    ...(envelope.signature.expiresAt ? { expiresAt: envelope.signature.expiresAt } : {})
  });
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("issuer_readiness_envelope_signature_invalid");
  }

  const readiness = validateIssuerProductionReadiness(envelope.report, options);
  if (!readiness.ok) {
    throw new Error(readiness.control
      ? `${readiness.reason}:${readiness.control}`
      : readiness.gapCode
        ? `${readiness.reason}:${readiness.gapCode}`
        : readiness.reason);
  }

  return envelope.report;
}

export function verifySignedIssuerReadinessTrustRootBundle(
  envelope: SignedAgentPortIssuerReadinessTrustRootBundle,
  options: IssuerReadinessTrustRootBundleEnvelopeVerificationOptions
): AgentPortIssuerReadinessTrustRootBundle {
  if (envelope.protocol !== "agentport-issuer-readiness-trust-root-bundle-envelope" || envelope.version !== "0.1") {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_alg_unsupported");
  }

  validateIssuerReadinessTrustRootBundleEnvelopeDenyList(envelope, options);

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_public_key_missing");
  }

  const keyStatusFailure = validateIssuerReadinessTrustRootBundleEnvelopeKeyStatus(
    options.keyStatuses?.[envelope.signature.keyId],
    options.now
  );
  if (keyStatusFailure) {
    throw new Error(keyStatusFailure);
  }

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_signature_malformed");
  }

  const signingInput = issuerReadinessTrustRootBundleSigningInput(envelope.bundle, {
    issuer: envelope.signature.issuer,
    keyId: envelope.signature.keyId,
    alg: envelope.signature.alg,
    ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {})
  });
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_signature_invalid");
  }

  return envelope.bundle;
}

export function verifySignedIssuerReadinessTrustRootEmergencyDenyList(
  envelope: SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList,
  options: IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions
): AgentPortIssuerReadinessTrustRootEmergencyDenyList {
  if (
    envelope.protocol !== "agentport-issuer-readiness-trust-root-emergency-denylist-envelope" ||
    envelope.version !== "0.1"
  ) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_envelope_alg_unsupported");
  }

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_envelope_public_key_missing");
  }

  const keyStatusFailure = validateIssuerReadinessTrustRootEmergencyDenyListEnvelopeKeyStatus(
    options.keyStatuses?.[envelope.signature.keyId],
    options.now
  );
  if (keyStatusFailure) {
    throw new Error(keyStatusFailure);
  }

  validateIssuerReadinessTrustRootEmergencyDenyListFreshness(envelope.denyList, options);

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_envelope_signature_malformed");
  }

  const signingInput = issuerReadinessTrustRootEmergencyDenyListSigningInput(envelope.denyList, {
    issuer: envelope.signature.issuer,
    keyId: envelope.signature.keyId,
    alg: envelope.signature.alg,
    ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {})
  });
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_envelope_signature_invalid");
  }

  return envelope.denyList;
}

export function gatewayTrustRootEmergencyDenyListToVerificationOptions(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList
): Pick<GatewayTrustRootBundleEnvelopeVerificationOptions, "blockedIssuers" | "blockedKeyIds" | "blockedBundleHashes"> {
  if (denyList.protocol !== "agentport-gateway-trust-root-emergency-denylist" || denyList.version !== "0.1") {
    throw new Error("receipt_trust_root_emergency_denylist_unsupported");
  }

  validateBundleHashList(
    denyList.blockedBundleHashes,
    "receipt_trust_root_emergency_denylist_blocked_hash_malformed"
  );
  return {
    blockedIssuers: denyList.blockedIssuers ?? [],
    blockedKeyIds: denyList.blockedKeyIds ?? [],
    blockedBundleHashes: denyList.blockedBundleHashes ?? []
  };
}

export function issuerReadinessTrustRootEmergencyDenyListToVerificationOptions(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList
): Pick<IssuerReadinessTrustRootBundleEnvelopeVerificationOptions, "blockedIssuers" | "blockedKeyIds" | "blockedBundleHashes"> {
  if (denyList.protocol !== "agentport-issuer-readiness-trust-root-emergency-denylist" || denyList.version !== "0.1") {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_unsupported");
  }

  validateBundleHashList(
    denyList.blockedBundleHashes,
    "issuer_readiness_trust_root_emergency_denylist_blocked_hash_malformed"
  );

  return {
    blockedIssuers: denyList.blockedIssuers ?? [],
    blockedKeyIds: denyList.blockedKeyIds ?? [],
    blockedBundleHashes: denyList.blockedBundleHashes ?? []
  };
}

export function gatewayTrustRootEmergencyDenyListChangeHash(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList
): string {
  return sha256Hex(stableJson(emergencyDenyListChangePayload(denyList)));
}

export function issuerReadinessTrustRootEmergencyDenyListChangeHash(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList
): string {
  return sha256Hex(stableJson(issuerReadinessTrustRootEmergencyDenyListChangePayload(denyList)));
}

export function recordGatewayTrustRootEmergencyDenyListApproval(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList,
  input: {
    approvalId: string;
    operatorId: string;
    approved: boolean;
    approvedAt: string;
    reason?: string;
  }
): GatewayTrustRootEmergencyDenyListApproval {
  if (input.approved !== true) {
    throw new Error("receipt_trust_root_emergency_denylist_approval_not_granted");
  }

  if (!input.approvalId.trim()) {
    throw new Error("receipt_trust_root_emergency_denylist_approval_id_required");
  }

  if (!input.operatorId.trim()) {
    throw new Error("receipt_trust_root_emergency_denylist_approval_operator_required");
  }

  if (!input.approvedAt.trim() || Number.isNaN(Date.parse(input.approvedAt))) {
    throw new Error("receipt_trust_root_emergency_denylist_approval_time_invalid");
  }

  return {
    approvalId: input.approvalId,
    operatorId: input.operatorId,
    approved: true,
    approvedAt: input.approvedAt,
    changeHash: gatewayTrustRootEmergencyDenyListChangeHash(denyList),
    ...(input.reason ? { reason: input.reason } : {})
  };
}

export function recordIssuerReadinessTrustRootEmergencyDenyListApproval(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList,
  input: {
    approvalId: string;
    operatorId: string;
    approved: boolean;
    approvedAt: string;
    reason?: string;
  }
): IssuerReadinessTrustRootEmergencyDenyListApproval {
  if (input.approved !== true) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_not_granted");
  }

  if (!input.approvalId.trim()) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_id_required");
  }

  if (!input.operatorId.trim()) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_operator_required");
  }

  if (!input.approvedAt.trim() || Number.isNaN(Date.parse(input.approvedAt))) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_time_invalid");
  }

  return {
    approvalId: input.approvalId,
    operatorId: input.operatorId,
    approved: true,
    approvedAt: input.approvedAt,
    changeHash: issuerReadinessTrustRootEmergencyDenyListChangeHash(denyList),
    ...(input.reason ? { reason: input.reason } : {})
  };
}

export function attachGatewayTrustRootEmergencyDenyListApproval(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList,
  approvals: GatewayTrustRootEmergencyDenyListApproval[],
  options: { minApprovals?: number; reason?: string } = {}
): AgentPortGatewayTrustRootEmergencyDenyList {
  const minApprovals = options.minApprovals ?? 1;
  if (!Number.isSafeInteger(minApprovals) || minApprovals <= 0) {
    throw new Error("receipt_trust_root_emergency_denylist_min_approvals_invalid");
  }

  if (approvals.length < minApprovals) {
    throw new Error("receipt_trust_root_emergency_denylist_approval_threshold_not_met");
  }

  const expectedChangeHash = gatewayTrustRootEmergencyDenyListChangeHash(denyList);
  const approvalIds = new Set<string>();
  const operators = new Set<string>();
  for (const approval of approvals) {
    if (approval.changeHash !== expectedChangeHash) {
      throw new Error("receipt_trust_root_emergency_denylist_approval_hash_mismatch");
    }

    if (approvalIds.has(approval.approvalId)) {
      throw new Error("receipt_trust_root_emergency_denylist_approval_duplicate");
    }
    approvalIds.add(approval.approvalId);

    if (operators.has(approval.operatorId)) {
      throw new Error("receipt_trust_root_emergency_denylist_approval_operator_duplicate");
    }
    operators.add(approval.operatorId);
  }

  return {
    ...denyList,
    approval: {
      changeHash: expectedChangeHash,
      approvalIds: [...approvalIds],
      approvedBy: [...operators],
      ...(options.reason ? { reason: options.reason } : {})
    }
  };
}

export function attachIssuerReadinessTrustRootEmergencyDenyListApproval(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList,
  approvals: IssuerReadinessTrustRootEmergencyDenyListApproval[],
  options: { minApprovals?: number; reason?: string } = {}
): AgentPortIssuerReadinessTrustRootEmergencyDenyList {
  const minApprovals = options.minApprovals ?? 1;
  if (!Number.isSafeInteger(minApprovals) || minApprovals <= 0) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_min_approvals_invalid");
  }

  if (approvals.length < minApprovals) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_threshold_not_met");
  }

  const expectedChangeHash = issuerReadinessTrustRootEmergencyDenyListChangeHash(denyList);
  const approvalIds = new Set<string>();
  const operators = new Set<string>();
  for (const approval of approvals) {
    if (approval.changeHash !== expectedChangeHash) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_hash_mismatch");
    }

    if (approvalIds.has(approval.approvalId)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_duplicate");
    }
    approvalIds.add(approval.approvalId);

    if (operators.has(approval.operatorId)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_approval_operator_duplicate");
    }
    operators.add(approval.operatorId);
  }

  return {
    ...denyList,
    approval: {
      changeHash: expectedChangeHash,
      approvalIds: [...approvalIds],
      approvedBy: [...operators],
      ...(options.reason ? { reason: options.reason } : {})
    }
  };
}

export function gatewayTrustRootEmergencyDenyListEnvelopeHash(
  envelope: SignedAgentPortGatewayTrustRootEmergencyDenyList
): string {
  return sha256Hex(stableJson(envelope));
}

export function issuerReadinessTrustRootEmergencyDenyListEnvelopeHash(
  envelope: SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList
): string {
  return sha256Hex(stableJson(envelope));
}

export function publishSignedGatewayTrustRootEmergencyDenyList(
  envelope: SignedAgentPortGatewayTrustRootEmergencyDenyList,
  verificationOptions: GatewayTrustRootEmergencyDenyListEnvelopeVerificationOptions,
  publicationOptions: GatewayTrustRootEmergencyDenyListPublicationOptions = {}
): GatewayTrustRootEmergencyDenyListPublicationResult {
  const denyList = verifySignedGatewayTrustRootEmergencyDenyList(envelope, verificationOptions);
  validateEmergencyDenyListPublicationPolicy(denyList, publicationOptions);

  const publishedAt = (publicationOptions.now?.() ?? new Date()).toISOString();
  return {
    denyList,
    record: {
      type: "agentport.gateway_trust_root_emergency_denylist_publication",
      publishedAt,
      envelopeHash: gatewayTrustRootEmergencyDenyListEnvelopeHash(envelope),
      ...(publicationOptions.currentEnvelopeHash ? { previousEnvelopeHash: publicationOptions.currentEnvelopeHash } : {}),
      ...(denyList.listId ? { listId: denyList.listId } : {}),
      ...(denyList.sequence !== undefined ? { sequence: denyList.sequence } : {}),
      signerIssuer: envelope.signature.issuer,
      signerKeyId: envelope.signature.keyId,
      ...(denyList.approval?.changeHash ? { approvalChangeHash: denyList.approval.changeHash } : {}),
      ...(denyList.approval?.approvalIds ? { approvalIds: [...denyList.approval.approvalIds] } : {}),
      ...(denyList.approval?.approvedBy ? { approvedBy: [...denyList.approval.approvedBy] } : {})
    }
  };
}

export function publishSignedIssuerReadinessTrustRootEmergencyDenyList(
  envelope: SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList,
  verificationOptions: IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions,
  publicationOptions: IssuerReadinessTrustRootEmergencyDenyListPublicationOptions = {}
): IssuerReadinessTrustRootEmergencyDenyListPublicationResult {
  const denyList = verifySignedIssuerReadinessTrustRootEmergencyDenyList(envelope, verificationOptions);
  validateIssuerReadinessTrustRootEmergencyDenyListPublicationPolicy(denyList, publicationOptions);

  const publishedAt = (publicationOptions.now?.() ?? new Date()).toISOString();
  return {
    denyList,
    record: {
      type: "agentport.issuer_readiness_trust_root_emergency_denylist_publication",
      publishedAt,
      envelopeHash: issuerReadinessTrustRootEmergencyDenyListEnvelopeHash(envelope),
      ...(publicationOptions.currentEnvelopeHash ? { previousEnvelopeHash: publicationOptions.currentEnvelopeHash } : {}),
      ...(denyList.listId ? { listId: denyList.listId } : {}),
      ...(denyList.sequence !== undefined ? { sequence: denyList.sequence } : {}),
      signerIssuer: envelope.signature.issuer,
      signerKeyId: envelope.signature.keyId,
      ...(denyList.approval?.changeHash ? { approvalChangeHash: denyList.approval.changeHash } : {}),
      ...(denyList.approval?.approvalIds ? { approvalIds: [...denyList.approval.approvalIds] } : {}),
      ...(denyList.approval?.approvedBy ? { approvedBy: [...denyList.approval.approvedBy] } : {})
    }
  };
}

export const DEFAULT_ISSUER_PRODUCTION_READINESS_CONTROLS: IssuerProductionReadinessControl[] = [
  "approval_authorization",
  "passkey_approval_challenge",
  "passkey_registration",
  "passkey_credential_management",
  "revocation_authorization",
  "rate_limit",
  "audit_sink",
  "security_headers",
  "json_content_type",
  "request_body_limit",
  "origin_policy",
  "token_confirmation_policy",
  "replay_handle_required",
  "bounded_token_ttl",
  "minimum_approval_assurance",
  "passkey_assertion_verification",
  "signer_key_custody",
  "durable_issuer_store",
  "durable_replay_store",
  "audit_retention",
  "monitoring"
];

export function validateIssuerProductionReadiness(
  report: IssuerProductionReadinessReportLike | null | undefined,
  options: IssuerProductionReadinessValidationOptions = {}
): IssuerProductionReadinessValidationResult {
  if (!report) {
    return { ok: false, reason: "issuer_readiness_missing" };
  }

  if (report.profile !== "agentport-issuer-production-readiness-v0.1") {
    return { ok: false, reason: "issuer_readiness_profile_unsupported" };
  }

  if (!report.issuer || typeof report.issuer !== "string") {
    return { ok: false, reason: "issuer_readiness_issuer_missing" };
  }

  if (options.expectedIssuer !== undefined && report.issuer !== options.expectedIssuer) {
    return { ok: false, reason: "issuer_readiness_issuer_mismatch" };
  }

  if (report.ready !== true) {
    return { ok: false, reason: "issuer_readiness_not_ready" };
  }

  const firstGap = report.gaps?.[0];
  if (firstGap) {
    return {
      ok: false,
      reason: "issuer_readiness_gap_present",
      gapCode: firstGap.code
    };
  }

  for (const control of options.requiredControls ?? DEFAULT_ISSUER_PRODUCTION_READINESS_CONTROLS) {
    if (report.controls?.[control] !== true) {
      return {
        ok: false,
        reason: "issuer_readiness_control_missing",
        control
      };
    }
  }

  return {
    ok: true,
    issuer: report.issuer,
    profile: "agentport-issuer-production-readiness-v0.1"
  };
}

export function assertIssuerProductionReady(
  report: IssuerProductionReadinessReportLike | null | undefined,
  options: IssuerProductionReadinessValidationOptions = {}
): Extract<IssuerProductionReadinessValidationResult, { ok: true }> {
  const result = validateIssuerProductionReadiness(report, options);
  if (!result.ok) {
    throw new Error(result.control ? `${result.reason}:${result.control}` : result.gapCode ? `${result.reason}:${result.gapCode}` : result.reason);
  }

  return result;
}

export function issuerReadinessVerificationOptionsFromTrustRootBundle(
  bundle: AgentPortIssuerReadinessTrustRootBundle,
  options: IssuerReadinessTrustRootBundleOptions
): Pick<IssuerProductionReadinessEnvelopeVerificationOptions, "trustedIssuers" | "publicKeys" | "keyStatuses"> {
  if (bundle.protocol !== "agentport-issuer-readiness-trust-root-bundle" || bundle.version !== "0.1") {
    throw new Error("issuer_readiness_trust_root_bundle_unsupported");
  }

  validateIssuerReadinessTrustRootBundleHashPin(bundle, options);
  validateIssuerReadinessTrustRootBundleDenyList(bundle, options);

  if (!options.trustedIssuers.length) {
    throw new Error("issuer_readiness_trust_root_bundle_issuer_untrusted");
  }

  validateIssuerReadinessTrustRootBundleFreshness(bundle, options);

  const publicKeys: Record<string, PublicKeyMaterial> = {};
  const keyStatuses: Record<string, ActionReceiptTrustKeyStatus> = {};
  const seenIssuers = new Set<string>();
  for (const authority of bundle.authorities) {
    if (!options.trustedIssuers.includes(authority.issuer)) {
      throw new Error("issuer_readiness_trust_root_bundle_issuer_untrusted");
    }

    if (!authority.publicKeys.length) {
      throw new Error("issuer_readiness_trust_root_bundle_key_missing");
    }

    seenIssuers.add(authority.issuer);
    for (const key of authority.publicKeys) {
      if (key.alg !== "EdDSA") {
        throw new Error("issuer_readiness_trust_root_bundle_key_alg_unsupported");
      }

      if (key.use !== "sig") {
        throw new Error("issuer_readiness_trust_root_bundle_key_use_unsupported");
      }

      const keyStatusFailure = validateIssuerReadinessTrustRootKeyStatus(key, options.now);
      if (keyStatusFailure) {
        throw new Error(keyStatusFailure);
      }

      if (publicKeys[key.kid]) {
        throw new Error("issuer_readiness_trust_root_bundle_key_duplicate");
      }

      publicKeys[key.kid] = key.jwk;
      keyStatuses[key.kid] = {
        ...(key.status ? { status: key.status } : {}),
        ...(key.notBefore ? { notBefore: key.notBefore } : {}),
        ...(key.expiresAt ? { expiresAt: key.expiresAt } : {})
      };
    }
  }

  for (const issuer of options.trustedIssuers) {
    if (!seenIssuers.has(issuer)) {
      throw new Error("issuer_readiness_trust_root_bundle_key_missing");
    }
  }

  if (Object.keys(publicKeys).length === 0) {
    throw new Error("issuer_readiness_trust_root_bundle_key_missing");
  }

  return {
    trustedIssuers: options.trustedIssuers,
    publicKeys,
    keyStatuses
  };
}

export function issuerReadinessTrustRootBundleHash(bundle: AgentPortIssuerReadinessTrustRootBundle): string {
  return sha256Hex(stableJson(bundle));
}

export function issuerReadinessTrustRootPublication(
  bundle: AgentPortIssuerReadinessTrustRootBundle
): AgentPortIssuerReadinessTrustRootPublication {
  return {
    protocol: "agentport-issuer-readiness-trust-root-publication",
    version: "0.1",
    bundleHash: issuerReadinessTrustRootBundleHash(bundle),
    bundle
  };
}

export function gatewayTrustProfileVerificationOptionsFromTrustRootBundle(
  bundle: AgentPortGatewayTrustRootBundle,
  options: GatewayTrustRootBundleOptions
): GatewayTrustProfileVerificationOptions {
  if (bundle.protocol !== "agentport-gateway-trust-root-bundle" || bundle.version !== "0.1") {
    throw new Error("receipt_trust_root_bundle_unsupported");
  }

  validateTrustRootBundleDenyList(bundle, options);
  validateTrustRootBundleHashPin(bundle, options);

  if (!options.trustedIssuers.length) {
    throw new Error("receipt_trust_root_bundle_issuer_untrusted");
  }

  validateTrustRootBundleFreshness(bundle, options);

  const publicKeys: Record<string, PublicKeyMaterial> = {};
  const seenIssuers = new Set<string>();
  for (const authority of bundle.authorities) {
    if (!options.trustedIssuers.includes(authority.issuer)) {
      throw new Error("receipt_trust_root_bundle_issuer_untrusted");
    }

    if (!authority.publicKeys.length) {
      throw new Error("receipt_trust_root_bundle_key_missing");
    }

    seenIssuers.add(authority.issuer);
    for (const key of authority.publicKeys) {
      if (key.alg !== "EdDSA") {
        throw new Error("receipt_trust_root_bundle_key_alg_unsupported");
      }

      if (key.use !== "sig") {
        throw new Error("receipt_trust_root_bundle_key_use_unsupported");
      }

      const keyStatusFailure = validateTrustRootKeyStatus(key, options.now);
      if (keyStatusFailure) {
        throw new Error(keyStatusFailure);
      }

      if (publicKeys[key.kid]) {
        throw new Error("receipt_trust_root_bundle_key_duplicate");
      }

      publicKeys[key.kid] = key.jwk;
    }
  }

  for (const issuer of options.trustedIssuers) {
    if (!seenIssuers.has(issuer)) {
      throw new Error("receipt_trust_root_bundle_key_missing");
    }
  }

  if (Object.keys(publicKeys).length === 0) {
    throw new Error("receipt_trust_root_bundle_key_missing");
  }

  return {
    trustedIssuers: options.trustedIssuers,
    publicKeys
  };
}

export function gatewayTrustRootBundleHash(bundle: AgentPortGatewayTrustRootBundle): string {
  return sha256Hex(stableJson(bundle));
}

function validateTrustRootBundleEnvelopeDenyList(
  envelope: SignedAgentPortGatewayTrustRootBundle,
  options: GatewayTrustRootBundleEnvelopeVerificationOptions
): void {
  if (options.blockedIssuers?.includes(envelope.signature.issuer)) {
    throw new Error("receipt_trust_root_bundle_envelope_issuer_blocked");
  }

  if (options.blockedKeyIds?.includes(envelope.signature.keyId)) {
    throw new Error("receipt_trust_root_bundle_envelope_key_blocked");
  }

  validateBundleHashList(
    options.blockedBundleHashes,
    "receipt_trust_root_bundle_envelope_blocked_hash_malformed"
  );
  if (options.blockedBundleHashes?.includes(gatewayTrustRootBundleHash(envelope.bundle))) {
    throw new Error("receipt_trust_root_bundle_envelope_bundle_blocked");
  }
}

function validateTrustRootBundleDenyList(
  bundle: AgentPortGatewayTrustRootBundle,
  options: GatewayTrustRootBundleOptions
): void {
  validateBundleHashList(options.blockedBundleHashes, "receipt_trust_root_bundle_blocked_hash_malformed");
  if (options.blockedBundleHashes?.includes(gatewayTrustRootBundleHash(bundle))) {
    throw new Error("receipt_trust_root_bundle_blocked");
  }
}

function validateTrustRootBundleHashPin(
  bundle: AgentPortGatewayTrustRootBundle,
  options: GatewayTrustRootBundleOptions
): void {
  const pins = [
    ...(options.expectedBundleHash ? [options.expectedBundleHash] : []),
    ...(options.trustedBundleHashes ?? [])
  ];
  if (!pins.length) {
    return;
  }

  validateBundleHashList(pins, "receipt_trust_root_bundle_hash_malformed");

  const actual = gatewayTrustRootBundleHash(bundle);
  if (!pins.includes(actual)) {
    throw new Error("receipt_trust_root_bundle_hash_mismatch");
  }
}

function validateIssuerReadinessTrustRootBundleHashPin(
  bundle: AgentPortIssuerReadinessTrustRootBundle,
  options: Pick<IssuerReadinessTrustRootBundleOptions, "expectedBundleHash" | "trustedBundleHashes">
): void {
  const pins = [
    ...(options.expectedBundleHash ? [options.expectedBundleHash] : []),
    ...(options.trustedBundleHashes ?? [])
  ];
  if (!pins.length) {
    return;
  }

  validateBundleHashList(pins, "issuer_readiness_trust_root_bundle_hash_malformed");

  const actual = issuerReadinessTrustRootBundleHash(bundle);
  if (!pins.includes(actual)) {
    throw new Error("issuer_readiness_trust_root_bundle_hash_mismatch");
  }
}

function validateIssuerReadinessTrustRootBundleEnvelopeDenyList(
  envelope: SignedAgentPortIssuerReadinessTrustRootBundle,
  options: IssuerReadinessTrustRootBundleEnvelopeVerificationOptions
): void {
  if (options.blockedIssuers?.includes(envelope.signature.issuer)) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_issuer_blocked");
  }

  if (options.blockedKeyIds?.includes(envelope.signature.keyId)) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_key_blocked");
  }

  validateBundleHashList(
    options.blockedBundleHashes,
    "issuer_readiness_trust_root_bundle_envelope_blocked_hash_malformed"
  );
  if (options.blockedBundleHashes?.includes(issuerReadinessTrustRootBundleHash(envelope.bundle))) {
    throw new Error("issuer_readiness_trust_root_bundle_envelope_bundle_blocked");
  }
}

function validateIssuerReadinessTrustRootBundleDenyList(
  bundle: AgentPortIssuerReadinessTrustRootBundle,
  options: Pick<IssuerReadinessTrustRootBundleOptions, "blockedBundleHashes">
): void {
  validateBundleHashList(options.blockedBundleHashes, "issuer_readiness_trust_root_bundle_blocked_hash_malformed");
  if (options.blockedBundleHashes?.includes(issuerReadinessTrustRootBundleHash(bundle))) {
    throw new Error("issuer_readiness_trust_root_bundle_blocked");
  }
}

function validateBundleHashList(hashes: string[] | undefined, errorCode: string): void {
  for (const hash of hashes ?? []) {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(errorCode);
    }
  }
}

function validateIssuerReadinessTrustRootBundleFreshness(
  bundle: AgentPortIssuerReadinessTrustRootBundle,
  options: IssuerReadinessTrustRootBundleOptions
): void {
  if (bundle.sequence !== undefined && (!Number.isSafeInteger(bundle.sequence) || bundle.sequence < 0)) {
    throw new Error("issuer_readiness_trust_root_bundle_sequence_invalid");
  }

  if (
    options.minimumBundleSequence !== undefined &&
    (!Number.isSafeInteger(options.minimumBundleSequence) || options.minimumBundleSequence < 0)
  ) {
    throw new Error("issuer_readiness_trust_root_bundle_min_sequence_invalid");
  }

  if (options.minimumBundleSequence !== undefined) {
    if (bundle.sequence === undefined) {
      throw new Error("issuer_readiness_trust_root_bundle_sequence_missing");
    }

    if (bundle.sequence < options.minimumBundleSequence) {
      throw new Error("issuer_readiness_trust_root_bundle_sequence_rollback");
    }
  }

  if (options.requireFreshBundle && !bundle.expiresAt) {
    throw new Error("issuer_readiness_trust_root_bundle_expiry_missing");
  }

  const now = (options.now?.() ?? new Date()).getTime();
  if (bundle.issuedAt) {
    const issuedAt = Date.parse(bundle.issuedAt);
    if (!Number.isFinite(issuedAt)) {
      throw new Error("issuer_readiness_trust_root_bundle_time_invalid");
    }

    if (issuedAt > now) {
      throw new Error("issuer_readiness_trust_root_bundle_not_active");
    }
  }

  if (bundle.notBefore) {
    const notBefore = Date.parse(bundle.notBefore);
    if (!Number.isFinite(notBefore)) {
      throw new Error("issuer_readiness_trust_root_bundle_time_invalid");
    }

    if (now < notBefore) {
      throw new Error("issuer_readiness_trust_root_bundle_not_active");
    }
  }

  if (bundle.expiresAt) {
    const expiresAt = Date.parse(bundle.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error("issuer_readiness_trust_root_bundle_time_invalid");
    }

    if (now >= expiresAt) {
      throw new Error("issuer_readiness_trust_root_bundle_expired");
    }
  }
}

function validateTrustRootBundleFreshness(
  bundle: AgentPortGatewayTrustRootBundle,
  options: GatewayTrustRootBundleOptions
): void {
  if (bundle.sequence !== undefined && (!Number.isSafeInteger(bundle.sequence) || bundle.sequence < 0)) {
    throw new Error("receipt_trust_root_bundle_sequence_invalid");
  }

  if (
    options.minimumBundleSequence !== undefined &&
    (!Number.isSafeInteger(options.minimumBundleSequence) || options.minimumBundleSequence < 0)
  ) {
    throw new Error("receipt_trust_root_bundle_min_sequence_invalid");
  }

  if (options.minimumBundleSequence !== undefined) {
    if (bundle.sequence === undefined) {
      throw new Error("receipt_trust_root_bundle_sequence_missing");
    }

    if (bundle.sequence < options.minimumBundleSequence) {
      throw new Error("receipt_trust_root_bundle_sequence_rollback");
    }
  }

  if (options.requireFreshBundle && !bundle.expiresAt) {
    throw new Error("receipt_trust_root_bundle_expiry_missing");
  }

  const now = (options.now?.() ?? new Date()).getTime();
  if (bundle.issuedAt) {
    const issuedAt = Date.parse(bundle.issuedAt);
    if (!Number.isFinite(issuedAt)) {
      throw new Error("receipt_trust_root_bundle_time_invalid");
    }

    if (issuedAt > now) {
      throw new Error("receipt_trust_root_bundle_not_active");
    }
  }

  if (bundle.notBefore) {
    const notBefore = Date.parse(bundle.notBefore);
    if (!Number.isFinite(notBefore)) {
      throw new Error("receipt_trust_root_bundle_time_invalid");
    }

    if (now < notBefore) {
      throw new Error("receipt_trust_root_bundle_not_active");
    }
  }

  if (bundle.expiresAt) {
    const expiresAt = Date.parse(bundle.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error("receipt_trust_root_bundle_time_invalid");
    }

    if (now >= expiresAt) {
      throw new Error("receipt_trust_root_bundle_expired");
    }
  }
}

function validateEmergencyDenyListFreshness(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList,
  options: GatewayTrustRootEmergencyDenyListEnvelopeVerificationOptions
): void {
  if (denyList.protocol !== "agentport-gateway-trust-root-emergency-denylist" || denyList.version !== "0.1") {
    throw new Error("receipt_trust_root_emergency_denylist_unsupported");
  }

  validateBundleHashList(
    denyList.blockedBundleHashes,
    "receipt_trust_root_emergency_denylist_blocked_hash_malformed"
  );

  if (denyList.sequence !== undefined && (!Number.isSafeInteger(denyList.sequence) || denyList.sequence < 0)) {
    throw new Error("receipt_trust_root_emergency_denylist_sequence_invalid");
  }

  if (
    options.minimumDenyListSequence !== undefined &&
    (!Number.isSafeInteger(options.minimumDenyListSequence) || options.minimumDenyListSequence < 0)
  ) {
    throw new Error("receipt_trust_root_emergency_denylist_min_sequence_invalid");
  }

  if (options.minimumDenyListSequence !== undefined) {
    if (denyList.sequence === undefined) {
      throw new Error("receipt_trust_root_emergency_denylist_sequence_missing");
    }

    if (denyList.sequence < options.minimumDenyListSequence) {
      throw new Error("receipt_trust_root_emergency_denylist_sequence_rollback");
    }
  }

  if (options.requireFreshDenyList && !denyList.expiresAt) {
    throw new Error("receipt_trust_root_emergency_denylist_expiry_missing");
  }

  const now = (options.now?.() ?? new Date()).getTime();
  if (denyList.issuedAt) {
    const issuedAt = Date.parse(denyList.issuedAt);
    if (!Number.isFinite(issuedAt)) {
      throw new Error("receipt_trust_root_emergency_denylist_time_invalid");
    }

    if (issuedAt > now) {
      throw new Error("receipt_trust_root_emergency_denylist_not_active");
    }
  }

  if (denyList.notBefore) {
    const notBefore = Date.parse(denyList.notBefore);
    if (!Number.isFinite(notBefore)) {
      throw new Error("receipt_trust_root_emergency_denylist_time_invalid");
    }

    if (now < notBefore) {
      throw new Error("receipt_trust_root_emergency_denylist_not_active");
    }
  }

  if (denyList.expiresAt) {
    const expiresAt = Date.parse(denyList.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error("receipt_trust_root_emergency_denylist_time_invalid");
    }

    if (now >= expiresAt) {
      throw new Error("receipt_trust_root_emergency_denylist_expired");
    }
  }
}

function validateIssuerReadinessTrustRootEmergencyDenyListFreshness(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList,
  options: IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions
): void {
  if (denyList.protocol !== "agentport-issuer-readiness-trust-root-emergency-denylist" || denyList.version !== "0.1") {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_unsupported");
  }

  validateBundleHashList(
    denyList.blockedBundleHashes,
    "issuer_readiness_trust_root_emergency_denylist_blocked_hash_malformed"
  );

  if (denyList.sequence !== undefined && (!Number.isSafeInteger(denyList.sequence) || denyList.sequence < 0)) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_sequence_invalid");
  }

  if (
    options.minimumDenyListSequence !== undefined &&
    (!Number.isSafeInteger(options.minimumDenyListSequence) || options.minimumDenyListSequence < 0)
  ) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_min_sequence_invalid");
  }

  if (options.minimumDenyListSequence !== undefined) {
    if (denyList.sequence === undefined) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_sequence_missing");
    }

    if (denyList.sequence < options.minimumDenyListSequence) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_sequence_rollback");
    }
  }

  if (options.requireFreshDenyList && !denyList.expiresAt) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_expiry_missing");
  }

  const now = (options.now?.() ?? new Date()).getTime();
  if (denyList.issuedAt) {
    const issuedAt = Date.parse(denyList.issuedAt);
    if (!Number.isFinite(issuedAt)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_time_invalid");
    }

    if (issuedAt > now) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_not_active");
    }
  }

  if (denyList.notBefore) {
    const notBefore = Date.parse(denyList.notBefore);
    if (!Number.isFinite(notBefore)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_time_invalid");
    }

    if (now < notBefore) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_not_active");
    }
  }

  if (denyList.expiresAt) {
    const expiresAt = Date.parse(denyList.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_time_invalid");
    }

    if (now >= expiresAt) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_expired");
    }
  }
}

function validateIssuerReadinessEnvelopeFreshness(
  envelope: SignedIssuerProductionReadinessReport,
  options: Pick<IssuerProductionReadinessEnvelopeVerificationOptions, "now" | "requireFreshReadiness">
): void {
  if (options.requireFreshReadiness && !envelope.signature.expiresAt) {
    throw new Error("issuer_readiness_envelope_expiry_missing");
  }

  const now = (options.now?.() ?? new Date()).getTime();
  if (envelope.signature.signedAt) {
    const signedAt = Date.parse(envelope.signature.signedAt);
    if (!Number.isFinite(signedAt)) {
      throw new Error("issuer_readiness_envelope_time_invalid");
    }

    if (signedAt > now) {
      throw new Error("issuer_readiness_envelope_not_active");
    }
  }

  if (envelope.signature.expiresAt) {
    const expiresAt = Date.parse(envelope.signature.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error("issuer_readiness_envelope_time_invalid");
    }

    if (now >= expiresAt) {
      throw new Error("issuer_readiness_envelope_expired");
    }
  }
}

function emergencyDenyListChangePayload(denyList: AgentPortGatewayTrustRootEmergencyDenyList): Record<string, unknown> {
  const {
    approval: _approval,
    ...payload
  } = denyList;
  return payload;
}

function issuerReadinessTrustRootEmergencyDenyListChangePayload(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList
): Record<string, unknown> {
  const {
    approval: _approval,
    ...payload
  } = denyList;
  return payload;
}

function validateEmergencyDenyListPublicationPolicy(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList,
  options: GatewayTrustRootEmergencyDenyListPublicationOptions
): void {
  if (
    options.currentSequence !== undefined &&
    (!Number.isSafeInteger(options.currentSequence) || options.currentSequence < 0)
  ) {
    throw new Error("receipt_trust_root_emergency_denylist_publication_current_sequence_invalid");
  }

  if (options.currentEnvelopeHash !== undefined) {
    validateSha256Hex(
      options.currentEnvelopeHash,
      "receipt_trust_root_emergency_denylist_publication_current_hash_malformed"
    );
  }

  if (options.expectedCurrentEnvelopeHash !== undefined) {
    if (options.expectedCurrentEnvelopeHash !== null) {
      validateSha256Hex(
        options.expectedCurrentEnvelopeHash,
        "receipt_trust_root_emergency_denylist_publication_expected_current_hash_malformed"
      );
    }

    if (options.expectedCurrentEnvelopeHash === null) {
      if (options.currentEnvelopeHash !== undefined) {
        throw new Error("receipt_trust_root_emergency_denylist_publication_current_exists");
      }
    } else {
      if (options.currentEnvelopeHash === undefined) {
        throw new Error("receipt_trust_root_emergency_denylist_publication_current_missing");
      }

      if (options.currentEnvelopeHash !== options.expectedCurrentEnvelopeHash) {
        throw new Error("receipt_trust_root_emergency_denylist_publication_current_hash_mismatch");
      }
    }
  }

  if (options.requireSequence && denyList.sequence === undefined) {
    throw new Error("receipt_trust_root_emergency_denylist_publication_sequence_missing");
  }

  if (options.currentSequence !== undefined) {
    if (denyList.sequence === undefined) {
      throw new Error("receipt_trust_root_emergency_denylist_publication_sequence_missing");
    }

    if (denyList.sequence < options.currentSequence) {
      throw new Error("receipt_trust_root_emergency_denylist_publication_sequence_rollback");
    }
  }

  const minApprovals = options.minApprovals ?? (options.requireApproval ? 1 : undefined);
  if (minApprovals !== undefined && (!Number.isSafeInteger(minApprovals) || minApprovals <= 0)) {
    throw new Error("receipt_trust_root_emergency_denylist_publication_min_approvals_invalid");
  }

  if (options.requireApproval && !denyList.approval) {
    throw new Error("receipt_trust_root_emergency_denylist_publication_approval_missing");
  }

  if (!denyList.approval) {
    return;
  }

  if (denyList.approval.changeHash !== gatewayTrustRootEmergencyDenyListChangeHash(denyList)) {
    throw new Error("receipt_trust_root_emergency_denylist_publication_approval_hash_mismatch");
  }

  const approvalIds = new Set<string>();
  for (const approvalId of denyList.approval.approvalIds) {
    if (approvalIds.has(approvalId)) {
      throw new Error("receipt_trust_root_emergency_denylist_publication_approval_duplicate");
    }
    approvalIds.add(approvalId);
  }

  const operators = new Set<string>();
  for (const operatorId of denyList.approval.approvedBy) {
    if (operators.has(operatorId)) {
      throw new Error("receipt_trust_root_emergency_denylist_publication_approval_operator_duplicate");
    }
    operators.add(operatorId);
  }

  if (minApprovals !== undefined && denyList.approval.approvalIds.length < minApprovals) {
    throw new Error("receipt_trust_root_emergency_denylist_publication_approval_threshold_not_met");
  }
}

function validateIssuerReadinessTrustRootEmergencyDenyListPublicationPolicy(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList,
  options: IssuerReadinessTrustRootEmergencyDenyListPublicationOptions
): void {
  if (
    options.currentSequence !== undefined &&
    (!Number.isSafeInteger(options.currentSequence) || options.currentSequence < 0)
  ) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_current_sequence_invalid");
  }

  if (options.currentEnvelopeHash !== undefined) {
    validateSha256Hex(
      options.currentEnvelopeHash,
      "issuer_readiness_trust_root_emergency_denylist_publication_current_hash_malformed"
    );
  }

  if (options.expectedCurrentEnvelopeHash !== undefined) {
    if (options.expectedCurrentEnvelopeHash !== null) {
      validateSha256Hex(
        options.expectedCurrentEnvelopeHash,
        "issuer_readiness_trust_root_emergency_denylist_publication_expected_current_hash_malformed"
      );
    }

    if (options.expectedCurrentEnvelopeHash === null) {
      if (options.currentEnvelopeHash !== undefined) {
        throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_current_exists");
      }
    } else {
      if (options.currentEnvelopeHash === undefined) {
        throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_current_missing");
      }

      if (options.currentEnvelopeHash !== options.expectedCurrentEnvelopeHash) {
        throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_current_hash_mismatch");
      }
    }
  }

  if (options.requireSequence && denyList.sequence === undefined) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_sequence_missing");
  }

  if (options.currentSequence !== undefined) {
    if (denyList.sequence === undefined) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_sequence_missing");
    }

    if (denyList.sequence < options.currentSequence) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_sequence_rollback");
    }
  }

  const minApprovals = options.minApprovals ?? (options.requireApproval ? 1 : undefined);
  if (minApprovals !== undefined && (!Number.isSafeInteger(minApprovals) || minApprovals <= 0)) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_min_approvals_invalid");
  }

  if (options.requireApproval && !denyList.approval) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_approval_missing");
  }

  if (!denyList.approval) {
    return;
  }

  if (denyList.approval.changeHash !== issuerReadinessTrustRootEmergencyDenyListChangeHash(denyList)) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_approval_hash_mismatch");
  }

  const approvalIds = new Set<string>();
  for (const approvalId of denyList.approval.approvalIds) {
    if (approvalIds.has(approvalId)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_approval_duplicate");
    }
    approvalIds.add(approvalId);
  }

  const operators = new Set<string>();
  for (const operatorId of denyList.approval.approvedBy) {
    if (operators.has(operatorId)) {
      throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_approval_operator_duplicate");
    }
    operators.add(operatorId);
  }

  if (minApprovals !== undefined && denyList.approval.approvalIds.length < minApprovals) {
    throw new Error("issuer_readiness_trust_root_emergency_denylist_publication_approval_threshold_not_met");
  }
}

function validateSha256Hex(value: string, errorCode: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(errorCode);
  }
}

export function gatewayTrustProfileSigningInput(
  profile: ActionReceiptGatewayTrustProfile,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-gateway-trust-profile-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(profile)}`;
}

export function gatewayTrustRootBundleSigningInput(
  bundle: AgentPortGatewayTrustRootBundle,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-gateway-trust-root-bundle-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(bundle)}`;
}

export function issuerReadinessTrustRootBundleSigningInput(
  bundle: AgentPortIssuerReadinessTrustRootBundle,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-issuer-readiness-trust-root-bundle-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(bundle)}`;
}

export function gatewayTrustRootEmergencyDenyListSigningInput(
  denyList: AgentPortGatewayTrustRootEmergencyDenyList,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-gateway-trust-root-emergency-denylist-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(denyList)}`;
}

export function issuerReadinessTrustRootEmergencyDenyListSigningInput(
  denyList: AgentPortIssuerReadinessTrustRootEmergencyDenyList,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-issuer-readiness-trust-root-emergency-denylist-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(denyList)}`;
}

export function issuerProductionReadinessSigningInput(
  report: IssuerProductionReadinessReportLike,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string; expiresAt?: string }
): string {
  return `agentport-issuer-production-readiness-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(report)}`;
}

export function actionReceiptSignatureExpectationsFromTrustProfile(
  profile: ActionReceiptGatewayTrustProfile,
  options: { now?: () => Date } = {}
): ActionReceiptSignatureExpectations {
  if (profile.protocol !== "agentport-gateway-trust-profile" || profile.version !== "0.1") {
    throw new Error("receipt_trust_profile_unsupported");
  }

  if (profile.receipt.algorithm !== "EdDSA") {
    throw new Error("receipt_trust_profile_algorithm_unsupported");
  }

  return {
    requireSignature: profile.receipt.requireSignature,
    trustedIssuers: [profile.gatewayIssuer],
    publicKeys: Object.fromEntries(profile.receipt.publicKeys.map((key) => [key.kid, key.jwk])),
    keyStatuses: Object.fromEntries(profile.receipt.publicKeys.map((key) => [
      key.kid,
      {
        status: key.status,
        notBefore: key.notBefore,
        expiresAt: key.expiresAt
      }
    ])),
    now: options.now
  };
}

const expectedGatewayReceiptTrustOrder: DiscoveryTrustDistributionPlan["gatewayReceiptTrust"]["order"] = [
  "apply_gateway_trust_root_emergency_denylist",
  "verify_gateway_trust_root_bundle",
  "verify_signed_gateway_trust_profile",
  "verify_gateway_action_receipt"
];

const expectedIssuerReadinessTrustOrder: DiscoveryTrustDistributionPlan["issuerReadinessTrust"]["order"] = [
  "apply_issuer_readiness_root_emergency_denylist",
  "verify_issuer_readiness_trust_root_bundle",
  "verify_signed_issuer_readiness",
  "validate_issuer_readiness_report"
];

export function validateDiscoveryTrustDistribution(
  discovery: unknown,
  options: DiscoveryTrustDistributionValidationOptions = {}
): DiscoveryTrustDistributionValidationResult {
  const descriptor = asRecord(discovery);
  if (!descriptor) {
    return { ok: false, reason: "discovery_missing" };
  }

  if (descriptor.protocol !== "agentport-discovery") {
    return { ok: false, reason: "discovery_protocol_unsupported", field: "protocol" };
  }

  if (descriptor.version !== "0.1") {
    return { ok: false, reason: "discovery_version_unsupported", field: "version" };
  }

  if (descriptor.resourceUri !== "agentport://discovery") {
    return { ok: false, reason: "discovery_resource_uri_unsupported", field: "resourceUri" };
  }

  const trustDistribution = asRecord(descriptor.trustDistribution);
  if (!trustDistribution) {
    return { ok: false, reason: "discovery_trust_distribution_missing", field: "trustDistribution" };
  }

  if (trustDistribution.descriptorIsTrust !== false) {
    return {
      ok: false,
      reason: "discovery_trust_distribution_is_trust",
      field: "trustDistribution.descriptorIsTrust"
    };
  }

  if (trustDistribution.productionTransport !== "https-required") {
    return {
      ok: false,
      reason: "discovery_trust_distribution_transport_unsupported",
      field: "trustDistribution.productionTransport"
    };
  }

  const gatewayTrust = asRecord(trustDistribution.gatewayReceiptTrust);
  if (!gatewayTrust || gatewayTrust.domain !== "gateway_receipt_trust") {
    return {
      ok: false,
      reason: "discovery_gateway_trust_domain_mismatch",
      field: "trustDistribution.gatewayReceiptTrust.domain"
    };
  }

  if (!stringArrayEquals(gatewayTrust.order, expectedGatewayReceiptTrustOrder)) {
    return {
      ok: false,
      reason: "discovery_gateway_trust_order_mismatch",
      field: "trustDistribution.gatewayReceiptTrust.order"
    };
  }

  const gatewayArtifacts = asRecord(gatewayTrust.artifacts);
  const gatewayEmergencyDenyList = asRecord(gatewayArtifacts?.emergencyDenyList);
  const gatewayTrustRootBundle = asRecord(gatewayArtifacts?.trustRootBundle);
  const signedTrustProfile = asRecord(gatewayArtifacts?.signedTrustProfile);
  const receipt = asRecord(gatewayArtifacts?.receipt);
  if (!gatewayArtifacts || !gatewayEmergencyDenyList || !gatewayTrustRootBundle || !signedTrustProfile || !receipt) {
    return {
      ok: false,
      reason: "discovery_gateway_trust_artifact_missing",
      field: "trustDistribution.gatewayReceiptTrust.artifacts"
    };
  }

  if (
    gatewayEmergencyDenyList.protocol !== "agentport-gateway-trust-root-emergency-denylist-envelope" ||
    gatewayTrustRootBundle.protocol !== "agentport-gateway-trust-root-bundle-envelope" ||
    signedTrustProfile.protocol !== "agentport-gateway-trust-profile-envelope"
  ) {
    return {
      ok: false,
      reason: "discovery_gateway_trust_protocol_mismatch",
      field: "trustDistribution.gatewayReceiptTrust.artifacts"
    };
  }

  const gatewayEmergencyEndpoint = stringValue(gatewayEmergencyDenyList.hostedEndpoint);
  if (gatewayEmergencyEndpoint && !isAcceptedHostedEndpoint(gatewayEmergencyEndpoint, options)) {
    return {
      ok: false,
      reason: "discovery_gateway_trust_endpoint_insecure",
      field: "trustDistribution.gatewayReceiptTrust.artifacts.emergencyDenyList.hostedEndpoint"
    };
  }

  const gatewayTrustRootEndpoint = stringValue(gatewayTrustRootBundle.hostedEndpoint);
  if (gatewayTrustRootEndpoint && !isAcceptedHostedEndpoint(gatewayTrustRootEndpoint, options)) {
    return {
      ok: false,
      reason: "discovery_gateway_trust_endpoint_insecure",
      field: "trustDistribution.gatewayReceiptTrust.artifacts.trustRootBundle.hostedEndpoint"
    };
  }

  if (signedTrustProfile.mcpResource !== "agentport://gateway-trust-profile") {
    return {
      ok: false,
      reason: "discovery_gateway_trust_resource_mismatch",
      field: "trustDistribution.gatewayReceiptTrust.artifacts.signedTrustProfile.mcpResource"
    };
  }

  if (receipt.source !== "tool_result" || receipt.type !== "ActionReceipt") {
    return {
      ok: false,
      reason: "discovery_gateway_receipt_source_mismatch",
      field: "trustDistribution.gatewayReceiptTrust.artifacts.receipt"
    };
  }

  const issuerTrust = asRecord(trustDistribution.issuerReadinessTrust);
  if (!issuerTrust || issuerTrust.domain !== "issuer_readiness_trust") {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_domain_mismatch",
      field: "trustDistribution.issuerReadinessTrust.domain"
    };
  }

  if (issuerTrust.issuerMetadataPath !== "/.well-known/agentport-issuer.json") {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_metadata_path_mismatch",
      field: "trustDistribution.issuerReadinessTrust.issuerMetadataPath"
    };
  }

  if (!stringArrayEquals(issuerTrust.order, expectedIssuerReadinessTrustOrder)) {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_order_mismatch",
      field: "trustDistribution.issuerReadinessTrust.order"
    };
  }

  const issuerArtifacts = asRecord(issuerTrust.artifacts);
  const issuerEmergencyDenyList = asRecord(issuerArtifacts?.emergencyDenyList);
  const signedTrustRootBundle = asRecord(issuerArtifacts?.signedTrustRootBundle);
  const signedReadiness = asRecord(issuerArtifacts?.signedReadiness);
  const readinessReport = asRecord(issuerArtifacts?.readinessReport);
  if (!issuerArtifacts || !issuerEmergencyDenyList || !signedTrustRootBundle || !signedReadiness || !readinessReport) {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_artifact_missing",
      field: "trustDistribution.issuerReadinessTrust.artifacts"
    };
  }

  if (
    issuerEmergencyDenyList.protocol !== "agentport-issuer-readiness-trust-root-emergency-denylist-envelope" ||
    signedTrustRootBundle.protocol !== "agentport-issuer-readiness-trust-root-bundle-envelope" ||
    signedReadiness.protocol !== "agentport-issuer-production-readiness-envelope"
  ) {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_protocol_mismatch",
      field: "trustDistribution.issuerReadinessTrust.artifacts"
    };
  }

  const issuerEmergencyEndpoint = stringValue(issuerEmergencyDenyList.hostedEndpoint);
  if (issuerEmergencyEndpoint && !isAcceptedHostedEndpoint(issuerEmergencyEndpoint, options)) {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_endpoint_insecure",
      field: "trustDistribution.issuerReadinessTrust.artifacts.emergencyDenyList.hostedEndpoint"
    };
  }

  if (
    signedTrustRootBundle.issuerMetadataField !== "readinessTrustRootSigned" ||
    signedReadiness.issuerMetadataField !== "readinessSigned" ||
    readinessReport.issuerMetadataField !== "readiness" ||
    readinessReport.type !== "agentport-issuer-production-readiness-v0.1"
  ) {
    return {
      ok: false,
      reason: "discovery_issuer_readiness_metadata_field_mismatch",
      field: "trustDistribution.issuerReadinessTrust.artifacts"
    };
  }

  return {
    ok: true,
    plan: {
      protocol: "agentport-discovery-trust-distribution-plan",
      descriptorIsTrust: false,
      productionTransport: "https-required",
      gatewayReceiptTrust: {
        domain: "gateway_receipt_trust",
        order: expectedGatewayReceiptTrustOrder,
        emergencyDenyListEndpoint: gatewayEmergencyEndpoint,
        trustRootBundleEndpoint: gatewayTrustRootEndpoint,
        signedTrustProfileResource: "agentport://gateway-trust-profile",
        receiptSource: "tool_result"
      },
      issuerReadinessTrust: {
        domain: "issuer_readiness_trust",
        issuerMetadataPath: "/.well-known/agentport-issuer.json",
        order: expectedIssuerReadinessTrustOrder,
        emergencyDenyListEndpoint: issuerEmergencyEndpoint,
        signedTrustRootBundleMetadataField: "readinessTrustRootSigned",
        signedReadinessMetadataField: "readinessSigned",
        readinessReportMetadataField: "readiness"
      }
    }
  };
}

export function assertValidDiscoveryTrustDistribution(
  discovery: unknown,
  options: DiscoveryTrustDistributionValidationOptions = {}
): DiscoveryTrustDistributionPlan {
  const result = validateDiscoveryTrustDistribution(discovery, options);
  if (!result.ok) {
    throw new Error(result.field ? `${result.reason}:${result.field}` : result.reason);
  }

  return result.plan;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArrayEquals(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function isAcceptedHostedEndpoint(
  value: string,
  options: DiscoveryTrustDistributionValidationOptions
): boolean {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    return false;
  }

  if (endpoint.protocol === "https:") {
    return true;
  }

  return options.allowLocalHttp === true &&
    endpoint.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(endpoint.hostname);
}

const approvalFieldMap: Record<string, keyof ApprovalCardInput> = {
  agent_name: "agentName",
  action: "actionIntent",
  business_name: "businessName",
  service_name: "serviceName",
  requested_time_or_slot: "requestedTimeOrSlot",
  customer_fields_to_share: "customerFieldsToShare",
  result_type_requested: "resultTypeRequested",
  delegation_expiry_when_available: "delegationExpiryWhenAvailable"
};

export function buildAgentPortApprovalCard(
  actionModel: AgentPortActionModelLike,
  input: ApprovalCardInput
): AgentPortApprovalCard {
  const fields: Record<string, string | string[]> = {};
  for (const fieldName of actionModel.approvalCard.requiredDisplayFields) {
    const inputKey = approvalFieldMap[fieldName];
    if (!inputKey) {
      throw new Error(`approval_field_unsupported:${fieldName}`);
    }

    const value = inputKey === "actionIntent" ? input.actionIntent.action : input[inputKey];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`approval_field_missing:${fieldName}`);
    }

    fields[fieldName] = value;
  }

  const actionIntentHash = createActionIntentHash(input.actionIntent);
  const cardWithoutHash = {
    intent: input.actionIntent,
    actionIntentHash,
    fields,
    consentText: actionModel.approvalCard.consentTemplate
  };

  return {
    ...cardWithoutHash,
    cardHash: sha256Hex(stableJson(cardWithoutHash))
  };
}

export function recordAgentPortApproval(
  approvalCard: AgentPortApprovalCard,
  input: ApprovalEventInput
): AgentPortApprovalEvent {
  if (input.approved !== true) {
    throw new Error("approval_not_granted");
  }

  if (!input.approvalId.trim()) {
    throw new Error("approval_id_required");
  }

  return {
    approvalId: input.approvalId,
    approved: true,
    approvedAt: input.approvedAt,
    cardHash: approvalCard.cardHash,
    actionIntentHash: approvalCard.actionIntentHash
  };
}

export function attachUserConsentAfterApproval<T extends StateChangingToolArguments>(
  args: T,
  approvalCard: AgentPortApprovalCard,
  approval: AgentPortApprovalEvent
): T & { userConsent: true } {
  assertApprovalMatchesCard(approvalCard, approval);
  if (!actionIntentMatchesToolArguments(approvalCard.intent, args)) {
    throw new Error("approval_action_intent_mismatch");
  }

  return {
    ...args,
    userConsent: true
  };
}

export function validatePluginActionPreflight(
  input: PluginActionPreflightInput
): PluginActionPreflightValidationResult {
  const manifestResult = validatePluginPreflightManifest(input.manifest, input.tool);
  if (!manifestResult.ok) {
    return manifestResult;
  }

  try {
    assertApprovalMatchesCard(input.approvalCard, input.approval);
  } catch {
    return { ok: false, reason: "plugin_preflight_approval_mismatch", field: "approval" };
  }

  if (input.approvalCard.intent.action !== input.tool) {
    return { ok: false, reason: "plugin_preflight_tool_argument_mismatch", field: "tool" };
  }

  if (input.toolArguments && !actionIntentMatchesToolArguments(input.approvalCard.intent, input.toolArguments)) {
    return { ok: false, reason: "plugin_preflight_tool_argument_mismatch", field: "toolArguments" };
  }

  const agentSession = input.agentSession;
  if (!agentSession?.agentId || !agentSession.sessionId) {
    return { ok: false, reason: "plugin_preflight_agent_session_missing", field: "agentSession" };
  }

  if (agentSession.authenticated === false) {
    return { ok: false, reason: "plugin_preflight_agent_session_unauthenticated", field: "agentSession.authenticated" };
  }

  const authority = input.authority;
  if (!authority) {
    return { ok: false, reason: "plugin_preflight_authority_missing", field: "authority" };
  }

  if (authority.caller.agentId !== agentSession.agentId) {
    return { ok: false, reason: "plugin_preflight_authority_agent_mismatch", field: "authority.caller.agentId" };
  }

  if (!authority.user.subjectRef || (agentSession.userSubjectRef && authority.user.subjectRef !== agentSession.userSubjectRef)) {
    return { ok: false, reason: "plugin_preflight_authority_user_mismatch", field: "authority.user.subjectRef" };
  }

  if (!authority.action.bounds) {
    return { ok: false, reason: "plugin_preflight_authority_bounds_missing", field: "authority.action.bounds" };
  }

  if (createActionIntentHash(authority.action.bounds) !== input.approvalCard.actionIntentHash) {
    return { ok: false, reason: "plugin_preflight_authority_bounds_mismatch", field: "authority.action.bounds" };
  }

  if (authority.action.businessId && authority.action.businessId !== input.approvalCard.intent.businessId) {
    return { ok: false, reason: "plugin_preflight_authority_bounds_mismatch", field: "authority.action.businessId" };
  }

  if (authority.action.serviceId && authority.action.serviceId !== input.approvalCard.intent.serviceId) {
    return { ok: false, reason: "plugin_preflight_authority_bounds_mismatch", field: "authority.action.serviceId" };
  }

  if (authority.validity.expiresAt) {
    const expiresAt = Date.parse(authority.validity.expiresAt);
    const now = (input.now?.() ?? new Date()).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return { ok: false, reason: "plugin_preflight_authority_expired", field: "authority.validity.expiresAt" };
    }
  }

  if (input.expectedAudience && authority.validity.audience !== input.expectedAudience) {
    return { ok: false, reason: "plugin_preflight_authority_audience_mismatch", field: "authority.validity.audience" };
  }

  if (input.requireReplayHandle && !authority.validity.replayHandle) {
    return { ok: false, reason: "plugin_preflight_authority_replay_missing", field: "authority.validity.replayHandle" };
  }

  if (authority.evidence.length === 0) {
    return { ok: false, reason: "plugin_preflight_authority_evidence_missing", field: "authority.evidence" };
  }

  const userPresence = input.userPresence;
  if (!userPresence) {
    return { ok: false, reason: "plugin_preflight_user_presence_missing", field: "userPresence" };
  }

  if (!userPresence.verified || !userPresence.source || !userPresence.sessionBound) {
    return { ok: false, reason: "plugin_preflight_user_presence_unverified", field: "userPresence" };
  }

  if (!userPresence.trustedApprovalOrigin) {
    return { ok: false, reason: "plugin_preflight_approval_origin_untrusted", field: "userPresence.trustedApprovalOrigin" };
  }

  if (
    userPresence.origin &&
    input.allowedApprovalOrigins &&
    !input.allowedApprovalOrigins.includes(userPresence.origin)
  ) {
    return { ok: false, reason: "plugin_preflight_approval_origin_untrusted", field: "userPresence.origin" };
  }

  if (input.requirePhishingResistant && !userPresence.phishingResistant) {
    return { ok: false, reason: "plugin_preflight_phishing_resistance_missing", field: "userPresence.phishingResistant" };
  }

  const risk = input.risk;
  if (!risk?.policyApplied) {
    return { ok: false, reason: "plugin_preflight_risk_policy_missing", field: "risk.policyApplied" };
  }

  const unresolvedSignal = (risk.signals ?? []).find((signal) => signal);
  if ((risk.stepUpRequired && !risk.stepUpSatisfied) || (unresolvedSignal && !risk.stepUpSatisfied)) {
    return {
      ok: false,
      reason: "plugin_preflight_risk_signal_unresolved",
      field: "risk.signals",
      signal: unresolvedSignal
    };
  }

  return {
    ok: true,
    approvedActionIntentHash: input.approvalCard.actionIntentHash,
    agentId: agentSession.agentId,
    authorityEvidenceRefs: authority.evidence.map((evidence) => evidence.ref)
  };
}

export function assertPluginActionPreflight(
  input: PluginActionPreflightInput
): Extract<PluginActionPreflightValidationResult, { ok: true }> {
  const result = validatePluginActionPreflight(input);
  if (!result.ok) {
    throw new Error(result.check ? `${result.reason}:${result.check}` : result.reason);
  }

  return result;
}

export function buildIssuerDelegationRequest(
  issuerFlow: AgentPortIssuerFlowLike,
  input: IssuerDelegationRequestInput
): Record<string, unknown> {
  if (createActionIntentHash(input.actionIntent) !== input.approvalCard.actionIntentHash) {
    throw new Error("approval_action_intent_mismatch");
  }

  const request = omitUndefined({
    agentId: input.agentId,
    scopes: input.scopes,
    approvedActions: input.approvedActions,
    audience: input.audience,
    challengeId: input.challengeId,
    nonce: input.nonce,
    tokenConfirmation: input.tokenConfirmation,
    expiresAt: input.expiresAt,
    assurance: input.assurance,
    actionIntent: input.actionIntent,
    consentText: input.approvalCard.consentText
  });

  assertNoForbiddenIssuerFields(issuerFlow, request);
  for (const field of issuerFlow.delegationRequest.requiredFields ?? []) {
    if (request[field] === undefined) {
      throw new Error(`issuer_request_field_missing:${field}`);
    }
  }

  return request;
}

export function assertNoForbiddenIssuerFields(
  issuerFlow: AgentPortIssuerFlowLike,
  value: Record<string, unknown>
): void {
  for (const field of issuerFlow.delegationRequest.forbiddenClientFields ?? []) {
    if (value[field] !== undefined) {
      throw new Error(`issuer_request_forbidden_field:${field}`);
    }
  }
}

export function validateActionReceipt(
  receipt: ActionReceipt | undefined,
  expectations: ActionReceiptValidationExpectations = {}
): ActionReceiptValidationResult {
  if (!receipt) {
    return { ok: false, reason: "receipt_missing" };
  }

  if (!receipt.payloadHash) {
    return { ok: false, reason: "receipt_payload_hash_missing" };
  }

  const payloadHash = sha256Hex(stableJson(actionReceiptPayload(receipt)));
  if (receipt.payloadHash !== payloadHash) {
    return { ok: false, reason: "receipt_payload_hash_mismatch" };
  }

  if (receipt.receiptId !== `receipt_${payloadHash.slice(0, 24)}`) {
    return { ok: false, reason: "receipt_id_mismatch" };
  }

  if (expectations.issuer !== undefined && receipt.issuer !== expectations.issuer) {
    return { ok: false, reason: "receipt_issuer_mismatch" };
  }

  if (expectations.action !== undefined && receipt.action !== expectations.action) {
    return { ok: false, reason: "receipt_action_mismatch" };
  }

  if (expectations.businessId !== undefined && receipt.businessId !== expectations.businessId) {
    return { ok: false, reason: "receipt_business_mismatch" };
  }

  if (expectations.serviceId !== undefined && receipt.serviceId !== expectations.serviceId) {
    return { ok: false, reason: "receipt_service_mismatch" };
  }

  if (expectations.resultType !== undefined && receipt.resultType !== expectations.resultType) {
    return { ok: false, reason: "receipt_result_type_mismatch" };
  }

  if (
    expectations.backendConfirmationId !== undefined &&
    receipt.backendConfirmationId !== expectations.backendConfirmationId
  ) {
    return { ok: false, reason: "receipt_backend_confirmation_mismatch" };
  }

  const signatureFailure = validateActionReceiptSignature(receipt, expectations.signature);
  if (signatureFailure) {
    return { ok: false, reason: signatureFailure };
  }

  return {
    ok: true,
    payloadHash,
    receiptId: receipt.receiptId
  };
}

export function assertValidActionReceipt(
  receipt: ActionReceipt | undefined,
  expectations: ActionReceiptValidationExpectations = {}
): ActionReceiptValidationResult & { ok: true } {
  const result = validateActionReceipt(receipt, expectations);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result;
}

export function actionReceiptPayload(receipt: ActionReceipt): ActionReceiptPayload {
  const {
    receiptId: _receiptId,
    issuer: _issuer,
    payloadHash: _payloadHash,
    signature: _signature,
    keyId: _keyId,
    ...payload
  } = receipt;
  return payload;
}

export function actionReceiptSigningInput(receiptId: string, payloadHash: string): string {
  return `agentport-action-receipt-v0.1\n${receiptId}\n${payloadHash}`;
}

export function actionIntentResultDeliverySigningInput(input: {
  deliveryId: string;
  idempotencyKey: string;
  payloadHash: string;
  intentId: string;
  agentSessionId: string;
}): string {
  return [
    "agentport-action-intent-result-delivery-v0.1",
    input.deliveryId,
    input.idempotencyKey,
    input.payloadHash,
    input.intentId,
    input.agentSessionId
  ].join("\n");
}

export function verifyActionIntentResultDelivery(
  delivery: ActionIntentResultDeliveryRecord | null | undefined,
  expectations: ActionIntentResultDeliverySignatureExpectations = {}
): ActionIntentResultDeliveryValidationResult {
  if (!delivery) {
    return { ok: false, reason: "delivery_missing" };
  }
  if (!delivery.payloadHash) {
    return { ok: false, reason: "delivery_payload_hash_missing" };
  }
  if (!delivery.deliveryId) {
    return { ok: false, reason: "delivery_id_missing" };
  }
  if (!delivery.idempotencyKey) {
    return { ok: false, reason: "delivery_idempotency_key_missing" };
  }

  const signatureFailure = validateActionIntentResultDeliverySignature(delivery, expectations);
  if (signatureFailure) {
    return { ok: false, reason: signatureFailure };
  }

  return {
    ok: true,
    deliveryId: delivery.deliveryId,
    payloadHash: delivery.payloadHash,
    idempotencyKey: delivery.idempotencyKey
  };
}

export function actionIntentResultDeliveryVerificationOptionsFromTrustProfile(
  profile: ActionIntentResultDeliveryTrustProfile
): ActionIntentResultDeliverySignatureExpectations {
  if (profile.protocol !== "agentport-action-intent-result-delivery-trust-profile" || profile.version !== "0.1") {
    throw new Error("intent_result_delivery_trust_profile_unsupported");
  }
  if (profile.delivery.algorithm !== "EdDSA") {
    throw new Error("intent_result_delivery_trust_profile_alg_unsupported");
  }
  if (!profile.delivery.publicKeys.length) {
    throw new Error("intent_result_delivery_trust_profile_key_missing");
  }

  const publicKeys: Record<string, PublicKeyMaterial> = {};
  for (const key of profile.delivery.publicKeys) {
    if (key.alg !== "EdDSA") {
      throw new Error("intent_result_delivery_trust_profile_key_alg_unsupported");
    }
    if (key.use !== "sig") {
      throw new Error("intent_result_delivery_trust_profile_key_use_unsupported");
    }
    publicKeys[key.kid] = key.jwk;
  }

  return {
    requireSignature: profile.delivery.requireSignature,
    trustedIssuers: [profile.gatewayIssuer],
    publicKeys
  };
}

function validateActionReceiptSignature(
  receipt: ActionReceipt,
  expectations: ActionReceiptSignatureExpectations | undefined
): ActionReceiptValidationFailureReason | null {
  if (!expectations) {
    return null;
  }

  if (expectations.trustedIssuers?.length && !expectations.trustedIssuers.includes(receipt.issuer)) {
    return "receipt_issuer_untrusted";
  }

  const publicKeys = expectations.publicKeys ?? {};
  const shouldVerify = expectations.requireSignature === true || Object.keys(publicKeys).length > 0;
  if (!shouldVerify) {
    return null;
  }

  if (!receipt.signature) {
    return "receipt_signature_missing";
  }

  if (!receipt.keyId) {
    return "receipt_key_id_missing";
  }

  const publicKey = publicKeys[receipt.keyId];
  if (!publicKey) {
    return "receipt_public_key_missing";
  }

  const keyStatusFailure = validateReceiptKeyStatus(expectations.keyStatuses?.[receipt.keyId], expectations.now);
  if (keyStatusFailure) {
    return keyStatusFailure;
  }

  if (!/^[A-Za-z0-9_-]+$/.test(receipt.signature)) {
    return "receipt_signature_malformed";
  }

  let signature: Buffer;
  try {
    signature = base64UrlDecode(receipt.signature);
  } catch {
    return "receipt_signature_malformed";
  }

  const ok = cryptoVerify(
    null,
    Buffer.from(actionReceiptSigningInput(receipt.receiptId, receipt.payloadHash ?? "")),
    publicKeyObject(publicKey),
    signature
  );
  return ok ? null : "receipt_signature_invalid";
}

function validateActionIntentResultDeliverySignature(
  delivery: ActionIntentResultDeliveryRecord,
  expectations: ActionIntentResultDeliverySignatureExpectations
): ActionIntentResultDeliveryValidationFailureReason | null {
  if (expectations.trustedIssuers?.length && delivery.signature && !expectations.trustedIssuers.includes(delivery.signature.issuer)) {
    return "delivery_issuer_untrusted";
  }

  const publicKeys = expectations.publicKeys ?? {};
  const shouldVerify = expectations.requireSignature === true || Object.keys(publicKeys).length > 0;
  if (!shouldVerify) {
    return null;
  }

  if (!delivery.signature) {
    return "delivery_signature_missing";
  }

  if (delivery.signature.alg !== "EdDSA") {
    return "delivery_signature_alg_unsupported";
  }

  if (!delivery.signature.keyId) {
    return "delivery_key_id_missing";
  }

  const publicKey = publicKeys[delivery.signature.keyId];
  if (!publicKey) {
    return "delivery_public_key_missing";
  }

  if (!/^[A-Za-z0-9_-]+$/.test(delivery.signature.signature)) {
    return "delivery_signature_malformed";
  }

  let signature: Buffer;
  try {
    signature = base64UrlDecode(delivery.signature.signature);
  } catch {
    return "delivery_signature_malformed";
  }

  const ok = cryptoVerify(
    null,
    Buffer.from(actionIntentResultDeliverySigningInput({
      deliveryId: delivery.deliveryId,
      idempotencyKey: delivery.idempotencyKey,
      payloadHash: delivery.payloadHash,
      intentId: delivery.intentId,
      agentSessionId: delivery.agentSessionId
    })),
    publicKeyObject(publicKey),
    signature
  );
  return ok ? null : "delivery_signature_invalid";
}

function validateReceiptKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): ActionReceiptValidationFailureReason | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "receipt_key_revoked";
  }

  if (status.status === "retired") {
    return "receipt_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "receipt_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "receipt_key_expired";
    }
  }

  return null;
}

function validateTrustRootKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "receipt_trust_root_bundle_key_revoked";
  }

  if (status.status === "retired") {
    return "receipt_trust_root_bundle_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "receipt_trust_root_bundle_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "receipt_trust_root_bundle_key_expired";
    }
  }

  return null;
}

function validateIssuerReadinessTrustRootKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "issuer_readiness_trust_root_bundle_key_revoked";
  }

  if (status.status === "retired") {
    return "issuer_readiness_trust_root_bundle_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "issuer_readiness_trust_root_bundle_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "issuer_readiness_trust_root_bundle_key_expired";
    }
  }

  return null;
}

function validateTrustRootBundleEnvelopeKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "receipt_trust_root_bundle_envelope_key_revoked";
  }

  if (status.status === "retired") {
    return "receipt_trust_root_bundle_envelope_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "receipt_trust_root_bundle_envelope_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "receipt_trust_root_bundle_envelope_key_expired";
    }
  }

  return null;
}

function validateIssuerReadinessTrustRootBundleEnvelopeKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "issuer_readiness_trust_root_bundle_envelope_key_revoked";
  }

  if (status.status === "retired") {
    return "issuer_readiness_trust_root_bundle_envelope_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "issuer_readiness_trust_root_bundle_envelope_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "issuer_readiness_trust_root_bundle_envelope_key_expired";
    }
  }

  return null;
}

function validateEmergencyDenyListEnvelopeKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "receipt_trust_root_emergency_denylist_envelope_key_revoked";
  }

  if (status.status === "retired") {
    return "receipt_trust_root_emergency_denylist_envelope_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "receipt_trust_root_emergency_denylist_envelope_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "receipt_trust_root_emergency_denylist_envelope_key_expired";
    }
  }

  return null;
}

function validateIssuerReadinessTrustRootEmergencyDenyListEnvelopeKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "issuer_readiness_trust_root_emergency_denylist_envelope_key_revoked";
  }

  if (status.status === "retired") {
    return "issuer_readiness_trust_root_emergency_denylist_envelope_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "issuer_readiness_trust_root_emergency_denylist_envelope_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "issuer_readiness_trust_root_emergency_denylist_envelope_key_expired";
    }
  }

  return null;
}

function validateIssuerReadinessEnvelopeKeyStatus(
  status: ActionReceiptTrustKeyStatus | undefined,
  nowFactory: (() => Date) | undefined
): string | null {
  if (!status) {
    return null;
  }

  if (status.status === "revoked") {
    return "issuer_readiness_envelope_key_revoked";
  }

  if (status.status === "retired") {
    return "issuer_readiness_envelope_key_retired";
  }

  const now = (nowFactory?.() ?? new Date()).getTime();
  if (status.notBefore) {
    const notBefore = Date.parse(status.notBefore);
    if (!Number.isFinite(notBefore) || now < notBefore) {
      return "issuer_readiness_envelope_key_not_active";
    }
  }

  if (status.expiresAt) {
    const expiresAt = Date.parse(status.expiresAt);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return "issuer_readiness_envelope_key_expired";
    }
  }

  return null;
}

function assertApprovalMatchesCard(card: AgentPortApprovalCard, approval: AgentPortApprovalEvent): void {
  if (approval.approved !== true) {
    throw new Error("approval_not_granted");
  }

  if (approval.cardHash !== card.cardHash || approval.actionIntentHash !== card.actionIntentHash) {
    throw new Error("approval_card_mismatch");
  }
}

function actionIntentMatchesToolArguments(intent: ActionIntent, args: StateChangingToolArguments): boolean {
  if (intent.businessId !== args.businessId) {
    return false;
  }

  if (intent.serviceId && intent.serviceId !== args.serviceId) {
    return false;
  }

  if (intent.action === "book_service") {
    const book = args as BookRequest;
    return optionalMatches(intent.requestedType, book.requestedType)
      && optionalMatches(intent.slotStart, book.slotStart);
  }

  if (intent.action === "cancel_service") {
    const cancel = args as CancelRequest;
    return optionalMatches(intent.confirmationId, cancel.confirmationId);
  }

  const reschedule = args as RescheduleRequest;
  return optionalMatches(intent.confirmationId, reschedule.confirmationId)
    && optionalMatches(intent.newSlotStart, reschedule.newSlotStart);
}

function optionalMatches<T>(intentValue: T | undefined, requestValue: T | undefined): boolean {
  return intentValue === undefined || intentValue === requestValue;
}

function validatePluginPreflightManifest(
  manifest: AgentPortVendorPluginManifestLike | null | undefined,
  tool: DelegatedAction
): PluginActionPreflightValidationResult | { ok: true } {
  const preflight = manifest?.requiredPreExecutionChecks;
  if (!preflight) {
    return { ok: false, reason: "plugin_preflight_manifest_missing", field: "requiredPreExecutionChecks" };
  }

  if (preflight.failClosed !== true) {
    return { ok: false, reason: "plugin_preflight_not_fail_closed", field: "requiredPreExecutionChecks.failClosed" };
  }

  if (!preflight.appliesTo?.includes(tool)) {
    return { ok: false, reason: "plugin_preflight_tool_not_covered", field: "requiredPreExecutionChecks.appliesTo" };
  }

  const requiredIds = new Set(
    (preflight.checks ?? [])
      .filter((check) => check.required !== false)
      .map((check) => check.id)
  );
  const expected: PluginPreExecutionCheckId[] = [
    "exact_user_approval",
    "representative_authority",
    "real_user_presence",
    "anti_abuse_screening"
  ];
  const missing = expected.find((check) => !requiredIds.has(check));
  if (missing) {
    return {
      ok: false,
      reason: "plugin_preflight_check_missing",
      field: "requiredPreExecutionChecks.checks",
      check: missing
    };
  }

  return { ok: true };
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
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

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function publicKeyObject(material: PublicKeyMaterial): ReturnType<typeof createPublicKey> {
  return typeof material === "string"
    ? createPublicKey(material)
    : createPublicKey({ key: material, format: "jwk" });
}
