import type {
  EvidenceRef,
  ExecutionGraphRecord,
  ExecutionOutcomeStatus,
  TaskNode
} from "./execution-trace.js";

export type ExecutionTraceViewFormat = "json" | "text" | "mermaid";

export interface ExecutionTraceView {
  type: "agentport.execution_trace_view.v0.1";
  version: "0.1";
  summary: {
    goal: string;
    recordCount: number;
    terminalStatus: ExecutionOutcomeStatus;
    terminalNode: string;
    failureReason?: string;
    totalDurationMs: number;
  };
  timeline: ExecutionTraceTimelineEntry[];
  evidence: ExecutionTraceEvidenceView[];
  highlights: ExecutionTraceHighlight[];
  mermaid: string;
}

export interface ExecutionTraceTimelineEntry {
  index: number;
  recordId: string;
  nodeId: string;
  label: string;
  kind: string;
  state: string;
  tool?: string;
  status: ExecutionOutcomeStatus;
  failureReason?: string;
  startedAt?: string;
  completedAt: string;
  durationMs: number;
  result: Record<string, string | number | boolean | null>;
}

export interface ExecutionTraceEvidenceView {
  index: number;
  recordId: string;
  kind: EvidenceRef["kind"];
  receiptId?: string;
  hash?: string;
  source?: string;
}

export interface ExecutionTraceHighlight {
  index: number;
  recordId: string;
  severity: "info" | "warning" | "error";
  reason: string;
}

export function normalizeExecutionTraceRecords(input: unknown): ExecutionGraphRecord[] {
  const candidate = recordsCandidate(input);
  if (!Array.isArray(candidate)) {
    throw new Error("Trace input must be a trace record, an array of records, or { records: [...] }.");
  }

  if (candidate.length === 0) {
    throw new Error("Trace input must contain at least one record.");
  }

  return candidate.map((record, index) => assertExecutionGraphRecord(record, index));
}

export function createExecutionTraceView(input: ExecutionGraphRecord[] | ExecutionGraphRecord): ExecutionTraceView {
  const records = Array.isArray(input) ? input : [input];
  if (records.length === 0) {
    throw new Error("At least one execution trace record is required.");
  }

  const timeline = records.map((record, index) => timelineEntry(record, index));
  const terminal = timeline[timeline.length - 1];
  const evidence = records.flatMap((record, recordIndex) =>
    record.evidence.map((item) => ({
      index: recordIndex + 1,
      recordId: record.recordId,
      kind: item.kind,
      receiptId: item.receiptId,
      hash: item.hash,
      source: item.source
    }))
  );
  const highlights = timeline.flatMap(highlightForEntry);

  return {
    type: "agentport.execution_trace_view.v0.1",
    version: "0.1",
    summary: {
      goal: records[0].goal.summary,
      recordCount: records.length,
      terminalStatus: terminal.status,
      terminalNode: terminal.nodeId,
      failureReason: terminal.failureReason,
      totalDurationMs: timeline.reduce((sum, entry) => sum + entry.durationMs, 0)
    },
    timeline,
    evidence,
    highlights,
    mermaid: renderExecutionTraceMermaid(records)
  };
}

