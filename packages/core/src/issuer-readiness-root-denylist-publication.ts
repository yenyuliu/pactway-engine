import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type JsonWebKey
} from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  issuerReadinessTrustRootEmergencyDenyListEnvelopeHash,
  publishSignedIssuerReadinessTrustRootEmergencyDenyList,
  type IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions,
  type IssuerReadinessTrustRootEmergencyDenyListPublicationOptions,
  type IssuerReadinessTrustRootEmergencyDenyListPublicationRecord,
  type IssuerReadinessTrustRootEmergencyDenyListPublicationResult,
  type SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList
} from "./action-runner-kit.js";
import type { PublicKeyMaterial } from "./delegation-token.js";

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationStore {
  current(): Promise<SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList | null>;
  publish(
    envelope: SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList,
    verificationOptions: IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions,
    publicationOptions?: Omit<IssuerReadinessTrustRootEmergencyDenyListPublicationOptions, "currentSequence" | "currentEnvelopeHash">
  ): Promise<IssuerReadinessTrustRootEmergencyDenyListPublicationResult>;
}

export interface FileIssuerReadinessTrustRootEmergencyDenyListPublicationStoreOptions {
  statePath: string;
  auditPath?: string;
  auditMode?: "jsonl" | "hash-chain";
}

