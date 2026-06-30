import { createHash } from "node:crypto";
import type {
  ActionReceipt,
  AvailabilityRequest,
  AvailabilityResult,
  BookRequest,
  BookResult,
  CancelRequest,
  CancelResult,
  RescheduleRequest,
  RescheduleResult
} from "./types.js";

export const EXECUTION_TRACE_TYPE = "agentport.execution_graph_record.v0.1";
export const EXECUTION_TRACE_VERSION = "0.1";

export type ExecutionNodeKind =
  | "business_info"
  | "business_feed"
  | "availability"
  | "action"
  | "assist";

export type ExecutionNodeState =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "rejected"
  | "handoff"
  | "not_found";

export type ExecutionOutcomeStatus =
  | "success"
  | "partial"
  | "failed"
  | "abandoned"
  | "handoff"
  | "rejected"
  | "not_found";

export interface ExecutionGoal {
  id: string;
  summary: string;
  domain?: string;
  constraints?: Record<string, string | number | boolean | null>;
}

export interface TaskNode {
  id: string;
  kind: ExecutionNodeKind;
  label: string;
  state: ExecutionNodeState;
  businessId?: string;
  serviceId?: string;
  requiredCapability?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface TaskEdge {
  from: string;
  to: string;
}

export interface ActionAttempt {
  nodeId: string;
  actor: "agentport_gateway" | "client_agent" | "business_backend" | "human_operator";
  channel: "mcp_tool" | "internal" | "backend_adapter" | "handoff";
  tool?: string;
  startedAt: string;
  completedAt: string;
  result: Record<string, string | number | boolean | null>;
}

export interface EvidenceRef {
  kind: "action_receipt" | "gateway_result" | "availability_result" | "business_record";
  ref?: string;
  receiptId?: string;
  hash?: string;
  source?: string;
}

export interface OutcomeSummary {
  status: ExecutionOutcomeStatus;
  terminalNode: string;
  durationMs?: number;
  failureReason?: string;
  satisfactionSignal?: "positive" | "negative" | "unknown";
}

export interface ExecutionGraphRecord {
  type: typeof EXECUTION_TRACE_TYPE;
  version: typeof EXECUTION_TRACE_VERSION;
  recordId: string;
  goal: ExecutionGoal;
  graph: {
    nodes: TaskNode[];
    edges: TaskEdge[];
  };
  attempts: ActionAttempt[];
  evidence: EvidenceRef[];
  outcome: OutcomeSummary;
  privacy: {
    excludes: string[];
  };
  createdAt: string;
}

export interface ExecutionTraceSink {
  record(trace: ExecutionGraphRecord): Promise<void>;
}

export class NoopExecutionTraceSink implements ExecutionTraceSink {
  async record(): Promise<void> {
    // Intentionally empty.
  }
}

export class MemoryExecutionTraceSink implements ExecutionTraceSink {
  readonly records: ExecutionGraphRecord[] = [];

  async record(trace: ExecutionGraphRecord): Promise<void> {
    this.records.push(trace);
  }

