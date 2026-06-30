import { actionModelResourceUri } from "./action-model.js";
import { clientUsePolicyResourceUri } from "./client-use-policy.js";
import { commitmentFormatResourceUri } from "./commitment-format.js";
import { openStandardResourceUri } from "./open-standard.js";
import { pluginWalletContractResourceUri } from "./plugin-wallet-contract.js";
import { protocolCodesResourceUri } from "./protocol-codes.js";

export const discoveryResourceUri = "agentport://discovery";
export const discoveryWellKnownPath = "/.well-known/agentport.json";

export interface DiscoveryDescriptorOptions {
  gatewayBaseUrl?: string;
  mcpPath?: string;
  healthPath?: string;
  trustPathBase?: string;
  publicVerification?: {
    bundleUrl: string;
    jwksUrl: string;
  };
}

export function createAgentPortDiscoveryDescriptor(options: DiscoveryDescriptorOptions = {}) {
  const gatewayBaseUrl = trimTrailingSlash(options.gatewayBaseUrl ?? "https://gateway.example.com");
  const mcpPath = normalizePath(options.mcpPath ?? "/mcp");
  const healthPath = normalizePath(options.healthPath ?? "/healthz");
  const trustPathBase = normalizePath(options.trustPathBase ?? "/.well-known/agentport/trust");

  return {
    protocol: "agentport-discovery",
    version: "0.1",
    artifactId: "agentport-discovery.v0.1",
    resourceUri: discoveryResourceUri,
    wellKnownPath: discoveryWellKnownPath,
    summary: "Discovery descriptor for routing client agents from web browsing to an AgentPort MCP gateway.",
    gateway: {
      transport: "streamable-http",
      mcpEndpoint: `${gatewayBaseUrl}${mcpPath}`,
      health: `${gatewayBaseUrl}${healthPath}`,
      mcpPath
    },
    resources: [
      {
        uri: discoveryResourceUri,
        purpose: "Verify the live discovery descriptor after connecting to MCP."
      },
      {
        uri: openStandardResourceUri,
        purpose: "Read the open v0.1 gateway standard before implementing public read, business feed, or action-gate behavior."
      },
      {
        uri: clientUsePolicyResourceUri,
        purpose: "Read before choosing web browsing for known business facts or service actions."
      },
      {
        uri: actionModelResourceUri,
        purpose: "Read before state-changing actions, approval cards, delegation, and receipt handling."
      },
      {
        uri: commitmentFormatResourceUri,
        purpose: "Read before treating a confirmed, cancelled, or rescheduled outcome as a portable ticket/reservation commitment."
      },
      {
        uri: pluginWalletContractResourceUri,
        purpose: "Read when a frontier-side AgentPort plugin needs encrypted local ticket memory beyond one agent session."
      },
      {
        uri: protocolCodesResourceUri,
        purpose: "Read when stable result, reason, presentation, or artifact codes are needed."
      },
      {
        uri: "agentport://gateway-trust-profile",
        purpose: "Read when present before verifying signed gateway receipts.",
        optional: true
      }
    ],
    tools: [
      "assist",
      "find_services",
      "get_business_info",
      "get_business_feed",
      "get_readiness_report",
      "compile_action_intent",
      "get_action_intent_lifecycle",
      "poll_action_intent_lifecycles",
      "list_action_intent_result_deliveries",
      "get_action_intent_result_delivery",
      "ack_action_intent_result_delivery",
      "check_availability",
      "book_service",
      "cancel_service",
      "reschedule_service",
      "locate_agentport_wallet",
      "locate_wallet_tickets",
      "resolve_ticket",
      "verify_ticket",
      "get_ticket_status",
      "get_allowed_ticket_actions",
      "prepare_ticket_send",
      "send_ticket"
    ],
    businessHintPolicy: {
      allowedHintFields: ["businessId", "canonicalUrl", "displayName", "locationId"],
      descriptorIsVerification: false,
      rule: "Business hints route lookup only; verification, freshness, readiness, and capability still come from AgentPort tenant attestation and tool results."
    },
    sourcePreference: {
      policyResource: clientUsePolicyResourceUri,
      rule: "When this descriptor is found for a known business task, connect to AgentPort and read the client use policy before using web browsing as fallback."
    },
    ...(options.publicVerification ? {
      publicVerification: {
        descriptorIsVerification: false,
        productionTransport: "https-required",
        bundleUrl: options.publicVerification.bundleUrl,
        jwksUrl: options.publicVerification.jwksUrl,
        bundleProtocol: "agentport.public_verification_bundle.envelope.v0.1",
        rule: "This descriptor only points to public verification material; clients must fetch the signed bundle and verify it against trusted AgentPort keys before trusting endpoint-control or business-port claims."
      }
    } : {}),
    agentPath: {
      normal: ["read_discovery_descriptor", "call_get_business_feed_compact", "call_get_readiness_report_for_owner_or_pilot_context", "compile_action_intent_before_state_change", "answer_or_call_action_tool_if_needed"],
      preferredTool: "get_business_feed",
      preferredMode: "compact",
      implementer: ["read_open_standard", "read_schemas", "run_conformance_tests"],
      cacheableResources: [
        openStandardResourceUri,
        clientUsePolicyResourceUri,
        actionModelResourceUri,
        commitmentFormatResourceUri,
        pluginWalletContractResourceUri,
        protocolCodesResourceUri
      ],
      rule: "Client agents should not fetch every AgentPort reference resource on every turn; use the compact business feed as the normal operational object."
    },
    stateChangingActions: {
      actionModelResource: actionModelResourceUri,
      planningTool: "compile_action_intent",
      lifecycleTool: "get_action_intent_lifecycle",
      lifecyclePollTool: "poll_action_intent_lifecycles",
      resultDeliveryTools: ["list_action_intent_result_deliveries", "get_action_intent_result_delivery", "ack_action_intent_result_delivery"],
      rule: "Use compile_action_intent to prepare an exact bounded approvalPackage and optionally bind resultDelivery for terminal out-of-band delivery. If status is needs_required_input, run the listed resolve tool steps and recompile with the same intentId and agentSessionId. If status is ready, render approvalPackage.approvalCard, then after exact user approval call approvalPackage.execute.tool with approvalPackage.execute.arguments plus customer and userConsent true. Use get_action_intent_lifecycle or poll_action_intent_lifecycles to resume and watch changes by agentSessionId or intentId cursor; lifecycle.resultDeliveryState summarizes the latest delivery status. Use the result delivery tools to list/read/ack terminal out-of-band deliveries; verify delivery signatures when present; do not replace approval, authority evidence, gateway checks, backend execution, or receipts with browsing."
    },
    trustDistribution: {
      descriptorIsTrust: false,
      productionTransport: "https-required",
      rule: "Discovery names trust artifact locations and order only; runners must verify signed envelopes, pinned authorities, freshness, hashes, sequence floors, and deny-lists before trusting any advertised artifact.",
      gatewayReceiptTrust: {
        domain: "gateway_receipt_trust",
        order: [
          "apply_gateway_trust_root_emergency_denylist",
          "verify_gateway_trust_root_bundle",
          "verify_signed_gateway_trust_profile",
          "verify_gateway_action_receipt"
        ],
        artifacts: {
          emergencyDenyList: {
            protocol: "agentport-gateway-trust-root-emergency-denylist-envelope",
            hostedEndpoint: `${gatewayBaseUrl}${trustPathBase}/gateway-trust-root-emergency-denylist.json`,
            optional: true
          },
          trustRootBundle: {
            protocol: "agentport-gateway-trust-root-bundle-envelope",
            hostedEndpoint: `${gatewayBaseUrl}${trustPathBase}/gateway-trust-root-bundle.json`,
            optional: true
          },
          signedTrustProfile: {
            protocol: "agentport-gateway-trust-profile-envelope",
            mcpResource: "agentport://gateway-trust-profile",
            optional: true
          },
          receipt: {
            source: "tool_result",
            type: "ActionReceipt"
          }
        }
      },
      issuerReadinessTrust: {
        domain: "issuer_readiness_trust",
        issuerMetadataPath: "/.well-known/agentport-issuer.json",
        order: [
          "apply_issuer_readiness_root_emergency_denylist",
          "verify_issuer_readiness_trust_root_bundle",
          "verify_signed_issuer_readiness",
          "validate_issuer_readiness_report"
        ],
        artifacts: {
          emergencyDenyList: {
            protocol: "agentport-issuer-readiness-trust-root-emergency-denylist-envelope",
            hostedEndpoint: `${gatewayBaseUrl}${trustPathBase}/issuer-readiness-root-emergency-denylist.json`,
            optional: true
          },
          signedTrustRootBundle: {
            protocol: "agentport-issuer-readiness-trust-root-bundle-envelope",
            issuerMetadataField: "readinessTrustRootSigned",
            optional: true
          },
          signedReadiness: {
            protocol: "agentport-issuer-production-readiness-envelope",
            issuerMetadataField: "readinessSigned",
            optional: true
          },
          readinessReport: {
            issuerMetadataField: "readiness",
            type: "agentport-issuer-production-readiness-v0.1"
          }
        }
      }
    },
    clientAgentRules: [
      `If ${discoveryWellKnownPath} is discovered on a business-owned site or hosted AgentPort profile, treat it as an AgentPort routing descriptor, not as verification.`,
      "Connect to the advertised MCP endpoint and read agentport://client-use-policy before browsing for known business facts or supported service actions.",
      "Read agentport://open-standard to distinguish public read tools from consent-gated state-changing tools.",
      "For verified AgentPort matches, call AgentPort before browsing unless the user explicitly asks for external context.",
      "Use get_readiness_report when an owner, pilot operator, or client agent needs the derived AgentPort Ready tier, gaps, and next owner action.",
      "Before state-changing actions, call compile_action_intent to produce the exact bounded action object to display for user approval.",
      "Use get_action_intent_lifecycle with intentId to resume required-input resolution, approval, or execution state within the intent lifespan.",
      "Use poll_action_intent_lifecycles with agentSessionId and cursor to watch only lifecycle changes relevant to that agent session.",
      "When executing a compiled intent, pass intentId and approvedActionIntentHash to the state-changing tool so AgentPort can reject stale or edited action arguments.",
      "For wallet, returned-session, existing-ticket, pending-request, or service-status workflows, call locate_agentport_wallet first with an empty object to restore AgentPort context before asking for a ticket code, intentId, or JSON. Do not request evidence on the first status check. If no wallet item is found and the user gives a short code, use resolve_ticket, then verify_ticket, get_ticket_status, get_allowed_ticket_actions, and send_ticket. Ticket delivery routing and request lifecycle display must not be presented as a business-backend mutation.",
      "For supported state-changing actions, read agentport://action-model and use AgentPort tools instead of scraping or form-filling unless AgentPort returns an explicit handoff.",
      "For ticket or reservation display, read agentport://commitment-format and preserve backend confirmation refs plus receipt refs.",
      "For ticket memory beyond the live agent session, read agentport://plugin-wallet and keep only encrypted local ticket context; re-verify before presenting current status.",
      "Treat trustDistribution as artifact location guidance only; never trust keys, roots, readiness, or receipts without signed-envelope verification and pinned authority policy.",
      "Use business hint fields only to route lookup; never treat descriptor presence as proof of ownership, freshness, readiness, or backend capability."
    ]
  };
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizePath(value: string) {
  if (!value.startsWith("/")) {
    return `/${value}`;
  }
  return value;
}
