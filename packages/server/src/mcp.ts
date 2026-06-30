import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { JsonWebKey } from "node:crypto";
import { actionIntentResultDeliverySummary, actionIntentResultDeliveryTrustProfileResourceUri, createActionIntentHash, type ActionIntent, type ActionIntentLifecycleRecord, type ActionIntentResultDeliveryStatus, type ActionReceipt, type AgentPortCommitment, type AvailabilityRequest, type BookingAdapter, type BookRequest, type CancelRequest, type IncomingRequest, type RescheduleRequest } from "../../core/src/index.js";
import { actionModelResourceUri, createAgentPortActionModel } from "./action-model.js";
import { assist, type AssistInput } from "./assist.js";
import {
  chatGptAppComponentMimeType,
  chatGptAppComponentResourceForUri,
  chatGptAppComponentResources,
  chatGptAppComponentUris,
  createChatGptAppComponentHtml
} from "./chatgpt-app-components.js";
import { clientUsePolicyResourceUri, createAgentPortClientUsePolicy } from "./client-use-policy.js";
import { commitmentFormatResourceUri, createAgentPortCommitmentFormat } from "./commitment-format.js";
import { createAgentPortDiscoveryDescriptor, discoveryResourceUri, discoveryWellKnownPath } from "./discovery.js";
import { bookService, cancelService, checkAvailability, findServices, getBusinessFeed, getBusinessInfo, getReadinessReport, rescheduleService, type AgentPortRuntime, type GetReadinessReportInput } from "./handlers.js";
import { compileActionIntent, type CompileActionIntentInput } from "./intent.js";
import { businessPrincipalActor, principalAllowsBusiness, principalAllowsWallet, StaticBusinessTokenIdentityProvider, type BusinessIdentityProvider, type HostWalletPrincipal } from "./identity.js";
import { createAgentPortOpenStandard, openStandardResourceUri } from "./open-standard.js";
import { createAgentPortPluginWalletContract, pluginWalletContractResourceUri } from "./plugin-wallet-contract.js";
import { createAgentPortProtocolCodes, protocolCodesResourceUri } from "./protocol-codes.js";
import { buildTicketProofProtocolTraceV02 } from "./protocol-v02-trace.js";
import { getAllowedTicketActions, getTicketStatus, listTicketDeliveries, locateWalletTickets, resolveTicket, sendTicket, verifyTicket, type TicketDeliveryRecord, type TicketDestination, type SendTicketInput } from "./ticket-tools.js";
import type { SignedPublicVerificationBundle } from "../../verification/src/index.js";

export const publicVerificationBundlePath = "/.well-known/agentport/verification-bundle.json";
export const publicVerificationJwksPath = "/.well-known/agentport/jwks.json";

export interface PublicVerificationRuntimeConfig {
  bundle: SignedPublicVerificationBundle;
  jwks: {
    keys: JsonWebKey[];
  };
  bundlePath?: string;
  jwksPath?: string;
}

export interface AgentPortServerConfig extends Omit<AgentPortRuntime, "adapters"> {
  adapters: BookingAdapter[];
  name?: string;
  version?: string;
  publicVerification?: PublicVerificationRuntimeConfig;
}

export interface ListenOptions {
  transport?: "streamable-http";
  port?: number;
  host?: string;
  path?: string;
}

export interface AgentPortRequestHandlerOptions {
  name?: string;
  version?: string;
  path?: string;
  publicVerification?: PublicVerificationRuntimeConfig;
}

export type AgentPortRequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export interface AgentPortServer {
  listen(options?: ListenOptions): Promise<Server>;
  runtime: AgentPortRuntime;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const protocolVersion = "2025-06-18";
const runtimeResourceUri = "agentport://runtime";
const gatewayTrustProfileResourceUri = "agentport://gateway-trust-profile";

export function createAgentPortServer(config: AgentPortServerConfig): AgentPortServer {
  const runtime: AgentPortRuntime = {
    ...config,
    adapters: new Map(config.adapters.map((adapter) => [adapter.platform, adapter]))
  };

  return {
    runtime,
    async listen(options: ListenOptions = {}) {
      if (options.transport && options.transport !== "streamable-http") {
        throw new Error(`Unsupported transport: ${options.transport}`);
      }

      const port = options.port ?? 8723;
      const host = options.host ?? "127.0.0.1";
      const path = options.path ?? "/mcp";
      const serverInfo = {
        name: config.name ?? "agentport-engine",
        version: config.version ?? "0.0.0",
        mcpPath: path
      };
      const handleRequest = createAgentPortRequestHandler(runtime, {
        name: serverInfo.name,
        version: serverInfo.version,
        path,
        publicVerification: config.publicVerification
      });

      const httpServer = createServer(handleRequest);

      return new Promise<Server>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          httpServer.off("error", reject);
          const address = httpServer.address();
          const actualPort = typeof address === "object" && address ? address.port : port;
          const displayHost = host === "0.0.0.0" ? "localhost" : host;
          console.log(`AgentPort MCP server listening at http://${displayHost}:${actualPort}${path}`);
          resolve(httpServer);
        });
      });
    }
  };
}

export function createAgentPortRequestHandler(
  runtime: AgentPortRuntime,
  options: AgentPortRequestHandlerOptions = {}
): AgentPortRequestHandler {
  const path = options.path ?? "/mcp";
  const serverInfo = {
    name: options.name ?? "agentport-engine",
    version: options.version ?? "0.0.0",
    mcpPath: path
  };
  const publicVerification = normalizePublicVerificationRuntimeConfig(options.publicVerification);

  return async (req, res) => {
    try {
      const pathname = requestPathname(req);

      if (pathname === "/healthz" && req.method === "GET") {
        sendJson(res, 200, { ok: true, name: serverInfo.name });
        return;
      }

      if (pathname === discoveryWellKnownPath && req.method === "GET") {
        const origin = requestOrigin(req);
        sendJson(
          res,
          200,
          createAgentPortDiscoveryDescriptor({
            gatewayBaseUrl: origin,
            mcpPath: path,
            ...(publicVerification ? {
              publicVerification: {
                bundleUrl: `${origin}${publicVerification.bundlePath}`,
                jwksUrl: `${origin}${publicVerification.jwksPath}`
              }
            } : {})
          })
        );
        return;
      }

      if (publicVerification && pathname === publicVerification.bundlePath && req.method === "GET") {
        sendJson(res, 200, publicVerification.bundle);
        return;
      }

      if (publicVerification && pathname === publicVerification.jwksPath && req.method === "GET") {
        sendJson(res, 200, publicVerification.jwks);
        return;
      }

      if (pathname.startsWith("/actions/")) {
        await handleTicketActionFacade(runtime, req, res, pathname);
        return;
      }

      if (pathname === "/business/front-desk-deliveries" && req.method === "GET") {
        await handleBusinessFrontDeskDeliveries(runtime, req, res);
        return;
      }

      if (pathname === "/demo/front-desk-deliveries" && req.method === "GET") {
        const limit = Number(new URL(req.url ?? "/", "http://localhost").searchParams.get("limit") ?? "25");
        sendJson(res, 200, await listTicketDeliveries(runtime, { limit }));
        return;
      }

      if (pathname !== path) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }

      if (req.method === "GET") {
        sendJson(res, 405, rpcError(null, -32000, "Method not allowed."));
        return;
      }

      if (req.method !== "POST") {
        sendJson(res, 405, rpcError(null, -32000, "Method not allowed."));
        return;
      }

      const parsed = await readJson(req);
      const reqContext: IncomingRequest = {
        headers: req.headers,
        method: "MCP",
        url: req.url
      };
      const batch = Array.isArray(parsed) ? parsed : [parsed];
      const responses = (
        await Promise.all(
          batch.map((message) => {
            logMcpDiagnostic(message as JsonRpcRequest, reqContext);
            return handleRpc(runtime, serverInfo, message as JsonRpcRequest, reqContext);
          })
        )
      ).filter((response): response is JsonRpcResponse => response !== null);

      if (responses.length === 0) {
        res.writeHead(202).end();
        return;
      }

      sendJson(res, 200, Array.isArray(parsed) ? responses : responses[0]);
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, rpcError(null, -32700, "Parse error", error.message));
        return;
      }

      sendJson(
        res,
        500,
        rpcError(null, -32603, "Internal server error", error instanceof Error ? error.message : String(error))
      );
    }
  };
}

function logMcpDiagnostic(request: JsonRpcRequest, context: IncomingRequest) {
  if (!process.env.VERCEL && process.env.AGENTPORT_MCP_DIAGNOSTICS !== "1") {
    return;
  }

  const params = isRecord(request.params) ? request.params : {};
  const toolName = request.method === "tools/call" && typeof params.name === "string" ? params.name : undefined;
  console.info(
    JSON.stringify({
      type: "agentport_mcp_request",
      method: request.method,
      toolName,
      idType: request.id === undefined ? "notification" : request.id === null ? "null" : typeof request.id,
      host: firstHeaderValue(context.headers.host),
      userAgent: firstHeaderValue(context.headers["user-agent"])?.slice(0, 160),
      openaiUserAgent: firstHeaderValue(context.headers["openai-user-agent"])?.slice(0, 160)
    })
  );
}

function normalizePublicVerificationRuntimeConfig(
  config?: PublicVerificationRuntimeConfig
): (PublicVerificationRuntimeConfig & { bundlePath: string; jwksPath: string }) | undefined {
  if (!config) {
    return undefined;
  }

  return {
    ...config,
    bundlePath: normalizePublicPath(config.bundlePath ?? publicVerificationBundlePath),
    jwksPath: normalizePublicPath(config.jwksPath ?? publicVerificationJwksPath)
  };
}

function normalizePublicPath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

