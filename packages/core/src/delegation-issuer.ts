import { randomUUID, type JsonWebKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createActionIntentHash,
  emitDelegationTokenWithSigner,
  PemDelegationTokenSigner,
  type CompactTokenKeyPair,
  type DelegationTokenSigner
} from "./delegation-token.js";
import type {
  AuditEvent,
  ActionIntent,
  DelegatedAction,
  DelegationAssurance,
  DelegationProof,
  DelegationTokenConfirmation,
  TokenConfirmationMethod,
  Scope
} from "./types.js";

export interface DelegationIssuerMetadata {
  issuer: string;
  jwksUri?: string;
  profiles: string[];
}

export interface DelegationIssuerJwks {
  keys: JsonWebKey[];
}

export interface DelegationRequestInput {
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
  consentText?: string[];
}

export interface PendingDelegationRequest extends DelegationRequestInput {
  requestId: string;
  issuer: string;
  status: "pending";
  actionIntentHash: string;
  createdAt: string;
}

export interface DelegationApprovalInput {
  requestId: string;
  userSubject: string;
  consentId?: string;
  approvedAt?: string;
  assurance?: DelegationAssurance;
}

export interface DelegationConsentRecord {
  consentId: string;
  delegationId: string;
  requestId: string;
  issuer: string;
  userSubject: string;
  agentId: string;
  actionIntentHash: string;
  approvedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface DelegationIssueResult {
  delegationToken: string;
  delegation: DelegationProof;
  consent: DelegationConsentRecord;
}

export type DelegationStatus =
  | {
      status: "pending";
      request: PendingDelegationRequest;
    }
  | {
      status: "expired";
      request: PendingDelegationRequest;
    }
  | {
      status: "issued";
      consent: DelegationConsentRecord;
    }
  | {
      status: "revoked";
      consent: DelegationConsentRecord;
    }
  | {
      status: "not_found";
    };

export interface DelegationIssuer {
  metadata(): DelegationIssuerMetadata;
  jwks(): DelegationIssuerJwks;
  protectionReadiness?(): DelegationProtectionPolicyReadiness;
  createRequest(input: DelegationRequestInput): Promise<PendingDelegationRequest>;
  approveRequest(input: DelegationApprovalInput): Promise<DelegationIssueResult>;
  revoke(delegationId: string, revokedAt?: string): Promise<boolean>;
  status(id: string): Promise<DelegationStatus>;
}

export interface DelegationIssuerStore {
  putRequest(request: PendingDelegationRequest): Promise<void>;
  getRequest(requestId: string): Promise<PendingDelegationRequest | null>;
  consumeRequest(requestId: string): Promise<PendingDelegationRequest | null>;
  deleteRequest(requestId: string): Promise<void>;
  putConsent(consent: DelegationConsentRecord): Promise<void>;
  getConsent(id: string): Promise<DelegationConsentRecord | null>;
}

export interface DelegationIssuerAuditSink {
  record(e: AuditEvent): Promise<void>;
}

export type DelegationProtectionDecision =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      metadata?: Record<string, unknown>;
    };

export interface DelegationProtectionPolicyReadiness {
  tokenConfirmationPolicy: boolean;
  replayHandleRequired: boolean;
  boundedTokenTtl: boolean;
  minimumApprovalAssurance: boolean;
}

