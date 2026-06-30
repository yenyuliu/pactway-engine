import type {
  AvailabilityResult,
  BookResult,
  BusinessDay,
  IncomingRequest
} from "../../core/src/index.js";
import { createAssistExecutionTrace } from "../../core/src/index.js";
import {
  bookService,
  checkAvailability,
  findServices,
  getBusinessInfo,
  type AgentPortRuntime,
  type GetBusinessInfoInput
} from "./handlers.js";

export interface AssistInput {
  goal: string;
  location?: string;
  userConsent?: boolean;
  customer?: {
    name: string;
    email?: string;
    phone?: string;
  };
}

export type AssistOutcome = "answered" | "acted" | "no_verified_info";

export interface AssistCitation {
  businessId: string;
  source: "find_services" | "get_business_info" | "check_availability" | "book_service";
  path?: string;
}

export interface AssistAction {
  tool: "find_services" | "get_business_info" | "check_availability" | "book_service";
  result: unknown;
}

export interface AssistResult {
  outcome: AssistOutcome;
  summary: string;
  citations: AssistCitation[];
  actions: AssistAction[];
}

export interface AssistCandidate {
  businessId: string;
}

export interface Retriever {
  match(goal: string, runtime: AgentPortRuntime, context?: IncomingRequest, location?: string): Promise<AssistCandidate[]>;
}

export interface Planner {
  plan(goal: string, info: VerifiedBusinessInfo): AssistPlan | Promise<AssistPlan>;
}

export type VerifiedBusinessInfo = Awaited<ReturnType<typeof getBusinessInfo>> & {
  found: true;
  verification: { status: "verified" };
};

export type AssistPlan =
  | { type: "answer_hours"; day: BusinessDay }
  | { type: "book_service"; serviceId: string; bindingId?: string; requestedType: "confirmed" | "request" | "handoff" }
  | { type: "answer_info" }
  | { type: "no_verified_info"; reason: string };

export interface ClaudePlannerOptions {
  client: ClaudePlannerClient;
  model?: string;
  maxTokens?: number;
}

export interface ClaudePlannerClient {
  messages: {
    create(request: ClaudePlannerCreateRequest): Promise<ClaudePlannerResponse>;
  };
}

export interface ClaudePlannerCreateRequest {
  model: string;
  max_tokens: number;
  tools: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  tool_choice: { type: "tool"; name: string };
  messages: Array<{
    role: "user";
    content: string;
  }>;
}

export interface ClaudePlannerResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; name: string; input: unknown }
    | Record<string, unknown>
  >;
}

export async function assist(
  runtime: AgentPortRuntime,
  input: AssistInput,
  context?: IncomingRequest,
  deps: { retriever?: Retriever; planner?: Planner } = {}
): Promise<AssistResult> {
  const startedAt = new Date();
  const result = await assistInner(runtime, input, context, deps);
  await emitAssistTrace(runtime, input, result, startedAt);
  return result;
}

async function assistInner(
  runtime: AgentPortRuntime,
  input: AssistInput,
  context?: IncomingRequest,
  deps: { retriever?: Retriever; planner?: Planner } = {}
): Promise<AssistResult> {
  const retriever = deps.retriever ?? new KeywordVerifiedRetriever();
  const planner = deps.planner ?? new RuleBasedPlanner();
  const actions: AssistAction[] = [];
  const citations: AssistCitation[] = [];

  const candidates = await retriever.match(input.goal, runtime, context, input.location);
  if (candidates.length === 0) {
    return noVerifiedInfo("No verified business matched the delegated goal.", actions, citations);
  }

  if (candidates.length > 1) {
    return noVerifiedInfo("Multiple verified businesses matched the delegated goal; provide a location or more specific business identifier.", actions, citations);
  }

  const businessId = candidates[0].businessId;
  citations.push({ businessId, source: "find_services" });
  const info = await getBusinessInfo(runtime, { businessId }, context);
  actions.push({ tool: "get_business_info", result: info });

  if (!isVerifiedBusinessInfo(info)) {
    return noVerifiedInfo("No verified business information is available for that goal.", actions, citations);
  }

  citations.push({ businessId, source: "get_business_info" });

  const plan = await planner.plan(input.goal, info);
  switch (plan.type) {
    case "answer_hours":
      return answerHours(info, plan.day, actions, citations);
    case "book_service":
      return actOnBooking(runtime, input, info, plan, context, actions, citations);
    case "answer_info":
      return {
        outcome: "answered",
        summary: `${info.name} is a verified business${info.address ? ` at ${info.address}` : ""}.`,
        citations,
        actions
      };
    case "no_verified_info":
      return noVerifiedInfo(plan.reason, actions, citations);
  }
}

