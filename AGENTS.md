# AGENTS.md

## Overview

Centravy — a multi-supplier e-commerce orchestration platform. Suppliers submit
products (photo + wholesale/retail prices), an operator validates them, and
products are distributed across multiple sales channels at per-channel prices.
Orders placed on any channel are routed back to the correct supplier.

This is NOT a marketplace: the end customer never sees the supplier, and the
supplier never sets the selling price.

Turborepo + npm workspaces monorepo. Backend is Medusa 2.0 (Node 22,
PostgreSQL, TypeScript) and is the single source of truth for all data.
Frontends are thin clients over the Medusa API.

**Architecture rule: the backend is always the middleman.** Nothing ever
happens directly between a frontend and an external service.

## Working with the Author

The author is a senior AI/ML engineer (Python, MLOps, RAG) learning TypeScript,
React, and web architecture through this project. A previous POC was built
entirely by an agent without the author retaining any understanding — that
outcome must not repeat. **Working code the author cannot explain is a failed
task.**

- **Explain the "why", not just the "what."** Web/JS/TS-specific patterns need
  explaining; general programming concepts do not.
- **Plan first, always.** Present the plan and wait for approval before writing
  code. The plan is the real review checkpoint — architectural drift is visible
  there and invisible in a 200-line diff.
- **Never expand scope silently.** A helper, an abstraction, or a dependency
  that wasn't discussed goes in the plan, not in the diff.
- **When a task is the author's to write, scaffold nothing.** Answer questions
  and review what he wrote; do not produce the implementation.
- Deliver files as complete contents with their path, not terminal heredocs.

## This Repo's Environment

Facts specific to this project and not visible from the code.

- **Everything runs in a GitHub Codespace devcontainer**
  (`typescript-node:22-bookworm`), with Postgres 16 and Redis 7 as
  docker-compose siblings. Their hosts are the compose service names `postgres`
  and `redis` — **not `localhost`**. This setup exists because the author's work
  machine has no admin rights and has restricted network access.
- **Postgres serves no SSL, and Medusa force-enables SSL for any host that
  isn't `localhost`/`127.0.0.1`.** The host is `postgres`, so the inference is
  wrong and migrations fail with a *misleading* connection timeout — the real
  error is swallowed by the migration pool. Two mechanisms compensate and
  **both are intentional**: `?sslmode=disable` in the `DATABASE_URL` exported by
  `.devcontainer/docker-compose.yml`, and the `databaseDriverOptions` block in
  `medusa-config.ts`. Do not remove either as redundant. See D-003.
- **Trust no Medusa database error at face value.** "Connection timed out" or
  "pool is probably full" during `db:migrate` is almost always a swallowed
  connection error, most often SSL.
- **The devcontainer exports `DATABASE_URL` and `REDIS_URL`.** `loadEnv` does
  not override a variable already present in the environment, so
  `apps/backend/.env` is *ignored* for those keys inside the container. Editing
  `.env` and expecting an effect is a trap — change
  `.devcontainer/docker-compose.yml` and rebuild, or export the variable for a
  single command.
- **Redis runs but Medusa does not use it yet.** `projectConfig.redisUrl` is
  unset, so Medusa logs `redisUrl not found` and falls back to in-memory
  caching, events, and locking. Deliberate current state, not a
  misconfiguration. See D-004.
- **Named Docker volumes survive a devcontainer rebuild.** Rebuilding does not
  reset the database; that requires removing the `centravy-pgdata` volume
  explicitly.
- **Backend-only for now.** `apps/supplier-portal/` and `apps/catalog/` are
  planned React + Vite apps that do not exist yet. Check before referencing
  them; never scaffold them unasked.
- **Admin dashboard is at port 9000, path `/app`.** Reachable through the
  Codespaces PORTS panel or the VSCode tunnel. `404` means the port isn't
  forwarded; `502` means the backend is restarting.
