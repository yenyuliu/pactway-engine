import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type JsonWebKey,
  type KeyObject
} from "node:crypto";
import type { ActionIntent, DelegationProof } from "./types.js";

export type PublicKeyMaterial = string | JsonWebKey;

export interface CompactTokenKeyPair {
  keyId: string;
  publicJwk: JsonWebKey;
  publicKeyPem: string;
  privateKeyPem: string;
  jwkThumbprint: string;
}

export interface DelegationTokenIssuer {
  issuer: string;
  keyId: string;
  privateKeyPem: string;
}

export interface DelegationTokenSigningInput {
  header: Record<string, unknown>;
  payload: DelegationProof;
  signingInput: string;
}

export interface DelegationTokenSigner {
  keyId: string;
  publicJwk: JsonWebKey;
  sign(input: DelegationTokenSigningInput): Promise<Buffer | string>;
}

export interface DelegationTokenSignerIssuer {
  issuer: string;
  signer: DelegationTokenSigner;
}

export interface DelegationTokenVerifierOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
}

export interface DpopProofInput {
  method: string;
  url: string;
  delegationToken: string;
  jti: string;
  iat: number;
  keyId: string;
  privateKeyPem: string;
  publicJwk?: JsonWebKey;
  jwkThumbprint: string;
}

export interface DpopVerificationInput {
  proof: string;
  method: string;
  url?: string;
  delegationToken: string;
  publicKeys?: Record<string, PublicKeyMaterial>;
  expectedJwkThumbprint?: string;
  nowEpochSeconds?: number;
  maxAgeSeconds?: number;
}

export function createActionIntentHash(intent: ActionIntent): string {
  return sha256Hex(canonicalJson(intent));
}

export function emitDelegationToken(proof: DelegationProof, issuer: DelegationTokenIssuer): string {
  const payload = {
    ...proof,
    issuer: proof.issuer ?? issuer.issuer,
    ...(proof.actionIntent && !proof.actionIntentHash
      ? { actionIntentHash: createActionIntentHash(proof.actionIntent) }
      : {})
  };

  return signCompactToken(
    {
      alg: "EdDSA",
      typ: "agentport-delegation+jws",
      kid: issuer.keyId,
      jcs: "RFC8785"
    },
    payload,
    issuer.privateKeyPem
  );
}

