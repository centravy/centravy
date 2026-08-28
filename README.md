# Centravy

A [Medusa 2](https://docs.medusajs.com) commerce backend in a Turborepo workspace.

```text
apps/backend/     # Medusa application (@dtc/backend) — API + admin dashboard at /app
```

Backend-only for now.

## Getting started

Two environments are supported: **natively on the host**, which is the default
local mode, and **GitHub Codespaces**. Running the dev container locally is not
supported — see D-017 in [docs/decisions.md](docs/decisions.md).

### Natively (the default)

No Docker required. You need Node 22, and a Postgres 15+ instance with a role
and database matching your connection string. Redis is not needed — nothing
reads it (D-006).

```bash
createuser -s centravy && createdb -O centravy centravy
```

Then in `apps/backend/.env`, copied from
[.env.template](apps/backend/.env.template):

```bash
DATABASE_URL=postgres://centravy:centravy@localhost:5434/centravy
PORT=9009
```

`PORT` is read by the Medusa CLI, and is what puts the backend on 9009 rather
than Medusa's default 9000: a TLS-inspecting proxy on this machine intercepts
host port 9000 and answers a zero-byte HTTP 200 (E-004). With a `localhost`
host, Medusa no longer force-enables SSL, so the SSL handling in E-001 becomes
a no-op.

```bash
npm install --legacy-peer-deps
cd apps/backend
npx medusa db:migrate
npx medusa user -e you@example.com -p <password>
cd ../.. && npm run backend:dev
```

The admin dashboard is then at <http://127.0.0.1:9009/app> — use `127.0.0.1`,
not `localhost`, which resolves to `::1` first on macOS.

### In GitHub Codespaces

[.devcontainer/](.devcontainer/) defines the app container plus Postgres 16 and
Redis 7. It exists because the author's work machine has no admin rights and
has restricted network access, and it is used occasionally.

Creating the codespace installs dependencies and copies `.env.template` to
`.env` if you don't already have one, so start at `db:migrate`:

```bash
cd apps/backend
npx medusa db:migrate                   # schema + initial seed data
npx medusa user -e you@example.com -p <password>
cd ../.. && npm run backend:dev
```

The backend listens on port 9000 there. Reach the admin through the forwarded
URL from the **PORTS** panel, not `localhost`; it looks like
`https://<codespace>-9000.app.github.dev/app`.

Migrations and the admin user are per-database, so both steps are needed on any
machine with a fresh database. Seed data is applied by the `initial-data-seed`
migration script during `db:migrate` — there is no separate seed command.

## Common tasks

Run from the repo root:

```bash
npm run backend:dev     # start the backend in watch mode
npm run build           # build all apps
npm run lint            # @medusajs/eslint-plugin — its rules encode framework requirements
npm test                # no-op today: apps/backend defines no `test` script
```

From `apps/backend/`:

```bash
npx medusa db:migrate                  # apply migrations
npx medusa db:generate <module>        # generate migrations for a custom module
npx medusa user -e <email> -p <pass>   # create an admin user
```

## Configuration

`apps/backend/.env` is gitignored. [.env.template](apps/backend/.env.template)
holds the working non-secret values and documents each variable.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Natively `localhost:5434`. In Codespaces the host is the compose service name `postgres`, not `localhost` |
| `DATABASE_SSL` | `true` only for managed Postgres requiring TLS. See Notes |
| `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` | Comma-separated. An entry wrapped in slashes is parsed as a regular expression |
| `JWT_SECRET` / `COOKIE_SECRET` | Throwaway local defaults — regenerate before exposing this anywhere |

## Notes

**SSL is disabled by default, deliberately.** Medusa infers SSL from the
database URL and force-enables it for any host that is not `localhost` or
`127.0.0.1`. In Codespaces, Postgres is reached as `postgres`, so it gets
misclassified as a remote managed database — while the `postgres:16-alpine`
image serves no SSL. [medusa-config.ts](apps/backend/medusa-config.ts) therefore
sets `databaseDriverOptions` explicitly. Natively the host is `localhost`, the
inference is correct, and both mechanisms are inert — but still required for
Codespaces, so neither may be removed (E-001). Set `DATABASE_SSL=true` when
deploying against a database that does require TLS.

**In Codespaces, compose exports `DATABASE_URL`.** dotenv does not override
variables already present in the environment, so inside the container the value
in `.env` is ignored and the one from
[docker-compose.yml](.devcontainer/docker-compose.yml) wins. Change it there,
and rebuild the container for it to take effect. Natively there is no such
export and `apps/backend/.env` is authoritative.

**In Codespaces, Redis runs but is unused; natively no Redis runs at all.**
Medusa reads `projectConfig.redisUrl`, which is not set in either mode, so it
logs `redisUrl not found` and uses in-memory implementations for caching,
events, and locking. That is deliberate (D-006), not a misconfiguration.

## Troubleshooting

**Cannot reach the admin dashboard in Codespaces.** The error distinguishes the
cause:

| Symptom | Meaning |
|---|---|
| `ERR_EMPTY_RESPONSE` | Port is forwarded, but the backend is still starting — the admin bundle takes a while to build |
| `HTTP 502` | Port is forwarded, backend is mid-restart. Reload |
| `HTTP 404` | Port is **not** forwarded. Re-add it in the **PORTS** panel |

Check whether the backend itself is healthy before blaming the tunnel:

```bash
curl -s -o /dev/null -w "status=%{http_code} bytes=%{size_download}\n" \
  http://127.0.0.1:9000/health
```

`status=200` with a non-zero `bytes` means the backend is fine and the problem
is port forwarding. **Always assert on the body size too:** a TLS-inspecting
proxy answers `200` with zero bytes, so a status-only check passes while
nothing works. See E-004.

**`Could not connect to the database while running migrations`, reporting a
timeout or a full connection pool.** The message rarely names the real cause:
the migration pool sets `propagateCreateError: false`, so the underlying
connection error is swallowed while it retries. Check `DATABASE_URL` and the SSL
notes above. Confirm the database is reachable independently:

```bash
node -e "new (require('pg').Client)(process.env.DATABASE_URL).connect().then(()=>console.log('ok'))"
```

## Resources

- [Medusa documentation](https://docs.medusajs.com)
- [AGENTS.md](AGENTS.md) — conventions and commands for working in this repo
