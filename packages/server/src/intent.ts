import {
  buildAgentPortApprovalCard,
  createActionIntentHash,
  type ActionIntent,
  type ActionIntentLifecycleRecord,
  type ActionIntentResultDeliveryTarget,
  type AgentPortApprovalCard,
  type IncomingRequest
} from "../../core/src/index.js";
import { createAgentPortActionModel } from "./action-model.js";
import {
  getBusinessInfo,
  type AgentPortRuntime
} from "./handlers.js";
import {
  KeywordVerifiedRetriever,
  RuleBasedPlanner,
  type AssistCitation,
  type AssistPlan,
  type Planner,
  type Retriever,
  type VerifiedBusinessInfo
} from "./assist.js";

export interface CompileActionIntentInput {
  goal: string;
  location?: string;
  lifespanMs?: number;
  intentId?: string;
  agentSessionId?: string;
  slotStart?: string;
  agentName?: string;
  resultDelivery?: ActionIntentResultDeliveryTarget;
  now?: () => Date;
}

export interface CompiledActionApproval {
  status: "ready" | "needs_required_input";
  approvalCard?: AgentPortApprovalCard;
  missingFields?: string[];
  requiredInputs?: Array<{
    name: string;
    reason: string;
  }>;
  display: {
    businessName: string;
    serviceName: string;
    action: "book_service";
    requestedType: "confirmed" | "request" | "handoff";
    customerFields: string[];
    expiresAt: string;
  };
  rule: string;
}

export interface CompiledActionNext {
  resolve: Array<{
    purpose: "resolve_required_action_input";
    input: "slotStart";
    tool: "check_availability";
    resultPath: "slots[].start";
    arguments: {
      businessId: string;
      serviceId: string;
      bindingId?: string;
    };
  }>;
  execute: {
    tool: "book_service";
    arguments: {
      businessId: string;
      serviceId: string;
      bindingId?: string;
      requestedType: "confirmed" | "request" | "handoff";
      slotStart?: string;
    };
    requiredArgs: ["customer", "userConsent"];
  };
}

export interface CompiledActionApprovalPackage {
  type: "agentport.intent_approval_package";
  version: "0.1";
  status: "ready" | "needs_required_input";
  intentId: string;
  agentSessionId: string;
  expiresAt: string;
  actionIntent: ActionIntent;
  approvalCard?: AgentPortApprovalCard;
  approvedActionIntentHash?: string;
  requiredInputs: Array<{
    name: string;
    reason: string;
  }>;
  display: CompiledActionApproval["display"];
  resolve: CompiledActionNext["resolve"];
  execute?: {
    tool: "book_service";
    arguments: CompiledActionNext["execute"]["arguments"] & {
      intentId: string;
      approvedActionIntentHash: string;
    };
    requiredArgs: ["customer", "userConsent"];
  };
  lifecycle: {
    read: {
      tool: "get_action_intent_lifecycle";
      arguments: {
        intentId: string;
      };
    };
    poll: {
      tool: "poll_action_intent_lifecycles";
      arguments: {
        agentSessionId: string;
        after: number;
      };
    };
  };
  resultDelivery?: ActionIntentResultDeliveryTarget;
  rules: string[];
}

export type CompileActionIntentResult =
  | {
      outcome: "compiled";
      goal: string;
      actionIntent: ActionIntent;
      expiresAt: string;
      approval: CompiledActionApproval;
      approvalPackage: CompiledActionApprovalPackage;
      next: CompiledActionNext;
      lifecycle: ActionIntentLifecycleRecord;
      citations: AssistCitation[];
      plan: Extract<AssistPlan, { type: "book_service" }>;
    }
  | {
      outcome: "no_verified_info";
      goal: string;
      reason: string;
      citations: AssistCitation[];
    };

