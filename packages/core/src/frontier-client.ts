import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  actionIntentResultDeliveryTrustProfileResourceUri,
  actionIntentResultDeliveryVerificationOptionsFromTrustProfile,
  type ActionIntentResultDeliveryTrustProfile,
  type ActionIntentResultDeliverySignatureExpectations,
  type ActionIntentResultDeliveryValidationResult,
  verifyActionIntentResultDelivery
} from "./action-runner-kit.js";
import type {
  PluginWalletGatewayClient,
  PluginWalletGatewayStatusResult
} from "./plugin-wallet.js";
import type {
  ActionReceipt,
  ActionIntentLifecycleEvent,
  ActionIntentResultDeliveryRecord,
  ActionIntentResultDeliveryStatus,
  AgentPortCommitment
} from "./types.js";

export interface AgentPortFrontierClientOptions {
  endpoint: string;
  agentSessionId: string;
  deliveryVerification?: ActionIntentResultDeliverySignatureExpectations;
  stateStore?: AgentPortFrontierClientStateStore;
  headers?: Record<string, string>;
  fetcher?: typeof fetch;
}

export interface AgentPortFrontierClientState {
  lifecycleCursor: number;
  deliveryCursor: number;
}

export interface AgentPortRecoveredDelivery {
  delivery: ActionIntentResultDeliveryRecord;
  verification: ActionIntentResultDeliveryValidationResult;
  acknowledged: boolean;
  ack?: unknown;
}

export interface AgentPortFrontierHostRecoveryResolution {
  kind:
    | "completed"
    | "worker_blocked"
    | "delivery_missing"
    | "delivery_verification_failed"
    | "delivery_acknowledgement_failed"
    | "session_mismatch"
    | "gateway_failed"
    | "gateway_rejected"
    | "intent_expired"
    | "evidence_invalid";
  nextAction: string;
  retryable: boolean;
  reason?: string;
}

export interface AgentPortFrontierHostRecoveryResult {
  ok: boolean;
  agentSessionId: string;
  intentId?: string;
  stateBefore: AgentPortFrontierClientState;
  stateAfter: AgentPortFrontierClientState;
  recovered: AgentPortRecoveredDelivery[];
  resolution: AgentPortFrontierHostRecoveryResolution;
}

export interface AgentPortFrontierHostIntentRuntime {
  loadDeliveryTrustProfile(): Promise<ActionIntentResultDeliveryTrustProfile>;
  loadState(agentSessionId: string): Promise<Partial<AgentPortFrontierClientState> | null>;
  saveState(agentSessionId: string, state: AgentPortFrontierClientState): Promise<void>;
  recoverIntentResult(args: {
    agentSessionId: string;
    intentId?: string;
    acknowledge?: boolean;
  }): Promise<AgentPortFrontierHostRecoveryResult>;
}

export interface AgentPortFrontierClientStateStore {
  load(agentSessionId: string): Promise<Partial<AgentPortFrontierClientState> | null>;
  save(agentSessionId: string, state: AgentPortFrontierClientState): Promise<void>;
}

export interface AgentPortFrontierClientSessionLease {
  agentSessionId: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface AgentPortFrontierClientLeaseResult {
  acquired: boolean;
  lease?: AgentPortFrontierClientSessionLease;
  existing?: AgentPortFrontierClientSessionLease;
  reason?: "lease_held";
}

export interface AgentPortFrontierClientReleaseResult {
  released: boolean;
  reason?: "lease_missing" | "lease_owner_mismatch";
}

export interface AgentPortFrontierClientLeasedStateStore extends AgentPortFrontierClientStateStore {
  acquireLease(args: {
    agentSessionId: string;
    ownerId: string;
    ttlMs: number;
    now?: Date;
  }): Promise<AgentPortFrontierClientLeaseResult>;
  releaseLease(args: {
    agentSessionId: string;
    ownerId: string;
  }): Promise<AgentPortFrontierClientReleaseResult>;
}

export class AgentPortFrontierClientError extends Error {
  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "AgentPortFrontierClientError";
  }
}

