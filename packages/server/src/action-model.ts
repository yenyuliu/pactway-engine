export const actionModelResourceUri = "agentport://action-model";

export function createAgentPortActionModel() {
  return {
    protocol: "agentport-action-model",
    version: "0.1",
    artifactId: "agentport-action-model.v0.1",
    resourceUri: actionModelResourceUri,
    parties: ["client_user", "client_agent", "business_gateway"],
    targetAgents: ["claude", "chatgpt", "gemini", "custom_mobile_agent", "custom_hosted_agent"],
    summary: "General client agents may request; users approve; the business gateway confirms and signs outcomes.",
    safeCallSequence: [
      "discover",
      "read_business_info",
      "compile_action_intent_for_exact_user_goal",
      "check_availability",
      "use_intent_approval_package",
      "render_user_approval_card_for_state_change",
      "request_user_approval_for_exact_action",
      "call_state_changing_tool_with_consent_and_delegation_when_required",
      "deliver_terminal_result_when_requested",
      "poll_intent_lifecycle_until_terminal_or_blocked",
      "verify_gateway_receipt_when_present",
      "report_exact_outcome_without_upgrading_it"
    ],
    approvalCard: {
      purpose: "Render this before a mobile or chat agent performs a state-changing action.",
      requiredDisplayFields: [
        "agent_name",
        "action",
        "business_name",
        "service_name",
        "requested_time_or_slot",
        "customer_fields_to_share",
        "result_type_requested",
        "delegation_expiry_when_available"
      ],
      consentTemplate: [
        "I understand this agent represents me for this action.",
        "I approve this exact action with this business.",
        "I approve sharing only the required customer details."
      ],
      clientAgentRule: "The client agent must collect approval from the user; it must not self-assert userConsent."
    },
    delegation: {
      proof: "DelegationProof",
      suppliedBy: "Authority evidence is supplied by AuthProvider or hosted issuer/provider, not tool arguments.",
      normalizedAuthority: {
        type: "AuthorityContext",
        evidenceKinds: [
          "agentport-local-delegation",
          "ap2-mandate",
          "ucp-http-signature",
          "acp-checkout"
        ],
        assuranceLevels: ["none", "signed", "verified-mandate"],
        localProfile: "The existing compact-JWS DelegationProof + token confirmation path is the AgentPort Local Profile for dev/test/demos and compatibility."
      },
      tokenConfirmationMethods: ["session", "dpop", "mtls", "wallet"],
      issuerEndpoints: {
        metadata: "/.well-known/agentport-issuer.json",
        jwks: "/jwks.json",
        createRequest: "/delegation/request",
        passkeyRegistrationChallenge: "/passkey/registration/challenge",
        passkeyRegistrationComplete: "/passkey/registration/complete",
        passkeyCredentials: "/passkey/credentials",
        passkeyCredentialRevoke: "/passkey/credentials/{credentialId}/revoke",
        approvalPage: "/approve/{requestId}",
        approveRequest: "/delegation/request/{requestId}/approve",
        status: "/delegation/status/{id}",
        revoke: "/delegation/revoke"
      },
      currentEngineBoundary: "The open engine normalizes local DelegationProof evidence into AuthorityContext and keeps profile interfaces for external authority evidence; the reference DelegationIssuer web/API service remains the AgentPort Local Profile with approval authorization hooks, passkey registration challenge/enrollment references, user-bound passkey credential list/revoke references, passkey assurance labels, token-protection policy, compact-JWS-shaped tokens, JWKS-compatible public keys, DPoP binding, trusted issuer/JWKS discovery, HTTP issuer-status verification, replay-store interfaces, and local file/memory/audit stores. Live AP2/UCP/ACP trust anchors, production WebAuthn ceremony, auth, CSRF/session protection, KMS/HSM services, managed revocation, retention, and multi-region replay remain hosted or provider concerns."
    },
    receipt: {
      type: "ActionReceipt",
      issuer: "business_gateway",
      rule: "The client agent never mints the business confirmation.",
      authorityBinding: "Receipts carry compact authority evidence refs and assurance, never raw proof tokens.",
      trustProfileResource: "agentport://gateway-trust-profile",
      verificationHint: "When present, verify issuer/key/signature against the gateway trust profile before treating the receipt as externally portable proof.",
      currentEngineBoundary: "The engine can compute payloadHash, strip adapter receipts, and call an injected signer; runner helpers can verify EdDSA receipt signatures against injected gateway keys. Public receipt-signature discovery, trust registries, rotation, and conformance vectors remain hosted/protocol-depth work."
    },
    actions: [
      {
        tool: "find_services",
        layer: "read",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Discover candidate verified services."
      },
      {
        tool: "get_business_info",
        layer: "read",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Read verified business profile fields and service tags."
      },
      {
        tool: "check_availability",
        layer: "availability",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Check truthful availability before asking the user to approve a commitment."
      },
      {
        tool: "compile_action_intent",
        layer: "planning",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Turn the user's goal into an exact bounded action object and first-class approvalPackage; optionally bind resultDelivery for terminal out-of-band delivery. Execution still requires rendering approvalCard, user consent, and the state-changing tool."
      },
      {
        tool: "get_action_intent_lifecycle",
        layer: "planning",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Resume a saved action-intent lifecycle by intentId to continue required-input resolution, approval, or execution within its lifespan."
      },
      {
        tool: "poll_action_intent_lifecycles",
        layer: "planning",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Efficiently watch lifecycle changes after a cursor, filtered by agentSessionId or intentId, without scanning all saved intent state."
      },
      {
        tool: "list_action_intent_result_deliveries",
        layer: "planning",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "List terminal intent result deliveries after a cursor, scoped by agentSessionId or intentId."
      },
      {
        tool: "get_action_intent_result_delivery",
        layer: "planning",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Read a terminal intent result delivery by deliveryId."
      },
      {
        tool: "ack_action_intent_result_delivery",
        layer: "planning",
        stateChanging: false,
        consentRequired: false,
        expectedUse: "Acknowledge that a host consumed a terminal intent result delivery."
      },
      {
        tool: "book_service",
        layer: "lead",
        when: "requestedType is request or handoff",
        stateChanging: true,
        consentRequired: true,
        approvalCardRequired: true,
        expectedUse: "Send a lead or handoff request without claiming backend confirmation."
      },
      {
        tool: "book_service",
        layer: "commit",
        when: "requestedType is confirmed or omitted",
        stateChanging: true,
        consentRequired: true,
        approvalCardRequired: true,
        expectedUse: "Create a real booking only when the addressed adapter can honestly confirm."
      },
      {
        tool: "cancel_service",
        layer: "manage",
        stateChanging: true,
        consentRequired: true,
        approvalCardRequired: true,
        expectedUse: "Cancel through the business backend when supported; otherwise return handoff."
      },
      {
        tool: "reschedule_service",
        layer: "manage",
        stateChanging: true,
        consentRequired: true,
        approvalCardRequired: true,
        expectedUse: "Reschedule through the business backend when supported; otherwise return handoff."
      }
    ],
    clientAgentRules: [
      "Do not claim a business is verified unless the returned verification status is verified.",
      "Do not treat request or handoff results as confirmed outcomes.",
      "Do not upgrade a lower-risk lead action into a confirmed commitment.",
      "Do not set userConsent true without a user approval event for the exact action.",
      "When compile_action_intent returns approvalPackage.status needs_required_input, resolve the listed inputs and recompile with the same intentId and agentSessionId before asking for approval.",
      "When compile_action_intent returns approvalPackage.status ready, render approvalPackage.approvalCard, then call approvalPackage.execute.tool with approvalPackage.execute.arguments plus customer and userConsent true after approval.",
      "When a compiled intent lifecycle is used, pass intentId and approvedActionIntentHash to the state-changing tool so the gateway can reject stale or edited actions.",
      "If resultDelivery was bound during compile_action_intent, expect the gateway to deliver only the terminal lifecycle result through its configured provider sink; do not pass a new delivery target during state-changing execution.",
      "When configured, delivery signatures bind the delivery payload hash and idempotency key; verify them before treating a closed-session webhook payload as portable proof.",
      "Use lifecycle.resultDeliveryState for the latest delivery summary, and use the result-delivery tools for full inbox records and acknowledgement.",
      "Poll approvalPackage.lifecycle.poll or read approvalPackage.lifecycle.read to resume and report lifecycle progress within the intent lifespan.",
      "Do not mint authority evidence; carry user-approved evidence from the issuer/provider. The local issuer flow is only the AgentPort Local Profile.",
      "Do not mint, alter, or trust client-supplied ActionReceipt data.",
      "Report failed and rejected outcomes exactly with their machine-readable reasons."
    ]
  };
}
