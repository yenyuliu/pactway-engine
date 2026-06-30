import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  actionReceiptSignatureExpectationsFromTrustProfile,
  validateActionReceipt,
  type ActionReceipt,
  type ActionReceiptGatewayTrustProfile,
  type AgentPortCommitment,
  type AuditSink,
  type Tenant,
  type SignedActionReceiptGatewayTrustProfile
} from "../../core/src/index.js";
import {
  gatewayActor,
  pluginHostActor,
  ticketHolderPrincipalActor,
  type ActorContext,
  type TicketHolderIdentityProvider
} from "./identity.js";

export interface TicketDestination {
  kind: "business_inbox" | "issuer_queue" | "venue_verifier" | "support_channel" | "webhook";
  target: string;
  label?: string;
}

export interface TicketDeliverySink {
  deliver(input: {
    commitment: AgentPortCommitment;
    receipt?: ActionReceipt;
    destination: TicketDestination;
    requestedBy?: string;
    proofLevel?: string;
    requestedActor?: ActorContext;
    customerActor?: ActorContext;
    gatewayActor?: ActorContext;
  }): Promise<{
    deliveryId: string;
    deliveredAt?: string;
    destinationRef?: string;
  }>;
  list?(input?: TicketDeliveryListInput): Promise<TicketDeliveryRecord[]> | TicketDeliveryRecord[];
  acknowledge?(input: TicketDeliveryAcknowledgeInput): Promise<TicketDeliveryRecord | undefined> | TicketDeliveryRecord | undefined;
}

export type TicketDeliveryBusinessInboxStatus =
  | "delivered"
  | "seen"
  | "accepted_for_review"
  | "needs_handoff"
  | "rejected_cannot_fulfill";

export interface TicketDeliveryBusinessInboxEvent {
  status: TicketDeliveryBusinessInboxStatus;
  at: string;
  by?: string;
  note?: string;
}

export interface TicketDeliveryRecord {
  deliveryId: string;
  deliveredAt: string;
  destination: {
    kind: TicketDestination["kind"];
    label?: string;
  };
  destinationRef?: string;
  requestedBy?: string;
  requestedActor?: ActorContext;
  customerActor?: ActorContext;
  gatewayActor?: ActorContext;
  commitmentId: string;
  status: string;
  proofLevel?: string;
  businessId: string;
  serviceId: string;
  displayCode?: string;
  commitmentAction?: string;
  commitmentResult?: string;
  receiptId?: string;
  authorityAssurance?: string;
  backendSource?: string;
  clientAgentId?: string;
  backendConfirmationId?: string;
  backendMutation: false;
  businessInboxStatus?: TicketDeliveryBusinessInboxStatus;
  businessInboxStatusAt?: string;
  businessInboxStatusBy?: string;
  businessInboxNote?: string;
  businessInboxEvents?: TicketDeliveryBusinessInboxEvent[];
  demoOnly?: boolean;
}

export interface TicketDeliveryListInput {
  limit?: number;
  businessId?: string;
  destinationKind?: TicketDestination["kind"];
}

export interface TicketDeliveryAcknowledgeInput {
  deliveryId: string;
  businessId: string;
  status: TicketDeliveryBusinessInboxStatus;
  acknowledgedBy?: string;
  note?: string;
  at?: string;
}

export interface RedisTicketDeliverySinkOptions {
  restUrl: string;
  token: string;
  keyPrefix?: string;
  now?: () => Date;
  fetch?: typeof fetch;
}

export interface TicketToolRuntime {
  tenants?: {
    resolveTenant(businessId: string): Promise<Tenant | null>;
  };
  ticketRegistry?: TicketRegistry;
  ticketWallet?: TicketWalletRegistry;
  ticketDelivery?: TicketDeliverySink;
  ticketHolderIdentity?: TicketHolderIdentityProvider;
  audit?: AuditSink;
  receipts?: {
    trustProfile?: ActionReceiptGatewayTrustProfile | SignedActionReceiptGatewayTrustProfile;
    now?: () => Date;
  };
}

export interface TicketEvidenceInput {
  commitment: AgentPortCommitment;
  receipt?: ActionReceipt;
  holderRef?: string;
}

export interface ResolveTicketInput {
  ticketRef: string;
  holderRef?: string;
}

export interface LocateWalletTicketsInput {
  walletRef?: string;
  walletTicketId?: string;
  holderRef?: string;
  userClaim?: string;
  includeEvidence?: boolean;
  limit?: number;
}

export interface TicketRegistryRecord extends TicketEvidenceInput {
  ticketRef: string;
  displayCode?: string;
  demoOnly?: boolean;
  holderProofRequired?: boolean;
  aliases?: string[];
  businessName?: string;
  businessLocation?: string;
  serviceName?: string;
  scheduledFor?: string;
  timezone?: string;
  createdAt?: string;
}

export interface TicketWalletRecord extends TicketRegistryRecord {
  walletId: string;
  walletTicketId: string;
  label?: string;
  updatedAt?: string;
}

export interface TicketRegistry {
  resolve(input: ResolveTicketInput): Promise<TicketRegistryRecord | undefined> | TicketRegistryRecord | undefined;
}

export interface TicketWalletRegistry {
  locate(input: LocateWalletTicketsInput): Promise<TicketWalletRecord[]> | TicketWalletRecord[];
}

export interface SendTicketInput extends TicketEvidenceInput {
  destination: TicketDestination;
  intentId?: string;
  approvedActionIntentHash?: string;
  userConsent?: boolean;
  requestedBy?: string;
}

export async function locateWalletTickets(runtime: TicketToolRuntime, input: LocateWalletTicketsInput = {}) {
  if (input.holderRef && runtime.ticketHolderIdentity) {
    const identity = runtime.ticketHolderIdentity.authenticate({
      holderRef: input.holderRef,
      scope: "ticket:read"
    });
    if (!identity.ok) {
      return {
        type: "invalid" as const,
        reason: identity.reason,
        holderRef: input.holderRef
      };
    }
  }

  if (!runtime.ticketWallet) {
    return {
      type: "unavailable" as const,
      reason: "ticket_wallet_unavailable",
      walletRef: input.walletRef
    };
  }

  const limit = input.limit ? Math.max(1, input.limit) : 10;
  const records = (await runtime.ticketWallet.locate(input)).slice(0, limit);
  if (records.length === 0) {
    return {
      type: "not_found" as const,
      reason: "wallet_tickets_not_found",
      walletRef: input.walletRef,
      walletTicketId: input.walletTicketId
    };
  }

  const tickets = await Promise.all(records.map((record) => walletTicketSummary(runtime, record, input.includeEvidence === true, input.userClaim)));

  return {
    type: "wallet_tickets" as const,
    walletRef: input.walletRef ?? "default",
    count: records.length,
    tickets
  };
}

