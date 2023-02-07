#!/usr/bin/env tnode
import { rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { build, BuildOptions } from "esbuild";

import * as packageJSON from "../package.json";

const dev = process.argv.includes("--dev");

rmSync("dist", { force: true, recursive: true });

const serverOptions: BuildOptions = {
  bundle: true,
  platform: "node",
  target: "node14",
  legalComments: "inline",
  external: Object.keys(packageJSON.peerDependencies).concat(
    Object.keys(packageJSON.dependencies),
  ),
  watch: dev,
};

Promise.all([
  build({
    entryPoints: ["src/refresh-runtime.js"],
    outdir: "dist",
    platform: "browser",
    format: "esm",
    target: "safari13",
    legalComments: "inline",
    watch: dev,
  }),
  build({
    ...serverOptions,
    stdin: {
      contents: `import react from "./src";
module.exports = react;
// For backward compatibility with the first broken version
module.exports.default = react;`,
      resolveDir: ".",
    },
    outfile: "dist/index.cjs",
    logOverride: { "empty-import-meta": "silent" },
  }),
  build({
    ...serverOptions,
    entryPoints: ["src/index.ts"],
    format: "esm",
    outfile: "dist/index.mjs",
  }),
]).then(() => {
  execSync("cp LICENSE README.md dist/");

  execSync(
    "tsc src/index.ts --declaration --emitDeclarationOnly --outDir dist --module es2020 --moduleResolution node",
  );

  writeFileSync(
    "dist/package.json",
    JSON.stringify(
      {
        name: "@poprize/plugin-vite",
        description: "Poprize react with SWC",
        version: packageJSON.version,
        author: "Jonatas Borges (https://github.com/jonataslaw)",
        license: "MIT",
        private: false,
        repository: "github:poprize/vite-plugin",
        main: "index.cjs",
        types: "index.d.ts",
        module: "index.mjs",
        exports: {
          ".": {
            require: "./index.cjs",
            types: "./index.d.ts",
            import: "./index.mjs",
          },
        },
        keywords: [
          "vite",
          "vite-plugin",
          "poprize",
          "react",
          "swc",
          "react-refresh",
          "fast refresh",
        ],
        peerDependencies: packageJSON.peerDependencies,
        dependencies: packageJSON.dependencies,
      },
      null,
      2,
    ),
  );
});