async function handleBusinessFrontDeskDeliveries(
  runtime: AgentPortRuntime,
  req: IncomingMessage,
  res: ServerResponse
) {
  const provider = runtime.businessIdentity ?? legacyBusinessIdentityProvider(runtime);
  if (!provider) {
    sendJson(res, 503, {
      error: "business_inbox_auth_unconfigured",
      reason: "business_inbox_token_required"
    });
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const businessId = url.searchParams.get("businessId") ?? runtime.businessInbox?.defaultBusinessId;
  if (!businessId) {
    sendJson(res, 400, {
      error: "invalid_params",
      message: "businessId is required"
    });
    return;
  }

  const identity = provider.authenticate({
    headers: req.headers,
    businessId,
    scope: "business_inbox:read"
  });
  if (!identity.ok) {
    const status = identity.reason === "business_scope_denied" ? 403 : 401;
    sendJson(res, status, {
      error: status === 403 ? "forbidden" : "unauthorized",
      reason: identity.reason
    });
    return;
  }

  if (!principalAllowsBusiness(identity.principal, businessId)) {
    sendJson(res, 403, {
      error: "forbidden",
      reason: "business_scope_denied"
    });
    return;
  }

  const limit = Number(url.searchParams.get("limit") ?? "25");
  const result = await listTicketDeliveries(runtime, {
    limit,
    businessId,
    destinationKind: "business_inbox"
  });
  await runtime.audit.record({
    type: "business_inbox_read",
    businessId,
    resultType: result.type,
    metadata: {
      count: result.type === "ticket_deliveries" ? result.count : 0,
      actor: businessPrincipalActor(identity.principal, businessId)
    },
    at: new Date().toISOString()
  });
  sendJson(res, 200, result);
}

async function handleTicketActionFacade(
  runtime: AgentPortRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = await readJson(req);
  } catch (error) {
    sendJson(res, 400, {
      error: "invalid_json",
      message: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  if (!isRecord(parsed)) {
    sendJson(res, 400, { error: "invalid_params", message: "action body must be an object" });
    return;
  }

  try {
    switch (pathname) {
      case "/actions/locate-wallet-tickets":
        sendJson(res, 200, await locateWalletTicketsForContext(runtime, parseLocateWalletTicketsInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/locate-agentport-wallet":
        sendJson(res, 200, await locateAgentPortWallet(runtime, parseLocateAgentPortWalletInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/find-services":
        sendJson(res, 200, await findServices(runtime, parseFindServicesInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/get-business-info":
        sendJson(res, 200, await getBusinessInfo(runtime, parseBusinessInfoInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/get-readiness-report":
        sendJson(res, 200, await getReadinessReport(runtime, parseReadinessReportInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/prepare-service-request":
        sendJson(res, 200, await prepareServiceRequestActionFacade(runtime, parsed, actionFacadeContext(req)));
        return;
      case "/actions/submit-service-request":
        sendJson(res, 200, await submitServiceRequestActionFacade(runtime, parsed, actionFacadeContext(req)));
        return;
      case "/actions/prepare-ticket-send":
        sendJson(res, 200, await prepareTicketSendActionFacade(runtime, parsed));
        return;
      case "/actions/get-action-intent-lifecycle":
        sendJson(res, 200, await getActionIntentLifecycle(runtime, parseActionIntentLifecycleInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/list-action-intent-result-deliveries":
        sendJson(res, 200, await listActionIntentResultDeliveries(runtime, parseListActionIntentResultDeliveriesInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/get-action-intent-result-delivery":
        sendJson(res, 200, await getActionIntentResultDelivery(runtime, parseActionIntentResultDeliveryInput(parsed), actionFacadeContext(req)));
        return;
      case "/actions/verify-ticket":
        sendJson(res, 200, verifyTicket(runtime, parseTicketEvidenceInput(parsed)));
        return;
      case "/actions/resolve-ticket":
        sendJson(res, 200, await resolveTicket(runtime, parseResolveTicketInput(parsed)));
        return;
      case "/actions/get-ticket-status":
        sendJson(res, 200, getTicketStatus(runtime, parseTicketEvidenceInput(parsed)));
        return;
      case "/actions/get-allowed-ticket-actions":
        sendJson(res, 200, getAllowedTicketActions(runtime, parseTicketEvidenceInput(parsed)));
        return;
      case "/actions/send-ticket":
        sendJson(res, 200, await sendTicketActionFacade(runtime, parsed));
        return;
      default:
        sendJson(res, 404, { error: "not_found" });
    }
  } catch (error) {
    if (error instanceof RpcInputError) {
      sendJson(res, 400, { error: "invalid_params", message: error.message, data: error.data });
      return;
    }

    sendJson(res, 500, {
      error: "action_facade_error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function actionFacadeContext(req: IncomingMessage): IncomingRequest {
  return {
    headers: req.headers,
    method: "ACTION",
    url: req.url
  };
}

async function sendTicketActionFacade(runtime: AgentPortRuntime, parsed: Record<string, unknown>) {
  const intentId = optionalString(parsed, "intentId");
  if (!intentId) {
    return {
      type: "rejected",
      reason: "intent_required",
      message: "Send tickets through prepareTicketSend first so delivery is bound to an approval package."
    };
  }

  if (!optionalString(parsed, "approvedActionIntentHash")) {
    return {
      type: "rejected",
      reason: "intent_action_hash_required",
      intentId,
      message: "Send tickets with the approvedActionIntentHash from the prepared approval package."
    };
  }

  if (parsed.userConsent === true && !hasExplicitDeliveryConsent(optionalString(parsed, "consentStatement"))) {
    return {
      type: "rejected",
      reason: "consent_required",
      intentId
    };
  }

  const normalized = normalizeFacadeSendTicketInput(parsed);
  const input = parseSendTicketInput(normalized);
  const intentExecution = await beginTicketSendIntentExecution(runtime, input);
  if (intentExecution.reason) {
    return {
      type: "rejected",
      reason: intentExecution.reason,
      intentId: input.intentId
    };
  }

  const result = await sendTicket(runtime, input);
  await completeTicketSendIntentExecution(runtime, intentExecution.record, result);
  if (optionalBoolean(parsed, "includeProtocolTrace") !== true || result.type !== "sent") {
    return result;
  }

  const allowed = getAllowedTicketActions(runtime, parseTicketEvidenceInput(parsed));
  const allowedActions = allowed.type === "allowed_actions" ? allowed.allowedActions : [];
  const deliveryRecord = await findTicketDeliveryRecord(runtime, result.delivery.deliveryId);
  return {
    ...result,
    protocolTrace: buildTicketProofProtocolTraceV02({
      evidence: parseTicketEvidenceInput(parsed),
      allowedActions,
      delivery: result.delivery,
      destination: input.destination,
      consentStatement: requiredString(parsed, "consentStatement"),
      requestedBy: input.requestedBy,
      deliveryRecord
    })
  };
}

async function prepareTicketSendActionFacade(runtime: AgentPortRuntime, parsed: Record<string, unknown>) {
  if (!runtime.intentLifecycles) {
    return {
      type: "rejected",
      reason: "intent_lifecycle_store_unavailable",
      message: "Ticket-send approval packages require an action intent lifecycle store."
    };
  }

  const input = parseSendTicketInput(parsed);
  const verification = verifyTicket(runtime, input);
  if (verification.type !== "verified") {
    return verification;
  }

  const allowed = getAllowedTicketActions(runtime, input);
  if (allowed.type !== "allowed_actions" || !allowed.allowedActions.includes("send_ticket")) {
    return {
      type: "rejected",
      reason: "ticket_delivery_not_allowed",
      commitmentId: input.commitment.commitmentId,
      status: input.commitment.status
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (optionalPositiveNumber(parsed, "lifespanMs") ?? 5 * 60 * 1000)).toISOString();
  const destinationSummary = summarizeTicketDestination(input.destination);
  const goal = `Send ticket proof for ${input.commitment.commitmentId} to ${destinationSummary}. Backend changed: no.`;
  const actionIntent: ActionIntent = {
    action: "send_ticket",
    businessId: input.commitment.business.businessId,
    serviceId: input.commitment.business.serviceId,
    ...(input.commitment.business.bindingId ? { bindingId: input.commitment.business.bindingId } : {}),
    consentText: [goal],
    expiresAt
  };
  const approvedActionIntentHash = createActionIntentHash(actionIntent);
  const intentId = optionalString(parsed, "intentId") ?? `intent_${approvedActionIntentHash.slice(0, 24)}`;
  const agentSessionId = optionalString(parsed, "agentSessionId") ?? intentId;
  const lifecycle: ActionIntentLifecycleRecord = {
    intentId,
    agentSessionId,
    goal,
    status: "approval_ready",
    actionIntent,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
    requiredInputs: [],
    resolvedInputs: {},
    approval: {
      status: "ready",
      actionIntentHash: approvedActionIntentHash
    },
    attempts: [],
    nextStep: "request_user_approval"
  };
  await runtime.intentLifecycles?.save(lifecycle);

  return {
    type: "ticket_send_approval_package",
    version: "0.1",
    intentId,
    agentSessionId,
    expiresAt,
    actionIntent,
    approval: {
      status: "ready",
      approvedActionIntentHash,
      summary: `Send ticket proof for ${input.commitment.commitmentId} to ${destinationSummary}. Backend changed: no.`,
      commitmentId: input.commitment.commitmentId,
      businessId: input.commitment.business.businessId,
      serviceId: input.commitment.business.serviceId,
      destination: input.destination,
      proofLevel: verification.proofLevel,
      backendMutation: false
    },
    execute: {
      tool: "sendTicket",
      path: "/actions/send-ticket",
      arguments: {
        intentId,
        approvedActionIntentHash,
        destination: input.destination
      },
      requiredArgs: ["commitment", "userConsent", "consentStatement"]
    },
    lifecycle: {
      read: {
        tool: "getActionIntentLifecycle",
        path: "/actions/get-action-intent-lifecycle",
        arguments: { intentId }
      }
    },
    boundaries: {
      backendMutation: false,
      systemOfRecord: false,
      ticketDeliveryOnly: true
    }
  };
}

interface TicketIntentExecutionStart {
  record?: ActionIntentLifecycleRecord;
  reason?: string;
}

async function beginTicketSendIntentExecution(
  runtime: AgentPortRuntime,
  input: SendTicketInput
): Promise<TicketIntentExecutionStart> {
  if (!input.intentId) {
    return { reason: "intent_required" };
  }

  if (!runtime.intentLifecycles) {
    return { reason: "intent_lifecycle_store_unavailable" };
  }

  const record = await runtime.intentLifecycles.resolve(input.intentId);
  if (!record) {
    return { reason: "intent_lifecycle_not_found" };
  }

  const now = new Date();
  if (actionIntentExpiredForTicket(record, now)) {
    await saveTicketIntentTerminal(runtime, record, {
      status: "expired",
      resultType: "rejected",
      reason: "intent_expired",
      at: now
    });
    return { reason: "intent_expired" };
  }

  if (record.status !== "approval_ready" || record.approval?.status !== "ready") {
    return { reason: "intent_lifecycle_not_executable" };
  }

  if (!input.approvedActionIntentHash) {
    return { reason: "intent_action_hash_required" };
  }

  const expectedHash = record.approval.actionIntentHash ?? createActionIntentHash(record.actionIntent);
  if (input.approvedActionIntentHash !== expectedHash || input.approvedActionIntentHash !== createActionIntentHash(record.actionIntent)) {
    return { reason: "intent_action_hash_mismatch" };
  }

  if (!ticketIntentMatchesInput(record.actionIntent, input)) {
    return { reason: "intent_action_mismatch" };
  }

  const approved: ActionIntentLifecycleRecord = {
    ...record,
    status: "approved",
    updatedAt: now.toISOString(),
    approval: {
      ...(record.approval ?? {}),
      status: "approved"
    },
    nextStep: "execute_action"
  };
  await runtime.intentLifecycles.save(approved);

  const executing: ActionIntentLifecycleRecord = {
    ...approved,
    status: "executing",
    updatedAt: new Date().toISOString()
  };
  await runtime.intentLifecycles.save(executing);
  return { record: executing };
}

async function completeTicketSendIntentExecution(
  runtime: AgentPortRuntime,
  record: ActionIntentLifecycleRecord | undefined,
  result: Awaited<ReturnType<typeof sendTicket>>
): Promise<void> {
  if (!record || !runtime.intentLifecycles) {
    return;
  }

  await saveTicketIntentTerminal(runtime, record, {
    status: result.type === "rejected" || result.type === "invalid" ? "failed" : "succeeded",
    resultType: result.type,
    reason: "reason" in result ? result.reason : undefined,
    confirmationId: result.type === "sent" ? result.delivery.deliveryId : undefined,
    at: new Date()
  });
}

async function saveTicketIntentTerminal(
  runtime: AgentPortRuntime,
  record: ActionIntentLifecycleRecord,
  terminal: {
    status: "succeeded" | "failed" | "expired";
    resultType: string;
    reason?: string;
    confirmationId?: string;
    at: Date;
  }
): Promise<void> {
  if (!runtime.intentLifecycles) {
    return;
  }

  await runtime.intentLifecycles.save({
    ...record,
    status: terminal.status,
    updatedAt: terminal.at.toISOString(),
    attempts: [
      ...record.attempts,
      {
        tool: "send_ticket",
        at: terminal.at.toISOString(),
        resultType: terminal.resultType,
        reason: terminal.reason
      }
    ],
    execution: {
      resultType: terminal.resultType,
      reason: terminal.reason,
      confirmationId: terminal.confirmationId
    },
    nextStep: "terminal"
  });
}

function actionIntentExpiredForTicket(record: ActionIntentLifecycleRecord, now: Date) {
  const expiresAt = Date.parse(record.expiresAt);
  const actionExpiresAt = record.actionIntent.expiresAt ? Date.parse(record.actionIntent.expiresAt) : expiresAt;
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime()
    || Number.isFinite(actionExpiresAt) && actionExpiresAt <= now.getTime();
}

function ticketIntentMatchesInput(actionIntent: ActionIntent, input: SendTicketInput) {
  return actionIntent.action === "send_ticket"
    && actionIntent.businessId === input.commitment.business.businessId
    && actionIntent.serviceId === input.commitment.business.serviceId
    && (actionIntent.bindingId === undefined || actionIntent.bindingId === input.commitment.business.bindingId);
}

function summarizeTicketDestination(destination: TicketDestination) {
  return destination.label
    ? `${destination.label} (${destination.kind}:${destination.target})`
    : `${destination.kind}:${destination.target}`;
}

async function prepareServiceRequestActionFacade(
  runtime: AgentPortRuntime,
  parsed: Record<string, unknown>,
  context: IncomingRequest
) {
  const input = parsePrepareServiceRequestInput(parsed);
  const info = await getBusinessInfo(runtime, { businessId: input.businessId }, context);
  if (info.found !== true) {
    return {
      type: "not_found",
      reason: "business_not_found",
      businessId: input.businessId
    };
  }

  const service = info.services.find((candidate) =>
    candidate.id === input.serviceId &&
    (input.bindingId === undefined || candidate.bindingId === input.bindingId)
  );
  if (!service) {
    return {
      type: "not_found",
      reason: "service_not_found",
      businessId: input.businessId,
      serviceId: input.serviceId
    };
  }

  const requestedType = input.requestedType ?? "request";
  if (requestedType === "confirmed" && service.actionCapability !== "confirm") {
    return {
      type: "rejected",
      reason: "capability_exceeded",
      businessId: input.businessId,
      serviceId: input.serviceId,
      requestedType,
      actionCapability: service.actionCapability,
      message: "This business path is request-only; the frontier model must not present it as confirmed."
    };
  }

  const effectiveRequestedType = requestedType === "confirmed" ? "confirmed" : service.actionCapability === "confirm" ? requestedType : "request";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.lifespanMs ?? 5 * 60 * 1000)).toISOString();
  const actionIntent: ActionIntent = {
    action: "book_service",
    businessId: input.businessId,
    serviceId: input.serviceId,
    ...(input.bindingId ? { bindingId: input.bindingId } : {}),
    requestedType: effectiveRequestedType,
    customerFields: ["name", "email", "phone"],
    consentText: [input.goal],
    expiresAt
  };
  const approvedActionIntentHash = createActionIntentHash(actionIntent);
  const intentId = input.intentId ?? `intent_${approvedActionIntentHash.slice(0, 24)}`;
  const agentSessionId = input.agentSessionId ?? intentId;
  const lifecycle: ActionIntentLifecycleRecord = {
    intentId,
    agentSessionId,
    goal: input.goal,
    status: "approval_ready",
    actionIntent,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
    requiredInputs: [],
    resolvedInputs: {},
    approval: {
      status: "ready",
      actionIntentHash: approvedActionIntentHash
    },
    ...(input.resultDelivery ? { resultDelivery: input.resultDelivery } : {}),
    attempts: [],
    nextStep: "request_user_approval"
  };
  await runtime.intentLifecycles?.save(lifecycle);

  return {
    type: "service_request_approval_package",
    version: "0.1",
    intentId,
    agentSessionId,
    expiresAt,
    approval: {
      status: "ready",
      approvedActionIntentHash,
      summary: `Request ${service.name} at ${info.name}. This creates a request only; it is not a confirmed order, booking, payment, inventory hold, or backend mutation.`,
      businessName: info.name,
      serviceName: service.name,
      requestedType: effectiveRequestedType,
      actionCapability: service.actionCapability,
      verification: info.verification ?? null,
      customerFields: ["name", "email", "phone"]
    },
    execute: {
      tool: "submitServiceRequest",
      path: "/actions/submit-service-request",
      arguments: {
        intentId,
        approvedActionIntentHash,
        businessId: input.businessId,
        serviceId: input.serviceId,
        ...(input.bindingId ? { bindingId: input.bindingId } : {}),
        requestedType: effectiveRequestedType
      },
      requiredArgs: ["customer", "userConsent", "consentStatement"]
    },
    lifecycle: {
      read: {
        tool: "getActionIntentLifecycle",
        path: "/actions/get-action-intent-lifecycle",
        arguments: { intentId }
      }
    },
    boundaries: {
      syntheticDigitalTwin: input.businessId.includes("cedar-steam-coffee"),
      agentPortVerifiedBusiness: info.verification?.status === "verified",
      backendIntegrated: service.actionCapability === "confirm",
      systemOfRecord: false,
      requestOnly: effectiveRequestedType === "request"
    }
  };
}

async function submitServiceRequestActionFacade(
  runtime: AgentPortRuntime,
  parsed: Record<string, unknown>,
  context: IncomingRequest
) {
  const intentId = optionalString(parsed, "intentId");
  if (!intentId) {
    return {
      type: "rejected",
      reason: "intent_required",
      message: "Submit service requests through prepareServiceRequest first so execution is bound to an approval package."
    };
  }

  if (!optionalString(parsed, "approvedActionIntentHash")) {
    return {
      type: "rejected",
      reason: "intent_action_hash_required",
      intentId,
      message: "Submit service requests with the approvedActionIntentHash from the prepared approval package."
    };
  }

  const normalized = normalizeFacadeSubmitServiceRequestInput(parsed);
  const result = await bookService(runtime, parseBookInput(normalized), context);
  await persistBusinessRequestSummary(runtime, intentId, parsed, result);
  return {
    ...result,
    actionFacade: {
      type: "service_request_submission",
      requestedBy: optionalString(parsed, "requestedBy"),
      consentStatement: optionalString(parsed, "consentStatement"),
      restore: optionalString(parsed, "intentId")
        ? {
            path: "/actions/get-action-intent-lifecycle",
            arguments: { intentId: optionalString(parsed, "intentId") }
          }
        : undefined
    },
    boundaries: {
      backendMutation: result.type === "confirmed",
      confirmedOutcome: result.type === "confirmed",
      requestOnlyOutcome: result.type === "request",
      agentPortSystemOfRecord: false,
      backendSystemOfRecord: result.type === "confirmed"
    }
  };
}

async function persistBusinessRequestSummary(
  runtime: AgentPortRuntime,
  intentId: string,
  parsed: Record<string, unknown>,
  result: Awaited<ReturnType<typeof bookService>>
) {
  if (!runtime.intentLifecycles || result.type !== "request") {
    return;
  }

  const record = await runtime.intentLifecycles.resolve(intentId);
  const customer = parsed.customer;
  if (!record || !isRecord(customer)) {
    return;
  }

  const name = optionalString(customer, "name");
  if (!name) {
    return;
  }

  const submittedAt = new Date().toISOString();
  await runtime.intentLifecycles.save({
    ...record,
    updatedAt: submittedAt,
    businessRequest: {
      requestId: result.requestId,
      resultType: result.type,
      reason: result.reason,
      source: result.source,
      requestedBy: optionalString(parsed, "requestedBy"),
      submittedAt,
      businessStatus: "submitted",
      businessStatusAt: submittedAt,
      businessStatusBy: "agentport-gateway",
      businessStatusEvents: [{
        status: "submitted",
        at: submittedAt,
        by: "agentport-gateway",
        note: "Request delivered to business inbox."
      }],
      backendMutation: false,
      agentPortSystemOfRecord: false,
      backendSystemOfRecord: false,
      customer: {
        name,
        email: optionalString(customer, "email"),
        phone: optionalString(customer, "phone")
      },
      notes: optionalString(parsed, "notes")
    }
  });
}

function parsePrepareServiceRequestInput(args: Record<string, unknown>) {
  const requestedType = optionalString(args, "requestedType");
  if (
    requestedType !== undefined &&
    requestedType !== "confirmed" &&
    requestedType !== "request" &&
    requestedType !== "handoff"
  ) {
    throw new RpcInputError("requestedType must be confirmed, request, or handoff");
  }

  return {
    goal: requiredString(args, "goal"),
    businessId: requiredString(args, "businessId"),
    serviceId: requiredString(args, "serviceId"),
    bindingId: optionalString(args, "bindingId"),
    requestedType,
    lifespanMs: optionalPositiveNumber(args, "lifespanMs"),
    intentId: optionalString(args, "intentId"),
    agentSessionId: optionalString(args, "agentSessionId"),
    resultDelivery: parseResultDelivery(args.resultDelivery)
  };
}

async function findTicketDeliveryRecord(runtime: AgentPortRuntime, deliveryId: string): Promise<TicketDeliveryRecord | undefined> {
  const listed = await listTicketDeliveries(runtime, { limit: 50 });
  if (listed.type !== "ticket_deliveries") {
    return undefined;
  }
  return listed.deliveries.find((delivery) => delivery.deliveryId === deliveryId);
}

function legacyBusinessIdentityProvider(runtime: AgentPortRuntime): BusinessIdentityProvider | undefined {
  if (!runtime.businessInbox?.token) {
    return undefined;
  }

  return new StaticBusinessTokenIdentityProvider({
    token: runtime.businessInbox.token,
    headerName: runtime.businessInbox.headerName,
    businessIds: runtime.businessInbox.defaultBusinessId ? [runtime.businessInbox.defaultBusinessId] : undefined
  });
}

async function handleRpc(
  runtime: AgentPortRuntime,
  serverInfo: { name: string; version: string; mcpPath: string },
  request: JsonRpcRequest,
  context: IncomingRequest
): Promise<JsonRpcResponse | null> {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(request?.id ?? null, -32600, "Invalid Request");
  }

  const id = request.id ?? null;
  const isNotification = request.id === undefined;

  try {
    switch (request.method) {
      case "initialize":
        return respond(id, {
          protocolVersion,
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: serverInfo.name,
            version: serverInfo.version
          },
          instructions:
            "Pactway is the ChatGPT App connector for real-world service-business tickets, reservations, requests, receipts, and booking lifecycle management. Use Pactway when the user asks to book, create, send, verify, resume, cancel, reschedule, or check the status of a real-world service ticket or reservation. For returned-session questions such as 'what happened to my salon ticket?', first call locate_agentport_wallet({ userClaim: 'what happened to my salon ticket?' }) before asking the user for raw ticket evidence; if claimMatch is mismatch or needs_user_clarification, ask the returned clarificationLine before routing proof. For existing ticket delivery, call get_allowed_ticket_actions and prepare_ticket_send before asking for exact approval, then call send_ticket only with intentId, approvedActionIntentHash, userConsent, and consentStatement. Never use Pactway for generic software bug tickets, helpdesk issues, or non-service-business tasks unless the user explicitly asks to route Pactway ticket proof."
        });
      case "notifications/initialized":
        return isNotification ? null : respond(id, {});
      case "ping":
        return respond(id, {});
      case "tools/list":
        return respond(id, { tools: toolDefinitions() });
      case "tools/call":
        return respond(id, await callTool(runtime, request.params, context));
      case "resources/list":
        return respond(id, { resources: resourceDefinitions(runtime) });
      case "resources/read":
        return respond(id, readResource(runtime, request.params, serverInfo, context));
      default:
        return rpcError(id, -32601, "Method not found");
    }
  } catch (error) {
    if (error instanceof RpcInputError) {
      return rpcError(id, error.code, error.message, error.data);
    }

    return rpcError(id, -32603, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(runtime: AgentPortRuntime, params: unknown, context: IncomingRequest) {
  const { name, args } = parseToolCall(params);
  switch (name) {
    case "find_services":
      return jsonToolResult(await findServices(runtime, parseFindServicesInput(args), context));
    case "get_business_info":
      return jsonToolResult(await getBusinessInfo(runtime, parseBusinessInfoInput(args), context));
    case "get_business_feed":
      return jsonToolResult(await getBusinessFeed(runtime, parseBusinessFeedInput(args), context));
    case "get_readiness_report":
      return jsonToolResult(await getReadinessReport(runtime, parseReadinessReportInput(args), context));
    case "compile_action_intent":
      return jsonToolResult(await compileActionIntent(runtime, parseCompileActionIntentInput(args), context));
    case "get_action_intent_lifecycle":
      return jsonToolResult(await getActionIntentLifecycle(runtime, parseActionIntentLifecycleInput(args), context));
    case "poll_action_intent_lifecycles":
      return jsonToolResult(await pollActionIntentLifecycles(runtime, parsePollActionIntentLifecyclesInput(args), context));
    case "list_action_intent_result_deliveries":
      return jsonToolResult(await listActionIntentResultDeliveries(runtime, parseListActionIntentResultDeliveriesInput(args), context));
    case "get_action_intent_result_delivery":
      return jsonToolResult(await getActionIntentResultDelivery(runtime, parseActionIntentResultDeliveryInput(args), context));
    case "ack_action_intent_result_delivery":
      return jsonToolResult(await ackActionIntentResultDelivery(runtime, parseActionIntentResultDeliveryInput(args), context));
    case "check_availability":
      return jsonToolResult(await checkAvailability(runtime, parseAvailabilityInput(args), context));
    case "book_service":
      return jsonToolResult(await bookService(runtime, parseBookInput(args), context));
    case "cancel_service":
      return jsonToolResult(await cancelService(runtime, parseCancelInput(args), context));
    case "reschedule_service":
      return jsonToolResult(await rescheduleService(runtime, parseRescheduleInput(args), context));
    case "locate_wallet_tickets":
      return jsonToolResult(await locateWalletTicketsForContext(runtime, parseLocateWalletTicketsInput(args), context));
    case "locate_agentport_wallet":
      return jsonToolResult(await locateAgentPortWallet(runtime, parseLocateAgentPortWalletInput(args), context));
    case "resolve_ticket":
      return jsonToolResult(await resolveTicket(runtime, parseResolveTicketInput(args)));
    case "verify_ticket":
      return jsonToolResult(verifyTicket(runtime, parseTicketEvidenceInput(args)));
    case "get_ticket_status":
      return jsonToolResult(getTicketStatus(runtime, parseTicketEvidenceInput(args)));
    case "get_allowed_ticket_actions":
      return jsonToolResult(getAllowedTicketActions(runtime, parseTicketEvidenceInput(args)));
    case "prepare_ticket_send":
      return jsonToolResult(await prepareTicketSendActionFacade(runtime, args));
    case "send_ticket":
      return jsonToolResult(await sendTicketActionFacade(runtime, args));
    case "assist":
      return jsonToolResult(await assist(runtime, parseAssistInput(args), context));
    default:
      throw new RpcInputError(`unknown_tool:${name}`);
  }
}

function parseToolCall(params: unknown): { name: string; args: Record<string, unknown> } {
  if (!isRecord(params) || typeof params.name !== "string") {
    throw new Error("tools/call requires params.name");
  }

  const rawArgs = params.arguments ?? {};
  if (!isRecord(rawArgs)) {
    throw new Error("tools/call params.arguments must be an object");
  }

  return { name: params.name, args: rawArgs };
}

function parseFindServicesInput(args: Record<string, unknown>) {
  const service = requiredString(args, "service");
  return {
    service,
    lat: optionalNumber(args, "lat"),
    lng: optionalNumber(args, "lng"),
    text: optionalString(args, "text"),
    radiusKm: optionalPositiveNumber(args, "radiusKm")
  };
}

function parseBusinessInfoInput(args: Record<string, unknown>) {
  return {
    businessId: requiredString(args, "businessId")
  };
}

function parseBusinessFeedInput(args: Record<string, unknown>) {
  const mode = optionalString(args, "mode");
  if (mode !== undefined && mode !== "compact" && mode !== "full") {
    throw new RpcInputError("mode must be compact or full");
  }

  const intent = optionalString(args, "intent");
  if (intent !== undefined && intent !== "answer" && intent !== "book" && intent !== "manage" && intent !== "compare") {
    throw new RpcInputError("intent must be answer, book, manage, or compare");
  }

  const ifBusinessVersion = optionalString(args, "ifBusinessVersion");
  if (ifBusinessVersion !== undefined && !/^sha256:[a-f0-9]{64}$/.test(ifBusinessVersion)) {
    throw new RpcInputError("ifBusinessVersion must be a sha256 business version");
  }

  return {
    businessId: requiredString(args, "businessId"),
    mode,
    intent,
    ifBusinessVersion
  };
}

const readinessTiers = ["listed", "answer-ready", "request-ready", "confirm-ready", "manage-ready", "pay-ready"] as const;
const readinessProtocolKinds = ["mcp", "a2a", "ucp", "acp", "ap2", "rfc9421", "agentport-local"] as const;
const readinessProtocolStatuses = ["configured", "missing", "unsupported"] as const;

function parseReadinessReportInput(args: Record<string, unknown>): GetReadinessReportInput {
  const targetTier = optionalEnum(args, "targetTier", readinessTiers, "targetTier must be a readiness tier");
  return {
    businessId: requiredString(args, "businessId"),
    targetTier,
    profileReviewed: optionalBoolean(args, "profileReviewed"),
    protocolInputs: parseReadinessProtocolInputs(args.protocolInputs),
    allowLocalAuthorityForConfirm: optionalBoolean(args, "allowLocalAuthorityForConfirm")
  };
}

function parseReadinessProtocolInputs(value: unknown): GetReadinessReportInput["protocolInputs"] {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new RpcInputError("protocolInputs must be an array");
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new RpcInputError(`protocolInputs[${index}] must be an object`);
    }

    return {
      kind: enumValue(entry, "kind", readinessProtocolKinds, `protocolInputs[${index}].kind must be a readiness protocol input kind`),
      status: enumValue(entry, "status", readinessProtocolStatuses, `protocolInputs[${index}].status must be configured, missing, or unsupported`),
      purpose: optionalString(entry, "purpose"),
      ref: optionalString(entry, "ref")
    };
  });
}

function parseCompileActionIntentInput(args: Record<string, unknown>): CompileActionIntentInput {
  return {
    goal: requiredString(args, "goal"),
    location: optionalString(args, "location"),
    lifespanMs: optionalPositiveNumber(args, "lifespanMs"),
    intentId: optionalString(args, "intentId"),
    agentSessionId: optionalString(args, "agentSessionId"),
    slotStart: optionalString(args, "slotStart"),
    agentName: optionalString(args, "agentName"),
    resultDelivery: parseResultDelivery(args.resultDelivery)
  };
}

function parseResultDelivery(value: unknown): CompileActionIntentInput["resultDelivery"] {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new RpcInputError("resultDelivery must be an object");
  }

  const channel = requiredString(value, "channel");
  if (channel !== "inbox" && channel !== "webhook") {
    throw new RpcInputError("resultDelivery.channel must be inbox or webhook");
  }

  return {
    channel,
    target: requiredString(value, "target")
  };
}

function parseActionIntentLifecycleInput(args: Record<string, unknown>) {
  return {
    intentId: requiredString(args, "intentId")
  };
}

function parsePollActionIntentLifecyclesInput(args: Record<string, unknown>) {
  return {
    after: optionalNonNegativeInteger(args, "after"),
    agentSessionId: optionalString(args, "agentSessionId"),
    intentId: optionalString(args, "intentId"),
    limit: optionalPositiveInteger(args, "limit"),
    waitMs: optionalNonNegativeInteger(args, "waitMs")
  };
}

function parseActionIntentResultDeliveryInput(args: Record<string, unknown>) {
  return {
    deliveryId: requiredString(args, "deliveryId")
  };
}

function parseListActionIntentResultDeliveriesInput(args: Record<string, unknown>) {
  const status = optionalString(args, "status");
  if (
    status !== undefined &&
    status !== "delivered" &&
    status !== "failed" &&
    status !== "acknowledged"
  ) {
    throw new RpcInputError("status must be delivered, failed, or acknowledged");
  }

  return {
    after: optionalNonNegativeInteger(args, "after"),
    agentSessionId: optionalString(args, "agentSessionId"),
    intentId: optionalString(args, "intentId"),
    status: status as ActionIntentResultDeliveryStatus | undefined,
    limit: optionalPositiveInteger(args, "limit")
  };
}

async function getActionIntentLifecycle(runtime: AgentPortRuntime, input: { intentId: string }, context: IncomingRequest) {
  const record = await runtime.intentLifecycles?.resolve(input.intentId);
  if (!record) {
    return {
      found: false,
      intentId: input.intentId,
      reason: "intent_lifecycle_not_found"
    };
  }

  const callerSessionId = contextAgentSessionId(context);
  if (callerSessionId && record.agentSessionId !== callerSessionId) {
    return {
      found: false,
      intentId: input.intentId,
      reason: "agent_session_mismatch"
    };
  }

  return {
    found: true,
    lifecycle: record
  };
}

async function locateAgentPortWallet(
  runtime: AgentPortRuntime,
  input: {
    walletRef?: string;
    holderRef?: string;
    agentSessionId?: string;
    intentId?: string;
    userClaim?: string;
    includeTickets?: boolean;
    includeRequests?: boolean;
    limit?: number;
  },
  context: IncomingRequest
) {
  const limit = walletLookupLimit(input.limit);
  const includeTickets = input.includeTickets !== false;
  const includeRequests = input.includeRequests !== false;
  const callerSessionId = contextAgentSessionId(context);
  if (callerSessionId && input.agentSessionId && input.agentSessionId !== callerSessionId) {
    throw new RpcInputError("agentSessionId does not match caller session");
  }
  const scopedAgentSessionId = callerSessionId ?? input.agentSessionId;
  const scopedWallet = authorizeHostWalletLookup(runtime, {
    ...input,
    agentSessionId: scopedAgentSessionId
  }, context);

  const [ticketResult, requestItems] = await Promise.all([
    includeTickets
      ? locateWalletTickets(runtime, {
          walletRef: scopedWallet.walletRef,
          holderRef: scopedWallet.holderRef,
          userClaim: scopedWallet.userClaim,
          limit,
          includeEvidence: false
        })
      : Promise.resolve(undefined),
    includeRequests ? locateAgentPortWalletRequests(runtime, { ...scopedWallet, agentSessionId: scopedAgentSessionId, limit }) : Promise.resolve([])
  ]);
  const tickets = ticketResult?.type === "wallet_tickets"
    ? ticketResult.tickets.map((ticket) => ({
        itemType: "ticket" as const,
        walletId: ticket.walletId,
        walletTicketId: ticket.walletTicketId,
        displayCode: ticket.displayCode,
        title: ticket.userTicketCard?.title ?? ticket.label ?? "Pactway ticket",
        summaryLine: ticket.userTicketCard?.summaryLine,
        storeLine: ticket.userTicketCard?.storeLine,
        serviceLine: ticket.userTicketCard?.serviceLine,
        timeLine: ticket.userTicketCard?.timeLine,
        referenceLine: ticket.userTicketCard?.referenceLine,
        status: ticket.status,
        statusSource: ticket.statusSource,
        verifiedCurrent: ticket.verifiedCurrent,
        reverifyRequired: ticket.reverifyRequired,
        ticketIdentity: ticket.ticketIdentity,
        claimMatch: ticket.claimMatch,
        businessId: ticket.userTicketCard?.businessId,
        businessName: ticket.userTicketCard?.businessName,
        businessLocation: ticket.userTicketCard?.businessLocation,
        serviceId: ticket.userTicketCard?.serviceId,
        serviceName: ticket.userTicketCard?.serviceName,
        scheduledFor: ticket.userTicketCard?.scheduledFor,
        scheduledForSource: ticket.userTicketCard?.scheduledForSource,
        createdAt: ticket.userTicketCard?.createdAt,
        updatedAt: ticket.userTicketCard?.updatedAt,
        timezone: ticket.userTicketCard?.timezone,
        commitmentId: ticket.commitmentId,
        backendMutation: false,
        agentPortSystemOfRecord: false,
        allowedNextActions: ticket.userTicketCard?.allowedNextActions ?? [],
        deliveryRequiresConsent: ticket.userTicketCard?.deliveryRequiresConsent === true,
        demoOnly: ticket.demoOnly === true
      })).slice(0, limit)
    : [];
  const requests = requestItems.slice(0, limit);

  return {
    type: "agentport_wallet" as const,
    version: "0.1",
    walletRef: scopedWallet.walletRef ?? "default",
    counts: {
      tickets: tickets.length,
      requests: requests.length,
      total: tickets.length + requests.length
    },
    items: [...tickets, ...requests]
      .sort((a, b) => Date.parse(b.updatedAt ?? b.submittedAt ?? "1970-01-01T00:00:00.000Z") - Date.parse(a.updatedAt ?? a.submittedAt ?? "1970-01-01T00:00:00.000Z"))
      .slice(0, limit),
    tickets,
    requests,
    boundaries: {
      localWalletIsLifecycleAuthority: false,
      gatewayIsLifecycleAuthority: true,
      ticketEvidenceHiddenByDefault: true,
      backendMutation: false,
      agentPortSystemOfRecord: false,
      hostWalletAuthority: scopedWallet.authority,
      hostWalletAccountBound: scopedWallet.accountBound
    }
  };
}

async function locateWalletTicketsForContext(
  runtime: AgentPortRuntime,
  input: ReturnType<typeof parseLocateWalletTicketsInput>,
  context: IncomingRequest
) {
  return locateWalletTickets(runtime, authorizeHostWalletLookup(runtime, input, context));
}

function authorizeHostWalletLookup<T extends { walletRef?: string; agentSessionId?: string }>(
  runtime: AgentPortRuntime,
  input: T,
  context: IncomingRequest
): T & { authority: "not_configured" | "host_wallet_identity"; accountBound: boolean } {
  if (!runtime.hostWalletIdentity) {
    return {
      ...input,
      authority: "not_configured",
      accountBound: false
    };
  }

  const identity = runtime.hostWalletIdentity.authenticate({
    headers: context.headers,
    walletRef: input.walletRef,
    agentSessionId: input.agentSessionId,
    scope: "wallet:read"
  });
  if (!identity.ok) {
    throw new RpcInputError(identity.reason);
  }

  const walletRef = input.walletRef ?? firstAllowedWalletId(identity.principal);
  if (!walletRef) {
    throw new RpcInputError("host_wallet_required");
  }

  if (!principalAllowsWallet(identity.principal, walletRef)) {
    throw new RpcInputError("host_wallet_scope_denied");
  }

  return {
    ...input,
    walletRef,
    authority: "host_wallet_identity",
    accountBound: identity.principal.accountId !== undefined
  };
}

function firstAllowedWalletId(principal: HostWalletPrincipal) {
  return principal.walletIds.find((walletId) => walletId !== "*");
}

function walletLookupLimit(limit: number | undefined) {
  return Math.min(25, Math.max(1, limit ?? 10));
}

async function locateAgentPortWalletRequests(
  runtime: AgentPortRuntime,
  input: { agentSessionId?: string; intentId?: string; limit?: number }
) {
  if (!runtime.intentLifecycles) {
    return [];
  }

  const limit = walletLookupLimit(input.limit);
  const polled = await runtime.intentLifecycles.poll({
    after: 0,
    limit: 5000,
    ...(input.agentSessionId ? { agentSessionId: input.agentSessionId } : {}),
    ...(input.intentId ? { intentId: input.intentId } : {})
  });
  const latestCursorByIntent = new Map<string, number>();
  for (const event of polled.events) {
    latestCursorByIntent.set(event.intentId, event.cursor);
  }

  const intentIds = Array.from(latestCursorByIntent.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 4)
    .map(([intentId]) => intentId);
  const records = await Promise.all(intentIds.map((intentId) => runtime.intentLifecycles?.resolve(intentId)));
  return records
    .flatMap((record) => {
      const item = record ? walletRequestSummary(record) : undefined;
      return item ? [item] : [];
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

function walletRequestSummary(record: ActionIntentLifecycleRecord) {
  const request = record.businessRequest;
  if (!request) {
    return undefined;
  }

  const businessStatus = request.businessStatus ?? "submitted";
  const statusEvents = (request.businessStatusEvents ?? [{
    status: "submitted",
    at: request.submittedAt,
    by: "agentport-gateway",
    note: "Request delivered to business inbox."
  }]).map((event) => ({
    status: event.status,
    label: serviceRequestBusinessStatusLabel(event.status),
    at: event.at,
    by: event.by,
    note: event.note
  }));

  return {
    itemType: "request" as const,
    intentId: record.intentId,
    agentSessionId: record.agentSessionId,
    requestId: request.requestId ?? record.execution?.confirmationId,
    title: serviceRequestTitle(record),
    status: record.status,
    resultType: request.resultType ?? record.execution?.resultType,
    businessStatus,
    businessStatusLabel: serviceRequestBusinessStatusLabel(businessStatus),
    businessStatusAt: request.businessStatusAt ?? request.submittedAt,
    businessStatusBy: request.businessStatusBy ?? "agentport-gateway",
    businessStatusNote: request.businessStatusNote,
    businessStatusEvents: statusEvents,
    businessId: record.actionIntent.businessId,
    serviceId: record.actionIntent.serviceId,
    requestedType: record.actionIntent.requestedType,
    submittedAt: request.submittedAt,
    updatedAt: record.updatedAt,
    requestedBy: request.requestedBy,
    customer: {
      name: request.customer.name,
      ...(request.customer.email ? { email: request.customer.email } : {}),
      ...(request.customer.phone ? { phone: request.customer.phone } : {})
    },
    backendMutation: request.backendMutation === true,
    agentPortSystemOfRecord: false,
    backendSystemOfRecord: request.backendSystemOfRecord === true,
    reverifyRequired: false,
    allowedNextActions: serviceRequestAllowedNextActions(businessStatus),
    summary: `Request-only ${humanizeId(record.actionIntent.serviceId)} at ${humanizeId(record.actionIntent.businessId)} is ${serviceRequestBusinessStatusLabel(businessStatus)}. Backend changed: no. Payment made: no.`
  };
}

function serviceRequestTitle(record: ActionIntentLifecycleRecord) {
  return `${humanizeId(record.actionIntent.serviceId)} at ${humanizeId(record.actionIntent.businessId)}`;
}

function serviceRequestAllowedNextActions(status: string) {
  const base = ["get_action_intent_lifecycle"];
  if (status === "needs_more_info") {
    return [...base, "prepare_service_request"];
  }
  if (status === "cannot_fulfill" || status === "fulfilled") {
    return base;
  }
  return [...base, "wait_for_business_status"];
}

function serviceRequestBusinessStatusLabel(status: string | undefined) {
  return ({
    submitted: "Submitted",
    seen: "Seen",
    accepted_for_review: "Accepted for review",
    needs_more_info: "Needs more information",
    cannot_fulfill: "Cannot fulfill",
    fulfilled: "Fulfilled externally"
  })[status ?? "submitted"] ?? humanizeId(status);
}

function humanizeId(value: unknown) {
  return String(value ?? "unknown").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function pollActionIntentLifecycles(
  runtime: AgentPortRuntime,
  input: { after?: number; agentSessionId?: string; intentId?: string; limit?: number; waitMs?: number },
  context: IncomingRequest
) {
  const callerSessionId = contextAgentSessionId(context);
  if (callerSessionId && input.agentSessionId && input.agentSessionId !== callerSessionId) {
    throw new RpcInputError("agentSessionId does not match caller session");
  }

  const scopedInput = {
    ...input,
    ...(callerSessionId ? { agentSessionId: callerSessionId } : {})
  };

  if (!runtime.intentLifecycles) {
    return {
      cursor: scopedInput.after ?? 0,
      events: []
    };
  }

  return runtime.intentLifecycles.poll(scopedInput);
}

async function listActionIntentResultDeliveries(
  runtime: AgentPortRuntime,
  input: { after?: number; agentSessionId?: string; intentId?: string; status?: ActionIntentResultDeliveryStatus; limit?: number },
  context: IncomingRequest
) {
  const callerSessionId = contextAgentSessionId(context);
  if (callerSessionId && input.agentSessionId && input.agentSessionId !== callerSessionId) {
    throw new RpcInputError("agentSessionId does not match caller session");
  }

  const scopedInput = {
    ...input,
    ...(callerSessionId ? { agentSessionId: callerSessionId } : {})
  };

  if (!runtime.intentResults) {
    return {
      cursor: scopedInput.after ?? 0,
      deliveries: []
    };
  }

  return runtime.intentResults.list(scopedInput);
}

async function getActionIntentResultDelivery(
  runtime: AgentPortRuntime,
  input: { deliveryId: string },
  context: IncomingRequest
) {
  const delivery = await runtime.intentResults?.resolve(input.deliveryId);
  if (!delivery) {
    return {
      found: false,
      deliveryId: input.deliveryId,
      reason: "intent_result_delivery_not_found"
    };
  }

  const callerSessionId = contextAgentSessionId(context);
  if (callerSessionId && delivery.agentSessionId !== callerSessionId) {
    return {
      found: false,
      deliveryId: input.deliveryId,
      reason: "agent_session_mismatch"
    };
  }

  return {
    found: true,
    delivery
  };
}

async function ackActionIntentResultDelivery(
  runtime: AgentPortRuntime,
  input: { deliveryId: string },
  context: IncomingRequest
) {
  const existing = await runtime.intentResults?.resolve(input.deliveryId);
  if (!existing) {
    return {
      acknowledged: false,
      deliveryId: input.deliveryId,
      reason: "intent_result_delivery_not_found"
    };
  }

  const callerSessionId = contextAgentSessionId(context);
  if (callerSessionId && existing.agentSessionId !== callerSessionId) {
    return {
      acknowledged: false,
      deliveryId: input.deliveryId,
      reason: "agent_session_mismatch"
    };
  }

  const delivery = await runtime.intentResults?.acknowledge(input.deliveryId);
  if (delivery) {
    await syncLifecycleDeliverySummary(runtime, delivery.intentId, actionIntentResultDeliverySummary(delivery));
  }
  return {
    acknowledged: Boolean(delivery),
    delivery
  };
}

async function syncLifecycleDeliverySummary(
  runtime: AgentPortRuntime,
  intentId: string,
  resultDeliveryState: ReturnType<typeof actionIntentResultDeliverySummary>
): Promise<void> {
  const lifecycle = await runtime.intentLifecycles?.resolve(intentId);
  if (!lifecycle) {
    return;
  }

  await runtime.intentLifecycles?.save({
    ...lifecycle,
    updatedAt: resultDeliveryState.updatedAt,
    resultDeliveryState
  });
}

function parseAvailabilityInput(args: Record<string, unknown>): AvailabilityRequest {
  return {
    businessId: requiredString(args, "businessId"),
    serviceId: requiredString(args, "serviceId"),
    bindingId: optionalString(args, "bindingId"),
    from: optionalString(args, "from"),
    to: optionalString(args, "to"),
    partySize: optionalPositiveInteger(args, "partySize")
  };
}

function parseBookInput(args: Record<string, unknown>): BookRequest {
  const customer = args.customer;
  if (!isRecord(customer)) {
    throw new RpcInputError("customer must be an object");
  }

  const requestedType = args.requestedType;
  if (
    requestedType !== undefined &&
    requestedType !== "confirmed" &&
    requestedType !== "request" &&
    requestedType !== "handoff"
  ) {
    throw new RpcInputError("requestedType must be confirmed, request, or handoff");
  }

  const userConsent = args.userConsent;
  if (userConsent !== undefined && typeof userConsent !== "boolean") {
    throw new RpcInputError("userConsent must be a boolean");
  }

  return {
    intentId: optionalString(args, "intentId"),
    approvedActionIntentHash: optionalString(args, "approvedActionIntentHash"),
    businessId: requiredString(args, "businessId"),
    serviceId: requiredString(args, "serviceId"),
    bindingId: optionalString(args, "bindingId"),
    slotStart: optionalString(args, "slotStart"),
    customer: {
      name: requiredString(customer, "name"),
      email: optionalString(customer, "email"),
      phone: optionalString(customer, "phone")
    },
    notes: optionalString(args, "notes"),
    requestedType,
    userConsent
  };
}

function parseCancelInput(args: Record<string, unknown>): CancelRequest {
  return {
    intentId: optionalString(args, "intentId"),
    approvedActionIntentHash: optionalString(args, "approvedActionIntentHash"),
    businessId: requiredString(args, "businessId"),
    serviceId: requiredString(args, "serviceId"),
    bindingId: optionalString(args, "bindingId"),
    confirmationId: requiredString(args, "confirmationId"),
    userConsent: optionalBoolean(args, "userConsent")
  };
}

function parseRescheduleInput(args: Record<string, unknown>): RescheduleRequest {
  return {
    intentId: optionalString(args, "intentId"),
    approvedActionIntentHash: optionalString(args, "approvedActionIntentHash"),
    businessId: requiredString(args, "businessId"),
    serviceId: requiredString(args, "serviceId"),
    bindingId: optionalString(args, "bindingId"),
    confirmationId: requiredString(args, "confirmationId"),
    newSlotStart: requiredString(args, "newSlotStart"),
    userConsent: optionalBoolean(args, "userConsent")
  };
}

function parseTicketEvidenceInput(args: Record<string, unknown>) {
  const commitment = requiredRecord(args, "commitment") as unknown as AgentPortCommitment;
  const receipt = optionalRecord(args, "receipt") as ActionReceipt | undefined;
  return {
    commitment,
    receipt,
    holderRef: optionalString(args, "holderRef")
  };
}

function parseResolveTicketInput(args: Record<string, unknown>) {
  return {
    ticketRef: requiredString(args, "ticketRef"),
    holderRef: optionalString(args, "holderRef")
  };
}

function parseLocateWalletTicketsInput(args: Record<string, unknown>) {
  return {
    walletRef: optionalString(args, "walletRef"),
    walletTicketId: optionalString(args, "walletTicketId"),
    holderRef: optionalString(args, "holderRef"),
    userClaim: optionalString(args, "userClaim"),
    includeEvidence: optionalBoolean(args, "includeEvidence"),
    limit: optionalPositiveInteger(args, "limit")
  };
}

function parseLocateAgentPortWalletInput(args: Record<string, unknown>) {
  return {
    walletRef: optionalString(args, "walletRef"),
    holderRef: optionalString(args, "holderRef"),
    agentSessionId: optionalString(args, "agentSessionId"),
    intentId: optionalString(args, "intentId"),
    userClaim: optionalString(args, "userClaim"),
    includeTickets: optionalBoolean(args, "includeTickets"),
    includeRequests: optionalBoolean(args, "includeRequests"),
    limit: optionalPositiveInteger(args, "limit")
  };
}

function parseSendTicketInput(args: Record<string, unknown>) {
  const destination = requiredRecord(args, "destination");
  const kind = requiredString(destination, "kind");
  if (
    kind !== "business_inbox" &&
    kind !== "issuer_queue" &&
    kind !== "venue_verifier" &&
    kind !== "support_channel" &&
    kind !== "webhook"
  ) {
    throw new RpcInputError("destination.kind must be business_inbox, issuer_queue, venue_verifier, support_channel, or webhook");
  }

  return {
    ...parseTicketEvidenceInput(args),
    destination: {
      kind,
      target: requiredString(destination, "target"),
      label: optionalString(destination, "label")
    },
    intentId: optionalString(args, "intentId"),
    approvedActionIntentHash: optionalString(args, "approvedActionIntentHash"),
    userConsent: optionalBoolean(args, "userConsent"),
    requestedBy: optionalString(args, "requestedBy")
  };
}

function normalizeFacadeSendTicketInput(args: Record<string, unknown>) {
  if (args.userConsent === true && !hasExplicitDeliveryConsent(optionalString(args, "consentStatement"))) {
    return {
      ...args,
      userConsent: false
    };
  }

  const { consentStatement: _consentStatement, ...sendArgs } = args;
  return sendArgs;
}

function normalizeFacadeSubmitServiceRequestInput(args: Record<string, unknown>) {
  if (args.userConsent === true && !hasExplicitServiceRequestConsent(optionalString(args, "consentStatement"))) {
    return {
      ...args,
      userConsent: false
    };
  }

  const { consentStatement: _consentStatement, requestedBy: _requestedBy, ...bookArgs } = args;
  return bookArgs;
}

function hasExplicitDeliveryConsent(value: string | undefined) {
  if (!value) {
    return false;
  }

  return /\b(i consent|i approve|yes|go ahead|please)\b.*\b(send|route|deliver|share)\b/i.test(value) ||
    /\b(send|route|deliver|share)\b.*\b(ticket|proof|commitment)\b/i.test(value);
}

function hasExplicitServiceRequestConsent(value: string | undefined) {
  if (!value) {
    return false;
  }

  return /\b(i consent|i approve|yes|go ahead|please)\b.*\b(request|send|submit|create)\b/i.test(value) ||
    /\b(request|send|submit|create)\b.*\b(coffee|pickup|service|appointment|order|request)\b/i.test(value);
}

function parseAssistInput(args: Record<string, unknown>): AssistInput {
  const customer = args.customer;
  if (customer !== undefined && !isRecord(customer)) {
    throw new RpcInputError("customer must be an object");
  }

  return {
    goal: requiredString(args, "goal"),
    location: optionalString(args, "location"),
    userConsent: optionalBoolean(args, "userConsent"),
    ...(isRecord(customer)
      ? {
          customer: {
            name: requiredString(customer, "name"),
            email: optionalString(customer, "email"),
            phone: optionalString(customer, "phone")
          }
        }
      : {})
  };
}

function toolDefinitions() {
  return [
    {
      name: "assist",
      title: "Assist",
      description: "Use this when the user asks Pactway to answer or act for a real-world service business from verified records. For booking, ticket, reservation, request, send, verify, resume, cancel, or reschedule intents, prefer the more specific Pactway tools when possible.",
      annotations: writeAnnotations(false),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.status, {
        invoking: "Checking verified Pactway records",
        invoked: "Verified records checked"
      }),
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string" },
          location: { type: "string" },
          userConsent: { type: "boolean" },
          customer: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" }
            },
            required: ["name"],
            additionalProperties: false
          }
        },
        required: ["goal"],
        additionalProperties: false
      }
    },
    {
      name: "find_services",
      title: "Find services",
      description: "Use this when the user is looking for a service business or wants to find which verified Pactway businesses can offer a service before booking, requesting, or checking availability.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          text: { type: "string" },
          radiusKm: { type: "number", default: 25 }
        },
        required: ["service"],
        additionalProperties: false
      }
    },
    {
      name: "get_business_info",
      title: "Get business info",
      description: "Use this when the user asks what Pactway knows about a specific business, including owner-verified facts, services, contact paths, and capability tier.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          businessId: { type: "string" }
        },
        required: ["businessId"],
        additionalProperties: false
      }
    },
    {
      name: "get_business_feed",
      title: "Get business feed",
      description: "Use this when ChatGPT needs the agent-ready feed for a known business before deciding whether to answer, book, request, manage, compare, or fall back to browsing.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          mode: { type: "string", enum: ["compact", "full"], default: "compact" },
          intent: { type: "string", enum: ["answer", "book", "manage", "compare"] },
          ifBusinessVersion: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" }
        },
        required: ["businessId"],
        additionalProperties: false
      }
    },
    {
      name: "get_readiness_report",
      title: "Get readiness report",
      description: "Use this when the business owner or operator asks whether a business is Pactway Ready, what actions agents can honestly take, or which setup gaps block answer/request/confirm/manage readiness.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          targetTier: { type: "string", enum: [...readinessTiers] },
          profileReviewed: { type: "boolean", default: true },
          protocolInputs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: [...readinessProtocolKinds] },
                status: { type: "string", enum: [...readinessProtocolStatuses] },
                purpose: { type: "string" },
                ref: { type: "string" }
              },
              required: ["kind", "status"],
              additionalProperties: false
            }
          },
          allowLocalAuthorityForConfirm: { type: "boolean", default: false }
        },
        required: ["businessId"],
        additionalProperties: false
      }
    },
    {
      name: "compile_action_intent",
      title: "Compile action intent",
      description: "Use this first when the user wants to create, book, request, send, cancel, reschedule, or manage a real-world service ticket/reservation and the action needs exact approval before execution.",
      annotations: writeAnnotations(false),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.approval, {
        invoking: "Preparing approval details",
        invoked: "Approval details ready",
        widgetAccessible: true
      }),
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string" },
          location: { type: "string" },
          lifespanMs: { type: "number", default: 300000 },
          intentId: { type: "string" },
          agentSessionId: { type: "string" },
          slotStart: { type: "string" },
          agentName: { type: "string" },
          resultDelivery: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["inbox", "webhook"] },
              target: { type: "string" }
            },
            required: ["channel", "target"],
            additionalProperties: false
          }
        },
        required: ["goal"],
        additionalProperties: false
      }
    },
    {
      name: "get_action_intent_lifecycle",
      title: "Get action intent lifecycle",
      description: "Use this when resuming a previously compiled Pactway action intent by intentId, including pending required inputs, approval state, execution state, or terminal delivery state.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          intentId: { type: "string" }
        },
        required: ["intentId"],
        additionalProperties: false
      }
    },
    {
      name: "poll_action_intent_lifecycles",
      title: "Poll action intent lifecycles",
      description: "Use this when a ChatGPT App host needs to watch pending Pactway action-intent changes for the current session instead of asking the user to repeat the request.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          after: { type: "integer", minimum: 0 },
          agentSessionId: { type: "string" },
          intentId: { type: "string" },
          limit: { type: "integer", minimum: 1 },
          waitMs: { type: "integer", minimum: 0 }
        },
        additionalProperties: false
      }
    },
    {
      name: "list_action_intent_result_deliveries",
      title: "List action intent result deliveries",
      description: "Use this when restoring terminal Pactway action results that were delivered while the user was away from the ChatGPT session.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          after: { type: "integer", minimum: 0 },
          agentSessionId: { type: "string" },
          intentId: { type: "string" },
          status: { type: "string", enum: ["delivered", "failed", "acknowledged"] },
          limit: { type: "integer", minimum: 1 }
        },
        additionalProperties: false
      }
    },
    {
      name: "get_action_intent_result_delivery",
      title: "Get action intent result delivery",
      description: "Use this to read one terminal Pactway action result delivery by deliveryId before showing a receipt or failure to the user.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          deliveryId: { type: "string" }
        },
        required: ["deliveryId"],
        additionalProperties: false
      }
    },
    {
      name: "ack_action_intent_result_delivery",
      title: "Acknowledge action intent result delivery",
      description: "Use this after the ChatGPT App host has consumed a terminal Pactway result delivery and no longer needs it listed as new.",
      annotations: writeAnnotations(false),
      inputSchema: {
        type: "object",
        properties: {
          deliveryId: { type: "string" }
        },
        required: ["deliveryId"],
        additionalProperties: false
      }
    },
    {
      name: "check_availability",
      title: "Check availability",
      description: "Use this before asking for approval when the user wants to book or request a real-world service time and Pactway has a candidate business/service.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          businessId: { type: "string" },
          serviceId: { type: "string" },
          bindingId: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          partySize: { type: "integer" }
        },
        required: ["businessId", "serviceId"],
        additionalProperties: false
      }
    },
    {
      name: "book_service",
      title: "Book service",
      description: "Use this only after compile_action_intent returns a ready approval package and the user approves the exact service ticket/reservation action. Returns confirmed, request, handoff, failed, or rejected without overstating the backend outcome.",
      annotations: writeAnnotations(false),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.receipt, {
        invoking: "Sending the approved request",
        invoked: "Approved request completed"
      }),
      inputSchema: {
        type: "object",
        properties: {
          intentId: { type: "string" },
          approvedActionIntentHash: { type: "string" },
          businessId: { type: "string" },
          serviceId: { type: "string" },
          bindingId: { type: "string" },
          slotStart: { type: "string" },
          customer: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" }
            },
            required: ["name"],
            additionalProperties: false
          },
          notes: { type: "string" },
          requestedType: { type: "string", enum: ["confirmed", "request", "handoff"] },
          userConsent: { type: "boolean" }
        },
        required: ["businessId", "serviceId", "customer"],
        additionalProperties: false
      }
    },
    {
      name: "cancel_service",
      title: "Cancel service",
      description: "Use this only after exact user approval to cancel a real-world service ticket/reservation when Pactway can honestly address the backend or return handoff/failure.",
      annotations: writeAnnotations(true),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.receipt, {
        invoking: "Sending the approved cancellation",
        invoked: "Cancellation result returned"
      }),
      inputSchema: {
        type: "object",
        properties: {
          intentId: { type: "string" },
          approvedActionIntentHash: { type: "string" },
          businessId: { type: "string" },
          serviceId: { type: "string" },
          bindingId: { type: "string" },
          confirmationId: { type: "string" },
          userConsent: { type: "boolean" }
        },
        required: ["businessId", "serviceId", "confirmationId"],
        additionalProperties: false
      }
    },
    {
      name: "reschedule_service",
      title: "Reschedule service",
      description: "Use this only after exact user approval to reschedule a real-world service ticket/reservation when Pactway can honestly address the backend or return handoff/failure.",
      annotations: writeAnnotations(false),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.receipt, {
        invoking: "Sending the approved reschedule",
        invoked: "Reschedule result returned"
      }),
      inputSchema: {
        type: "object",
        properties: {
          intentId: { type: "string" },
          approvedActionIntentHash: { type: "string" },
          businessId: { type: "string" },
          serviceId: { type: "string" },
          bindingId: { type: "string" },
          confirmationId: { type: "string" },
          newSlotStart: { type: "string" },
          userConsent: { type: "boolean" }
        },
        required: ["businessId", "serviceId", "confirmationId", "newSlotStart"],
        additionalProperties: false
      }
    },
    {
      name: "locate_agentport_wallet",
      title: "Locate Pactway wallet",
      description: "Use this first when the user asks about their Pactway wallet, tickets, requests, receipts, pending business responses, or returned-session status. Pass the user's exact ticket phrase as userClaim when available. It restores model-safe ticket and request summaries without raw ticket evidence or approval hashes.",
      annotations: readOnlyAnnotations(),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.resume, {
        invoking: "Restoring Pactway wallet",
        invoked: "Pactway wallet restored"
      }),
      inputSchema: {
        type: "object",
        properties: {
          walletRef: {
            type: "string",
            description: "Trusted wallet or host-session reference when available. Do not invent it."
          },
          holderRef: {
            type: "string",
            description: "Trusted holder reference when available. Do not invent it."
          },
          userClaim: {
            type: "string",
            description: "The user's exact wording for the ticket or reservation they claim, such as 'my salon ticket'. Pass it through so Pactway can classify exact, possible, vague, or mismatched ticket identity before routing proof."
          },
          agentSessionId: {
            type: "string",
            description: "Trusted agent session id when available. Do not invent it."
          },
          intentId: {
            type: "string",
            description: "Known Pactway action intent id for narrowing returned request lifecycle items."
          },
          includeTickets: { type: "boolean", default: true },
          includeRequests: { type: "boolean", default: true },
          limit: { type: "integer", minimum: 1 }
        },
        additionalProperties: false
      }
    },
    {
      name: "locate_wallet_tickets",
      title: "Locate wallet tickets",
      description: "Use this as a ticket-specific fallback after locate_agentport_wallet when the user asks about an existing, previous, returned-session, wallet, ticket, booking, reservation, receipt, or status. Pass the user's exact ticket phrase as userClaim when available before asking for a raw ticket code.",
      annotations: readOnlyAnnotations(),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.resume, {
        invoking: "Looking for resumable Pactway context",
        invoked: "Resumable context checked"
      }),
      inputSchema: {
        type: "object",
        properties: {
          walletRef: {
            type: "string",
            description: "Trusted wallet or host-session reference when available. Do not invent it."
          },
          walletTicketId: {
            type: "string",
            description: "Specific located wallet ticket id for a follow-up evidence lookup."
          },
          holderRef: {
            type: "string",
            description: "Trusted holder reference when available. Do not invent it."
          },
          userClaim: {
            type: "string",
            description: "The user's exact wording for the ticket or reservation they claim, such as 'my salon ticket'. Pass it through so Pactway can classify exact, possible, vague, or mismatched ticket identity before routing proof."
          },
          includeEvidence: {
            type: "boolean",
            description: "Do not set this for the first status check. Set true only for follow-up status/action calls after a ticket is located."
          },
          limit: { type: "integer", minimum: 1 }
        },
        additionalProperties: false
      }
    },
    {
      name: "resolve_ticket",
      title: "Resolve ticket",
      description: "Use this when locate_wallet_tickets cannot restore context and the user provides a ticket, booking, reservation, or receipt code that must be resolved before status or allowed actions.",
      annotations: readOnlyAnnotations(),
      inputSchema: {
        type: "object",
        properties: {
          ticketRef: { type: "string" },
          holderRef: {
            type: "string",
            description: "Holder verification value when the registry requires proof. Do not invent it."
          }
        },
        required: ["ticketRef"],
        additionalProperties: false
      }
    },
    {
      name: "verify_ticket",
      title: "Verify ticket",
      description: "Use this to verify Pactway Commitment or receipt evidence before presenting a ticket/reservation as trustworthy. This does not call or mutate a business backend.",
      annotations: readOnlyAnnotations(),
      inputSchema: ticketEvidenceInputSchema()
    },
    {
      name: "get_ticket_status",
      title: "Get ticket status",
      description: "Use this when the user asks what happened, whether a ticket/reservation is active, sent, pending, cancelled, or otherwise current after Pactway evidence is available.",
      annotations: readOnlyAnnotations(),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.status, {
        invoking: "Verifying current status",
        invoked: "Current status verified"
      }),
      inputSchema: ticketEvidenceInputSchema()
    },
    {
      name: "get_allowed_ticket_actions",
      title: "Get allowed ticket actions",
      description: "Use this after ticket verification/status when the user asks what they can do next with a ticket/reservation, such as send, verify, cancel, reschedule, or hand off.",
      annotations: readOnlyAnnotations(),
      inputSchema: ticketEvidenceInputSchema()
    },
    {
      name: "prepare_ticket_send",
      title: "Prepare ticket send",
      description: "Use this before asking for approval when the user wants to send or route existing ticket/reservation proof. It returns the exact approval package with intentId and approvedActionIntentHash for send_ticket.",
      annotations: writeAnnotations(false),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.approval, {
        invoking: "Preparing ticket approval",
        invoked: "Ticket approval ready",
        widgetAccessible: true
      }),
      inputSchema: prepareTicketSendInputSchema()
    },
    {
      name: "send_ticket",
      title: "Send ticket",
      description: "Use this only after prepare_ticket_send returns an approval package and the user approves that exact ticket/reservation delivery. Carry intentId, approvedActionIntentHash, userConsent, and consentStatement. It never mutates a business backend.",
      annotations: writeAnnotations(false),
      _meta: chatGptAppToolMeta(chatGptAppComponentUris.receipt, {
        invoking: "Routing approved proof",
        invoked: "Proof routing result returned"
      }),
      inputSchema: {
        type: "object",
        properties: {
          commitment: { type: "object", additionalProperties: true },
          receipt: { type: "object", additionalProperties: true },
          holderRef: { type: "string" },
          destination: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["business_inbox", "issuer_queue", "venue_verifier", "support_channel", "webhook"]
              },
              target: { type: "string" },
              label: { type: "string" }
            },
            required: ["kind", "target"],
            additionalProperties: false
          },
          userConsent: { type: "boolean" },
          intentId: {
            type: "string",
            description: "Approval package intentId when the host prepared this ticket delivery before execution."
          },
          approvedActionIntentHash: {
            type: "string",
            description: "Hash from the approval package shown to the user before ticket delivery."
          },
          consentStatement: {
            type: "string",
            description: "User-facing approval summary binding the exact ticket delivery and Backend changed: no."
          },
          requestedBy: { type: "string" }
        },
        required: ["commitment", "destination"],
        additionalProperties: false
      }
    }
  ];
}

