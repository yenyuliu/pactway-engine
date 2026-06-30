#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_TRACE_PATH = "examples/a2a-gateway-trace-suite.v0.1.json";
const DEFAULT_HOST_BINDING_PATH = "artifacts/agentport-a2a-host-binding.v0.1.json";
const STATE_CHANGING_PRIMITIVES = new Set([
  "book_service",
  "cancel_service",
  "reschedule_service",
  "send_ticket"
]);
const CANONICAL_GOLDEN_PRIMITIVES = [
  "get_business_feed",
  "compile_action_intent",
  "get_action_intent_lifecycle",
  "book_service",
  "ActionReceipt"
];
const REQUIRED_TAMPERS = new Map([
  ["direct_execute_without_compile", "missing_compiled_action_intent"],
  ["invented_approval", "consent_required"],
  ["missing_authority_for_confirm", "delegation_required"],
  ["forged_receipt", "client_receipt_untrusted"],
  ["ack_as_verification", "delivery_verification_required"]
]);

try {
  const options = parseArgs(process.argv.slice(2));
  const report = options.hostTrace
    ? await buildHostTraceReportFromOptions(options)
    : await buildGatewayTraceReportFromOptions(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (options.out) {
    await writeFile(resolve(options.out), json, "utf8");
  } else {
    process.stdout.write(json);
  }

  if (options.strict && !report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    trace: DEFAULT_TRACE_PATH,
    hostTrace: null,
    binding: null,
    profile: null,
    out: null,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--trace" || arg === "--host-trace" || arg === "--binding" || arg === "--profile" || arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      const key = arg === "--host-trace" ? "hostTrace" : arg.slice(2);
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function buildGatewayTraceReportFromOptions(options) {
  const tracePath = resolve(options.trace);
  const trace = await readJson(tracePath);
  const profilePath = resolve(options.profile ?? trace.profileArtifact);
  const profile = await readJson(profilePath);
  return finalizeReport(
    buildReport({ profile, profilePath, trace, tracePath }),
    "schemas/agentport-a2a-gateway-compatibility-report.schema.json"
  );
}

async function buildHostTraceReportFromOptions(options) {
  const hostTracePath = resolve(options.hostTrace);
  const hostTrace = await readJson(hostTracePath);
  const bindingPath = resolve(options.binding ?? hostTrace.bindingArtifact ?? DEFAULT_HOST_BINDING_PATH);
  const binding = await readJson(bindingPath);
  return finalizeReport(
    buildHostReport({ binding, bindingPath, hostTrace, hostTracePath }),
    "schemas/agentport-a2a-host-adoption-report.schema.json"
  );
}

function buildReport({ profile, profilePath, trace, tracePath }) {
  const checks = buildChecks(profile, trace);
  const failedCheckIds = checks.filter((check) => !check.ok).map((check) => check.id);
  const ok = failedCheckIds.length === 0;
  const areas = buildAreas(checks);

  return {
    type: "agentport.a2a_gateway_compatibility_report.v0.1",
    profile: "a2a-gateway",
    generatedAt: new Date().toISOString(),
    input: tracePath,
    inputKind: "a2a_gateway_trace_suite_file",
    profileArtifact: profilePath,
    traceSuite: tracePath,
    status: ok ? "passed" : "failed",
    ok,
    certification: {
      publicCertification: false,
      a2aCertification: false,
      agentPortReadyCertification: false,
      realBusinessCertification: false,
      note: "This report checks the AgentPort A2A gateway profile artifacts only; it is not public certification or real-business evidence."
    },
    boundaries: {
      a2aProfileOnly: trace.boundaries?.a2aProfileOnly === true,
      agentGatewayAlreadyExists: profile.boundary?.agentPortIsGateway === true,
      replacesA2A: trace.boundaries?.replacesA2A === true,
      createsNewGateway: false,
      executesLiveNetwork: false
    },
    areas,
    checks,
    failedCheckIds,
    validator: {
      type: "agentport.a2a_gateway_trace_validation.v0.1",
      ok,
      checkCount: checks.length,
      failedCheckIds
    }
  };
}

function buildHostReport({ binding, bindingPath, hostTrace, hostTracePath }) {
  const checks = buildHostChecks(binding, hostTrace);
  const failedCheckIds = checks.filter((checkResult) => !checkResult.ok).map((checkResult) => checkResult.id);
  const ok = failedCheckIds.length === 0;
  const expectedStatus = hostTrace.expectedStatus ?? "passed";
  const expectedFailures = hostTrace.expectedFailureIds ?? [];
  const expectedStatusMatches = expectedStatus === "passed"
    ? ok
    : !ok && expectedFailures.every((id) => failedCheckIds.includes(id));

  return {
    type: "agentport.a2a_host_adoption_report.v0.1",
    profile: "a2a-host-adoption",
    generatedAt: new Date().toISOString(),
    input: hostTracePath,
    inputKind: "a2a_host_trace_file",
    bindingArtifact: bindingPath,
    hostTrace: hostTracePath,
    expectedStatus,
    expectedStatusMatches,
    status: ok ? "passed" : "failed",
    ok,
    certification: {
      publicCertification: false,
      a2aCertification: false,
      agentPortReadyCertification: false,
      realBusinessCertification: false,
      note: "This report checks frontier-host adoption of the AgentPort A2A binding only; it is not A2A certification or AgentPort Ready certification."
    },
    boundaries: {
      hostAdoptionOnly: hostTrace.boundaries?.hostTraceOnly === true,
      a2aCertification: false,
      publicCertification: false,
      realBusinessEvidence: hostTrace.boundaries?.realBusinessEvidence === true,
      executesLiveNetwork: hostTrace.boundaries?.executesLiveNetwork === true
    },
    areas: buildHostAreas(checks),
    checks,
    failedCheckIds,
    validator: {
      type: "agentport.a2a_host_trace_validation.v0.1",
      ok,
      checkCount: checks.length,
      failedCheckIds
    }
  };
}

function buildHostChecks(binding, hostTrace) {
  const events = Array.isArray(hostTrace.events) ? [...hostTrace.events].sort((a, b) => a.order - b.order) : [];
  const firstIndex = (predicate) => events.findIndex(predicate);
  const eventWithPhase = (phase) => events.find((event) => event.phase === phase);
  const executions = events.filter((event) => event.phase === "execute_action" || STATE_CHANGING_PRIMITIVES.has(event.agentPortPrimitive));
  const executionIndexes = executions.map((event) => events.indexOf(event));
  const compileIndex = firstIndex((event) => event.phase === "compile_action_intent" || event.agentPortPrimitive === "compile_action_intent");
  const approvalIndex = firstIndex((event) => event.phase === "render_approval" && event.assertions?.exactApprovalRendered === true);
  const receiptEvents = events.filter((event) => event.phase === "receive_receipt" || event.agentPortPrimitive === "ActionReceipt");
  const ackEvents = events.filter((event) => event.phase === "ack_result_delivery" || event.agentPortPrimitive === "ack_action_intent_result_delivery");
  const presentEvent = eventWithPhase("present_result");
  const hasPreserveFields = (event, fields) => fields.every((field) => event?.preservedFields?.includes(field));

  return [
    check("host_binding_protocol", binding.protocol === "agentport-a2a-host-binding", "Host binding artifact is the AgentPort A2A host binding."),
    check("host_boundary_declared", binding.boundary?.hostOwnsIntent === true && binding.boundary?.agentPortOwnsGatewayTruth === true, "Binding keeps host intent ownership separate from AgentPort gateway truth."),
    check("host_preserve_fields_declared", ["intentId", "approvedActionIntentHash", "userConsent", "actionReceiptRef"].every((field) => binding.preserveFields?.includes(field)), "Binding declares the required fields hosts must preserve."),
    check("host_trace_type", hostTrace.type === "agentport.a2a_host_trace.v0.1", "Host trace uses the AgentPort A2A host trace format."),
    check("host_trace_boundary", hostTrace.boundaries?.hostTraceOnly === true && hostTrace.boundaries?.certification === false && hostTrace.boundaries?.replacesA2A === false, "Host trace is non-certifying and does not replace A2A."),
    check("host_task_classified", events.some((event) => event.phase === "classify_task" && event.assertions?.realWorldServiceTask === true), "Host classifies the real-world service task."),
    check("host_business_port_selected", events.some((event) => event.assertions?.hostSelectedBusinessPort === true), "Host selects the business port or gateway endpoint."),
    check("host_gateway_called_for_truth", events.some((event) => ["get_business_feed", "get_business_info"].includes(event.agentPortPrimitive)), "Host calls AgentPort for business truth instead of relying on model memory."),
    check("host_action_model_read_before_execute", executionIndexes.length === 0 || (firstIndex((event) => event.phase === "read_action_model") !== -1 && firstIndex((event) => event.phase === "read_action_model") < executionIndexes[0]), "Host reads the AgentPort action model before execution."),
    check("host_compile_before_execute", executionIndexes.length === 0 || (compileIndex !== -1 && executionIndexes.every((index) => compileIndex < index)), "Host compiles an action intent before state-changing execution."),
    check("host_exact_approval_before_consent", executions.every((event) => approvalIndex !== -1 && approvalIndex < events.indexOf(event) && event.assertions?.exactApprovalRendered === true && event.assertions?.userConsent === true), "Host renders exact approval before using userConsent."),
    check("host_execution_binding_fields", executions.every((event) => hasPreserveFields(event, ["intentId", "approvedActionIntentHash", "userConsent"]) && Boolean(event.assertions?.intentId) && Boolean(event.assertions?.approvedActionIntentHash)), "Execution preserves intentId, approvedActionIntentHash, and userConsent."),
    check("host_authority_when_required", executions.every((event) => event.assertions?.authorityEvidenceRequired !== true || event.assertions?.authorityEvidenceCarried === true), "Host carries external authority evidence when the gateway requires it."),
    check("host_gateway_receipt_only", receiptEvents.every((event) => event.assertions?.gatewayProducedReceipt === true && event.assertions?.clientMintedReceipt === false), "Host accepts only gateway-produced receipt proof."),
    check("host_ack_is_not_receipt_verification", ackEvents.every((event) => event.assertions?.deliveryAckTreatedAsReceiptVerification !== true), "Host does not treat result-delivery acknowledgement as receipt verification."),
    check("host_present_gateway_outcome_without_upgrade", !presentEvent || (presentEvent.assertions?.taskStatePresentedAsOrchestrationOnly === true && presentEvent.assertions?.gatewayOutcomeNotUpgraded === true), "Host presents gateway outcome without upgrading A2A task state into business proof.")
  ];
}

function buildHostAreas(checks) {
  const byId = new Map(checks.map((checkResult) => [checkResult.id, checkResult]));
  return [
    area("host_boundary", [
      "host_binding_protocol",
      "host_boundary_declared",
      "host_preserve_fields_declared",
      "host_trace_type",
      "host_trace_boundary"
    ], byId),
    area("task_classification", [
      "host_task_classified",
      "host_business_port_selected",
      "host_gateway_called_for_truth"
    ], byId),
    area("binding_sequence", [
      "host_action_model_read_before_execute",
      "host_compile_before_execute",
      "host_exact_approval_before_consent",
      "host_execution_binding_fields"
    ], byId),
    area("authority_and_receipt", [
      "host_authority_when_required",
      "host_gateway_receipt_only",
      "host_ack_is_not_receipt_verification"
    ], byId),
    area("presentation_semantics", [
      "host_present_gateway_outcome_without_upgrade"
    ], byId)
  ];
}

function buildChecks(profile, trace) {
  const steps = Array.isArray(trace.golden?.steps) ? trace.golden.steps : [];
  const primitives = steps.map((step) => step.agentPortPrimitive);
  const assertions = Array.isArray(trace.golden?.assertions) ? trace.golden.assertions : [];
  const tamperById = new Map((Array.isArray(trace.tamper) ? trace.tamper : []).map((item) => [item.id, item]));
  const stateChangingIndexes = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => STATE_CHANGING_PRIMITIVES.has(step.agentPortPrimitive))
    .map(({ index }) => index);
  const compileIndex = primitives.indexOf("compile_action_intent");
  const receiptIndex = primitives.indexOf("ActionReceipt");
  const firstStateChangingIndex = stateChangingIndexes[0] ?? -1;
  const mappingFor = (taskClass) => profile.taskMapping?.find((mapping) => mapping.a2aTaskClass === taskClass);

  const checks = [
    check("profile_protocol", profile.protocol === "agentport-a2a-gateway-profile", "Profile protocol is agentport-a2a-gateway-profile."),
    check("profile_a2a_boundary", profile.boundary?.doesNotReplaceA2A === true, "Profile declares that AgentPort does not replace A2A."),
    check("profile_gateway_boundary", profile.boundary?.agentPortIsGateway === true, "Profile treats AgentPort as the existing gateway boundary."),
    check("profile_not_certification", profile.boundary?.doesNotCertify === true && profile.conformance?.certification === false, "Profile is not certification."),
    check("trace_profile_only", trace.boundaries?.a2aProfileOnly === true && trace.boundaries?.certification === false, "Trace suite is profile-only and not certification."),
    check("trace_not_replacement", trace.boundaries?.replacesA2A === false, "Trace suite does not replace A2A."),
    check(
      "prepare_maps_compile",
      mappingFor("action.prepare")?.agentPortPrimitive?.includes("compile_action_intent") === true,
      "A2A action.prepare maps to compile_action_intent."
    ),
    check(
      "execute_maps_state_changing",
      mappingFor("action.execute")?.agentPortPrimitive?.some((primitive) => STATE_CHANGING_PRIMITIVES.has(primitive)) === true,
      "A2A action.execute maps to state-changing gateway tools."
    ),
    check(
      "receipt_maps_action_receipt",
      mappingFor("proof.receipt")?.agentPortPrimitive?.includes("ActionReceipt") === true,
      "A2A proof.receipt maps to AgentPort ActionReceipt."
    ),
    check(
      "golden_primitive_sequence",
      JSON.stringify(primitives) === JSON.stringify(CANONICAL_GOLDEN_PRIMITIVES),
      "Golden trace follows discovery/feed, compile, lifecycle, execute, receipt sequence."
    ),
    check(
      "compile_before_state_change",
      compileIndex !== -1 && stateChangingIndexes.length > 0 && stateChangingIndexes.every((index) => compileIndex < index),
      "compile_action_intent appears before every state-changing primitive."
    ),
    check(
      "approval_before_execute",
      firstStateChangingIndex !== -1 && String(steps[firstStateChangingIndex]?.gate).includes("exact_approval"),
      "State-changing execution is gated by exact approval."
    ),
    check(
      "execution_binding_required",
      profile.requiredSequence?.includes("execute_with_intentId_approvedActionIntentHash_and_userConsent") === true
        && assertions.includes("state-changing execution carries intentId and approvedActionIntentHash."),
      "Execution requires intentId, approvedActionIntentHash, and userConsent."
    ),
    check(
      "receipt_after_execute",
      firstStateChangingIndex !== -1 && receiptIndex > firstStateChangingIndex,
      "ActionReceipt appears after gateway execution."
    ),
    check(
      "task_state_separate",
      profile.resultSemantics?.taskStateRule?.includes("orchestration progress") === true
        && assertions.includes("A2A task progress is separate from business outcome."),
      "A2A task state is separate from business outcome."
    ),
    check(
      "business_outcome_gateway",
      profile.resultSemantics?.businessOutcomeRule?.includes("AgentPort gateway") === true,
      "Business outcome comes from AgentPort gateway results."
    ),
    check(
      "receipt_gateway_produced",
      profile.resultSemantics?.receiptRule?.includes("AgentPort ActionReceipt") === true
        && assertions.includes("ActionReceipt is gateway-produced and binds the backend result."),
      "Receipt proof is gateway-produced and backend-bound."
    )
  ];

  for (const [id, expectedRejection] of REQUIRED_TAMPERS) {
    const tamper = tamperById.get(id);
    checks.push(check(
      `tamper_${id}`,
      tamper?.expectedRejection === expectedRejection,
      `Tamper case ${id} rejects with ${expectedRejection}.`
    ));
  }

  return checks;
}

function buildAreas(checks) {
  const byId = new Map(checks.map((checkResult) => [checkResult.id, checkResult]));
  return [
    area("profile_boundary", [
      "profile_protocol",
      "profile_a2a_boundary",
      "profile_gateway_boundary",
      "profile_not_certification",
      "trace_profile_only",
      "trace_not_replacement"
    ], byId),
    area("primitive_mapping", [
      "prepare_maps_compile",
      "execute_maps_state_changing",
      "receipt_maps_action_receipt",
      "golden_primitive_sequence"
    ], byId),
    area("safe_sequence", [
      "compile_before_state_change",
      "approval_before_execute",
      "execution_binding_required",
      "receipt_after_execute"
    ], byId),
    area("tamper_coverage", [...REQUIRED_TAMPERS.keys()].map((id) => `tamper_${id}`), byId),
    area("result_semantics", [
      "task_state_separate",
      "business_outcome_gateway",
      "receipt_gateway_produced"
    ], byId)
  ];
}

function area(id, requiredCheckIds, byId) {
  const failedCheckIds = requiredCheckIds.filter((checkId) => byId.get(checkId)?.ok !== true);
  return {
    id,
    ok: failedCheckIds.length === 0,
    requiredCheckIds,
    failedCheckIds
  };
}

function check(id, ok, detail) {
  return { id, ok, detail };
}

async function finalizeReport(report, schemaPath) {
  const reportWithPlaceholder = {
    ...report,
    validator: {
      ...report.validator,
      reportSchema: {
        type: "agentport.report_schema_validation.v0.1",
        schema: resolve(schemaPath),
        ok: true,
        errorCount: 0,
        errors: []
      }
    }
  };
  const reportSchema = await validateJsonObjectAgainstSchemaFile(reportWithPlaceholder, schemaPath);
  const ok = report.ok === true && reportSchema.ok;
  return {
    ...reportWithPlaceholder,
    ok,
    status: ok ? "passed" : "failed",
    validator: {
      ...reportWithPlaceholder.validator,
      reportSchema
    }
  };
}

async function validateJsonObjectAgainstSchemaFile(payload, schemaPath) {
  const schema = await readJson(resolve(schemaPath));
  const errors = validateJsonSchemaNode(payload, schema, schema.$defs ?? {}, "$");
  return {
    type: "agentport.report_schema_validation.v0.1",
    schema: resolve(schemaPath),
    ok: errors.length === 0,
    errorCount: errors.length,
    errors
  };
}

function validateJsonSchemaNode(value, schema, defs, path) {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    return errors;
  }

  if (typeof schema.$ref === "string") {
    const refName = schema.$ref.startsWith("#/$defs/") ? schema.$ref.slice("#/$defs/".length) : "";
    const refSchema = defs[refName];
    return refSchema ? validateJsonSchemaNode(value, refSchema, defs, path) : [`${path} references missing schema ${refName}`];
  }

  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    errors.push(`${path} expected const ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path} expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  }

  if (schema.type && !jsonTypeMatches(value, schema.type)) {
    errors.push(`${path} expected type ${schema.type}`);
    return errors;
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(record, required)) {
        errors.push(`${path}.${required} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(record, key)) {
        errors.push(...validateJsonSchemaNode(record[key], propertySchema, defs, `${path}.${key}`));
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} expected at least ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateJsonSchemaNode(item, schema.items, defs, `${path}[${index}]`));
      });
    }
  }

  if (schema.type === "string" && typeof value === "string" && typeof schema.minLength === "number" && value.length < schema.minLength) {
    errors.push(`${path} expected string length >= ${schema.minLength}`);
  }

  if (schema.type === "integer" && Number.isInteger(value) && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path} expected integer >= ${schema.minimum}`);
  }

  return errors;
}

function jsonTypeMatches(value, type) {
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "integer") {
    return Number.isInteger(value);
  }
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === type;
}
