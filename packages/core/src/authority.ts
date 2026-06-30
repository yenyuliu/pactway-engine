import type {
  ActionIntent,
  ActionLayer,
  AuthorityEvidenceVerifier,
  AuthorityVerificationResult,
  AuthorityAssurance,
  AuthorityContext,
  DelegatedAction,
  DelegationProof
} from "./types.js";

export interface Ap2MandateEvidence {
  mandateRef: string;
  mandateType?: "checkout" | "payment" | "intent";
  status?: "active" | "stale" | "revoked";
  issuer: string;
  agentId: string;
  userSubjectRef?: string;
  consentRef?: string;
  actionIntent: ActionIntent;
  audience?: string;
  expiresAt?: string;
  nonce?: string;
}

export type Ap2MandateVerifier = (evidence: Ap2MandateEvidence) => Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      reason?: AuthorityVerificationResult extends { ok: false; reason: infer Reason } ? Reason : never;
    }
>;

export interface Ap2MandateAuthorityVerifierOptions {
  trustedIssuers?: string[];
  audience?: string;
  now?: () => Date;
  verify: Ap2MandateVerifier;
}

export class Ap2MandateAuthorityVerifier implements AuthorityEvidenceVerifier {
  readonly profile = "ap2-mandate" as const;

  constructor(private readonly options: Ap2MandateAuthorityVerifierOptions) {}

  async normalize(evidence: unknown): Promise<AuthorityVerificationResult> {
    if (!isAp2MandateEvidence(evidence)) {
      return { ok: false, reason: "authority_verification_failed" };
    }

    if (this.options.trustedIssuers?.length && !this.options.trustedIssuers.includes(evidence.issuer)) {
      return { ok: false, reason: "authority_untrusted_issuer" };
    }

    if (this.options.audience && evidence.audience !== this.options.audience) {
      return { ok: false, reason: "authority_action_mismatch" };
    }

    if (evidence.status === "stale") {
      return { ok: false, reason: "authority_stale" };
    }

    if (evidence.status === "revoked") {
      return { ok: false, reason: "authority_revoked" };
    }

    if (evidence.expiresAt) {
      const expiresAt = Date.parse(evidence.expiresAt);
      if (!Number.isFinite(expiresAt)) {
        return { ok: false, reason: "authority_verification_failed" };
      }

      const now = this.options.now?.() ?? new Date();
      if (expiresAt <= now.getTime()) {
        return { ok: false, reason: "authority_expired" };
      }
    }

    const verified = await this.options.verify(evidence);
    if (!verified.ok) {
      return {
        ok: false,
        reason: verified.reason ?? "authority_verification_failed"
      };
    }

    return {
      ok: true,
      authority: authorityContextFromAp2Mandate(evidence)
    };
  }
}

export class UcpHttpSignatureAuthorityVerifier implements AuthorityEvidenceVerifier {
  readonly profile = "ucp-http-signature" as const;

  async normalize(_evidence: unknown): Promise<AuthorityVerificationResult> {
    return { ok: false, reason: "authority_verification_failed" };
  }
}

export class AcpCheckoutAuthorityVerifier implements AuthorityEvidenceVerifier {
  readonly profile = "acp-checkout" as const;

  async normalize(_evidence: unknown): Promise<AuthorityVerificationResult> {
    return { ok: false, reason: "authority_verification_failed" };
  }
}

export function authorityContextFromDelegationProof(proof: DelegationProof): AuthorityContext {
  return {
    caller: {
      agentId: proof.agentId,
      agentKeyThumbprint: proof.tokenConfirmation?.jwkThumbprint ?? proof.tokenConfirmation?.keyId
    },
    user: {
      subjectRef: proof.userSubject,
      consentRef: proof.consentId
    },
    action: {
      layer: layerFromDelegation(proof),
      businessId: proof.actionIntent?.businessId ?? proof.businessId,
      serviceId: proof.actionIntent?.serviceId ?? proof.serviceId,
      bounds: proof.actionIntent
    },
    assurance: authorityAssuranceFromDelegation(proof),
    validity: {
      expiresAt: proof.expiresAt,
      replayHandle: proof.challengeId ?? proof.nonce,
      audience: proof.audience
    },
    evidence: [{
      kind: "agentport-local-delegation",
      ref: proof.delegationId,
      issuer: proof.issuer
    }]
  };
}

export function authorityContextFromAp2Mandate(evidence: Ap2MandateEvidence): AuthorityContext {
  return {
    caller: {
      agentId: evidence.agentId
    },
    user: {
      subjectRef: evidence.userSubjectRef,
      consentRef: evidence.consentRef
    },
    action: {
      layer: layerFromActionIntent(evidence.actionIntent),
      businessId: evidence.actionIntent.businessId,
      serviceId: evidence.actionIntent.serviceId,
      bounds: evidence.actionIntent
    },
    assurance: "verified-mandate",
    validity: {
      expiresAt: evidence.expiresAt,
      replayHandle: evidence.nonce,
      audience: evidence.audience
    },
    evidence: [{
      kind: "ap2-mandate",
      ref: evidence.mandateRef,
      issuer: evidence.issuer
    }]
  };
}

function authorityAssuranceFromDelegation(proof: DelegationProof): AuthorityAssurance {
  return proof.delegationId ? "signed" : "none";
}

function layerFromDelegation(proof: DelegationProof): ActionLayer {
  if (proof.actionIntent) {
    return layerFromActionIntent(proof.actionIntent);
  }

  const actions = proof.approvedActions ?? [];
  if (actions.includes("cancel_service") || actions.includes("reschedule_service")) {
    return "manage";
  }

  return "commit";
}

function layerFromActionIntent(intent: ActionIntent): ActionLayer {
  if (intent.action === "book_service") {
    return intent.requestedType === "request" || intent.requestedType === "handoff" ? "lead" : "commit";
  }

  return "manage";
}

function isAp2MandateEvidence(value: unknown): value is Ap2MandateEvidence {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Ap2MandateEvidence>;
  return hasNonEmptyString(candidate.mandateRef)
    && hasNonEmptyString(candidate.issuer)
    && hasNonEmptyString(candidate.agentId)
    && isOptionalAp2MandateStatus(candidate.status)
    && isActionIntent(candidate.actionIntent);
}

function isOptionalAp2MandateStatus(value: unknown): value is Ap2MandateEvidence["status"] | undefined {
  return value === undefined || value === "active" || value === "stale" || value === "revoked";
}

function isActionIntent(value: unknown): value is ActionIntent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ActionIntent>;
  return isDelegatedAction(candidate.action)
    && hasNonEmptyString(candidate.businessId);
}

function isDelegatedAction(value: unknown): value is DelegatedAction {
  return value === "book_service" || value === "cancel_service" || value === "reschedule_service";
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