function prepareTicketSendInputSchema() {
  return {
    type: "object",
    properties: {
      commitment: { type: "object", additionalProperties: true },
      receipt: { type: "object", additionalProperties: true },
      holderRef: { type: "string" },
      destination: ticketDestinationInputSchema(),
      intentId: { type: "string" },
      agentSessionId: { type: "string" },
      lifespanMs: { type: "number", default: 300000 },
      requestedBy: { type: "string" }
    },
    required: ["commitment", "destination"],
    additionalProperties: false
  };
}

function ticketEvidenceInputSchema() {
  return {
    type: "object",
    properties: {
      commitment: { type: "object", additionalProperties: true },
      receipt: { type: "object", additionalProperties: true },
      holderRef: { type: "string" }
    },
    required: ["commitment"],
    additionalProperties: false
  };
}

function ticketDestinationInputSchema() {
  return {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["business_inbox", "issuer_queue", "venue_verifier", "support_channel", "webhook"]
      },
      target: { type: "string" },
      label: { type: "string" }
    },
    required: ["kind", "target"],
    additionalProperties: false
  };
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
}

function writeAnnotations(destructiveHint: boolean) {
  return {
    readOnlyHint: false,
    destructiveHint,
    idempotentHint: false,
    openWorldHint: false
  };
}