  clear(): void {
    this.records.length = 0;
  }
}

export interface ExecutionTraceTiming {
  startedAt?: Date;
  completedAt?: Date;
}

export function createBusinessInfoExecutionTrace(
  input: { businessId: string },
  result: { found: boolean; businessId: string; reason?: string },
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "get_business_info";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;
  const status = result.found ? "success" : "not_found";
  const summary = result.found
    ? `Get business info for ${input.businessId}`
    : `Get missing business info for ${input.businessId}`;

  return createSingleNodeTrace({
    tool: "get_business_info",
    node: {
      id: nodeId,
      kind: "business_info",
      label: "Get business info",
      state: result.found ? "complete" : "not_found",
      businessId: input.businessId
    },
    goal: goalFor(input.businessId, summary),
    startedAt,
    completedAt,
    resultSummary: {
      found: result.found,
      businessId: result.businessId,
      reason: result.reason ?? null
    },
    evidenceKind: "business_record",
    outcome: {
      status,
      terminalNode: nodeId,
      failureReason: result.reason
    }
  });
}

export function createBusinessFeedExecutionTrace(
  input: { businessId: string; mode?: string; intent?: string; ifBusinessVersion?: string },
  result: { found: boolean; businessId: string; reason?: string; notModified?: boolean; businessVersion?: string },
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "get_business_feed";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;
  const status = result.found ? "success" : "not_found";

  return createSingleNodeTrace({
    tool: "get_business_feed",
    node: {
      id: nodeId,
      kind: "business_feed",
      label: "Get business feed",
      state: result.found ? "complete" : "not_found",
      businessId: input.businessId,
      metadata: {
        mode: input.mode ?? "compact",
        intent: input.intent ?? null,
        conditionalRead: Boolean(input.ifBusinessVersion)
      }
    },
    goal: goalFor(input.businessId, `Get business feed for ${input.businessId}`),
    startedAt,
    completedAt,
    resultSummary: {
      found: result.found,
      businessId: result.businessId,
      notModified: result.notModified ?? false,
      businessVersion: result.businessVersion ?? null,
      reason: result.reason ?? null
    },
    evidenceKind: "business_record",
    outcome: {
      status,
      terminalNode: nodeId,
      failureReason: result.reason
    }
  });
}

export function createAvailabilityExecutionTrace(
  input: AvailabilityRequest,
  result: AvailabilityResult,
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "check_availability";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;
  const supported = result.supported;

  return createSingleNodeTrace({
    tool: "check_availability",
    node: {
      id: nodeId,
      kind: "availability",
      label: "Check availability",
      state: supported ? "complete" : "failed",
      businessId: input.businessId,
      serviceId: input.serviceId
    },
    goal: goalFor(input.businessId, `Check availability for ${input.serviceId}`),
    startedAt,
    completedAt,
    resultSummary: supported
      ? {
          supported: true,
          serviceId: result.serviceId,
          slotCount: result.slots.length,
          source: result.source ?? null
        }
      : {
          supported: false,
          reason: result.reason,
          source: result.source ?? null
        },
    evidenceKind: "availability_result",
    outcome: {
      status: supported ? "success" : "failed",
      terminalNode: nodeId,
      failureReason: supported ? undefined : result.reason
    }
  });
}

export function createBookServiceExecutionTrace(
  input: BookRequest,
  result: BookResult,
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "book_service";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;

  return createSingleNodeTrace({
    tool: "book_service",
    node: {
      id: nodeId,
      kind: "action",
      label: "Book or request service",
      state: nodeStateForBookResult(result),
      businessId: input.businessId,
      serviceId: input.serviceId,
      requiredCapability: input.requestedType ?? "default"
    },
    goal: goalFor(input.businessId, `Book or request ${input.serviceId}`),
    startedAt,
    completedAt,
    resultSummary: bookResultSummary(result),
    evidenceKind: "gateway_result",
    receipt: result.receipt,
    outcome: {
      status: outcomeStatusForBookResult(result),
      terminalNode: nodeId,
      failureReason: "reason" in result ? result.reason : undefined
    }
  });
}

export function createCancelServiceExecutionTrace(
  input: CancelRequest,
  result: CancelResult,
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "cancel_service";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;

  return createSingleNodeTrace({
    tool: "cancel_service",
    node: {
      id: nodeId,
      kind: "action",
      label: "Cancel service",
      state: nodeStateForManageResult(result),
      businessId: input.businessId,
      serviceId: input.serviceId,
      requiredCapability: "manage-ready"
    },
    goal: goalFor(input.businessId, `Cancel ${input.serviceId}`),
    startedAt,
    completedAt,
    resultSummary: manageResultSummary(result),
    evidenceKind: "gateway_result",
    receipt: result.receipt,
    outcome: {
      status: outcomeStatusForManageResult(result),
      terminalNode: nodeId,
      failureReason: "reason" in result ? result.reason : undefined
    }
  });
}

export function createRescheduleServiceExecutionTrace(
  input: RescheduleRequest,
  result: RescheduleResult,
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "reschedule_service";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;

  return createSingleNodeTrace({
    tool: "reschedule_service",
    node: {
      id: nodeId,
      kind: "action",
      label: "Reschedule service",
      state: nodeStateForManageResult(result),
      businessId: input.businessId,
      serviceId: input.serviceId,
      requiredCapability: "manage-ready"
    },
    goal: goalFor(input.businessId, `Reschedule ${input.serviceId}`),
    startedAt,
    completedAt,
    resultSummary: manageResultSummary(result),
    evidenceKind: "gateway_result",
    receipt: result.receipt,
    outcome: {
      status: outcomeStatusForManageResult(result),
      terminalNode: nodeId,
      failureReason: "reason" in result ? result.reason : undefined
    }
  });
}

export function createAssistExecutionTrace(
  input: { goal: string; location?: string },
  result: { outcome: string; actions?: Array<{ tool?: string }>; citations?: unknown[] },
  timing: ExecutionTraceTiming = {}
): ExecutionGraphRecord {
  const nodeId = "assist";
  const completedAt = timing.completedAt ?? new Date();
  const startedAt = timing.startedAt ?? completedAt;
  const actionTools = (result.actions ?? [])
    .map((action) => action.tool)
    .filter((tool): tool is string => typeof tool === "string");
  const resultSummary = {
    outcome: result.outcome,
    actionCount: actionTools.length,
    citationCount: result.citations?.length ?? 0,
    actionTools: actionTools.join(",") || null
  };

  return createSingleNodeTrace({
    tool: "assist",
    node: {
      id: nodeId,
      kind: "assist",
      label: "Grounded assist",
      state: result.outcome === "no_verified_info" ? "failed" : "complete",
      metadata: {
        locationProvided: Boolean(input.location)
      }
    },
    goal: {
      id: `goal_${sha256Hex(input.goal).slice(0, 16)}`,
      summary: input.goal,
      domain: "local_service",
      constraints: input.location ? { location: input.location } : undefined
    },
    startedAt,
    completedAt,
    resultSummary,
    evidenceKind: "gateway_result",
    outcome: {
      status: result.outcome === "no_verified_info" ? "failed" : "success",
      terminalNode: nodeId,
      failureReason: result.outcome === "no_verified_info" ? "no_verified_info" : undefined
    }
  });
}

function createSingleNodeTrace(input: {
  tool: string;
  node: TaskNode;
  goal: ExecutionGoal;
  startedAt: Date;
  completedAt: Date;
  resultSummary: Record<string, string | number | boolean | null>;
  evidenceKind: EvidenceRef["kind"];
  receipt?: ActionReceipt;
  outcome: Omit<OutcomeSummary, "durationMs" | "satisfactionSignal">;
}): ExecutionGraphRecord {
  const startedAt = input.startedAt.toISOString();
  const completedAt = input.completedAt.toISOString();
  const durationMs = Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  const evidence = evidenceFor(input.evidenceKind, input.resultSummary, input.receipt);
  const recordSeed = {
    tool: input.tool,
    nodeId: input.node.id,
    businessId: input.node.businessId,
    serviceId: input.node.serviceId,
    startedAt,
    completedAt,
    outcome: input.outcome,
    result: input.resultSummary
  };

  return {
    type: EXECUTION_TRACE_TYPE,
    version: EXECUTION_TRACE_VERSION,
    recordId: `trace_${sha256Hex(stableJson(recordSeed)).slice(0, 24)}`,
    goal: input.goal,
    graph: {
      nodes: [input.node],
      edges: []
    },
    attempts: [
      {
        nodeId: input.node.id,
        actor: "agentport_gateway",
        channel: "mcp_tool",
        tool: input.tool,
        startedAt,
        completedAt,
        result: input.resultSummary
      }
    ],
    evidence,
    outcome: {
      ...input.outcome,
      durationMs,
      satisfactionSignal: "unknown"
    },
    privacy: {
      excludes: [
        "chain_of_thought",
        "raw_conversation",
        "customer_contact_details",
        "raw_authority_tokens",
        "credentials",
        "payment_credentials"
      ]
    },
    createdAt: completedAt
  };
}

function goalFor(businessId: string, summary: string): ExecutionGoal {
  return {
    id: `goal_${sha256Hex(businessId).slice(0, 16)}`,
    summary,
    domain: "local_service"
  };
}

function evidenceFor(
  kind: EvidenceRef["kind"],
  resultSummary: Record<string, string | number | boolean | null>,
  receipt?: ActionReceipt
): EvidenceRef[] {
  const refs: EvidenceRef[] = [
    {
      kind,
      hash: `sha256:${sha256Hex(stableJson(resultSummary))}`
    }
  ];

  if (receipt) {
    refs.push({
      kind: "action_receipt",
      receiptId: receipt.receiptId,
      hash: receipt.payloadHash ? `sha256:${receipt.payloadHash}` : `sha256:${sha256Hex(stableJson(receipt))}`,
      source: receipt.issuer
    });
  }

  return refs;
}

function bookResultSummary(result: BookResult): Record<string, string | number | boolean | null> {
  switch (result.type) {
    case "confirmed":
      return {
        type: result.type,
        serviceId: result.serviceId,
        confirmationId: result.confirmationId,
        source: result.source ?? null
      };
    case "request":
      return {
        type: result.type,
        serviceId: result.serviceId,
        requestId: result.requestId,
        source: result.source ?? null,
        reason: result.reason ?? null
      };
    case "handoff":
      return {
        type: result.type,
        serviceId: result.serviceId ?? null,
        reason: result.reason,
        hasBookingUrl: Boolean(result.bookingUrl),
        hasPhone: Boolean(result.phone)
      };
    case "failed":
      return {
        type: result.type,
        serviceId: result.serviceId ?? null,
        reason: result.reason,
        source: result.source ?? null
      };
    case "rejected":
      return {
        type: result.type,
        reason: result.reason
      };
  }
}

function manageResultSummary(result: CancelResult | RescheduleResult): Record<string, string | number | boolean | null> {
  switch (result.type) {
    case "cancelled":
      return {
        type: result.type,
        serviceId: result.serviceId ?? null,
        confirmationId: result.confirmationId,
        source: result.source ?? null
      };
    case "rescheduled":
      return {
        type: result.type,
        serviceId: result.serviceId ?? null,
        confirmationId: result.confirmationId,
        source: result.source ?? null
      };
    case "handoff":
      return {
        type: result.type,
        serviceId: result.serviceId ?? null,
        reason: result.reason,
        hasBookingUrl: Boolean(result.bookingUrl),
        hasPhone: Boolean(result.phone)
      };
    case "failed":
      return {
        type: result.type,
        serviceId: result.serviceId ?? null,
        reason: result.reason,
        source: result.source ?? null
      };
    case "rejected":
      return {
        type: result.type,
        reason: result.reason
      };
  }
}

function nodeStateForBookResult(result: BookResult): ExecutionNodeState {
  switch (result.type) {
    case "confirmed":
    case "request":
      return "complete";
    case "handoff":
      return "handoff";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
  }
}

function nodeStateForManageResult(result: CancelResult | RescheduleResult): ExecutionNodeState {
  switch (result.type) {
    case "cancelled":
    case "rescheduled":
      return "complete";
    case "handoff":
      return "handoff";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
  }
}

function outcomeStatusForBookResult(result: BookResult): ExecutionOutcomeStatus {
  switch (result.type) {
    case "confirmed":
      return "success";
    case "request":
      return "partial";
    case "handoff":
      return "handoff";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
  }
}

function outcomeStatusForManageResult(result: CancelResult | RescheduleResult): ExecutionOutcomeStatus {
  switch (result.type) {
    case "cancelled":
    case "rescheduled":
      return "success";
    case "handoff":
      return "handoff";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
  }
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
