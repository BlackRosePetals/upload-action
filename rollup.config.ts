import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";

const config = {
  input: "src/index.ts",
  output: {
    esModule: true,
    file: "dist/index.js",
    format: "es",
    sourcemap: true,
    footer: "run();", // Call run() in bundle for GitHub Actions, but not in source for local-action
  },
  plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs(), json(), terser()],
};

export default config;
