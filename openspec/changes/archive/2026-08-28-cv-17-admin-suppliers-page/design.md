## Context

See `proposal.md` — Why. The constraints that actually shape the approach:

- **No admin-side code exists yet.** `src/admin/` holds only `i18n/index.ts`
  (an empty default export), `tsconfig.json` and `vite-env.d.ts`. There is no
  SDK client, no shared types, no page. Whatever this change puts in
  `src/admin/lib/` becomes the pattern CV-18 and CV-20 copy.
- **The API is fixed and already correct.** `GET /admin/suppliers` returns
  `{ suppliers: [...] }` and `GET /admin/suppliers/:id` returns
  `{ supplier: {...} }`. Both destructure `api_token` away before responding
  (D-003), so the pages consume an already-safe shape.
- **`src/admin/tsconfig.json` is strict**, with `noUnusedLocals` and
  `noUnusedParameters` on. Unused imports are build errors, not warnings.
- **The author is new to TypeScript and React.** Per `openspec/config.yaml`,
  code he cannot explain is a failed task. Where two approaches are equally
  correct, this design takes the one with fewer concepts.

## Goals / Non-Goals

**Goals**

- Establish the admin data-access pattern once — one SDK client, react-query
  hooks, query keys — so CV-18 and CV-20 add pages rather than plumbing.
- Keep every render state a separate, readable early return.
- Declare what the code imports, so the build does not rest on npm hoisting.