export interface DelegationProtectionPolicy {
  readiness?(): DelegationProtectionPolicyReadiness;
  validateRequest(input: {
    request: DelegationRequestInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision>;
  validateApproval(input: {
    request: PendingDelegationRequest;
    approval: DelegationApprovalInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision>;
}

export interface StaticDelegationProtectionPolicyOptions {
  tokenConfirmationMethods?: TokenConfirmationMethod[];
  requireReplayHandle?: boolean;
  maxTtlSeconds?: number;
  minApprovalAssurance?: DelegationAssurance;
}

export interface MemoryDelegationVelocityPolicyOptions {
  maxRequests: number;
  windowMs: number;
  keyBy?: Array<"issuer" | "agentId" | "audience">;
  now?: () => Date;
}

export interface LocalDelegationIssuerOptions {
  issuer: string;
  signer?: DelegationTokenSigner;
  signers?: DelegationTokenSigner[];
  signingKey?: CompactTokenKeyPair;
  signingKeys?: CompactTokenKeyPair[];
  activeKeyId?: string;
  store?: DelegationIssuerStore;
  protection?: DelegationProtectionPolicy;
  audit?: DelegationIssuerAuditSink;
  jwksUri?: string;
  now?: () => Date;
  idFactory?: (prefix: string) => string;
}

export class LocalDelegationIssuer implements DelegationIssuer {
  #store: DelegationIssuerStore;
  #signers: DelegationTokenSigner[];
  #activeKeyId: string;

  constructor(private readonly options: LocalDelegationIssuerOptions) {
    const configuredSigners = options.signers ?? (options.signer ? [options.signer] : []);
    const pemBackedSigners = (options.signingKeys ?? (options.signingKey ? [options.signingKey] : []))
      .map((key) => new PemDelegationTokenSigner(key.keyId, key.privateKeyPem));
    this.#signers = [...configuredSigners, ...pemBackedSigners];
    if (this.#signers.length === 0) {
      throw new Error("delegation_issuer_signing_key_required");
    }

    this.#activeKeyId = options.activeKeyId ?? this.#signers[0].keyId;
    if (!this.#signers.some((signer) => signer.keyId === this.#activeKeyId)) {
      throw new Error("delegation_issuer_active_key_missing");
    }

    this.#store = options.store ?? new MemoryDelegationIssuerStore();
  }

  metadata(): DelegationIssuerMetadata {
    return {
      issuer: this.options.issuer,
      jwksUri: this.options.jwksUri,
      profiles: ["agentport-delegation-v0.1", "compact-jws-eddsa", "dpop-jwk-thumbprint"]
    };
  }

  jwks(): DelegationIssuerJwks {
    return {
      keys: this.#signers.map((signer) => ({
          ...signer.publicJwk,
          kid: signer.keyId,
          use: "sig",
          alg: "EdDSA"
        }))
    };
  }

  protectionReadiness(): DelegationProtectionPolicyReadiness {
    return delegationProtectionPolicyReadiness(this.options.protection);
  }

  async createRequest(input: DelegationRequestInput): Promise<PendingDelegationRequest> {
    if (!input.agentId || !input.audience || !input.actionIntent || input.scopes.length === 0) {
      throw new Error("delegation_request_invalid");
    }

    if (!input.tokenConfirmation?.method) {
      throw new Error("delegation_request_token_confirmation_required");
    }

    const expiresAtMs = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      await this.audit("delegation_request", "rejected", {
        reason: "delegation_expiry_invalid",
        agentId: input.agentId,
        audience: input.audience,
        action: input.actionIntent.action,
        businessId: input.actionIntent.businessId,
        serviceId: input.actionIntent.serviceId,
        tokenConfirmationMethod: input.tokenConfirmation.method,
        requestedAssurance: input.assurance
      });
      throw new Error("delegation_expiry_invalid");
    }

    if (expiresAtMs <= this.nowDate().getTime()) {
      await this.audit("delegation_request", "rejected", {
        reason: "delegation_expired",
        agentId: input.agentId,
        audience: input.audience,
        action: input.actionIntent.action,
        businessId: input.actionIntent.businessId,
        serviceId: input.actionIntent.serviceId,
        tokenConfirmationMethod: input.tokenConfirmation.method,
        requestedAssurance: input.assurance
      });
      throw new Error("delegation_expired");
    }

    const policyDecision = await this.options.protection?.validateRequest({
      request: input,
      issuer: this.options.issuer,
      now: this.nowDate()
    });
    if (policyDecision && !policyDecision.ok) {
      await this.audit("delegation_request", "rejected", {
        reason: policyDecision.reason,
        ...policyDecision.metadata,
        agentId: input.agentId,
        audience: input.audience,
        action: input.actionIntent.action,
        businessId: input.actionIntent.businessId,
        serviceId: input.actionIntent.serviceId,
        tokenConfirmationMethod: input.tokenConfirmation.method,
        requestedAssurance: input.assurance
      });
      throw new Error(policyDecision.reason);
    }

    const request: PendingDelegationRequest = {
      ...input,
      requestId: this.nextId("dreq"),
      issuer: this.options.issuer,
      status: "pending",
      actionIntentHash: createActionIntentHash(input.actionIntent),
      createdAt: this.now()
    };
    await this.#store.putRequest(request);
    await this.audit("delegation_request", "accepted", {
      requestId: request.requestId,
      agentId: request.agentId,
      audience: request.audience,
      action: request.actionIntent.action,
      businessId: request.actionIntent.businessId,
      serviceId: request.actionIntent.serviceId,
      tokenConfirmationMethod: request.tokenConfirmation.method,
      requestedAssurance: request.assurance,
      actionIntentHash: request.actionIntentHash
    });
    return request;
  }