export class AgentPortFrontierClient implements PluginWalletGatewayClient {
  private lifecycleCursor = 0;
  private deliveryCursor = 0;
  private requestId = 0;
  private readonly fetcher: typeof fetch;
  private deliveryVerification?: ActionIntentResultDeliverySignatureExpectations;

  constructor(private readonly options: AgentPortFrontierClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.deliveryVerification = options.deliveryVerification;
  }

  get agentSessionId(): string {
    return this.options.agentSessionId;
  }

  get state(): AgentPortFrontierClientState {
    return {
      lifecycleCursor: this.lifecycleCursor,
      deliveryCursor: this.deliveryCursor
    };
  }

  setState(state: Partial<AgentPortFrontierClientState>): void {
    if (typeof state.lifecycleCursor === "number") {
      this.lifecycleCursor = state.lifecycleCursor;
    }
    if (typeof state.deliveryCursor === "number") {
      this.deliveryCursor = state.deliveryCursor;
    }
  }

  async loadState(): Promise<AgentPortFrontierClientState> {
    const state = await this.options.stateStore?.load(this.options.agentSessionId);
    if (state) {
      this.setState(state);
    }
    return this.state;
  }

  async saveState(): Promise<void> {
    await this.options.stateStore?.save(this.options.agentSessionId, this.state);
  }

