# Decisions

Technical decisions taken during the build, and open questions that need
a business call from the CEO.

Status: `decided` · `pending-rida` · `revisit-post-mvp`

---

## D-001 — No supplier activation state in the MVP

**Date:** 2026-08-17
**Status:** pending-rida
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

**Decision.** `POST /admin/suppliers` returns `api_token` in the response.
`GET /admin/suppliers` strips it.

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

## D-005 — SSL disabled in two places, deliberately

**Date:** 2026-08-19
**Status:** decided

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

## D-006 — In-memory event bus until P4

**Date:** 2026-08-19
**Status:** revisit-post-mvp

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

## D-007 — DELETE is idempotent and never 404s

**Date:** 2026-08-20
**Status:** decided

**Decision.** `DELETE /admin/suppliers/:id` always answers `200` with
`{ id, object: "supplier", deleted: true }`, whether or not the supplier
exists. It performs no existence check. GET and PATCH on the same path do 404.

**Why.** Verified against core Medusa on this instance: calling
`DELETE /admin/products/<id>` twice returns the same `200 {"deleted":true}`
body both times. Where core already has an equivalent route, matching its shape
and status codes costs nothing and means the admin dashboard, the JS SDK, and
any future client behave the same against our routes as against core's.
Deriving a 404 from REST principles instead would make suppliers the one
resource in the API that answers delete differently.

**What we lose.** A typo'd or already-deleted id returns success with no signal,
so a client cannot distinguish "I deleted it" from "it was never there". Any UI
that needs that distinction has to GET first.

**Rejected alternative.** Guarding DELETE with the same 404 check as GET and
PATCH: more informative in isolation, inconsistent with every other delete route
in the product, and it makes a retried delete — the normal outcome of a flaky
connection — look like a failure.

---

## D-008 — Existence is checked in the route, before the write

**Date:** 2026-08-20
**Status:** decided

**Decision.** GET and PATCH on `/admin/suppliers/:id` run an explicit
`listSuppliers({ id })` check and throw
`MedusaError(MedusaError.Types.NOT_FOUND)` before anything else happens. They do
not rely on what the service does with an unknown id.

**Why.** The generated service methods disagree with each other on a missing
row: `retrieveSupplier` throws, `updateSuppliers` and `softDeleteSuppliers` are
happy to do nothing and report success. Reading the route should not require
knowing which of the three you are looking at. An explicit guard makes the 404
the first thing that happens on every handler that has one, and guarantees
nothing has been written to the response when it fires.

**What we lose.** One extra query per GET and PATCH — and PATCH pays for a
second read inside `updateSupplierStep`, which snapshots the row for its
compensation. Two reads and a write on a route that could be one read and a
write.

**Rejected alternative.** Passing the row already read by the guard into the
workflow as input: saves the second read, but moves the compensation snapshot
out of the step and into the caller, where a future call site can forget it.
Same reasoning as D-004 — the guarantee belongs at the deepest layer.

---

## D-009 — Every mutation goes through a workflow, including single-call ones

**Date:** 2026-08-20
**Status:** decided

**Decision.** PATCH and DELETE call `updateSupplierWorkflow` and
`deleteSupplierWorkflow` rather than calling the service directly, even though
each wraps a single service call and composes nothing.

**Why.** `npm run lint` reports
`@medusajs/no-service-mutations-in-api-route` on `updateSuppliers` and
`deleteSuppliers` inside a handler. The rule was followed rather than silenced,
per the ESLint policy in AGENTS.md. Beyond the rule: the two workflows carry
compensations, which is where the `deleteSuppliers` / `softDeleteSuppliers`
distinction had to be settled — writing them forced that question to be answered
instead of assumed. Recorded here so nobody reopens it later as an oversight.

**What we lose.** Two directories and roughly sixty lines for what is
`await service.updateSuppliers(...)`. A reader tracing PATCH now goes route to
workflow to step before reaching the mutation.

**Rejected alternative.** Direct service calls in the handlers: shorter and
still passes CI, since the rule is configured at `warn` and does not fail the
build. Rejected because it makes "workflow or not" a judgement call on every
future route, and the first exception is what makes the second one easy.
