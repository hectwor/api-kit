import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/errors/index.ts",
    "src/http/index.ts",
    "src/logging/index.ts",
    "src/middleware/index.ts",
    "src/validation/index.ts",
    "src/auth/index.ts",
    "src/routes/index.ts",
    "src/config/index.ts",
    "src/app/index.ts",
    "src/crud/index.ts",
    "src/server/index.ts",
    "src/openapi/index.ts",
    "src/modules/activity-log/index.ts",
    "src/modules/parameter-catalog/index.ts",
    "src/modules/health/index.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  target: "node20",
  splitting: false,
});