  async approveRequest(input: DelegationApprovalInput): Promise<DelegationIssueResult> {
    const request = await this.#store.getRequest(input.requestId);
    if (!request) {
      await this.audit("delegation_approval", "rejected", {
        requestId: input.requestId,
        reason: "delegation_request_not_found"
      });
      throw new Error("delegation_request_not_found");
    }

    if (!input.userSubject) {
      await this.audit("delegation_approval", "rejected", {
        requestId: input.requestId,
        reason: "delegation_approval_user_required"
      });
      throw new Error("delegation_approval_user_required");
    }

    if (this.isExpired(request.expiresAt)) {
      await this.audit("delegation_approval", "rejected", {
        requestId: input.requestId,
        reason: "delegation_request_expired",
        agentId: request.agentId,
        action: request.actionIntent.action,
        businessId: request.actionIntent.businessId,
        serviceId: request.actionIntent.serviceId,
        actionIntentHash: request.actionIntentHash
      });
      throw new Error("delegation_request_expired");
    }

    const approvalPolicyDecision = await this.options.protection?.validateApproval({
      request,
      approval: input,
      issuer: this.options.issuer,
      now: this.nowDate()
    });
    if (approvalPolicyDecision && !approvalPolicyDecision.ok) {
      await this.audit("delegation_approval", "rejected", {
        requestId: input.requestId,
        reason: approvalPolicyDecision.reason,
        ...approvalPolicyDecision.metadata,
        agentId: request.agentId,
        action: request.actionIntent.action,
        businessId: request.actionIntent.businessId,
        serviceId: request.actionIntent.serviceId,
        approvalAssurance: input.assurance,
        requestedAssurance: request.assurance
      });
      throw new Error(approvalPolicyDecision.reason);
    }

    const consumedRequest = await this.#store.consumeRequest(request.requestId);
    if (!consumedRequest) {
      await this.audit("delegation_approval", "rejected", {
        requestId: input.requestId,
        reason: "delegation_request_consumed",
        agentId: request.agentId,
        action: request.actionIntent.action,
        businessId: request.actionIntent.businessId,
        serviceId: request.actionIntent.serviceId,
        actionIntentHash: request.actionIntentHash
      });
      throw new Error("delegation_request_consumed");
    }

    if (this.isExpired(consumedRequest.expiresAt)) {
      await this.audit("delegation_approval", "rejected", {
        requestId: input.requestId,
        reason: "delegation_request_expired",
        agentId: consumedRequest.agentId,
        action: consumedRequest.actionIntent.action,
        businessId: consumedRequest.actionIntent.businessId,
        serviceId: consumedRequest.actionIntent.serviceId,
        actionIntentHash: consumedRequest.actionIntentHash
      });
      throw new Error("delegation_request_expired");
    }

    const approvedAt = input.approvedAt ?? this.now();
    const consentId = input.consentId ?? this.nextId("consent");
    const delegationId = this.nextId("del");
    const assurance = input.assurance ?? consumedRequest.assurance;
    const delegation: DelegationProof = {
      delegationId,
      issuer: this.options.issuer,
      userSubject: input.userSubject,
      agentId: consumedRequest.agentId,
      consentId,
      scopes: consumedRequest.scopes,
      approvedActions: consumedRequest.approvedActions ?? [consumedRequest.actionIntent.action],
      businessId: consumedRequest.actionIntent.businessId,
      serviceId: consumedRequest.actionIntent.serviceId,
      audience: consumedRequest.audience,
      challengeId: consumedRequest.challengeId,
      nonce: consumedRequest.nonce,
      tokenConfirmation: consumedRequest.tokenConfirmation,
      expiresAt: consumedRequest.expiresAt,
      issuedAt: approvedAt,
      assurance,
      actionIntent: consumedRequest.actionIntent,
      actionIntentHash: consumedRequest.actionIntentHash
    };
    const consent: DelegationConsentRecord = {
      consentId,
      delegationId,
      requestId: consumedRequest.requestId,
      issuer: this.options.issuer,
      userSubject: input.userSubject,
      agentId: consumedRequest.agentId,
      actionIntentHash: consumedRequest.actionIntentHash,
      approvedAt,
      expiresAt: consumedRequest.expiresAt
    };

    await this.#store.putConsent(consent);
    const signer = this.activeSigner();
    let delegationToken: string;
    try {
      delegationToken = await emitDelegationTokenWithSigner(delegation, {
        issuer: this.options.issuer,
        signer
      });
    } catch (error) {
      const revokedAt = this.now();
      await this.#store.putConsent({ ...consent, revokedAt });
      await this.audit("delegation_approval", "rejected", {
        requestId: consumedRequest.requestId,
        delegationId,
        consentId,
        reason: "delegation_signing_failed",
        agentId: consumedRequest.agentId,
        action: consumedRequest.actionIntent.action,
        businessId: consumedRequest.actionIntent.businessId,
        serviceId: consumedRequest.actionIntent.serviceId,
        tokenConfirmationMethod: consumedRequest.tokenConfirmation.method,
        assurance,
        actionIntentHash: consumedRequest.actionIntentHash
      });
      throw error;
    }

    await this.audit("delegation_approval", "issued", {
      requestId: consumedRequest.requestId,
      delegationId,
      consentId,
      agentId: consumedRequest.agentId,
      action: consumedRequest.actionIntent.action,
      businessId: consumedRequest.actionIntent.businessId,
      serviceId: consumedRequest.actionIntent.serviceId,
      tokenConfirmationMethod: consumedRequest.tokenConfirmation.method,
      assurance,
      actionIntentHash: consumedRequest.actionIntentHash
    });

    return { delegationToken, delegation, consent };
  }