export interface FileIssuerReadinessTrustRootEmergencyDenyListPublicationStoreState {
  current?: SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList;
  lastRecord?: IssuerReadinessTrustRootEmergencyDenyListPublicationRecord;
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationAuditEntry {
  sequence: number;
  previousHash: string | null;
  entryHash: string;
  record: IssuerReadinessTrustRootEmergencyDenyListPublicationRecord;
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint {
  type: "agentport.issuer_readiness_trust_root_emergency_denylist_publication_audit_checkpoint";
  generatedAt: string;
  entries: number;
  lastHash: string | null;
}

export interface SignedIssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint {
  protocol: "agentport-issuer-readiness-trust-root-emergency-denylist-publication-audit-checkpoint-envelope";
  version: "0.1";
  checkpoint: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint;
  signature: {
    issuer: string;
    keyId: string;
    alg: "EdDSA";
    signedAt?: string;
    signature: string;
  };
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpointVerificationOptions {
  trustedIssuers: string[];
  publicKeys: Record<string, PublicKeyMaterial>;
}

export interface IssuerReadinessTrustRootEmergencyDenyListPublicationAuditVerificationOptions {
  expectedCheckpoint?: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint;
  expectedEntries?: number;
  expectedLastHash?: string | null;
}

export type IssuerReadinessTrustRootEmergencyDenyListPublicationAuditVerification =
  | {
      ok: true;
      entries: number;
      lastHash: string | null;
    }
  | {
      ok: false;
      entries: number;
      reason:
        | "publication_audit_entry_malformed"
        | "publication_audit_sequence_mismatch"
        | "publication_audit_previous_hash_mismatch"
        | "publication_audit_entry_hash_mismatch";
      index: number;
    }
  | {
      ok: false;
      entries: number;
      reason:
        | "publication_audit_expected_entries_invalid"
        | "publication_audit_expected_last_hash_malformed"
        | "publication_audit_entries_mismatch"
        | "publication_audit_last_hash_mismatch";
    };

export class FileIssuerReadinessTrustRootEmergencyDenyListPublicationStore
  implements IssuerReadinessTrustRootEmergencyDenyListPublicationStore {
  constructor(private readonly options: FileIssuerReadinessTrustRootEmergencyDenyListPublicationStoreOptions) {}

  async current(): Promise<SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList | null> {
    const state = await this.load();
    return state.current ?? null;
  }

  async publish(
    envelope: SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList,
    verificationOptions: IssuerReadinessTrustRootEmergencyDenyListEnvelopeVerificationOptions,
    publicationOptions: Omit<IssuerReadinessTrustRootEmergencyDenyListPublicationOptions, "currentSequence" | "currentEnvelopeHash"> = {}
  ): Promise<IssuerReadinessTrustRootEmergencyDenyListPublicationResult> {
    const state = await this.load();
    const result = publishSignedIssuerReadinessTrustRootEmergencyDenyList(envelope, verificationOptions, {
      ...publicationOptions,
      currentSequence: state.current?.denyList.sequence,
      ...(state.current ? { currentEnvelopeHash: issuerReadinessTrustRootEmergencyDenyListEnvelopeHash(state.current) } : {})
    });

    await this.save({
      current: envelope,
      lastRecord: result.record
    });
    await this.appendAudit(result.record);
    return result;
  }

  private async load(): Promise<FileIssuerReadinessTrustRootEmergencyDenyListPublicationStoreState> {
    try {
      const raw = await readFile(this.options.statePath, "utf8");
      const parsed = JSON.parse(raw) as
        | FileIssuerReadinessTrustRootEmergencyDenyListPublicationStoreState
        | SignedAgentPortIssuerReadinessTrustRootEmergencyDenyList;

      if ("current" in parsed || "lastRecord" in parsed) {
        return {
          current: parsed.current,
          lastRecord: parsed.lastRecord
        };
      }

      if (parsed.protocol === "agentport-issuer-readiness-trust-root-emergency-denylist-envelope") {
        return { current: parsed };
      }

      return {};
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async save(state: FileIssuerReadinessTrustRootEmergencyDenyListPublicationStoreState): Promise<void> {
    await mkdir(dirname(this.options.statePath), { recursive: true });
    await writeFile(this.options.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private async appendAudit(record: IssuerReadinessTrustRootEmergencyDenyListPublicationRecord): Promise<void> {
    if (!this.options.auditPath) {
      return;
    }

    await mkdir(dirname(this.options.auditPath), { recursive: true });
    if (this.options.auditMode === "hash-chain") {
      await appendHashChainPublicationAuditRecord(this.options.auditPath, record);
      return;
    }

    await appendFile(this.options.auditPath, `${JSON.stringify(record)}\n`, "utf8");
  }
}

export class Ed25519IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpointSigner {
  readonly publicJwk: JsonWebKey;

  constructor(
    readonly issuer: string,
    readonly keyId: string,
    private readonly privateKeyPem: string
  ) {
    this.publicJwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "jwk" }) as JsonWebKey;
  }

  sign(
    checkpoint: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint,
    input: { signedAt?: string } = {}
  ): SignedIssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint {
    const signatureMetadata = {
      issuer: this.issuer,
      keyId: this.keyId,
      alg: "EdDSA" as const,
      ...(input.signedAt ? { signedAt: input.signedAt } : {})
    };
    const signingInput = issuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpointSigningInput(
      checkpoint,
      signatureMetadata
    );
    const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(this.privateKeyPem));
    return {
      protocol: "agentport-issuer-readiness-trust-root-emergency-denylist-publication-audit-checkpoint-envelope",
      version: "0.1",
      checkpoint,
      signature: {
        ...signatureMetadata,
        signature: base64UrlEncode(signature)
      }
    };
  }
}

export async function verifyIssuerReadinessTrustRootEmergencyDenyListPublicationAuditFile(
  path: string,
  options: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditVerificationOptions = {}
): Promise<IssuerReadinessTrustRootEmergencyDenyListPublicationAuditVerification> {
  const entries = await readPublicationAuditEntries(path);
  let previousHash: string | null = null;
  for (const [index, entry] of entries.entries()) {
    if (!isPublicationAuditEntry(entry)) {
      return { ok: false, entries: entries.length, reason: "publication_audit_entry_malformed", index };
    }

    if (entry.sequence !== index + 1) {
      return { ok: false, entries: entries.length, reason: "publication_audit_sequence_mismatch", index };
    }

    if (entry.previousHash !== previousHash) {
      return { ok: false, entries: entries.length, reason: "publication_audit_previous_hash_mismatch", index };
    }

    if (entry.entryHash !== hashPublicationAuditEntry(entry.sequence, entry.previousHash, entry.record)) {
      return { ok: false, entries: entries.length, reason: "publication_audit_entry_hash_mismatch", index };
    }

    previousHash = entry.entryHash;
  }

  const expectedEntries = options.expectedCheckpoint?.entries ?? options.expectedEntries;
  if (expectedEntries !== undefined && (!Number.isSafeInteger(expectedEntries) || expectedEntries < 0)) {
    return { ok: false, entries: entries.length, reason: "publication_audit_expected_entries_invalid" };
  }

  if (expectedEntries !== undefined && entries.length !== expectedEntries) {
    return { ok: false, entries: entries.length, reason: "publication_audit_entries_mismatch" };
  }

  const expectedLastHash = options.expectedCheckpoint?.lastHash ?? options.expectedLastHash;
  if (expectedLastHash !== undefined && expectedLastHash !== null && !isSha256Hex(expectedLastHash)) {
    return { ok: false, entries: entries.length, reason: "publication_audit_expected_last_hash_malformed" };
  }

  if (expectedLastHash !== undefined && previousHash !== expectedLastHash) {
    return { ok: false, entries: entries.length, reason: "publication_audit_last_hash_mismatch" };
  }

  return { ok: true, entries: entries.length, lastHash: previousHash };
}

export async function createIssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint(
  path: string,
  options: { now?: () => Date } = {}
): Promise<IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint> {
  const verification = await verifyIssuerReadinessTrustRootEmergencyDenyListPublicationAuditFile(path);
  if (!verification.ok) {
    throw new Error(verification.reason);
  }

  return {
    type: "agentport.issuer_readiness_trust_root_emergency_denylist_publication_audit_checkpoint",
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    entries: verification.entries,
    lastHash: verification.lastHash
  };
}

export function verifySignedIssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint(
  envelope: SignedIssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint,
  options: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpointVerificationOptions
): IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint {
  if (
    envelope.protocol !== "agentport-issuer-readiness-trust-root-emergency-denylist-publication-audit-checkpoint-envelope" ||
    envelope.version !== "0.1"
  ) {
    throw new Error("publication_audit_checkpoint_envelope_unsupported");
  }

  if (envelope.signature.alg !== "EdDSA") {
    throw new Error("publication_audit_checkpoint_envelope_alg_unsupported");
  }

  if (!options.trustedIssuers.includes(envelope.signature.issuer)) {
    throw new Error("publication_audit_checkpoint_envelope_issuer_untrusted");
  }

  const publicKey = options.publicKeys[envelope.signature.keyId];
  if (!publicKey) {
    throw new Error("publication_audit_checkpoint_envelope_public_key_missing");
  }

  if (!envelope.signature.signature || !/^[A-Za-z0-9_-]+$/.test(envelope.signature.signature)) {
    throw new Error("publication_audit_checkpoint_envelope_signature_malformed");
  }

  const signingInput = issuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpointSigningInput(
    envelope.checkpoint,
    {
      issuer: envelope.signature.issuer,
      keyId: envelope.signature.keyId,
      alg: envelope.signature.alg,
      ...(envelope.signature.signedAt ? { signedAt: envelope.signature.signedAt } : {})
    }
  );
  const ok = cryptoVerify(
    null,
    Buffer.from(signingInput),
    publicKeyObject(publicKey),
    base64UrlDecode(envelope.signature.signature)
  );
  if (!ok) {
    throw new Error("publication_audit_checkpoint_envelope_signature_invalid");
  }

  return envelope.checkpoint;
}

export function issuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpointSigningInput(
  checkpoint: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditCheckpoint,
  signatureMetadata: { issuer: string; keyId: string; alg: "EdDSA"; signedAt?: string }
): string {
  return `agentport-issuer-readiness-trust-root-emergency-denylist-publication-audit-checkpoint-v0.1\n${stableJson(signatureMetadata)}\n${stableJson(checkpoint)}`;
}

async function appendHashChainPublicationAuditRecord(
  path: string,
  record: IssuerReadinessTrustRootEmergencyDenyListPublicationRecord
): Promise<void> {
  const entries = await readPublicationAuditEntries(path);
  const previous = entries.at(-1);
  if (previous !== undefined && !isPublicationAuditEntry(previous)) {
    throw new Error("publication_audit_entry_malformed");
  }

  const sequence = (previous?.sequence ?? 0) + 1;
  const previousHash = previous?.entryHash ?? null;
  const entryHash = hashPublicationAuditEntry(sequence, previousHash, record);
  const entry: IssuerReadinessTrustRootEmergencyDenyListPublicationAuditEntry = {
    sequence,
    previousHash,
    entryHash,
    record
  };

  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
}

async function readPublicationAuditEntries(path: string): Promise<unknown[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.trim().length === 0
      ? []
      : raw.trim().split("\n").map((line) => JSON.parse(line) as unknown);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isPublicationAuditEntry(value: unknown): value is IssuerReadinessTrustRootEmergencyDenyListPublicationAuditEntry {
  return Boolean(
    value &&
    typeof value === "object" &&
    "sequence" in value &&
    typeof value.sequence === "number" &&
    "previousHash" in value &&
    (value.previousHash === null || typeof value.previousHash === "string") &&
    "entryHash" in value &&
    typeof value.entryHash === "string" &&
    "record" in value &&
    value.record &&
    typeof value.record === "object"
  );
}

function hashPublicationAuditEntry(
  sequence: number,
  previousHash: string | null,
  record: IssuerReadinessTrustRootEmergencyDenyListPublicationRecord
): string {
  return createHash("sha256")
    .update(stableJson({ sequence, previousHash, record }))
    .digest("hex");
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
