export const protocolCodesResourceUri = "agentport://protocol-codes";

export function createAgentPortProtocolCodes() {
  return {
    protocol: "agentport-protocol-codes",
    version: "0.1",
    codeFamilies: {
      verificationStatus: ["verified", "stale", "unverified"],
      tier: ["inform", "handoff", "request", "confirm"],
      actionLayer: ["read", "availability", "lead", "commit", "manage", "funds"],
      authorityAssurance: ["none", "signed", "verified-mandate"],
      commitmentStatus: ["active", "cancelled", "rescheduled", "expired", "released", "failed"],
      commitmentEventType: [
        "created",
        "verified",
        "cancel_requested",
        "cancelled",
        "reschedule_requested",
        "rescheduled",
        "transfer_requested",
        "transferred",
        "expired",
        "recovered",
        "failed"
      ],
      commitmentRight: ["verify", "cancel", "reschedule", "transfer"],
      authorityEvidenceKind: [
        "agentport-local-delegation",
        "ap2-mandate",
        "ucp-http-signature",
        "acp-checkout"
      ],
      resultType: [
        "answered",
        "available",
        "unsupported",
        "request",
        "handoff",
        "confirmed",
        "cancelled",
        "rescheduled",
        "rejected",
        "failed",
        "no_verified_info"
      ],
      reason: {
        lookup: [
          "tenant_not_found",
          "tenant_or_service_not_found",
          "no_verified_info",
          "ambiguous_verified_match"
        ],
        consent: ["consent_required", "requested_type_escalated"],
        capability: [
          "capability_exceeded",
          "adapter_capability_violation",
          "unsupported_capability",
          "backend_no_availability_api",
          "no_integration"
        ],
        backend: [
          "backend_error",
          "adapter_error",
          "lead_delivery_error",
          "slot_unavailable",
          "confirmation_not_found",
          "owner_request"
        ],
        delegation: [
          "delegation_required",
          "delegation_invalid",
          "delegation_scope_missing",
          "delegation_action_not_approved",
          "delegation_business_mismatch",
          "delegation_service_mismatch",
          "delegation_action_intent_mismatch",
          "delegation_audience_mismatch",
          "delegation_untrusted_issuer",
          "delegation_expired",
          "delegation_replay_protection_required",
          "delegation_replay_detected",
          "delegation_verification_failed",
          "delegation_revoked",
          "delegation_assurance_too_low",
          "delegation_token_confirmation_required",
          "delegation_token_confirmation_method_unsupported",
          "delegation_token_confirmation_invalid"
        ],
        intent: [
          "intent_required",
          "intent_lifecycle_store_unavailable",
          "intent_lifecycle_not_found",
          "intent_expired",
          "intent_lifecycle_not_executable",
          "intent_action_hash_required",
          "intent_action_hash_mismatch",
          "intent_action_mismatch"
        ]
      },
      readiness: {
        tier: ["listed", "answer-ready", "request-ready", "confirm-ready", "manage-ready", "pay-ready"],
        protocolInputKind: ["mcp", "a2a", "ucp", "acp", "ap2", "rfc9421", "agentport-local"],
        protocolInputStatus: ["configured", "missing", "unsupported"],
        gap: [
          "profile_review_required",
          "verification_required",
          "verification_stale",
          "lead_channel_missing",
          "backend_not_connected",
          "backend_capability_missing",
          "service_mapping_missing",
          "authority_rail_missing",
          "payment_rail_missing",
          "protocol_profile_missing",
          "protocol_signature_missing",
          "protocol_webhook_missing"
        ],
        nextBestAction: [
          "review_profile",
          "verify_business",
          "configure_request_channel",
          "connect_backend",
          "configure_authority_rail",
          "configure_payment_rail",
          "ready"
        ]
      },
      presentation: {
        step: [
          "draft",
          "ownership_challenge",
          "owner_proof_request",
          "verify_ownership",
          "preflight",
          "live_arc",
          "validate_evidence"
        ],
        artifact: [
          "draft",
          "review",
          "submission",
          "ownershipChallenge",
          "ownerProofRequest",
          "ownershipVerification",
          "ownership",
          "store",
          "evidence",
          "copilotReadiness"
        ],
        action: [
          "operator_draft",
          "operator_issue_challenge",
          "operator_create_owner_proof_request",
          "owner_publish_proof",
          "operator_preflight",
          "operator_publish_and_assist",
          "operator_validate_evidence",
          "blocked",
          "done"
        ],
        gate: ["external_boundary"],
        runIssue: [
          "packet_read_failed",
          "wrong_type",
          "missing_field",
          "artifact_missing",
          "packet_inconsistent",
          "preflight_not_ready",
          "evidence_not_ready",
          "evidence_packet_mismatch"
        ],
        evidenceIssue: [
          "evidence_read_failed",
          "wrong_type",
          "missing_field",
          "invalid_timestamp",
          "review_not_safe",
          "raw_credentials_present",
          "ownership_not_confirmed",
          "ownership_not_agentport",
          "published_not_verified",
          "assist_not_mcp_http",
          "assist_missing_citations",
          "negative_assist_not_mcp_http",
          "negative_assist_missing_citations",
          "boundary_missing",
          "owner_proof_request_mismatch",
          "artifact_missing",
          "artifact_hash_mismatch"
        ],
        evidenceBoundary: [
          "ai_draft",
          "owner_review",
          "ownership_attestation",
          "backend_boundary",
          "grounded_assist"
        ]
      },
      businessCopilot: {
        state: [
          "draft_required",
          "owner_proof_required",
          "preflight_pending",
          "live_arc_pending",
          "evidence_validation_pending",
          "published",
          "blocked"
        ],
        retention: ["refs_only"],
        validationIssue: [
          "packet_read_failed",
          "wrong_type",
          "invalid_timestamp",
          "missing_field",
          "unexpected_field",
          "invalid_code",
          "invalid_artifact_ref",
          "invalid_requirement",
          "invalid_check"
        ]
      }
    },
    wireShape: {
      prefer: ["stable_code", "reference_id", "canonical_hash", "minimal_scalar_fact"],
      avoidByDefault: [
        "raw_delegation_tokens",
        "raw_token_confirmation_tokens",
        "full_chat_transcripts",
        "agent_reasoning_traces",
        "raw_adapter_payloads",
        "cross_business_user_memory"
      ]
    }
  };
}