  async revoke(delegationId: string, revokedAt = this.now()): Promise<boolean> {
    const consent = await this.#store.getConsent(delegationId);
    if (!consent) {
      await this.audit("delegation_revoke", "not_found", { delegationId });
      return false;
    }

    const revoked = { ...consent, revokedAt };
    await this.#store.putConsent(revoked);
    await this.audit("delegation_revoke", "revoked", {
      delegationId: consent.delegationId,
      consentId: consent.consentId,
      requestId: consent.requestId,
      agentId: consent.agentId,
      actionIntentHash: consent.actionIntentHash,
      revokedAt
    });
    return true;
  }

  async status(id: string): Promise<DelegationStatus> {
    const request = await this.#store.getRequest(id);
    if (request) {
      return {
        status: this.isExpired(request.expiresAt) ? "expired" : "pending",
        request
      };
    }

    const consent = await this.#store.getConsent(id);
    if (consent) {
      return consent.revokedAt
        ? { status: "revoked", consent }
        : { status: "issued", consent };
    }

    return { status: "not_found" };
  }

  private now(): string {
    return this.nowDate().toISOString();
  }

  private nowDate(): Date {
    return this.options.now?.() ?? new Date();
  }

  private nextId(prefix: string): string {
    return this.options.idFactory?.(prefix) ?? `${prefix}_${randomUUID()}`;
  }

