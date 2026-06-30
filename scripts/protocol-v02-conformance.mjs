#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const PROTOCOL = "agentport-protocol-conformance-report";
const VERSION = "0.2";
const GENERATED_AT = "2026-06-27T00:00:00.000Z";

export async function runProtocolV02Conformance({ input, expectTamperFailures = false, profile } = {}) {
  if (!input) {
    throw new Error("Missing --input path");
  }

  const tracePaths = await resolveTracePaths(input);
  const traces = await Promise.all(tracePaths.map(readTrace));
  return runProtocolV02ConformanceForTraces({
    input,
    expectTamperFailures,
    profile,
    traces: traces.map(({ file, trace }) => ({ file, trace }))
  });
}

export function runProtocolV02ConformanceForTraces({ input = "inline", traces, expectTamperFailures = false, profile } = {}) {
  if (!Array.isArray(traces) || traces.length === 0) {
    throw new Error("At least one protocol trace is required");
  }
  const selectedRoleProfiles = buildRoleProfilesForSelection(profile);

  const traceReports = traces.map((entry, index) => {
    const trace = entry?.trace ?? entry;
    const file = entry?.file ?? `${input}#${index + 1}`;
    return validateTrace(trace, file);
  });
  const summary = {
    goldenPassed: 0,
    goldenFailed: 0,
    tamperPassedAsExpected: 0,
    tamperUnexpectedPass: 0
  };

  for (const traceReport of traceReports) {
    if (traceReport.kind === "golden") {
      if (traceReport.ok) {
        summary.goldenPassed += 1;
      } else {
        summary.goldenFailed += 1;
      }
      continue;
    }

    const failedAsExpected =
      expectTamperFailures &&
      traceReport.expectedFailureCheckId &&
      traceReport.failedCheckIds.includes(traceReport.expectedFailureCheckId);

    if (failedAsExpected) {
      summary.tamperPassedAsExpected += 1;
    } else if (traceReport.ok) {
      summary.tamperUnexpectedPass += 1;
    } else {
      summary.tamperUnexpectedPass += 1;
    }
  }

  const ok =
    summary.goldenFailed === 0 &&
    (expectTamperFailures ? summary.tamperUnexpectedPass === 0 : traceReports.every((trace) => trace.ok));
  const roleProfiles = buildRoleProfiles(traceReports, selectedRoleProfiles);
  const reportOk = profile ? roleProfiles.every((roleProfile) => roleProfile.ok) : ok;

  return {
    "$schema": "schemas/agentport-protocol-conformance-report.v0.2.schema.json",
    protocol: PROTOCOL,
    version: VERSION,
    ok: reportOk,
    input,
    generatedAt: GENERATED_AT,
    summary,
    roleProfiles,
    traces: traceReports,
    certification: {
      agentPortCertified: false,
      agentPortVerifiedBusiness: false,
      realBusinessProof: false
    }
  };
}

function buildRoleProfilesForSelection(profile) {
  if (!profile) {
    return Object.values(ROLE_PROFILES);
  }

  const selected = ROLE_PROFILES[profile];
  if (!selected) {
    throw new Error(`Unknown profile: ${profile}. Expected one of: ${Object.keys(ROLE_PROFILES).join(", ")}`);
  }
  return [selected];
}

function buildRoleProfiles(traceReports, profiles) {
  return profiles.map((profile) => {
    const requiredCheckIds = profile.requiredCheckIds;
    const goldenReports = traceReports.filter((trace) => trace.kind === "golden");
    const relevantTamperReports = traceReports.filter((trace) => requiredCheckIds.includes(trace.expectedFailureCheckId));
    const goldenFailedTraceIds = goldenReports
      .filter((trace) => trace.failedCheckIds.some((checkId) => requiredCheckIds.includes(checkId)))
      .map((trace) => trace.traceId);
    const tamperUnexpectedTraceIds = relevantTamperReports
      .filter((trace) => !trace.expectedFailureCheckId || !trace.failedCheckIds.includes(trace.expectedFailureCheckId))
      .map((trace) => trace.traceId);

    return {
      profileId: profile.profileId,
      role: profile.role,
      ok: goldenFailedTraceIds.length === 0 && tamperUnexpectedTraceIds.length === 0,
      requiredCheckIds,
      summary: {
        goldenPassed: goldenReports.length - goldenFailedTraceIds.length,
        goldenFailed: goldenFailedTraceIds.length,
        tamperPassedAsExpected: relevantTamperReports.length - tamperUnexpectedTraceIds.length,
        tamperUnexpectedPass: tamperUnexpectedTraceIds.length
      },
      allowedClaim: profile.allowedClaim,
      forbiddenClaims: profile.forbiddenClaims,
      failingTraceIds: [...goldenFailedTraceIds, ...tamperUnexpectedTraceIds]
    };
  });
}

