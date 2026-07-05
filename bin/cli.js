#!/usr/bin/env node
"use strict";

/**
 * api-kit scaffolder. Generates a runnable starter backend wired with
 * createApiKit + createApp + a CRUD resource + live OpenAPI + graceful shutdown.
 *
 *   npx @hectordahv/api-kit new my-api
 */

const fs = require("fs");
const path = require("path");

const PKG_VERSION = require("../package.json").version;

function die(msg) {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) args.flags[a.slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
    else args._.push(a);
  }
  return args;
}

function write(root, rel, contents) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  console.log(`  \x1b[32m+\x1b[0m ${rel}`);
}

function scaffold(dir, name) {
  const root = path.resolve(process.cwd(), dir);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) die(`Directory "${dir}" exists and is not empty`);
  fs.mkdirSync(root, { recursive: true });
  console.log(`\nScaffolding \x1b[1m${name}\x1b[0m in ${root}\n`);

  write(root, "package.json", JSON.stringify(pkgJson(name), null, 2) + "\n");
  write(root, "tsconfig.json", tsconfig());
  write(root, ".gitignore", "node_modules/\ndist/\n.env\n*.log\n");
  write(root, ".env.example", envExample());
  write(root, "README.md", `# ${name}\n\nGenerated with @hectordahv/api-kit.\n\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpm run dev\n# → http://localhost:3000/docs\n\`\`\`\n`);
  write(root, "src/config/kit.ts", kitTs(name));
  write(root, "src/widgets/widget.schema.ts", widgetSchemaTs());
  write(root, "src/widgets/widget.routes.ts", widgetRoutesTs());
  write(root, "src/app.ts", appTs(name));
  write(root, "src/server.ts", serverTs());

  console.log(`\n\x1b[1mDone.\x1b[0m Next:\n`);
  console.log(`  cd ${dir}`);
  console.log(`  npm install`);
  console.log(`  cp .env.example .env`);
  console.log(`  npm run dev        \x1b[2m# then open http://localhost:3000/docs\x1b[0m\n`);
}

// --- templates ---------------------------------------------------------------

function pkgJson(name) {
  return {
    name,
    version: "0.1.0",
    private: true,
    type: "commonjs",
    scripts: {
      dev: "ts-node src/server.ts",
      build: "tsc",
      start: "node dist/server.js",
    },
    dependencies: {
      // Pinned exact: api-kit is in alpha, so a caret over a prerelease would
      // silently pull unreviewed builds. Bump deliberately.
      "@hectordahv/api-kit": PKG_VERSION,
      dotenv: "^16.4.5",
      express: "^4.21.2",
      joi: "^17.13.3",
    },
    devDependencies: {
      "@types/express": "^4.17.21",
      "@types/node": "^20.17.0",
      "ts-node": "^10.9.2",
      typescript: "^5.7.2",
    },
  };
}

function tsconfig() {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2021",
        // node16 reads the package "exports" map correctly (api-kit ships subpath
        // exports like /app, /crud, /openapi). Emits CJS since package type=commonjs.
        module: "node16",
        moduleResolution: "node16",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "dist",
        rootDir: "src",
      },
      include: ["src"],
    },
    null,
    2,
  ) + "\n";
}

function envExample() {
  return ["PORT=3000", "NODE_ENV=development", "JWT_KEY=change-me-access", "JWT_REFRESH_KEY=change-me-refresh", ""].join("\n");
}

function kitTs(name) {
  return `import { createApiKit } from "@hectordahv/api-kit";

// One configured instance shared across the app. No global state.
export const kit = createApiKit({
  service: ${JSON.stringify(name)},
  environment: process.env.NODE_ENV,
});

export const { logger, responses, requireUserId, validateSchema } = kit;
`;
}

function widgetSchemaTs() {
  return `import Joi from "joi";

// These schemas drive BOTH request validation and the OpenAPI docs.
export const CreateWidgetSchema = Joi.object({
  name: Joi.string().min(1).required(),
  color: Joi.string().valid("red", "green", "blue").default("blue"),
});

export const UpdateWidgetSchema = Joi.object({
  name: Joi.string().min(1),
  color: Joi.string().valid("red", "green", "blue"),
});
`;
}