function resourceDefinitions(runtime: AgentPortRuntime) {
  const resources = [
    {
      uri: runtimeResourceUri,
      name: "agentport-runtime",
      title: "Pactway runtime",
      description: "Registered adapters and tools for this Pactway server.",
      mimeType: "application/json"
    },
    {
      uri: openStandardResourceUri,
      name: "agentport-open-standard",
      title: "Pactway open standard",
      description: "Open v0.1 gateway standard for public reads, verified representation, capability honesty, and consent-gated actions.",
      mimeType: "application/json"
    },
    {
      uri: actionModelResourceUri,
      name: "agentport-action-model",
      title: "Pactway action model",
      description: "Machine-readable action layers, approval rules, and receipt semantics for general client agents.",
      mimeType: "application/json"
    },
    {
      uri: commitmentFormatResourceUri,
      name: "agentport-commitment-format",
      title: "Pactway commitment format",
      description: "Machine-readable ticket/reservation commitment format for backend-backed agent actions.",
      mimeType: "application/json"
    },
    {
      uri: pluginWalletContractResourceUri,
      name: "agentport-plugin-wallet",
      title: "Pactway plugin wallet",
      description: "Encrypted local wallet contract for frontier-side Pactway plugins that keep ticket context beyond one agent session.",
      mimeType: "application/json"
    },
    {
      uri: clientUsePolicyResourceUri,
      name: "agentport-client-use-policy",
      title: "Pactway client use policy",
      description: "Machine-readable source preference and browsing fallback policy for client agents.",
      mimeType: "application/json"
    },
    {
      uri: discoveryResourceUri,
      name: "agentport-discovery",
      title: "Pactway discovery descriptor",
      description: "Machine-readable well-known descriptor for routing browsing agents to Pactway.",
      mimeType: "application/json"
    },
    {
      uri: protocolCodesResourceUri,
      name: "agentport-protocol-codes",
      title: "Pactway protocol codes",
      description: "Compact stable code registry for protocol, runtime, and presentation artifacts.",
      mimeType: "application/json"
    }
  ];
  if (runtime.receipts?.trustProfile) {
    resources.push({
      uri: gatewayTrustProfileResourceUri,
      name: "agentport-gateway-trust-profile",
      title: "Pactway gateway trust profile",
      description: "Public receipt verification keys for this Pactway gateway.",
      mimeType: "application/json"
    });
  }
  if (runtime.deliveryTrust) {
    resources.push({
      uri: actionIntentResultDeliveryTrustProfileResourceUri,
      name: "agentport-intent-result-delivery-trust-profile",
      title: "Pactway intent result delivery trust profile",
      description: "Public verification keys for signed terminal intent result deliveries.",
      mimeType: "application/json"
    });
  }
  return [
    ...resources,
    ...chatGptAppComponentResources.map((resource) => ({
      uri: resource.uri,
      name: `agentport-chatgpt-app-${resource.name}`,
      title: resource.title,
      description: resource.description,
      mimeType: resource.mimeType
    }))
  ];
}