function validateTrace(trace, file) {
  const failures = [];

  for (const [checkId, check] of Object.entries(CHECKS)) {
    if (!check(trace)) {
      failures.push(checkId);
    }
  }

  return {
    traceId: trace.traceId ?? file,
    kind: trace.kind ?? "golden",
    ok: failures.length === 0,
    ...(trace.expectedFailureCheckId ? { expectedFailureCheckId: trace.expectedFailureCheckId } : {}),
    failedCheckIds: failures
  };
}

const CHECKS = {
  role_boundaries_declared(trace) {
    const roles = trace.roles ?? {};
    return (
      roles.frontierHost?.role === "frontier_host" &&
      roles.frontierHost?.holdsCurrentTicketTruth === false &&
      roles.plugin?.role === "plugin" &&
      roles.plugin?.lifecycleAuthority === false &&
      roles.plugin?.mintsAuthority === false &&
      roles.businessPortEndpoint?.role === "business_port_endpoint" &&
      roles.businessPortEndpoint?.systemOfRecord === false &&
      roles.gateway?.role === "gateway" &&
      roles.gateway?.derivesAllowedActions === true &&
      roles.adapter?.role === "adapter" &&
      roles.adapter?.selfAssertsVerification === false &&
      roles.commitmentRegistry?.role === "commitment_registry" &&
      roles.commitmentRegistry?.lifecycleAuthority === true &&
      roles.businessBackend?.role === "business_backend" &&
      roles.businessBackend?.systemOfRecord === true
    );
  },

  canonical_objects_present(trace) {
    const { commitment, actionIntent, deliveryReceipt } = trace.objects ?? {};
    return (
      commitment?.protocol === "agentport-commitment" &&
      commitment?.version === VERSION &&
      actionIntent?.protocol === "agentport-action-intent" &&
      actionIntent?.version === VERSION &&
      deliveryReceipt?.protocol === "agentport-delivery-receipt" &&
      deliveryReceipt?.version === VERSION
    );
  },

  wallet_restore_before_status(trace) {
    const restoreIndex = firstStepIndex(trace, ({ id, action }) =>
      id === "restore_wallet_first" || action === "locate_wallet_tickets"
    );
    const statusIndex = firstStepIndex(trace, ({ id, action }) =>
      id === "registry_status_read" || action === "get_ticket_status"
    );
    const routeIndex = firstStepIndex(trace, ({ id, action }) => id === "route_proof" || action === "send_ticket");

    return restoreIndex >= 0 && statusIndex >= 0 && routeIndex >= 0 && restoreIndex < statusIndex && statusIndex < routeIndex;
  },

  allowed_actions_gateway_derived(trace) {
    const allowedActions = trace.objects?.commitment?.allowedActions;
    if (!Array.isArray(allowedActions) || allowedActions.length === 0) {
      return false;
    }

    const sendTicket = allowedActions.find((item) => item.action === "send_ticket");
    return (
      allowedActions.every((item) => item.derivedByGateway === true) &&
      sendTicket?.requiresConsent === true &&
      sendTicket?.backendMutation === false
    );
  },

  consent_bound_to_summary(trace) {
    const intent = trace.objects?.actionIntent;
    if (intent?.action !== "send_ticket") {
      return true;
    }

    const approval = intent.approval ?? {};
    const statement = String(approval.consentStatement ?? "");
    const normalized = statement.toLowerCase();
    const phrase = String(approval.approvalPhrase ?? "");
    const commitmentId = String(intent.target?.commitmentId ?? trace.objects?.commitment?.commitmentId ?? "");
    const destination = String(intent.target?.destinationRef ?? "");
    const hasTicketRef = normalized.includes("ap-demo-1234") || (commitmentId.length > 0 && statement.includes(commitmentId));
    const hasDestination =
      normalized.includes("front desk") ||
      normalized.includes("verified-spa") ||
      (destination.length > 0 && statement.includes(destination));

    return (
      approval.required === true &&
      approval.exactSummaryShown === true &&
      approval.userConsentAttachedAfterApproval === true &&
      phrase.length > 0 &&
      statement.includes(phrase) &&
      /\b(send|route|share|deliver)\b/i.test(statement) &&
      hasTicketRef &&
      hasDestination &&
      (normalized.includes("backend changed: no") || intent.bounds?.backendMutation === false)
    );
  },

  proof_routing_no_backend_mutation(trace) {
    const commitment = trace.objects?.commitment ?? {};
    const sendTicket = commitment.allowedActions?.find?.((item) => item.action === "send_ticket");
    const auditEvents = trace.objects?.auditEvents ?? [];
    return (
      sendTicket?.backendMutation === false &&
      trace.objects?.actionIntent?.bounds?.backendMutation === false &&
      trace.objects?.deliveryReceipt?.backendMutation === false &&
      auditEvents.every((event) => event.backendMutation === false)
    );
  },

  authority_evidence_not_model_minted(trace) {
    const authority = trace.objects?.commitment?.authority ?? {};
    const approval = trace.objects?.actionIntent?.approval ?? {};
    const evidenceRefs = authority.evidenceRefs;
    return (
      Array.isArray(evidenceRefs) &&
      evidenceRefs.length > 0 &&
      authority.mintedByAgentPort === false &&
      authority.mintedByModel === false &&
      authority.modelSelfIssued === false &&
      approval.userConsentAttachedAfterApproval === true &&
      approval.modelClaimedConsentOnly !== true
    );
  },

  adapter_cannot_self_assert_trust(trace) {
    const adapterAssertions = trace.objects?.adapterAssertions ?? {};
    const forbidden = adapterAssertions.selfAssertedTrust ?? {};
    return (
      forbidden.verified !== true &&
      forbidden.tier === undefined &&
      forbidden.bindingId === undefined &&
      forbidden.allowedAction === undefined &&
      forbidden.receiptRef === undefined &&
      adapterAssertions.gatewayIgnoredSelfAssertedTrust !== false
    );
  },

  business_port_preserves_gateway_outcome(trace) {
    const delivery = trace.objects?.businessPortDelivery;
    if (delivery === undefined) {
      return true;
    }

    const receipt = trace.objects?.deliveryReceipt ?? {};
    const gatewayOutcome = delivery.gatewayOutcome ?? receipt.result;
    return (
      delivery.systemOfRecord === false &&
      delivery.upgradedOutcome !== true &&
      delivery.result === gatewayOutcome &&
      delivery.gatewayOutcomeRef === receipt.receiptRef &&
      !(receipt.backendMutation === false && ["confirmed", "cancelled", "rescheduled", "paid"].includes(delivery.result))
    );
  },

  receipt_binds_authority_and_outcome(trace) {
    const commitment = trace.objects?.commitment ?? {};
    const receipt = trace.objects?.deliveryReceipt ?? {};
    const authorityRefs = commitment.authority?.evidenceRefs ?? [];
    const receiptAuthorityRefs = receipt.authorityEvidenceRefs ?? [];
    return (
      receipt.issuedBy === "agentport-gateway" &&
      Array.isArray(authorityRefs) &&
      authorityRefs.length > 0 &&
      Array.isArray(receiptAuthorityRefs) &&
      authorityRefs.every((ref) => receiptAuthorityRefs.includes(ref)) &&
      receipt.consentId === commitment.authority?.consentId &&
      typeof receipt.outcomeRef === "string" &&
      receipt.outcomeRef.length > 0 &&
      Array.isArray(commitment.receiptRefs) &&
      commitment.receiptRefs.includes(receipt.outcomeRef)
    );
  },

  actor_roles_separated(trace) {
    const actors = trace.objects?.deliveryReceipt?.actors ?? {};
    const requestedKind = actors.requestedActor?.actorKind;
    const customerKind = actors.customerActor?.actorKind;
    const gatewayKind = actors.gatewayActor?.actorKind;
    return (
      requestedKind === "plugin_host" &&
      customerKind === "customer_holder" &&
      gatewayKind === "gateway" &&
      new Set([requestedKind, customerKind, gatewayKind]).size === 3
    );
  },

  registry_lifecycle_authority(trace) {
    const registry = trace.objects?.commitment?.registry ?? {};
    return (
      trace.roles?.plugin?.lifecycleAuthority === false &&
      trace.roles?.commitmentRegistry?.lifecycleAuthority === true &&
      registry.lifecycleAuthority === true &&
      registry.frontierHostIsAuthority === false &&
      registry.pluginWalletIsAuthority === false
    );
  },

  business_backend_system_of_record(trace) {
    const backend = trace.objects?.commitment?.backend ?? {};
    return (
      trace.roles?.businessBackend?.systemOfRecord === true &&
      trace.roles?.businessPortEndpoint?.systemOfRecord === false &&
      backend.systemOfRecord === true &&
      backend.agentPortOwnsBackendLedger === false
    );
  },

  forbidden_claims_false(trace) {
    const claims = trace.claims ?? {};
    return (
      claims.agentPortCertified === false &&
      claims.agentPortVerifiedBusiness === false &&
      claims.realBusinessProof === false
    );
  }
};

