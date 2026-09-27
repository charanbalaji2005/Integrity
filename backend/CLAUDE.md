# CLAUDE.md — Assessment Integrity Agent Backend

## Project Overview

Modular monolithic backend for an Assessment Integrity Agent platform. Built with Node.js, Express, TypeScript, Prisma (v7), PostgreSQL, Better Auth, Zod, and Biome.

The platform analyzes assessment submissions to detect content similarity, plagiarism risks, and AI-generated content using AI-powered workflows, LLM integrations, retrieval systems, and report generation pipelines.

---

## Commands

```bash
pnpm dev              # Start dev server (tsx watch)
pnpm build            # TypeScript compile → dist/
pnpm start            # Run compiled dist/server.js

pnpm prisma:generate  # Generate Prisma Client (run after schema changes)
pnpm prisma:migrate   # Run DB migrations (dev)
pnpm prisma:studio    # Prisma Studio GUI

pnpm check            # Biome lint + format check
pnpm check:fix        # Auto-fix Biome issues
pnpm lint             # Lint only
pnpm format           # Format only
```

**Before every PR**: `pnpm check && pnpm build`

---

## Architecture

**Modular Monolith — Feature-Based.**

```
src/
├── config/           # env.ts — validated env vars via Zod
├── constants/        # http-status.ts and app-wide constants
├── middleware/       # error-handler.ts, not-found.ts (global)
├── providers/        # auth.ts (Better Auth singleton)
├── schemas/          # Shared Zod schemas
├── services/         # Shared services
├── types/            # api.types.ts, express.d.ts
├── utils/            # app-error.ts, response.ts
├── database/         # prisma.ts (PrismaClient singleton)
│
├── features/
│   ├── health/       # GET /api/health
│   ├── authentication/
│   ├── users/
│   ├── submissions/
│   ├── integrity-analysis/
│   ├── reports/
│   └── ai-agents/
│
├── app.ts            # Express app, middleware, route mounts
└── server.ts         # DB connect + app.listen

prisma/
├── schema.prisma     # Models (no url — Prisma 7)
└── migrations/

prisma.config.ts      # Prisma 7 datasource config (DATABASE_URL for migrations)
```

**Rule:** If a file is used by only one feature → put it inside that feature. If shared → top-level directory.

---

## Request Flow

```
Request → Route → Middleware → Controller → Service → Prisma → PostgreSQL → Response
```

---

## Feature Module Structure

Each feature follows this internal layout:

```
features/<name>/
├── routes/       <name>-routes.ts
├── controllers/  <name>-controller.ts
├── services/     <name>-service.ts
├── schemas/      <action>-schema.ts
└── types/        <name>.types.ts
```

Register new feature routers in `src/app.ts`:
```ts
app.use("/api/<name>", featureRouter);
```

---

## Prisma 7 Notes

- **No `url` in `schema.prisma` datasource** — Prisma 7 removed it.
- Connection string lives in `prisma.config.ts` (for migrations) and is passed via `PrismaPg` adapter in `src/database/prisma.ts`.
- After any schema change: `pnpm prisma:generate` then `pnpm prisma:migrate`.

---

## Error Handling

Use `AppError` from `@/utils/app-error`:

```ts
throw new AppError("User not found", 404);
```

Never send raw `res.status(...).json(...)` from services. The global `errorHandler` middleware catches `AppError` and unknown errors.

---

## Response Helpers

```ts
import { sendSuccess, sendError } from "@/utils/response";

sendSuccess(res, data, "Created", 201);
sendError(res, "Not found", 404);
```

---

## Naming Conventions

| Artifact   | Convention                         |
|------------|------------------------------------|
| Files      | `kebab-case.ts`                    |
| Controllers| `<name>-controller.ts`             |
| Services   | `<name>-service.ts`                |
| Routes     | `<name>-routes.ts`                 |
| Schemas    | `<action>-<name>-schema.ts`        |
| Types      | `<name>.types.ts`                  |

---

## Key Rules

- **No `any`** — use `unknown` or proper types.
- **No DB access in controllers** — only in services.
- **Validate all input** with Zod schemas.
- **Import order** (Biome enforces): node → third-party → internal (`@/`) → relative.
- **No raw SQL** unless absolutely necessary.

---

## Environment Variables

Required (copy `.env.example` → `.env`):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://user:pass@localhost:5432/skill-gap-db"
BETTER_AUTH_SECRET="your-secret"
BETTER_AUTH_URL="http://localhost:3000"
```

`src/config/env.ts` validates all vars on startup and exits if any are missing.

---

## Health Check

```
GET /api/health
```

Returns server uptime, environment, and database connectivity status. No auth required.