async function emitAssistTrace(
  runtime: AgentPortRuntime,
  input: AssistInput,
  result: AssistResult,
  startedAt: Date
): Promise<void> {
  if (!runtime.trace) {
    return;
  }

  try {
    await runtime.trace.record(createAssistExecutionTrace(input, result, { startedAt }));
  } catch {
    // Assist traces are observational and must never change grounded outcomes.
  }
}

export class KeywordVerifiedRetriever implements Retriever {
  async match(goal: string, runtime: AgentPortRuntime, context?: IncomingRequest, location?: string): Promise<AssistCandidate[]> {
    const result = await findServices(runtime, { service: "", text: [goal, location].filter(Boolean).join(" ") }, context);
    const normalizedGoal = normalize(goal);
    const normalizedLocation = location ? normalize(location) : null;

    const exactMatches = result.matches
      .filter((match) => {
        const businessId = normalizeTokens(match.businessId);
        const businessName = normalizeTokens(match.name);
        return (
          (businessId.length > 0 && containsTokenPhrase(normalizedGoal, businessId)) ||
          (businessName.length > 0 && containsTokenPhrase(normalizedGoal, businessName))
        );
      })
      .filter((match) => !normalizedLocation || matchMatchesLocation(match, normalizedLocation));

    const candidates: AssistCandidate[] = [];
    for (const match of exactMatches) {
      const info = await getBusinessInfo(runtime, { businessId: match.businessId }, context);
      if (isVerifiedBusinessInfo(info)) {
        candidates.push({ businessId: match.businessId });
      }
    }

    return candidates;
  }
}

export class RuleBasedPlanner implements Planner {
  plan(goal: string, info: VerifiedBusinessInfo): AssistPlan {
    const normalizedGoal = normalize(goal);
    const intentGoal = goalForIntentParsing(goal, info);
    const day = dayMentioned(intentGoal);
    if (day && (normalizedGoal.includes("open") || normalizedGoal.includes("hours"))) {
      return { type: "answer_hours", day };
    }

    if (/\b(book|reserve|schedule)\b/.test(normalizedGoal)) {
      const serviceMatches = info.services.filter((candidate) => {
        const serviceId = normalizeTokens(candidate.id);
        const serviceName = normalizeTokens(candidate.name);
        return (
          (serviceId.length > 0 && containsTokenPhrase(intentGoal, serviceId)) ||
          (serviceName.length > 0 && containsTokenPhrase(intentGoal, serviceName))
        );
      });

      if (serviceMatches.length === 0) {
        return { type: "no_verified_info", reason: "No verified service matched the booking goal." };
      }

      if (serviceMatches.length > 1) {
        return { type: "no_verified_info", reason: "Multiple verified service bindings matched the booking goal." };
      }

      const [service] = serviceMatches;
      return {
        type: "book_service",
        serviceId: service.id,
        bindingId: service.bindingId,
        requestedType: requestedTypeForTier(service.tag.tier)
      };
    }

    return { type: "answer_info" };
  }
}

export class ClaudePlanner implements Planner {
  private readonly client: ClaudePlannerClient;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: ClaudePlannerOptions) {
    this.client = options.client;
    this.model = options.model ?? "claude-opus-4-8";
    this.maxTokens = options.maxTokens ?? 1000;
  }

  async plan(goal: string, info: VerifiedBusinessInfo): Promise<AssistPlan> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      tools: [
        {
          name: "assist_plan",
          description: "Choose the next grounded AgentPort tool action. Do not author facts or summaries.",
          input_schema: assistPlanJsonSchema
        }
      ],
      tool_choice: { type: "tool", name: "assist_plan" },
      messages: [
        {
          role: "user",
          content: [
            "Choose only a plan for AgentPort's deterministic assist loop.",
            "Do not write facts, summaries, or business claims. The server composes those from verified tool results.",
            "For booking, choose only a serviceId. The server will derive bindingId and requestedType from verified service tags.",
            `Goal: ${goal}`,
            `Verified context: ${JSON.stringify(plannerContext(info))}`
          ].join("\n\n")
        }
      ]
    });

    return normalizeClaudePlan(info, extractClaudePlanInput(response));
  }
}