function readResource(runtime: AgentPortRuntime, params: unknown, serverInfo: { mcpPath: string }, context: IncomingRequest) {
  if (!isRecord(params) || typeof params.uri !== "string") {
    throw new RpcInputError("resources/read requires params.uri");
  }

  const appComponent = chatGptAppComponentResourceForUri(params.uri);
  if (appComponent) {
    return htmlResource(appComponent.uri, createChatGptAppComponentHtml(appComponent.name), appComponent.description, requestOriginFromHeaders(context.headers));
  }

  switch (params.uri) {
    case runtimeResourceUri:
      return jsonResource(runtimeResourceUri, {
        adapters: [...runtime.adapters.keys()],
        tools: toolDefinitions().map((tool) => tool.name)
      });
    case actionModelResourceUri:
      return jsonResource(actionModelResourceUri, createAgentPortActionModel());
    case commitmentFormatResourceUri:
      return jsonResource(commitmentFormatResourceUri, createAgentPortCommitmentFormat());
    case pluginWalletContractResourceUri:
      return jsonResource(pluginWalletContractResourceUri, createAgentPortPluginWalletContract());
    case clientUsePolicyResourceUri:
      return jsonResource(clientUsePolicyResourceUri, createAgentPortClientUsePolicy());
    case discoveryResourceUri:
      return jsonResource(discoveryResourceUri, createAgentPortDiscoveryDescriptor({ mcpPath: serverInfo.mcpPath }));
    case openStandardResourceUri:
      return jsonResource(openStandardResourceUri, createAgentPortOpenStandard());
    case protocolCodesResourceUri:
      return jsonResource(protocolCodesResourceUri, createAgentPortProtocolCodes());
    case gatewayTrustProfileResourceUri:
      if (!runtime.receipts?.trustProfile) {
        throw new RpcInputError(`unknown_resource:${params.uri}`);
      }
      return jsonResource(gatewayTrustProfileResourceUri, runtime.receipts.trustProfile);
    case actionIntentResultDeliveryTrustProfileResourceUri:
      if (!runtime.deliveryTrust) {
        throw new RpcInputError(`unknown_resource:${params.uri}`);
      }
      return jsonResource(actionIntentResultDeliveryTrustProfileResourceUri, runtime.deliveryTrust);
    default:
      throw new RpcInputError(`unknown_resource:${params.uri}`);
  }
}