export async function emitDelegationTokenWithSigner(
  proof: DelegationProof,
  issuer: DelegationTokenSignerIssuer
): Promise<string> {
  const payload = {
    ...proof,
    issuer: proof.issuer ?? issuer.issuer,
    ...(proof.actionIntent && !proof.actionIntentHash
      ? { actionIntentHash: createActionIntentHash(proof.actionIntent) }
      : {})
  };
  const header = {
    alg: "EdDSA",
    typ: "agentport-delegation+jws",
    kid: issuer.signer.keyId,
    jcs: "RFC8785"
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(canonicalJson(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await issuer.signer.sign({
    header,
    payload: payload as DelegationProof,
    signingInput
  });

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function verifyDelegationToken(token: string, options: DelegationTokenVerifierOptions): DelegationProof {
  const verified = verifyCompactToken(token, options.publicKeys);
  if (verified.header.typ !== "agentport-delegation+jws") {
    throw new Error("delegation_token_type_invalid");
  }

  if (verified.header.alg !== "EdDSA") {
    throw new Error("delegation_token_alg_invalid");
  }

  const proof = verified.payload as DelegationProof;
  if (!proof.issuer || !options.trustedIssuers.includes(proof.issuer)) {
    throw new Error("delegation_untrusted_issuer");
  }

  if (proof.actionIntent) {
    const expectedHash = createActionIntentHash(proof.actionIntent);
    if (proof.actionIntentHash !== expectedHash) {
      throw new Error("delegation_action_intent_hash_mismatch");
    }
  }

  return proof;
}

export function inspectDelegationToken(token: string): { header: Record<string, unknown>; proof: DelegationProof } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("compact_token_malformed");
  }

  return {
    header: JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as Record<string, unknown>,
    proof: JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as DelegationProof
  };
}

export function emitDpopProof(input: DpopProofInput): string {
  const publicJwk = input.publicJwk ?? publicJwkFromPrivateKey(input.privateKeyPem);

  return signCompactToken(
    {
      alg: "EdDSA",
      typ: "dpop+jwt",
      kid: input.keyId,
      jwk: publicJwk
    },
    {
      htm: input.method.toUpperCase(),
      htu: input.url,
      iat: input.iat,
      jti: input.jti,
      ath: sha256Base64Url(input.delegationToken),
      jwkThumbprint: input.jwkThumbprint
    },
    input.privateKeyPem
  );
}

export function verifyDpopProof(input: DpopVerificationInput): void {
  const verified = verifyCompactToken(input.proof, (header) => {
    if (isPublicJwk(header.jwk)) {
      return header.jwk;
    }

    const keyId = typeof header.kid === "string" ? header.kid : "";
    return input.publicKeys?.[keyId];
  });

  if (verified.header.typ !== "dpop+jwt") {
    throw new Error("dpop_type_invalid");
  }

  if (verified.header.alg !== "EdDSA") {
    throw new Error("dpop_alg_invalid");
  }

  const payload = verified.payload as {
    htm?: string;
    htu?: string;
    ath?: string;
    jwkThumbprint?: string;
    jti?: string;
    iat?: number;
  };

  if (payload.htm !== input.method.toUpperCase()) {
    throw new Error("dpop_method_mismatch");
  }

  if (input.url && payload.htu !== input.url) {
    throw new Error("dpop_url_mismatch");
  }

  if (payload.ath !== sha256Base64Url(input.delegationToken)) {
    throw new Error("dpop_delegation_hash_mismatch");
  }

  if (!payload.jti) {
    throw new Error("dpop_jti_missing");
  }

  if (!Number.isInteger(payload.iat)) {
    throw new Error("dpop_iat_invalid");
  }

  if (input.nowEpochSeconds !== undefined) {
    const maxAgeSeconds = input.maxAgeSeconds ?? 300;
    if (payload.iat > input.nowEpochSeconds + 60) {
      throw new Error("dpop_iat_future");
    }

    if (input.nowEpochSeconds - payload.iat > maxAgeSeconds) {
      throw new Error("dpop_iat_expired");
    }
  }

  const actualThumbprint = dpopHeaderThumbprint(verified.header, input.publicKeys ?? {});
  if (payload.jwkThumbprint && payload.jwkThumbprint !== actualThumbprint) {
    throw new Error("dpop_payload_thumbprint_mismatch");
  }

  if (input.expectedJwkThumbprint && actualThumbprint !== input.expectedJwkThumbprint) {
    throw new Error("dpop_key_thumbprint_mismatch");
  }
}

export function publicKeyThumbprint(publicKeyPem: string): string {
  return publicJwkThumbprint(exportPublicJwk(publicKeyPem));
}

export function publicJwkThumbprint(publicJwk: JsonWebKey): string {
  return sha256Base64Url(canonicalJson(jwkThumbprintInput(publicJwk)));
}

export function exportPublicJwk(publicKeyPem: string): JsonWebKey {
  return createPublicKey(publicKeyPem).export({ format: "jwk" }) as JsonWebKey;
}

export function compactTokenKeyPairFromPem(keyId: string, privateKeyPem: string): CompactTokenKeyPair {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  const publicJwk = exportPublicJwk(publicKeyPem);
  return {
    keyId,
    privateKeyPem,
    publicJwk,
    publicKeyPem,
    jwkThumbprint: publicJwkThumbprint(publicJwk)
  };
}

export class PemDelegationTokenSigner implements DelegationTokenSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = publicJwkFromPrivateKey(privateKeyPem);
  }

  async sign(input: DelegationTokenSigningInput): Promise<Buffer> {
    return cryptoSign(null, Buffer.from(input.signingInput), createPrivateKey(this.privateKeyPem));
  }
}

