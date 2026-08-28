# Decisions

Technical decisions taken during the build, and open questions that need
a business call from the CEO.

Status: `decided` · `pending-rida` · `revisit-post-mvp` · `superseded`

Scope: `design` — product, API and architecture choices that shape the
code. `environment` — how this project is built and run on a given machine.
The two use separate id sequences (`D-` and `E-`) so a renumbering in one
never disturbs references to the other.

Every ADR states the decision and why. `What we lose` is mandatory: an ADR
with no stated cost has not been thought through. `Rejected alternative` is
optional and belongs only where the rejection is counter-intuitive enough to
be reopened later.


## Index

**Design**

- [D-001 — No supplier activation state in the MVP](#d001)
- [D-002 — Static token auth for the pilot (M3a), not real accounts (M3b)](#d002)
- [D-003 — API token returned on creation only](#d003)
- [D-004 — The API token is generated inside the step, not by the caller](#d004)
- [D-006 — In-memory event bus until P4](#d006)
- [D-007 — Match core Medusa where it ships an equivalent route](#d007)
- [D-008 — Existence is checked in the route on reads](#d008)
- [D-009 — Every mutation goes through a workflow, including single-call ones](#d009)
- [D-010 — Update is `POST /admin/suppliers/:id`, not PATCH](#d010)
- [D-011 — Integration tests target the routes, not the layers beneath](#d011)
- [D-012 — Test fixtures are built through the container, not over HTTP](#d012)
- [D-013 — Medusa's own pricing module stores decimal amounts, not cents](#d013)
- [D-014 — Submission enters as `proposed`, not `draft`](#d014)
- [D-015 — The rejection reason lives in product `metadata`](#d015)
- [D-016 — One supplier per product is a code-level invariant, not a database constraint](#d016)
- [D-017 — Local devcontainer abandoned, Codespaces retained](#d017)

**Environment**

- [E-001 — SSL disabled in two places, deliberately](#e001)
- [E-002 — The devcontainer mounts the repo, not its parent](#e002)
- [E-003 — The base image is overridable, for TLS-inspected networks](#e003)
- [E-004 — The host port is variable, the container port is not](#e004)
- [E-005 — Two local modes, and they cannot coexist](#e005) — **superseded by D-017**

`D-005` is retired: it became `E-001`. `D-018` and `E-006` onward are free.


---


# Design decisions


## D-001 — No supplier activation state in the MVP

**Date:** 2026-08-17 · **Status:** pending-rida · **Scope:** design · **Linear:** CV-30

**Decision.** The `supplier` model has no `is_active` / `status` field. Every
supplier in the database is considered active.

**Why.** Suppliers are created manually by the operator during the MVP and the
closed pilot, so creating a supplier *is* the approval. A state field would have
to be checked in every route, in the submission middleware, and in order
routing — cost spread across the codebase for a guarantee the manual process
already gives.

**What we lose.** No way to suspend a supplier without deleting them, and no
self-service signup without adding this back.

**To confirm with Rida.** Is there a real case where a supplier must be
temporarily blocked (unpaid, quality issues, dispute) during the pilot? If yes,
this comes back before the demo, not after.

---


## D-002 — Static token auth for the pilot (M3a), not real accounts (M3b)

**Date:** 2026-08-17 · **Status:** pending-rida · **Scope:** design · **Linear:** CV-31

**Decision.** Each supplier gets a static API token, generated at creation and
stored in the database, sent as an HTTP header on every request. No login
screen, no password, no session. Account-based auth (M3b) is deferred post-MVP.

**Why.** ~3h instead of ~13h. Medusa's custom actor-type auth has documented
pitfalls: middleware wildcards, and authenticated vendors unable to use the
admin UI. For a demo and a closed pilot with ~5 known suppliers, a token is
enough — the operator hands it over directly and the supplier pastes it into the
submission form.

**What we lose.** Whoever holds the token *is* the supplier: no per-person
revocation without rotating the whole token, and no password recovery. Not
acceptable for public signup.

**To confirm with Rida.** Are pilot suppliers comfortable pasting a token into a
form, or does the absence of a normal login hurt credibility during the demo? If
it does, M3b returns to MVP scope and the demo date moves.

---


## D-003 — API token returned on creation only

**Date:** 2026-08-19 · **Status:** decided · **Scope:** design

**Decision.** `POST /admin/suppliers` returns `api_token`. Every other endpoint
strips it: the list route, the detail route, and the update response.

**Why.** There is no UI to reveal a token after the fact, so creation is the only
moment the operator can read it and forward it. Keeping it in the list endpoint
would expose every supplier's credential on a route called for unrelated reasons.

**What we lose.** A token lost after creation cannot be recovered, only rotated,
and no rotation endpoint exists yet.

**Follow-up.** If M4b brings a supplier portal, add a rotate endpoint rather than
a reveal one.

---


## D-004 — The API token is generated inside the step, not by the caller

**Date:** 2026-08-19 · **Status:** decided · **Scope:** design

**Decision.** `createSupplierStep` generates `api_token` itself with
`randomBytes(32)`. It is not part of the step's input type, so no caller can
supply or choose it.

**Why.** A secret that authenticates must never be chosen by whoever will use it,
or a supplier could pick another supplier's token and impersonate them. Putting
generation at the deepest layer makes that structural rather than a rule every
call site has to remember, so a future seed script or admin UI cannot get it
wrong by omission.

**What we lose.** The step is no longer deterministic: the same input produces a
different row each run, so a test has to read the token back from the result
instead of comparing against a fixture.

**Rejected alternative.** Caller-supplied token. Keeps the step a pure function
of its input and easier to test, but moves a security guarantee into the
discipline of every call site.

---


## D-006 — In-memory event bus until P4

**Date:** 2026-08-19 · **Status:** revisit-post-mvp · **Scope:** design

**Decision.** `projectConfig.redisUrl` is left unset in `medusa-config.ts`, even
though Codespaces runs Redis and exports `REDIS_URL`. Medusa logs
`redisUrl not found` and uses in-memory caching, events and locking.

**Why.** Nothing before P4 needs a real event bus. In-memory works for a single
process in development, and switching now would add a moving part with no payoff.

**What we lose.** Events do not survive a restart, and nothing works across
multiple processes. Neither matters yet.

**Trigger to revisit.** Start of P4, when the `order.placed` subscriber makes
event durability and idempotence part of what the block is meant to teach.
Switching is one line plus a restart. Railway will need Redis regardless.

---


## D-007 — Match core Medusa where it ships an equivalent route

**Date:** 2026-08-20 · **Status:** decided · **Scope:** design

**Decision.** Where core Medusa already ships an equivalent route, its actual
behaviour — response shape, status codes, HTTP method — is what we copy. REST
principles lose to what core does. The method-level application of this rule is
recorded separately in D-010, which carries its own cost.

**First application: DELETE is idempotent.** `DELETE /admin/suppliers/:id` always
answers `200` with `{ id, object: "supplier", deleted: true }`, whether or not
the supplier exists, and performs no existence check. GET and POST on the same
path do 404.

**Why.** Verified against core Medusa on this instance: calling
`DELETE /admin/products/<id>` twice returns the same `200 {"deleted":true}` body
both times. Matching core's shape costs nothing and means the admin dashboard,
the JS SDK and any future client behave the same against our routes as against
core's. Deriving a 404 from REST principles would make suppliers the one
resource in the API that answers delete differently.

**What we lose.** A typo'd or already-deleted id returns success with no signal,
so a client cannot distinguish "I deleted it" from "it was never there". Any UI
needing that distinction has to GET first.

---


## D-008 — Existence is checked in the route on reads

**Date:** 2026-08-20 · **Status:** decided · **Scope:** design

**Decision.** `GET /admin/suppliers/:id` runs an explicit `listSuppliers({ id })`
check and throws `MedusaError.Types.NOT_FOUND` before anything else happens. The
update route has no such check: `updateSupplierStep` already retrieves the row
for its compensation snapshot, and `retrieveSupplier` throws NOT_FOUND on its
own — inside `.run()`, so still before anything is written to the response.

**Why.** The generated service methods disagree on a missing row.
`retrieveSupplier` throws; `updateSuppliers` and `softDeleteSuppliers` do nothing
and report success. Reading a route should not require knowing which of the three
you are looking at.

**What we lose.** Asymmetry: two handlers on one path answer 404 by different
mechanisms, and a reader has to know the update's 404 comes from a step two files
away. The extra read costs nothing — the row the guard reads is the row GET
returns.

**Rejected alternative.** Passing the row read by the guard into the workflow as
input. Saves the second read, but moves the compensation snapshot out of the step
and into the caller, where a future call site can forget it. Same reasoning as
D-004.

---


## D-009 — Every mutation goes through a workflow, including single-call ones

**Date:** 2026-08-20 · **Status:** decided · **Scope:** design

**Decision.** POST and DELETE on `/admin/suppliers/:id` call
`updateSupplierWorkflow` and `deleteSupplierWorkflow` rather than the service
directly, even though each wraps a single service call and composes nothing.

**Why.** `npm run lint` reports `@medusajs/no-service-mutations-in-api-route` on
`updateSuppliers` and `deleteSuppliers` inside a handler, and the ESLint policy
in AGENTS.md says follow the rule rather than silence it. Beyond the rule: both
workflows carry compensations, which is where the
`deleteSuppliers` / `softDeleteSuppliers` distinction had to be settled — writing
them forced that question to be answered instead of assumed. The update workflow
also became the only source of the update's 404, which is what allowed the
route-level guard to go (D-008).

**What we lose.** Two directories and roughly sixty lines for what is
`await service.updateSuppliers(...)`. A reader tracing an update now goes route →
workflow → step before reaching the mutation.

**Rejected alternative.** Direct service calls in the handlers. Shorter, and
still passes CI since the rule is configured at `warn`. Rejected because it makes
"workflow or not" a judgement call on every future route.

---


## D-010 — Update is `POST /admin/suppliers/:id`, not PATCH

**Date:** 2026-08-20 · **Status:** decided · **Scope:** design

**Decision.** The supplier update route is `POST /admin/suppliers/:id`. No PATCH
handler is exported, and the middleware entry registers the validator under
`method: "POST"`.

**Why.** Core Medusa ships no PATCH handler anywhere:

```bash
grep -rlE "exports\.PATCH ?=" node_modules/@medusajs/medusa/dist/api/   # no output
```

`/admin/products/[id]/route.js` exports GET, POST and DELETE, and the update is
the POST — it runs `updateProductsWorkflow` and answers `200 { product }`. The
`medusa-dev` skill states the same rule as `arch-http-methods`. This is D-007
applied to the method.

**What we lose.** POST now means two things on one resource: create at
`/admin/suppliers`, update at `/admin/suppliers/:id`. Anyone arriving from
ordinary REST reads that as wrong, and the route file gives no hint the choice
was deliberate — hence the comment above the handler pointing here. A partial
update also no longer announces itself in the method; only the all-optional
`UpdateSupplierSchema` says so.

**Rejected alternative.** Keeping PATCH. Semantically nicer in isolation, and
what was originally specified. Rejected because the admin dashboard and the JS
SDK speak POST for updates.

---


## D-011 — Integration tests target the routes, not the layers beneath

**Date:** 2026-08-25 · **Status:** decided · **Scope:** design · **Linear:** CV-33

**Decision.** Integration tests assert on the HTTP contract only — status code,
response shape, and the absence of `api_token`. Workflows, steps and services are
never called directly from a test. `integration-tests/http/suppliers.spec.ts`
reaches every supplier admin route through the `api` client and imports no
workflow.

**Why.** The route is the API contract and changes rarely. What sits under it
will move: M2 adds product submission to the same module, M3a puts token auth in
front of these routes, and the update path was rewritten three times in two days.
A test aimed at `updateSupplierStep` would have gone red on each of those
rewrites without a single client-visible thing having broken.

**What we lose.** A 404 produced inside a step is observed from the route, and
the test cannot say where it came from. Mutation testing made the cost concrete:
replacing `retrieveSupplier` with a non-throwing `listSuppliers` inside
`updateSupplierStep` left the suite green, because `updateSuppliers` throws
NOT_FOUND on its own and the status the client sees never changed. The test only
went red once both sources were neutralised. So "the update's 404 comes from the
step" (D-008) is documentation, not something the suite enforces.

**Rejected alternative.** Step-level tests alongside the route tests. They would
pin where each error originates, at the price of a second suite that breaks on
every refactor of the layer most likely to be refactored. If the origin of a
status ever becomes load-bearing, assert on the error *message* from the route
instead — the two sources word it differently.

---


## D-012 — Test fixtures are built through the container, not over HTTP

**Date:** 2026-08-25 · **Status:** decided · **Scope:** design · **Linear:** CV-33

**Decision.** Data a test needs to already exist is created through the module
service resolved from `getContainer()`. Only the behaviour under test goes
through the `api` client.

**Why.** An update test must not fail because the create route is broken. Built
over HTTP, one bad POST turns a single red test into eight and the suite stops
saying which contract broke. Resolving the service is also faster: no HTTP round
trip, no auth header, no validator.

**What we lose.** Fixtures bypass the workflows, so anything a step generates has
to be supplied by hand. `api_token` is the current case: D-004 keeps its
generation inside the step and out of the input type, while the column is
non-nullable and unique — so a fixture passes an arbitrary value no real supplier
would hold. Fixtures drift further from what the route produces every time a step
gains logic, and nothing detects the drift.

**Rejected alternative.** Creating fixtures through `POST /admin/suppliers`. One
less thing to keep in sync with the model, and the row would carry a real
generated token. Rejected because it makes every test a test of the create route,
which is the coupling this decision exists to remove.

---


## D-013 — Medusa's own pricing module stores decimal amounts, not cents

**Date:** 2026-08-25 · **Status:** decided · **Scope:** design

**Decision.** The "prices are integers, in cents, everywhere" invariant in
AGENTS.md is scoped to data this project owns the storage for: the supplier's
wholesale/retail price fields (not yet modeled) and any custom module payload. A
price that goes into `@medusajs/pricing` — a per-channel selling price, P3 — is
stored and read as the decimal amount Medusa expects, never multiplied or divided
by 100 at that boundary.

**Why.** `@medusajs/pricing`'s `price` model declares `amount: model.bigNumber()`,
a decimal column, verified at
`node_modules/@medusajs/pricing/dist/models/price.js:15`. The `medusa-dev` skill's
price-format guidance agrees: stored as-is (`49.99`), never ×100 on save or ÷100
on display. AGENTS.md's blanket "everywhere" was written before P3 existed.

**What we lose.** A rule with no exceptions became a rule with a boundary. Code
reading or writing a Medusa core price uses decimals; code owning its own price
storage uses cents. Whoever builds the P3 pricing UI has to know which side they
are on.

**Follow-up.** When the supplier price fields are modeled (M2) and per-channel
pricing is built (P3), name the conversion boundary in that plan — most likely
the admin form, where an operator-typed decimal becomes a pricing-module amount
directly, with no cents representation in between.

---


## D-014 — Submission enters as `proposed`, not `draft`

**Date:** 2026-08-25 · **Status:** decided · **Scope:** design · **Linear:** CV-19

**Decision.** Medusa's product `status` enum ships `draft`, `proposed`,
`published`, `rejected`. The submission flow uses `proposed`. The state machine
in full:

    proposed --approve--> published
    proposed --reject---> rejected

No other transition exists: no un-publishing, no re-approving a rejected product,
no return to `proposed`. `draft` is reserved for a future save-and-continue flow
(M4b) and is never written by the MVP.

**Why.** In the MVP `proposed` and `draft` are indistinguishable, since
submission is a single call and nothing ever sits in `draft`. The distinction is
adopted now because it is free now and expensive later — adding it after the fact
means a data migration plus rewriting every filter and guard that reads status.

**What we lose.** The pending-products page (CV-20) filters on
`status = "proposed"`. Approve and reject must answer `409` on any other source
status, not `400`: the request is well-formed, the resource is in the wrong state.

**Trigger to revisit.** M4b, when a supplier-side draft flow makes `draft`
reachable and the machine gains `draft -> proposed`.

---


## D-015 — The rejection reason lives in product `metadata`

**Date:** 2026-08-25 · **Status:** decided · **Scope:** design · **Linear:** CV-22

**Decision.** Rejecting a product accepts an optional reason, stored as
`metadata.rejection_reason` — that exact key, nowhere else. Zod-validated, max
500 characters.

**Why.** A history table is the correct model and belongs to Phase B, where
supplier scorecards need it. The MVP has no resubmission path, so a product is
rejected at most once and there is no history to lose. A dedicated column on a
core Medusa entity would mean extending Product, which module isolation makes
awkward for one nullable string.

**What we lose.** `metadata` is untyped, so nothing at the type level prevents
key-name drift. The key is fixed here for that reason, and any code reading or
writing it must cite D-015.

**Trigger to revisit.** Resubmission after rejection, when the reason becomes a
history entry rather than a property of the product.

---


## D-016 — One supplier per product is a code-level invariant, not a database constraint

**Date:** 2026-08-25 · **Status:** decided · **Scope:** design · **Linear:** CV-16

**Decision.** `product-supplier`'s `isList: true` on the product side controls
query field naming only — `supplier.products` is an array, `product.supplier` a
single object — and creates no database constraint. No unique index is added on
`product_id`. The invariant is enforced at the write path: CV-19's submission
workflow checks for an existing link before creating one, and fails loudly.

**Why.** Verified during CV-16: `product_supplier`'s primary key is composite
`(product_id, supplier_id)`, so nothing prevents one product linked to two
suppliers. The failure mode is silent — with two such rows, `query.graph` on
`product.supplier` returns one supplier rather than erroring, and which one is
unspecified. That is exactly the question P4 order routing asks, and it needs
exactly one answer.

Multi-sourcing (the same physical product from two wholesalers, operator picks)
is real business, Phase C at the earliest, and the composite PK is the correct
long-term shape — a unique index would have to be dropped when that arrives.
Meanwhile the MVP write path cannot produce a duplicate: each submission creates
its own new product row, so two suppliers submitting the same sneaker produce two
distinct products, not two links on one product.

**What we lose.** Any code reading `product.supplier` may assume a single
supplier, but only because CV-19 guarantees it, not because the schema does. Any
new write path creating link rows must carry the same guard and cite this ADR.

**Trigger to revisit.** Multi-sourcing, at which point `product.supplier` becomes
wrong at the API level, not merely unconstrained.

---


## D-017 — Local devcontainer abandoned, Codespaces retained

**Date:** 2026-08-28 · **Status:** decided · **Scope:** design

Recorded as a design decision rather than an environment one because it changes
which environments the project supports, not how one of them is configured.

**Decision.** Local development runs Medusa natively on the host against a
Postgres on `localhost:5434`. `.devcontainer/` is kept for GitHub Codespaces
only. Running the devcontainer locally is no longer supported. E-005 is
superseded.

**Why.** Locally the container accumulated three unrelated failure modes with no
stable workaround: the corporate TLS proxy breaking feature installs, because
OrbStack injects the host trust store into running containers but BuildKit does
not and features install at build time (E-003); the same proxy swallowing the
published host port (E-004); and a shared `node_modules/` on the bind mount
holding native bindings for one platform, so installing for one mode broke the
other while appearing to fix it (E-005). None are Medusa problems. Native mode
also dissolves two of them rather than working around them — with a `localhost`
host Medusa stops force-enabling SSL, and there is no build step. Measured
startup is ~4s natively against ~25s in the container.

Codespaces stays because the work machine has no admin rights and restricted
network access. That constraint has not gone away.

**What we lose.**

- The SSL handling of E-001 becomes inert natively but remains **required** for
  Codespaces. It is not dead code and must not be removed.
- `${DEVCONTAINER_BASE_IMAGE}`, the gitignored `.devcontainer/.env`, and the
  `${APP_HOST_PORT:-9000}:9000` remap are now vestigial. Kept because the `:-`
  fallbacks select stock behaviour in Codespaces and cost nothing; documented as
  vestigial in `apps/backend/AGENTS.md` so they are neither debugged nor removed.
- Native mode adds host state the repository cannot describe: a Postgres cluster
  on a non-default port, and `brew services` being broken on the author's
  machine, so the cluster does not restart after a reboot. The resulting Medusa
  error is the misleading connection failure E-001 warns about.
- Any environment fact recorded from here on must state which mode it concerns.
  An unqualified environment fact goes stale the moment the mode changes.


## D-018 — Admin UI data access goes through js-sdk and react-query

**Date:** 2026-08-28 · **Status:** decided · **Scope:** design · **Linear:** CV-17

**Decision.** Admin dashboard extensions fetch through `@medusajs/js-sdk` with
react-query. No hand-rolled `fetch`, no bare `useState` + `useEffect` data
loading. This applies to every page and widget under `src/admin/`.

**Why.** This is D-007 applied to the frontend: core Medusa's own dashboard does
it, so matching it means our pages behave like core's — same cache, same
invalidation on mutation, same error surface. The `medusa-dev` skill states the
same rule.

The alternative was live for one ticket. CV-17 was originally scoped as the place
to learn React by hand, which argued for plain `fetch` so the mechanism stayed
visible. That argument no longer applies: learning is handled outside the tickets,
and tickets carry conventions only.

The concrete cost of `fetch` shows up at the first mutating screen. Approve and
reject (CV-21, CV-22) have to refresh the list after a write, which means cache
invalidation — which means react-query, or a hand-rolled version of it. Writing
that twice is the expensive path.

**What we lose.** `fetch` was one import and no dependency; react-query adds a
concept an unfamiliar reader has to know before they can follow a page. The
mechanics the tickets used to expose — when the request fires, what the
intermediate state is, why `useEffect` rejects an async function — are now hidden
behind a hook. They are still worth understanding, but that belongs outside the
repo.

**Note.** `fetch` not rejecting on 4xx/5xx remains true underneath; react-query
surfaces an error only if the fetcher throws, and the js-sdk does that for us.


---


# Environment decisions


## E-001 — SSL disabled in two places, deliberately

**Date:** 2026-08-19 · **Status:** decided · **Scope:** environment

Since D-017, this applies to Codespaces only. Natively the host is `localhost`,
the inference is correct, and both mechanisms are inert — but still required, so
neither may be removed as dead code.

**Decision.** SSL is disabled for the database in two independent places:
`?sslmode=disable` in the `DATABASE_URL` exported by
`.devcontainer/docker-compose.yml`, and the `databaseDriverOptions` block in
`medusa-config.ts`. Both stay.

**Why.** Medusa infers SSL from the database host and force-enables it for
anything that isn't `localhost` / `127.0.0.1`. In the container Postgres is
reached as the compose service name `postgres`, so the inference is wrong, and
the resulting failure is misleading: `db:migrate` reports a connection timeout
because the migration pool sets `propagateCreateError: false` and swallows the
real SSL error. This cost real debugging time once.

The redundancy is intentional. Depending on the code path Medusa may read the
connection string or the driver options, and the two mechanisms cover different
entry points. `DATABASE_SSL=true` re-enables TLS for a managed database.

**What we lose.** Nothing in development. On Railway, `DATABASE_SSL=true` must be
set explicitly at deploy time — it is not automatic.

---


## E-002 — The devcontainer mounts the repo, not its parent

**Date:** 2026-08-21 · **Status:** decided · **Scope:** environment

**Decision.** `.devcontainer/docker-compose.yml` binds `..` to
`/workspaces/centravy`, rather than the stock template's `../..` to
`/workspaces`.

**Why.** A relative bind-mount source resolves against the directory holding the
compose file, so `../..` is the *parent* of the repo. In a Codespace that parent
is `/workspaces` and contains only this checkout, so the template is harmless. On
a development machine it is wherever the repo lives — here `~/source`, 61
unrelated checkouts and 14 GB — and every one becomes readable and writable from
inside the container. Agents run in this container.

`..` is the repo root in both environments, so the narrower mount removes the
divergence rather than branching on it, and the target matches the
`workspaceFolder` that `devcontainer.json` already declares.

**What we lose.** The folder name `centravy` is written in two places, the mount
target and `workspaceFolder`. Renaming the checkout breaks both — visibly, at
container start. Anyone copying this compose file into another project has to
understand the deviation before adjusting it.

**Rejected alternative.** A second devcontainer config under
`.devcontainer/local/`, leaving the Codespaces one untouched. Zero risk to a
working setup, but two compose files to keep in sync, and drift between them
would surface as an environment-specific bug. Moot since D-017.

---


## E-003 — The base image is overridable, for TLS-inspected networks

**Date:** 2026-08-21 · **Status:** decided · **Scope:** environment

Vestigial since D-017: the override only applied to the local container. Kept
because the `:-` fallback selects the stock image in Codespaces. Do not debug it,
do not delete it. Retained here because the diagnosis is worth keeping.

**Decision.** `.devcontainer/docker-compose.yml` takes the app image from
`${DEVCONTAINER_BASE_IMAGE:-mcr.microsoft.com/devcontainers/typescript-node:22-bookworm}`.
On a machine behind a TLS-inspecting proxy, the gitignored `.devcontainer/.env`
pointed that at a locally built image carrying the proxy CA roots. Codespaces has
no such file and uses the stock image.

**Why.** Devcontainer features install at *build* time. OrbStack injects the host
trust store into *running* containers — `docker run` reaches HTTPS fine — but
BuildKit does not, so the `github-cli` feature's installer died with
`curl: (60) ... unable to get local issuer certificate`. The failure names the
feature, not the proxy.

The CA had to be baked into the base image because the `Dockerfile.extended` that
installs features is generated by the devcontainer CLI and is not ours to edit.
The build context lives outside the repo, in `~/.centravy-devcontainer/`, because
**the repository is public and that CA must never enter it**. The roots are split
one per file: Debian's `update-ca-certificates` reads only the first certificate
from a multi-cert file, so a single bundle silently registers one root and leaves
the rest untrusted.

**What we lose.** The local image is machine state the repo cannot reproduce, and
nothing but this ADR says how to rebuild it. Moot in practice since D-017.

---


## E-004 — The host port is variable, the container port is not

**Date:** 2026-08-21 · **Status:** decided · **Scope:** environment

The port remap is vestigial since D-017 — it only applied to the local
container's published port. **The proxy behaviour it documents is not
vestigial**: it is a property of the machine and can still affect a natively
running Medusa. The measurement technique below is the part to keep.

**Decision.** `.devcontainer/docker-compose.yml` publishes
`${APP_HOST_PORT:-9000}:9000`. The container always listens on 9000. A machine
whose network intercepts host port 9000 set `APP_HOST_PORT` in the gitignored
`.devcontainer/.env`; Codespaces has no such file and keeps 9000.

**Why.** A TLS-inspecting proxy transparently captures host port 9000 on the
author's machine, and the failure is silent and actively misleading. The TCP
handshake succeeds, so nothing reports a refused connection. The browser shows
`ERR_EMPTY_RESPONSE`. `curl` reports **HTTP 200 with a zero-byte body** and a
`Proxy-Agent` header that never came from Medusa — so a status-code check
*passes* while nothing works. `--noproxy` does not help, because the capture is
below HTTP.

Two measurements settle it: the same request answered from inside the container
returns 743 bytes in 0.3s, and a control container published on host port 8099
answers instantly.

Only the host side moved, so `medusa-config.ts`, the CORS entries,
`.env.template`, the README and Codespaces all stayed correct.

**What we lose.** On this machine the admin was at `http://127.0.0.1:9009/app`
while every document in the repo said 9000, and the override was invisible from
the repo since `.devcontainer/.env` is gitignored.

---


## E-005 — Two local modes, and they cannot coexist

**Date:** 2026-08-21 · **Status:** superseded by D-017 · **Scope:** environment

**Superseded.** This ADR concluded that both the devcontainer and native mode
were supported locally. D-017 reverses that: there is one local mode, native.
The `@swc` binding conflict described below can no longer occur, since Codespaces
has its own `node_modules` tree. Kept for the reasoning, not as instruction.

**What it decided.** Two local modes, mutually exclusive, both documented,
neither deprecated. Codespaces a third environment, unaffected.

**The mechanism, which is still true in principle.** `node_modules/` sat on the
bind mount as one shared tree, holding native bindings for a single platform:
`@swc/core-linux-arm64-gnu` in the container, `core-darwin-arm64` on macOS.
Installing for one mode silently broke the other, and the error blamed a missing
module rather than the wrong platform. `ls node_modules/@swc/` showed which mode
the tree was in.

**What it got right.** Native mode dissolves E-001 and E-003 rather than working
around them, and starts in ~4s against ~25s. That observation is what D-017 acted
on.

**What it got wrong.** It treated the exclusivity as an acceptable cost of
supporting both, rather than as a reason to support one.
