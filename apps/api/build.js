const esbuild = require("esbuild");

async function build() {
  await esbuild.context({
    entryPoints: ["./src/server.ts"],
    target: "es2022",
    platform: "node",
    outdir: "dist",
    bundle: true,
    sourcemap: true,
  });
}

build();
