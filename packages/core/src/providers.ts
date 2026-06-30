import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type JsonWebKey
} from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { authorityContextFromDelegationProof } from "./authority.js";
import { deriveBindingId } from "./bindings.js";
import type { BookingAdapter } from "./contracts.js";
import { createActionIntentHash, inspectDelegationToken, verifyDelegationToken, verifyDpopProof, type PublicKeyMaterial } from "./delegation-token.js";
import type {
  ActionIntent,
  AuditEvent,
  AuthorityContext,
  AuthorizationResult,
  AvailabilityResult,
  BookRequest,
  BusinessPortAttestation,
  BusinessPortAttestationRecord,
  BusinessPortAttestationProvider,
  BusinessPortAttestationStore,
  BusinessPortTrustRoot,
  BusinessPortTrustRootPublicKey,
  BusinessPortVerificationFailureReason,
  BusinessPortVerificationRequest,
  BusinessPortVerificationResult,
  CancelRequest,
  ActionReceiptPayload,
  ActionLayer,
  ActionIntentLifecycleEvent,
  ActionIntentLifecycleRecord,
  ActionIntentResultDeliveryRecord,
  ActionIntentResultDeliverySignature,
  ActionIntentResultDeliverySummary,
  ActionIntentResultDeliveryStatus,
  BackendBinding,
  CredentialRef,
  DelegationProof,
  DelegationVerificationResult,
  DelegatedAction,
  IncomingRequest,
  Lead,
  QueryEvent,
  RescheduleRequest,
  Scope,
  SignedBusinessPortAttestation,
  Tenant,
  TenantMatch,
  UserAuthorityContext,
  UserAuthorityProvider,
  UserAuthorityTechnology,
  UserAuthorityTrustRecord,
  UserAuthorityTrustStore,
  UserAuthorityVerificationFailureReason,
  UserAuthorityVerificationRequest,
  UserAuthorityVerificationResult
} from "./types.js";

export interface TenantStore {
  resolveTenant(businessId: string): Promise<Tenant | null>;
  findNear(q: {
    service: string;
    lat?: number;
    lng?: number;
    text?: string;
    radiusKm: number;
  }): Promise<TenantMatch[]>;
}

export interface TruthStore {
  getAvailability(businessId: string, serviceId: string, bindingId?: string): Promise<AvailabilityResult | null>;
  freshnessOf(businessId: string): Promise<{ source: string; ageMin: number } | null>;
}

export interface AuthProvider {
  authorize(req: IncomingRequest): Promise<AuthorizationResult | null>;
  requireConsent(req: BookRequest | CancelRequest | RescheduleRequest): boolean;
}

export interface DelegationTokenAuthOptions {
  trustedIssuers: string[];
  delegationPublicKeys?: Record<string, PublicKeyMaterial>;
  issuerRegistry?: TrustedIssuerRegistry;
  dpopPublicKeys?: Record<string, PublicKeyMaterial>;
  now?: () => Date;
  dpopMaxAgeSeconds?: number;
  fallbackScopes?: Scope[];
}

export interface TrustedIssuerRegistry {
  resolvePublicKeys(issuer: string): Promise<Record<string, PublicKeyMaterial> | null>;
}

export interface DelegationVerifier {
  verify(proof: DelegationProof): Promise<DelegationVerificationResult>;
}

export interface DelegationReplayStore {
  consume(proof: DelegationProof): Promise<boolean>;
}

export interface ActionReceiptInput {
  receiptId: string;
  payload: ActionReceiptPayload;
  payloadHash: string;
}

export interface ActionReceiptSigner {
  sign(input: ActionReceiptInput): Promise<{
    issuer: string;
    signature?: string;
    keyId?: string;
  }>;
}

export interface AuditSink {
  record(e: AuditEvent): Promise<void>;
}

export interface AnalyticsSink {
  observe(e: QueryEvent): Promise<void>;
}

export interface LeadSink {
  deliver(lead: Lead): Promise<void>;
}

export interface CredentialVault {
  resolve(ref: CredentialRef): Promise<Record<string, string | undefined> | null>;
}

export interface LocalUserAuthorityProviderOptions {
  audience?: string;
  now?: () => Date;
  requireNonce?: boolean;
}

export interface TrustAnchoredUserAuthorityProviderOptions extends LocalUserAuthorityProviderOptions {
  trustStore: UserAuthorityTrustStore;
}

export class LocalUserAuthorityProvider implements UserAuthorityProvider {
  constructor(private readonly options: LocalUserAuthorityProviderOptions = {}) {}

  async verify(request: UserAuthorityVerificationRequest): Promise<UserAuthorityVerificationResult> {
    if (request.authorization.delegation) {
      return this.verifyDelegation(request);
    }

    if (request.authorization.authority) {
      return this.verifyAuthorityContext(request);
    }

    return { ok: false, reason: "user_authority_required" };
  }

  private verifyDelegation(request: UserAuthorityVerificationRequest): UserAuthorityVerificationResult {
    const proof = request.authorization.delegation;
    if (!proof?.delegationId || !proof.userSubject || !proof.agentId || !proof.consentId) {
      return { ok: false, reason: "user_authority_invalid" };
    }

    const userAuthority = userAuthorityFromDelegation(proof);
    if (proof.approvedActions && !proof.approvedActions.includes(request.action)) {
      return { ok: false, reason: "user_authority_action_mismatch", authority: userAuthority };
    }

    if (proof.businessId && proof.businessId !== request.request.businessId) {
      return { ok: false, reason: "user_authority_business_mismatch", authority: userAuthority };
    }

    if (proof.serviceId && proof.serviceId !== request.request.serviceId) {
      return { ok: false, reason: "user_authority_service_mismatch", authority: userAuthority };
    }

    if (proof.actionIntent && !actionIntentMatchesRequest(proof.actionIntent, request.action, request.request)) {
      return { ok: false, reason: "user_authority_action_mismatch", authority: userAuthority };
    }

    if (proof.actionIntent && actionIntentExpired(proof.actionIntent, this.now())) {
      return { ok: false, reason: "user_authority_expired", authority: userAuthority };
    }

    if (request.request.approvedActionIntentHash) {
      const expectedHash = proof.actionIntent ? createActionIntentHash(proof.actionIntent) : proof.actionIntentHash;
      if (!expectedHash || request.request.approvedActionIntentHash !== expectedHash) {
        return { ok: false, reason: "user_authority_action_hash_mismatch", authority: userAuthority };
      }
    }

    if (this.options.audience && proof.audience !== this.options.audience) {
      return { ok: false, reason: "user_authority_audience_mismatch", authority: userAuthority };
    }

    if (proof.expiresAt && dateExpiredOrInvalid(proof.expiresAt, this.now())) {
      return { ok: false, reason: "user_authority_expired", authority: userAuthority };
    }

    if (this.options.requireNonce && !proof.challengeId && !proof.nonce) {
      return { ok: false, reason: "user_authority_nonce_required", authority: userAuthority };
    }

    return { ok: true, authority: userAuthority };
  }