export async function resolveTicket(runtime: TicketToolRuntime, input: ResolveTicketInput) {
  if (!runtime.ticketRegistry) {
    return {
      type: "unavailable" as const,
      reason: "ticket_registry_unavailable",
      ticketRef: input.ticketRef
    };
  }

  const ticketRef = normalizeTicketRef(input.ticketRef);
  const record = await runtime.ticketRegistry.resolve({ ...input, ticketRef });
  if (!record) {
    return {
      type: "not_found" as const,
      reason: "ticket_ref_not_found",
      ticketRef: input.ticketRef
    };
  }

  if (record.holderProofRequired === true && !record.holderRef) {
    return {
      type: "invalid" as const,
      reason: "registry_record_missing_holder_ref",
      ticketRef: input.ticketRef,
      commitmentId: record.commitment.commitmentId
    };
  }

  if (record.holderProofRequired === true && !input.holderRef) {
    return {
      type: "proof_required" as const,
      reason: "holder_proof_required",
      ticketRef: input.ticketRef,
      requiredProof: "holderRef" as const
    };
  }

  if (input.holderRef && record.holderRef !== input.holderRef) {
    return {
      type: "invalid" as const,
      reason: "holder_mismatch",
      ticketRef: input.ticketRef,
      commitmentId: record.commitment.commitmentId
    };
  }

  if (runtime.ticketHolderIdentity) {
    const identity = runtime.ticketHolderIdentity.authenticate({
      holderRef: input.holderRef,
      commitment: record.commitment,
      scope: "ticket:read"
    });
    if (!identity.ok) {
      return {
        type: "invalid" as const,
        reason: identity.reason,
        ticketRef: input.ticketRef,
        commitmentId: record.commitment.commitmentId
      };
    }
  }

  return {
    type: "resolved_ticket" as const,
    ticketRef: input.ticketRef,
    displayCode: record.displayCode ?? record.ticketRef,
    demoOnly: record.demoOnly === true,
    commitmentId: record.commitment.commitmentId,
    holderRef: record.holderRef,
    evidence: {
      commitment: record.commitment,
      ...(record.receipt ? { receipt: record.receipt } : {}),
      ...(record.holderRef ? { holderRef: record.holderRef } : {})
    }
  };
}

export class InMemoryTicketRegistry implements TicketRegistry {
  readonly #records = new Map<string, TicketRegistryRecord>();

  constructor(records: TicketRegistryRecord[] = []) {
    for (const record of records) {
      this.set(record);
    }
  }

  set(record: TicketRegistryRecord) {
    const refs = [
      record.ticketRef,
      record.displayCode,
      record.commitment.commitmentId,
      record.commitment.backend?.confirmationId,
      ...(record.aliases ?? [])
    ];
    for (const ref of refs) {
      if (ref) {
        this.#records.set(normalizeTicketRef(ref), structuredClone(record));
      }
    }
  }

  resolve(input: ResolveTicketInput) {
    const record = this.#records.get(normalizeTicketRef(input.ticketRef));
    return record ? structuredClone(record) : undefined;
  }
}

export function createDemoTicketRegistry() {
  return new InMemoryTicketRegistry(demoTicketRegistryRecords());
}

export class InMemoryTicketWalletRegistry implements TicketWalletRegistry {
  readonly #records: TicketWalletRecord[];
  readonly #allowDefaultLocate: boolean;

  constructor(records: TicketWalletRecord[] = [], options: { allowDefaultLocate?: boolean } = {}) {
    this.#records = records.map((record) => structuredClone(record));
    this.#allowDefaultLocate = options.allowDefaultLocate === true;
  }

  locate(input: LocateWalletTicketsInput = {}) {
    if (!input.walletRef && !input.walletTicketId && !input.holderRef && !this.#allowDefaultLocate) {
      return [];
    }

    return this.#records
      .filter((record) => !input.walletRef || normalizeTicketRef(record.walletId) === normalizeTicketRef(input.walletRef))
      .filter((record) => !input.walletTicketId || normalizeTicketRef(record.walletTicketId) === normalizeTicketRef(input.walletTicketId))
      .filter((record) => !input.holderRef || record.holderRef === input.holderRef)
      .map((record) => structuredClone(record));
  }
}

export class InMemoryTicketDeliverySink implements TicketDeliverySink {
  readonly #records: TicketDeliveryRecord[] = [];
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  async deliver(input: {
    commitment: AgentPortCommitment;
    receipt?: ActionReceipt;
    destination: TicketDestination;
    requestedBy?: string;
    proofLevel?: string;
    requestedActor?: ActorContext;
    customerActor?: ActorContext;
    gatewayActor?: ActorContext;
  }) {
    const record = ticketDeliveryRecordFromInput({
      ...input,
      deliveryId: `ticket_delivery_${String(this.#records.length + 1).padStart(4, "0")}`,
      deliveredAt: this.#now().toISOString()
    });
    this.#records.push(record);
    return {
      deliveryId: record.deliveryId,
      deliveredAt: record.deliveredAt,
      destinationRef: record.destinationRef
    };
  }