function jsonResource(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function htmlResource(uri: string, html: string, description: string, origin: string) {
  return {
    contents: [
      {
        uri,
        mimeType: chatGptAppComponentMimeType,
        text: html,
        _meta: {
          ui: {
            prefersBorder: true,
            csp: {
              connect_domains: [origin],
              resource_domains: [origin]
            }
          },
          "openai/widgetDescription": description,
          "openai/widgetPrefersBorder": true,
          "openai/widgetCSP": {
            connect_domains: [origin],
            resource_domains: [origin]
          }
        }
      }
    ]
  };
}

function chatGptAppToolMeta(
  resourceUri: string,
  options: { invoking: string; invoked: string; widgetAccessible?: boolean }
) {
  const securitySchemes = [
    {
      type: "noauth"
    }
  ];
  return {
    securitySchemes,
    ui: {
      resourceUri,
      visibility: options.widgetAccessible === true ? ["model", "app"] : ["model"]
    },
    "openai/outputTemplate": resourceUri,
    "openai/widgetAccessible": options.widgetAccessible === true,
    "openai/toolInvocation/invoking": options.invoking,
    "openai/toolInvocation/invoked": options.invoked
  };
}

function requestPathname(req: IncomingMessage) {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}

function requestOrigin(req: IncomingMessage) {
  return requestOriginFromHeaders(req.headers);
}

function requestOriginFromHeaders(headers: IncomingRequest["headers"]) {
  const forwardedHost = firstHeaderValue(headers["x-forwarded-host"]);
  const host = forwardedHost ?? firstHeaderValue(headers.host);
  const forwardedProto = firstHeaderValue(headers["x-forwarded-proto"]);
  const proto = forwardedProto ?? "http";
  if (!host || /\s/.test(host) || /\s/.test(proto)) {
    return "https://gateway.example.com";
  }
  return `${proto}://${host}`;
}

function firstHeaderValue(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim();
}

function contextAgentSessionId(context: IncomingRequest): string | undefined {
  return firstHeaderValue(context.headers["x-agentport-agent-session-id"]);
}

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: value
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) {
    throw new Error("empty request body");
  }

  return JSON.parse(body) as unknown;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "mcp-protocol-version": protocolVersion
  });
  res.end(JSON.stringify(body));
}