export interface HttpDelegationTokenSignerOptions {
  keyId: string;
  publicJwk: JsonWebKey;
  signUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export class HttpDelegationTokenSigner implements DelegationTokenSigner {
  readonly keyId: string;
  readonly publicJwk: JsonWebKey;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpDelegationTokenSignerOptions) {
    this.keyId = options.keyId;
    this.publicJwk = options.publicJwk;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async sign(input: DelegationTokenSigningInput): Promise<Buffer> {
    const response = await this.fetchImpl(this.options.signUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.options.headers
      },
      body: JSON.stringify({
        keyId: this.keyId,
        alg: input.header.alg,
        typ: input.header.typ,
        signingInput: input.signingInput,
        header: input.header,
        payload: input.payload
      })
    });
    if (!response.ok) {
      throw new Error(`delegation_http_signer_failed:${response.status}`);
    }

    const body = await response.json() as { signatureBase64Url?: string };
    if (!body.signatureBase64Url) {
      throw new Error("delegation_http_signer_signature_missing");
    }

    const signature = base64UrlDecode(body.signatureBase64Url);
    const ok = cryptoVerify(null, Buffer.from(input.signingInput), publicKeyObject(this.publicJwk), signature);
    if (!ok) {
      throw new Error("delegation_http_signer_signature_invalid");
    }

    return signature;
  }
}

function signCompactToken(header: Record<string, unknown>, payload: unknown, privateKeyPem: string): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(canonicalJson(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(privateKeyPem));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function verifyCompactToken(
  token: string,
  publicKeyResolver: Record<string, PublicKeyMaterial> | ((header: Record<string, unknown>) => PublicKeyMaterial | undefined)
): { header: Record<string, unknown>; payload: unknown } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("compact_token_malformed");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as Record<string, unknown>;
  const keyMaterial = typeof publicKeyResolver === "function"
    ? publicKeyResolver(header)
    : publicKeyResolver[typeof header.kid === "string" ? header.kid : ""];
  if (!keyMaterial) {
    throw new Error("compact_token_unknown_key");
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(keyMaterial),
    base64UrlDecode(encodedSignature)
  );
  if (!ok) {
    throw new Error("compact_token_signature_invalid");
  }

  return {
    header,
    payload: JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"))
  };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("canonical_json_non_finite_number");
  }

  return JSON.stringify(value);
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Base64Url(value: string | Buffer): string {
  return base64UrlEncode(createHash("sha256").update(value).digest());
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

function publicJwkFromPrivateKey(privateKeyPem: string): JsonWebKey {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
}

function publicKeyObject(material: PublicKeyMaterial): KeyObject {
  return typeof material === "string"
    ? createPublicKey(material)
    : createPublicKey({ key: material, format: "jwk" });
}

function isPublicJwk(value: unknown): value is JsonWebKey {
  return Boolean(value && typeof value === "object" && "kty" in value);
}

function dpopHeaderThumbprint(header: Record<string, unknown>, publicKeys: Record<string, PublicKeyMaterial>): string {
  if (isPublicJwk(header.jwk)) {
    return publicJwkThumbprint(header.jwk);
  }

  const keyId = typeof header.kid === "string" ? header.kid : "";
  const material = publicKeys[keyId];
  if (!material) {
    throw new Error("dpop_key_missing");
  }

  return typeof material === "string" ? publicKeyThumbprint(material) : publicJwkThumbprint(material);
}

function jwkThumbprintInput(jwk: JsonWebKey): Record<string, string | undefined> {
  if (jwk.kty === "OKP") {
    return { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  }

  if (jwk.kty === "EC") {
    return { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
  }

  if (jwk.kty === "RSA") {
    return { e: jwk.e, kty: jwk.kty, n: jwk.n };
  }

  throw new Error("jwk_thumbprint_unsupported_key_type");
}