const ROLE_PROFILES = {
  gateway: {
    profileId: "gateway-runtime-v0.2",
    role: "gateway",
    requiredCheckIds: [
      "role_boundaries_declared",
      "canonical_objects_present",
      "allowed_actions_gateway_derived",
      "consent_bound_to_summary",
      "proof_routing_no_backend_mutation",
      "authority_evidence_not_model_minted",
      "adapter_cannot_self_assert_trust",
      "business_port_preserves_gateway_outcome",
      "receipt_binds_authority_and_outcome",
      "actor_roles_separated",
      "business_backend_system_of_record",
      "forbidden_claims_false"
    ],
    allowedClaim: "Passes AgentPort Gateway conformance v0.2",
    forbiddenClaims: ["AgentPort Certified", "AgentPort Verified business", "real-business proof"]
  },
  pluginWallet: {
    profileId: "plugin-wallet-v0.2",
    role: "plugin",
    requiredCheckIds: [
      "role_boundaries_declared",
      "wallet_restore_before_status",
      "consent_bound_to_summary",
      "authority_evidence_not_model_minted",
      "registry_lifecycle_authority",
      "receipt_binds_authority_and_outcome",
      "forbidden_claims_false"
    ],
    allowedClaim: "Passes AgentPort Plugin Wallet conformance v0.2",
    forbiddenClaims: ["gateway authority", "registry authority", "AgentPort Certified", "real-business proof"]
  },
  frontierHost: {
    profileId: "frontier-host-session-discipline-v0.2",
    role: "frontier_host",
    requiredCheckIds: [
      "role_boundaries_declared",
      "wallet_restore_before_status",
      "consent_bound_to_summary",
      "authority_evidence_not_model_minted",
      "registry_lifecycle_authority",
      "forbidden_claims_false"
    ],
    allowedClaim: "Passes AgentPort Frontier Host conformance v0.2",
    forbiddenClaims: ["model memory as lifecycle truth", "registry authority", "A2A certification", "AgentPort Certified", "real-business proof"]
  },
  adapter: {
    profileId: "adapter-capability-honesty-v0.2",
    role: "adapter",
    requiredCheckIds: [
      "role_boundaries_declared",
      "adapter_cannot_self_assert_trust",
      "business_backend_system_of_record",
      "forbidden_claims_false"
    ],
    allowedClaim: "Passes AgentPort Adapter Capability Honesty conformance v0.2",
    forbiddenClaims: ["AgentPort verification", "gateway authority", "real-business proof"]
  },
  businessPort: {
    profileId: "business-port-forwarding-v0.2",
    role: "business_port_endpoint",
    requiredCheckIds: [
      "role_boundaries_declared",
      "proof_routing_no_backend_mutation",
      "business_port_preserves_gateway_outcome",
      "actor_roles_separated",
      "business_backend_system_of_record",
      "receipt_binds_authority_and_outcome",
      "forbidden_claims_false"
    ],
    allowedClaim: "Passes AgentPort Business Port conformance v0.2",
    forbiddenClaims: ["booking/POS ledger ownership", "backend confirmation authority", "AgentPort verification", "real-business proof"]
  },
  registry: {
    profileId: "registry-lifecycle-v0.2",
    role: "commitment_registry",
    requiredCheckIds: [
      "role_boundaries_declared",
      "wallet_restore_before_status",
      "registry_lifecycle_authority",
      "receipt_binds_authority_and_outcome",
      "forbidden_claims_false"
    ],
    allowedClaim: "Passes AgentPort Commitment Registry conformance v0.2",
    forbiddenClaims: ["business backend ledger ownership", "AgentPort verification", "gateway authority", "real-business proof"]
  }
};

