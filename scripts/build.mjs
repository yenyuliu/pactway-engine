import { chmod, mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const outDir = await mkdtemp(resolve(".dist-build-"));
const previousDistDir = await mkdtemp(resolve(".dist-previous-"));
await rm(previousDistDir, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  packages: "external"
};

try {
  await Promise.all([
    build({ ...common, entryPoints: ["packages/core/src/index.ts"], outfile: join(outDir, "core/index.js") }),
    build({ ...common, entryPoints: ["packages/adapters/manual/src/index.ts"], outfile: join(outDir, "adapters/manual/index.js") }),
    build({ ...common, entryPoints: ["packages/adapters/fixture/src/index.ts"], outfile: join(outDir, "adapters/fixture/index.js") }),
    build({ ...common, entryPoints: ["packages/adapters/square/src/index.ts"], outfile: join(outDir, "adapters/square/index.js") }),
    build({ ...common, entryPoints: ["packages/server/src/public.ts"], outfile: join(outDir, "server/index.js") }),
    build({ ...common, entryPoints: ["packages/server/src/public.ts"], outfile: join(outDir, "server/public.js") }),
    build({ ...common, entryPoints: ["packages/cli/src/public.ts"], outfile: join(outDir, "cli/index.js") }),
    build({ ...common, entryPoints: ["packages/cli/src/public.ts"], outfile: join(outDir, "cli/public.js") })
  ]);

  await chmod(join(outDir, "cli/index.js"), 0o755);
  await chmod(join(outDir, "cli/public.js"), 0o755);
  await rm(previousDistDir, { recursive: true, force: true });
  let movedPreviousDist = false;
  try {
    await rename("dist", previousDistDir);
    movedPreviousDist = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await rename(outDir, "dist");
  } catch (error) {
    if (movedPreviousDist) await rename(previousDistDir, "dist").catch(() => {});
    throw error;
  }
  await rm(previousDistDir, { recursive: true, force: true });
} catch (error) {
  await rm(outDir, { recursive: true, force: true });
  await rm(previousDistDir, { recursive: true, force: true });
  throw error;
}
