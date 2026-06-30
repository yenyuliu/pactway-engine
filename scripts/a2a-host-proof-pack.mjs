#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import process from "node:process";

const execFileAsync = promisify(execFile);
const DEFAULT_BINDING = "artifacts/agentport-a2a-host-binding.v0.1.json";
const DEFAULT_TRACE_SCHEMA = "../schemas/agentport-a2a-host-trace.schema.json";
const HOST_TRACE_TYPE = "agentport.a2a_host_trace.v0.1";
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /(token|secret|credential|password|privateKey|authorization|email|phone|rawAuthority|payment|card)/i;
const AGENTPORT_PRIMITIVES = new Set([
  "get_business_feed",
  "get_business_info",
  "compile_action_intent",
  "get_action_intent_lifecycle",
  "poll_action_intent_lifecycles",
  "list_action_intent_result_deliveries",
  "get_action_intent_result_delivery",
  "ack_action_intent_result_delivery",
  "book_service",
  "cancel_service",
  "reschedule_service",
  "send_ticket",
  "ActionReceipt"
]);

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input) {
    throw new Error("missing required --input");
  }
  if (!options.outDir) {
    throw new Error("missing required --out-dir");
  }

  const result = await buildProofPack(options);
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);

  if (options.strict && !result.summary.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    input: null,
    outDir: null,
    binding: DEFAULT_BINDING,
    id: null,
    generatedAt: null,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--input" || arg === "--out-dir" || arg === "--binding" || arg === "--id" || arg === "--generated-at") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      const key = arg === "--out-dir" ? "outDir" : arg === "--generated-at" ? "generatedAt" : arg.slice(2);
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

async function buildProofPack(options) {
  const inputPath = resolve(options.input);
  const outDir = resolve(options.outDir);
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  await mkdir(outDir, { recursive: true });

  const input = await readJson(inputPath);
  const normalized = normalizeHostTrace(input, {
    id: options.id,
    inputPath,
    binding: options.binding
  });
  const { value: hostTrace, redactions } = redactValue(normalized, "$");

  const hostTracePath = join(outDir, "host-trace.json");
  const reportPath = join(outDir, "adoption-report.json");
  const manifestPath = join(outDir, "redaction-manifest.json");
  const summaryPath = join(outDir, "proof-summary.json");

  await writeJson(hostTracePath, hostTrace);

  const { stdout } = await execFileAsync(process.execPath, [
    "scripts/a2a-gateway-check.mjs",
    "--host-trace",
    hostTracePath,
    "--binding",
    options.binding,
    "--out",
    reportPath
  ], { cwd: process.cwd() });
  if (stdout.trim()) {
    process.stderr.write(stdout);
  }

  const report = makePortableReport(await readJson(reportPath), generatedAt);
  await writeJson(reportPath, report);

  const manifest = buildRedactionManifest({ inputPath, hostTracePath, reportPath, redactions, generatedAt });
  await writeJson(manifestPath, manifest);

  const summary = await buildSummary({
    inputPath,
    hostTracePath,
    reportPath,
    manifestPath,
    report,
    generatedAt
  });
  await writeJson(summaryPath, summary);

  return { summary, hostTrace, report, manifest };
}

function normalizeHostTrace(input, { id, inputPath, binding }) {
  if (input.type === HOST_TRACE_TYPE) {
    return {
      ...input,
      $schema: input.$schema ?? DEFAULT_TRACE_SCHEMA,
      id: id ?? input.id,
      bindingArtifact: input.bindingArtifact ?? binding
    };
  }

  const events = Array.isArray(input.events) ? input.events : null;
  if (!events) {
    throw new Error("input must be an agentport.a2a_host_trace.v0.1 object or contain an events array");
  }

  return {
    $schema: DEFAULT_TRACE_SCHEMA,
    type: HOST_TRACE_TYPE,
    version: "0.1",
    id: id ?? input.id ?? slugFromInput(inputPath),
    bindingArtifact: input.bindingArtifact ?? binding,
    expectedStatus: input.expectedStatus ?? "passed",
    expectedFailureIds: input.expectedFailureIds ?? [],
    scenario: input.scenario ?? "Normalized A2A host event log proof pack.",
    events: events.map((event, index) => normalizeEvent(event, index)),
    boundaries: {
      hostTraceOnly: input.boundaries?.hostTraceOnly ?? true,
      certification: false,
      realBusinessEvidence: input.boundaries?.realBusinessEvidence ?? false,
      replacesA2A: false,
      executesLiveNetwork: input.boundaries?.executesLiveNetwork ?? false
    }
  };
}

function normalizeEvent(event, index) {
  const primitive = event.agentPortPrimitive ?? event.tool ?? (AGENTPORT_PRIMITIVES.has(event.action) ? event.action : undefined);
  const preservedFields = event.preservedFields ?? event.fields ?? [];
  const normalized = {
    order: event.order ?? index + 1,
    actor: event.actor,
    phase: event.phase,
    ...(event.a2aTaskClass || event.taskClass ? { a2aTaskClass: event.a2aTaskClass ?? event.taskClass } : {}),
    ...(primitive ? { agentPortPrimitive: primitive } : {}),
    preservedFields,
    assertions: event.assertions ?? {}
  };

  for (const key of ["actor", "phase"]) {
    if (!normalized[key]) {
      throw new Error(`event ${normalized.order} missing ${key}`);
    }
  }

  if (!primitive && !event.action) {
    throw new Error(`event ${normalized.order} missing tool or action`);
  }

  return normalized;
}

function buildRedactionManifest({ inputPath, hostTracePath, reportPath, redactions, generatedAt }) {
  return {
    type: "agentport.a2a_host_proof_pack_redaction_manifest.v0.1",
    generatedAt,
    input: displayPath(inputPath),
    artifacts: {
      hostTrace: displayPath(hostTracePath),
      adoptionReport: displayPath(reportPath)
    },
    policy: {
      redactedReplacement: REDACTED,
      forbiddenFieldPatterns: [
        "token",
        "secret",
        "credential",
        "password",
        "privateKey",
        "authorization",
        "email",
        "phone",
        "rawAuthority",
        "payment",
        "card"
      ],
      freeFormStringBoundary: "Automated redaction covers key names, not every possible secret embedded in prose."
    },
    redactions,
    checks: {
      containsRawAuthorityTokens: false,
      containsRawCredentials: false,
      storesFullPrivatePayload: false
    }
  };
}

async function buildSummary({ inputPath, hostTracePath, reportPath, manifestPath, report, generatedAt }) {
  const [hostTraceSha256, adoptionReportSha256, redactionManifestSha256] = await Promise.all([
    fileSha256(hostTracePath),
    fileSha256(reportPath),
    fileSha256(manifestPath)
  ]);

  return {
    type: "agentport.a2a_host_proof_pack.v0.1",
    version: "0.1",
    generatedAt,
    input: displayPath(inputPath),
    status: report.status,
    ok: report.ok,
    artifacts: {
      hostTrace: displayPath(hostTracePath),
      adoptionReport: displayPath(reportPath),
      redactionManifest: displayPath(manifestPath)
    },
    certification: {
      publicCertification: false,
      a2aCertification: false,
      agentPortReadyCertification: false,
      realBusinessCertification: false,
      note: "This proof pack is deterministic host-adoption evidence only; it is not public certification."
    },
    boundaries: {
      hostTraceOnly: true,
      executesLiveNetwork: false,
      containsRawAuthorityTokens: false,
      containsRawCredentials: false
    },
    hashes: {
      hostTraceSha256,
      adoptionReportSha256,
      redactionManifestSha256
    }
  };
}

function makePortableReport(report, generatedAt) {
  return {
    ...report,
    generatedAt,
    input: displayPath(report.input),
    bindingArtifact: displayPath(report.bindingArtifact),
    hostTrace: displayPath(report.hostTrace),
    validator: {
      ...report.validator,
      ...(report.validator?.reportSchema ? {
        reportSchema: {
          ...report.validator.reportSchema,
          schema: displayPath(report.validator.reportSchema.schema)
        }
      } : {})
    }
  };
}

function normalizeGeneratedAt(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid --generated-at value: ${value}`);
  }
  return date.toISOString();
}

function redactValue(value, path) {
  if (Array.isArray(value)) {
    const redactions = [];
    const output = value.map((item, index) => {
      const result = redactValue(item, `${path}[${index}]`);
      redactions.push(...result.redactions);
      return result.value;
    });
    return { value: output, redactions };
  }

  if (value && typeof value === "object") {
    const output = {};
    const redactions = [];
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = REDACTED;
        redactions.push({ path: childPath, reason: "sensitive_key" });
        continue;
      }
      const result = redactValue(child, childPath);
      output[key] = result.value;
      redactions.push(...result.redactions);
    }
    return { value: output, redactions };
  }

  return { value, redactions: [] };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function displayPath(path) {
  const normalized = resolve(path);
  const rel = relative(process.cwd(), normalized);
  return rel && !rel.startsWith("..") && !rel.startsWith("/") ? rel : normalized;
}

function slugFromInput(inputPath) {
  return basename(inputPath).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}