  private isExpired(expiresAt: string): boolean {
    const expiresAtMs = Date.parse(expiresAt);
    return !Number.isFinite(expiresAtMs) || expiresAtMs <= this.nowDate().getTime();
  }

  private activeSigner(): DelegationTokenSigner {
    const signer = this.#signers.find((candidate) => candidate.keyId === this.#activeKeyId);
    if (!signer) {
      throw new Error("delegation_issuer_active_key_missing");
    }

    return signer;
  }

  private async audit(type: string, resultType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.options.audit?.record({
      type,
      resultType,
      metadata: {
        issuer: this.options.issuer,
        ...metadata
      },
      at: this.now()
    });
  }
}

export class StaticDelegationProtectionPolicy implements DelegationProtectionPolicy {
  constructor(private readonly options: StaticDelegationProtectionPolicyOptions = {}) {}

  readiness(): DelegationProtectionPolicyReadiness {
    const allowedMethods = this.options.tokenConfirmationMethods ?? [];
    return {
      tokenConfirmationPolicy: allowedMethods.length > 0 &&
        allowedMethods.every((method) => method === "dpop" || method === "mtls" || method === "wallet"),
      replayHandleRequired: this.options.requireReplayHandle === true,
      boundedTokenTtl: Number.isFinite(this.options.maxTtlSeconds) &&
        (this.options.maxTtlSeconds ?? 0) > 0,
      minimumApprovalAssurance: this.options.minApprovalAssurance !== undefined &&
        this.options.minApprovalAssurance !== "test"
    };
  }

