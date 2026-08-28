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

Backend-specific context — where the app runs, Medusa gotchas, database
commands — lives in [`apps/backend/AGENTS.md`](./apps/backend/AGENTS.md). Read
it before touching anything under `apps/backend/`.

## How to Work Here

- **Plan first, always.** Present the plan and wait for approval before writing
  code. The plan is the real review checkpoint — architectural drift is visible
  there and invisible in a 200-line diff.
- **Never expand scope silently.** A helper, an abstraction, or a dependency
  that wasn't discussed goes in the plan, not in the diff.
- **Name conflicts, don't resolve them.** When a Medusa skill, an ADR and this
  file disagree, say so in the plan and let the author decide.
- **Follow the ticket's scope, not its title.** A Linear issue states what is in
  scope and what is out. Anything outside it is scope creep, including
  improvements that seem obviously worth making.
- Deliver files as complete contents with their path, not terminal heredocs.

## Repo Layout

```text
.
├── apps/
│   └── backend/                  # Medusa application — see its own AGENTS.md
│       └── integration-tests/    # HTTP tests against the routes — see D-011
├── docs/
│   └── decisions.md              # ADRs — reasoning behind architectural choices
├── openspec/                     # Specs and change proposals — see Spec Workflow
│   ├── config.yaml
│   ├── specs/                    # How the system behaves today, by domain
│   └── changes/                  # One folder per in-flight change
├── README.md                     # Setup, natively and in Codespaces
├── .claude/                      # opsx slash commands and skills (generated)
└── .devcontainer/                # GitHub Codespaces only — not used locally
```

`apps/supplier-portal/` and `apps/catalog/` are planned React + Vite apps that
**do not exist yet**. Check before referencing them; never scaffold them unasked.

Each app may have its own nested `AGENTS.md`; agents read the nearest one in the
tree. Put app-specific context there rather than expanding this file.

## Commands

Run from the repo root unless noted. Package manager is **npm** (npm workspaces,
`package-lock.json`). Never introduce a second lockfile.

```bash
npm run dev      # all apps via turbo
npm run build
npm run lint
```

Backend-only commands, including everything database-related, are in
`apps/backend/AGENTS.md`.

## Invariants

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
- **Admin UI data access goes through `@medusajs/js-sdk` with react-query.** Not
  hand-rolled `fetch`, not bare `useEffect`. This is what the Medusa dashboard
  does, and it is the same reasoning as D-007. See D-018.
- **Prices are integers, in cents, everywhere this project owns the storage.**
  Supplier price fields, custom module payloads, frontend display math.
  Medusa's own pricing module stores decimal amounts (`model.bigNumber()`) —
  never convert at that boundary. See D-013. Conversion to a display string
  happens at render time only.
- **API errors are thrown as `MedusaError`.** Never return `{ error: ... }`, and
  never `res.status(4xx)` — throw `MedusaError.Types.NOT_FOUND` /
  `INVALID_DATA` and let the framework map it to a status.
- **`api_token` is returned only by creation.** Every other endpoint strips it —
  the list route, the detail route, and the update response. See D-003.
- **Naming:** `snake_case` for DB columns and API payloads, `camelCase` for TS
  variables and functions, `PascalCase` for types and classes, `kebab-case` for
  filenames. `kebab-case` for workflow and step identifiers: a step id matches
  its filename, a workflow id matches its directory — the workflow itself is
  always `index.ts`.
- **No new npm dependency without asking.** Ever.
- **Look before you write.** Before creating a module, route, link, or admin
  page, read the existing equivalent and follow its shape:
  - module → `apps/backend/src/modules/supplier/`
  - admin route → `apps/backend/src/api/admin/suppliers/route.ts`
- **Use `export` / `export default`, never `module.exports`.**
  `medusa-config.ts` uses CommonJS because it ships that way — it is not a
  model to copy.
- **No emojis** in code, comments, or commit messages.

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
- A starter README under `src/` documents the framework, not this project.
  This file wins.

