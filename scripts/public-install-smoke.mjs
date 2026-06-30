#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

function main() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "agentport-public-install-"));
  const packDir = path.join(tempRoot, "pack");
  const installDir = path.join(tempRoot, "install");
  const issues = [];
  let pack;

  try {
    mkdirSync(packDir, { recursive: true });
    mkdirSync(installDir, { recursive: true });
    pack = npmPack(packDir);
    run("npm", ["install", "--prefix", installDir, "--ignore-scripts", "--no-audit", "--no-fund", pack.tarballPath], {
      step: "install_tarball"
    });

    const importSmoke = runImportSmoke(installDir);
    issues.push(...importSmoke.issues);

    const cliSmoke = runCliSmoke(installDir);
    issues.push(...cliSmoke.issues);

    const report = {
      type: "agentport.public_install_smoke.v0.1",
      ok: issues.length === 0,
      package: {
        name: pack.name,
        version: pack.version,
        filename: pack.filename
      },
      checks: {
        installedPublicExports: importSmoke.installedPublicExports,
        rejectedPrivateExports: importSmoke.rejectedPrivateExports,
        cliCommand: cliSmoke.command,
        cliReportOk: cliSmoke.reportOk,
        cliProfile: cliSmoke.profile
      },
      issues
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const report = {
      type: "agentport.public_install_smoke.v0.1",
      ok: false,
      package: pack ? {
        name: pack.name,
        version: pack.version,
        filename: pack.filename
      } : null,
      issues: [{
        code: "public_install_smoke_error",
        message: error instanceof Error ? error.message : String(error)
      }]
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function npmPack(packDir) {
  const result = run("npm", ["pack", "--json", "--pack-destination", packDir], {
    step: "npm_pack"
  });
  const parsed = JSON.parse(result.stdout);
  const pack = parsed[0];
  if (!pack?.filename || !pack?.name || !pack?.version) {
    throw new Error("npm pack did not return package metadata");
  }
  return {
    name: pack.name,
    version: pack.version,
    filename: pack.filename,
    tarballPath: path.join(packDir, pack.filename)
  };
}

function runImportSmoke(installDir) {
  const installedPublicExports = [];
  const rejectedPrivateExports = [];
  const code = `
    const results = {
      publicExports: [],
      rejectedPrivateExports: []
    };

    const core = await import("@agentport/engine");
    if (typeof core.deriveBindingId !== "function") {
      throw new Error("missing core deriveBindingId export");
    }
    results.publicExports.push("@agentport/engine");

    const server = await import("@agentport/engine/server");
    if (typeof server.createAgentPortRequestHandler !== "function") {
      throw new Error("missing server createAgentPortRequestHandler export");
    }
    results.publicExports.push("@agentport/engine/server");

    const fixture = await import("@agentport/engine/adapters/fixture");
    if (typeof fixture.FixtureAdapter !== "function") {
      throw new Error("missing fixture adapter export");
    }
    results.publicExports.push("@agentport/engine/adapters/fixture");

    const blocked = [
      "@agentport/engine/conversion",
      "@agentport/engine/verification"
    ];
    for (const specifier of blocked) {
      try {
        await import(specifier);
        throw new Error("private export unexpectedly resolved: " + specifier);
      } catch (error) {
        if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
          throw error;
        }
        results.rejectedPrivateExports.push(specifier);
      }
    }

    console.log(JSON.stringify(results));
  `;
  const result = run(process.execPath, ["--input-type=module", "-e", code], {
    cwd: installDir,
    step: "import_public_exports"
  });
  const parsed = JSON.parse(result.stdout);
  installedPublicExports.push(...parsed.publicExports);
  rejectedPrivateExports.push(...parsed.rejectedPrivateExports);
  return {
    installedPublicExports,
    rejectedPrivateExports,
    issues: []
  };
}

function runCliSmoke(installDir) {
  const bin = path.join(installDir, "node_modules", ".bin", process.platform === "win32" ? "agentport.cmd" : "agentport");
  const input = path.join(installDir, "node_modules", "@agentport", "engine", "examples", "protocol-v0.2");
  const args = ["conformance", "gateway", "--input", input, "--expect-tamper-failures"];
  const result = run(bin, args, {
    cwd: installDir,
    step: "run_public_cli"
  });
  const report = JSON.parse(result.stdout);
  const profile = report.roleProfiles?.find?.((entry) => entry.role === "gateway");
  const issues = [];

  if (report.ok !== true) {
    issues.push({
      code: "public_cli_report_not_ok",
      ok: report.ok
    });
  }
  if (profile?.ok !== true) {
    issues.push({
      code: "public_cli_gateway_profile_not_ok",
      profileId: profile?.profileId ?? null
    });
  }

  return {
    command: `agentport ${args.join(" ")}`,
    reportOk: report.ok === true,
    profile: profile ? {
      profileId: profile.profileId,
      role: profile.role,
      ok: profile.ok
    } : null,
    issues
  };
}

function run(command, args, { cwd = process.cwd(), step }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${step} failed with status ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result;
}

main();
