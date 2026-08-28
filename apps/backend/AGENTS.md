## D-017 — Local devcontainer abandoned, Codespaces retained

**Context.** The devcontainer was meant to serve both local development and
GitHub Codespaces from one definition. Locally it accumulated three unrelated
failure modes: the corporate TLS-inspecting proxy breaking devcontainer feature
installs, because OrbStack injects the host trust store into running containers
but BuildKit does not, and features install at build time (E-003); the same
proxy swallowing the published host port, answering `200 Connection Established`
with an empty body (E-004); and a shared `node_modules/` on the bind mount
carrying platform-specific native bindings, so installing for one mode broke the
other and re-installing appeared to fix it while breaking the first (E-005).
None of these are Medusa problems and none had a stable workaround.

**Decision.** Local development runs Medusa natively on the host against a
Postgres on `localhost:5434`. `.devcontainer/` is kept for GitHub Codespaces
only, which remains necessary because the work machine has no admin rights and
restricted network access.

**Consequences.**

- The SSL handling — `?sslmode=disable` in `.devcontainer/docker-compose.yml`
  and the `databaseDriverOptions` block in `medusa-config.ts` — is inert
  natively, because Medusa exempts `localhost` and `127.0.0.1` from its forced
  SSL inference. It remains **required** for Codespaces, where the host is
  `postgres`. It is not dead code and must not be removed. See E-001.
- `${DEVCONTAINER_BASE_IMAGE:-...}`, the gitignored `.devcontainer/.env` that
  pointed it at a locally built image carrying the proxy CA roots, and the
  `${APP_HOST_PORT:-9000}:9000` remap to 9009 are now vestigial. They are kept
  rather than removed because the `:-` fallbacks select the stock behaviour in
  Codespaces and cost nothing. They are documented as vestigial in
  `apps/backend/AGENTS.md` so they are neither debugged nor cleaned up.
- E-005 no longer applies: there is only one local mode, and Codespaces has its
  own `node_modules` tree.
- Any environment fact recorded from here on must state which of the two modes
  it concerns. An unqualified environment fact goes stale the moment the mode
  changes, and a precise but wrong instruction costs more than none.