- **Codespaces quota is limited** (~30h/month on 4 cores). Don't leave
  long-running processes idling.

## Directory Structure

```text
.
├── apps/
│   └── backend/                  # Medusa application
│       ├── medusa-config.ts      # DB URL, SSL, CORS, secrets, module registration
│       └── src/
│           ├── admin/            # Admin dashboard extensions (routes/, widgets/)
│           ├── api/              # File-based routes: api/admin/*, api/store/*
│           ├── jobs/             # Scheduled jobs
│           ├── links/            # Module links (defineLink)
│           ├── modules/          # Custom modules (models + service + migrations)
│           ├── subscribers/      # Event subscribers
│           └── workflows/        # Workflows and steps
├── docs/
│   └── decisions.md              # ADRs — reasoning behind architectural choices
├── .devcontainer/                # devcontainer.json + docker-compose.yml
├── eslint.config.ts              # @medusajs/eslint-plugin recommended
└── turbo.json                    # Task graph
```

Each app may have its own nested `AGENTS.md`; agents read the nearest one in the
tree. Put app-specific context there rather than expanding this file.

## Commands

Run from the repo root unless noted. Package manager is **npm** (npm workspaces,
`package-lock.json`). Never introduce a second lockfile.

```bash
npm run dev                       # all apps via turbo
cd apps/backend && npm run dev    # backend only — port 9000, admin at /app
npm run build
npm run lint
```

### Database

```bash
cd apps/backend
npx medusa db:generate <module-name>   # generate migrations for a custom module
npx medusa db:migrate                  # run migrations
npx medusa user -e <email> -p <password>
```

An admin user is not created automatically — `medusa user` is a required manual
step on every fresh database.

There is no seed script in this install. Don't suggest one.

## Invariants

Non-negotiable. Violating one is a bug, not a style choice.

- **No direct DB access.** Always go through the module's service. Never write
  raw SQL or import a DB client in application code.
- **No cross-module imports.** Modules are isolated. Cross-module data goes
  through `defineLink` + `query.graph`, never through a direct import of another
  module's service or model.
- **Business logic lives in workflows**, not in route handlers. A route resolves
  and runs a workflow; the workflow composes steps.
- **Prices are integers, in cents, everywhere.** Backend, DB, API payloads,
  frontend. Conversion to a display string happens at render time only.
- **API errors are thrown as `MedusaError`.** Never return `{ error: ... }`.
- **Naming:** `snake_case` for DB columns and API payloads, `camelCase` for TS
  variables and functions, `PascalCase` for types and classes, `kebab-case` for
  filenames. `kebab-case` for workflow and step identifiers, matching the file name.
- **No new npm dependency without asking.** Ever.
- **Look before you write.** Before creating a module, route, link, or admin
  page, read the existing equivalent and follow its shape:
  - module → `src/modules/supplier/`
  - admin route → `src/api/admin/suppliers/route.ts`
- **Use `export` / `export default`, never `module.exports`.**
  `medusa-config.ts` uses CommonJS because it ships that way — it is not a
  model to copy.
- **No emojis** in code, comments, or commit messages.

## Medusa 2.0 Gotchas

Hard-won; re-check them on every generated diff.

- Import `MedusaRequest` / `MedusaResponse` from `@medusajs/framework/http`
  **without** the `type` keyword.
- `query.graph` linked relation names are **singular**: `product.*`, not
  `products.*`.
- `MedusaService({ Supplier })` auto-generates **pluralized** method names:
  `listSuppliers`, `createSuppliers`, `updateSuppliers`.
- Products require at least one option and one variant at creation.
- Editing a module's model without running `npx medusa db:generate <module>`
  leaves the migration missing — the change silently never applies.
- A custom module must be registered in `medusa-config.ts` under `modules` or it
  does not exist: no service, no migrations.

## Code Style

