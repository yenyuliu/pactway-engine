import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  BusinessPortTrustRoot,
  BusinessPortTrustRootKeyStatus,
  BusinessPortTrustRootPublicKey
} from "./types.js";

export interface LoadBusinessPortTrustRootBundleOptions {
  trustedIssuers?: string[];
  minSequence?: number;
  minimumBundleSequence?: number;
  requireFreshBundle?: boolean;
  expectedBundleHash?: string;
  trustedBundleHashes?: string[];
  blockedBundleHashes?: string[];
  now?: () => Date;
}

export interface BusinessPortTrustRootBundle {
  protocol?: unknown;
  version?: unknown;
  bundleId?: unknown;
  sequence?: unknown;
  issuedBy?: unknown;
  issuedAt?: unknown;
  notBefore?: unknown;
  expiresAt?: unknown;
  authorities?: unknown;
}

export async function loadBusinessPortTrustRootBundle(
  path: string,
  options: LoadBusinessPortTrustRootBundleOptions = {}
): Promise<BusinessPortTrustRoot> {
  const raw = await readFile(resolve(process.cwd(), path), "utf8");
  return businessPortTrustRootFromBundle(JSON.parse(raw) as BusinessPortTrustRootBundle, options);
}

export function businessPortTrustRootFromBundle(
  bundle: BusinessPortTrustRootBundle,
  options: LoadBusinessPortTrustRootBundleOptions = {}
): BusinessPortTrustRoot {
  assertBundle(bundle);

  validateBundleHash(bundle, options);

  const minimumSequence = options.minimumBundleSequence ?? options.minSequence;
  if (minimumSequence !== undefined && bundle.sequence < minimumSequence) {
    throw new Error("business_port_trust_root_bundle_sequence_rollback");
  }

  if (options.requireFreshBundle) {
    assertFreshWindow(bundle.notBefore, bundle.expiresAt, options.now?.() ?? new Date());
  }

  const allowedIssuers = new Set(options.trustedIssuers ?? []);
  const trustedIssuers = new Set<string>();
  const publicKeys: Record<string, BusinessPortTrustRootPublicKey> = {};
  const keyStatuses: Record<string, BusinessPortTrustRootKeyStatus> = {};

  for (const authority of bundle.authorities) {
    const issuer = stringField(authority, "issuer", "business_port_trust_root_authority_issuer_required");
    if (allowedIssuers.size > 0 && !allowedIssuers.has(issuer)) {
      throw new Error("business_port_trust_root_bundle_issuer_untrusted");
    }
    trustedIssuers.add(issuer);

    const authorityPublicKeys = arrayField(authority, "publicKeys", "business_port_trust_root_public_keys_required", {
      allowEmpty: true
    });
    for (const key of authorityPublicKeys) {
      const keyId = stringField(key, "keyId", "business_port_trust_root_key_id_required");
      const alg = stringField(key, "alg", "business_port_trust_root_key_alg_required");
      const use = stringField(key, "use", "business_port_trust_root_key_use_required");
      const status = optionalStringField(key, "status") ?? "active";
      const publicKey = recordField(key, "publicKey", "business_port_trust_root_public_key_required");

      if (alg !== "EdDSA" || use !== "sig") {
        throw new Error("business_port_trust_root_bundle_key_unsupported");
      }
      if (!isKeyStatus(status)) {
        throw new Error("business_port_trust_root_bundle_key_status_invalid");
      }
      if (status === "revoked") {
        throw new Error("business_port_trust_root_bundle_key_revoked");
      }
      if (status === "stale") {
        throw new Error("business_port_trust_root_bundle_key_stale");
      }
      const now = options.now?.() ?? new Date();
      const keyNotBefore = optionalStringField(key, "notBefore");
      const keyExpiresAt = optionalStringField(key, "expiresAt");
      if (keyNotBefore && dateAfterOrInvalid(keyNotBefore, now)) {
        throw new Error("business_port_trust_root_bundle_key_not_yet_valid");
      }
      if (keyExpiresAt && dateExpiredOrInvalid(keyExpiresAt, now)) {
        throw new Error("business_port_trust_root_bundle_key_expired");
      }
      if (publicKeys[keyId]) {
        throw new Error("business_port_trust_root_bundle_key_duplicate");
      }

      publicKeys[keyId] = publicKey as BusinessPortTrustRootPublicKey;
      keyStatuses[keyId] = status;
    }
  }

  if (trustedIssuers.size === 0) {
    throw new Error("business_port_trust_root_bundle_issuer_untrusted");
  }
  if (Object.keys(publicKeys).length === 0) {
    throw new Error("business_port_trust_root_bundle_key_missing");
  }

  return {
    trustedIssuers: [...trustedIssuers].sort(),
    publicKeys,
    keyStatuses
  };
}

