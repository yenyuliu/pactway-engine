export const openStandardResourceUri = "agentport://open-standard";

export function createAgentPortOpenStandard() {
  return {
    protocol: "agentport-open-standard",
    version: "0.1",
    artifactId: "agentport-open-standard.v0.1",
    resourceUri: openStandardResourceUri,
    license: "Apache-2.0",
    summary: "Minimal open gateway standard for truthful service-business representation and safe agent actions.",
    scope: {
      includes: [
        "discovery",
        "public_read",
        "business_feed",
        "capability_honesty",
        "verification_status",
        "consent_gating",
        "authority_evidence_checkpoint",
        "backend_outcome_binding",
        "receipt_semantics",
        "commitment_format"
      ],
      excludes: [
        "payment_network",
        "checkout_protocol",
        "delegation_token_issuer",
        "rankings",
        "ads",
        "hosted_registry",
        "credential_vault_implementation"
      ]
    },
    resources: [
      { uri: "agentport://open-standard", required: true },
      { uri: "agentport://runtime", required: true },
      { uri: "agentport://discovery", required: true },
      { uri: "agentport://client-use-policy", required: true },
      { uri: "agentport://action-model", required: true },
      { uri: "agentport://commitment-format", required: true },
      { uri: "agentport://protocol-codes", required: true }
    ],
    toolClasses: {
      publicRead: {
        tools: ["find_services", "get_business_info", "get_business_feed", "get_readiness_report"],
        defaultAuth: "anonymous_or_public_find_scope",
        rule: "Public read must not be blocked merely because the caller lacks action authority."
      },
      operationalRead: {
        tools: ["compile_action_intent", "get_action_intent_lifecycle", "poll_action_intent_lifecycles", "list_action_intent_result_deliveries", "get_action_intent_result_delivery", "ack_action_intent_result_delivery", "check_availability"],
        defaultAuth: "public_or_policy_gated",
        rule: "Intent compilation, lifecycle reads/polls, result delivery inbox reads/acks, and availability are not state-changing backend actions, but gateways may rate-limit or policy-gate them. Compiled intent is only an approval/action bound; it does not execute the action."
      },
      stateChanging: {
        tools: ["book_service", "cancel_service", "reschedule_service"],
        defaultAuth: "explicit_user_consent_and_policy_authority",
        rule: "State-changing tools require explicit user consent and must pass configured authority policy before backend execution."
      }
    },
    efficientPath: {
      normal: ["discover_gateway", "call_get_business_feed_compact", "answer_or_call_action_tool_if_needed"],
      beforeStateChange: ["compile_action_intent", "get_action_intent_lifecycle_or_poll_when_resuming", "render_exact_user_approval", "call_state_changing_tool_with_intentId_and_approvedActionIntentHash", "list_or_ack_result_delivery_when_needed"],
      defaultBusinessFeedMode: "compact",
      fullBusinessFeedMode: "full",
      businessFeedIntents: ["answer", "book", "manage", "compare"],
      businessFeedResponseFields: ["representative", "citations", "actionFeed", "nextActions", "cannotDo", "cache"],
      businessFeedCacheMemory: {
        conditionalInput: "ifBusinessVersion",
        versionField: "businessVersion",
        matchResult: "notModified",
        cacheScope: ["businessId", "mode", "intent", "businessVersion"],
        store: ["business_truth_refs", "verification_status", "capability_state", "cache_key"],
        neverStore: ["raw_authority_tokens", "credentials", "payment_credentials", "model_reasoning", "transcripts", "broad_user_preferences"]
      },
      cacheableResources: [
        "agentport://open-standard",
        "agentport://client-use-policy",
        "agentport://action-model",
        "agentport://commitment-format",
        "agentport://protocol-codes"
      ],
      rule: "The standard is the implementer contract; the compact, intent-scoped business feed is the normal client-agent runtime object."
    },
    requiredSemantics: [
      "verified_is_earned_not_self_asserted",
      "stale_and_unverified_are_visible_limits",
      "adapters_cannot_override_gateway_trust",
      "capability_tier_is_derived_from_adapter_capabilities",
      "confirmed_results_require_confirm_capability_and_real_backend_outcome",
      "portable_commitments_require_backend_confirmation_refs_and_gateway_receipt_refs",
      "missing_consent_rejects_state_changing_actions",
      "unsupported_capability_returns_rejection_or_handoff",
      "no_verified_match_refuses_grounded_answer_instead_of_guessing",
      "agentport_fronts_existing_backend_and_never_becomes_system_of_record",
      "routing_is_merit_based_not_pay_for_placement"
    ],
    capabilityDegradation: ["confirm", "request", "inform", "handoff"],
    verificationStatuses: ["verified", "stale", "unverified"],
    actionFlow: [
      "discover_gateway",
      "read_open_standard",
      "public_read_business_feed",
      "compile_bounded_action_intent",
      "request_explicit_user_consent",
      "validate_authority_policy",
      "resolve_business_service_binding",
      "check_adapter_capability",
      "execute_existing_backend",
      "return_result_or_receipt",
      "audit_outcome"
    ],
    conformance: {
      mustExposeResource: openStandardResourceUri,
      mustExposePublicReadTools: ["find_services", "get_business_info", "get_business_feed"],
      mustConsentGateStateChangingTools: ["book_service", "cancel_service", "reschedule_service"],
      mustReturnStructuredNotFound: true,
      mustNotFabricateVerifiedFacts: true,
      mustNotFabricateConfirmedActions: true
    }
  };
}