function widgetRoutesTs() {
  return `import type { IRouter } from "express";

import { CrudService, createCrudController, registerCrudRoutes, type CrudRepository, type BaseEntity } from "@hectordahv/api-kit/crud";
import { documentCrudResource, type OpenApiRegistry } from "@hectordahv/api-kit/openapi";

import { kit } from "../config/kit";
import { CreateWidgetSchema, UpdateWidgetSchema } from "./widget.schema";

interface Widget extends BaseEntity {
  name?: string;
  color?: string;
}

/**
 * In-memory repository so the starter runs with no database.
 * Swap this for a SoftDeleteUserScopedRepository over your Prisma model:
 *
 *   new SoftDeleteUserScopedRepository<Widget>({ delegate: prisma.widgets, mapper })
 */
class MemoryWidgetRepository implements CrudRepository<Widget> {
  private rows: Widget[] = [];
  async findById(id: string) { return this.rows.find((w) => w.id === id && w.status !== "deleted") ?? null; }
  async findByIdAndUserId(id: string, userId: string) { return this.rows.find((w) => w.id === id && w.userId === userId && w.status !== "deleted") ?? null; }
  async findAll() { return this.rows.filter((w) => w.status !== "deleted"); }
  async findAllByUserId(userId: string) { return this.rows.filter((w) => w.userId === userId && w.status !== "deleted"); }
  async findPaginatedByUserId(userId: string, page: number, limit: number) {
    const items = this.rows.filter((w) => w.userId === userId && w.status !== "deleted");
    return { items: items.slice((page - 1) * limit, page * limit), total: items.length };
  }
  async create(entity: Widget) { const row = { ...entity, id: \`w_\${Date.now()}_\${Math.random().toString(36).slice(2, 6)}\` }; this.rows.push(row); return row; }
  async update(id: string, entity: Partial<Widget>) { const row = this.rows.find((w) => w.id === id); if (!row) return null; Object.assign(row, entity); return row; }
  async remove(id: string) { const row = this.rows.find((w) => w.id === id); if (row) row.status = "deleted"; }
}

export function registerWidgetRoutes(router: IRouter, openapi: OpenApiRegistry) {
  const service = new CrudService<Widget>(new MemoryWidgetRepository());
  const controller = createCrudController<Widget>({ resource: "Widget", service, responses: kit.responses, requireUserId: kit.requireUserId });

  registerCrudRoutes(router, {
    basePath: "/api/v1/widgets",
    controller,
    // Add auth when ready: auth: kit.validateToken({ getKey: () => process.env.JWT_KEY! }),
    validate: { create: kit.validateSchema(CreateWidgetSchema), update: kit.validateSchema(UpdateWidgetSchema) },
    enablePaginated: true,
  });

  documentCrudResource({
    registry: openapi,
    basePath: "/api/v1/widgets",
    tag: "Widgets",
    dtoName: "Widget",
    createSchema: CreateWidgetSchema,
    updateSchema: UpdateWidgetSchema,
    paginated: true,
    secured: false,
  });
}
`;
}

function appTs(name) {
  return `import express from "express";

import { createApp, finalizeApp } from "@hectordahv/api-kit/app";
import { createOpenApiRoutes, OpenApiRegistry } from "@hectordahv/api-kit/openapi";

import { kit } from "./config/kit";
import { registerWidgetRoutes } from "./widgets/widget.routes";

const { app } = createApp({ kit, apiPrefix: "/api/v1" });

// Demo: pretend a user is authenticated (replace with kit.validateToken).
app.use((req, _res, next) => { req.headers.userId = req.header("x-user") ?? "demo-user"; next(); });

const openapi = new OpenApiRegistry({ title: ${JSON.stringify(name)}, version: "1.0.0" });
registerWidgetRoutes(app, openapi);
createOpenApiRoutes(app, { registry: openapi, introspect: app });

finalizeApp(app, { errors: kit.errors });

export { app };
`;
}

function serverTs() {
  return `import "dotenv/config"; // load .env before anything reads process.env

import { createHttpServer, runStartupTasks } from "@hectordahv/api-kit/server";

import { app } from "./app";
import { kit } from "./config/kit";

async function main() {
  await runStartupTasks(
    [{ name: "warm-up", run: () => { kit.logger.info("starting…"); } }],
    { logger: kit.logger },
  );

  createHttpServer(app, {
    port: Number(process.env.PORT) || 3000,
    logger: kit.logger,
    onShutdown: [/* () => prisma.$disconnect(), () => redis.quit() */],
  }).listen();
}

void main();
`;
}

// --- entry -------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === "help" || args.flags.help) {
    console.log(`api-kit v${PKG_VERSION}\n\nUsage:\n  npx @hectordahv/api-kit new <dir> [--name <pkg-name>]\n`);
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === "new") {
    const dir = args._[1];
    if (!dir) die("Missing target directory. Usage: api-kit new <dir>");
    const name = typeof args.flags.name === "string" ? args.flags.name : path.basename(dir);
    scaffold(dir, name);
    return;
  }

  die(`Unknown command "${cmd}". Run "api-kit help".`);
}

main();