## Spec Workflow

Behaviour is specified before it is built, using OpenSpec. The slash commands
(`/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive`) live in
`.claude/`; `openspec/config.yaml` carries the project context injected into
every artifact.

- `openspec/specs/<domain>/spec.md` describes how the system behaves **today**.
  Read the relevant domain spec before changing anything it covers.
- `openspec/changes/<slug>/` holds one in-flight change: `proposal.md`,
  `design.md`, `tasks.md`, and a delta spec under `specs/`. Archiving merges the
  delta into the main specs and moves the folder to `changes/archive/`, prefixed
  with the archive date: `changes/archive/2026-08-28-cv-17-admin-suppliers-page/`.
- Change slugs are `cv-NN-<short-slug>`, the same slug as the branch. The slug
  shortens the Linear title rather than transcribing it — it drops the leading
  verb, so CV-17 "Add admin Suppliers page" is `cv-17-admin-suppliers-page`.
- **`design.md` is local and disposable; an ADR is permanent.** If a decision
  outlives the change, it belongs in `docs/decisions.md` and `design.md` cites
  it by number. Never restate an ADR's reasoning in a change folder.
- Scenarios describe observable behaviour — an HTTP response, a rendered
  element — never internal state. One scenario should map to one test.
- `openspec/` is committed and the **repository is public**: no secrets, no real
  tokens, no customer data in a spec. Use obviously fake values.

## Git Workflow

- One Linear issue = one branch. Branch names are `cv-NN-<short-slug>`, the same
  slug as the change folder — `cv-16-product-supplier-link`. **Linear's generated
  branch name is not the convention:** it carries a `salahchadli/` prefix and the
  full title slug. Use the name above, not the one the issue offers. Several
  commits per branch are fine; each must be a coherent unit that builds and lints.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Commit before any destructive or large generative operation.**
- Run `git status --short | grep -E "\.env|node_modules"` before every commit.
  **The repository is public** — a leaked `.env` is a leaked secret.
- **Propose a commit message whenever a unit of work leaves files changed, and
  never run `git commit`.** Imperative subject under ~72 characters, body
  explaining why rather than restating the diff. The author reads the diff and
  commits.

## MVP Scope

The MVP is a demo: a supplier photographs a shoe, the system generates the
product page, the operator publishes it on Store A at 850 DH, a customer buys
it, and the supplier receives the preparation request.

**IN:** supplier product submission with images · admin validation
(proposed → published/rejected, see D-014) · multi-channel publishing with
per-channel pricing · minimal catalog page · order routing to suppliers via
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

## Build Order

P6 Infra → P1/M1 Data Foundation → P1/M2 Submission Flow →
P1/M3a Token auth → P1/M4a Submission form → P3 Multi-channel →
P4 Order routing → P2 AI pipeline → P5 Billing.

Task-level state is not tracked in this repo. Task detail lives in Linear
(team CV), reachable through the Linear MCP. When a task references a
CV-number, read the issue before planning — its Scope and Out of scope sections
are the contract for that change.

## Off-Limits

- **`npm audit fix`, and `npm audit fix --force` above all.** Nearly every
  advisory is transitive through `@medusajs/*` and unfixable without upgrading
  Medusa itself; `--force` would install `vite@8` and a `@medusajs/test-utils`
  outside the stated range, breaking the admin bundler. Report an audit result,
  never act on it. `npm audit --omit=dev` is the only number worth looking at.
- `package-lock.json` — never hand-edit or delete; it changes only as a side
  effect of an npm command.
- `.env` / `.env.local` — never commit, print, or copy secret values out of
  them. Document new variables in `.env.template` instead.
- Build output: `apps/backend/.medusa/`, `dist/`, `.turbo/`.
- Existing migrations in `apps/backend/src/modules/*/migrations/` — add a new
  one rather than rewriting one that may already have run.
- Destructive DB commands (drops, resets) — never without explicit confirmation.
