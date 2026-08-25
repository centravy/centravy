# Decisions

Technical decisions taken during the build, and open questions that need
a business call from the CEO.

Status: `decided` · `pending-rida` · `revisit-post-mvp`

Scope: `design` — product, API and architecture choices that shape the
code. `environment` — how this project is built and run on a given machine.
The two use separate id sequences (`D-` and `E-`) so a renumbering in one
never disturbs references to the other.


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

**Environment**

- [E-001 — SSL disabled in two places, deliberately](#e001)
- [E-002 — The devcontainer mounts the repo, not its parent](#e002)
- [E-003 — The base image is overridable, for TLS-inspected networks](#e003)
- [E-004 — The host port is variable, the container port is not](#e004)
- [E-005 — Two local modes, and they cannot coexist](#e005)

`D-005` is retired: it became `E-001`. `D-017` onward remain free for new
design decisions.


---


# Design decisions


## D-001 — No supplier activation state in the MVP


**Date:** 2026-08-17
**Status:** pending-rida
**Scope:** design
**Linear:** CV-30

**Decision.** The `supplier` model has no `is_active` / `status` field.
Every supplier in the database is considered active.

**Why.** For the MVP and the closed pilot, suppliers are created manually
by the operator. Creating a supplier *is* the approval. Adding a state
field would mean checking it in every route, the submission middleware,
and the order routing logic — cost spread across the codebase for a
guarantee we already get from the manual process.

**What we lose.** No way to suspend a supplier without deleting them.
No self-service signup possible without adding this back.

**To confirm with Rida.** Is there a real case where a supplier must be
temporarily blocked (unpaid, quality issues, dispute) during the pilot?
If yes, this comes back before the demo, not after.

---


## D-002 — Static token auth for the pilot (M3a), not real accounts (M3b)


**Date:** 2026-08-17
**Status:** pending-rida
**Scope:** design
**Linear:** CV-31

**Decision.** Each supplier gets a static API token, generated at creation
and stored in the database. It is sent as an HTTP header on every request.
No login screen, no password, no session. Full account-based auth (M3b) is
deferred post-MVP.

**Why.** ~3h instead of ~13h. Medusa's custom actor-type auth has
documented pitfalls (middleware wildcards, authenticated vendors unable to
use the admin UI). For a demo and a closed pilot with ~5 known suppliers,
a token is enough: we hand it to them directly, they paste it into the
submission form.

**What we lose.** Whoever holds the token *is* the supplier — no per-person
revocation without rotating the whole token. No password recovery flow.
Not acceptable for public signup.

**To confirm with Rida.** Are pilot suppliers comfortable pasting a token
into a form, or does the absence of a normal login hurt credibility during
the demo? If it does, M3b returns to MVP scope and the demo date moves.

---


## D-003 — API token returned on creation only


**Date:** 2026-08-19
**Status:** decided
**Scope:** design

**Decision.** `POST /admin/suppliers` returns `api_token` in the response.
Every other endpoint strips it: the list route, the detail route, and the update
response.

**Why.** There is no UI to reveal a token after the fact, so creation is the
only moment the operator can read it and forward it to the supplier. Keeping
it in the list endpoint would expose every supplier's credential on a route
called for unrelated reasons.

**What we lose.** A token lost after creation cannot be recovered — it has to
be rotated. No rotation endpoint exists yet.

**Follow-up.** If M4b brings a supplier portal, add a rotate endpoint rather
than a reveal one.

---


## D-004 — The API token is generated inside the step, not by the caller


**Date:** 2026-08-19
**Status:** decided
**Scope:** design

**Decision.** `createSupplierStep` generates `api_token` itself with
`randomBytes(32)`. It is not part of the step's input type, so no caller can
supply or choose it.

**Why.** A secret that authenticates must never be chosen by whoever will use
it — otherwise a supplier could pick another supplier's token and impersonate
them. Putting the generation at the deepest layer makes that structural rather
than a rule every caller has to remember. A future seed script or admin UI
cannot get it wrong by omission.

**What we lose.** The step is no longer deterministic: the same input produces
a different row each run. That makes it harder to assert on in a test — a test
has to read the token back from the result instead of comparing against a
fixture.

**Rejected alternative.** Caller-supplied token: keeps the step a pure function
of its input and easier to test, but moves a security guarantee into the
discipline of every call site.

---


## D-006 — In-memory event bus until P4


**Date:** 2026-08-19
**Status:** revisit-post-mvp
**Scope:** design

**Decision.** `projectConfig.redisUrl` is left unset in `medusa-config.ts`, even
though Redis runs in the devcontainer and `REDIS_URL` is exported. Medusa logs
`redisUrl not found` and uses in-memory caching, events, and locking.

**Why.** Nothing before P4 needs a real event bus. In-memory works for a single
process in development, and switching now would add a moving part with no
payoff.

**What we lose.** Events do not survive a restart, and nothing works across
multiple processes. Neither matters yet.

**Trigger to revisit.** Start of P4 (order routing), when the `order.placed`
subscriber makes event durability and idempotence part of what the block is
meant to teach. Switching is one line plus a restart. Railway will need Redis
regardless.

---


## D-007 — Match core Medusa where it ships an equivalent route


**Date:** 2026-08-20
**Status:** decided
**Scope:** design

**Decision.** Where core Medusa already ships an equivalent route, its actual
behaviour — response shape, status codes, HTTP method — is what we copy. REST
principles lose to what core does.

**First application: DELETE is idempotent.** `DELETE /admin/suppliers/:id`
always answers `200` with `{ id, object: "supplier", deleted: true }`, whether or
not the supplier exists. It performs no existence check. GET and POST on the same
path do 404.

**Second application: the method.** An update is `POST /resource/:id`, never
PATCH. Recorded separately in D-010 because it carries its own cost.

**Why, for the delete.** Verified against core Medusa on this instance: calling
`DELETE /admin/products/<id>` twice returns the same `200 {"deleted":true}`
body both times. Where core already has an equivalent route, matching its shape
and status codes costs nothing and means the admin dashboard, the JS SDK, and
any future client behave the same against our routes as against core's.
Deriving a 404 from REST principles instead would make suppliers the one
resource in the API that answers delete differently.

**What we lose, on the delete.** A typo'd or already-deleted id returns success
with no signal, so a client cannot distinguish "I deleted it" from "it was never
there". Any UI that needs that distinction has to GET first.

**Rejected alternative.** Guarding DELETE with the same 404 check as GET: more
informative in isolation, inconsistent with every other delete route
in the product, and it makes a retried delete — the normal outcome of a flaky
connection — look like a failure.

---


## D-008 — Existence is checked in the route on reads


**Date:** 2026-08-20
**Status:** decided
**Scope:** design

**Decision.** `GET /admin/suppliers/:id` runs an explicit `listSuppliers({ id })`
check and throws `MedusaError(MedusaError.Types.NOT_FOUND)` before anything else
happens. The update route has no such check: `updateSupplierStep` already
retrieves the row for its compensation snapshot, and `retrieveSupplier` throws
NOT_FOUND on its own — inside `.run()`, so still before anything is written to
the response.

**Why.** The generated service methods disagree with each other on a missing
row: `retrieveSupplier` throws, `updateSuppliers` and `softDeleteSuppliers` are
happy to do nothing and report success. Reading the route should not require
knowing which of the three you are looking at. An explicit guard makes the 404
the first thing that happens on every handler that has one, and guarantees
nothing has been written to the response when it fires.

**What we lose.** Not a query: the row the check reads is the row GET returns.
What it costs is asymmetry — two handlers on one path answer 404 by different
mechanisms, and a reader has to know the update's 404 comes from a step two files
away.

**Rejected alternative.** Passing the row already read by the guard into the
workflow as input: saves the second read, but moves the compensation snapshot
out of the step and into the caller, where a future call site can forget it.
Same reasoning as D-004 — the guarantee belongs at the deepest layer.

---


## D-009 — Every mutation goes through a workflow, including single-call ones


**Date:** 2026-08-20
**Status:** decided
**Scope:** design

**Decision.** POST and DELETE on `/admin/suppliers/:id` call
`updateSupplierWorkflow` and `deleteSupplierWorkflow` rather than calling the
service directly, even though each wraps a single service call and composes
nothing.

**Why.** `npm run lint` reports
`@medusajs/no-service-mutations-in-api-route` on `updateSuppliers` and
`deleteSuppliers` inside a handler. The rule was followed rather than silenced,
per the ESLint policy in AGENTS.md. Beyond the rule: the two workflows carry
compensations, which is where the `deleteSuppliers` / `softDeleteSuppliers`
distinction had to be settled — writing them forced that question to be answered
instead of assumed. The update workflow also became the only place the update's
404 comes from, which is what allowed the route-level guard to go (D-008).
Recorded here so nobody reopens it later as an oversight.

**What we lose.** Two directories and roughly sixty lines for what is
`await service.updateSuppliers(...)`. A reader tracing the update now goes route
to workflow to step before reaching the mutation.

**Rejected alternative.** Direct service calls in the handlers: shorter and
still passes CI, since the rule is configured at `warn` and does not fail the
build. Rejected because it makes "workflow or not" a judgement call on every
future route, and the first exception is what makes the second one easy.

---


## D-010 — Update is `POST /admin/suppliers/:id`, not PATCH


**Date:** 2026-08-20
**Status:** decided
**Scope:** design

**Decision.** The supplier update route is `POST /admin/suppliers/:id`. No PATCH
handler is exported, and the middleware entry registers the validator under
`method: "POST"`.

**Why.** Core Medusa ships no PATCH handler anywhere:

```bash
grep -rlE "exports\.PATCH ?=" node_modules/@medusajs/medusa/dist/api/   # no output
```

`/admin/products/[id]/route.js` exports GET, POST and DELETE, and the update is
the POST — it runs `updateProductsWorkflow` and answers `200 { product }`. The
`medusa-dev` skill states the same rule as `arch-http-methods`: GET, POST and
DELETE only. This is the rule recorded in D-007, applied to the method, so PATCH
would have made suppliers an exception to a rule written in the same commit.

**What we lose.** POST now means two things on one resource: create at
`/admin/suppliers`, update at `/admin/suppliers/:id`. Anyone arriving from
ordinary REST reads that as wrong, and the route file gives no hint that the
choice was deliberate — hence the comment above the handler pointing here.
A partial update also no longer announces itself in the method; only the
all-optional `UpdateSupplierSchema` says so.

**Rejected alternative.** Keeping PATCH: semantically nicer in isolation, and it
is what was originally specified. Rejected because the admin dashboard and the
JS SDK speak POST for updates, and because an exception to "match core" taken on
the first route it applies to is not an exception, it is a repeal.

---


## D-011 — Integration tests target the routes, not the layers beneath


**Date:** 2026-08-25
**Status:** decided
**Scope:** design
**Linear:** CV-33

**Decision.** Integration tests assert on the HTTP contract only — status code,
response shape, and the absence of `api_token`. Workflows, steps and services are
never called directly from a test. `integration-tests/http/suppliers.spec.ts`
reaches every supplier admin route through the `api` client and imports no
workflow.

**Why.** The route is the API contract, and it changes rarely. What sits under it
will move: M2 adds product submission to the same module, M3a puts token auth in
front of these routes, and the update path was already rewritten three times in
two days. A test aimed at `updateSupplierStep` would have gone red on each of
those rewrites without a single client-visible thing having broken. A suite that
cries wolf on a rename gets deleted the third time it does it, and then there is
no suite at all.

**What we lose.** A 404 produced inside a step is observed from the route, and
the test cannot say where it came from. Mutation testing made the cost concrete:
replacing `retrieveSupplier` with a non-throwing `listSuppliers` inside
`updateSupplierStep` left the suite green, because `updateSuppliers` throws
NOT_FOUND on its own and the status the client sees never changed. The test only
went red once both sources were neutralised. It guards the contract, not the
location — which is the intended trade, but it means "the update's 404 comes from
the step" (D-008) is documentation, not something the suite enforces.

**Rejected alternative.** Step-level tests alongside the route tests: they would
pin where each error originates, at the price of a second suite that breaks on
every refactor of the layer most likely to be refactored. If the origin of a
status ever becomes load-bearing, assert on the error *message* from the route
instead — the two sources word it differently — rather than adding a suite.

---


## D-012 — Test fixtures are built through the container, not over HTTP


**Date:** 2026-08-25
**Status:** decided
**Scope:** design
**Linear:** CV-33

**Decision.** Data a test needs to already exist is created through the module
service resolved from `getContainer()`. Only the behaviour under test goes
through the `api` client.

**Why.** An update test must not fail because the create route is broken. Built
over HTTP, one bad POST turns a single red test into eight, and the suite stops
saying which contract broke — the thing it exists to say. Resolving the service
is also faster: no HTTP round trip, no auth header, no validator.

**What we lose.** Fixtures bypass the workflows, so anything a step generates has
to be supplied by hand in the test. `api_token` is the current case: D-004 puts
its generation inside `createSupplierStep` and deliberately keeps it out of the
step's input type, while the column is non-nullable and unique — so a fixture
passes an arbitrary value no real supplier would ever hold. D-004 anticipated
this from the other side when it noted that a test has to read the token back
from the result rather than compare against a fixture. Fixtures drift further
from what the route actually produces every time a step gains logic, and nothing
detects the drift.

**Rejected alternative.** Creating fixtures through `POST /admin/suppliers`: one
less thing to keep in sync with the model, and the row would carry a real
generated token instead of a hand-written one. Rejected because it makes every
test a test of the create route, which is the coupling this decision exists to
remove.

---


## D-013 — Medusa's own pricing module stores decimal amounts, not cents


**Date:** 2026-08-25
**Status:** decided
**Scope:** design

**Decision.** The "prices are integers, in cents, everywhere" invariant in
AGENTS.md is scoped to data this project owns the storage for — the
supplier's wholesale/retail price fields (not yet modeled) and any custom
module payload. It does not describe core Medusa's pricing module. A price
that goes into `@medusajs/pricing` (a per-channel selling price, P3) is
stored and read as the decimal amount Medusa expects, and never multiplied or
divided by 100 at that boundary.

**Why.** `@medusajs/pricing`'s `price` model declares
`amount: model.bigNumber()` — verified directly at
`node_modules/@medusajs/pricing/dist/models/price.js:15` — a decimal column.
The installed `medusa-dev` skill's price-format guidance agrees: prices are
stored as-is (`49.99`), never ×100 on save or ÷100 on display. AGENTS.md's
blanket "everywhere" was written before P3 existed and never checked against
the pricing module specifically.

**What we lose.** "Cents everywhere" was a one-sentence rule with no
exceptions to remember. The corrected version has a boundary: code that reads
or writes a Medusa core price (the pricing module, price sets, price lists)
uses decimal amounts; code that owns its own price storage uses cents. A
future contributor building the P3 per-channel pricing UI has to know which
side of that boundary they're on.

**Follow-up.** When the supplier wholesale/retail price fields are modeled
(M2) and per-channel pricing is built (P3), name the conversion boundary
explicitly in that plan — most likely the admin form, where an operator-typed
decimal price becomes a Medusa pricing-module amount directly, with no cents
representation in between.

---


## D-014 — Submission enters as `proposed`, not `draft`


**Date:** 2026-08-25
**Status:** decided
**Scope:** design
**Linear:** CV-19

**Decision.** Medusa's product `status` enum ships four values: `draft`,
`proposed`, `published`, `rejected`. The submission flow (CV-19) uses
`proposed`.

The state machine, in full:

    proposed --approve--> published
    proposed --reject---> rejected

No other transition exists. Specifically: no un-publishing, no re-approving a
rejected product, no return to `proposed`. `draft` is reserved for a future
save-and-continue flow (M4b) and is never written by the MVP.

**Why.** In the MVP, `proposed` and `draft` are indistinguishable —
submission is a single call, so nothing ever sits in `draft`. The
distinction is adopted now because it is free now and expensive later:
adding it after the fact means a data migration plus rewriting every filter
and guard that reads the status.

**What we lose.** The pending-products page (CV-20) filters on
`status = "proposed"`. Approve and reject reject any other source status
with `409`, not `400`: the request is well-formed, the resource is in the
wrong state.

**Trigger to revisit.** M4b, when a supplier-side draft flow is introduced.
At that point `draft` becomes reachable and the machine gains
`draft -> proposed`.

---


## D-015 — The rejection reason lives in product `metadata`


**Date:** 2026-08-25
**Status:** decided
**Scope:** design
**Linear:** CV-22

**Decision.** Rejecting a product (CV-22) accepts an optional reason. It is
stored as `metadata.rejection_reason` — that exact key, nowhere else.
Zod-validated, max 500 characters.

**Why.** A history table is the correct model for a rejection reason, and
belongs to Phase B, where supplier scorecards need it. The MVP has no
resubmission path, so a product is rejected at most once and there is no
history to lose. A dedicated column on a core Medusa entity would mean
extending Product, which module isolation makes awkward for one nullable
string.

**What we lose.** `metadata` is untyped, so nothing at the type level
prevents a key-name drift. The key is fixed here for that reason, and any
code reading or writing it must cite D-015.

**Trigger to revisit.** Resubmission after rejection. At that point the
reason becomes a history entry, not a property of the product.

---


## D-016 — One supplier per product is a code-level invariant, not a database constraint


**Date:** 2026-08-25
**Status:** decided
**Scope:** design
**Linear:** CV-16

**Decision.** `product-supplier`'s `isList: true` on the product side
controls query field naming only — `supplier.products` is an array,
`product.supplier` is a single object — and creates no database constraint.
Verified empirically during CV-16: `product_supplier`'s primary key is
composite `(product_id, supplier_id)`; nothing prevents two rows sharing a
`product_id`, i.e. one product linked to two suppliers. The failure mode is
silent: with two such rows, `query.graph` on `product.supplier` returns one
supplier rather than erroring, and which one is unspecified — exactly the
question P4 order routing asks, needing exactly one answer.

No unique index is added on `product_id`. The invariant is enforced at the
write path instead: CV-19's submission workflow checks for an existing link
before creating one, and fails loudly.

**Why.** Multi-sourcing (the same physical product from two wholesalers,
operator picks) is real business, Phase C at the earliest. The composite PK
is the correct long-term shape; a unique index would have to be dropped when
that arrives. Meanwhile the MVP write path cannot produce a duplicate by
construction: each submission creates its own new product row, so two
suppliers submitting the same sneaker produce two distinct products, not two
links on one product.

**What we lose.** Any code reading `product.supplier` may assume a single
supplier, but only because CV-19 guarantees it, not because the schema does.
Any new write path that creates link rows must carry the same guard and cite
this ADR.

**Trigger to revisit.** Multi-sourcing being introduced. At that point
`product.supplier` becomes wrong at the API level, not just unconstrained.

---


# Environment decisions


## E-001 — SSL disabled in two places, deliberately


**Date:** 2026-08-19
**Status:** decided
**Scope:** environment

**Decision.** SSL is disabled for the database in two independent places:
`?sslmode=disable` in the `DATABASE_URL` exported by
`.devcontainer/docker-compose.yml`, and the `databaseDriverOptions` block in
`medusa-config.ts`. Both stay.

**Why.** Medusa infers SSL from the database host and force-enables it for
anything that isn't `localhost`/`127.0.0.1`. In the devcontainer, Postgres is
reached as the compose service name `postgres`, so the inference is wrong. The
resulting failure is *misleading*: `db:migrate` reports a connection timeout
because the migration pool sets `propagateCreateError: false` and swallows the
real SSL error. This cost real debugging time once and must not cost it twice.

The redundancy is intentional. Depending on the code path, Medusa may read the
connection string or the driver options, and the two mechanisms cover different
entry points. `DATABASE_SSL=true` re-enables TLS for a managed database.

**What we lose.** Nothing in development. On Railway, `DATABASE_SSL=true` must
be set explicitly at deploy time — it is not automatic.

---


## E-002 — The devcontainer mounts the repo, not its parent


**Date:** 2026-08-21
**Status:** decided
**Scope:** environment

**Decision.** `.devcontainer/docker-compose.yml` binds `..` to
`/workspaces/centravy`, rather than the stock devcontainer template's `../..` to
`/workspaces`. One compose file serves both GitHub Codespaces and a local
Docker/OrbStack devcontainer.

**Why.** A relative bind-mount source resolves against the directory holding the
compose file, so `../..` is the *parent* of the repo. In a Codespace that parent
is `/workspaces` and contains only this checkout, so the template is harmless.
On a development machine it is wherever the repo happens to live — here
`~/source`, 61 unrelated checkouts and 14 GB — and every one of them becomes
readable and writable from inside the container. Agents run in this container;
the blast radius is the point.

`..` is the repo root in both environments, so the narrower mount is not a
local-only special case: it removes the divergence rather than branching on it.
The target matches the `workspaceFolder` that `devcontainer.json` already
declares.

**What we lose.** The folder name `centravy` is now written in two places, the
mount target and `workspaceFolder`. Renaming the checkout breaks both — though
it breaks them together and visibly, at container start. Deviating from the
stock template also means anyone copying this compose file into another project
has to understand the change before adjusting it.

**Rejected alternative.** A second devcontainer config under
`.devcontainer/local/`, leaving the Codespaces one untouched: zero risk to a
working setup, but two compose files to keep in sync, and drift between them
would surface as an environment-specific bug — the same class of problem this
repo already pays for once in E-001.

---


## E-003 — The base image is overridable, for TLS-inspected networks


**Date:** 2026-08-21
**Status:** decided
**Scope:** environment

**Decision.** `.devcontainer/docker-compose.yml` takes the app image from
`${DEVCONTAINER_BASE_IMAGE:-mcr.microsoft.com/devcontainers/typescript-node:22-bookworm}`.
On a machine behind a TLS-inspecting proxy, the gitignored `.devcontainer/.env`
points that at a locally built image carrying the proxy CA roots. Codespaces
has no such file and therefore uses the stock image, unchanged.

**Why.** Devcontainer features install at *build* time. OrbStack injects the
host trust store into *running* containers — `docker run` reaches HTTPS fine —
but BuildKit does not, so the `github-cli` feature's installer died with
`curl: (60) ... unable to get local issuer certificate`. The failure names the
feature, not the proxy, which is what makes it expensive to diagnose.

The CA has to be baked into the base image because the `Dockerfile.extended`
that installs features is generated by the devcontainer CLI and is not ours to
edit. The build context lives outside the repo, in `~/.centravy-devcontainer/`,
because **the repository is public and that CA must never enter it**.
The roots are split one per file: Debian's `update-ca-certificates` reads only
the first certificate from a multi-cert file, so a single bundle silently
registers one root and leaves the rest untrusted.

**What we lose.** The local image is machine state that the repo cannot
reproduce. A new machine behind the proxy has to rebuild it, and nothing but
this ADR and AGENTS.md says how. The same rebuild is required whenever the
proxy CA rotates, and the symptom then is a feature install failing again
with a TLS error — the connection to an expired certificate will not be
obvious.

**Rejected alternative.** Dropping the `github-cli` feature. Simpler, and it
would have removed the build step entirely, since the compose file otherwise
uses a plain `image:`. Rejected because it trades a solved problem for a
permanently degraded container, and because the next feature anyone adds walks
into the same wall with no hint that it was ever solved.

---


## E-004 — The host port is variable, the container port is not


**Date:** 2026-08-21
**Status:** decided
**Scope:** environment

**Decision.** `.devcontainer/docker-compose.yml` publishes
`${APP_HOST_PORT:-9000}:9000`. The container always listens on 9000. A machine
whose network intercepts host port 9000 sets `APP_HOST_PORT` in the gitignored
`.devcontainer/.env`; Codespaces has no such file and keeps 9000.

**Why.** On the author's machine a TLS-inspecting proxy transparently captures
host port 9000, and the failure is both silent and actively misleading. The TCP
handshake succeeds, so nothing reports a refused connection. The browser shows
`ERR_EMPTY_RESPONSE`. `curl` reports **HTTP 200 with a zero-byte body** and a
a `Proxy-Agent` header that never came from Medusa — so a status-code
check *passes* while nothing works. `--noproxy` does not help, because the
capture is below HTTP.

Two measurements settle it: the same request answered from inside the container
returns 743 bytes in 0.3s, and a control container published on host port 8099
answers instantly. Host-to-container networking is fine; the port is the
variable.

Only the host side moves. Keeping the container on 9000 means `medusa-config.ts`,
the CORS entries, `.env.template`, the README and Codespaces all stay correct —
the browser URL is the only thing that changes.

**What we lose.** On this machine the admin is at `http://127.0.0.1:9009/app`
while every document in the repo says 9000, so the README is locally wrong in a
way only this ADR explains. The override is also invisible from the repo, since
`.devcontainer/.env` is gitignored — a second machine behind the same proxy gets
the same silent failure and no clue.

**Rejected alternative.** Moving Medusa itself off 9000 via `PORT`. One port
instead of a mapping is conceptually simpler, but it diverges from Codespaces
and forces `.env.template`, the README and AGENTS.md to be edited to stay
honest — spreading a machine-specific workaround across shared files.
---

## E-005 — Two local modes, and they cannot coexist

**Date:** 2026-08-21
**Status:** decided
**Scope:** environment

**Decision.** The project supports two local modes: the devcontainer, or Medusa
running natively on the host against a local Postgres. Both are documented and
neither is deprecated. Locally they are **mutually exclusive**. Codespaces is a
third environment and is unaffected by either.

**Why.** The configuration cost of native mode is two lines in the gitignored
`apps/backend/.env` -- a `localhost` `DATABASE_URL` and a `PORT`. Nothing in
`medusa-config.ts` or `.devcontainer/` changes, which is why supporting both
costs almost nothing in the repository itself. Native mode also dissolves two
problems rather than working around them: with a `localhost` host Medusa stops
force-enabling SSL, so E-001 becomes a no-op, and there is no build step, so
E-003 does not apply. Measured startup is roughly 4s natively against about 25s
in the container.

The exclusivity is not a policy, it is a fact of the filesystem. `node_modules/`
sits on the bind mount and is therefore one shared tree, but it holds native
bindings for a single platform: `@swc/core-linux-arm64-gnu` in the container,
`core-darwin-arm64` on macOS. Installing for one mode silently breaks the other,
and the error blames a missing module rather than the wrong platform.
`ls node_modules/@swc/` is the fastest way to see which mode the tree is in.

**What we lose.** Switching modes costs a full `npm install` in the new
location, so it is a deliberate move rather than something to do casually. Two
modes also means two sets of instructions to keep true, and this file plus
AGENTS.md are the only place the exclusivity is written down -- nothing in the
code enforces or even hints at it.

Native mode adds host-level state the repository cannot describe: a Postgres
cluster on a non-default port, and the fact that `brew services` is broken on
the author's machine, so the cluster does not restart after a reboot. The
resulting Medusa error is the misleading connection failure E-001 warns about.

**Rejected alternative.** Making native mode the only supported path and
deleting `.devcontainer/`. Simpler, and it would retire E-002 and E-003 with it,
but Codespaces is the fallback for a machine with no admin rights -- the
constraint that created this setup in the first place, and one that has not
gone away.