  private verifyAuthorityContext(request: UserAuthorityVerificationRequest): UserAuthorityVerificationResult {
    const authority = request.authorization.authority;
    if (!authority) {
      return { ok: false, reason: "user_authority_required" };
    }

    const userAuthority = userAuthorityFromAuthorityContext(authority);
    if (authority.action.layer !== request.actionLayer) {
      return { ok: false, reason: "user_authority_action_mismatch", authority: userAuthority };
    }

    if (authority.action.businessId && authority.action.businessId !== request.request.businessId) {
      return { ok: false, reason: "user_authority_business_mismatch", authority: userAuthority };
    }

    if (authority.action.serviceId && authority.action.serviceId !== request.request.serviceId) {
      return { ok: false, reason: "user_authority_service_mismatch", authority: userAuthority };
    }

    if (authority.action.bounds && !actionIntentMatchesRequest(authority.action.bounds, request.action, request.request)) {
      return { ok: false, reason: "user_authority_action_mismatch", authority: userAuthority };
    }

    if (authority.action.bounds && actionIntentExpired(authority.action.bounds, this.now())) {
      return { ok: false, reason: "user_authority_expired", authority: userAuthority };
    }

    if (request.request.approvedActionIntentHash && authority.action.bounds) {
      const expectedHash = createActionIntentHash(authority.action.bounds);
      if (request.request.approvedActionIntentHash !== expectedHash) {
        return { ok: false, reason: "user_authority_action_hash_mismatch", authority: userAuthority };
      }
    }

    if (this.options.audience && authority.validity.audience !== this.options.audience) {
      return { ok: false, reason: "user_authority_audience_mismatch", authority: userAuthority };
    }

    if (authority.validity.expiresAt && dateExpiredOrInvalid(authority.validity.expiresAt, this.now())) {
      return { ok: false, reason: "user_authority_expired", authority: userAuthority };
    }

    if (this.options.requireNonce && !authority.validity.replayHandle) {
      return { ok: false, reason: "user_authority_nonce_required", authority: userAuthority };
    }

    return { ok: true, authority: userAuthority };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export class TrustAnchoredUserAuthorityProvider implements UserAuthorityProvider {
  private readonly local: LocalUserAuthorityProvider;

  constructor(private readonly options: TrustAnchoredUserAuthorityProviderOptions) {
    this.local = new LocalUserAuthorityProvider(options);
  }

  async verify(request: UserAuthorityVerificationRequest): Promise<UserAuthorityVerificationResult> {
    const local = await this.local.verify(request);
    if (!local.ok) {
      return local;
    }

    const record = await this.options.trustStore.resolve(local.authority.ref);
    if (!record) {
      return { ok: false, reason: "user_authority_untrusted", authority: local.authority };
    }

    const failure = validateUserAuthorityTrustRecord(record, local.authority, this.now());
    if (failure) {
      return { ok: false, reason: failure, authority: local.authority };
    }

    return {
      ok: true,
      authority: {
        ...local.authority,
        assurance: record.assurance ?? local.authority.assurance,
        technology: record.technology ?? local.authority.technology,
        expiresAt: record.expiresAt ?? local.authority.expiresAt
      }
    };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export class StaticUserAuthorityTrustStore implements UserAuthorityTrustStore {
  private readonly records: Map<string, UserAuthorityTrustRecord>;

  constructor(records: UserAuthorityTrustRecord[] = []) {
    this.records = new Map(records.map((record) => [record.ref, { ...record }]));
  }

  async resolve(ref: string): Promise<UserAuthorityTrustRecord | null> {
    const record = this.records.get(ref);
    return record ? { ...record } : null;
  }
}

function userAuthorityFromDelegation(proof: DelegationProof): UserAuthorityContext {
  return {
    ref: `agentport-local-delegation:${proof.delegationId}`,
    subjectRef: proof.userSubject,
    consentRef: proof.consentId,
    agentId: proof.agentId,
    assurance: proof.assurance,
    technology: userAuthorityTechnologyFromDelegation(proof),
    audience: proof.audience,
    expiresAt: proof.expiresAt,
    nonce: proof.challengeId ?? proof.nonce,
    ...(proof.actionIntent ? { actionIntentHash: createActionIntentHash(proof.actionIntent) } : {})
  };
}

function userAuthorityFromAuthorityContext(authority: AuthorityContext): UserAuthorityContext {
  const evidence = authority.evidence[0];
  return {
    ref: evidence ? [evidence.kind, evidence.issuer, evidence.ref].filter(Boolean).join(":") : "authority-context",
    subjectRef: authority.user.subjectRef,
    consentRef: authority.user.consentRef,
    agentId: authority.caller.agentId,
    assurance: authority.assurance,
    technology: userAuthorityTechnologyFromAuthorityContext(authority),
    audience: authority.validity.audience,
    expiresAt: authority.validity.expiresAt,
    nonce: authority.validity.replayHandle,
    ...(authority.action.bounds ? { actionIntentHash: createActionIntentHash(authority.action.bounds) } : {})
  };
}

function actionIntentMatchesRequest(
  intent: ActionIntent,
  action: DelegatedAction,
  request: BookRequest | CancelRequest | RescheduleRequest
): boolean {
  if (intent.action !== action || intent.businessId !== request.businessId) {
    return false;
  }

  if (intent.serviceId && intent.serviceId !== request.serviceId) {
    return false;
  }

  if (intent.bindingId && intent.bindingId !== request.bindingId) {
    return false;
  }

  if (action === "book_service") {
    const book = request as BookRequest;
    return optionalIntentFieldMatches(intent.requestedType, book.requestedType)
      && optionalIntentFieldMatches(intent.slotStart, book.slotStart);
  }

  if (action === "cancel_service") {
    const cancel = request as CancelRequest;
    return optionalIntentFieldMatches(intent.confirmationId, cancel.confirmationId);
  }

  const reschedule = request as RescheduleRequest;
  return optionalIntentFieldMatches(intent.confirmationId, reschedule.confirmationId)
    && optionalIntentFieldMatches(intent.newSlotStart, reschedule.newSlotStart);
}

function optionalIntentFieldMatches<T>(intentValue: T | undefined, requestValue: T | undefined): boolean {
  return intentValue === undefined || intentValue === requestValue;
}

function actionIntentExpired(intent: ActionIntent, now: Date): boolean {
  return intent.expiresAt ? dateExpiredOrInvalid(intent.expiresAt, now) : false;
}

function dateExpiredOrInvalid(value: string, now: Date): boolean {
  const expiresAt = Date.parse(value);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

function validateUserAuthorityTrustRecord(
  record: UserAuthorityTrustRecord,
  authority: UserAuthorityContext,
  now: Date
): UserAuthorityVerificationFailureReason | undefined {
  if (record.status === "revoked") {
    return "user_authority_revoked";
  }

  if (record.status === "stale") {
    return "user_authority_stale";
  }

  if (record.status !== "active") {
    return "user_authority_untrusted";
  }

  if (record.subjectRef && record.subjectRef !== authority.subjectRef) {
    return "user_authority_invalid";
  }

  if (record.consentRef && record.consentRef !== authority.consentRef) {
    return "user_authority_invalid";
  }

  if (record.agentId && record.agentId !== authority.agentId) {
    return "user_authority_invalid";
  }

  if (record.technology && record.technology !== authority.technology) {
    return "user_authority_technology_not_allowed";
  }

  if (record.audience && record.audience !== authority.audience) {
    return "user_authority_audience_mismatch";
  }

  if (record.actionIntentHash && record.actionIntentHash !== authority.actionIntentHash) {
    return "user_authority_action_hash_mismatch";
  }

  if (record.expiresAt && dateExpiredOrInvalid(record.expiresAt, now)) {
    return "user_authority_expired";
  }

  return undefined;
}

function userAuthorityTechnologyFromDelegation(proof: DelegationProof): UserAuthorityTechnology {
  if (proof.assurance === "passkey") {
    return "passkey";
  }

  if (proof.assurance === "wallet") {
    return "wallet";
  }

  if (proof.assurance === "session" || proof.assurance === "account" || proof.tokenConfirmation?.method === "session") {
    return "oidc-session";
  }

  return "agentport-local";
}

function userAuthorityTechnologyFromAuthorityContext(authority: AuthorityContext): UserAuthorityTechnology {
  const kind = authority.evidence[0]?.kind;
  if (kind === "ap2-mandate" || kind === "ucp-http-signature" || kind === "acp-checkout") {
    return kind;
  }

  return "agentport-local";
}

export interface TrustAnchoredBusinessPortAttestationProviderOptions {
  store: BusinessPortAttestationStore;
  trustRoot?: BusinessPortTrustRoot;
  now?: () => Date;
}

export class Ed25519BusinessPortAttestationSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(
    attestation: BusinessPortAttestation,
    input: { signedAt?: string } = {}
  ): SignedBusinessPortAttestation {
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(input.signedAt ? { signedAt: input.signedAt } : {})
    };
    const signature = cryptoSign(
      null,
      Buffer.from(businessPortAttestationSigningInput(attestation, signatureMetadata)),
      createPrivateKey(this.privateKeyPem)
    );

    return {
      type: "agentport.business_port_attestation.v0.1",
      attestation,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export class TrustAnchoredBusinessPortAttestationProvider implements BusinessPortAttestationProvider {
  constructor(private readonly options: TrustAnchoredBusinessPortAttestationProviderOptions) {}

  async verify(request: BusinessPortVerificationRequest): Promise<BusinessPortVerificationResult> {
    const record = await this.options.store.resolve(request);
    if (!record) {
      return { ok: false, reason: "business_port_attestation_required" };
    }

    const attestation = businessPortAttestationFromRecord(record);
    if (this.options.trustRoot) {
      const signatureFailure = verifyBusinessPortAttestationSignature(record, this.options.trustRoot, this.options.now?.() ?? new Date());
      if (signatureFailure) {
        return { ok: false, reason: signatureFailure, attestation };
      }
    }

    return validateBusinessPortAttestation(attestation, request, this.options.now?.() ?? new Date());
  }
}

export class StaticBusinessPortAttestationStore implements BusinessPortAttestationStore {
  private readonly attestations: BusinessPortAttestationRecord[];

  constructor(attestations: BusinessPortAttestationRecord[] = []) {
    this.attestations = attestations.map(cloneBusinessPortAttestationRecord);
  }

  async resolve(request: BusinessPortVerificationRequest): Promise<BusinessPortAttestationRecord | null> {
    const record = this.attestations.find((candidate) => {
      const attestation = businessPortAttestationFromRecord(candidate);
      return (
        attestation.businessId === request.tenant.id
          && (attestation.bindingId === undefined || attestation.bindingId === request.bindingId)
          && (attestation.platform === undefined || attestation.platform === request.binding.platform)
      );
    });

    return record ? cloneBusinessPortAttestationRecord(record) : null;
  }
}

function cloneBusinessPortAttestationRecord(record: BusinessPortAttestationRecord): BusinessPortAttestationRecord {
  if (isSignedBusinessPortAttestation(record)) {
    return {
      type: record.type,
      attestation: { ...record.attestation },
      signature: { ...record.signature }
    };
  }

  return { ...record };
}

function businessPortAttestationFromRecord(record: BusinessPortAttestationRecord): BusinessPortAttestation {
  return isSignedBusinessPortAttestation(record) ? record.attestation : record;
}

function isSignedBusinessPortAttestation(record: BusinessPortAttestationRecord): record is SignedBusinessPortAttestation {
  return (
    "type" in record
      && record.type === "agentport.business_port_attestation.v0.1"
      && "attestation" in record
      && typeof record.attestation === "object"
      && record.attestation !== null
      && "signature" in record
      && typeof record.signature === "object"
      && record.signature !== null
  );
}

function verifyBusinessPortAttestationSignature(
  record: BusinessPortAttestationRecord,
  trustRoot: BusinessPortTrustRoot,
  now: Date
): BusinessPortVerificationFailureReason | undefined {
  if (!isSignedBusinessPortAttestation(record)) {
    return "business_port_signature_required";
  }

  if (record.signature.alg !== "EdDSA") {
    return "business_port_signature_malformed";
  }

  if (!trustRoot.trustedIssuers.includes(record.signature.issuer)) {
    return "business_port_signature_issuer_untrusted";
  }

  if (record.signature.signedAt) {
    const signedAt = Date.parse(record.signature.signedAt);
    if (!Number.isFinite(signedAt) || signedAt > now.getTime()) {
      return "business_port_signature_malformed";
    }
  }

  const keyStatus = trustRoot.keyStatuses?.[record.signature.keyId] ?? "active";
  if (keyStatus === "revoked") {
    return "business_port_signature_key_revoked";
  }

  if (keyStatus === "stale") {
    return "business_port_signature_key_stale";
  }

  const publicKey = trustRoot.publicKeys[record.signature.keyId];
  if (!publicKey) {
    return "business_port_signature_key_missing";
  }

  if (!record.signature.signature || !/^[A-Za-z0-9_-]+$/.test(record.signature.signature)) {
    return "business_port_signature_malformed";
  }

  const signatureMetadata = {
    issuer: record.signature.issuer,
    keyId: record.signature.keyId,
    alg: record.signature.alg,
    ...(record.signature.signedAt ? { signedAt: record.signature.signedAt } : {})
  };
  try {
    const ok = cryptoVerify(
      null,
      Buffer.from(businessPortAttestationSigningInput(record.attestation, signatureMetadata)),
      businessPortPublicKeyObject(publicKey),
      base64UrlDecode(record.signature.signature)
    );

    return ok ? undefined : "business_port_signature_invalid";
  } catch {
    return "business_port_signature_malformed";
  }
}

function businessPortAttestationSigningInput(
  attestation: BusinessPortAttestation,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-business-port-attestation-v0.1\n${businessPortStableJson(signatureMetadata)}\n${businessPortStableJson(attestation)}`;
}

function businessPortPublicKeyObject(material: BusinessPortTrustRootPublicKey) {
  return typeof material === "string" ? createPublicKey(material) : createPublicKey({ key: material, format: "jwk" });
}

function businessPortStableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(businessPortStableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${businessPortStableJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): Buffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

export class LocalJsonBusinessPortAttestationStore implements BusinessPortAttestationStore {
  constructor(private readonly path: string) {}

  async resolve(request: BusinessPortVerificationRequest): Promise<BusinessPortAttestationRecord | null> {
    const store = await this.readStore();
    return new StaticBusinessPortAttestationStore(store.attestations).resolve(request);
  }

  private async readStore(): Promise<{ attestations: BusinessPortAttestationRecord[] }> {
    try {
      const raw = await readFile(resolve(process.cwd(), this.path), "utf8");
      const parsed = JSON.parse(raw) as { attestations?: BusinessPortAttestationRecord[] } | BusinessPortAttestationRecord[];
      if (Array.isArray(parsed)) {
        return { attestations: parsed };
      }

      return {
        attestations: Array.isArray(parsed.attestations) ? parsed.attestations : []
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return { attestations: [] };
      }

      throw error;
    }
  }
}

export class StaticBusinessPortAttestationProvider implements BusinessPortAttestationProvider {
  private readonly provider: TrustAnchoredBusinessPortAttestationProvider;

  constructor(attestations: BusinessPortAttestationRecord[] = []) {
    this.provider = new TrustAnchoredBusinessPortAttestationProvider({
      store: new StaticBusinessPortAttestationStore(attestations)
    });
  }

  async verify(request: BusinessPortVerificationRequest): Promise<BusinessPortVerificationResult> {
    return this.provider.verify(request);
  }
}

function validateBusinessPortAttestation(
  attestation: BusinessPortAttestation,
  request: BusinessPortVerificationRequest,
  now: Date
): BusinessPortVerificationResult {
  if (attestation.businessId !== request.tenant.id) {
    return { ok: false, reason: "business_port_business_mismatch", attestation };
  }

  if (attestation.bindingId !== undefined && attestation.bindingId !== request.bindingId) {
    return { ok: false, reason: "business_port_binding_mismatch", attestation };
  }

  if (attestation.platform !== undefined && attestation.platform !== request.binding.platform) {
    return { ok: false, reason: "business_port_platform_mismatch", attestation };
  }

  const endpoints = [request.binding.bookingUrl, request.binding.phone].filter((value): value is string => typeof value === "string");
  if (attestation.endpoint !== undefined && !endpoints.includes(attestation.endpoint)) {
    return { ok: false, reason: "business_port_endpoint_mismatch", attestation };
  }

  if (attestation.status === "revoked") {
    return { ok: false, reason: "business_port_revoked", attestation };
  }

  if (attestation.status === "stale") {
    return { ok: false, reason: "business_port_stale", attestation };
  }

  if (attestation.status !== "verified") {
    return { ok: false, reason: "business_port_unverified", attestation };
  }

  if (attestation.expiresAt) {
    const expiresAt = Date.parse(attestation.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      return { ok: false, reason: "business_port_expired", attestation };
    }
  }

  return { ok: true, attestation };
}

export interface ActionIntentLifecycleStore {
  save(record: ActionIntentLifecycleRecord): Promise<void>;
  resolve(intentId: string): Promise<ActionIntentLifecycleRecord | null>;
  poll(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    limit?: number;
    waitMs?: number;
  }): Promise<{
    cursor: number;
    events: ActionIntentLifecycleEvent[];
  }>;
}

export interface ActionIntentResultSink {
  deliver(record: ActionIntentLifecycleRecord): Promise<ActionIntentResultDeliveryRecord | null>;
  resolve(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null>;
  list(q?: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    status?: ActionIntentResultDeliveryStatus;
    limit?: number;
  }): Promise<{
    cursor: number;
    deliveries: ActionIntentResultDeliveryRecord[];
  }>;
  acknowledge(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null>;
  retryFailed(q?: {
    now?: Date;
    limit?: number;
  }): Promise<ActionIntentResultDeliveryRecord[]>;
}

export interface ActionIntentWebhookDispatcher {
  post(input: {
    target: string;
    idempotencyKey: string;
    payloadHash: string;
    record: ActionIntentResultDeliveryRecord;
    signature?: ActionIntentResultDeliverySignature;
  }): Promise<{
    statusCode?: number;
  }>;
}

export interface ActionIntentResultDeliverySigner {
  sign(input: {
    deliveryId: string;
    idempotencyKey: string;
    payloadHash: string;
    intentId: string;
    agentSessionId: string;
  }): Promise<ActionIntentResultDeliverySignature>;
}

export interface ActionIntentResultSinkOptions {
  webhook?: ActionIntentWebhookDispatcher;
  signer?: ActionIntentResultDeliverySigner;
  now?: () => Date;
  retryDelayMs?: number;
}

export interface RedisActionIntentStoreOptions {
  restUrl: string;
  token: string;
  keyPrefix?: string;
  fetch?: typeof fetch;
}

export interface RedisActionIntentResultSinkOptions extends RedisActionIntentStoreOptions, ActionIntentResultSinkOptions {}

export class InMemoryActionIntentLifecycleStore implements ActionIntentLifecycleStore {
  private readonly records = new Map<string, ActionIntentLifecycleRecord>();
  private readonly events: ActionIntentLifecycleEvent[] = [];
  private readonly waiters = new Set<() => void>();
  private cursor = 0;

  async save(record: ActionIntentLifecycleRecord): Promise<void> {
    const cloned = structuredClone(record);
    this.records.set(record.intentId, cloned);
    this.cursor += 1;
    this.events.push({
      cursor: this.cursor,
      intentId: cloned.intentId,
      agentSessionId: cloned.agentSessionId,
      status: cloned.status,
      nextStep: cloned.nextStep,
      at: cloned.updatedAt,
      resultType: cloned.execution?.resultType,
      reason: cloned.execution?.reason,
      resultDeliveryId: cloned.resultDeliveryState?.deliveryId,
      resultDeliveryStatus: cloned.resultDeliveryState?.status
    });
    this.notifyWaiters();
  }

  async resolve(intentId: string): Promise<ActionIntentLifecycleRecord | null> {
    const record = this.records.get(intentId);
    return record ? structuredClone(record) : null;
  }

  async poll(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    limit?: number;
    waitMs?: number;
  }): Promise<{
    cursor: number;
    events: ActionIntentLifecycleEvent[];
  }> {
    const after = q.after ?? 0;
    let events = this.pollEvents(q, after);
    if (events.length === 0 && q.waitMs && q.waitMs > 0) {
      await this.waitForEvent(q.waitMs);
      events = this.pollEvents(q, after);
    }

    return {
      cursor: events.at(-1)?.cursor ?? after,
      events: structuredClone(events)
    };
  }

  private pollEvents(q: {
    agentSessionId?: string;
    intentId?: string;
    limit?: number;
  }, after: number): ActionIntentLifecycleEvent[] {
    const limit = q.limit ?? 100;
    return this.events
      .filter((event) => event.cursor > after)
      .filter((event) => q.agentSessionId === undefined || event.agentSessionId === q.agentSessionId)
      .filter((event) => q.intentId === undefined || event.intentId === q.intentId)
      .slice(0, limit);
  }

  private waitForEvent(waitMs: number): Promise<void> {
    return new Promise((resolve) => {
      let timeout: NodeJS.Timeout;
      const waiter = () => {
        clearTimeout(timeout);
        this.waiters.delete(waiter);
        resolve();
      };
      timeout = setTimeout(waiter, waitMs);
      this.waiters.add(waiter);
    });
  }

  private notifyWaiters(): void {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of waiters) {
      waiter();
    }
  }
}

export class InMemoryActionIntentResultSink implements ActionIntentResultSink {
  private readonly deliveries: ActionIntentResultDeliveryRecord[] = [];
  private cursor = 0;

  constructor(private readonly options: ActionIntentResultSinkOptions = {}) {}

  async deliver(record: ActionIntentLifecycleRecord): Promise<ActionIntentResultDeliveryRecord | null> {
    const delivery = await createActionIntentResultDelivery(record, ++this.cursor, this.options);
    if (!delivery) {
      return null;
    }

    this.deliveries.push(structuredClone(delivery));
    return structuredClone(delivery);
  }

  async resolve(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null> {
    const delivery = this.deliveries.find((candidate) => candidate.deliveryId === deliveryId);
    return delivery ? structuredClone(delivery) : null;
  }

  async list(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    status?: ActionIntentResultDeliveryStatus;
    limit?: number;
  } = {}): Promise<{
    cursor: number;
    deliveries: ActionIntentResultDeliveryRecord[];
  }> {
    const after = q.after ?? 0;
    const limit = q.limit ?? 100;
    const deliveries = this.deliveries
      .filter((delivery) => delivery.cursor > after)
      .filter((delivery) => q.intentId === undefined || delivery.intentId === q.intentId)
      .filter((delivery) => q.agentSessionId === undefined || delivery.agentSessionId === q.agentSessionId)
      .filter((delivery) => q.status === undefined || delivery.status === q.status)
      .slice(0, limit);

    return {
      cursor: deliveries.at(-1)?.cursor ?? after,
      deliveries: structuredClone(deliveries)
    };
  }

  async acknowledge(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null> {
    const delivery = this.deliveries.find((candidate) => candidate.deliveryId === deliveryId);
    if (!delivery) {
      return null;
    }

    const now = resultSinkNow(this.options).toISOString();
    delivery.status = "acknowledged";
    delivery.acknowledgedAt = now;
    delivery.updatedAt = now;
    return structuredClone(delivery);
  }

  async retryFailed(q: { now?: Date; limit?: number } = {}): Promise<ActionIntentResultDeliveryRecord[]> {
    const now = q.now ?? resultSinkNow(this.options);
    const limit = q.limit ?? 100;
    const retried: ActionIntentResultDeliveryRecord[] = [];
    for (const delivery of this.deliveries) {
      if (retried.length >= limit) {
        break;
      }

      if (delivery.status !== "failed" || delivery.channel !== "webhook") {
        continue;
      }

      if (delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > now.getTime()) {
        continue;
      }

      await dispatchWebhookDelivery(delivery, this.options);
      retried.push(structuredClone(delivery));
    }

    return retried;
  }
}

interface FileActionIntentLifecycleState {
  cursor: number;
  records: Record<string, ActionIntentLifecycleRecord>;
  events: ActionIntentLifecycleEvent[];
}

export class FileActionIntentLifecycleStore implements ActionIntentLifecycleStore {
  private readonly waiters = new Set<() => void>();

  constructor(private readonly path: string) {}

  async save(record: ActionIntentLifecycleRecord): Promise<void> {
    const state = await this.load();
    const cloned = structuredClone(record);
    state.records[record.intentId] = cloned;
    state.cursor += 1;
    state.events.push({
      cursor: state.cursor,
      intentId: cloned.intentId,
      agentSessionId: cloned.agentSessionId,
      status: cloned.status,
      nextStep: cloned.nextStep,
      at: cloned.updatedAt,
      resultType: cloned.execution?.resultType,
      reason: cloned.execution?.reason,
      resultDeliveryId: cloned.resultDeliveryState?.deliveryId,
      resultDeliveryStatus: cloned.resultDeliveryState?.status
    });
    await this.saveState(state);
    this.notifyWaiters();
  }

  async resolve(intentId: string): Promise<ActionIntentLifecycleRecord | null> {
    const state = await this.load();
    const record = state.records[intentId];
    return record ? structuredClone(record) : null;
  }

  async poll(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    limit?: number;
    waitMs?: number;
  }): Promise<{
    cursor: number;
    events: ActionIntentLifecycleEvent[];
  }> {
    const after = q.after ?? 0;
    let events = this.pollEvents(await this.load(), q, after);
    if (events.length === 0 && q.waitMs && q.waitMs > 0) {
      await this.waitForEvent(q.waitMs);
      events = this.pollEvents(await this.load(), q, after);
    }

    return {
      cursor: events.at(-1)?.cursor ?? after,
      events: structuredClone(events)
    };
  }

  private pollEvents(state: FileActionIntentLifecycleState, q: {
    agentSessionId?: string;
    intentId?: string;
    limit?: number;
  }, after: number): ActionIntentLifecycleEvent[] {
    const limit = q.limit ?? 100;
    return state.events
      .filter((event) => event.cursor > after)
      .filter((event) => q.agentSessionId === undefined || event.agentSessionId === q.agentSessionId)
      .filter((event) => q.intentId === undefined || event.intentId === q.intentId)
      .slice(0, limit);
  }

  private async load(): Promise<FileActionIntentLifecycleState> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<FileActionIntentLifecycleState>;
      return {
        cursor: typeof parsed.cursor === "number" ? parsed.cursor : 0,
        records: parsed.records ?? {},
        events: parsed.events ?? []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          cursor: 0,
          records: {},
          events: []
        };
      }

      throw error;
    }
  }

  private async saveState(state: FileActionIntentLifecycleState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private waitForEvent(waitMs: number): Promise<void> {
    return new Promise((resolve) => {
      let timeout: NodeJS.Timeout;
      const waiter = () => {
        clearTimeout(timeout);
        this.waiters.delete(waiter);
        resolve();
      };
      timeout = setTimeout(waiter, waitMs);
      this.waiters.add(waiter);
    });
  }

  private notifyWaiters(): void {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of waiters) {
      waiter();
    }
  }
}

interface FileActionIntentResultSinkState {
  cursor: number;
  deliveries: ActionIntentResultDeliveryRecord[];
}

export class FileActionIntentResultSink implements ActionIntentResultSink {
  constructor(
    private readonly path: string,
    private readonly options: ActionIntentResultSinkOptions = {}
  ) {}

  async deliver(record: ActionIntentLifecycleRecord): Promise<ActionIntentResultDeliveryRecord | null> {
    const state = await this.load();
    const delivery = await createActionIntentResultDelivery(record, state.cursor + 1, this.options);
    if (!delivery) {
      return null;
    }

    state.cursor = delivery.cursor;
    state.deliveries.push(delivery);
    await this.saveState(state);
    return structuredClone(delivery);
  }

  async resolve(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null> {
    const state = await this.load();
    const delivery = state.deliveries.find((candidate) => candidate.deliveryId === deliveryId);
    return delivery ? structuredClone(delivery) : null;
  }

  async list(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    status?: ActionIntentResultDeliveryStatus;
    limit?: number;
  } = {}): Promise<{
    cursor: number;
    deliveries: ActionIntentResultDeliveryRecord[];
  }> {
    const after = q.after ?? 0;
    const limit = q.limit ?? 100;
    const state = await this.load();
    const deliveries = state.deliveries
      .filter((delivery) => delivery.cursor > after)
      .filter((delivery) => q.intentId === undefined || delivery.intentId === q.intentId)
      .filter((delivery) => q.agentSessionId === undefined || delivery.agentSessionId === q.agentSessionId)
      .filter((delivery) => q.status === undefined || delivery.status === q.status)
      .slice(0, limit);

    return {
      cursor: deliveries.at(-1)?.cursor ?? after,
      deliveries: structuredClone(deliveries)
    };
  }

  async acknowledge(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null> {
    const state = await this.load();
    const delivery = state.deliveries.find((candidate) => candidate.deliveryId === deliveryId);
    if (!delivery) {
      return null;
    }

    const now = resultSinkNow(this.options).toISOString();
    delivery.status = "acknowledged";
    delivery.acknowledgedAt = now;
    delivery.updatedAt = now;
    await this.saveState(state);
    return structuredClone(delivery);
  }

  async retryFailed(q: { now?: Date; limit?: number } = {}): Promise<ActionIntentResultDeliveryRecord[]> {
    const state = await this.load();
    const now = q.now ?? resultSinkNow(this.options);
    const limit = q.limit ?? 100;
    const retried: ActionIntentResultDeliveryRecord[] = [];
    for (const delivery of state.deliveries) {
      if (retried.length >= limit) {
        break;
      }

      if (delivery.status !== "failed" || delivery.channel !== "webhook") {
        continue;
      }

      if (delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > now.getTime()) {
        continue;
      }

      await dispatchWebhookDelivery(delivery, this.options);
      retried.push(structuredClone(delivery));
    }

    if (retried.length > 0) {
      await this.saveState(state);
    }

    return retried;
  }

  private async load(): Promise<FileActionIntentResultSinkState> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<FileActionIntentResultSinkState>;
      return {
        cursor: typeof parsed.cursor === "number" ? parsed.cursor : 0,
        deliveries: parsed.deliveries ?? []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          cursor: 0,
          deliveries: []
        };
      }

      throw error;
    }
  }

  private async saveState(state: FileActionIntentResultSinkState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}

export class RedisActionIntentLifecycleStore implements ActionIntentLifecycleStore {
  readonly #client: RedisJsonStateClient<FileActionIntentLifecycleState>;

  constructor(options: RedisActionIntentStoreOptions) {
    this.#client = new RedisJsonStateClient({
      ...options,
      keyName: "action-intent-lifecycles",
      empty: () => ({
        cursor: 0,
        records: {},
        events: []
      })
    });
  }

  async save(record: ActionIntentLifecycleRecord): Promise<void> {
    const state = await this.#client.load();
    const cloned = structuredClone(record);
    state.records[record.intentId] = cloned;
    state.cursor += 1;
    state.events.push({
      cursor: state.cursor,
      intentId: cloned.intentId,
      agentSessionId: cloned.agentSessionId,
      status: cloned.status,
      nextStep: cloned.nextStep,
      at: cloned.updatedAt,
      resultType: cloned.execution?.resultType,
      reason: cloned.execution?.reason,
      resultDeliveryId: cloned.resultDeliveryState?.deliveryId,
      resultDeliveryStatus: cloned.resultDeliveryState?.status
    });
    await this.#client.save(state);
  }

  async resolve(intentId: string): Promise<ActionIntentLifecycleRecord | null> {
    const state = await this.#client.load();
    const record = state.records[intentId];
    return record ? structuredClone(record) : null;
  }

  async poll(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    limit?: number;
    waitMs?: number;
  }): Promise<{
    cursor: number;
    events: ActionIntentLifecycleEvent[];
  }> {
    const after = q.after ?? 0;
    const state = await this.#client.load();
    const limit = q.limit ?? 100;
    const events = state.events
      .filter((event) => event.cursor > after)
      .filter((event) => q.agentSessionId === undefined || event.agentSessionId === q.agentSessionId)
      .filter((event) => q.intentId === undefined || event.intentId === q.intentId)
      .slice(0, limit);

    return {
      cursor: events.at(-1)?.cursor ?? after,
      events: structuredClone(events)
    };
  }
}

export class RedisActionIntentResultSink implements ActionIntentResultSink {
  readonly #client: RedisJsonStateClient<FileActionIntentResultSinkState>;
  readonly #options: ActionIntentResultSinkOptions;

  constructor(options: RedisActionIntentResultSinkOptions) {
    this.#client = new RedisJsonStateClient({
      ...options,
      keyName: "action-intent-results",
      empty: () => ({
        cursor: 0,
        deliveries: []
      })
    });
    this.#options = options;
  }

  async deliver(record: ActionIntentLifecycleRecord): Promise<ActionIntentResultDeliveryRecord | null> {
    const state = await this.#client.load();
    const delivery = await createActionIntentResultDelivery(record, state.cursor + 1, this.#options);
    if (!delivery) {
      return null;
    }

    state.cursor = delivery.cursor;
    state.deliveries.push(delivery);
    await this.#client.save(state);
    return structuredClone(delivery);
  }

  async resolve(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null> {
    const state = await this.#client.load();
    const delivery = state.deliveries.find((candidate) => candidate.deliveryId === deliveryId);
    return delivery ? structuredClone(delivery) : null;
  }

  async list(q: {
    after?: number;
    agentSessionId?: string;
    intentId?: string;
    status?: ActionIntentResultDeliveryStatus;
    limit?: number;
  } = {}): Promise<{
    cursor: number;
    deliveries: ActionIntentResultDeliveryRecord[];
  }> {
    const after = q.after ?? 0;
    const limit = q.limit ?? 100;
    const state = await this.#client.load();
    const deliveries = state.deliveries
      .filter((delivery) => delivery.cursor > after)
      .filter((delivery) => q.intentId === undefined || delivery.intentId === q.intentId)
      .filter((delivery) => q.agentSessionId === undefined || delivery.agentSessionId === q.agentSessionId)
      .filter((delivery) => q.status === undefined || delivery.status === q.status)
      .slice(0, limit);

    return {
      cursor: deliveries.at(-1)?.cursor ?? after,
      deliveries: structuredClone(deliveries)
    };
  }

  async acknowledge(deliveryId: string): Promise<ActionIntentResultDeliveryRecord | null> {
    const state = await this.#client.load();
    const delivery = state.deliveries.find((candidate) => candidate.deliveryId === deliveryId);
    if (!delivery) {
      return null;
    }

    const now = resultSinkNow(this.#options).toISOString();
    delivery.status = "acknowledged";
    delivery.acknowledgedAt = now;
    delivery.updatedAt = now;
    await this.#client.save(state);
    return structuredClone(delivery);
  }

  async retryFailed(q: { now?: Date; limit?: number } = {}): Promise<ActionIntentResultDeliveryRecord[]> {
    const state = await this.#client.load();
    const now = q.now ?? resultSinkNow(this.#options);
    const limit = q.limit ?? 100;
    const retried: ActionIntentResultDeliveryRecord[] = [];
    for (const delivery of state.deliveries) {
      if (retried.length >= limit) {
        break;
      }

      if (delivery.status !== "failed" || delivery.channel !== "webhook") {
        continue;
      }

      if (delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > now.getTime()) {
        continue;
      }

      await dispatchWebhookDelivery(delivery, this.#options);
      retried.push(structuredClone(delivery));
    }

    if (retried.length > 0) {
      await this.#client.save(state);
    }

    return retried;
  }
}

interface RedisJsonStateClientOptions<T> extends RedisActionIntentStoreOptions {
  keyName: string;
  empty: () => T;
}

class RedisJsonStateClient<T> {
  readonly #restUrl: string;
  readonly #token: string;
  readonly #keyPrefix: string;
  readonly #keyName: string;
  readonly #empty: () => T;
  readonly #fetch: typeof fetch;

  constructor(options: RedisJsonStateClientOptions<T>) {
    this.#restUrl = options.restUrl.replace(/\/+$/, "");
    this.#token = options.token;
    this.#keyPrefix = options.keyPrefix ?? "agentport";
    this.#keyName = options.keyName;
    this.#empty = options.empty;
    this.#fetch = options.fetch ?? fetch;
  }

  async load(): Promise<T> {
    const raw = await this.command<string | null>(["GET", this.key()]);
    if (!raw) {
      return this.#empty();
    }
    return JSON.parse(raw) as T;
  }

  async save(state: T): Promise<void> {
    await this.command(["SET", this.key(), JSON.stringify(state)]);
  }

  private async command<TCommand = unknown>(command: Array<string | number>) {
    const response = await this.#fetch(this.#restUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(command)
    });

    if (!response.ok) {
      throw new Error(`redis_action_intent_store_http_${response.status}`);
    }

    const payload = await response.json() as { result?: TCommand; error?: string };
    if (payload.error) {
      throw new Error(`redis_action_intent_store_error:${payload.error}`);
    }

    return payload.result as TCommand;
  }

  private key() {
    return `${this.#keyPrefix}:${this.#keyName}`;
  }
}

async function createActionIntentResultDelivery(
  record: ActionIntentLifecycleRecord,
  cursor: number,
  options: ActionIntentResultSinkOptions
): Promise<ActionIntentResultDeliveryRecord | null> {
  if (!record.resultDelivery || !record.execution) {
    return null;
  }

  if (record.status !== "succeeded" && record.status !== "failed" && record.status !== "expired") {
    return null;
  }

  const payload = deliveryPayload(record);
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const now = resultSinkNow(options).toISOString();
  const idempotencyKey = `intent:${record.intentId}:result:${payloadHash.slice(0, 16)}`;
  const deliveryId = `intent_delivery_${createHash("sha256")
    .update(JSON.stringify({
      ...payload,
      target: record.resultDelivery.target
    }))
    .digest("hex")
    .slice(0, 24)}`;
  const delivery: ActionIntentResultDeliveryRecord = {
    cursor,
    deliveryId,
    idempotencyKey,
    intentId: record.intentId,
    agentSessionId: record.agentSessionId,
    channel: record.resultDelivery.channel,
    target: record.resultDelivery.target,
    deliveredAt: now,
    updatedAt: now,
    status: "delivered",
    payloadHash,
    lifecycleStatus: record.status,
    actionIntent: structuredClone(record.actionIntent),
    result: {
      resultType: record.execution.resultType,
      reason: record.execution.reason,
      receiptId: record.execution.receiptId,
      confirmationId: record.execution.confirmationId
    },
    attempts: []
  };
  if (options.signer) {
    delivery.signature = await options.signer.sign({
      deliveryId,
      idempotencyKey,
      payloadHash,
      intentId: record.intentId,
      agentSessionId: record.agentSessionId
    });
  }

  if (delivery.channel === "webhook") {
    await dispatchWebhookDelivery(delivery, options);
  } else {
    delivery.attempts.push({
      at: now,
      status: "delivered"
    });
  }

  return delivery;
}

function deliveryPayload(record: ActionIntentLifecycleRecord) {
  return {
    intentId: record.intentId,
    agentSessionId: record.agentSessionId,
    status: record.status,
    updatedAt: record.updatedAt,
    actionIntent: record.actionIntent,
    result: record.execution
  };
}

async function dispatchWebhookDelivery(
  delivery: ActionIntentResultDeliveryRecord,
  options: ActionIntentResultSinkOptions
): Promise<void> {
  const now = resultSinkNow(options);
  if (!options.webhook) {
    markDeliveryFailed(delivery, now, "webhook_dispatcher_unavailable", options);
    return;
  }

  try {
    const result = await options.webhook.post({
      target: delivery.target,
      idempotencyKey: delivery.idempotencyKey,
      payloadHash: delivery.payloadHash,
      record: structuredClone(delivery),
      signature: delivery.signature
    });
    delivery.status = "delivered";
    delivery.updatedAt = now.toISOString();
    delivery.nextAttemptAt = undefined;
    delivery.attempts.push({
      at: now.toISOString(),
      status: "delivered",
      statusCode: result.statusCode
    });
  } catch (error) {
    markDeliveryFailed(delivery, now, error instanceof Error ? error.message : "webhook_dispatch_failed", options);
  }
}

function markDeliveryFailed(
  delivery: ActionIntentResultDeliveryRecord,
  now: Date,
  reason: string,
  options: ActionIntentResultSinkOptions
): void {
  delivery.status = "failed";
  delivery.updatedAt = now.toISOString();
  delivery.nextAttemptAt = new Date(now.getTime() + (options.retryDelayMs ?? 60_000)).toISOString();
  delivery.attempts.push({
    at: now.toISOString(),
    status: "failed",
    reason
  });
}

function resultSinkNow(options: ActionIntentResultSinkOptions): Date {
  return options.now?.() ?? new Date();
}

export function actionIntentResultDeliverySummary(
  delivery: ActionIntentResultDeliveryRecord
): ActionIntentResultDeliverySummary {
  const lastAttempt = delivery.attempts.at(-1);
  return {
    deliveryId: delivery.deliveryId,
    channel: delivery.channel,
    target: delivery.target,
    status: delivery.status,
    updatedAt: delivery.updatedAt,
    payloadHash: delivery.payloadHash,
    attempts: delivery.attempts.length,
    reason: lastAttempt?.reason,
    acknowledgedAt: delivery.acknowledgedAt,
    nextAttemptAt: delivery.nextAttemptAt,
    signature: delivery.signature
  };
}

export class NullCredentialVault implements CredentialVault {
  async resolve(): Promise<Record<string, string | undefined> | null> {
    return null;
  }
}

export class InMemoryCredentialVault implements CredentialVault {
  private readonly records = new Map<string, Record<string, string | undefined>>();

  constructor(initial: Array<{ ref: CredentialRef; credentials: Record<string, string | undefined> }> = []) {
    for (const item of initial) {
      this.set(item.ref, item.credentials);
    }
  }

  set(ref: CredentialRef, credentials: Record<string, string | undefined>): void {
    this.records.set(credentialRefKey(ref), { ...credentials });
  }

  async resolve(ref: CredentialRef): Promise<Record<string, string | undefined> | null> {
    const credentials = this.records.get(credentialRefKey(ref));
    return credentials ? { ...credentials } : null;
  }
}

export async function resolveBindingCredentials(
  binding: BackendBinding,
  credentials: CredentialVault = new NullCredentialVault()
): Promise<BackendBinding> {
  if (!binding.credentialRef) {
    return binding;
  }

  const resolved = await credentials.resolve(binding.credentialRef);
  const { credentials: _existingCredentials, ...withoutCredentials } = binding;
  return resolved ? { ...withoutCredentials, credentials: resolved } : withoutCredentials;
}

function credentialRefKey(ref: CredentialRef): string {
  return `${ref.vaultId}:${ref.key}`;
}

export class LocalJsonTenantStore implements TenantStore {
  private tenantsPromise?: Promise<Tenant[]>;

  constructor(private readonly path: string) {}

  async resolveTenant(businessId: string): Promise<Tenant | null> {
    const tenants = await this.load();
    return tenants.find((tenant) => tenant.id === businessId) ?? null;
  }

  async findNear(q: {
    service: string;
    lat?: number;
    lng?: number;
    text?: string;
    radiusKm: number;
  }): Promise<TenantMatch[]> {
    const tenants = await this.load();
    const term = q.service.trim().toLowerCase();
    const text = q.text?.trim().toLowerCase();

    return tenants
      .map((tenant) => {
        const services = tenant.bindings.flatMap((binding) => binding.staticServices ?? []);
        const tenantMatched = text ? tenantMatchesSearchText(tenant, text) : false;
        const matchingServices = services.filter((service) => {
          const haystack = `${service.name} ${service.description ?? ""}`.toLowerCase();
          return haystack.includes(term) || tenantMatched;
        });

        return {
          tenant,
          services: matchingServices.length > 0 ? matchingServices : services,
          tenantMatched
        };
      })
      .filter((match) => match.services.length > 0 || match.tenantMatched)
      .map(({ tenant, services }) => ({ tenant, services }));
  }

  private async load(): Promise<Tenant[]> {
    this.tenantsPromise ??= readFile(this.path, "utf8").then((raw) => {
      const parsed = JSON.parse(raw) as { tenants?: Tenant[] } | Tenant[];
      return Array.isArray(parsed) ? parsed : parsed.tenants ?? [];
    });

    return this.tenantsPromise;
  }
}

function tenantMatchesSearchText(tenant: Tenant, text: string): boolean {
  const normalizedText = ` ${normalizeSearchText(text)} `;
  return [
    tenant.id,
    tenant.name,
    tenant.description ?? "",
    tenant.address ?? ""
  ].some((field) => {
    const phrase = normalizeSearchText(field);
    return phrase.length > 0 && normalizedText.includes(` ${phrase} `);
  });
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class LocalTruthStore implements TruthStore {
  constructor(
    private readonly tenants: TenantStore,
    private readonly adapters: Map<string, BookingAdapter>,
    private readonly credentials: CredentialVault = new NullCredentialVault()
  ) {}

  async getAvailability(businessId: string, serviceId: string, bindingId?: string): Promise<AvailabilityResult | null> {
    const tenant = await this.tenants.resolveTenant(businessId);
    if (!tenant) {
      return null;
    }

    const requestedBindingId = bindingId?.trim();
    for (const [index, binding] of tenant.bindings.entries()) {
      if (requestedBindingId && deriveBindingId(binding, index) !== requestedBindingId) {
        continue;
      }

      const resolvedBinding = await resolveBindingCredentials(binding, this.credentials);
      const hasStaticService = resolvedBinding.staticServices?.some((service) => service.id === serviceId) ?? false;
      const adapter = this.adapters.get(resolvedBinding.platform);
      if (!adapter) {
        if (hasStaticService || requestedBindingId) {
          return {
            supported: false,
            reason: `adapter_not_registered:${resolvedBinding.platform}`
          };
        }

        continue;
      }

      if (hasStaticService) {
        return adapter.getAvailability(resolvedBinding, { businessId, serviceId });
      }

      const services = await adapter.listServices(resolvedBinding);
      if (services.some((service) => service.id === serviceId)) {
        return adapter.getAvailability(resolvedBinding, { businessId, serviceId });
      }
    }

    return null;
  }

  async freshnessOf(): Promise<{ source: string; ageMin: number } | null> {
    return null;
  }
}

export class DevAuth implements AuthProvider {
  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DevAuth refuses to start with NODE_ENV=production");
    }
  }

  async authorize(): Promise<AuthorizationResult> {
    return { scopes: ["find", "availability", "book", "cancel"] };
  }

  requireConsent(req: BookRequest | CancelRequest | RescheduleRequest): boolean {
    return req.userConsent !== true;
  }
}

export class DelegationTokenAuth implements AuthProvider {
  constructor(private readonly options: DelegationTokenAuthOptions) {}

  async authorize(req: IncomingRequest): Promise<AuthorizationResult | null> {
    const token = headerValue(req.headers, "agentport-delegation");
    if (!token) {
      return this.options.fallbackScopes ? { scopes: this.options.fallbackScopes } : null;
    }

    try {
      const publicKeys = await this.resolveDelegationPublicKeys(token);
      const delegation = verifyDelegationToken(token, {
        trustedIssuers: this.options.trustedIssuers,
        publicKeys
      });

      if (delegation.tokenConfirmation?.method === "dpop") {
        const dpop = headerValue(req.headers, "dpop");
        if (!dpop) {
          return { scopes: delegation.scopes };
        }

        try {
          verifyDpopProof({
            proof: dpop,
            method: req.method,
            url: req.url,
            delegationToken: token,
            publicKeys: this.options.dpopPublicKeys,
            expectedJwkThumbprint: delegation.tokenConfirmation.jwkThumbprint,
            nowEpochSeconds: this.options.now ? Math.floor(this.options.now().getTime() / 1000) : undefined,
            maxAgeSeconds: this.options.dpopMaxAgeSeconds
          });
        } catch {
          return { scopes: delegation.scopes };
        }
      }

      return {
        scopes: delegation.scopes,
        delegation,
        authority: authorityContextFromDelegationProof(delegation)
      };
    } catch {
      return null;
    }
  }

  requireConsent(req: BookRequest | CancelRequest | RescheduleRequest): boolean {
    return req.userConsent !== true;
  }

  private async resolveDelegationPublicKeys(token: string): Promise<Record<string, PublicKeyMaterial>> {
    if (this.options.delegationPublicKeys) {
      return this.options.delegationPublicKeys;
    }

    if (!this.options.issuerRegistry) {
      throw new Error("delegation_public_keys_unconfigured");
    }

    const { proof } = inspectDelegationToken(token);
    if (!proof.issuer || !this.options.trustedIssuers.includes(proof.issuer)) {
      throw new Error("delegation_untrusted_issuer");
    }

    const keys = await this.options.issuerRegistry.resolvePublicKeys(proof.issuer);
    if (!keys) {
      throw new Error("delegation_issuer_keys_unavailable");
    }

    return keys;
  }
}

export class StaticTrustedIssuerRegistry implements TrustedIssuerRegistry {
  constructor(private readonly keysByIssuer: Record<string, Record<string, PublicKeyMaterial>>) {}

  async resolvePublicKeys(issuer: string): Promise<Record<string, PublicKeyMaterial> | null> {
    return this.keysByIssuer[issuer] ?? null;
  }
}

export interface HttpTrustedIssuerRegistryOptions {
  issuers: Record<string, {
    metadataUrl?: string;
    jwksUrl?: string;
  }>;
  fetch?: typeof fetch;
}

export class HttpTrustedIssuerRegistry implements TrustedIssuerRegistry {
  private readonly cache = new Map<string, Record<string, PublicKeyMaterial>>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpTrustedIssuerRegistryOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async resolvePublicKeys(issuer: string): Promise<Record<string, PublicKeyMaterial> | null> {
    const cached = this.cache.get(issuer);
    if (cached) {
      return cached;
    }

    const config = this.options.issuers[issuer];
    if (!config) {
      return null;
    }

    const jwksUrl = config.jwksUrl ?? await this.discoverJwksUrl(config.metadataUrl);
    if (!jwksUrl) {
      return null;
    }

    const response = await this.fetchImpl(jwksUrl);
    if (!response.ok) {
      return null;
    }

    const jwks = await response.json() as { keys?: Array<Record<string, unknown>> };
    const keys: Record<string, PublicKeyMaterial> = {};
    for (const key of jwks.keys ?? []) {
      if (typeof key.kid !== "string" || typeof key.kty !== "string") {
        continue;
      }

      const { d: _privateExponent, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, oth: _oth, ...publicKey } = key;
      keys[key.kid] = publicKey as PublicKeyMaterial;
    }

    this.cache.set(issuer, keys);
    return keys;
  }

  private async discoverJwksUrl(metadataUrl?: string): Promise<string | null> {
    if (!metadataUrl) {
      return null;
    }

    const response = await this.fetchImpl(metadataUrl);
    if (!response.ok) {
      return null;
    }

    const metadata = await response.json() as {
      jwksUri?: string;
      endpoints?: {
        jwks?: string;
      };
    };
    const jwksPath = metadata.jwksUri ?? metadata.endpoints?.jwks;
    return jwksPath ? new URL(jwksPath, metadataUrl).toString() : null;
  }
}

export class MemoryDelegationReplayStore implements DelegationReplayStore {
  private readonly consumed = new Set<string>();

  async consume(proof: DelegationProof): Promise<boolean> {
    const key = replayKey(proof);
    if (!key) {
      return false;
    }

    if (this.consumed.has(key)) {
      return false;
    }

    this.consumed.add(key);
    return true;
  }
}

export class FileDelegationReplayStore implements DelegationReplayStore {
  constructor(private readonly path: string) {}

  async consume(proof: DelegationProof): Promise<boolean> {
    const key = replayKey(proof);
    if (!key) {
      return false;
    }

    const state = await this.load();
    if (state[key]) {
      return false;
    }

    state[key] = {
      consumedAt: new Date().toISOString(),
      delegationId: proof.delegationId,
      issuer: proof.issuer
    };
    await this.save(state);
    return true;
  }

  private async load(): Promise<Record<string, { consumedAt: string; delegationId: string; issuer?: string }>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Record<string, { consumedAt: string; delegationId: string; issuer?: string }>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }

  private async save(state: Record<string, { consumedAt: string; delegationId: string; issuer?: string }>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`);
  }
}

export interface HttpDelegationStatusVerifierOptions {
  issuers: Record<string, {
    statusUrlTemplate: string;
  }>;
  fetch?: typeof fetch;
}

export class HttpDelegationStatusVerifier implements DelegationVerifier {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpDelegationStatusVerifierOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async verify(proof: DelegationProof): Promise<DelegationVerificationResult> {
    if (!proof.issuer) {
      return { ok: false, reason: "delegation_untrusted_issuer" };
    }

    const issuer = this.options.issuers[proof.issuer];
    if (!issuer) {
      return { ok: false, reason: "delegation_untrusted_issuer" };
    }

    const url = issuer.statusUrlTemplate.replace("{delegationId}", encodeURIComponent(proof.delegationId));
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      return { ok: false, reason: "delegation_verification_failed" };
    }

    const status = await response.json() as {
      status?: string;
      consent?: {
        delegationId?: string;
        revokedAt?: string;
      };
    };
    if (status.status === "revoked" || status.consent?.revokedAt) {
      return { ok: false, reason: "delegation_revoked" };
    }

    if (status.status !== "issued" || status.consent?.delegationId !== proof.delegationId) {
      return { ok: false, reason: "delegation_verification_failed" };
    }

    return { ok: true };
  }
}

function replayKey(proof: DelegationProof): string | null {
  const handle = proof.challengeId ?? proof.nonce;
  return handle ? `${proof.issuer ?? "unknown"}:${proof.delegationId}:${handle}` : null;
}

function headerValue(headers: IncomingRequest["headers"], name: string): string | undefined {
  const direct = headers[name];
  const matched = direct ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  if (Array.isArray(matched)) {
    return matched[0];
  }

  return matched;
}

export class ConsoleAuditSink implements AuditSink {
  async record(e: AuditEvent): Promise<void> {
    console.log(JSON.stringify({ audit: e }));
  }
}

export class SilentAuditSink implements AuditSink {
  async record(): Promise<void> {
    return undefined;
  }
}

export class FileAuditSink implements AuditSink {
  constructor(private readonly path: string) {}

  async record(e: AuditEvent): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(e)}\n`, "utf8");
  }
}

export interface HashChainAuditEntry {
  sequence: number;
  previousHash: string | null;
  entryHash: string;
  event: AuditEvent;
}

export type HashChainAuditVerification =
  | {
      ok: true;
      entries: number;
      lastHash: string | null;
    }
  | {
      ok: false;
      entries: number;
      reason: "audit_entry_malformed" | "audit_sequence_mismatch" | "audit_previous_hash_mismatch" | "audit_entry_hash_mismatch";
      index: number;
    };

export class HashChainAuditSink implements AuditSink {
  constructor(private readonly path: string) {}

  async record(e: AuditEvent): Promise<void> {
    const entries = await readHashChainAuditEntries(this.path);
    const previous = entries.at(-1);
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.entryHash ?? null;
    const entryHash = hashAuditEntry(sequence, previousHash, e);
    const entry: HashChainAuditEntry = {
      sequence,
      previousHash,
      entryHash,
      event: e
    };

    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

export async function verifyHashChainAuditFile(path: string): Promise<HashChainAuditVerification> {
  const entries = await readHashChainAuditEntries(path);
  let previousHash: string | null = null;
  for (const [index, entry] of entries.entries()) {
    if (!isHashChainAuditEntry(entry)) {
      return { ok: false, entries: entries.length, reason: "audit_entry_malformed", index };
    }

    if (entry.sequence !== index + 1) {
      return { ok: false, entries: entries.length, reason: "audit_sequence_mismatch", index };
    }

    if (entry.previousHash !== previousHash) {
      return { ok: false, entries: entries.length, reason: "audit_previous_hash_mismatch", index };
    }

    if (entry.entryHash !== hashAuditEntry(entry.sequence, entry.previousHash, entry.event)) {
      return { ok: false, entries: entries.length, reason: "audit_entry_hash_mismatch", index };
    }

    previousHash = entry.entryHash;
  }

  return { ok: true, entries: entries.length, lastHash: previousHash };
}

export class NoopAnalytics implements AnalyticsSink {
  async observe(): Promise<void> {
    return undefined;
  }
}

async function readHashChainAuditEntries(path: string): Promise<unknown[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.trim().length === 0
      ? []
      : raw.trim().split("\n").map((line) => JSON.parse(line) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isHashChainAuditEntry(value: unknown): value is HashChainAuditEntry {
  return Boolean(
    value &&
    typeof value === "object" &&
    "sequence" in value &&
    typeof value.sequence === "number" &&
    "entryHash" in value &&
    typeof value.entryHash === "string" &&
    "event" in value &&
    value.event &&
    typeof value.event === "object"
  );
}

function hashAuditEntry(sequence: number, previousHash: string | null, event: AuditEvent): string {
  return createHash("sha256")
    .update(stableJson({ sequence, previousHash, event }))
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export class NoopLeadSink implements LeadSink {
  async deliver(): Promise<void> {
    return undefined;
  }
}

export class ConsoleLeadSink implements LeadSink {
  async deliver(lead: Lead): Promise<void> {
    console.log(JSON.stringify({ lead }));
  }
}

export class FileLeadSink implements LeadSink {
  constructor(private readonly path: string) {}

  async deliver(lead: Lead): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(lead)}\n`, "utf8");
  }
}