function answerHours(
  info: VerifiedBusinessInfo,
  day: BusinessDay,
  actions: AssistAction[],
  citations: AssistCitation[]
): AssistResult {
  const hours = info.profile?.hours?.find((entry) => entry.day === day);
  if (!hours) {
    return noVerifiedInfo(`Verified hours for ${displayDay(day)} are not available.`, actions, citations);
  }

  if (!hours.closed && (!hours.open || !hours.close)) {
    return noVerifiedInfo(`Verified hours for ${displayDay(day)} are incomplete.`, actions, citations);
  }

  const summary = hours.closed
    ? `${info.name} is closed ${displayDay(day)}.`
    : `${info.name} is open ${displayDay(day)} from ${hours.open} to ${hours.close}.`;

  return {
    outcome: "answered",
    summary,
    citations: [
      ...citations,
      { businessId: info.businessId, source: "get_business_info", path: `profile.hours.${day}` }
    ],
    actions
  };
}

async function actOnBooking(
  runtime: AgentPortRuntime,
  input: AssistInput,
  info: VerifiedBusinessInfo,
  plan: Extract<AssistPlan, { type: "book_service" }>,
  context: IncomingRequest | undefined,
  actions: AssistAction[],
  citations: AssistCitation[]
): Promise<AssistResult> {
  if (!input.customer) {
    return noVerifiedInfo("Customer details are required before AgentPort can book.", actions, citations);
  }

  if (hasBookingTimeConstraint(input.goal, info, plan.serviceId)) {
    return noVerifiedInfo("Specific booking times are not supported by assist yet; use book_service with an explicit slot instead.", actions, citations);
  }

  const availability = await checkAvailability(runtime, {
    businessId: info.businessId,
    serviceId: plan.serviceId,
    bindingId: plan.bindingId
  }, context);
  actions.push({ tool: "check_availability", result: availability });
  citations.push({ businessId: info.businessId, source: "check_availability" });

  const slotStart = firstSlotStart(availability);
  if (plan.requestedType === "confirmed" && !slotStart) {
    return noVerifiedInfo("Verified availability slot is not available for booking.", actions, citations);
  }

  const booking = await bookService(runtime, {
    businessId: info.businessId,
    serviceId: plan.serviceId,
    bindingId: plan.bindingId,
    slotStart,
    customer: input.customer,
    requestedType: plan.requestedType,
    userConsent: input.userConsent
  }, context);
  actions.push({ tool: "book_service", result: booking });

  return {
    outcome: booking.type === "rejected" || booking.type === "failed" ? "no_verified_info" : "acted",
    summary: bookingSummary(info, booking),
    citations: [
      ...citations,
      { businessId: info.businessId, source: "book_service" }
    ],
    actions
  };
}

function bookingSummary(info: VerifiedBusinessInfo, booking: BookResult): string {
  switch (booking.type) {
    case "confirmed":
      return `${info.name} confirmed ${booking.serviceId}${booking.start ? ` at ${booking.start}` : ""} with confirmation ${booking.confirmationId}.`;
    case "request":
      return `${info.name} received a booking request for ${booking.serviceId} with request ${booking.requestId}.`;
    case "handoff":
      return `${info.name} cannot confirm this through AgentPort; use the returned handoff channel.`;
    case "failed":
      return `${info.name} could not complete the booking because ${booking.reason}.`;
    case "rejected":
      return `${info.name} rejected the booking because ${booking.reason}.`;
  }
}

function firstSlotStart(availability: AvailabilityResult): string | undefined {
  return availability.supported ? availability.slots[0]?.start : undefined;
}

function noVerifiedInfo(
  summary: string,
  actions: AssistAction[],
  citations: AssistCitation[]
): AssistResult {
  return {
    outcome: "no_verified_info",
    summary,
    citations,
    actions
  };
}

function isVerifiedBusinessInfo(info: Awaited<ReturnType<typeof getBusinessInfo>>): info is VerifiedBusinessInfo {
  return info.found === true && info.verification?.status === "verified";
}

function dayMentioned(goal: string): BusinessDay | null {
  const entries: Array<[BusinessDay, string]> = [
    ["mon", "monday"],
    ["tue", "tuesday"],
    ["wed", "wednesday"],
    ["thu", "thursday"],
    ["fri", "friday"],
    ["sat", "saturday"],
    ["sun", "sunday"]
  ];

  return entries.find(([, label]) => goal.includes(label))?.[0] ?? null;
}

