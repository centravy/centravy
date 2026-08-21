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

- **Everything runs in a devcontainer** (`typescript-node:22-bookworm`), with
  Postgres 16 and Redis 7 as docker-compose siblings. Their hosts are the
  compose service names `postgres` and `redis` — **not `localhost`**. One
  `.devcontainer/` serves both GitHub Codespaces and a local container on
  Docker or OrbStack: same service names, same URLs, nothing to reconfigure.
  Codespaces exists because the author's work machine has no admin rights and
  has restricted network access; local is the default on his own machine.
- **The compose file mounts the repo, not its parent** —
  `..:/workspaces/centravy`, not the stock template's `../..:/workspaces`, which
  locally would expose every sibling checkout to the container. See E-002.
- **A fresh container installs dependencies and seeds `.env` itself** via
  `postCreateCommand`. The `cp -n` never clobbers, so an existing `.env`
  survives a rebuild.
- **The machine sits behind a TLS-inspecting proxy, and this breaks builds but
  not runtime.** OrbStack injects the host trust store into *running*
  containers, so `docker run ... curl https://...` returns 200 — but
  **BuildKit does not**, so the same call inside a `docker build` fails with
  `curl: (60) ... unable to get local issuer certificate`. Devcontainer
  **features install at build time**, which is why they are the thing that
  breaks. The app image therefore comes from `${DEVCONTAINER_BASE_IMAGE:-...}`,
  pointed by the gitignored `.devcontainer/.env` at a locally built image that
  carries the proxy CA roots, whose build context lives outside the repo in
  `~/.centravy-devcontainer/`. **Never commit the CA — the repository is
  public.** See E-003.
- **The same proxy swallows host port 9000 at runtime.** It accepts the
  connection, answers `200 Connection Established` with a `Proxy-Agent` header,
  then sends no body — so the browser shows `ERR_EMPTY_RESPONSE` and a 200 with
  zero bytes while the backend is healthy inside the container. The compose file
  publishes `${APP_HOST_PORT:-9000}:9000`; locally `.devcontainer/.env` sets
  9009. Reach the admin at **`http://127.0.0.1:9009/app`** — `127.0.0.1`, *not*
  `localhost`, which resolves to `::1` first on macOS and does not carry.
  Medusa's startup banner says `http://localhost:9000/app`: correct inside the
  container, wrong on the host in both the address and the port. See E-004.
- **Zed reporting `DevContainerScriptsFailed` does not mean the container is
  broken.** The `postCreateCommand` exits 0 when run directly, and the container
  comes up fully usable. Verify before chasing it.
- **Postgres serves no SSL, and Medusa force-enables SSL for any host that
  isn't `localhost`/`127.0.0.1`.** The host is `postgres`, so the inference is
  wrong and migrations fail with a *misleading* connection timeout — the real
  error is swallowed by the migration pool. Two mechanisms compensate and
  **both are intentional**: `?sslmode=disable` in the `DATABASE_URL` exported by
  `.devcontainer/docker-compose.yml`, and the `databaseDriverOptions` block in
  `medusa-config.ts`. Do not remove either as redundant. See E-001.
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
  misconfiguration. See D-006.
- **Named Docker volumes survive a devcontainer rebuild.** Rebuilding does not
  reset the database; that requires removing the `centravy-pgdata` volume
  explicitly.
- **Backend-only for now.** `apps/supplier-portal/` and `apps/catalog/` are
  planned React + Vite apps that do not exist yet. Check before referencing
  them; never scaffold them unasked.
- **Admin dashboard is on container port 9000, path `/app`.** In Codespaces,
  the forwarded URL from the PORTS panel. Locally the *host* port may differ:
  the proxy swallows host port 9000, so `.devcontainer/.env` remaps it and the
  working URL is <http://127.0.0.1:9009/app>. `404` means the port isn't
  forwarded; `502` means the backend is restarting. See E-004.