**Non-Goals** (beyond the proposal's Out of Scope)

- No abstraction over react-query. No `useSuppliers()` custom hook, no generic
  `<DataState>` wrapper. Two pages is not enough repetition to justify either,
  and both would hide the mechanism the author needs to be able to explain.
- No `DataTable` from `@medusajs/ui`. It is the right component once there is
  pagination, search and sorting — all three are out of scope — and it carries
  a configuration surface (`useDataTable`, column helpers, a search config that
  errors if omitted) that buys nothing here.
- No generated API types. See Decision 4.

## Decisions

### 1. One shared SDK client at `src/admin/lib/sdk.ts`

D-018 already settles *what* (js-sdk + react-query) and why. This decides only
*where*: a single module exporting one configured `Medusa` instance, using
exactly the configuration the Medusa docs and the `medusa-dev` skill specify —
`baseUrl: import.meta.env.VITE_BACKEND_URL || "/"`, `debug: import.meta.env.DEV`,
`auth: { type: "session" }`.

The `auth.type` value is not cosmetic: the dashboard authenticates by session
cookie, so any other value sends no credentials and every admin request answers
401. It is the single most likely way this change fails at runtime.

*Alternative considered:* construct the client inside each page. Rejected —
two clients means two chances to get `auth.type` wrong, and CV-18/CV-20 would
make it four.

### 2. `sdk.client.fetch`, not an `sdk.admin.*` method

`/admin/suppliers` is a custom route this project owns, so the js-sdk has no
`sdk.admin.supplier.*` namespace for it. Reads go through the generic
`sdk.client.fetch<T>(path)`, which still applies the session credentials and
still throws on a non-2xx response — which is what makes react-query's `isError`
branch fire at all. The skill's rule "use existing SDK methods for built-in
endpoints" is not in play; there is no built-in endpoint here.

### 3. Declare `@medusajs/js-sdk` and `@medusajs/icons` in `apps/backend/package.json`

Both are pinned to `2.18.0`, matching every other `@medusajs/*` line. Both are
already on disk at that exact version as transitive dependencies of
`@medusajs/dashboard` and `@medusajs/ui`, so `npm install` after this change
resolves to the same tree and `package-lock.json` gains only the two direct
edges. Confirmed with the author before planning, per the AGENTS.md rule.

**Named conflict.** The `medusa-dev` skill says npm users should *not* install
`@tanstack/react-query` / `react-router-dom` because they are "already
available". AGENTS.md wins here, and the two are reconcilable: this project
already declares both of those packages directly, and this change extends the
same treatment to the other two. The skill's advice is about avoiding *version
skew* from an unpinned install; pinning to `2.18.0` avoids exactly that.

*Alternative considered:* import both without declaring them. Rejected — an
undeclared import works only while npm hoists it, and fails the day
`@medusajs/dashboard` drops or bumps the dependency. The failure would surface
as a build error in an unrelated ticket.

**Candidate ADR — D-019** (`D-019` is the next free design number; `D-018` is
taken). *"A package the admin bundle imports is declared, even when Medusa
already ships it."* This outlives CV-17: CV-18 and CV-20 will import from
`@medusajs/ui`, `@medusajs/icons` and possibly others, and the rule decides each
case without re-arguing it. It is written up as a candidate, not recorded —
whether it earns an ADR is the author's call at apply time.

### 4. A hand-written `Supplier` type, local to the admin code

The pages need a response type. Three sources were possible:

1. Import the model from `src/modules/supplier/models/supplier.ts`. **Rejected**
   — `src/admin/` is bundled by Vite for the browser; importing a module model
   drags `@medusajs/framework/utils` into the client bundle. It would also tie
   the UI to a field set that includes `api_token`, which the API deliberately
   strips.
2. Generate types from the API. **Rejected** — no generation step exists, and
   adding one is a toolchain decision far larger than this ticket.
3. Hand-write the four rendered fields plus `id`, alongside the SDK client.
   **Chosen.** It is five lines, it mirrors what the route actually returns
   (post-`api_token`-strip), and it makes the D-003 constraint structural: the
   type has no `api_token` field, so rendering one would not compile.

The drift risk — the API changes and the hand-written type does not — is real
and accepted; see Risks.

### 5. Four render states as early returns, in a fixed order

`isPending` → `isError` → empty → table. Written as four `if`/`return`
statements at the top of the component rather than nested ternaries in JSX.

This is the shape CV-17 asks for, and it is also the readable one: each state is
a self-contained block, and the "happy path" JSX at the bottom never has to
defend against `undefined`. The order matters — checking `isError` before
`isPending` would flash an error during a refetch, and checking empty before
`isPending` would flash "no suppliers" on every load. The detail page has the
same structure minus the empty state; a 404 from the API throws in the fetcher
and therefore lands in `isError`, which is why "supplier does not exist" needs
no branch of its own.

### 6. Query keys `["suppliers"]` and `["supplier", id]`

Singular-with-id for the detail, plural for the list — the convention the Medusa
dashboard itself uses. Nothing in CV-17 invalidates a cache, so this decision
buys nothing today; it is made now because CV-21/CV-22 (approve, reject) will
invalidate `["suppliers"]` after a write, and a key chosen ad hoc then would not
match a key chosen ad hoc now.

### 7. The row link lives in the name cell

CV-17 asks for navigation via `react-router-dom`'s `Link`. An entire `<tr>`
cannot be an anchor — invalid HTML, and the row would not be keyboard-reachable.
So the supplier's name renders as `<Link to={`/suppliers/${supplier.id}`}>`
inside its cell. The path is written without the `/app` prefix: the dashboard
router already runs under that basename, so `/suppliers/:id` resolves to
`/app/suppliers/:id`.

*Alternative considered:* a clickable `Table.Row` with `useNavigate` in an
`onClick`. Rejected — it is not a link, so it is invisible to the keyboard, to
middle-click, and to "open in new tab".

### 8. Verification is manual, in the running dashboard

The repo has three jest projects (`unit`, `integration:http`,
`integration:modules`), all backend-facing; D-011 scopes integration tests to
routes. There is no jsdom, no React Testing Library, no component runner. Adding
one is a new dependency plus a new toolchain — out of scope for CV-17 and
deserving its own decision.

Consequence for the plan: `tasks.md` carries an explicit manual verification
checklist, one item per spec scenario, including how to force the error state.
The spec's scenarios are phrased as rendered elements precisely so they can be
automated later without being rewritten.

## Risks / Trade-offs

- **`auth: { type: "session" }` gets mistyped or omitted → every request 401s,
  and the page renders the error state with no obvious cause.** → It is the
  first task, isolated in its own file, and the manual checklist verifies a
  successful list render before anything else is built.
- **The hand-written `Supplier` type drifts from the API.** → The type is
  colocated with the SDK client, one file, five lines, and it is a *narrowing*
  of the response: extra API fields are ignored rather than breaking. A removed
  or renamed field would render `undefined`, caught by the manual checklist.
- **No automated coverage at all for this UI.** → Accepted, and named in the
  proposal rather than hidden. The mitigation is that the spec scenarios are
  written to be executable later; the exposure is one screen with no writes.
- **The empty state is easy to leave untested**, since the seed script creates no
  suppliers — the empty state is in fact the *first* thing a fresh database
  shows. → That is also the mitigation: the checklist verifies the empty state
  before creating a supplier, in the order a fresh clone naturally hits them.
- **`noUnusedLocals` turns a leftover import into a failed build**, which reads
  as a confusing error to someone new to the toolchain. → Called out here and in
  the tasks so it is recognised rather than debugged.

## Migration Plan

None. Three new files, two `package.json` lines, no data, no API, no removals.
Rollback is `git revert`; nothing else observes these files.

## Open Questions

- **Which icon.** The plan uses `Buildings` from `@medusajs/icons` (verified to
  exist as a named export at 2.18.0). It is a one-line swap and changes no
  behaviour the spec describes, so it can be settled by looking at it.
- **Whether D-019 gets recorded.** Deferrable by construction — the code is
  identical either way; the ADR only fixes the rule for the next ticket.