  list(input: TicketDeliveryListInput = {}) {
    return limitRecords(filterDeliveryRecords(this.#records, input), input.limit);
  }

  acknowledge(input: TicketDeliveryAcknowledgeInput) {
    const index = this.#records.findIndex((record) =>
      record.deliveryId === input.deliveryId && record.businessId === input.businessId
    );
    if (index < 0) {
      return undefined;
    }

    this.#records[index] = acknowledgeDeliveryRecord(this.#records[index], input, this.#now);
    return structuredClone(this.#records[index]);
  }
}

export class FileTicketDeliverySink implements TicketDeliverySink {
  readonly #path: string;
  readonly #now: () => Date;

  constructor(path: string, options: { now?: () => Date } = {}) {
    this.#path = path;
    this.#now = options.now ?? (() => new Date());
  }

  async deliver(input: {
    commitment: AgentPortCommitment;
    receipt?: ActionReceipt;
    destination: TicketDestination;
    requestedBy?: string;
    proofLevel?: string;
    requestedActor?: ActorContext;
    customerActor?: ActorContext;
    gatewayActor?: ActorContext;
  }) {
    const state = await this.#load();
    const record = ticketDeliveryRecordFromInput({
      ...input,
      deliveryId: `ticket_delivery_${String(state.records.length + 1).padStart(4, "0")}`,
      deliveredAt: this.#now().toISOString()
    });
    state.records.push(record);
    await this.#save(state);
    return {
      deliveryId: record.deliveryId,
      deliveredAt: record.deliveredAt,
      destinationRef: record.destinationRef
    };
  }

  async list(input: TicketDeliveryListInput = {}) {
    const state = await this.#load();
    return limitRecords(filterDeliveryRecords(state.records, input), input.limit);
  }

  async acknowledge(input: TicketDeliveryAcknowledgeInput) {
    const state = await this.#load();
    const index = state.records.findIndex((record) =>
      record.deliveryId === input.deliveryId && record.businessId === input.businessId
    );
    if (index < 0) {
      return undefined;
    }

    state.records[index] = acknowledgeDeliveryRecord(state.records[index], input, this.#now);
    await this.#save(state);
    return structuredClone(state.records[index]);
  }

  async #load(): Promise<{ records: TicketDeliveryRecord[] }> {
    try {
      const parsed = JSON.parse(await readFile(this.#path, "utf8")) as Partial<{ records: TicketDeliveryRecord[] }>;
      return {
        records: Array.isArray(parsed.records) ? parsed.records : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { records: [] };
      }
      throw error;
    }
  }

  async #save(state: { records: TicketDeliveryRecord[] }) {
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(this.#path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}

export class RedisTicketDeliverySink implements TicketDeliverySink {
  readonly #restUrl: string;
  readonly #token: string;
  readonly #keyPrefix: string;
  readonly #now: () => Date;
  readonly #fetch: typeof fetch;

  constructor(options: RedisTicketDeliverySinkOptions) {
    this.#restUrl = options.restUrl.replace(/\/+$/, "");
    this.#token = options.token;
    this.#keyPrefix = options.keyPrefix ?? "agentport";
    this.#now = options.now ?? (() => new Date());
    this.#fetch = options.fetch ?? fetch;
  }

  async deliver(input: {
    commitment: AgentPortCommitment;
    receipt?: ActionReceipt;
    destination: TicketDestination;
    requestedBy?: string;
    proofLevel?: string;
    requestedActor?: ActorContext;
    customerActor?: ActorContext;
    gatewayActor?: ActorContext;
  }) {
    const sequence = await this.#command<number>(["INCR", this.#key("ticket-delivery-seq")]);
    const deliveredAt = this.#now().toISOString();
    const record = ticketDeliveryRecordFromInput({
      ...input,
      deliveryId: `ticket_delivery_${String(sequence).padStart(4, "0")}`,
      deliveredAt
    });
    const score = String(Date.parse(deliveredAt));

    await this.#command(["SET", this.#recordKey(record.deliveryId), JSON.stringify(record)]);
    await this.#command(["ZADD", this.#indexKey(), score, record.deliveryId]);
    await this.#command(["ZADD", this.#businessIndexKey(record.businessId), score, record.deliveryId]);

    return {
      deliveryId: record.deliveryId,
      deliveredAt: record.deliveredAt,
      destinationRef: record.destinationRef
    };
  }

  async list(input: TicketDeliveryListInput = {}) {
    const limit = Math.max(1, input.limit ?? 50);
    const indexKey = input.businessId ? this.#businessIndexKey(input.businessId) : this.#indexKey();
    const deliveryIds = await this.#command<string[]>(["ZREVRANGE", indexKey, "0", String(limit - 1)]);
    if (deliveryIds.length === 0) {
      return [];
    }

    const rawRecords = await this.#command<Array<string | null>>([
      "MGET",
      ...deliveryIds.map((deliveryId) => this.#recordKey(deliveryId))
    ]);
    const records = rawRecords.flatMap((rawRecord) => {
      if (!rawRecord) {
        return [];
      }
      return [JSON.parse(rawRecord) as TicketDeliveryRecord];
    });
    return filterDeliveryRecords(records, input).slice(0, limit).map((record) => structuredClone(record));
  }

  async acknowledge(input: TicketDeliveryAcknowledgeInput) {
    const rawRecord = await this.#command<string | null>(["GET", this.#recordKey(input.deliveryId)]);
    if (!rawRecord) {
      return undefined;
    }

    const record = JSON.parse(rawRecord) as TicketDeliveryRecord;
    if (record.businessId !== input.businessId) {
      return undefined;
    }

    const updated = acknowledgeDeliveryRecord(record, input, this.#now);
    await this.#command(["SET", this.#recordKey(updated.deliveryId), JSON.stringify(updated)]);
    return structuredClone(updated);
  }

  async #command<T = unknown>(command: Array<string | number>) {
    const response = await this.#fetch(this.#restUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(command)
    });

    if (!response.ok) {
      throw new Error(`redis_delivery_sink_http_${response.status}`);
    }

    const payload = await response.json() as { result?: T; error?: string };
    if (payload.error) {
      throw new Error(`redis_delivery_sink_error:${payload.error}`);
    }

    return payload.result as T;
  }

  #key(name: string) {
    return `${this.#keyPrefix}:${name}`;
  }

  #indexKey() {
    return this.#key("ticket-deliveries");
  }

  #businessIndexKey(businessId: string) {
    return this.#key(`ticket-deliveries:business:${businessId}`);
  }

  #recordKey(deliveryId: string) {
    return this.#key(`ticket-delivery:${deliveryId}`);
  }
}

export function createDemoTicketWalletRegistry() {
  const record = demoTicketRegistryRecord();
  return new InMemoryTicketWalletRegistry([
    {
      ...record,
      walletId: "wallet:chatgpt-demo",
      walletTicketId: "wallet_ticket_chatgpt_demo_0001",
      label: "Demo massage ticket",
      businessName: "Verified Day Spa",
      businessLocation: "456 Wellness Ave, Newton, MA",
      serviceName: "Swedish Massage",
      scheduledFor: "2026-06-28T14:30:00.000-04:00",
      timezone: "America/New_York",
      updatedAt: "2026-06-26T12:00:00.000Z"
    }
  ], { allowDefaultLocate: true });
}