- **The backend must satisfy `@medusajs/eslint-plugin`'s recommended config**
  (`eslint.config.ts`). Its rules encode Medusa framework requirements — correct
  route, workflow, and module shapes, not just cosmetics — so a lint failure
  usually means the code is actually wrong. **Never disable a `@medusajs/*` rule
  to make lint pass; fix the code.**
- No formatter is configured. Match the style of surrounding files rather than
  reformatting them.
- Prefer explicit validation of environment variables over the non-null
  assertion (`process.env.X!`). A server should refuse to start on incomplete
  config rather than fail on the first request.

## MVP Scope

The MVP is a demo: a supplier photographs a shoe, the system generates the
product page, the operator publishes it on Store A at 850 DH, a customer buys
it, and the supplier receives the preparation request.

**IN:** supplier product submission with images · admin validation
(draft → published/rejected) · multi-channel publishing with per-channel
pricing · minimal catalog page · order routing to suppliers via
FulfillmentRequest · AI pipeline (Claude Vision) · basic usage counters.

**OUT — flag as scope creep if proposed:** full supplier authentication
(static tokens only, see D-002) · reseller portal · Stripe or real billing ·
rewards and gamification · supplier mini-sites · inventory module and reminders ·
external channel sync (Shopify, WooCommerce, Jumia, Facebook) · full Next.js
storefront · mobile app and PWA · call center.

Architectural decisions and their reasoning live in
[docs/decisions.md](./docs/decisions.md). Read the relevant ADR before touching
an area it covers — D-002 in particular, since "improving" token auth into real
auth is exactly the drift it exists to prevent.

## Medusa Skills & MCP Server

The `medusa-dev` plugin gives documentation-backed answers instead of guesses
about Medusa APIs. Load the relevant skill *before* writing code, not after:

- `building-with-medusa` — modules, API routes, workflows, data models, links
- `building-admin-dashboard-customizations` — anything under `src/admin/`
- `building-storefronts` — React/Vite frontends

If not installed:

```bash
/plugin marketplace add medusajs/medusa-agent-skills
/plugin install medusa-dev@medusa
```

**These skills encode Medusa conventions, not Centravy's.** Where they conflict
with the Invariants above, this file wins — stop and ask.

## Git Workflow

- One Linear issue = one branch = one commit scope. Branch names: `cv-16-...`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Commit before any destructive or large generative operation.**
- Run `git status --short | grep -E "\.env|node_modules"` before every commit.
  **The repository is public** — a leaked `.env` is a leaked secret.
- Never commit without the author having read the diff.

## Common Mistakes

- Using `localhost` for Postgres or Redis from inside the devcontainer.
- Removing the SSL handling in `medusa-config.ts` or `docker-compose.yml` as
  redundant.
- Editing `apps/backend/.env` to change `DATABASE_URL` inside the devcontainer —
  the exported environment variable wins and the edit appears to do nothing.
- Editing a model without running `db:generate`.
- Reaching into another module's service or model directly instead of using a
  link.
- Putting business logic in a route handler instead of a workflow.
- Storing a price as a float or a formatted string.
- Creating a helper that duplicates an existing one three folders away — search
  first.
- Introducing an abstraction for a single use case.
- Adding a dependency in passing without flagging it.
- Assuming a fresh database has an admin user.
- Referencing or scaffolding `apps/supplier-portal/` before it exists.
- Silencing a `@medusajs/*` ESLint rule instead of fixing the pattern.

## Off-Limits

- `apps/backend/.medusa/`, `dist/`, `.turbo/` — build output, regenerated.
- `package-lock.json` — never hand-edit or delete; it changes only as a side
  effect of an npm command.
- `.env` / `.env.local` — never commit, print, or copy secret values out of
  them. Document new variables in `.env.template` instead.
- Existing migrations in `src/modules/*/migrations/` — add a new one rather than
  rewriting one that may already have run.
- Destructive DB commands (drops, resets) — never without explicit confirmation.