  async validateRequest({ request, now }: {
    request: DelegationRequestInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision> {
    const allowedMethods = this.options.tokenConfirmationMethods;
    if (allowedMethods && !allowedMethods.includes(request.tokenConfirmation.method)) {
      return {
        ok: false,
        reason: "delegation_token_confirmation_method_disallowed",
        metadata: {
          tokenConfirmationMethod: request.tokenConfirmation.method,
          allowedTokenConfirmationMethods: allowedMethods
        }
      };
    }

    if (this.options.requireReplayHandle && !request.challengeId && !request.nonce) {
      return { ok: false, reason: "delegation_replay_handle_required" };
    }

    if (this.options.maxTtlSeconds !== undefined) {
      const expiresAtMs = Date.parse(request.expiresAt);
      if (!Number.isFinite(expiresAtMs)) {
        return { ok: false, reason: "delegation_expiry_invalid" };
      }

      const ttlSeconds = Math.floor((expiresAtMs - now.getTime()) / 1000);
      if (ttlSeconds <= 0) {
        return { ok: false, reason: "delegation_expired" };
      }

      if (ttlSeconds > this.options.maxTtlSeconds) {
        return {
          ok: false,
          reason: "delegation_ttl_exceeded",
          metadata: {
            ttlSeconds,
            maxTtlSeconds: this.options.maxTtlSeconds
          }
        };
      }
    }

    return { ok: true };
  }

  async validateApproval({ approval }: {
    request: PendingDelegationRequest;
    approval: DelegationApprovalInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision> {
    if (this.options.minApprovalAssurance && !meetsAssurance(approval.assurance, this.options.minApprovalAssurance)) {
      return {
        ok: false,
        reason: "delegation_approval_assurance_too_low",
        metadata: {
          approvalAssurance: approval.assurance,
          minApprovalAssurance: this.options.minApprovalAssurance
        }
      };
    }

    return { ok: true };
  }
}

export class CompositeDelegationProtectionPolicy implements DelegationProtectionPolicy {
  constructor(private readonly policies: DelegationProtectionPolicy[]) {}

  readiness(): DelegationProtectionPolicyReadiness {
    return this.policies.reduce<DelegationProtectionPolicyReadiness>((result, policy) => {
      const readiness = delegationProtectionPolicyReadiness(policy);
      return {
        tokenConfirmationPolicy: result.tokenConfirmationPolicy || readiness.tokenConfirmationPolicy,
        replayHandleRequired: result.replayHandleRequired || readiness.replayHandleRequired,
        boundedTokenTtl: result.boundedTokenTtl || readiness.boundedTokenTtl,
        minimumApprovalAssurance: result.minimumApprovalAssurance || readiness.minimumApprovalAssurance
      };
    }, emptyDelegationProtectionPolicyReadiness());
  }

  async validateRequest(input: {
    request: DelegationRequestInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision> {
    for (const policy of this.policies) {
      const decision = await policy.validateRequest(input);
      if (!decision.ok) {
        return decision;
      }
    }

    return { ok: true };
  }

  async validateApproval(input: {
    request: PendingDelegationRequest;
    approval: DelegationApprovalInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision> {
    for (const policy of this.policies) {
      const decision = await policy.validateApproval(input);
      if (!decision.ok) {
        return decision;
      }
    }

    return { ok: true };
  }
}

export function delegationProtectionPolicyReadiness(
  policy?: DelegationProtectionPolicy
): DelegationProtectionPolicyReadiness {
  return policy?.readiness?.() ?? emptyDelegationProtectionPolicyReadiness();
}

function emptyDelegationProtectionPolicyReadiness(): DelegationProtectionPolicyReadiness {
  return {
    tokenConfirmationPolicy: false,
    replayHandleRequired: false,
    boundedTokenTtl: false,
    minimumApprovalAssurance: false
  };
}

export class MemoryDelegationVelocityPolicy implements DelegationProtectionPolicy {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly options: MemoryDelegationVelocityPolicyOptions) {
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) {
      throw new Error("delegation_velocity_max_requests_invalid");
    }

    if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
      throw new Error("delegation_velocity_window_invalid");
    }
  }

  async validateRequest(input: {
    request: DelegationRequestInput;
    issuer: string;
    now: Date;
  }): Promise<DelegationProtectionDecision> {
    const now = this.options.now?.() ?? input.now;
    const nowMs = now.getTime();
    const key = this.key(input);
    const cutoff = nowMs - this.options.windowMs;
    const current = (this.buckets.get(key) ?? []).filter((entry) => entry > cutoff);
    if (current.length >= this.options.maxRequests) {
      this.buckets.set(key, current);
      return {
        ok: false,
        reason: "delegation_velocity_limited",
        metadata: {
          velocityKey: key,
          maxRequests: this.options.maxRequests,
          windowMs: this.options.windowMs
        }
      };
    }

    current.push(nowMs);
    this.buckets.set(key, current);
    return { ok: true };
  }

  async validateApproval(): Promise<DelegationProtectionDecision> {
    return { ok: true };
  }

  private key(input: {
    request: DelegationRequestInput;
    issuer: string;
  }): string {
    const parts = (this.options.keyBy ?? ["issuer", "agentId", "audience"]).map((field) => {
      if (field === "issuer") {
        return input.issuer;
      }

      return input.request[field];
    });
    return parts.join(":");
  }
}

function meetsAssurance(actual: DelegationAssurance | undefined, required: DelegationAssurance): boolean {
  return assuranceRank(actual) >= assuranceRank(required);
}

function assuranceRank(value: DelegationAssurance | undefined): number {
  switch (value) {
    case "wallet":
      return 4;
    case "passkey":
      return 3;
    case "account":
      return 2;
    case "session":
      return 1;
    case "test":
      return 0;
    default:
      return -1;
  }
}

export class MemoryDelegationIssuerStore implements DelegationIssuerStore {
  #requests = new Map<string, PendingDelegationRequest>();
  #consents = new Map<string, DelegationConsentRecord>();

  async putRequest(request: PendingDelegationRequest): Promise<void> {
    if (this.#requests.has(request.requestId)) {
      throw new Error("delegation_request_id_duplicate");
    }

    this.#requests.set(request.requestId, request);
  }

  async getRequest(requestId: string): Promise<PendingDelegationRequest | null> {
    return this.#requests.get(requestId) ?? null;
  }

  async consumeRequest(requestId: string): Promise<PendingDelegationRequest | null> {
    const request = this.#requests.get(requestId) ?? null;
    if (request) {
      this.#requests.delete(requestId);
    }
    return request;
  }

  async deleteRequest(requestId: string): Promise<void> {
    this.#requests.delete(requestId);
  }

  async putConsent(consent: DelegationConsentRecord): Promise<void> {
    assertConsentDoesNotConflict(
      this.#consents.get(consent.delegationId),
      this.#consents.get(consent.consentId),
      consent
    );
    this.#consents.set(consent.delegationId, consent);
    this.#consents.set(consent.consentId, consent);
  }

  async getConsent(id: string): Promise<DelegationConsentRecord | null> {
    return this.#consents.get(id) ?? null;
  }
}

interface FileDelegationIssuerStoreState {
  requests: Record<string, PendingDelegationRequest>;
  consents: Record<string, DelegationConsentRecord>;
}

export class FileDelegationIssuerStore implements DelegationIssuerStore {
  constructor(private readonly path: string) {}

  async putRequest(request: PendingDelegationRequest): Promise<void> {
    const state = await this.load();
    if (state.requests[request.requestId]) {
      throw new Error("delegation_request_id_duplicate");
    }

    state.requests[request.requestId] = request;
    await this.save(state);
  }

  async getRequest(requestId: string): Promise<PendingDelegationRequest | null> {
    const state = await this.load();
    return state.requests[requestId] ?? null;
  }

  async consumeRequest(requestId: string): Promise<PendingDelegationRequest | null> {
    const state = await this.load();
    const request = state.requests[requestId] ?? null;
    if (request) {
      delete state.requests[requestId];
      await this.save(state);
    }
    return request;
  }

  async deleteRequest(requestId: string): Promise<void> {
    const state = await this.load();
    delete state.requests[requestId];
    await this.save(state);
  }

  async putConsent(consent: DelegationConsentRecord): Promise<void> {
    const state = await this.load();
    assertConsentDoesNotConflict(
      state.consents[consent.delegationId],
      state.consents[consent.consentId],
      consent
    );
    state.consents[consent.delegationId] = consent;
    state.consents[consent.consentId] = consent;
    await this.save(state);
  }

  async getConsent(id: string): Promise<DelegationConsentRecord | null> {
    const state = await this.load();
    return state.consents[id] ?? null;
  }

  private async load(): Promise<FileDelegationIssuerStoreState> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<FileDelegationIssuerStoreState>;
      return {
        requests: parsed.requests ?? {},
        consents: parsed.consents ?? {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { requests: {}, consents: {} };
      }

      throw error;
    }
  }

  private async save(state: FileDelegationIssuerStoreState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`);
  }
}

function assertConsentDoesNotConflict(
  byDelegationId: DelegationConsentRecord | undefined,
  byConsentId: DelegationConsentRecord | undefined,
  next: DelegationConsentRecord
): void {
  for (const existing of [byDelegationId, byConsentId]) {
    if (!existing) {
      continue;
    }

    if (existing.delegationId !== next.delegationId || existing.consentId !== next.consentId) {
      throw new Error("delegation_consent_id_duplicate");
    }
  }
}
