# 🎯 Assessment Integrity Agent - Backend

A scalable, secure, and type-safe backend powering the Assessment Integrity Agent platform. The backend handles authentication, submission analysis, plagiarism detection workflows, AI-powered integrity checks, report generation, database operations, and intelligent assessment evaluation while following modern backend engineering practices.

---

## 🚀 Tech Stack

### Core

* Node.js — JavaScript runtime
* Express.js — Web framework
* TypeScript — Type-safe backend development

### Database

* PostgreSQL — Relational database
* Prisma ORM — Type-safe database access and migrations

### Authentication

* Better Auth — Authentication and session management

### Code Quality

* Biome — Formatting, linting, and code quality enforcement

---

## 🎯 About the Project

The Assessment Integrity Agent analyzes assessment submissions to identify content similarity, plagiarism risks, and potential AI-generated content. The system leverages LLMs, retrieval pipelines, and intelligent workflows to generate comprehensive integrity reports.

The backend is responsible for:

* Authentication & Authorization
* User Management
* Submission Management
* Integrity Analysis
* AI Agent Integration
* LLM Integration
* RAG Pipeline Management
* Report Generation
* Analytics & Reporting
* API Delivery

---

## 🚀 Installation

### Prerequisites
* Node.js v20+
* PostgreSQL database
* pnpm package manager

### Setup
1. Clone the repository and navigate to the project root.
2. Install all runtime and development dependencies:
   ```bash
   pnpm install
   ```

---

## 🔐 Environment Setup

Create your local configuration by copying `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Environment Variables Description
* **`NODE_ENV`**: The execution environment stage (`development`, `production`, `test`). Defaults to `development`.
* **`PORT`**: The local port the Express application server listens on. Defaults to `3000`.
* **`DATABASE_URL`**: Relational PostgreSQL database connection URI string.
* **`BETTER_AUTH_SECRET`**: Secure cryptography secret key used by Better-Auth to sign sessions and cookies.
* **`BETTER_AUTH_URL`**: The base canonical URL where Better-Auth endpoint hooks are mounted.
* **`OPENAI_API_KEY`**: Optional API key for LLM integrations. If omitted, the system falls back to mock heuristics explanation generators.

---

## 📜 Available Scripts

Run commands via `pnpm`:

```bash
pnpm dev                 # Start Express server in hot-reload watch mode (tsx watch)
pnpm build               # Production TypeScript compiler compilation (tsc)
pnpm start               # Launch Compiled Node.js production bundle (node dist/server.js)
pnpm test                # Execute the full unit and integration test suite via Vitest
pnpm check               # Execute Biome code quality, formatting, and lint rules scan
pnpm check:fix           # Automatically repair Biome style and format discrepancies
pnpm prisma generate     # Compile Prisma Schema and generate types adapters
pnpm prisma migrate dev  # Generate and run relational database schema migrations
pnpm prisma studio       # Launch interactive database browser UI
```

---

## 🏗️ Architecture

The backend follows a **Feature-Based Architecture**.

Each feature owns its:

* Routes
* Controllers
* Services
* Schemas
* Types
* Database Queries
* Utilities
* Constants

This keeps business logic isolated and allows teams to scale features independently.

### Rule of Thumb

Before creating a file in a root-level directory, ask:

> Will this be used by multiple features?

If yes → place it in a shared/global directory.

If no → keep it inside the feature.

---

## 📂 Project Structure

```txt
src
│
├── config/                 # Application configuration
├── constants/              # Shared constants
├── middleware/             # Global middleware
├── providers/              # Shared providers
├── schemas/                # Shared schemas
├── services/               # Shared services
├── types/                  # Shared types
├── utils/                  # Shared utilities
│
├── features/
│   │
│   ├── authentication/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── types/
│   │   ├── utils/
│   │   └── constants/
│   │
│   ├── users/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── types/
│   │   └── ...
│   │
│   ├── submissions/
│   ├── integrity-analysis/
│   ├── reports/
│   └── ai-agents/
│
├── database/
│   ├── prisma.ts
│   └── index.ts
│
├── app.ts
├── server.ts
└── ...
│
prisma/
├── schema.prisma
└── migrations/
```

---

## 📁 Folder Responsibilities

| Folder     | Responsibility                              |
| ---------- | ------------------------------------------- |
| features   | Feature-specific business logic             |
| middleware | Global middleware                           |
| providers  | Shared providers                            |
| types      | Shared TypeScript types                     |
| schemas    | Shared validation schemas                   |
| services   | Shared services                             |
| utils      | Shared utility functions                    |
| constants  | Application-wide constants                  |
| config     | Environment and application configuration   |
| database   | Prisma configuration and database utilities |

---

## 🔄 Request Flow

```txt
Request
   ↓
