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
npm run dev                            # port 9000, admin at /app

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

## Development Modes

**Two modes, mutually exclusive locally: the devcontainer, or Medusa running
natively on the host against a local Postgres.** `node_modules/` lives on the
bind mount and carries native bindings for one platform only, so installing for
one mode breaks the other.

- Check which mode you are in before running anything: `ls node_modules/@swc/`
  shows `core-darwin-arm64` (native) or `core-linux-arm64-gnu` (container).
- **Run `node`, `npm` and `npx` only where `node_modules` was installed.** The
  wrong side fails with `Cannot find module './swc.darwin-arm64.node'` or its
  mirror image. Editor type-checking works either way because `.d.ts` files are
  platform-independent, so only *execution* breaks. Running `npm install` in the
  wrong place appears to fix it and breaks the other mode instead. See E-005.
- The shell prompt is the tell: `node@<hash>:/workspaces/centravy$` inside the
  container, `<user>@<machine> %` outside.
- Codespaces has its own tree and is never affected.

**The devcontainer** (`typescript-node:22-bookworm`) runs Postgres 16 and Redis 7
as docker-compose siblings. Their hosts are the compose service names `postgres`
and `redis` — **not `localhost`**. One `.devcontainer/` serves both GitHub
Codespaces and a local container on Docker or OrbStack: same service names, same
URLs, nothing to reconfigure. Codespaces exists because the author's work machine
has no admin rights and has restricted network access; local is the default on
his own machine, and its quota is limited (~30h/month on 4 cores), so don't leave
long-running processes idling.

Other standing facts:

- The compose file mounts the repo, not its parent — `..:/workspaces/centravy`,
  not the stock template's `../..:/workspaces`, which locally would expose every
  sibling checkout to the container. See E-002.
- A fresh container installs dependencies and seeds `.env` itself via
  `postCreateCommand`. The `cp -n` never clobbers, so an existing `.env` survives
  a rebuild.
- Named Docker volumes survive a rebuild. Rebuilding does not reset the
  database; that requires removing the `centravy-pgdata` volume explicitly.
- Zed reporting `DevContainerScriptsFailed` does not mean the container is
  broken. The `postCreateCommand` exits 0 when run directly and the container
  comes up fully usable. Verify before chasing it.
- Redis runs but Medusa does not use it yet. `projectConfig.redisUrl` is unset,
  so Medusa logs `redisUrl not found` and falls back to in-memory caching,
  events and locking. Deliberate current state, not a misconfiguration. See D-006.

## Environment Traps

Five failures that all present as something other than what they are. Each is a
symptom you will actually see, followed by its real cause.

**`db:migrate` fails with "connection timed out" or "pool is probably full".**
Almost always a swallowed connection error, most often SSL. Postgres serves no
SSL, and Medusa force-enables SSL for any host that isn't `localhost` /
`127.0.0.1`. The host is `postgres`, so the inference is wrong and the real error
never surfaces. Two mechanisms compensate and **both are intentional**:
`?sslmode=disable` in the `DATABASE_URL` exported by
`.devcontainer/docker-compose.yml`, and the `databaseDriverOptions` block in
`medusa-config.ts`. Do not remove either as redundant. See E-001.
**Trust no Medusa database error at face value.**

**Editing `apps/backend/.env` has no effect.** The devcontainer exports
`DATABASE_URL` and `REDIS_URL`, and `loadEnv` does not override a variable
already present in the environment — so `.env` is *ignored* for those keys inside
the container. Change `.devcontainer/docker-compose.yml` and rebuild, or export
the variable for a single command.

**A devcontainer *feature* fails to install with
`curl: (60) ... unable to get local issuer certificate`.** Not a network outage.
The machine sits behind a TLS-inspecting proxy; OrbStack injects the host trust
store into *running* containers, so `docker run ... curl https://...` returns
200 — but **BuildKit does not**, and features install at build time. The tell is
that asymmetry. The app image therefore comes from
`${DEVCONTAINER_BASE_IMAGE:-...}`, pointed by the gitignored
`.devcontainer/.env` at a locally built image carrying the proxy CA roots, whose
build context lives outside the repo in `~/.centravy-devcontainer/`.
**Never commit the CA — the repository is public.** See E-003.

**The browser shows `ERR_EMPTY_RESPONSE`, or a health check returns 200 with
nothing working.** The same proxy swallows host port 9000: it accepts the
connection, answers `200 Connection Established` with a `Proxy-Agent` header,
then sends no body. The giveaway is that header plus `size_download=0`.
**Measuring with `curl -o /dev/null -w "%{http_code}"` alone passes while the
app is unreachable — always assert on `%{size_download}` too**, and use the same
request run inside the container as the control.

**The admin dashboard 404s or won't load from the host.** It is on container port
9000, path `/app`. In Codespaces, use the forwarded URL from the PORTS panel.
Locally the *host* port differs: the compose file publishes
`${APP_HOST_PORT:-9000}:9000` and `.devcontainer/.env` sets 9009, so the working
URL is <http://127.0.0.1:9009/app> — `127.0.0.1`, *not* `localhost`, which
resolves to `::1` first on macOS and does not carry. Medusa's startup banner says
`http://localhost:9000/app`: correct inside the container, wrong on the host in
both the address and the port. `404` means the port isn't forwarded; `502` means
the backend is restarting. See E-004.

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
  the link definition. See `src/links/product-supplier.ts`.
- `query.graph()`'s return type for a custom module's entity is inferred from its
  DML model, which knows nothing about fields a link added — core-shipped links
  carry pre-built type augmentation, a project's own links don't. The linked
  field needs its own local type and a cast on the result, the same way a
  compensation payload needs its own type.

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
