import { build } from "esbuild";

const includeTests = process.argv.includes("--test");

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: { extension: "src/extension.ts" },
  outdir: "dist",
});

await build({
  ...common,
  target: "node18",
  sourcemap: false,
  entryPoints: { hook: "src/hook/claude-hook.ts" },
  outdir: "dist",
});

if (includeTests) {
  await build({
    ...common,
    entryPoints: { "test/suite": "src/test/integration/suite.ts" },
    outdir: "out",
  });
}