function firstStepIndex(trace, predicate) {
  const steps = Array.isArray(trace.steps) ? trace.steps : [];
  return steps.findIndex(predicate);
}

async function resolveTracePaths(input) {
  const resolved = path.resolve(input);
  const info = await stat(resolved);
  if (info.isFile()) {
    return [resolved];
  }

  if (!info.isDirectory()) {
    throw new Error(`Input is not a file or directory: ${input}`);
  }

  const entries = await readdir(resolved);
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => path.join(resolved, entry));
}

async function readTrace(file) {
  const raw = await readFile(file, "utf8");
  return { file, trace: JSON.parse(raw) };
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--expect-tamper-failures") {
      parsed.expectTamperFailures = true;
      continue;
    }
    if (arg === "--input") {
      parsed.input = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--profile") {
      parsed.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node scripts/protocol-v02-conformance.mjs --input <trace-file-or-dir> [--expect-tamper-failures] [--profile <gateway|pluginWallet|frontierHost|adapter|businessPort|registry>]\n"
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function isCliEntry() {
  return Boolean(process.argv[1]) &&
    path.basename(process.argv[1]) === "protocol-v02-conformance.mjs" &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliEntry()) {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input ?? "examples/protocol-v0.2";
  const expectTamperFailures = args.expectTamperFailures === true;
  const profile = args.profile;

  try {
    const report = await runProtocolV02Conformance({ input, expectTamperFailures, profile });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