- **A zero-byte HTTP 200 from the host is the proxy, not the backend.** Checking
  only the status code (`curl -o /dev/null -w "%{http_code}"`) *passes* while
  nothing works — the giveaway is a `Proxy-Agent` header in the response and
  `size_download=0`. Always measure the body size. The same request run inside
  the container is the control.
- **Never run `node`, `npm` or `npx` against this repo from the host.**
  `node_modules/` sits on the bind mount and is visible from both sides, but it
  is installed inside Linux and holds `@swc/core-linux-arm64-gnu`. On macOS the
  same tree fails with `Cannot find module './swc.darwin-arm64.node'`. Editor
  type-checking still works, because `.d.ts` files are platform-independent, so
  only *execution* breaks. Running `npm install` from the host appears to fix it
  and breaks the container instead.
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

The starter's seed lives at `src/migration-scripts/initial-data-seed.ts` and runs
automatically as part of `db:migrate` — that is where the demo regions, products
and sales channels came from. Migration scripts are tracked in the
`script_migrations` table and never run twice, so there is no re-seed command and
no standalone seed script. Don't add one.

## Invariants

Non-negotiable. Violating one is a bug, not a style choice.

- **No direct DB access.** Always go through the module's service. Never write
  raw SQL or import a DB client in application code.
- **No cross-module imports.** Modules are isolated. Cross-module data goes
  through `defineLink` + `query.graph`, never through a direct import of another
  module's service or model.
- **Business logic lives in workflows**, not in route handlers. A route that
  mutates resolves and runs a workflow; the workflow composes steps. A read may
  call the module service directly — the list and detail routes do, and D-008
  covers the 404 that goes with it.
- **Every mutation goes behind a workflow**, with no exception for one-liners.
  Any `create*`, `update*`, `delete*`, `softDelete*`, or `restore*` service call
  belongs in a step, never in a route handler —
  `@medusajs/no-service-mutations-in-api-route` names the full prefix list. See
  D-009.
- **Match core Medusa when it already has an equivalent route.** Before choosing
  a response shape, a status code, or a method, call the core route
  (`/admin/products/:id`, ...) and copy what it does. Core's actual behaviour
  wins over REST principles. See D-007.
- **Only GET, POST and DELETE.** An update is `POST /resource/:id`, never PATCH
  or PUT. Core ships no PATCH handler anywhere — check with
  `grep -rlE "exports\.PATCH ?=" node_modules/@medusajs/medusa/dist/api/`. See
  D-010.
- **Prices are integers, in cents, everywhere.** Backend, DB, API payloads,
  frontend. Conversion to a display string happens at render time only.
- **API errors are thrown as `MedusaError`.** Never return `{ error: ... }`, and
  never `res.status(4xx)` — throw `MedusaError.Types.NOT_FOUND` /
  `INVALID_DATA` and let the framework map it to a status.
- **`api_token` is returned only by creation.** Every other endpoint strips it —
  the list route, the detail route, and the update response. See D-003.
- **Naming:** `snake_case` for DB columns and API payloads, `camelCase` for TS
  variables and functions, `PascalCase` for types and classes, `kebab-case` for
  filenames. `kebab-case` for workflow and step identifiers: a step id matches its
  filename, a workflow id matches its directory — the workflow itself is always
  `index.ts`.
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
- `delete<Models>` (`deleteSuppliers`) is a **hard** delete returning
  `Promise<void>` — nothing can undo it. The restorable pair is
  `softDelete<Models>` + `restore<Models>`. A step whose compensation must put
  the row back has to soft-delete.
- DML generates **partial** unique indexes (`WHERE deleted_at IS NULL`), so a
  soft-deleted row does not block re-creating one with the same unique value.
- A row read back from the database types a nullable column as `string | null`,
  while a validated update body types the same field `string | undefined`. A
  compensation payload built from a read needs its own type; reusing the step's
  input type fails to compile.
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

## Medusa Skills