export function renderExecutionTraceText(input: ExecutionGraphRecord[] | ExecutionGraphRecord): string {
  const view = createExecutionTraceView(input);
  const lines = [
    `Goal: ${view.summary.goal}`,
    `Records: ${view.summary.recordCount}`,
    `Terminal: ${view.summary.terminalStatus} at ${view.summary.terminalNode}${view.summary.failureReason ? ` (${view.summary.failureReason})` : ""}`,
    `Duration: ${view.summary.totalDurationMs}ms`,
    "",
    "Timeline:"
  ];

  for (const entry of view.timeline) {
    lines.push(
      `${entry.index}. ${entry.label} [${entry.status}] ${entry.tool ? `tool=${entry.tool} ` : ""}duration=${entry.durationMs}ms${entry.failureReason ? ` reason=${entry.failureReason}` : ""}`
    );
  }

  if (view.highlights.length > 0) {
    lines.push("", "Highlights:");
    for (const highlight of view.highlights) {
      lines.push(`- ${highlight.severity}: record ${highlight.index} ${highlight.reason}`);
    }
  }

  if (view.evidence.length > 0) {
    lines.push("", "Evidence:");
    for (const evidence of view.evidence) {
      lines.push(`- record ${evidence.index}: ${evidence.kind}${evidence.receiptId ? ` receipt=${evidence.receiptId}` : ""}${evidence.hash ? ` hash=${evidence.hash}` : ""}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderExecutionTraceMermaid(input: ExecutionGraphRecord[] | ExecutionGraphRecord): string {
  const records = Array.isArray(input) ? input : [input];
  const lines = ["flowchart TD"];

  records.forEach((record, recordIndex) => {
    const recordNode = `R${recordIndex + 1}`;
    const terminalNode = record.outcome.terminalNode;
    const node = record.graph.nodes.find((candidate) => candidate.id === terminalNode) ?? record.graph.nodes[0];
    const label = `${recordIndex + 1}. ${node?.label ?? terminalNode}\\n${record.outcome.status}${record.outcome.failureReason ? `: ${record.outcome.failureReason}` : ""}`;
    lines.push(`  ${recordNode}["${escapeMermaidLabel(label)}"]`);
    if (recordIndex > 0) {
      lines.push(`  R${recordIndex} --> ${recordNode}`);
    }

    for (const edge of record.graph.edges) {
      lines.push(`  ${nodeId(recordIndex, edge.from)} --> ${nodeId(recordIndex, edge.to)}`);
    }

    for (const graphNode of record.graph.nodes) {
      lines.push(`  ${nodeId(recordIndex, graphNode.id)}["${escapeMermaidLabel(nodeLabel(graphNode))}"]`);
      if (graphNode.id === terminalNode) {
        lines.push(`  ${nodeId(recordIndex, graphNode.id)} --> ${recordNode}`);
      }
    }
  });

  return `${lines.join("\n")}\n`;
}

function recordsCandidate(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input;
  }

  if (isRecord(input) && Array.isArray(input.records)) {
    return input.records;
  }

  if (isRecord(input) && input.type === "agentport.execution_graph_record.v0.1") {
    return [input];
  }

  return input;
}

function assertExecutionGraphRecord(value: unknown, index: number): ExecutionGraphRecord {
  if (!isRecord(value)) {
    throw new Error(`Trace record ${index + 1} must be an object.`);
  }

  if (value.type !== "agentport.execution_graph_record.v0.1") {
    throw new Error(`Trace record ${index + 1} has unsupported type.`);
  }

  if (typeof value.recordId !== "string" || value.recordId.length === 0) {
    throw new Error(`Trace record ${index + 1} must include recordId.`);
  }

  if (!isRecord(value.goal) || typeof value.goal.summary !== "string") {
    throw new Error(`Trace record ${index + 1} must include goal.summary.`);
  }

  if (!isRecord(value.graph) || !Array.isArray(value.graph.nodes)) {
    throw new Error(`Trace record ${index + 1} must include graph.nodes.`);
  }

  if (!isRecord(value.outcome) || typeof value.outcome.status !== "string" || typeof value.outcome.terminalNode !== "string") {
    throw new Error(`Trace record ${index + 1} must include outcome.status and outcome.terminalNode.`);
  }

  if (!Array.isArray(value.attempts) || !Array.isArray(value.evidence)) {
    throw new Error(`Trace record ${index + 1} must include attempts and evidence arrays.`);
  }

  return value as unknown as ExecutionGraphRecord;
}

function timelineEntry(record: ExecutionGraphRecord, index: number): ExecutionTraceTimelineEntry {
  const terminalNode = record.outcome.terminalNode;
  const node = record.graph.nodes.find((candidate) => candidate.id === terminalNode) ?? record.graph.nodes[0];
  const attempt = record.attempts.find((candidate) => candidate.nodeId === terminalNode) ?? record.attempts[0];
  const completedAt = attempt?.completedAt ?? record.createdAt;

  return {
    index: index + 1,
    recordId: record.recordId,
    nodeId: terminalNode,
    label: node?.label ?? terminalNode,
    kind: node?.kind ?? "unknown",
    state: node?.state ?? "unknown",
    tool: attempt?.tool,
    status: record.outcome.status,
    failureReason: record.outcome.failureReason,
    startedAt: attempt?.startedAt,
    completedAt,
    durationMs: record.outcome.durationMs ?? 0,
    result: attempt?.result ?? {}
  };
}

function highlightForEntry(entry: ExecutionTraceTimelineEntry): ExecutionTraceHighlight[] {
  if (entry.status === "failed" || entry.status === "rejected" || entry.status === "not_found") {
    return [{
      index: entry.index,
      recordId: entry.recordId,
      severity: "error",
      reason: entry.failureReason ?? entry.status
    }];
  }

  if (entry.status === "handoff" || entry.status === "partial") {
    return [{
      index: entry.index,
      recordId: entry.recordId,
      severity: "warning",
      reason: entry.failureReason ?? entry.status
    }];
  }

  return [];
}

function nodeLabel(node: TaskNode): string {
  const scope = [node.businessId, node.serviceId].filter(Boolean).join(" / ");
  return `${node.label}\\n${node.state}${scope ? `\\n${scope}` : ""}`;
}

function nodeId(recordIndex: number, raw: string): string {
  return `R${recordIndex + 1}_${raw.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, "'");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