function hasBookingTimeConstraint(goal: string, info: VerifiedBusinessInfo, serviceId: string): boolean {
  const normalizedGoal = goalForIntentParsing(goal, info, serviceId);
  return (
    dayMentioned(normalizedGoal) !== null ||
    /\b(today|tomorrow|tonight|morning|afternoon|evening|noon|midnight|weekend|weekday)\b/.test(normalizedGoal) ||
    /\b(this|next)\s+(week|weekend|month|weekday)\b/.test(normalizedGoal) ||
    /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\s+\d{1,2}(st|nd|rd|th)?\b/.test(normalizedGoal) ||
    /\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/.test(normalizedGoal) ||
    /\b\d{4}\s+\d{1,2}\s+\d{1,2}\b/.test(normalizedGoal) ||
    /\b\d{1,2}\s+\d{1,2}(\s+\d{2,4})?\b/.test(normalizedGoal) ||
    /\b\d{1,2}\s+\d{2}\s*(am|pm)?\b/.test(normalizedGoal) ||
    /\b\d{1,2}\s*(am|pm)\b/.test(normalizedGoal) ||
    /\b(at|around|by|before|after)\s+\d{1,2}(\s+\d{2})?\s*(am|pm)?\b/.test(normalizedGoal)
  );
}

function goalForIntentParsing(goal: string, info: VerifiedBusinessInfo, serviceId?: string): string {
  const service = serviceId ? info.services.find((candidate) => candidate.id === serviceId) : null;
  const phrases = [
    info.businessId,
    info.name,
    ...(service ? [service.id, service.name] : [])
  ];

  return phrases.reduce((current, phrase) => removeTokenPhrase(current, phrase), normalize(goal));
}

function removeTokenPhrase(normalizedGoal: string, value: string): string {
  const phrase = normalizeTokens(value);
  if (!phrase) {
    return normalizedGoal;
  }

  return normalizedGoal
    .replace(new RegExp(` ${escapeRegExp(phrase)} `, "g"), " ")
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function displayDay(day: BusinessDay): string {
  const labels: Record<BusinessDay, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday"
  };

  return labels[day];
}

function normalize(value: string): string {
  return ` ${normalizeTokens(value)} `;
}

function normalizeTokens(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTokenPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(` ${phrase} `);
}

function matchMatchesLocation(
  match: { businessId: string; name: string; address?: string },
  normalizedLocation: string
): boolean {
  const fields = [match.businessId, match.name, match.address ?? ""].map((value) => normalize(value));
  return fields.some((field) => field.includes(normalizedLocation));
}

function plannerContext(info: VerifiedBusinessInfo) {
  return {
    businessId: info.businessId,
    name: info.name,
    address: info.address,
    hours: info.profile?.hours ?? [],
    services: info.services.map((service) => ({
      id: service.id,
      name: service.name,
      bindingId: service.bindingId,
      tier: service.tag.tier
    }))
  };
}

function extractClaudePlanInput(response: ClaudePlannerResponse): unknown {
  const toolUse = response.content.find(
    (part): part is { type: "tool_use"; name: string; input: unknown } =>
      part.type === "tool_use" && part.name === "assist_plan"
  );

  if (!toolUse) {
    throw new Error("Claude response did not include an assist_plan tool result");
  }

  return toolUse.input;
}

function normalizeClaudePlan(info: VerifiedBusinessInfo, input: unknown): AssistPlan {
  const raw = assertRecord(input, "assist plan");
  if (raw.type === "answer_hours") {
    return isBusinessDay(raw.day)
      ? { type: "answer_hours", day: raw.day }
      : { type: "no_verified_info", reason: "Planner did not choose a valid day." };
  }

  if (raw.type === "book_service") {
    const serviceId = typeof raw.serviceId === "string" ? raw.serviceId : "";
    const serviceMatches = info.services.filter((candidate) => candidate.id === serviceId);
    if (serviceMatches.length === 0) {
      return { type: "no_verified_info", reason: "Planner did not choose a verified service." };
    }

    if (serviceMatches.length > 1) {
      return { type: "no_verified_info", reason: "Planner chose an ambiguous service binding." };
    }

    const [service] = serviceMatches;
    return {
      type: "book_service",
      serviceId: service.id,
      bindingId: service.bindingId,
      requestedType: requestedTypeForTier(service.tag.tier)
    };
  }

  if (raw.type === "answer_info") {
    return { type: "answer_info" };
  }

  return {
    type: "no_verified_info",
    reason: "Planner could not choose a grounded action."
  };
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }

  return value as Record<string, unknown>;
}

function isBusinessDay(value: unknown): value is BusinessDay {
  return value === "mon" || value === "tue" || value === "wed" || value === "thu" || value === "fri" || value === "sat" || value === "sun";
}

function requestedTypeForTier(tier: "confirm" | "request" | "inform"): "confirmed" | "request" | "handoff" {
  if (tier === "confirm") {
    return "confirmed";
  }

  if (tier === "request") {
    return "request";
  }

  return "handoff";
}

const assistPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["answer_hours", "book_service", "answer_info", "no_verified_info"]
    },
    day: {
      type: "string",
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    },
    serviceId: { type: "string" },
    reason: { type: "string" }
  }
};