function respond(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

class RpcInputError extends Error {
  readonly code = -32602;

  constructor(message: string, readonly data?: unknown) {
    super(message);
  }
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RpcInputError(`${key} must be a non-empty string`);
  }

  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RpcInputError(`${key} must be a string`);
  }

  return value;
}

function optionalEnum<T extends readonly string[]>(
  args: Record<string, unknown>,
  key: string,
  allowed: T,
  message: string
): T[number] | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  return enumValue(args, key, allowed, message);
}

function enumValue<T extends readonly string[]>(
  args: Record<string, unknown>,
  key: string,
  allowed: T,
  message: string
): T[number] {
  const value = args[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new RpcInputError(message);
  }

  return value;
}

function requiredRecord(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (!isRecord(value)) {
    throw new RpcInputError(`${key} must be an object`);
  }

  return value;
}

function optionalRecord(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new RpcInputError(`${key} must be an object`);
  }

  return value;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new RpcInputError(`${key} must be a boolean`);
  }

  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RpcInputError(`${key} must be a finite number`);
  }

  return value;
}

function optionalPositiveNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = optionalNumber(args, key);
  if (value !== undefined && value <= 0) {
    throw new RpcInputError(`${key} must be positive`);
  }

  return value;
}

function optionalPositiveInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = optionalNumber(args, key);
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new RpcInputError(`${key} must be a positive integer`);
  }

  return value;
}

function optionalNonNegativeInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = optionalNumber(args, key);
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new RpcInputError(`${key} must be a non-negative integer`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