export function businessPortTrustRootBundleHash(bundle: BusinessPortTrustRootBundle): string {
  return createHash("sha256").update(stableJson(bundle)).digest("hex");
}

function assertBundle(bundle: BusinessPortTrustRootBundle): asserts bundle is {
  protocol: "agentport-business-port-trust-root-bundle";
  version: "0.1";
  bundleId: string;
  sequence: number;
  issuedBy: string;
  issuedAt: string;
  notBefore?: string;
  expiresAt?: string;
  authorities: Record<string, unknown>[];
} {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("business_port_trust_root_bundle_invalid");
  }
  if (bundle.protocol !== "agentport-business-port-trust-root-bundle" || bundle.version !== "0.1") {
    throw new Error("business_port_trust_root_bundle_unsupported");
  }
  stringField(bundle, "bundleId", "business_port_trust_root_bundle_id_required");
  stringField(bundle, "issuedBy", "business_port_trust_root_issuer_required");
  stringField(bundle, "issuedAt", "business_port_trust_root_issued_at_required");
  if (!Number.isInteger(bundle.sequence) || bundle.sequence < 0) {
    throw new Error("business_port_trust_root_sequence_invalid");
  }
  arrayField(bundle, "authorities", "business_port_trust_root_authorities_required");
}

function validateBundleHash(
  bundle: BusinessPortTrustRootBundle & { sequence: number },
  options: LoadBusinessPortTrustRootBundleOptions
): void {
  validateHashList(options.trustedBundleHashes, "business_port_trust_root_bundle_hash_malformed");
  validateHashList(options.blockedBundleHashes, "business_port_trust_root_bundle_blocked_hash_malformed");
  const hash = businessPortTrustRootBundleHash(bundle);

  if (options.expectedBundleHash && options.expectedBundleHash !== hash) {
    throw new Error("business_port_trust_root_bundle_hash_mismatch");
  }

  if (options.trustedBundleHashes && !options.trustedBundleHashes.includes(hash)) {
    throw new Error("business_port_trust_root_bundle_hash_untrusted");
  }

  if (options.blockedBundleHashes?.includes(hash)) {
    throw new Error("business_port_trust_root_bundle_hash_blocked");
  }
}

function assertFreshWindow(notBefore: string | undefined, expiresAt: string | undefined, now: Date) {
  if (!notBefore || !expiresAt) {
    throw new Error("business_port_trust_root_freshness_window_required");
  }

  const notBeforeMs = Date.parse(notBefore);
  const expiresAtMs = Date.parse(expiresAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(notBeforeMs) || notBeforeMs > nowMs) {
    throw new Error("business_port_trust_root_bundle_not_yet_valid");
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    throw new Error("business_port_trust_root_bundle_expired");
  }
}

function arrayField(
  value: Record<string, unknown>,
  field: string,
  code: string,
  options: { allowEmpty?: boolean } = {}
): Record<string, unknown>[] {
  const entry = value[field];
  if (
    !Array.isArray(entry)
      || (!options.allowEmpty && entry.length === 0)
      || entry.some((item) => !item || typeof item !== "object" || Array.isArray(item))
  ) {
    throw new Error(code);
  }
  return entry as Record<string, unknown>[];
}

function stringField(value: Record<string, unknown>, field: string, code: string): string {
  const entry = value[field];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new Error(code);
  }
  return entry;
}

function optionalStringField(value: Record<string, unknown>, field: string): string | undefined {
  const entry = value[field];
  return typeof entry === "string" && entry.length > 0 ? entry : undefined;
}

function recordField(value: Record<string, unknown>, field: string, code: string): Record<string, unknown> | string {
  const entry = value[field];
  if (typeof entry === "string" && entry.length > 0) {
    return entry;
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return entry as Record<string, unknown>;
  }
  throw new Error(code);
}

function validateHashList(values: string[] | undefined, code: string): void {
  for (const value of values ?? []) {
    if (!/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(code);
    }
  }
}

function isKeyStatus(value: string): value is BusinessPortTrustRootKeyStatus {
  return value === "active" || value === "stale" || value === "revoked";
}

function dateExpiredOrInvalid(value: string, now: Date): boolean {
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || parsed <= now.getTime();
}

function dateAfterOrInvalid(value: string, now: Date): boolean {
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || parsed > now.getTime();
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