  setDeliveryVerification(expectations: ActionIntentResultDeliverySignatureExpectations | undefined): void {
    this.deliveryVerification = expectations;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const payload = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    };
    const response = await this.fetcher(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agentport-agent-session-id": this.options.agentSessionId,
        ...(this.options.headers ?? {})
      },
      body: JSON.stringify(payload)
    });

    const rpc = await response.json() as {
      result?: {
        structuredContent?: T;
      };
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    };
    if (!response.ok || rpc.error) {
      throw new AgentPortFrontierClientError(rpc.error?.message ?? `agentport_http_${response.status}`, {
        status: response.status,
        rpcError: rpc.error
      });
    }

    return rpc.result?.structuredContent as T;
  }

  async readResource<T = unknown>(uri: string): Promise<T> {
    const response = await this.fetcher(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agentport-agent-session-id": this.options.agentSessionId,
        ...(this.options.headers ?? {})
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.requestId,
        method: "resources/read",
        params: { uri }
      })
    });

    const rpc = await response.json() as {
      result?: {
        contents?: Array<{
          text?: string;
        }>;
      };
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    };
    if (!response.ok || rpc.error) {
      throw new AgentPortFrontierClientError(rpc.error?.message ?? `agentport_http_${response.status}`, {
        status: response.status,
        rpcError: rpc.error
      });
    }

    const text = rpc.result?.contents?.[0]?.text;
    if (typeof text !== "string") {
      throw new AgentPortFrontierClientError("resource_text_missing", { uri });
    }
    return JSON.parse(text) as T;
  }

  async loadDeliveryTrustProfile(uri = actionIntentResultDeliveryTrustProfileResourceUri): Promise<ActionIntentResultDeliveryTrustProfile> {
    const profile = await this.readResource<ActionIntentResultDeliveryTrustProfile>(uri);
    this.deliveryVerification = actionIntentResultDeliveryVerificationOptionsFromTrustProfile(profile);
    return profile;
  }

  async compileActionIntent<T = unknown>(args: Record<string, unknown>): Promise<T> {
    return this.callTool<T>("compile_action_intent", {
      ...args,
      agentSessionId: this.options.agentSessionId,
      resultDelivery: args.resultDelivery ?? {
        channel: "inbox",
        target: `agentport://inbox/${this.options.agentSessionId}`
      }
    });
  }

  async checkAvailability<T = unknown>(args: Record<string, unknown>): Promise<T> {
    return this.callTool<T>("check_availability", args);
  }

  async getTicketStatus(input: {
    commitment: AgentPortCommitment;
    receipt?: ActionReceipt;
    holderRef?: string;
  }): Promise<PluginWalletGatewayStatusResult> {
    return this.callTool<PluginWalletGatewayStatusResult>("get_ticket_status", {
      commitment: input.commitment,
      ...(input.receipt ? { receipt: input.receipt } : {}),
      ...(input.holderRef ? { holderRef: input.holderRef } : {})
    });
  }

  async executeApprovalPackage<T = unknown>(
    approvalPackage: {
      execute?: {
        tool: string;
        arguments: Record<string, unknown>;
      };
    },
    args: Record<string, unknown>
  ): Promise<T> {
    if (!approvalPackage.execute) {
      throw new AgentPortFrontierClientError("approval_package_not_executable");
    }

    return this.callTool<T>(approvalPackage.execute.tool, {
      ...approvalPackage.execute.arguments,
      ...args
    });
  }

  async pollLifecycles(args: {
    after?: number;
    intentId?: string;
    limit?: number;
    waitMs?: number;
  } = {}): Promise<{
    cursor: number;
    events: ActionIntentLifecycleEvent[];
  }> {
    const result = await this.callTool<{
      cursor: number;
      events: ActionIntentLifecycleEvent[];
    }>("poll_action_intent_lifecycles", {
      agentSessionId: this.options.agentSessionId,
      after: args.after ?? this.lifecycleCursor,
      ...(args.intentId ? { intentId: args.intentId } : {}),
      ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
      ...(typeof args.waitMs === "number" ? { waitMs: args.waitMs } : {})
    });
    this.lifecycleCursor = Math.max(this.lifecycleCursor, result.cursor ?? this.lifecycleCursor);
    await this.saveState();
    return result;
  }

  async getLifecycle<T = unknown>(intentId: string): Promise<T> {
    return this.callTool<T>("get_action_intent_lifecycle", { intentId });
  }

  async listDeliveries(args: {
    after?: number;
    intentId?: string;
    status?: ActionIntentResultDeliveryStatus;
    limit?: number;
    advanceCursor?: boolean;
  } = {}): Promise<{
    cursor: number;
    deliveries: ActionIntentResultDeliveryRecord[];
  }> {
    const result = await this.callTool<{
      cursor: number;
      deliveries: ActionIntentResultDeliveryRecord[];
    }>("list_action_intent_result_deliveries", {
      agentSessionId: this.options.agentSessionId,
      after: args.after ?? this.deliveryCursor,
      ...(args.intentId ? { intentId: args.intentId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(typeof args.limit === "number" ? { limit: args.limit } : {})
    });
    if (args.advanceCursor !== false) {
      this.deliveryCursor = Math.max(this.deliveryCursor, result.cursor ?? this.deliveryCursor);
      await this.saveState();
    }
    return result;
  }

  async getDelivery<T = unknown>(deliveryId: string): Promise<T> {
    return this.callTool<T>("get_action_intent_result_delivery", { deliveryId });
  }

  async recoverDeliveries(args: {
    after?: number;
    intentId?: string;
    status?: ActionIntentResultDeliveryStatus;
    limit?: number;
    acknowledge?: boolean;
  } = {}): Promise<{
    cursor: number;
    deliveries: AgentPortRecoveredDelivery[];
  }> {
    const listed = await this.listDeliveries({
      ...args,
      advanceCursor: false
    });
    const recovered: AgentPortRecoveredDelivery[] = [];
    let safeCursor = args.after ?? this.deliveryCursor;
    let blocked = false;

    for (const delivery of listed.deliveries) {
      const verification = verifyActionIntentResultDelivery(
        delivery,
        this.deliveryVerification ?? {}
      );
      if (!verification.ok) {
        blocked = true;
        recovered.push({
          delivery,
          verification,
          acknowledged: false
        });
        continue;
      }

      if (args.acknowledge === false) {
        if (!blocked) {
          safeCursor = Math.max(safeCursor, delivery.cursor);
        }
        recovered.push({
          delivery,
          verification,
          acknowledged: false
        });
        continue;
      }

      const ack = await this.ackDelivery(delivery.deliveryId);
      const acked = acknowledged(ack);
      if (acked && !blocked) {
        safeCursor = Math.max(safeCursor, delivery.cursor);
      } else if (!acked) {
        blocked = true;
      }
      recovered.push({
        delivery,
        verification,
        acknowledged: acked,
        ack
      });
    }

    this.deliveryCursor = Math.max(this.deliveryCursor, safeCursor);
    await this.saveState();

    return {
      cursor: this.deliveryCursor,
      deliveries: recovered
    };
  }

  async ackDelivery<T = unknown>(deliveryId: string): Promise<T> {
    return this.callTool<T>("ack_action_intent_result_delivery", { deliveryId });
  }
}

export class FileAgentPortFrontierClientStateStore implements AgentPortFrontierClientLeasedStateStore {
  constructor(private readonly path: string) {}

  async load(agentSessionId: string): Promise<Partial<AgentPortFrontierClientState> | null> {
    const parsed = await this.loadFile();
    return parsed.sessions?.[agentSessionId] ?? null;
  }

  async save(agentSessionId: string, state: AgentPortFrontierClientState): Promise<void> {
    const parsed = await this.loadFile();
    await this.saveFile({
      ...parsed,
      sessions: {
        ...(parsed.sessions ?? {}),
        [agentSessionId]: state
      }
    });
  }

  async acquireLease(args: {
    agentSessionId: string;
    ownerId: string;
    ttlMs: number;
    now?: Date;
  }): Promise<AgentPortFrontierClientLeaseResult> {
    const parsed = await this.loadFile();
    const now = args.now ?? new Date();
    const existing = parsed.leases?.[args.agentSessionId];
    if (
      existing
      && existing.ownerId !== args.ownerId
      && Date.parse(existing.expiresAt) > now.getTime()
    ) {
      return {
        acquired: false,
        existing,
        reason: "lease_held"
      };
    }

    const lease = {
      agentSessionId: args.agentSessionId,
      ownerId: args.ownerId,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + args.ttlMs).toISOString()
    };
    await this.saveFile({
      ...parsed,
      leases: {
        ...(parsed.leases ?? {}),
        [args.agentSessionId]: lease
      }
    });
    return {
      acquired: true,
      lease
    };
  }

  async releaseLease(args: {
    agentSessionId: string;
    ownerId: string;
  }): Promise<AgentPortFrontierClientReleaseResult> {
    const parsed = await this.loadFile();
    const existing = parsed.leases?.[args.agentSessionId];
    if (!existing) {
      return {
        released: false,
        reason: "lease_missing"
      };
    }
    if (existing.ownerId !== args.ownerId) {
      return {
        released: false,
        reason: "lease_owner_mismatch"
      };
    }

    const leases = { ...(parsed.leases ?? {}) };
    delete leases[args.agentSessionId];
    await this.saveFile({
      ...parsed,
      leases
    });
    return {
      released: true
    };
  }

  private async loadFile(): Promise<{
    sessions?: Record<string, Partial<AgentPortFrontierClientState>>;
    leases?: Record<string, AgentPortFrontierClientSessionLease>;
  }> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as {
        sessions?: Record<string, Partial<AgentPortFrontierClientState>>;
        leases?: Record<string, AgentPortFrontierClientSessionLease>;
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async saveFile(state: {
    sessions?: Record<string, Partial<AgentPortFrontierClientState>>;
    leases?: Record<string, AgentPortFrontierClientSessionLease>;
  }): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`);
  }
}

function acknowledged(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && "acknowledged" in value
    && (value as { acknowledged?: unknown }).acknowledged === true
  );
}