The `medusa-dev` plugin ships skills as local markdown under
`~/.claude/plugins/cache/medusa/medusa-dev/*/skills/`. They work offline and
do not depend on any server. The `MedusaDocs` MCP server that shipped with the
plugin is disabled (HTTP 402, paid plan) — the skills are unaffected.

**Before presenting a plan that touches any of these, read the matching
reference file and say in the plan which one you read:**

| Touching | Read |
|---|---|
| workflows, steps, compensation | `building-with-medusa/reference/workflows.md` |
| `defineLink`, cross-module data | `building-with-medusa/reference/module-links.md` |
| API routes | `building-with-medusa/reference/api-routes.md` |
| models, migrations | `building-with-medusa/reference/data-models.md` |
| subscribers, events | `building-with-medusa/reference/subscribers-and-events.md` |
| anything under `src/admin/` | `building-admin-dashboard-customizations/SKILL.md` |

**These skills encode Medusa conventions, not Centravy's.** Where they
conflict with the Invariants above, this file wins — but say so in the plan
rather than silently picking one.

## Git Workflow

- One Linear issue = one branch = one commit scope. Branch names: `cv-16-...`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Commit before any destructive or large generative operation.**
- Run `git status --short | grep -E "\.env|node_modules"` before every commit.
  **The repository is public** — a leaked `.env` is a leaked secret.
- Never commit without the author having read the diff.
- **Propose a commit message whenever a unit of work leaves files changed**,
  and never run `git commit`. Imperative subject under ~72 characters, body
  explaining why rather than restating the diff. The author reads the diff
  and commits.

## Common Mistakes

- Using `localhost` for Postgres or Redis from inside the devcontainer.
- Reading a failed devcontainer *feature* install as a network outage or a
  broken feature. It is almost always the proxy CA missing from BuildKit.
  The tell is the asymmetry: the same `curl` succeeds at runtime and fails
  during a build.
- Running `npx medusa ...` or `npm install` from a macOS terminal instead of
  inside the container. The prompt is the tell: `node@<hash>:/workspaces/centravy$`
  inside, `<user>@<machine> %` outside.
- Using `localhost` rather than `127.0.0.1`, or port 9000 rather than the
  published host port, to reach the backend from the host.
- Reading a 200 with an empty body as a backend problem. Check the response
  headers for a `Proxy-Agent` first, and compare against the same request made
  inside the container.
- Measuring an HTTP check with `curl -o /dev/null -w "%{http_code}"` alone. A
  proxy tunnel returns 200 with zero bytes; always assert on `%{size_download}`
  too.
- Removing the SSL handling in `medusa-config.ts` or `docker-compose.yml` as
  redundant.
- Editing `apps/backend/.env` to change `DATABASE_URL` inside the devcontainer —
  the exported environment variable wins and the edit appears to do nothing.
- Editing a model without running `db:generate`.
- Reaching into another module's service or model directly instead of using a
  link.
- Putting business logic in a route handler instead of a workflow.
- Designing a route's response shape, status codes, or method from REST
  principles when core Medusa already ships an equivalent route — check its real
  response first.
- Using PATCH or PUT for an update. Core uses POST on the detail path.
- Treating a starter README under `src/` as a statement of this project's
  conventions. They ship with `create-medusa-app` and document the framework;
  AGENTS.md wins.
- Assuming `deleteX` soft-deletes, and writing a compensation that cannot run.
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

## Build Order

P6 Infra → P1/M1 Data Foundation → P1/M2 Submission Flow →
P1/M3a Token auth → P1/M4a Submission form → P3 Multi-channel →
P4 Order routing → P2 AI pipeline → P5 Billing.

Current: P1/M1. Supplier module, admin CRUD routes and their workflows
exist. The Product↔Supplier link and the admin pages do not yet.

Task-level tracking lives in Linear, not in this repo. If this paragraph
contradicts what you find in the code, trust the code and say so.

Task detail lives in Linear (team CV), reachable through the Linear MCP.
When a task references a CV-number, read the issue before planning — the
`mode` label (T / R / D) determines whether you write the code at all.