export function verifyTicket(runtime: TicketToolRuntime, input: TicketEvidenceInput) {
  const structural = validateCommitmentStructure(input.commitment);
  if (!structural.ok) {
    return {
      type: "invalid" as const,
      reason: structural.reason,
      proofLevel: "invalid" as const
    };
  }

  if (input.holderRef && input.commitment.subject.holderRef !== input.holderRef) {
    return {
      type: "invalid" as const,
      reason: "holder_mismatch",
      proofLevel: "invalid" as const,
      commitmentId: input.commitment.commitmentId,
      status: input.commitment.status
    };
  }

  if (runtime.ticketHolderIdentity) {
    const identity = runtime.ticketHolderIdentity.authenticate({
      holderRef: input.holderRef,
      commitment: input.commitment,
      scope: "ticket:read"
    });
    if (!identity.ok) {
      return {
        type: "invalid" as const,
        reason: identity.reason,
        proofLevel: "invalid" as const,
        commitmentId: input.commitment.commitmentId,
        status: input.commitment.status
      };
    }
  }

  const receiptProof = verifyReceiptForCommitment(runtime, input.commitment, input.receipt);
  if (!receiptProof.ok) {
    return {
      type: receiptProof.proofLevel === "receipt_ref" ? "verified" as const : "invalid" as const,
      ...(receiptProof.proofLevel === "receipt_ref" ? {} : { reason: receiptProof.reason }),
      proofLevel: receiptProof.proofLevel,
      commitmentId: input.commitment.commitmentId,
      status: input.commitment.status,
      holderRef: input.commitment.subject.holderRef,
      allowedActions: allowedTicketActions(input.commitment),
      backend: input.commitment.backend,
      receipts: input.commitment.receipts
    };
  }

  return {
    type: "verified" as const,
    proofLevel: receiptProof.proofLevel,
    commitmentId: input.commitment.commitmentId,
    status: input.commitment.status,
    holderRef: input.commitment.subject.holderRef,
    allowedActions: allowedTicketActions(input.commitment),
    backend: input.commitment.backend,
    receipts: input.commitment.receipts
  };
}

export function getTicketStatus(runtime: TicketToolRuntime, input: TicketEvidenceInput) {
  const verification = verifyTicket(runtime, input);
  if (verification.type !== "verified") {
    return verification;
  }

  return {
    type: "status" as const,
    commitmentId: verification.commitmentId,
    status: verification.status,
    proofLevel: verification.proofLevel,
    holderRef: verification.holderRef,
    backend: verification.backend
  };
}

export function getAllowedTicketActions(runtime: TicketToolRuntime, input: TicketEvidenceInput) {
  const verification = verifyTicket(runtime, input);
  if (verification.type !== "verified") {
    return verification;
  }

  return {
    type: "allowed_actions" as const,
    commitmentId: verification.commitmentId,
    status: verification.status,
    proofLevel: verification.proofLevel,
    allowedActions: verification.allowedActions,
    deliveryRequiresConsent: true,
    backendMutation: false
  };
}

async function walletTicketSummary(runtime: TicketToolRuntime, record: TicketWalletRecord, includeEvidence: boolean, userClaim?: string) {
  const evidence = {
    commitment: record.commitment,
    ...(record.receipt ? { receipt: record.receipt } : {}),
    ...(record.holderRef ? { holderRef: record.holderRef } : {})
  };
  const status = getTicketStatus(runtime, evidence);
  const verifiedCurrent = status.type === "status";
  const currentStatus = verifiedCurrent ? status.status : record.commitment.status;
  const identity = await ticketIdentity(runtime, record, currentStatus, verifiedCurrent);
  const claimMatch = matchTicketClaim(identity, userClaim);

  return {
    walletId: record.walletId,
    walletTicketId: record.walletTicketId,
    label: record.label,
    updatedAt: record.updatedAt,
    ticketRef: record.ticketRef,
    displayCode: record.displayCode ?? record.ticketRef,
    demoOnly: record.demoOnly === true,
    commitmentId: record.commitment.commitmentId,
    holderRef: record.holderRef,
    status: currentStatus,
    statusSource: verifiedCurrent ? "agent_gateway" as const : "local_last_known" as const,
    verifiedCurrent,
    reverifyRequired: !verifiedCurrent,
    ticketIdentity: identity,
    claimMatch,
    userTicketCard: {
      title: identity.displayTitle,
      summaryLine: identity.summaryLine,
      storeLine: identity.storeLine,
      serviceLine: identity.serviceLine,
      timeLine: identity.timeLine,
      referenceLine: identity.referenceLine,
      claimLine: claimMatch.clarificationLine,
      claimMatch,
      statusLabel: `${verifiedCurrent ? "current" : "last-known"}: ${currentStatus}`,
      displayCode: record.displayCode ?? record.ticketRef,
      confirmationId: record.commitment.backend.confirmationId,
      businessId: record.commitment.business.businessId,
      businessName: identity.business.name,
      businessLocation: identity.business.location,
      serviceId: record.commitment.business.serviceId,
      serviceName: identity.service.name,
      scheduledFor: identity.time.scheduledFor,
      scheduledForSource: identity.time.scheduledForSource,
      createdAt: identity.time.createdAt,
      updatedAt: identity.time.updatedAt,
      timezone: identity.time.timezone,
      walletTicketId: record.walletTicketId,
      demoOnly: record.demoOnly === true,
      allowedNextActions: allowedTicketActions(record.commitment),
      deliveryRequiresConsent: true,
      currentStatusVerified: verifiedCurrent
    },
    ...(verifiedCurrent
      ? {
          proofLevel: status.proofLevel,
          backend: status.backend
        }
      : {
          reason: status.reason
        }),
    ...(includeEvidence ? { evidence } : {})
  };
}

type TicketIdentity = Awaited<ReturnType<typeof ticketIdentity>>;
type TicketClaimMatchStatus = "exact_match" | "possible_match" | "mismatch" | "needs_user_clarification";

const genericTicketClaimTokens = new Set([
  "a",
  "an",
  "and",
  "appointment",
  "booking",
  "can",
  "check",
  "for",
  "happened",
  "i",
  "is",
  "it",
  "me",
  "my",
  "on",
  "please",
  "proof",
  "reservation",
  "send",
  "status",
  "the",
  "this",
  "ticket",
  "to",
  "what",
  "with"
]);

const serviceCategoryTokens = new Set([
  "barber",
  "bike",
  "dinner",
  "hair",
  "haircut",
  "massage",
  "nail",
  "nails",
  "print",
  "repair",
  "restaurant",
  "salon",
  "spa",
  "swedish",
  "table",
  "wellness"
]);