export async function compileActionIntent(
  runtime: AgentPortRuntime,
  input: CompileActionIntentInput,
  context?: IncomingRequest,
  deps: { retriever?: Retriever; planner?: Planner } = {}
): Promise<CompileActionIntentResult> {
  const retriever = deps.retriever ?? new KeywordVerifiedRetriever();
  const planner = deps.planner ?? new RuleBasedPlanner();
  const citations: AssistCitation[] = [];
  const candidates = await retriever.match(input.goal, runtime, context, input.location);

  if (candidates.length === 0) {
    return noIntent(input, "No verified business matched the intent.", citations);
  }

  if (candidates.length > 1) {
    return noIntent(input, "Multiple verified businesses matched the intent; provide a location or more specific business identifier.", citations);
  }

  const businessId = candidates[0].businessId;
  citations.push({ businessId, source: "find_services" });

  const info = await getBusinessInfo(runtime, { businessId }, context);
  if (!isVerifiedBusinessInfo(info)) {
    return noIntent(input, "No verified business information is available for that intent.", citations);
  }

  citations.push({ businessId, source: "get_business_info" });

  const plan = await planner.plan(input.goal, info);
  if (plan.type !== "book_service") {
    return noIntent(input, "The goal did not compile to a state-changing AgentPort action.", citations);
  }

  const now = input.now?.() ?? new Date();
  const expiresAt = intentExpiry(input, now);
  const customerFields = ["name", "email", "phone"];
  const service = info.services.find((candidate) => {
    return candidate.id === plan.serviceId && (plan.bindingId === undefined || candidate.bindingId === plan.bindingId);
  });
  const actionIntent: ActionIntent = {
    action: "book_service",
    businessId: info.businessId,
    serviceId: plan.serviceId,
    ...(plan.bindingId ? { bindingId: plan.bindingId } : {}),
    requestedType: plan.requestedType,
    ...(input.slotStart ? { slotStart: input.slotStart } : {}),
    customerFields,
    consentText: [input.goal],
    expiresAt
  };
  const approval = createApproval(input, info, service?.name ?? plan.serviceId, plan, actionIntent, customerFields, expiresAt);
  const next = createNext(info.businessId, plan, input.slotStart);
  const lifecycle = createLifecycleRecord(input, actionIntent, approval, now, expiresAt);
  const approvalPackage = createApprovalPackage(actionIntent, approval, next, lifecycle);
  await runtime.intentLifecycles?.save(lifecycle);

  return {
    outcome: "compiled",
    goal: input.goal,
    expiresAt,
    approval,
    approvalPackage,
    next,
    lifecycle,
    citations,
    plan,
    actionIntent
  };
}

function noIntent(
  input: CompileActionIntentInput,
  reason: string,
  citations: AssistCitation[]
): CompileActionIntentResult {
  return {
    outcome: "no_verified_info",
    goal: input.goal,
    reason,
    citations
  };
}

function intentExpiry(input: CompileActionIntentInput, now: Date): string {
  const lifespanMs = input.lifespanMs ?? 5 * 60 * 1000;
  if (!Number.isFinite(lifespanMs) || lifespanMs <= 0) {
    throw new Error("intent lifespan must be a positive number of milliseconds");
  }

  return new Date(now.getTime() + lifespanMs).toISOString();
}

function isVerifiedBusinessInfo(info: Awaited<ReturnType<typeof getBusinessInfo>>): info is VerifiedBusinessInfo {
  return info.found === true && info.verification?.status === "verified";
}

function createApproval(
  input: CompileActionIntentInput,
  info: VerifiedBusinessInfo,
  serviceName: string,
  plan: Extract<AssistPlan, { type: "book_service" }>,
  actionIntent: ActionIntent,
  customerFields: string[],
  expiresAt: string
): CompiledActionApproval {
  const display = {
    businessName: info.name,
    serviceName,
    action: "book_service" as const,
    requestedType: plan.requestedType,
    customerFields,
    expiresAt
  };

  if (plan.requestedType === "confirmed" && !input.slotStart) {
    return {
      status: "needs_required_input",
      missingFields: ["slotStart"],
      requiredInputs: [{
        name: "slotStart",
        reason: "A confirmed booking needs an exact backend-offered slot before the host can render a final approval card."
      }],
      display,
      rule: "Do not ask for final approval or set userConsent true until every required input is resolved and compile_action_intent returns an approvalCard."
    };
  }

  return {
    status: "ready",
    approvalCard: buildAgentPortApprovalCard(createAgentPortActionModel(), {
      agentName: input.agentName ?? "Client agent",
      actionIntent,
      businessName: info.name,
      serviceName,
      requestedTimeOrSlot: input.slotStart ?? "not_applicable",
      customerFieldsToShare: customerFields,
      resultTypeRequested: plan.requestedType,
      delegationExpiryWhenAvailable: expiresAt
    }),
    display,
    rule: "Render this approvalCard and do not set userConsent true until the user approves this exact card."
  };
}

function createNext(
  businessId: string,
  plan: Extract<AssistPlan, { type: "book_service" }>,
  slotStart?: string
): CompiledActionNext {
  const serviceArgs = {
    businessId,
    serviceId: plan.serviceId,
    ...(plan.bindingId ? { bindingId: plan.bindingId } : {})
  };

  return {
    resolve: slotStart
      ? []
      : [{
          purpose: "resolve_required_action_input",
          input: "slotStart",
          tool: "check_availability",
          resultPath: "slots[].start",
          arguments: serviceArgs
        }],
    execute: {
      tool: "book_service",
      arguments: {
        ...serviceArgs,
        requestedType: plan.requestedType,
        ...(slotStart ? { slotStart } : {})
      },
      requiredArgs: ["customer", "userConsent"]
    }
  };
}

