# AGENTS.md — apps/backend

Medusa 2.0 application. The root `AGENTS.md` holds the invariants, the scope,
and the git workflow, and it wins wherever this file appears to disagree. What
follows is what is true of this app specifically and is not visible from the
code.

## Directory Structure

```text
apps/backend/
├── medusa-config.ts      # DB URL, SSL, CORS, secrets, module registration
└── src/
    ├── admin/            # Admin dashboard extensions (routes/, widgets/)
    ├── api/              # File-based routes: api/admin/*, api/store/*
    ├── jobs/             # Scheduled jobs
    ├── links/            # Module links (defineLink)
    ├── modules/          # Custom modules (models + service + migrations)
    ├── subscribers/      # Event subscribers
    └── workflows/        # Workflows and steps
```

## Commands

```bash
cd apps/backend
npm run dev                            # native: 9009 · Codespaces: 9000; admin at /app

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

## Where This Runs

**Local development is native.** Medusa runs on the host against a Postgres
installed on the host. There is no local container: running the devcontainer on
this machine was abandoned deliberately (see D-017) after repeated failures
around the corporate TLS proxy, port publishing, and platform-specific
`node_modules`. **Do not propose reviving it, and do not diagnose a local problem
as a container problem.**

**`.devcontainer/` is retained for GitHub Codespaces only.** Codespaces exists
because the author's work machine has no admin rights and has restricted network
access. It is used occasionally, and its quota is limited (~30h/month on
4 cores), so don't leave long-running processes idling there.

Before answering any environment question, establish which of the two you are in.
A Codespaces answer given natively is worse than no answer.

### Native (the default)

- **Postgres is on `localhost:5434`.** Not 5432, not `postgres`.
- **`apps/backend/.env` is authoritative** for `DATABASE_URL` and everything else.
  Edit it and it takes effect.
- **The SSL handling is inert here and must stay anyway.** Medusa force-enables
  SSL for any host that isn't `localhost` / `127.0.0.1`, so natively the
  inference is correct and nothing compensates for anything. The
  `?sslmode=disable` in `.devcontainer/docker-compose.yml` and the
  `databaseDriverOptions` block in `medusa-config.ts` exist **for Codespaces**,
  where the host is `postgres`. They look like dead code from here. **Never
  remove them.** See E-001.
- Redis is not used: `projectConfig.redisUrl` is unset, so Medusa logs
  `redisUrl not found` and falls back to in-memory caching, events and locking.
  Deliberate current state, not a misconfiguration — whether a Redis is running
  on the host is irrelevant. See D-006.
- Admin dashboard at `http://127.0.0.1:9009/app` — `PORT=9009` in
  `apps/backend/.env`, read by the Medusa CLI. **The machine sits behind a
  TLS-inspecting proxy that has been observed swallowing host port 9000**: it
  answers `200 Connection Established` with a `Proxy-Agent` header and no body,
  which surfaces as `ERR_EMPTY_RESPONSE` in the browser and as a passing check in
  `curl -o /dev/null -w "%{http_code}"`. If that happens, **the giveaway is the
  `Proxy-Agent` header plus `size_download=0`** — always assert on
  `%{size_download}`, never on the status code alone. Prefer `127.0.0.1` over
  `localhost`, which resolves to `::1` first on macOS. See E-004.

### Codespaces (occasional)

- **Postgres and Redis are docker-compose siblings. Their hosts are the service
  names `postgres` and `redis` — not `localhost`.**
- **`DATABASE_URL` and `REDIS_URL` are exported by
  `.devcontainer/docker-compose.yml`**, and `loadEnv` does not override a
  variable already present in the environment. `apps/backend/.env` is therefore
  *ignored* for those keys. Editing it and expecting an effect is a trap — change
  the compose file and rebuild, or export the variable for a single command.
- **Trust no Medusa database error at face value.** "Connection timed out" or
  "pool is probably full" during `db:migrate` is almost always a swallowed
  connection error, most often the SSL inference described above.