Route
   ↓
Middleware
   ↓
Controller
   ↓
Service
   ↓
Prisma ORM
   ↓
PostgreSQL
   ↓
Response
```

---

## 🔐 Authentication Strategy

Authentication is powered by Better Auth.

Features include:

* Email & Password Authentication
* Session Management
* Secure Cookie Handling
* OAuth Support
* Protected Routes
* Role-Based Access Control
* User Session Validation

Authentication-related logic should remain inside:

```txt
features/authentication/
```

---

## 🗄️ Database Strategy

All database operations must be performed through Prisma.

### Database Flow

```txt
Schema
   ↓
Migration
   ↓
Database
   ↓
Prisma Client
   ↓
Service Layer
```

### Rules

✅ Use Prisma Client

✅ Keep queries inside services

❌ Avoid database access inside controllers

❌ Avoid raw SQL unless absolutely necessary

---

## 📝 Validation Rules

All incoming requests must be validated.

Use Zod schemas for:

* Request Body
* Query Parameters
* Route Parameters

Example:

```ts
const createSubmissionSchema = z.object({
  title: z.string(),
  content: z.string(),
  fileType: z.string().optional(),
});
```

Controllers should never trust incoming data.

---

## 📐 Development Guidelines

### File Naming

Use **kebab-case** for all files and folders.

✅ Good

```txt
integrity-analysis-service.ts
create-submission-schema.ts
submission-controller.ts
```

❌ Bad

```txt
IntegrityAnalysisService.ts
CreateSubmissionSchema.ts
SubmissionController.ts
```

---

### Controller Naming

```txt
auth-controller.ts
submission-controller.ts
integrity-analysis-controller.ts
```

---

### Service Naming

```txt
auth-service.ts
submission-service.ts
integrity-analysis-service.ts
```

---

### Schema Naming

```txt
login-schema.ts
create-submission-schema.ts
integrity-report-schema.ts
```

---

### Route Naming

```txt
auth-routes.ts
submission-routes.ts
integrity-analysis-routes.ts
```

---

### Type Naming

```txt
user.types.ts
submission.types.ts
integrity-report.types.ts
```

---

### Import Order

```ts
// Node modules
import express from "express";

// Third-party packages
import { z } from "zod";

// Internal modules
import { authService } from "@/features/authentication/services/auth-service";

// Relative imports
import "./some-file";
```

---

### Controller Rules

Controllers should only:

* Receive requests
* Validate input
* Call services
* Return responses

Keep business logic out of controllers.

---

### Service Rules

Services should contain:

* Business logic
* Database interactions
* External integrations
* Domain-specific operations

---

### Error Handling Rules

Use centralized error handling.

✅ Good

```ts
throw new AppError("User not found", 404);
```

❌ Avoid

```ts
res.status(500).json({
  message: "Something went wrong",
});
```

inside services.

---

### TypeScript Rules

* Avoid `any`
* Prefer `unknown`
* Use strict typing
* Define reusable types
* Keep feature-specific types inside features

---

## 🛡️ Security Guidelines

* Never expose secrets in code
* Store configuration in environment variables
* Validate all incoming data
* Protect authenticated routes
* Sanitize user input
* Use secure cookies
* Follow least-privilege principles

---

## 🎯 Development Principles

* Type Safety First
* Feature-Based Architecture
* Service-Oriented Design
* Separation of Concerns
* Secure by Default
* Clean Code Practices
* Maintainability Over Cleverness
* Scalability Over Short-Term Convenience

---

## ✅ Pull Request Checklist

Before creating a PR:

```bash
pnpm check
pnpm build
```

Ensure:

* No TypeScript errors
* No linting issues
* Build succeeds
* Database migrations are included
* New code follows project conventions
* Feature-specific code remains inside its feature directory

---

## 🤝 Support & Contribute

If you found this project helpful, consider giving it a ⭐ on GitHub.

Contributions, suggestions, and improvements are always welcome.