function matchTicketClaim(identity: TicketIdentity, userClaim?: string) {
  const rawClaim = userClaim?.trim() ?? "";
  const clarificationLine = ticketClarificationLine(identity);
  if (!rawClaim) {
    return ticketClaimMatchResult("needs_user_clarification", rawClaim, [], [], "no_user_claim_provided", clarificationLine);
  }

  const compactClaim = compactIdentityText(rawClaim);
  const referenceMatches = Object.entries(identity.references)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .filter(([, value]) => {
      const compactValue = compactIdentityText(value);
      return compactValue.length >= 6 && compactClaim.includes(compactValue);
    });
  if (referenceMatches.length > 0) {
    return ticketClaimMatchResult("exact_match", rawClaim, ["reference"], [], "reference_match", clarificationLine);
  }

  const claimTokens = ticketClaimTokens(rawClaim);
  const significantClaimTokens = claimTokens.filter((token) => !genericTicketClaimTokens.has(token));
  const businessTokens = ticketClaimTokens([identity.business.name, identity.business.businessId, identity.business.location].filter(Boolean).join(" "));
  const serviceTokens = ticketClaimTokens([identity.service.name, identity.service.serviceId].filter(Boolean).join(" "));
  const timeTokens = ticketClaimTokens([identity.time.scheduledFor, identity.time.timezone].filter(Boolean).join(" "));
  const matchedBusiness = matchingTokens(significantClaimTokens, businessTokens);
  const matchedService = matchingTokens(significantClaimTokens, serviceTokens);
  const matchedTime = matchingTokens(significantClaimTokens, timeTokens);
  const matchedFields = [
    ...(matchedBusiness.length > 0 ? ["business"] : []),
    ...(matchedService.length > 0 ? ["service"] : []),
    ...(matchedTime.length > 0 ? ["scheduledFor"] : [])
  ];
  const identityCategoryTokens = new Set([...businessTokens, ...serviceTokens].filter((token) => serviceCategoryTokens.has(token)));
  const conflictingTerms = significantClaimTokens
    .filter((token) => serviceCategoryTokens.has(token))
    .filter((token) => !identityCategoryTokens.has(token));

  if (matchedBusiness.length > 0 && matchedService.length > 0) {
    return ticketClaimMatchResult("exact_match", rawClaim, matchedFields, [], "business_and_service_match", clarificationLine);
  }

  if (conflictingTerms.length > 0 && matchedService.length === 0) {
    return ticketClaimMatchResult("mismatch", rawClaim, matchedFields, conflictingTerms, "claimed_service_category_does_not_match_ticket", clarificationLine);
  }

  if (matchedFields.length > 0) {
    return ticketClaimMatchResult("possible_match", rawClaim, matchedFields, conflictingTerms, "partial_identity_match", clarificationLine);
  }

  return ticketClaimMatchResult("needs_user_clarification", rawClaim, [], conflictingTerms, "claim_too_vague_for_ticket_identity", clarificationLine);
}

function ticketClaimMatchResult(
  status: TicketClaimMatchStatus,
  userClaim: string,
  matchedFields: string[],
  conflictingTerms: string[],
  reason: string,
  clarificationLine: string
) {
  return {
    status,
    userClaim: userClaim || null,
    matchedFields,
    conflictingTerms,
    reason,
    clarificationLine,
    safeNextAction: status === "exact_match"
      ? "continue_with_status_or_allowed_action_check"
      : "ask_clarifying_question_before_routing_or_sending_proof"
  };
}

function ticketClarificationLine(identity: TicketIdentity) {
  const serviceLabel = identity.service.name ?? identity.service.serviceId;
  const businessLabel = identity.business.name ?? identity.business.businessId;
  const timeLabel = identity.time.scheduledFor ? ` on ${identity.time.scheduledFor}` : "";
  return `I found ${identity.references.displayCode} for ${serviceLabel} at ${businessLabel}${timeLabel}. Is that the ticket you mean?`;
}

function ticketClaimTokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 1);
}

function matchingTokens(claimTokens: string[], identityTokens: string[]) {
  const identitySet = new Set(identityTokens);
  return [...new Set(claimTokens.filter((token) => identitySet.has(token)))];
}

function compactIdentityText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function ticketIdentity(
  runtime: TicketToolRuntime,
  record: TicketWalletRecord,
  currentStatus: AgentPortCommitment["status"],
  verifiedCurrent: boolean
) {
  const tenant = await resolveTicketTenant(runtime, record.commitment.business.businessId);
  const service = tenant?.bindings
    .flatMap((binding) => binding.staticServices ?? [])
    .find((candidate) => candidate.id === record.commitment.business.serviceId);
  const businessName = record.businessName ?? tenant?.name ?? null;
  const businessLocation = record.businessLocation ?? tenant?.address ?? null;
  const serviceName = record.serviceName ?? service?.name ?? null;
  const displayCode = record.displayCode ?? record.ticketRef;
  const createdAt = record.createdAt ?? record.commitment.events.find((event) => event.type === "created")?.at ?? null;
  const scheduledFor = record.scheduledFor ?? null;
  const businessLabel = businessName ?? record.commitment.business.businessId;
  const serviceLabel = serviceName ?? record.commitment.business.serviceId;

  return {
    displayTitle: `${serviceLabel} at ${businessLabel}`,
    summaryLine: `${displayCode}: ${serviceLabel} at ${businessLabel} is ${currentStatus}`,
    storeLine: businessLocation ? `Store: ${businessLabel} (${businessLocation})` : `Store: ${businessLabel}`,
    serviceLine: `Service: ${serviceLabel}`,
    timeLine: scheduledFor ? `Time: ${scheduledFor}` : "Time: unavailable in ticket record",
    referenceLine: `Reference: ${displayCode}; confirmation ${record.commitment.backend.confirmationId}`,
    business: {
      businessId: record.commitment.business.businessId,
      name: businessName,
      location: businessLocation,
      bindingId: record.commitment.business.bindingId ?? null
    },
    service: {
      serviceId: record.commitment.business.serviceId,
      name: serviceName
    },
    time: {
      scheduledFor,
      scheduledForSource: scheduledFor ? "ticket_record" as const : "unavailable" as const,
      createdAt,
      updatedAt: record.updatedAt ?? null,
      timezone: record.timezone ?? null
    },
    status: {
      value: currentStatus,
      source: verifiedCurrent ? "agent_gateway" as const : "local_last_known" as const,
      verifiedCurrent
    },
    references: {
      ticketRef: record.ticketRef,
      displayCode,
      walletTicketId: record.walletTicketId,
      commitmentId: record.commitment.commitmentId,
      confirmationId: record.commitment.backend.confirmationId,
      backendSource: record.commitment.backend.source,
      holderRef: record.holderRef ?? record.commitment.subject.holderRef
    },
    claimSafety: {
      requiresExactIdentityMatch: true,
      matchFields: ["business", "service", "scheduledFor_or_confirmationId"],
      ifUserClaimDiffers: "do_not_relabel_ticket; ask_clarifying_question_before_routing_or_sending_proof"
    }
  };
}

async function resolveTicketTenant(runtime: TicketToolRuntime, businessId: string) {
  if (!runtime.tenants) {
    return null;
  }

  try {
    return await runtime.tenants.resolveTenant(businessId);
  } catch {
    return null;
  }
}

