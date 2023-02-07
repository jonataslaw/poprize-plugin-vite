import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { SourceMapPayload } from "module";
import { Output, ParserConfig, transform } from "@swc/core";
import { PluginOption } from "vite";

const runtimePublicPath = "/@react-refresh";

const preambleCode = `import { injectIntoGlobalHook } from "__PATH__";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`;

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const refreshContentRE = /\$Refresh(?:Reg|Sig)\$\(/;

type Options = {
  /**
   * Control where the JSX factory is imported from.
   * @default "@poprize/react"
   */
  jsxImportSource?: string;
};

const react = (
  options: Options = {
    jsxImportSource: "@poprize/react",
  },
): PluginOption[] => [
  {
    name: "vite:react-swc",
    apply: "serve",
    config: () => ({
      esbuild: false,
      optimizeDeps: { include: [`${options.jsxImportSource}/jsx-dev-runtime`] },
    }),
    resolveId: (id) => (id === runtimePublicPath ? id : undefined),
    load: (id) =>
      id === runtimePublicPath
        ? readFileSync(join(_dirname, "refresh-runtime.js"), "utf-8")
        : undefined,
    transformIndexHtml: (_, config) => [
      {
        tag: "script",
        attrs: { type: "module" },
        children: preambleCode.replace(
          "__PATH__",
          config.server!.config.base + runtimePublicPath.slice(1),
        ),
      },
    ],
    async transform(code, _id, transformOptions) {
      const id = _id.split("?")[0];
      if (id.includes("node_modules")) return;
      const isTsx = id.endsWith(".tsx");
      const isJsx = id.endsWith(".jsx");

      const parser: ParserConfig | undefined = isTsx
        ? { syntax: "typescript", tsx: true }
        : id.endsWith(".ts")
        ? { syntax: "typescript", tsx: false }
        : isJsx
        ? { syntax: "ecmascript", jsx: true }
        : undefined;
      if (!parser) return;

      let result: Output;

      try {
        if (isTsx || isJsx) {
          code =
            `import { jsx, Fragment } from "${options.jsxImportSource}/jsx-runtime";\n` +
            code;
        }

        result = await transform(code, {
          filename: id,
          swcrc: false,
          configFile: false,
          sourceMaps: true,
          jsc: {
            target: "es2020",
            parser,
            transform: {
              useDefineForClassFields: true,
              react: {
                refresh: !transformOptions?.ssr,
                development: false,
                useBuiltins: true,
                pragma: "jsx",
                pragmaFrag: "Fragment",
                importSource: options?.jsxImportSource,
                runtime: "classic",
              },
            },
          },
        });
      } catch (e: any) {
        const message: string = e.message;
        const fileStartIndex = message.indexOf("╭─[");
        if (fileStartIndex !== -1) {
          const match = message.slice(fileStartIndex).match(/:(\d+):(\d+)]/);
          if (match) {
            e.line = match[1];
            e.column = match[2];
          }
        }
        throw e;
      }

      if (transformOptions?.ssr || !refreshContentRE.test(result.code)) {
        return result;
      }

      result.code = `import * as RefreshRuntime from "${runtimePublicPath}";

if (!window.$RefreshReg$) throw new Error("React refresh preamble was not loaded. Something is wrong.");
const prevRefreshReg = window.$RefreshReg$;
const prevRefreshSig = window.$RefreshSig$;
window.$RefreshReg$ = RefreshRuntime.getRefreshReg("${id}");
window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;

${result.code}

window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
import(/* @vite-ignore */ import.meta.url).then((currentExports) => {
  RefreshRuntime.registerExportsForReactRefresh("${id}", currentExports);
  import.meta.hot.accept((nextExports) => {
    if (!nextExports) return;
    const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate(currentExports, nextExports);
    if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
  });
});
  `;

      const sourceMap: SourceMapPayload = JSON.parse(result.map!);
      sourceMap.mappings = ";;;;;;;;" + sourceMap.mappings;
      return { code: result.code, map: sourceMap };
    },
  },
  {
    name: "vite:react-swc",
    apply: "build",
    config: () => ({
      esbuild: {
        jsxInject: `import { jsx, Fragment } from '${options?.jsxImportSource}/jsx-runtime'`,
        jsx: "transform",
        jsxFactory: "jsx",
        jsxFragment: "Fragment",
        jsxImportSource: options?.jsxImportSource,
        tsconfigRaw: { compilerOptions: { useDefineForClassFields: true } },
      },
    }),
  },
];

export default react;
