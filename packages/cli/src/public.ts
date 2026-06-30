#!/usr/bin/env node
import { runProtocolV02Conformance } from "../../../scripts/protocol-v02-conformance.mjs";

type ProtocolConformanceRole = "gateway" | "plugin" | "frontier-host" | "host" | "adapter" | "business-port" | "registry";

interface ProtocolConformanceOptions {
  role: ProtocolConformanceRole;
  input: string;
  expectTamperFailures: boolean;
}

const protocolConformanceProfileByRole: Record<ProtocolConformanceRole, "gateway" | "pluginWallet" | "frontierHost" | "adapter" | "businessPort" | "registry"> = {
  gateway: "gateway",
  plugin: "pluginWallet",
  "frontier-host": "frontierHost",
  host: "frontierHost",
  adapter: "adapter",
  "business-port": "businessPort",
  registry: "registry"
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "conformance") {
    await runProtocolConformance(parseProtocolConformanceOptions(rest));
    return;
  }

  if (command === "--help" || command === "-h" || command === undefined) {
    printHelp();
    process.exit(0);
  }

  throw new Error(`Unknown public AgentPort command: ${command}`);
}

async function runProtocolConformance(options: ProtocolConformanceOptions) {
  const report = await runProtocolV02Conformance({
    input: options.input,
    expectTamperFailures: options.expectTamperFailures,
    profile: protocolConformanceProfileByRole[options.role]
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function parseProtocolConformanceOptions(args: string[]): ProtocolConformanceOptions {
  const [roleRaw, ...rest] = args;
  if (!roleRaw) {
    throw new Error("conformance role is required: gateway, plugin, frontier-host, adapter, business-port, or registry");
  }
  const options: ProtocolConformanceOptions = {
    role: parseProtocolConformanceRole(roleRaw),
    input: "examples/protocol-v0.2",
    expectTamperFailures: true
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--input") {
      options.input = requireValue(rest, (index += 1), "--input");
    } else if (arg === "--expect-tamper-failures") {
      options.expectTamperFailures = true;
    } else if (arg === "--no-expect-tamper-failures") {
      options.expectTamperFailures = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseProtocolConformanceRole(value: string): ProtocolConformanceRole {
  const roles: ProtocolConformanceRole[] = ["gateway", "plugin", "frontier-host", "host", "adapter", "business-port", "registry"];
  if (!roles.includes(value as ProtocolConformanceRole)) {
    throw new Error("conformance role must be gateway, plugin, frontier-host, adapter, business-port, or registry");
  }

  return value as ProtocolConformanceRole;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function printHelp() {
  console.log(`AgentPort Protocol Engine

Usage:
  agentport conformance <gateway|plugin|frontier-host|adapter|business-port|registry> [--input examples/protocol-v0.2] [--no-expect-tamper-failures]

This public package binary is limited to open protocol compatibility checks.
Hosted operator, owner-workflow, issuer-dev, vendor-deployment, and pilot commands
belong to AgentPort hosted tooling, not the public engine package.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