export async function sendTicket(runtime: TicketToolRuntime, input: SendTicketInput) {
  if (input.userConsent !== true) {
    return {
      type: "rejected" as const,
      reason: "consent_required"
    };
  }

  const verification = verifyTicket(runtime, input);
  if (verification.type !== "verified") {
    return verification;
  }

  if (!verification.allowedActions.includes("send_ticket")) {
    return {
      type: "rejected" as const,
      reason: "ticket_delivery_not_allowed",
      commitmentId: input.commitment.commitmentId,
      status: input.commitment.status
    };
  }

  let customerActor: ActorContext | undefined;
  if (runtime.ticketHolderIdentity) {
    const identity = runtime.ticketHolderIdentity.authenticate({
      holderRef: input.holderRef,
      commitment: input.commitment,
      scope: "ticket:send"
    });
    if (!identity.ok) {
      return {
        type: "rejected" as const,
        reason: identity.reason,
        commitmentId: input.commitment.commitmentId,
        status: input.commitment.status
      };
    }
    customerActor = ticketHolderPrincipalActor(identity.principal, {
      holderRef: input.holderRef ?? input.commitment.subject.holderRef,
      commitmentId: input.commitment.commitmentId
    });
  }

  if (!runtime.ticketDelivery) {
    return {
      type: "handoff" as const,
      reason: "ticket_delivery_sink_unavailable",
      commitmentId: input.commitment.commitmentId,
      status: input.commitment.status,
      destination: input.destination
    };
  }

  const requestedActor = input.requestedBy ? pluginHostActor(input.requestedBy) : undefined;
  const verifyingGatewayActor = gatewayActor("ticket:send", input.commitment.commitmentId);
  const delivery = await runtime.ticketDelivery.deliver({
    commitment: input.commitment,
    receipt: input.receipt,
    destination: input.destination,
    requestedBy: input.requestedBy,
    proofLevel: verification.proofLevel,
    requestedActor,
    customerActor,
    gatewayActor: verifyingGatewayActor
  });

  await runtime.audit?.record({
    type: "ticket_delivery",
    businessId: input.commitment.business.businessId,
    serviceId: input.commitment.business.serviceId,
    resultType: "sent",
    metadata: {
      commitmentId: input.commitment.commitmentId,
      deliveryId: delivery.deliveryId,
      destination: {
        kind: input.destination.kind,
        target: input.destination.target
      },
      backendMutation: false,
      actors: compactActors({
        requestedActor,
        customerActor,
        gatewayActor: verifyingGatewayActor
      })
    },
    at: delivery.deliveredAt ?? new Date().toISOString()
  });

  return {
    type: "sent" as const,
    commitmentId: input.commitment.commitmentId,
    status: input.commitment.status,
    proofLevel: verification.proofLevel,
    destination: input.destination,
    delivery,
    backendMutation: false
  };
}

export async function listTicketDeliveries(runtime: TicketToolRuntime, input: TicketDeliveryListInput = {}) {
  if (!runtime.ticketDelivery?.list) {
    return {
      type: "unavailable" as const,
      reason: "ticket_delivery_inbox_unavailable"
    };
  }

  const records = await runtime.ticketDelivery.list(input);
  return {
    type: "ticket_deliveries" as const,
    count: records.length,
    deliveries: records
  };
}

export async function acknowledgeTicketDelivery(runtime: TicketToolRuntime, input: TicketDeliveryAcknowledgeInput) {
  if (!isTicketDeliveryBusinessInboxStatus(input.status)) {
    return {
      type: "rejected" as const,
      reason: "business_inbox_status_invalid",
      deliveryId: input.deliveryId,
      businessId: input.businessId
    };
  }

  if (!runtime.ticketDelivery?.acknowledge) {
    return {
      type: "unavailable" as const,
      reason: "ticket_delivery_acknowledgement_unavailable",
      deliveryId: input.deliveryId,
      businessId: input.businessId
    };
  }

  const delivery = await runtime.ticketDelivery.acknowledge(input);
  if (!delivery) {
    return {
      type: "not_found" as const,
      reason: "ticket_delivery_not_found",
      deliveryId: input.deliveryId,
      businessId: input.businessId
    };
  }

  await runtime.audit?.record({
    type: "ticket_delivery_acknowledgement",
    businessId: input.businessId,
    serviceId: delivery.serviceId,
    resultType: input.status,
    metadata: {
      deliveryId: input.deliveryId,
      backendMutation: false,
      acknowledgedBy: input.acknowledgedBy
    },
    at: delivery.businessInboxStatusAt ?? new Date().toISOString()
  });

  return {
    type: "acknowledged" as const,
    delivery,
    backendMutation: false
  };
}

export function isTicketDeliveryBusinessInboxStatus(value: string): value is TicketDeliveryBusinessInboxStatus {
  return [
    "delivered",
    "seen",
    "accepted_for_review",
    "needs_handoff",
    "rejected_cannot_fulfill"
  ].includes(value);
}

function validateCommitmentStructure(commitment: AgentPortCommitment | undefined):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!commitment || commitment.protocol !== "agentport-commitment" || commitment.version !== "0.1") {
    return { ok: false, reason: "commitment_protocol_unsupported" };
  }

  if (!commitment.commitmentId || !commitment.subject?.holderRef || !commitment.business?.businessId) {
    return { ok: false, reason: "commitment_required_field_missing" };
  }

  if (!commitment.backend?.confirmationId || commitment.backend.systemOfRecord !== true) {
    return { ok: false, reason: "commitment_backend_ref_missing" };
  }

  if (!commitment.receipts?.length) {
    return { ok: false, reason: "commitment_receipt_ref_missing" };
  }

  return { ok: true };
}