function createApprovalPackage(
  actionIntent: ActionIntent,
  approval: CompiledActionApproval,
  next: CompiledActionNext,
  lifecycle: ActionIntentLifecycleRecord
): CompiledActionApprovalPackage {
  const actionIntentHash = approval.approvalCard?.actionIntentHash;
  const base = {
    type: "agentport.intent_approval_package" as const,
    version: "0.1" as const,
    status: approval.status,
    intentId: lifecycle.intentId,
    agentSessionId: lifecycle.agentSessionId,
    expiresAt: lifecycle.expiresAt,
    actionIntent,
    ...(approval.approvalCard ? { approvalCard: approval.approvalCard } : {}),
    ...(actionIntentHash ? { approvedActionIntentHash: actionIntentHash } : {}),
    requiredInputs: approval.requiredInputs ?? [],
    display: approval.display,
    resolve: next.resolve,
    lifecycle: {
      read: {
        tool: "get_action_intent_lifecycle" as const,
        arguments: {
          intentId: lifecycle.intentId
        }
      },
      poll: {
        tool: "poll_action_intent_lifecycles" as const,
        arguments: {
          agentSessionId: lifecycle.agentSessionId,
          after: 0
        }
      }
    },
    ...(lifecycle.resultDelivery ? { resultDelivery: lifecycle.resultDelivery } : {}),
    rules: approval.status === "ready"
      ? [
          "Render approvalCard and collect user approval for this exact card before executing.",
          "After approval, call execute.tool with execute.arguments plus customer and userConsent true.",
          "Do not edit businessId, serviceId, bindingId, requestedType, slotStart, intentId, or approvedActionIntentHash.",
          "Poll lifecycle.poll after execution and report the gateway result exactly."
        ]
      : [
          "Do not render final approval or set userConsent true yet.",
          "Resolve every required input using resolve, then call compile_action_intent again with the same intentId and agentSessionId.",
          "Poll lifecycle.poll to resume or observe this intent within the same agent session."
        ]
  };

  if (!actionIntentHash) {
    return base;
  }

  return {
    ...base,
    execute: {
      tool: next.execute.tool,
      arguments: {
        ...next.execute.arguments,
        intentId: lifecycle.intentId,
        approvedActionIntentHash: actionIntentHash
      },
      requiredArgs: next.execute.requiredArgs
    }
  };
}

function createLifecycleRecord(
  input: CompileActionIntentInput,
  actionIntent: ActionIntent,
  approval: CompiledActionApproval,
  now: Date,
  expiresAt: string
): ActionIntentLifecycleRecord {
  const nowIso = now.toISOString();
  const intentId = input.intentId ?? createIntentId(input.goal, actionIntent, expiresAt);
  const agentSessionId = input.agentSessionId ?? intentId;
  const resolvedInputs = {
    ...(actionIntent.slotStart ? { slotStart: actionIntent.slotStart } : {}),
    ...(actionIntent.confirmationId ? { confirmationId: actionIntent.confirmationId } : {}),
    ...(actionIntent.newSlotStart ? { newSlotStart: actionIntent.newSlotStart } : {})
  };

  return {
    intentId,
    agentSessionId,
    goal: input.goal,
    status: approval.status === "ready" ? "approval_ready" : "needs_required_input",
    actionIntent,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt,
    requiredInputs: approval.requiredInputs ?? [],
    resolvedInputs,
    approval: {
      status: approval.status === "ready" ? "ready" : "not_ready",
      cardHash: approval.approvalCard?.cardHash,
      actionIntentHash: approval.approvalCard?.actionIntentHash
    },
    ...(input.resultDelivery ? { resultDelivery: input.resultDelivery } : {}),
    attempts: [],
    nextStep: approval.status === "ready" ? "request_user_approval" : "resolve_required_input"
  };
}

function createIntentId(goal: string, actionIntent: ActionIntent, expiresAt: string): string {
  const stableIntent = {
    goal,
    action: actionIntent.action,
    businessId: actionIntent.businessId,
    serviceId: actionIntent.serviceId,
    requestedType: actionIntent.requestedType,
    expiresAt,
    actionIntentHash: createActionIntentHash(actionIntent)
  };
  return `intent_${createActionIntentHash({
    action: "book_service",
    businessId: actionIntent.businessId,
    serviceId: actionIntent.serviceId,
    requestedType: actionIntent.requestedType,
    consentText: [JSON.stringify(stableIntent)],
    expiresAt
  }).slice(0, 24)}`;
}