- A fresh container installs dependencies and seeds `.env` itself via
  `postCreateCommand`. The `cp -n` never clobbers.
- The compose file mounts the repo, not its parent — `..:/workspaces/centravy`,
  not the stock template's `../..:/workspaces`. See E-002.
- Reach the admin through the forwarded URL in the PORTS panel. `404` means the
  port isn't forwarded; `502` means the backend is restarting. Medusa's startup
  banner (`http://localhost:9000/app`) is correct inside the container only.
- Zed reporting `DevContainerScriptsFailed` does not mean the container is
  broken. `postCreateCommand` exits 0 when run directly. Verify before chasing it.

### Vestigial configuration — do not debug, do not delete

These exist only because the devcontainer once ran locally. They are harmless in
Codespaces (the `:-` fallbacks select the stock behaviour) and unreachable
natively. **Leave them alone; they are not bugs and not dead code to clean up.**

- `${DEVCONTAINER_BASE_IMAGE:-...}` in `.devcontainer/`, and the gitignored
  `.devcontainer/.env` that pointed it at an image carrying the corporate proxy
  CA roots, built from a context outside the repo. That CA must **never** be
  committed — the repository is public. See E-003.
- `${APP_HOST_PORT:-9000}:9000` and the local override to 9009. Port remapping
  was a workaround for the proxy on the local container's published port.

## Medusa 2.0 Gotchas

Re-check these on every generated diff.

- Import `MedusaRequest` / `MedusaResponse` from `@medusajs/framework/http`
  **without** the `type` keyword.
- `query.graph` linked relation names are singular on the non-`isList` side and
  pluralized on the `isList: true` side — `product.*` from a one-relation,
  `products.*` from a many-relation, not singular unconditionally. The singular
  name is not a uniqueness guarantee. See D-016.
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
- `query.graph()` cannot filter by a property on a *linked* module — only on the
  base model's own fields. Filtering across a link (e.g. products by supplier)
  needs `query.index()` instead, with the linked property marked `filterable` in
  the link definition. **The repo has no `query.index()` example yet.**
  `src/links/product-supplier.ts` marks nothing `filterable`, and the one
  cross-link read, `src/api/admin/suppliers/[id]/products/route.ts`, uses
  `query.graph`. So that file shows the unmarked case, not the marked one — the
  first ticket that needs to filter across the link adds both.
- `query.graph()`'s return type for a custom module's entity is inferred from its
  DML model, which knows nothing about fields a link added — core-shipped links
  carry pre-built type augmentation, a project's own links don't. The linked
  field needs its own local type and a cast on the result, the same way a
  compensation payload needs its own type.
- A turbo `build` task whose `outputs` don't match what the tool actually writes
  caches an empty artefact set: the next run reports `FULL TURBO`, restores
  nothing, and leaves no build behind. Medusa writes to `.medusa/`, never
  `dist/`. The tell before it bites is turbo's `no output files found for task`
  warning; the test is `rm -rf apps/backend/.medusa && npm run build`, which
  must restore `.medusa/server`.

## Medusa Skills

The `medusa-dev` plugin ships skills as local markdown under
`~/.claude/plugins/cache/medusa/medusa-dev/*/skills/`. They work offline and do
not depend on any server. The `MedusaDocs` MCP server that shipped with the
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
| querying data (`query.graph`, `query.index`) | `building-with-medusa/reference/querying-data.md` |
| auth, protected routes, actor types | `building-with-medusa/reference/authentication.md` |
| throwing/handling errors | `building-with-medusa/reference/error-handling.md` |
| custom modules (service, migrations) | `building-with-medusa/reference/custom-modules.md` |
| debugging Medusa-specific failures | `building-with-medusa/reference/troubleshooting.md` |
| workflow hooks | `building-with-medusa/reference/workflow-hooks.md` |

**These skills encode Medusa conventions, not Centravy's.** Where they conflict
with the root `AGENTS.md`, that file wins — but say so in the plan rather than
silently picking one.