function normalizeTicketRef(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function limitRecords(records: TicketDeliveryRecord[], limit = 50) {
  return records.slice(-Math.max(1, limit)).reverse().map((record) => structuredClone(record));
}

function filterDeliveryRecords(records: TicketDeliveryRecord[], input: TicketDeliveryListInput) {
  return records
    .filter((record) => !input.businessId || record.businessId === input.businessId)
    .filter((record) => !input.destinationKind || record.destination.kind === input.destinationKind);
}

function acknowledgeDeliveryRecord(
  record: TicketDeliveryRecord,
  input: TicketDeliveryAcknowledgeInput,
  now: () => Date
): TicketDeliveryRecord {
  const at = input.at ?? now().toISOString();
  const event: TicketDeliveryBusinessInboxEvent = {
    status: input.status,
    at,
    ...(input.acknowledgedBy ? { by: input.acknowledgedBy } : {}),
    ...(input.note ? { note: input.note } : {})
  };
  return {
    ...structuredClone(record),
    businessInboxStatus: input.status,
    businessInboxStatusAt: at,
    ...(input.acknowledgedBy ? { businessInboxStatusBy: input.acknowledgedBy } : {}),
    ...(input.note ? { businessInboxNote: input.note } : {}),
    businessInboxEvents: [...(record.businessInboxEvents ?? []), event],
    backendMutation: false
  };
}

function ticketDeliveryRecordFromInput(input: {
  commitment: AgentPortCommitment;
  receipt?: ActionReceipt;
  destination: TicketDestination;
  deliveryId: string;
  deliveredAt: string;
  requestedBy?: string;
  proofLevel?: string;
  requestedActor?: ActorContext;
  customerActor?: ActorContext;
  gatewayActor?: ActorContext;
}): TicketDeliveryRecord {
  const receiptRef = input.receipt ?? input.commitment.receipts?.[0];
  return {
    deliveryId: input.deliveryId,
    deliveredAt: input.deliveredAt,
    destination: {
      kind: input.destination.kind,
      ...(input.destination.label ? { label: input.destination.label } : {})
    },
    destinationRef: input.destination.target,
    ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
    ...(input.requestedActor ? { requestedActor: structuredClone(input.requestedActor) } : {}),
    ...(input.customerActor ? { customerActor: structuredClone(input.customerActor) } : {}),
    ...(input.gatewayActor ? { gatewayActor: structuredClone(input.gatewayActor) } : {}),
    commitmentId: input.commitment.commitmentId,
    status: input.commitment.status,
    ...(input.proofLevel ? { proofLevel: input.proofLevel } : {}),
    businessId: input.commitment.business.businessId,
    serviceId: input.commitment.business.serviceId,
    ...(demoDisplayCode(input.commitment) ? { displayCode: demoDisplayCode(input.commitment) } : {}),
    ...(receiptRef?.action ? { commitmentAction: receiptRef.action } : {}),
    ...(receiptRef?.resultType ? { commitmentResult: receiptRef.resultType } : {}),
    ...(receiptRef?.receiptId ? { receiptId: receiptRef.receiptId } : {}),
    ...(input.commitment.authority?.assurance ? { authorityAssurance: input.commitment.authority.assurance } : {}),
    ...(input.commitment.backend?.source ? { backendSource: input.commitment.backend.source } : {}),
    ...(input.commitment.subject?.clientAgentId ? { clientAgentId: input.commitment.subject.clientAgentId } : {}),
    backendConfirmationId: input.commitment.backend.confirmationId,
    backendMutation: false,
    businessInboxStatus: "delivered",
    businessInboxStatusAt: input.deliveredAt,
    businessInboxStatusBy: "agentport-gateway",
    businessInboxEvents: [{
      status: "delivered",
      at: input.deliveredAt,
      by: "agentport-gateway"
    }],
    demoOnly: true
  };
}

function compactActors(actors: {
  requestedActor?: ActorContext;
  customerActor?: ActorContext;
  gatewayActor?: ActorContext;
}) {
  return Object.fromEntries(Object.entries(actors).filter(([, value]) => value !== undefined));
}

function demoDisplayCode(commitment: AgentPortCommitment) {
  if (commitment.commitmentId === "commitment_chatgpt_smoke_1234567890") {
    return "AP-DEMO-1234";
  }
  if (commitment.commitmentId === "commitment_bistro_dinner_2201") {
    return "AP-BISTRO-2201";
  }
  if (commitment.commitmentId === "commitment_bike_repair_7782") {
    return "AP-BIKE-7782";
  }
  if (commitment.commitmentId === "commitment_print_pickup_4409") {
    return "AP-PRINT-4409";
  }
  if (commitment.commitmentId.startsWith("commitment_demo_gpt_")) {
    return `AP-LIVE-${commitment.commitmentId.slice(-4)}`;
  }
  return undefined;
}

function demoTicketRegistryRecords(): TicketRegistryRecord[] {
  return [
    demoTicketRegistryRecord(),
    demoCompatibilityTicketRegistryRecord({
      ticketRef: "AP-BISTRO-2201",
      displayCode: "AP-BISTRO-2201",
      label: "River Table dinner ticket",
      commitmentId: "commitment_bistro_dinner_2201",
      status: "active",
      businessId: "river-table-bistro-twin",
      serviceId: "dinner_reservation",
      bindingId: "fixture-reservation#0",
      backendSource: "fixture",
      backendConfirmationId: "fixture-bistro-dinner-2201",
      receiptId: "receipt_bistro_dinner_2201",
      receiptAction: "book_service",
      receiptResultType: "confirmed",
      eventType: "created",
      eventAt: "2026-06-25T18:30:00.000Z",
      aliases: ["BISTRO-2201", "fixture-bistro-dinner-2201"]
    }),
    demoCompatibilityTicketRegistryRecord({
      ticketRef: "AP-BIKE-7782",
      displayCode: "AP-BIKE-7782",
      label: "Northstar repair ticket",
      commitmentId: "commitment_bike_repair_7782",
      status: "rescheduled",
      businessId: "northstar-bike-repair-twin",
      serviceId: "repair_slot",
      bindingId: "fixture-repair#0",
      backendSource: "fixture",
      backendConfirmationId: "fixture-bike-repair-7782",
      receiptId: "receipt_bike_repair_7782",
      receiptAction: "reschedule_service",
      receiptResultType: "rescheduled",
      eventType: "rescheduled",
      eventAt: "2026-06-25T20:15:00.000Z",
      aliases: ["BIKE-7782", "fixture-bike-repair-7782"]
    }),
    demoCompatibilityTicketRegistryRecord({
      ticketRef: "AP-PRINT-4409",
      displayCode: "AP-PRINT-4409",
      label: "Pixelprint pickup ticket",
      commitmentId: "commitment_print_pickup_4409",
      status: "cancelled",
      businessId: "pixelprint-lab-twin",
      serviceId: "rush_print_pickup",
      bindingId: "fixture-print#0",
      backendSource: "fixture",
      backendConfirmationId: "fixture-print-pickup-4409",
      receiptId: "receipt_print_pickup_4409",
      receiptAction: "cancel_service",
      receiptResultType: "cancelled",
      eventType: "cancelled",
      eventAt: "2026-06-25T21:05:00.000Z",
      aliases: ["PRINT-4409", "fixture-print-pickup-4409"]
    })
  ];
}

function demoTicketRegistryRecord(): TicketRegistryRecord {
  return {
    ticketRef: "AP-DEMO-1234",
    displayCode: "AP-DEMO-1234",
    demoOnly: true,
    holderProofRequired: true,
    businessName: "Verified Day Spa",
    businessLocation: "456 Wellness Ave, Newton, MA",
    serviceName: "Swedish Massage",
    scheduledFor: "2026-06-28T14:30:00.000-04:00",
    timezone: "America/New_York",
    createdAt: "2026-06-26T12:00:00.000Z",
    aliases: [
      "DEMO-1234",
      "fixture-massage-smoke-0001",
      "commitment_chatgpt_smoke_1234567890"
    ],
    commitment: {
      protocol: "agentport-commitment",
      version: "0.1",
      commitmentId: "commitment_chatgpt_smoke_1234567890",
      status: "active",
      subject: {
        holderRef: "user_ticket_456",
        clientAgentId: "chatgpt_action_smoke"
      },
      business: {
        businessId: "verified-spa",
        serviceId: "massage",
        bindingId: "fixture#0"
      },
      backend: {
        source: "fixture",
        confirmationId: "fixture-massage-smoke-0001",
        systemOfRecord: true
      },
      authority: {
        assurance: "signed",
        evidenceRefs: ["agentport-local-delegation:issuer_test:del_chatgpt_smoke"],
        delegationId: "del_chatgpt_smoke",
        consentId: "consent_chatgpt_smoke"
      },
      rights: {
        allowedActions: ["verify", "send_ticket"],
        transferable: false,
        modificationRequiresConsent: true,
        cancellationRequiresConsent: true
      },
      recoveryPolicy: {
        mode: "agentport_handoff",
        fallbackAction: "handoff"
      },
      events: [{
        eventId: "event_chatgpt_smoke",
        type: "created",
        at: "2026-06-26T12:00:00.000Z",
        actor: "business_gateway",
        receiptId: "receipt_chatgpt_smoke",
        backendConfirmationId: "fixture-massage-smoke-0001"
      }],
      receipts: [{
        receiptId: "receipt_chatgpt_smoke",
        action: "book_service",
        resultType: "confirmed",
        payloadHash: "b".repeat(64),
        keyId: "gateway-key-smoke",
        signature: "sig_chatgpt_smoke"
      }]
    },
    holderRef: "user_ticket_456"
  };
}

function demoCompatibilityTicketRegistryRecord(input: {
  ticketRef: string;
  displayCode: string;
  label: string;
  commitmentId: string;
  status: AgentPortCommitment["status"];
  businessId: string;
  serviceId: string;
  bindingId: string;
  backendSource: string;
  backendConfirmationId: string;
  receiptId: string;
  receiptAction: AgentPortCommitment["receipts"][number]["action"];
  receiptResultType: AgentPortCommitment["receipts"][number]["resultType"];
  eventType: AgentPortCommitment["events"][number]["type"];
  eventAt: string;
  aliases: string[];
}): TicketRegistryRecord {
  return {
    ticketRef: input.ticketRef,
    displayCode: input.displayCode,
    demoOnly: true,
    holderProofRequired: true,
    aliases: [
      ...input.aliases,
      input.backendConfirmationId,
      input.commitmentId
    ],
    commitment: {
      protocol: "agentport-commitment",
      version: "0.1",
      commitmentId: input.commitmentId,
      status: input.status,
      subject: {
        holderRef: "user_ticket_456",
        clientAgentId: "chatgpt_action_compatibility"
      },
      business: {
        businessId: input.businessId,
        serviceId: input.serviceId,
        bindingId: input.bindingId
      },
      backend: {
        source: input.backendSource,
        confirmationId: input.backendConfirmationId,
        systemOfRecord: true
      },
      authority: {
        assurance: "signed",
        evidenceRefs: [`agentport-local-delegation:issuer_test:${input.commitmentId}`],
        delegationId: `del_${input.commitmentId}`,
        consentId: `consent_${input.commitmentId}`
      },
      rights: {
        allowedActions: ["verify", "cancel", "reschedule"],
        transferable: false,
        modificationRequiresConsent: true,
        cancellationRequiresConsent: true
      },
      recoveryPolicy: {
        mode: "agentport_handoff",
        fallbackAction: "handoff"
      },
      events: [{
        eventId: `event_${input.commitmentId}`,
        type: input.eventType,
        at: input.eventAt,
        actor: "business_gateway",
        receiptId: input.receiptId,
        backendConfirmationId: input.backendConfirmationId
      }],
      receipts: [{
        receiptId: input.receiptId,
        action: input.receiptAction,
        resultType: input.receiptResultType,
        payloadHash: "c".repeat(64),
        keyId: "gateway-key-compatibility",
        signature: `sig_${input.commitmentId}`
      }]
    },
    holderRef: "user_ticket_456"
  };
}

function verifyReceiptForCommitment(
  runtime: TicketToolRuntime,
  commitment: AgentPortCommitment,
  receipt: ActionReceipt | undefined
):
  | { ok: true; proofLevel: "cryptographic" | "receipt_matched" | "receipt_ref" }
  | { ok: false; proofLevel: "invalid" | "receipt_ref"; reason: string } {
  if (!receipt) {
    return { ok: false, proofLevel: "receipt_ref", reason: "receipt_body_missing" };
  }

  const ref = commitment.receipts.find((entry) => entry.receiptId === receipt.receiptId);
  if (!ref) {
    return { ok: false, proofLevel: "invalid", reason: "receipt_ref_mismatch" };
  }

  if (
    ref.action !== receipt.action ||
    ref.resultType !== receipt.resultType ||
    ref.payloadHash !== receipt.payloadHash ||
    ref.keyId !== receipt.keyId ||
    ref.signature !== receipt.signature
  ) {
    return { ok: false, proofLevel: "invalid", reason: "receipt_ref_mismatch" };
  }

  const expectations = {
    action: ref.action,
    businessId: commitment.business.businessId,
    serviceId: commitment.business.serviceId,
    resultType: ref.resultType,
    backendConfirmationId: commitment.backend.confirmationId,
    ...(gatewayTrustProfile(runtime.receipts?.trustProfile)
      ? {
          signature: actionReceiptSignatureExpectationsFromTrustProfile(
            gatewayTrustProfile(runtime.receipts?.trustProfile)!,
            { now: runtime.receipts?.now }
          )
        }
      : {})
  };
  const verified = validateActionReceipt(receipt, expectations);
  if (!verified.ok) {
    return { ok: false, proofLevel: "invalid", reason: verified.reason };
  }

  return {
    ok: true,
    proofLevel: expectations.signature ? "cryptographic" : "receipt_matched"
  };
}

function gatewayTrustProfile(
  profile: ActionReceiptGatewayTrustProfile | SignedActionReceiptGatewayTrustProfile | undefined
) {
  if (!profile) {
    return undefined;
  }

  return profile.protocol === "agentport-gateway-trust-profile" ? profile : profile.profile;
}

function allowedTicketActions(commitment: AgentPortCommitment) {
  const active = commitment.status === "active" || commitment.status === "rescheduled";
  const actions = ["verify_ticket", "get_ticket_status", "get_allowed_ticket_actions"];
  if (active) {
    actions.push("send_ticket");
  }

  if (active && commitment.rights.allowedActions.includes("transfer") && commitment.rights.transferable) {
    actions.push("transfer_ticket");
  }

  return actions;
}
