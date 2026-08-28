## Why

The operator has no way to see suppliers other than `curl` against
`GET /admin/suppliers`. CV-17 adds the first Centravy screen inside the Medusa
Admin dashboard: a Suppliers list and a per-supplier detail page. It is also the
navigation entry point that CV-18 (product supplier widget) and CV-20 (pending
products page) hang off, so it blocks the rest of the admin UI work in M1.

## What Changes

- **New admin UI route** `src/admin/routes/suppliers/page.tsx` — a list page
  registered with `defineRouteConfig({ label: "Suppliers", icon })` so
  "Suppliers" appears in the dashboard sidebar. It renders the suppliers
  returned by `GET /admin/suppliers` in a `@medusajs/ui` `Table`.
- **New admin UI route** `src/admin/routes/suppliers/[id]/page.tsx` — a detail
  page resolving `:id` with `useParams` and rendering one supplier's `name`,
  `email`, `phone` and `collection_address` from `GET /admin/suppliers/:id`.
- **Four explicit render states on each page**, as conditional early returns:
  loading, error, empty (list only), and loaded. A failed request renders an
  error state, never an empty table.
- **Row navigation** — each list row links to `/suppliers/:id` via
  `react-router-dom`'s `Link`.
- **New shared SDK client** `src/admin/lib/sdk.ts` — a single `@medusajs/js-sdk`
  `Medusa` instance with `auth: { type: "session" }`, consumed through
  `@tanstack/react-query`. This is the first admin-side data access in the repo,
  so the client is created here and reused by CV-18 and CV-20.
- **Two dependencies declared** in `apps/backend/package.json`:
  `@medusajs/js-sdk` and `@medusajs/icons`, both pinned to `2.18.0`. Both are
  already installed as transitive dependencies of `@medusajs/dashboard` /
  `@medusajs/ui` at exactly that version, so `npm install` changes nothing on
  disk — the change stops two direct imports from depending on npm hoisting.
  Confirmed with the author, per the AGENTS.md "no new npm dependency without
  asking" rule.

No backend code changes. `GET /admin/suppliers` and `GET /admin/suppliers/:id`
already exist and ship the exact shape the pages need (CV-15, merged).

### Correction to the issue's "Current state"

CV-17 states that `src/admin/routes/suppliers/page.tsx` "exists and renders real
supplier data, but as plain `Text` rows", and scopes itself to "the remainder".
That file does not exist — on this branch, on `main`, or anywhere in the history
(`git log --all -- 'apps/backend/src/admin/routes/*'` is empty);
`src/admin/routes/suppliers/` is an empty untracked directory. The list page is
therefore built from scratch rather than refactored. This widens the work, not
the outcome: the issue's own "Done when" is unchanged, and nothing is added to
scope beyond what CV-17 already lists.

## Capabilities

### New Capabilities

- `supplier-admin-ui`: how the Medusa Admin dashboard presents suppliers to the
  operator — the sidebar entry, the list page and its render states, the detail
  page, and navigation between them. `openspec/specs/` is currently empty, so
  this change also sets the naming precedent: one kebab-case segment per domain,
  matching the `openspec/specs/<domain>/spec.md` layout in AGENTS.md. The
  supplier HTTP API (CV-15) is deliberately left un-specced here; it is a
  separate capability and not this change's to write.

### Modified Capabilities

None. No existing spec covers this behaviour.

## Impact

**Code**

- `apps/backend/src/admin/lib/sdk.ts` — new
- `apps/backend/src/admin/routes/suppliers/page.tsx` — new
- `apps/backend/src/admin/routes/suppliers/[id]/page.tsx` — new
- `apps/backend/package.json` — two dependency lines added

**APIs consumed, not changed:** `GET /admin/suppliers`,
`GET /admin/suppliers/:id`. Both already strip `api_token` server-side (D-003),
so the constraint that `api_token` is never rendered holds by construction; the
pages additionally never reference the field.

**Verification.** Manual, in the running dashboard at
`http://localhost:9000/app/suppliers`. The repo has no admin-side test setup —
`jest` is configured for `integration:http`, `integration:modules` and `unit`
against the backend, and D-011 scopes integration tests to routes. Adding a
React test runner is a new dependency and a new toolchain, which is out of scope
for CV-17 and would need its own decision. The spec's scenarios are written as
observable rendered elements so they can be automated later without rewriting.

## Out of Scope

Taken from CV-17's own "Out of scope", and checked against the MVP OUT list in
AGENTS.md:

- **Create / edit / delete forms in the admin UI.** Forms arrive with M4a. The
  `POST` and `DELETE` routes exist but stay unused by this change.
- **Pagination, search, sorting.** The list issues one unparameterised request
  and renders every row.
- **The supplier's products on the detail page.** That belongs to CV-18 / CV-20.
- **`api_token` display anywhere.** D-003.
- **Any change to the supplier API or module.** Read-only consumption.
- **A React/component test toolchain.** See Verification above.
- **Supplier authentication or account UI.** Static tokens only (D-002); a
  supplier portal is explicitly on the MVP OUT list.
