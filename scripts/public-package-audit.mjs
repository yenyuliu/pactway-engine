#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const blockedPathPatterns = [
  /^packages\/conversion\//,
  /^packages\/verification\//,
  /^dist\/conversion\//,
  /^dist\/verification\//,
  /^dist\/cli\/index\./,
  /^dist\/server\/index\./,
  /^artifacts\/vendor\//,
  /^docs\/feedback\//,
  /^docs\/.*-plan\.md$/,
  /^examples\/presentation-/,
  /^schemas\/agentport-presentation-/,
  /^schemas\/agentport-business-copilot-/
];

const requiredPackedFiles = [
  "package.json",
  "dist/cli/public.js",
  "dist/server/public.js",
  "dist/core/index.js",
  "docs/open-source-boundary-decision.md",
  "docs/public-private-pr-publishing.md",
  "docs/agentport-protocol-v0.2.md",
  "docs/agentport-protocol-governance-v0.2.md",
  "docs/agentport-open-standard-v0.2-external-review-checklist.md",
  "docs/agentport-open-standard-v0.2-release-notes.md",
  "docs/agentport-open-standard-v0.2-stable-cut-review.md",
  "examples/implementer-kit/protocol-cut.v0.2.json",
  "examples/implementer-kit/protocol-external-review.v0.2.json",
  "examples/implementer-kit/protocol-external-review-result.v0.2.json",
  "examples/implementer-kit/protocol-governance.v0.2.json",
  "examples/implementer-kit/protocol-publication.v0.2.json",
  "examples/implementer-kit/protocol-stable-publication.v0.2.json",
  "examples/protocol-v0.2/golden-ticket-proof-routing.json",
  "schemas/agentport-protocol-conformance-report.v0.2.schema.json",
  "schemas/agentport-protocol-cut-manifest.schema.json",
  "schemas/agentport-protocol-external-review.schema.json",
  "schemas/agentport-protocol-external-review-result.schema.json",
  "schemas/agentport-protocol-governance.schema.json",
  "schemas/agentport-protocol-publication.schema.json",
  "schemas/agentport-protocol-stable-publication.schema.json"
];

const blockedPublicBundleStrings = [
  "packages/conversion",
  "packages/verification",
  "operator-flow",
  "ANTHROPIC_API_KEY",
  "owner-proof",
  "presentation_evidence",
  "BusinessCopilot",
  "vendor-artifacts",
  "issuer-web",
  "chatgpt-app-hosted-evidence"
];

const publicBundles = [
  "dist/cli/public.js",
  "dist/cli/public.js.map",
  "dist/server/public.js",
  "dist/server/public.js.map"
];

function main() {
  const protocolCutManifest = JSON.parse(readFileSync("examples/implementer-kit/protocol-cut.v0.2.json", "utf8"));
  const protocolCutRefs = protocolCutManifestRefs(protocolCutManifest);
  const pack = npmPackDryRun();
  const files = pack.files.map((file) => file.path).sort();
  const packed = new Set(files);
  const issues = [];

  for (const file of files) {
    for (const pattern of blockedPathPatterns) {
      if (pattern.test(file)) {
        issues.push({
          code: "blocked_path_packed",
          path: file,
          pattern: pattern.toString()
        });
      }
    }
  }

  for (const file of requiredPackedFiles) {
    if (!packed.has(file)) {
      issues.push({
        code: "required_public_file_missing",
        path: file
      });
    }
  }

  for (const file of protocolCutRefs) {
    if (!packed.has(file)) {
      issues.push({
        code: "protocol_cut_ref_not_packed",
        path: file
      });
    }
  }

  for (const file of publicBundles) {
    if (!packed.has(file)) {
      issues.push({
        code: "public_bundle_not_packed",
        path: file
      });
      continue;
    }

    const text = readFileSync(file, "utf8");
    for (const needle of blockedPublicBundleStrings) {
      if (text.includes(needle)) {
        issues.push({
          code: "hosted_string_in_public_bundle",
          path: file,
          needle
        });
      }
    }
  }

  const report = {
    type: "agentport.public_package_audit.v0.1",
    ok: issues.length === 0,
    package: {
      name: pack.name,
      version: pack.version,
      entryCount: pack.entryCount,
      unpackedSize: pack.unpackedSize
    },
    checks: {
      blockedPathPatterns: blockedPathPatterns.map(String),
      requiredPackedFiles,
      protocolCutRefs,
      publicBundles,
      blockedPublicBundleStrings
    },
    issues
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function protocolCutManifestRefs(manifest) {
  const refs = [
    manifest.standardDraft,
    manifest.governancePolicy,
    manifest.publicationStatus,
    ...manifest.roles.map((role) => role.doc),
    ...manifest.artifacts.docs,
    ...manifest.artifacts.schemas,
    ...manifest.artifacts.reports,
    ...manifest.artifacts.examples,
    ...manifest.artifacts.scripts
  ].filter(Boolean);
  return [...new Set(refs)].sort();
}

function npmPackDryRun() {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `npm pack failed with status ${result.status}`);
  }

  const parsed = JSON.parse(result.stdout);
  const pack = parsed[0];
  if (!pack || !Array.isArray(pack.files)) {
    throw new Error("npm pack did not return a file list");
  }

  return pack;
}

main();
